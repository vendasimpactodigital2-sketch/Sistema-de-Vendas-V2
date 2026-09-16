import { ClipboardList, LayoutDashboard, Building2, TrendingDown, LogOut, User as UserIcon, Cloud, CloudOff, Users, UserCheck, BarChart3, Boxes, Calculator, Clock, Calendar, Fingerprint, Package, Lock, Bell, Trash2, Check, X, Search, ShieldAlert, Trophy, Wallet, RefreshCw, Sun, Moon, Headphones, Coffee, Maximize, Minimize } from "lucide-react";
import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { User } from "../types";
import { isSupabaseConfigured, dbGetSupportFeedbacks } from "../supabase";
import { NexvoltLogo } from "./NexvoltLogo";
import { RemindersCalendarModal } from "./RemindersCalendarModal";
import { CalculatorModal } from "./CalculatorModal";

interface HeaderProps {
  activeTab: "sale" | "dashboard" | "company" | "gastos" | "usuarios" | "relatorios" | "produtos" | "gastosMeta" | "clientes" | "suporte" | "atendentes";
  setActiveTab: (tab: "sale" | "dashboard" | "company" | "gastos" | "usuarios" | "relatorios" | "produtos" | "gastosMeta" | "clientes" | "suporte" | "atendentes") => void;
  companyName: string;
  companyLogo?: string | null;
  currentUser?: User | null;
  onLogout?: () => void;
  dailyMetaGoal: number;
  todayNetProfitLive: number;
  hideMetaValues: boolean;
  todaysDeliveriesCount: number;
  todaysMaterialsCount: number;
  onDeliveriesClick: () => void;
  adminUnlocked?: boolean;
  onRequestAdminUnlock?: (callback: () => void, message?: string) => void;
  onLockAdmin?: () => void;
  onLocateClientClick?: () => void;
  pendingSalesCount?: number;
  onRetiradasClick?: () => void;
  onMetasSemanaClick?: () => void;
  isCashRegisterOpen?: boolean;
  onCashRegisterClick?: () => void;
  dbSyncing?: boolean;
  onOpenStandby?: () => void;
}

export function Header({ 
  activeTab, 
  setActiveTab, 
  companyName, 
  companyLogo,
  currentUser, 
  onLogout, 
  dailyMetaGoal, 
  todayNetProfitLive, 
  hideMetaValues,
  todaysDeliveriesCount,
  todaysMaterialsCount,
  onDeliveriesClick,
  adminUnlocked = false,
  onRequestAdminUnlock,
  onLockAdmin,
  onLocateClientClick,
  pendingSalesCount = 0,
  onRetiradasClick,
  onMetasSemanaClick,
  isCashRegisterOpen = false,
  onCashRegisterClick,
  dbSyncing = false,
  onOpenStandby
}: HeaderProps) {
  const isGeneralAdmin = currentUser?.email === "sistemadevendaadm@gmail.com" || currentUser?.email === "sistemavendaadm@gmail.com" || currentUser?.email === "vendas.impactodigital2@gmail.com";

  const [isFullscreen, setIsFullscreen] = React.useState(!!document.fullscreenElement);

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          console.error("Error attempting to exit fullscreen:", err);
        });
      }
    }
  };

  const [unansweredSupportCount, setUnansweredSupportCount] = React.useState(0);

  React.useEffect(() => {
    if (isGeneralAdmin) {
      const checkFeedbacks = async () => {
        try {
          const fbs = await dbGetSupportFeedbacks();
          const unanswered = fbs.filter(f => !f.resposta_admin);
          setUnansweredSupportCount(unanswered.length);
        } catch (err) {
          console.error("Error fetching admin support feedbacks:", err);
        }
      };

      checkFeedbacks();
      // Check every 30 seconds for real-time responsiveness
      const interval = setInterval(checkFeedbacks, 30000);
      return () => clearInterval(interval);
    }
  }, [isGeneralAdmin]);

  const [time, setTime] = React.useState(new Date());
  const [isCalculatorOpen, setIsCalculatorOpen] = React.useState(false);
  const [theme, setTheme] = React.useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("NUCLEO_THEME");
    return (saved === "light") ? "light" : "dark";
  });

  React.useEffect(() => {
    if (theme === "light") {
      document.body.classList.add("light");
      document.documentElement.classList.add("light");
    } else {
      document.body.classList.remove("light");
      document.documentElement.classList.remove("light");
    }
    localStorage.setItem("NUCLEO_THEME", theme);
  }, [theme]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const formattedDate = time.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });

  const targetMissingValue = Math.max(0, dailyMetaGoal - todayNetProfitLive);
  const progressPercent = dailyMetaGoal > 0 ? (todayNetProfitLive / dailyMetaGoal) * 100 : 0;
  const isGoalReached = dailyMetaGoal > 0 && todayNetProfitLive >= dailyMetaGoal;
  const isNearGoal = dailyMetaGoal > 0 && !isGoalReached && progressPercent >= 90;

  const isAttendant = currentUser && (
    currentUser.role === "atendente" ||
    currentUser.role === "seller" ||
    (currentUser.owner_id && currentUser.owner_id !== currentUser.id && currentUser.role !== "administrador" && !currentUser.is_admin)
  );

  // Reminders state & sync
  const WELCOME_REMINDER_TITLE = "Bem-vindo ao nosso sistema Nexvolt, o sistema que faz a diferença onde você tem o controle da sua empresa na palma da sua mão 🚀";

  const [reminders, setReminders] = React.useState<any[]>(() => {
    const saved = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
    if (!saved) {
      const todayStr = new Date().toISOString().split("T")[0];
      const defaultRem = [
        {
          id: "welcome-reminder",
          title: WELCOME_REMINDER_TITLE,
          type: "date",
          date: todayStr,
          time: "09:00",
          isAllDay: true,
          completed: false,
          notified: false
        }
      ];
      localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(defaultRem));
      return defaultRem;
    }
    try {
      const parsed = JSON.parse(saved);
      let changed = false;
      const updated = parsed.map((item: any) => {
        if (item.id === "welcome-reminder" || (item.title && item.title.includes("Boas-vindas à Gráfica"))) {
          changed = true;
          return { ...item, title: WELCOME_REMINDER_TITLE };
        }
        return item;
      });
      if (changed) {
        localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(updated));
      }
      return updated;
    } catch {
      return [];
    }
  });
  const [isPanelOpen, setIsPanelOpen] = React.useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);

  React.useEffect(() => {
    const syncReminders = () => {
      const saved = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          let changed = false;
          const updated = parsed.map((item: any) => {
            if (item.id === "welcome-reminder" || (item.title && item.title.includes("Boas-vindas à Gráfica"))) {
              changed = true;
              return { ...item, title: WELCOME_REMINDER_TITLE };
            }
            return item;
          });
          if (changed) {
            localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(updated));
          }
          setReminders(updated);
        } catch (e) {
          console.error("Error reading reminders in Header:", e);
        }
      } else {
        setReminders((prev) => prev.length === 0 ? prev : []);
      }
    };
    window.addEventListener("storage", syncReminders);
    const interval = setInterval(syncReminders, 1000);
    return () => {
      window.removeEventListener("storage", syncReminders);
      clearInterval(interval);
    };
  }, []);

  const pendingReminders = reminders.filter((r) => !r.completed);

  const handleToggleCompleted = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
    if (current) {
      try {
        const parsed = JSON.parse(current);
        const updated = parsed.map((r: any) => r.id === id ? { ...r, completed: !r.completed } : r);
        localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(updated));
        setReminders(updated);
        window.dispatchEvent(new Event("storage"));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleDeleteReminder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
    if (current) {
      try {
        const parsed = JSON.parse(current);
        const updated = parsed.filter((r: any) => r.id !== id);
        localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(updated));
        setReminders(updated);
        window.dispatchEvent(new Event("storage"));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const formatReminderSchedule = (rem: any) => {
    const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    if (rem.type === "date") {
      const dateParts = rem.date ? rem.date.split("-") : [];
      const formattedDateStr = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : rem.date || "";
      return rem.isAllDay ? `🌅 O Dia Todo • ${formattedDateStr}` : `⏰ ${rem.time} • ${formattedDateStr}`;
    } else {
      const dayName = rem.dayOfWeek !== undefined && rem.dayOfWeek >= 0 && rem.dayOfWeek <= 6 ? weekdays[rem.dayOfWeek] : "Semanal";
      return rem.isAllDay ? `🌅 O Dia Todo • Toda ${dayName}` : `⏰ ${rem.time} • Toda ${dayName}`;
    }
  };

  const handleTabClick = (
    tab: "sale" | "dashboard" | "company" | "gastos" | "usuarios" | "relatorios" | "produtos" | "gastosMeta" | "clientes" | "suporte" | "atendentes",
    message: string
  ) => {
    if (!isCashRegisterOpen) {
      if (onCashRegisterClick) {
        onCashRegisterClick();
      }
      return;
    }

    const isRestrictedTab = ["gastos", "gastosMeta", "produtos", "relatorios", "company", "usuarios", "clientes", "atendentes"].includes(tab);
    
    if (isAttendant && isRestrictedTab && !adminUnlocked) {
      if (onRequestAdminUnlock) {
        onRequestAdminUnlock(() => {
          setActiveTab(tab);
        }, message);
      }
    } else {
      setActiveTab(tab);
    }
  };

  return (
    <header className="border-b border-slate-800 bg-brand-dark-navy py-3 px-4 sm:px-6 sticky top-0 z-50 backdrop-blur-md bg-opacity-95 shadow-xl font-sans select-none">
      <div className="max-w-[1700px] 2xl:max-w-[1920px] mx-auto flex flex-col gap-3">
        
        {/* ROW 1: Branding Header */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-3 w-full">
          <div className="flex items-center gap-3 w-full justify-between md:justify-start">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-brand-magenta to-brand-cyan opacity-75 blur-sm animate-pulse"></div>
                <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 border border-slate-700/80 overflow-hidden shadow-md">
                  {companyLogo ? (
                    <img 
                      src={companyLogo} 
                      alt="Logo" 
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <NexvoltLogo iconSize={46} />
                  )}
                </div>
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white flex flex-wrap items-center gap-2 leading-none">
                  {(companyName || "SISTEMA DE VENDAS").toUpperCase()} <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-magenta/20 text-brand-magenta border border-brand-magenta/30 font-black">NÚCLEO</span>
                </h1>
                <p className="text-[11px] text-slate-400 mt-1">Emissão de Recibos, Controle de Gastos e Lucros</p>
              </div>
            </div>
          </div>
        </div>

        {/* Separator Line */}
        <div className="border-t border-slate-800/60 w-full my-0.5"></div>

        {/* ROW 2: Horizontal Menu Navigation Tabs & User Account Profile */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3 w-full">
          {/* Menu Navigation container */}
          <div className="flex flex-wrap bg-slate-900/60 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto gap-1">
            {onOpenStandby && (
              <button
                type="button"
                onClick={onOpenStandby}
                className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 hover:scale-[1.02] shadow-sm"
                title="Voltar para a Tela de Início / Standby"
              >
                <Coffee className="h-4 w-4 text-emerald-400 animate-pulse" />
                <span>Tela de Descanso</span>
              </button>
            )}

            <button
              onClick={() => handleTabClick("sale", "Acesso à Nova Venda liberado por padrão.")}
              className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                activeTab === "sale"
                  ? "bg-gradient-to-r from-brand-magenta to-brand-magenta/80 text-white shadow-lg shadow-brand-magenta/25"
                  : "text-slate-400 hover:text-slate-105 hover:bg-slate-800/40"
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              <span>Nova Venda</span>
            </button>

            {/* Employee Quick Access Buttons */}
            {isAttendant && !adminUnlocked && (
              <>
                <button
                  type="button"
                  onClick={() => handleTabClick("clientes", "Acesso a Clientes")}
                  className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "clientes"
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 border border-cyan-550/20"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/60 bg-slate-900/80 border border-slate-800"
                  }`}
                  title="Consultar clientes cadastrados e pedidos"
                >
                  <Users className="h-4 w-4 text-cyan-400" />
                  <span>Clientes</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabClick("gastos", "Acesso a Despesas")}
                  className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "gastos"
                      ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 border border-red-500/20"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/60 bg-slate-900/80 border border-slate-800"
                  }`}
                  title="Lançar compra de loja ou retirada/sangria do dinheiro do caixa"
                >
                  <TrendingDown className="h-4 w-4 text-red-400" />
                  <span>Lançar Despesa / Sangria</span>
                </button>

                {onCashRegisterClick && (
                  <button
                    type="button"
                    onClick={onCashRegisterClick}
                    className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/35 shadow-sm"
                    title="Abertura e Fechamento de Caixa do Turno"
                  >
                    <Wallet className="h-4 w-4 text-emerald-400" />
                    <span>{isCashRegisterOpen ? "Caixa (Fechar Turno)" : "Abrir Caixa"}</span>
                  </button>
                )}
              </>
            )}
            
            {(!isAttendant || adminUnlocked) && (
              <>
                <button
                  onClick={() => handleTabClick("dashboard", "Acesso ao Painel de Transações liberado por padrão.")}
                  className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "dashboard"
                      ? "bg-gradient-to-r from-brand-cyan to-brand-cyan/80 text-white shadow-lg shadow-brand-cyan/25"
                      : "text-slate-400 hover:text-slate-105 hover:bg-slate-800/40"
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Painel</span>
                </button>

                <button
                  onClick={() => handleTabClick("gastos", "Acesso à área de Despesas de Empresa exige autorização do Administrador.")}
                  className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "gastos"
                      ? "bg-gradient-to-r from-red-500 to-red-650 text-white shadow-lg shadow-red-500/25 border border-red-550/20"
                      : "text-slate-400 hover:text-slate-105 hover:bg-slate-800/40"
                  }`}
                >
                  <TrendingDown className="h-4 w-4" />
                  <span className="flex items-center gap-1">
                    Despesas {isAttendant && !adminUnlocked && <Lock className="h-2.5 w-2.5 text-red-400 shrink-0" />}
                  </span>
                </button>

                <button
                  onClick={() => handleTabClick("gastosMeta", "Acesso ao Planejamento de Metas de Gastos exige autorização do Administrador.")}
                  className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "gastosMeta"
                      ? "bg-gradient-to-r from-brand-magenta to-indigo-650 text-white shadow-lg shadow-brand-magenta/25 border border-brand-magenta/20"
                      : "text-slate-400 hover:text-slate-105 hover:bg-slate-800/40"
                  }`}
                >
                  <Calculator className="h-4 w-4 text-brand-cyan" />
                  <span className="flex items-center gap-1">
                    Gastos & Meta {isAttendant && !adminUnlocked && <Lock className="h-2.5 w-2.5 text-brand-magenta shrink-0 animate-pulse" />}
                  </span>
                </button>

                <button
                  onClick={() => handleTabClick("produtos", "Acesso ao controle de estoque de Produtos exige autorização do Administrador.")}
                  className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "produtos"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 border border-emerald-550/20"
                      : "text-slate-400 hover:text-slate-105 hover:bg-slate-800/40"
                  }`}
                >
                  <Boxes className="h-4 w-4 text-emerald-300" />
                  <span className="flex items-center gap-1">
                    Produtos {isAttendant && !adminUnlocked && <Lock className="h-2.5 w-2.5 text-emerald-450 shrink-0" />}
                  </span>
                </button>

                <button
                  onClick={() => handleTabClick("clientes", "Acesso ao Cadastro de Clientes exige autorização do Administrador.")}
                  className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "clientes"
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 border border-cyan-550/20"
                      : "text-slate-400 hover:text-slate-105 hover:bg-slate-800/40"
                  }`}
                >
                  <Users className="h-4 w-4 text-cyan-300" />
                  <span className="flex items-center gap-1">
                    Clientes {isAttendant && !adminUnlocked && <Lock className="h-2.5 w-2.5 text-cyan-455 shrink-0" />}
                  </span>
                </button>

                <button
                  onClick={() => handleTabClick("suporte", "Acesso ao Suporte Técnico.")}
                  className={`relative flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "suporte"
                      ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/25 border border-violet-550/20"
                      : "text-slate-400 hover:text-slate-105 hover:bg-slate-800/40"
                  }`}
                >
                  <Headphones className="h-4 w-4 text-violet-300" />
                  <span>Suporte</span>
                  {isGeneralAdmin && unansweredSupportCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[9px] font-black text-white animate-bounce shadow-md shadow-red-500/20">
                      {unansweredSupportCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleTabClick("relatorios", "Acesso aos Relatórios de Fechamento Financeiro exige autorização do Administrador.")}
                  className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "relatorios"
                      ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-550/25 border border-violet-550/20"
                      : "text-slate-400 hover:text-slate-105 hover:bg-slate-800/40"
                  }`}
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="flex items-center gap-1">
                    Relatórios {isAttendant && !adminUnlocked && <Lock className="h-2.5 w-2.5 text-violet-400 shrink-0" />}
                  </span>
                </button>

                <button
                  onClick={() => handleTabClick("company", "Acesso às Configurações da Empresa e Atendentes exige autorização do Administrador.")}
                  className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "company"
                      ? "bg-slate-800 text-white border border-slate-700 shadow-md"
                      : "text-slate-400 hover:text-slate-105 hover:bg-slate-800/40"
                  }`}
                >
                  <Building2 className="h-4 w-4 text-brand-magenta" />
                  <span className="flex items-center gap-1">
                    Empresa {isAttendant && !adminUnlocked && <Lock className="h-2.5 w-2.5 text-brand-magenta shrink-0" />}
                  </span>
                </button>

                <button
                  onClick={() => handleTabClick("atendentes", "Acesso ao painel e relatórios dos Atendentes exige autorização do Administrador.")}
                  className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "atendentes"
                      ? "bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-600 text-white shadow-lg shadow-cyan-600/30 border border-cyan-400/30"
                      : "text-slate-400 hover:text-slate-105 hover:bg-slate-800/40"
                  }`}
                >
                  <UserCheck className="h-4 w-4 text-cyan-400" />
                  <span className="flex items-center gap-1">
                    Atendentes {isAttendant && !adminUnlocked && <Lock className="h-2.5 w-2.5 text-cyan-400 shrink-0 font-bold" />}
                  </span>
                </button>

                <button
                  onClick={() => handleTabClick("usuarios", "Acesso ao controle de Usuários Administradores exige autorização do Administrador.")}
                  className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    activeTab === "usuarios"
                      ? "bg-gradient-to-r from-teal-500 to-teal-700 text-white shadow-lg shadow-teal-500/25 border border-teal-500/20"
                      : "text-slate-400 hover:text-slate-105 hover:bg-slate-800/40"
                  }`}
                >
                  <Users className="h-4 w-4 text-brand-cyan" />
                  <span className="flex items-center gap-1">
                    Usuários {isAttendant && !adminUnlocked && <Lock className="h-2.5 w-2.5 text-brand-cyan shrink-0 font-bold" />}
                  </span>
                </button>

                {isGeneralAdmin && (
  <button
    onClick={() => {
      window.history.pushState({}, "", "/admin/mensalistas");
    }}
    className="relative flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-violet-950/20 text-violet-300 border border-violet-850/40 hover:bg-violet-900/10 transition-all cursor-pointer whitespace-nowrap"
  >
    <Fingerprint className="h-4 w-4 text-violet-400" />
    <span>Mensalistas</span>
    {unansweredSupportCount > 0 && (
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[9px] font-black text-white animate-bounce shadow-md shadow-red-500/20">
        {unansweredSupportCount}
      </span>
    )}
  </button>
)}

              </>
            )}
          </div>

          {/* User Account Details */}
          {currentUser && (
            <div className="flex flex-wrap items-center bg-slate-950/45 p-1 px-2.5 rounded-xl border border-slate-850 gap-3 shrink-0 self-stretch lg:self-auto justify-between lg:justify-end">
              <div className="flex items-center gap-2">
                <div className="h-6.5 w-6.5 rounded bg-brand-cyan/10 border border-brand-cyan/25 flex items-center justify-center text-brand-cyan font-semibold">
                  <UserIcon className="h-3.5 w-3.5" />
                </div>
                <div className="text-left leading-none">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[10px] font-bold text-slate-200">{currentUser.name}</p>
                    {isAttendant ? (
                      <span className="inline-flex items-center px-1.5 py-0.25 rounded text-[7px] font-black font-sans uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                        👤 Atendente
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.25 rounded text-[7px] font-black font-sans uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        👑 Administrador
                      </span>
                    )}
                    {currentUser.status_assinatura !== "ativo" && (
                      <span className="inline-flex items-center px-1 py-0.25 rounded text-[7px] font-extrabold font-sans uppercase bg-amber-500/10 text-amber-500 border border-amber-500/25" title="Período de testes de 15 dias ativo">
                        Teste
                      </span>
                    )}
                  </div>
                  <p className="text-[8px] text-slate-500 font-mono mt-0.5">@{currentUser.username}</p>
                </div>
              </div>

              {/* Admin Unlock mode indicator */}
              {isAttendant && (
                <div>
                  {adminUnlocked ? (
                    <button
                      type="button"
                      onClick={onLockAdmin}
                      className="flex items-center gap-1 text-[8px] text-pink-400 bg-pink-950/45 border border-pink-900 px-2 py-0.5 rounded-full font-mono font-bold hover:bg-pink-900/40 cursor-pointer select-none"
                      title="Sessão autorizada por Administrador. Clique aqui para re-bloquear e voltar ao modo restrito."
                    >
                      <Fingerprint className="h-2 w-2 text-pink-450 animate-pulse" />
                      <span>🔑 ADMIN LIBERADO</span>
                    </button>
                  ) : (
                    <div 
                      className="flex items-center gap-1 text-[8px] text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full font-mono font-bold select-none cursor-help"
                      title="Sessão restrita. Atividades de administrador exigem liberação por senha."
                    >
                      <Lock className="h-2 w-2 text-slate-500" />
                      <span>ATENDENTE</span>
                    </div>
                  )}
                </div>
              )}

              {/* Supabase sync status indicator badge */}
              <div>
                {isSupabaseConfigured() ? (
                  <div 
                    className="flex items-center gap-1 text-[8px] text-emerald-400 bg-emerald-950/35 border border-emerald-900/40 px-2 py-0.5 rounded-full font-mono font-bold select-none cursor-help"
                    title="Conectado à nuvem Supabase em tempo real."
                  >
                    <Cloud className="h-2 w-2 text-emerald-400" />
                    <span>NUVEM</span>
                  </div>
                ) : (
                  <div 
                    className="flex items-center gap-1 text-[8px] text-slate-400 bg-slate-900/60 border border-slate-800 px-2 py-0.5 rounded-full font-mono font-bold select-none cursor-help"
                    title="Utilizando armazenamento local temporário. Configure chaves Supabase para ativar a nuvem."
                  >
                    <CloudOff className="h-2 w-2 text-slate-505" />
                    <span>OFFLINE</span>
                  </div>
                )}
              </div>
{isGeneralAdmin && (
  <button
    type="button"
    onClick={() => {
      window.history.pushState({}, "", "/admin/mensalistas");
    }}
    className="relative flex items-center gap-1.5 px-2.5 py-1 bg-violet-950/45 hover:bg-violet-900/40 text-[9px] font-bold text-violet-300 rounded-md border border-violet-800/35"
    title="Painel de Administração de Mensalistas"
  >
    <Fingerprint className="h-3 w-3 text-violet-400" />
    <span>Gerenciar Mensalistas</span>
    {unansweredSupportCount > 0 && (
      <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-black text-white animate-bounce shadow-md shadow-red-500/20" title={`${unansweredSupportCount} mensagens de suporte não respondidas`}>
        {unansweredSupportCount}
      </span>
    )}
  </button>
)}


              <button
                type="button"
                onClick={toggleFullscreen}
                className={`p-2 rounded-xl active:scale-95 transition-all cursor-pointer border shadow-sm ${
                  isFullscreen
                    ? "bg-brand-cyan/20 text-brand-cyan border-brand-cyan/40"
                    : "text-slate-400 hover:text-brand-cyan hover:bg-brand-cyan/10 border-transparent hover:border-brand-cyan/20"
                }`}
                title={isFullscreen ? "Sair do Modo Tela Cheia (Esc)" : "Ativar Modo Tela Cheia (Full Screen)"}
              >
                {isFullscreen ? (
                  <Minimize className="h-4.5 w-4.5" />
                ) : (
                  <Maximize className="h-4.5 w-4.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-2 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 active:scale-95 transition-all cursor-pointer border border-transparent hover:border-amber-500/20 shadow-sm"
                title={theme === "dark" ? "Alternar para Modo Claro" : "Alternar para Modo Escuro"}
              >
                {theme === "dark" ? (
                  <Sun className="h-4.5 w-4.5" />
                ) : (
                  <Moon className="h-4.5 w-4.5" />
                )}
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onLogout();
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all cursor-pointer border border-transparent hover:border-red-500/20 shadow-sm"
                  title="Sair da Conta"
                >
                  <LogOut className="h-4.5 w-4.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ROW 3: Real-time Telemetry Widgets (Clock, Reminders, Goals, Deliveries) aligned horizontally */}
        <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2 bg-slate-950/20 p-2 rounded-2xl border border-slate-850/45 w-full">
          {/* Digital Clock with Day and Month */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/60 rounded-xl border border-slate-900/40 text-slate-300 shadow-inner select-none font-medium h-9 shrink-0">
            <Clock className="h-3.5 w-3.5 text-brand-cyan animate-pulse shrink-0" />
            <span className="font-mono text-xs font-bold tracking-wider text-slate-100">{formattedTime}</span>
            <span className="text-slate-700 text-[10px]">|</span>
            <Calendar className="h-3.5 w-3.5 text-brand-magenta shrink-0" />
            <span className="text-[10px] font-bold text-slate-200 capitalize">
              {formattedDate}
            </span>
          </div>

          {/* Real-time "Meus Lembretes" Animated & Clickable Panel */}
          <div className="relative group shrink-0">
            <button
              type="button"
              onClick={() => setIsCalendarOpen(true)}
              className={`p-1.5 px-3 border rounded-xl flex items-center justify-between gap-3 text-left transition-all duration-300 hover:scale-[1.02] cursor-pointer select-none h-9 max-w-[280px] sm:max-w-[350px] ${
                isCalendarOpen
                  ? "border-brand-magenta/80 bg-slate-900/90 shadow-[0_0_15px_rgba(236,72,153,0.25)] text-slate-100"
                  : pendingReminders.length > 0
                    ? "border-brand-magenta/30 bg-brand-magenta/5 text-slate-200 hover:border-brand-magenta/60 shadow-[0_0_8px_rgba(236,72,153,0.1)]"
                    : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-705"
              }`}
              title="Clique para abrir o Calendário de Lembretes"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative flex items-center justify-center shrink-0">
                  {pendingReminders.length > 0 ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-brand-magenta opacity-60" />
                      <Bell className="h-4 w-4 text-brand-magenta animate-bounce shrink-0 relative z-10" />
                    </>
                  ) : (
                    <Bell className="h-4 w-4 text-slate-500 shrink-0" />
                  )}
                </div>
                <div className="flex flex-col min-w-0 leading-none">
                  <span className="text-[9px] uppercase tracking-wider text-slate-350 font-black flex items-center gap-1">
                    Meus Lembretes
                  </span>
                  <span className="text-[8.5px] text-brand-magenta font-bold mt-0.5 truncate max-w-[120px] sm:max-w-[180px]">
                    {pendingReminders.length === 0
                      ? "Nenhum ativo"
                      : pendingReminders[0].title
                    }
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                {pendingReminders.length > 0 && (
                  <span className="bg-brand-magenta/25 text-brand-magenta text-[8px] font-mono font-black px-1 rounded border border-brand-magenta/40 shrink-0">
                    {pendingReminders.length}
                  </span>
                )}
                <span className="text-slate-700 text-[10px] shrink-0">|</span>
                <span className="text-[10px] text-brand-magenta font-black group-hover:scale-105 transition-all text-xs uppercase tracking-wider shrink-0">
                  Agenda
                </span>
              </div>
            </button>

            {/* Hover Dropdown / Tooltip showing active reminder titles */}
            <div className="absolute right-0 top-full mt-2 w-80 bg-slate-950 border border-slate-800 rounded-2xl p-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none group-hover:pointer-events-auto font-sans">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                <span className="text-[10px] font-black uppercase text-brand-magenta tracking-widest">
                  🔔 Lembretes Agendados ({pendingReminders.length})
                </span>
                <span className="text-[8px] bg-brand-magenta/15 text-brand-magenta font-mono font-bold px-1.5 py-0.5 rounded border border-brand-magenta/20 uppercase">
                  Ativos
                </span>
              </div>
              
              {pendingReminders.length === 0 ? (
                <div className="text-center py-5 text-slate-500 text-[10.5px]">
                  Nenhum lembrete pendente para hoje ou datas futuras.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                  {pendingReminders.slice(0, 5).map((rem) => (
                    <div key={rem.id} className="p-2.5 rounded-xl bg-slate-900 border border-slate-850 hover:border-slate-800 transition-all space-y-1">
                      <p className="text-xs font-bold text-slate-200 break-words leading-tight">
                        {rem.title}
                      </p>
                      <div className="flex items-center gap-1.5 text-[8px] font-mono text-slate-450">
                        <span className="text-brand-magenta font-semibold">{formatReminderSchedule(rem)}</span>
                      </div>
                    </div>
                  ))}
                  {pendingReminders.length > 5 && (
                    <p className="text-[9px] text-center text-brand-magenta font-black uppercase pt-1 tracking-wider animate-pulse">
                      + {pendingReminders.length - 5} outros na agenda • Clique para ver todos
                    </p>
                  )}
                </div>
              )}
              
              <div className="mt-2.5 pt-2 border-t border-slate-850/60 text-center">
                <span className="text-[9px] text-slate-400 font-bold block">
                  💡 Clique no botão para abrir o calendário completo
                </span>
              </div>
            </div>

            <RemindersCalendarModal
              isOpen={isCalendarOpen}
              onClose={() => setIsCalendarOpen(false)}
            />
          </div>

          {/* Real-time "Falta para Meta" Square Card directly below the clock */}
          {(!isAttendant || adminUnlocked) && dailyMetaGoal > 0 && (
            <div className={`p-1.5 px-3 rounded-xl border flex flex-col justify-center text-center select-none duration-300 transition-all shrink-0 h-9 ${
              isGoalReached
                ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-400"
                : isNearGoal
                  ? "border-sky-500/30 bg-sky-950/20 text-sky-450 shadow-[0_0_12px_rgba(14,165,233,0.15)]"
                  : "border-amber-500/20 bg-amber-950/10 text-amber-500"
            }`}>
              <div className="flex items-center justify-between gap-3 text-left leading-none">
                <div className="flex items-center gap-1">
                  <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                    {!isGoalReached && !isNearGoal && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
                    )}
                    {isNearGoal && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-80" />
                    )}
                    {isGoalReached && (
                      <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-35" />
                    )}
                    <Fingerprint className={`h-3 w-3 shrink-0 ${
                      isGoalReached 
                        ? "text-emerald-400" 
                        : isNearGoal 
                          ? "text-sky-450 animate-pulse scale-105" 
                          : "text-amber-500 animate-pulse"
                    }`} />
                  </span>
                  
                  <span className="text-[9px] uppercase tracking-wider text-slate-450 font-bold">
                    {isGoalReached 
                      ? "Passou da Meta!" 
                      : isNearGoal 
                        ? "Falta pouco!" 
                        : "Falta Meta"}
                  </span>
                </div>
                <span className={`text-[8px] font-mono font-bold px-1 py-0.2 rounded shrink-0 ${
                  isGoalReached 
                    ? "bg-emerald-500/15 text-emerald-400" 
                    : isNearGoal 
                      ? "bg-sky-500/15 text-sky-450" 
                      : "bg-amber-500/15 text-amber-500"
                }`}>
                  {Math.round(progressPercent)}%
                </span>
              </div>
              
              <div className="mt-0.5 text-left font-mono font-bold text-slate-100 flex items-center justify-between gap-4 leading-none">
                {hideMetaValues ? (
                  <span className="text-slate-500 tracking-widest text-[9px]">R$ ••••••</span>
                ) : (
                  <span className={`text-[11px] font-black tracking-tight shrink-0 ${isGoalReached ? "text-emerald-400" : isNearGoal ? "text-sky-355 font-black" : "text-amber-405 font-bold"}`}>
                    {isGoalReached ? (
                      `+ R$ ${(todayNetProfitLive - dailyMetaGoal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    ) : (
                      `R$ ${targetMissingValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    )}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Real-time "Materiais para entregar hoje" clickable */}
          {onDeliveriesClick && (
            <button
              type="button"
              onClick={() => {
                if (!isCashRegisterOpen) {
                  onCashRegisterClick?.();
                  return;
                }
                onDeliveriesClick();
              }}
              className={`p-1.5 px-3 border rounded-xl flex items-center justify-between gap-2.5 text-left transition-all duration-200 hover:scale-[1.02] cursor-pointer shrink-0 h-9 ${
                todaysDeliveriesCount > 0
                  ? "bg-brand-cyan/15 hover:bg-brand-cyan/25 border-brand-cyan/50 text-brand-cyan shadow-[0_0_12px_rgba(34,211,238,0.15)] animate-pulse hover:animate-none"
                  : "bg-slate-900/50 hover:bg-slate-900/90 border-slate-800 text-slate-400"
              }`}
              title="Clique para ver os clientes e materiais com entrega agendada para hoje"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Package className={`h-3.5 w-3.5 shrink-0 ${todaysDeliveriesCount > 0 ? "text-brand-cyan" : "text-slate-400"}`} />
                <div className="flex flex-col min-w-0 leading-none">
                  <span className="text-[9px] uppercase tracking-wider text-slate-200 font-black">
                    Materiais de Hoje
                  </span>
                  <span className={`text-[8px] font-bold mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis ${todaysDeliveriesCount > 0 ? "text-brand-cyan font-black" : "text-slate-400"}`}>
                    {todaysDeliveriesCount > 0 
                      ? `${todaysDeliveriesCount} para entregar` 
                      : "Tudo entregue hoje"}
                  </span>
                </div>
              </div>
            </button>
          )}

          {/* RELOCATED ACTIONS ON HEADER ROW */}
          
          {/* 1. Localizar Cliente Button */}
          {onLocateClientClick && (
            <button
              type="button"
              onClick={() => {
                if (!isCashRegisterOpen) {
                  onCashRegisterClick?.();
                  return;
                }
                onLocateClientClick();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 active:scale-95 transition-all duration-200 cursor-pointer shadow-md border border-cyan-400/20 shrink-0 h-9"
              title="Buscar Cliente & Histórico de Pedidos"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span>Buscar Cliente & Pedidos</span>
            </button>
          )}

          {/* 2. Retiradas Button */}
          {pendingSalesCount > 0 && onRetiradasClick && (
            <button
              type="button"
              onClick={() => {
                if (!isCashRegisterOpen) {
                  onCashRegisterClick?.();
                  return;
                }
                onRetiradasClick();
              }}
              className="px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/15 rounded-xl border border-yellow-500/20 flex items-center gap-1.5 text-yellow-500 transition-all cursor-pointer text-xs font-bold shrink-0 animate-pulse hover:animate-none h-9"
              title="Vendas com retirada pendente ou saldo a receber"
            >
              <ShieldAlert className="h-4 w-4 text-yellow-500 shrink-0" />
              <span>Retiradas:</span>
              <span className="text-white font-mono font-black shrink-0 bg-yellow-550/20 px-1 rounded">
                {pendingSalesCount}
              </span>
            </button>
          )}

          {/* 3. Metas da Semana Button */}
          {(!isAttendant || adminUnlocked) && onMetasSemanaClick && (
            <button
              type="button"
              onClick={() => {
                if (!isCashRegisterOpen) {
                  onCashRegisterClick?.();
                  return;
                }
                onMetasSemanaClick();
              }}
              className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/15 rounded-xl border border-emerald-500/20 flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer text-xs font-bold shrink-0 h-9"
              title="Ver Metas da Semana"
            >
              <Trophy className="h-4 w-4 text-emerald-400 animate-pulse shrink-0" />
              <span>Metas da Semana</span>
            </button>
          )}

          {/* 4. Caixa Aberto / Abrir Caixa Button */}
          {onCashRegisterClick && (
            <button
              type="button"
              onClick={onCashRegisterClick}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer text-xs font-bold shrink-0 h-9 ${
                isCashRegisterOpen
                  ? "bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 hover:bg-red-500/15 border-red-500/20 text-red-400 animate-pulse"
              }`}
              title="Controle de abertura/fechamento de Caixa diário"
            >
              <Wallet className="h-4 w-4 shrink-0" />
              <span>{isCashRegisterOpen ? "Caixa Aberto" : "Abrir Caixa"}</span>
            </button>
          )}

          {/* 5. NEW: Calculadora Button */}
          <button
            type="button"
            onClick={() => setIsCalculatorOpen(true)}
            className="px-3 py-1.5 bg-slate-900/50 hover:bg-slate-900/90 border border-brand-cyan/25 hover:border-brand-cyan/60 rounded-xl flex items-center justify-center gap-1.5 text-brand-cyan hover:text-brand-cyan-light transition-all cursor-pointer text-xs font-bold shrink-0 h-9"
            title="Abrir Calculadora Rápida"
          >
            <Calculator className="h-4 w-4 text-brand-cyan shrink-0" />
            <span>Calculadora</span>
          </button>
        </div>

        {/* Modal Declarations */}
        <CalculatorModal
          isOpen={isCalculatorOpen}
          onClose={() => setIsCalculatorOpen(false)}
        />
      </div>
    </header>
  );
}
