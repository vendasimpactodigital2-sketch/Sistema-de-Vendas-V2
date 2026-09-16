import React from "react";
import { Lock, Wallet, ShieldAlert, Sparkles } from "lucide-react";
import { motion } from "motion/react";

interface ClosedRegisterGateProps {
  onOpenRegisterClick: () => void;
  operatorName?: string;
}

export function ClosedRegisterGate({ onOpenRegisterClick, operatorName }: ClosedRegisterGateProps) {
  return (
    <div className="w-full flex items-center justify-center min-h-[60vh] py-8 px-4 font-sans select-none animate-fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative max-w-lg w-full bg-slate-900/95 border border-red-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-red-950/40 backdrop-blur-xl flex flex-col items-center text-center space-y-6 overflow-hidden"
      >
        {/* Ambient background glows */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Central Pulsing Icon Badge */}
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping duration-1000" />
          <div className="relative p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-red-500/25 via-red-900/40 to-slate-950 border border-red-500/40 shadow-xl shadow-red-500/20 text-red-400">
            <Lock className="h-10 w-10 sm:h-12 sm:w-12 text-red-400" />
          </div>
        </div>

        {/* Title and Description */}
        <div className="space-y-2.5 max-w-md">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 text-[10px] sm:text-xs font-mono font-black uppercase tracking-wider">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>ACESSO RESTRITO • CAIXA FECHADO</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
            O Caixa do Dia Está Fechado
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Para garantir a segurança contábil e a conciliação financeira, todas as telas e operações do sistema permanecem <strong className="text-red-400">bloqueadas</strong> até a abertura do caixa.
          </p>
        </div>

        {/* Action Card Button */}
        <div className="w-full space-y-3 pt-2">
          <button
            type="button"
            onClick={onOpenRegisterClick}
            className="group relative w-full overflow-hidden rounded-2xl p-[2px] focus:outline-none focus:ring-2 focus:ring-emerald-400/50 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-500/20"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 rounded-2xl" />
            <div className="relative w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 py-3.5 px-6 rounded-[14px] flex items-center justify-center gap-3 transition-all font-black text-sm sm:text-base uppercase tracking-wider">
              <Wallet className="h-5 w-5 text-slate-950 fill-slate-950/20 group-hover:scale-110 transition-transform" />
              <span>ABRIR CAIXA AGORA</span>
              <Sparkles className="h-4 w-4 text-slate-950 ml-auto animate-pulse" />
            </div>
          </button>

          {operatorName && (
            <p className="text-[11px] text-slate-400 font-mono">
              Operador conectado: <strong className="text-slate-200">{operatorName}</strong>
            </p>
          )}
        </div>

        {/* Security Notice */}
        <div className="w-full pt-4 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-center gap-2 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Sincronização em tempo real ativa • Abertura compartilhada</span>
        </div>
      </motion.div>
    </div>
  );
}
