import React, { useState, useEffect, useRef } from "react";
import {
  Building2,
  Phone,
  MapPin,
  Search,
  Upload,
  CheckCircle,
  FileText,
  X,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
  Download,
  Database,
  AlertTriangle,
  ServerCrash,
  Bell,
  Clock,
  Plus,
  Trash2,
  Calendar,
  Check,
  Edit2,
  Users,
  UserPlus,
  KeyRound,
  Mail,
  ShieldAlert,
  Eye,
  EyeOff,
  Copy,
  Wallet,
  UserCheck,
  Sunset,
  BellRing,
  Moon
} from "lucide-react";
import { CompanyProfile, User, CustomReminder, CashRegisterState, CashRegisterSession, BusinessHours } from "../types";
import { dbExportAllData, dbImportAllData, dbGetCompanyProfile, isSupabaseConfigured, getAdminDomain, normalizeUserString, notifyRealtimeSync, getSupabase } from "../supabase";

const WEEKDAYS = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;

const defaultBusinessHours: BusinessHours = {
  monday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
  tuesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
  wednesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
  thursday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
  friday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
  saturday: { isOpen: true, openTime: "06:00", closeTime: "14:00" },
  sunday: { isOpen: false, openTime: "09:00", closeTime: "18:00" },
};

interface CompanySettingsProps {
  company: CompanyProfile;
  onSaveCompany: (updated: CompanyProfile) => void;
  soundEnabled?: boolean;
  onToggleSound?: (enabled: boolean) => void;
  currentUser: User | null;
  onRefreshData?: (userRecord?: User, isBackground?: boolean, forceAll?: boolean) => Promise<void>;
  cashRegister?: CashRegisterState;
  onOpenRegister?: (valorAbertura: number, operador: string) => void;
  onCloseRegister?: (valorFechamentoReal: number, observacoes?: string) => void;
  onNavigateToAtendentes?: () => void;
}

export function CompanySettings({ 
  company, 
  onSaveCompany, 
  soundEnabled = true, 
  onToggleSound, 
  currentUser, 
  onRefreshData,
  cashRegister,
  onOpenRegister,
  onCloseRegister,
  onNavigateToAtendentes
}: CompanySettingsProps) {
  const [tradingName, setTradingName] = useState(company.tradingName);
  const [phone, setPhone] = useState(company.phone);
  const [cep, setCep] = useState(company.cep);
  const [address, setAddress] = useState(company.address);
  const [number, setNumber] = useState(company.number);
  const [neighborhood, setNeighborhood] = useState(company.neighborhood);
  const [city, setCity] = useState(company.city);
  const [state, setState] = useState(company.state);
  const [cnpjCpf, setCnpjCpf] = useState(company.cnpjCpf);
  const [logo, setLogo] = useState<string | null>(company.logo);
  const [pixKey, setPixKey] = useState(company.pixKey || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [openingTime, setOpeningTime] = useState(company.openingTime || "08:00");
  const [closingTime, setClosingTime] = useState(company.closingTime || "18:00");
  const [autoCloseRegisterEnabled, setAutoCloseRegisterEnabled] = useState(company.autoCloseRegisterEnabled ?? false);
  const [autoBackupDownloadEnabled, setAutoBackupDownloadEnabled] = useState(company.autoBackupDownloadEnabled ?? true);
  const [cashClosingReminderEnabled, setCashClosingReminderEnabled] = useState<boolean>(company.cashClosingReminderEnabled ?? true);
  const [cashClosingReminderTime, setCashClosingReminderTime] = useState<string>(company.cashClosingReminderTime || "");
  const [cashClosingReminderMessage, setCashClosingReminderMessage] = useState<string>(
    company.cashClosingReminderMessage || "Excelente dia de trabalho! O horário de encerramento do expediente foi atingido. Deseja realizar o fechamento do caixa e salvar seus relatórios antes de fechar o programa?"
  );
  
  const [businessHours, setBusinessHours] = useState<BusinessHours>(() => {
    return company.businessHours || defaultBusinessHours;
  });

  const lastLoadedUserRef = useRef<string | null>(null);

  const [openingOperatorName, setOpeningOperatorName] = useState(currentUser?.name || "");
  const [openingFloatValue, setOpeningFloatValue] = useState("");

  useEffect(() => {
    if (currentUser?.name && !openingOperatorName) {
      setOpeningOperatorName(currentUser.name);
    }
  }, [currentUser, openingOperatorName]);

  // Sub-tabs State
  const [activeSubTab, setActiveSubTab] = useState<"empresa" | "atendentes">("empresa");

  // Attendants Registration State variables
  const [attendants, setAttendants] = useState<User[]>([]);
  const [attendantName, setAttendantName] = useState("");
  const [attendantUsername, setAttendantUsername] = useState("");
  const [attendantEmail, setAttendantEmail] = useState("");
  const [attendantPassword, setAttendantPassword] = useState("");
  const [showAttendantPassword, setShowAttendantPassword] = useState(false);
  const [attendantAdminBypassPassword, setAttendantAdminBypassPassword] = useState("");
  const [showAttendantAdminBypassPassword, setShowAttendantAdminBypassPassword] = useState(false);
  const [attendantEditingId, setAttendantEditingId] = useState<string | null>(null);
  const [attendantError, setAttendantError] = useState<string | null>(null);
  const [attendantSuccess, setAttendantSuccess] = useState<string | null>(null);
  const [newAttendantCredentials, setNewAttendantCredentials] = useState<{ name: string; username: string; password?: string; adminBypassPassword?: string } | null>(null);
  const [loadingAttendants, setLoadingAttendants] = useState(false);

  // Load attendants
  const loadAttendantsList = async () => {
    if (!currentUser) return;
    setLoadingAttendants(true);
    setAttendantError(null);
    let allUsers: User[] = [];
    
    try {
      const saved = localStorage.getItem("NUCLEO_USERS");
      if (saved) {
        allUsers = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse local users", e);
    }

    if (isSupabaseConfigured()) {
      try {
        const { dbGetUsers } = await import("../supabase");
        const dbUsers = await dbGetUsers(currentUser.id);
        if (dbUsers) {
          // Merge db users
          dbUsers.forEach(dbU => {
            if (!allUsers.some(u => u.id === dbU.id)) {
              allUsers.push(dbU);
            }
          });
        }
      } catch (err) {
        console.warn("Could not load users database", err);
      }
    }

    // Filter attendants: owner_id is current user's ID and is not equals to owner's own ID
    const ownerId = currentUser.owner_id || currentUser.id;
    const filtered = allUsers.filter(u => u.owner_id === ownerId && u.id !== ownerId);
    setAttendants(filtered);
    setLoadingAttendants(false);
  };

  useEffect(() => {
    if (activeSubTab === "atendentes") {
      loadAttendantsList();
    }
  }, [activeSubTab, currentUser?.id]);

  const handleSaveAttendant = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttendantError(null);
    setAttendantSuccess(null);

    const nameVal = attendantName.trim();
    const userVal = attendantUsername.trim().toLowerCase();
    const emailVal = attendantEmail.trim();
    const passVal = attendantPassword.trim();
    const adminBypassVal = attendantAdminBypassPassword.trim();

    if (!nameVal || !userVal || (!attendantEditingId && (!passVal || !adminBypassVal))) {
      setAttendantError("Nome, usuário, senha e senha supervisora de liberação são obrigatórios.");
      return;
    }

    if (userVal.length < 3) {
      setAttendantError("O nome de usuário de login deve ter pelo menos 3 caracteres.");
      return;
    }

    if (!attendantEditingId && passVal.length < 3) {
      setAttendantError("A senha deve ter pelo menos 3 caracteres.");
      return;
    }

    if (!attendantEditingId && adminBypassVal.length < 3) {
      setAttendantError("A senha de liberação supervisora do administrador deve ter pelo menos 3 caracteres.");
      return;
    }

    setLoadingAttendants(true);

    try {
      let localUsers: User[] = [];
      const saved = localStorage.getItem("NUCLEO_USERS");
      if (saved) {
        localUsers = JSON.parse(saved);
      }

      // Check unique username
      const usernameExists = localUsers.some(u => 
        normalizeUserString(u.username) === normalizeUserString(userVal) && u.id !== attendantEditingId
      );
      if (usernameExists) {
        setAttendantError("Este nome de usuário de login já está em uso.");
        setLoadingAttendants(false);
        return;
      }

      const generateUserUUID = (): string => {
        if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
          return window.crypto.randomUUID();
        }
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      };

      const ownerId = currentUser?.owner_id || currentUser?.id || "demo-admin";

      // Combine login password and admin bypass password using :: delimiter
      const passParts = (attendantEditingId ? localUsers.find(u => u.id === attendantEditingId)?.password || "" : "").split("::");
      const currentMainPass = passParts[0] || "";
      const currentAdminPass = passParts[1] || "";

      const finalMainPass = passVal || currentMainPass;
      const finalAdminBypassPass = adminBypassVal || currentAdminPass;
      const finalCombinedPassword = `${finalMainPass}::${finalAdminBypassPass}`;

      let finalEmail = emailVal.trim();
      const derivedDomain = getAdminDomain(currentUser?.email || "", currentUser?.username || "");
      if (!finalEmail) {
        finalEmail = `${userVal}@${derivedDomain}`;
      } else if (!finalEmail.includes("@")) {
        finalEmail = `${finalEmail.toLowerCase()}@${derivedDomain}`;
      }

      const updatedUser: User = {
        id: attendantEditingId || generateUserUUID(),
        name: nameVal,
        username: userVal,
        email: finalEmail,
        password: finalCombinedPassword,
        owner_id: ownerId
      };

      // Update local storage
      let updatedList: User[] = [];
      if (attendantEditingId) {
        updatedList = localUsers.map(u => u.id === updatedUser.id ? updatedUser : u);
        setNewAttendantCredentials(null);
      } else {
        updatedList = [...localUsers, updatedUser];
        setNewAttendantCredentials({
          name: nameVal,
          username: userVal,
          password: finalMainPass,
          adminBypassPassword: finalAdminBypassPass
        });
      }

      localStorage.setItem("NUCLEO_USERS", JSON.stringify(updatedList));

      // Sync to Supabase
      if (isSupabaseConfigured()) {
        const { dbSaveUser } = await import("../supabase");
        await dbSaveUser(updatedUser, ownerId);
      }

      setAttendantSuccess(attendantEditingId ? "Atendente atualizado com sucesso!" : "Novo atendente cadastrado com sucesso!");
      setAttendantName("");
      setAttendantUsername("");
      setAttendantEmail("");
      setAttendantPassword("");
      setAttendantAdminBypassPassword("");
      setAttendantEditingId(null);
      loadAttendantsList();
    } catch (err: any) {
      console.error(err);
      setNewAttendantCredentials(null);
      setAttendantError("Erro ao registrar atendente: " + err.message);
    } finally {
      setLoadingAttendants(false);
    }
  };

  const handleStartEditAttendant = (att: User) => {
    setNewAttendantCredentials(null);
    setAttendantEditingId(att.id);
    setAttendantName(att.name);
    setAttendantUsername(att.username);
    setAttendantEmail(att.email || "");
    
    const passParts = att.password ? att.password.split("::") : [""];
    setAttendantPassword(passParts[0] || "");
    setAttendantAdminBypassPassword(passParts[1] || "");
    
    setAttendantError(null);
    setAttendantSuccess(null);
  };

  const handleDeleteAttendant = async (id: string) => {
    if (!window.confirm("Você tem certeza que deseja remover este atendente? Esta ação cortará o acesso deste usuário.")) return;
    setNewAttendantCredentials(null);
    setLoadingAttendants(true);
    setAttendantError(null);
    setAttendantSuccess(null);

    try {
      let localUsers: User[] = [];
      const saved = localStorage.getItem("NUCLEO_USERS");
      if (saved) {
        localUsers = JSON.parse(saved);
      }

      const updatedList = localUsers.filter(u => u.id !== id);
      localStorage.setItem("NUCLEO_USERS", JSON.stringify(updatedList));

      if (isSupabaseConfigured()) {
        const { dbDeleteUser } = await import("../supabase");
        await dbDeleteUser(id);
      }

      setAttendantSuccess("Atendente removido com sucesso!");
      loadAttendantsList();
    } catch (err: any) {
      console.error(err);
      setAttendantError("Erro ao remover atendente: " + err.message);
    } finally {
      setLoadingAttendants(false);
    }
  };

  // Goals Reminder states (synced with CompanyProfile)
  const [goalsReminderEnabled, setGoalsReminderEnabled] = useState(company.goalsReminderEnabled ?? false);
  const [goalsReminderTime, setGoalsReminderTime] = useState(company.goalsReminderTime || "09:00");

  // General custom reminders list
  const [reminders, setReminders] = useState<CustomReminder[]>(() => {
    const saved = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
    return saved ? JSON.parse(saved) : [];
  });

  // Inputs for adding custom reminders
  const [newReminderTitle, setNewReminderTitle] = useState("");
  const [newReminderType, setNewReminderType] = useState<"date" | "weekly">("date");
  const [newReminderDate, setNewReminderDate] = useState("");
  const [newReminderDayOfWeek, setNewReminderDayOfWeek] = useState<number>(1); // Monday default
  const [newReminderTime, setNewReminderTime] = useState("09:00");
  const [newReminderIsAllDay, setNewReminderIsAllDay] = useState(false);

  useEffect(() => {
    const currentLocal = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
    const serialized = JSON.stringify(reminders);
    if (currentLocal !== serialized) {
      localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", serialized);
      window.dispatchEvent(new Event("storage"));
    }
  }, [reminders]);

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (JSON.stringify(parsed) !== JSON.stringify(reminders)) {
            setReminders(parsed);
          }
        } catch (e) {
          console.error("Error parsing storage reminders:", e);
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [reminders]);

  const handleAddReminder = () => {
    if (!newReminderTitle.trim()) {
      alert("Por favor, preencha o assunto do seu lembrete.");
      return;
    }
    
    // Set a default date if none has been specified and the type is custom date
    let selectedDate = newReminderDate;
    if (newReminderType === "date" && !selectedDate) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      selectedDate = `${year}-${month}-${day}`;
    }

    const newRem: CustomReminder = {
      id: Math.random().toString(36).substring(2, 9),
      title: newReminderTitle.trim(),
      type: newReminderType,
      date: newReminderType === "date" ? selectedDate : undefined,
      dayOfWeek: newReminderType === "weekly" ? newReminderDayOfWeek : undefined,
      time: newReminderIsAllDay ? "00:00" : newReminderTime,
      isAllDay: newReminderIsAllDay,
      completed: false,
      notified: false
    };

    setReminders((prev) => [...prev, newRem]);
    setNewReminderTitle("");
    setNewReminderIsAllDay(false);
  };

  // State to track if we are currently editing an existing reminder
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);

  const handleStartEdit = (rem: CustomReminder) => {
    setEditingReminderId(rem.id);
    setNewReminderTitle(rem.title);
    setNewReminderType(rem.type);
    setNewReminderDate(rem.date || "");
    setNewReminderDayOfWeek(rem.dayOfWeek || 1);
    setNewReminderTime(rem.time || "09:00");
    setNewReminderIsAllDay(rem.isAllDay ?? false);
  };

  const handleSaveEdit = () => {
    if (!newReminderTitle.trim()) {
      alert("Por favor, preencha o assunto do seu lembrete.");
      return;
    }

    setReminders((prev) =>
      prev.map((r) =>
        r.id === editingReminderId
          ? {
              ...r,
              title: newReminderTitle.trim(),
              type: newReminderType,
              date: newReminderType === "date" ? newReminderDate : undefined,
              dayOfWeek: newReminderType === "weekly" ? newReminderDayOfWeek : undefined,
              time: newReminderIsAllDay ? "00:00" : newReminderTime,
              isAllDay: newReminderIsAllDay,
              notified: false, // reset notification status so it can trigger again on edit
            }
          : r
      )
    );

    handleCancelEdit();
  };

  const handleCancelEdit = () => {
    setEditingReminderId(null);
    setNewReminderTitle("");
    setNewReminderType("date");
    setNewReminderDate("");
    setNewReminderDayOfWeek(1);
    setNewReminderTime("09:00");
    setNewReminderIsAllDay(false);
  };

  const handleToggleReminderCompleted = (id: string) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r))
    );
  };

  const handleDeleteReminder = (id: string) => {
    if (editingReminderId === id) {
      handleCancelEdit();
    }
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  // Backup integration states
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupPreview, setBackupPreview] = useState<any>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // Backup list and Realtime sync from meus_dados table
  interface BackupCloudItem {
    id: string;
    titulo: string;
    descricao?: string | null;
    valor?: number;
    created_at: string;
    empresa_id?: string;
    user_id?: string;
  }

  const [cloudBackups, setCloudBackups] = useState<BackupCloudItem[]>([]);
  const [loadingCloudBackups, setLoadingCloudBackups] = useState<boolean>(false);
  const uploadCloudBackupInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCloud, setUploadingCloud] = useState<boolean>(false);

  const UNIFIED_EMPRESA_ID = "62f892b2-3855-4ae9-8b2d-42d4b6223815";

  // 1. SELECT na tabela meus_dados forçando estritamente o filtro por empresa_id = '62f892b2-3855-4ae9-8b2d-42d4b6223815'
  const fetchCloudBackups = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setLoadingCloudBackups(true);
    try {
      const { data, error } = await supabase
        .from("meus_dados")
        .select("*")
        .eq("user_id", UNIFIED_EMPRESA_ID)
        .order("created_at", { ascending: false });

      if (data) {
        setCloudBackups(data);
      }
    } catch (err) {
      console.warn("Aviso ao carregar backups da tabela meus_dados:", err);
    } finally {
      setLoadingCloudBackups(false);
    }
  };

  // 2. Escuta Realtime do Supabase na tabela meus_dados para que novos uploads brotem na lista de todas as máquinas
  useEffect(() => {
    fetchCloudBackups();

    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel("sync_meus_dados_backups_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meus_dados"
        },
        () => {
          fetchCloudBackups();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleUploadBackupToCloud = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    e.target.value = "";
    setUploadingCloud(true);
    setBackupSuccessMsg(null);
    setBackupError(null);

    try {
      const text = await file.text();
      try {
        JSON.parse(text);
      } catch (jsonErr) {
        setBackupError("O arquivo selecionado não é um JSON válido.");
        setUploadingCloud(false);
        return;
      }

      const supabase = getSupabase();
      if (!supabase) {
        setBackupError("Supabase não configurado.");
        setUploadingCloud(false);
        return;
      }

      const payloadRecord: any = {
        titulo: file.name,
        descricao: text,
        valor: file.size || text.length,
        user_id: UNIFIED_EMPRESA_ID
      };

      const { error } = await supabase.from("meus_dados").insert(payloadRecord);
      if (error) throw error;

      setBackupSuccessMsg(`Backup "${file.name}" salvo na nuvem com sucesso! Sincronizado para todas as máquinas.`);
      setTimeout(() => setBackupSuccessMsg(null), 6000);
      await fetchCloudBackups();
    } catch (err: any) {
      console.error("Erro ao enviar backup:", err);
      setBackupError("Falha ao salvar backup na nuvem: " + (err.message || err));
    } finally {
      setUploadingCloud(false);
    }
  };

  const handleRestoreCloudBackup = async (item: BackupCloudItem) => {
    if (!item.descricao) {
      alert("Arquivo de backup sem conteúdo.");
      return;
    }
    const confirmed = window.confirm(`Deseja realmente restaurar os dados do backup "${item.titulo}" de ${new Date(item.created_at).toLocaleString("pt-BR")}? Isso atualizará os registros locais.`);
    if (!confirmed) return;

    try {
      const mockFile = new File([item.descricao], item.titulo, { type: "application/json" });
      await executeDirectRestore(mockFile);
    } catch (err: any) {
      setBackupError("Falha ao processar conteúdo do backup: " + (err.message || err));
    }
  };

  const handleDownloadCloudBackup = (item: BackupCloudItem) => {
    if (!item.descricao) return;
    const blob = new Blob([item.descricao], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = item.titulo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDeleteCloudBackup = async (id: string) => {
    const confirmed = window.confirm("Excluir esta cópia de backup da nuvem?");
    if (!confirmed) return;
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("meus_dados").delete().eq("id", id);
      setCloudBackups((prev) => prev.filter((b) => b.id !== id));
    }
  };

  const handleExportBackup = async () => {
    if (!currentUser) {
      alert("Você precisa estar logado para realizar um backup.");
      return;
    }
    setExporting(true);
    setBackupSuccessMsg(null);
    setBackupError(null);
    try {
      const ownerId = currentUser.owner_id || currentUser.id;
      const data = await dbExportAllData(ownerId);
      if (!data) {
        alert("Erro ao ler dados para backup do servidor.");
        return;
      }

      // Generate Blob representation
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);

      // Create download link element
      const link = document.createElement("a");
      const sanitizedName = (tradingName || "empresa").toLowerCase().replace(/[^a-z0-9]/g, "_");
      const dateStr = new Date().toISOString().split("T")[0];
      link.href = downloadUrl;
      link.download = `nexvolt_backup_${sanitizedName}_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      // Gravar na nuvem (tabela meus_dados) para sincronizar entre todos os computadores
      const supabase = getSupabase();
      if (supabase) {
        try {
          const jsonString = JSON.stringify(data);
          const payloadRecord: any = {
            titulo: `nexvolt_backup_${sanitizedName}_${dateStr}.json`,
            descricao: jsonString,
            valor: jsonString.length,
            user_id: UNIFIED_EMPRESA_ID
          };
          await supabase.from("meus_dados").insert(payloadRecord);
          fetchCloudBackups();
        } catch (dbErr) {
          console.warn("Aviso ao salvar backup na tabela meus_dados:", dbErr);
        }
      }

      setBackupSuccessMsg("Cópia de segurança exportada com sucesso! O arquivo .json foi salvo na sua pasta de Downloads e sincronizado na Nuvem.");
      setTimeout(() => setBackupSuccessMsg(null), 6000);
    } catch (err: any) {
      console.error(err);
      alert("Falha ao exportar backup: " + (err.message || err));
    } finally {
      setExporting(false);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackupError(null);
    setBackupSuccessMsg(null);
    setBackupPreview(null);
    
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setBackupFile(file);
      // Reset input value so user can reselect the same file if needed
      e.target.value = "";
      await executeDirectRestore(file);
    }
  };

  const executeDirectRestore = async (file: File) => {
    setImporting(true);
    setBackupError(null);
    setBackupSuccessMsg(null);

    try {
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        setBackupError("Arquivo corrompido ou formato JSON inválido. Verifique o arquivo selecionado.");
        setImporting(false);
        return;
      }

      if (!parsed || (typeof parsed !== "object" && !Array.isArray(parsed))) {
        setBackupError("O arquivo de backup selecionado não contém dados válidos.");
        setImporting(false);
        return;
      }

      // Unwrap if wrapped inside { data: ... } or { backup: ... }
      const source = (parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) ? parsed.data : 
                     (parsed.backup && typeof parsed.backup === "object" && !Array.isArray(parsed.backup)) ? parsed.backup : parsed;

      // Check for localStorageDump inside the backup or if the backup itself is a localStorage dump
      const dumpCandidate = source.localStorageDump || (parsed.localStorageDump) || source;
      if (dumpCandidate && typeof dumpCandidate === "object" && !Array.isArray(dumpCandidate)) {
        Object.keys(dumpCandidate).forEach((k) => {
          if (k.startsWith("NUCLEO_") || k.startsWith("COMPANY_")) {
            try {
              const val = typeof dumpCandidate[k] === "string" ? dumpCandidate[k] : JSON.stringify(dumpCandidate[k]);
              localStorage.setItem(k, val);
            } catch (e) {
              console.warn("Aviso ao restaurar chave local:", k, e);
            }
          }
        });
      }

      // Extract entities from all possible structures (arrays, camelCase, snake_case, pt/en)
      let sales: any[] = [];
      let produtos: any[] = [];
      let expenses: any[] = [];
      let gastos_mensais: any[] = [];
      let clientes: any[] = [];
      let company_profile: any = null;
      let goals: any = null;
      let cash_register_state: any = null;

      if (Array.isArray(source)) {
        sales = source;
      } else if (typeof source === "object") {
        sales = Array.isArray(source.sales) ? source.sales : 
                Array.isArray(source.vendas) ? source.vendas : [];
        produtos = Array.isArray(source.produtos) ? source.produtos : 
                   Array.isArray(source.products) ? source.products : [];
        expenses = Array.isArray(source.expenses) ? source.expenses : 
                   Array.isArray(source.despesas) ? source.despesas : 
                   Array.isArray(source.gastos) ? source.gastos : [];
        gastos_mensais = Array.isArray(source.gastos_mensais) ? source.gastos_mensais : 
                         Array.isArray(source.faturas) ? source.faturas : 
                         Array.isArray(source.fixed_expenses) ? source.fixed_expenses : [];
        clientes = Array.isArray(source.clientes) ? source.clientes : 
                   Array.isArray(source.clients) ? source.clients : [];
        company_profile = source.company_profile || source.empresa || null;
        goals = source.goals || source.metas || null;
        cash_register_state = source.cash_register_state || source.cashRegister || null;
      }

      // Fallback: check localStorageDump for missing entities
      if (dumpCandidate && typeof dumpCandidate === "object") {
        try {
          if (sales.length === 0 && dumpCandidate["NUCLEO_SALES"]) {
            sales = typeof dumpCandidate["NUCLEO_SALES"] === "string" ? JSON.parse(dumpCandidate["NUCLEO_SALES"]) : dumpCandidate["NUCLEO_SALES"];
          }
          if (produtos.length === 0 && dumpCandidate["NUCLEO_PRODUCTS"]) {
            produtos = typeof dumpCandidate["NUCLEO_PRODUCTS"] === "string" ? JSON.parse(dumpCandidate["NUCLEO_PRODUCTS"]) : dumpCandidate["NUCLEO_PRODUCTS"];
          }
          if (expenses.length === 0 && dumpCandidate["NUCLEO_EXPENSES"]) {
            expenses = typeof dumpCandidate["NUCLEO_EXPENSES"] === "string" ? JSON.parse(dumpCandidate["NUCLEO_EXPENSES"]) : dumpCandidate["NUCLEO_EXPENSES"];
          }
          if (gastos_mensais.length === 0 && dumpCandidate["NUCLEO_RECURRING_EXPENSES"]) {
            gastos_mensais = typeof dumpCandidate["NUCLEO_RECURRING_EXPENSES"] === "string" ? JSON.parse(dumpCandidate["NUCLEO_RECURRING_EXPENSES"]) : dumpCandidate["NUCLEO_RECURRING_EXPENSES"];
          }
          if (clientes.length === 0 && dumpCandidate["NUCLEO_CLIENTS"]) {
            clientes = typeof dumpCandidate["NUCLEO_CLIENTS"] === "string" ? JSON.parse(dumpCandidate["NUCLEO_CLIENTS"]) : dumpCandidate["NUCLEO_CLIENTS"];
          }
          if (!company_profile && dumpCandidate["NUCLEO_COMPANY_PROFILE"]) {
            company_profile = typeof dumpCandidate["NUCLEO_COMPANY_PROFILE"] === "string" ? JSON.parse(dumpCandidate["NUCLEO_COMPANY_PROFILE"]) : dumpCandidate["NUCLEO_COMPANY_PROFILE"];
          }
          if (!goals && dumpCandidate["NUCLEO_GOALS"]) {
            goals = typeof dumpCandidate["NUCLEO_GOALS"] === "string" ? JSON.parse(dumpCandidate["NUCLEO_GOALS"]) : dumpCandidate["NUCLEO_GOALS"];
          }
          if (!cash_register_state && dumpCandidate["NUCLEO_CASH_REGISTER"]) {
            cash_register_state = typeof dumpCandidate["NUCLEO_CASH_REGISTER"] === "string" ? JSON.parse(dumpCandidate["NUCLEO_CASH_REGISTER"]) : dumpCandidate["NUCLEO_CASH_REGISTER"];
          }
        } catch (dumpParseErr) {
          console.warn("Aviso ao extrair entidades do dump local:", dumpParseErr);
        }
      }

      // Immediately write primary entity keys to localStorage for offline readiness & speed
      if (sales.length > 0) localStorage.setItem("NUCLEO_SALES", JSON.stringify(sales));
      if (expenses.length > 0) localStorage.setItem("NUCLEO_EXPENSES", JSON.stringify(expenses));
      if (produtos.length > 0) localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(produtos));
      if (gastos_mensais.length > 0) localStorage.setItem("NUCLEO_RECURRING_EXPENSES", JSON.stringify(gastos_mensais));
      if (clientes.length > 0) localStorage.setItem("NUCLEO_CLIENTS", JSON.stringify(clientes));
      if (company_profile) localStorage.setItem("NUCLEO_COMPANY_PROFILE", JSON.stringify(company_profile));
      if (goals) localStorage.setItem("NUCLEO_GOALS", JSON.stringify(goals));
      if (cash_register_state) localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(cash_register_state));

      const ownerId = currentUser ? (currentUser.owner_id || currentUser.id) : "";

      // Import to remote Supabase database if configured
      if (ownerId && isSupabaseConfigured()) {
        try {
          const res = await dbImportAllData(ownerId, {
            ...parsed,
            sales,
            produtos,
            expenses,
            gastos_mensais,
            clientes,
            company_profile,
            goals,
            cash_register_state,
            localStorageDump: dumpCandidate
          });

          if (res.success) {
            setBackupSuccessMsg(
              `Backup restaurado com sucesso no sistema e em todos os terminais! 🎉\n` +
              `• Vendas: ${res.counts.sales}\n` +
              `• Produtos: ${res.counts.produtos}\n` +
              `• Despesas: ${res.counts.expenses}\n` +
              `• Clientes: ${res.counts.clientes}\n` +
              `• Faturas fixas: ${res.counts.gastos_mensais}`
            );
          } else {
            setBackupSuccessMsg(`Dados restaurados localmente (${sales.length} vendas, ${produtos.length} produtos, ${expenses.length} despesas). Aviso: ${res.error}`);
          }
        } catch (dbErr: any) {
          console.warn("Aviso ao importar no banco:", dbErr);
          setBackupSuccessMsg(`Backup restaurado localmente com ${sales.length} vendas e ${produtos.length} produtos.`);
        }
      } else {
        setBackupSuccessMsg(`Backup restaurado com sucesso no sistema local! 🎉 (${sales.length} vendas, ${produtos.length} produtos, ${expenses.length} despesas prontas).`);
      }

      // Broadcast real-time sync notification across all terminals and devices
      if (ownerId) {
        notifyRealtimeSync(ownerId, "backup_restored", { timestamp: Date.now() });
      }

      // Local browser window events for instant UI reactivity
      window.dispatchEvent(new CustomEvent("backup_restored_sync", { detail: { event: "backup_restored" } }));
      window.dispatchEvent(new CustomEvent("app_remote_sync", { detail: { event: "backup_restored" } }));

      // Refresh global app data immediately
      if (onRefreshData) {
        await onRefreshData(currentUser || undefined, false, true);
      }
    } catch (err: any) {
      console.error("Erro ao processar restauração de backup:", err);
      setBackupError(`Falha ao restaurar backup: ${err.message || err}`);
    } finally {
      setImporting(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (backupFileInputRef.current) {
      backupFileInputRef.current.click();
    }
  };

  const handleExportLocalStorageBackup = () => {
    try {
      const backup: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("NUCLEO_")) {
          const val = localStorage.getItem(key);
          if (val !== null) {
            backup[key] = val;
          }
        }
      }
      const dataStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().split("T")[0];
      const timeStr = new Date().toTimeString().split(" ")[0].replace(/:/g, "-");
      const nameClean = (tradingName || company.tradingName || "empresa").toLowerCase().replace(/[^a-z0-9]/g, "_");
      link.href = url;
      link.download = `nucleo_localstorage_backup_${nameClean}_${dateStr}_${timeStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setBackupSuccessMsg("Cópia de segurança do armazenamento local (LocalStorage) exportada com sucesso! Salva na pasta de Downloads.");
      setTimeout(() => setBackupSuccessMsg(null), 6000);
    } catch (err: any) {
      alert("Erro ao exportar backup local: " + err.message);
    }
  };

  const handleRestoreLocalStorageBackup = (backupObj: Record<string, any>) => {
    const confirmRestore = window.confirm(
      "⚠️ RESTAURAR CÓPIA LOCAL (LocalStorage)\n\n" +
      "ATENÇÃO: Este procedimento atualizará seus dados locais de vendas, produtos, gastos e clientes cadastrados com as informações do arquivo de backup.\n\n" +
      "Deseja prosseguir com a restauração imediata? O sistema reiniciará para atualizar os dados."
    );
    if (!confirmRestore) return;
    
    try {
      // Set the restored keys without wiping authentication or open cash register state
      Object.entries(backupObj).forEach(([key, val]) => {
        if (typeof val === "string") {
          localStorage.setItem(key, val);
        } else {
          localStorage.setItem(key, JSON.stringify(val));
        }
      });
      
      alert("✓ Restauração local realizada com sucesso! O aplicativo será recarregado.");
      window.location.reload();
    } catch (err: any) {
      alert("Falha ao salvar dados de backup local: " + err.message);
    }
  };

  const [loadingCep, setLoadingCep] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load company profile from Supabase strictly tied to page/component load and current user ID
  useEffect(() => {
    const fetchProfileForUser = async () => {
      if (!currentUser) return;
      if (!isSupabaseConfigured()) return;
      
      setLoadingProfile(true);
      try {
        const remoteProfile = await dbGetCompanyProfile(currentUser.id);
        if (remoteProfile) {
          setTradingName(remoteProfile.tradingName || "");
          setPhone(remoteProfile.phone || "");
          setCep(remoteProfile.cep || "");
          setAddress(remoteProfile.address || "");
          setNumber(remoteProfile.number || "");
          setNeighborhood(remoteProfile.neighborhood || "");
          setCity(remoteProfile.city || "");
          setState(remoteProfile.state || "");
          setCnpjCpf(remoteProfile.cnpjCpf || "");
          setLogo(remoteProfile.logo || null);
          setPixKey(remoteProfile.pixKey || "");
          setGoalsReminderEnabled(remoteProfile.goalsReminderEnabled ?? false);
          setGoalsReminderTime(remoteProfile.goalsReminderTime || "09:00");
          setOpeningTime(remoteProfile.openingTime || "08:00");
          setClosingTime(remoteProfile.closingTime || "18:00");
          setAutoCloseRegisterEnabled(remoteProfile.autoCloseRegisterEnabled ?? true);
          setAutoBackupDownloadEnabled(remoteProfile.autoBackupDownloadEnabled ?? true);
          setCashClosingReminderEnabled(remoteProfile.cashClosingReminderEnabled ?? true);
          setCashClosingReminderTime(remoteProfile.cashClosingReminderTime || "");
          setCashClosingReminderMessage(remoteProfile.cashClosingReminderMessage || "Excelente dia de trabalho! O horário de encerramento do expediente foi atingido. Deseja realizar o fechamento do caixa e salvar seus relatórios antes de fechar o programa?");
          
          if (remoteProfile.businessHours) {
            setBusinessHours(remoteProfile.businessHours);
          } else {
            setBusinessHours(defaultBusinessHours);
          }
          
          // Sync with state reference of parents ONLY if a real profile exists
          onSaveCompany(remoteProfile);
        } else {
          // If the profile does not exist in the database yet, guarantee that the fields are 100% empty and clean
          setTradingName("");
          setPhone("");
          setCep("");
          setAddress("");
          setNumber("");
          setNeighborhood("");
          setCity("");
          setState("");
          setCnpjCpf("");
          setLogo(null);
          setPixKey("");
          setGoalsReminderEnabled(false);
          setGoalsReminderTime("09:00");
          setOpeningTime("08:00");
          setClosingTime("18:00");
          setAutoCloseRegisterEnabled(true);
          setAutoBackupDownloadEnabled(true);
          setCashClosingReminderEnabled(true);
          setCashClosingReminderTime("");
          setCashClosingReminderMessage("Excelente dia de trabalho! O horário de encerramento do expediente foi atingido. Deseja realizar o fechamento do caixa e salvar seus relatórios antes de fechar o programa?");
          setBusinessHours(defaultBusinessHours);
        }
      } catch (err) {
        console.error("Failed to load user-specific company profile on mount:", err);
      } finally {
        setLoadingProfile(false);
      }
    };
    
    fetchProfileForUser();
  }, [currentUser?.id]);

  // Sync state ONLY when user session or tenant ID changes to prevent overwriting user input as they type
  useEffect(() => {
    if (loadingProfile) return;
    if (!currentUser) return;
    
    if (lastLoadedUserRef.current !== currentUser.id) {
      lastLoadedUserRef.current = currentUser.id;
      setTradingName(company.tradingName || "");
      setPhone(company.phone || "");
      setCep(company.cep || "");
      setAddress(company.address || "");
      setNumber(company.number || "");
      setNeighborhood(company.neighborhood || "");
      setCity(company.city || "");
      setState(company.state || "");
      setCnpjCpf(company.cnpjCpf || "");
      setLogo(company.logo || null);
      setPixKey(company.pixKey || "");
      setGoalsReminderEnabled(company.goalsReminderEnabled ?? false);
      setGoalsReminderTime(company.goalsReminderTime || "09:00");
      setOpeningTime(company.openingTime || "08:00");
      setClosingTime(company.closingTime || "18:00");
      setAutoCloseRegisterEnabled(company.autoCloseRegisterEnabled ?? true);
      setAutoBackupDownloadEnabled(company.autoBackupDownloadEnabled ?? true);
      setCashClosingReminderEnabled(company.cashClosingReminderEnabled ?? true);
      setCashClosingReminderTime(company.cashClosingReminderTime || "");
      setCashClosingReminderMessage(company.cashClosingReminderMessage || "Excelente dia de trabalho! O horário de encerramento do expediente foi atingido. Deseja realizar o fechamento do caixa e salvar seus relatórios antes de fechar o programa?");
      
      if (company.businessHours) {
        setBusinessHours(company.businessHours);
      } else {
        setBusinessHours(defaultBusinessHours);
      }
    }
  }, [company, currentUser?.id, loadingProfile]);

  const applyBusinessHoursPreset = (presetType: string) => {
    let newHours: BusinessHours;
    if (presetType === "preset1") {
      // Segunda a Sexta: 09h às 18h / Sábado: 06h às 14h
      newHours = {
        monday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        tuesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        wednesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        thursday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        friday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        saturday: { isOpen: true, openTime: "06:00", closeTime: "14:00" },
        sunday: { isOpen: false, openTime: "09:00", closeTime: "18:00" },
      };
    } else if (presetType === "preset2") {
      // Segunda a Sexta: 08h às 18h / Sábado: 08h às 12h
      newHours = {
        monday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
        tuesday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
        wednesday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
        thursday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
        friday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
        saturday: { isOpen: true, openTime: "08:00", closeTime: "12:00" },
        sunday: { isOpen: false, openTime: "08:00", closeTime: "18:00" },
      };
    } else if (presetType === "preset3") {
      // Segunda a Sábado: 09h às 18h
      newHours = {
        monday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        tuesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        wednesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        thursday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        friday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        saturday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        sunday: { isOpen: false, openTime: "09:00", closeTime: "18:00" },
      };
    } else {
      // Todos os dias: 08h às 22h
      newHours = {
        monday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        tuesday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        wednesday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        thursday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        friday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        saturday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        sunday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
      };
    }
    setBusinessHours(newHours);
  };

  const handleDayToggle = (dayKey: keyof BusinessHours) => {
    setBusinessHours((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        isOpen: !prev[dayKey].isOpen,
      },
    }));
  };

  const handleTimeChange = (dayKey: keyof BusinessHours, field: "openTime" | "closeTime", value: string) => {
    setBusinessHours((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: value,
      },
    }));
  };

  // Format CEP (XXXXX-XXX)
  const handleCepChange = (val: string) => {
    const cleanStr = val.replace(/\D/g, "");
    if (cleanStr.length <= 8) {
      let formatted = cleanStr;
      if (cleanStr.length > 5) {
        formatted = `${cleanStr.slice(0, 5)}-${cleanStr.slice(5)}`;
      }
      setCep(formatted);

      // Auto fetch if length is fully 8 digits
      if (cleanStr.length === 8) {
        fetchAddressByCep(cleanStr);
      }
    }
  };

  // ViaCEP API Lookup
  const fetchAddressByCep = async (cleanCep: string) => {
    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (data && !data.erro) {
        setAddress(data.logradouro || "");
        setNeighborhood(data.bairro || "");
        setCity(data.localidade || "");
        setState(data.uf || "");
      } else {
        alert("CEP não encontrado. Por favor, preencha manualmente.");
      }
    } catch (err) {
      console.error("Erro ao buscar CEP:", err);
    } finally {
      setLoadingCep(false);
    }
  };

  const triggerCepSearch = () => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      fetchAddressByCep(cleanCep);
    } else {
      alert("Por favor, digite um CEP válido com 8 dígitos.");
    }
  };

  // Format Phone
  const handlePhoneChange = (val: string) => {
    const numbersOnly = val.replace(/\D/g, "");
    if (numbersOnly.length <= 11) {
      let formatted = numbersOnly;
      if (numbersOnly.length > 2) {
        formatted = `(${numbersOnly.slice(0, 2)}) ${numbersOnly.slice(2)}`;
      }
      if (numbersOnly.length > 7) {
        formatted = `(${numbersOnly.slice(0, 2)}) ${numbersOnly.slice(2, 7)}-${numbersOnly.slice(7)}`;
      }
      setPhone(formatted);
    }
  };

  // Drag and Drop Logo Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processLogoFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processLogoFile(e.target.files[0]);
    }
  };

  const processLogoFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Selecione um arquivo de imagem válido.");
      return;
    }

    setUploadingLogo(true);
    setStatusMessage("Compactando e otimizando imagem...");

    try {
      // 1. Compress image in front-end using our custom Canvas utility
      const { compressImage, compressImageToBase64 } = await import("../utils/imageCompressor");
      const compressedFile = await compressImage(file, 400, 400, 0.75);

      // 2. Try to upload to Supabase Storage if configured
      const { isSupabaseConfigured, dbUploadLogo } = await import("../supabase");
      if (isSupabaseConfigured()) {
        setStatusMessage("Salvando logotipo no Supabase Estável...");
        const publicUrl = await dbUploadLogo(compressedFile);
        if (publicUrl) {
          setLogo(publicUrl);
          setStatusMessage("Logotipo salvo com sucesso no servidor!");
          setTimeout(() => setStatusMessage(null), 3000);
          setUploadingLogo(false);
          return;
        }
      }

      // 3. Fallback: Read compressed image to base64 for local persistence (e.g., IndexedDB fallback)
      setStatusMessage("Carregando logotipo em cache local seguro...");
      const base64 = await compressImageToBase64(file, 400, 400, 0.75);
      setLogo(base64);
      setStatusMessage("Logotipo carregado localmente com compressão ativa!");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      console.error(err);
      setStatusMessage(`Falha ao registrar logotipo: ${err.message || err}`);
      setTimeout(() => setStatusMessage(null), 4000);
      alert("Erro ao processar imagem: " + (err.message || err));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = () => {
    if (!tradingName.trim()) {
      alert("Por favor, preencha o Nome Fantasia da empresa.");
      return;
    }

    const updated: CompanyProfile = {
      tradingName: tradingName.trim(),
      phone: phone.trim(),
      cep: cep.trim(),
      address: address.trim(),
      number: number.trim(),
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      state: state.trim(),
      cnpjCpf: cnpjCpf.trim(),
      logo: logo,
      pixKey: pixKey.trim(),
      goalsReminderEnabled: goalsReminderEnabled,
      goalsReminderTime: goalsReminderTime,
      openingTime: openingTime,
      closingTime: closingTime,
      autoCloseRegisterEnabled: autoCloseRegisterEnabled,
      autoBackupDownloadEnabled: autoBackupDownloadEnabled,
      businessHours: businessHours,
      cashClosingReminderEnabled: cashClosingReminderEnabled,
      cashClosingReminderTime: cashClosingReminderTime,
      cashClosingReminderMessage: cashClosingReminderMessage,
    };

    onSaveCompany(updated);
    setStatusMessage("Configurações da empresa salvas com sucesso!");
    
    if (autoBackupDownloadEnabled) {
      setTimeout(() => {
        handleExportLocalStorageBackup();
      }, 500);
    }
    
    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  const handleTestCashClosingReminder = () => {
    window.dispatchEvent(new CustomEvent("TEST_CASH_CLOSING_REMINDER"));
    setStatusMessage("Notificação agradável de teste disparada na tela! ✨");
    setTimeout(() => setStatusMessage(null), 4000);
  };

  return (
    <div className="bg-brand-card border border-slate-800 rounded-2xl p-6 space-y-6 relative">
      {/* 🛡️ BANNER RÁPIDO: ATENDENTES & AUDITORIA DE EXCLUSÕES */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-blue-950/40 border border-cyan-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-cyan-950/20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              Atendentes Cadastrados & Auditoria de Exclusões
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Admin</span>
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Visualize todos os atendentes cadastrados, relatório detalhado de exclusões (data, hora, operador, itens apagados) e relatórios diários/mensais de produção de cada atendente.
            </p>
          </div>
        </div>
        {onNavigateToAtendentes && (
          <button
            type="button"
            onClick={onNavigateToAtendentes}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/25 border border-cyan-400/30 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap transition-all shrink-0 active:scale-95"
          >
            <UserCheck className="h-4 w-4" />
            <span>Ver Relatório de Atendentes</span>
          </button>
        )}
      </div>

      {/* 💵 SEÇÃO DE ABERTURA DO CAIXA */}
      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold uppercase text-white tracking-widest flex items-center gap-2">
              <Wallet className="h-4 w-4 text-brand-magenta animate-pulse" />
              Controle e Abertura do Caixa (Toda a Equipe)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              A abertura serve para todos: uma vez aberto por qualquer atendente ou administrador, o caixa fica liberado e sincronizado para toda a empresa.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 w-fit">
            <Users className="h-3.5 w-3.5" />
            Caixa Compartilhado
          </span>
        </div>

        {cashRegister?.currentSession ? (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-left space-y-1">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Caixa Ativo e Aberto 🔓
              </span>
              <p className="text-xs text-slate-300">
                Operador: <strong className="text-white uppercase">{cashRegister.currentSession.operador}</strong>
              </p>
              <p className="text-[11px] text-slate-450 font-mono">
                Aberto em: {new Date(cashRegister.currentSession.dataAbertura).toLocaleString("pt-BR")}
              </p>
              <p className="text-xs text-slate-300">
                Troco Inicial: <strong className="text-brand-cyan font-mono">R$ {Number(cashRegister.currentSession.valorAbertura || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
              </p>
            </div>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onCloseRegister) {
                    const confirmClose = window.confirm("Deseja fechar o caixa atual?");
                    if (confirmClose) {
                      const valor = prompt("Digite o valor físico encontrado em caixa:", "0.00");
                      if (valor !== null) {
                        const numericValue = parseFloat(valor) || 0;
                        const obs = prompt("Observações de encerramento:", "") || "";
                        onCloseRegister(numericValue, obs);
                      }
                    }
                  }
                }}
                className="py-2 px-4 bg-red-650 hover:bg-red-700 text-white font-bold text-[11px] uppercase rounded-xl border border-red-550 transition-all cursor-pointer shadow-lg active:scale-95 text-center"
              >
                Encerrar Caixa 🔒
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
            <div className="p-3 bg-brand-magenta/5 border border-brand-magenta/15 rounded-xl text-[11px] text-slate-300 leading-relaxed">
              O caixa está atualmente <strong className="text-rose-400">FECHADO</strong>. Insira os dados abaixo para abrir a sessão de vendas.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block font-mono">
                  Responsável pela Abertura <span className="text-brand-magenta">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nome do responsável"
                  value={openingOperatorName}
                  onChange={(e) => setOpeningOperatorName(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-brand-magenta transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block font-mono">
                  Valor de Abertura / Fundo de Troco (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold font-mono">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Deixe em branco ou digite o valor"
                    value={openingFloatValue}
                    onChange={(e) => setOpeningFloatValue(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 text-sm text-brand-cyan font-mono focus:outline-none focus:border-brand-magenta transition-all placeholder-slate-650"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const val = Math.max(0, parseFloat(openingFloatValue) || 0);
                const op = openingOperatorName.trim() || currentUser?.name || "Operador Principal";
                if (!op) {
                  alert("Por favor, preencha o nome do responsável.");
                  return;
                }
                if (onOpenRegister) {
                  onOpenRegister(val, op);
                  setOpeningFloatValue(""); // reset to blank after opening
                }
              }}
              className="py-2.5 px-5 bg-gradient-to-r from-brand-magenta to-pink-650 hover:brightness-110 text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl cursor-pointer shadow-lg active:scale-95 transition-all w-full sm:w-auto"
            >
              Confirmar Abertura do Caixa 🚀
            </button>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Building2 className={`h-5 w-5 text-brand-magenta ${loadingProfile ? "animate-pulse" : ""}`} />
          Dados Cadastrais da Empresa
          {loadingProfile && (
            <span className="flex items-center gap-1 text-xs text-brand-magenta font-normal ml-2 animate-pulse bg-brand-magenta/5 px-2 py-0.5 rounded border border-brand-magenta/10">
              <RefreshCw className="h-3 w-3 animate-spin text-brand-magenta" />
              Buscando dados cadastrados...
            </span>
          )}
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Estas informações e o logotipo serão usados para preencher o cabeçalho dos seus PDFs gerados e personalizar o sistema.
        </p>
      </div>

      {statusMessage && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl animate-fade-in text-sm font-medium">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fill values inputs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nome Fantasia */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                Nome Fantasia <span className="text-brand-magenta">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Ar e Clima Assistência Técnica"
                value={tradingName}
                onChange={(e) => setTradingName(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
              />
            </div>

            {/* CNPJ / CPF */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                CNPJ ou CPF <span className="text-slate-500">(Opcional)</span>
              </label>
              <input
                type="text"
                placeholder="Ex: 00.000.000/0001-00"
                value={cnpjCpf}
                onChange={(e) => setCnpjCpf(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
              />
            </div>

            {/* Telefone */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                Telefone de Contato
              </label>
              <input
                type="text"
                placeholder="Ex: (11) 98888-7777"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
              />
            </div>

            {/* CEP */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                CEP (Busca Automática)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ex: 01311-200"
                  value={cep}
                  onChange={(e) => handleCepChange(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={triggerCepSearch}
                  disabled={loadingCep}
                  className="px-3 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-850 rounded-xl text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
                  title="Buscar Endereço"
                >
                  {loadingCep ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-brand-cyan" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Chave PIX */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                Chave PIX da Empresa para Recebimentos
              </label>
              <input
                type="text"
                placeholder="Ex: CNPJ, E-mail, Celular ou Chave Aleatória (usada para gerar o QR Code de cobrança)"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
              />
            </div>

            {/* Horário de Funcionamento e Fechamento Automático */}
            <div className="space-y-4 sm:col-span-2 p-5 bg-slate-950/40 rounded-xl border border-slate-800/80 mt-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-brand-magenta shrink-0" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Horário de Funcionamento Flexível</h3>
              </div>
              
              {/* Opções rápidas/padrão em botões */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Preenchimento Rápido (Selecione um Padrão):</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyBusinessHoursPreset("preset1")}
                    className="py-1.5 px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-[11px] font-medium rounded-lg border border-slate-800 hover:border-slate-700 transition-all cursor-pointer shadow"
                  >
                    Seg a Sex: 09h às 18h / Sáb: 06h às 14h
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBusinessHoursPreset("preset2")}
                    className="py-1.5 px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-[11px] font-medium rounded-lg border border-slate-800 hover:border-slate-700 transition-all cursor-pointer shadow"
                  >
                    Seg a Sex: 08h às 18h / Sáb: 08h às 12h
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBusinessHoursPreset("preset3")}
                    className="py-1.5 px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-[11px] font-medium rounded-lg border border-slate-800 hover:border-slate-700 transition-all cursor-pointer shadow"
                  >
                    Seg a Sáb: 09h às 18h / Dom: Fechado
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBusinessHoursPreset("preset4")}
                    className="py-1.5 px-3 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-[11px] font-medium rounded-lg border border-slate-800 hover:border-slate-700 transition-all cursor-pointer shadow"
                  >
                    Todos os dias: 08h às 22h
                  </button>
                </div>
              </div>

              {/* Lista seletora dia a dia para personalização detalhada */}
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Personalização Detalhada por Dia:</span>
                <div className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-slate-900/60">
                  {WEEKDAYS.map((day) => {
                    const hoursForDay = businessHours[day.key] || { isOpen: false, openTime: "09:00", closeTime: "18:00" };
                    return (
                      <div key={day.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 bg-slate-950/40 rounded-lg border border-slate-900/40 hover:bg-slate-900/20 transition-all">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <input
                            type="checkbox"
                            id={`day-${day.key}`}
                            checked={hoursForDay.isOpen}
                            onChange={() => handleDayToggle(day.key)}
                            className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-brand-magenta focus:ring-brand-magenta focus:ring-offset-slate-950 cursor-pointer"
                          />
                          <label htmlFor={`day-${day.key}`} className="text-xs font-semibold text-slate-200 cursor-pointer select-none">
                            {day.label}
                          </label>
                        </div>

                        <div className="flex items-center gap-2">
                          {hoursForDay.isOpen ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Aberto
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-500/10 text-slate-400 border border-slate-500/10">
                              Fechado
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500">Abertura:</span>
                            <input
                              type="time"
                              value={hoursForDay.openTime}
                              disabled={!hoursForDay.isOpen}
                              onChange={(e) => handleTimeChange(day.key, "openTime", e.target.value)}
                              className="bg-slate-900 border border-slate-800 disabled:opacity-40 rounded-md py-1 px-2 text-xs text-slate-200 focus:outline-none focus:border-brand-magenta transition-all font-mono"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500">Fechamento:</span>
                            <input
                              type="time"
                              value={hoursForDay.closeTime}
                              disabled={!hoursForDay.isOpen}
                              onChange={(e) => handleTimeChange(day.key, "closeTime", e.target.value)}
                              className="bg-slate-900 border border-slate-800 disabled:opacity-40 rounded-md py-1 px-2 text-xs text-slate-200 focus:outline-none focus:border-brand-magenta transition-all font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Compatibilidade retroativa para recursos legados/fechamento auto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-900 pt-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Horário Limite Geral para Alertas:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] text-slate-500 block">Início:</span>
                      <input
                        type="time"
                        value={openingTime}
                        onChange={(e) => setOpeningTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-850 rounded-lg py-1 px-2 text-xs text-slate-200 focus:outline-none focus:border-brand-magenta font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">Término:</span>
                      <input
                        type="time"
                        value={closingTime}
                        onChange={(e) => setClosingTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-850 rounded-lg py-1 px-2 text-xs text-slate-200 focus:outline-none focus:border-brand-magenta font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-end">
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoCloseRegisterEnabled}
                        onChange={(e) => setAutoCloseRegisterEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-900 border border-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-magenta/80 peer-checked:after:bg-white"></div>
                      <div className="ml-3 text-xs font-medium text-slate-300">
                        Fechar caixa automaticamente
                      </div>
                    </label>
                  </div>
                  <p className="text-[9px] text-slate-500 leading-relaxed mt-1">
                    Ativando esta opção, o sistema fará a contabilidade sozinho e fechará o caixa de forma totalmente autônoma se os operadores esquecerem o caixa aberto no final do dia.
                  </p>
                </div>
              </div>
            </div>

            {/* 🌅 LEMBRETE AGRADÁVEL DE FECHAMENTO DE CAIXA AO FIM DO EXPEDIENTE */}
            <div className="space-y-4 sm:col-span-2 p-5 bg-gradient-to-br from-slate-950/90 via-slate-900/70 to-amber-950/20 rounded-xl border border-amber-500/30 shadow-lg shadow-amber-950/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-850">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 shrink-0">
                    <Sunset className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      Lembrete Agradável de Fechamento de Caixa
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Fim de Expediente
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Ao passar do horário de funcionamento, o sistema exibe uma notificação acolhedora na tela convidando a fechar o caixa e salvar os dados antes de fechar o programa.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleTestCashClosingReminder}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30 hover:border-amber-500/50 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                    title="Simular e visualizar como a notificação agradável aparecerá na tela"
                  >
                    <BellRing className="h-3.5 w-3.5" />
                    <span>Testar Notificação</span>
                  </button>
                </div>
              </div>

              {/* Toggle switch */}
              <div className="flex items-center justify-between p-3.5 bg-slate-950/60 rounded-xl border border-slate-850">
                <div className="space-y-0.5 pr-4">
                  <span className="text-xs font-semibold text-slate-200 block">
                    Ativar Lembrete de Fechamento de Caixa
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Exibe um diálogo caloroso e amigável quando o horário limite for atingido, com opções para conferir e fechar o caixa agora, adiar por 15 minutos ou manter aberto.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={cashClosingReminderEnabled}
                    onChange={(e) => setCashClosingReminderEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-900 border border-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-amber-500 peer-checked:to-orange-500 peer-checked:after:bg-white"></div>
                </label>
              </div>

              {cashClosingReminderEnabled && (
                <div className="space-y-4 pt-1">
                  {/* Horário do lembrete */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                        <span>Horário do Lembrete de Fechamento</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          {cashClosingReminderTime ? "Horário específico" : "Usando horário da empresa"}
                        </span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="time"
                          value={cashClosingReminderTime || closingTime}
                          onChange={(e) => setCashClosingReminderTime(e.target.value)}
                          className="w-full bg-slate-950/90 border border-slate-800 rounded-xl py-2 px-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setCashClosingReminderTime(closingTime)}
                          className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-xl border border-slate-800 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors"
                          title="Sincronizar com horário de término geral"
                        >
                          Usar {closingTime}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Quando atingir este horário, o aviso acolhedor é exibido se o caixa ainda estiver aberto.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 block">
                        Modelos Rápidos de Mensagem Agradável
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setCashClosingReminderMessage(
                              "Excelente dia de trabalho! O horário de encerramento do expediente foi atingido. Deseja realizar o fechamento do caixa e salvar seus relatórios antes de fechar o programa?"
                            )
                          }
                          className="py-1 px-2.5 bg-slate-900/80 hover:bg-slate-800 text-amber-300 text-[11px] rounded-lg border border-amber-500/20 transition-all cursor-pointer"
                        >
                          🌅 Acolhedor & Motivador
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCashClosingReminderMessage(
                              "Atenção: Horário de encerramento do expediente atingido. Por gentileza, realize a conferência dos valores e encerre a sessão do caixa para fechar o programa."
                            )
                          }
                          className="py-1 px-2.5 bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-[11px] rounded-lg border border-slate-800 transition-all cursor-pointer"
                        >
                          💼 Profissional & Direto
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCashClosingReminderMessage(
                              "Fim do expediente concluído com sucesso! Lembre-se de realizar o fechamento do caixa antes de desligar o sistema. Bom descanso e até amanhã! 🌙"
                            )
                          }
                          className="py-1 px-2.5 bg-slate-900/80 hover:bg-slate-800 text-teal-300 text-[11px] rounded-lg border border-teal-500/20 transition-all cursor-pointer"
                        >
                          🌙 Bom Descanso
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Mensagem personalizada */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Mensagem Agradável Exibida na Notificação
                    </label>
                    <textarea
                      rows={3}
                      value={cashClosingReminderMessage}
                      onChange={(e) => setCashClosingReminderMessage(e.target.value)}
                      placeholder="Digite a mensagem carinhosa e agradável que aparecerá para os operadores quando o expediente terminar..."
                      className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-all resize-none leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Endereço Line details */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-8 space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Logradouro / Rua</label>
              <input
                type="text"
                placeholder="Rua, Avenida, etc."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-4 space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Número</label>
              <input
                type="text"
                placeholder="Número ou S/N"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bairro</label>
              <input
                type="text"
                placeholder="Bairro"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cidade</label>
              <input
                type="text"
                placeholder="Cidade"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">UF / Estado</label>
              <input
                type="text"
                placeholder="Estado"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Logo file uploader */}
        <div className="space-y-4">
          <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1">
            Logotipo da Empresa
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => !uploadingLogo && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all relative ${
              uploadingLogo
                ? "border-brand-magenta/40 bg-slate-950/65 cursor-wait"
                : dragActive
                ? "border-brand-magenta bg-brand-magenta/5"
                : "border-slate-800 bg-slate-950/40 hover:border-slate-750"
            }`}
          >
            {uploadingLogo ? (
              <div className="py-8 space-y-3">
                <RefreshCw className="h-8 w-8 mx-auto text-brand-magenta animate-spin" />
                <p className="text-xs font-bold text-slate-300">Otimizando e Enviando Imagem...</p>
                <p className="text-[10px] text-slate-500">Isso evita travamentos de cota no navegador.</p>
              </div>
            ) : logo ? (
              <div className="space-y-3">
                <div className="max-w-[150px] mx-auto bg-slate-900 border border-slate-800 p-2 rounded-lg">
                  <img
                    src={logo}
                    alt="Logo Empresa"
                    referrerPolicy="no-referrer"
                    className="max-h-24 object-contain w-full mx-auto"
                  />
                </div>
                <div className="flex justify-center items-center gap-1 text-[10px] text-slate-400 hover:text-red-400" onClick={(e) => { e.stopPropagation(); setLogo(null); }}>
                  <X className="h-3 w-3" /> Remover Logotipo
                </div>
              </div>
            ) : (
              <div className="py-6 space-y-2 text-slate-500">
                <Upload className="h-8 w-8 mx-auto text-slate-600 strike-[1.5]" />
                <p className="text-xs font-bold text-slate-350">Arraste ou Selecione o Logo</p>
                <p className="text-[10px] text-slate-500">Recomendado: Imagem PNG com fundo transparente</p>
              </div>
            )}
          </div>

          {/* Central de Segurança - Versão Ultra Compacta Integrada */}
          <div className="border border-slate-800 bg-slate-950/50 rounded-xl p-3.5 space-y-3">
            <div className="space-y-0.5">
              <h4 className="text-[11px] font-black text-rose-100 uppercase tracking-wider flex items-center gap-1">
                🛡️ Central de Segurança e Backup
              </h4>
              <p className="text-[9px] text-slate-400 leading-relaxed">
                Proteja suas informações de vendas, produtos, gastos e configurações exportando ou carregando backups.
              </p>
            </div>

            {/* Input Oculto */}
            <input
              ref={backupFileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFileChange}
              className="hidden"
            />

            {/* Mensagens de Feedback */}
            {backupSuccessMsg && (
              <div className="bg-emerald-950/50 border border-emerald-500/30 rounded-lg p-2 text-emerald-400 font-sans text-[10px]">
                <p className="font-bold flex items-center gap-1">✓ Operação concluída com sucesso!</p>
                <p className="text-[9px] text-emerald-500 mt-0.5">{backupSuccessMsg}</p>
              </div>
            )}

            {backupError && (
              <div className="bg-red-950/50 border border-red-500/30 rounded-lg p-2 text-red-400 font-sans text-[10px]">
                <p className="font-bold">❌ Falha: {backupError}</p>
              </div>
            )}

            {/* Arquivo selecionado no backup */}
            {backupFile ? (
              <div className="p-1.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-slate-350 text-[9px] font-mono">
                <span className="truncate max-w-[140px]">{backupFile.name} ({backupPreview?.type === "local" ? "Formato: Local" : "Formato: Nuvem"})</span>
                <button
                  type="button"
                  onClick={() => {
                    setBackupFile(null);
                    setBackupPreview(null);
                  }}
                  className="text-red-400 hover:text-red-200 text-[8px] font-bold uppercase shrink-0"
                >
                  Excluir
                </button>
              </div>
            ) : null}

            {/* --- SEÇÃO CLOUD BACKUP --- */}
            <div className="space-y-2 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900/40">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-brand-magenta uppercase tracking-wider block">1. Backup Remoto (Nuvem Supabase)</span>
                <button
                  type="button"
                  onClick={fetchCloudBackups}
                  className="text-[8px] text-slate-400 hover:text-brand-magenta flex items-center gap-1 font-mono transition-colors"
                  title="Atualizar lista de backups"
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${loadingCloudBackups ? "animate-spin" : ""}`} />
                  <span>Sincronizar</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  disabled={exporting}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-gradient-to-r from-brand-magenta/80 to-pink-650/80 text-white hover:brightness-110 active:scale-95 transition-all text-[9px] font-extrabold uppercase shadow-sm shadow-pink-900/10 cursor-pointer disabled:opacity-50 h-[30px]"
                  title="Exportar Todas as Informações da Nuvem e Salvar na Tabela"
                >
                  {exporting ? (
                    <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                  ) : (
                    <Database className="h-3.5 w-3.5 shrink-0 text-white" />
                  )}
                  <span>Exportar Nuvem</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    uploadCloudBackupInputRef.current?.click();
                  }}
                  disabled={uploadingCloud}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:brightness-110 active:scale-95 transition-all text-[9px] font-extrabold uppercase shadow-sm shadow-cyan-500/10 cursor-pointer disabled:opacity-50 h-[30px]"
                  title="Enviar Arquivo de Backup (.JSON) para a Nuvem e Compartilhar com Todas as Máquinas"
                >
                  {uploadingCloud ? (
                    <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 shrink-0 text-white" />
                  )}
                  <span>
                    {uploadingCloud ? "Enviando..." : "Upload Nuvem"}
                  </span>
                </button>
              </div>

              {/* Input oculto para upload direto para a nuvem */}
              <input
                ref={uploadCloudBackupInputRef}
                type="file"
                accept=".json"
                onChange={handleUploadBackupToCloud}
                className="hidden"
              />

              {/* LISTA DE BACKUPS SINCRONIZADOS EM TEMPO REAL */}
              <div className="pt-2 border-t border-slate-900/60 space-y-1.5">
                <div className="flex items-center justify-between text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Arquivos na Nuvem ({cloudBackups.length})</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Realtime Ativo
                  </span>
                </div>

                {loadingCloudBackups && cloudBackups.length === 0 ? (
                  <div className="p-2 text-center text-[9px] text-slate-500 font-mono flex items-center justify-center gap-1.5">
                    <RefreshCw className="h-3 w-3 animate-spin text-brand-magenta" />
                    Carregando backups da nuvem...
                  </div>
                ) : cloudBackups.length === 0 ? (
                  <div className="p-2 rounded bg-slate-900/40 border border-slate-900 text-center text-[9px] text-slate-500 font-mono">
                    Nenhum backup em nuvem encontrado.
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                    {cloudBackups.map((bkp) => (
                      <div
                        key={bkp.id}
                        className="p-1.5 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-2 transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Database className="h-3 w-3 text-brand-magenta shrink-0" />
                            <span className="text-[9px] font-bold text-slate-200 truncate block font-mono">
                              {bkp.titulo}
                            </span>
                          </div>
                          <span className="text-[8px] text-slate-400 block font-mono mt-0.5">
                            {new Date(bkp.created_at).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                            {bkp.valor ? ` • ${(Number(bkp.valor) / 1024).toFixed(1)} KB` : ""}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleRestoreCloudBackup(bkp)}
                            disabled={importing}
                            className="px-1.5 py-0.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded text-[8px] font-bold uppercase transition-colors cursor-pointer"
                            title="Restaurar este backup nesta máquina"
                          >
                            Restaurar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadCloudBackup(bkp)}
                            className="p-1 text-slate-400 hover:text-brand-cyan transition-colors cursor-pointer"
                            title="Baixar arquivo .json"
                          >
                            <Download className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCloudBackup(bkp.id)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                            title="Excluir da nuvem"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* --- SEÇÃO LOCALSTORAGE BACKUP --- */}
            <div className="space-y-1 bg-slate-950/40 p-2 rounded-lg border border-slate-900/40">
              <span className="text-[9px] font-black text-brand-cyan uppercase tracking-wider block">2. Backup Local (LocalStorage do Navegador)</span>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleExportLocalStorageBackup}
                  className="flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-slate-905 border border-slate-800 hover:bg-slate-800 hover:text-white text-slate-350 active:scale-95 transition-all text-[9px] font-extrabold uppercase cursor-pointer h-[30px]"
                  title="Fazer download imediato dos dados do navegador (LocalStorage) em formato JSON"
                >
                  <Download className="h-3.5 w-3.5 shrink-0 text-brand-cyan" />
                  <span>Exportar Local</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    backupFileInputRef.current?.click();
                  }}
                  disabled={importing}
                  className="flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-slate-905 border border-slate-800 hover:bg-slate-800 hover:text-white text-slate-350 active:scale-95 transition-all text-[9px] font-extrabold uppercase cursor-pointer h-[30px]"
                  title="Restaurar dados do LocalStorage a partir do arquivo JSON selecionado (carrega na mesma hora)"
                >
                  {importing ? (
                    <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  )}
                  <span>
                    {importing ? "Restaurando..." : "Restaurar Local"}
                  </span>
                </button>
              </div>
            </div>

            {/* --- AUTO DOWNLOAD SETTINGS --- */}
            <div className="pt-1.5 border-t border-slate-900/50">
              <div className="flex items-start gap-2 pt-1">
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoBackupDownloadEnabled}
                    onChange={(e) => setAutoBackupDownloadEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-900 border border-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-magenta/80 peer-checked:after:bg-white shrink-0"></div>
                  <div className="ml-2 text-[9px] font-bold text-slate-350 uppercase tracking-widest leading-none">
                    Download de Backup Local Automático ao Salvar Ajustes
                  </div>
                </label>
              </div>
              <p className="text-[9px] text-slate-500 mt-1 lines-relaxed">
                Recomendado: Sempre que salvar as configurações da empresa, uma cópia de segurança completa do seu LocalStorage será exportada de forma automática para evitar perdas acidentais.
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* 🔔 PREFERÊNCIAS DE NOTIFICAÇÃO E CENTRAL DE LEMBRETES */}
      <div className="mt-6 pt-5 border-t border-slate-850 space-y-6">
        <div>
          <h4 className="text-xs font-bold text-slate-250 uppercase tracking-widest flex items-center gap-1.5">
            🔔 Preferências de Notificação e Central de Lembretes
          </h4>
          <p className="text-[10px] text-slate-500 font-sans mt-1">
            Ative alertas automáticos de metas e gerencie seus lembretes personalizados do dia a dia.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* PAINEL DE AUDIO E METAS DIÁRIAS */}
          <div className="space-y-4">
            {/* Sons Alert Box */}
            <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="text-left font-sans space-y-1">
                <span className="text-xs font-bold text-white block">Sons de Alerta e Caixa Registradora</span>
                <span className="text-[10px] text-slate-500 block leading-relaxed">
                  Toque de sino para novas vendas e conquistas de metas.
                </span>
              </div>
              <button
                type="button"
                onClick={() => onToggleSound?.(!soundEnabled)}
                className={`py-2 px-3.5 rounded-lg border font-bold text-[10px] uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  soundEnabled
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15"
                    : "bg-slate-900 border-slate-800 text-slate-450 hover:bg-slate-850"
                }`}
              >
                {soundEnabled ? (
                  <>
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>ATIVADO</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="h-3.5 w-3.5" />
                    <span>DESATIVADO</span>
                  </>
                )}
              </button>
            </div>

            {/* Lembrete Diário de Metas Box */}
            <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-left font-sans space-y-1">
                  <span className="text-xs font-bold text-white block">Lembrete Diário de Metas</span>
                  <span className="text-[10px] text-slate-500 block leading-relaxed">
                    Exibe um alerta sobre o andamento e progresso da meta diária de lucros do caixa.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setGoalsReminderEnabled(!goalsReminderEnabled)}
                  className={`py-2 px-3.5 rounded-lg border font-bold text-[10px] uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    goalsReminderEnabled
                      ? "bg-brand-cyan/20 border-brand-cyan/40 text-brand-cyan hover:bg-brand-cyan/25"
                      : "bg-slate-900 border-slate-800 text-slate-450 hover:bg-slate-850"
                  }`}
                >
                  {goalsReminderEnabled ? (
                    <>
                      <Bell className="h-3.5 w-3.5" />
                      <span>ATIVADO</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="h-3.5 w-3.5" />
                      <span>DESATIVADO</span>
                    </>
                  )}
                </button>
              </div>

              {goalsReminderEnabled && (
                <div className="pt-3 border-t border-slate-900/60 flex items-center gap-3 animate-fade-in">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-brand-cyan" /> Horário preferencial:
                  </span>
                  <input
                    type="time"
                    value={goalsReminderTime}
                    onChange={(e) => setGoalsReminderTime(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg py-1 px-2.5 text-xs text-brand-cyan font-mono font-bold focus:outline-none focus:border-brand-cyan transition-all"
                  />
                  <span className="text-[9px] text-slate-505 italic">Notificação diária neste horário.</span>
                </div>
              )}
            </div>
          </div>

          {/* DYNAMIC GENERAL CUSTOM REMINDERS SECTION */}
          <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 flex flex-col space-y-4">
            <div className="border-b border-slate-900/60 pb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-1">
                📅 Lembretes Personalizados
              </span>
              <span className="text-[9px] font-mono font-semibold bg-brand-magenta/15 text-brand-magenta px-2 py-0.5 rounded border border-brand-magenta/20">
                {reminders.filter(r => !r.completed).length} Ativos
              </span>
            </div>

            {/* Form for adding/editing a custom reminder */}
            <div className="space-y-3 bg-slate-950 p-3 rounded-lg border border-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                  {editingReminderId ? "📝 Editar Lembrete Selecionado" : "📅 Agendar Novo Lembrete"}
                </span>
                {editingReminderId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="text-[9px] text-red-400 hover:underline uppercase font-bold"
                  >
                    Cancelar Edição
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Description */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Descrição do Lembrete</label>
                  <input
                    type="text"
                    placeholder="Descrição / Assunto do Lembrete (Ex: Revisar compressor de ar do Pedro)"
                    value={newReminderTitle}
                    onChange={(e) => setNewReminderTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-3 text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-brand-magenta"
                  />
                </div>

                {/* Type Selection */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Escolha o Tipo de Frequência</label>
                  <select
                    value={newReminderType}
                    onChange={(e) => setNewReminderType(e.target.value as "date" | "weekly")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-slate-300 focus:outline-none focus:border-brand-magenta"
                  >
                    <option value="date">Data e Hora Específica</option>
                    <option value="weekly">Dia de Semana Recorrente</option>
                  </select>
                </div>

                {/* Day option selection */}
                {newReminderType === "date" ? (
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Selecione o Dia / Data</label>
                    <input
                      type="date"
                      value={newReminderDate}
                      onChange={(e) => setNewReminderDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-xs text-slate-300 focus:outline-none font-mono"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Selecione o Dia da Semana</label>
                    <select
                      value={newReminderDayOfWeek}
                      onChange={(e) => setNewReminderDayOfWeek(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-slate-300 focus:outline-none font-sans"
                    >
                      <option value={1}>Segunda-feira</option>
                      <option value={2}>Terça-feira</option>
                      <option value={3}>Quarta-feira</option>
                      <option value={4}>Quinta-feira</option>
                      <option value={5}>Sexta-feira</option>
                      <option value={6}>Sábado</option>
                      <option value={0}>Domingo</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Time Selection and Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-900/60 mt-2">
                <div className="flex flex-wrap items-center gap-4">
                  {/* All Day Toggle Checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newReminderIsAllDay}
                      onChange={(e) => setNewReminderIsAllDay(e.target.checked)}
                      className="rounded border-slate-800 bg-slate-950 text-brand-magenta focus:ring-brand-magenta h-4 w-4"
                    />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">🔔 O Dia Todo</span>
                  </label>

                  {!newReminderIsAllDay && (
                    <div className="flex items-center gap-2 animate-fade-in">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Horário:</span>
                      <input
                        type="time"
                        value={newReminderTime}
                        onChange={(e) => setNewReminderTime(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-xs text-slate-300 focus:outline-none font-mono"
                      />
                    </div>
                  )}
                </div>

                {editingReminderId ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="py-1.5 px-3 bg-slate-800 hover:bg-slate-755 text-slate-300 text-[10px] font-black uppercase rounded-lg cursor-pointer transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="py-1.5 px-4 bg-emerald-600 hover:bg-emerald-550 text-white text-[10px] font-black uppercase rounded-lg shadow-sm font-sans flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Salvar Alterações</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddReminder}
                    className="py-1.5 px-4 bg-brand-magenta hover:bg-brand-magenta/95 text-white text-[10px] font-black uppercase rounded-lg shadow-sm font-sans flex items-center gap-1 cursor-pointer transition-colors animate-pulse"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agendar Lembrete</span>
                  </button>
                )}
              </div>
            </div>

            {/* List of custom reminders */}
            <div className="max-h-[175px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {reminders.length === 0 ? (
                <div className="py-8 text-center text-slate-600 text-[10px] font-mono border border-dashed border-slate-900 rounded-lg bg-slate-950/20">
                  Nenhum lembrete cadastrado até o momento.
                </div>
              ) : (
                reminders.map((rem) => {
                  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                  const fullDayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
                  const dateFormatted = rem.type === "date" && rem.date
                    ? rem.date.split("-").reverse().join("/")
                    : rem.dayOfWeek !== undefined
                    ? `${fullDayNames[rem.dayOfWeek]} (Semanal)`
                    : "Todos os dias";

                  const isEditedNow = editingReminderId === rem.id;

                  return (
                    <div
                      key={rem.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-2.5 transition-all text-left ${
                        isEditedNow
                          ? "bg-brand-magenta/5 border-brand-magenta/50"
                          : rem.completed
                          ? "bg-slate-950/20 border-slate-910/30 opacity-55"
                          : "bg-slate-950/80 border-slate-850 hover:border-slate-800"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* Custom completed checkbox */}
                        <button
                          type="button"
                          onClick={() => handleToggleReminderCompleted(rem.id)}
                          className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border transition-all cursor-pointer outline-none ${
                            rem.completed
                              ? "bg-brand-cyan border-brand-cyan text-slate-950"
                              : "border-slate-700 hover:border-slate-500 bg-slate-900"
                          }`}
                        >
                          {rem.completed && <Check className="w-3.5 h-3.5 stroke-[4]" />}
                        </button>

                        <div className="min-w-0 font-sans leading-none">
                          <span
                            className={`text-xs font-bold text-slate-205 truncate block uppercase ${
                              rem.completed ? "line-through text-slate-550" : ""
                            }`}
                            title={rem.title}
                          >
                            {rem.title}
                          </span>
                          <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-slate-500">
                            <span className="flex items-center gap-0.5">
                              {rem.type === "date" ? <Calendar className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              {dateFormatted}
                            </span>
                            <span>•</span>
                            <span className="font-bold text-brand-cyan flex items-center gap-0.5">
                              <Clock className="w-3 h-3 text-brand-cyan" />
                              {rem.isAllDay ? "O Dia Todo 🌅" : rem.time}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(rem)}
                          className={`p-1 rounded transition-all cursor-pointer ${
                            isEditedNow
                              ? "text-brand-magenta bg-brand-magenta/10"
                              : "text-slate-450 hover:text-brand-cyan hover:bg-slate-900/60"
                          }`}
                          title="Editar Lembrete"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteReminder(rem.id)}
                          className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-900/60 transition-all cursor-pointer"
                          title="Excluir Lembrete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-850 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 py-2.5 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-brand-magenta to-brand-magenta/80 shadow-md shadow-brand-magenta/15 cursor-pointer hover:opacity-90 transform hover:-translate-y-0.5 transition-all text-xs font-sans"
        >
          <Sparkles className="h-4 w-4" />
          <span>Salvar Registro de Empresa</span>
        </button>
      </div>
    </div>
  );
}
