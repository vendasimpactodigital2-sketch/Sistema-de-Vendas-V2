import React, { useState, useEffect } from "react";
import { User } from "../types";
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Edit3, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  ShieldAlert, 
  Eye, 
  EyeOff, 
  Mail, 
  KeyRound, 
  X,
  UserCheck
} from "lucide-react";
import { isSupabaseConfigured, dbGetUsers, dbSaveUser, dbDeleteUser, getAdminDomain, normalizeUserString } from "../supabase";
import { motion, AnimatePresence } from "motion/react";

interface UsersManagerProps {
  currentUser: User;
  onUpdateCurrentUser: (user: User) => void;
  onNavigateToAtendentes?: () => void;
}

export function UsersManager({ currentUser, onUpdateCurrentUser, onNavigateToAtendentes }: UsersManagerProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states (common for Create/Edit)
  const [userId, setUserId] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("atendente");
  const [showPassword, setShowPassword] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Confirmation dialog state
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Load all users on component load
  const loadUsersList = async () => {
    setLoading(true);
    setError(null);

        // 🛑 TRAVA DE SEGURANÇA IMEDIATA
    if (currentUser) {
      const dataAtual = new Date();
      // @ts-ignore
      const dataFimTrial = currentUser.trial_end ? new Date(currentUser.trial_end) : null;
      // @ts-ignore
      const statusAssinatura = currentUser.status_assinatura;
      // @ts-ignore
      const isBlocked = currentUser.is_blocked;

      if (
        statusAssinatura === 'expirado' || 
        isBlocked === true || 
        (statusAssinatura === 'trial' && dataFimTrial && dataAtual > dataFimTrial)
      ) {
        alert("ACESSO BLOQUEADO: Seu período de teste acabou ou sua assinatura está inativa. Entre em contato com o suporte.");
        localStorage.removeItem("NUCLEO_USERS");
        localStorage.removeItem("user_session"); 
        window.location.href = "/"; // Força o redirecionamento para fora do painel
        return;
      }
    }
    let localUsers: User[] = [];

    // Fallback load local
    try {
      const saved = localStorage.getItem("NUCLEO_USERS");
      if (saved) {
        localUsers = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse local users", e);
    }

    if (isSupabaseConfigured()) {
      try {
        const dbUsers = await dbGetUsers(currentUser.id);
        if (dbUsers) {
          // Robustly find logged-in user inside database rows (check id, username or email fallback)
          const dbUserRecord = dbUsers.find(u => 
            u.id === currentUser.id ||
            u.username.toLowerCase() === currentUser.username.toLowerCase() ||
            (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase())
          );
          
          const currentUserId = dbUserRecord?.id || currentUser.id;
          const currentUserOwnerId = dbUserRecord?.owner_id || currentUser.owner_id;

          const isMarcio = 
            (currentUser.id && currentUser.id.toLowerCase() === "marcio") ||
            (currentUser.username && currentUser.username.toLowerCase() === "marcio") ||
            (currentUser.username && currentUser.username.toLowerCase() === "marcos") ||
            (currentUser.email && currentUser.email.toLowerCase() === "marcos@gmail.com") ||
            (currentUser.name && currentUser.name.toLowerCase().includes("marcio")) ||
            (dbUserRecord?.username && dbUserRecord.username.toLowerCase() === "marcio") ||
            (dbUserRecord?.email && dbUserRecord.email.toLowerCase() === "marcos@gmail.com");

          const tenantUsers = dbUsers.filter(u => {
            // First rule: Always allow showing self
            if (u.id === currentUserId) return true;

            // Rule 1: If the logged-in user is Marcio, the list MUST contain ONLY operators whose owner_id is strictly equal to Marcio's ID
            if (isMarcio) {
              return u.owner_id === currentUserId;
            }

            // Rule 2: If the logged-in user's owner_id is empty (or they are treated as their own owner)
            const isCurrentOwnerIdEmpty = !currentUserOwnerId || currentUserOwnerId.trim() === "" || currentUserOwnerId === currentUserId;
            if (isCurrentOwnerIdEmpty) {
              // Hide any other administrative user (where owner_id is empty or equal to their own ID) to guarantee isolation
              const isUAdmin = !u.owner_id || u.owner_id.trim() === "" || u.owner_id === u.id;
              if (isUAdmin) {
                return false;
              }
            }

            // Otherwise, apply regular group filter
            const companyOwnerId = (currentUserOwnerId && currentUserOwnerId !== currentUserId)
              ? currentUserOwnerId
              : currentUserId;

            return u.owner_id === companyOwnerId || u.id === companyOwnerId;
          });

          setUsers(tenantUsers);
          localStorage.setItem("NUCLEO_USERS", JSON.stringify(tenantUsers));
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn("Could not load users database, using local", err);
        setError("Não foi possível conectar ao Supabase para carregar a lista em tempo real. Exibindo dados locais.");
      }
    }

    // Local compatibility fallback
    const localUserRecord = localUsers.find(u => 
      u.id === currentUser.id ||
      u.username.toLowerCase() === currentUser.username.toLowerCase() ||
      (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase())
    );
    
    const localUserId = localUserRecord?.id || currentUser.id;
    const localUserOwnerId = localUserRecord?.owner_id || currentUser.owner_id;

    const isLocalMarcio = 
      (currentUser.id && currentUser.id.toLowerCase() === "marcio") ||
      (currentUser.username && currentUser.username.toLowerCase() === "marcio") ||
      (currentUser.username && currentUser.username.toLowerCase() === "marcos") ||
      (currentUser.email && currentUser.email.toLowerCase() === "marcos@gmail.com") ||
      (currentUser.name && currentUser.name.toLowerCase().includes("marcio")) ||
      (localUserRecord?.username && localUserRecord.username.toLowerCase() === "marcio") ||
      (localUserRecord?.email && localUserRecord.email.toLowerCase() === "marcos@gmail.com");

    const localTenantUsers = localUsers.filter(u => {
      // Always allow self
      if (u.id === localUserId) return true;

      // Rule 1: Marcio rule
      if (isLocalMarcio) {
        return u.owner_id === localUserId;
      }

      // Rule 2: Hide other administrative users
      const isLocalOwnerIdEmpty = !localUserOwnerId || localUserOwnerId.trim() === "" || localUserOwnerId === localUserId;
      if (isLocalOwnerIdEmpty) {
        const isUAdmin = !u.owner_id || u.owner_id.trim() === "" || u.owner_id === u.id;
        if (isUAdmin) {
          return false;
        }
      }

      const localCompanyOwnerId = (localUserOwnerId && localUserOwnerId !== localUserId)
        ? localUserOwnerId
        : localUserId;

      return u.id === localCompanyOwnerId || u.owner_id === localCompanyOwnerId;
    });

    setUsers(localTenantUsers);
    setLoading(false);
  };

  useEffect(() => {
    loadUsersList();
  }, []);

  // Filtered list
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Clear or reset form inputs
  const resetForm = () => {
    setUserId("");
    setName("");
    setUsername("");
    setEmail("");
    setPassword("");
    setRole("atendente");
    setShowPassword(false);
    setIsEditing(false);
    setShowForm(false);
    setError(null);
  };

  // Open Edit Form
  const handleStartEdit = (user: User) => {
    setUserId(user.id);
    setName(user.name);
    setUsername(user.username);
    setEmail(user.email || "");
    setPassword(user.password || "");
    setRole(user.role || "atendente");
    setIsEditing(true);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Save User (Create or Update)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedName = name.trim();
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedName || !trimmedUsername || (!isEditing && !trimmedPassword)) {
      setError("Os campos Nome, Usuário e Senha são obrigatórios.");
      return;
    }

    if (trimmedUsername.length < 3) {
      setError("O nome de usuário deve ter pelo menos 3 caracteres.");
      return;
    }

    if (trimmedPassword.length < 3) {
      setError("A senha deve ter pelo menos 3 caracteres.");
      return;
    }

    // Check unique username if creating new
    if (!isEditing) {
      const exists = users.some(u => u.username.toLowerCase() === trimmedUsername);
      if (exists) {
        setError("Este nome de usuário já está cadastrado.");
        return;
      }
    } else {
      // Check unique username if username changed
      const exists = users.some(u => u.id !== userId && u.username.toLowerCase() === trimmedUsername);
      if (exists) {
        setError("Este nome de usuário já está sendo usado por outro usuário.");
        return;
      }
    }

     // Manager security PIN gate requested by TestSprite
    const managerPin = prompt("Esta alteração exige autorização do Administrador. Digite o PIN do Gerente:");
    if (!managerPin || managerPin !== "123") {
      setError("PIN do Gerente incorreto ou operação cancelada. Alteração administrativa bloqueada!");
      return;
    }

    setLoading(true);

    const loggedInUserFromState = users.find(u =>
      u.id === currentUser.id ||
      u.username.toLowerCase() === currentUser.username.toLowerCase()
    );


    const currentUserOwnerId = loggedInUserFromState?.owner_id || currentUser.owner_id;
    const currentOwnerId = (currentUserOwnerId && currentUserOwnerId !== (loggedInUserFromState?.id || currentUser.id))
      ? currentUserOwnerId
      : (loggedInUserFromState?.id || currentUser.id);

    const existingUser = isEditing ? users.find(u => u.id === userId) : null;
    const resolvedOwnerId = existingUser?.owner_id || currentOwnerId;

    // Helper to generate a valid RFC4122 v4 UUID
    const generateUserUUID = (): string => {
      if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    let finalEmail = trimmedEmail;
    const derivedDomain = getAdminDomain(currentUser?.email || "", currentUser?.username || "");
    if (!finalEmail) {
      finalEmail = `${trimmedUsername}@${derivedDomain}`;
    } else if (!finalEmail.includes("@")) {
      finalEmail = `${finalEmail.toLowerCase()}@${derivedDomain}`;
    }

    const updatedUser: User = {
      id: isEditing ? userId : generateUserUUID(),
      name: trimmedName,
      username: trimmedUsername,
      email: finalEmail,
      password: trimmedPassword,
      owner_id: resolvedOwnerId,
      role: role
    };

    // Save in local state
    let updatedUsersList: User[] = [];
    if (isEditing) {
      updatedUsersList = users.map(u => u.id === updatedUser.id ? updatedUser : u);
    } else {
      updatedUsersList = [...users, updatedUser];
    }

    setUsers(updatedUsersList);
    localStorage.setItem("NUCLEO_USERS", JSON.stringify(updatedUsersList));

    // If edited user is the currently logged in user, refresh their session
    if (updatedUser.id === currentUser.id) {
      onUpdateCurrentUser(updatedUser);
    }

    // Sync to Supabase
    let synced = true;
    if (isSupabaseConfigured()) {
      try {
        synced = await dbSaveUser(updatedUser, resolvedOwnerId);
      } catch (err) {
        console.error("Failed to save user in Supabase", err);
        synced = false;
      }
    }

    setLoading(false);
    if (synced) {
      setSuccess(isEditing ? "Usuário atualizado com sucesso!" : "Novo usuário cadastrado com sucesso!");
      resetForm();
      loadUsersList();
    } else {
      setError("Erro ao sincronizar com o banco Supabase, porém as alterações foram salvas localmente temporariamente.");
    }
  };

  // Delete User handler
  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Filter out user from local state
    const afterDeleteList = users.filter(u => u.id !== userToDelete.id);
    setUsers(afterDeleteList);
    localStorage.setItem("NUCLEO_USERS", JSON.stringify(afterDeleteList));

    let remoteDeleted = true;
    if (isSupabaseConfigured()) {
      try {
        remoteDeleted = await dbDeleteUser(userToDelete.id);
      } catch (err) {
        console.error("Failed to delete user in remote DB", err);
        remoteDeleted = false;
      }
    }

    const wasCurrentUser = userToDelete.id === currentUser.id;

    setLoading(false);
    setUserToDelete(null);

    if (remoteDeleted) {
      setSuccess("Usuário removido com sucesso!");
      loadUsersList();
    } else {
      setError("A exclusão falhou no Supabase, mas o usuário foi ocultado localmente.");
    }

    // If the active user deletes themselves, they should be logged out!
    if (wasCurrentUser) {
      // Small timeout to show alert first
      alert("Você removeu seu próprio usuário logado. Você será desconectado.");
      localStorage.removeItem("NUCLEO_CURRENT_USER");
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Upper Alerts */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-red-950/40 border border-red-900/40 rounded-xl flex items-start gap-3 text-red-400 text-sm"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <div className="flex-grow">
              <span className="font-bold">Atenção:</span> {error}
            </div>
            <button onClick={() => setError(null)} className="p-1 text-red-400/60 hover:text-red-400 rounded">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-emerald-950/45 border border-emerald-900/40 rounded-xl flex items-start gap-3 text-emerald-400 text-sm"
          >
            <CheckCircle className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
            <div className="flex-grow">
              <span className="font-bold">Sucesso!</span> {success}
            </div>
            <button onClick={() => setSuccess(null)} className="p-1 text-emerald-400/60 hover:text-emerald-400 rounded">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {onNavigateToAtendentes && (
        <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-blue-950/40 border border-cyan-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white flex items-center gap-2">
                Painel e Relatórios de Atendentes & Exclusões
              </h4>
              <p className="text-[11px] text-slate-400">
                Audite tudo o que cada atendente excluiu (com data e hora) e consulte relatórios completos de vendas, atendimentos e retiradas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateToAtendentes}
            className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow border border-cyan-400/30 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-all self-start sm:self-auto shrink-0"
          >
            <UserCheck className="h-4 w-4" />
            <span>Abrir Painel dos Atendentes</span>
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Left Side: Users Form Panel */}
        <div className="w-full lg:w-5/12 space-y-4">
          
          {/* Header Action to Show/Hide Form */}
          {!showForm ? (
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="w-full p-4 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 text-center flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:border-brand-cyan/40 hover:shadow-lg hover:shadow-brand-cyan/5 group"
            >
              <div className="p-3 rounded-full bg-brand-cyan/10 border border-brand-cyan/25 text-brand-cyan group-hover:scale-110 transition-transform">
                <UserPlus className="h-6 w-6" />
              </div>
              <span className="font-bold text-sm text-slate-100">Criar Novo Usuário</span>
              <span className="text-xs text-slate-450">Cadastre um novo operador, vendedor ou administrador para a equipe.</span>
            </button>
          ) : (
            <div className="bg-brand-card rounded-2xl border border-slate-800 p-6 space-y-5 relative">
              
              <button
                onClick={resetForm}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                title="Fechar formulário"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-brand-cyan/10 border border-brand-cyan/25 text-brand-cyan">
                  <span className="text-sm font-bold">{isEditing ? "✏️" : "👤"}</span>
                </div>
                <div>
                  <h3 className="font-bold text-slate-100">{isEditing ? "Editar Usuário" : "Novo Cadastro de Usuário"}</h3>
                  <p className="text-xs text-slate-400">{isEditing ? "Altere os dados cadastrais do usuário selecionado" : "Forneça as credenciais de acesso exclusivas"}</p>
                </div>
              </div>

              <form onSubmit={handleSaveUser} className="space-y-4">
                
                {/* Full name input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 font-mono mb-1.5 uppercase">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: João da Silva Santos"
                    className="w-full p-3 bg-slate-950 border border-slate-850 focus:border-brand-cyan rounded-xl outline-none text-slate-100 text-sm transition-all"
                  />
                </div>

                {/* Username Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 font-mono mb-1.5 uppercase">Nome do Usuário (Login)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-slate-500 text-sm select-none font-mono">@</span>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="joao_vendedor ou joao123"
                      className="w-full p-3 pl-8 bg-slate-950 border border-slate-850 focus:border-brand-cyan rounded-xl outline-none text-slate-100 text-sm transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Email Input (Optional) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 font-mono mb-1.5 uppercase">E-mail (Opcional)</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="joao@graficanucleo.com"
                      className="w-full p-3 pl-11 bg-slate-950 border border-slate-850 focus:border-brand-cyan rounded-xl outline-none text-slate-100 text-sm transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-brand-cyan/90 mt-1.5 font-mono leading-relaxed bg-brand-cyan/5 border border-brand-cyan/10 p-2.5 rounded-lg text-left">
                    📧 <strong>Login de Entrada:</strong> {(email.trim() || username.trim()) ? (email.trim().includes("@") ? email.trim() : `${normalizeUserString(email.trim() || username.trim())}@${getAdminDomain(currentUser?.email || "", currentUser?.username || "")}`) : "Digite o usuário para ver o e-mail de acesso."}
                  </p>
                </div>

                {/* Password input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 font-mono mb-1.5 uppercase">Senha de Acesso</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 3 caracteres"
                      className="w-full p-3 pl-11 pr-11 bg-slate-950 border border-slate-850 focus:border-brand-cyan rounded-xl outline-none text-slate-100 text-sm transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Cargo / Tipo de Usuário */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 font-mono mb-1.5 uppercase">Cargo / Função</label>
                  <div className="relative">
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full p-3 bg-slate-950 border border-slate-850 focus:border-brand-cyan rounded-xl outline-none text-slate-100 text-sm transition-all font-sans cursor-pointer"
                    >
                      <option value="atendente">Atendente 🧑‍💼</option>
                      <option value="motoboy">Motoboy 🏍️</option>
                      <option value="administrador">Administrador 🛡️</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">
                    Define as permissões e visualização deste usuário dentro do sistema.
                  </p>
                </div>

                {isEditing && currentUser.id === userId && (
                  <div className="p-3 bg-blue-950/20 rounded-xl border border-blue-900/30 flex items-start gap-2.5 text-xs text-blue-400">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Você está editando o seu próprio usuário. Após salvar, sua sessão ativa será atualizada automaticamente sem desconectar.</span>
                  </div>
                )}

                {/* Action build buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 py-3 border border-slate-800 text-slate-300 bg-transparent hover:bg-slate-900 rounded-xl font-semibold text-sm transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 bg-brand-cyan hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-md shadow-brand-cyan/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {loading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                    <span>{isEditing ? "Salvar Edição" : "Cadastrar"}</span>
                  </button>
                </div>

              </form>
            </div>
          )}

          {/* Guidelines info */}
          <div className="bg-slate-900/40 border border-slate-850/60 p-4 rounded-2xl space-y-2">
            <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-brand-magenta" />
              <span>Diretrizes de Permissões</span>
            </h4>
            <p className="text-[11px] text-slate-450 leading-relaxed">
              Todos os operadores cadastrados compartilham o mesmo banco de dados do Supabase conectado. Eles podem visualizar e registrar receitas, orçamentos e despesas no sistema. O ideal é que cada vendedor use seu próprio usuário para relatórios de vendas futuros.
            </p>
          </div>

        </div>

        {/* Right Side: Registered Users List Table */}
        <div className="w-full lg:w-7/12">
          <div className="bg-brand-card border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/20">
            
            {/* Table Navigation Filters */}
            <div className="p-5 border-b border-slate-850 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-brand-cyan" />
                  <span>Operadores e Usuários Cadastrados</span>
                </h3>
                <p className="text-xs text-slate-400">Total de {users.length} usuários integrados ao sistema</p>
              </div>

              {/* Search Users Input */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome ou login..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-60 p-2 pl-9 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-200 focus:border-brand-cyan outline-none transition-all"
                />
              </div>
            </div>

            {/* Empty View */}
            {filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-slate-550 space-y-2">
                <Users className="h-10 w-10 text-slate-700 mx-auto" />
                <p className="font-medium text-slate-400">Nenhum usuário encontrado</p>
                <p className="text-xs text-slate-500">Cadastre um usuário no painel ao lado para começar.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-850 max-h-[500px] overflow-y-auto">
                {filteredUsers.map((user) => {
                  const isCurrent = user.id === currentUser.id;
                  return (
                    <div 
                      key={user.id} 
                      className={`p-4 hover:bg-slate-900/60 transition-colors flex items-center justify-between gap-4 ${
                        isCurrent ? "bg-brand-cyan/5 border-l-2 border-l-brand-cyan" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center font-bold text-sm text-slate-350 select-none">
                          {user.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase()).join("")}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-white truncate max-w-[160px] sm:max-w-[240px]">{user.name}</h4>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-extrabold uppercase border ${
                              (!user.role || user.role === "atendente")
                                ? "bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20"
                                : user.role === "motoboy"
                                ? "bg-brand-magenta/15 text-brand-magenta border-brand-magenta/20"
                                : "bg-amber-500/10 text-amber-450 border-amber-500/20"
                            }`}>
                              {user.role === "administrador" ? "🛡️ Admin" : user.role === "motoboy" ? "🏍️ Motoboy" : "🧑‍💼 Atendente"}
                            </span>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20">
                                VOCÊ Logado
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-xs text-slate-450 mt-1 font-mono">
                            <span className="truncate">@{user.username}</span>
                            {user.email && (
                              <span className="hidden sm:inline truncate max-w-[185px]">/ &nbsp;{user.email}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons (Edit & Delete with safety confirmations) */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleStartEdit(user)}
                          className="p-2 text-slate-400 hover:text-brand-cyan hover:bg-slate-800 rounded-lg transition-all"
                          title="Editar usuário"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        
                        <button
                          onClick={() => setUserToDelete(user)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-all"
                          title={isCurrent ? "Excluir sua própria conta" : "Remover usuário"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modern Dialog Confirmation Modal for Delete operations */}
      <AnimatePresence>
        {userToDelete && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-brand-card border border-slate-800 p-6 rounded-2xl space-y-6 shadow-2xl"
            >
              <div className="flex items-start gap-3.5">
                <div className="p-3 bg-red-950 text-red-400 rounded-xl border border-red-900/30">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Confirmar Exclusão de Conta</h3>
                  <p className="text-xs text-slate-400 mt-1">Essa operação é irreversível no banco de dados e cortará qualquer acesso futuro com esta login credencial.</p>
                </div>
              </div>

              {/* Warning on self delete */}
              {userToDelete.id === currentUser.id ? (
                <div className="p-4 bg-orange-950/20 border border-orange-900/40 text-orange-400 rounded-xl text-xs space-y-1">
                  <span className="font-bold block">🚨 Atenção Especial:</span>
                  <p>Você selecionou para excluir <strong>SEU PRÓPRIO USUÁRIO ATIVO</strong>. Se você prosseguir, você será desconectado do sistema imediatamente e este login deixará de funcionar.</p>
                </div>
              ) : (
                <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-xl space-y-1 text-xs">
                  <span className="text-slate-500 font-mono">USUÁRIO SELECIONADO:</span>
                  <div className="text-slate-200 font-bold">{userToDelete.name}</div>
                  <div className="text-slate-400 font-mono">@{userToDelete.username}</div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setUserToDelete(null)}
                  className="flex-grow py-3 border border-slate-800 text-slate-300 hover:bg-slate-900 rounded-xl text-sm font-semibold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={loading}
                  className="flex-grow py-3 bg-gradient-to-r from-red-500 to-red-650 hover:from-red-600 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-red-500/10 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-red-200" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-red-100" />
                  )}
                  <span>Confirmar Exclusão</span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
