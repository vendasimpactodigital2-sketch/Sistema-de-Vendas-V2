import React, { useState, useEffect, useMemo } from "react";
import { X, Trash2, RefreshCw, Terminal, ShieldAlert, CheckCircle, Database, Cpu, Activity, Clock, FileText } from "lucide-react";

interface CashRegisterDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  cashRegister?: any;
  onRefresh?: () => void;
}

export function CashRegisterDebugModal({ isOpen, onClose, cashRegister, onRefresh }: CashRegisterDebugModalProps) {
  const [activeTab, setActiveTab] = useState<"storage" | "logs">("storage");
  const [storageItems, setStorageItems] = useState<{ key: string; type: string; value: string; size: number }[]>([]);
  const [logs, setLogs] = useState<{ timestamp: string; type: string; message: string; data?: any }[]>([]);

  const loadStorageData = () => {
    const items: { key: string; type: string; value: string; size: number }[] = [];
    const relevantKeys = [
      "NUCLEO_CASH_REGISTER",
      "cash_register_status",
      "NUCLEO_CASH_REGISTER_ACTIVE",
      "NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE",
      "NUCLEO_SNOOZE_CASH_CLOSING_UNTIL",
      "NUCLEO_COMPANY_PROFILE",
      "NUCLEO_CUSTOM_REMINDERS"
    ];

    // LocalStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (relevantKeys.includes(key) || key.toLowerCase().includes("cash") || key.toLowerCase().includes("caixa"))) {
        const val = localStorage.getItem(key) || "";
        items.push({
          key,
          type: "LocalStorage",
          value: val,
          size: new Blob([val]).size
        });
      }
    }

    // SessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (relevantKeys.includes(key) || key.toLowerCase().includes("cash") || key.toLowerCase().includes("caixa"))) {
        const val = sessionStorage.getItem(key) || "";
        items.push({
          key,
          type: "SessionStorage",
          value: val,
          size: new Blob([val]).size
        });
      }
    }

    setStorageItems(items);
  };

  const loadLogs = () => {
    try {
      const winLogs = (window as any).__CASH_REGISTER_LOGS__ || [];
      setLogs(winLogs);
    } catch (e) {
      setLogs([]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStorageData();
      loadLogs();
    }
  }, [isOpen, cashRegister]);

  const handleClearCache = () => {
    if (!window.confirm("Deseja realmente limpar todos os caches e entradas fantasma do caixa (localStorage e sessionStorage)?")) {
      return;
    }
    try {
      localStorage.removeItem("NUCLEO_CASH_REGISTER");
      localStorage.removeItem("cash_register_status");
      localStorage.removeItem("NUCLEO_CASH_REGISTER_ACTIVE");
      localStorage.removeItem("NUCLEO_LAST_CASH_REGISTER_SYNCED_DATE");
      localStorage.removeItem("NUCLEO_SNOOZE_CASH_CLOSING_UNTIL");

      sessionStorage.removeItem("NUCLEO_CASH_REGISTER");
      sessionStorage.removeItem("cash_register_status");

      // Log action
      const newLog = {
        timestamp: new Date().toISOString(),
        type: "CLEAR_CACHE",
        message: "Usuário limpou todos os caches do caixa manualmente via CashRegisterDebugModal."
      };
      if (!(window as any).__CASH_REGISTER_LOGS__) {
        (window as any).__CASH_REGISTER_LOGS__ = [];
      }
      (window as any).__CASH_REGISTER_LOGS__.unshift(newLog);

      loadStorageData();
      loadLogs();
      onRefresh?.();
      alert("Cache do caixa limpo com sucesso! O sistema foi redefinido.");
    } catch (err) {
      console.error("Erro ao limpar cache:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-cyan/10 rounded-xl text-brand-cyan border border-brand-cyan/20">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                Painel de Depuração do Caixa (CashRegisterDebugModal)
              </h2>
              <p className="text-xs text-slate-400">
                Inspecione o estado atual do cache, entradas fantasma e o log de eventos do sistema em tempo real.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 py-3 bg-slate-925 border-b border-slate-800 shrink-0">
          <button
            onClick={() => setActiveTab("storage")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "storage"
                ? "bg-brand-cyan text-slate-950 shadow-lg shadow-brand-cyan/25"
                : "bg-slate-850 text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Database className="h-4 w-4" />
            <span>Chaves de Armazenamento ({storageItems.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "logs"
                ? "bg-brand-cyan text-slate-950 shadow-lg shadow-brand-cyan/25"
                : "bg-slate-850 text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Log de Atividades e Eventos ({logs.length})</span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                loadStorageData();
                loadLogs();
              }}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Atualizar</span>
            </button>
            <button
              onClick={handleClearCache}
              className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-rose-600/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Limpar Todo Cache</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-grow overflow-y-auto p-6 space-y-4">
          {activeTab === "storage" ? (
            <div className="space-y-4">
              <div className="bg-blue-950/20 border border-blue-900/30 rounded-xl p-3 text-xs text-blue-200 flex items-start gap-2.5">
                <ShieldAlert className="h-4 w-4 text-brand-cyan shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block mb-0.5">Diagnóstico de Entradas Fantasma</strong>
                  <span className="opacity-90 leading-relaxed block text-[11px] text-slate-300">
                    Se o caixa persistir aberto incorretamente, chaves residuais em localStorage/sessionStorage podem estar forçando o estado. Utilize o botão "Limpar Todo Cache" acima para resetar imediatamente.
                  </span>
                </div>
              </div>

              {storageItems.length === 0 ? (
                <div className="p-12 text-center text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-850">
                  <Database className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Nenhuma chave de caixa ativa encontrada no navegador.</p>
                </div>
              ) : (
                <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                        <th className="p-3">Tipo / Armazenamento</th>
                        <th className="p-3">Nome da Chave</th>
                        <th className="p-3">Tamanho</th>
                        <th className="p-3">Valor / Conteúdo Atual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 font-mono text-[11px]">
                      {storageItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                          <td className="p-3 text-cyan-400 font-bold whitespace-nowrap">{item.type}</td>
                          <td className="p-3 text-white font-bold">{item.key}</td>
                          <td className="p-3 text-slate-400 whitespace-nowrap">{item.size} bytes</td>
                          <td className="p-3 text-slate-300 max-w-md truncate font-sans">
                            <pre className="text-[10px] text-slate-300 bg-slate-900 p-2 rounded-lg overflow-x-auto max-h-24">
                              {item.value}
                            </pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  <span>Registro detalhado de tentativas de alteração de estado do caixa, sincronizações e gatilhos.</span>
                </div>
                <span className="font-mono text-[10px] text-slate-400">{logs.length} eventos registrados</span>
              </div>

              {logs.length === 0 ? (
                <div className="p-12 text-center text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-850">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Nenhum evento registrado nesta sessão ainda. Interaja com o caixa para gerar logs.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, idx) => (
                    <div key={idx} className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-slate-900 pb-1">
                        <span className="font-bold text-brand-cyan">{log.type}</span>
                        <span>{new Date(log.timestamp).toLocaleString("pt-BR")}</span>
                      </div>
                      <p className="text-slate-200 text-xs font-sans font-medium">{log.message}</p>
                      {log.data && (
                        <pre className="text-[10px] text-slate-400 bg-slate-900/80 p-2 rounded-lg font-mono overflow-x-auto">
                          {typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
