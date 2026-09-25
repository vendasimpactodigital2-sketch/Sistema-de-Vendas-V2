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
  AlertCircle
} from "lucide-react";
import { getSupabase } from "../supabase";

export interface ProfileRecord {
  id: string;
  email?: string;
  status?: string;
  status_assinatura?: string;
  plano?: string;
  plan?: string;
  trial_end?: string;
  data_expiracao?: string;
  created_at?: string;
  nome?: string;
  name?: string;
  role?: string;
  [key: string]: any;
}

export function AdminPanel() {
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked">("all");
  const [planFilter, setPlanFilter] = useState<"all" | "trial" | "lifetime">("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

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
      const { data, error: queryError } = await client
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (queryError) {
        console.error("Erro ao buscar tabela profiles:", queryError);
        // Fallback without order in case created_at doesn't exist
        const { data: fallbackData, error: fallbackError } = await client
          .from("profiles")
          .select("*");

        if (fallbackError) {
          setError(fallbackError.message);
        } else {
          setProfiles(fallbackData || []);
        }
      } else {
        setProfiles(data || []);
      }
    } catch (err: any) {
      console.error("Exceção ao consultar profiles:", err);
      setError(err?.message || "Erro desconhecido ao carregar perfis.");
    } finally {
      setLoading(false);
    }
  };

  // Carregamento inicial e canal Realtime do Supabase
  useEffect(() => {
    fetchProfiles();

    const client = getSupabase();
    if (!client) return;

    const channel = client
      .channel("profiles-realtime-master-channel")
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

  // 1. Ação: Botão Bloquear / Ativar
  const handleToggleStatus = async (profile: ProfileRecord) => {
    const client = getSupabase();
    if (!client) return;

    const currentStatus = (profile.status || profile.status_assinatura || "active").toLowerCase().trim();
    const isCurrentlyBlocked = currentStatus === "blocked" || currentStatus === "bloqueado";
    const nextStatus = isCurrentlyBlocked ? "active" : "blocked";
    const nextStatusAssinatura = isCurrentlyBlocked ? "ativo" : "bloqueado";

    setActionLoadingId(profile.id);
    try {
      const { error: updateError } = await client
        .from("profiles")
        .update({
          status: nextStatus,
          status_assinatura: nextStatusAssinatura,
          updated_at: new Date().toISOString()
        })
        .eq("id", profile.id);

      if (updateError) {
        alert(`Erro ao atualizar status: ${updateError.message}`);
      } else {
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === profile.id
              ? { ...p, status: nextStatus, status_assinatura: nextStatusAssinatura }
              : p
          )
        );
      }
    } catch (err: any) {
      alert(`Falha ao alterar status: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 2. Ação: Alternar Plano (trial / lifetime)
  const handleTogglePlan = async (profile: ProfileRecord) => {
    const client = getSupabase();
    if (!client) return;

    const currentPlan = (profile.plano || profile.plan || "trial").toLowerCase().trim();
    const nextPlan = currentPlan === "lifetime" ? "trial" : "lifetime";

    const payload: any = {
      plano: nextPlan,
      plan: nextPlan,
      updated_at: new Date().toISOString()
    };

    // Ao migrar de volta para 'trial', define nova data de término para 15 dias se não houver
    if (nextPlan === "trial") {
      const future = new Date();
      future.setDate(future.getDate() + 15);
      payload.trial_end = future.toISOString();
      payload.data_expiracao = future.toISOString();
    }

    setActionLoadingId(profile.id);
    try {
      const { error: updateError } = await client
        .from("profiles")
        .update(payload)
        .eq("id", profile.id);

      if (updateError) {
        alert(`Erro ao alternar plano: ${updateError.message}`);
      } else {
        setProfiles((prev) =>
          prev.map((p) => (p.id === profile.id ? { ...p, ...payload } : p))
        );
      }
    } catch (err: any) {
      alert(`Falha ao alternar plano: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 3. Ação: Excluir registro
  const handleDeleteProfile = async (profile: ProfileRecord) => {
    const emailIdent = profile.email || profile.id;
    if (!window.confirm(`Tem certeza que deseja EXCLUIR definitivamente o perfil de "${emailIdent}"?`)) {
      return;
    }

    const client = getSupabase();
    if (!client) return;

    setActionLoadingId(profile.id);
    try {
      const { error: deleteError } = await client
        .from("profiles")
        .delete()
        .eq("id", profile.id);

      if (deleteError) {
        alert(`Erro ao excluir perfil: ${deleteError.message}`);
      } else {
        setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
      }
    } catch (err: any) {
      alert(`Falha ao excluir registro: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Cálculo de dias restantes
  const getRemainingDaysInfo = (profile: ProfileRecord) => {
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

    // Fallback: cálculo baseado no created_at (15 dias de período de teste padrão)
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
          subLabel: `15d a partir da criação`,
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
      const id = (p.id || "").toLowerCase();
      const term = search.toLowerCase().trim();
      const matchesSearch = !term || email.includes(term) || id.includes(term);

      const status = (p.status || p.status_assinatura || "active").toLowerCase().trim();
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
      const status = (p.status || p.status_assinatura || "active").toLowerCase().trim();
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header do Painel Master */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 p-5 rounded-2xl border border-amber-500/30 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Painel Master de Assinaturas
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Realtime
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Controle centralizado da tabela <code className="text-amber-300 font-mono">profiles</code> em tempo real
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchProfiles}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Recarregar registros"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-amber-400" : ""}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas / Contadores */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total de Perfis</div>
          <div className="text-2xl font-black text-white mt-1">{stats.total}</div>
        </div>
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
          <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Ativos</div>
          <div className="text-2xl font-black text-emerald-300 mt-1">{stats.active}</div>
        </div>
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
          <div className="text-[11px] font-bold text-red-400 uppercase tracking-wider">Bloqueados</div>
          <div className="text-2xl font-black text-red-300 mt-1">{stats.blocked}</div>
        </div>
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Vitalícios</div>
          <div className="text-2xl font-black text-amber-300 mt-1">{stats.lifetime}</div>
        </div>
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
          <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">Em Trial</div>
          <div className="text-2xl font-black text-cyan-300 mt-1">{stats.trial}</div>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por e-mail ou ID..."
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
            <div className="font-bold">Aviso sobre a tabela 'profiles'</div>
            <div className="text-red-400/80 mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Tabela de Registros */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase font-bold text-[11px] tracking-wider font-mono">
                <th className="py-3 px-4">E-mail / Usuário</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Plano</th>
                <th className="py-3 px-4">Dias Restantes</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {loading && profiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-amber-500 mb-2" />
                    <span>Carregando registros de 'profiles'...</span>
                  </td>
                </tr>
              ) : filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    Nenhum registro encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p) => {
                  const status = (p.status || p.status_assinatura || "active").toLowerCase().trim();
                  const isBlocked = status === "blocked" || status === "bloqueado";
                  const plan = (p.plano || p.plan || "trial").toLowerCase().trim();
                  const isLifetime = plan === "lifetime";
                  const remaining = getRemainingDaysInfo(p);
                  const isBusy = actionLoadingId === p.id;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-850/50 transition-colors group"
                    >
                      {/* E-mail */}
                      <td className="py-3.5 px-4 font-medium text-slate-200">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-bold shrink-0">
                            {(p.email || p.username || "U").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              <span>{p.email || p.username || "Sem e-mail"}</span>
                              {p.email?.toLowerCase().trim() === "vendas.impactodigital2@gmail.com" && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  MASTER
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              ID: {p.id.slice(0, 12)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isBlocked ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-950/60 text-red-400 border border-red-800/60">
                            <XCircle className="h-3 w-3 text-red-400" />
                            Bloqueado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                            Ativo
                          </span>
                        )}
                      </td>

                      {/* Plano */}
                      <td className="py-3.5 px-4">
                        {isLifetime ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-500/40">
                            <InfinityIcon className="h-3 w-3 text-amber-400" />
                            Lifetime
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-950/50 text-cyan-300 border border-cyan-800/50">
                            <Clock className="h-3 w-3 text-cyan-400" />
                            Trial
                          </span>
                        )}
                      </td>

                      {/* Contador de Dias Restantes */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <div className={`font-bold flex items-center gap-1.5 ${
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

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão Bloquear / Ativar */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(p)}
                            disabled={isBusy}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                              isBlocked
                                ? "bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-700/50"
                                : "bg-red-950/40 hover:bg-red-900/50 text-red-300 border-red-700/50"
                            }`}
                            title={isBlocked ? "Desbloquear e ativar usuário" : "Bloquear acesso do usuário"}
                          >
                            {isBlocked ? (
                              <>
                                <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Ativar</span>
                              </>
                            ) : (
                              <>
                                <UserX className="h-3.5 w-3.5 text-red-400" />
                                <span>Bloquear</span>
                              </>
                            )}
                          </button>

                          {/* Alternar Plano */}
                          <button
                            type="button"
                            onClick={() => handleTogglePlan(p)}
                            disabled={isBusy}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title={`Alternar para ${isLifetime ? "Trial" : "Lifetime"}`}
                          >
                            <RefreshCw className="h-3 w-3 text-amber-400" />
                            <span>{isLifetime ? "Mudar p/ Trial" : "Mudar p/ Lifetime"}</span>
                          </button>

                          {/* Excluir Registro */}
                          <button
                            type="button"
                            onClick={() => handleDeleteProfile(p)}
                            disabled={isBusy}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/30 border border-transparent hover:border-red-800/40 transition-all cursor-pointer disabled:opacity-50"
                            title="Excluir perfil permanentemente"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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
  );
}

export default AdminPanel;
