import React, { useState, useEffect } from "react";
import { ShieldAlert, KeyRound, CheckCircle, AlertCircle, X, RefreshCw } from "lucide-react";
import { User } from "../types";
import { isSupabaseConfigured, dbGetUsers } from "../supabase";
import { motion, AnimatePresence } from "motion/react";

interface AdminUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser: User | null;
  message?: string;
}

export function AdminUnlockModal({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  message = "Esta operação ou área exige autorização do Administrador."
}: AdminUnlockModalProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setError(null);
      loadAdministrators();
    }
  }, [isOpen]);

  const loadAdministrators = async () => {
    setLoading(true);
    let allUsers: User[] = [];

    // Fallback load local NUCLEO_USERS
    try {
      const saved = localStorage.getItem("NUCLEO_USERS");
      if (saved) {
        allUsers = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse local users", e);
    }

    // Default admin account in local fallback
    const defaultAdmin: User = {
      id: "demo-admin",
      username: "admin",
      name: "Administrador (Padrão)",
      email: "vendas.impactodigital2@gmail.com",
      password: "123"
    };

    if (allUsers.length === 0) {
      allUsers = [defaultAdmin];
    } else if (!allUsers.some(u => u.username === "admin" || !u.owner_id)) {
      allUsers = [defaultAdmin, ...allUsers];
    }

    if (isSupabaseConfigured() && currentUser) {
      try {
        const dbUsers = await dbGetUsers(currentUser.id);
        if (dbUsers && dbUsers.length > 0) {
          // Merge db users
          dbUsers.forEach(dbU => {
            if (!allUsers.some(u => u.id === dbU.id)) {
              allUsers.push(dbU);
            }
          });
        }
      } catch (err) {
        console.warn("Could not load users database, relying on local storage sync", err);
      }
    }

    // Filter master user (Administrators):
    // Standard rule: owner_id is empty, or equals their own ID, or is "demo-admin".
    // Or if the logged in user is an attendant, their owner_id points to their administrator.
    const admins = allUsers.filter(u => {
      // Is an administrator if:
      const hasNoOwnerId = !u.owner_id || u.owner_id.trim() === "" || u.owner_id === u.id;
      const isAttendantsOwner = currentUser?.owner_id ? u.id === currentUser.owner_id : false;
      const isDefault = u.id === "demo-admin";

      return hasNoOwnerId || isAttendantsOwner || isDefault;
    });

    setAdminUsers(admins);

    // Prepopulate selected admin
    if (currentUser?.owner_id) {
      const match = admins.find(a => a.id === currentUser.owner_id);
      if (match) {
        setSelectedAdminId(match.id);
      } else if (admins.length > 0) {
        setSelectedAdminId(admins[0].id);
      }
    } else if (admins.length > 0) {
      setSelectedAdminId(admins[0].id);
    }
    setLoading(false);
  };

  const handleAuthorize = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedAdminId) {
      setError("Nenhum administrador encontrado para autorização.");
      return;
    }

    if (!password) {
      setError("Por favor, preencha a senha.");
      return;
    }

    const selectedAdmin = adminUsers.find(a => a.id === selectedAdminId);
    if (!selectedAdmin) {
      setError("Administrador selecionado inválido.");
      return;
    }

    // Verify Password
    const bypassParts = currentUser?.password ? currentUser.password.split("::") : [""];
    const myBypassPassword = bypassParts[1] || "";
    
    const adminParts = selectedAdmin.password ? selectedAdmin.password.split("::") : [""];
    const adminMainPassword = adminParts[0] || "";

    const isMatch = 
      selectedAdmin.password === password || 
      adminMainPassword === password || 
      (myBypassPassword && password === myBypassPassword);

    if (isMatch) {
      setPassword("");
      onSuccess();
      onClose();
    } else {
      setError("Senha incorreta de Administrador ou de Liberação Supervisora.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-brand-card border border-slate-800 p-6 rounded-2xl space-y-5 shadow-2xl relative select-none"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-brand-magenta/10 text-brand-magenta rounded-xl border border-brand-magenta/25 shrink-0">
            <ShieldAlert className="h-6 w-6 text-brand-magenta" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">Autorização Requerida</h3>
            <p className="text-xs text-slate-450 mt-1">{message}</p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-405 font-medium text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleAuthorize} className="space-y-4">
          {/* Admin Account Selection */}
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
              Administrador Responsável
            </label>
            {loading ? (
              <div className="w-full bg-slate-950 border border-slate-850 rounded-xl py-2.5 px-3 outline-none text-slate-100 text-xs flex items-center gap-2">
                <RefreshCw className="h-3 w-3 animate-spin text-brand-magenta" />
                <span>Carregando administradores...</span>
              </div>
            ) : (
              <select
                value={selectedAdminId}
                onChange={(e) => setSelectedAdminId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 focus:border-brand-magenta rounded-xl py-2.5 px-3 outline-none text-slate-105 text-xs transition-all font-bold"
              >
                {adminUsers.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} (@{a.username})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Admin Password */}
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
              Senha do Administrador
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <KeyRound className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Insira a senha do administrador"
                className="w-full bg-slate-950 font-medium text-slate-100 placeholder-slate-650 text-sm border border-slate-850 rounded-xl py-2.5 pl-10 pr-4 outline-none focus:border-brand-magenta transition-colors font-mono"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-800 text-slate-300 hover:bg-slate-900 rounded-xl font-bold text-xs transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-brand-magenta hover:brightness-110 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-brand-magenta/20 flex items-center justify-center gap-1.5"
            >
              <KeyRound className="h-4 w-4 text-white shrink-0" />
              <span>Autorizar Entrada</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
