import React, { useState, useMemo } from "react";
import { X, Wallet, ShieldAlert, CheckCircle, Info, Calculator, FileText, ArrowRightLeft, Landmark, Users, Printer, Check, Loader2 } from "lucide-react";
import { CashRegisterState, Sale, CashRegisterSession, Expense, getSaleOperationCost, getSaleOrderDate } from "../types";

interface CashRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  cashRegister: CashRegisterState;
  sales: Sale[];
  expenses: Expense[];
  activeOperatorName: string;
  onOpenRegister: (valorAbertura: number, operador: string) => void | Promise<void>;
  onCloseRegister: (valorFechamentoReal: number, observacoes: string) => void | Promise<void>;
  currentUser?: any;
  adminUnlocked?: boolean;
  isCashRegisterOpen?: boolean;
  onRefreshRegister?: () => void;
}

const getLocalDateFromISO = (isoStr: string): string => {
  if (!isoStr) return "";
  const clean = isoStr.replace(/['"]/g, "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  if (clean.includes("T00:00:00") || clean.includes(" 00:00:00") || clean.includes("T03:00:00")) {
    return clean.substring(0, 10);
  }
  const isUtcMidnight = (clean.endsWith("Z") || clean.includes("+00")) && (clean.includes("T00:00:00") || clean.includes(" 00:00:00"));
  if (isUtcMidnight) {
    return clean.substring(0, 10);
  }
  try {
    const d = new Date(clean);
    if (isNaN(d.getTime())) return clean.substring(0, 10);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (e) {
    return clean.substring(0, 10);
  }
};

export function CashRegisterModal({
  isOpen,
  onClose,
  cashRegister,
  sales,
  expenses,
  activeOperatorName,
  onOpenRegister,
  onCloseRegister,
  currentUser,
  adminUnlocked,
  isCashRegisterOpen,
  onRefreshRegister
}: CashRegisterModalProps) {
  const isAttendant = currentUser && (
    currentUser.role === "atendente" ||
    currentUser.role === "seller" ||
    (currentUser.owner_id && currentUser.owner_id !== currentUser.id && currentUser.role !== "administrador" && !currentUser.is_admin)
  ) && !adminUnlocked;
  // Opening states
  const [openCashInput, setOpenCashInput] = useState<string>("100.00");
  const [operatorInput, setOperatorInput] = useState<string>(activeOperatorName && activeOperatorName !== "Operador" ? activeOperatorName : (currentUser?.email || "grafica.designer16@gmail.com"));

  // Closing states
  const [observedCashInput, setObservedCashInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [closedSessionSummary, setClosedSessionSummary] = useState<{
    operador: string;
    dataAbertura: string;
    dataFechamento: string;
    valorAbertura: number;
    totalDinheiro: number;
    totalPix: number;
    totalCartao: number;
    totalDespesas: number;
    expectedInDrawer: number;
    valorFechamentoReal: number;
    difference: number;
    observacoes: string;
  } | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      setClosedSessionSummary(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Active session resolution: handles multi-terminal sync so open register NEVER asks to open
  const activeSession: CashRegisterSession | null = useMemo(() => {
    if (cashRegister.currentSession && cashRegister.currentSession.status === "aberto") {
      return cashRegister.currentSession;
    }
    // Check localStorage fallback
    try {
      const saved = localStorage.getItem("NUCLEO_CASH_REGISTER");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.currentSession && parsed.currentSession.status === "aberto") {
          return parsed.currentSession;
        }
      }
    } catch (e) {}

    // If marked open globally or today, build a valid fallback session so the user is never prompted to re-open
    if (isCashRegisterOpen) {
      return {
        id: "session_active_" + Date.now(),
        status: "aberto",
        valorAbertura: 0,
        dataAbertura: new Date().toISOString(),
        operador: activeOperatorName || "Operador"
      };
    }

    return null;
  }, [cashRegister.currentSession, isCashRegisterOpen, activeOperatorName]);

  const isClosed = !activeSession;

  // Auto-refresh when opening modal if state was out of sync
  React.useEffect(() => {
    if (isOpen && isCashRegisterOpen && !cashRegister.currentSession) {
      onRefreshRegister?.();
    }
  }, [isOpen, isCashRegisterOpen, cashRegister.currentSession, onRefreshRegister]);

  const dailyMetaGoal = useMemo(() => {
    try {
      const savedBills = localStorage.getItem("NUCLEO_MONTHLY_BILLS");
      const savedDays = localStorage.getItem("NUCLEO_MONTHLY_WORKDAYS");
      const bills = savedBills ? JSON.parse(savedBills) : [];
      const days = savedDays ? parseInt(savedDays, 10) : 26;
      const totalBillsValue = bills.reduce((sum: number, b: any) => sum + (Number(b.value) || 0), 0);
      return days > 0 ? totalBillsValue / days : 0;
    } catch (e) {
      return 0;
    }
  }, []);

  // Helper to check if a transaction date falls precisely inside the session time range
  const isDateInSession = (dateStr: string, session: any): boolean => {
    if (!session) return false;
    if (!dateStr) return false;
    
    // Calendar day check fallback: if it's the same local calendar day as the session's opening day
    const cleanDate = getLocalDateFromISO(dateStr);
    const startLocalDate = getLocalDateFromISO(session.dataAbertura);
    const endLocalDate = getLocalDateFromISO(session.dataFechamento || new Date().toISOString());
    
    if (cleanDate === startLocalDate) {
      return true;
    }

    const openTime = new Date(session.dataAbertura).getTime();
    const closeTime = session.dataFechamento ? new Date(session.dataFechamento).getTime() : Date.now();
    
    // Check if dateStr contains hours/time (is a full ISO or timestamp)
    const isFullISO = dateStr.includes("T") || (dateStr.includes("-") && dateStr.includes(":"));
    if (isFullISO) {
      try {
        const t = new Date(dateStr).getTime();
        if (!isNaN(t)) {
          if (t >= openTime && t <= (closeTime + 2000)) {
            return true;
          }
        }
      } catch (e) {}
    }
    
    return cleanDate >= startLocalDate && cleanDate <= endLocalDate;
  };

  // Calculate live stats for the current session if open
  const sessionStats = useMemo(() => {
    if (!activeSession) {
      return { 
        count: 0, 
        totalSales: 0, 
        cashInflow: 0, 
        pixInflow: 0, 
        cardInflow: 0, 
        totalEntradas: 0,
        operationCosts: 0,
        expensesTotal: 0,
        totalMotoboy: 0,
        totalCustos: 0,
        lucroLiquido: 0,
        entradasServico: 0,
        expectedInDrawer: 0 
      };
    }

    const session = activeSession;
    const startingCash = session.valorAbertura;

    let count = 0;
    let totalSales = 0;
    let cashInflow = 0;
    let pixInflow = 0;
    let cardInflow = 0;
    let operationCosts = 0;
    let totalMotoboy = 0;
    let entradasServico = 0;

    const serviceKeywords = [
      "servico", "serviço", "arte", "impressao", "impressão", "criacao", "criação", 
      "design", "mao de obra", "mão de obra", "recarregar", "plotagem", "xerox", 
      "copia", "cópia", "taxa", "encadernacao", "encadernação", "adesivo", 
      "panfleto", "cartao", "cartão", "banner", "corte", "placa", "encadernar",
      "personaliz", "estamp"
    ];

    sales.forEach((sale) => {
      if (sale.isBudget) return;
      
      const orderDateStr = getSaleOrderDate(sale);
      if (isDateInSession(orderDateStr, session)) {
        count++;
        totalSales += sale.totalValue;
        operationCosts += getSaleOperationCost(sale);
        if (sale.useMotoboy) {
          totalMotoboy += sale.motoboyCost || 0;
        }

        // Sum individual items that qualify as services
        if (sale.items && sale.items.length > 0) {
          sale.items.forEach(item => {
            const desc = (item.description || "").toLowerCase().trim();
            const isService = serviceKeywords.some(keyword => desc.includes(keyword));
            if (isService) {
              entradasServico += Number(item.totalValue) || 0;
            }
          });
        }
      }

      // Sum payment methods by the actual time of payment!
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach((p) => {
          const amt = Number(p.amount) || 0;
          const method = String(p.method || "dinheiro").toLowerCase();
          const pDateStr = p.date || sale.date;
          
          if (isDateInSession(pDateStr, session)) {
            if (method === "dinheiro") {
              cashInflow += amt;
            } else if (method === "pix") {
              pixInflow += amt;
            } else {
              cardInflow += amt;
            }
          }
        });
      } else {
        const sDateStr = sale.date;
        if (isDateInSession(sDateStr, session)) {
          const meth = String(sale.paymentMethod || "dinheiro").toLowerCase();
          const amt = sale.balanceDue === 0 ? sale.totalValue : (sale.downPayment || 0);
          if (meth === "dinheiro") {
            cashInflow += amt;
          } else if (meth === "pix") {
            pixInflow += amt;
          } else {
            cardInflow += amt;
          }
        }
      }
    });

    // Sum standalone expenses created on the same local date as the active session
    let expensesTotal = 0;
    let expensesPaidInCash = 0;

    const parseExpenseDescription = (desc: string) => {
      if (!desc) return { cleanDesc: "", method: "dinheiro" };
      const trimmed = desc.trim();
      if (trimmed.startsWith("[Dinheiro]")) {
        return { cleanDesc: trimmed.replace("[Dinheiro]", "").trim(), method: "dinheiro" };
      }
      if (trimmed.startsWith("[Pix]")) {
        return { cleanDesc: trimmed.replace("[Pix]", "").trim(), method: "pix" };
      }
      if (trimmed.startsWith("[Cartão]") || trimmed.startsWith("[Cartao]")) {
        return { cleanDesc: trimmed.replace(/\[Cartã?o\]/, "").trim(), method: "cartão" };
      }
      
      const lower = trimmed.toLowerCase();
      if (lower.startsWith("[dinheiro]")) {
        return { cleanDesc: trimmed.substring(10).trim(), method: "dinheiro" };
      }
      if (lower.startsWith("[pix]")) {
        return { cleanDesc: trimmed.substring(5).trim(), method: "pix" };
      }
      if (lower.startsWith("[cartão]") || lower.startsWith("[cartao]")) {
        return { cleanDesc: trimmed.replace(/\[cartã?o\]/i, "").trim(), method: "cartão" };
      }

      // Word matches:
      if (lower.includes("dinheiro")) return { cleanDesc: trimmed, method: "dinheiro" };
      if (lower.includes("pix")) return { cleanDesc: trimmed, method: "pix" };
      if (lower.includes("cartão") || lower.includes("cartao")) return { cleanDesc: trimmed, method: "cartão" };

      return { cleanDesc: trimmed, method: "dinheiro" };
    };

    expenses.forEach((expense) => {
      if (!expense.date) return;
      if (isDateInSession(expense.date, session)) {
        const val = Number(expense.value) || 0;
        expensesTotal += val;

        const { method } = parseExpenseDescription(expense.description);
        if (method === "dinheiro") {
          expensesPaidInCash += val;
        }
      }
    });

    const totalEntradas = cashInflow + pixInflow + cardInflow;
    const totalCustos = operationCosts + expensesTotal + totalMotoboy;
    const lucroLiquido = totalEntradas - totalCustos;
    const expectedInDrawer = startingCash + cashInflow - expensesPaidInCash;

    return {
      count,
      totalSales,
      cashInflow,
      pixInflow,
      cardInflow,
      totalEntradas,
      operationCosts,
      expensesTotal,
      expensesPaidInCash,
      totalMotoboy,
      totalCustos,
      lucroLiquido,
      entradasServico,
      expectedInDrawer
    };
  }, [activeSession, sales, expenses]);

  const renderHistorySection = () => {
    if (isAttendant) return null;
    const history = cashRegister.history || [];
    if (history.length === 0) return null;

    return (
      <div className="mt-4 pt-4 border-t border-slate-800">
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider py-1.5 select-none"
        >
          <span className="flex items-center gap-1.5">
            <Calculator className="h-4 w-4 text-brand-cyan shrink-0" />
            Histórico e Contabilidade de Turnos ({history.length})
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            {showHistory ? "▲ Ocultar" : "▼ Visualizar"}
          </span>
        </button>

        {showHistory && (
          <div className="mt-3 space-y-3 max-h-56 overflow-y-auto pr-1">
            {history.map((session, idx) => {
              const diff = (session.valorFechamentoReal ?? 0) - (session.valorFechamentoEsperado ?? 0);
              const isAuto = session.observacoes?.includes("FECHAMENTO AUTOMÁTICO") || false;
              
              return (
                <div key={session.id || idx} className="p-3 bg-slate-950 border border-slate-850 rounded-xl space-y-2 text-[11px] text-slate-300">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-slate-200 block">
                        👤 Operador: {session.operador}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(session.dataAbertura).toLocaleDateString("pt-BR")} às {new Date(session.dataAbertura).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                      isAuto 
                        ? "bg-amber-950/45 text-amber-400 border-amber-500/20" 
                        : "bg-emerald-950/45 text-emerald-400 border-emerald-500/20"
                    }`}>
                      {isAuto ? "Automático" : "Manual"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2 bg-slate-900 rounded border border-slate-850/60 font-mono text-slate-350">
                    <div>
                      Abertura: <strong className="text-white">R$ {session.valorAbertura.toFixed(2)}</strong>
                    </div>
                    <div>
                      Fechamento: <strong className="text-white">R$ {(session.valorFechamentoReal ?? 0).toFixed(2)}</strong>
                    </div>
                    <div className="col-span-2 text-[10px] text-slate-450 border-t border-slate-800/85 pt-1 mt-1 flex justify-between">
                      <span>Diferença / Quebra:</span>
                      <strong className={diff === 0 ? "text-emerald-400" : diff > 0 ? "text-blue-400" : "text-rose-500"}>
                        {diff === 0 ? "R$ 0,00" : diff > 0 ? `+ R$ ${diff.toFixed(2)}` : `- R$ ${Math.abs(diff).toFixed(2)}`}
                      </strong>
                    </div>
                  </div>

                  {session.observacoes && (
                    <div className="p-2.5 bg-slate-900/60 rounded border border-slate-850/60 text-[10px] font-mono text-slate-400 whitespace-pre-line leading-relaxed">
                      {session.observacoes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  const handleOpenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Math.max(0, Number(openCashInput) || 0);
    const op = operatorInput.trim() || activeOperatorName || "Operador Principal";
    onOpenRegister(val, op);
  };

  const handleCloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const observed = Math.max(0, Number(observedCashInput) || 0);
    const summaryData = {
      operador: activeSession?.operador || operatorInput || activeOperatorName || "Operador",
      dataAbertura: activeSession?.dataAbertura || new Date().toISOString(),
      dataFechamento: new Date().toISOString(),
      valorAbertura: activeSession?.valorAbertura || 0,
      totalDinheiro: sessionStats.cashInflow,
      totalPix: sessionStats.pixInflow,
      totalCartao: sessionStats.cardInflow,
      totalDespesas: sessionStats.expensesTotal,
      expectedInDrawer: sessionStats.expectedInDrawer,
      valorFechamentoReal: observed,
      difference: observed - sessionStats.expectedInDrawer,
      observacoes: notesInput
    };

    setIsSubmitting(true);
    try {
      await onCloseRegister(observed, notesInput);
      setClosedSessionSummary(summaryData);
      // Reset inputs
      setObservedCashInput("");
      setNotesInput("");
    } catch (err) {
      console.error("Erro ao fechar caixa:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintSessionReport = () => {
    const session = activeSession;
    if (!session) return;

    const sessionSalesList: any[] = [];
    const sessionExpensesList: any[] = [];

    // Helper to determine the method name in Portuguese and clean description
    const parseExpenseDescription = (desc: string) => {
      if (!desc) return { cleanDesc: "", method: "dinheiro" };
      const trimmed = desc.trim();
      if (trimmed.startsWith("[Dinheiro]")) {
        return { cleanDesc: trimmed.replace("[Dinheiro]", "").trim(), method: "dinheiro" };
      }
      if (trimmed.startsWith("[Pix]")) {
        return { cleanDesc: trimmed.replace("[Pix]", "").trim(), method: "pix" };
      }
      if (trimmed.startsWith("[Cartão]") || trimmed.startsWith("[Cartao]")) {
        return { cleanDesc: trimmed.replace(/\[Cartã?o\]/, "").trim(), method: "cartão" };
      }
      
      const lower = trimmed.toLowerCase();
      if (lower.startsWith("[dinheiro]")) {
        return { cleanDesc: trimmed.substring(10).trim(), method: "dinheiro" };
      }
      if (lower.startsWith("[pix]")) {
        return { cleanDesc: trimmed.substring(5).trim(), method: "pix" };
      }
      if (lower.startsWith("[cartão]") || lower.startsWith("[cartao]")) {
        return { cleanDesc: trimmed.replace(/\[cartã?o\]/i, "").trim(), method: "cartão" };
      }

      // Word matches:
      if (lower.includes("dinheiro")) return { cleanDesc: trimmed, method: "dinheiro" };
      if (lower.includes("pix")) return { cleanDesc: trimmed, method: "pix" };
      if (lower.includes("cartão") || lower.includes("cartao")) return { cleanDesc: trimmed, method: "cartão" };

      return { cleanDesc: trimmed, method: "dinheiro" };
    };

    sales.forEach((sale) => {
      if (sale.isBudget) return;
      
      const orderDateStr = getSaleOrderDate(sale);
      const isOrderToday = isDateInSession(orderDateStr, session);
      
      let paidOnThisDay = 0;
      const methodsPaid: { [key: string]: number } = { dinheiro: 0, pix: 0, cartao: 0 };
      
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach((payment) => {
          if (isDateInSession(payment.date || sale.date, session)) {
            const amt = Number(payment.amount) || 0;
            paidOnThisDay += amt;
            const method = String(payment.method || "dinheiro").toLowerCase();
            if (method === "dinheiro") {
              methodsPaid.dinheiro += amt;
            } else if (method === "pix") {
              methodsPaid.pix += amt;
            } else {
              methodsPaid.cartao += amt;
            }
          }
        });
      } else {
        if (isDateInSession(sale.date, session)) {
          const amt = sale.balanceDue === 0 ? sale.totalValue : (sale.downPayment || 0);
          paidOnThisDay += amt;
          const method = String(sale.paymentMethod || "dinheiro").toLowerCase();
          if (method === "dinheiro") {
            methodsPaid.dinheiro += amt;
          } else if (method === "pix") {
            methodsPaid.pix += amt;
          } else {
            methodsPaid.cartao += amt;
          }
        }
      }
      
      if (paidOnThisDay > 0 || isOrderToday) {
        sessionSalesList.push({
          id: sale.id,
          clientName: sale.clientName,
          totalValue: sale.totalValue,
          paidAmount: paidOnThisDay,
          methodsPaid,
          cost: isOrderToday ? (getSaleOperationCost(sale) + (sale.useMotoboy ? (sale.motoboyCost || 0) : 0)) : 0,
          isOrderToday,
        });
      }
    });

    expenses.forEach((expense) => {
      if (!expense.date) return;
      if (isDateInSession(expense.date, session)) {
        const { cleanDesc, method } = parseExpenseDescription(expense.description);
        sessionExpensesList.push({
          ...expense,
          cleanDesc,
          method
        });
      }
    });

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const formatCurrency = (val: number) => {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(val);
    };

    const formattedOpenDate = new Date(session.dataAbertura).toLocaleDateString("pt-BR");
    const formattedOpenTime = new Date(session.dataAbertura).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const salesHtml = sessionSalesList.map((s: any) => `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">${s.id.substring(0, 8)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: bold;">
          ${s.clientName}
          ${!s.isOrderToday ? '<span style="font-size: 8px; background-color: #f1f5f9; color: #475569; padding: 1px 4px; border-radius: 4px; margin-left: 5px; font-weight: normal;">BAIXA</span>' : ''}
        </td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: right;">${formatCurrency(s.totalValue)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: right; font-weight: bold; color: #16a34a;">${formatCurrency(s.paidAmount)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: right;">${formatCurrency(s.cost)}</td>
      </tr>
    `).join("");

    const expensesHtml = sessionExpensesList.map((e: any) => `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">${e.cleanDesc || e.description}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-transform: uppercase; font-weight: bold; color: #64748b;">[${e.method}]</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: right; font-weight: bold; color: #dc2626;">-${formatCurrency(e.value)}</td>
      </tr>
    `).join("");

    const observedValue = Number(observedCashInput) || 0;
    const isReconciled = observedCashInput !== "";
    const diff = observedValue - sessionStats.expectedInDrawer;

    printWindow.document.write(`
      <html>
        <head>
          <title>Relatório de Fechamento de Caixa - Operador: ${session.operador}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #1e293b; padding: 25px; line-height: 1.4; }
            .header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; }
            .title { font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
            .subtitle { font-size: 12px; color: #64748b; font-weight: 500; }
            .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px; font-size: 12px; }
            .meta-box { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc; }
            .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 25px; }
            .summary-card { padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #f8fafc; }
            .summary-card .label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.5px; }
            .summary-card .value { font-size: 16px; font-weight: 800; margin-top: 4px; color: #0f172a; }
            .section-title { font-size: 13px; font-weight: 800; margin: 25px 0 10px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 12px; }
            th { background-color: #f1f5f9; font-weight: bold; color: #475569; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; }
            .text-right { text-align: right; }
            .profit-positive { color: #16a34a; }
            .profit-negative { color: #dc2626; }
            .diff-positive { color: #2563eb; font-weight: bold; }
            .diff-negative { color: #dc2626; font-weight: bold; }
            .diff-perfect { color: #16a34a; font-weight: bold; }
            .breakdown { font-size: 10px; color: #64748b; margin-top: 4px; border-top: 1px dashed #e2e8f0; padding-top: 4px; }
            .breakdown-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .print-btn-container { text-align: center; margin-top: 30px; }
            .print-btn { padding: 10px 20px; font-size: 13px; font-weight: bold; background-color: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); transition: all 0.2s; }
            .print-btn:hover { background-color: #0369a1; }
            @media print {
              body { padding: 5px; }
              .print-btn-container { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Relatório de Fechamento de Caixa</div>
            <div class="subtitle">Controle de Turno e Conciliação Financeira</div>
          </div>

          <div class="meta-grid">
            <div class="meta-box">
              <b>Informações do Turno:</b><br/>
              Operador: <b>${session.operador}</b><br/>
              Abertura: <b>${formattedOpenDate} às ${formattedOpenTime}</b><br/>
              Troco Inicial: <b>${formatCurrency(session.valorAbertura)}</b>
            </div>
            <div class="meta-box">
              <b>Emissão do Relatório:</b><br/>
              Data: <b>${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</b><br/>
              Status: <b>Ativo / Em Fechamento</b>
            </div>
          </div>
          
          <div class="summary-grid">
            <div class="summary-card">
              <div class="label">Total Entradas</div>
              <div class="value" style="color: #16a34a;">${formatCurrency(sessionStats.totalEntradas)}</div>
              <div class="breakdown">
                <div class="breakdown-row"><span>Dinheiro:</span> <span>${formatCurrency(sessionStats.cashInflow)}</span></div>
                <div class="breakdown-row"><span>Pix:</span> <span>${formatCurrency(sessionStats.pixInflow)}</span></div>
                <div class="breakdown-row"><span>Cartão:</span> <span>${formatCurrency(sessionStats.cardInflow)}</span></div>
              </div>
            </div>
            <div class="summary-card">
              <div class="label">Total Custos/Despesas</div>
              <div class="value" style="color: #475569;">${formatCurrency(sessionStats.totalCustos)}</div>
              <div class="breakdown">
                <div class="breakdown-row"><span>Custos Vendas:</span> <span>${formatCurrency(sessionStats.operationCosts)}</span></div>
                <div class="breakdown-row"><span>Despesas:</span> <span>${formatCurrency(sessionStats.expensesTotal)}</span></div>
                <div class="breakdown-row"><span>Motoboy:</span> <span>${formatCurrency(sessionStats.totalMotoboy)}</span></div>
              </div>
            </div>
            <div class="summary-card">
              <div class="label">Esperado em Dinheiro</div>
              <div class="value" style="color: #0284c7;">${formatCurrency(sessionStats.expectedInDrawer)}</div>
              <div class="breakdown" style="font-size: 8px;">
                Fundo Inicial + Entradas Dinheiro - Despesas Dinheiro
              </div>
            </div>
            <div class="summary-card">
              <div class="label">Lucro Líquido Turno</div>
              <div class="value ${sessionStats.lucroLiquido >= 0 ? 'profit-positive' : 'profit-negative'}">${formatCurrency(sessionStats.lucroLiquido)}</div>
              <div class="breakdown">
                Entradas totais subtraindo custos operacionais globais
              </div>
            </div>
          </div>

          ${isReconciled ? `
            <div style="margin-bottom: 25px; padding: 15px; border: 1px solid #cbd5e1; border-radius: 10px; background-color: #f1f5f9;">
              <h3 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; color: #1e293b;">Conciliação Física de Gaveta</h3>
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                <span>Valor Contado na Gaveta:</span>
                <b>${formatCurrency(observedValue)}</b>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                <span>Valor Esperado em Dinheiro:</span>
                <span>${formatCurrency(sessionStats.expectedInDrawer)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; border-top: 1px dashed #cbd5e1; padding-top: 6px; margin-top: 6px;">
                <span>Diferença de Caixa (Quebra):</span>
                <span class="${diff === 0 ? 'diff-perfect' : diff > 0 ? 'diff-positive' : 'diff-negative'}">
                  ${diff === 0 ? 'CONCILADO COM SUCESSO (R$ 0,00)' : diff > 0 ? `SOBRA DE ${formatCurrency(diff)}` : `FALTA DE ${formatCurrency(Math.abs(diff))}`}
                </span>
              </div>
              ${notesInput.trim() ? `
                <div style="margin-top: 8px; font-size: 11px; color: #475569; font-style: italic; background-color: white; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                  <b>Observações do Operador:</b><br/>${notesInput}
                </div>
              ` : ''}
            </div>
          ` : ''}
          
          <div class="section-title">Histórico de Transações (Vendas e Recebimentos)</div>
          ${sessionSalesList.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th style="width: 80px;">Pedido</th>
                  <th>Cliente</th>
                  <th class="text-right">Total Pedido</th>
                  <th class="text-right">Valor Pago (Hoje)</th>
                  <th class="text-right">Custos Diretos</th>
                </tr>
              </thead>
              <tbody>
                ${salesHtml}
              </tbody>
            </table>
          ` : `<p style="font-size: 12px; color: #64748b; font-style: italic; text-align: center; padding: 15px; border: 1px dashed #cbd5e1; border-radius: 6px;">Nenhuma transação de venda registrada neste turno.</p>`}
          
          <div class="section-title">Histórico de Despesas Standalone</div>
          ${sessionExpensesList.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Descrição da Despesa</th>
                  <th style="width: 120px;">Canal de Saída</th>
                  <th class="text-right" style="width: 100px;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${expensesHtml}
              </tbody>
            </table>
          ` : `<p style="font-size: 12px; color: #64748b; font-style: italic; text-align: center; padding: 15px; border: 1px dashed #cbd5e1; border-radius: 6px;">Nenhuma despesa standalone registrada neste turno.</p>`}
          
          <div class="print-btn-container">
            <button class="print-btn" onclick="window.print()">Imprimir este Relatório</button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 bg-slate-950/85 backdrop-blur-sm overflow-y-auto animate-fade-in font-sans">
      <div 
        id="cash-register-modal-container"
        className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[96vh] sm:max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-805 bg-slate-905 shrink-0">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${closedSessionSummary ? "bg-emerald-500/10 text-emerald-400" : isClosed ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
              {closedSessionSummary ? <CheckCircle className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="text-xs sm:text-xs font-black text-slate-100 uppercase tracking-wider">
                {closedSessionSummary ? "Fechamento de Caixa Concluído" : isClosed ? "Abertura de Caixa" : "Fechamento de Caixa"}
              </h3>
              <p className="text-[10px] text-slate-450 font-mono mt-0.5 leading-none">
                {closedSessionSummary ? "Resumo da conciliação e conferência final" : isClosed ? "Inicie a sessão de hojediária" : "Relatório resumido com conciliação física"}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (isSubmitting) return;
              setClosedSessionSummary(null);
              onClose();
            }}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        {closedSessionSummary ? (
          <div id="cash-register-reconciliation-summary" className="flex flex-col flex-grow overflow-hidden">
            <div className="flex-grow overflow-y-auto p-4 space-y-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5">
                <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Caixa Encerrado com Sucesso!</h4>
                  <p className="text-[10px] text-slate-300 mt-0.5">
                    A sessão foi devidamente fechada e a conciliação foi salva no histórico e relatórios.
                  </p>
                </div>
              </div>

              {/* Audit / Operator Info */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">Operador:</span>
                  <span className="font-bold text-white">{closedSessionSummary.operador}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">Fechamento em:</span>
                  <span className="font-mono text-slate-300 text-[11px]">{new Date(closedSessionSummary.dataFechamento).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>

              {/* Reconciliation Breakdown */}
              <div className="space-y-2">
                <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Resumo da Conciliação Financeira</h5>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[9px] text-slate-500 uppercase block">Fundo de Abertura</span>
                    <span className="font-mono font-bold text-slate-300 text-[11px]">R$ {closedSessionSummary.valorAbertura.toFixed(2)}</span>
                  </div>

                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[9px] text-slate-500 uppercase block">Entradas Dinheiro</span>
                    <span className="font-mono font-bold text-emerald-400 text-[11px]">R$ {closedSessionSummary.totalDinheiro.toFixed(2)}</span>
                  </div>

                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[9px] text-slate-500 uppercase block">Entradas PIX</span>
                    <span className="font-mono font-bold text-cyan-400 text-[11px]">R$ {closedSessionSummary.totalPix.toFixed(2)}</span>
                  </div>

                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[9px] text-slate-500 uppercase block">Entradas Cartão</span>
                    <span className="font-mono font-bold text-purple-400 text-[11px]">R$ {closedSessionSummary.totalCartao.toFixed(2)}</span>
                  </div>
                </div>

                {closedSessionSummary.totalDespesas > 0 && (
                  <div className="bg-red-950/20 border border-red-900/30 p-2.5 rounded-lg flex justify-between items-center text-xs">
                    <span className="text-[10px] text-red-300 font-bold uppercase">Despesas / Sangrias do Turno:</span>
                    <span className="font-mono font-bold text-red-400 text-[11px]">- R$ {closedSessionSummary.totalDespesas.toFixed(2)}</span>
                  </div>
                )}

                {/* Final Count Comparison */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 mt-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Esperado na Gaveta:</span>
                    <span className="font-mono font-bold text-slate-200">R$ {closedSessionSummary.expectedInDrawer.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Contado / Declarado:</span>
                    <span className="font-mono font-bold text-brand-cyan">R$ {closedSessionSummary.valorFechamentoReal.toFixed(2)}</span>
                  </div>
                  <div className={`flex justify-between items-center pt-2 border-t border-slate-850 text-xs font-bold ${
                    Math.abs(closedSessionSummary.difference) < 0.01
                      ? "text-emerald-400"
                      : closedSessionSummary.difference > 0
                        ? "text-blue-400"
                        : "text-red-400"
                  }`}>
                    <span className="uppercase text-[10px]">
                      {Math.abs(closedSessionSummary.difference) < 0.01
                        ? "Conciliação Perfeita (Bateu):"
                        : closedSessionSummary.difference > 0
                          ? "Sobra de Caixa:"
                          : "Quebra de Caixa (Falta):"}
                    </span>
                    <span className="font-mono">
                      {closedSessionSummary.difference >= 0 ? "+ " : "- "}R$ {Math.abs(closedSessionSummary.difference).toFixed(2)}
                    </span>
                  </div>
                </div>

                {closedSessionSummary.observacoes && (
                  <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-850 text-[10px] text-slate-400">
                    <strong className="text-slate-300 block mb-0.5">Observações:</strong>
                    <span>{closedSessionSummary.observacoes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="p-3 border-t border-slate-850 bg-slate-905 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePrintSessionReport}
                className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setClosedSessionSummary(null);
                  onClose();
                }}
                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Concluir</span>
              </button>
            </div>
          </div>
        ) : isClosed ? (
          // OPEN CASHER FORM
          <form onSubmit={handleOpenSubmit} className="flex flex-col flex-grow overflow-hidden">
            <div className="flex-grow overflow-y-auto p-3 space-y-3">
              <div className="p-2.5 bg-blue-950/20 border border-blue-800/30 rounded-xl text-xs text-blue-200 flex items-start gap-2">
                <Users className="h-4.5 w-4.5 shrink-0 mt-0.5 text-cyan-400" />
                <div>
                  <span className="font-extrabold block uppercase tracking-wider text-[9px] text-cyan-400">ABERTURA COMPARTILHADA (TODA A EQUIPE)</span>
                  <span className="opacity-90 block mt-0.5 text-[11px] leading-relaxed text-slate-300">
                    Quem abrir serve para todos! Uma vez aberto por qualquer atendente ou pelo administrador, o caixa fica automaticamente ativo e sincronizado para toda a empresa.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Operador do Caixa 👤
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nome do operador"
                    value={operatorInput}
                    onChange={(e) => setOperatorInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none focus:border-brand-cyan transition-all font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Troco Inicial (Abertura) 💵
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold font-mono">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={openCashInput}
                      onChange={(e) => setOpenCashInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 pl-7 pr-2.5 text-xs text-brand-cyan font-mono font-bold focus:outline-none focus:border-brand-cyan transition-all"
                      placeholder="0,00"
                    />
                  </div>
                </div>
              </div>
              <span className="text-[9px] text-slate-455 block leading-tight">
                ℹ️ Dinheiro físico inicial na gaveta usado como fundo para trocos iniciais.
              </span>
              {renderHistorySection()}
            </div>

            <div className="p-3 border-t border-slate-805 bg-slate-905 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-1.5 px-3 bg-slate-950 hover:bg-slate-855 border border-slate-855 text-slate-400 hover:text-white rounded-lg cursor-pointer text-xs font-bold transition-all uppercase tracking-wider"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-1.5 px-3 bg-brand-cyan hover:bg-cyan-405 text-slate-950 rounded-lg cursor-pointer text-xs font-black uppercase text-center tracking-wider transition-all"
              >
                Abrir Caixa 🚀
              </button>
            </div>
          </form>
        ) : (
          // CLOSE CASHIER FORM
          <form onSubmit={handleCloseSubmit} className="flex flex-col flex-grow overflow-hidden">
            <div className="flex-grow overflow-y-auto p-3 space-y-3">
              {/* Operator details information indicator */}
              <div className="p-2.5 bg-emerald-950/20 border border-emerald-800/30 rounded-xl text-xs text-emerald-200 flex items-start gap-2">
                <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-emerald-400" />
                <div className="w-full">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold uppercase text-[10px] tracking-wider font-mono text-emerald-400">
                      Sessão de Caixa Ativa (Toda a Equipe)
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Aberto p/ Todos
                    </span>
                  </div>
                  <span className="opacity-90 block mt-0.5 text-xs text-slate-300">
                    Aberto por: <strong className="text-white font-bold">{activeSession?.operador || "Operador"}</strong>
                  </span>
                  <span className="opacity-75 block text-[10px] mt-0.5 font-mono text-slate-400">
                    Aberto em: {activeSession?.dataAbertura ? new Date(activeSession.dataAbertura).toLocaleDateString("pt-BR") : ""} às {activeSession?.dataAbertura ? new Date(activeSession.dataAbertura).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }) : ""} • Válido para todos os atendentes
                  </span>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider font-mono">
                  📊 RESUMO DO EXPEDIENTE (Turno Atual)
                </span>
                
                <div className="grid grid-cols-2 gap-2">
                  {/* CARD 1: ENTRADAS */}
                  <div className="p-2 bg-slate-950 border border-slate-850 rounded-xl">
                    <span className="text-[9px] text-slate-450 uppercase tracking-widest font-black block">Entradas / Sinais</span>
                    <strong className="text-emerald-400 font-mono text-xs sm:text-sm block">
                      R$ {sessionStats.totalEntradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                    <div className="text-[8px] sm:text-[9px] text-slate-500 font-mono space-y-0.5 mt-1 border-t border-slate-900 pt-1">
                      <div className="flex justify-between">
                        <span>Dinheiro:</span> 
                        <span className="text-slate-300">R$ {sessionStats.cashInflow.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Pix:</span> 
                        <span className="text-slate-300">R$ {sessionStats.pixInflow.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cartão:</span> 
                        <span className="text-slate-300">R$ {sessionStats.cardInflow.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* CARD 2: CUSTOS */}
                  <div className="p-2 bg-slate-950 border border-slate-850 rounded-xl">
                    <span className="text-[9px] text-slate-455 uppercase tracking-widest font-black block">Custos / Despesas</span>
                    <strong className="text-rose-450 font-mono text-xs sm:text-sm block">
                      R$ {sessionStats.totalCustos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                    <div className="text-[8px] sm:text-[9px] text-slate-500 font-mono space-y-0.5 mt-1 border-t border-slate-900 pt-1">
                      <div className="flex justify-between">
                        <span>Custo Oper.:</span> 
                        <span className="text-slate-300">R$ {sessionStats.operationCosts.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Despesas:</span> 
                        <span className="text-slate-300">R$ {sessionStats.expensesTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Motoboy:</span> 
                        <span className="text-slate-300">R$ {sessionStats.totalMotoboy.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-900 pt-0.5 mt-0.5">
                        <span className="text-rose-450 font-bold">Meta Diária:</span> 
                        <strong className="text-rose-400">R$ {dailyMetaGoal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                    </div>
                  </div>

                  {/* CARD 3: LUCRO LIQUIDO */}
                  <div className={`p-2 border rounded-xl ${
                    sessionStats.lucroLiquido >= 0 
                      ? "bg-emerald-950/10 border-emerald-900/20" 
                      : "bg-rose-955/10 border-rose-910/20"
                  }`}>
                    <span className="text-[9px] text-slate-450 uppercase tracking-widest font-black block">Lucro Real</span>
                    <strong className={`font-mono text-xs sm:text-sm block ${sessionStats.lucroLiquido >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                      R$ {sessionStats.lucroLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                    <span className="text-[8px] text-slate-500 leading-tight block pt-0.5 truncate">
                      Recebimentos - custos totais
                    </span>
                  </div>

                  {/* CARD 4: ENTRADA DE SERVICO */}
                  <div className="p-2 bg-slate-950 border border-slate-850 rounded-xl">
                    <span className="text-[9px] text-slate-450 uppercase tracking-widest font-black block">Entrada de Serviços</span>
                    <strong className="text-brand-cyan font-mono text-xs sm:text-sm block">
                      R$ {sessionStats.totalSales.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                    <span className="text-[8px] text-slate-500 leading-tight block pt-0.5 truncate">
                      Valor bruto total dos serviços
                    </span>
                  </div>
                </div>

                {/* Cash flow reconciliation details */}
                <div className="p-2 bg-slate-950 rounded-xl border border-slate-850/65 text-xs text-slate-400 space-y-1">
                  <div className="flex justify-between items-center text-slate-500 font-mono text-[9px] pb-1 border-b border-slate-900">
                    <span>Sessão:</span>
                    <span>{sessionStats.count} vendas registradas</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span>Troco Inicial de Abertura:</span>
                    <strong className="text-slate-200 font-mono">
                      R$ {(activeSession?.valorAbertura || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span>(+) Recebimento em Dinheiro (Físico):</span>
                    <strong className="text-emerald-400 font-mono">
                      + R$ {sessionStats.cashInflow.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span>(+) Recebimento em Pix (Digital):</span>
                    <strong className="text-slate-400 font-mono">
                      + R$ {sessionStats.pixInflow.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold border-t border-slate-900/30">
                    <span>(=) Total de Entradas (Sinais + Recebidos):</span>
                    <strong className="text-slate-300 font-mono">
                      R$ {sessionStats.totalEntradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px] pt-1">
                    <span>(-) Despesas Pagas em Dinheiro:</span>
                    <strong className="text-rose-450 font-mono">
                      - R$ {sessionStats.expensesPaidInCash.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span>(-) Outros Custos e Despesas (Sem Impacto na Gaveta):</span>
                    <strong className="text-slate-500 font-mono font-normal">
                      - R$ {(sessionStats.totalCustos - sessionStats.expensesPaidInCash).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold border-t border-slate-900/30">
                    <span>(=) Total de Despesas (Custos Globais):</span>
                    <strong className="text-rose-400 font-mono">
                      R$ {sessionStats.totalCustos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="text-emerald-400">(=) Lucro Líquido Real (Turno):</span>
                    <strong className="text-emerald-400 font-mono">
                      R$ {sessionStats.lucroLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-900 font-bold text-[11px]">
                    <span className="text-slate-300">Dinheiro Líquido Esperado na Gaveta:</span>
                    <span className="text-brand-cyan font-mono text-xs bg-slate-900 px-1.5 py-0.5 rounded leading-none font-bold">
                      R$ {sessionStats.expectedInDrawer.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reconciliation physics counts */}
              <div className="space-y-2 pt-1.5 border-t border-slate-805/40">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider font-mono">CONCILIAÇÃO FÍSICA E DIFERENÇAS</span>
                
                <div>
                  <label className="text-[10px] font-black text-brand-cyan uppercase tracking-wider block mb-1">
                    💰 VALOR FÍSICO CONTADO NA GAVETA (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold font-mono">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      disabled={isSubmitting}
                      value={observedCashInput}
                      onChange={(e) => setObservedCashInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 pl-7 pr-2.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-brand-cyan transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="Dinheiro do dia + Fundo de troco"
                    />
                  </div>
                </div>

                {/* Live difference calculation indicator */}
                {observedCashInput && (
                  (() => {
                    const val = Number(observedCashInput) || 0;
                    const diff = val - sessionStats.expectedInDrawer;

                    return (
                      <div className={`p-2 rounded-lg border text-xs flex justify-between items-center ${
                        diff === 0 
                          ? "bg-emerald-950/10 border-emerald-900/30 text-emerald-400" 
                          : diff > 0 
                            ? "bg-blue-950/10 border-blue-900/30 text-blue-400" 
                            : "bg-rose-955/15 border-rose-910/25 text-rose-500"
                      }`}>
                        <span>Diferença / Quebra do Caixa:</span>
                        <strong className="font-mono font-black text-xs">
                          {diff === 0 
                            ? "✅ Caixa Perfeito" 
                            : diff > 0 
                              ? `📈 Sobra R$ ${diff.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` 
                              : `📉 Falta R$ ${Math.abs(diff).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          }
                        </strong>
                      </div>
                    );
                  })()
                )}

                {/* Remarks observations */}
                <div>
                  <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Observações / Justificativas (Opcional)
                  </label>
                  <textarea
                    rows={1}
                    disabled={isSubmitting}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Se houver diferenças na contagem, justifique aqui..."
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1 px-2 text-xs text-white focus:outline-none focus:border-brand-cyan transition-all resize-none font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              {renderHistorySection()}
            </div>

            {/* Control buttons */}
            <div className="p-3 border-t border-slate-850 bg-slate-905 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-1.5 px-3 bg-slate-950 hover:bg-slate-855 border border-slate-855 text-slate-400 hover:text-white rounded-lg cursor-pointer text-xs font-bold transition-all uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Voltar
              </button>
              <button
                type="submit"
                id="btn-close-register"
                disabled={isSubmitting}
                className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900/60 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg cursor-pointer text-xs font-black uppercase text-center tracking-wider transition-all flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Fechando Caixa...</span>
                  </>
                ) : (
                  "Fechar Caixa 🔒"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
