import React, { useState } from "react";
import { 
  ShieldAlert, 
  MessageCircle, 
  LogOut, 
  Copy, 
  Check, 
  QrCode, 
  Lock, 
  User as UserIcon,
  Sparkles,
  ExternalLink,
  Zap
} from "lucide-react";
import { User } from "../types";

interface TelaAcessoSuspensoProps {
  currentUser: User | null;
  onLogout: () => void;
  supportPhone?: string;
  pixKey?: string;
}

export function TelaAcessoSuspenso({
  currentUser,
  onLogout,
  supportPhone = "5511999999999",
  pixKey
}: TelaAcessoSuspensoProps) {
  const [copiedKey, setCopiedKey] = useState(false);

  // Formata o número de WhatsApp para link internacional
  const cleanPhone = (supportPhone || "5511999999999").replace(/\D/g, "");
  const destinationPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

  const userName = currentUser?.name || currentUser?.username || "Cliente";
  const userEmail = currentUser?.email || "Sem e-mail";

  const messageText = `Olá! Meu acesso ao sistema está suspenso por mensalidade/teste expirado (Acesso Suspenso - Pagamento Pendente).\n\nGostaria de regularizar meu pagamento via PIX para reativação imediata da minha conta.\n\n👤 Usuário: ${userName}\n📧 E-mail: ${userEmail}`;
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${destinationPhone}&text=${encodeURIComponent(messageText)}`;

  const fallbackPixKey = pixKey || "financeiro.nexvolt@gmail.com";

  const handleCopyPix = () => {
    navigator.clipboard.writeText(fallbackPixKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleOpenWhatsApp = () => {
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 font-sans flex flex-col justify-between relative overflow-hidden select-none">
      {/* Luzes de fundo atmosféricas */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[250px] bg-amber-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Topo simples */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md py-3 px-4 sm:px-8 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <span className="text-xs font-black tracking-widest uppercase text-white font-mono">
              NEXVOLT SISTEMA
            </span>
            <span className="block text-[10px] text-red-400 font-bold uppercase tracking-wider">
              Acesso Bloqueado
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer shadow-sm"
          title="Encerrar sessão e sair da conta"
        >
          <LogOut className="h-3.5 w-3.5 text-red-400" />
          <span>Sair da Conta</span>
        </button>
      </header>

      {/* Conteúdo Central: Card Principal de Suspensão */}
      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 z-10">
        <div className="max-w-xl w-full bg-slate-900/90 border-2 border-red-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(239,68,68,0.15)] backdrop-blur-xl space-y-6 text-center relative animate-fade-in">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent rounded-full" />

          {/* Ícone Pulsante de Alerta */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/20">
                <ShieldAlert className="h-8 w-8 animate-pulse" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-500 border-2 border-slate-900 flex items-center justify-center text-slate-950 font-black text-[10px]">
                !
              </div>
            </div>
          </div>

          {/* Título e Mensagem Clara de Suspensão */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] font-black uppercase tracking-wider">
              <Lock className="w-3 h-3" />
              <span>Acesso Suspenso - Pagamento Pendente</span>
            </div>
            
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Sua conta está temporariamente bloqueada
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
              O acesso operacional a todas as funcionalidades do sistema (PDV, Vendas, Caixa, Produtos, Clientes e Configurações) foi suspenso devido à expiração da mensalidade ou do período de testes.
            </p>
          </div>

          {/* Dados do Usuário / Conta */}
          <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 text-left space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono border-b border-slate-850 pb-1.5 flex items-center justify-between">
              <span>Identificação do Acesso</span>
              <span className="text-red-400 font-bold">Status: Bloqueado</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Usuário:</span>
                <span className="font-bold text-slate-200">{userName}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">E-mail Registrado:</span>
                <span className="font-bold text-slate-200 truncate block">{userEmail}</span>
              </div>
            </div>
          </div>

          {/* Ações de Regularização */}
          <div className="space-y-3 pt-1">
            {/* BOTÃO PRINCIPAL: REGULARIZAÇÃO VIA WHATSAPP COM PIX */}
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm uppercase tracking-wider transition-all duration-200 shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2.5 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
            >
              <MessageCircle className="h-5 w-5 fill-slate-950 stroke-emerald-500" />
              <span>Regularizar via WhatsApp (Chave PIX Imediata)</span>
              <ExternalLink className="h-4 w-4" />
            </button>

            {/* Chave PIX Rápida Copia e Cola Opcional */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  <span>Chave PIX Oficial para Regularização:</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">E-mail</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={fallbackPixKey}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyPix}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border border-slate-700"
                  title="Copiar Chave PIX"
                >
                  {copiedKey ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey ? "Copiado!" : "Copiar"}</span>
                </button>
              </div>
            </div>

            {/* BOTÃO SECUNDÁRIO: SAIR DA CONTA (LIMPA LOCALSTORAGE) */}
            <button
              type="button"
              onClick={onLogout}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-800 hover:border-red-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sair da Conta (Desconectar)</span>
            </button>
          </div>
        </div>
      </main>

      {/* Rodapé Informativo */}
      <footer className="border-t border-slate-850/60 bg-slate-950/60 py-3 px-4 text-center text-[10px] text-slate-500 font-mono z-10">
        🛡️ Sistema com bloqueio de integridade ativo • Regularize seu plano para liberação instantânea
      </footer>
    </div>
  );
}

export default TelaAcessoSuspenso;
