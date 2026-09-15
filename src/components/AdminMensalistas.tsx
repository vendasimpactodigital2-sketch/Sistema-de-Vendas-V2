import React, { useEffect, useState, useMemo } from "react";
import { 
  ArrowLeft, 
  Search, 
  Users, 
  ShieldAlert, 
  Check, 
  Calendar, 
  Lock, 
  CreditCard, 
  Plus, 
  RefreshCw, 
  Ban, 
  User as UserIcon,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Trash2,
  Headphones,
  MessageSquare,
  Play,
  Volume2,
  X,
  Send
} from "lucide-react";
import { User, SupportConfig, SupportFeedback } from "../types";
import { 
  dbGetUsers, 
  dbUpdateUserAdminActions, 
  dbDeleteUser,
  dbGetSupportConfig,
  dbSaveSupportConfig,
  dbGetSupportFeedbacks,
  dbSubmitAdminResponse,
  getSupabase
} from "../supabase";

interface AdminMensalistasProps {
  currentUser: User;
  onBack: () => void;
  addToast?: (message: string, type: "success" | "error" | "info" | "warning") => void;
}

export function AdminMensalistas({ currentUser, onBack, addToast }: AdminMensalistasProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Support states
  const [activeSubTab, setActiveSubTab] = useState<"mensalistas" | "mensagens_suporte" | "config_suporte">("mensalistas");
  const [supportConfig, setSupportConfig] = useState<SupportConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // Reply states
  const [selectedUserForSupport, setSelectedUserForSupport] = useState<User | null>(null);
  const [userFeedbacks, setUserFeedbacks] = useState<SupportFeedback[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<Record<string, boolean>>({});

  // Unified support states for the main administrator
  const [allFeedbacks, setAllFeedbacks] = useState<SupportFeedback[]>([]);
  const [loadingAllFeedbacks, setLoadingAllFeedbacks] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState<"unanswered" | "all">("unanswered");

  const fetchAllFeedbacks = async () => {
    setLoadingAllFeedbacks(true);
    try {
      const fbs = await dbGetSupportFeedbacks();
      setAllFeedbacks(fbs);
    } catch (err) {
      console.error("Error fetching all feedbacks:", err);
    } finally {
      setLoadingAllFeedbacks(false);
    }
  };

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await dbGetSupportConfig();
        setSupportConfig(config);
      } catch (err) {
        console.error("Error loading support config in admin panel:", err);
      }
    };
    loadConfig();
    fetchAllFeedbacks();
  }, []);

  const handleSaveSupportConfig = async () => {
    if (!supportConfig) return;
    setSavingConfig(true);
    try {
      const success = await dbSaveSupportConfig(supportConfig);
      if (success) {
        localAddToast("Configurações do suporte atualizadas com sucesso! 🎧", "success");
      } else {
        localAddToast("Erro ao salvar configurações no Supabase.", "error");
      }
    } catch (err: any) {
      localAddToast(`Erro: ${err.message}`, "error");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleOpenSupportFeedbacks = async (user: User) => {
    setSelectedUserForSupport(user);
    setLoadingFeedbacks(true);
    try {
      const feedbacks = await dbGetSupportFeedbacks(user.id);
      setUserFeedbacks(feedbacks);
    } catch (err) {
      console.error("Error fetching feedbacks for user:", err);
    } finally {
      setLoadingFeedbacks(false);
    }
  };

  const handleSubmitReply = async (feedbackId: string) => {
    const text = replyTexts[feedbackId]?.trim();
    if (!text) {
      localAddToast("Por favor, digite uma resposta para enviar.", "warning");
      return;
    }

    setSubmittingReply(prev => ({ ...prev, [feedbackId]: true }));
    try {
      const success = await dbSubmitAdminResponse(feedbackId, text);
      if (success) {
        localAddToast("Resposta registrada e enviada com sucesso! 💎", "success");
        setReplyTexts(prev => ({ ...prev, [feedbackId]: "" }));
        // Refresh
        if (selectedUserForSupport) {
          const updated = await dbGetSupportFeedbacks(selectedUserForSupport.id);
          setUserFeedbacks(updated);
        }
        fetchAllFeedbacks();
      } else {
        localAddToast("Erro ao salvar resposta no banco de dados.", "error");
      }
    } catch (err: any) {
      localAddToast(`Erro ao responder: ${err.message}`, "error");
    } finally {
      setSubmittingReply(prev => ({ ...prev, [feedbackId]: false }));
    }
  };

  const isUserAdmin = useMemo(() => {
    return !!(currentUser && (
      currentUser.role === "admin" ||
      currentUser.role === "administrador" ||
      currentUser.is_admin === true ||
      !currentUser.owner_id ||
      currentUser.owner_id === currentUser.id ||
      currentUser.email?.toLowerCase().trim() === "sistemadevendaadm@gmail.com" ||
      currentUser.email?.toLowerCase().trim() === "vendas.impactodigital2@gmail.com" ||
      currentUser.email?.toLowerCase().trim() === "sistemavendaadm@gmail.com"
    ));
  }, [currentUser]);

  const localAddToast = (msg: string, type: "success" | "error" | "info" | "warning") => {
    if (addToast) {
      addToast(msg, type);
    } else {
      alert(`${type.toUpperCase()}: ${msg}`);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetched = await dbGetUsers();
      const supabase = getSupabase();

      if (supabase) {
        try {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, data_expiracao, status_assinatura, status");

          if (profilesData && profilesData.length > 0) {
            const profileMap = new Map<string, any>();
            profilesData.forEach((p: any) => profileMap.set(p.id, p));

            const baseList = fetched || [];
            const merged = baseList.map(u => {
              const prof = profileMap.get(u.id);
              if (prof) {
                return {
                  ...u,
                  data_expiracao: prof.data_expiracao || u.data_expiracao,
                  status_assinatura: prof.status_assinatura || prof.status || u.status_assinatura
                };
              }
              return u;
            });
            setUsers(merged);
            setLoading(false);
            return;
          }
        } catch (profileFetchErr) {
          console.warn("Consulta à tabela profiles:", profileFetchErr);
        }
      }

      if (fetched) {
        setUsers(fetched);
      } else {
        setError("Não foi possível carregar os usuários. Verifique a conexão.");
      }
    } catch (err: any) {
      console.error("Erro ao buscar usuários do Supabase:", err);
      setError(err.message || "Erro inesperado ao buscar usuários.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const getTrialDaysRemaining = (createdAtStr?: string, dataExpiracaoStr?: string) => {
    if (dataExpiracaoStr) {
      try {
        const expDate = new Date(dataExpiracaoStr);
        const currentDate = new Date();
        const diffTime = expDate.getTime() - currentDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays);
      } catch {}
    }
    if (!createdAtStr) return 15;
    try {
      const createdDate = new Date(createdAtStr);
      const currentDate = new Date();
      const diffTime = currentDate.getTime() - createdDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, 15 - diffDays);
    } catch {
      return 15;
    }
  };

  const getSubscriptionStatus = (user: User) => {
    const status = (user.status_assinatura || (user as any).status || "").toString().trim().toUpperCase();
    if (status === "BLOQUEADO" || status === "BLOCKED") return "bloqueado";
    if (status === "ATIVO" || status === "ACTIVE") return "ativo";
    if (status === "VENCIDO" || status === "EXPIRED") return "vencido";
    
    if (user.data_expiracao) {
      try {
        const expDate = new Date(user.data_expiracao);
        const now = new Date();
        return expDate.getTime() > now.getTime() ? "trial" : "vencido";
      } catch {}
    }
    const days = getTrialDaysRemaining(user.created_at, user.data_expiracao);
    return days > 0 ? "trial" : "vencido";
  };

  const handleActivateSubscription = async (userId: string) => {
    if (!isUserAdmin) {
      localAddToast("Ação restrita ao Administrador Geral.", "error");
      return;
    }
    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase
          .from("profiles")
          .update({ status_assinatura: "ativo", status: "ATIVO" })
          .eq("id", userId);
      }
      await dbUpdateUserAdminActions(userId, { status_assinatura: "ativo" });
      localAddToast("Assinatura ativada manualmente com sucesso! 💎", "success");
      fetchUsers();
    } catch (err: any) {
      localAddToast(`Erro: ${err.message}`, "error");
    }
  };

  const handleAddTrialDays = async (user: User) => {
    if (!isUserAdmin) {
      localAddToast("Ação restrita ao Administrador Geral.", "error");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      localAddToast("Conexão com o Supabase indisponível.", "error");
      return;
    }

    try {
      // 1. Busca a data_expiracao atual do usuário na tabela 'profiles'
      let currentExp: string | null = user.data_expiracao || null;
      try {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("data_expiracao")
          .eq("id", user.id)
          .maybeSingle();

        if (profileData && profileData.data_expiracao) {
          currentExp = profileData.data_expiracao;
        }
      } catch (err) {
        console.warn("Aviso ao buscar data_expiracao em profiles:", err);
      }

      // Base para somar os 7 dias
      let baseDate = new Date();
      if (currentExp) {
        const parsed = new Date(currentExp);
        if (!isNaN(parsed.getTime())) {
          baseDate = parsed;
        }
      } else if (user.created_at) {
        const parsedCreated = new Date(user.created_at);
        if (!isNaN(parsedCreated.getTime())) {
          baseDate = parsedCreated;
        }
      }

      // Soma mais 7 dias no banco
      const novaData = new Date(baseDate);
      novaData.setDate(novaData.getDate() + 7);
      const novaDataExpiracaoStr = novaData.toISOString();

      // Atualiza a tabela 'profiles' no Supabase
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          data_expiracao: novaDataExpiracaoStr,
          status_assinatura: "trial"
        })
        .eq("id", user.id);

      if (profileError) {
        console.warn("Tentando update direto de data_expiracao em profiles:", profileError.message);
        await supabase
          .from("profiles")
          .update({ data_expiracao: novaDataExpiracaoStr })
          .eq("id", user.id);
      }

      // Também sincroniza na tabela 'users' para retrocompatibilidade
      try {
        await supabase
          .from("users")
          .update({
            data_expiracao: novaDataExpiracaoStr,
            created_at: novaDataExpiracaoStr,
            status_assinatura: "trial"
          })
          .eq("id", user.id);
      } catch (_) {}

      localAddToast("Adicionados +7 dias à data de expiração com sucesso! 📅", "success");
      fetchUsers();
    } catch (err: any) {
      localAddToast(`Erro ao adicionar dias: ${err.message}`, "error");
    }
  };

  const handleBlockAccess = async (userId: string) => {
    if (!isUserAdmin) {
      localAddToast("Ação restrita ao Administrador Geral.", "error");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      localAddToast("Conexão com o Supabase indisponível.", "error");
      return;
    }

    try {
      // 1. Muda o status_assinatura para 'BLOQUEADO' no Supabase (tabela 'profiles')
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          status_assinatura: "BLOQUEADO",
          status: "BLOQUEADO"
        })
        .eq("id", userId);

      if (profileError) {
        console.warn("Tentando update apenas de status_assinatura em profiles:", profileError.message);
        await supabase
          .from("profiles")
          .update({ status_assinatura: "BLOQUEADO" })
          .eq("id", userId);
      }

      // Sincroniza também na tabela 'users' para retrocompatibilidade
      try {
        await supabase
          .from("users")
          .update({
            status_assinatura: "BLOQUEADO",
            status: "BLOQUEADO"
          })
          .eq("id", userId);
      } catch (_) {}

      localAddToast("Acesso do usuário bloqueado (BLOQUEADO) com sucesso! 🚫", "warning");
      fetchUsers();
    } catch (err: any) {
      localAddToast(`Erro ao bloquear acesso: ${err.message}`, "error");
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!isUserAdmin) {
      localAddToast("Ação restrita ao Administrador Geral.", "error");
      return;
    }
    if (!window.confirm(`Tem certeza de que deseja DELETAR permanentemente o login de "${userName}"? Esta ação é irreversível!`)) {
      return;
    }
    try {
      const success = await dbDeleteUser(userId);
      if (success) {
        localAddToast("Login do usuário deletado permanentemente do sistema! 🗑️", "success");
        fetchUsers();
      } else {
        localAddToast("Não foi possível deletar o login. Verifique as configurações.", "error");
      }
    } catch (err: any) {
      localAddToast(`Erro ao deletar: ${err.message}`, "error");
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const status = getSubscriptionStatus(user);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      
      const name = (user.name || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      const username = (user.username || "").toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchesQuery = name.includes(query) || email.includes(query) || username.includes(query);

      return matchesStatus && matchesQuery;
    });
  }, [users, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    let active = 0;
    let trial = 0;
    let expired = 0;
    let blocked = 0;

    users.forEach(user => {
      const status = getSubscriptionStatus(user);
      if (status === "ativo") active++;
      else if (status === "trial") trial++;
      else if (status === "bloqueado") blocked++;
      else expired++;
    });

    return { total, active, trial, expired, blocked };
  }, [users]);

  if (!isUserAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
          <ShieldAlert className="h-12 w-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-100">Acesso Restrito</h2>
          <p className="text-sm text-slate-400 mt-2 mb-6">
            Somente o Administrador Geral possui permissão para acessar o Painel de Controle de Mensalistas.
          </p>
          <button
            onClick={onBack}
            className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl text-sm font-bold cursor-pointer transition-all border border-slate-700"
          >
            Voltar ao Sistema
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12 transition-colors duration-250 body.light:bg-slate-50 body.light:text-slate-900">
      {/* Decorative gradients */}
      <div className="absolute top-0 left-0 right-0 h-[320px] bg-gradient-to-b from-violet-600/10 via-transparent to-transparent pointer-events-none" />

      {/* Header Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-100 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer shadow-inner flex items-center justify-center"
              title="Voltar ao Sistema"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest font-mono">
                  Painel Administrativo
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight mt-1 flex items-center gap-2">
                Gerenciamento de Mensalistas 🛡️
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Controle o status de assinatura, prazos de testes e acesso de todos os clientes do sistema.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={fetchUsers}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-xs text-slate-300 hover:text-white rounded-lg transition-all cursor-pointer"
              title="Recarregar dados"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Sincronizar</span>
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          <div className="bg-slate-900/40 border border-slate-850/60 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total de Usuários</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-slate-100">{stats.total}</span>
              <Users className="h-5 w-5 text-slate-600 shrink-0" />
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-850/60 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assinaturas Ativas</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-emerald-400">{stats.active}</span>
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-850/60 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Período de Trial</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-brand-cyan">{stats.trial}</span>
              <Calendar className="h-5 w-5 text-brand-cyan shrink-0" />
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-850/60 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Prazos Expirados</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-amber-500">{stats.expired}</span>
              <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-850/60 p-4 rounded-xl col-span-2 md:col-span-1 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contas Bloqueadas</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-red-500">{stats.blocked}</span>
              <XCircle className="h-5 w-5 text-red-500 shrink-0" />
            </div>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex border-b border-slate-800 mt-6 relative z-10 overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveSubTab("mensalistas")}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeSubTab === "mensalistas" 
                ? "border-violet-500 text-violet-400" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Lista de Mensalistas 👥
          </button>
          <button
            onClick={() => {
              setActiveSubTab("mensagens_suporte");
              fetchAllFeedbacks();
            }}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === "mensagens_suporte" 
                ? "border-violet-500 text-violet-400" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>Central de Suporte (Todas) ✉️</span>
            {allFeedbacks.filter(f => !f.resposta_admin).length > 0 && (
              <span className="bg-red-500 text-white font-mono text-[9px] font-black px-1.5 py-0.25 rounded-full animate-pulse">
                {allFeedbacks.filter(f => !f.resposta_admin).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab("config_suporte")}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeSubTab === "config_suporte" 
                ? "border-violet-500 text-violet-400" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Configurações do Suporte 🎧
          </button>
        </div>

        {activeSubTab === "mensalistas" && (
          <>
            {/* Filter and search controls */}
            <div className="mt-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Buscar por nome, e-mail ou usuário..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-850 pl-10 pr-4 py-2 text-sm rounded-xl focus:outline-none focus:border-violet-500 transition-all text-slate-100 placeholder:text-slate-600"
            />
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0 justify-end">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filtrar:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900/60 border border-slate-850 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              <option value="all">Todos os Status</option>
              <option value="ativo">Somente Ativos</option>
              <option value="trial">Somente Trial</option>
              <option value="vencido">Somente Vencidos/Expirados</option>
              <option value="bloqueado">Somente Bloqueados</option>
            </select>
          </div>
        </div>

        {/* Main Users Table Card */}
        <div className="mt-6 bg-slate-900/25 border border-slate-850/50 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
          {error && (
            <div className="p-6 text-center text-red-400 border-b border-slate-850/40 bg-red-950/15">
              <p className="font-semibold">{error}</p>
              <button
                onClick={fetchUsers}
                className="mt-3 px-4 py-2 bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <RefreshCw className="h-8 w-8 text-violet-500 animate-spin" />
              <span className="text-xs text-slate-500 font-mono">Consultando banco de dados Supabase...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <Users className="h-10 w-10 text-slate-700" />
              <span className="text-sm font-semibold text-slate-400">Nenhum usuário encontrado</span>
              <span className="text-xs text-slate-600">Altere os termos de busca ou filtros aplicados.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-850 bg-slate-950/30 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                    <th className="py-4 px-6">Nome / Gráfica</th>
                    <th className="py-4 px-6">E-mail</th>
                    <th className="py-4 px-6">Data de Cadastro</th>
                    <th className="py-4 px-6 text-center">Trial Restante</th>
                    <th className="py-4 px-6 text-center">Status</th>
                    <th className="py-4 px-6 text-right">Ações Rápidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/40">
                  {filteredUsers.map((user) => {
                    const status = getSubscriptionStatus(user);
                    const trialDays = getTrialDaysRemaining(user.created_at, user.data_expiracao);
                    const formattedDate = user.created_at 
                      ? new Date(user.created_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric"
                        })
                      : "Sem cadastro";

                    return (
                      <tr 
                        key={user.id} 
                        className="hover:bg-slate-900/10 transition-colors group"
                      >
                        {/* Nome / Gráfica */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-center text-slate-400 group-hover:border-slate-700 transition-all shrink-0">
                              <UserIcon className="h-4 w-4" />
                            </div>
                            <div className="text-left leading-tight">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-slate-100">{user.name}</span>
                                {user.role === "administrador" && (
                                  <span className="px-1.5 py-0.25 text-[8px] font-extrabold uppercase bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded">
                                    Admin
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">@{user.username}</span>
                            </div>
                          </div>
                        </td>

                        {/* E-mail */}
                        <td className="py-4 px-6">
                          <span className="text-xs text-slate-300 font-mono">{user.email || "Sem e-mail"}</span>
                        </td>

                        {/* Data de Cadastro */}
                        <td className="py-4 px-6">
                          <span className="text-xs text-slate-300 font-mono">{formattedDate}</span>
                        </td>

                        {/* Trial Restante */}
                        <td className="py-4 px-6 text-center">
                          {status === "ativo" ? (
                            <span className="text-slate-500 text-xs font-mono">—</span>
                          ) : (
                            <div className="inline-flex flex-col items-center">
                              <span className={`text-xs font-bold font-mono ${trialDays > 5 ? "text-brand-cyan" : trialDays > 0 ? "text-amber-400" : "text-rose-500"}`}>
                                {trialDays} {trialDays === 1 ? 'dia' : 'dias'}
                              </span>
                              <span className="text-[8px] text-slate-500 uppercase tracking-widest mt-0.5">restantes</span>
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-6 text-center">
                          {status === "ativo" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm shadow-emerald-500/5">
                              <ShieldCheck className="h-3 w-3 shrink-0" />
                              <span>Ativo</span>
                            </span>
                          ) : status === "trial" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20">
                              <Calendar className="h-3 w-3 shrink-0" />
                              <span>Trial</span>
                            </span>
                          ) : status === "bloqueado" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                              <Ban className="h-3 w-3 shrink-0" />
                              <span>Bloqueado</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              <ShieldAlert className="h-3 w-3 shrink-0" />
                              <span>Vencido</span>
                            </span>
                          )}
                        </td>

                        {/* Ações Rápidas */}
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                            {/* Ativar Assinatura */}
                            {status !== "ativo" && (
                              <button
                                onClick={() => handleActivateSubscription(user.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500 text-[10px] font-black uppercase text-emerald-400 hover:text-white border border-emerald-500/20 hover:border-emerald-500 rounded-lg transition-all cursor-pointer shadow-sm"
                                title="Ativar Assinatura Manualmente"
                              >
                                <CreditCard className="h-3 w-3" />
                                <span>Ativar</span>
                              </button>
                            )}

                            {/* Adicionar +7 Dias */}
                            <button
                              onClick={() => handleAddTrialDays(user)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-cyan/10 hover:bg-brand-cyan text-[10px] font-black uppercase text-brand-cyan hover:text-white border border-brand-cyan/20 hover:border-brand-cyan rounded-lg transition-all cursor-pointer shadow-sm"
                              title="Adicionar mais 7 dias de período de testes"
                            >
                              <Plus className="h-3 w-3" />
                              <span>+7 Dias</span>
                            </button>

                            {/* Bloquear Acesso */}
                            {status !== "bloqueado" && (
                              <button
                                onClick={() => handleBlockAccess(user.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500 text-[10px] font-black uppercase text-red-400 hover:text-white border border-red-500/20 hover:border-red-500 rounded-lg transition-all cursor-pointer shadow-sm"
                                title="Bloquear Acesso Manualmente"
                              >
                                <Lock className="h-3 w-3" />
                                <span>Bloquear</span>
                              </button>
                            )}

                            {/* Suporte do Cliente */}
                            <button
                              onClick={() => handleOpenSupportFeedbacks(user)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-500/10 hover:bg-violet-500 text-[10px] font-black uppercase text-violet-400 hover:text-white border border-violet-500/20 hover:border-violet-500 rounded-lg transition-all cursor-pointer shadow-sm"
                              title="Ver e responder solicitações de suporte do cliente"
                            >
                              <MessageSquare className="h-3 w-3" />
                              <span>Suporte</span>
                            </button>

                            {/* Deletar Login */}
                            <button
                              onClick={() => handleDeleteUser(user.id, user.name || user.username)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-600/10 hover:bg-rose-600 text-[10px] font-black uppercase text-rose-400 hover:text-white border border-rose-500/20 hover:border-rose-500 rounded-lg transition-all cursor-pointer shadow-sm"
                              title="Excluir Conta Permanentemente"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Deletar</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
        )}

        {/* Support Settings Section */}
        {activeSubTab === "config_suporte" && (
          <div className="mt-6 bg-slate-900/40 border border-slate-850 p-6 rounded-2xl max-w-2xl space-y-5 backdrop-blur-md">
            <div>
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                <Headphones className="h-4 w-4 text-violet-400" />
                Configurações do Suporte Técnico
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Defina o horário em que o suporte estará ativo para receber mensagens de voz dos clientes e personalize a mensagem de fechamento.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Horário de Início (HH:MM)</label>
                <input
                  type="text"
                  placeholder="Ex: 09:00"
                  value={supportConfig?.horario_inicio || ""}
                  onChange={(e) => setSupportConfig(prev => prev ? { ...prev, horario_inicio: e.target.value } : null)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500 text-slate-150 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Horário de Término (HH:MM)</label>
                <input
                  type="text"
                  placeholder="Ex: 19:00"
                  value={supportConfig?.horario_fim || ""}
                  onChange={(e) => setSupportConfig(prev => prev ? { ...prev, horario_fim: e.target.value } : null)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500 text-slate-150 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Mensagem para Quando Estiver Fechado</label>
              <textarea
                rows={3}
                placeholder="Ex: Suporte Fechado. Deixe sua mensagem assim que abrirmos!"
                value={supportConfig?.mensagem_fechado || ""}
                onChange={(e) => setSupportConfig(prev => prev ? { ...prev, mensagem_fechado: e.target.value } : null)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500 text-slate-150"
              />
            </div>

            <button
              onClick={handleSaveSupportConfig}
              disabled={savingConfig}
              className="w-full md:w-auto px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl text-xs uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-violet-600/10"
            >
              {savingConfig ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>Salvar Configurações</span>
              )}
            </button>
          </div>
        )}

        {/* Unified Support Inbox */}
        {activeSubTab === "mensagens_suporte" && (
          <div className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-violet-400" />
                  Central Unificada de Atendimento ao Cliente ✉️
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Visualize, filtre e responda a todas as dúvidas e feedbacks enviados por assinantes e usuários do sistema.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Filter toggle */}
                <div className="flex bg-slate-950/60 p-1 rounded-xl border border-slate-850">
                  <button
                    onClick={() => setFeedbackFilter("unanswered")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      feedbackFilter === "unanswered"
                        ? "bg-violet-600/25 text-violet-400 shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Não Respondidas ({allFeedbacks.filter(f => !f.resposta_admin).length})
                  </button>
                  <button
                    onClick={() => setFeedbackFilter("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      feedbackFilter === "all"
                        ? "bg-violet-600/25 text-violet-400 shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Todas ({allFeedbacks.length})
                  </button>
                </div>

                {/* Refresh */}
                <button
                  onClick={fetchAllFeedbacks}
                  disabled={loadingAllFeedbacks}
                  className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all cursor-pointer"
                  title="Atualizar mensagens"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingAllFeedbacks ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {loadingAllFeedbacks ? (
              <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                <RefreshCw className="h-8 w-8 text-violet-500 animate-spin" />
                <span className="text-xs text-slate-500">Buscando mensagens no Supabase...</span>
              </div>
            ) : (
              (() => {
                const filtered = allFeedbacks.filter(fb => {
                  if (feedbackFilter === "unanswered") return !fb.resposta_admin;
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="bg-slate-900/20 border border-dashed border-slate-850 rounded-2xl py-16 text-center flex flex-col items-center justify-center gap-3 max-w-xl mx-auto">
                      <HelpCircle className="h-10 w-10 text-slate-700" />
                      <span className="text-xs font-bold text-slate-400">Nenhuma mensagem encontrada</span>
                      <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed">
                        {feedbackFilter === "unanswered" 
                          ? "Parabéns! Todas as mensagens de suporte foram lidas e respondidas com sucesso." 
                          : "Nenhum cliente enviou mensagens ou dúvidas de suporte até o momento."
                        }
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filtered.map((fb) => {
                      const isTextMessage = fb.message || fb.audio_url?.startsWith("text:");
                      const textContent = fb.message || (fb.audio_url?.startsWith("text:") ? fb.audio_url.substring(5) : "");
                      const replyVal = replyTexts[fb.id] || "";
                      const sending = submittingReply[fb.id] || false;

                      return (
                        <div key={fb.id} className="bg-slate-900/30 border border-slate-850 p-5 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
                          <div className="space-y-3">
                            {/* Card Header info */}
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-xs uppercase">
                                  {fb.user_name?.substring(0, 2) || "U"}
                                </div>
                                <div className="text-left leading-none">
                                  <span className="text-xs font-bold text-slate-200 block">{fb.user_name}</span>
                                  <span className="text-[9px] text-slate-500 font-mono mt-0.5 block">
                                    Enviado em {new Date(fb.created_at).toLocaleString("pt-BR")}
                                  </span>
                                </div>
                              </div>

                              <div>
                                {fb.resposta_admin ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                                    Respondido
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase bg-red-500/10 text-red-400 border border-red-500/25 animate-pulse">
                                    Aguardando
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Message content */}
                            {isTextMessage ? (
                              <div className="space-y-1.5">
                                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Mensagem Escrita:</span>
                                <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-xl text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans shadow-inner max-h-40 overflow-y-auto">
                                  {textContent}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Mensagem de Voz:</span>
                                <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-850 flex items-center gap-3">
                                  <Volume2 className="h-4 w-4 text-violet-400 shrink-0" />
                                  <audio controls src={fb.audio_url} className="w-full h-8 accent-violet-500" preload="none" />
                                </div>
                              </div>
                            )}

                            {/* Existing reply display */}
                            {fb.resposta_admin && (
                              <div className="bg-violet-950/15 border border-violet-900/30 p-3 rounded-xl space-y-1.5">
                                <div className="flex items-center justify-between text-[9px] font-bold text-violet-400 uppercase tracking-wider">
                                  <span>Sua Resposta:</span>
                                  {fb.respondido_em && (
                                    <span className="font-mono text-slate-500 font-normal">
                                      {new Date(fb.respondido_em).toLocaleString("pt-BR")}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-violet-200 leading-relaxed whitespace-pre-wrap">
                                  {fb.resposta_admin}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Action Form */}
                          <div className="space-y-2.5 pt-2 border-t border-slate-850/50">
                            <textarea
                              rows={2}
                              value={replyVal}
                              onChange={(e) => setReplyTexts(prev => ({ ...prev, [fb.id]: e.target.value }))}
                              disabled={sending}
                              placeholder={fb.resposta_admin ? "Atualizar resposta anterior..." : "Digite sua resposta detalhada..."}
                              className="w-full bg-slate-950 border border-slate-850 focus:border-violet-500/80 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none resize-none leading-relaxed transition-all"
                            />
                            <div className="flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => handleSubmitReply(fb.id)}
                                disabled={sending || !replyVal.trim()}
                                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all ${
                                  replyVal.trim()
                                    ? "bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/10 hover:scale-[1.02]"
                                    : "bg-slate-950 text-slate-600 border border-slate-850 cursor-not-allowed"
                                }`}
                              >
                                <Send className="h-3 w-3" />
                                <span>{sending ? "Enviando..." : fb.resposta_admin ? "Atualizar Resposta" : "Responder"}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}

      </div>

      {/* Selected User Support Dialog Modal */}
      {selectedUserForSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-2">
                <Headphones className="h-5 w-5 text-violet-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Histórico de Suporte: {selectedUserForSupport.name || selectedUserForSupport.username}
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">
                    ID do Cliente: {selectedUserForSupport.id}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserForSupport(null)}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-850 cursor-pointer transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-grow scrollbar-thin">
              {loadingFeedbacks ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="h-6 w-6 text-violet-500 animate-spin" />
                  <span className="text-xs text-slate-500">Buscando mensagens gravadas...</span>
                </div>
              ) : userFeedbacks.length === 0 ? (
                <div className="py-12 text-center flex flex-col items-center justify-center gap-2 text-slate-500">
                  <MessageSquare className="h-8 w-8 text-slate-700 mb-1" />
                  <span className="text-xs font-bold">Nenhum feedback gravado para este cliente</span>
                  <span className="text-[10px] text-slate-600">O cliente ainda não enviou mensagens de suporte na central.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {userFeedbacks.map((fb) => {
                    const replyVal = replyTexts[fb.id] || "";
                    const sending = submittingReply[fb.id] || false;
                    const isTextMessage = fb.message || fb.audio_url?.startsWith("text:");
                    const textContent = fb.message || (fb.audio_url?.startsWith("text:") ? fb.audio_url.substring(5) : "");

                    return (
                      <div key={fb.id} className="bg-slate-950/50 border border-slate-850 p-4 rounded-xl space-y-3 shadow-inner">
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-mono">Código: #{fb.id}</span>
                          <span>{new Date(fb.created_at).toLocaleString("pt-BR")}</span>
                        </div>

                        {/* Content: Text Message bubble or Audio Player */}
                        {isTextMessage ? (
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Mensagem Escrita:</span>
                            <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans shadow-inner">
                              {textContent}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Mensagem de Voz:</span>
                            <audio controls src={fb.audio_url} className="w-full h-8 bg-slate-900 border border-slate-800 rounded-lg accent-violet-500" />
                          </div>
                        )}

                        {/* Admin Answer status */}
                        {fb.resposta_admin ? (
                          <div className="bg-violet-500/5 border-l-2 border-violet-500 p-3 rounded-r-lg space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-bold text-violet-400">
                              <span>RESPOSTA ENVIADA</span>
                              {fb.respondido_em && (
                                <span className="text-slate-500 font-mono">
                                  {new Date(fb.respondido_em).toLocaleString("pt-BR")}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                              {fb.resposta_admin}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-amber-500/5 border-l-2 border-amber-500 p-3 rounded-r-lg">
                            <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest block">Aguardando Resposta do Admin</span>
                          </div>
                        )}

                        {/* Reply Form */}
                        <div className="pt-2 border-t border-slate-900/60 space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            {fb.resposta_admin ? "Atualizar ou Enviar Nova Resposta:" : "Responder Cliente:"}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              name="Responder Cliente"
                              placeholder="Digite sua resposta em texto aqui..."
                              value={replyVal}
                              onChange={(e) => setReplyTexts(prev => ({ ...prev, [fb.id]: e.target.value }))}
                              className="flex-grow bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-violet-500 text-slate-200"
                              disabled={sending}
                            />
                            <button
                              onClick={() => handleSubmitReply(fb.id)}
                              disabled={sending || !replyVal.trim()}
                              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0"
                            >
                              {sending ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                "Enviar Resposta"
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-right">
              <button
                onClick={() => setSelectedUserForSupport(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl text-xs font-bold cursor-pointer transition-all border border-slate-750"
              >
                Fechar Painel
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
