import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Building2, 
  ShoppingCart, 
  LogOut, 
  Clock, 
  Sparkles, 
  ShieldCheck, 
  UserCheck, 
  Wallet, 
  Package, 
  CheckCircle,
  Maximize,
  Minimize
} from "lucide-react";
import { CompanyProfile, User } from "../types";

interface StandbyScreenProps {
  companyProfile: CompanyProfile;
  currentUser: User | null;
  onStartNewSale: () => void;
  onLogout?: () => void;
  isCashRegisterOpen?: boolean;
  onOpenCashRegister?: () => void;
  pendingSalesCount?: number;
  todaysDeliveriesCount?: number;
}

export function StandbyScreen({
  companyProfile,
  currentUser,
  onStartNewSale,
  onLogout,
  isCashRegisterOpen = true,
  onOpenCashRegister,
  pendingSalesCount = 0,
  todaysDeliveriesCount = 0
}: StandbyScreenProps) {
  const [time, setTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
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

  // Keyboard shortcut listener: Enter or Space to start new sale
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onStartNewSale();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onStartNewSale]);

  const hours = time.toLocaleTimeString("pt-BR", { hour: "2-digit", hour12: false });
  const minutes = time.toLocaleTimeString("pt-BR", { minute: "2-digit" });
  const seconds = time.toLocaleTimeString("pt-BR", { second: "2-digit" });

  const formattedDate = time.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const companyName = companyProfile?.tradingName || "Sua Empresa";
  const logoUrl = companyProfile?.logo;

  return (
    <div className="relative h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-between font-sans overflow-hidden select-none">
      {/* Ambient neon background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-cyan/15 rounded-full blur-[130px] pointer-events-none animate-pulse duration-[4000ms]" />
      <div className="absolute bottom-1/4 left-1/4 w-[450px] h-[450px] bg-brand-magenta/15 rounded-full blur-[130px] pointer-events-none animate-pulse duration-[6000ms]" />

      {/* Subtle grid pattern background */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b20_1px,transparent_1px),linear-gradient(to_bottom,#1e293b20_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,#000_80%,transparent_100%)] pointer-events-none" 
      />

      {/* TOP HEADER STRIP */}
      <header className="relative z-10 w-full px-4 py-2.5 flex items-center justify-between border-b border-slate-900 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-brand-cyan shadow-inner">
            <Building2 className="h-4 w-4 text-brand-cyan" />
          </div>
          <div>
            <span className="text-xs font-black uppercase text-white tracking-wider block">
              {companyName}
            </span>
            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest block">
              Painel do Atendimento • Standby
            </span>
          </div>
        </div>

        {/* Operator Badge, Fullscreen & Logout */}
        <div className="flex items-center gap-2">
          {currentUser && (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-900 border border-slate-850 rounded-lg">
              <div className="p-1 bg-brand-cyan/15 rounded-md text-brand-cyan">
                <UserCheck className="h-3 w-3" />
              </div>
              <div className="text-left">
                <span className="text-[8px] text-slate-500 font-mono uppercase block font-bold">Atendente</span>
                <span className="text-[11px] font-black text-white uppercase tracking-tight block">
                  {currentUser.name || currentUser.username}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className={`p-2 rounded-lg transition-all cursor-pointer border shadow-sm ${
              isFullscreen
                ? "bg-brand-cyan/20 text-brand-cyan border-brand-cyan/40"
                : "bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-brand-cyan border-slate-800"
            }`}
            title={isFullscreen ? "Sair do Modo Tela Cheia (Esc)" : "Ativar Modo Tela Cheia (Full Screen)"}
          >
            {isFullscreen ? (
              <Minimize className="h-3.5 w-3.5" />
            ) : (
              <Maximize className="h-3.5 w-3.5" />
            )}
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="p-2 bg-slate-900 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-500/30 rounded-lg transition-all cursor-pointer"
              title="Sair da Conta"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* CENTER HERO AREA */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-2 text-center max-w-sm sm:max-w-md mx-auto my-auto space-y-3.5 animate-fade-in">
        
        {/* COMPACT NEON DIGITAL CLOCK */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: -10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative group w-full"
        >
          {/* Ambient Glow Box */}
          <div className="absolute -inset-1 bg-gradient-to-r from-brand-cyan via-emerald-400 to-brand-magenta rounded-2xl blur-md opacity-40 group-hover:opacity-70 transition duration-1000 animate-pulse" />
          
          <div className="relative bg-slate-950/90 border border-slate-800/90 rounded-2xl p-2.5 sm:p-3 backdrop-blur-xl shadow-lg flex flex-col items-center justify-center">
            
            {/* NEON TIME DIGITS */}
            <div className="flex items-center justify-center gap-1 sm:gap-2 font-mono font-black text-white select-none">
              {/* Hours */}
              <div className="relative bg-slate-900/90 border border-slate-800/90 rounded-lg px-2.5 py-1 shadow-inner">
                <span className="text-2xl sm:text-3xl text-cyan-300 drop-shadow-[0_0_12px_rgba(6,182,212,0.85)] tracking-tighter">
                  {hours}
                </span>
              </div>

              {/* Colon 1 */}
              <span className="text-xl sm:text-2xl text-brand-magenta animate-pulse drop-shadow-[0_0_10px_rgba(236,72,153,0.9)] pb-0.5">
                :
              </span>

              {/* Minutes */}
              <div className="relative bg-slate-900/90 border border-slate-800/90 rounded-lg px-2.5 py-1 shadow-inner">
                <span className="text-2xl sm:text-3xl text-cyan-300 drop-shadow-[0_0_12px_rgba(6,182,212,0.85)] tracking-tighter">
                  {minutes}
                </span>
              </div>

              {/* Colon 2 */}
              <span className="text-xl sm:text-2xl text-brand-magenta animate-pulse drop-shadow-[0_0_10px_rgba(236,72,153,0.9)] pb-0.5">
                :
              </span>

              {/* Seconds */}
              <div className="relative bg-slate-900/90 border border-slate-800/90 rounded-lg px-2 py-1 shadow-inner">
                <span className="text-xl sm:text-2xl text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.85)] tracking-tighter">
                  {seconds}
                </span>
              </div>
            </div>

            {/* NEON DATE BADGE */}
            <div className="mt-2 pt-1.5 border-t border-slate-800/80 w-full flex items-center justify-center gap-1.5">
              <Clock className="h-3 w-3 text-brand-cyan animate-pulse" />
              <span className="text-[11px] font-bold capitalize tracking-wider text-slate-300 font-sans">
                {formattedDate}
              </span>
            </div>
          </div>
        </motion.div>

        {/* COMPANY LOGO & TITLE CARD */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          className="relative group w-full"
        >
          <div className="relative bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center space-y-3 shadow-lg backdrop-blur-xl">
            {logoUrl ? (
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden bg-slate-950 p-2 border border-slate-800 shadow-inner flex items-center justify-center">
                <img
                  src={logoUrl}
                  alt={companyName}
                  className="w-full h-full object-contain filter drop-shadow-md"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800/80 flex flex-col items-center justify-center p-3 shadow-inner">
                <Building2 className="h-10 w-10 text-brand-cyan" />
              </div>
            )}

            {/* Company Title */}
            <div className="space-y-0.5 text-center">
              <h1 className="text-lg sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-300 uppercase tracking-tight font-sans">
                {companyName}
              </h1>
            </div>
          </div>
        </motion.div>

        {/* MAIN "INICIAR NOVA VENDA" BUTTON */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full space-y-2"
        >
          <button
            type="button"
            onClick={onStartNewSale}
            className="group relative w-full overflow-hidden rounded-xl p-[2px] focus:outline-none focus:ring-2 focus:ring-brand-cyan/50 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            {/* Animated Gradient Border Ring */}
            <span className="absolute inset-0 bg-gradient-to-r from-brand-cyan via-emerald-400 to-brand-magenta animate-spin duration-[3000ms] rounded-xl" />
            
            {/* Inner Button Content */}
            <div className="relative w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 py-3.5 px-5 rounded-[10px] flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/25 transition-all font-sans">
              <div className="p-2 bg-slate-950/20 rounded-lg text-slate-950 group-hover:scale-110 transition-transform">
                <ShoppingCart className="h-5 w-5 text-slate-950 font-black fill-slate-950/20" />
              </div>
              
              <div className="text-left">
                <span className="text-sm sm:text-base font-black uppercase tracking-wider block leading-none">
                  INICIAR NOVA VENDA
                </span>
                <span className="text-[10px] font-bold text-slate-950/80 tracking-wide uppercase block mt-0.5">
                  Clique aqui ou pressione ENTER
                </span>
              </div>

              <Sparkles className="h-4 w-4 text-slate-950/70 ml-auto animate-pulse" />
            </div>
          </button>

          <p className="text-[10px] text-slate-400 font-sans">
            Pressione <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[9px] text-white font-bold">ENTER</kbd> ou <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[9px] text-white font-bold">ESPAÇO</kbd>
          </p>
        </motion.div>

        {/* STATUS STRIP / QUICK STATS */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-3 gap-2 w-full pt-1"
        >
          {/* Caixa Status */}
          <div className="p-2 bg-slate-900/60 border border-slate-850/80 rounded-xl flex items-center gap-2 backdrop-blur-md">
            <div className={`p-1.5 rounded-lg border ${isCashRegisterOpen ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'}`}>
              <Wallet className="h-3.5 w-3.5" />
            </div>
            <div className="text-left min-w-0">
              <span className="text-[8px] font-mono text-slate-500 uppercase block font-bold leading-none">Caixa</span>
              <span className={`text-[10px] font-black uppercase tracking-tight block truncate mt-0.5 ${isCashRegisterOpen ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isCashRegisterOpen ? "Aberto" : "Fechado"}
              </span>
            </div>
          </div>

          {/* Pedidos Pendentes */}
          <div className="p-2 bg-slate-900/60 border border-slate-850/80 rounded-xl flex items-center gap-2 backdrop-blur-md">
            <div className="p-1.5 bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/30 rounded-lg">
              <Package className="h-3.5 w-3.5" />
            </div>
            <div className="text-left min-w-0">
              <span className="text-[8px] font-mono text-slate-500 uppercase block font-bold leading-none">Pendentes</span>
              <span className="text-[10px] font-black text-white uppercase tracking-tight block truncate mt-0.5">
                {pendingSalesCount}
              </span>
            </div>
          </div>

          {/* Entregas Hoje */}
          <div className="p-2 bg-slate-900/60 border border-slate-850/80 rounded-xl flex items-center gap-2 backdrop-blur-md">
            <div className="p-1.5 bg-brand-magenta/15 text-brand-magenta border border-brand-magenta/30 rounded-lg">
              <CheckCircle className="h-3.5 w-3.5" />
            </div>
            <div className="text-left min-w-0">
              <span className="text-[8px] font-mono text-slate-500 uppercase block font-bold leading-none">Entregas</span>
              <span className="text-[10px] font-black text-white uppercase tracking-tight block truncate mt-0.5">
                {todaysDeliveriesCount}
              </span>
            </div>
          </div>
        </motion.div>
      </main>

      {/* FOOTER BAR */}
      <footer className="relative z-10 w-full px-4 py-2 border-t border-slate-900 bg-slate-950/80 text-center text-[10px] text-slate-500 font-mono backdrop-blur-md flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>STANDBY ATIVO</span>
        </div>
        <div className="truncate">
          <span>{companyName}</span>
        </div>
      </footer>
    </div>
  );
}
