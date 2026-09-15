import React, { useState, useEffect, useRef } from "react";
import { 
  DollarSign, 
  Plus, 
  Trash2, 
  Edit2, 
  Calendar, 
  Calculator, 
  CheckCircle, 
  AlertCircle, 
  HelpCircle, 
  Sparkles, 
  Shuffle, 
  ChevronRight, 
  TrendingUp, 
  Info,
  Layers,
  StickyNote
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getSupabase } from "../supabase";
import { User } from "../types";

export interface MonthlyBill {
  id: string;
  name: string;
  value: number;
  category: string;
  dueDate: string; // YYYY-MM-DD or DD/MM
  observation?: string;
}

interface MonthlyExpensesMetaProps {
  todayNetProfit: number;
  bills: MonthlyBill[];
  setBills: React.Dispatch<React.SetStateAction<MonthlyBill[]>>;
  daysWorked: number;
  setDaysWorked: React.Dispatch<React.SetStateAction<number>>;
  currentUser: User | null;
}

const BILL_CATEGORIES = [
  "Aluguel",
  "Prestação da casa",
  "Água",
  "Luz",
  "Telefone",
  "Internet",
  "Carro",
  "Mercado",
  "Combustível",
  "Prestações/Empréstimos",
  "Funcionários/Faturamento",
  "Impostos",
  "Outros"
];

const FUNNY_CELEBRATION_MESSAGES = [
  "Meta batida! Agora manda esse dinheiro para outro banco antes que ele desapareça! 💸🏦",
  "Boa! Hoje você venceu o boleto! 🧾🔥",
  "Meta alcançada! Hora de separar esse valor e proteger seu lucro. 🛡️💰",
  "Parabéns! O dinheiro da meta foi conquistado. Transfere para outro banco! 🚀🏦",
  "Que orgulho! Meta batida com sucesso. Faça o PIX do lucro para a conta de proteção! 🏆",
  "Trabalho duro recompensado! Hoje você garantiu a meta do dia. Segurança em primeiro lugar! 🌟"
];

// Helper to format currency
const formatBRL = (val: number) => {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export function MonthlyExpensesMeta({ todayNetProfit, bills, setBills, daysWorked, setDaysWorked, currentUser }: MonthlyExpensesMetaProps) {
  // Form states for adding/editing bills
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  
  const [formName, setFormName] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formCategory, setFormCategory] = useState("Outros");
  const [formDueDate, setFormDueDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [formObservation, setFormObservation] = useState("");
  
  // Quick Filter
  const [categoryFilter, setCategoryFilter] = useState("Todos");

  // Funny message index
  const [funnyMsgIndex, setFunnyMsgIndex] = useState(() => {
    return Math.floor(Math.random() * FUNNY_CELEBRATION_MESSAGES.length);
  });

  // State feedback toast inside component
  const [feedbackToast, setFeedbackToast] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const [billToDelete, setBillToDelete] = useState<MonthlyBill | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);

  // Show auto-dismissing toast helper
  const showLocalToast = (text: string, type: "success" | "error" | "info" = "info") => {
    setFeedbackToast({ text, type });
    setTimeout(() => {
      setFeedbackToast(null);
    }, 4000);
  };

  // Fetch monthly expenses on mount
  useEffect(() => {
    if (!currentUser) return;

    const fetchMonthlyBills = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("gastos_mensais")
          .select("*")
          .eq("user_id", currentUser.id);

        if (error) {
          console.error("Erro ao carregar os dados do Supabase:", error);
          showLocalToast("Erro ao carregar dados do Supabase ⚠️", "error");
        } else if (data) {
          const mappedBills: MonthlyBill[] = data.map((d: any) => ({
            id: d.id,
            name: d.name || d.description || d.titulo || d.nome || "",
            value: Number(d.value || d.valor || 0),
            category: d.category || d.categoria || "Outros",
            dueDate: d.due_date || d.dueDate || d.vencimento || "",
            observation: d.observation || d.observacao || ""
          }));
          setBills(mappedBills);
        }
      } catch (err) {
        console.error("Erro ao sincronizar gastos:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMonthlyBills();
  }, [currentUser]);

  // Helper to save bill in an isolated, schema-safe way
  const dbSaveMonthlyBill = async (billId: string, name: string, value: number, category: string, dueDate: string, observation: string, userId: string): Promise<boolean> => {
    const supabase = getSupabase();
    if (!supabase) return false;

    // A. EN-Snake payload (no camelCase, since camelCase fails on PostgREST if column is missing)
    const enPayload = {
      id: billId,
      user_id: userId,
      name: name,
      description: name,
      value: value,
      category: category,
      due_date: dueDate,
      observation: observation
    };

    try {
      const { error } = await supabase
        .from("gastos_mensais")
        .upsert(enPayload);

      if (!error) {
        console.log("Gasto mensal salvo com sucesso (formato EN-snake_case)");
        return true;
      }
      console.warn("Payload EN-snake_case falhou para gastos_mensais, tentando PT:", error.message);
    } catch (err) {
      console.warn("Exceção com payload EN-snake_case para gastos_mensais:", err);
    }

    // B. PT-Snake payload
    const ptPayload = {
      id: billId,
      user_id: userId,
      nome: name,
      valor: value,
      categoria: category,
      vencimento: dueDate,
      observacao: observation
    };

    try {
      const { error } = await supabase
        .from("gastos_mensais")
        .upsert(ptPayload);

      if (!error) {
        console.log("Gasto mensal salvo com sucesso (formato PT-snake_case)");
        return true;
      }
      console.error("Falha fatal ao salvar no formato PT para gastos_mensais:", error.message);
    } catch (err) {
      console.error("Exceção fatal com payload PT para gastos_mensais:", err);
    }

    return false;
  };

  // --- Calculations ---
  const totalExpenses = bills.reduce((sum, b) => sum + b.value, 0);
  const dailyGoal = daysWorked > 0 ? totalExpenses / daysWorked : 0;
  const progressProfit = Math.max(0, todayNetProfit);
  const isGoalBeaten = dailyGoal > 0 && progressProfit >= dailyGoal;
  const goalProgressPercent = dailyGoal > 0 ? Math.min(100, (progressProfit / dailyGoal) * 100) : 0;
  const remainingToGoal = Math.max(0, dailyGoal - progressProfit);

  // --- Form Handling ---
  const openAddForm = () => {
    setEditingBillId(null);
    setFormName("");
    setFormValue("");
    setFormCategory("Outros");
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    setFormDueDate(`${y}-${m}-${d}`);
    setFormObservation("");
    setIsFormOpen(true);
  };

  const openEditForm = (bill: MonthlyBill) => {
    setEditingBillId(bill.id);
    setFormName(bill.name);
    setFormValue(String(bill.value));
    setFormCategory(bill.category);
    setFormDueDate(bill.dueDate);
    setFormObservation(bill.observation || "");
    setIsFormOpen(true);
  };

  const handleSaveBill = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formName.trim()) {
      showLocalToast("O nome do gasto é obrigatório ⚠️", "error");
      return;
    }

    const cleanValStr = formValue.replace(/[^\d.,]/g, "").replace(",", ".");
    const numericVal = parseFloat(cleanValStr);
    if (isNaN(numericVal) || numericVal <= 0) {
      showLocalToast("Por favor, digite um valor maior que zero ⚠️", "error");
      return;
    }

    if (editingBillId) {
      // Edit local state first
      setBills((prev) => 
        prev.map((b) => 
          b.id === editingBillId 
            ? { 
                ...b, 
                name: formName.trim(), 
                value: numericVal, 
                category: formCategory, 
                dueDate: formDueDate, 
                observation: formObservation.trim() 
              } 
            : b
        )
      );

      // Save to Supabase
      if (currentUser) {
        dbSaveMonthlyBill(
          editingBillId,
          formName.trim(),
          numericVal,
          formCategory,
          formDueDate,
          formObservation.trim(),
          currentUser.id
        );
      }

      showLocalToast("Gasto mensal atualizado com sucesso! 📝", "success");
      setIsFormOpen(false);
    } else {
      // Add
      const cleanId = "bill-" + Date.now();
      const newBill: MonthlyBill = {
        id: cleanId,
        name: formName.trim(),
        value: numericVal,
        category: formCategory,
        dueDate: formDueDate,
        observation: formObservation.trim()
      };
      setBills((prev) => [newBill, ...prev]);

      // Save to Supabase
      if (currentUser) {
        dbSaveMonthlyBill(
          cleanId,
          formName.trim(),
          numericVal,
          formCategory,
          formDueDate,
          formObservation.trim(),
          currentUser.id
        );
      }

      showLocalToast("Gasto cadastrado! O formulário está pronto para o próximo cadastro. 💰", "success");
      
      // Keep modal open, clean fields for quick next registration
      setFormName("");
      setFormValue("");
      setFormObservation("");
      
      // Auto-focus the Name Input field
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  };

  const handleDeleteBill = (bill: MonthlyBill) => {
    setBillToDelete(bill);
  };

  const handleConfirmDelete = () => {
    if (!billToDelete) return;
    const name = billToDelete.name;
    const deletedId = billToDelete.id;

    // Delete remotely from Supabase
    if (currentUser) {
      const supabase = getSupabase();
      if (supabase) {
        supabase
          .from("gastos_mensais")
          .delete()
          .eq("id", deletedId)
          .then(({ error }) => {
            if (error) {
              console.error("Erro ao deletar gasto mensal de Supabase:", error);
            }
          });
      }
    }

    setBills((prev) => prev.filter((b) => b.id !== deletedId));
    showLocalToast(`Gasto "${name}" removido! 🗑️`, "info");
    setBillToDelete(null);
  };

  const shuffleFunnyMessage = () => {
    let nextIdx = Math.floor(Math.random() * FUNNY_CELEBRATION_MESSAGES.length);
    // Avoid showing the exact same message twice if possible
    if (nextIdx === funnyMsgIndex && FUNNY_CELEBRATION_MESSAGES.length > 1) {
      nextIdx = (nextIdx + 1) % FUNNY_CELEBRATION_MESSAGES.length;
    }
    setFunnyMsgIndex(nextIdx);
  };

  const filteredBills = categoryFilter === "Todos" 
    ? bills 
    : bills.filter((b) => b.category === categoryFilter);

  return (
    <div className="space-y-6">
      {/* Dynamic Feedback Notification inside tab */}
      <AnimatePresence>
        {feedbackToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-24 right-6 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-2 border text-sm max-w-sm ${
              feedbackToast.type === "success" 
                ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-300"
                : feedbackToast.type === "error"
                  ? "bg-red-950/90 border-red-500/40 text-red-300"
                  : "bg-slate-900/90 border-brand-cyan/40 text-brand-cyan"
            }`}
          >
            <Info className="h-4 w-4 shrink-0" />
            <span>{feedbackToast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl shadow-slate-950/20">
        <div className="absolute right-0 top-0 h-40 w-40 bg-gradient-to-tr from-brand-magenta/5 to-brand-cyan/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-brand-magenta/10 text-brand-magenta border border-brand-magenta/20 mb-2">
              <Calculator className="h-3.5 w-3.5" />
              <span>PLANEJAMENTO DE CAIXA</span>
            </div>
            <h2 className="text-2xl font-black text-slate-100 flex items-center gap-2 tracking-tight">
              Gastos do Mês & Meta Diária
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Cadastre suas obrigações do mês, agende vencimentos e distribua o custo planejado de forma realista por seus dias trabalhados.
            </p>
          </div>
          <button
            onClick={openAddForm}
            className="bg-gradient-to-r from-brand-magenta to-brand-magenta/90 hover:from-brand-magenta/90 hover:to-brand-magenta text-white font-bold text-sm px-5 py-3 rounded-2xl shadow-lg shadow-brand-magenta/15 hover:shadow-brand-magenta/35 transition-all flex items-center gap-2 shrink-0 cursor-pointer hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            Adicionar Gasto Mensal
          </button>
        </div>
      </div>

      {/* Meta Batida Premium Alert Board */}
      {isGoalBeaten && (
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative rounded-3xl p-6 bg-gradient-to-r from-emerald-950/60 via-slate-900/90 to-teal-950/50 border border-emerald-500/40 shadow-xl overflow-hidden shadow-emerald-950/20"
        >
          {/* Confetti Accent Lines */}
          <div className="absolute -right-3 -top-3 text-[50px] opacity-15 select-none pointer-events-none">🥳</div>
          <div className="absolute left-4 top-4 h-2 w-2 rounded-full bg-emerald-400 animate-ping" />

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-center shrink-0">
              <Sparkles className="h-7 w-7 text-emerald-400 animate-pulse" />
            </div>
            <div className="flex-1 text-center sm:text-left space-y-1">
              <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400">Meta Diária Alcançada!</span>
              <p className="text-slate-200 font-extrabold text-base leading-relaxed">
                "{FUNNY_CELEBRATION_MESSAGES[funnyMsgIndex]}"
              </p>
            </div>
            <button
              onClick={shuffleFunnyMessage}
              title="Trocar mensagem divertida"
              className="p-2 py-1.5 text-xs text-emerald-400 hover:text-white bg-emerald-950/40 hover:bg-emerald-900/60 rounded-xl border border-emerald-800/40 flex items-center gap-1.5 shrink-0 transition-all active:scale-95"
            >
              <Shuffle className="h-3.5 w-3.5" />
              <span>Outro Conselho</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* Grid of Key Analytical Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total monthly expenses */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black tracking-wider text-slate-450 uppercase">Gastos do Mês</span>
            <div className="h-7 w-7 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-red-400 rotate-180" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-black text-rose-450 font-mono block leading-none">
              {formatBRL(totalExpenses)}
            </span>
            <p className="text-[10.5px] text-slate-400 mt-1.5 flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-slate-500" />
              <span>{bills.length} contas integradas</span>
            </p>
          </div>
        </div>

        {/* Days worked configuration */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black tracking-wider text-slate-450 uppercase">Dias Trabalhados</span>
            <div className="h-7 w-7 rounded-lg bg-brand-cyan/10 border border-brand-cyan/15 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-brand-cyan" />
            </div>
          </div>
          <div className="mt-3.5 flex items-center gap-3">
            <div className="flex items-center bg-slate-950 rounded-xl border border-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setDaysWorked(Math.max(1, daysWorked - 1))}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-850 cursor-pointer transition-all"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                max="31"
                value={daysWorked}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val > 0) {
                    setDaysWorked(Math.min(31, val));
                  }
                }}
                className="w-10 text-center font-mono font-bold bg-transparent border-none text-slate-105 outline-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => setDaysWorked(Math.min(31, daysWorked + 1))}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-850 cursor-pointer transition-all"
              >
                +
              </button>
            </div>
            <span className="text-[10px] text-slate-450 font-bold leading-tight">Dias no mês</span>
          </div>
        </div>

        {/* Calculated daily goal */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between ring-1 ring-brand-magenta/15">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black tracking-wider text-brand-magenta uppercase">Meta de Venda Diária</span>
            <div className="h-7 w-7 rounded-lg bg-brand-magenta/10 border border-brand-magenta/25 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-brand-magenta" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-black text-brand-magenta font-mono block leading-none">
              {formatBRL(dailyGoal)}
            </span>
            <p className="text-[10.5px] text-slate-400 mt-1.5 flex items-center gap-1" title="Gastos Totais / Dias Trabalhados">
              <Calculator className="h-3.5 w-3.5 text-slate-500" />
              <span>Exigido ao dia</span>
            </p>
          </div>
        </div>

        {/* Today's actual live profit */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black tracking-wider text-slate-450 uppercase">Seu Lucro Real (Hoje)</span>
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-black text-emerald-400 font-mono block leading-none">
              {formatBRL(todayNetProfit)}
            </span>
            <span className="text-[10.5px] text-slate-400 mt-1.5 block">
              {todayNetProfit >= dailyGoal ? (
                <span className="text-emerald-400 font-bold">✓ Excedeu a meta diária</span>
              ) : dailyGoal > 0 ? (
                <span className="text-amber-500">Falta {formatBRL(remainingToGoal)}</span>
              ) : (
                <span>Sem meta ativa</span>
              )}
            </span>
          </div>
        </div>

        {/* Goal status indicator card */}
        <div className={`border rounded-2xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between ${
          isGoalBeaten 
            ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400 shadow-emerald-950/10" 
            : "bg-slate-900/80 border-slate-800 text-slate-300"
        }`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black tracking-wider uppercase">Status da Meta</span>
            <div className={`h-6 w-6 rounded-full flex items-center justify-center ${isGoalBeaten ? "bg-emerald-400/20" : "bg-slate-800"}`}>
              <div className={`h-2.5 w-2.5 rounded-full ${isGoalBeaten ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-xl font-black block leading-tight">
              {isGoalBeaten ? "META BATIDA!" : dailyGoal > 0 ? "PENDENTE" : "SEM GASTOS"}
            </span>
            <p className="text-[10.5px] text-slate-400 mt-1 min-h-[1rem]">
              {isGoalBeaten 
                ? "Parabéns! Venceu hoje! 🎉" 
                : dailyGoal > 0 
                  ? `${Math.round(goalProgressPercent)}% concluído` 
                  : "Insira gastos!"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Progress timeline visual bar */}
      {dailyGoal > 0 && (
        <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-850 space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">Progresso da Meta de Vendas de Hoje</span>
            <span className={isGoalBeaten ? "text-emerald-400 font-bold" : "text-brand-magenta font-bold"}>
              {formatBRL(todayNetProfit)} / {formatBRL(dailyGoal)} ({Math.round(goalProgressPercent)}%)
            </span>
          </div>
          <div className="h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${goalProgressPercent}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={`h-full rounded-full ${
                isGoalBeaten 
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400" 
                  : "bg-gradient-to-r from-brand-magenta to-brand-cyan"
              }`}
            />
          </div>
        </div>
      )}

      {/* Monthly Bills Master Table / CRUD Screen */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Layers className="h-4.5 w-4.5 text-brand-magenta" />
              <span>Lista de Gastos Cadastrados ({filteredBills.length})</span>
            </h3>
            <p className="text-xs text-slate-450 mt-0.5">Clique nos botões de ação para alterar ou remover obrigações mensais.</p>
          </div>

          {/* Quick Category Filter Selector */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <span className="text-[10px] font-bold text-slate-450 uppercase shrink-0">Filtrar:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-950 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-800 focus:border-brand-magenta/60 outline-none flex-grow sm:flex-grow-0"
            >
              <option value="Todos">Todas Categorias</option>
              {BILL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bills Table Container */}
        <div className="overflow-x-auto">
          {filteredBills.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <div className="text-4xl">🧾</div>
              <p className="font-medium text-sm">
                {categoryFilter === "Todos" 
                  ? "Nenhum gasto mensal cadastrado no momento." 
                  : `Nenhum gasto encontrado na categoria "${categoryFilter}".`
                }
              </p>
              {categoryFilter === "Todos" && (
                <button
                  onClick={openAddForm}
                  className="mt-3 text-xs text-brand-magenta font-black hover:underline cursor-pointer"
                >
                  Cadastre o seu primeiro gasto mensal agora! →
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/20 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="p-4 pl-6">Nome do Gasto</th>
                  <th className="p-4">Categoria</th>
                  <th className="p-4">Vencimento</th>
                  <th className="p-4">Observação / Nota</th>
                  <th className="p-4 text-right">Valor</th>
                  <th className="p-4 pr-6 text-center w-24">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-850/30 transition-colors group">
                    <td className="p-4 pl-6 text-slate-205 font-bold">
                      {bill.name}
                    </td>
                    <td className="p-4">
                      <span className="inline-flex text-[10.5px] font-bold px-2.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-350">
                        {bill.category}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-500" />
                        <span>
                          {bill.dueDate ? (
                            // Simply separate YYYY-MM-DD back to human output
                            bill.dueDate.split("-").length === 3 
                              ? `${bill.dueDate.split("-")[2]}/${bill.dueDate.split("-")[1]}/${bill.dueDate.split("-")[0]}`
                              : bill.dueDate
                          ) : (
                            "Sem data"
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-xs text-slate-400 max-w-xs truncate" title={bill.observation}>
                      {bill.observation ? (
                        <div className="flex items-center gap-1">
                          <StickyNote className="h-3 w-3 text-slate-500 shrink-0" />
                          <span>{bill.observation}</span>
                        </div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-red-400">
                      {formatBRL(bill.value)}
                    </td>
                    <td className="p-4 pr-6 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditForm(bill)}
                          title="Editar registro"
                          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-brand-cyan transition-all cursor-pointer"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteBill(bill)}
                          title="Remover registro"
                          className="p-1.5 rounded hover:bg-red-950/20 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Unified Add/Edit Form Modal overlay */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden"
            >
              <div className="p-6 border-b border-slate-800 bg-slate-950/10 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {editingBillId ? "Editar Gasto Mensal" : "Adicionar Gasto Mensal"}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Preencha os dados abaixo. Eles serão salvos localmente e computados na meta diária.
                  </p>
                </div>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-lg h-8 w-8 flex items-center justify-center bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-805 transition-all text-sm outline-none shrink-0"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveBill} className="p-6 space-y-4">
                {/* Bill Title Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Nome do Gasto</label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    required
                    placeholder="Ex: Aluguel da Loja, Internet Banda Larga, Luz"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-brand-magenta outline-none transition-colors"
                  />
                </div>

                {/* Value & Due Date split */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Monthly Value */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Valor Mensal (R$)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-2.5 text-xs text-slate-500 font-bold font-mono">R$</span>
                      <input
                        type="text"
                        required
                        placeholder="0,00"
                        value={formValue}
                        onChange={(e) => setFormValue(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 font-mono focus:border-brand-magenta outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Due Date */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Vencimento</label>
                    <input
                      type="date"
                      required
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono focus:border-brand-magenta outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Category Dropdown Selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Categoria do Gasto</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:border-brand-magenta outline-none transition-colors"
                  >
                    {BILL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Optional Note Or Observation */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Observação / Nota (Opcional)</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Pagar via Pix chave CNPJ ou código de barras."
                    value={formObservation}
                    onChange={(e) => setFormObservation(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-650 focus:border-brand-magenta outline-none transition-colors resize-none"
                  />
                </div>

                {/* Action Buttons inside Modal */}
                <div className="pt-4 border-t border-slate-850 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="bg-slate-850 hover:bg-slate-800 hover:text-white text-slate-400 rounded-xl px-4 py-2.5 text-xs font-extrabold cursor-pointer transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-brand-magenta to-brand-magenta/80 hover:from-brand-magenta/90 text-white font-black rounded-xl px-6 py-2.5 text-xs shadow-lg shadow-brand-magenta/20 transition-all cursor-pointer"
                  >
                    {editingBillId ? "Salvar Alterações" : "Confirmar Cadastro"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal for Deleting Bills */}
      <AnimatePresence>
        {billToDelete && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden"
            >
              <div className="p-5 border-b border-slate-800 bg-red-950/10 flex items-center gap-3">
                <div className="h-10 w-10 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-100">Excluir Gasto Mensal?</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Tem certeza que deseja remover o gasto <strong className="text-white">"{billToDelete.name}"</strong> no valor de <strong className="text-red-400">{formatBRL(billToDelete.value)}</strong>?
                </p>
                
                <div className="pt-2 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setBillToDelete(null)}
                    className="bg-slate-850 hover:bg-slate-800 hover:text-white text-slate-400 rounded-xl px-4 py-2 text-xs font-bold cursor-pointer transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    className="bg-red-650 hover:bg-red-600 active:scale-95 text-white font-black rounded-xl px-5 py-2 text-xs transition-all cursor-pointer"
                  >
                    Confirmar Exclusão
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
