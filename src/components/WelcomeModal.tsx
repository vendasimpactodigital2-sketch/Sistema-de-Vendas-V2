import React, { useState, useEffect } from "react";
import {
  Sparkles,
  ShoppingCart,
  FileText,
  CreditCard,
  Target,
  TrendingUp,
  Users,
  Printer,
  Package,
  Store,
  UserCheck,
  Building2,
  Wallet,
  CheckCircle2,
  Monitor,
  Smartphone,
  ShieldCheck,
  ArrowRight,
  Clock,
  Zap,
  Globe
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { User } from "../types";
import { getSupabase, isSupabaseConfigured } from "../supabase";

interface WelcomeModalProps {
  currentUser?: User | null;
  isOpen?: boolean;
  onClose?: () => void;
}

interface FeatureItem {
  icon: React.ElementType;
  title: string;
  description: string;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  currentUser,
  isOpen: controlledIsOpen,
  onClose
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Determina usuário ativo (prop ou localStorage)
  const activeUser = currentUser || (() => {
    try {
      const saved = localStorage.getItem("NUCLEO_CURRENT_USER");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })();

  // 1. Ativação: Verifica no Supabase se 'primeiro_acesso' é true na tabela 'assinaturas'
  useEffect(() => {
    if (controlledIsOpen !== undefined) {
      setInternalIsOpen(controlledIsOpen);
      return;
    }

    if (!activeUser?.id || !isSupabaseConfigured()) return;

    let isMounted = true;

    const checkPrimeiroAcesso = async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) return;

        const userId = activeUser.id;

        const { data, error } = await supabase
          .from("assinaturas")
          .select("id, user_id, primeiro_acesso")
          .or(`user_id.eq.${userId},id.eq.${userId}`)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.warn("[WelcomeModal] Consulta a 'assinaturas':", error.message);
          return;
        }

        if (isMounted && data && data.primeiro_acesso === true) {
          setInternalIsOpen(true);
        }
      } catch (err) {
        console.error("[WelcomeModal] Erro ao verificar primeiro_acesso:", err);
      }
    };

    checkPrimeiroAcesso();

    return () => {
      isMounted = false;
    };
  }, [activeUser?.id, controlledIsOpen]);

  // Ao clicar em "Começar Minha Experiência", atualiza primeiro_acesso para false no Supabase
  const handleStartExperience = async () => {
    setIsUpdating(true);
    try {
      const supabase = getSupabase();
      if (supabase && activeUser?.id) {
        const userId = activeUser.id;

        // Atualiza na tabela 'assinaturas'
        const { error } = await supabase
          .from("assinaturas")
          .update({
            primeiro_acesso: false,
            updated_at: new Date().toISOString()
          })
          .or(`user_id.eq.${userId},id.eq.${userId}`);

        if (error) {
          // Tentativa direta pelo user_id
          await supabase
            .from("assinaturas")
            .update({ primeiro_acesso: false })
            .eq("user_id", userId);
        }
      }
    } catch (err) {
      console.error("[WelcomeModal] Erro ao atualizar primeiro_acesso para false:", err);
    } finally {
      setIsUpdating(false);
      setInternalIsOpen(false);
      if (onClose) onClose();
    }
  };

  const isVisible = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const features: FeatureItem[] = [
    {
      icon: ShoppingCart,
      title: "Vendas",
      description: "Lançamento ágil de pedidos, formas de pagamento, parcelamento e comissões."
    },
    {
      icon: FileText,
      title: "Orçamentos",
      description: "Criação de orçamentos completos com conversão para venda em 1 clique."
    },
    {
      icon: CreditCard,
      title: "Controle de Contas a Pagar",
      description: "Gestão inteligente de despesas fixas, variáveis e vencimentos da empresa."
    },
    {
      icon: Target,
      title: "Meta Diária",
      description: "Acompanhamento visual de metas de faturamento e lucratividade em tempo real."
    },
    {
      icon: TrendingUp,
      title: "Relatório de Entrada / Saída / Lucro",
      description: "DRE prático e fluxo financeiro detalhado com margens líquidas calculadas."
    },
    {
      icon: Users,
      title: "Relatório de Funcionário",
      description: "Métricas individuais de produção, vendas fechadas e comissões do time."
    },
    {
      icon: Printer,
      title: "Impressão em PDF",
      description: "Recibos térmicos (80mm/58mm), pedidos A4 e orçamentos em alta qualidade."
    },
    {
      icon: Package,
      title: "Controle de Estoque",
      description: "Gestão de produtos e matéria-prima com avisos de estoque mínimo."
    },
    {
      icon: Store,
      title: "Venda Balcão",
      description: "Frente de caixa ultra rápida para atendimento presencial e troco dinâmico."
    },
    {
      icon: UserCheck,
      title: "Cadastro de Funcionários",
      description: "Controle de colaboradores com permissões segmentadas por função."
    },
    {
      icon: Building2,
      title: "Cadastro da Empresa",
      description: "Identidade visual personalizada, dados cadastrais e logotipo nos documentos."
    },
    {
      icon: Wallet,
      title: "Abertura e Fechamento de Caixa",
      description: "Gestão completa de turno, suprimentos, sangrias e conferência detalhada."
    }
  ];

  return (
    <AnimatePresence>
      {isVisible && (
        <div
          id="welcome-modal-overlay"
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto"
        >
          <motion.div
            id="welcome-modal-content"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 shadow-2xl overflow-hidden text-slate-100"
          >
            {/* Barra superior decorativa */}
            <div className="h-1.5 w-full bg-gradient-to-r from-brand-cyan via-brand-magenta to-amber-400" />

            {/* Cabeçalho */}
            <div className="px-6 pt-6 pb-4 sm:px-8 sm:pt-8 border-b border-slate-800/80 bg-slate-900/50">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-brand-magenta/15 text-brand-magenta border border-brand-magenta/30">
                  <Sparkles className="w-3.5 h-3.5" />
                  Boas-vindas ao Sistema
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Clock className="w-3.5 h-3.5" />
                  7 Dias Grátis
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Tudo o que sua gráfica precisa em um só lugar
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-400 leading-relaxed max-w-2xl">
                Seu sistema completo de gestão operacional e financeira está pronto para impulsionar suas vendas e organizar sua empresa.
              </p>
            </div>

            {/* Corpo rolável com recursos */}
            <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6 space-y-6 custom-scrollbar">
              {/* Grid dos 12 recursos */}
              <div>
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Recursos Profissionais Inclusos
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                  {features.map((feature, idx) => {
                    const Icon = feature.icon;
                    return (
                      <div
                        key={idx}
                        className="p-3 sm:p-3.5 rounded-xl bg-slate-950/50 hover:bg-slate-800/40 border border-slate-800/70 hover:border-slate-700 transition-all flex items-start gap-3 group"
                      >
                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-750 text-brand-cyan group-hover:text-brand-magenta group-hover:border-brand-magenta/40 transition-all shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-200 tracking-tight group-hover:text-white transition-colors">
                            {feature.title}
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Informações da Assinatura e Compatibilidade */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Card de Trial e Preço */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 border border-brand-cyan/20 flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-brand-cyan">
                      Período de Testes & Assinatura
                    </h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Aproveite <strong className="text-emerald-400 font-semibold">7 dias de teste gratuito</strong> sem compromisso para conhecer todas as ferramentas. Após o período, continue utilizando por apenas <strong className="text-white font-semibold">R$ 26,99 / mês</strong>.
                    </p>
                  </div>
                </div>

                {/* Card de Multiplataforma via Nuvem */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 border border-amber-500/20 flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      100% em Nuvem & Multiplataforma
                    </h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Acesse diretamente pelo navegador via internet no <strong className="text-white font-semibold">Windows</strong>, <strong className="text-white font-semibold">Android</strong> e <strong className="text-white font-semibold">iOS</strong>, em qualquer computador, tablet ou celular.
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Monitor className="w-3 h-3 text-slate-400" /> Windows
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Smartphone className="w-3 h-3 text-slate-400" /> Android
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Smartphone className="w-3 h-3 text-slate-400" /> iOS
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Rodapé com Ação Principal */}
            <div className="px-6 py-4 sm:px-8 sm:py-5 border-t border-slate-800/80 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Sem taxa de instalação. Suporte e atualizações inclusas.</span>
              </div>

              <button
                id="btn-welcome-start-experience"
                type="button"
                onClick={handleStartExperience}
                disabled={isUpdating}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-brand-cyan to-brand-magenta hover:opacity-90 active:scale-[0.98] text-white text-sm font-black uppercase tracking-wider shadow-lg shadow-brand-cyan/15 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Iniciando...</span>
                  </>
                ) : (
                  <>
                    <span>Começar Minha Experiência</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
