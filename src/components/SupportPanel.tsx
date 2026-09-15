import React, { useEffect, useState, useRef } from "react";
import { 
  Mic, 
  Square, 
  Play, 
  Send, 
  Clock, 
  MessageSquare, 
  AlertCircle, 
  CheckCircle2, 
  Volume2, 
  VolumeX, 
  HelpCircle, 
  RefreshCw, 
  Lock,
  Calendar,
  Settings,
  ShieldAlert,
  UserCheck,
  Image as ImageIcon,
  Plus,
  Trash2,
  ArrowLeft,
  UploadCloud,
  X,
  FileText
} from "lucide-react";
import { User, SupportFeedback, SupportConfig } from "../types";
import { 
  dbGetSupportConfig, 
  dbGetSupportFeedbacks, 
  dbSaveSupportFeedback, 
  dbUploadSupportAudio,
  dbUploadSupportImage,
  dbSaveSupportConfig,
  dbSubmitAdminResponse
} from "../supabase";

interface SupportPanelProps {
  currentUser: User;
  addToast: (message: string, type: "success" | "error" | "info" | "warning") => void;
}

export function SupportPanel({ currentUser, addToast }: SupportPanelProps) {
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [feedbacks, setFeedbacks] = useState<SupportFeedback[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Layout state for clients
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [subject, setSubject] = useState("");

  // Admin States
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<Record<string, boolean>>({});
  const [feedbackFilter, setFeedbackFilter] = useState<"unanswered" | "all">("unanswered");
  
  // Support Config Editing States
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("19:00");
  const [closedMsg, setClosedMsg] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  // Image Upload State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Lightbox Modal State for viewing attachments full-size
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  
  // Support Mode Selection ("audio" | "text" | "image")
  const [supportMode, setSupportMode] = useState<"text" | "audio" | "image">("text");
  const [writtenMessage, setWrittenMessage] = useState("");
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Compute isAdmin status exactly matching App.tsx
  const isAdmin = currentUser && (
    currentUser.role === "admin" ||
    currentUser.role === "administrador" ||
    currentUser.role === "adm" ||
    currentUser.is_admin === true ||
    !currentUser.owner_id ||
    currentUser.owner_id === currentUser.id ||
    currentUser.email === "vendas.impactodigital2@gmail.com" ||
    currentUser.email === "sistemavendaadm@gmail.com" ||
    currentUser.email === "sistemadevendaadm@gmail.com"
  );

  // Identify who is allowed to edit Support Hours Configuration (Strictly sistemadevendaadm@gmail.com as requested)
  const isSuperAdmin = currentUser?.email === "sistemadevendaadm@gmail.com";

  // Generate a beautiful, identifiable name format including the user's email
  const userDisplayName = currentUser.email 
    ? `${currentUser.name || currentUser.username || "Cliente"} (${currentUser.email})` 
    : (currentUser.name || currentUser.username || "Cliente");

  // Parse custom subject formatting from feedback message
  const parseFeedback = (item: SupportFeedback) => {
    const msg = item.message || "";
    let parsedSubject = "Solicitação de Suporte";
    let parsedBody = msg;

    if (msg.startsWith("Assunto: ")) {
      const separator = "\n\nMensagem: ";
      const index = msg.indexOf(separator);
      if (index !== -1) {
        parsedSubject = msg.substring(9, index).trim();
        parsedBody = msg.substring(index + separator.length).trim();
      } else {
        const lines = msg.split("\n");
        parsedSubject = lines[0].substring(9).trim();
        parsedBody = lines.slice(1).join("\n").trim();
      }
    }
    return { subject: parsedSubject, body: parsedBody };
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        addToast("Por favor, selecione um arquivo de imagem válido.", "warning");
        return;
      }
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreviewUrl(url);
    }
  };

  const handleDiscardImage = () => {
    setImageFile(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl(null);
  };

  const handleSendFeedback = async () => {
    const trimmedSubject = subject.trim();
    if (!trimmedSubject) {
      addToast("Por favor, informe o assunto da mensagem.", "warning");
      return;
    }

    const supportCheck = isSupportOpenNow();
    if (!supportCheck.open && config && !isAdmin) {
      addToast(`Suporte Fechado. Horário de atendimento é das ${config.horario_inicio} às ${config.horario_fim}.`, "warning");
      return;
    }

    setSubmitting(true);
    addToast("Enviando solicitação ao suporte...", "info");

    try {
      let finalFileUrl = "text";
      let formattedMsg = `Assunto: ${trimmedSubject}\n\nMensagem: ${writtenMessage.trim() || "Solicitação enviada."}`;

      if (supportMode === "image" && imageFile) {
        // Upload Image
        const uploadedUrl = await dbUploadSupportImage(imageFile);
        if (!uploadedUrl) {
          addToast("Falha ao enviar arquivo de imagem.", "error");
          setSubmitting(false);
          return;
        }
        finalFileUrl = uploadedUrl;
        formattedMsg = `Assunto: ${trimmedSubject}\n\nMensagem: Imagem enviada em anexo. ${writtenMessage.trim() ? `\nObservação: ${writtenMessage.trim()}` : ""}`;
      } else if (supportMode === "audio" && audioBlob) {
        // Upload Audio
        const uploadedUrl = await dbUploadSupportAudio(audioBlob);
        if (!uploadedUrl) {
          addToast("Falha ao enviar arquivo de áudio.", "error");
          setSubmitting(false);
          return;
        }
        finalFileUrl = uploadedUrl;
        formattedMsg = `Assunto: ${trimmedSubject}\n\nMensagem: Mensagem de voz enviada em anexo.`;
      } else if (supportMode === "text") {
        if (!writtenMessage.trim()) {
          addToast("Por favor, digite a mensagem de texto.", "warning");
          setSubmitting(false);
          return;
        }
        finalFileUrl = `text:${writtenMessage.trim()}`;
      }

      // Save feedback
      const saved = await dbSaveSupportFeedback(
        currentUser.id, 
        userDisplayName, 
        finalFileUrl,
        formattedMsg
      );

      if (saved) {
        addToast("Sua mensagem de suporte foi enviada com sucesso ao administrador! 👍", "success");
        
        // Reset states
        setSubject("");
        setWrittenMessage("");
        handleDiscardRecording();
        handleDiscardImage();
        setIsComposeOpen(false);
        fetchFeedbacks();
      } else {
        addToast("Erro ao registrar a mensagem no banco de dados.", "error");
      }
    } catch (err) {
      console.error("Error sending feedback:", err);
      addToast("Ocorreu um erro ao enviar sua mensagem.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const fetchConfig = async () => {
    setLoadingConfig(true);
    try {
      const cfg = await dbGetSupportConfig();
      setConfig(cfg);
      if (cfg) {
        setStartTime(cfg.horario_inicio || "09:00");
        setEndTime(cfg.horario_fim || "19:00");
        setClosedMsg(cfg.mensagem_fechado || "");
      }
    } catch (e) {
      console.error("Error loading support config:", e);
    } finally {
      setLoadingConfig(false);
    }
  };

  const fetchFeedbacks = async () => {
    setLoadingFeedbacks(true);
    try {
      const fbs = isAdmin 
        ? await dbGetSupportFeedbacks() 
        : await dbGetSupportFeedbacks(currentUser.id);
      setFeedbacks(fbs);
    } catch (e) {
      console.error("Error loading feedbacks:", e);
    } finally {
      setLoadingFeedbacks(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const success = await dbSaveSupportConfig({
        horario_inicio: startTime,
        horario_fim: endTime,
        mensagem_fechado: closedMsg
      });
      if (success) {
        addToast("Configurações de suporte salvas com sucesso! 💎", "success");
        fetchConfig();
      } else {
        addToast("Erro ao salvar configurações de suporte.", "error");
      }
    } catch (err) {
      console.error("Error saving support config:", err);
      addToast("Ocorreu um erro ao salvar as configurações.", "error");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSubmitReply = async (feedbackId: string) => {
    const text = replyTexts[feedbackId]?.trim();
    if (!text) {
      addToast("Por favor, digite uma resposta para enviar.", "warning");
      return;
    }

    setSubmittingReply(prev => ({ ...prev, [feedbackId]: true }));
    try {
      const success = await dbSubmitAdminResponse(feedbackId, text);
      if (success) {
        addToast("Resposta registrada e enviada com sucesso! 💎", "success");
        setReplyTexts(prev => ({ ...prev, [feedbackId]: "" }));
        fetchFeedbacks();
      } else {
        addToast("Erro ao salvar resposta no banco de dados.", "error");
      }
    } catch (err: any) {
      addToast(`Erro ao responder: ${err.message}`, "error");
    } finally {
      setSubmittingReply(prev => ({ ...prev, [feedbackId]: false }));
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchFeedbacks();
  }, [currentUser.id]);

  // Check if support is currently open based on server/client time
  const isSupportOpenNow = (): { open: boolean; current: string } => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;
    const currentMinutesSinceMidnight = currentHour * 60 + currentMin;

    if (!config) return { open: true, current: currentStr };

    const [startHour, startMin] = (config.horario_inicio || "09:00").split(":").map(Number);
    const [endHour, endMin] = (config.horario_fim || "19:00").split(":").map(Number);

    const startMinutes = (startHour || 0) * 60 + (startMin || 0);
    const endMinutes = (endHour || 0) * 60 + (endMin || 0);

    let isOpen = false;
    if (startMinutes <= endMinutes) {
      isOpen = currentMinutesSinceMidnight >= startMinutes && currentMinutesSinceMidnight <= endMinutes;
    } else {
      // Overnight support window (e.g. 22:00 to 06:00)
      isOpen = currentMinutesSinceMidnight >= startMinutes || currentMinutesSinceMidnight <= endMinutes;
    }

    return { open: isOpen, current: currentStr };
  };

  const { open: supportIsOpen, current: clientTimeStr } = isSupportOpenNow();

  const handleStartRecording = async () => {
    const supportCheck = isSupportOpenNow();
    if (!supportCheck.open && config && !isAdmin) {
      addToast(`Suporte Fechado. Horário de atendimento é das ${config.horario_inicio} às ${config.horario_fim}.`, "warning");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access error:", err);
      addToast("Erro ao acessar o microfone. Certifique-se de conceder as permissões necessárias.", "error");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const handleDiscardRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Filter feedbacks for rendering
  const filteredFeedbacks = feedbacks.filter(fb => {
    if (isAdmin && feedbackFilter === "unanswered") return !fb.resposta_admin;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 font-sans relative">
      
      {/* Lightbox attachment preview modal */}
      {lightboxUrl && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-fade-in"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-2 shadow-2xl">
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-950/80 hover:bg-slate-950 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <img 
              src={lightboxUrl} 
              alt="Anexo de Suporte" 
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Dynamic glow decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 bg-brand-cyan/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Title Banner */}
      <div className="border-b border-slate-800 pb-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
        <div>
          <span className="text-[10px] bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest font-mono">
            {isAdmin ? "Painel de Administração 👑" : "Atendimento ao Cliente"}
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight mt-1 flex items-center gap-2">
            {isAdmin ? "Central de Atendimento ao Suporte Técnico 🎧" : "Central de Suporte Gráfico 🎧"}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAdmin 
              ? "Visualize, filtre e responda a todas as dúvidas e feedbacks enviados pelos clientes do sistema."
              : "Consulte o histórico de suas solicitações ou envie novas dúvidas em texto, áudio ou imagem."
            }
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          {isAdmin && !isComposeOpen && (
            <button
              onClick={() => setIsComposeOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 font-extrabold text-xs rounded-lg transition-all cursor-pointer shadow-md shadow-brand-cyan/10 hover:scale-[1.02]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Novo Chamado</span>
            </button>
          )}

          <button
            onClick={() => {
              fetchConfig();
              fetchFeedbacks();
            }}
            disabled={loadingConfig || loadingFeedbacks}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 text-xs text-slate-300 rounded-lg transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${(loadingConfig || loadingFeedbacks) ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Grid: Configurator or Recorder + Messages list */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* Left column: Admin configuration OR Client message workspace */}
        <div className="lg:col-span-5 space-y-6">
          {isComposeOpen ? (
            /* Creation Workspace (Composer Card) with Option to write, record voice or upload image! */
            <div className="bg-slate-900/40 border border-slate-850/60 p-5 rounded-2xl flex flex-col justify-between min-h-[460px] backdrop-blur-md">
              
              <div className="space-y-4">
                {/* Header with back button */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (isRecording) handleStopRecording();
                      setIsComposeOpen(false);
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-slate-450 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Voltar</span>
                  </button>
                  <span className="text-[10px] font-bold text-brand-cyan uppercase font-mono tracking-wider">
                    Nova Mensagem de Suporte
                  </span>
                </div>

                {/* Subject Input (Assunto) - MANDATORY */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <span>Assunto da Mensagem *</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Erro ao imprimir comprovante"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={submitting}
                    className="w-full bg-slate-950/85 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-cyan transition-colors"
                  />
                </div>

                {/* Mode Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Selecione o formato de envio:</label>
                  <div className="flex bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => {
                        if (isRecording) handleStopRecording();
                        setSupportMode("text");
                      }}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                        supportMode === "text" 
                          ? "bg-slate-850 text-brand-cyan shadow" 
                          : "text-slate-450 hover:text-slate-200"
                      }`}
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      <span>Texto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSupportMode("audio");
                      }}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                        supportMode === "audio" 
                          ? "bg-slate-850 text-brand-cyan shadow" 
                          : "text-slate-450 hover:text-slate-200"
                      }`}
                    >
                      <Mic className="h-3 w-3 shrink-0" />
                      <span>Áudio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isRecording) handleStopRecording();
                        setSupportMode("image");
                      }}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                        supportMode === "image" 
                          ? "bg-slate-850 text-brand-cyan shadow" 
                          : "text-slate-450 hover:text-slate-200"
                      }`}
                    >
                      <ImageIcon className="h-3 w-3 shrink-0" />
                      <span>Imagem</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Mode Workspace */}
              <div className="flex-grow my-4 flex flex-col justify-center">
                {supportMode === "text" && (
                  <div className="space-y-1.5 w-full">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sua mensagem:</label>
                    <textarea
                      rows={5}
                      placeholder="Escreva detalhadamente qual é a sua dúvida ou sugestão para o suporte técnico..."
                      value={writtenMessage}
                      onChange={(e) => setWrittenMessage(e.target.value)}
                      disabled={submitting}
                      className="w-full bg-slate-950/45 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-cyan transition-colors resize-none leading-relaxed"
                    />
                  </div>
                )}

                {supportMode === "audio" && (
                  <div className="border border-dashed border-slate-800 rounded-xl bg-slate-950/25 p-4 flex flex-col items-center justify-center relative overflow-hidden min-h-[140px]">
                    {isRecording && (
                      <div className="absolute inset-0 bg-red-500/5 animate-pulse duration-1000 pointer-events-none" />
                    )}

                    {isRecording ? (
                      <div className="flex flex-col items-center space-y-2 text-center">
                        <div className="h-7 flex items-center gap-1.5 px-3 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 font-bold text-[11px] font-mono">
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-ping shrink-0" />
                          <span>GRAVANDO: {formatTime(recordingTime)}</span>
                        </div>
                        
                        <div className="flex items-center gap-0.5 h-4 mt-1">
                          {[3, 6, 4, 8, 5, 9, 3, 7, 4, 8, 3, 6].map((h, i) => (
                            <div 
                              key={i} 
                              className="w-0.5 bg-red-500 rounded-full animate-bounce" 
                              style={{ 
                                height: `${h * 1.5}px`, 
                                animationDelay: `${i * 45}ms`,
                                animationDuration: '600ms'
                              }} 
                            />
                          ))}
                        </div>
                      </div>
                    ) : audioUrl ? (
                      <div className="flex flex-col items-center space-y-2.5 w-full">
                        <span className="text-[10px] font-bold text-brand-cyan uppercase tracking-widest flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Voz Gravada!
                        </span>
                        <audio src={audioUrl} controls className="w-full h-8 accent-brand-cyan" />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-center">
                        <Mic className="h-6 w-6 text-slate-600" />
                        <span className="text-[11px] font-bold text-slate-400 mt-2">Gravar mensagem de voz</span>
                        <span className="text-[9px] text-slate-500 mt-0.5">Explique o problema falando de forma audível.</span>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-center gap-2">
                      {isRecording ? (
                        <button
                          type="button"
                          onClick={handleStopRecording}
                          className="p-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-lg"
                        >
                          <Square className="h-4 w-4" />
                        </button>
                      ) : audioUrl ? (
                        <button
                          type="button"
                          onClick={handleDiscardRecording}
                          className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-400 border border-slate-800 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Gravar Novamente</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleStartRecording}
                          disabled={!supportIsOpen}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10px] font-bold uppercase cursor-pointer ${
                            supportIsOpen 
                              ? "bg-slate-100 text-slate-950 hover:bg-white" 
                              : "bg-slate-900 text-slate-600 border border-slate-850 cursor-not-allowed opacity-65"
                          }`}
                        >
                          <Mic className="h-3 w-3" />
                          <span>Gravar</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {supportMode === "image" && (
                  <div className="border border-dashed border-slate-800 rounded-xl bg-slate-950/25 p-3 flex flex-col items-center justify-center relative min-h-[140px]">
                    {imagePreviewUrl ? (
                      <div className="flex flex-col items-center space-y-2 w-full">
                        <div className="relative group rounded-lg overflow-hidden border border-slate-800 bg-slate-950 h-20 w-28">
                          <img 
                            src={imagePreviewUrl} 
                            alt="Upload preview" 
                            className="h-full w-full object-cover" 
                          />
                          <button
                            type="button"
                            onClick={handleDiscardImage}
                            className="absolute top-1 right-1 p-1 rounded-full bg-slate-950/80 hover:bg-slate-950 text-rose-400 transition-colors cursor-pointer"
                            title="Remover Imagem"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 truncate max-w-xs font-mono">
                          {imageFile?.name || "Anexo selecionado"}
                        </span>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center cursor-pointer p-4 w-full h-full hover:bg-slate-950/20 rounded-xl transition-all">
                        <UploadCloud className="h-7 w-7 text-slate-500 animate-pulse" />
                        <span className="text-[11px] font-bold text-slate-400 mt-2">Escolher uma Imagem</span>
                        <span className="text-[9px] text-slate-600 mt-0.5">Clique ou arraste um print ou arquivo JPG/PNG.</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageSelect}
                          className="hidden"
                          disabled={submitting}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>

              {/* Text explanation for attachments */}
              {supportMode !== "text" && (
                <div className="mb-3 space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Observações (Opcional):</label>
                  <input
                    type="text"
                    placeholder="Adicione um breve comentário extra se achar necessário..."
                    value={writtenMessage}
                    onChange={(e) => setWrittenMessage(e.target.value)}
                    disabled={submitting}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:border-brand-cyan"
                  />
                </div>
              )}

              {/* Send Button */}
              <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (isRecording) handleStopRecording();
                    setSubject("");
                    setWrittenMessage("");
                    handleDiscardRecording();
                    handleDiscardImage();
                    setIsComposeOpen(false);
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSendFeedback}
                  disabled={submitting || !subject.trim() || !supportIsOpen || (supportMode === "image" && !imageFile) || (supportMode === "audio" && !audioBlob) || (supportMode === "text" && !writtenMessage.trim())}
                  className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-black uppercase rounded-xl cursor-pointer transition-all shadow-lg ${
                    supportIsOpen && subject.trim() && (writtenMessage.trim() || imageFile || audioBlob)
                      ? "bg-brand-cyan hover:bg-brand-cyan/95 text-slate-950 shadow-brand-cyan/15 hover:scale-[1.01]"
                      : "bg-slate-900 text-slate-600 border border-slate-850 cursor-not-allowed opacity-60"
                  }`}
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{submitting ? "Enviando..." : "Enviar Mensagem"}</span>
                </button>
              </div>

            </div>
          ) : isAdmin ? (
            /* Admin view on the left: Configuration (Only for Super Admin) or Support Info summary (for regular Admins) */
            isSuperAdmin ? (
              <div className="bg-slate-900/40 border border-slate-850/60 p-5 rounded-2xl flex flex-col justify-between min-h-[460px] backdrop-blur-md">
                <div className="space-y-5">
                  <h2 className="text-sm font-bold text-slate-250 uppercase tracking-wider flex items-center gap-2">
                    <Settings className="h-4 w-4 text-brand-cyan" />
                    Configurar Suporte
                  </h2>
                  
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Defina os horários de funcionamento do atendimento técnico para o usuário final e a mensagem a ser exibida quando fechado.
                  </p>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Abertura:</label>
                      <input
                        type="text"
                        placeholder="09:00"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-cyan transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fechamento:</label>
                      <input
                        type="text"
                        placeholder="19:00"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-cyan transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mensagem (Quando Fechado):</label>
                    <textarea
                      rows={4}
                      placeholder="Deixe sua mensagem e responderemos assim que abrirmos!"
                      value={closedMsg}
                      onChange={(e) => setClosedMsg(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-cyan transition-colors resize-none leading-relaxed"
                    />
                  </div>

                  <div className={`p-3.5 rounded-xl text-xs flex gap-2 border ${
                    supportIsOpen 
                      ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400" 
                      : "bg-red-500/5 border-red-500/10 text-rose-400"
                  }`}>
                    <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Status atual do Suporte: {supportIsOpen ? "Disponível (Aberto)" : "Indisponível (Fechado)"}</span>
                      <span className="block text-[10px] opacity-80 mt-0.5">Horário local do servidor: {clientTimeStr}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    disabled={savingConfig}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-black uppercase rounded-xl bg-brand-cyan hover:bg-brand-cyan/95 text-slate-950 shadow-lg shadow-brand-cyan/15 hover:scale-[1.01] transition-all cursor-pointer"
                  >
                    {savingConfig ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Salvar Configurações</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Regular Admin View on Left (No access to change hours configuration, just overview) */
              <div className="bg-slate-900/40 border border-slate-850/60 p-5 rounded-2xl flex flex-col justify-between min-h-[460px] backdrop-blur-md text-slate-300">
                <div className="space-y-4">
                  <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-violet-400" />
                    Painel Operacional
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Você está conectado como Administrador de Suporte Auxiliar. Você tem privilégios para visualizar todas as solicitações e enviar respostas aos clientes.
                  </p>

                  <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-xs space-y-3">
                    <span className="font-bold block text-slate-200">ℹ️ Regras de Configuração</span>
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      Por motivos de segurança e governança, as alterações de horários comerciais e as mensagens automáticas de fechamento podem ser configuradas apenas pela conta master:
                    </p>
                    <code className="block bg-slate-950 p-2 rounded text-[10px] text-brand-cyan font-mono border border-slate-800 text-center select-all">
                      sistemadevendaadm@gmail.com
                    </code>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-xs space-y-2">
                    <span className="font-bold text-slate-200 block">Atendimento Ativo:</span>
                    <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                      <span>Horário Funcionamento:</span>
                      <span className="text-brand-magenta font-bold">{config?.horario_inicio || "09:00"} - {config?.horario_fim || "19:00"}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                      <span>Status do Atendimento:</span>
                      <span className={supportIsOpen ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {supportIsOpen ? "ABERTO" : "FECHADO"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-6 text-center text-[10px] text-slate-600">
                  <span>Operação de Suporte Técnico Registrada</span>
                </div>
              </div>
            )
          ) : (
            /* Client Voice / Written feedback submission box: Invitation card */
            /* Friendly, highly-polished Invitation card with a giant beautiful clickable "+ Nova Mensagem" button */
            <div className="bg-slate-900/40 border border-slate-850/60 p-6 rounded-2xl flex flex-col justify-between min-h-[460px] backdrop-blur-md relative overflow-hidden text-center">
              
              <div className="absolute inset-0 bg-gradient-to-b from-brand-cyan/5 via-transparent to-transparent pointer-events-none" />
              
              <div className="my-auto space-y-5 relative z-10">
                <div className="h-16 w-16 mx-auto rounded-full bg-gradient-to-tr from-brand-cyan/25 to-brand-magenta/25 border border-slate-800 flex items-center justify-center text-brand-cyan shadow-xl">
                  <MessageSquare className="h-7 w-7 text-brand-cyan" />
                </div>
                
                <div className="space-y-1.5">
                  <h2 className="text-base font-extrabold text-slate-100 tracking-tight">
                    Como podemos te ajudar hoje?
                  </h2>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Se você encontrou algum problema gráfico, tem alguma dúvida ou quer sugerir melhorias, fale diretamente com nossa equipe.
                  </p>
                </div>

                {/* Operational indicators */}
                {config && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/60 border border-slate-800 text-[11px] font-mono text-slate-400">
                    <Clock className={`h-3 w-3 ${supportIsOpen ? "text-emerald-400" : "text-rose-400 animate-pulse"}`} />
                    <span>Atendimento: {config.horario_inicio} às {config.horario_fim}</span>
                  </div>
                )}

                {!supportIsOpen && config && (
                  <p className="text-[11px] text-rose-400 italic max-w-xs mx-auto leading-relaxed">
                    ⚠️ {config.mensagem_fechado}
                  </p>
                )}
              </div>

              <div className="pt-6 relative z-10">
                <button
                  type="button"
                  onClick={() => setIsComposeOpen(true)}
                  className="w-full flex items-center justify-center gap-2.5 px-6 py-3 text-xs font-black uppercase tracking-wider rounded-xl bg-gradient-to-r from-brand-cyan via-brand-cyan/95 to-brand-cyan text-slate-950 shadow-lg shadow-brand-cyan/20 hover:scale-[1.01] hover:shadow-brand-cyan/30 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Nova Mensagem</span>
                </button>
              </div>

            </div>
          )}
        </div>

        {/* Right column: Feedbacks list (Either all users for Admin, or logged-in user only for Client) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900/40 border border-slate-850/60 p-5 rounded-2xl backdrop-blur-md flex flex-col min-h-[460px]">
            
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-b border-slate-800/60 pb-3.5 mb-4">
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-brand-magenta" />
                {isAdmin ? "Mensagens dos Clientes (Fila)" : "Minhas Solicitações e Respostas"}
              </h2>

              {isAdmin && (
                <div className="flex bg-slate-950/60 p-1 rounded-xl border border-slate-850 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFeedbackFilter("unanswered")}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all cursor-pointer ${
                      feedbackFilter === "unanswered"
                        ? "bg-brand-magenta/15 text-brand-magenta border border-brand-magenta/20"
                        : "text-slate-400 hover:text-slate-200 border border-transparent"
                    }`}
                  >
                    Pendentes ({feedbacks.filter(f => !f.resposta_admin).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedbackFilter("all")}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all cursor-pointer ${
                      feedbackFilter === "all"
                        ? "bg-brand-magenta/15 text-brand-magenta border border-brand-magenta/20"
                        : "text-slate-400 hover:text-slate-200 border border-transparent"
                    }`}
                  >
                    Todas ({feedbacks.length})
                  </button>
                </div>
              )}
            </div>

            {loadingFeedbacks ? (
              <div className="flex-grow flex flex-col items-center justify-center py-20 gap-3">
                <RefreshCw className="h-6 w-6 text-brand-magenta animate-spin" />
                <span className="text-[10px] text-slate-600 font-mono">Carregando histórico do servidor...</span>
              </div>
            ) : filteredFeedbacks.length === 0 ? (
              <div className="flex-grow flex flex-col items-center justify-center py-20 text-center gap-3">
                <HelpCircle className="h-10 w-10 text-slate-700" />
                <span className="text-xs font-bold text-slate-400">
                  {isAdmin 
                    ? (feedbackFilter === "unanswered" ? "Tudo resolvido! Nenhuma mensagem pendente." : "Nenhuma mensagem de suporte encontrada.")
                    : "Nenhuma mensagem enviada ainda"
                  }
                </span>
                <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed">
                  {isAdmin
                    ? "Dica: Você pode alterar o filtro para verificar mensagens já respondidas anteriormente."
                    : "Envie sua pergunta ou áudio utilizando o painel ao lado sempre que precisar de auxílio da nossa equipe."
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto max-h-[500px] pr-1.5 scrollbar-thin">
                {filteredFeedbacks.map((item) => {
                  const sentDate = new Date(item.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit"
                  });

                  // Detect image vs voice vs text
                  const isImage = item.audio_url && (
                    item.audio_url.startsWith("data:image/") ||
                    item.audio_url.includes(".png") ||
                    item.audio_url.includes(".jpg") ||
                    item.audio_url.includes(".jpeg") ||
                    item.audio_url.includes(".gif") ||
                    item.audio_url.includes(".webp") ||
                    item.audio_url.includes("image_support") ||
                    item.audio_url.includes("supabase.co/storage")
                  );

                  const isTextMessage = !isImage && (item.message || item.audio_url?.startsWith("text:"));
                  
                  // Parse feedback subject and body
                  const { subject: parsedSubject, body: parsedBody } = parseFeedback(item);
                  
                  const replyVal = replyTexts[item.id] || "";
                  const sendingReplyItem = submittingReply[item.id] || false;

                  return (
                    <div 
                      key={item.id} 
                      className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-3 shadow-inner"
                    >
                      {/* Subject Line & Protocol Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="text-[11px] font-black uppercase text-brand-cyan tracking-wide bg-brand-cyan/10 px-2.5 py-1 rounded-lg border border-brand-cyan/15 block w-fit">
                            📌 {parsedSubject}
                          </span>
                          <div className="flex items-center gap-2 text-[9px] text-slate-500">
                            <span>ID: #{item.id}</span>
                            {isAdmin && (
                              <span className="text-slate-400 font-bold font-mono">
                                • Cliente: {item.user_name || "Desconhecido"}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[9px] text-slate-500">{sentDate}</span>
                          {item.resposta_admin ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black uppercase tracking-wider text-[8px]">
                              Respondido
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 font-black uppercase tracking-wider text-[8px] animate-pulse">
                              Aguardando
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Content Panel */}
                      <div className="mt-2 text-xs">
                        {isImage ? (
                          <div className="space-y-2">
                            {parsedBody && (
                              <p className="text-slate-300 leading-relaxed bg-slate-900/45 p-2 rounded-lg border border-slate-900">
                                {parsedBody}
                              </p>
                            )}
                            <div className="relative group w-44 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 cursor-pointer">
                              <img 
                                src={item.audio_url} 
                                alt="Anexo do Cliente" 
                                referrerPolicy="no-referrer"
                                className="w-full max-h-36 object-cover hover:scale-[1.03] transition-transform duration-200"
                                onClick={() => setLightboxUrl(item.audio_url)}
                              />
                              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <span className="bg-slate-900/90 text-[10px] text-brand-cyan font-bold px-2 py-1 rounded-md border border-slate-800">
                                  🔍 Ampliar
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : isTextMessage ? (
                          <div className="bg-slate-900/50 border border-slate-800/80 p-3 rounded-xl text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                            {parsedBody}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {parsedBody && (
                              <p className="text-slate-400 text-[11px] italic mb-1">
                                {parsedBody}
                              </p>
                            )}
                            <audio 
                              controls 
                              src={item.audio_url} 
                              className="w-full h-8 bg-slate-900 border border-slate-850 rounded-lg accent-brand-magenta" 
                              preload="none"
                            />
                          </div>
                        )}
                      </div>

                      {/* Admin Response display section */}
                      {item.resposta_admin && (
                        <div className="mt-3.5 bg-violet-500/5 border-l-2 border-brand-magenta p-3 rounded-r-lg space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold text-brand-magenta">
                            <span>RE: RESPOSTA DO SUPORTE 👑</span>
                            {item.respondido_em && (
                              <span className="text-slate-500 font-normal font-mono">
                                {new Date(item.respondido_em).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-200 mt-1 whitespace-pre-wrap leading-relaxed font-sans">
                            {item.resposta_admin}
                          </p>
                        </div>
                      )}

                      {/* If logged-in user is admin, allow writing/replying here */}
                      {isAdmin && (
                        <div className="pt-3.5 border-t border-slate-800/60 space-y-2.5">
                          <div className="flex flex-col space-y-1">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                              {item.resposta_admin ? "Atualizar ou alterar resposta:" : "Escrever Resposta ao Cliente:"}
                            </span>
                            <textarea
                              rows={2}
                              placeholder="Digite uma resposta clara para o cliente..."
                              value={replyVal}
                              onChange={(e) => setReplyTexts(prev => ({ ...prev, [item.id]: e.target.value }))}
                              disabled={sendingReplyItem}
                              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-cyan transition-colors resize-none leading-relaxed"
                            />
                          </div>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleSubmitReply(item.id)}
                              disabled={sendingReplyItem || !replyVal.trim()}
                              className={`flex items-center gap-1.5 px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all ${
                                replyVal.trim()
                                  ? "bg-brand-cyan hover:bg-brand-cyan/95 text-slate-950 shadow-md shadow-brand-cyan/15 hover:scale-[1.02]"
                                  : "bg-slate-900 text-slate-600 border border-slate-850 cursor-not-allowed opacity-60"
                              }`}
                            >
                              <Send className="h-3 w-3" />
                              <span>{sendingReplyItem ? "Enviando..." : item.resposta_admin ? "Atualizar Resposta" : "Enviar Resposta"}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}
