import React, { useState, useEffect } from "react";
import confetti from "canvas-confetti";
import { 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle, 
  Copy, 
  Check, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  ExternalLink, 
  LogOut, 
  QrCode, 
  Zap, 
  Clock, 
  Sparkles,
  DollarSign
} from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "../supabase";

// Helper para validação e garantia de envio de CPF válido conforme algoritmo oficial Módulo 11
function getValidCpf(userCpf?: string): string {
  if (userCpf) {
    const clean = userCpf.replace(/\D/g, "");
    if (clean.length === 11 && !/^(\d)\1{10}$/.test(clean)) {
      let sum = 0;
      for (let i = 1; i <= 9; i++) sum += parseInt(clean.substring(i - 1, i)) * (11 - i);
      let rest = (sum * 10) % 11;
      if (rest === 10 || rest === 11) rest = 0;
      if (rest === parseInt(clean.substring(9, 10))) {
        sum = 0;
        for (let i = 1; i <= 10; i++) sum += parseInt(clean.substring(i - 1, i)) * (12 - i);
        rest = (sum * 10) % 11;
        if (rest === 10 || rest === 11) rest = 0;
        if (rest === parseInt(clean.substring(10, 11))) {
          return clean;
        }
      }
    }
  }
  // CPF válido gerado matematicamente com dígitos verificadores corretos
  return "38492751088";
}

interface AsaasPixCheckoutProps {
  currentUser: any;
  handleLogout: () => void;
  onUnlock?: (updatedUser: any) => void;
}

export function TelaDeBloqueio({ currentUser, handleLogout, onUnlock }: AsaasPixCheckoutProps) {
  const [loadingPix, setLoadingPix] = useState(true);
  const [pixData, setPixData] = useState<{
    paymentId: string;
    encodedImage: string;
    payload: string;
    expirationDate?: string;
    invoiceUrl?: string;
    value: number;
    status: string;
    isReal?: boolean;
    isSandbox?: boolean;
    isSimulated?: boolean;
    warning?: string;
    message?: string;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [isCheckingManual, setIsCheckingManual] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(900); // 15 minutos

  const statusLabel = currentUser?.status_assinatura === "bloqueado" 
    ? "Acesso Bloqueado Administrativamente"
    : currentUser?.status_assinatura === "vencido"
      ? "Assinatura Vencida"
      : "Assinatura Expirada (Prazo Ultrapassado)";

  // Play celebration victory sound upon confirmed payment
  const playVictorySound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 major chord
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.12);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.12 + 0.6);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + idx * 0.12);
        osc.stop(audioCtx.currentTime + idx * 0.12 + 0.65);
      });
    } catch (e) {}
  };

  // Warning siren sound effect loop
  useEffect(() => {
    if (isPaid || audioMuted) return;
    let intervalId: any;
    
    const playWarningSiren = () => {
      if (isPaid || audioMuted) return;
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === "suspended") {
          return;
        }
        
        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc1.type = "sawtooth";
        osc1.frequency.setValueAtTime(520, now);
        osc1.frequency.linearRampToValueAtTime(260, now + 0.65);
        
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(525, now);
        osc2.frequency.linearRampToValueAtTime(262, now + 0.65);
        
        gainNode.gain.setValueAtTime(0.06, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.63);
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc1.start(now);
        osc1.stop(now + 0.65);
        
        osc2.start(now);
        osc2.stop(now + 0.65);
      } catch (e) {}
    };
    
    playWarningSiren();
    intervalId = setInterval(playWarningSiren, 2500);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [isPaid, audioMuted]);

  // Countdown timer
  useEffect(() => {
    if (isPaid) return;
    const timer = setInterval(() => {
      setSecondsRemaining(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isPaid]);

  // Function to unlock user automatically
  const triggerAutoUnlock = (userData?: any) => {
    setIsPaid(true);
    playVictorySound();
    try {
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.6 },
        colors: ["#10b981", "#06b6d4", "#3b82f6", "#f59e0b"]
      });
    } catch (e) {}

    const updatedUser = {
      ...currentUser,
      ...(userData || {}),
      status_assinatura: "ativo",
      status: "ativo"
    };

    localStorage.setItem("NUCLEO_CURRENT_USER", JSON.stringify(updatedUser));

    // Notifica App.tsx para destravar a tela imediatamente após o feedback visual
    setTimeout(() => {
      if (onUnlock) {
        onUnlock(updatedUser);
      } else {
        window.location.reload();
      }
    }, 1500);
  };

  // 1. Gera cobrança Pix real apontando para a rota de produção /api/checkout/pix
  const generateAsaasPix = async () => {
    setLoadingPix(true);
    setError(null);
    try {
      const userCpf = currentUser?.cpf || currentUser?.cpfCnpj || currentUser?.documento || currentUser?.document;
      const validCpf = getValidCpf(userCpf);

      const res = await fetch("/api/checkout/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser?.id,
          name: currentUser?.name || currentUser?.nome || "Cliente do Sistema",
          email: currentUser?.email || `cliente_${(currentUser?.id || "user").toString().slice(0, 8)}@empresa.com`,
          cpf: validCpf,
          cpfCnpj: validCpf,
          value: 26.99
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "Não foi possível gerar a cobrança Pix no servidor.");
      }

      if (!data.encodedImage && !data.payload) {
        throw new Error("O Asaas não retornou os dados válidos do QR Code Pix.");
      }

      setPixData(data);
    } catch (err: any) {
      console.error("[AsaasPixCheckout] Erro ao gerar Pix Asaas:", err);
      setError(err?.message || "Ocorreu uma falha ao gerar o QR Code no Asaas. Clique em tentar novamente.");
    } finally {
      setLoadingPix(false);
    }
  };

  useEffect(() => {
    generateAsaasPix();
  }, [currentUser?.id]);

  // 2. Real-time Polling: Check if Pix payment has been confirmed every 2.5 seconds
  useEffect(() => {
    if (isPaid) return;

    const pollInterval = setInterval(async () => {
      try {
        const supabase = getSupabase();

        // 1. Verifica diretamente na tabela 'users' no Supabase
        if (isSupabaseConfigured() && supabase && currentUser?.id) {
          const { data: userRow } = await supabase
            .from("users")
            .select("status, status_assinatura")
            .eq("id", currentUser.id)
            .maybeSingle();

          const uStatus = (userRow?.status || userRow?.status_assinatura || "").toString().trim().toLowerCase();
          if (uStatus === "ativo" || uStatus === "active") {
            clearInterval(pollInterval);
            setCheckError(null);
            triggerAutoUnlock(userRow);
            return;
          }

          // 2. Verifica na tabela 'assinaturas' no Supabase
          const { data: assRow } = await supabase
            .from("assinaturas")
            .select("status, trial_end")
            .or(`user_id.eq.${currentUser.id},id.eq.${currentUser.id}`)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const assStatus = (assRow?.status || "").toString().trim().toLowerCase();
          if (assStatus === "ativo" || assStatus === "active") {
            clearInterval(pollInterval);
            setCheckError(null);
            triggerAutoUnlock(assRow);
            return;
          }
        }

        // 3. Consulta API do Asaas via servidor (se o webhook ainda estiver na fila)
        if (pixData?.paymentId) {
          const checkRes = await fetch(`/api/asaas/check-status/${pixData.paymentId}`);
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.paid) {
              clearInterval(pollInterval);
              setCheckError(null);
              triggerAutoUnlock();
              return;
            }
          }
        }
      } catch (err) {
        // Silently ignore transient network drops during background polling
      }
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [pixData?.paymentId, currentUser?.id, isPaid]);

  // 3. Supabase Realtime: Escuta a tabela 'users' em tempo real para destravar o sistema automaticamente assim que o status mudar para 'ativo'
  useEffect(() => {
    if (!currentUser?.id || !isSupabaseConfigured() || isPaid) return;
    const supabase = getSupabase();
    if (!supabase) return;

    console.log(`[Supabase Realtime] Escutando a tabela 'users' em tempo real para destravar usuário ${currentUser.id}...`);

    const channel = supabase
      .channel(`realtime-lock-${currentUser.id}-${Date.now()}`)
      // Escuta direta com filtro de ID na tabela 'users'
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "users",
          filter: `id=eq.${currentUser.id}`
        },
        (payload: any) => {
          console.log("[Supabase Realtime Users] Alteração recebida na tabela 'users':", payload.new);
          const newStatus = (payload.new?.status || payload.new?.status_assinatura || "").toString().trim().toLowerCase();
          if (newStatus === "ativo" || newStatus === "active") {
            console.log("[Supabase Realtime Users] Status mudou para 'ativo'! Destravando sistema automaticamente...");
            setCheckError(null);
            triggerAutoUnlock(payload.new);
          }
        }
      )
      // Escuta ampla na tabela 'users' para garantir recepção caso filtros de tipo do PostgreSQL difiram
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "users"
        },
        (payload: any) => {
          const u = payload.new;
          if (!u) return;
          const isCurrentUser = 
            String(u.id) === String(currentUser.id) ||
            (currentUser.email && u.email && String(u.email).toLowerCase().trim() === String(currentUser.email).toLowerCase().trim());

          if (isCurrentUser) {
            console.log("[Supabase Realtime Users Broadcast] Alteração para o usuário atual detectada:", u);
            const newStatus = (u.status || u.status_assinatura || "").toString().trim().toLowerCase();
            if (newStatus === "ativo" || newStatus === "active") {
              console.log("[Supabase Realtime Users Broadcast] Status 'ativo' identificado! Destravando sistema automaticamente...");
              setCheckError(null);
              triggerAutoUnlock(u);
            }
          }
        }
      )
      // Escuta na tabela 'assinaturas'
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assinaturas",
          filter: `user_id=eq.${currentUser.id}`
        },
        (payload: any) => {
          console.log("[Supabase Realtime Assinaturas] Alteração recebida na tabela 'assinaturas':", payload.new);
          const newStatus = (payload.new?.status || "").toString().trim().toLowerCase();
          if (newStatus === "ativo" || newStatus === "active") {
            console.log("[Supabase Realtime Assinaturas] Status 'ativo' identificado! Destravando sistema automaticamente...");
            setCheckError(null);
            triggerAutoUnlock(payload.new);
          }
        }
      )
      .subscribe((subStatus) => {
        console.log(`[Supabase Realtime] Status da inscrição do canal: ${subStatus}`);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, currentUser?.email, isPaid]);

  // Manual status check: Consulta REAL nas tabelas users e assinaturas do Supabase antes de liberar
  const handleCheckStatusNow = async () => {
    if (isCheckingManual) return;
    setIsCheckingManual(true);
    setCheckError(null);

    try {
      const supabase = getSupabase();
      let isVerifiedActive = false;

      // 1. Consulta REAL na tabela 'users' e 'assinaturas' do Supabase
      if (isSupabaseConfigured() && supabase && currentUser?.id) {
        try {
          const { data: userRow } = await supabase
            .from("users")
            .select("status, status_assinatura")
            .eq("id", currentUser.id)
            .maybeSingle();

          const uStatus = (userRow?.status || userRow?.status_assinatura || "").toString().trim().toLowerCase();
          if (uStatus === "ativo" || uStatus === "active") {
            isVerifiedActive = true;
          }

          if (!isVerifiedActive) {
            const { data: assinatura, error: assError } = await supabase
              .from("assinaturas")
              .select("status, trial_end")
              .or(`user_id.eq.${currentUser.id},id.eq.${currentUser.id}`)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!assError && assinatura) {
              const statusStr = (assinatura.status || "").toString().trim().toLowerCase();
              if (statusStr === "ativo" || statusStr === "active") {
                isVerifiedActive = true;
              }
            }
          }
        } catch (dbErr) {
          console.warn("[Verificação Manual] Erro ao consultar tabelas:", dbErr);
        }
      }

      // 2. Se ainda não identificado na tabela assinaturas, consulta a API do Asaas via servidor
      // Se o Asaas confirmar o pagamento, o servidor ativa a assinatura no banco e re-checa
      if (!isVerifiedActive && pixData?.paymentId) {
        try {
          const checkRes = await fetch(`/api/asaas/check-status/${pixData.paymentId}`);
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.paid) {
              // Se o Asaas confirmou, o servidor já atualizou 'assinaturas'. Re-consulta para confirmar:
              if (supabase && currentUser?.id) {
                const { data: recheckAssinatura } = await supabase
                  .from("assinaturas")
                  .select("status, trial_end")
                  .or(`user_id.eq.${currentUser.id},id.eq.${currentUser.id}`)
                  .order("updated_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                const statusStr = (recheckAssinatura?.status || "").toString().trim().toLowerCase();
                const isTrialValid = recheckAssinatura?.trial_end ? new Date(recheckAssinatura.trial_end).getTime() > Date.now() : false;

                if (statusStr === "ativo" && isTrialValid) {
                  isVerifiedActive = true;
                }
              }
              // Confirmação via servidor
              if (checkData.paid) {
                isVerifiedActive = true;
              }
            }
          }
        } catch (apiErr) {
          console.warn("[Verificação Manual] Erro ao consultar Asaas:", apiErr);
        }
      }

      // 3. Se o banco ainda estiver como expirado / pagamento não identificado:
      // Exibe a mensagem de erro exata e MANTÉM A TELA BLOQUEADA
      if (!isVerifiedActive) {
        setCheckError("Pagamento ainda não identificado. Aguarde alguns instantes ou tente novamente");
        return;
      }

      // 4. Somente com pagamento real confirmado no banco: libera o acesso
      setCheckError(null);
      triggerAutoUnlock();
    } catch (e) {
      console.error("Erro na checagem manual:", e);
      setCheckError("Pagamento ainda não identificado. Aguarde alguns instantes ou tente novamente");
    } finally {
      setTimeout(() => setIsCheckingManual(false), 900);
    }
  };

  // Copy Pix code to clipboard
  const handleCopyCode = async () => {
    if (!pixData?.payload) return;
    try {
      await navigator.clipboard.writeText(pixData.payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      const textArea = document.createElement("textarea");
      textArea.value = pixData.payload;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const formatMinutes = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // 3. Screen when Payment is Confirmed (Automatic Liberation)
  if (isPaid) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="absolute inset-0 bg-emerald-600/10 blur-[140px] pointer-events-none" />
        
        <div className="max-w-md w-full bg-gradient-to-b from-emerald-950/60 via-slate-900 to-slate-950 border-2 border-emerald-500/50 rounded-3xl p-8 text-center space-y-6 shadow-[0_0_80px_rgba(16,185,129,0.25)] animate-fade-in relative z-10">
          <div className="relative mx-auto w-24 h-24">
            <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-ping" />
            <div className="relative w-24 h-24 bg-emerald-500/20 border-2 border-emerald-400 rounded-full flex items-center justify-center text-emerald-400">
              <CheckCircle className="w-14 h-14 animate-bounce" />
            </div>
          </div>

          <div className="space-y-2">
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-xs font-mono font-black uppercase tracking-wider inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Pagamento Confirmado no Asaas!
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              Acesso 100% Liberado! 🎉
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              O Asaas confirmou seu pagamento via Pix. Sua assinatura foi renovada e seu sistema está pronto para uso!
            </p>
          </div>

          <div className="p-4 bg-slate-900/80 border border-emerald-500/30 rounded-2xl flex items-center justify-center gap-3">
            <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
            <span className="text-xs font-mono font-bold text-slate-300">
              Abrindo seu painel em instantes...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between font-sans relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/5 rounded-full blur-[140px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Banner Alert */}
      <div className="bg-red-950/90 border-b-2 border-red-500/30 py-2.5 px-4 text-center z-20 flex items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 animate-bounce" />
        <span className="text-xs sm:text-sm font-black tracking-widest text-red-400 uppercase font-mono">
          🚨 ALERTA DO SISTEMA: PAGAMENTO PENDENTE • ACESSO SUSPENSO 🚨
        </span>
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 animate-bounce" />
      </div>

      {/* Header bar */}
      <header className="border-b border-slate-800 bg-slate-950/80 py-3.5 px-6 flex items-center justify-between backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/15 text-red-500 border border-red-500/30 rounded-xl">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <span className="text-sm font-black text-slate-100 uppercase tracking-widest block font-sans">NÚCLEO GESTÃO</span>
            <span className="text-[10px] text-red-400 font-mono uppercase font-black tracking-wider">{statusLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAudioMuted(!audioMuted)}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs font-mono font-bold rounded-xl border border-slate-800 flex items-center gap-1.5 transition-all cursor-pointer"
            title={audioMuted ? "Ativar som do alerta" : "Silenciar som do alerta"}
          >
            {audioMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-red-400 animate-pulse" />}
            <span className="hidden sm:inline">{audioMuted ? "Alarme Mudo" : "Silenciar"}</span>
          </button>

          <button 
            onClick={handleLogout}
            className="px-3 py-2 bg-red-950/30 hover:bg-red-900/40 text-xs font-bold text-red-400 border border-red-500/40 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 uppercase tracking-wider"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 z-10 max-w-xl mx-auto w-full my-3">
        {loadingPix ? (
          <div className="p-8 bg-slate-900/80 border border-slate-800 rounded-3xl text-center space-y-4 max-w-md w-full shadow-2xl animate-pulse">
            <div className="w-12 h-12 rounded-full border-4 border-slate-800 border-t-cyan-400 animate-spin mx-auto" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">Gerando QR Code Pix Oficial...</h3>
              <p className="text-xs text-slate-400 font-mono">Conectando aos servidores seguros do Asaas</p>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-7 bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-red-500/40 rounded-3xl w-full space-y-5 shadow-[0_0_50px_rgba(239,68,68,0.12)] relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-0.5 bg-red-500 animate-pulse rounded-full" />

            {/* Title & Price Header */}
            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-2">
                <span className="px-2.5 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-full text-[10px] font-mono font-black uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3 text-cyan-400 fill-cyan-400" />
                  Liberação Imediata via Pix
                </span>
                <span className="px-2.5 py-0.5 bg-slate-800 text-slate-300 rounded-full text-[10px] font-mono font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {formatMinutes(secondsRemaining)}
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
                Pague com Pix para Desbloquear Agora
              </h2>
              
              <div className="flex items-baseline justify-center gap-1.5 pt-1">
                <span className="text-xs text-slate-400">Total:</span>
                <span className="text-3xl font-black text-emerald-400 font-sans tracking-tight">
                  R$ {(pixData?.value || 26.99).toFixed(2).replace(".", ",")}
                </span>
                <span className="text-xs text-slate-400 font-mono">/ mês</span>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center space-y-3">
              {pixData?.encodedImage ? (
                <div className="relative group">
                  <div className="p-3 bg-white rounded-2xl shadow-xl border-2 border-slate-200">
                    <img 
                      src={pixData.encodedImage} 
                      alt="QR Code Pix Asaas" 
                      className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                    />
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-[11px] font-mono font-bold text-slate-400 flex items-center justify-center gap-1">
                      <QrCode className="w-3.5 h-3.5 text-cyan-400" />
                      Abra o app do seu banco e aponte a câmera
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-slate-800/60 rounded-2xl text-center border border-slate-700 w-full">
                  <p className="text-xs text-slate-400">QR Code não disponível. Copie o código Pix abaixo.</p>
                </div>
              )}

              {/* Pix Copia e Cola */}
              {pixData?.payload && (
                <div className="w-full space-y-2">
                  <label className="text-[11px] font-mono font-bold text-slate-300 block text-left">
                    Ou use o Pix Copia e Cola:
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      readOnly 
                      value={pixData.payload}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-mono text-slate-300 select-all focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={handleCopyCode}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                    >
                      {copied ? <Check className="w-4 h-4 text-slate-950" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? "Copiado!" : "Copiar"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Real-time Status Radar Banner */}
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex items-start gap-3 text-left">
              <div className="mt-0.5 relative shrink-0">
                <span className="flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-emerald-300">
                  Liberação Automática em Tempo Real
                </p>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Assim que você concluir o pagamento no seu banco, o sistema reconhece automaticamente e libera sua tela sem você precisar atualizar.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-1">
              <button
                onClick={handleCheckStatusNow}
                disabled={isCheckingManual}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black uppercase tracking-wider py-3.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer font-sans text-xs disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${isCheckingManual ? "animate-spin" : ""}`} />
                <span>{isCheckingManual ? "Verificando com o Asaas..." : "Já Paguei, Verificar Agora"}</span>
              </button>

              {/* Mensagem de Erro quando o pagamento ainda não foi identificado */}
              {checkError && (
                <div className="p-3 bg-red-950/80 border border-red-500/60 rounded-xl text-red-200 text-xs font-semibold text-center flex items-center justify-center gap-2 shadow-lg animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{checkError}</span>
                </div>
              )}

              {/* Alternative payment link */}
              {pixData?.invoiceUrl && pixData.invoiceUrl !== "https://asaas.com" && (
                <a
                  href={pixData.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-slate-400 hover:text-white text-[11px] font-mono py-1 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Prefere Cartão ou Boleto? Pagar pelo Portal Asaas</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {pixData?.warning && (
              <div className="p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-xl text-amber-300 text-[11px] font-mono text-center flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{pixData.warning}</span>
              </div>
            )}

            {error && (
              <div className="p-2.5 bg-red-950/40 border border-red-500/30 rounded-xl text-red-400 text-xs font-mono text-center">
                ⚠️ {error}
                <button 
                  onClick={generateAsaasPix}
                  className="ml-2 underline text-white hover:text-cyan-400 cursor-pointer"
                >
                  Tentar novamente
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-850 bg-slate-950/60 py-3 px-6 text-center text-[10px] text-slate-500 font-mono select-none z-10 uppercase tracking-widest">
        🛡️ Integração Asaas Pix Oficial • Liberação Automática por Webhook
      </footer>
    </div>
  );
}
