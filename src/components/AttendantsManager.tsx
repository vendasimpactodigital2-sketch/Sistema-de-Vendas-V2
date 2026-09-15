import React, { useState, useEffect, useMemo } from "react";
import {
  User,
  Sale,
  Expense,
  CompanyProfile,
  DeletionAuditRecord
} from "../types";
import {
  Users,
  UserCheck,
  UserPlus,
  Trash2,
  Calendar,
  Clock,
  Search,
  Filter,
  Printer,
  FileSpreadsheet,
  AlertTriangle,
  ShieldAlert,
  ArrowLeft,
  DollarSign,
  Banknote,
  QrCode,
  CreditCard,
  Percent,
  Package,
  FileText,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Phone,
  Tag,
  HelpCircle,
  TrendingUp,
  X
} from "lucide-react";
import { isSupabaseConfigured, dbGetUsers, dbSaveUser, dbDeleteUser } from "../supabase";

interface AttendantsManagerProps {
  currentUser: User;
  sales: Sale[];
  budgets: Sale[];
  expenses: Expense[];
  company: CompanyProfile;
  deletionRecords: DeletionAuditRecord[];
  onClearDeletions?: () => void;
}

export function AttendantsManager({
  currentUser,
  sales,
  budgets,
  expenses,
  company,
  deletionRecords,
  onClearDeletions
}: AttendantsManagerProps) {
  // Navigation inside the module
  const [activeTab, setActiveTab] = useState<"atendentes" | "exclusoes" | "novo">("atendentes");
  const [selectedAttendant, setSelectedAttendant] = useState<User | null>(null);

  // Users / Attendants list state
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // New attendant form state
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  // Filters for Exclusions Report
  const [exclusionFilterUser, setExclusionFilterUser] = useState<string>("todos");
  const [exclusionFilterType, setExclusionFilterType] = useState<string>("todos");
  const [exclusionSearch, setExclusionSearch] = useState("");
  const [exclusionPeriod, setExclusionPeriod] = useState<"hoje" | "ontem" | "7dias" | "mes" | "todos" | "custom">("todos");
  const [exclusionCustomStart, setExclusionCustomStart] = useState("");
  const [exclusionCustomEnd, setExclusionCustomEnd] = useState("");

  // Filters for Individual Attendant Activity Report
  const [attendantPeriodMode, setAttendantPeriodMode] = useState<"hoje" | "ontem" | "mes_atual" | "mes_anterior" | "dia_especifico" | "mes_especifico" | "custom" | "todos">("hoje");
  const [attendantSpecificDate, setAttendantSpecificDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [attendantSpecificMonth, setAttendantSpecificMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [attendantStartDate, setAttendantStartDate] = useState<string>("");
  const [attendantEndDate, setAttendantEndDate] = useState<string>("");
  const [attendantActionFilter, setAttendantActionFilter] = useState<"todas" | "vendas" | "recebimentos" | "entregas" | "orcamentos" | "exclusoes">("todas");

  // Load attendants
  const loadUsers = async () => {
    setLoadingUsers(true);
    let usersList: User[] = [];

    try {
      const saved = localStorage.getItem("NUCLEO_USERS");
      if (saved) {
        usersList = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to parse local users:", e);
    }

    if (isSupabaseConfigured()) {
      try {
        const dbUsers = await dbGetUsers(currentUser.id);
        if (dbUsers && dbUsers.length > 0) {
          dbUsers.forEach(u => {
            if (!usersList.some(existing => existing.id === u.id)) {
              usersList.push(u);
            }
          });
        }
      } catch (err) {
        console.warn("Error fetching Supabase users:", err);
      }
    }

    setAllUsers(usersList);
    setLoadingUsers(false);
  };

  useEffect(() => {
    loadUsers();
  }, [currentUser.id]);

  // Filter only attendants registered under current owner/company
  const ownerId = currentUser.owner_id || currentUser.id;
  const attendantsList = useMemo(() => {
    return allUsers.filter(u => {
      // Must belong to this company/owner
      const isMyTeam = u.owner_id === ownerId || u.id === ownerId;
      // Is an attendant (role === 'atendente' or not the main admin owner)
      const isAtt = u.role === "atendente" || (u.owner_id === ownerId && u.id !== ownerId);
      return isMyTeam && isAtt;
    });
  }, [allUsers, ownerId]);

  // Helper to format currency
  const formatMoney = (val: number) => {
    return (Number(val) || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  };

  // Helper to format date and time
  const formatDateTime = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return isoString;
    }
  };

  const formatDateOnly = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString("pt-BR");
    } catch {
      return isoString;
    }
  };

  // ==========================================
  // METRICS & COMPUTATIONS FOR ATTENDANTS
  // ==========================================

  // Match sale to an attendant
  const isSaleByAttendant = (sale: Sale, attendant: User) => {
    if (sale.sellerId && sale.sellerId === attendant.id) return true;
    const sName = (sale.sellerName || "").trim().toLowerCase();
    const attName = (attendant.name || "").trim().toLowerCase();
    const attUser = (attendant.username || "").trim().toLowerCase();
    return (sName && (sName === attName || sName === attUser));
  };

  // Match payment to an attendant
  const isPaymentByAttendant = (payment: any, attendant: User) => {
    const recBy = (payment.recordedBy || "").trim().toLowerCase();
    const attName = (attendant.name || "").trim().toLowerCase();
    const attUser = (attendant.username || "").trim().toLowerCase();
    return (recBy && (recBy === attName || recBy === attUser));
  };

  // Match delivery to an attendant
  const isDeliveryByAttendant = (sale: Sale, attendant: User) => {
    if (!sale.materialEntregue) return false;
    const delBy = (sale.deliveredBy || "").trim().toLowerCase();
    const attName = (attendant.name || "").trim().toLowerCase();
    const attUser = (attendant.username || "").trim().toLowerCase();
    return (delBy && (delBy === attName || delBy === attUser));
  };

  // Match deletion to an attendant
  const isDeletionByAttendant = (record: DeletionAuditRecord, attendant: User) => {
    if (record.deletedByUserId && record.deletedByUserId === attendant.id) return true;
    const delName = (record.deletedByName || "").trim().toLowerCase();
    const delUser = (record.deletedByUsername || "").trim().toLowerCase();
    const attName = (attendant.name || "").trim().toLowerCase();
    const attUser = (attendant.username || "").trim().toLowerCase();
    return (delName && delName === attName) || (delUser && delUser === attUser);
  };

  // Compute metrics per attendant
  const attendantStatsMap = useMemo(() => {
    const map = new Map<string, {
      salesCount: number;
      totalSalesValue: number;
      cashCollected: number;
      pixCollected: number;
      cardCollected: number;
      deliveriesCount: number;
      deletionsCount: number;
    }>();

    attendantsList.forEach(att => {
      let salesCount = 0;
      let totalSalesValue = 0;
      let cashCollected = 0;
      let pixCollected = 0;
      let cardCollected = 0;
      let deliveriesCount = 0;
      let deletionsCount = 0;

      // Check all sales
      sales.forEach(s => {
        const byThisAtt = isSaleByAttendant(s, att);
        if (byThisAtt && !s.isBudget) {
          salesCount++;
          totalSalesValue += Number(s.totalValue) || 0;
        }

        // Check payments received by this attendant
        if (s.payments && Array.isArray(s.payments)) {
          s.payments.forEach(p => {
            if (isPaymentByAttendant(p, att)) {
              const amt = Number(p.amount) || 0;
              if (p.method === "dinheiro") cashCollected += amt;
              else if (p.method === "pix") pixCollected += amt;
              else if (p.method === "cartão") cardCollected += amt;
            }
          });
        } else if (byThisAtt) {
          // Fallback downpayment
          const amt = Number(s.downPayment) || 0;
          if (amt > 0) {
            if (s.paymentMethod === "dinheiro") cashCollected += amt;
            else if (s.paymentMethod === "pix") pixCollected += amt;
            else if (s.paymentMethod === "cartão") cardCollected += amt;
          }
        }

        // Check deliveries
        if (isDeliveryByAttendant(s, att)) {
          deliveriesCount++;
        }
      });

      // Check deletions
      deletionRecords.forEach(d => {
        if (isDeletionByAttendant(d, att)) {
          deletionsCount++;
        }
      });

      map.set(att.id, {
        salesCount,
        totalSalesValue,
        cashCollected,
        pixCollected,
        cardCollected,
        deliveriesCount,
        deletionsCount
      });
    });

    return map;
  }, [attendantsList, sales, deletionRecords]);

  // Total de arquivos apagados em todo o sistema
  const totalDeletedFilesCount = deletionRecords.length;
  const totalDeletedValue = useMemo(() => {
    return deletionRecords.reduce((acc, curr) => acc + (Number(curr.totalValue) || 0), 0);
  }, [deletionRecords]);

  // ==========================================
  // EXCLUSIONS FILTERED LIST
  // ==========================================
  const filteredExclusions = useMemo(() => {
    return deletionRecords.filter(rec => {
      // Attendant filter
      if (exclusionFilterUser !== "todos") {
        const matchesId = rec.deletedByUserId === exclusionFilterUser;
        const matchesName = rec.deletedByName?.toLowerCase() === exclusionFilterUser.toLowerCase();
        const matchesUser = rec.deletedByUsername?.toLowerCase() === exclusionFilterUser.toLowerCase();
        if (!matchesId && !matchesName && !matchesUser) return false;
      }

      // Type filter
      if (exclusionFilterType !== "todos") {
        if (rec.itemType !== exclusionFilterType) return false;
      }

      // Search text
      if (exclusionSearch.trim()) {
        const q = exclusionSearch.toLowerCase();
        const matchTitle = rec.itemTitle.toLowerCase().includes(q);
        const matchClient = (rec.clientName || "").toLowerCase().includes(q);
        const matchPhone = (rec.clientPhone || "").toLowerCase().includes(q);
        const matchUser = (rec.deletedByName || "").toLowerCase().includes(q);
        const matchProducts = (rec.productsSummary || "").toLowerCase().includes(q);
        if (!matchTitle && !matchClient && !matchPhone && !matchUser && !matchProducts) {
          return false;
        }
      }

      // Period filter
      if (exclusionPeriod !== "todos") {
        const d = new Date(rec.deletedAt);
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        if (exclusionPeriod === "hoje") {
          if (d.getTime() < startOfDay) return false;
        } else if (exclusionPeriod === "ontem") {
          const startOfYesterday = startOfDay - 24 * 60 * 60 * 1000;
          if (d.getTime() < startOfYesterday || d.getTime() >= startOfDay) return false;
        } else if (exclusionPeriod === "7dias") {
          const startOf7Days = startOfDay - 7 * 24 * 60 * 60 * 1000;
          if (d.getTime() < startOf7Days) return false;
        } else if (exclusionPeriod === "mes") {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          if (d.getTime() < startOfMonth) return false;
        } else if (exclusionPeriod === "custom") {
          if (exclusionCustomStart) {
            const start = new Date(exclusionCustomStart + "T00:00:00").getTime();
            if (d.getTime() < start) return false;
          }
          if (exclusionCustomEnd) {
            const end = new Date(exclusionCustomEnd + "T23:59:59").getTime();
            if (d.getTime() > end) return false;
          }
        }
      }

      return true;
    });
  }, [deletionRecords, exclusionFilterUser, exclusionFilterType, exclusionSearch, exclusionPeriod, exclusionCustomStart, exclusionCustomEnd]);

  // ==========================================
  // INDIVIDUAL ATTENDANT DETAILED REPORT
  // ==========================================
  const attendantDetailedData = useMemo(() => {
    if (!selectedAttendant) return null;

    // Determine target date range based on period mode
    let targetStartMs = 0;
    let targetEndMs = Number.MAX_SAFE_INTEGER;
    let periodDescription = "";

    const now = new Date();
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (attendantPeriodMode === "hoje") {
      targetStartMs = todayZero;
      targetEndMs = todayZero + 24 * 60 * 60 * 1000 - 1;
      periodDescription = `Hoje (${now.toLocaleDateString("pt-BR")})`;
    } else if (attendantPeriodMode === "ontem") {
      targetStartMs = todayZero - 24 * 60 * 60 * 1000;
      targetEndMs = todayZero - 1;
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      periodDescription = `Ontem (${yesterday.toLocaleDateString("pt-BR")})`;
    } else if (attendantPeriodMode === "mes_atual") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      targetStartMs = start;
      targetEndMs = end;
      periodDescription = `Mês Atual (${now.toLocaleString("pt-BR", { month: "long", year: "numeric" })})`;
    } else if (attendantPeriodMode === "mes_anterior") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
      targetStartMs = start;
      targetEndMs = end;
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      periodDescription = `Mês Anterior (${prevDate.toLocaleString("pt-BR", { month: "long", year: "numeric" })})`;
    } else if (attendantPeriodMode === "dia_especifico") {
      if (attendantSpecificDate) {
        const start = new Date(attendantSpecificDate + "T00:00:00").getTime();
        const end = new Date(attendantSpecificDate + "T23:59:59").getTime();
        targetStartMs = start;
        targetEndMs = end;
        periodDescription = `Dia ${new Date(attendantSpecificDate + "T12:00:00").toLocaleDateString("pt-BR")}`;
      }
    } else if (attendantPeriodMode === "mes_especifico") {
      if (attendantSpecificMonth) {
        const [y, m] = attendantSpecificMonth.split("-").map(Number);
        const start = new Date(y, m - 1, 1).getTime();
        const end = new Date(y, m, 0, 23, 59, 59, 999).getTime();
        targetStartMs = start;
        targetEndMs = end;
        const dMonth = new Date(y, m - 1, 1);
        periodDescription = `Mês de ${dMonth.toLocaleString("pt-BR", { month: "long", year: "numeric" })}`;
      }
    } else if (attendantPeriodMode === "custom") {
      if (attendantStartDate) {
        targetStartMs = new Date(attendantStartDate + "T00:00:00").getTime();
      }
      if (attendantEndDate) {
        targetEndMs = new Date(attendantEndDate + "T23:59:59").getTime();
      }
      periodDescription = `Período de ${attendantStartDate || "Início"} até ${attendantEndDate || "Hoje"}`;
    } else {
      periodDescription = "Todo o Histórico";
    }

    // Filter activities
    interface ActivityItem {
      id: string;
      date: string;
      timestamp: number;
      type: "venda" | "recebimento" | "entrega" | "orcamento" | "exclusao";
      title: string;
      clientName: string;
      clientPhone?: string;
      amount: number;
      paidAmount: number;
      paymentMethod?: string;
      details: string;
      badgeColor: string;
    }

    const activities: ActivityItem[] = [];

    let periodSalesCount = 0;
    let periodTotalSales = 0;
    let periodCashCollected = 0;
    let periodPixCollected = 0;
    let periodCardCollected = 0;
    let periodDiscounts = 0;
    let periodDeliveriesCount = 0;
    let periodBudgetsCount = 0;
    let periodDeletionsCount = 0;

    // 1. Sales
    sales.forEach(s => {
      const sTime = new Date(s.date).getTime();
      const inPeriod = sTime >= targetStartMs && sTime <= targetEndMs;
      const byAtt = isSaleByAttendant(s, selectedAttendant);

      if (byAtt && !s.isBudget && inPeriod) {
        periodSalesCount++;
        periodTotalSales += Number(s.totalValue) || 0;
        periodDiscounts += Number(s.discount) || 0;

        activities.push({
          id: `sale_${s.id}`,
          date: s.date,
          timestamp: sTime,
          type: "venda",
          title: `Venda #${s.id.slice(0, 8).toUpperCase()}`,
          clientName: s.clientName || "Cliente Balcão",
          clientPhone: s.clientPhone,
          amount: Number(s.totalValue) || 0,
          paidAmount: Number(s.downPayment) || 0,
          paymentMethod: s.paymentMethod,
          details: s.items?.map(i => `${i.quantity}x ${i.description}`).join(", ") || "Itens diversos",
          badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
        });
      }

      // 2. Payments / Caixas recebidos por esse atendente
      if (s.payments && Array.isArray(s.payments)) {
        s.payments.forEach(p => {
          const pTime = new Date(p.date).getTime();
          if (pTime >= targetStartMs && pTime <= targetEndMs && isPaymentByAttendant(p, selectedAttendant)) {
            const amt = Number(p.amount) || 0;
            if (p.method === "dinheiro") periodCashCollected += amt;
            else if (p.method === "pix") periodPixCollected += amt;
            else if (p.method === "cartão") periodCardCollected += amt;

            // Only add separate activity if not already the initial down payment represented by the sale
            activities.push({
              id: `pay_${p.id}_${p.date}`,
              date: p.date,
              timestamp: pTime,
              type: "recebimento",
              title: `Recebimento de Caixa (${p.method.toUpperCase()})`,
              clientName: s.clientName || "Cliente Balcão",
              clientPhone: s.clientPhone,
              amount: amt,
              paidAmount: amt,
              paymentMethod: p.method,
              details: `Quitação/Recebimento referente à Venda #${s.id.slice(0, 8).toUpperCase()}`,
              badgeColor: "bg-blue-500/15 text-blue-400 border-blue-500/30"
            });
          }
        });
      } else if (byAtt && inPeriod) {
        // Fallback for downpayment
        const amt = Number(s.downPayment) || 0;
        if (amt > 0) {
          if (s.paymentMethod === "dinheiro") periodCashCollected += amt;
          else if (s.paymentMethod === "pix") periodPixCollected += amt;
          else if (s.paymentMethod === "cartão") periodCardCollected += amt;
        }
      }

      // 3. Deliveries
      if (s.materialEntregue && isDeliveryByAttendant(s, selectedAttendant)) {
        const delTime = s.deliveredAt ? new Date(s.deliveredAt).getTime() : sTime;
        if (delTime >= targetStartMs && delTime <= targetEndMs) {
          periodDeliveriesCount++;
          activities.push({
            id: `delv_${s.id}`,
            date: s.deliveredAt || s.date,
            timestamp: delTime,
            type: "entrega",
            title: `Entrega de Mercadoria Realizada`,
            clientName: s.clientName || "Cliente",
            clientPhone: s.clientPhone,
            amount: Number(s.totalValue) || 0,
            paidAmount: Number(s.downPayment) || 0,
            paymentMethod: s.paymentMethod,
            details: `Material conferido e entregue ao cliente (Venda #${s.id.slice(0, 8).toUpperCase()})`,
            badgeColor: "bg-purple-500/15 text-purple-400 border-purple-500/30"
          });
        }
      }
    });

    // 4. Budgets
    budgets.forEach(b => {
      const bTime = new Date(b.date).getTime();
      const inPeriod = bTime >= targetStartMs && bTime <= targetEndMs;
      if (isSaleByAttendant(b, selectedAttendant) && inPeriod) {
        periodBudgetsCount++;
        activities.push({
          id: `bud_${b.id}`,
          date: b.date,
          timestamp: bTime,
          type: "orcamento",
          title: `Orçamento Criado #${b.id.slice(0, 8).toUpperCase()}`,
          clientName: b.clientName || "Cliente",
          clientPhone: b.clientPhone,
          amount: Number(b.totalValue) || 0,
          paidAmount: 0,
          details: b.items?.map(i => `${i.quantity}x ${i.description}`).join(", ") || "Itens sob consulta",
          badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/30"
        });
      }
    });

    // 5. Deletions
    deletionRecords.forEach(del => {
      const delTime = new Date(del.deletedAt).getTime();
      const inPeriod = delTime >= targetStartMs && delTime <= targetEndMs;
      if (isDeletionByAttendant(del, selectedAttendant) && inPeriod) {
        periodDeletionsCount++;
        activities.push({
          id: `del_${del.id}`,
          date: del.deletedAt,
          timestamp: delTime,
          type: "exclusao",
          title: `EXCLUSÃO: ${del.itemTitle}`,
          clientName: del.clientName || "Registro",
          clientPhone: del.clientPhone,
          amount: Number(del.totalValue) || 0,
          paidAmount: Number(del.paidValue) || 0,
          paymentMethod: del.paymentMethod,
          details: `Item excluído definitivamente: ${del.details || del.productsSummary || "Sem detalhes"}`,
          badgeColor: "bg-red-500/20 text-red-400 border-red-500/40"
        });
      }
    });

    // Sort all activities reverse chronological
    activities.sort((a, b) => b.timestamp - a.timestamp);

    // Filter by action type
    const filteredActivities = activities.filter(act => {
      if (attendantActionFilter === "todas") return true;
      if (attendantActionFilter === "vendas") return act.type === "venda";
      if (attendantActionFilter === "recebimentos") return act.type === "recebimento";
      if (attendantActionFilter === "entregas") return act.type === "entrega";
      if (attendantActionFilter === "orcamentos") return act.type === "orcamento";
      if (attendantActionFilter === "exclusoes") return act.type === "exclusao";
      return true;
    });

    return {
      periodDescription,
      salesCount: periodSalesCount,
      totalSales: periodTotalSales,
      cashCollected: periodCashCollected,
      pixCollected: periodPixCollected,
      cardCollected: periodCardCollected,
      discounts: periodDiscounts,
      deliveriesCount: periodDeliveriesCount,
      budgetsCount: periodBudgetsCount,
      deletionsCount: periodDeletionsCount,
      activities: filteredActivities,
      allActivitiesCount: activities.length
    };
  }, [
    selectedAttendant,
    attendantPeriodMode,
    attendantSpecificDate,
    attendantSpecificMonth,
    attendantStartDate,
    attendantEndDate,
    attendantActionFilter,
    sales,
    budgets,
    deletionRecords
  ]);

  // Handle create attendant
  const handleCreateAttendant = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!newName.trim()) {
      setFormError("Informe o nome do atendente.");
      return;
    }
    if (!newUsername.trim()) {
      setFormError("Informe o login / usuário do atendente.");
      return;
    }
    if (!newPassword.trim() || newPassword.length < 4) {
      setFormError("A senha deve conter no mínimo 4 caracteres.");
      return;
    }

    setSavingUser(true);
    try {
      const cleanUsername = newUsername.trim().toLowerCase().replace(/^@/, "");
      const newAttendantObj: User = {
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: newName.trim(),
        username: cleanUsername,
        password: newPassword.trim(),
        owner_id: ownerId,
        role: "atendente",
        status: "ativo",
        status_assinatura: "ativo",
        is_admin: false,
        created_at: new Date().toISOString()
      };

      // Save locally
      const currentList = [...allUsers.filter(u => u.id !== newAttendantObj.id), newAttendantObj];
      localStorage.setItem("NUCLEO_USERS", JSON.stringify(currentList));

      // Save to Supabase
      if (isSupabaseConfigured()) {
        await dbSaveUser(newAttendantObj);
      }

      setAllUsers(currentList);
      setFormSuccess(`Atendente ${newAttendantObj.name} cadastrado com sucesso! 🎉`);
      setNewName("");
      setNewUsername("");
      setNewPassword("");
      setTimeout(() => {
        setActiveTab("atendentes");
        setFormSuccess(null);
      }, 1200);
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar atendente.");
    } finally {
      setSavingUser(false);
    }
  };

  // Export Exclusions to CSV
  const handleExportExclusionsCSV = () => {
    if (filteredExclusions.length === 0) return;

    const headers = [
      "Data e Hora",
      "Tipo de Arquivo",
      "Identificador / Titulo",
      "Cliente",
      "Telefone",
      "Valor Total (R$)",
      "Valor Pago / Sinal (R$)",
      "Forma Pagamento",
      "Quem Excluiu (Nome)",
      "Quem Excluiu (Usuario)",
      "Cargo",
      "Produtos / Conteudo",
      "Detalhes"
    ];

    const rows = filteredExclusions.map(rec => [
      `"${formatDateTime(rec.deletedAt)}"`,
      `"${rec.itemType.toUpperCase()}"`,
      `"${rec.itemTitle.replace(/"/g, '""')}"`,
      `"${(rec.clientName || "").replace(/"/g, '""')}"`,
      `"${(rec.clientPhone || "").replace(/"/g, '""')}"`,
      `"${(Number(rec.totalValue) || 0).toFixed(2)}"`,
      `"${(Number(rec.paidValue) || 0).toFixed(2)}"`,
      `"${rec.paymentMethod || ""}"`,
      `"${rec.deletedByName.replace(/"/g, '""')}"`,
      `"${rec.deletedByUsername.replace(/"/g, '""')}"`,
      `"${rec.deletedByRole}"`,
      `"${(rec.productsSummary || "").replace(/"/g, '""')}"`,
      `"${(rec.details || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_exclusoes_auditoria_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Exclusions Report
  const handlePrintExclusions = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const companyName = company.tradingName || "Sistema de Vendas";
    const totalCount = filteredExclusions.length;
    const totalVal = filteredExclusions.reduce((acc, c) => acc + (Number(c.totalValue) || 0), 0);

    const rowsHtml = filteredExclusions.map(rec => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">${formatDateTime(rec.deletedAt)}</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; text-transform: uppercase; font-size: 11px;">${rec.itemType}</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px;"><strong>${rec.itemTitle}</strong><br><span style="color: #666; font-size: 11px;">${rec.productsSummary || "-"}</span></td>
        <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px;">${rec.clientName || "-"}<br><span style="color: #666; font-size: 10px;">${rec.clientPhone || ""}</span></td>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; font-size: 12px; text-align: right;">${formatMoney(rec.totalValue || 0)}</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px; text-align: right;">${formatMoney(rec.paidValue || 0)} (${rec.paymentMethod || "-"})</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;"><strong>${rec.deletedByName}</strong> (@${rec.deletedByUsername})<br><span style="text-transform: uppercase; font-size: 10px; color: #777;">${rec.deletedByRole}</span></td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório de Exclusões & Auditoria - ${companyName}</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; padding: 10px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 15px; }
            .title { font-size: 18px; font-weight: 900; margin: 0; text-transform: uppercase; }
            .subtitle { font-size: 12px; color: #555; margin-top: 4px; }
            .badge-box { display: flex; justify-content: space-between; background: #f4f4f5; border: 1px solid #ccc; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
            th { background: #27272a; color: white; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
            .footer { margin-top: 25px; padding-top: 15px; border-top: 1px solid #ccc; font-size: 10px; color: #666; display: flex; justify-content: space-between; }
            .signatures { margin-top: 35px; display: flex; justify-content: space-around; text-align: center; font-size: 11px; }
            .sig-line { width: 200px; border-top: 1px solid #333; padding-top: 4px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">${companyName}</h1>
            <div class="subtitle">RELATÓRIO DE AUDITORIA DE EXCLUSÕES & ARQUIVOS APAGADOS</div>
            <div style="font-size: 11px; margin-top: 5px;">Emitido em: ${new Date().toLocaleString("pt-BR")} | Operador Logado: ${currentUser.name} (@${currentUser.username})</div>
          </div>

          <div class="badge-box">
            <div><strong>TOTAL DE ARQUIVOS APAGADOS:</strong> <span style="font-size: 14px; color: #b91c1c;">${totalCount} registros</span></div>
            <div><strong>VALOR TOTAL DOS ITENS APAGADOS:</strong> <span style="font-size: 14px; font-weight: bold;">${formatMoney(totalVal)}</span></div>
            <div><strong>SITUAÇÃO:</strong> AUDITORIA ANTI-FRAUDE</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Tipo</th>
                <th>Item / Descrição</th>
                <th>Cliente</th>
                <th style="text-align: right;">Total</th>
                <th style="text-align: right;">Sinal / Método</th>
                <th>Excluído Por</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="7" style="text-align:center; padding: 20px;">Nenhuma exclusão encontrada para os filtros selecionados.</td></tr>'}
            </tbody>
          </table>

          <div class="signatures">
            <div>
              <div class="sig-line">Responsável pela Auditoria</div>
              <strong>${currentUser.name}</strong>
            </div>
            <div>
              <div class="sig-line">Diretoria / Administração</div>
              <strong>${companyName}</strong>
            </div>
          </div>

          <div class="footer">
            <span>Documento oficial para controle interno anti-fraude</span>
            <span>Página 1 de 1</span>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Print Attendant Activity Report
  const handlePrintAttendantReport = () => {
    if (!selectedAttendant || !attendantDetailedData) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const companyName = company.tradingName || "Sistema de Vendas";
    const d = attendantDetailedData;

    const activitiesHtml = d.activities.map(act => `
      <tr>
        <td style="padding: 6px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">${formatDateTime(act.date)}</td>
        <td style="padding: 6px; border: 1px solid #ddd; font-weight: bold; text-transform: uppercase; font-size: 10px;">${act.type}</td>
        <td style="padding: 6px; border: 1px solid #ddd; font-size: 11px;"><strong>${act.title}</strong><br><span style="color: #666; font-size: 10px;">${act.details}</span></td>
        <td style="padding: 6px; border: 1px solid #ddd; font-size: 11px;">${act.clientName}<br><span style="color: #666; font-size: 9px;">${act.clientPhone || ""}</span></td>
        <td style="padding: 6px; border: 1px solid #ddd; font-weight: bold; font-size: 11px; text-align: right;">${act.amount > 0 ? formatMoney(act.amount) : "-"}</td>
        <td style="padding: 6px; border: 1px solid #ddd; font-size: 11px; text-align: right;">${act.paidAmount > 0 ? formatMoney(act.paidAmount) : "-"} (${act.paymentMethod || "-"})</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório Completo de Atividades - ${selectedAttendant.name}</title>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; padding: 10px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 12px; }
            .title { font-size: 18px; font-weight: 900; margin: 0; text-transform: uppercase; }
            .subtitle { font-size: 12px; color: #555; margin-top: 4px; }
            .attendant-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; }
            .grid-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 15px; }
            .metric-box { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center; }
            .metric-val { font-size: 14px; font-weight: bold; color: #0f172a; margin-top: 2px; }
            .metric-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
            th { background: #0f172a; color: white; padding: 6px; text-align: left; font-size: 10px; text-transform: uppercase; }
            .signatures { margin-top: 40px; display: flex; justify-content: space-around; text-align: center; font-size: 11px; }
            .sig-line { width: 200px; border-top: 1px solid #333; padding-top: 4px; }
            .footer { margin-top: 20px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">${companyName}</h1>
            <div class="subtitle">RELATÓRIO DE PRESTAÇÃO DE CONTAS & AUDITORIA DO ATENDENTE</div>
            <div style="font-size: 11px; margin-top: 4px;"><strong>Período:</strong> ${d.periodDescription} &nbsp;|&nbsp; <strong>Emissão:</strong> ${new Date().toLocaleString("pt-BR")}</div>
          </div>

          <div class="attendant-card">
            <div>
              <strong>Atendente:</strong> ${selectedAttendant.name} &nbsp;(@${selectedAttendant.username})<br>
              <span style="font-size: 11px; color: #64748b;">Função: Atendente / Operador de Balcão</span>
            </div>
            <div style="text-align: right;">
              <strong>Empresa:</strong> ${companyName}<br>
              <span style="font-size: 11px; color: #64748b;">Administrador: ${currentUser.name}</span>
            </div>
          </div>

          <div class="grid-metrics">
            <div class="metric-box">
              <div class="metric-label">Vendas Realizadas</div>
              <div class="metric-val">${d.salesCount} (${formatMoney(d.totalSales)})</div>
            </div>
            <div class="metric-box" style="border-color: #10b981;">
              <div class="metric-label" style="color: #047857;">Dinheiro em Espécie (Gaveta)</div>
              <div class="metric-val" style="color: #047857;">${formatMoney(d.cashCollected)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Recebido via Pix</div>
              <div class="metric-val">${formatMoney(d.pixCollected)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Recebido em Cartão</div>
              <div class="metric-val">${formatMoney(d.cardCollected)}</div>
            </div>
          </div>

          <div class="grid-metrics" style="grid-template-columns: repeat(4, 1fr);">
            <div class="metric-box">
              <div class="metric-label">Descontos Concedidos</div>
              <div class="metric-val">${formatMoney(d.discounts)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Entregas de Mercadoria</div>
              <div class="metric-val">${d.deliveriesCount}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Orçamentos Emitidos</div>
              <div class="metric-val">${d.budgetsCount}</div>
            </div>
            <div class="metric-box" style="border-color: ${d.deletionsCount > 0 ? '#ef4444' : '#cbd5e1'};">
              <div class="metric-label" style="color: ${d.deletionsCount > 0 ? '#b91c1c' : '#64748b'};">Arquivos / Registros Apagados</div>
              <div class="metric-val" style="color: ${d.deletionsCount > 0 ? '#b91c1c' : '#0f172a'};">${d.deletionsCount}</div>
            </div>
          </div>

          <h3 style="font-size: 13px; text-transform: uppercase; margin-top: 15px; margin-bottom: 6px;">Histórico Cronológico de Atividades (${d.activities.length} ações)</h3>
          <table>
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Ação</th>
                <th>Título / Detalhes</th>
                <th>Cliente</th>
                <th style="text-align: right;">Total</th>
                <th style="text-align: right;">Valor Pago / Método</th>
              </tr>
            </thead>
            <tbody>
              ${activitiesHtml || '<tr><td colspan="6" style="text-align:center; padding: 15px;">Nenhuma atividade registrada no período selecionado.</td></tr>'}
            </tbody>
          </table>

          <div class="signatures">
            <div>
              <div class="sig-line">${selectedAttendant.name}</div>
              <strong>Atendente / Operador</strong>
            </div>
            <div>
              <div class="sig-line">${currentUser.name}</div>
              <strong>Administrador Responsável</strong>
            </div>
          </div>

          <div class="footer">
            <span>Comprovante de prestação de contas diária e auditoria de caixa</span>
            <span>${companyName} &bull; Gerado eletronicamente</span>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Export Attendant Activities to CSV
  const handleExportAttendantCSV = () => {
    if (!selectedAttendant || !attendantDetailedData || attendantDetailedData.activities.length === 0) return;

    const headers = [
      "Data e Hora",
      "Tipo de Acao",
      "Titulo",
      "Cliente",
      "Telefone",
      "Valor Total (R$)",
      "Valor Pago (R$)",
      "Forma Pagamento",
      "Detalhes",
      "Atendente Nome",
      "Atendente Login"
    ];

    const rows = attendantDetailedData.activities.map(act => [
      `"${formatDateTime(act.date)}"`,
      `"${act.type.toUpperCase()}"`,
      `"${act.title.replace(/"/g, '""')}"`,
      `"${act.clientName.replace(/"/g, '""')}"`,
      `"${(act.clientPhone || "").replace(/"/g, '""')}"`,
      `"${(Number(act.amount) || 0).toFixed(2)}"`,
      `"${(Number(act.paidAmount) || 0).toFixed(2)}"`,
      `"${act.paymentMethod || ""}"`,
      `"${act.details.replace(/"/g, '""')}"`,
      `"${selectedAttendant.name}"`,
      `"${selectedAttendant.username}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_atendente_${selectedAttendant.username}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Banner & Header */}
      <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-gradient-to-br from-cyan-600 to-blue-700 rounded-xl text-white shadow-md shadow-cyan-600/30">
                <UserCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  Gestão & Auditoria de Atendentes
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 lowercase">
                    painel do administrador
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Supervisão completa de atendentes cadastrados, rastreamento de arquivos excluídos e histórico detalhado por dia e mês.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Pills */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 flex items-center gap-2.5">
              <Users className="h-4 w-4 text-cyan-400" />
              <div>
                <span className="text-[10px] text-slate-400 block leading-tight font-semibold uppercase">Atendentes</span>
                <span className="text-sm font-black text-slate-200">{attendantsList.length}</span>
              </div>
            </div>

            {/* Prominent Deletions Counter */}
            <button
              onClick={() => {
                setSelectedAttendant(null);
                setActiveTab("exclusoes");
              }}
              className={`border rounded-xl px-3.5 py-2 flex items-center gap-2.5 transition-all cursor-pointer ${
                activeTab === "exclusoes"
                  ? "bg-red-950/40 border-red-500/50 text-red-300 shadow-lg shadow-red-950/50"
                  : "bg-slate-950/80 border-red-900/40 hover:border-red-500/40 text-red-400"
              }`}
            >
              <div className="relative">
                <Trash2 className="h-4 w-4 text-red-400" />
                {totalDeletedFilesCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                )}
              </div>
              <div className="text-left">
                <span className="text-[10px] text-red-300/80 block leading-tight font-semibold uppercase">Arquivos Apagados</span>
                <span className="text-sm font-black text-red-400">{totalDeletedFilesCount} apagados</span>
              </div>
            </button>
          </div>
        </div>

        {/* Tab Buttons Navigation */}
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-800/80 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setSelectedAttendant(null);
              setActiveTab("atendentes");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === "atendentes" && !selectedAttendant
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Todos os Atendentes ({attendantsList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedAttendant(null);
              setActiveTab("exclusoes");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === "exclusoes"
                ? "bg-red-600 text-white shadow-md shadow-red-600/30"
                : "bg-slate-800/60 text-slate-400 hover:text-red-400 hover:bg-slate-800"
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
            <span>Relatório de Exclusões ({totalDeletedFilesCount} apagados)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedAttendant(null);
              setActiveTab("novo");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === "novo"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "bg-slate-800/60 text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
            }`}
          >
            <UserPlus className="h-3.5 w-3.5 text-emerald-400" />
            <span>Cadastrar Novo Atendente</span>
          </button>

          {selectedAttendant && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
              <span className="px-3 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-black flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5" />
                Relatório de: {selectedAttendant.name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedAttendant(null)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                title="Fechar relatório individual"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* VIEW 1: INDIVIDUAL ATTENDANT COMPLETE REPORT */}
      {/* ========================================================= */}
      {selectedAttendant && attendantDetailedData && (
        <div className="space-y-5 animate-fade-in">
          {/* Attendant Detail Header Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => setSelectedAttendant(null)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
                  title="Voltar para todos os atendentes"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-slate-100">{selectedAttendant.name}</h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      @{selectedAttendant.username}
                    </span>
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      👤 Atendente Ativo
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Relatório completo de atividades do dia, mês ou data personalizada.
                  </p>
                </div>
              </div>

              {/* Action Buttons: Print and Export */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintAttendantReport}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:border-slate-600"
                >
                  <Printer className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Imprimir Prestação de Contas</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportAttendantCSV}
                  className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Exportar CSV</span>
                </button>
              </div>
            </div>

            {/* Period Filter Bar */}
            <div className="mt-5 pt-4 border-t border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-cyan-400" /> Período:
                  </span>
                  
                  <button
                    type="button"
                    onClick={() => setAttendantPeriodMode("hoje")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      attendantPeriodMode === "hoje"
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Hoje
                  </button>

                  <button
                    type="button"
                    onClick={() => setAttendantPeriodMode("ontem")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      attendantPeriodMode === "ontem"
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Ontem
                  </button>

                  <button
                    type="button"
                    onClick={() => setAttendantPeriodMode("mes_atual")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      attendantPeriodMode === "mes_atual"
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Este Mês
                  </button>

                  <button
                    type="button"
                    onClick={() => setAttendantPeriodMode("mes_anterior")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      attendantPeriodMode === "mes_anterior"
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Mês Anterior
                  </button>

                  <button
                    type="button"
                    onClick={() => setAttendantPeriodMode("dia_especifico")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      attendantPeriodMode === "dia_especifico"
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Dia Específico
                  </button>

                  <button
                    type="button"
                    onClick={() => setAttendantPeriodMode("mes_especifico")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      attendantPeriodMode === "mes_especifico"
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Mês Específico
                  </button>

                  <button
                    type="button"
                    onClick={() => setAttendantPeriodMode("custom")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      attendantPeriodMode === "custom"
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Personalizado
                  </button>

                  <button
                    type="button"
                    onClick={() => setAttendantPeriodMode("todos")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      attendantPeriodMode === "todos"
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Todo o Histórico
                  </button>
                </div>

                {/* Specific selectors inline */}
                {attendantPeriodMode === "dia_especifico" && (
                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Escolher Dia:</span>
                    <input
                      type="date"
                      value={attendantSpecificDate}
                      onChange={(e) => setAttendantSpecificDate(e.target.value)}
                      className="bg-transparent text-xs text-cyan-300 font-bold focus:outline-none cursor-pointer"
                    />
                  </div>
                )}

                {attendantPeriodMode === "mes_especifico" && (
                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Escolher Mês:</span>
                    <input
                      type="month"
                      value={attendantSpecificMonth}
                      onChange={(e) => setAttendantSpecificMonth(e.target.value)}
                      className="bg-transparent text-xs text-cyan-300 font-bold focus:outline-none cursor-pointer"
                    />
                  </div>
                )}

                {attendantPeriodMode === "custom" && (
                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">De:</span>
                    <input
                      type="date"
                      value={attendantStartDate}
                      onChange={(e) => setAttendantStartDate(e.target.value)}
                      className="bg-transparent text-xs text-cyan-300 font-bold focus:outline-none cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Até:</span>
                    <input
                      type="date"
                      value={attendantEndDate}
                      onChange={(e) => setAttendantEndDate(e.target.value)}
                      className="bg-transparent text-xs text-cyan-300 font-bold focus:outline-none cursor-pointer"
                    />
                  </div>
                )}
              </div>

              <div className="mt-2.5 text-xs text-cyan-400 font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Exibindo: <span className="text-slate-200">{attendantDetailedData.periodDescription}</span>
              </div>
            </div>
          </div>

          {/* Attendant Executive Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {/* Vendas */}
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Vendas</span>
              <div className="text-base font-black text-slate-100 mt-1">{attendantDetailedData.salesCount}</div>
              <span className="text-[10px] text-emerald-400 font-semibold">{formatMoney(attendantDetailedData.totalSales)}</span>
            </div>

            {/* Dinheiro Vivo na Gaveta */}
            <div className="bg-slate-900/90 border border-emerald-600/40 p-3.5 rounded-xl shadow-sm bg-emerald-950/10">
              <span className="text-[10px] font-bold text-emerald-400 uppercase block tracking-wider flex items-center gap-1">
                <Banknote className="h-3 w-3" /> Em Dinheiro (Gaveta)
              </span>
              <div className="text-base font-black text-emerald-300 mt-1">{formatMoney(attendantDetailedData.cashCollected)}</div>
              <span className="text-[9px] text-emerald-500/80">Conferência de gaveta</span>
            </div>

            {/* Pix */}
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl shadow-sm">
              <span className="text-[10px] font-bold text-cyan-400 uppercase block tracking-wider flex items-center gap-1">
                <QrCode className="h-3 w-3" /> Recebido Pix
              </span>
              <div className="text-base font-black text-cyan-300 mt-1">{formatMoney(attendantDetailedData.pixCollected)}</div>
              <span className="text-[9px] text-slate-500">Saldo bancário</span>
            </div>

            {/* Cartão */}
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl shadow-sm">
              <span className="text-[10px] font-bold text-blue-400 uppercase block tracking-wider flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> Recebido Cartão
              </span>
              <div className="text-base font-black text-blue-300 mt-1">{formatMoney(attendantDetailedData.cardCollected)}</div>
              <span className="text-[9px] text-slate-500">Débito & Crédito</span>
            </div>

            {/* Descontos */}
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider flex items-center gap-1">
                <Percent className="h-3 w-3 text-amber-400" /> Descontos
              </span>
              <div className="text-base font-black text-amber-300 mt-1">{formatMoney(attendantDetailedData.discounts)}</div>
              <span className="text-[9px] text-slate-500">Concedidos</span>
            </div>

            {/* Entregas */}
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider flex items-center gap-1">
                <Package className="h-3 w-3 text-purple-400" /> Entregas Feitas
              </span>
              <div className="text-base font-black text-purple-300 mt-1">{attendantDetailedData.deliveriesCount}</div>
              <span className="text-[9px] text-slate-500">Material entregue</span>
            </div>

            {/* Orçamentos */}
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider flex items-center gap-1">
                <FileText className="h-3 w-3 text-amber-400" /> Orçamentos
              </span>
              <div className="text-base font-black text-amber-300 mt-1">{attendantDetailedData.budgetsCount}</div>
              <span className="text-[9px] text-slate-500">Criados no período</span>
            </div>

            {/* Arquivos Apagados */}
            <div className={`p-3.5 rounded-xl shadow-sm border ${
              attendantDetailedData.deletionsCount > 0
                ? "bg-red-950/20 border-red-500/50 text-red-300"
                : "bg-slate-900/90 border-slate-800 text-slate-400"
            }`}>
              <span className="text-[10px] font-bold uppercase block tracking-wider flex items-center gap-1">
                <Trash2 className="h-3 w-3 text-red-400" /> Arquivos Apagados
              </span>
              <div className={`text-base font-black mt-1 ${attendantDetailedData.deletionsCount > 0 ? "text-red-400" : "text-slate-300"}`}>
                {attendantDetailedData.deletionsCount}
              </div>
              <span className="text-[9px] text-red-400/80">Exclusões registradas</span>
            </div>
          </div>

          {/* Detailed Activity Timeline Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Histórico de Tudo o que Fez no Programa ({attendantDetailedData.activities.length})
                </h3>
              </div>

              {/* Action Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAttendantActionFilter("todas")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    attendantActionFilter === "todas" ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setAttendantActionFilter("vendas")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    attendantActionFilter === "vendas" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  Vendas
                </button>
                <button
                  type="button"
                  onClick={() => setAttendantActionFilter("recebimentos")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    attendantActionFilter === "recebimentos" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  Recebimentos
                </button>
                <button
                  type="button"
                  onClick={() => setAttendantActionFilter("entregas")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    attendantActionFilter === "entregas" ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  Entregas
                </button>
                <button
                  type="button"
                  onClick={() => setAttendantActionFilter("orcamentos")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    attendantActionFilter === "orcamentos" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  Orçamentos
                </button>
                <button
                  type="button"
                  onClick={() => setAttendantActionFilter("exclusoes")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    attendantActionFilter === "exclusoes" ? "bg-red-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  Exclusões
                </button>
              </div>
            </div>

            {attendantDetailedData.activities.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-slate-600 opacity-60" />
                <p className="text-sm font-semibold">Nenhuma atividade encontrada para o filtro e período selecionados.</p>
                <p className="text-xs text-slate-600 mt-1">Tente alternar para "Todo o Histórico" ou alterar o filtro de ação.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Horário & Data</th>
                      <th className="py-3 px-4">Tipo de Ação</th>
                      <th className="py-3 px-4">Operação / Detalhes</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4 text-right">Valor Total</th>
                      <th className="py-3 px-4 text-right">Valor Pago / Método</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {attendantDetailedData.activities.map((act) => (
                      <tr key={act.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                          {formatDateTime(act.date)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase border ${act.badgeColor}`}>
                            {act.type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-200">{act.title}</div>
                          <div className="text-slate-400 text-[11px] mt-0.5 max-w-md line-clamp-2">{act.details}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-200">{act.clientName}</div>
                          {act.clientPhone && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                              <Phone className="h-2.5 w-2.5" /> {act.clientPhone}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-100 whitespace-nowrap">
                          {act.amount > 0 ? formatMoney(act.amount) : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                          {act.paidAmount > 0 ? (
                            <div>
                              <span className="font-bold text-emerald-400">{formatMoney(act.paidAmount)}</span>
                              <span className="text-[10px] text-slate-500 uppercase ml-1 block">{act.paymentMethod || "caixa"}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 2: ALL REGISTERED ATTENDANTS LIST */}
      {/* ========================================================= */}
      {activeTab === "atendentes" && !selectedAttendant && (
        <div className="space-y-5 animate-fade-in">
          {/* Search bar & Refresh */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="relative w-full sm:w-96">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar atendente por nome ou login..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={loadUsers}
                disabled={loadingUsers}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? "animate-spin text-cyan-400" : ""}`} />
                <span>Atualizar</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("novo")}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-cyan-600/20"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Novo Atendente</span>
              </button>
            </div>
          </div>

          {/* Attendants Grid */}
          {attendantsList.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <Users className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-300">Nenhum atendente cadastrado ainda</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Cadastre seus atendentes para controlar acessos, registrar quem efetuou cada venda ou entrega e auditar exclusões.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("novo")}
                className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-md shadow-cyan-600/30"
              >
                <UserPlus className="h-4 w-4" />
                <span>Cadastrar Primeiro Atendente</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {attendantsList
                .filter(att => {
                  if (!searchTerm.trim()) return true;
                  const q = searchTerm.toLowerCase();
                  return att.name.toLowerCase().includes(q) || att.username.toLowerCase().includes(q);
                })
                .map((att) => {
                  const stats = attendantStatsMap.get(att.id) || {
                    salesCount: 0,
                    totalSalesValue: 0,
                    cashCollected: 0,
                    pixCollected: 0,
                    cardCollected: 0,
                    deliveriesCount: 0,
                    deletionsCount: 0
                  };

                  return (
                    <div
                      key={att.id}
                      className="bg-slate-900 border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-5 transition-all shadow-md flex flex-col justify-between"
                    >
                      <div>
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center text-white font-black text-base shadow-md shadow-cyan-600/20">
                              {att.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="text-sm font-black text-slate-100">{att.name}</h3>
                              <span className="text-xs font-mono text-cyan-400">@{att.username}</span>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                Cadastro: {formatDateOnly(att.created_at)}
                              </div>
                            </div>
                          </div>

                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Ativo
                          </span>
                        </div>

                        {/* Attendant Metrics Snapshot */}
                        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-800/80">
                          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-850">
                            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Vendas</span>
                            <span className="text-xs font-black text-slate-200">{stats.salesCount} vendas</span>
                            <span className="text-[10px] text-emerald-400 font-bold block">{formatMoney(stats.totalSalesValue)}</span>
                          </div>

                          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-850">
                            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Dinheiro Vivo</span>
                            <span className="text-xs font-black text-emerald-400">{formatMoney(stats.cashCollected)}</span>
                            <span className="text-[9px] text-slate-500 block">Gaveta operada</span>
                          </div>

                          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-850">
                            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Entregas Feitas</span>
                            <span className="text-xs font-black text-purple-300">{stats.deliveriesCount} materiais</span>
                            <span className="text-[9px] text-slate-500 block">Baixas efetuadas</span>
                          </div>

                          <div className={`p-2.5 rounded-xl border ${
                            stats.deletionsCount > 0
                              ? "bg-red-950/20 border-red-500/40 text-red-300"
                              : "bg-slate-950/60 border-slate-850 text-slate-400"
                          }`}>
                            <span className="text-[10px] uppercase font-semibold block flex items-center gap-1">
                              <Trash2 className="h-2.5 w-2.5 text-red-400" /> Exclusões
                            </span>
                            <span className={`text-xs font-black ${stats.deletionsCount > 0 ? "text-red-400" : "text-slate-300"}`}>
                              {stats.deletionsCount} apagados
                            </span>
                            <span className="text-[9px] text-slate-500 block">Arquivos deletados</span>
                          </div>
                        </div>
                      </div>

                      {/* Main Action: Open Complete Report */}
                      <div className="mt-5 pt-3 border-t border-slate-800 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAttendant(att);
                            setAttendantPeriodMode("hoje");
                          }}
                          className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-cyan-600/20 cursor-pointer transition-all"
                        >
                          <Clock className="h-4 w-4" />
                          <span>Ver Relatório Completo</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 3: RELATÓRIO DE EXCLUSÕES & ARQUIVOS APAGADOS */}
      {/* ========================================================= */}
      {activeTab === "exclusoes" && (
        <div className="space-y-5 animate-fade-in">
          {/* Big Banner Alert: Total de Arquivos Apagados */}
          <div className="bg-gradient-to-r from-red-950/60 via-slate-900 to-red-950/40 border border-red-500/40 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-red-600/20 text-red-400 rounded-lg border border-red-500/30">
                    <ShieldAlert className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-black text-red-400 uppercase tracking-widest">
                    Auditoria de Segurança & Anti-Fraude
                  </span>
                </div>
                <h2 className="text-2xl font-black text-slate-100 uppercase tracking-wide">
                  Relatório de Arquivos e Vendas Apagados
                </h2>
                <p className="text-xs text-slate-300 max-w-2xl">
                  Registro detalhado e indelével de cada arquivo, venda, orçamento ou lançamento excluído no sistema.
                  Monitore quem apagou, data, horário exato, valores e clientes envolvidos.
                </p>
              </div>

              {/* Big Counter */}
              <div className="bg-slate-950/90 border border-red-500/40 rounded-2xl p-4 text-center min-w-[220px] shadow-lg">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total de Arquivos Apagados</span>
                <div className="text-3xl font-black text-red-500 mt-1">
                  {totalDeletedFilesCount}
                </div>
                <div className="text-xs font-semibold text-slate-300 mt-0.5">
                  Valor Total: <strong className="text-red-400">{formatMoney(totalDeletedValue)}</strong>
                </div>
              </div>
            </div>

            {/* Quick Actions for Exclusions: Print and Export */}
            <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-4 border-t border-red-500/20">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintExclusions}
                  disabled={filteredExclusions.length === 0}
                  className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Printer className="h-4 w-4 text-cyan-400" />
                  <span>Imprimir Relatório de Exclusões</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportExclusionsCSV}
                  disabled={filteredExclusions.length === 0}
                  className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                  <span>Exportar Planilha (CSV)</span>
                </button>
              </div>

              {currentUser.is_admin && onClearDeletions && totalDeletedFilesCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Atenção: Deseja realmente limpar o histórico arquivado de exclusões? Esta ação é irreversível.")) {
                      onClearDeletions();
                    }
                  }}
                  className="text-[11px] text-slate-500 hover:text-red-400 underline transition-colors cursor-pointer"
                >
                  Limpar Histórico Arquivado
                </button>
              )}
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Filter by Operator */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Filtrar por Quem Excluiu:
                </label>
                <select
                  value={exclusionFilterUser}
                  onChange={(e) => setExclusionFilterUser(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="todos">Todos os Usuários / Atendentes</option>
                  {attendantsList.map(att => (
                    <option key={att.id} value={att.id}>
                      👤 {att.name} (@{att.username})
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter by Item Type */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Tipo de Registro:
                </label>
                <select
                  value={exclusionFilterType}
                  onChange={(e) => setExclusionFilterType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="todos">Todos os Tipos</option>
                  <option value="venda">Vendas / Pedidos</option>
                  <option value="orcamento">Orçamentos</option>
                  <option value="despesa">Despesas / Gastos</option>
                </select>
              </div>

              {/* Filter by Period */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Período da Exclusão:
                </label>
                <select
                  value={exclusionPeriod}
                  onChange={(e) => setExclusionPeriod(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="todos">Todo o Período</option>
                  <option value="hoje">Hoje</option>
                  <option value="ontem">Ontem</option>
                  <option value="7dias">Últimos 7 Dias</option>
                  <option value="mes">Este Mês</option>
                  <option value="custom">Datas Personalizadas...</option>
                </select>
              </div>

              {/* Search text */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Busca Textual:
                </label>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Cliente, produto, ID..."
                    value={exclusionSearch}
                    onChange={(e) => setExclusionSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            {/* Custom Date Range if selected */}
            {exclusionPeriod === "custom" && (
              <div className="flex items-center gap-3 pt-2 border-t border-slate-800/80">
                <span className="text-xs text-slate-400 font-semibold">Data Inicial:</span>
                <input
                  type="date"
                  value={exclusionCustomStart}
                  onChange={(e) => setExclusionCustomStart(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-cyan-300 font-bold"
                />
                <span className="text-xs text-slate-400 font-semibold">Data Final:</span>
                <input
                  type="date"
                  value={exclusionCustomEnd}
                  onChange={(e) => setExclusionCustomEnd(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-cyan-300 font-bold"
                />
              </div>
            )}
          </div>

          {/* Exclusions Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-400" />
                Registros Apagados Encontrados ({filteredExclusions.length})
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Soma filtrada: <strong className="text-red-400">{formatMoney(filteredExclusions.reduce((a, c) => a + (Number(c.totalValue) || 0), 0))}</strong>
              </span>
            </div>

            {filteredExclusions.length === 0 ? (
              <div className="py-20 text-center text-slate-500">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3 opacity-60" />
                <h4 className="text-sm font-bold text-slate-300">Nenhuma exclusão registrada nos filtros atuais!</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Quando uma venda, orçamento ou despesa for apagada por qualquer operador, ela ficará arquivada aqui automaticamente.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Horário & Data da Exclusão</th>
                      <th className="py-3 px-4">Quem Excluiu</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Arquivo / Identificador</th>
                      <th className="py-3 px-4">Cliente & Contato</th>
                      <th className="py-3 px-4 text-right">Valor Total</th>
                      <th className="py-3 px-4 text-right">Sinal / Pagamento</th>
                      <th className="py-3 px-4">Produtos / Conteúdo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {filteredExclusions.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3 px-4 font-mono text-red-300/90 whitespace-nowrap">
                          <div className="font-bold flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-red-400" />
                            {formatDateTime(rec.deletedAt)}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-200">{rec.deletedByName}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] font-mono text-cyan-400">@{rec.deletedByUsername}</span>
                            <span className={`text-[8px] font-black uppercase px-1 py-0.2 rounded border ${
                              rec.deletedByRole === "atendente"
                                ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                            }`}>
                              {rec.deletedByRole}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                            rec.itemType === "venda"
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : rec.itemType === "orcamento"
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              : "bg-purple-500/15 text-purple-400 border-purple-500/30"
                          }`}>
                            {rec.itemType}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-100">{rec.itemTitle}</div>
                          {rec.details && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{rec.details}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-200">{rec.clientName || "-"}</div>
                          {rec.clientPhone && (
                            <div className="text-[10px] text-slate-500 font-mono">{rec.clientPhone}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-red-400 whitespace-nowrap">
                          {formatMoney(rec.totalValue || 0)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                          {rec.paidValue && rec.paidValue > 0 ? (
                            <div>
                              <span className="font-bold text-slate-200">{formatMoney(rec.paidValue)}</span>
                              <span className="text-[10px] text-slate-500 uppercase block">{rec.paymentMethod || "caixa"}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500">R$ 0,00</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-300 text-[11px] max-w-xs line-clamp-2">
                            {rec.productsSummary || "-"}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 4: CADASTRAR NOVO ATENDENTE */}
      {/* ========================================================= */}
      {activeTab === "novo" && (
        <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl animate-fade-in">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800 mb-5">
            <div className="p-2.5 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100 uppercase tracking-wider">
                Cadastrar Novo Atendente
              </h2>
              <p className="text-xs text-slate-400">
                O atendente terá acesso operacional às vendas e consultas de clientes com auditoria.
              </p>
            </div>
          </div>

          {formError && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{formSuccess}</span>
            </div>
          )}

          <form onSubmit={handleCreateAttendant} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Nome Completo do Atendente:
              </label>
              <input
                type="text"
                required
                placeholder="Ex: João Silva ou Maria Souza"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Nome de Usuário / Login de Acesso:
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">@</span>
                <input
                  type="text"
                  required
                  placeholder="joao.atendente"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3.5 py-2.5 text-sm text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Utilizado para fazer login no sistema na tela de entrada.
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Senha de Acesso:
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  placeholder="Mínimo 4 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 pr-10 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("atendentes")}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingUser}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {savingUser ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span>Salvar Atendente</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
