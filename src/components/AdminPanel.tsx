import React, { useState, useEffect, useMemo } from "react";
import { 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  Trash2, 
  RefreshCw, 
  Clock, 
  Search, 
  Infinity as InfinityIcon, 
  Sparkles, 
  UserX, 
  UserCheck, 
  Calendar,
  AlertCircle,
  Headphones,
  MessageSquare,
  Settings,
  Plus,
  Send,
  Lock,
  Unlock,
  Users,
  Check,
  Play,
  Volume2
} from "lucide-react";
import { 
  getSupabase, 
  dbGetSupportConfig, 
  dbSaveSupportConfig, 
  dbGetSupportFeedbacks, 
  dbSubmitAdminResponse 
} from "../supabase";
import { SupportConfig, SupportFeedback } from "../types";

export interface ProfileRecord {
  id: string;
  email?: string;
  name?: string;
  nome?: string;
  username?: string;
  status?: string;
  status_sistema?: string;
  status_assinatura?: string;
  plano?: string;
  plan?: string;
  trial_end?: string;
  data_expiracao?: string;
  created_at?: string;
  role?: string;
  cargo?: string;
  [key: string]: any;
}

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<"usuarios" | "suporte_mensagens" | "suporte_config">("usuarios");
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked">("all");
  const [planFilter, setPlanFilter] = useState<"all" | "trial" | "lifetime">("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Support states
  const [supportFeedbacks, setSupportFeedbacks] = useState<SupportFeedback[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState<"unanswered" | "all">("unanswered");
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<Record<string, boolean>>({});

  // Support Config
  const [supportConfig, setSupportConfig] = useState<SupportConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchProfiles = async () => {
    setLoading(true);
    setError(null);
    const client = getSupabase();
    if (!client) {
      setError("Cliente Supabase não está configurado.");
      setLoading(false);
      return;
    }

    try {
      // 1. Tabela users (fonte autoritativa de status e autenticação)
      const { data: usersData, error: usersErr } = await client
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      // 2. Tabela profiles (fonte complementar)
      const { data: profilesData } = await client
        .from("profiles")
        .select("*");

      const map = new Map<string, ProfileRecord>();

      if (profilesData && Array.isArray(profilesData)) {
        profilesData.forEach((p: any) => {
          if (p.id) map.set(p.id, p);
        });
      }

      if (usersData && Array.isArray(usersData)) {
        usersData.forEach((u: any) => {
          const existing = map.get(u.id);
          const isMaster = (u.email || existing?.email || "").toString().toLowerCase().trim() === "vendas.impactodigital2@gmail.com";
          const rawStatus = (u.status || existing?.status || "ativo").toString().trim();
          const rawStatusSistema = (u.status_sistema || u.status || existing?.status_sistema || existing?.status || "ativo").toString().trim();
          const rawStatusAssinatura = (u.status_assinatura || u.status || existing?.status_assinatura || existing?.status || "ativo").toString().trim();

          map.set(u.id, {
            ...existing,
            ...u,
            id: u.id,
            email: u.email || existing?.email || "",
            name: u.name || u.nome || existing?.name || existing?.nome || "",
            username: u.username || existing?.username || "",
            status: isMaster ? "ativo" : rawStatus,
            status_sistema: isMaster ? "ativo" : rawStatusSistema,
            status_assinatura: isMaster ? "ativo" : rawStatusAssinatura,
            plano: isMaster ? "lifetime" : (u.plano || u.plan || existing?.plano || existing?.plan || "trial"),
            plan: isMaster ? "lifetime" : (u.plano || u.plan || existing?.plano || existing?.plan || "trial"),
            trial_end: u.trial_end || u.data_expiracao || existing?.trial_end || existing?.data_expiracao || null,
            data_expiracao: u.data_expiracao || u.trial_end || existing?.data_expiracao || existing?.trial_end || null,
            role: isMaster ? "master" : (u.role || existing?.role || "user")
          });
        });
      }

      const combined = Array.from(map.values());
      if (combined.length > 0) {
        setProfiles(combined);
      } else if (usersErr) {
        const { data: fallbackProfiles } = await client.from("profiles").select("*");
        setProfiles(fallbackProfiles || []);
      } else {
        setProfiles([]);
      }
    } catch (err: any) {
      console.error("Exceção ao consultar users e profiles:", err);
      setError(err?.message || "Erro desconhecido ao carregar perfis.");
    } finally {
      setLoading(false);
    }
  };

  const fetchFeedbacks = async () => {
    setLoadingFeedbacks(true);
    try {
      const fbs = await dbGetSupportFeedbacks();
      setSupportFeedbacks(fbs);
    } catch (err) {
      console.error("Erro ao carregar mensagens de suporte:", err);
    } finally {
      setLoadingFeedbacks(false);
    }
  };

  const loadSupportConfig = async () => {
    try {
      const cfg = await dbGetSupportConfig();
      setSupportConfig(cfg);
    } catch (err) {
      console.error("Erro ao carregar configurações de suporte:", err);
    }
  };

  // Carregamento inicial e canal Realtime do Supabase (monitora users e profiles)
  useEffect(() => {
    fetchProfiles();
    fetchFeedbacks();
    loadSupportConfig();

    const client = getSupabase();
    if (!client) return;

    const channel = client
      .channel(`admin-users-profiles-realtime-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "users"
        },
        (payload: any) => {
          console.log("[AdminPanel Realtime] Evento na tabela 'users':", payload);
          fetchProfiles();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles"
        },
        (payload: any) => {
          console.log("[AdminPanel Realtime] Evento na tabela 'profiles':", payload);
          fetchProfiles();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  // 1. Ação FORÇADA no Supabase: Bloquear / Desbloquear Usuário
  const handleToggleBlock = async (profile: ProfileRecord) => {
    const isMaster = (profile.email || "").toString().toLowerCase().trim() === "vendas.impactodigital2@gmail.com";
    if (isMaster) {
      alert("O Administrador Master absoluto não pode ser bloqueado.");
      return;
    }

    const client = getSupabase();
    if (!client) {
      alert("Cliente Supabase não está conectado.");
      return;
    }

    const currentStatus = (profile.status || profile.status_sistema || profile.status_assinatura || "").toLowerCase().trim();
    const isCurrentlyBlocked = currentStatus === "bloqueado" || currentStatus === "blocked";
    
    const nextStatus = isCurrentlyBlocked ? "ativo" : "bloqueado";
    const nextStatusSistema = isCurrentlyBlocked ? "ativo" : "bloqueado";
    const nextStatusAssinatura = isCurrentlyBlocked ? "ativo" : "bloqueado";

    setActionLoadingId(profile.id);
    try {
      // 1. Atualização OBRIGATÓRIA na tabela 'public.users' com os campos: status, status_sistema, status_assinatura
      const userUpdatePayload = {
        status: nextStatus,
        status_sistema: nextStatusSistema,
        status_assinatura: nextStatusAssinatura
      };

      const { error: usersError } = await client
        .from("users")
        .update(userUpdatePayload)
        .eq("id", profile.id);

      if (usersError) {
        console.warn("Aviso ao atualizar tabela users por ID:", usersError.message);
        if (profile.email) {
          await client.from("users").update(userUpdatePayload).eq("email", profile.email);
        }
      }

      // 2. Atualização complementar na tabela 'profiles'
      try {
        await client
          .from("profiles")
          .update({
            status: nextStatus,
            status_sistema: nextStatusSistema,
            status_assinatura: nextStatusAssinatura
          })
          .eq("id", profile.id);
      } catch (profErr) {
        console.warn("Aviso ao atualizar profiles:", profErr);
      }

      // 3. Atualizar estado local
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === profile.id || (profile.email && p.email === profile.email)
            ? {
                ...p,
                status: nextStatus,
                status_sistema: nextStatusSistema,
                status_assinatura: nextStatusAssinatura
              }
            : p
        )
      );

      const actionText = isCurrentlyBlocked ? "desbloqueado com sucesso" : "bloqueado com sucesso";
      console.log(`[AdminPanel] Usuário ${profile.email || profile.id} ${actionText}.`);
    } catch (err: any) {
      alert(`Falha ao alterar status de bloqueio: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 2. Ação: Ativar Assinatura Manualmente
  const handleActivateSubscription = async (profile: ProfileRecord) => {
    const client = getSupabase();
    if (!client) return;

    setActionLoadingId(profile.id);
    try {
      const payload = {
        status: "ativo",
        status_sistema: "ativo",
        status_assinatura: "ativo",
        plano: "ativo",
        plan: "ativo"
      };

      await client.from("users").update(payload).eq("id", profile.id);
      try {
        await client.from("profiles").update(payload).eq("id", profile.id);
      } catch (_) {}

      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, ...payload } : p))
      );
    } catch (err: any) {
      alert(`Falha ao ativar assinatura: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 3. Ação: Adicionar +7 Dias de Testes
  const handleAddTrialDays = async (profile: ProfileRecord) => {
    const client = getSupabase();
    if (!client) return;

    let baseDate = new Date();
    const currentExp = profile.data_expiracao || profile.trial_end;
    if (currentExp) {
      const parsed = new Date(currentExp);
      if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
        baseDate = parsed;
      }
    }
    const newExp = new Date(baseDate);
    newExp.setDate(newExp.getDate() + 7);
    const newExpStr = newExp.toISOString();

    setActionLoadingId(profile.id);
    try {
      const payload = {
        data_expiracao: newExpStr,
        trial_end: newExpStr,
        status: "ativo",
        status_sistema: "ativo",
        status_assinatura: "trial"
      };

      await client.from("users").update(payload).eq("id", profile.id);
      try {
        await client.from("profiles").update(payload).eq("id", profile.id);
      } catch (_) {}

      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, ...payload } : p))
      );
    } catch (err: any) {
      alert(`Falha ao adicionar dias: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 4. Ação: Alternar Plano (trial / lifetime)
  const handleTogglePlan = async (profile: ProfileRecord) => {
    const client = getSupabase();
    if (!client) return;

    const currentPlan = (profile.plano || profile.plan || "trial").toLowerCase().trim();
    const nextPlan = currentPlan === "lifetime" ? "trial" : "lifetime";

    const payload: any = {
      plano: nextPlan,
      plan: nextPlan
    };

    if (nextPlan === "trial") {
      const future = new Date();
      future.setDate(future.getDate() + 15);
      payload.trial_end = future.toISOString();
      payload.data_expiracao = future.toISOString();
    }

    setActionLoadingId(profile.id);
    try {
      await client.from("users").update(payload).eq("id", profile.id);
      try {
        await client.from("profiles").update(payload).eq("id", profile.id);
      } catch (_) {}

      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, ...payload } : p))
      );
    } catch (err: any) {
      alert(`Falha ao alternar plano: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 5. Ação: Excluir registro
  const handleDeleteProfile = async (profile: ProfileRecord) => {
    const isMaster = (profile.email || "").toString().toLowerCase().trim() === "vendas.impactodigital2@gmail.com";
    if (isMaster) {
      alert("O Administrador Master absoluto não pode ser excluído.");
      return;
    }

    const emailIdent = profile.email || profile.id;
    if (!window.confirm(`Tem certeza que deseja EXCLUIR definitivamente o usuário "${emailIdent}"?`)) {
      return;
    }

    const client = getSupabase();
    if (!client) return;

    setActionLoadingId(profile.id);
    try {
      await client.from("users").delete().eq("id", profile.id);
      try {
        await client.from("profiles").delete().eq("id", profile.id);
      } catch (_) {}

      setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
    } catch (err: any) {
      alert(`Falha ao excluir registro: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 6. Ação: Enviar Resposta de Suporte
  const handleSubmitSupportReply = async (feedbackId: string) => {
    const text = replyTexts[feedbackId]?.trim();
    if (!text) {
      alert("Por favor, digite uma resposta para enviar.");
      return;
    }

    setSubmittingReply(prev => ({ ...prev, [feedbackId]: true }));
    try {
      const ok = await dbSubmitAdminResponse(feedbackId, text);
      if (ok) {
        setReplyTexts(prev => ({ ...prev, [feedbackId]: "" }));
        await fetchFeedbacks();
      } else {
        alert("Erro ao salvar resposta no banco de dados.");
      }
    } catch (err: any) {
      alert(`Erro ao responder: ${err.message}`);
    } finally {
      setSubmittingReply(prev => ({ ...prev, [feedbackId]: false }));
    }
  };

  // 7. Ação: Salvar Configurações de Suporte
  const handleSaveSupportConfig = async () => {
    if (!supportConfig) return;
    setSavingConfig(true);
    try {
      const ok = await dbSaveSupportConfig(supportConfig);
      if (ok) {
        alert("Configurações do suporte atualizadas com sucesso! 🎧");
      } else {
        alert("Erro ao salvar configurações no Supabase.");
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  // Cálculo de dias restantes
  const getRemainingDaysInfo = (profile: ProfileRecord) => {
    const isMaster = (profile.email || "").toString().toLowerCase().trim() === "vendas.impactodigital2@gmail.com";
    if (isMaster) {
      return {
        label: "Master",
        subLabel: "Acesso total permanente",
        isLifetime: true,
        isExpired: false,
        days: 9999
      };
    }

    const plan = (profile.plano || profile.plan || "trial").toLowerCase().trim();
    if (plan === "lifetime") {
      return {
        label: "Vitalício",
        subLabel: "Acesso permanente",
        isLifetime: true,
        isExpired: false,
        days: 9999
      };
    }

    const trialEndStr = profile.trial_end || profile.data_expiracao;
    if (trialEndStr) {
      try {
        const endDate = new Date(trialEndStr);
        if (!isNaN(endDate.getTime())) {
          const diffMs = endDate.getTime() - Date.now();
          const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          if (days <= 0) {
            return {
              label: "Vencido",
              subLabel: "0 dias restantes",
              isLifetime: false,
              isExpired: true,
              days: 0
            };
          }
          return {
            label: `${days} ${days === 1 ? "dia" : "dias"}`,
            subLabel: `Até ${endDate.toLocaleDateString("pt-BR")}`,
            isLifetime: false,
            isExpired: false,
            days
          };
        }
      } catch (e) {}
    }

    if (profile.created_at) {
      try {
        const createdDate = new Date(profile.created_at);
        const endDate = new Date(createdDate.getTime() + 15 * 24 * 60 * 60 * 1000);
        const diffMs = endDate.getTime() - Date.now();
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (days <= 0) {
          return {
            label: "Vencido",
            subLabel: "Período trial esgotado",
            isLifetime: false,
            isExpired: true,
            days: 0
          };
        }
        return {
          label: `${days} ${days === 1 ? "dia" : "dias"}`,
          subLabel: `15d da criação`,
          isLifetime: false,
          isExpired: false,
          days
        };
      } catch (e) {}
    }

    return {
      label: "Não informado",
      subLabel: "Sem data limite",
      isLifetime: false,
      isExpired: false,
      days: 0
    };
  };

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      const email = (p.email || "").toLowerCase();
      const name = (p.name || p.nome || "").toLowerCase();
      const username = (p.username || "").toLowerCase();
      const id = (p.id || "").toLowerCase();
      const term = search.toLowerCase().trim();
      const matchesSearch = !term || email.includes(term) || name.includes(term) || username.includes(term) || id.includes(term);

      const status = (p.status_sistema || p.status || p.status_assinatura || "ativo").toLowerCase().trim();
      const isBlocked = status === "blocked" || status === "bloqueado";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !isBlocked) ||
        (statusFilter === "blocked" && isBlocked);

      const plan = (p.plano || p.plan || "trial").toLowerCase().trim();
      const matchesPlan =
        planFilter === "all" ||
        (planFilter === "lifetime" && plan === "lifetime") ||
        (planFilter === "trial" && plan !== "lifetime");

      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [profiles, search, statusFilter, planFilter]);

  const stats = useMemo(() => {
    const total = profiles.length;
    let active = 0;
    let blocked = 0;
    let lifetime = 0;
    let trial = 0;

    profiles.forEach((p) => {
      const status = (p.status_sistema || p.status || p.status_assinatura || "ativo").toLowerCase().trim();
      if (status === "blocked" || status === "bloqueado") {
        blocked++;
      } else {
        active++;
      }

      const plan = (p.plano || p.plan || "trial").toLowerCase().trim();
      if (plan === "lifetime") {
        lifetime++;
      } else {
        trial++;
      }
    });

    return { total, active, blocked, lifetime, trial };
  }, [profiles]);

  const unansweredFeedbacksCount = useMemo(() => {
    return supportFeedbacks.filter(f => !f.resposta_admin).length;
  }, [supportFeedbacks]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header do Painel Master */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 p-5 rounded-2xl border border-amber-500/30 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Painel Master Unificado
                <span className="text-[10px] uppercase font-black tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm">
                  👑 Administrador Master
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Gestão centralizada de usuários, assinaturas, status financeiro e bloqueios em tempo real no Supabase.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              fetchProfiles();
              fetchFeedbacks();
            }}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
            title="Recarregar registros em tempo real"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-amber-400" : ""}`} />
            <span>Atualizar Dados</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas / Contadores do Sistema */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Total de Usuários</span>
            <Users className="h-4 w-4 text-slate-500" />
          </div>
          <div className="text-2xl font-black text-white mt-1">{stats.total}</div>
        </div>
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
            <span>Sistema Ativo</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-300 mt-1">{stats.active}</div>
        </div>
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-red-400 uppercase tracking-wider flex items-center justify-between">
            <span>Bloqueados</span>
            <XCircle className="h-4 w-4 text-red-500" />
          </div>
          <div className="text-2xl font-black text-red-300 mt-1">{stats.blocked}</div>
        </div>
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
            <span>Vitalícios</span>
            <InfinityIcon className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-300 mt-1">{stats.lifetime}</div>
        </div>
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 col-span-2 sm:col-span-1 shadow-sm">
          <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
            <span>Em Trial</span>
            <Clock className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-black text-cyan-300 mt-1">{stats.trial}</div>
        </div>
      </div>

      {/* Navegação entre Abas do Painel Master */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto whitespace-nowrap">
        <button
          type="button"
          onClick={() => setActiveTab("usuarios")}
          className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "usuarios" 
              ? "border-amber-400 text-amber-300 bg-amber-500/10 rounded-t-lg" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Gestão de Mensalistas & Usuários</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("suporte_mensagens");
            fetchFeedbacks();
          }}
          className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "suporte_mensagens" 
              ? "border-amber-400 text-amber-300 bg-amber-500/10 rounded-t-lg" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Headphones className="h-4 w-4" />
          <span>Atendimento & Mensagens de Suporte</span>
          {unansweredFeedbacksCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-black animate-pulse">
              {unansweredFeedbacksCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("suporte_config");
            loadSupportConfig();
          }}
          className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "suporte_config" 
              ? "border-amber-400 text-amber-300 bg-amber-500/10 rounded-t-lg" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>Configurações do Suporte</span>
        </button>
      </div>

      {/* ABA 1: GESTÃO DE MENSALISTAS & USUÁRIOS */}
      {activeTab === "usuarios" && (
        <div className="space-y-4">
          {/* Barra de Filtros e Busca */}
          <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between shadow-sm">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por e-mail, nome ou ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all font-mono"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Filtro de Status */}
              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    statusFilter === "all" ? "bg-amber-500/20 text-amber-300 font-black" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("active")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    statusFilter === "active" ? "bg-emerald-500/20 text-emerald-300 font-black" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Ativos
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("blocked")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    statusFilter === "blocked" ? "bg-red-500/20 text-red-300 font-black" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Bloqueados
                </button>
              </div>

              {/* Filtro de Plano */}
              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPlanFilter("all")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    planFilter === "all" ? "bg-amber-500/20 text-amber-300 font-black" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Todos Planos
                </button>
                <button
                  type="button"
                  onClick={() => setPlanFilter("lifetime")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    planFilter === "lifetime" ? "bg-amber-500/20 text-amber-300 font-black" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Lifetime
                </button>
                <button
                  type="button"
                  onClick={() => setPlanFilter("trial")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    planFilter === "trial" ? "bg-cyan-500/20 text-cyan-300 font-black" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Trial
                </button>
              </div>
            </div>
          </div>

          {/* Erro de Comunicação se houver */}
          {error && (
            <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
              <div>
                <div className="font-bold">Aviso sobre o banco de dados</div>
                <div className="text-red-400/80 mt-0.5">{error}</div>
              </div>
            </div>
          )}

          {/* Tabela Unificada de Mensalistas & Usuários */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 uppercase font-bold text-[10px] tracking-wider font-mono">
                    <th className="py-3 px-4">Usuário / E-mail</th>
                    <th className="py-3 px-3">Status Sistema</th>
                    <th className="py-3 px-3">Status Assinatura</th>
                    <th className="py-3 px-3">Plano</th>
                    <th className="py-3 px-3">Vencimento / Dias</th>
                    <th className="py-3 px-4 text-right">Ações de Controle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {loading && profiles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-amber-500 mb-2" />
                        <span>Carregando usuários e status do Supabase...</span>
                      </td>
                    </tr>
                  ) : filteredProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        Nenhum registro encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredProfiles.map((p) => {
                      const isMaster = (p.email || "").toString().toLowerCase().trim() === "vendas.impactodigital2@gmail.com";
                      
                      // Status do sistema
                      const sysStatus = (p.status_sistema || p.status || "ativo").toLowerCase().trim();
                      const isSysBlocked = sysStatus === "blocked" || sysStatus === "bloqueado";

                      // Status da assinatura
                      const subStatus = (p.status_assinatura || p.status || "ativo").toLowerCase().trim();
                      const isSubBlocked = subStatus === "blocked" || subStatus === "bloqueado";
                      const isSubAtivo = subStatus === "ativo" || subStatus === "active";
                      const isSubTrial = subStatus === "trial";
                      const isSubVencido = subStatus === "vencido" || subStatus === "expired";

                      const plan = (p.plano || p.plan || "trial").toLowerCase().trim();
                      const isLifetime = plan === "lifetime";
                      const remaining = getRemainingDaysInfo(p);
                      const isBusy = actionLoadingId === p.id;

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-850/50 transition-colors group ${
                            isSysBlocked ? "bg-red-950/10" : ""
                          }`}
                        >
                          {/* Coluna 1: Usuário / E-mail */}
                          <td className="py-3.5 px-4 font-medium text-slate-200">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${
                                isMaster 
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : isSysBlocked
                                  ? "bg-red-950/60 text-red-400 border-red-800/60"
                                  : "bg-slate-800 text-slate-300 border-slate-700"
                              }`}>
                                {(p.name || p.nome || p.email || p.username || "U").charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                                  <span>{p.name || p.nome || p.email || p.username || "Sem nome"}</span>
                                  {isMaster && (
                                    <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                      👑 MASTER
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                                  <span>{p.email || "Sem e-mail"}</span>
                                  {p.username && <span className="text-slate-500">(@{p.username})</span>}
                                </div>
                                <div className="text-[9px] text-slate-600 font-mono">
                                  ID: {p.id.slice(0, 16)}...
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Coluna 2: Status do Sistema */}
                          <td className="py-3.5 px-3">
                            {isSysBlocked ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-red-950/70 text-red-300 border border-red-800/80 shadow-sm">
                                <Lock className="h-3 w-3 text-red-400" />
                                Bloqueado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-950/70 text-emerald-300 border border-emerald-800/80 shadow-sm">
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                Ativo
                              </span>
                            )}
                          </td>

                          {/* Coluna 3: Status da Assinatura */}
                          <td className="py-3.5 px-3">
                            {isSubBlocked ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-950/60 text-red-400 border border-red-800/60">
                                <XCircle className="h-3 w-3" />
                                Bloqueado
                              </span>
                            ) : isSubAtivo ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                                <CheckCircle2 className="h-3 w-3" />
                                Ativo
                              </span>
                            ) : isSubTrial ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-800/60">
                                <Clock className="h-3 w-3" />
                                Trial
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800/60">
                                <AlertCircle className="h-3 w-3" />
                                Vencido
                              </span>
                            )}
                          </td>

                          {/* Coluna 4: Plano */}
                          <td className="py-3.5 px-3">
                            {isLifetime ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                <InfinityIcon className="h-3 w-3 text-amber-400" />
                                Vitalício
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                <Clock className="h-3 w-3 text-slate-400" />
                                30d / Trial
                              </span>
                            )}
                          </td>

                          {/* Coluna 5: Vencimento / Dias Restantes */}
                          <td className="py-3.5 px-3">
                            <div className="space-y-0.5">
                              <div className={`font-bold flex items-center gap-1 ${
                                remaining.isLifetime
                                  ? "text-amber-400 font-black"
                                  : remaining.isExpired
                                  ? "text-red-400 font-black"
                                  : remaining.days <= 3
                                  ? "text-orange-400 font-bold"
                                  : "text-slate-200"
                              }`}>
                                {remaining.isLifetime && <Sparkles className="h-3 w-3 text-amber-400" />}
                                {remaining.isExpired && <AlertCircle className="h-3 w-3 text-red-400" />}
                                <span>{remaining.label}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {remaining.subLabel}
                              </div>
                            </div>
                          </td>

                          {/* Coluna 6: Botões de Ação */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Botão BLOQUEAR / DESBLOQUEAR Centralizado e Forçado no Supabase */}
                              {!isMaster && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleBlock(p)}
                                  disabled={isBusy}
                                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all border flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm ${
                                    isSysBlocked
                                      ? "bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-300 border-emerald-700/60"
                                      : "bg-red-950/60 hover:bg-red-900/70 text-red-300 border-red-700/60"
                                  }`}
                                  title={isSysBlocked ? "Desbloquear acesso imediatamente (grava status = 'ativo')" : "Bloquear acesso forçado (grava status, status_sistema, status_assinatura = 'bloqueado')"}
                                >
                                  {isSysBlocked ? (
                                    <>
                                      <Unlock className="h-3 w-3 text-emerald-400" />
                                      <span>Desbloquear</span>
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="h-3 w-3 text-red-400" />
                                      <span>Bloquear</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {/* Botão Ativar Assinatura */}
                              {!isMaster && (
                                <button
                                  type="button"
                                  onClick={() => handleActivateSubscription(p)}
                                  disabled={isBusy}
                                  className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 hover:border-emerald-600/40 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="Ativar assinatura como Ativa"
                                >
                                  <Check className="h-3 w-3 text-emerald-400" />
                                  <span>Ativar</span>
                                </button>
                              )}

                              {/* Botão +7 Dias */}
                              {!isMaster && !isLifetime && (
                                <button
                                  type="button"
                                  onClick={() => handleAddTrialDays(p)}
                                  disabled={isBusy}
                                  className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-600/40 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="Adicionar +7 dias ao período de testes"
                                >
                                  <Plus className="h-3 w-3 text-cyan-400" />
                                  <span>+7 Dias</span>
                                </button>
                              )}

                              {/* Botão Alternar Lifetime / Trial */}
                              {!isMaster && (
                                <button
                                  type="button"
                                  onClick={() => handleTogglePlan(p)}
                                  disabled={isBusy}
                                  className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 hover:border-amber-600/40 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title={`Alternar plano para ${isLifetime ? "Trial" : "Vitalício"}`}
                                >
                                  <InfinityIcon className="h-3 w-3 text-amber-400" />
                                  <span>{isLifetime ? "P/ Trial" : "Vitalício"}</span>
                                </button>
                              )}

                              {/* Botão Excluir */}
                              {!isMaster && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProfile(p)}
                                  disabled={isBusy}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-800/40 transition-all cursor-pointer disabled:opacity-50"
                                  title="Excluir usuário permanentemente"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: MENSAGENS DE SUPORTE */}
      {activeTab === "suporte_mensagens" && (
        <div className="space-y-4">
          <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones className="h-5 w-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Central de Mensagens e Dúvidas dos Clientes</h3>
                <p className="text-xs text-slate-400">Responda diretamente aos chamados dos clientes do sistema.</p>
              </div>
            </div>

            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFeedbackFilter("unanswered")}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  feedbackFilter === "unanswered" ? "bg-amber-500/20 text-amber-300 font-black" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Não Respondidas ({unansweredFeedbacksCount})
              </button>
              <button
                type="button"
                onClick={() => setFeedbackFilter("all")}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  feedbackFilter === "all" ? "bg-amber-500/20 text-amber-300 font-black" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Todas ({supportFeedbacks.length})
              </button>
            </div>
          </div>

          {loadingFeedbacks ? (
            <div className="py-12 text-center text-slate-500 bg-slate-900 rounded-xl border border-slate-800">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-amber-400 mb-2" />
              <span>Carregando mensagens de suporte...</span>
            </div>
          ) : supportFeedbacks.length === 0 ? (
            <div className="py-12 text-center text-slate-500 bg-slate-900 rounded-xl border border-slate-800">
              <MessageSquare className="h-8 w-8 mx-auto text-slate-600 mb-2" />
              <span>Nenhuma mensagem de suporte recebida ainda.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {supportFeedbacks
                .filter(f => feedbackFilter === "all" || !f.resposta_admin)
                .map((f) => (
                  <div key={f.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 shadow-md">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">
                          {f.user_name || (f as any).usuario_nome || "Cliente"}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(f.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <div>
                        {f.resposta_admin ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                            Respondido
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/60">
                            Pendente
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Mensagem do usuário */}
                    <div className="text-xs text-slate-200 bg-slate-950 p-3 rounded-lg border border-slate-850">
                      <p className="font-semibold text-slate-400 text-[10px] uppercase font-mono mb-1">Dúvida / Feedback:</p>
                      <p>{f.message || (f as any).mensagem || "Sem mensagem de texto"}</p>
                      {f.audio_url && (
                        <div className="mt-2 pt-2 border-t border-slate-850 flex items-center gap-2">
                          <audio src={f.audio_url} controls className="h-8 w-full max-w-xs" />
                        </div>
                      )}
                    </div>

                    {/* Resposta do Administrador se houver */}
                    {f.resposta_admin && (
                      <div className="text-xs text-emerald-200 bg-emerald-950/30 p-3 rounded-lg border border-emerald-900/40">
                        <p className="font-semibold text-emerald-400 text-[10px] uppercase font-mono mb-1">
                          Sua Resposta: ({f.respondido_em ? new Date(f.respondido_em).toLocaleString("pt-BR") : ""})
                        </p>
                        <p>{f.resposta_admin}</p>
                      </div>
                    )}

                    {/* Formulário para responder */}
                    {!f.resposta_admin && (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          placeholder="Digite sua resposta oficial ao cliente..."
                          value={replyTexts[f.id] || ""}
                          onChange={(e) => setReplyTexts(prev => ({ ...prev, [f.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSubmitSupportReply(f.id);
                            }
                          }}
                          className="flex-grow px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleSubmitSupportReply(f.id)}
                          disabled={submittingReply[f.id]}
                          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>{submittingReply[f.id] ? "Enviando..." : "Responder"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ABA 3: CONFIGURAÇÕES DO SUPORTE */}
      {activeTab === "suporte_config" && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-2xl space-y-4 shadow-md">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Settings className="h-5 w-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Parâmetros de Atendimento & Horários</h3>
          </div>

          {supportConfig ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Horário de Início</label>
                  <input
                    type="time"
                    value={supportConfig.horario_inicio || "08:00"}
                    onChange={(e) => setSupportConfig(prev => prev ? ({ ...prev, horario_inicio: e.target.value }) : null)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Horário de Término</label>
                  <input
                    type="time"
                    value={supportConfig.horario_fim || "18:00"}
                    onChange={(e) => setSupportConfig(prev => prev ? ({ ...prev, horario_fim: e.target.value }) : null)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Mensagem de Fora do Horário</label>
                <textarea
                  rows={3}
                  value={supportConfig.mensagem_fechado || ""}
                  onChange={(e) => setSupportConfig(prev => prev ? ({ ...prev, mensagem_fechado: e.target.value }) : null)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  placeholder="Mensagem exibida aos clientes quando o suporte estiver fechado..."
                />
              </div>

              <button
                type="button"
                onClick={handleSaveSupportConfig}
                disabled={savingConfig}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{savingConfig ? "Salvando..." : "Salvar Configurações"}</span>
              </button>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto text-amber-400 mb-1" />
              <span>Carregando configurações...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
