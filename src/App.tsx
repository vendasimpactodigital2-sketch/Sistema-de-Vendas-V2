import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import confetti from "canvas-confetti";
import ReactMarkdown from "react-markdown";
import { Header } from "./components/Header";
import { StandbyScreen } from "./components/StandbyScreen";
import { ClosedRegisterGate } from "./components/ClosedRegisterGate";
import { AdminUnlockModal } from "./components/AdminUnlockModal";
import { MetricsCards } from "./components/MetricsCards";
import { SaleForm } from "./components/SaleForm";
import { SalesHistory } from "./components/SalesHistory";
import { DashboardCharts } from "./components/DashboardCharts";
import { PendingSalesModal } from "./components/PendingSalesModal";
import { ClientSearchModal } from "./components/ClientSearchModal";
import { MonthlyBill } from "./components/MonthlyExpensesMeta";

const CompanySettings = React.lazy(() => import("./components/CompanySettings").then(m => ({ default: m.CompanySettings })));
const ExpensesManager = React.lazy(() => import("./components/ExpensesManager").then(m => ({ default: m.ExpensesManager })));
const UsersManager = React.lazy(() => import("./components/UsersManager").then(m => ({ default: m.UsersManager })));
const FinancialReports = React.lazy(() => import("./components/FinancialReports").then(m => ({ default: m.FinancialReports })));
const ProductCatalogManager = React.lazy(() => import("./components/ProductCatalogManager").then(m => ({ default: m.ProductCatalogManager })));
const ClientesManager = React.lazy(() => import("./components/ClientesManager").then(m => ({ default: m.ClientesManager })));
const MonthlyExpensesMeta = React.lazy(() => import("./components/MonthlyExpensesMeta").then(m => ({ default: m.MonthlyExpensesMeta })));
const SupportPanel = React.lazy(() => import("./components/SupportPanel").then(m => ({ default: m.SupportPanel })));
const AttendantsManager = React.lazy(() => import("./components/AttendantsManager").then(m => ({ default: m.AttendantsManager })));

const LazyLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[400px] w-full p-8 rounded-2xl bg-slate-900/40 border border-slate-850/60 animate-fade-in">
    <div className="relative flex items-center justify-center">
      <div className="w-12 h-12 rounded-full border-4 border-slate-800 border-t-brand-magenta animate-spin"></div>
      <div className="absolute inset-0 w-12 h-12 rounded-full border border-brand-cyan/20 animate-pulse"></div>
    </div>
    <p className="mt-4 text-xs font-mono font-bold uppercase tracking-widest text-slate-400 animate-pulse">
      Carregando Painel...
    </p>
  </div>
);
import { Sale, CompanyProfile, Expense, User, CatalogProduct, getSaleOrderDate, getSaleOperationCost, CustomReminder, CashRegisterState, CashRegisterSession, isQuickSaleClient, isPendingRetiradaOrBaixa, DeletionAuditRecord, BusinessHours } from "./types";
import { getLocalDeletionAuditRecords, saveLocalDeletionAuditRecord, clearLocalDeletionAuditRecords, fetchDeletionAuditFromSupabase } from "./utils/deletionAudit";
import { AuthScreen } from "./components/AuthScreen";
import { AdminMensalistas } from "./components/AdminMensalistas";
import { Sparkles, DollarSign, Building2, ShieldAlert, TrendingDown, RefreshCw, X, Trophy, CheckCircle, Info, AlertTriangle, Trash2, Bell, Volume2, VolumeX, Package, MapPin, Calendar, Clock, Check, Gift, Fingerprint, Eye, EyeOff, Phone, Wallet, Search, UserCheck, Sunset, BellRing, Moon, Rocket } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { WeeklyGoalModal } from "./components/WeeklyGoalModal";
import { TrialCountdown } from "./components/TrialCountdown";
import { WelcomeModal } from "./components/WelcomeModal";
import { CashRegisterModal } from "./components/CashRegisterModal";
import { TelaDeBloqueio } from "./components/AsaasPixCheckout";
import {
  isSupabaseConfigured,
  getSupabase,
  dbGetCompanyProfile,
  dbSaveCompanyProfile,
  dbGetSales,
  dbSaveSale,
  dbDeleteSale,
  dbGetExpenses,
  dbSaveExpense,
  dbDeleteExpense,
  dbGetGoals,
  dbSaveGoals,
  dbSignOut,
  dbVerifyUserSession,
  dbLoadSessionUser,
  dbUpdateProductStock,
  dbGetCashRegister,
  dbSaveCashRegister,
  dbCheckGlobalCashRegister,
  dbOpenGlobalCashRegister,
  dbCloseGlobalCashRegister,
  dbGetClientes,
  dbSaveCliente,
  dbDeleteCliente,
  dbGetCatalogProducts,
  dbSaveCatalogProduct,
  dbDeleteCatalogProduct,
  dbUpdateSubscriptionStatus,
  isCashSessionActiveOrOpen,
  isCashSessionExplicitlyClosed,
  dbPublishSystemStructure,
  dbGetSystemConfig
} from "./supabase";

export function parseBrazilianValue(val: string): number {
  let cleaned = val.trim();
  if (!cleaned) return 0;
  
  // Remove currency symbols if present
  cleaned = cleaned.replace(/R\$\s?/gi, "");

  // If it contains both dots and commas (e.g. 1.289.308,50 or 1.500,00)
  if (cleaned.includes(".") && cleaned.includes(",")) {
    if (cleaned.indexOf(".") < cleaned.indexOf(",")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
    // Only comma (e.g. 1500,50)
    cleaned = cleaned.replace(",", ".");
  } else if (cleaned.includes(".")) {
    // Only dots (e.g. 289.308 or 1.500)
    const parts = cleaned.split(".");
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 3) {
      cleaned = cleaned.replace(/\./g, "");
    }
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export const cleanDefaultCompanyProfile: CompanyProfile = {
  tradingName: "",
  phone: "",
  cep: "",
  address: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "",
  cnpjCpf: "",
  logo: null,
  pixKey: "",
  openingTime: "08:00",
  closingTime: "18:00",
  autoCloseRegisterEnabled: false,
  autoBackupDownloadEnabled: true,
  goalsReminderEnabled: false,
  goalsReminderTime: "09:00",
};

export const getLocalDateFromISO = (isoStr: string): string => {
  if (!isoStr) return "";
  const clean = isoStr.replace(/['"]/g, "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  try {
    const d = new Date(clean);
    if (isNaN(d.getTime())) return clean.substring(0, 10);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return clean.substring(0, 10);
  }
};

export const getLocalDateFormatFromISO = (isoStr: string): string => {
  const ymd = getLocalDateFromISO(isoStr);
  if (!ymd) return "";
  const parts = ymd.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return ymd;
};

export const isDateInSession = (dateStr: string, session: any): boolean => {
  if (!session) return false;
  if (!dateStr) return false;
  
  // Calendar day check fallback: if it's the same local calendar day as the session's opening day
  const cleanDate = getLocalDateFromISO(dateStr);
  const startLocalDate = getLocalDateFromISO(session.dataAbertura);
  const endLocalDate = getLocalDateFromISO(session.dataFechamento || new Date().toISOString());
  
  if (cleanDate === startLocalDate) {
    return true;
  }

  const openTime = new Date(session.dataAbertura).getTime();
  const closeTime = session.dataFechamento ? new Date(session.dataFechamento).getTime() : Date.now();
  
  // Check if dateStr contains hours/time (is a full ISO or timestamp)
  const isFullISO = dateStr.includes("T") || (dateStr.includes("-") && dateStr.includes(":"));
  if (isFullISO) {
    try {
      const t = new Date(dateStr).getTime();
      if (!isNaN(t)) {
        if (t >= openTime && t <= (closeTime + 2000)) {
          return true;
        }
      }
    } catch (e) {}
  }
  
  return cleanDate >= startLocalDate && cleanDate <= endLocalDate;
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_CURRENT_USER");
      return saved ? JSON.parse(saved) : null;
    } catch (err) {
      console.warn("NUCLEO_CURRENT_USER parse failed", err);
      return null;
    }
  });

  // Subscription & 15-day Trial logic
  const [isSubscribing, setIsSubscribing] = useState(false);

  const isSubscriptionLocked = useMemo(() => {
    if (!currentUser) return false;
    
    // Rigorously enforce lock if subscription status is 'bloqueado', 'vencido', or 'expired' (case-insensitive, trimmed)
    const status = (currentUser.status_assinatura || (currentUser as any).status || "").toString().trim().toLowerCase();
    
    // Se o status for ativo, o acesso NUNCA deve ser bloqueado
    if (status === "ativo" || status === "active") {
      return false;
    }

    const isPedro = currentUser.email?.toLowerCase().trim() === "pedro@gmail.com";
    if (status === "bloqueado" || status === "vencido" || status === "expired" || isPedro) {
      return true;
    }
    
    // 1. Check if the user is an administrator
    const isUserAdmin = 
      currentUser.role === "admin" || 
      currentUser.role === "administrador" || 
      currentUser.is_admin === true || 
      currentUser.email === "sistemadevendaadm@gmail.com" || 
      currentUser.email === "vendas.impactodigital2@gmail.com" ||
      !currentUser.owner_id ||
      currentUser.owner_id === currentUser.id;
      
    if (isUserAdmin) {
      return false; // NEVER locked for administrator
    }

    // 2. Otherwise they are common users (clients of the print shop)
    if (status === "ativo") return false;
    
    const createdAtStr = currentUser.created_at;
    if (!createdAtStr) return false;
    
    try {
      const createdDate = new Date(createdAtStr);
      const currentDate = new Date();
      const diffTime = currentDate.getTime() - createdDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      return diffDays > 15;
    } catch (e) {
      console.error("Error calculating trial days:", e);
      return false;
    }
  }, [currentUser]);

  const trialDaysRemaining = useMemo(() => {
    if (!currentUser) return 15;
    const isUserAdmin = 
      currentUser.role === "admin" || 
      currentUser.role === "administrador" || 
      currentUser.is_admin === true || 
      currentUser.email === "sistemavendaadm@gmail.com" || 
      currentUser.email === "sistemadevendaadm@gmail.com" || 
      currentUser.email === "vendas.impactodigital2@gmail.com" ||
      !currentUser.owner_id ||
      currentUser.owner_id === currentUser.id;
      
    if (isUserAdmin) return 15;

    if (!currentUser.created_at) return 15;
    try {
      const createdDate = new Date(currentUser.created_at);
      const currentDate = new Date();
      const diffTime = currentDate.getTime() - createdDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, 15 - diffDays);
    } catch {
      return 15;
    }
  }, [currentUser]);

  const handleSubscribeNow = async () => {
    if (!currentUser) return;
    setIsSubscribing(true);
    try {
      const success = await dbUpdateSubscriptionStatus(currentUser.id, "ativo");
      if (success) {
        const updated = { ...currentUser, status_assinatura: "ativo" };
        setCurrentUser(updated);
        localStorage.setItem("NUCLEO_CURRENT_USER", JSON.stringify(updated));
        
        playGoalBeep();
        try {
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 }
          });
        } catch {}
        addToast("🎉 Assinatura de R$ 25,00/mês ativada com sucesso! Obrigado pelo apoio!", "success");
      } else {
        addToast("Falha ao ativar assinatura. Verifique sua conexão.", "error");
      }
    } catch (err) {
      console.error("Error activating subscription:", err);
      addToast("Erro ao processar assinatura.", "error");
    } finally {
      setIsSubscribing(false);
    }
  };

  // Admin Unlock States
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminUnlockOpen, setAdminUnlockOpen] = useState(false);
  const [adminUnlockSuccessCallback, setAdminUnlockSuccessCallback] = useState<{ fn: () => void } | null>(null);
  const [adminUnlockMessage, setAdminUnlockMessage] = useState("");

  const isAttendant = currentUser && (
    currentUser.role === "atendente" ||
    currentUser.role === "seller" ||
    (currentUser.owner_id && currentUser.owner_id !== currentUser.id && currentUser.role !== "administrador" && !currentUser.is_admin)
  );

  const requestAdminUnlock = (callback: () => void, message?: string) => {
    if (!isAttendant || adminUnlocked) {
      callback();
      return;
    }
    setAdminUnlockSuccessCallback({ fn: callback });
    setAdminUnlockMessage(message || "Esta operação ou área exige autorização do Administrador.");
    setAdminUnlockOpen(true);
  };

  const handleAdminUnlockSuccess = () => {
    setAdminUnlocked(true);
    if (adminUnlockSuccessCallback?.fn) {
      adminUnlockSuccessCallback.fn();
    }
    setAdminUnlockSuccessCallback(null);
  };

  // Routing hook for /admin/mensalistas
  const [isAdminPath, setIsAdminPath] = useState(() => {
    return window.location.pathname === "/admin/mensalistas";
  });

  useEffect(() => {
    const handleLocationChange = () => {
      setIsAdminPath(window.location.pathname === "/admin/mensalistas");
    };
    window.addEventListener("popstate", handleLocationChange);
    
    // Override pushState and replaceState to catch programmatical routing changes
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    
    window.history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleLocationChange();
    };
    window.history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleLocationChange();
    };
    
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  // Periodic interval status check to detect subscription updates in background
  React.useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(async () => {
      try {
        const client = getSupabase();
        if (!client) return;

        const { data } = await client
          .from('users')
          .select('status_assinatura, status')
          .eq('id', currentUser.id)
          .maybeSingle();

        if (data) {
          const dbStatus = (data.status || data.status_assinatura || "").toString().trim();
          const dbStatusLower = dbStatus.toLowerCase();
          const localStatusLower = (currentUser.status || currentUser.status_assinatura || "").toString().trim().toLowerCase();

          if (dbStatusLower !== localStatusLower) {
            console.log(`[Interval Check] Syncing user status from DB: ${dbStatus}`);
            const updatedUser = { ...currentUser, status_assinatura: dbStatus, status: dbStatus };
            localStorage.setItem("NUCLEO_CURRENT_USER", JSON.stringify(updatedUser));
            setCurrentUser(updatedUser);
            
            // Reload if they transition into locked state for clean layout reset, or just update state
            if (dbStatusLower === 'vencido' || dbStatusLower === 'bloqueado' || dbStatusLower === 'expired') {
              window.location.reload();
            }
          }
        }
      } catch (err) {
        console.error("Erro na checagem periódica:", err);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [currentUser]);


  const [activeTab, setActiveTab] = useState<"sale" | "dashboard" | "company" | "gastos" | "usuarios" | "relatorios" | "produtos" | "gastosMeta" | "clientes" | "suporte" | "atendentes">("sale");

  // Deletion Audit Records state
  const [deletionAuditRecords, setDeletionAuditRecords] = useState<DeletionAuditRecord[]>([]);

  useEffect(() => {
    if (!currentUser) return;
    const ownerId = currentUser.owner_id || currentUser.id;
    if (!ownerId) return;

    // Load from local storage immediately
    const local = getLocalDeletionAuditRecords(ownerId);
    setDeletionAuditRecords(local);

    // Sync from Supabase in background if configured
    if (isSupabaseConfigured()) {
      fetchDeletionAuditFromSupabase(ownerId).then((records) => {
        if (records && records.length > 0) {
          setDeletionAuditRecords(records);
        }
      });
    }

    // Real-time listener for local updates
    const handleUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setDeletionAuditRecords(e.detail);
      }
    };
    window.addEventListener("deletion-audit-updated", handleUpdate);
    return () => window.removeEventListener("deletion-audit-updated", handleUpdate);
  }, [currentUser?.id, currentUser?.owner_id]);

  const handleClearDeletionRecords = () => {
    if (!currentUser) return;
    const ownerId = currentUser.owner_id || currentUser.id;
    if (ownerId) {
      clearLocalDeletionAuditRecords(ownerId);
      setDeletionAuditRecords([]);
      addToast("Histórico arquivado de exclusões foi limpo.", "info");
    }
  };

  // Hard protection: redirect attendants away from management tabs if admin mode is not unlocked
  useEffect(() => {
    const restrictedTabs = ["dashboard", "company", "usuarios", "relatorios", "gastosMeta", "produtos", "suporte", "atendentes"];
    if (isAttendant && !adminUnlocked && restrictedTabs.includes(activeTab)) {
      setActiveTab("sale");
    }
  }, [isAttendant, adminUnlocked, activeTab]);
  const [isStandbyActive, setIsStandbyActive] = useState<boolean>(true);

  // Auto-Standby after 10 minutes (600,000ms) of user inactivity
  useEffect(() => {
    if (!currentUser || isStandbyActive) return;

    let inactivityTimer: NodeJS.Timeout;

    const resetInactivityTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      // 10 minutes = 10 * 60 * 1000 = 600,000 ms
      inactivityTimer = setTimeout(() => {
        setIsStandbyActive(true);
      }, 600000);
    };

    const userActivityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];

    userActivityEvents.forEach((evt) => {
      window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });

    // Start timer initially
    resetInactivityTimer();

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      userActivityEvents.forEach((evt) => {
        window.removeEventListener(evt, resetInactivityTimer);
      });
    };
  }, [currentUser, isStandbyActive]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showDailyGoalPrompt, setShowDailyGoalPrompt] = useState(false);
  const [showCongratsOverlay, setShowCongratsOverlay] = useState(false);
  const [showDeliveryDueOverlay, setShowDeliveryDueOverlay] = useState(false);
  const [todaysDeliveries, setTodaysDeliveries] = useState<Sale[]>([]);

  // Rescheduling Delivery and reasons
  const [reschedulingSale, setReschedulingSale] = useState<Sale | null>(null);
  const [newDeliveryDate, setNewDeliveryDate] = useState("");
  const [newDeliveryReason, setNewDeliveryReason] = useState("");

  // AI Logistics Center States
  const [showLogisticsAiModal, setShowLogisticsAiModal] = useState(false);
  const [logisticsAiContent, setLogisticsAiContent] = useState("");
  const [logisticsAiLoading, setLogisticsAiLoading] = useState(false);
  const [logisticsAiError, setLogisticsAiError] = useState("");
  const [logisticsRightTab, setLogisticsRightTab] = useState<"checklist" | "ai">("checklist");
  const [checkedLogisticsItems, setCheckedLogisticsItems] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_LOGISTICS_CHECKLIST");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Helper helper to persist checked items
  const toggleCheckedLogisticsItem = (itemId: string) => {
    setCheckedLogisticsItems(prev => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      try {
        localStorage.setItem("NUCLEO_LOGISTICS_CHECKLIST", JSON.stringify(next));
      } catch (e) {
        console.warn("Failed to set logistics checklist", e);
      }
      return next;
    });
  };

  const [tempGoalValue, setTempGoalValue] = useState(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_GOAL_VALUE");
      return saved && parseBrazilianValue(saved) > 0 ? saved : "";
    } catch (err) {
      return "";
    }
  });
  const [tempGoalType, setTempGoalType] = useState<"daily" | "overall">("daily");

  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [locateClientClicks, setLocateClientClicks] = useState(0);
  const [showClientSearchModal, setShowClientSearchModal] = useState(false);
  
  // Load sales data immediately from localStorage on mount
  const [sales, setSales] = useState<Sale[]>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_SALES");
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.warn("NUCLEO_SALES parse failed", err);
      return [];
    }
  });

  // Load budgets/estimates data immediately from localStorage on mount
  const [budgets, setBudgets] = useState<Sale[]>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_BUDGETS");
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.warn("NUCLEO_BUDGETS parse failed", err);
      return [];
    }
  });

  const salesRef = useRef<Sale[]>(sales);
  salesRef.current = sales;
  const budgetsRef = useRef<Sale[]>(budgets);
  budgetsRef.current = budgets;

  // Real-time check of user status directly from Supabase 'users' table
  useEffect(() => {
    const checkLiveUserStatus = async () => {
      if (!currentUser?.id || !isSupabaseConfigured()) return;
      
      try {
        const client = getSupabase();
        if (!client) return;

        let dbStatus = "";
        
        // 1. Consulta diretamente a tabela 'users' (onde o Realtime está habilitado)
        try {
          const { data: userData } = await client
            .from('users')
            .select('status, status_assinatura')
            .eq('id', currentUser.id)
            .maybeSingle();
          if (userData) {
            dbStatus = (userData.status || userData.status_assinatura || "").toString().trim();
          }
        } catch (e) {}

        // 2. Fallback secundário
        if (!dbStatus) {
          try {
            const { data: profileData } = await client
              .from('profiles')
              .select('status, status_assinatura')
              .eq('id', currentUser.id)
              .maybeSingle();
            if (profileData) {
              dbStatus = (profileData.status || profileData.status_assinatura || "").toString().trim();
            }
          } catch (e) {}
        }

        if (dbStatus) {
          const dbStatusUpper = dbStatus.toUpperCase();
          const localStatusUpper = (currentUser.status || currentUser.status_assinatura || "").toString().trim().toUpperCase();
          
          if (dbStatusUpper !== localStatusUpper) {
            console.log(`[Real-time Check] Atualizando status do usuário diretamente da tabela 'users': ${dbStatus}`);
            const updatedUser = { 
              ...currentUser, 
              status_assinatura: dbStatusUpper === "ATIVO" ? "ativo" : dbStatus, 
              status: dbStatus 
            };
            localStorage.setItem("NUCLEO_CURRENT_USER", JSON.stringify(updatedUser));
            setCurrentUser(updatedUser);
          }
        }
      } catch (err) {
        console.error("Erro ao verificar status imediato do usuário na tabela 'users':", err);
      }
    };

    checkLiveUserStatus();
  }, [activeTab, currentUser?.id]);

  // Supabase Realtime: Escuta eventos de alteração DIRETAMENTE na tabela 'users' para liberação instantânea
  useEffect(() => {
    if (!currentUser?.id || !isSupabaseConfigured()) return;
    const client = getSupabase();
    if (!client) return;

    console.log(`[Supabase Realtime App] Monitorando atualizações diretamente na tabela 'users' do usuário ${currentUser.id}...`);

    const channel = client
      .channel(`app-users-status-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "users",
          filter: `id=eq.${currentUser.id}`
        },
        (payload: any) => {
          console.log("[Supabase Realtime App] Alteração detectada diretamente na tabela 'users':", payload.new);
          const newStatus = (payload.new?.status || payload.new?.status_assinatura || "").toString().trim().toLowerCase();
          if (newStatus) {
            const isNowAtivo = newStatus === "ativo" || newStatus === "active";
            setCurrentUser(prev => {
              if (!prev) return null;
              const updated = {
                ...prev,
                status: isNowAtivo ? "ativo" : newStatus,
                status_assinatura: isNowAtivo ? "ativo" : newStatus
              };
              try {
                localStorage.setItem("NUCLEO_CURRENT_USER", JSON.stringify(updated));
              } catch (e) {}
              return updated;
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "users"
        },
        (payload: any) => {
          const u = payload.new;
          if (!u) return;
          const isMe = 
            String(u.id) === String(currentUser.id) ||
            (currentUser.email && u.email && String(u.email).toLowerCase().trim() === String(currentUser.email).toLowerCase().trim());
          if (!isMe) return;

          const newStatus = (u.status || u.status_assinatura || "").toString().trim().toLowerCase();
          if (newStatus) {
            const isNowAtivo = newStatus === "ativo" || newStatus === "active";
            setCurrentUser(prev => {
              if (!prev) return null;
              const updated = {
                ...prev,
                status: isNowAtivo ? "ativo" : newStatus,
                status_assinatura: isNowAtivo ? "ativo" : newStatus
              };
              try {
                localStorage.setItem("NUCLEO_CURRENT_USER", JSON.stringify(updated));
              } catch (e) {}
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [currentUser?.id]);

  // Compile all orders for AI context beautifully and compactly
  const allOrdersForAi = React.useMemo(() => {
    const combinedSales = sales.map(s => ({
      id: s.id,
      clientName: s.clientName,
      clientPhone: s.clientPhone || "Não informado",
      items: s.items?.map(it => ({ description: it.description, quantity: it.quantity })) || [],
      deliveryDate: s.deliveryDate || "Sem data informada",
      totalValue: s.totalValue,
      balanceDue: s.balanceDue,
      isBudget: false,
      status: s.balanceDue > 0 ? "Pendente" : "Concluído"
    }));

    const combinedBudgets = budgets.map(b => ({
      id: b.id,
      clientName: b.clientName,
      clientPhone: b.clientPhone || "Não informado",
      items: b.items?.map(it => ({ description: it.description, quantity: it.quantity })) || [],
      deliveryDate: b.deliveryDate || "Sem data informada",
      totalValue: b.totalValue,
      balanceDue: b.balanceDue,
      isBudget: true,
      status: "Orçamento / Pendente"
    }));

    return [...combinedSales, ...combinedBudgets];
  }, [sales, budgets]);

  // Secure API Call for Gemini Assistant
  const fetchLogisticsAi = async () => {
    setLogisticsAiLoading(true);
    setLogisticsAiError("");
    setLogisticsAiContent("");
    
    try {
      const localDate = new Date();
      const todayStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
      const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      // Portuguese formatting for prompt
      const formattedToday = `${String(localDate.getDate()).padStart(2, '0')} de ${months[localDate.getMonth()]} de ${localDate.getFullYear()}`;

      const response = await fetch("/api/analyze-logistics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sales: allOrdersForAi,
          todayDate: `${formattedToday} (${todayStr})`,
        }),
      });

      if (!response.ok) {
        throw new Error("Falha ao comunicar com o servidor do Google AI Studio.");
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setLogisticsAiContent(data.result);
    } catch (err: any) {
      console.error(err);
      setLogisticsAiError(err.message || "Ocorreu um erro ao buscar análise da inteligência artificial.");
    } finally {
      setLogisticsAiLoading(false);
    }
  };

  // Load standalone expenses from localStorage
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_EXPENSES");
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.warn("NUCLEO_EXPENSES parse failed", err);
      return [];
    }
  });

  // Elevated state for monthly bills & days worked for "Falta para Meta" live calculation
  const [bills, setBills] = useState<MonthlyBill[]>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_MONTHLY_BILLS");
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.warn("NUCLEO_MONTHLY_BILLS parse failed", err);
      return [];
    }
  });

  const [daysWorked, setDaysWorked] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_MONTHLY_WORKDAYS");
      return saved ? parseInt(saved, 10) : 26;
    } catch (err) {
      return 26;
    }
  });

  const [hideMetaValues, setHideMetaValues] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_HIDE_META_VALUES");
      return saved === "true";
    } catch (err) {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem("NUCLEO_MONTHLY_BILLS", JSON.stringify(bills));
  }, [bills]);

  useEffect(() => {
    localStorage.setItem("NUCLEO_MONTHLY_WORKDAYS", String(daysWorked));
  }, [daysWorked]);

  useEffect(() => {
    localStorage.setItem("NUCLEO_HIDE_META_VALUES", String(hideMetaValues));
  }, [hideMetaValues]);


  // Load company profile data immediately from localStorage on mount
  const [company, setCompany] = useState<CompanyProfile>(() => {
    const saved = localStorage.getItem("NUCLEO_COMPANY_PROFILE");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure we strip legacy huge base64 from current localStorage state if it somehow persisted
        if (parsed.logo && parsed.logo.startsWith("data:")) {
          parsed.logo = null;
        }
        return parsed;
      } catch (err) {
        console.error("Error parsing stored company profile:", err);
      }
    }
    return {
      tradingName: "Refrigeração Preventiva",
      phone: "(11) 98888-7777",
      cep: "01311-200",
      address: "Avenida Paulista",
      number: "1000",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
      cnpjCpf: "",
      logo: null,
    };
  });

  const companyLoadedForUserId = useRef<string | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  // Load local heavy cached company logo from IndexedDB asynchronously on mount
  useEffect(() => {
    const loadCompanyLogoFromIndexedDb = async () => {
      try {
        const { getIndexedDbItem } = await import("./utils/indexedDb");
        const cachedLogo = await getIndexedDbItem<string>("NUCLEO_COMPANY_LOGO");
        if (cachedLogo) {
          setCompany((prev) => {
            // Only use cached logo if current is empty or if current is already a base64
            if (!prev.logo || prev.logo.startsWith("data:")) {
              return { ...prev, logo: cachedLogo };
            }
            return prev;
          });
        }
      } catch (err) {
        console.error("Failed to load company logo from IndexedDB fallback:", err);
      }
    };
    loadCompanyLogoFromIndexedDb();
  }, []);

  // Track active editing invoice reference
  const [activeEditingSale, setActiveEditingSale] = useState<Sale | null>(null);
  const [preselectedClient, setPreselectedClient] = useState<{ name: string; phone?: string } | null>(null);

  interface ToastItem {
    id: string;
    message: string;
    type: "success" | "info" | "warning" | "error" | "goal" | "reminder";
  }

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  
  const addToast = (message: string, type: "success" | "info" | "warning" | "error" | "goal" | "reminder" = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("NUCLEO_SOUND_ENABLED");
    return saved !== "false"; // Default to true if not set
  });

  const [cashRegister, setCashRegister] = useState<CashRegisterState>(() => {
    const saved = localStorage.getItem("NUCLEO_CASH_REGISTER");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error parsing NUCLEO_CASH_REGISTER from localStorage", e);
      }
    }
    return { currentSession: null, history: [] };
  });

  const cashRegisterRef = useRef<CashRegisterState>(cashRegister);
  useEffect(() => {
    cashRegisterRef.current = cashRegister;
  }, [cashRegister]);

  const [bypassTodayClosure, setBypassTodayClosure] = useState<boolean>(false);

  // Computed checks to enforce mandatory single daily cash register turns
  const hasClosedRegisterToday = useMemo(() => {
    if (bypassTodayClosure) return false;
    const getLocalDateStr = (isoString?: string) => {
      if (!isoString) return "";
      try {
        const d = new Date(isoString);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } catch {
        return "";
      }
    };
    const todayStr = getLocalDateStr(new Date().toISOString());
    return cashRegister.history.some(session => {
      const closedDate = getLocalDateStr(session.dataFechamento || session.dataAbertura);
      return closedDate === todayStr && session.status === "fechado";
    });
  }, [cashRegister.history]);

  const todayClosedSession = useMemo(() => {
    const getLocalDateStr = (isoString?: string) => {
      if (!isoString) return "";
      try {
        const d = new Date(isoString);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } catch {
        return "";
      }
    };
    const todayStr = getLocalDateStr(new Date().toISOString());
    return cashRegister.history.find(session => {
      const closedDate = getLocalDateStr(session.dataFechamento || session.dataAbertura);
      return closedDate === todayStr && session.status === "fechado";
    });
  }, [cashRegister.history]);

  // 1. Estado reativo direto (sem depender de F5 ou cache estático de outro PC)
  const [isGlobalRegisterOpen, setIsGlobalRegisterOpen] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const UNIFIED_EMPRESA_ID = "62f892b2-3855-4ae9-8b2d-42d4b6223815";

    const supabase = getSupabase();
    if (!supabase) return;

    // 2. Select inicial em public.sessoes_caixa buscando por status = 'aberto' e empresa_id = '62f892b2-3855-4ae9-8b2d-42d4b6223815'
    const checkInitialSession = async () => {
      try {
        const { data } = await supabase
          .from("sessoes_caixa")
          .select("id, status, valor_abertura, data_abertura, aberto_por_usuario_id")
          .eq("status", "aberto")
          .eq("empresa_id", UNIFIED_EMPRESA_ID)
          .order("data_abertura", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!isMounted) return;

        if (data && (data.status || "").trim().toLowerCase() === "aberto") {
          // Se encontrar, force o estado inicial da tela a iniciar como ABERTO automaticamente em qualquer máquina, sem pedir nova abertura
          setIsGlobalRegisterOpen(true);
          const activeSession: CashRegisterSession = {
            id: data.id,
            status: "aberto",
            valorAbertura: Number(data.valor_abertura) || 0,
            dataAbertura: data.data_abertura || new Date().toISOString(),
            operador: currentUser?.name || "Operador"
          };
          setCashRegister((prev) => {
            const updated = {
              ...prev,
              currentSession: activeSession
            };
            cashRegisterRef.current = updated;
            try {
              localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated));
            } catch (e) {}
            return updated;
          });
        } else {
          // CRÍTICO: Se o caixa estiver aberto localmente, NUNCA zerar ou fechar sozinho!
          // Uma vez aberto, ele fica aberto durante todo o expediente até o fechamento manual pelo operador.
          const isLocalOpen = !!cashRegisterRef.current?.currentSession && isCashSessionActiveOrOpen(cashRegisterRef.current.currentSession);
          if (isLocalOpen) {
            console.log("[sessoes_caixa check] Mantendo caixa local aberto ativo.");
            setIsGlobalRegisterOpen(true);
          } else {
            setIsGlobalRegisterOpen(false);
          }
        }
      } catch (err) {
        console.warn("Aviso ao carregar status inicial de sessoes_caixa:", err);
      }
    };

    checkInitialSession();

    // 3. Canal Supabase Realtime isolado escutando public.sessoes_caixa
    const channel = supabase
      .channel("sync_caixa_sessoes_caixa_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessoes_caixa"
        },
        (payload) => {
          if (!isMounted) return;

          const row = (payload.new || payload.old) as any;
          if (row?.empresa_id && row.empresa_id !== UNIFIED_EMPRESA_ID) {
            return;
          }

          if (payload.eventType === "DELETE") {
            const currentSessionId = cashRegisterRef.current?.currentSession?.id;
            if (currentSessionId && row?.id === currentSessionId) {
              setIsGlobalRegisterOpen(false);
              setCashRegister((prev) => {
                const updated = { ...prev, currentSession: null };
                cashRegisterRef.current = updated;
                try { localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated)); } catch (e) {}
                return updated;
              });
            }
            return;
          }

          const newRow = payload.new as any;
          const status = (newRow?.status || "").trim().toLowerCase();
          const isOpen = status === "aberto";

          if (isOpen) {
            // Nova sessão aberta ou atualizada remotamente
            setIsGlobalRegisterOpen(true);
            setCashRegister((prev) => {
              const updated = {
                ...prev,
                currentSession: {
                  id: newRow.id,
                  status: "aberto" as const,
                  valorAbertura: Number(newRow.valor_abertura ?? newRow.valor_inicial) || 0,
                  dataAbertura: newRow.data_abertura || newRow.created_at || new Date().toISOString(),
                  operador: newRow.operador || currentUser?.name || "Operador"
                }
              };
              cashRegisterRef.current = updated;
              try {
                localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated));
              } catch (e) {}
              return updated;
            });
          } else if (status === "fechado") {
            // Só fechar se a sessão explicitamente fechada for a mesma sessão ativa atual
            const currentSessionId = cashRegisterRef.current?.currentSession?.id;
            if (currentSessionId && newRow.id === currentSessionId) {
              setIsGlobalRegisterOpen(false);
              setCashRegister((prev) => {
                const updated = { ...prev, currentSession: null };
                cashRegisterRef.current = updated;
                try {
                  localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated));
                } catch (e) {}
                return updated;
              });
            }
          }
        }
      )
      .subscribe();

    // 4. Cleanup garantindo isMounted = false e removeChannel
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, currentUser?.owner_id]);

  const checkingRegisterRef = useRef<Promise<boolean> | null>(null);

  const checkGlobalRegisterStatus = async (userIdToUse?: string): Promise<boolean> => {
    // Avoid re-entrant or racing checks
    if (checkingRegisterRef.current) {
      return checkingRegisterRef.current;
    }

    const checkPromise = (async () => {
      const UNIFIED_EMPRESA_ID = "62f892b2-3855-4ae9-8b2d-42d4b6223815";
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data } = await supabase
            .from("sessoes_caixa")
            .select("id, status, valor_abertura, data_abertura, aberto_por_usuario_id")
            .eq("status", "aberto")
            .eq("empresa_id", UNIFIED_EMPRESA_ID)
            .order("data_abertura", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (data && (data.status || "").trim().toLowerCase() === "aberto") {
            setIsGlobalRegisterOpen(true);
            const activeSession: CashRegisterSession = {
              id: data.id,
              status: "aberto",
              valorAbertura: Number(data.valor_abertura) || 0,
              dataAbertura: data.data_abertura || new Date().toISOString(),
              operador: currentUser?.name || "Operador"
            };
            setCashRegister((prev) => {
              const updated = { ...prev, currentSession: activeSession };
              cashRegisterRef.current = updated;
              try { localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated)); } catch (e) {}
              return updated;
            });
            return true;
          } else {
            // Se local estiver com caixa aberto, NUNCA zerar o caixa! Fica aberto até o expediente acabar ou fechamento manual.
            const isLocalOpen = !!cashRegisterRef.current?.currentSession && isCashSessionActiveOrOpen(cashRegisterRef.current.currentSession);
            if (isLocalOpen) {
              setIsGlobalRegisterOpen(true);
              return true;
            }
            setIsGlobalRegisterOpen(false);
            return false;
          }
        } catch (err) {
          console.warn("Aviso ao checar sessoes_caixa unificado:", err);
        }
      }

      const companyOwnerId = currentUser?.owner_id || currentUser?.id || userIdToUse;
      const userToVerify = companyOwnerId;
      let isLocalOpen = !!cashRegisterRef.current?.currentSession && isCashSessionActiveOrOpen(cashRegisterRef.current.currentSession);
      if (!isLocalOpen) {
        try {
          const saved = localStorage.getItem("NUCLEO_CASH_REGISTER");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?.currentSession && isCashSessionActiveOrOpen(parsed.currentSession)) {
              isLocalOpen = true;
              cashRegisterRef.current = parsed;
            }
          }
        } catch (e) {}
      }

      if (!userToVerify || !isSupabaseConfigured()) {
        setIsGlobalRegisterOpen(isLocalOpen);
        return isLocalOpen;
      }
      try {
        const open = await dbCheckGlobalCashRegister(userToVerify);
        if (open || isLocalOpen) {
          setIsGlobalRegisterOpen(true);
          return true;
        }

        setIsGlobalRegisterOpen(false);
        return false;
      } catch (err) {
        console.error("Error checking global register status:", err);
        setIsGlobalRegisterOpen(isLocalOpen);
        return isLocalOpen;
      }
    })();

    checkingRegisterRef.current = checkPromise;
    try {
      return await checkPromise;
    } finally {
      checkingRegisterRef.current = null;
    }
  };

  const isRegisterOpenForToday = useMemo(() => {
    const isLocalOpen = !!cashRegister?.currentSession && isCashSessionActiveOrOpen(cashRegister.currentSession);
    const isRefOpen = !!cashRegisterRef.current?.currentSession && isCashSessionActiveOrOpen(cashRegisterRef.current.currentSession);
    return isGlobalRegisterOpen || isLocalOpen || isRefOpen;
  }, [isGlobalRegisterOpen, cashRegister]);

  const [readOnlyMode, setReadOnlyMode] = useState<boolean>(false);
  const [openingOperatorName, setOpeningOperatorName] = useState<string>("");
  const [openingFloatValue, setOpeningFloatValue] = useState<string>("100.00");

  const [showWeeklyGoalModal, setShowWeeklyGoalModal] = useState<boolean>(false);
  const [showCashRegisterModal, setShowCashRegisterModal] = useState<boolean>(false);
  const [showAutoClosePrompt, setShowAutoClosePrompt] = useState<boolean>(false);

  const playCloseRegisterSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;
      const playTone = (freq: number, start: number, duration: number, volume = 0.25) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(freq, start);
        gainNode.gain.setValueAtTime(volume, start);
        gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.start(start);
        osc.stop(start + duration);
      };
      // Descending store closing chime chord
      playTone(783.99, now, 0.2, 0.25); // G5
      playTone(659.25, now + 0.12, 0.2, 0.22); // E5
      playTone(523.25, now + 0.24, 0.25, 0.22); // C5
      playTone(392.00, now + 0.36, 0.5, 0.3); // G4
    } catch (e) {
      console.error("Audio close register failed:", e);
    }
  };

  const [closingAlarmMuted, setClosingAlarmMuted] = useState<boolean>(false);

  const playContinuousCashClosingAlarm = () => {
    if (!soundEnabled || closingAlarmMuted) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;
      const playTone = (freq: number, start: number, duration: number, vol = 0.28) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gainNode.gain.setValueAtTime(vol, start);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };
      // High-audibility pleasant alarm chime: E5 - A5 - C#6 - E6
      playTone(659.25, now, 0.35, 0.25);
      playTone(880.00, now + 0.22, 0.35, 0.28);
      playTone(1108.73, now + 0.44, 0.40, 0.30);
      playTone(1318.51, now + 0.66, 0.70, 0.32);
    } catch (e) {
      console.warn("Audio closing alarm failed:", e);
    }
  };

  // Continuous alarm sound loop for cash closing reminder until the user clicks any button
  useEffect(() => {
    if (!showAutoClosePrompt || closingAlarmMuted) return;

    // Play immediately
    playContinuousCashClosingAlarm();

    // Loop alarm sound every 2.4 seconds until user clicks a button to dismiss, close, snooze, or mute
    const interval = setInterval(() => {
      playContinuousCashClosingAlarm();
    }, 2400);

    return () => clearInterval(interval);
  }, [showAutoClosePrompt, closingAlarmMuted, soundEnabled]);

  const playPleasantClosingChime = () => {
    playContinuousCashClosingAlarm();
  };

  // Test event listener for cash closing reminder from CompanySettings
  useEffect(() => {
    const handleTestReminder = () => {
      setClosingAlarmMuted(false);
      setShowAutoClosePrompt(true);
      playContinuousCashClosingAlarm();
    };
    window.addEventListener("TEST_CASH_CLOSING_REMINDER", handleTestReminder);
    return () => window.removeEventListener("TEST_CASH_CLOSING_REMINDER", handleTestReminder);
  }, [soundEnabled]);

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem("NUCLEO_SOUND_ENABLED", String(enabled));
    addToast(enabled ? "Sons e alertas sonoros ATIVADOS! 🔊" : "Sons de notificação DESATIVADOS! 🔇", "info");
  };

  // custom high-priority notification state
  const [highPriorityNotification, setHighPriorityNotification] = useState<{
    id: string;
    title: string;
    clientName: string;
    totalValue: number;
    paymentMethod: string;
  } | null>(null);

  useEffect(() => {
    if (highPriorityNotification) {
      const timer = setTimeout(() => {
        setHighPriorityNotification(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [highPriorityNotification]);

  const playCashRegisterSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playFreq = (freq: number, start: number, duration: number, volume = 0.3) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration - 0.02);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };
      const now = audioCtx.currentTime;
      // Beautiful triple chime for receipt alert
      playFreq(880, now, 0.12, 0.22);
      playFreq(1320, now + 0.08, 0.15, 0.22);
      playFreq(1760, now + 0.16, 0.4, 0.28);
    } catch (e) {
      console.error("Audio failed:", e);
    }
  };

  const playLoginBeep = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (freq: number, start: number, duration: number, volume = 0.25) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration - 0.02);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      const now = audioCtx.currentTime;
      // Elegant rising chime
      playTone(523.25, now, 0.15, 0.22); // C5
      playTone(659.25, now + 0.08, 0.15, 0.22); // E5
      playTone(783.99, now + 0.16, 0.20, 0.25); // G5
      playTone(1046.50, now + 0.26, 0.35, 0.30); // C6
    } catch (e) {
      console.error("Audio login beep failed:", e);
    }
  };

  const playAlertSound = (type: "success" | "delete" | "info") => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;
      
      const playTone = (freq: number, start: number, duration: number, volume = 0.18) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration - 0.02);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      if (type === "success") {
        playTone(600, now, 0.08, 0.15);
        playTone(900, now + 0.06, 0.12, 0.18);
      } else if (type === "delete") {
        playTone(450, now, 0.10, 0.15);
        playTone(300, now + 0.08, 0.18, 0.15);
      } else {
        playTone(700, now, 0.12, 0.12);
      }
    } catch (e) {
      console.error("Audio alert beep failed:", e);
    }
  };

  const playReminderSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (freq: number, start: number, duration: number, type: "sine" | "triangle" | "sawtooth" | "square" = "sine", volume = 0.25) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration - 0.02);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      const now = audioCtx.currentTime;
      // High-end marimba double chime (different sound than any other beep)
      playTone(440, now, 0.12, "sine", 0.25); // A4
      playTone(880, now + 0.06, 0.12, "sine", 0.25); // A5
      playTone(659.25, now + 0.14, 0.12, "sine", 0.25); // E5
      playTone(1318.51, now + 0.20, 0.40, "sine", 0.30); // E6
    } catch (e) {
      console.error("Audio reminder sound failed:", e);
    }
  };

  // Load goal configurations from localStorage
  const [goalValue, setGoalValue] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_GOAL_VALUE");
      return saved ? parseBrazilianValue(saved) : 0;
    } catch {
      return 0;
    }
  });

  const [goalType, setGoalType] = useState<"daily" | "overall">(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_GOAL_TYPE");
      return (saved as "daily" | "overall") || "daily";
    } catch {
      return "daily";
    }
  });

  const [notifiedGoalValue, setNotifiedGoalValue] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_NOTIFIED_GOAL_VALUE");
      return saved ? parseFloat(saved) : -1;
    } catch {
      return -1;
    }
  });

  const [notifiedGoalDate, setNotifiedGoalDate] = useState<string>(() => {
    try {
      return localStorage.getItem("NUCLEO_NOTIFIED_GOAL_DATE") || "";
    } catch {
      return "";
    }
  });

  const [dbSyncing, setDbSyncing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(() => {
    try {
      return isSupabaseConfigured() && !!localStorage.getItem("NUCLEO_CURRENT_USER");
    } catch {
      return false;
    }
  });

  // Check for active Supabase Auth session on initial mount
  useEffect(() => {
    const checkSession = async () => {
      if (!isSupabaseConfigured()) {
        setIsInitialLoading(false);
        return;
      }
      try {
        let sessionUser: User | null = null;
        try {
          sessionUser = await dbLoadSessionUser();
        } catch (sessionErr) {
          console.error("Error calling dbLoadSessionUser:", sessionErr);
        }

        if (sessionUser) {
          setCurrentUser(sessionUser);
          localStorage.setItem("NUCLEO_CURRENT_USER", JSON.stringify(sessionUser));
          setFilterPeriod("today");
          setSalesDateFilter("today");
          setIsInitialLoading(false); // Stop initial loading immediately once user is active
          
          // Trigger remote sync and check register status asynchronously in the background
          triggerRemoteSync(sessionUser).catch((syncErr) => {
            console.error("Background initial triggerRemoteSync failed:", syncErr);
          });
          checkGlobalRegisterStatus(sessionUser.owner_id || sessionUser.id).catch((registerErr) => {
            console.error("Background initial checkGlobalRegisterStatus failed:", registerErr);
          });
        } else {
          // If Supabase auth session is null, check if there is an attendant user saved locally
          const savedLocal = localStorage.getItem("NUCLEO_CURRENT_USER");
          if (savedLocal) {
            try {
              const parsed = JSON.parse(savedLocal);
              if (parsed && parsed.id) {
                const dbUser = await dbVerifyUserSession(parsed.id);
                if (dbUser) {
                  // User exists in custom database users table (e.g., attendant). Preserve current session.
                  setCurrentUser(dbUser);
                  localStorage.setItem("NUCLEO_CURRENT_USER", JSON.stringify(dbUser));
                  setFilterPeriod("today");
                  setSalesDateFilter("today");
                  setIsInitialLoading(false); // Stop loading immediately

                  triggerRemoteSync(dbUser).catch((syncErr) => {
                    console.error("Background initial triggerRemoteSync failed for attendant:", syncErr);
                  });
                  checkGlobalRegisterStatus(dbUser.owner_id || dbUser.id).catch((registerErr) => {
                    console.error("Background initial checkGlobalRegisterStatus failed for attendant:", registerErr);
                  });
                  return;
                }
              }
            } catch (err) {
              console.error("Error verifying database attendant session:", err);
            }
          }
          // If Supabase session is gone and not a valid attendant, clear local state immediately to force login redirect
          setCurrentUser(null);
          localStorage.removeItem("NUCLEO_CURRENT_USER");
          setIsInitialLoading(false);
        }
      } catch (err) {
        console.error("Failed to check active Supabase session on startup:", err);
        // SAFETY REDIRECT: clear state and storage if anything throws, forcing login screen
        setCurrentUser(null);
        localStorage.removeItem("NUCLEO_CURRENT_USER");
        setIsInitialLoading(false);
      }
    };
    checkSession();
  }, []);

  // Listen to Supabase Auth state changes and handle token/session expiration gracefully
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    console.log("[Auth] Registering onAuthStateChange listener to monitor token validity...");
    
    // Flag to prevent multiple consecutive alerts/redirects
    let isRedirecting = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[Auth] Event: ${event}, Session Active: ${!!session}`);

      if (event === "SIGNED_OUT") {
        const savedUser = localStorage.getItem("NUCLEO_CURRENT_USER");
        if (savedUser && !isRedirecting) {
          try {
            const parsed = JSON.parse(savedUser);
            // Verify if user is a standard Auth user. If they are a local attendant who doesn't use Supabase Auth session,
            // we should not log them out just because Supabase Auth signed out.
            const isLocalAttendant = parsed.owner_id && parsed.owner_id !== parsed.id && parsed.role !== "administrador";
            
            if (!isLocalAttendant) {
              isRedirecting = true;
              console.warn("[Auth] Standard Supabase Auth user was signed out. Checking if we can refresh session...");
              
              // Attempt to recover/refresh the session first as a automatic background renewal
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError || !refreshData.session) {
                console.error("[Auth] Session recovery failed. Redirecting to login...", refreshError?.message);
                
                // Show a clear, polite warning toast instead of crashing the system
                addToast("Sua sessão expirou por inatividade. Faça login novamente para continuar com segurança. 🔒", "warning");
                
                // Delay slightly to let the user see the warning, then redirect cleanly without F5
                setTimeout(() => {
                  setCurrentUser(null);
                  localStorage.removeItem("NUCLEO_CURRENT_USER");
                  localStorage.removeItem("NUCLEO_USERS");
                  // Preservar NUCLEO_CASH_REGISTER para que o caixa permaneça aberto o dia todo
                  sessionStorage.clear();
                  isRedirecting = false;
                }, 1800);
              } else {
                console.log("[Auth] Session recovered successfully via onAuthStateChange refresh!");
                addToast("Sua conexão foi restabelecida com sucesso! 🟢", "success");
                isRedirecting = false;
              }
            }
          } catch (err) {
            console.error("[Auth] Error handling SIGNED_OUT event:", err);
            isRedirecting = false;
          }
        }
      } else if (event === "TOKEN_REFRESHED") {
        console.log("[Auth] Session token refreshed successfully in background!");
        addToast("Sua sessão foi revalidada com segurança. 🟢", "info");
      }
    });

    // Highly professional tab focus listener: when the computer/tab wakes up or is focused, 
    // proactively check and renew the session to avoid subsequent database call authorization errors!
    const handleWindowFocus = async () => {
      console.log("[Auth] Tab focused/woken up, proactively validating active session...");
      try {
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        if (activeSession) {
          // Check if token is nearing expiration (e.g., less than 15 minutes remaining)
          const expiresAt = activeSession.expires_at || 0;
          const nowInSecs = Math.floor(Date.now() / 1000);
          const timeRemaining = expiresAt - nowInSecs;
          
          if (timeRemaining < 900) { // Less than 15 minutes
            console.log(`[Auth] Token is expiring in ${timeRemaining}s, initiating automatic proactive refresh...`);
            const { data: refreshRes, error: refreshErr } = await supabase.auth.refreshSession();
            if (refreshErr) {
              console.warn("[Auth] Proactive token refresh failed on focus:", refreshErr.message);
            } else if (refreshRes.session) {
              console.log("[Auth] Proactive token refresh on focus completed successfully!");
            }
          }
        }
      } catch (err) {
        console.error("[Auth] Exception during proactive session check on window focus:", err);
      }
    };

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [currentUser]);

  // Automatic user ID migration to valid UUID to avoid PostgreSQL parse constraints (code 22P02)
  useEffect(() => {
    if (currentUser) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(currentUser.id)) {
        // Deterministically map any non-UUID string to a valid RFC4122 v4 UUID format
        let hex = "";
        for (let i = 0; i < currentUser.id.length; i++) {
          hex += currentUser.id.charCodeAt(i).toString(16);
        }
        hex = hex.padEnd(32, "0").toLowerCase();
        const migratedId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
        
        const migratedUser = { ...currentUser, id: migratedId };
        setCurrentUser(migratedUser);
        localStorage.setItem("NUCLEO_CURRENT_USER", JSON.stringify(migratedUser));

        // Sync list of users
        const savedUsers = localStorage.getItem("NUCLEO_USERS");
        if (savedUsers) {
          try {
            const parsed: User[] = JSON.parse(savedUsers);
            const updated = parsed.map((u) => 
              u.id === currentUser.id || u.username.toLowerCase() === currentUser.username.toLowerCase()
                ? { ...u, id: migratedId }
                : u
            );
            localStorage.setItem("NUCLEO_USERS", JSON.stringify(updated));
          } catch (e) {
            console.error("Error migrating user list:", e);
          }
        }
        console.log(`Successfully migrated user ID from '${currentUser.id}' to valid stable UUID format: '${migratedId}'`);
      }
    }
  }, [currentUser?.id]);

  // Component-level function to trigger remote data synchronization
  const triggerRemoteSync = async (userRecord?: User, isBackground = false, forceAll = false) => {
    const activeUser = userRecord || currentUser;
    if (!activeUser) return;
    if (!isSupabaseConfigured()) return;
    
    // Guard against concurrent execution overlapping
    if (isSyncingRef.current) {
      console.log("Database sync already in progress, skipping duplicate call.");
      return;
    }

    try {
      isSyncingRef.current = true;
      if (!isBackground) {
        setDbSyncing(true);
      }
      console.log(`Starting ${isBackground ? "background" : "foreground"} remote sync with Supabase (forceAll: ${forceAll})...`);

      const companyOwnerId = activeUser.owner_id || activeUser.id; // CRITICAL: Resolve the tenant/company owner ID!

      // Fetch lightweight metadata first for sales and expenses (including cash register row in sales)
      let shouldSyncSales = true;
      let shouldSyncExpenses = true;
      let shouldSyncCashRegister = true;

      // Prepare an array of promises for parallel execution to maximize speed
      const initialPromises: Promise<any>[] = [];
      let metadataPromiseIndex = -1;
      let staticPromiseIndex = -1;

      // 1. Fetch sales and expenses metadata in parallel (if not forcing all)
      if (!forceAll) {
        const supabase = getSupabase();
        if (supabase) {
          metadataPromiseIndex = initialPromises.length;
          initialPromises.push(
            Promise.all([
              supabase
                .from("sales")
                .select("id, date, total_value, client_name")
                .eq("user_id", companyOwnerId),
              supabase
                .from("expenses")
                .select("id, date, value, description")
                .eq("user_id", companyOwnerId),
            ])
          );
        }
      }

      // 2. Fetch static/configuration tables (Company Profile, Goals, Bills, Product Catalog) in parallel
      // We only sync these if we are in the foreground, forceAll is active, or they haven't been loaded yet.
      const shouldSyncStatic = !isBackground || forceAll || companyLoadedForUserId.current !== activeUser.id || !company?.tradingName;
      if (shouldSyncStatic) {
        const supabase = getSupabase();
        staticPromiseIndex = initialPromises.length;
        initialPromises.push(
          Promise.all([
            dbGetCompanyProfile(companyOwnerId),
            dbGetGoals(companyOwnerId),
            supabase ? supabase.from("gastos_mensais").select("*").eq("user_id", companyOwnerId) : Promise.resolve({ data: [], error: null }),
            dbGetCatalogProducts(companyOwnerId),
          ])
        );
      }

      // Execute all initial requests concurrently!
      const initialResults = await Promise.all(initialPromises);

      // Process Metadata Results (to determine if we can skip sales / expenses full downloads)
      if (metadataPromiseIndex !== -1) {
        const metadataRes = initialResults[metadataPromiseIndex];
        if (metadataRes) {
          const [salesMetaRes, expensesMetaRes] = metadataRes;

          if (salesMetaRes && !salesMetaRes.error && salesMetaRes.data) {
            const remoteSalesMeta = salesMetaRes.data;
            const actualSalesMeta = remoteSalesMeta.filter(
              (r: any) => !r.id.startsWith("cash_register_state") && r.id !== "quick_sales_config" && !r.id.startsWith("deletion_audit_log")
            );
            const localSalesCombined = [...salesRef.current, ...budgetsRef.current];

            let salesMismatched = false;
            if (actualSalesMeta.length !== localSalesCombined.length) {
              salesMismatched = true;
            } else {
              const localMap = new Map<string, Sale>();
              for (const s of localSalesCombined) {
                localMap.set(s.id, s);
              }
              for (const r of actualSalesMeta) {
                const local = localMap.get(r.id);
                if (!local) {
                  salesMismatched = true;
                  break;
                }
                if (
                  getLocalDateFromISO(local.date) !== getLocalDateFromISO(r.date) ||
                  Number(local.totalValue) !== Number(r.total_value) ||
                  local.clientName !== r.client_name
                ) {
                  salesMismatched = true;
                  break;
                }
              }
            }

            if (!salesMismatched) {
              shouldSyncSales = false;
              console.log("Sales & budgets are already up-to-date (metadata match). Skipping full fetch!");
            }

            // Check cash register state metadata
            const remoteRegisterRow = remoteSalesMeta.find(
              (r: any) => r.id === `cash_register_state_${companyOwnerId}` || r.id === "cash_register_state" || (typeof r.id === "string" && r.id.startsWith("cash_register_state"))
            );
            const localSyncedRegisterDate = localStorage.getItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE") || "";
            const localHasOpen = cashRegisterRef.current?.currentSession?.status === "aberto";
            if (!localHasOpen) {
              shouldSyncCashRegister = true;
            } else if (remoteRegisterRow) {
              if (remoteRegisterRow.date === localSyncedRegisterDate) {
                shouldSyncCashRegister = false;
                console.log("Cash register is already up-to-date (metadata match). Skipping full fetch!");
              } else {
                localStorage.setItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE_PENDING", remoteRegisterRow.date);
                shouldSyncCashRegister = true;
              }
            } else {
              shouldSyncCashRegister = true;
            }
          }

          if (expensesMetaRes && !expensesMetaRes.error && expensesMetaRes.data) {
            const remoteExpensesMeta = expensesMetaRes.data;
            let expensesMismatched = false;
            if (remoteExpensesMeta.length !== expenses.length) {
              expensesMismatched = true;
            } else {
              const localMap = new Map<string, Expense>();
              for (const e of expenses) {
                localMap.set(e.id, e);
              }
              for (const r of remoteExpensesMeta) {
                const local = localMap.get(r.id);
                if (!local) {
                  expensesMismatched = true;
                  break;
                }
                const localVal = typeof local.value === "string" ? Number(local.value) : local.value;
                if (
                  getLocalDateFromISO(local.date) !== getLocalDateFromISO(r.date) ||
                  Number(localVal) !== Number(r.value) ||
                  local.description !== r.description
                ) {
                  expensesMismatched = true;
                  break;
                }
              }
            }

            if (!expensesMismatched) {
              shouldSyncExpenses = false;
              console.log("Expenses are already up-to-date (metadata match). Skipping full fetch!");
            }
          }
        }
      }

      // Process Static Configuration Results
      if (staticPromiseIndex !== -1) {
        const staticRes = initialResults[staticPromiseIndex];
        if (staticRes) {
          const [remoteCompany, remoteGoals, staticBillsRes, staticProductsRes] = staticRes;

          // 2.1 Company Profile
          companyLoadedForUserId.current = activeUser.id; // Mark as loaded for this active user ID to allow safe auto-sync later
          if (remoteCompany) {
            setCompany(remoteCompany);
            localStorage.setItem("NUCLEO_COMPANY_PROFILE", JSON.stringify(remoteCompany));
          } else {
            setCompany(cleanDefaultCompanyProfile);
            localStorage.setItem("NUCLEO_COMPANY_PROFILE", JSON.stringify(cleanDefaultCompanyProfile));
          }

          // 2.2 Goals
          if (remoteGoals) {
            setGoalValue(remoteGoals.goalValue);
            setGoalType(remoteGoals.goalType);
            setNotifiedGoalValue(remoteGoals.notifiedGoalValue);
            setNotifiedGoalDate(remoteGoals.notifiedGoalDate);
            
            localStorage.setItem("NUCLEO_GOAL_VALUE", String(remoteGoals.goalValue));
            localStorage.setItem("NUCLEO_GOAL_TYPE", remoteGoals.goalType);
            localStorage.setItem("NUCLEO_NOTIFIED_GOAL_VALUE", String(remoteGoals.notifiedGoalValue));
            localStorage.setItem("NUCLEO_NOTIFIED_GOAL_DATE", remoteGoals.notifiedGoalDate);
          }

          // 2.3 Monthly Bills
          if (staticBillsRes && !staticBillsRes.error && staticBillsRes.data) {
            const mappedBills: MonthlyBill[] = staticBillsRes.data.map((d: any) => ({
              id: d.id,
              name: d.name || d.description || d.titulo || d.nome || "",
              value: Number(d.value || d.valor || 0),
              category: d.category || d.categoria || "Outros",
              dueDate: d.due_date || d.dueDate || d.vencimento || "",
              observation: d.observation || d.observacao || ""
            }));
            setBills(mappedBills);
            localStorage.setItem("NUCLEO_MONTHLY_BILLS", JSON.stringify(mappedBills));
          }

          // 2.4 Product Catalog
          if (staticProductsRes && Array.isArray(staticProductsRes) && staticProductsRes.length > 0) {
            setCatalogProducts(staticProductsRes);
            try { localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(staticProductsRes)); } catch (e) {}
          } else if (staticProductsRes && !staticProductsRes.error && staticProductsRes.data) {
            const mappedProducts: CatalogProduct[] = staticProductsRes.data.map((d: any) => {
              const cost = Number(d.cost_price ?? d.costPrice ?? d.preco_custo ?? d.valor_custo ?? 0);
              const sale = Number(d.sale_price ?? d.salePrice ?? d.preco_venda ?? d.valor_venda ?? 0);
              return {
                id: d.id,
                description: d.description || d.name || d.nome || d.descricao || "",
                costPrice: cost,
                salePrice: sale,
                profit: sale - cost,
                minStock: Number(d.min_stock ?? d.minStock ?? d.estoque_minimo ?? 0),
                currentStock: Number(d.current_stock ?? d.currentStock ?? d.estoque_atual ?? 0)
              };
            });
            setCatalogProducts(mappedProducts);
            try { localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(mappedProducts)); } catch (e) {}
          }
        }
      }

      // 3. Fetch actual Sales, Expenses and/or Cash Register States in parallel if they are mismatched/outdated
      const dataPromises: Promise<any>[] = [];
      let salesPromiseIdx = -1;
      let expensesPromiseIdx = -1;
      let registerPromiseIdx = -1;

      if (shouldSyncSales) {
        salesPromiseIdx = dataPromises.length;
        dataPromises.push(dbGetSales(companyOwnerId));
      }
      if (shouldSyncExpenses) {
        expensesPromiseIdx = dataPromises.length;
        dataPromises.push(dbGetExpenses(companyOwnerId));
      }
      if (shouldSyncCashRegister) {
        registerPromiseIdx = dataPromises.length;
        dataPromises.push(dbGetCashRegister(companyOwnerId));
      }

      // If we have any data to pull, execute them in parallel!
      if (dataPromises.length > 0) {
        const dataResults = await Promise.all(dataPromises);

        // 3.1 Sync Sales & Budgets
        if (salesPromiseIdx !== -1) {
          const remoteSales = dataResults[salesPromiseIdx];
          if (remoteSales) {
            const finalSales = remoteSales.filter((s: any) => !s.isBudget);
            const finalBudgets = remoteSales.filter((s: any) => s.isBudget);
            
            // PROTEÇÃO CRÍTICA: Mesclar com vendas locais para NUNCA apagar vendas registradas localmente!
            setSales((prevLocalSales) => {
              const remoteMap = new Map<string, Sale>();
              finalSales.forEach((s: Sale) => remoteMap.set(s.id, s));

              // Manter todas as vendas que estão na máquina local mas ainda não no retorno remoto
              const localPendingSales = prevLocalSales.filter((s) => !remoteMap.has(s.id));
              if (localPendingSales.length > 0) {
                console.warn(`[Sync Protection] Preservando ${localPendingSales.length} vendas locais recém-registradas. Sincronizando com servidor...`);
                localPendingSales.forEach((pending) => {
                  dbSaveSale(companyOwnerId, pending).catch((err) => console.error("Error auto-saving pending local sale:", err));
                });
              }

              const merged = [...localPendingSales, ...finalSales];
              localStorage.setItem("NUCLEO_SALES", JSON.stringify(merged));
              return merged;
            });

            setBudgets((prevLocalBudgets) => {
              const remoteMap = new Map<string, Sale>();
              finalBudgets.forEach((b: Sale) => remoteMap.set(b.id, b));
              const localPendingBudgets = prevLocalBudgets.filter((b) => !remoteMap.has(b.id));
              const merged = [...localPendingBudgets, ...finalBudgets];
              localStorage.setItem("NUCLEO_BUDGETS", JSON.stringify(merged));
              return merged;
            });
          }
        }

        // 3.2 Sync Expenses
        if (expensesPromiseIdx !== -1) {
          const remoteExpenses = dataResults[expensesPromiseIdx];
          if (remoteExpenses) {
            setExpenses(remoteExpenses);
            localStorage.setItem("NUCLEO_EXPENSES", JSON.stringify(remoteExpenses));
          }
        }

        // 3.3 Sync Cash Register
        if (registerPromiseIdx !== -1) {
          const remote = dataResults[registerPromiseIdx];
          if (remote) {
            const currentLocal = cashRegisterRef.current;
            let localHasActive = !!currentLocal?.currentSession && currentLocal.currentSession.status === "aberto";
            if (!localHasActive) {
              try {
                const saved = localStorage.getItem("NUCLEO_CASH_REGISTER");
                if (saved) {
                  const p = JSON.parse(saved);
                  if (p?.currentSession?.status === "aberto") {
                    localHasActive = true;
                    cashRegisterRef.current = p;
                  }
                }
              } catch (e) {}
            }
            const remoteHasActive = !!remote?.currentSession && remote.currentSession.status === "aberto";

            if (localHasActive) {
              // Caixa local está aberto! NUNCA fechar automaticamente!
              // Só aceitar fechamento remoto se a MESMA sessão local tiver sido marcada explicitamente como fechada no histórico remoto:
              const localSessionId = (cashRegisterRef.current?.currentSession?.id) || "";
              const isExplicitlyClosedInRemote = !!localSessionId && (remote.history || []).some((s: any) => s.id === localSessionId && s.status === "fechado");

              if (isExplicitlyClosedInRemote) {
                // Legitimate remote closure da mesma sessão
                setCashRegister(remote);
                cashRegisterRef.current = remote;
                setIsGlobalRegisterOpen(false);
                localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remote));
              } else {
                // Preservar a sessão local aberta e garantir que ela esteja salva no servidor
                console.log("[Cash Register Sync] Preservando caixa local aberto ativo.");
                const combinedState: CashRegisterState = {
                  currentSession: cashRegisterRef.current!.currentSession,
                  history: remote.history && remote.history.length > 0 ? remote.history : (cashRegisterRef.current?.history || [])
                };
                setCashRegister(combinedState);
                cashRegisterRef.current = combinedState;
                setIsGlobalRegisterOpen(true);
                localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(combinedState));
                dbSaveCashRegister(companyOwnerId, combinedState).catch(console.error);
              }
            } else {
              // Local está fechado
              if (remoteHasActive) {
                // Outro operador ou admin abriu o caixa no servidor: adotar
                setCashRegister(remote);
                cashRegisterRef.current = remote;
                setIsGlobalRegisterOpen(true);
                localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remote));
              } else {
                // Ambos fechados
                setCashRegister(remote);
                cashRegisterRef.current = remote;
                setIsGlobalRegisterOpen(false);
                localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remote));
              }
            }

            // Persist the synced date we stored as pending
            const pendingDate = localStorage.getItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE_PENDING");
            if (pendingDate) {
              localStorage.setItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE", pendingDate);
              localStorage.removeItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE_PENDING");
            } else {
              // Fetch date row again or fallback
              const supabase = getSupabase();
              if (supabase) {
                const { data } = await supabase
                  .from("sales")
                  .select("date")
                  .in("id", [`cash_register_state_${companyOwnerId}`, "cash_register_state"])
                  .eq("user_id", companyOwnerId)
                  .maybeSingle();
                if (data?.date) {
                  localStorage.setItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE", data.date);
                }
              }
            }
          }
        }
      }

      // 4. Update the global register open status state from database or active state
      await checkGlobalRegisterStatus(companyOwnerId);

      console.log(`Supabase remote sync completed successfully! (${isBackground ? "background" : "foreground"})`);

      // Play upbeat startup sound only for first/manual sync
      if (!isBackground && soundEnabled) {
        setTimeout(() => {
          playLoginBeep();
        }, 500);
      }
    } finally {
      if (!isBackground) {
        setDbSyncing(false);
      }
      setIsInitialLoading(false);
      isSyncingRef.current = false;
    }
  };

  // Auto-sync remote data from Supabase once on database session start / user change
  useEffect(() => {
    if (currentUser) {
      triggerRemoteSync(currentUser);
    }
  }, [currentUser]);

  // Active real-time background sync loop to keep data perfectly synchronized across multiple machines (every 15s fallback)
  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured()) return;

    console.log("Registering active real-time background synchronization interval (15s fallback)...");
    
    const syncInterval = setInterval(() => {
      triggerRemoteSync(currentUser, true);
    }, 15000); // Polls every 15 seconds in the background as a lightweight connection-drop failsafe

    return () => {
      clearInterval(syncInterval);
    };
  }, [currentUser]);

  // Automatic cash register auto-closing COMPLETELY DISABLED: Cash register stays open until manually closed by user
  useEffect(() => {
    // Intentionally left empty - cash register must remain open once opened until manual closure
  }, []);

  // Busca e sincroniza vendas e orçamentos da tabela 'sales' em tempo real
  const fetchSales = useCallback(async () => {
    if (!currentUser || !isSupabaseConfigured()) return;
    const companyOwnerId = currentUser.owner_id || currentUser.id;
    if (!companyOwnerId) return;

    try {
      console.log("[Supabase Realtime] Executando fetchSales() automaticamente...");
      const remoteSales = await dbGetSales(companyOwnerId);
      if (remoteSales) {
        const finalSales = remoteSales.filter((s: any) => !s.isBudget);
        const finalBudgets = remoteSales.filter((s: any) => s.isBudget);

        setSales((prevLocalSales) => {
          const remoteMap = new Map<string, Sale>();
          finalSales.forEach((s: Sale) => remoteMap.set(s.id, s));
          const localPending = prevLocalSales.filter((s) => !remoteMap.has(s.id));
          const merged = [...localPending, ...finalSales];
          localStorage.setItem("NUCLEO_SALES", JSON.stringify(merged));
          salesRef.current = merged;
          return merged;
        });

        setBudgets((prevLocalBudgets) => {
          const remoteMap = new Map<string, Sale>();
          finalBudgets.forEach((b: Sale) => remoteMap.set(b.id, b));
          const localPending = prevLocalBudgets.filter((b) => !remoteMap.has(b.id));
          const merged = [...localPending, ...finalBudgets];
          localStorage.setItem("NUCLEO_BUDGETS", JSON.stringify(merged));
          budgetsRef.current = merged;
          return merged;
        });
      }
    } catch (err) {
      console.error("[Realtime] Erro ao buscar vendas via fetchSales:", err);
    }
  }, [currentUser]);

  // Busca e sincroniza despesas da tabela 'expenses' em tempo real
  const fetchExpenses = useCallback(async () => {
    if (!currentUser || !isSupabaseConfigured()) return;
    const companyOwnerId = currentUser.owner_id || currentUser.id;
    if (!companyOwnerId) return;

    try {
      console.log("[Supabase Realtime] Executando fetchExpenses() automaticamente...");
      const remoteExpenses = await dbGetExpenses(companyOwnerId);
      if (remoteExpenses) {
        setExpenses(remoteExpenses);
        localStorage.setItem("NUCLEO_EXPENSES", JSON.stringify(remoteExpenses));
      }
    } catch (err) {
      console.error("[Realtime] Erro ao buscar despesas via fetchExpenses:", err);
    }
  }, [currentUser]);

  // Estado e contagem de rascunhos para o usuário administrador exclusivo (sistemadevendaadm@gmail.com)
  const [isApplyingStructure, setIsApplyingStructure] = useState<boolean>(false);

  const pendingDraftsCount = useMemo(() => {
    if (currentUser?.email?.toLowerCase().trim() !== "sistemadevendaadm@gmail.com") return 0;
    return catalogProducts.filter((p) => p.status === "rascunho" || p.is_draft).length;
  }, [currentUser, catalogProducts]);

  // Handler para receber e aplicar estrutura global do sistema publicada pelo administrador em tempo real
  const handleApplyRemoteSystemStructure = useCallback((payload: any) => {
    console.log("[Client Realtime] Recebida atualização da estrutura global (configuracoes_sistema):", payload);

    // 1. Se o payload contém snapshot dos produtos, aplica de imediato na memória e armazenamento local
    if (payload?.dados_estrutura?.produtos && Array.isArray(payload.dados_estrutura.produtos)) {
      const newProds = payload.dados_estrutura.produtos;
      setCatalogProducts(newProds);
      try { localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(newProds)); } catch (e) {}
    } else {
      // Recarrega catálogo de produtos do Supabase
      const ownerId = currentUser?.owner_id || currentUser?.id;
      if (ownerId) {
        dbGetCatalogProducts(ownerId).then((prods) => {
          if (prods && prods.length > 0) {
            setCatalogProducts(prods);
          }
        }).catch(console.warn);
      }
    }

    // 2. Se contém snapshot do perfil da empresa / configurações globais
    if (payload?.dados_estrutura?.company) {
      setCompany((prev) => ({ ...prev, ...payload.dados_estrutura.company }));
      try {
        localStorage.setItem("NUCLEO_COMPANY_PROFILE", JSON.stringify(payload.dados_estrutura.company));
      } catch (e) {}
    }

    // 3. Dispara eventos locais para atualização reativa de outros módulos da aplicação
    window.dispatchEvent(new CustomEvent("products_remote_sync", { detail: payload }));
    window.dispatchEvent(new CustomEvent("app_remote_sync", { detail: { table: "configuracoes_sistema", payload } }));

    addToast("✨ Nova estrutura do sistema aplicada com sucesso em tempo real!", "success");
    playAlertSound("info");
  }, [currentUser, addToast, playAlertSound]);

  // Ação exclusiva do administrador (sistemadevendaadm@gmail.com) para aplicar a nova estrutura global
  const handleApplyNewStructure = async () => {
    if (currentUser?.email?.toLowerCase().trim() !== "sistemadevendaadm@gmail.com") {
      addToast("Apenas o administrador do sistema (sistemadevendaadm@gmail.com) pode aplicar a nova estrutura.", "error");
      return;
    }

    const confirmApply = window.confirm(
      "🚀 APLICAR NOVA ESTRUTURA GLOBAL\n\n" +
      "Esta ação atualizará a tabela global 'configuracoes_sistema' no Supabase para ativa e aplicará todas as modificações estruturais e novos produtos instantaneamente para todas as telas dos clientes em tempo real via Supabase Realtime.\n\n" +
      "Deseja aplicar agora?"
    );
    if (!confirmApply) return;

    setIsApplyingStructure(true);
    try {
      const activeProducts = catalogProducts.map((p) => ({
        ...p,
        status: "ativo",
        is_draft: false
      }));

      const structureSnapshot = {
        produtos: activeProducts,
        company: company,
        appliedBy: currentUser.email,
        timestamp: Date.now()
      };

      const res = await dbPublishSystemStructure(currentUser.email, structureSnapshot);

      // Atualiza produtos em memória para o administrador
      setCatalogProducts(activeProducts);
      try { localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(activeProducts)); } catch (e) {}

      addToast(
        `🚀 Nova estrutura ativada com sucesso! ${res.countPublished > 0 ? `${res.countPublished} produto(s) ativados. ` : ""}Todas as telas dos clientes foram sincronizadas em tempo real.`,
        "success"
      );
      playAlertSound("success");
    } catch (err: any) {
      console.error("Erro ao aplicar nova estrutura no Supabase:", err);
      addToast("Falha ao aplicar nova estrutura: " + (err?.message || "Erro desconhecido"), "error");
    } finally {
      setIsApplyingStructure(false);
    }
  };

  // Reactive real-time websocket subscription channels for instant multi-terminal sync
  useEffect(() => {
    // Se o usuário não estiver autenticado (currentUser for null ou undefined), encerra imediatamente para impedir que o .subscribe() seja executado sem sessão ativa
    if (!currentUser || !currentUser.id || !isSupabaseConfigured()) {
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    const companyOwnerId = currentUser?.owner_id || currentUser?.id;

    console.log("[Supabase Realtime] Registrando canais de sincronização em tempo real...");

    // Subscribes to insert, update and delete events on 'sales' and 'expenses' in real-time
    const channel = supabase
      .channel("multi-terminal-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales" },
        (payload) => {
          console.log("[Supabase Realtime] Mudança detectada na tabela 'sales':", payload.eventType);

          // Se for atualização do estado do caixa compartilhado (gravado como item de controle)
          if (
            payload.new &&
            String((payload.new as any).id || "").startsWith("cash_register_state") &&
            (payload.eventType === "UPDATE" || payload.eventType === "INSERT")
          ) {
            try {
              let remoteState = (payload.new as any).items as any;
              if (typeof remoteState === "string") {
                try { remoteState = JSON.parse(remoteState); } catch (e) {}
              }
              if (remoteState && typeof remoteState === "object") {
                const remoteIsOpen = !!remoteState?.currentSession && remoteState.currentSession.status === "aberto";
                const currentLocal = cashRegisterRef.current;
                let localIsOpen = !!currentLocal?.currentSession && currentLocal.currentSession.status === "aberto";
                if (!localIsOpen) {
                  try {
                    const saved = localStorage.getItem("NUCLEO_CASH_REGISTER");
                    if (saved) {
                      const p = JSON.parse(saved);
                      if (p?.currentSession?.status === "aberto") {
                        localIsOpen = true;
                        cashRegisterRef.current = p;
                      }
                    }
                  } catch (e) {}
                }

                if (remoteIsOpen) {
                  setCashRegister(remoteState);
                  cashRegisterRef.current = remoteState;
                  setIsGlobalRegisterOpen(true);
                  localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remoteState));
                  if ((payload.new as any).date) {
                    localStorage.setItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE", (payload.new as any).date);
                  }
                  return;
                }

                if (localIsOpen && !remoteIsOpen) {
                  const localSessionId = currentLocal?.currentSession?.id;
                  const isExplicitlyClosedInRemote = !!localSessionId && (remoteState.history || []).some(
                    (s: any) => s.id === localSessionId && s.status === "fechado"
                  );
                  if (!isExplicitlyClosedInRemote) {
                    console.warn("[Realtime Cash Register] Rejeitando fechamento remoto; mantendo caixa local aberto.");
                    return;
                  }
                }

                setCashRegister(remoteState);
                cashRegisterRef.current = remoteState;
                setIsGlobalRegisterOpen(remoteIsOpen);
                localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remoteState));
                if ((payload.new as any).date) {
                  localStorage.setItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE", (payload.new as any).date);
                }
                return;
              }
            } catch (err) {
              console.error("Failed to parse real-time cash register update:", err);
            }
          }

          // Se for exclusão de venda no Supabase, remover imediatamente da memória local
          if (payload.eventType === "DELETE" && payload.old && (payload.old as any).id) {
            const deletedId = String((payload.old as any).id);
            if (!deletedId.startsWith("cash_register_state") && deletedId !== "quick_sales_config") {
              setSales((prev) => prev.filter((s) => s.id !== deletedId));
              setBudgets((prev) => prev.filter((b) => b.id !== deletedId));
            }
          }

          // Executa fetchSales() automaticamente para atualizar a tela
          fetchSales();
          triggerRemoteSync(currentUser, true);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "produtos" },
        (payload) => {
          console.log("[Supabase Realtime] Mudança detectada na tabela real 'produtos':", payload.eventType);
          // 1. Atualização instantânea em memória se for inserção ou atualização
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            if (payload.new) {
              const row = payload.new as any;
              const mappedProduct = {
                id: row.id,
                name: row.nome || row.name || row.descricao || "Produto",
                description: row.descricao || row.description || "",
                costPrice: Number(row.preco_custo ?? row.cost_price ?? row.preco_compra) || 0,
                salePrice: Number(row.preco_venda ?? row.sale_price ?? row.preco) || 0,
                currentStock: Number(row.estoque_atual ?? row.current_stock ?? row.estoque) || 0,
                minStock: Number(row.estoque_minimo ?? row.min_stock) || 0,
                unit: row.unidade || row.unit || "un",
                category: row.categoria || row.category || "Geral",
                isCatalogItem: true
              };

              setCatalogProducts((prev) => {
                const existingIndex = prev.findIndex((p) => p.id === mappedProduct.id);
                let updated: any[];
                if (existingIndex >= 0) {
                  updated = [...prev];
                  updated[existingIndex] = { ...updated[existingIndex], ...mappedProduct };
                } else {
                  updated = [mappedProduct, ...prev];
                }
                try {
                  localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(updated));
                } catch (e) {}
                return updated;
              });
            }
          } else if (payload.eventType === "DELETE" && payload.old && (payload.old as any).id) {
            const delId = (payload.old as any).id;
            setCatalogProducts((prev) => {
              const updated = prev.filter((p) => p.id !== delId);
              try {
                localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(updated));
              } catch (e) {}
              return updated;
            });
          }

          // 2. Dispara eventos e recarrega produtos para garantir consistência
          window.dispatchEvent(new CustomEvent("products_remote_sync", { detail: payload }));
          window.dispatchEvent(new CustomEvent("app_remote_sync", { detail: { table: "produtos", payload } }));
          triggerRemoteSync(currentUser, true, true);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        (payload) => {
          console.log("[Supabase Realtime] Mudança detectada na tabela 'expenses':", payload.eventType);
          fetchExpenses();
          triggerRemoteSync(currentUser, true);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessoes_caixa"
        },
        (payload) => {
          console.log("[Supabase Realtime] Mudança detectada na tabela 'sessoes_caixa':", payload.eventType, payload.new);
          const companyOwnerId = currentUser?.owner_id || currentUser?.id;
          const targetRow = (payload.new || payload.old) as any;
          if (companyOwnerId && targetRow) {
            const rowOwner = targetRow.company_id || targetRow.user_id;
            if (rowOwner && rowOwner !== companyOwnerId) {
              return; // Event is for a different organization
            }
          }

          // Atualização reativa imediata do estado do caixa para múltiplos terminais
          if (payload.eventType === "DELETE") {
            setIsGlobalRegisterOpen(false);
            setCashRegister((prev) => {
              const updated = { ...prev, currentSession: null };
              cashRegisterRef.current = updated;
              try { localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated)); } catch (e) {}
              return updated;
            });
            window.dispatchEvent(new CustomEvent("cash_register_remote_sync", { detail: payload }));
            return;
          } else if (payload.new) {
            const row = payload.new as any;
            const isOpenOrActive = isCashSessionActiveOrOpen(row);
            const isClosed = isCashSessionExplicitlyClosed(row);

            if (isOpenOrActive) {
              console.log("[Supabase Realtime] Sessão de caixa confirmada como ABERTA/ATIVA:", row.id);
              const openSession: CashRegisterSession = {
                id: row.id || row.session_id || ("session_" + Date.now()),
                status: "aberto",
                valorAbertura: Number(row.valor_abertura ?? row.valor_inicial ?? row.fundo_troco) || 0,
                dataAbertura: row.data_abertura || row.created_at || new Date().toISOString(),
                operador: row.operador || row.usuario || "Operador"
              };

              setIsGlobalRegisterOpen(true);
              setCashRegister((prev) => {
                const updated: CashRegisterState = {
                  currentSession: openSession,
                  history: prev?.history || []
                };
                cashRegisterRef.current = updated;
                try {
                  localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated));
                  localStorage.setItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE", openSession.dataAbertura);
                } catch (e) {}
                return updated;
              });

              // CRÍTICO: Previne conflito com verificações iniciais e múltiplos gatilhos que fechavam o caixa sozinhos.
              // Como a sessão foi validada ativamente como aberta a partir do evento em tempo real da tabela sessoes_caixa,
              // mantemos o estado de "Caixa Aberto" na tela e evitamos invocar checkGlobalRegisterStatus ou triggerRemoteSync concorrentes.
              window.dispatchEvent(new CustomEvent("cash_register_remote_sync", { detail: payload }));
              return;
            } else if (isClosed) {
              console.log("[Supabase Realtime] Sessão de caixa confirmada como FECHADA:", row.id);
              const currentLocalId = cashRegisterRef.current?.currentSession?.id;
              // Apenas fechar se a sessão que foi fechada for a mesma sessão ativa deste terminal
              if (!currentLocalId || row.id === currentLocalId) {
                setIsGlobalRegisterOpen(false);
                setCashRegister((prev) => {
                  const updated: CashRegisterState = {
                    currentSession: null,
                    history: prev?.history || []
                  };
                  cashRegisterRef.current = updated;
                  try {
                    localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated));
                    if (row.data_fechamento) {
                      localStorage.setItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE", row.data_fechamento);
                    }
                  } catch (e) {}
                  return updated;
                });
                window.dispatchEvent(new CustomEvent("cash_register_remote_sync", { detail: payload }));
                return;
              }
            }
          }

          if (companyOwnerId) {
            checkGlobalRegisterStatus(companyOwnerId);
          }
          fetchSales();
          window.dispatchEvent(new CustomEvent("cash_register_remote_sync", { detail: payload }));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "historico_caixas" },
        (payload) => {
          console.log("[Supabase Realtime] Mudança detectada na tabela 'historico_caixas':", payload.eventType);
          const companyOwnerId = currentUser?.owner_id || currentUser?.id;
          if (companyOwnerId) {
            dbGetCashRegister(companyOwnerId).then((latestState) => {
              if (latestState) {
                setCashRegister((prev) => {
                  const currentOpen = (prev?.currentSession && isCashSessionActiveOrOpen(prev.currentSession))
                    ? prev.currentSession
                    : (cashRegisterRef.current?.currentSession && isCashSessionActiveOrOpen(cashRegisterRef.current.currentSession) ? cashRegisterRef.current.currentSession : latestState.currentSession);
                  const updated = {
                    currentSession: currentOpen,
                    history: latestState.history || prev?.history || []
                  };
                  cashRegisterRef.current = updated;
                  try {
                    localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated));
                  } catch (e) {}
                  return updated;
                });
              }
            }).catch(console.error);
          }
          window.dispatchEvent(new CustomEvent("cash_register_remote_sync", { detail: payload }));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        (payload) => {
          if (
            (payload.table === "fluxo_caixa" || payload.table === "fluxo_de_caixa") &&
            payload.new
          ) {
            const companyOwnerId = currentUser?.owner_id || currentUser?.id;
            if (companyOwnerId) {
              checkGlobalRegisterStatus(companyOwnerId);
            }
          }

          const isStaticTable =
            payload.table === "produtos" ||
            payload.table === "clientes" ||
            payload.table === "goals" ||
            payload.table === "gastos_mensais" ||
            payload.table === "company_profile" ||
            payload.table === "configuracoes_sistema";

          if (isStaticTable) {
            triggerRemoteSync(currentUser, true, true);
            if (payload.table === "produtos") {
              window.dispatchEvent(new CustomEvent("products_remote_sync", { detail: payload }));
            }
            if (payload.table === "clientes") {
              window.dispatchEvent(new CustomEvent("clients_remote_sync", { detail: payload }));
            }
            if (payload.table === "configuracoes_sistema") {
              console.log("[Supabase Realtime] Tabela configuracoes_sistema alterada:", payload);
              handleApplyRemoteSystemStructure(payload.new || payload);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "configuracoes_sistema" },
        (payload) => {
          console.log("[Supabase Realtime] Evento direto em configuracoes_sistema:", payload.eventType, payload.new);
          handleApplyRemoteSystemStructure(payload.new || payload);
        }
      )
      .on("broadcast", { event: "cash_register_broadcast" }, ({ payload: bcData }) => {
        if (!bcData?.state) return;
        let remoteState = bcData.state;
        if (typeof remoteState === "string") {
          try { remoteState = JSON.parse(remoteState); } catch (e) {}
        }
        if (remoteState && typeof remoteState === "object") {
          const remoteIsOpen = !!remoteState.currentSession && remoteState.currentSession.status === "aberto";
          setCashRegister(remoteState);
          cashRegisterRef.current = remoteState;
          setIsGlobalRegisterOpen(remoteIsOpen);
          localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remoteState));
        }
      })
      .on("broadcast", { event: "sales_broadcast" }, () => {
        fetchSales();
        triggerRemoteSync(currentUser, true);
        window.dispatchEvent(new CustomEvent("sales_remote_sync", { detail: {} }));
        window.dispatchEvent(new CustomEvent("products_remote_sync", { detail: {} }));
      })
      .on("broadcast", { event: "expenses_broadcast" }, () => {
        fetchExpenses();
        triggerRemoteSync(currentUser, true);
        window.dispatchEvent(new CustomEvent("expenses_remote_sync", { detail: {} }));
      })
      .on("broadcast", { event: "products_broadcast" }, () => {
        window.dispatchEvent(new CustomEvent("products_remote_sync", { detail: {} }));
      })
      .on("broadcast", { event: "clients_broadcast" }, () => {
        window.dispatchEvent(new CustomEvent("clients_remote_sync", { detail: {} }));
      })
      .on("broadcast", { event: "system_structure_published" }, ({ payload: bcData }) => {
        console.log("[Supabase Realtime] Broadcast system_structure_published recebido:", bcData);
        handleApplyRemoteSystemStructure(bcData);
      })
      .on("broadcast", { event: "structure_applied" }, ({ payload: bcData }) => {
        console.log("[Supabase Realtime] Broadcast structure_applied recebido:", bcData);
        handleApplyRemoteSystemStructure(bcData);
      })
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ [Supabase Realtime] Conectado e escutando 'sales', 'expenses' e 'configuracoes_sistema' com sucesso!");
        } else if (status === "CHANNEL_ERROR") {
          console.warn("⚠️ [Supabase Realtime] Canal Realtime:", err);
        } else {
          console.log("[Supabase Realtime] Status do canal:", status);
        }
      });

    return () => {
      console.log("Limpando canal de subscrição em tempo real...");
      supabase.removeChannel(channel).then(() => {
        console.log("Canal Realtime removido.");
      }).catch((err) => {
        console.error("Erro ao remover canal Realtime:", err);
      });
    };
  }, [currentUser, fetchSales, fetchExpenses, handleApplyRemoteSystemStructure]);

  // Sincronização multi-terminal garantida diretamente via Supabase Realtime (sem SSE / rotas Vercel legadas)

  // Listener para eventos de sincronização remota via window custom events (app_remote_sync)
  useEffect(() => {
    const handleRemoteEvent = (evt: any) => {
      const d = evt.detail;
      if (
        d?.event === "system_structure_published" ||
        d?.event === "structure_applied" ||
        d?.table === "configuracoes_sistema"
      ) {
        handleApplyRemoteSystemStructure(d?.data || d?.payload || d);
      }
    };
    window.addEventListener("app_remote_sync" as any, handleRemoteEvent);
    return () => {
      window.removeEventListener("app_remote_sync" as any, handleRemoteEvent);
    };
  }, [handleApplyRemoteSystemStructure]);

  // Instant Real-Time Cross-Terminal Synchronizer (SSE Stream + Custom Event Bus)
  useEffect(() => {
    if (!currentUser) return;
    const companyOwnerId = currentUser.owner_id || currentUser.id;
    if (!companyOwnerId) return;

    // 1. Window custom event listener for cash register sync
    const handleCashRegisterSync = (evt: any) => {
      const detail = evt.detail;
      if (detail?.state) {
        const remoteState = detail.state;
        const isOpen = !!remoteState.currentSession && isCashSessionActiveOrOpen(remoteState.currentSession);
        setCashRegister(remoteState);
        cashRegisterRef.current = remoteState;
        setIsGlobalRegisterOpen(isOpen);
        try {
          localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remoteState));
        } catch (e) {}
      } else if (detail?.closed) {
        setIsGlobalRegisterOpen(false);
        setCashRegister((prev) => {
          const updated = { ...prev, currentSession: null };
          cashRegisterRef.current = updated;
          try { localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated)); } catch (e) {}
          return updated;
        });
      } else if (detail?.session) {
        const s = detail.session;
        setIsGlobalRegisterOpen(true);
        setCashRegister((prev) => {
          const updated: CashRegisterState = {
            currentSession: {
              id: s.id || `session_${Date.now()}`,
              status: "aberto",
              valorAbertura: Number(s.valorAbertura) || 0,
              dataAbertura: s.dataAbertura || new Date().toISOString(),
              operador: s.operador || currentUser.name || "Operador"
            },
            history: prev?.history || []
          };
          cashRegisterRef.current = updated;
          try { localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated)); } catch (e) {}
          return updated;
        });
      }
    };

    // 2. Window custom event listener for sales sync
    const handleSalesSync = () => {
      fetchSales();
    };

    window.addEventListener("cash_register_remote_sync" as any, handleCashRegisterSync);
    window.addEventListener("sales_remote_sync" as any, handleSalesSync);

    // 3. Continuous Server-Sent Events (SSE) stream for instant real-time synchronization (<100ms) across machines
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      try {
        const url = `/api/realtime/stream?companyId=${encodeURIComponent(companyOwnerId)}`;
        eventSource = new EventSource(url);

        eventSource.onmessage = (event) => {
          try {
            if (!event.data || event.data.startsWith(":")) return;
            const parsed = JSON.parse(event.data);
            if (parsed.type === "connected") return;

            const evType = parsed.event || parsed.type;
            const data = parsed.data || {};

            if (evType === "cash_register_updated" || evType === "cash_register_broadcast") {
              if (data.state) {
                const remoteState = data.state;
                const isOpen = !!remoteState.currentSession && isCashSessionActiveOrOpen(remoteState.currentSession);
                setCashRegister(remoteState);
                cashRegisterRef.current = remoteState;
                setIsGlobalRegisterOpen(isOpen);
                try {
                  localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remoteState));
                } catch (e) {}
              } else if (data.closed) {
                setIsGlobalRegisterOpen(false);
                setCashRegister((prev) => {
                  const updated = { ...prev, currentSession: null };
                  cashRegisterRef.current = updated;
                  try { localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updated)); } catch (e) {}
                  return updated;
                });
              } else {
                checkGlobalRegisterStatus(companyOwnerId);
              }
            } else if (evType === "sales_updated" || evType === "sales_broadcast") {
              fetchSales();
            } else if (evType === "expenses_updated" || evType === "expenses_broadcast") {
              fetchExpenses();
            } else if (evType === "products_updated" || evType === "products_broadcast") {
              window.dispatchEvent(new CustomEvent("products_remote_sync", { detail: data }));
            } else if (evType === "clients_updated" || evType === "clients_broadcast") {
              window.dispatchEvent(new CustomEvent("clients_remote_sync", { detail: data }));
            }
          } catch (err) {}
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          reconnectTimeout = setTimeout(connectSSE, 3000);
        };
      } catch (e) {}
    };

    connectSSE();

    return () => {
      window.removeEventListener("cash_register_remote_sync" as any, handleCashRegisterSync);
      window.removeEventListener("sales_remote_sync" as any, handleSalesSync);
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [currentUser, fetchSales, fetchExpenses]);

  // Terminal Heartbeat Poller: synchronizes cash register and data across all terminals logged into the account
  useEffect(() => {
    if (!currentUser) return;
    const companyOwnerId = currentUser.owner_id || currentUser.id;
    if (!companyOwnerId || !isSupabaseConfigured()) return;

    const interval = setInterval(() => {
      dbGetCashRegister(companyOwnerId).then((remote) => {
        if (!remote) return;
        const currentLocal = cashRegisterRef.current;
        const localIsOpen = !!currentLocal?.currentSession && isCashSessionActiveOrOpen(currentLocal.currentSession);
        const remoteIsOpen = !!remote.currentSession && isCashSessionActiveOrOpen(remote.currentSession);

        // Case 1: Remote is open, this terminal was closed -> Adopt open register immediately!
        if (remoteIsOpen && !localIsOpen) {
          console.log("[Auto-Sync Terminal] Caixa aberto em outro terminal detectado! Sincronizando...");
          setCashRegister(remote);
          cashRegisterRef.current = remote;
          setIsGlobalRegisterOpen(true);
          localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remote));
        }
        // Case 2: Local is open, remote is closed:
        // ONLY close if the CURRENT local session is explicitly recorded as closed in remote history
        else if (localIsOpen && !remoteIsOpen) {
          const localSessionId = currentLocal?.currentSession?.id;
          const isExplicitlyClosedInRemote = !!localSessionId && (remote.history || []).some(
            (s: any) => s.id === localSessionId && s.status === "fechado"
          );
          if (isExplicitlyClosedInRemote) {
            console.log("[Auto-Sync Terminal] Sessão atual foi fechada.");
            setCashRegister(remote);
            cashRegisterRef.current = remote;
            setIsGlobalRegisterOpen(false);
            localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remote));
          } else {
            // Local is legitimately open; re-affirm open state to server to prevent unexpected closure
            dbSaveCashRegister(companyOwnerId, currentLocal!).catch(console.error);
          }
        }
        // Case 3: Both open, sync session if different session id
        else if (localIsOpen && remoteIsOpen) {
          if (remote.currentSession?.id !== currentLocal?.currentSession?.id) {
            setCashRegister(remote);
            cashRegisterRef.current = remote;
            setIsGlobalRegisterOpen(true);
            localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remote));
          }
        }
      }).catch(() => {});
    }, 4000);

    return () => clearInterval(interval);
  }, [currentUser]);

  // Trigger Daily Goal prompt registration suggestion once per day on first load/login! Removed to not prompt automatically on login.
  useEffect(() => {
    // Automated auto-trigger modal removed by user request
  }, [currentUser]);

  // Keep todaysDeliveries synchronized whenever sales load or update!
  useEffect(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    const dueToday = sales.filter(s => {
      if (s.isBudget) return false;
      if (!s.deliveryDate) return false;

      let dClean = String(s.deliveryDate).replace(/['"]/g, "").trim();
      if (dClean.includes("T")) dClean = dClean.split("T")[0];
      if (dClean.includes(" ")) dClean = dClean.split(" ")[0];
      if (dClean.includes("/")) {
        const p = dClean.split("/");
        if (p.length === 3 && p[2].length === 4) {
          dClean = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        }
      }
      const isToday = dClean.substring(0, 10) === todayStr;
      // It needs to be delivered today if not yet marked as delivered, or if it still has a balance due
      return isToday && (!s.materialEntregue || s.balanceDue > 0);
    });
    setTodaysDeliveries(dueToday);
  }, [sales]);

  // Pre-fill rescheduling fields when a sale is selected
  useEffect(() => {
    if (reschedulingSale) {
      setNewDeliveryDate(reschedulingSale.deliveryDate || "");
      setNewDeliveryReason(reschedulingSale.deliveryReason || "");
    }
  }, [reschedulingSale]);

  const handleConfirmReschedule = () => {
    if (!reschedulingSale) return;
    if (!newDeliveryDate) {
      addToast("Por favor, selecione uma data de entrega válida.", "error");
      return;
    }

    const updatedSale: Sale = {
      ...reschedulingSale,
      deliveryDate: newDeliveryDate,
      deliveryReason: newDeliveryReason.trim() || undefined
    };

    handleSaleSaved(updatedSale);
    addToast(`🚚 Entrega de ${reschedulingSale.clientName} atualizada para ${newDeliveryDate.split("-").reverse().join("/")}!`, "success");
    setReschedulingSale(null);
  };

  const handleConfirmDeliveryOnly = (sale: Sale) => {
    const updatedSale: Sale = {
      ...sale,
      materialEntregue: true,
    };
    handleSaleSaved(updatedSale);
    addToast(`📦 Material entregue com sucesso para ${sale.clientName}!`, "success");
    playAlertSound("success");
  };

  const handleLogisticsQuickBaja = (sale: Sale) => {
    const amountPaidNow = sale.balanceDue;
    if (amountPaidNow <= 0) {
      handleConfirmDeliveryOnly(sale);
      return;
    }

    const updatedDownPayment = sale.downPayment + amountPaidNow;
    const updatedBalanceDue = 0;
    const updatedNetProfit = sale.totalValue - sale.operationCost;

    const currentPayments = sale.payments && sale.payments.length > 0 
      ? sale.payments 
      : (sale.downPayment > 0 
          ? [{
              id: Math.random().toString(36).substring(2, 9).toUpperCase(),
              amount: sale.downPayment,
              date: sale.date || new Date().toISOString(),
              method: sale.paymentMethod || 'dinheiro' as const
            }]
          : []
        );

    const updatedPayments = [...currentPayments, {
      id: Math.random().toString(36).substring(2, 9).toUpperCase(),
      amount: amountPaidNow,
      date: new Date().toISOString(),
      method: sale.paymentMethod || 'dinheiro' as const
    }];

    const originalOrderDate = sale.orderDate || (sale.date ? getLocalDateFromISO(sale.date) : getLocalDateFromISO(new Date().toISOString()));

    const updatedSale: Sale = {
      ...sale,
      downPayment: updatedDownPayment,
      balanceDue: updatedBalanceDue,
      netProfit: updatedNetProfit,
      payments: updatedPayments,
      orderDate: originalOrderDate,
      materialEntregue: true,
    };

    handleSaleSaved(updatedSale);
    addToast(`✅ Baixa e entrega registradas para ${sale.clientName}! Saldo recebido: R$ ${amountPaidNow.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`, "success");
    playAlertSound("success");
  };

  // Trigger Daily Delivery reminder once per day when sales are loaded/synced
  useEffect(() => {
    if (!currentUser || sales.length === 0) return;
    const localDate = new Date();
    const todayStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
    const lastDeliveryAlertDate = localStorage.getItem("NUCLEO_LAST_DELIVERY_ALERT_DATE");

    if (lastDeliveryAlertDate !== todayStr) {
      const dueToday = sales.filter(s => !s.isBudget && s.deliveryDate === todayStr && s.balanceDue > 0);
      if (dueToday.length > 0) {
        setShowDeliveryDueOverlay(true);
        setTimeout(() => {
          playGoalBeep();
        }, 850);
      }
    }
  }, [sales, currentUser]);

  const todaysMaterialsCount = React.useMemo(() => {
    return todaysDeliveries.reduce((sum, sale) => {
      if (!sale.items) return sum;
      return sum + sale.items.reduce((s, item) => s + item.quantity, 0);
    }, 0);
  }, [todaysDeliveries]);

  const isDateInCurrentWeek = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const target = new Date(dateStr + "T12:00:00");
    if (isNaN(target.getTime())) return false;
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - currentDayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return target >= startOfWeek && target <= endOfWeek;
  };

  const isDateInCurrentMonth = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const target = new Date(dateStr + "T12:00:00");
    if (isNaN(target.getTime())) return false;
    const now = new Date();
    return target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth();
  };

  const [filterPeriod, setFilterPeriod] = useState<"all" | "today" | "week" | "month" | "custom">("today");
  const [customDate, setCustomDate] = useState<string>(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [salesStatusFilter, setSalesStatusFilter] = useState<"all" | "pending" | "paid" >("all");
  const [salesDateFilter, setSalesDateFilter] = useState<"today" | "week" | "month" | "all" | "custom">("today");

  // Sync filterPeriod and salesDateFilter to make the dashboard unified
  React.useEffect(() => {
    if (filterPeriod === "today" && salesDateFilter !== "today") {
      setSalesDateFilter("today");
    } else if (filterPeriod === "custom" && salesDateFilter !== "custom") {
      setSalesDateFilter("custom");
    } else if (filterPeriod === "week" && salesDateFilter !== "week") {
      setSalesDateFilter("week");
    } else if (filterPeriod === "month" && salesDateFilter !== "month") {
      setSalesDateFilter("month");
    } else if (filterPeriod === "all" && salesDateFilter !== "all") {
      setSalesDateFilter("all");
    }
  }, [filterPeriod]);

  React.useEffect(() => {
    if (salesDateFilter === "today" && filterPeriod !== "today") {
      setFilterPeriod("today");
    } else if (salesDateFilter === "custom" && filterPeriod !== "custom") {
      setFilterPeriod("custom");
    } else if (salesDateFilter === "week" && filterPeriod !== "week") {
      setFilterPeriod("week");
    } else if (salesDateFilter === "month" && filterPeriod !== "month") {
      setFilterPeriod("month");
    } else if (salesDateFilter === "all" && filterPeriod !== "all") {
      setFilterPeriod("all");
    }
  }, [salesDateFilter]);

  const filteredSales = React.useMemo(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setHours(0, 0, 0, 0);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return sales.filter((sale) => {
      if (!sale.date) return false;

      // Filter by status if salesStatusFilter is active
      if (salesStatusFilter === "pending") {
        if (!isPendingRetiradaOrBaixa(sale)) return false;
      } else if (salesStatusFilter === "paid") {
        if ((sale.balanceDue || 0) > 0.001) return false;
      }

      // Filter by date
      const createdDate = getLocalDateFromISO(sale.date);
      const orderDateClean = sale.orderDate ? getLocalDateFromISO(sale.orderDate) : "";

      if (filterPeriod === "today") {
        return createdDate === todayStr || orderDateClean === todayStr;
      }
      if (filterPeriod === "week") {
        return (
          new Date(sale.date) >= oneWeekAgo ||
          (orderDateClean ? isDateInCurrentWeek(orderDateClean) : false)
        );
      }
      if (filterPeriod === "month") {
        return (
          isDateInCurrentMonth(createdDate) ||
          (orderDateClean ? isDateInCurrentMonth(orderDateClean) : false)
        );
      }
      if (filterPeriod === "custom") {
        if (customStartDate && customEndDate) {
          return (
            (createdDate >= customStartDate && createdDate <= customEndDate) ||
            (orderDateClean >= customStartDate && orderDateClean <= customEndDate)
          );
        }
        return (
          createdDate === customDate ||
          orderDateClean === customDate
        );
      }
      return true;
    });
  }, [sales, filterPeriod, salesStatusFilter, customDate, customStartDate, customEndDate]);

  const filteredExpenses = React.useMemo(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setHours(0, 0, 0, 0);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return expenses.filter((exp) => {
      if (!exp.date) return false;
      const expLocalDate = getLocalDateFromISO(exp.date);
      if (filterPeriod === "today") {
        return expLocalDate === todayStr;
      }
      if (filterPeriod === "week") {
        return new Date(exp.date) >= oneWeekAgo;
      }
      if (filterPeriod === "custom") {
        if (customStartDate && customEndDate) {
          return expLocalDate >= customStartDate && expLocalDate <= customEndDate;
        }
        return expLocalDate === customDate;
      }
      return true;
    });
  }, [expenses, filterPeriod, customDate, customStartDate, customEndDate]);

  const currentBoxBalance = React.useMemo(() => {
    let totalInflow = 0;
    
    // Help verify inline date
    const localDate = new Date();
    const todayStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
    const targetDateStr = filterPeriod === "custom" && customDate ? customDate : todayStr;
    const oneWeekAgo = new Date();
    oneWeekAgo.setHours(0, 0, 0, 0);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const isDateInPeriod = (dateStr: string): boolean => {
      if (!dateStr) return false;
      const itemLocalDate = getLocalDateFromISO(dateStr);
      if (filterPeriod === "today") return itemLocalDate === todayStr;
      if (filterPeriod === "custom") {
        if (customStartDate && customEndDate) {
          return itemLocalDate >= customStartDate && itemLocalDate <= customEndDate;
        }
        return itemLocalDate === targetDateStr;
      }
      if (filterPeriod === "week") {
        try { return new Date(dateStr) >= oneWeekAgo; } catch (e) { return false; }
      }
      return true;
    };

    sales.forEach(sale => {
      if (sale.isBudget) return;
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach(payment => {
          if (isDateInPeriod(payment.date)) {
            totalInflow += payment.amount;
          }
        });
      } else {
        if (sale.downPayment > 0 && isDateInPeriod(sale.date)) {
          totalInflow += sale.downPayment;
        }
      }
    });

    const totalSaleOperationCost = sales
      .filter((s) => !s.isBudget)
      .reduce((sum, sale) => {
        const orderDate = getSaleOrderDate(sale);
        if (isDateInPeriod(orderDate)) {
          return sum + getSaleOperationCost(sale);
        }
        return sum;
      }, 0);

    const totalSpent = filteredExpenses.reduce((acc, e) => acc + e.value, 0) + totalSaleOperationCost;
    return totalInflow - totalSpent;
  }, [sales, filteredExpenses, filterPeriod, customDate, customStartDate, customEndDate]);

  const todayNetProfitLive = React.useMemo(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    // Detailed audit list for debugging inside browser terminal
    const auditSaleEntries: any[] = [];

    // 1. Total payments received today (cash basis)
    let todayRevenueReceived = 0;
    sales.forEach(sale => {
      if (sale.isBudget) return;
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach(payment => {
          if (getLocalDateFromISO(payment.date) === todayStr) {
            todayRevenueReceived += payment.amount;
          }
        });
      } else {
        if (sale.downPayment > 0 && getLocalDateFromISO(sale.date) === todayStr) {
          todayRevenueReceived += sale.downPayment;
        }
      }
    });

    // 2. Direct costs of sales created today
    let todaySalesCosts = 0;
    sales.forEach(sale => {
      if (sale.isBudget) return;
      if (getLocalDateFromISO(getSaleOrderDate(sale)) === todayStr) {
        const saleCost = getSaleOperationCost(sale);
        const motoboyCost = sale.useMotoboy ? (sale.motoboyCost || 0) : 0;
        todaySalesCosts += (saleCost + motoboyCost);
        
        auditSaleEntries.push({
          id: sale.id,
          cliente: sale.clientName,
          dataPedido: todayStr,
          valorTotal: sale.totalValue,
          sinal: sale.downPayment,
          custoOperacional: saleCost,
          custoMotoboy: motoboyCost,
          observacoes: "Custo de venda registrado hoje."
        });
      }
    });

    let todaySalesNetProfit = todayRevenueReceived - todaySalesCosts;

    // Standalone expenses of today, excluding withdrawals/sangrias (description contains "retirada" or "sangria")
    const auditExpensesEntries: any[] = [];
    const todayExpenses = expenses
      .filter((e) => {
        const isToday = e.date && getLocalDateFromISO(e.date) === todayStr;
        const isWithdrawal = e.description && /retirada|sangria/i.test(e.description);
        
        if (isToday) {
          auditExpensesEntries.push({
            id: e.id,
            descricao: e.description,
            valor: e.value,
            data: getLocalDateFromISO(e.date),
            isWithdrawal: !!isWithdrawal
          });
        }
        return isToday && !isWithdrawal;
      })
      .reduce((sum, e) => sum + e.value, 0);

    const netProfitToday = todaySalesNetProfit - todayExpenses;

    console.group(`📊 [AUDITORIA] LUCRO LÍQUIDO DIÁRIO (COMPETÊNCIA DE VENDAS) - DATA: ${todayStr}`);
    console.log("Lucro Total das Vendas de Hoje (todaySalesNetProfit):", todaySalesNetProfit);
    console.log("Vendas consideradas hoje (por data de pedido):", auditSaleEntries);
    console.log("Despesas Standalone de Hoje (todayExpenses):", todayExpenses);
    console.log(`Detalhamento das despesas de hoje:`, auditExpensesEntries);
    console.log(`Cálculo exato: Lucro das Vendas (${todaySalesNetProfit}) - Despesas Gerais (${todayExpenses}) = Lucro Líquido Real de Hoje: R$ ${netProfitToday}`);
    console.groupEnd();

    return netProfitToday;
  }, [sales, expenses]);

  const totalNetProfitLive = React.useMemo(() => {
    let totalSalesNetProfit = 0;
    const auditSalesTotal: any[] = [];

    sales.forEach(sale => {
      if (sale.isBudget) return;
      
      const saleCost = getSaleOperationCost(sale);
      const motoboyCost = sale.useMotoboy ? (sale.motoboyCost || 0) : 0;
      const profit = typeof sale.netProfit === 'number' ? sale.netProfit : (sale.totalValue - saleCost - motoboyCost);
      
      totalSalesNetProfit += profit;

      auditSalesTotal.push({
        id: sale.id,
        cliente: sale.clientName,
        valorTotal: sale.totalValue,
        sinal: sale.downPayment,
        custoOperacionalTotal: saleCost,
        custoMotoboy: motoboyCost,
        lucroPrevistoVenda: profit
      });
    });

    const totalExpensesValue = expenses.reduce((sum, e) => sum + e.value, 0);
    const accumulatedNetProfit = totalSalesNetProfit - totalExpensesValue;

    console.group("📊 [AUDITORIA] LUCRO LÍQUIDO HISTÓRICO ACUMULADO (COMPETÊNCIA DE VENDAS)");
    console.log("Lucro Total das Vendas (totalSalesNetProfit):", totalSalesNetProfit);
    console.log("Soma de todas as Despesas (totalExpensesValue):", totalExpensesValue);
    console.log(`Cálculo exato acumulado: Lucro das Vendas (${totalSalesNetProfit}) - Despesas (${totalExpensesValue}) = Lucro Líquido Geral: R$ ${accumulatedNetProfit}`);
    console.log("Detalhamento geral de todas as vendas:", auditSalesTotal);
    console.groupEnd();

    return accumulatedNetProfit;
  }, [sales, expenses]);

  // Calculations for "Falta para Meta" (worked days vs monthly expenses)
  const totalBillsValue = React.useMemo(() => {
    return bills.reduce((sum, b) => sum + b.value, 0);
  }, [bills]);

  const [customWeekdayGoals, setCustomWeekdayGoals] = React.useState<{ [key: number]: number }>(() => {
    const saved = localStorage.getItem("NUCLEO_WEEKDAY_GOALS");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return {};
  });

  React.useEffect(() => {
    localStorage.setItem("NUCLEO_WEEKDAY_GOALS", JSON.stringify(customWeekdayGoals));
  }, [customWeekdayGoals]);

  const dailyMetaGoal = React.useMemo(() => {
    return daysWorked > 0 ? totalBillsValue / daysWorked : 0;
  }, [totalBillsValue, daysWorked]);

  const todayEffectiveGoal = React.useMemo(() => {
    const dayOfWeek = new Date().getDay(); // 0 to 6
    if (customWeekdayGoals[dayOfWeek] !== undefined) {
      return customWeekdayGoals[dayOfWeek];
    }
    return dailyMetaGoal;
  }, [customWeekdayGoals, dailyMetaGoal]);

  const targetMissingValue = React.useMemo(() => {
    const profit = Math.max(0, todayNetProfitLive);
    return Math.max(0, todayEffectiveGoal - profit);
  }, [todayEffectiveGoal, todayNetProfitLive]);

  const progressPercent = React.useMemo(() => {
    const profit = Math.max(0, todayNetProfitLive);
    return todayEffectiveGoal > 0 ? (profit / todayEffectiveGoal) * 100 : 0;
  }, [todayNetProfitLive, todayEffectiveGoal]);

  const isGoalReached = todayEffectiveGoal > 0 && todayNetProfitLive >= todayEffectiveGoal;
  const isNearGoal = todayEffectiveGoal > 0 && !isGoalReached && progressPercent >= 90;

  // Track if today's expenses goal has already been celebrated
  const [notifiedExpensesGoalReached, setNotifiedExpensesGoalReached] = useState<boolean>(() => {
    const today = new Date().toISOString().split("T")[0];
    const saved = localStorage.getItem(`NUCLEO_NOTIFIED_EXPENSES_GOAL_${today}`);
    return saved === "true";
  });

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    if (isGoalReached) {
      const saved = localStorage.getItem(`NUCLEO_NOTIFIED_EXPENSES_GOAL_${today}`);
      if (saved !== "true") {
        // Trigger multi-burst professional confetti
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { x: 0.1, y: 0.6 }
        });
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { x: 0.9, y: 0.6 }
        });
        setTimeout(() => {
          confetti({
            particleCount: 120,
            spread: 90,
            origin: { x: 0.5, y: 0.5 }
          });
        }, 350);

        // Success Alert Toast
        addToast("🎉 Meta batida! Hora de transferir o valor para sua conta de reserva.", "goal");

        localStorage.setItem(`NUCLEO_NOTIFIED_EXPENSES_GOAL_${today}`, "true");
        setNotifiedExpensesGoalReached(true);
      }
    } else {
      const saved = localStorage.getItem(`NUCLEO_NOTIFIED_EXPENSES_GOAL_${today}`);
      if (saved === "true") {
        localStorage.removeItem(`NUCLEO_NOTIFIED_EXPENSES_GOAL_${today}`);
        setNotifiedExpensesGoalReached(false);
      }
    }
  }, [isGoalReached]);

  const handleCardClick = (cardType: "faturamento" | "entradas" | "pendentes" | "custos" | "lucro") => {
    if (cardType === "faturamento") {
      setSalesStatusFilter("all");
      setSalesDateFilter(filterPeriod === "custom" ? "custom" : filterPeriod === "all" ? "all" : "today");
      setTimeout(() => {
        const element = document.getElementById("sales-history-section");
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    } else if (cardType === "entradas") {
      setSalesStatusFilter("paid");
      setSalesDateFilter(filterPeriod === "custom" ? "custom" : filterPeriod === "all" ? "all" : "today");
      setTimeout(() => {
        const element = document.getElementById("sales-history-section");
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    } else if (cardType === "pendentes") {
      setSalesStatusFilter("pending");
      setSalesDateFilter("all");
      setTimeout(() => {
        const element = document.getElementById("sales-history-section");
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    } else if (cardType === "custos") {
      setActiveTab("gastos");
    } else if (cardType === "lucro") {
      setTimeout(() => {
        const element = document.getElementById("charts-section");
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    }
  };

  // A premium, louder, and more extensive/attention-grabbing notification sound using Web Audio API
  const playGoalBeep = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (freq: number, start: number, duration: number, type: "sine" | "triangle" | "sawtooth" | "square" = "triangle", volume = 0.45) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        
        // Loud start, then nice decline
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration - 0.05);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      const now = audioCtx.currentTime;
      
      // Let's create an elegant, loud attention chime of 8 vibrant tones
      // Pulse 1: Alert chimes
      playTone(587.33, now, 0.12, "triangle", 0.45);        // D5
      playTone(880.00, now + 0.10, 0.12, "triangle", 0.45);  // A5
      
      // Pulse 2: Repeated alert
      playTone(587.33, now + 0.28, 0.12, "triangle", 0.45);  // D5
      playTone(880.00, now + 0.38, 0.12, "triangle", 0.45);  // A5
      
      // Fanfare escalation for victory/attention!
      playTone(659.25, now + 0.58, 0.15, "triangle", 0.45);  // E5
      playTone(783.99, now + 0.70, 0.15, "triangle", 0.45);  // G5
      playTone(987.77, now + 0.82, 0.15, "triangle", 0.45);  // B5
      playTone(1046.50, now + 0.94, 0.45, "triangle", 0.50); // C6 (extended, loud finish)
    } catch (e) {
      console.error("Audio beep failed:", e);
    }
  };

  // Auto-sync sales changes to localized storage
  useEffect(() => {
    localStorage.setItem("NUCLEO_SALES", JSON.stringify(sales));
  }, [sales]);

  // Auto-sync budgets changes to localized storage
  useEffect(() => {
    localStorage.setItem("NUCLEO_BUDGETS", JSON.stringify(budgets));
  }, [budgets]);

  // Auto-sync expenses changes to localized storage
  useEffect(() => {
    localStorage.setItem("NUCLEO_EXPENSES", JSON.stringify(expenses));
  }, [expenses]);

  // Auto-sync company profile changes to localized storage
  useEffect(() => {
    // 1. Defend localStorage quota from huge Base64 strings to completely prevent QuotaExceededError
    const companyToSave = { ...company };
    if (companyToSave.logo && companyToSave.logo.startsWith("data:")) {
      companyToSave.logo = null;
    }
    localStorage.setItem("NUCLEO_COMPANY_PROFILE", JSON.stringify(companyToSave));

    // 2. Persistent storage for heavy company logo in IndexedDB (offline robust cache)
    if (company.logo) {
      import("./utils/indexedDb").then(({ setIndexedDbItem }) => {
        setIndexedDbItem("NUCLEO_COMPANY_LOGO", company.logo);
      }).catch(err => console.error("Error writing logo to IndexedDB:", err));
    } else {
      import("./utils/indexedDb").then(({ removeIndexedDbItem }) => {
        removeIndexedDbItem("NUCLEO_COMPANY_LOGO");
      }).catch(err => console.error("Error deleting logo from IndexedDB:", err));
    }
  }, [company]);

  // Middleware/Check for Cash Register Virada de Dia (Run on every single render/update cycle to work exactly as a render/request middleware)
  useEffect(() => {
    // COMPLETAMENTE DESATIVADO por solicitação do usuário: o caixa deve permanecer aberto e só fechar quando o usuário decidir fechar manualmente.
    return;

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayDateStr = `${year}-${month}-${day}`;

    if (cashRegister?.currentSession && cashRegister.currentSession.status === "aberto") {
      const sessionDateStr = getLocalDateFromISO(cashRegister.currentSession.dataAbertura);
      if (sessionDateStr < todayDateStr) {
        console.log(`[MIDDLEWARE/CHECK] Virada de dia detectada! Caixa aberto em ${sessionDateStr}, hoje é ${todayDateStr}. Executando fechamento de segurança automático do caixa de ontem...`);
        
        // Execute automatic closure
        const currentSession = cashRegister.currentSession;
        let cashInflow = 0;
        let totalPixInflow = 0;
        let totalCardInflow = 0;
        const openTime = new Date(currentSession.dataAbertura).getTime();

        sales.forEach((sale) => {
          if (sale.isBudget) return;
          const saleTime = new Date(sale.date || new Date().toISOString()).getTime();
          const isSaleInSession = saleTime >= openTime;

          if (sale.payments && sale.payments.length > 0) {
            sale.payments.forEach((p) => {
              const amt = Number(p.amount) || 0;
              const method = String(p.method || "dinheiro").toLowerCase();
              const paymentTime = new Date(p.date || sale.date || new Date().toISOString()).getTime();
              if (paymentTime >= openTime) {
                if (method === "dinheiro") {
                  cashInflow += amt;
                } else if (method === "pix") {
                  totalPixInflow += amt;
                } else {
                  totalCardInflow += amt;
                }
              }
            });
          } else {
            if (isSaleInSession) {
              const meth = String(sale.paymentMethod || "dinheiro").toLowerCase();
              const amt = sale.balanceDue === 0 ? sale.totalValue : (sale.downPayment || 0);
              if (meth === "dinheiro") {
                cashInflow += amt;
              } else if (meth === "pix") {
                totalPixInflow += amt;
              } else {
                totalCardInflow += amt;
              }
            }
          }
        });

        // Sum standalone expenses created during session
        let expensesTotal = 0;
        expenses.forEach((expense) => {
          if (!expense.date) return;
          const expTime = new Date(expense.date).getTime();
          if (expTime >= openTime) {
            expensesTotal += Number(expense.value) || 0;
          }
        });

        const expectedInDrawer = currentSession.valorAbertura + cashInflow - expensesTotal;

        const observations = `🔒 FECHAMENTO AUTOMÁTICO - VIRADA DE DIA (Esquecimento)\n\n` +
          `O caixa foi deixado aberto no dia anterior (${sessionDateStr}). O sistema efetuou o encerramento automático do expediente por segurança.\n` +
          `• Saldo de Abertura: R$ ${currentSession.valorAbertura.toFixed(2)}\n` +
          `• Entradas em Dinheiro: R$ ${cashInflow.toFixed(2)}\n` +
          `• Dinheiro Esperado: R$ ${expectedInDrawer.toFixed(2)}\n` +
          `• PIX: R$ ${totalPixInflow.toFixed(2)}\n` +
          `• Cartão: R$ ${totalCardInflow.toFixed(2)}`;

        const closedSession: CashRegisterSession = {
          ...currentSession,
          status: "fechado",
          valorFechamentoEsperado: expectedInDrawer,
          valorFechementReal: expectedInDrawer, // support any potential typo
          valorFechamentoReal: expectedInDrawer,
          dataFechamento: new Date().toISOString(),
          observacoes: observations
        } as any;

        const updatedState: CashRegisterState = {
          currentSession: null,
          history: [closedSession, ...cashRegister.history]
        };

        setCashRegister(updatedState);
        localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updatedState));

        try { playCloseRegisterSound(); } catch (soundErr) { console.warn(soundErr); }

        if (currentUser && isSupabaseConfigured()) {
          const companyId = currentUser.owner_id || currentUser.id;
          dbSaveCashRegister(companyId, updatedState).catch((syncErr) => console.error(syncErr));
        }

        setReadOnlyMode(false);
        setBypassTodayClosure(false);

        addToast(`🔒 O caixa anterior (${sessionDateStr}) foi fechado automaticamente na virada do dia por estar aberto.`, "success");
        setShowAutoClosePrompt(false);
      }
    }
  });

  // Active ringing reminders (alarms that are currently triggering and looping sound until accepted)
  const [ringingReminders, setRingingReminders] = useState<CustomReminder[]>(() => {
    try {
      const WELCOME_TITLE = "Bem-vindo ao nosso sistema Nexvolt, o sistema que faz a diferença onde você tem o controle da sua empresa na palma da sua mão 🚀";
      const savedIdsRaw = localStorage.getItem("NUCLEO_RINGING_REMINDER_IDS");
      const savedRemindersRaw = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
      if (savedIdsRaw && savedRemindersRaw) {
        const ids: string[] = JSON.parse(savedIdsRaw);
        const reminders: CustomReminder[] = JSON.parse(savedRemindersRaw);
        return reminders
          .filter((rem) => ids.includes(rem.id))
          .map((rem) => {
            if (rem.id === "welcome-reminder" || (rem.title && rem.title.includes("Boas-vindas à Gráfica"))) {
              return { ...rem, title: WELCOME_TITLE };
            }
            return rem;
          });
      }
    } catch (e) {
      console.warn("Error parsing saved ringing reminders:", e);
    }
    return [];
  });

  // Automatically save active ringing reminder IDs to localStorage to persist across reloads
  useEffect(() => {
    try {
      const ids = ringingReminders.map(r => r.id);
      localStorage.setItem("NUCLEO_RINGING_REMINDER_IDS", JSON.stringify(ids));
    } catch (e) {
      console.error("Error saving ringing reminder IDs:", e);
    }
  }, [ringingReminders]);

  // Sound loop player for active alarms
  useEffect(() => {
    if (ringingReminders.length === 0) return;

    // Play sound initially
    playReminderSound();

    // Loop chime/alarm every 2.5 seconds
    const interval = setInterval(() => {
      playReminderSound();
    }, 2500);

    return () => clearInterval(interval);
  }, [ringingReminders, soundEnabled]);

  const handleAcceptRingingReminder = (reminderId: string) => {
    setRingingReminders((prev) => prev.filter((r) => r.id !== reminderId));

    const savedRemindersRaw = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
    if (savedRemindersRaw) {
      try {
        const list: CustomReminder[] = JSON.parse(savedRemindersRaw);
        const updatedList = list.map((rem) => {
          if (rem.id === reminderId) {
            if (rem.type === "date") {
              return { ...rem, completed: true, notified: true };
            } else {
              return { ...rem, notified: true };
            }
          }
          return rem;
        });
        localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(updatedList));
        window.dispatchEvent(new Event("storage"));
      } catch (err) {
        console.error("Error marking ringing reminder as accepted:", err);
      }
    }
  };

  const handleAcceptAllRingingReminders = () => {
    const idsToAccept = ringingReminders.map(r => r.id);
    setRingingReminders([]);

    const savedRemindersRaw = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
    if (savedRemindersRaw) {
      try {
        const list: CustomReminder[] = JSON.parse(savedRemindersRaw);
        const updatedList = list.map((rem) => {
          if (idsToAccept.includes(rem.id)) {
            if (rem.type === "date") {
              return { ...rem, completed: true, notified: true };
            } else {
              return { ...rem, notified: true };
            }
          }
          return rem;
        });
        localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(updatedList));
        window.dispatchEvent(new Event("storage"));
      } catch (err) {
        console.error("Error marking all ringing reminders as accepted:", err);
      }
    }
  };

  // Setup reminders background ticking
  useEffect(() => {
    const checkRemindersAndGoals = () => {
      try {
        const now = new Date();
        const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        
        // Year-month-date for local timezone
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const todayDateStr = `${year}-${month}-${day}`;
        const currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

        // 1. CHECK DAILY GOALS REMINDER
        if (company?.goalsReminderEnabled) {
          const preferredTime = company.goalsReminderTime || "09:00";
          
          if (currentHHMM === preferredTime) {
            const lastShown = localStorage.getItem("NUCLEO_LAST_GOAL_REMINDER_DATE");
            if (lastShown !== todayDateStr) {
              // Trigger!
              localStorage.setItem("NUCLEO_LAST_GOAL_REMINDER_DATE", todayDateStr);
              
              const pct = progressPercent.toFixed(1);
              let msg = `🎯 Lembrete de Metas: Sua meta de lucro hoje é de R$ ${todayEffectiveGoal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. `;
              if (todayNetProfitLive >= todayEffectiveGoal && todayEffectiveGoal > 0) {
                msg += `🎉 Parabéns! Você já bateu a meta com R$ ${todayNetProfitLive.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} conquistados! 🏆`;
              } else {
                msg += `Você realizou R$ ${todayNetProfitLive.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${pct}%). Faltam R$ ${targetMissingValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}!`;
              }
              
              addToast(msg, "goal");
              
              // Play sound if enabled
              if (soundEnabled) {
                playCashRegisterSound();
              }
            }
          }
        }

        // 2. CHECK CUSTOM GENERAL REMINDERS
        const savedRemindersRaw = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
        if (savedRemindersRaw) {
          let dirty = false;
          const remindersList: CustomReminder[] = JSON.parse(savedRemindersRaw);
          const WELCOME_TITLE = "Bem-vindo ao nosso sistema Nexvolt, o sistema que faz a diferença onde você tem o controle da sua empresa na palma da sua mão 🚀";
          
          const updatedList = remindersList.map((originalRem) => {
            let rem = originalRem;
            if (rem.id === "welcome-reminder" || (rem.title && rem.title.includes("Boas-vindas à Gráfica"))) {
              if (rem.title !== WELCOME_TITLE) {
                dirty = true;
                rem = { ...rem, title: WELCOME_TITLE };
              }
            }

            // Automatically reset notified for weekly recurring reminders if it's a different day, allowing re-triggers!
            if (rem.type === "weekly" && rem.dayOfWeek !== currentDayOfWeek && rem.notified) {
              dirty = true;
              return { ...rem, notified: false };
            }

            if (rem.completed || rem.notified) return rem;
            
            let matches = false;
            if (!rem.isAllDay) {
              if (rem.type === "date" && rem.date === todayDateStr && currentHHMM >= rem.time) {
                matches = true;
              } else if (rem.type === "weekly" && rem.dayOfWeek === currentDayOfWeek && currentHHMM >= rem.time) {
                matches = true;
              }
            } else {
              // All-day reminders trigger on the same day as soon as checker runs (e.g. at app start on that day)
              if (rem.type === "date" && rem.date === todayDateStr) {
                matches = true;
              } else if (rem.type === "weekly" && rem.dayOfWeek === currentDayOfWeek) {
                matches = true;
              }
            }

            if (matches) {
              // Trigger!
              addToast(`⏰ LEMBRETE ATIVO: ${rem.title} 🔔`, "reminder");
              
              // Push to active alarm ringing list to open persistent overlay & sound loop
              setRingingReminders((prev) => {
                if (prev.some(r => r.id === rem.id)) return prev;
                const newRingList = [...prev, rem];
                try {
                  const ids = newRingList.map(r => r.id);
                  localStorage.setItem("NUCLEO_RINGING_REMINDER_IDS", JSON.stringify(ids));
                } catch (e) {
                  console.error(e);
                }
                return newRingList;
              });

              dirty = true;
              return { ...rem, notified: true };
            }

            return rem;
          });

          if (dirty) {
            localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(updatedList));
            window.dispatchEvent(new Event("storage"));
          }
        }

        // 3. CHECK CASH CLOSING REMINDER / CLOSING AT END OF BUSINESS HOURS
        if (cashRegister?.currentSession && isCashSessionActiveOrOpen(cashRegister.currentSession)) {
          const currentSession = cashRegister.currentSession;
          const sessionDateStr = getLocalDateFromISO(currentSession.dataAbertura);
          
          const dismissedDate = localStorage.getItem("NUCLEO_DISMISSED_AUTOCLOSE_DATE");
          const snoozeUntil = localStorage.getItem("NUCLEO_SNOOZE_CASH_CLOSING_UNTIL");
          const isSnoozed = snoozeUntil ? Date.now() < Number(snoozeUntil) : false;
          const isDismissedToday = dismissedDate === todayDateStr;

          // Determine effective reminder / closing time
          let effectiveTime = (company?.cashClosingReminderTime || "").trim();
          if (!effectiveTime) {
            if (company?.businessHours) {
              const dayKeys: (keyof BusinessHours)[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
              const todayKey = dayKeys[currentDayOfWeek];
              const dayConfig = company.businessHours[todayKey];
              if (dayConfig && dayConfig.isOpen && dayConfig.closeTime) {
                effectiveTime = dayConfig.closeTime;
              }
            }
          }
          if (!effectiveTime) {
            effectiveTime = company?.closingTime || "18:00";
          }

          // Trigger when current time is past effective closing time, or if session was left open from a previous day
          const isPastClosing = (currentHHMM >= effectiveTime) || (sessionDateStr < todayDateStr);
          const isReminderEnabled = company?.cashClosingReminderEnabled ?? true;

          // Trigger continuous alarm & notification if enabled, past closing time, and not dismissed/snoozed
          if (isReminderEnabled && isPastClosing && !isDismissedToday && !isSnoozed && !showAutoClosePrompt) {
            setClosingAlarmMuted(false);
            setShowAutoClosePrompt(true);
          }
        }
      } catch (err) {
        console.error("Error running background reminder tick:", err);
      }
    };

    // run initially and then once every 10 seconds
    checkRemindersAndGoals();
    const interval = setInterval(checkRemindersAndGoals, 10000);
    return () => clearInterval(interval);
  }, [company, dailyMetaGoal, todayNetProfitLive, progressPercent, targetMissingValue, soundEnabled, cashRegister, sales, showAutoClosePrompt]);

  // Centralized cash register validation helper
  const requireOpenCashRegister = (actionDescription: string): boolean => {
    let hasOpen = !!cashRegister?.currentSession && cashRegister.currentSession.status === "aberto";
    if (!hasOpen && cashRegisterRef.current?.currentSession?.status === "aberto") {
      hasOpen = true;
      setCashRegister(cashRegisterRef.current);
    }
    if (!hasOpen) {
      try {
        const saved = localStorage.getItem("NUCLEO_CASH_REGISTER");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.currentSession?.status === "aberto") {
            hasOpen = true;
            setCashRegister(parsed);
            cashRegisterRef.current = parsed;
          }
        }
      } catch (e) {}
    }

    if (!hasOpen) {
      if (isGlobalRegisterOpen) {
        // Global cash register is already open for the company! Attempt to adopt session
        const companyOwnerId = currentUser?.owner_id || currentUser?.id;
        if (companyOwnerId && isSupabaseConfigured()) {
          dbGetCashRegister(companyOwnerId).then((remote) => {
            if (remote?.currentSession) {
              setCashRegister(remote);
              cashRegisterRef.current = remote;
              localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(remote));
            }
          }).catch(console.error);
        }
        return true;
      }
      addToast(`⛔ Ação Bloqueada! O caixa precisa ser aberto para registrar ${actionDescription}.`, "error");
      setActiveTab("sale");
      setShowCashRegisterModal(true);
      return false;
    }
    return true;
  };

  const handleAddExpense = (expense: Expense) => {
    if (!requireOpenCashRegister("qualquer despesa")) {
      return;
    }
    setExpenses((prev) => [...prev, expense]);
    playAlertSound("success");
    addToast(`Despesa registrada com sucesso: ${expense.description}! 🧾`, "success");
    if (currentUser && isSupabaseConfigured()) {
      const companyOwnerId = currentUser.owner_id || currentUser.id;
      dbSaveExpense(companyOwnerId, expense)
        .then((ok) => {
          if (!ok) {
            addToast("⚠️ Sincronização offline: Salvo localmente, mas falhou ao sincronizar com a nuvem.", "warning");
          }
        })
        .catch((err) => {
          console.error("Error syncing expense to Supabase:", err);
          addToast("⚠️ Falha ao conectar ao servidor. Gasto foi salvo localmente.", "warning");
        });
    }
  };

  const handleDeleteExpense = (id: string) => {
    if (!cashRegister.currentSession) {
      addToast("⛔ Ação Bloqueada! Você precisa abrir o caixa antes de remover despesas.", "error");
      return;
    }
    // Check if it's an automated sale cost
    if (id.includes("-cost-") || id.includes("-direct-cost") || id.includes("-motoboy")) {
      let saleId = "";
      if (id.includes("-cost-")) {
        saleId = id.split("-cost-")[0];
      } else if (id.includes("-direct-cost")) {
        saleId = id.split("-direct-cost")[0];
      } else if (id.includes("-motoboy")) {
        saleId = id.split("-motoboy")[0];
      }

      const saleToUpdate = sales.find((s) => s.id === saleId);
      if (saleToUpdate) {
        // Create updated copy of the sale
        const updatedSale = { ...saleToUpdate };
        let msg = "Custo automático removido!";
        
        if (id.includes("-cost-")) {
          const costIdx = parseInt(id.split("-cost-")[1], 10);
          if (updatedSale.costItems && updatedSale.costItems.length > costIdx) {
            const removedCost = updatedSale.costItems[costIdx];
            updatedSale.costItems = updatedSale.costItems.filter((_, idx) => idx !== costIdx);
            // Recalculate operationCost based on remaining costItems
            const remainingCostSum = updatedSale.costItems.reduce((sum, item) => sum + item.value, 0);
            updatedSale.operationCost = remainingCostSum;
            updatedSale.netProfit = updatedSale.totalValue - updatedSale.operationCost - (updatedSale.useMotoboy ? updatedSale.motoboyCost : 0);
            msg = `Custo "${removedCost.description}" removido da venda do cliente ${saleToUpdate.clientName}! 🗑️`;
          }
        } else if (id.includes("-direct-cost")) {
          updatedSale.operationCost = 0;
          updatedSale.netProfit = updatedSale.totalValue - (updatedSale.useMotoboy ? updatedSale.motoboyCost : 0);
          msg = `Custo operacional direto zerado para a venda do cliente ${saleToUpdate.clientName}! 🗑️`;
        } else if (id.includes("-motoboy")) {
          updatedSale.useMotoboy = false;
          updatedSale.motoboyCost = 0;
          updatedSale.netProfit = updatedSale.totalValue - updatedSale.operationCost;
          msg = `Custo do motoboy removido da venda do cliente ${saleToUpdate.clientName}! 🗑️`;
        }

        // Save updated sale locally
        setSales((prev) => {
          const updatedSales = prev.map((s) => s.id === saleId ? updatedSale : s);
          localStorage.setItem("NUCLEO_SALES", JSON.stringify(updatedSales));
          return updatedSales;
        });
        
        playAlertSound("delete");
        addToast(msg, "info");

        // Sync with Supabase if configured
        if (isSupabaseConfigured() && currentUser) {
          const companyOwnerId = currentUser.owner_id || currentUser.id;
          dbSaveSale(companyOwnerId, updatedSale)
            .catch((err) => console.error("Error updating sale in Supabase after cost deletion:", err));
        }
        return;
      }
    }

    // Standard standalone expense deletion logic
    const expense = expenses.find((e) => e.id === id);
    if (expense) {
      const auditRecord: DeletionAuditRecord = {
        id: `del_exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        deletedAt: new Date().toISOString(),
        itemType: "despesa",
        itemId: expense.id,
        itemTitle: `Despesa - ${expense.description}`,
        totalValue: Number(expense.value) || 0,
        paidValue: Number(expense.value) || 0,
        details: `Despesa na categoria [${expense.category}] excluída`,
        deletedByUserId: currentUser?.id || "",
        deletedByName: currentUser?.name || "Administrador",
        deletedByUsername: currentUser?.username || "admin",
        deletedByRole: isAttendant ? "atendente" : "administrador"
      };
      const ownerId = currentUser?.owner_id || currentUser?.id || "";
      if (ownerId) {
        saveLocalDeletionAuditRecord(auditRecord, ownerId);
        setDeletionAuditRecords(prev => [auditRecord, ...prev]);
      }
    }
    setExpenses((prev) => {
      const updatedExpenses = prev.filter((e) => e.id !== id);
      localStorage.setItem("NUCLEO_EXPENSES", JSON.stringify(updatedExpenses));
      return updatedExpenses;
    });
    
    playAlertSound("delete");
    addToast(`Despesa excluída com sucesso! 🗑️`, "info");
    if (isSupabaseConfigured()) {
      dbDeleteExpense(id)
        .catch((err) => console.error("Error deleting expense from Supabase:", err));
    }
  };

  // Auto-sync goal configurations to local storage and Supabase
  useEffect(() => {
    localStorage.setItem("NUCLEO_GOAL_VALUE", String(goalValue));
    localStorage.setItem("NUCLEO_GOAL_TYPE", goalType);
    if (currentUser && isSupabaseConfigured() && goalValue > 0) {
      const companyOwnerId = currentUser.owner_id || currentUser.id;
      dbSaveGoals(companyOwnerId, goalValue, goalType, notifiedGoalValue, notifiedGoalDate)
        .catch((err) => console.error("Error syncing goals to Supabase:", err));
    }
  }, [goalValue, goalType, notifiedGoalValue, notifiedGoalDate, currentUser]);

  const lastGoalValueRef = useRef<number>(goalValue);
  useEffect(() => {
    if (goalValue !== lastGoalValueRef.current) {
      if (goalValue > 0) {
        addToast(`Meta de lucro configurada para R$ ${goalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}! 🎯`, "info");
      }
      lastGoalValueRef.current = goalValue;
    }
  }, [goalValue]);

  const lastGoalTypeRef = useRef<string>(goalType);
  useEffect(() => {
    if (goalType !== lastGoalTypeRef.current) {
      addToast(`Tipo de meta alterado para ${goalType === 'daily' ? 'Diário' : 'Geral'}! 📅`, "info");
      lastGoalTypeRef.current = goalType;
    }
  }, [goalType]);

  // Handle Meta limits on changes
  useEffect(() => {
    const effectiveGoal = goalType === "daily" ? todayEffectiveGoal : goalValue;
    if (effectiveGoal <= 0) {
      setShowCongratsOverlay(false);
      return;
    }

    // Calculate today's net profit
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    const achieved = goalType === "daily" ? todayNetProfitLive : totalNetProfitLive;
    const isMet = achieved >= effectiveGoal;

    if (isMet) {
      const currentDateStr = todayStr;
      const alreadyNotifiedVal = notifiedGoalValue === effectiveGoal;
      const alreadyNotifiedDay = goalType === "daily" ? (notifiedGoalDate === currentDateStr) : true;

      if (!alreadyNotifiedVal || !alreadyNotifiedDay) {
        // Trigger sound beep!
        playGoalBeep();
        
        // Premium visualization toast alert
        addToast(`🎉 META ALCANÇADA! Você atingiu a meta de R$ ${effectiveGoal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} com um lucro de R$ ${achieved.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}! 🏆`, "goal");

        // Show congrats full screen animated celebratory screen
        setShowCongratsOverlay(true);

        // Persist notifications settings
        setNotifiedGoalValue(effectiveGoal);
        localStorage.setItem("NUCLEO_NOTIFIED_GOAL_VALUE", String(effectiveGoal));
        
        setNotifiedGoalDate(currentDateStr);
        localStorage.setItem("NUCLEO_NOTIFIED_GOAL_DATE", currentDateStr);
      }
    } else {
      setShowCongratsOverlay(false);
      if (notifiedGoalValue === effectiveGoal) {
        setNotifiedGoalValue(-1);
        localStorage.removeItem("NUCLEO_NOTIFIED_GOAL_VALUE");
      }
    }
  }, [sales, goalValue, goalType, notifiedGoalValue, notifiedGoalDate, todayEffectiveGoal, todayNetProfitLive, totalNetProfitLive]);

  const handleOpenRegister = async (valorAbertura: number, operador: string) => {
    setBypassTodayClosure(false);

    // Block duplicate opening for same day if already confirmed open
    const localToday = new Date();
    const year = localToday.getFullYear();
    const month = String(localToday.getMonth() + 1).padStart(2, '0');
    const day = String(localToday.getDate()).padStart(2, '0');
    const todayDateStr = `${year}-${month}-${day}`;

    // check currentSession: if already open and marked open, smoothly confirm and close modal
    if (cashRegister.currentSession && cashRegister.currentSession.status === "aberto") {
      const activeSessionDate = getLocalDateFromISO(cashRegister.currentSession.dataAbertura);
      if (activeSessionDate === todayDateStr && isRegisterOpenForToday) {
        addToast("✅ O caixa já está aberto e ativo para o expediente de hoje!", "info");
        setShowCashRegisterModal(false);
        setIsGlobalRegisterOpen(true);
        return;
      }
    }
    
    // Completely bypass restriction of previously closed sessions to allow users to open a new turn whenever they want
    const hasTodayClosed = false;
    if (hasTodayClosed && !bypassTodayClosure) {
      addToast("⛔ Atenção: O expediente de hoje já foi encerrado! Use o 'Novo Turno' se desejar reiniciar.", "warning");
      return;
    }

    const sessionUUID = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });

    const newSession: CashRegisterSession = {
      id: sessionUUID,
      status: "aberto",
      valorAbertura,
      dataAbertura: new Date().toISOString(),
      operador
    };

    const updatedState: CashRegisterState = {
      currentSession: newSession,
      history: cashRegister.history
    };

    setCashRegister(updatedState);
    cashRegisterRef.current = updatedState;
    localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updatedState));
    localStorage.setItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE", newSession.dataAbertura);
    // Limpar adiamentos e dispensas anteriores para que o alarme toque no horário correto hoje
    localStorage.removeItem("NUCLEO_SNOOZE_CASH_CLOSING_UNTIL");
    localStorage.removeItem("NUCLEO_DISMISSED_AUTOCLOSE_DATE");
    setIsGlobalRegisterOpen(true);

    // Play welcome beep
    playLoginBeep();

    // Sync with Supabase sessoes_caixa
    const UNIFIED_EMPRESA_ID = "62f892b2-3855-4ae9-8b2d-42d4b6223815";
    const supabaseClient = getSupabase();
    if (supabaseClient) {
      try {
        await supabaseClient.from("sessoes_caixa").upsert({
          id: sessionUUID,
          empresa_id: UNIFIED_EMPRESA_ID,
          status: "aberto",
          valor_abertura: Number(valorAbertura) || 0,
          data_abertura: newSession.dataAbertura
        });
      } catch (err) {
        console.warn("Aviso ao abrir sessao em sessoes_caixa:", err);
      }
    }

    if (currentUser && isSupabaseConfigured()) {
      const companyId = currentUser.owner_id || currentUser.id;
      await dbSaveCashRegister(companyId, updatedState);
      await dbOpenGlobalCashRegister(companyId, newSession);
    }

    addToast(`🔓 Caixa aberto com troco de R$ ${valorAbertura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}!`, "success");
    setShowCashRegisterModal(false);
  };

  const handleCloseRegister = async (valorFechamentoReal: number, observacoes: string) => {
    if (!cashRegister.currentSession) return;

    const currentSession = cashRegister.currentSession;

    let cashInflow = 0;
    let pixInflow = 0;
    let cardInflow = 0;
    let totalSales = 0;
    let operationCosts = 0;
    let totalMotoboy = 0;
    let entradasServico = 0;
    let count = 0;

    const serviceKeywords = [
      "servico", "serviço", "arte", "impressao", "impressão", "criacao", "criação", 
      "design", "mao de obra", "mão de obra", "recarregar", "plotagem", "xerox", 
      "copia", "cópia", "taxa", "encadernacao", "encadernação", "adesivo", 
      "panfleto", "cartao", "cartão", "banner", "corte", "placa", "encadernar",
      "personaliz", "estamp"
    ];

    sales.forEach((sale) => {
      if (sale.isBudget) return;
      const orderDateStr = getSaleOrderDate(sale);
      if (isDateInSession(orderDateStr, currentSession)) {
        count++;
        totalSales += sale.totalValue;
        operationCosts += getSaleOperationCost(sale);
        if (sale.useMotoboy) {
          totalMotoboy += sale.motoboyCost || 0;
        }

        if (sale.items && sale.items.length > 0) {
          sale.items.forEach(item => {
            const desc = (item.description || "").toLowerCase().trim();
            const isService = serviceKeywords.some(keyword => desc.includes(keyword));
            if (isService) {
              entradasServico += Number(item.totalValue) || 0;
            }
          });
        }
      }

      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach((p) => {
          const amt = Number(p.amount) || 0;
          const method = String(p.method || "dinheiro").toLowerCase();
          const pDateStr = p.date || sale.date;
          if (isDateInSession(pDateStr, currentSession)) {
            if (method === "dinheiro") {
              cashInflow += amt;
            } else if (method === "pix") {
              pixInflow += amt;
            } else {
              cardInflow += amt;
            }
          }
        });
      } else {
        const sDateStr = sale.date;
        if (isDateInSession(sDateStr, currentSession)) {
          const meth = String(sale.paymentMethod || "dinheiro").toLowerCase();
          const amt = sale.balanceDue === 0 ? sale.totalValue : (sale.downPayment || 0);
          if (meth === "dinheiro") {
            cashInflow += amt;
          } else if (meth === "pix") {
            pixInflow += amt;
          } else {
            cardInflow += amt;
          }
        }
      }
    });

    // Sum standalone expenses created during active session
    let expensesTotal = 0;
    let expensesPaidInCash = 0;

    const parseExpenseDescription = (desc: string) => {
      if (!desc) return { cleanDesc: "", method: "dinheiro" };
      const trimmed = desc.trim();
      if (trimmed.startsWith("[Dinheiro]")) {
        return { cleanDesc: trimmed.replace("[Dinheiro]", "").trim(), method: "dinheiro" };
      }
      if (trimmed.startsWith("[Pix]")) {
        return { cleanDesc: trimmed.replace("[Pix]", "").trim(), method: "pix" };
      }
      if (trimmed.startsWith("[Cartão]") || trimmed.startsWith("[Cartao]")) {
        return { cleanDesc: trimmed.replace(/\[Cartã?o\]/, "").trim(), method: "cartão" };
      }
      
      const lower = trimmed.toLowerCase();
      if (lower.startsWith("[dinheiro]")) {
        return { cleanDesc: trimmed.substring(10).trim(), method: "dinheiro" };
      }
      if (lower.startsWith("[pix]")) {
        return { cleanDesc: trimmed.substring(5).trim(), method: "pix" };
      }
      if (lower.startsWith("[cartão]") || lower.startsWith("[cartao]")) {
        return { cleanDesc: trimmed.replace(/\[cartã?o\]/i, "").trim(), method: "cartão" };
      }

      // Word matches:
      if (lower.includes("dinheiro")) return { cleanDesc: trimmed, method: "dinheiro" };
      if (lower.includes("pix")) return { cleanDesc: trimmed, method: "pix" };
      if (lower.includes("cartão") || lower.includes("cartao")) return { cleanDesc: trimmed, method: "cartão" };

      return { cleanDesc: trimmed, method: "dinheiro" };
    };

    expenses.forEach((expense) => {
      if (!expense.date) return;
      if (isDateInSession(expense.date, currentSession)) {
        const val = Number(expense.value) || 0;
        expensesTotal += val;

        const { method } = parseExpenseDescription(expense.description);
        if (method === "dinheiro") {
          expensesPaidInCash += val;
        }
      }
    });

    const totalCustos = operationCosts + expensesTotal + totalMotoboy;
    const expected = currentSession.valorAbertura + cashInflow - expensesPaidInCash;
    const totalEntradas = cashInflow + pixInflow + cardInflow;
    const lucroLiquido = totalEntradas - totalCustos;

    const auditTrail = `📊 DETALHAMENTO DE FECHAMENTO DO DIA:\n` +
      `• Entradas / Sinais (Caixa): R$ ${totalEntradas.toFixed(2)}\n` +
      `• Entrada de Serviços: R$ ${totalSales.toFixed(2)}\n` +
      `• Custos / Despesas Globais: R$ ${totalCustos.toFixed(2)} (Custo Operacional: R$ ${operationCosts.toFixed(2)} | Despesas Totais: R$ ${expensesTotal.toFixed(2)} (Dinheiro: R$ ${expensesPaidInCash.toFixed(2)}) | Motoboy: R$ ${totalMotoboy.toFixed(2)})\n` +
      `• Lucro Real do Turno: R$ ${lucroLiquido.toFixed(2)}\n` +
      `• Dinheiro Líquido Esperado na Gaveta: R$ ${expected.toFixed(2)}\n` +
      `• Recebido via Dinheiro: R$ ${cashInflow.toFixed(2)} | PIX: R$ ${pixInflow.toFixed(2)} | Cartão: R$ ${cardInflow.toFixed(2)}\n` +
      `• Dinheiro Físico Contado: R$ ${valorFechamentoReal.toFixed(2)}\n` +
      `• Diferença / Quebra: R$ ${(valorFechamentoReal - expected).toFixed(2)}`;

    const finalNotes = observacoes 
      ? `${observacoes.trim()}\n\n${auditTrail}`
      : auditTrail;

    const closedSession: CashRegisterSession = {
      ...currentSession,
      status: "fechado",
      valorFechamentoEsperado: expected,
      valorFechamentoReal,
      dataFechamento: new Date().toISOString(),
      observacoes: finalNotes
    };

    const updatedState: CashRegisterState = {
      currentSession: null,
      history: [closedSession, ...cashRegister.history]
    };

    setCashRegister(updatedState);
    cashRegisterRef.current = updatedState;
    localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updatedState));
    localStorage.setItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE", closedSession.dataFechamento);
    setIsGlobalRegisterOpen(false);

    // Play closing sound
    playCloseRegisterSound();

    // Sincronização direta na tabela sessoes_caixa da empresa unificada
    const UNIFIED_EMPRESA_ID = "62f892b2-3855-4ae9-8b2d-42d4b6223815";
    const supabaseClient = getSupabase();
    if (supabaseClient) {
      try {
        await supabaseClient
          .from("sessoes_caixa")
          .update({
            status: "fechado",
            data_fechamento: closedSession.dataFechamento
          })
          .eq("empresa_id", UNIFIED_EMPRESA_ID)
          .eq("status", "aberto");
      } catch (err) {
        console.warn("Aviso ao atualizar status para fechado em sessoes_caixa:", err);
      }
    }

    // Sync with Supabase
    if (currentUser && isSupabaseConfigured()) {
      const companyId = currentUser.owner_id || currentUser.id;
      await dbSaveCashRegister(companyId, updatedState);
      await dbCloseGlobalCashRegister(companyId, currentSession.id, closedSession);
    }

    addToast("🔒 Caixa fechado com sucesso e históricos de turnos registrados!", "success");
    setShowCashRegisterModal(false);
  };

  const handleAutoCloseSnooze = () => {
    const snoozeTime = Date.now() + 15 * 60 * 1000;
    localStorage.setItem("NUCLEO_SNOOZE_CASH_CLOSING_UNTIL", String(snoozeTime));
    setShowAutoClosePrompt(false);
    addToast("⏰ Lembrete de fechamento adiado por 15 minutos. Bom trabalho!", "info");
  };

  const handleAutoCloseDismiss = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayDateStr = `${year}-${month}-${day}`;
    
    localStorage.setItem("NUCLEO_DISMISSED_AUTOCLOSE_DATE", todayDateStr);
    setShowAutoClosePrompt(false);
    addToast("🌙 Lembrete mantido para mais tarde. Lembre-se de fechar o caixa antes de fechar o programa!", "info");
  };

  const handleOpenCashRegisterFromReminder = () => {
    setShowAutoClosePrompt(false);
    setShowCashRegisterModal(true);
  };

  const handleAutoCloseConfirm = () => {
    if (!cashRegister?.currentSession) {
      setShowAutoClosePrompt(false);
      return;
    }
    
    const currentSession = cashRegister.currentSession;
    const closingTime = company?.closingTime || "18:00";
    
    let cashInflow = 0;
    let totalPixInflow = 0;
    let totalCardInflow = 0;
    let totalSalesInSession = 0;
    let salesCount = 0;
    let operationCosts = 0;
    let totalMotoboy = 0;
    let entradasServico = 0;

    const serviceKeywords = [
      "servico", "serviço", "arte", "impressao", "impressão", "criacao", "criação", 
      "design", "mao de obra", "mão de obra", "recarregar", "plotagem", "xerox", 
      "copia", "cópia", "taxa", "encadernacao", "encadernação", "adesivo", 
      "panfleto", "cartao", "cartão", "banner", "corte", "placa", "encadernar",
      "personaliz", "estamp"
    ];

    sales.forEach((sale) => {
      if (sale.isBudget) return;
      const orderDateStr = getSaleOrderDate(sale);
      if (isDateInSession(orderDateStr, currentSession)) {
        salesCount++;
        totalSalesInSession += sale.totalValue;
        operationCosts += getSaleOperationCost(sale);
        if (sale.useMotoboy) {
          totalMotoboy += sale.motoboyCost || 0;
        }

        if (sale.items && sale.items.length > 0) {
          sale.items.forEach(item => {
            const desc = (item.description || "").toLowerCase().trim();
            const isService = serviceKeywords.some(keyword => desc.includes(keyword));
            if (isService) {
              entradasServico += Number(item.totalValue) || 0;
            }
          });
        }
      }

      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach((p) => {
          const amt = Number(p.amount) || 0;
          const method = String(p.method || "dinheiro").toLowerCase();
          const pDateStr = p.date || sale.date;
          if (isDateInSession(pDateStr, currentSession)) {
            if (method === "dinheiro") {
              cashInflow += amt;
            } else if (method === "pix") {
              totalPixInflow += amt;
            } else {
              totalCardInflow += amt;
            }
          }
        });
      } else {
        const sDateStr = sale.date;
        if (isDateInSession(sDateStr, currentSession)) {
          const meth = String(sale.paymentMethod || "dinheiro").toLowerCase();
          const amt = sale.balanceDue === 0 ? sale.totalValue : (sale.downPayment || 0);
          if (meth === "dinheiro") {
            cashInflow += amt;
          } else if (meth === "pix") {
            totalPixInflow += amt;
          } else {
            totalCardInflow += amt;
          }
        }
      }
    });

    // Sum standalone expenses created during active session
    let expensesTotal = 0;
    expenses.forEach((expense) => {
      if (!expense.date) return;
      if (isDateInSession(expense.date, currentSession)) {
        expensesTotal += Number(expense.value) || 0;
      }
    });

    const totalCustos = operationCosts + expensesTotal + totalMotoboy;
    const expectedInDrawer = currentSession.valorAbertura + cashInflow - totalCustos;
    const totalFreeVolume = cashInflow + totalPixInflow + totalCardInflow;
    const lucroLiquido = totalFreeVolume - totalCustos;

    const observations = `🔒 FECHAMENTO AUTOMÁTICO SOLICITADO (Fim do Expediente h: ${closingTime})\n\n` +
      `Contabilidade automática realizada pelo sistema pós prompt do operador:\n` +
      `• Saldo de Abertura: R$ ${currentSession.valorAbertura.toFixed(2)}\n` +
      `• Entradas / Sinais (Caixa): R$ ${totalFreeVolume.toFixed(2)}\n` +
      `• Entrada de Serviços: R$ ${totalSalesInSession.toFixed(2)}\n` +
      `• Custos Totais: R$ ${totalCustos.toFixed(2)} (Custo Operacional: R$ ${operationCosts.toFixed(2)} | Despesas: R$ ${expensesTotal.toFixed(2)} | Motoboy: R$ ${totalMotoboy.toFixed(2)})\n` +
      `• Lucro Real Calculado: R$ ${lucroLiquido.toFixed(2)}\n` +
      `• Entrada em Dinheiro Físico: + R$ ${cashInflow.toFixed(2)}\n` +
      `• Saída de Fundo via Despesas: - R$ ${totalCustos.toFixed(2)}\n` +
      `• Dinheiro Líquido Esperado na Gaveta: R$ ${expectedInDrawer.toFixed(2)}\n` +
      `• Recursos via PIX: R$ ${totalPixInflow.toFixed(2)}\n` +
      `• Recursos via Cartão: R$ ${totalCardInflow.toFixed(2)}\n` +
      `• Total de Pedidos Faturados: ${salesCount} vendas\n` +
      `• Saldo Total Entrado Livre (Dinheiro + Pix + Cartão): R$ ${totalFreeVolume.toFixed(2)}`;

    const closedSession: CashRegisterSession = {
      ...currentSession,
      status: "fechado",
      valorFechamentoEsperado: expectedInDrawer,
      valorFechamentoReal: expectedInDrawer,
      dataFechamento: new Date().toISOString(),
      observacoes: observations
    };

    const updatedState: CashRegisterState = {
      currentSession: null,
      history: [closedSession, ...cashRegister.history]
    };

    setCashRegister(updatedState);
    localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(updatedState));

    try {
      playCloseRegisterSound();
    } catch (soundErr) {
      console.warn(soundErr);
    }

    if (currentUser && isSupabaseConfigured()) {
      const companyId = currentUser.owner_id || currentUser.id;
      dbSaveCashRegister(companyId, updatedState).catch((syncErr) => {
        console.error("Error auto-syncing cash register:", syncErr);
      });
    }

    addToast(`🔒 O caixa da empresa foi fechado automaticamente. Contabilidade realizada com Valor Líquido de R$ ${expectedInDrawer.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em caixa.`, "success");
    setShowAutoClosePrompt(false);
  };

  // Save or edit action handler
  const handleSaleSaved = (newSale: Sale) => {
    if (!requireOpenCashRegister("qualquer venda")) {
      return;
    }
    const exists = sales.some((s) => s.id === newSale.id);
    
    // Decrement stock of matched catalog products on a new sale
    if (!exists) {
      newSale.items.forEach((item) => {
        const descMatch = String(item.description).trim().toLowerCase();
        const matchedProduct = catalogProducts.find(
          (p) => String(p.description).trim().toLowerCase() === descMatch
        );

        if (matchedProduct) {
          const qty = Number(item.quantity) || 0;
          if (qty > 0) {
            const newStock = Math.max(0, matchedProduct.currentStock - qty);
            
            // 1. Update local state
            setCatalogProducts((prev) =>
              prev.map((p) => (p.id === matchedProduct.id ? { ...p, currentStock: newStock } : p))
            );

            // 2. Sync with Supabase
            if (currentUser && isSupabaseConfigured()) {
              const companyOwnerId = currentUser.owner_id || currentUser.id;
              dbUpdateProductStock(companyOwnerId, matchedProduct.id, newStock)
                .catch((err) => console.error(`Error updating stock for product ${matchedProduct.description}:`, err));
            }
          }
        }
      });
    }

    const operatorRole: "atendente" | "administrador" = 
      (currentUser?.role === "atendente" || currentUser?.role === "seller") ? "atendente" : "administrador";
    const operatorName = currentUser?.name || currentUser?.username || "Administrador";
    const operatorId = currentUser?.id || "admin";

    const attributedSale: Sale = {
      ...newSale,
      sellerId: newSale.sellerId || operatorId,
      sellerName: newSale.sellerName || operatorName,
      sellerRole: newSale.sellerRole || operatorRole,
    };

    setSales((prev) => {
      const exists = prev.some((s) => s.id === attributedSale.id);
      if (exists) {
        return prev.map((s) => (s.id === attributedSale.id ? attributedSale : s));
      }
      return [attributedSale, ...prev];
    });
    // Auto-reset filters so new sales are immediately visible in Vendas do dia
    setSalesStatusFilter("all");
    setSalesDateFilter("today");
    setFilterPeriod("today");
    setActiveEditingSale(null);

    if (currentUser && isSupabaseConfigured()) {
      const companyOwnerId = currentUser.owner_id || currentUser.id;
      dbSaveSale(companyOwnerId, attributedSale)
        .catch((err) => console.error("Error syncing sale to Supabase:", err));
    }

    setHighPriorityNotification({
      id: attributedSale.id,
      title: exists ? "Venda Atualizada!" : "Nova Venda Registrada!",
      clientName: attributedSale.clientName,
      totalValue: attributedSale.totalValue,
      paymentMethod: attributedSale.paymentMethod ? attributedSale.paymentMethod.toUpperCase() : "DINHEIRO",
    });

    playCashRegisterSound();
    addToast(exists ? "Venda atualizada com sucesso! 📝" : "Nova venda criada com sucesso! 💵", "success");
  };

  // Budget management handlers
  const handleBudgetSaved = (newBudget: Sale) => {
    if (!requireOpenCashRegister("qualquer orçamento")) {
      return;
    }
    const operatorRole: "atendente" | "administrador" = 
      (currentUser?.role === "atendente" || currentUser?.role === "seller") ? "atendente" : "administrador";
    const operatorName = currentUser?.name || currentUser?.username || "Administrador";
    const operatorId = currentUser?.id || "admin";

    const attributedBudget: Sale = {
      ...newBudget,
      sellerId: newBudget.sellerId || operatorId,
      sellerName: newBudget.sellerName || operatorName,
      sellerRole: newBudget.sellerRole || operatorRole,
    };

    const exists = budgets.some((b) => b.id === attributedBudget.id);
    setBudgets((prev) => {
      const exists = prev.some((b) => b.id === attributedBudget.id);
      if (exists) {
        return prev.map((b) => (b.id === attributedBudget.id ? attributedBudget : b));
      }
      return [...prev, attributedBudget];
    });
    setActiveEditingSale(null);

    if (currentUser && isSupabaseConfigured()) {
      const companyOwnerId = currentUser.owner_id || currentUser.id;
      dbSaveSale(companyOwnerId, attributedBudget)
        .catch((err) => console.error("Error syncing budget to Supabase:", err));
    }
    playAlertSound("success");
    addToast(exists ? "Orçamento atualizado com sucesso! 📝" : "Novo orçamento registrado! 📋", "success");
  };

  const handleDeleteBudget = (id: string) => {
    if (!cashRegister.currentSession) {
      addToast("⛔ Ação Bloqueada! Você precisa abrir o caixa antes de remover orçamentos.", "error");
      return;
    }
    requestAdminUnlock(() => {
      const budgetToDelete = budgets.find((b) => b.id === id);
      if (budgetToDelete) {
        const auditRecord: DeletionAuditRecord = {
          id: `del_bud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          deletedAt: new Date().toISOString(),
          itemType: "orcamento",
          itemId: budgetToDelete.id,
          itemTitle: `Orçamento #${budgetToDelete.id.slice(0, 8).toUpperCase()} - ${budgetToDelete.clientName || "Cliente"}`,
          clientName: budgetToDelete.clientName || "Cliente",
          clientPhone: budgetToDelete.clientPhone || "",
          totalValue: Number(budgetToDelete.totalValue) || 0,
          paidValue: 0,
          paymentMethod: budgetToDelete.paymentMethod || "orçamento",
          productsSummary: budgetToDelete.items?.map(i => `${i.quantity}x ${i.description}`).join(", ") || "Sem itens detalhados",
          details: `Orçamento lançado em ${getLocalDateFromISO(budgetToDelete.date) || budgetToDelete.date} excluído definitivamente`,
          deletedByUserId: currentUser?.id || "",
          deletedByName: currentUser?.name || "Administrador",
          deletedByUsername: currentUser?.username || "admin",
          deletedByRole: isAttendant ? "atendente" : "administrador"
        };
        const ownerId = currentUser?.owner_id || currentUser?.id || "";
        if (ownerId) {
          saveLocalDeletionAuditRecord(auditRecord, ownerId);
          setDeletionAuditRecords(prev => [auditRecord, ...prev]);
        }
      }

      setBudgets((prev) => prev.filter((b) => b.id !== id));
      playAlertSound("delete");
      addToast("Orçamento excluído com sucesso! 🗑️", "info");
      if (activeEditingSale?.id === id) {
        setActiveEditingSale(null);
      }
      if (isSupabaseConfigured()) {
        dbDeleteSale(id)
          .catch((err) => console.error("Error deleting budget from Supabase:", err));
      }
    }, "Excluir um orçamento registrado exige autorização do Administrador.");
  };

  const handleBudgetExecuted = (id: string) => {
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  const handleExecuteBudget = (budget: Sale) => {
    const officialSale: Sale = {
      ...budget,
      isBudget: false,
      date: new Date().toISOString()
    };
    handleSaleSaved(officialSale);
    handleBudgetExecuted(budget.id);
    addToast("Orçamento faturado e executado com sucesso! 🚀", "success");
  };

  // Select client from table history to load into form edits
  const handleEditSale = (sale: Sale) => {
    requestAdminUnlock(() => {
      setActiveEditingSale(sale);
      // Auto shift focus to launcher tab
      setActiveTab("sale");
      // Scroll smoothly to top
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, "Editar uma venda registrada exige autorização do Administrador.");
  };

  // Pre-fill a client name and phone for a new sale
  const handleNewOrderWithClient = (clientName: string, clientPhone: string) => {
    setActiveEditingSale(null); // Clear any active editing sale to start a fresh sale
    setPreselectedClient({ name: clientName, phone: clientPhone });
    setActiveTab("sale");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Delete sale record
  const handleDeleteSale = (id: string) => {
    if (!cashRegister.currentSession) {
      addToast("⛔ Ação Bloqueada! Você precisa abrir o caixa antes de remover vendas do histórico.", "error");
      return;
    }
    requestAdminUnlock(() => {
      const saleToDelete = sales.find((s) => s.id === id);
      if (saleToDelete) {
        const auditRecord: DeletionAuditRecord = {
          id: `del_sale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          deletedAt: new Date().toISOString(),
          itemType: "venda",
          itemId: saleToDelete.id,
          itemTitle: `Venda #${saleToDelete.id.slice(0, 8).toUpperCase()} - ${saleToDelete.clientName || "Cliente Balcão"}`,
          clientName: saleToDelete.clientName || "Cliente Balcão",
          clientPhone: saleToDelete.clientPhone || "",
          totalValue: Number(saleToDelete.totalValue) || 0,
          paidValue: Number(saleToDelete.downPayment) || 0,
          paymentMethod: saleToDelete.paymentMethod || "não especificado",
          productsSummary: saleToDelete.items?.map(i => `${i.quantity}x ${i.description}`).join(", ") || "Sem itens detalhados",
          details: `Venda lançada em ${getLocalDateFromISO(saleToDelete.date) || saleToDelete.date} excluída do sistema`,
          deletedByUserId: currentUser?.id || "",
          deletedByName: currentUser?.name || "Administrador",
          deletedByUsername: currentUser?.username || "admin",
          deletedByRole: isAttendant ? "atendente" : "administrador"
        };
        const ownerId = currentUser?.owner_id || currentUser?.id || "";
        if (ownerId) {
          saveLocalDeletionAuditRecord(auditRecord, ownerId);
          setDeletionAuditRecords(prev => [auditRecord, ...prev]);
        }
      }

      setSales((prev) => prev.filter((s) => s.id !== id));
      playAlertSound("delete");
      addToast("Registro de venda excluído com sucesso! 🗑️", "info");
      if (activeEditingSale?.id === id) {
        setActiveEditingSale(null);
      }
      if (isSupabaseConfigured()) {
        dbDeleteSale(id)
          .catch((err) => console.error("Error deleting sale from Supabase:", err));
      }
    }, "Excluir uma venda registrada exige autorização do Administrador.");
  };

  // Restore database from imported backup JSON file
  const handleImportBackup = (importedSales: Sale[]) => {
    setSales(importedSales);
    playAlertSound("success");
    addToast("Backup importado com sucesso! Restaurando registros... 🔄", "success");
    if (currentUser && isSupabaseConfigured()) {
      const companyOwnerId = currentUser.owner_id || currentUser.id;
      importedSales.forEach((sale) => {
        dbSaveSale(companyOwnerId, sale)
          .catch((err) => console.error("Error syncing imported sale reference:", err));
      });
    }
  };

  const handleSwitchTab = (tab: "sale" | "dashboard" | "company" | "gastos" | "usuarios" | "relatorios" | "produtos" | "gastosMeta" | "clientes") => {
    if (!isRegisterOpenForToday) {
      setShowCashRegisterModal(true);
      return;
    }
    const isRestrictedTab = ["gastos", "gastosMeta", "produtos", "relatorios", "company", "usuarios", "clientes"].includes(tab);
    if (isAttendant && isRestrictedTab && !adminUnlocked) {
      const messages: Record<string, string> = {
        gastos: "Acesso à área de Despesas de Empresa exige autorização do Administrador.",
        relatorios: "Acesso aos Relatórios Financeiros exige autorização do Administrador.",
        produtos: "Acesso ao Catálogo de Produtos exige autorização do Administrador.",
        company: "Acesso às Configurações da Empresa exige autorização do Administrador.",
        usuarios: "Acesso ao Controle de Usuários exige autorização do Administrador.",
        gastosMeta: "Acesso ao Planejamento de Metas de Gastos exige autorização do Administrador.",
        clientes: "Acesso ao Cadastro de Clientes exige autorização do Administrador."
      };
      requestAdminUnlock(() => {
        setActiveTab(tab);
      }, messages[tab] || "Esta ação exige autorização do Administrador.");
    } else {
      setActiveTab(tab);
    }
  };

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (!currentUser) return;
      // Check for ALT combination and ignore if CTRL or META is also pressed
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === "v") {
          e.preventDefault();
          handleSwitchTab("sale");
          addToast("Atalho Ativado: Tela de Vendas e Caixa 🛍️", "info");
        } else if (key === "g") {
          e.preventDefault();
          handleSwitchTab("gastos");
          addToast("Atalho Ativado: Tela de Despesas / Gastos 💸", "info");
        } else if (key === "r") {
          e.preventDefault();
          handleSwitchTab("relatorios");
          addToast("Atalho Ativado: Relatórios DRE Financeiros 📊", "info");
        }
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => {
      window.removeEventListener("keydown", handleGlobalShortcuts);
    };
  }, [isAttendant, adminUnlocked, currentUser]);

  // Desloga o usuário de forma agressiva ao sair do app, minimizar ou fechar aba/navegador
  useEffect(() => {
    if (!currentUser) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && currentUser) {
        supabase.auth.signOut();
      }
    };

    const handleBeforeUnload = () => {
      if (currentUser) {
        supabase.auth.signOut();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [currentUser]);

  if (!currentUser) {
    return (
      <AuthScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          localStorage.setItem("NUCLEO_CURRENT_USER", JSON.stringify(user));
          setFilterPeriod("today");
          setSalesDateFilter("today");
          // Emit login announcement beep!
          playLoginBeep();
          addToast(`Bem-vindo de volta, ${user.name}! Sessão iniciada. 🚪🔥`, "success");
        }}
      />
    );
  }

  const handleLogout = () => {
    // 1. Clear session-specific keys and user listings locally first to guarantee instant visual logout
    localStorage.removeItem("NUCLEO_CURRENT_USER");
    localStorage.removeItem("NUCLEO_USERS");
    // O caixa pertence à empresa e fica aberto durante todo o expediente, não remover ao sair do sistema
    localStorage.removeItem("NUCLEO_RINGING_REMINDER_IDS");
    
    // Clear the cart/sale form state in localStorage to prevent leakage between user sessions
    localStorage.removeItem("NUCLEO_CART_CLIENT_NAME");
    localStorage.removeItem("NUCLEO_CART_CLIENT_PHONE");
    localStorage.removeItem("NUCLEO_CART_ORDER_DATE");
    localStorage.removeItem("NUCLEO_CART_DELIVERY_DATE");
    localStorage.removeItem("NUCLEO_CART_ITEMS");
    localStorage.removeItem("NUCLEO_CART_USE_MOTOBOY");
    localStorage.removeItem("NUCLEO_CART_MOTOBOY_COST");
    localStorage.removeItem("NUCLEO_CART_DISCOUNT");
    localStorage.removeItem("NUCLEO_CART_DOWN_PAYMENT");
    localStorage.removeItem("NUCLEO_CART_OPERATION_COST");
    localStorage.removeItem("NUCLEO_CART_CLIENT_MODE");
    localStorage.removeItem("NUCLEO_CART_COST_BREAKDOWN_ITEMS");

    // 2. Clear all local keys (including any Supabase client session keys)
    const keysToRemove: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("sb-") || key.includes("supabase"))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch (e) {
      console.warn("localStorage keys removal failed:", e);
    }

    try {
      sessionStorage.clear();
    } catch (e) {
      console.warn("sessionStorage.clear failed:", e);
    }
    
    // 3. Clear current user state
    setCurrentUser(null);
    
    // 4. Perform Supabase sign out in the background (non-blocking) so iframe network limits never block redirection
    if (isSupabaseConfigured()) {
      dbSignOut().catch((err) => {
        console.error("Error signing out from Supabase:", err);
      });
    }

    // 5. Force complete reload to clear browser RAM state and redirect cleanly
    window.location.replace("/");
  };

  // EXPLICIT FRONTEND SUBSCRIPTION WALL: If status is 'vencido', 'bloqueado' or 'expired', or email is 'pedro@gmail.com', force immediate return of the lock screen!
  const directStatusStr = (currentUser?.status_assinatura || (currentUser as any)?.status || "").toString().trim().toLowerCase();
  const isPedroUser = currentUser?.email?.toLowerCase().trim() === "pedro@gmail.com";
  const isLocked = directStatusStr !== "ativo" && directStatusStr !== "active" && (directStatusStr === "vencido" || directStatusStr === "bloqueado" || directStatusStr === "expired" || isPedroUser || isSubscriptionLocked);
  
  const handleUpdateCurrentUser = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    localStorage.setItem("NUCLEO_CURRENT_USER", JSON.stringify(updatedUser));
  };

  if (isLocked) {
    return <TelaDeBloqueio currentUser={currentUser} handleLogout={handleLogout} onUnlock={handleUpdateCurrentUser} />;
  }

  const handleSaveGoalPrompt = () => {
    const val = parseBrazilianValue(tempGoalValue);
    if (val <= 0) {
      addToast("Por favor, digite um valor numérico válido para a meta. ⚠️", "warning");
      return;
    }
    setGoalValue(val);
    setGoalType(tempGoalType);
    setShowDailyGoalPrompt(false);
    
    // Play the grand achievement/success tone
    playGoalBeep();
    addToast(`Meta de lucro ${tempGoalType === "daily" ? "diário" : "total"} configurada em R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}! Boas Vendas! 🏆🎯`, "success");
  };

  const isAdmin = currentUser && (
    currentUser.role === "admin" ||
    currentUser.role === "administrador" ||
    currentUser.is_admin === true ||
    !currentUser.owner_id ||
    currentUser.owner_id === currentUser.id ||
    currentUser.email === "vendas.impactodigital2@gmail.com" ||
    currentUser.email === "sistemavendaadm@gmail.com" ||
    currentUser.email === "sistemadevendaadm@gmail.com"
  );

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex flex-col items-center justify-center p-6 select-none font-sans">
        {/* Ambient background glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-rose-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse duration-[6000ms]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse duration-[8000ms]" />

        <div className="relative flex flex-col items-center max-w-sm w-full text-center space-y-6 animate-fade-in">
          {/* Spinning Brand Ring */}
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-slate-800/80" />
            <div className="absolute w-16 h-16 rounded-full border-4 border-t-rose-500 border-r-purple-500 border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute text-rose-500 text-xs font-black tracking-widest uppercase animate-pulse">
              NÚCLEO
            </div>
          </div>

          {/* Loading text messages with a sub-label */}
          <div className="space-y-2">
            <h3 className="text-lg font-black text-white uppercase tracking-widest font-mono">
              Sincronizando Sistema
            </h3>
            <p className="text-xs text-slate-400">
              Aguarde enquanto carregamos seus dados, caixa e produtos em tempo real do banco de dados seguro...
            </p>
          </div>

          {/* Skeleton mockup container mimicking our sleek UI */}
          <div className="w-full bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3 backdrop-blur-sm shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="h-2 w-24 bg-slate-800 rounded animate-pulse" />
              <div className="h-2 w-12 bg-slate-800 rounded animate-pulse" />
            </div>
            <div className="h-8 w-full bg-slate-800/50 rounded-xl animate-pulse" />
            <div className="h-16 w-full bg-slate-800/50 rounded-xl animate-pulse" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-10 bg-slate-800/40 rounded-lg animate-pulse" />
              <div className="h-10 bg-slate-800/40 rounded-lg animate-pulse" />
            </div>
          </div>

          {/* Tiny latency and protocol status line */}
          <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span>Conexão WebSocket Ativa</span>
          </div>
        </div>
      </div>
    );
  }

  if (isAdminPath) {
    if (!isAdmin) {
      window.history.replaceState({}, "", "/");
      setTimeout(() => {
        addToast("Acesso restrito: área exclusiva para administradores. Redirecionando...", "error");
      }, 50);
    } else {
      return (
        <AdminMensalistas 
          currentUser={currentUser}
          onBack={() => {
            window.history.pushState({}, "", "/");
            setActiveTab("sale");
          }}
          addToast={addToast}
        />
      );
    }
  }

  if (isStandbyActive) {
    return (
      <>
        <StandbyScreen
          companyProfile={company}
          currentUser={currentUser}
          onStartNewSale={() => {
            if (!isRegisterOpenForToday) {
              setShowCashRegisterModal(true);
              return;
            }
            setIsStandbyActive(false);
            setActiveTab("sale");
          }}
          onLogout={handleLogout}
          isCashRegisterOpen={isRegisterOpenForToday}
          onOpenCashRegister={() => {
            setShowCashRegisterModal(true);
          }}
          pendingSalesCount={sales.filter(isPendingRetiradaOrBaixa).length}
          todaysDeliveriesCount={todaysDeliveries.length}
        />

        {/* Synchronized Cash Register Session Opener/Closer Dialog Modal on Standby */}
        <CashRegisterModal
          isOpen={showCashRegisterModal}
          onClose={() => setShowCashRegisterModal(false)}
          cashRegister={cashRegister}
          sales={sales}
          expenses={expenses}
          activeOperatorName={currentUser?.name || ""}
          onOpenRegister={async (valorAbertura, operador) => {
            await handleOpenRegister(valorAbertura, operador);
            setIsStandbyActive(false);
            setActiveTab("sale");
          }}
          onCloseRegister={handleCloseRegister}
          currentUser={currentUser}
          adminUnlocked={adminUnlocked}
          isCashRegisterOpen={isRegisterOpenForToday}
          onRefreshRegister={() => {
            checkGlobalRegisterStatus();
          }}
        />

        <AdminUnlockModal
          isOpen={adminUnlockOpen}
          onClose={() => {
            setAdminUnlockOpen(false);
            setAdminUnlockSuccessCallback(null);
          }}
          onSuccess={handleAdminUnlockSuccess}
          currentUser={currentUser}
          message={adminUnlockMessage}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-brand-dark-navy text-slate-100 flex flex-col justify-between">
      
      {isInitialLoading && (
        <div className="fixed inset-0 z-[9999] bg-[#090d16] flex flex-col items-center justify-center p-6 select-none font-sans">
          {/* Ambient background glows */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-rose-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse duration-[6000ms]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse duration-[8000ms]" />

          <div className="relative flex flex-col items-center max-w-sm w-full text-center space-y-6 animate-fade-in">
            {/* Spinning Brand Ring */}
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-4 border-slate-800/80" />
              <div className="absolute w-16 h-16 rounded-full border-4 border-t-rose-500 border-r-purple-500 border-b-transparent border-l-transparent animate-spin" />
              <div className="absolute text-rose-500 text-xs font-black tracking-widest uppercase animate-pulse">
                NÚCLEO
              </div>
            </div>

            {/* Loading text messages with a sub-label */}
            <div className="space-y-2">
              <h3 className="text-lg font-black text-white uppercase tracking-widest font-mono">
                Sincronizando Sistema
              </h3>
              <p className="text-xs text-slate-400">
                Aguarde enquanto carregamos seus dados, caixa e produtos em tempo real do banco de dados seguro...
              </p>
            </div>

            {/* Skeleton mockup container mimicking our sleek UI */}
            <div className="w-full bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3 backdrop-blur-sm shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="h-2 w-24 bg-slate-800 rounded animate-pulse" />
                <div className="h-2 w-12 bg-slate-800 rounded animate-pulse" />
              </div>
              <div className="h-8 w-full bg-slate-800/50 rounded-xl animate-pulse" />
              <div className="h-16 w-full bg-slate-800/50 rounded-xl animate-pulse" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-10 bg-slate-800/40 rounded-lg animate-pulse" />
                <div className="h-10 bg-slate-800/40 rounded-lg animate-pulse" />
              </div>
            </div>

            {/* Tiny latency and protocol status line */}
            <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <span>Conexão WebSocket Ativa</span>
            </div>
          </div>
        </div>
      )}
      
      {/* 1. Global Navigation header toolbar */}
      <Header 
        activeTab={activeTab} 
        setActiveTab={handleSwitchTab} 
        companyName={company.tradingName} 
        companyLogo={company.logo}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenStandby={() => setIsStandbyActive(true)}
        dailyMetaGoal={todayEffectiveGoal}
        todayNetProfitLive={todayNetProfitLive}
        hideMetaValues={hideMetaValues}
        todaysDeliveriesCount={todaysDeliveries.length}
        todaysMaterialsCount={todaysMaterialsCount}
        onDeliveriesClick={() => {
          playAlertSound("info");
          setShowLogisticsAiModal(true);
          fetchLogisticsAi();
        }}
        adminUnlocked={adminUnlocked}
        onRequestAdminUnlock={requestAdminUnlock}
        onLockAdmin={() => {
          setAdminUnlocked(false);
          addToast("🔒 Direitos de Administrador bloqueados novamente.", "info");
        }}
        onLocateClientClick={() => {
          setShowClientSearchModal(true);
        }}
        pendingSalesCount={sales.filter(isPendingRetiradaOrBaixa).length}
        onRetiradasClick={() => setShowPendingModal(true)}
        onMetasSemanaClick={() => setShowWeeklyGoalModal(true)}
        isCashRegisterOpen={isRegisterOpenForToday}
        onCashRegisterClick={() => setShowCashRegisterModal(true)}
        dbSyncing={dbSyncing}
      />

      {readOnlyMode && (
        <div className="bg-gradient-to-r from-amber-600/20 to-amber-500/20 text-amber-500 border-b border-amber-500/15 py-1.5 px-4 text-[11px] font-black text-center flex items-center justify-center gap-1.5 font-mono select-none">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-450 animate-pulse" />
          <span>MODO APENAS LEITURA (O CAIXA DE HOJE JÁ FOI ENCERRADO E CONSOLIDADO)</span>
        </div>
      )}

      {/* 2. Main content router viewport */}
      <main className="flex-grow max-w-[1700px] 2xl:max-w-[1920px] w-full mx-auto px-2 xs:px-4 sm:px-6 md:px-8 py-2.5 sm:py-5 space-y-4 sm:space-y-6">
        {isInitialLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3 animate-fade-in">
            <RefreshCw className="h-8 w-8 animate-spin text-cyan-500 stroke-[1.5]" />
            <p className="text-xs font-mono uppercase tracking-widest text-slate-455">Sincronizando painel operacional...</p>
          </div>
        ) : !isRegisterOpenForToday ? (
          /* HARD BLOCK SCREEN WHEN CASH REGISTER IS CLOSED */
          <ClosedRegisterGate
            onOpenRegisterClick={() => setShowCashRegisterModal(true)}
            operatorName={currentUser?.name || currentUser?.username}
          />
        ) : (
          /* REGULAR OPERATIONAL VIEWPORTS CONTENT */
          <>
            {/* Unified System Dashboard Controller Bar (Ultra-Compact Dense UI) */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-slate-900/60 backdrop-blur-md rounded-xl border border-slate-800 shadow-md">
          {/* Left Block: Active Screen Badge & Action Controls Inline */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-950 rounded-lg border border-slate-850 shrink-0">
              {activeTab === "company" ? (
                <>
                  <Building2 className="h-3.5 w-3.5 text-brand-magenta" />
                  <span className="text-[11px] font-black text-rose-100 uppercase tracking-wider">Empresa</span>
                </>
              ) : activeTab === "usuarios" ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-brand-cyan" />
                  <span className="text-[11px] font-black text-cyan-100 uppercase tracking-wider">Usuários</span>
                </>
              ) : activeTab === "produtos" ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-emerald-450" />
                  <span className="text-[11px] font-black text-emerald-100 uppercase tracking-wider">Produtos</span>
                </>
              ) : activeTab === "atendentes" ? (
                <>
                  <UserCheck className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="text-[11px] font-black text-cyan-200 uppercase tracking-wider">Atendentes & Auditoria</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-brand-magenta animate-pulse" />
                  <span className="text-[11px] font-black text-slate-100 uppercase tracking-wider">
                    {activeTab === "sale" 
                      ? activeEditingSale 
                        ? "Editar Venda"
                        : "Vendas e Caixa"
                      : activeTab === "relatorios"
                        ? "DRE Financeira"
                        : activeTab === "gastosMeta"
                          ? "Gastos / Metas"
                          : "Resultados"}
                  </span>
                </>
              )}
            </div>

            {/* In-Line Title Details */}
            {activeTab === "sale" && activeEditingSale && (
              <span className="text-xs font-bold text-brand-magenta animate-pulse shrink-0 font-mono">
                ✏️ EDITANDO: {activeEditingSale.clientName.toUpperCase()}
              </span>
            )}

            {/* Direct Inline Action Control Buttons */}
            <div className="flex items-center gap-1.5">
              {currentUser?.email?.toLowerCase().trim() === "sistemadevendaadm@gmail.com" && (
                <button
                  id="btn-admin-aplicar-nova-estrutura"
                  type="button"
                  onClick={handleApplyNewStructure}
                  disabled={isApplyingStructure}
                  className="px-3 py-1 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-extrabold text-xs rounded-lg shadow-md border border-emerald-400/40 cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 shrink-0"
                  title="Aplicar Nova Estrutura no Supabase (configuracoes_sistema) e sincronizar clientes em tempo real"
                >
                  <Rocket className={`h-3.5 w-3.5 text-emerald-200 ${isApplyingStructure ? "animate-spin" : ""}`} />
                  <span>{isApplyingStructure ? "Aplicando..." : "Aplicar Nova Estrutura"}</span>
                  {pendingDraftsCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-amber-400 text-slate-950 text-[10px] font-black rounded-full leading-none">
                      {pendingDraftsCount}
                    </span>
                  )}
                </button>
              )}

              {activeEditingSale && activeTab === "sale" && (
                <button
                  onClick={() => setActiveEditingSale(null)}
                  className="px-2 py-1 rounded-lg border border-red-500/20 text-red-400 bg-red-950/10 hover:bg-red-950/20 transition-all cursor-pointer text-xs font-bold"
                  title="Cancelar Edição"
                >
                  Cancelar Edição
                </button>
              )}
              
              {dbSyncing && (
                <div className="px-2.5 py-1 bg-slate-950 text-emerald-450 rounded-lg border border-emerald-950 flex items-center gap-1 text-[11px] font-bold animate-pulse h-[28px]">
                  <RefreshCw className="h-3 w-3 animate-spin text-emerald-450" />
                  <span className="hidden sm:inline">Sincronizado</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Block: Unified Global Period Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider hidden sm:inline font-mono">Período:</span>
            <div className="flex bg-slate-950 p-[3px] rounded-lg border border-slate-850">
              {(["all", "today", "week", "custom"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setFilterPeriod(period)}
                  className={`px-2 py-1 text-[11px] font-extrabold rounded-md transition-all cursor-pointer ${
                    filterPeriod === period
                      ? "bg-brand-cyan/20 text-brand-cyan shadow-[0_0_6px_rgba(34,211,238,0.1)] font-black"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {period === "all" ? "Tudo" : period === "today" ? "Hoje" : period === "week" ? "7 dias" : "Por Data"}
                </button>
              ))}
            </div>

            {filterPeriod === "custom" && (
              <div className="flex items-center gap-1 text-xs font-bold text-slate-400 animate-fadeIn">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-slate-950 border border-slate-850 rounded-lg px-2 py-0.5 text-xs text-brand-cyan font-mono font-bold focus:outline-none focus:border-brand-cyan transition-all h-[26px]"
                />
                <span className="text-slate-600 text-[10px]">Até</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-slate-950 border border-slate-850 rounded-lg px-2 py-0.5 text-xs text-brand-cyan font-mono font-bold focus:outline-none focus:border-brand-cyan transition-all h-[26px]"
                />
              </div>
            )}
          </div>
        </div>

        {/* METRICS VIEW PORT TABS */}
        <div className="space-y-6 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18, ease: "easeInOut" }}
              className="space-y-6"
            >
              {activeTab === "company" ? (
                /* Admin settings profile tab */
                <React.Suspense fallback={<LazyLoader />}>
                  <CompanySettings
                    company={company}
                    onSaveCompany={(updatedCompany) => {
                      requestAdminUnlock(() => {
                        if (currentUser) {
                          const companyOwnerId = currentUser.owner_id || currentUser.id;
                          companyLoadedForUserId.current = currentUser.id;
                          if (isSupabaseConfigured()) {
                            dbSaveCompanyProfile(companyOwnerId, updatedCompany)
                              .then((success) => {
                                if (success) {
                                  console.log("Perfil da empresa salvo na nuvem com sucesso.");
                                }
                              })
                              .catch((err) => console.error("Error saving company to Supabase:", err));
                          }
                        }
                        setCompany(updatedCompany);
                        addToast("Informações da empresa salvas com sucesso! 🏢", "success");
                      }, "Salvar alterações da empresa exige autorização do Administrador.");
                    }}
                    soundEnabled={soundEnabled}
                    onToggleSound={handleToggleSound}
                    currentUser={currentUser}
                    onRefreshData={triggerRemoteSync}
                    cashRegister={cashRegister}
                    onOpenRegister={handleOpenRegister}
                    onCloseRegister={handleCloseRegister}
                    onNavigateToAtendentes={() => setActiveTab("atendentes")}
                  />
                </React.Suspense>
              ) : activeTab === "sale" ? (
                /* Creation and operational tab list view */
                <div className="space-y-6">
                  <SaleForm
                    onSaleSaved={handleSaleSaved}
                    onBudgetSaved={handleBudgetSaved}
                    onBudgetExecuted={handleBudgetExecuted}
                    activeEditingSale={activeEditingSale}
                    clearActiveEditing={() => setActiveEditingSale(null)}
                    company={company}
                    catalogProducts={catalogProducts}
                    existingSales={sales}
                    locateClientClicks={locateClientClicks}
                    currentUser={currentUser}
                    adminUnlocked={adminUnlocked}
                    onRequestAdminUnlock={requestAdminUnlock}
                    preselectedClient={preselectedClient}
                    clearPreselectedClient={() => setPreselectedClient(null)}
                    cashRegister={cashRegister}
                    isGlobalRegisterOpen={isGlobalRegisterOpen || (cashRegister.currentSession?.status === "aberto")}
                    onRequestOpenRegister={() => {
                      setActiveTab("sale");
                      setShowCashRegisterModal(true);
                    }}
                  />
                  
                  <div className="pt-6 border-t border-slate-850">
                    <SalesHistory
                      sales={sales}
                      budgets={budgets}
                      onDeleteSale={handleDeleteSale}
                      onDeleteBudget={handleDeleteBudget}
                      onEditSale={handleEditSale}
                      onEditBudget={handleEditSale}
                      onExecuteBudget={handleExecuteBudget}
                      onImportBackup={handleImportBackup}
                      company={company}
                      onSaveSale={handleSaleSaved}
                      statusFilter={salesStatusFilter}
                      setStatusFilter={setSalesStatusFilter}
                      dateFilter={salesDateFilter}
                      setDateFilter={setSalesDateFilter}
                      customDate={customDate}
                      setCustomDate={setCustomDate}
                      customStartDate={customStartDate}
                      customEndDate={customEndDate}
                      setCustomStartDate={setCustomStartDate}
                      setCustomEndDate={setCustomEndDate}
                      currentUser={currentUser}
                      isAttendant={isAttendant}
                      adminUnlocked={adminUnlocked}
                      onRequestAdminUnlock={requestAdminUnlock}
                    />
                  </div>
                </div>
              ) : activeTab === "gastos" ? (
                /* Dedicated standalone expense registration & reports dashboard */
                <React.Suspense fallback={<LazyLoader />}>
                  <ExpensesManager
                    expenses={expenses}
                    onAddExpense={handleAddExpense}
                    onDeleteExpense={handleDeleteExpense}
                    sales={sales}
                    bills={bills}
                    daysWorked={daysWorked}
                    cashRegister={cashRegister}
                    onRequestOpenRegister={() => {
                      setActiveTab("sale");
                      setShowCashRegisterModal(true);
                    }}
                    currentUser={currentUser}
                    adminUnlocked={adminUnlocked}
                  />
                </React.Suspense>
              ) : activeTab === "gastosMeta" ? (
                <React.Suspense fallback={<LazyLoader />}>
                  <MonthlyExpensesMeta
                    todayNetProfit={todayNetProfitLive}
                    bills={bills}
                    setBills={setBills}
                    daysWorked={daysWorked}
                    setDaysWorked={setDaysWorked}
                    currentUser={currentUser}
                  />
                </React.Suspense>
              ) : activeTab === "usuarios" ? (
                /* Users Management custom panel */
                <React.Suspense fallback={<LazyLoader />}>
                  <UsersManager
                    currentUser={currentUser}
                    onUpdateCurrentUser={handleUpdateCurrentUser}
                    onNavigateToAtendentes={() => setActiveTab("atendentes")}
                  />
                </React.Suspense>
              ) : activeTab === "relatorios" ? (
                /* Custom Financial Reports panel */
                <React.Suspense fallback={<LazyLoader />}>
                  <FinancialReports
                    sales={sales}
                    expenses={expenses}
                    company={company}
                    cashRegister={cashRegister}
                  />
                </React.Suspense>
              ) : activeTab === "produtos" ? (
                /* Product & Stock Catalog directory tab */
                <React.Suspense fallback={<LazyLoader />}>
                  <ProductCatalogManager
                    catalogProducts={catalogProducts}
                    setCatalogProducts={setCatalogProducts}
                    addToast={addToast}
                    currentUser={currentUser}
                  />
                </React.Suspense>
              ) : activeTab === "clientes" ? (
                /* Secure multi-tenant Customer CRM manager tab */
                <React.Suspense fallback={<LazyLoader />}>
                  <ClientesManager
                    addToast={addToast}
                    currentUser={currentUser}
                    sales={sales}
                    onNewOrderWithClient={handleNewOrderWithClient}
                    onEditSale={handleEditSale}
                    onSaveSale={handleSaleSaved}
                    company={company}
                    adminUnlocked={adminUnlocked}
                  />
                </React.Suspense>
              ) : activeTab === "atendentes" ? (
                /* Atendentes & Audit of Deletions and Activity */
                <React.Suspense fallback={<LazyLoader />}>
                  <AttendantsManager
                    currentUser={currentUser}
                    sales={sales}
                    budgets={budgets}
                    expenses={expenses}
                    deletionRecords={deletionAuditRecords}
                    onClearDeletions={handleClearDeletionRecords}
                    company={company}
                  />
                </React.Suspense>
              ) : activeTab === "suporte" ? (
                /* Secure multi-tenant Support Voice Feedback recording center */
                <React.Suspense fallback={<LazyLoader />}>
                  <SupportPanel
                    currentUser={currentUser}
                    addToast={addToast}
                  />
                </React.Suspense>
              ) : (
                /* Interactive analytic charts cockpit view */
                <div className="space-y-6">
                  <MetricsCards 
                    sales={sales} 
                    expenses={expenses} 
                    filterPeriod={filterPeriod}
                    customDate={customDate}
                    customStartDate={customStartDate}
                    customEndDate={customEndDate}
                    isDailyGoalAchieved={isGoalReached || (goalType === "daily" && goalValue > 0 && todayNetProfitLive >= goalValue)}
                    dailyGoalValue={goalType === "daily" && goalValue > 0 ? goalValue : todayEffectiveGoal}
                    onPendingClick={() => setShowPendingModal(true)} 
                    onWeeklyGoalClick={() => setShowWeeklyGoalModal(true)}
                    onCardClick={handleCardClick}
                  />
                  
                  <div id="charts-section">
                    <DashboardCharts 
                      sales={sales} 
                      expenses={expenses}
                      goalValue={goalValue}
                      setGoalValue={setGoalValue}
                      goalType={goalType}
                      setGoalType={setGoalType}
                      onPlayBeep={playGoalBeep}
                      filterPeriod={filterPeriod}
                      setFilterPeriod={setFilterPeriod}
                      customDate={customDate}
                      setCustomDate={setCustomDate}
                      customStartDate={customStartDate}
                      customEndDate={customEndDate}
                    />
                  </div>
                  
                  {/* Detailed Database listing in the dashboard as well */}
                  <div id="sales-history-section" className="pt-4 scroll-mt-6">
                    <SalesHistory
                      sales={sales}
                      budgets={budgets}
                      onDeleteSale={handleDeleteSale}
                      onDeleteBudget={handleDeleteBudget}
                      onEditSale={handleEditSale}
                      onEditBudget={handleEditSale}
                      onExecuteBudget={handleExecuteBudget}
                      onImportBackup={handleImportBackup}
                      company={company}
                      onSaveSale={handleSaleSaved}
                      statusFilter={salesStatusFilter}
                      setStatusFilter={setSalesStatusFilter}
                      dateFilter={salesDateFilter}
                      setDateFilter={setSalesDateFilter}
                      customDate={customDate}
                      setCustomDate={setCustomDate}
                      customStartDate={customStartDate}
                      customEndDate={customEndDate}
                      setCustomStartDate={setCustomStartDate}
                      setCustomEndDate={setCustomEndDate}
                      currentUser={currentUser}
                      isAttendant={isAttendant}
                      adminUnlocked={adminUnlocked}
                      onRequestAdminUnlock={requestAdminUnlock}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        </>
        )}
      </main>

      {/* 3. Humble layout footer with signature */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-6 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© 2026 {company?.tradingName || "Sistema de Vendas Núcleo"} - Todos os direitos reservados.</p>
          <p className="flex items-center gap-1.5 justify-center md:justify-end">
            Desenvolvido sob o perfil de <span className="text-brand-cyan font-bold">{company?.tradingName || "Refrigeração Preventiva"}</span>
          </p>
        </div>
      </footer>

      {/* Modal for managing material withdrawal and picking up outstanding balances */}
      <PendingSalesModal
        isOpen={showPendingModal}
        onClose={() => setShowPendingModal(false)}
        sales={sales}
        onSaveSale={handleSaleSaved}
        company={company}
        onEditSale={handleEditSale}
        onDeleteSale={handleDeleteSale}
      />

      {/* Modal for Client Search & Complete Order / Notinha History */}
      <ClientSearchModal
        isOpen={showClientSearchModal}
        onClose={() => setShowClientSearchModal(false)}
        sales={sales}
        budgets={budgets}
        company={company}
        onNewOrderWithClient={(clientName, clientPhone) => {
          setPreselectedClient({ name: clientName, phone: clientPhone });
          handleSwitchTab("sale");
          addToast(`Cliente "${clientName}" selecionado para novo pedido!`, "success");
        }}
        onEditSale={handleEditSale}
        onSaveSale={handleSaleSaved}
      />

      {/* Interactive prompt to suggest registering daily goal on login */}
      <AnimatePresence>
        {showDailyGoalPrompt && (
          <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[99999] flex items-center justify-center p-4 overflow-y-auto">
            {/* Ambient Background Lights */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-magenta/15 rounded-full blur-[120px] pointer-events-none animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-cyan/15 rounded-full blur-[120px] pointer-events-none" />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 120 }}
              className="bg-slate-900/90 border border-slate-800 rounded-3xl max-w-lg w-full p-8 space-y-6 shadow-2xl shadow-brand-magenta/5 relative overflow-hidden my-8"
            >
              {/* Top border decor accent */}
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-brand-magenta via-brand-cyan to-emerald-400" />

              <button
                type="button"
                onClick={() => {
                  playAlertSound("info");
                  setShowDailyGoalPrompt(false);
                }}
                className="absolute right-5 top-5 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800/80 transition-all cursor-pointer z-10"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-4 bg-gradient-to-br from-brand-magenta/20 to-brand-cyan/10 border border-brand-magenta/30 text-brand-magenta rounded-2xl shadow-inner relative group">
                  <Trophy className="h-12 w-12 text-brand-magenta animate-pulse" />
                  <Sparkles className="h-5 w-5 text-brand-cyan absolute -top-1 -right-1 animate-bounce" />
                </div>
                
                <div>
                  <span className="text-[10px] uppercase font-mono px-2.5 py-1 bg-brand-magenta/10 text-brand-magenta rounded-full font-bold border border-brand-magenta/20 tracking-widest">
                    ALCANCE O SUCESSO
                  </span>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight mt-3">
                    Estipular Meta de Lucro Líquido
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-sm mt-2">
                    Defina agora o seu alvo de <strong>lucro líquido (valor recebido menos custo dos produtos)</strong> para hoje! O painel exibirá as estatísticas atualizadas centavo por centavo.
                  </p>
                </div>
              </div>

              {/* Status info showing current live net profit */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-850 flex items-center justify-between font-mono text-xs text-slate-400">
                <span className="text-slate-300">Lucro Líquido Atual:</span>
                <strong className={`font-bold transition-colors ${todayNetProfitLive > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                  R$ {todayNetProfitLive.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </strong>
              </div>

              <div className="space-y-4">
                {/* Meta Type Selection */}
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                    Tipo de Meta
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-850">
                    <button
                      type="button"
                      onClick={() => {
                        playAlertSound("info");
                        setTempGoalType("daily");
                      }}
                      className={`py-3 px-3 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                        tempGoalType === "daily"
                          ? "bg-brand-magenta text-white shadow-lg shadow-brand-magenta/20"
                          : "text-slate-400 hover:text-white hover:bg-slate-900"
                      }`}
                    >
                      Meta Diária (Hoje)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playAlertSound("info");
                        setTempGoalType("overall");
                      }}
                      className={`py-3 px-3 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                        tempGoalType === "overall"
                          ? "bg-brand-cyan text-brand-dark-navy shadow-lg shadow-brand-cyan/20"
                          : "text-slate-400 hover:text-white hover:bg-slate-900"
                      }`}
                    >
                      Meta Acumulada
                    </button>
                  </div>
                </div>

                {/* Preset value suggestions */}
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                    Sugestões Rápidas:
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {["100", "300", "500", "1000"].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          playAlertSound("success");
                          setTempGoalValue(preset + ",00");
                        }}
                        className="py-1.5 bg-slate-950 hover:bg-slate-850 hover:text-white text-[11px] font-mono font-bold text-slate-400 border border-slate-850 rounded-lg transition-colors cursor-pointer"
                      >
                        R$ {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Meta value input */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                    Definir Valor do Alvo (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-black text-lg">R$</span>
                    <input
                      type="text"
                      value={tempGoalValue}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^\d.,]/g, "");
                        setTempGoalValue(val);
                      }}
                      placeholder="Ex: 500,00"
                      className="w-full bg-slate-950 font-mono font-bold text-xl text-brand-cyan placeholder-slate-700 border border-slate-850 rounded-2xl py-4.5 pl-14 pr-4 outline-none focus:border-brand-magenta focus:ring-1 focus:ring-brand-magenta transition-all"
                      autoFocus
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleSaveGoalPrompt}
                  className="w-full bg-gradient-to-r from-brand-magenta via-brand-magenta/90 to-brand-magenta text-white font-black text-sm rounded-2xl py-4 px-5 shadow-xl shadow-brand-magenta/10 hover:shadow-brand-magenta/30 flex items-center justify-center gap-2 cursor-pointer transition-all hover:-translate-y-0.5"
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>Ativar Meta de Lucro</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playAlertSound("info");
                    setShowDailyGoalPrompt(false);
                    addToast("Meta não atualizada. Você pode configurar a qualquer hora pelo painel do caixa! 👍", "info");
                  }}
                  className="w-full bg-slate-850 hover:bg-slate-800 text-slate-300 font-extrabold text-sm rounded-2xl py-4 px-5 cursor-pointer transition-colors"
                >
                  Explorar Painel Primeiro
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Magnificent Fully Animated Delivery Day Full-Screen Overlay */}
      <AnimatePresence>
        {showDeliveryDueOverlay && todaysDeliveries.length > 0 && (
          <div className="fixed inset-0 bg-slate-950/96 backdrop-blur-2xl z-[999995] flex items-center justify-center p-4 overflow-y-auto">
            {/* Ambient Animated Spotlights */}
            <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-brand-cyan/20 blur-[130px] pointer-events-none animate-pulse" />
            <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-brand-magenta/10 blur-[150px] pointer-events-none" />

            {/* Custom Interactive Floating Cargo Packages Shower */}
            {Array.from({ length: 15 }).map((_, idx) => {
              const delay = idx * 0.2;
              const duration = 6 + (idx % 4) * 2;
              const leftPos = (idx * 6.5) + "%";
              
              return (
                <motion.div
                  key={idx}
                  initial={{ y: "110vh", opacity: 0, rotate: 0 }}
                  animate={{ 
                    y: "-10vh", 
                    opacity: [0, 0.7, 0.7, 0],
                    rotate: [0, 90, 180, 270] 
                  }}
                  transition={{
                    duration: duration,
                    delay: delay,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="absolute pointer-events-none text-brand-cyan/20 select-none z-0"
                  style={{ left: leftPos }}
                >
                  <Package className="h-10 w-10 stroke-[1.2]" />
                </motion.div>
              );
            })}

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 20 }}
              className="bg-slate-900/90 border border-brand-cyan/35 rounded-[36px] max-w-2xl w-full p-8 md:p-10 space-y-8 relative shadow-[0_0_50px_rgba(34,211,238,0.06)] overflow-hidden my-8 z-10"
            >
              {/* Top gradient glowing border */}
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-brand-cyan via-brand-magenta to-emerald-400" />

              <button
                type="button"
                onClick={() => {
                  playAlertSound("info");
                  setShowDeliveryDueOverlay(false);
                  const localDate = new Date();
                  const todayStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
                  localStorage.setItem("NUCLEO_LAST_DELIVERY_ALERT_DATE", todayStr);
                }}
                className="absolute right-5 top-5 text-slate-400 hover:text-white p-2.5 rounded-2xl hover:bg-slate-800/80 transition-all cursor-pointer z-10"
                title="Fechar Alerta de Entrega"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-5 bg-gradient-to-br from-brand-cyan/25 to-brand-magenta/10 border border-brand-cyan/30 text-brand-cyan rounded-3xl shadow-inner relative group animate-bounce">
                  <Package className="h-14 w-14 text-brand-cyan drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
                  <Sparkles className="h-6 w-6 text-brand-magenta absolute -top-1.5 -right-1.5 animate-pulse" />
                </div>

                <div>
                  <span className="text-[10px] uppercase font-mono tracking-widest px-3 py-1.5 bg-brand-cyan/10 text-brand-cyan rounded-full font-bold border border-brand-cyan/20">
                    📦 HOJE É DIA DE ENTREGAR!
                  </span>
                  <h2 className="text-3xl font-black text-white uppercase tracking-tight mt-3 leading-none">
                    Entregas Agendadas Para Hoje!
                  </h2>
                  <p className="text-slate-400 text-xs max-w-md mx-auto mt-2 leading-relaxed">
                    Você possui clientes esperando pelo produto hoje! Prepare as mercadorias, acione o motoboy se necessário e atenda com excelência.
                  </p>
                </div>
              </div>

              {/* Delivery stats banner */}
              <div className="grid grid-cols-2 gap-4 bg-slate-950/80 p-4 rounded-2xl border border-slate-850 text-center font-mono">
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Total Entregas</span>
                  <strong className="text-xl text-brand-cyan font-black block mt-1">{todaysDeliveries.length}</strong>
                </div>
                <div className="border-l border-slate-850">
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 block">A Receber Total</span>
                  <strong className="text-xl text-emerald-400 font-black block mt-1">
                    R$ {todaysDeliveries.reduce((sum, d) => sum + d.balanceDue, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              {/* Delivery list scroller */}
              <div className="space-y-3.5 max-h-[260px] overflow-y-auto pr-1 customize-scrollbar font-sans text-left">
                <div className="text-[10px] text-slate-500 mb-2 italic flex items-center gap-1 justify-center leading-none">
                  <span className="text-brand-cyan select-none">💡</span>
                  <span>Toque em um cliente para mudar a entrega ou registrar o motivo.</span>
                </div>
                {todaysDeliveries.map((sale) => (
                  <div 
                    key={sale.id}
                    onClick={() => setReschedulingSale(sale)}
                    className="p-4 bg-slate-950/40 hover:bg-slate-950/80 rounded-2xl border border-slate-850/60 hover:border-brand-cyan/45 hover:shadow-[0_0_15px_rgba(34,211,238,0.05)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative group cursor-pointer text-left"
                    title="Clique para reagendar entrega ou registrar motivo"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-xs text-white uppercase tracking-wide group-hover:text-brand-cyan transition-colors">
                          {sale.clientName.toUpperCase()}
                        </span>
                        {sale.useMotoboy && (
                          <span className="text-[9px] font-mono uppercase bg-brand-cyan/10 text-brand-cyan px-2 py-0.5 rounded border border-brand-cyan/20 font-semibold leading-none">
                            Motoboy Ativo
                          </span>
                        )}
                        <span className="text-[9px] font-mono text-slate-500 group-hover:text-brand-cyan flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-all">
                          <Calendar className="h-2.5 w-2.5" />
                          <span>Alterar</span>
                        </span>
                      </div>
                      
                      <div className="text-[11px] text-slate-400 leading-relaxed font-medium truncate sm:max-w-xs md:max-w-md">
                        {sale.items.map((it) => `${it.quantity}x ${it.description}`).join(", ")}
                      </div>

                      {sale.clientPhone && (
                        <div className="text-[10px] text-slate-550 font-mono flex items-center gap-1 leading-none">
                          <MapPin className="h-3 w-3 shrink-0 text-slate-500" />
                          <span>Telefone: {sale.clientPhone}</span>
                        </div>
                      )}

                      {sale.deliveryReason && (
                        <div className="text-[10px] text-amber-500 font-mono mt-1 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/15 w-fit leading-tight font-semibold">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>Motivo: {sale.deliveryReason}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0 flex sm:flex-col justify-between sm:justify-start items-center sm:items-end gap-1.5 border-t sm:border-0 border-slate-850/50 pt-2 sm:pt-0">
                      <span className="text-[9px] uppercase font-mono tracking-wider text-slate-550 sm:hidden">Pendente:</span>
                      <div>
                        {sale.balanceDue > 0 ? (
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-mono text-amber-550 font-black block">SALDO RESTANTE</span>
                            <strong className="text-sm font-mono text-amber-400 font-bold block">
                              R$ {sale.balanceDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </strong>
                          </div>
                        ) : (
                          <span className="inline-block text-[9px] font-mono uppercase bg-emerald-500/15 text-emerald-400 px-2 py-1 rounded border border-emerald-500/25 font-black leading-none">
                            TOTALMENTE PAGO
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    playAlertSound("success");
                    setShowDeliveryDueOverlay(false);
                    const localDate = new Date();
                    const todayStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
                    localStorage.setItem("NUCLEO_LAST_DELIVERY_ALERT_DATE", todayStr);
                  }}
                  className="w-full bg-gradient-to-r from-brand-cyan to-brand-cyan/80 hover:from-brand-cyan hover:to-brand-cyan text-slate-950 font-black text-sm uppercase py-4.5 px-6 rounded-2xl shadow-xl shadow-brand-cyan/15 hover:shadow-brand-cyan/30 transition-all text-center cursor-pointer active:scale-95 animate-pulse"
                >
                  Bora Entregar Todos! 🚀
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playAlertSound("info");
                    setShowDeliveryDueOverlay(false);
                    const localDate = new Date();
                    const todayStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
                    localStorage.setItem("NUCLEO_LAST_DELIVERY_ALERT_DATE", todayStr);
                    setActiveTab("sale");
                  }}
                  className="w-full bg-slate-850 hover:bg-slate-800 text-slate-350 hover:text-white font-extrabold text-sm rounded-2xl py-4 px-5 cursor-pointer transition-colors"
                >
                  Ir Para o Painel de Vendas
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Magnificent Fully Animated Congratulations Full-Screen Overlay */}
      <AnimatePresence>
        {showCongratsOverlay && (
          <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-xl z-[999999] flex items-center justify-center p-4 overflow-hidden select-none">
            
            {/* Custom Interactive Floating Confetti Particles Shower */}
            {Array.from({ length: 45 }).map((_, idx) => {
              const hue = (idx * 33) % 360;
              const delay = idx * 0.08;
              const duration = 4 + (idx % 3) * 1.5;
              const size = 10 + (idx % 4) * 5;
              const leftPos = (idx * 2.2) + "%";
              
              return (
                <motion.div
                  key={idx}
                  initial={{ y: "-10vh", opacity: 1, rotate: 0 }}
                  animate={{ 
                    y: "110vh", 
                    opacity: [1, 1, 1, 0],
                    rotate: [0, 180, 360, 720] 
                  }}
                  transition={{
                    duration: duration,
                    delay: delay,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                  className="absolute pointer-events-none rounded-full"
                  style={{
                    left: leftPos,
                    width: size,
                    height: size * (idx % 2 === 0 ? 0.4 : 1),
                    backgroundColor: `hsla(${hue}, 85%, 60%, 0.9)`,
                    boxShadow: `0 0 10px hsla(${hue}, 85%, 60%, 0.4)`,
                    borderRadius: idx % 3 === 0 ? '50%' : idx % 3 === 1 ? '0%' : '30% 70% 70% 30% / 30% 30% 70% 70%'
                  }}
                />
              );
            })}

            {/* Glowing background spotlights */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-r from-emerald-500/10 to-brand-cyan/10 blur-[130px] animate-pulse" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-yellow-400/5 blur-[90px] animate-pulse" />

            <motion.div
              initial={{ scale: 0.8, opacity: 0, rotateY: 90 }}
              animate={{ scale: 1, opacity: 1, rotateY: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 15 }}
              className="bg-slate-900/90 border-2 border-emerald-500/30 rounded-[40px] max-w-xl w-full p-10 space-y-8 text-center relative shadow-3xl shadow-emerald-500/10"
            >
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-yellow-400 via-emerald-400 to-brand-cyan" />

              {/* Grand Pulsing Winner Crown & Cup Trophy */}
              <div className="flex justify-center relative">
                <motion.div
                  animate={{ 
                    scale: [1, 1.1, 1],
                    rotate: [0, -5, 5, -5, 5, 0]
                  }}
                  transition={{ 
                    repeat: Infinity, 
                    duration: 2.5,
                    repeatType: "reverse"
                  }}
                  className="relative p-6 bg-gradient-to-br from-yellow-400/20 to-emerald-400/10 border border-yellow-400/35 rounded-full"
                >
                  <Trophy className="h-20 w-20 text-yellow-400 drop-shadow-[0_0_20px_rgba(234,179,8,0.6)]" />
                  <Sparkles className="h-8 w-8 text-white absolute top-2 right-2 animate-bounce" />
                </motion.div>
              </div>

              <div className="space-y-3">
                <span className="text-xs uppercase font-mono tracking-widest px-4 py-1.5 bg-yellow-400/10 text-yellow-400 rounded-full font-black border border-yellow-400/20 shadow-lg">
                  🏆 Conquista Incrível Desbloqueada 🏆
                </span>
                
                <h2 className="text-3xl font-black text-white tracking-tight uppercase leading-none pt-2">
                  Meta de Lucro Líquido Alcançada!
                </h2>
                
                <p className="text-slate-400 text-xs max-w-md mx-auto leading-relaxed">
                  Negócio próspero! Suas vendas atingiram o planejado e superaram as barreiras. O seu bolso agradece o lucro real conquistado! 🙌🚀
                </p>
              </div>

               {/* Sync-proof details box linking directly with liquid value */}
              {(() => {
                const congratsGoalValue = goalType === "daily" ? dailyMetaGoal : goalValue;
                const congratsAchievedValue = goalType === "daily" ? todayNetProfitLive : totalNetProfitLive;
                const congratsProgressPercent = congratsGoalValue > 0 ? Math.min(150, Math.round((congratsAchievedValue / congratsGoalValue) * 100)) : 100;

                return (
                  <div className="p-6 bg-slate-950 rounded-3xl border border-slate-850/80 space-y-4 font-mono">
                    <div className="grid grid-cols-2 gap-4 divide-x divide-slate-850 text-left">
                      <div className="pl-2">
                        <span className="text-[10px] text-slate-500 block uppercase font-mono tracking-widest">Alvo Escolhido</span>
                        <strong className="text-sm text-slate-350 block mt-1">R$ {congratsGoalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="pl-4">
                        <span className="text-[10px] text-emerald-450 block uppercase font-mono tracking-widest">Lucro Líquido Real</span>
                        <strong className="text-base text-emerald-400 block mt-1 font-black">
                          R$ {congratsAchievedValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </strong>
                      </div>
                    </div>

                    {/* Progress Visualizer Full bar container */}
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-[11px] font-bold text-slate-400">
                        <span>Performance de Lucro Líquido:</span>
                        <span className="text-emerald-400">{congratsProgressPercent}%</span>
                      </div>
                      <div className="h-4 w-full bg-slate-900 rounded-full p-0.5 border border-slate-800 overflow-hidden">
                        <motion.div 
                          initial={{ width: "0%" }}
                          animate={{ width: `${Math.min(100, congratsProgressPercent)}%` }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-yellow-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => {
                    playAlertSound("success");
                    setShowCongratsOverlay(false);
                    addToast("Excelente! Continue assim para bater marcas históricas de vendas! 📈🔥", "success");
                  }}
                  className="w-full bg-gradient-to-r from-emerald-500 to-brand-cyan hover:from-emerald-400 hover:to-brand-cyan text-slate-950 font-black text-sm uppercase py-4.5 px-6 rounded-2xl shadow-xl shadow-emerald-500/10 hover:shadow-emerald-500/25 transition-all text-center cursor-pointer active:scale-95"
                >
                  Sensacional! Continuar Vendendo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dynamic Gemini Logistics AI Assistant Modal */}
      <AnimatePresence>
        {showLogisticsAiModal && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[999990] flex items-center justify-center p-4 overflow-y-auto">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] rounded-full bg-brand-cyan/10 blur-[130px] pointer-events-none" />
            <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[350px] rounded-full bg-brand-magenta/5 blur-[125px] pointer-events-none" />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full p-6 space-y-6 relative shadow-2xl shadow-black/90 my-8 overflow-hidden"
            >
              {/* Top aesthetics header bar */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-cyan to-brand-magenta" />

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  playAlertSound("info");
                  setShowLogisticsAiModal(false);
                }}
                className="absolute right-4 top-4 text-slate-400 hover:text-white p-2.5 rounded-xl hover:bg-slate-800/80 transition-all cursor-pointer z-10"
                title="Fechar Auxiliar IA"
              >
                <X className="h-4.5 w-4.5" />
              </button>

              {/* Title Header block */}
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand-cyan/15 text-brand-cyan rounded-xl border border-brand-cyan/20 shrink-0">
                  <Package className="h-5 w-5 text-brand-cyan animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] uppercase tracking-widest bg-brand-cyan/10 text-brand-cyan font-bold px-2 py-0.5 rounded border border-brand-cyan/15">
                      Controle Diário
                    </span>
                    <span className="text-[9px] uppercase tracking-widest bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded border border-emerald-500/15 animate-pulse">
                      ENTREGAS AGENDADAS PARA HOJE!
                    </span>
                  </div>
                  <h3 className="text-base font-black text-slate-105 uppercase tracking-tight mt-1 leading-none">
                    Logística Diária de Entregas
                  </h3>
                </div>
              </div>

              {/* Main content layout (no sidebar) */}
              <div className="max-w-4xl mx-auto w-full space-y-6">
                
                {/* Performance stats bar */}
                <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-850 text-center font-mono animate-fade-in">
                  <div className="p-1">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-bold">Total Entregas</span>
                    <strong className="text-xl text-brand-cyan font-black block mt-1">{todaysDeliveries.length}</strong>
                  </div>
                  <div className="border-l border-slate-850 p-1">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-bold">A Receber Total</span>
                    <strong className="text-xl text-emerald-400 font-black block mt-1">
                      R$ {todaysDeliveries.reduce((sum, d) => sum + d.balanceDue, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>

                {/* Client card list or Celebration Screen */}
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1 customize-scrollbar text-left">
                  {todaysDeliveries.length > 0 ? (
                    <>
                      <div className="text-[10px] text-slate-500 mb-2 italic flex items-center gap-1 leading-none justify-start select-none">
                        <span className="text-brand-cyan select-none">💡</span>
                        <span>Use os botões de ação abaixo de cada cliente para reagendar a entrega ou registrar a baixa do saldo.</span>
                      </div>

                      {todaysDeliveries.map((sale) => (
                        <div 
                          key={sale.id}
                          className="p-5 bg-slate-950/50 rounded-xl border border-slate-850/70 hover:border-brand-cyan/45 hover:shadow-[0_0_15px_rgba(34,211,238,0.03)] transition-all flex flex-col justify-between gap-4 relative group text-left animate-fade-in"
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-sm text-white uppercase tracking-wide truncate group-hover:text-brand-cyan transition-colors">
                                  {sale.clientName.toUpperCase()}
                                </span>
                                {sale.useMotoboy && (
                                  <span className="text-[8px] font-mono uppercase bg-brand-cyan/15 text-brand-cyan px-1.5 py-0.5 rounded border border-brand-cyan/20 font-bold leading-none">
                                    Motoboy
                                  </span>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                {sale.balanceDue > 0 ? (
                                  <div className="space-y-0.5">
                                    <span className="text-[8px] font-mono text-slate-500 font-bold block uppercase tracking-wider">A Receber</span>
                                    <strong className="text-xs font-mono text-amber-400 font-black flex items-center gap-1">
                                      <Wallet className="h-3 w-3 text-amber-400/80" />
                                      R$ {sale.balanceDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                    </strong>
                                  </div>
                                ) : (
                                  <span className="inline-block text-[8px] font-mono uppercase bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/15 font-black leading-none">
                                    Totalmente Pago
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="text-xs text-slate-350 leading-relaxed font-semibold">
                              {sale.items?.map((it) => `${it.quantity}x ${it.description}`).join(", ") || "Sem itens informados"}
                            </div>

                            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap pt-1 text-[10px] text-slate-500 font-mono">
                              {sale.clientPhone && (
                                <div className="flex items-center gap-1 leading-none">
                                  <Phone className="h-3 w-3 shrink-0 text-brand-cyan" />
                                  <span>{sale.clientPhone}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1 leading-none">
                                <Calendar className="h-3.5 w-3.5 text-brand-magenta" />
                                <span>Data Limite: {sale.deliveryDate ? sale.deliveryDate.split("-").reverse().join("/") : "Sem data"}</span>
                              </div>
                            </div>

                            {sale.deliveryReason && (
                              <div className="text-[10px] text-amber-500 font-mono mt-2 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/15 w-fit leading-tight font-semibold">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                <span>Motivo: {sale.deliveryReason}</span>
                              </div>
                            )}
                          </div>

                          {/* Action Row */}
                          <div className="border-t border-slate-900/60 pt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReschedulingSale(sale);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border border-slate-800 hover:border-slate-700 cursor-pointer active:scale-95"
                            >
                              <Calendar className="h-3.5 w-3.5 text-brand-cyan" />
                              <span>Reagendar</span>
                            </button>

                            {sale.balanceDue > 0 ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLogisticsQuickBaja(sale);
                                }}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/25 transition-all cursor-pointer active:scale-95"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span>Dar Baixa e Entregar (Receber R$ {sale.balanceDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})</span>
                              </button>
                            ) : (
                              !sale.materialEntregue && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirmDeliveryOnly(sale);
                                  }}
                                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-brand-cyan to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-md shadow-cyan-500/10 hover:shadow-cyan-500/25 transition-all cursor-pointer active:scale-95"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  <span>Confirmar Entrega do Material</span>
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", duration: 0.6 }}
                      className="flex flex-col items-center justify-center text-center p-8 md:p-12 bg-gradient-to-br from-slate-900/60 to-slate-950 border border-emerald-500/30 rounded-3xl space-y-6 max-w-lg mx-auto shadow-2xl relative overflow-hidden my-4"
                    >
                      {/* Festive Floating Particles / Confetti effect */}
                      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
                        {Array.from({ length: 12 }).map((_, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ y: 220, x: Math.random() * 400 - 200, opacity: 1, scale: Math.random() * 0.6 + 0.6 }}
                            animate={{
                              y: -100,
                              x: Math.random() * 400 - 200,
                              opacity: [1, 1, 0],
                              rotate: [0, 360],
                            }}
                            transition={{
                              duration: 2.5 + Math.random() * 2,
                              repeat: Infinity,
                              delay: idx * 0.15,
                              ease: "easeOut",
                            }}
                            className="absolute text-brand-cyan text-sm"
                            style={{ bottom: "10px", left: "50%" }}
                          >
                            {["🎉", "✨", "🔥", "🏆", "📦", "👏", "👑", "🚀"][idx % 8]}
                          </motion.div>
                        ))}
                      </div>

                      {/* Big Trophy/Medal icon with pulsing and rotating glow */}
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
                        <motion.div
                          animate={{ 
                            scale: [1, 1.1, 1],
                            rotate: [0, 5, -5, 0]
                          }}
                          transition={{
                            duration: 3,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                          className="p-6 bg-gradient-to-br from-emerald-500/25 to-teal-500/10 border border-emerald-500/30 text-emerald-400 rounded-full relative z-10"
                        >
                          <Trophy className="h-14 w-14 drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]" />
                        </motion.div>
                      </div>

                      <div className="space-y-2 relative z-10">
                        <span className="text-[10px] uppercase font-mono tracking-widest px-3 py-1.5 bg-emerald-500/15 text-emerald-400 rounded-full font-black border border-emerald-500/25 block w-fit mx-auto">
                          🌟 TUDO ENTREGUE!
                        </span>
                        <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">
                          Parabéns! Você entregou tudo! 🚀
                        </h3>
                        <p className="text-slate-400 text-xs md:text-sm leading-relaxed max-w-sm mx-auto">
                          Todos os produtos agendados para hoje foram entregues e todos os saldos devedores foram baixados! Bom trabalho!
                        </p>
                      </div>

                      {/* Close button inside that also closes the modal */}
                      <button
                        type="button"
                        onClick={() => setShowLogisticsAiModal(false)}
                        className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/30 transition-all cursor-pointer relative z-10 active:scale-95"
                      >
                        Maravilha! Fechar Painel
                      </button>
                    </motion.div>
                  )}
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rescheduling Delivery Modal with Motive Option */}
      <AnimatePresence>
        {reschedulingSale && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[999999] flex items-center justify-center p-4 overflow-y-auto">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[300px] rounded-full bg-brand-cyan/10 blur-[120px] pointer-events-none" />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 relative shadow-2xl shadow-black/90 overflow-hidden text-left"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setReschedulingSale(null)}
                className="absolute right-4 top-4 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800/80 transition-all cursor-pointer z-10"
              >
                <X className="h-4.5 w-4.5" />
              </button>

              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand-cyan/15 text-brand-cyan rounded-xl border border-brand-cyan/25">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-widest bg-brand-cyan/10 text-brand-cyan font-bold px-2 py-0.5 rounded border border-brand-cyan/15">
                    Modificar Logística
                  </span>
                  <h3 className="text-base font-black text-white uppercase tracking-tight mt-1 leading-none">
                    Alterar Data e Motivo
                  </h3>
                </div>
              </div>

              {/* Client Info InfoBox */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-850/80 space-y-1 font-sans">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Cliente</div>
                <div className="text-sm font-extrabold text-white uppercase leading-none">{reschedulingSale.clientName}</div>
                <div className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                  {reschedulingSale.items?.map((it) => `${it.quantity}x ${it.description}`).join(", ") || "Sem itens"}
                </div>
              </div>

              {/* Form Controls */}
              <div className="space-y-4 font-sans">
                {/* Delivery Date */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-350 block">
                    Nova Data de Entrega
                  </label>
                  <input
                    type="date"
                    value={newDeliveryDate}
                    onChange={(e) => setNewDeliveryDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-805 rounded-xl py-2.5 px-3.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-cyan/60 transition-colors font-mono"
                  />
                </div>

                {/* Motive Reason */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-350 block">
                    Motivo do Reagendamento / Observação
                  </label>
                  <textarea
                    value={newDeliveryReason}
                    onChange={(e) => setNewDeliveryReason(e.target.value)}
                    placeholder="Ex: A pedido do cliente: prefere receber na parte da tarde."
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-805 rounded-xl py-2.5 px-3.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-cyan/60 transition-colors font-sans resize-none"
                  />

                  {/* Predefined badges helper */}
                  <div className="space-y-1 pt-1 text-left">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Sugestões de Motivos:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "A pedido do cliente",
                        "Atraso na confecção",
                        "Problemas logísticos / motoboy",
                        "Aguardando pagamento",
                        "Falta de matéria-prima"
                      ].map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => setNewDeliveryReason(sug)}
                          className="text-[9px] font-semibold text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-850 px-2.5 py-1 rounded-md border border-slate-805 transition-colors cursor-pointer"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReschedulingSale(null)}
                  className="w-1/2 py-2.5 px-4 bg-slate-950 hover:bg-slate-850 hover:text-white text-slate-400 text-xs uppercase font-black tracking-wider rounded-xl border border-slate-805 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReschedule}
                  className="w-1/2 py-2.5 px-4 bg-gradient-to-r from-brand-cyan to-teal-500 hover:from-brand-cyan hover:to-teal-400 text-slate-950 text-xs uppercase font-black tracking-wider rounded-xl shadow-lg shadow-brand-cyan/15 transition-all cursor-pointer hover:shadow-brand-cyan/25"
                >
                  Salvar Reagendamento
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating High-Importance Notification Container */}
      <AnimatePresence>
        {highPriorityNotification && (
          <motion.div
            initial={{ opacity: 0, y: -100, scale: 0.9, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: -40, scale: 0.9, x: "-50%" }}
            className="fixed top-6 left-1/2 z-[9999] w-full max-w-sm sm:max-w-md bg-slate-900/95 border-2 border-brand-cyan/80 shadow-2xl shadow-brand-cyan/20 rounded-2xl p-4 backdrop-blur-md text-left font-sans"
            style={{ position: "fixed", left: "50%" }}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 rounded-xl animate-pulse">
                <DollarSign className="h-6 w-6 text-emerald-400" />
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono tracking-widest text-brand-cyan font-black flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    NOTIFICAÇÃO ALTA IMPORTÂNCIA
                  </span>
                  <button 
                    onClick={() => setHighPriorityNotification(null)}
                    className="text-slate-500 hover:text-slate-350 p-1 cursor-pointer rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <h4 className="text-sm font-black text-white mt-1 uppercase tracking-wide">
                  {highPriorityNotification.title}
                </h4>
                <div className="mt-2 text-[11px] text-slate-300 bg-slate-950/80 border border-slate-850 rounded-xl p-3 space-y-1.5 font-sans leading-relaxed">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Cliente:</span>
                    <span className="font-extrabold text-slate-100 truncate max-w-[200px]">{highPriorityNotification.clientName.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-medium text-[11px]">Valor Total:</span>
                    <span className="font-mono font-black text-brand-cyan">
                      R$ {highPriorityNotification.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] pt-1.5 border-t border-slate-900 mt-1.5">
                    <span className="text-slate-500 font-medium">Forma de Pagamento:</span>
                    <span className="font-black uppercase text-brand-magenta py-0.5 px-2 bg-brand-magenta/15 rounded-md text-[9px] border border-brand-magenta/20">
                      {highPriorityNotification.paymentMethod}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification Container stack */}
      <div className="fixed bottom-6 right-6 z-[99999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none" style={{ position: "fixed", bottom: "24px", right: "24px" }}>
        <AnimatePresence>
          {toasts.map((toast) => {
            const getColorsAndIcons = () => {
              switch (toast.type) {
                case "goal":
                  return {
                    bg: "bg-emerald-950/95 border-emerald-500/55 shadow-emerald-950/30",
                    text: "text-slate-100",
                    boldText: "text-emerald-400",
                    accent: "border-emerald-500",
                    icon: <Trophy className="h-5 w-5 text-emerald-400 shrink-0" />
                  };
                case "reminder":
                  return {
                    bg: "bg-amber-950/95 border-amber-500/60 shadow-amber-950/40 ring-2 ring-amber-500/20",
                    text: "text-slate-100",
                    boldText: "text-amber-450",
                    accent: "border-amber-500",
                    icon: <Bell className="h-5 w-5 text-amber-400 shrink-0 animate-bounce" />
                  };
                case "success":
                  return {
                    bg: "bg-slate-900/95 border-brand-magenta/40 shadow-brand-magenta/10",
                    text: "text-slate-100",
                    boldText: "text-brand-magenta",
                    accent: "border-brand-magenta",
                    icon: <CheckCircle className="h-5 w-5 text-brand-magenta shrink-0" />
                  };
                case "warning":
                case "error":
                  return {
                    bg: "bg-red-950/95 border-red-500/40 shadow-red-950/30",
                    text: "text-slate-100",
                    boldText: "text-red-400",
                    accent: "border-red-500",
                    icon: <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                  };
                case "info":
                default:
                  return {
                    bg: "bg-slate-900/95 border-brand-cyan/40 shadow-slate-950/50",
                    text: "text-slate-100",
                    boldText: "text-brand-cyan",
                    accent: "border-brand-cyan",
                    icon: <Info className="h-5 w-5 text-brand-cyan shrink-0" />
                  };
              }
            };

            const styles = getColorsAndIcons();

            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 100, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
                className={`${styles.bg} border rounded-xl p-3.5 shadow-2xl backdrop-blur-md flex items-start gap-3 pointer-events-auto select-none`}
              >
                <div className="mt-0.5 shrink-0">
                  {styles.icon}
                </div>
                <div className="flex-grow min-w-0 font-sans pr-1">
                  <p className={`text-[11px] leading-relaxed font-semibold ${styles.text}`}>
                    {toast.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="text-slate-500 hover:text-slate-350 p-0.5 rounded cursor-pointer self-start shrink-0 hover:bg-slate-800/50 transition-all"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* 🔔 PERSISTENT RINGING REMINDERS OVERLAY (Sound alarm keeps looping until accepted) */}
      <AnimatePresence>
        {ringingReminders.length > 0 && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="relative w-full max-w-3xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border-4 border-brand-magenta rounded-3xl p-6 md:p-8 shadow-[0_0_60px_rgba(219,39,119,0.35)] font-sans overflow-hidden animate-pulse-slow"
            >
              {/* Animated decorative glow beams */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-brand-magenta via-rose-500 to-brand-magenta shadow-lg animate-pulse" />
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-brand-magenta/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
              <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-brand-cyan/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex flex-col items-center text-center space-y-5">
                {/* Urgent notification banner header */}
                <div className="w-full bg-red-950/40 border-2 border-red-500/30 text-red-400 py-3 px-4 rounded-2xl flex items-center gap-2.5 justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 animate-bounce" />
                  <span className="text-xs sm:text-sm font-black tracking-widest uppercase text-center font-mono">
                    ⚠️ ALERTA DE LEMBRETE IMPORTANTE ATIVO ⚠️
                  </span>
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 animate-bounce" />
                </div>

                {/* Megaphone/Alarm vibrating bell */}
                <div className="relative my-1">
                  <div className="absolute inset-0 bg-brand-magenta/40 rounded-full blur-2xl animate-ping" style={{ animationDuration: "1.5s" }} />
                  <div className="relative p-6 bg-brand-magenta/20 border-2 border-brand-magenta rounded-full text-brand-magenta flex items-center justify-center animate-bounce">
                    <Bell className="h-14 w-14 text-brand-magenta" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-150 to-rose-400 uppercase tracking-wider">
                    🔔 LEMBRETE ATIVO DO SISTEMA
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
                    Este lembrete exige sua atenção imediata. O alerta continuará na tela e o alarme sonoro continuará tocando até você confirmar cada item abaixo!
                  </p>
                </div>

                {/* Reminders List inside modal */}
                <div className="w-full max-h-[260px] overflow-y-auto space-y-3 bg-slate-950/90 p-4 rounded-2xl border-2 border-slate-900 custom-scrollbar text-left mt-2">
                  {ringingReminders.map((rem) => (
                    <div key={rem.id} className="p-4 bg-slate-900/90 border border-slate-800 hover:border-brand-magenta/45 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:bg-slate-900 shadow-md">
                      <div className="flex gap-3.5 items-center min-w-0">
                        <div className="p-2.5 bg-brand-magenta/15 border border-brand-magenta/30 rounded-lg text-brand-magenta shrink-0 animate-pulse">
                          <Clock className="w-5 h-5 text-brand-magenta" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-base sm:text-lg font-black text-white uppercase tracking-wide block leading-snug">
                            {rem.title}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 block mt-1">
                            {rem.isAllDay ? "🌅 Lembrete para o Dia Todo" : `⏰ Horário Agendado: ${rem.time}`}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAcceptRingingReminder(rem.id)}
                        className="w-full sm:w-auto px-4.5 py-2.5 text-xs font-black text-slate-950 bg-brand-cyan hover:bg-white rounded-xl cursor-pointer transition-all uppercase tracking-wider shadow-md hover:scale-[1.03] self-stretch sm:self-center"
                      >
                        Confirmar Lembrete
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full pt-2">
                  {ringingReminders.length > 1 && (
                    <button
                      type="button"
                      onClick={handleAcceptAllRingingReminders}
                      className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-2xl text-xs font-bold text-slate-300 transition-all cursor-pointer uppercase tracking-wider hover:text-white"
                    >
                      Confirmar Todos ({ringingReminders.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (ringingReminders.length === 1) {
                        handleAcceptRingingReminder(ringingReminders[0].id);
                      } else {
                        handleAcceptAllRingingReminders();
                      }
                    }}
                    className="flex-1 py-4 bg-gradient-to-r from-brand-magenta via-rose-500 to-pink-600 hover:from-brand-magenta hover:to-pink-500 text-white rounded-2xl text-xs font-extrabold uppercase tracking-widest shadow-lg shadow-brand-magenta/30 transition-all cursor-pointer hover:scale-[1.02]"
                  >
                    Entendido / Dispensar Tudo
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 🌅 NOTIFICAÇÃO AGRADÁVEL DE FECHAMENTO DE CAIXA / FIM DE EXPEDIENTE */}
      <AnimatePresence>
        {showAutoClosePrompt && (() => {
          const session = cashRegister?.currentSession || {
            id: "preview-sessao",
            status: "aberto" as const,
            dataAbertura: new Date().toISOString(),
            operador: currentUser?.name || "Operador Atual",
            valorAbertura: 100.00
          };
          const reminderMsg =
            company?.cashClosingReminderMessage ||
            "Excelente dia de trabalho! O horário de encerramento do expediente foi atingido. Deseja realizar o fechamento do caixa e salvar seus relatórios antes de fechar o programa?";
          const closingHour = company?.cashClosingReminderTime || company?.closingTime || "18:00";

          return (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
              <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 15 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative w-full max-w-md bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-amber-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-amber-950/20 overflow-hidden font-sans"
              >
                {/* Decorative glowing gradient top bar */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-rose-400 to-amber-500" />
                
                {/* Close 'X' in corner */}
                <button
                  type="button"
                  onClick={handleAutoCloseDismiss}
                  className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/40 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Fechar lembrete"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex flex-col items-center text-center space-y-4">
                  {/* Sunset / Sparkles Icon with soft pulsating ambient background */}
                  <div className="relative">
                    <div className="p-4 bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-rose-500/20 border border-amber-500/30 rounded-2xl text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
                      <Sunset className="h-9 w-9 text-amber-400" />
                    </div>
                    <div className="absolute -top-1 -right-1 p-1 bg-amber-400 text-slate-950 rounded-full shadow">
                      <Sparkles className="h-3 w-3" />
                    </div>
                  </div>

                  {/* Title & subtitle */}
                  <div className="space-y-1.5 px-2">
                    {/* Pulsing Alarm Active Banner */}
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs mb-2 animate-pulse shadow-sm">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-amber-400 animate-bounce" />
                        <span className="font-extrabold uppercase tracking-wide text-[11px]">
                          {closingAlarmMuted ? "Alarme Silenciado 🔇" : "Alarme Contínuo Tocando 🔔"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setClosingAlarmMuted(!closingAlarmMuted)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/30 hover:bg-amber-500/50 text-amber-200 text-[10px] font-bold uppercase transition-all cursor-pointer"
                        title={closingAlarmMuted ? "Reativar o som do alarme" : "Silenciar o toque contínuo"}
                      >
                        {closingAlarmMuted ? "Reativar Som" : "Silenciar"}
                      </button>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold uppercase tracking-wider mb-1">
                      <Clock className="h-3 w-3" />
                      Fim de Expediente • {closingHour}
                    </div>
                    <h3 className="text-base font-extrabold text-white tracking-tight">
                      Lembrete de Fechamento de Caixa
                    </h3>
                    <p className="text-xs text-amber-100/90 leading-relaxed italic bg-amber-950/20 p-3 rounded-xl border border-amber-500/15 text-left">
                      "{reminderMsg}"
                    </p>
                  </div>

                  {/* Summary Card of Current Register Session */}
                  <div className="w-full bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 text-left space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-slate-500" />
                        Operador Responsável
                      </span>
                      <strong className="text-slate-200 font-semibold">{session.operador || "Não Informado"}</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-400 border-t border-slate-850/60 pt-2">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5 text-slate-500" />
                        Fundo Inicial de Troco
                      </span>
                      <span className="text-emerald-400 font-mono font-bold">
                        R$ {Number(session.valorAbertura || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-snug">
                    💡 <strong className="text-slate-300">Dica:</strong> Fechar o caixa agora garante que os totais fiquem organizados e seguros antes de fechar o programa.
                  </p>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2 w-full pt-1">
                    <button
                      type="button"
                      onClick={handleOpenCashRegisterFromReminder}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 rounded-xl text-xs font-black transition-all cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-2 uppercase tracking-wide"
                    >
                      <Wallet className="h-4 w-4" />
                      Conferir e Fechar Caixa Agora 🔒
                    </button>

                    <button
                      type="button"
                      onClick={handleAutoCloseConfirm}
                      className="w-full py-2.5 bg-slate-800/80 hover:bg-slate-800 text-amber-300 rounded-xl text-xs font-bold transition-all cursor-pointer border border-amber-500/30 hover:border-amber-500/50 active:scale-[0.98] flex items-center justify-center gap-2"
                      title="Fechar automaticamente utilizando os totais calculados pelo sistema"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      Fechamento Rápido com Valores do Sistema
                    </button>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleAutoCloseSnooze}
                        className="py-2.5 px-3 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-xl text-[11px] font-semibold transition-all cursor-pointer border border-slate-800 active:scale-[0.98] flex items-center justify-center gap-1.5"
                      >
                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                        Lembrar em 15 min
                      </button>
                      <button
                        type="button"
                        onClick={handleAutoCloseDismiss}
                        className="py-2.5 px-3 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 rounded-xl text-[11px] font-semibold transition-all cursor-pointer border border-slate-800 active:scale-[0.98] flex items-center justify-center gap-1.5"
                      >
                        <Moon className="h-3.5 w-3.5 text-slate-500" />
                        Manter Aberto
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      <AdminUnlockModal
        isOpen={adminUnlockOpen}
        onClose={() => {
          setAdminUnlockOpen(false);
          setAdminUnlockSuccessCallback(null);
        }}
        onSuccess={handleAdminUnlockSuccess}
        currentUser={currentUser}
        message={adminUnlockMessage}
      />

      {/* Synchronized Cash Register Session Opener/Closer Dialog Modal */}
      <CashRegisterModal
        isOpen={showCashRegisterModal}
        onClose={() => setShowCashRegisterModal(false)}
        cashRegister={cashRegister}
        sales={sales}
        expenses={expenses}
        activeOperatorName={currentUser?.name || ""}
        onOpenRegister={handleOpenRegister}
        onCloseRegister={handleCloseRegister}
        currentUser={currentUser}
        adminUnlocked={adminUnlocked}
        isCashRegisterOpen={isRegisterOpenForToday}
        onRefreshRegister={() => {
          checkGlobalRegisterStatus();
        }}
      />

      {/* Weekday goal indicator checklist overview dashboard */}
      <WeeklyGoalModal
        isOpen={showWeeklyGoalModal}
        onClose={() => setShowWeeklyGoalModal(false)}
        sales={sales}
        expenses={expenses}
        dailyMetaGoal={dailyMetaGoal}
        customWeekdayGoals={customWeekdayGoals}
        setCustomWeekdayGoals={setCustomWeekdayGoals}
      />

      {/* Contagem regressiva discreta de período de teste */}
      <TrialCountdown currentUser={currentUser} />

      {/* Modal de boas-vindas para primeiro acesso */}
      <WelcomeModal currentUser={currentUser} />
    </div>
  );
}
