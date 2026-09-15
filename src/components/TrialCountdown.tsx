import React, { useMemo } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { User } from "../types";

interface TrialCountdownProps {
  currentUser?: User | null;
}

export const TrialCountdown: React.FC<TrialCountdownProps> = ({ currentUser }) => {
  const trialInfo = useMemo(() => {
    if (!currentUser || !currentUser.created_at) return null;

    // Se já estiver com assinatura ativa, não exibe o aviso
    const status = (currentUser.status_assinatura || (currentUser as any).status || "")
      .toString()
      .trim()
      .toLowerCase();
    if (status === "ativo" || status === "active") return null;

    // Não exibe para administradores do sistema master
    const isAdmin =
      currentUser.role === "admin" ||
      currentUser.role === "administrador" ||
      currentUser.is_admin === true ||
      currentUser.email === "sistemadevendaadm@gmail.com" ||
      currentUser.email === "vendas.impactodigital2@gmail.com";
    if (isAdmin) return null;

    try {
      const createdDate = new Date(currentUser.created_at);
      const now = new Date();
      // Diferença em milissegundos convertida para dias inteiros decorridos
      const diffMs = now.getTime() - createdDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const remainingDays = 7 - diffDays;

      // Regra 1: De 2 a 7 dias restantes -> texto verde discreto
      if (remainingDays >= 2 && remainingDays <= 7) {
        return {
          type: "normal" as const,
          days: remainingDays,
          message: `${remainingDays} dias restantes de teste`,
        };
      }

      // Regra 2: Exatamente 1 dia antes de expirar (6º dia completo) -> amarelo com mensagem de pagamento
      if (remainingDays === 1) {
        return {
          type: "warning" as const,
          days: 1,
          message: "Amanhã o programa expirará. Fazer o pagamento hoje ou amanhã.",
        };
      }

      return null;
    } catch {
      return null;
    }
  }, [currentUser]);

  if (!trialInfo) return null;

  return (
    <div
      id="trial-countdown-indicator"
      className="fixed bottom-3 right-3 z-50 pointer-events-auto select-none"
    >
      {trialInfo.type === "normal" ? (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-emerald-500/40 text-emerald-400 text-xs font-semibold shadow-lg backdrop-blur-sm transition-all">
          <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{trialInfo.message}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900/95 border border-amber-500/70 text-amber-300 text-xs font-bold shadow-xl backdrop-blur-md animate-pulse transition-all">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{trialInfo.message}</span>
        </div>
      )}
    </div>
  );
};
