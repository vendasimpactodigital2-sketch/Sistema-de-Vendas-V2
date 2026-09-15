import { DollarSign, ShieldAlert, BadgePercent, TrendingUp, HandCoins, Truck, LayoutDashboard, Trophy, Sparkles, PartyPopper } from "lucide-react";
import React, { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { Sale, Expense, getSaleOrderDate, getSaleOperationCost, isQuickSaleClient } from "../types";

interface MetricsCardsProps {
  sales: Sale[];
  expenses?: Expense[];
  filterPeriod?: "all" | "today" | "week" | "month" | "custom";
  customDate?: string;
  customStartDate?: string;
  customEndDate?: string;
  isDailyGoalAchieved?: boolean;
  dailyGoalValue?: number;
  onPendingClick?: () => void;
  onWeeklyGoalClick?: () => void;
  onCardClick?: (cardType: "faturamento" | "entradas" | "pendentes" | "custos" | "lucro") => void;
}

export function MetricsCards({ 
  sales, 
  expenses = [], 
  filterPeriod = "today",
  customDate = "",
  customStartDate = "",
  customEndDate = "",
  isDailyGoalAchieved,
  dailyGoalValue = 0,
  onPendingClick,
  onWeeklyGoalClick,
  onCardClick
}: MetricsCardsProps) {
  
  // Local timezone safe date utility helper
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
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      return clean.substring(0, 10);
    }
  };

  // Target local dates matching user system timezone
  const localDate = new Date();
  const todayStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
  const targetDateStr = filterPeriod === "custom" && customDate ? customDate : todayStr;

  const oneWeekAgo = new Date();
  oneWeekAgo.setHours(0, 0, 0, 0);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  // Check if date falls in selected period
  const isDateInPeriod = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const itemLocalDate = getLocalDateFromISO(dateStr);
    
    if (filterPeriod === "today") {
      return itemLocalDate === todayStr;
    }
    if (filterPeriod === "custom") {
      if (customStartDate && customEndDate) {
        return itemLocalDate >= customStartDate && itemLocalDate <= customEndDate;
      }
      return itemLocalDate === targetDateStr;
    }
    if (filterPeriod === "week") {
      try {
        return new Date(dateStr) >= oneWeekAgo;
      } catch (e) {
        return false;
      }
    }
    return true; // "all"
  };

  // 2. Entradas do Período (O que entrou de CAIXA real no período: downPayments + parciais/baixas no período!)
  let totalRevenuePaid = 0;
  sales.forEach(sale => {
    if (sale.isBudget) return;
    if (sale.payments && sale.payments.length > 0) {
      sale.payments.forEach(payment => {
        if (isDateInPeriod(payment.date)) {
          totalRevenuePaid += payment.amount;
        }
      });
    } else {
      // Legacy fallback
      if (sale.downPayment > 0 && isDateInPeriod(sale.date)) {
        totalRevenuePaid += sale.downPayment;
      }
    }
  });

  // 1. Faturamento Total (Soma de todos os serviços/vendas fechados na data/período selecionada - Bruto Gerado)
  const salesInPeriod = sales.filter((s) => !s.isBudget && isDateInPeriod(getSaleOrderDate(s)));
  const totalSalesValue = salesInPeriod.reduce((sum, s) => sum + s.totalValue, 0);

  // 3. Pendentes de Caixa (Saldo devedor total acumulado geral de clientes identificados - Backlog)
  const pendingSalesList = sales.filter((s) => !s.isBudget && !isQuickSaleClient(s.clientName) && (s.balanceDue || 0) > 0.001);
  const totalPending = pendingSalesList.reduce((sum, sale) => sum + (sale.balanceDue || 0), 0);
  const activePendingCount = pendingSalesList.length;

  // Extra indicators (Discounts and motoboy costs are part of the order date setup)
  const totalMotoboy = sales
    .filter((s) => !s.isBudget)
    .reduce((sum, sale) => {
      const orderDate = getSaleOrderDate(sale);
      if (isDateInPeriod(orderDate) && sale.useMotoboy) {
        return sum + sale.motoboyCost;
      }
      return sum;
    }, 0);

  // 4. Custos Operacionais do período (standalone expenses + custos diretos de vendas do período + motoboy)
  const expensesInPeriod = expenses.filter((e) => {
    const isInPeriod = isDateInPeriod(e.date);
    const isWithdrawal = e.description && /retirada|sangria/i.test(e.description);
    return isInPeriod && !isWithdrawal;
  });
  const totalStandaloneExpenses = expensesInPeriod.reduce((sum, exp) => sum + exp.value, 0);
  const totalSaleOperationCost = sales
    .filter((s) => !s.isBudget)
    .reduce((sum, sale) => {
      const orderDate = getSaleOrderDate(sale);
      if (isDateInPeriod(orderDate)) {
        return sum + getSaleOperationCost(sale);
      }
      return sum;
    }, 0);
  const totalOperationCost = totalSaleOperationCost + totalStandaloneExpenses + totalMotoboy;

  // 5. Lucro Líquido Real do Período (Recebimentos do período - Custos operacionais do período)
  const totalNetProfit = totalRevenuePaid - totalOperationCost;

  const totalDiscount = sales
    .filter((s) => !s.isBudget)
    .reduce((sum, sale) => {
      const orderDate = getSaleOrderDate(sale);
      if (isDateInPeriod(orderDate)) {
        return sum + sale.discount;
      }
      return sum;
    }, 0);

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  // Check if daily goal is reached
  const effectiveIsDailyGoalAchieved = React.useMemo(() => {
    if (typeof isDailyGoalAchieved === "boolean") {
      return isDailyGoalAchieved;
    }
    // Fallback detection from storage or props
    try {
      if (dailyGoalValue > 0 && totalNetProfit >= dailyGoalValue) {
        return true;
      }
      const savedGoal = localStorage.getItem("NUCLEO_GOAL_VALUE");
      const parsedGoal = savedGoal ? parseFloat(savedGoal.replace(/\./g, "").replace(",", ".")) : 0;
      if (parsedGoal > 0 && totalNetProfit >= parsedGoal) return true;

      const weekdayGoals = localStorage.getItem("NUCLEO_WEEKDAY_GOALS");
      if (weekdayGoals) {
        const parsedWeekday = JSON.parse(weekdayGoals);
        const todayDay = new Date().getDay();
        const goalToday = parsedWeekday[todayDay];
        if (typeof goalToday === "number" && goalToday > 0 && totalNetProfit >= goalToday) {
          return true;
        }
      }
    } catch {
      // ignore
    }
    return false;
  }, [isDailyGoalAchieved, dailyGoalValue, totalNetProfit]);

  const hasFiredCelebrationRef = useRef(false);

  useEffect(() => {
    if (effectiveIsDailyGoalAchieved && !hasFiredCelebrationRef.current) {
      hasFiredCelebrationRef.current = true;
      try {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.65 },
          colors: ['#10b981', '#34d399', '#f43f5e', '#ec4899', '#fbbf24', '#06b6d4']
        });
      } catch {
        // ignore
      }
    } else if (!effectiveIsDailyGoalAchieved) {
      hasFiredCelebrationRef.current = false;
    }
  }, [effectiveIsDailyGoalAchieved]);

  const triggerCardConfetti = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (effectiveIsDailyGoalAchieved) {
      try {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (rect.left + rect.width / 2) / window.innerWidth;
        const y = (rect.top + rect.height / 2) / window.innerHeight;
        confetti({
          particleCount: 45,
          spread: 60,
          origin: { x, y },
          colors: ['#10b981', '#34d399', '#f43f5e', '#ec4899', '#fbbf24', '#06b6d4']
        });
      } catch {
        // ignore
      }
    }
  };

  const periodLabelStr = 
    filterPeriod === "today" ? "hoje" : 
    filterPeriod === "week" ? "na semana" : 
    filterPeriod === "custom" ? `em ${targetDateStr.split("-").reverse().join("/")}` : 
    "acumulado";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {/* 1. Sinais Recebidos (Dinheiro de Entrada) */}
      <button
        type="button"
        id="card-entradas"
        onClick={() => onCardClick?.("entradas")}
        className="relative text-left group overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-3.5 xs:p-4 sm:p-5 hover:border-brand-cyan/40 hover:bg-slate-900/90 transition-all duration-300 cursor-pointer select-none active:scale-[0.99]"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-brand-cyan/5 rounded-full blur-2xl group-hover:bg-brand-cyan/10 transition-all"></div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] xs:text-xs font-medium text-slate-400 uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span>Entradas / Sinais</span>
              <span className="text-[8px] xs:text-[9px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-brand-cyan font-mono tracking-tight font-bold uppercase whitespace-nowrap">
                {periodLabelStr}
              </span>
            </p>
            <h3 className="mt-1 sm:mt-2 text-lg xs:text-xl sm:text-2xl font-bold font-mono text-brand-cyan tracking-tight truncate">
              {formatBRL(totalRevenuePaid)}
            </h3>
            <p className="mt-1 sm:mt-1.5 text-[10px] xs:text-xs text-slate-400 flex flex-wrap items-center gap-1 leading-normal">
              <span className="truncate">Inflow real de caixa {filterPeriod === "today" ? "(hoje)" : filterPeriod === "week" ? "(semana)" : filterPeriod === "custom" ? "(período)" : "(acumulado)"}</span>
              <span className="text-brand-cyan font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[9px] sm:text-[11px]">→ ver baixas</span>
            </p>
          </div>
          <div className="p-2.5 xs:p-3 bg-brand-cyan/10 rounded-xl border border-brand-cyan/20 text-brand-cyan shadow-inner group-hover:bg-brand-cyan/20 transition-colors shrink-0">
            <HandCoins className="h-4 w-4 xs:h-5 xs:w-5" />
          </div>
        </div>
      </button>

      {/* 2. Custos Operacionais (Gastos) */}
      <button
        type="button"
        id="card-custos"
        onClick={() => onCardClick?.("custos")}
        className="relative text-left group overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-3.5 xs:p-4 sm:p-5 hover:border-red-500/40 hover:bg-slate-900/90 transition-all duration-300 cursor-pointer select-none active:scale-[0.99]"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all"></div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] xs:text-xs font-medium text-slate-400 uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span>Custos Operacionais</span>
              <span className="text-[8px] xs:text-[9px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-red-400 font-mono tracking-tight lowercase whitespace-nowrap">
                {periodLabelStr}
              </span>
            </p>
            <h3 className="mt-1 sm:mt-2 text-lg xs:text-xl sm:text-2xl font-bold font-mono text-red-400 tracking-tight truncate">
              {formatBRL(totalOperationCost)}
            </h3>
            <p className="mt-1 sm:mt-1.5 text-[10px] xs:text-xs text-slate-400 flex flex-wrap items-center gap-1 leading-normal">
              <span className="truncate">Gastos e insumos vinculados</span>
              <span className="text-red-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[9px] sm:text-[11px]">→ gerenciar</span>
            </p>
          </div>
          <div className="p-2.5 xs:p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-red-500 shadow-inner group-hover:bg-red-500/20 transition-colors shrink-0">
            <BadgePercent className="h-4 w-4 xs:h-5 xs:w-5" />
          </div>
        </div>
      </button>

      {/* 3. Lucro Líquido Total - PROEMINENT CARD with a gorgeous dual gradient border */}
      <button
        type="button"
        id="card-lucro"
        onClick={(e) => {
          triggerCardConfetti(e);
          onCardClick?.("lucro");
        }}
        className={`relative text-left group overflow-hidden rounded-2xl p-3.5 xs:p-4 sm:p-5 lg:col-span-1 cursor-pointer select-none active:scale-[0.99] transition-all duration-500 ${
          effectiveIsDailyGoalAchieved
            ? "bg-gradient-to-br from-emerald-950/70 via-slate-900 to-teal-950/60 border-2 border-emerald-400 shadow-xl shadow-emerald-500/20 ring-2 ring-emerald-400/40 hover:border-emerald-300 hover:shadow-2xl hover:shadow-emerald-500/30"
            : "bg-gradient-to-br from-brand-card to-slate-900 border-2 border-brand-cyan/30 shadow-lg shadow-brand-cyan/5 hover:border-brand-cyan/60 hover:bg-slate-900/90"
        }`}
      >
        {effectiveIsDailyGoalAchieved ? (
          <>
            <div className="absolute -right-4 -top-4 w-36 h-36 bg-gradient-to-br from-emerald-400 to-teal-400 opacity-25 rounded-full blur-2xl animate-pulse"></div>
            <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-emerald-400 via-teal-300 to-yellow-400 animate-pulse"></div>
          </>
        ) : (
          <div className="absolute -right-4 -top-4 w-32 h-32 bg-gradient-to-br from-brand-cyan to-brand-magenta opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-all"></div>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
            <p className="text-[9px] xs:text-[10px] font-bold uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span className={effectiveIsDailyGoalAchieved ? "text-emerald-300 font-black flex items-center gap-1" : "text-brand-cyan"}>
                {effectiveIsDailyGoalAchieved && <Sparkles className="h-3 w-3 text-yellow-300 animate-bounce" />}
                ✨ LUCRO REAL DO PERÍODO
              </span>
              <span className={`text-[7.5px] xs:text-[8px] px-1 py-0.2 rounded border font-mono lowercase tracking-normal whitespace-nowrap ${
                effectiveIsDailyGoalAchieved
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/30"
                  : "bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20"
              }`}>
                {periodLabelStr}
              </span>
              {effectiveIsDailyGoalAchieved && (
                <span className="inline-flex items-center gap-1 text-[8px] xs:text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-200 font-black border border-emerald-400/50 shadow-sm animate-pulse tracking-tight whitespace-nowrap">
                  <Trophy className="h-2.5 w-2.5 text-yellow-300" />
                  META ATINGIDA 🏆
                </span>
              )}
            </p>
            <h3 className={`text-lg xs:text-xl sm:text-2xl font-extrabold font-mono tracking-tight truncate ${
              effectiveIsDailyGoalAchieved
                ? "text-emerald-300 drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]"
                : "text-transparent bg-clip-text bg-gradient-to-r from-brand-cyan via-emerald-400 to-brand-magenta"
            }`}>
              {formatBRL(totalNetProfit)}
            </h3>
            <p className={`text-[10px] xs:text-[11px] leading-normal truncate ${
              effectiveIsDailyGoalAchieved ? "text-emerald-200/90 font-medium" : "text-slate-300"
            }`}>
              {effectiveIsDailyGoalAchieved ? "🎉 Parabéns! O alvo diário foi superado hoje!" : "Recebimentos reais - Custos operacionais do período"}
            </p>
            <p className={`text-[9px] xs:text-[10px] italic leading-none truncate ${
              effectiveIsDailyGoalAchieved ? "text-emerald-300/70" : "text-slate-450"
            }`}>
              {effectiveIsDailyGoalAchieved ? "(Clique para celebrar com confetes! 🎊)" : "(Ganhos livres no período considerado)"}
            </p>
          </div>
          <div className={`rounded-xl text-white shadow-xl transition-all duration-300 shrink-0 ${
            effectiveIsDailyGoalAchieved
              ? "p-2.5 xs:p-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-emerald-500/30 group-hover:scale-110 ring-2 ring-emerald-300/50"
              : "p-2 xs:p-2.5 bg-gradient-to-r from-brand-cyan to-brand-magenta shadow-brand-cyan/20 group-hover:scale-105"
          }`}>
            {effectiveIsDailyGoalAchieved ? (
              <Trophy className="h-4 w-4 xs:h-5 xs:w-5 text-yellow-300 animate-bounce" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5 xs:h-4 xs:w-4" />
            )}
          </div>
        </div>
      </button>

      {/* 4. Faturamento Bruto (Total Vendas) */}
      <button
        type="button"
        id="card-faturamento"
        onClick={(e) => {
          triggerCardConfetti(e);
          onCardClick?.("faturamento");
        }}
        className={`relative text-left group overflow-hidden rounded-2xl p-3.5 xs:p-4 sm:p-5 cursor-pointer select-none active:scale-[0.99] transition-all duration-500 ${
          effectiveIsDailyGoalAchieved
            ? "bg-gradient-to-br from-pink-950/60 via-slate-900 to-purple-950/60 border-2 border-brand-magenta shadow-xl shadow-brand-magenta/20 ring-2 ring-brand-magenta/35 hover:border-pink-400 hover:shadow-2xl hover:shadow-brand-magenta/30"
            : "bg-slate-900 border border-slate-800 hover:border-brand-magenta/40 hover:bg-slate-900/90"
        }`}
      >
        {effectiveIsDailyGoalAchieved ? (
          <>
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-magenta/20 rounded-full blur-2xl animate-pulse"></div>
            <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-brand-magenta via-pink-400 to-yellow-400 animate-pulse"></div>
          </>
        ) : (
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-magenta/5 rounded-full blur-2xl group-hover:bg-brand-magenta/10 transition-all"></div>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] xs:text-xs font-medium uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span className={effectiveIsDailyGoalAchieved ? "text-pink-300 font-bold" : "text-slate-400"}>
                Entrada de Serviços
              </span>
              <span className={`text-[8px] xs:text-[9px] px-1.5 py-0.5 rounded border font-mono tracking-tight lowercase whitespace-nowrap ${
                effectiveIsDailyGoalAchieved
                  ? "bg-brand-magenta/20 text-pink-300 border-brand-magenta/30"
                  : "bg-slate-950 text-slate-400 border-slate-800"
              }`}>
                {periodLabelStr}
              </span>
              {effectiveIsDailyGoalAchieved && (
                <span className="inline-flex items-center gap-1 text-[8px] xs:text-[9px] px-2 py-0.5 rounded-full bg-brand-magenta/20 text-pink-200 font-bold border border-pink-400/40 shadow-sm animate-pulse tracking-tight whitespace-nowrap">
                  <Sparkles className="h-2.5 w-2.5 text-pink-300" />
                  EM ALTA ✨
                </span>
              )}
            </p>
            <h3 className={`mt-1 sm:mt-2 text-lg xs:text-xl sm:text-2xl font-bold font-mono tracking-tight truncate ${
              effectiveIsDailyGoalAchieved
                ? "text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-rose-200 to-yellow-200 drop-shadow-[0_0_12px_rgba(244,63,94,0.4)]"
                : "text-white"
            }`}>
              {formatBRL(totalSalesValue)}
            </h3>
            <p className="mt-1 sm:mt-1.5 text-[10px] xs:text-xs text-slate-400 flex flex-wrap items-center gap-1 leading-normal">
              <span className={`truncate ${effectiveIsDailyGoalAchieved ? "text-pink-200/90 font-medium" : "text-slate-400"}`}>
                {effectiveIsDailyGoalAchieved ? "🔥 Faturamento impulsionado pela meta diária batida!" : "Valor bruto total dos serviços fechados"}
              </span>
              <span className="text-brand-magenta font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[9px] sm:text-[11px]">→ ver lista</span>
            </p>
          </div>
          <div className={`rounded-xl shadow-inner transition-all duration-300 shrink-0 ${
            effectiveIsDailyGoalAchieved
              ? "p-2.5 xs:p-3 bg-gradient-to-r from-brand-magenta to-rose-500 border border-pink-400/40 text-white shadow-pink-500/25 group-hover:scale-110 ring-2 ring-pink-400/30"
              : "p-2.5 xs:p-3 bg-brand-magenta/10 border border-brand-magenta/20 text-brand-magenta group-hover:bg-brand-magenta/20"
          }`}>
            {effectiveIsDailyGoalAchieved ? (
              <PartyPopper className="h-4 w-4 xs:h-5 xs:w-5 text-yellow-300 animate-bounce" />
            ) : (
              <DollarSign className="h-4 w-4 xs:h-5 xs:w-5" />
            )}
          </div>
        </div>
      </button>

      {/* 5. Valores Pendentes (Clicável para controle de retiradas) */}
      <button
        type="button"
        id="card-pendentes"
        onClick={() => {
          onPendingClick?.();
          onCardClick?.("pendentes");
        }}
        className={`relative text-left group overflow-hidden rounded-2xl bg-slate-900 border p-3.5 xs:p-4 sm:p-5 transition-all duration-300 cursor-pointer select-none active:scale-[0.99] ${
          totalPending > 0
            ? "border-yellow-600/60 hover:border-yellow-500 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-yellow-500/5 hover:-translate-y-0.5"
            : "border-slate-800"
        }`}
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-full blur-2xl group-hover:bg-yellow-500/10 transition-all"></div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] xs:text-xs font-medium text-slate-400 uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span>Pendentes a Receber</span>
              {activePendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-yellow-500 text-slate-950 font-bold font-mono text-[8px] xs:text-[9px] scale-95 origin-left whitespace-nowrap">
                  {activePendingCount}
                </span>
              )}
            </p>
            <h3 className="mt-1 sm:mt-2 text-lg xs:text-xl sm:text-2xl font-bold font-mono text-yellow-500 tracking-tight truncate">
              {formatBRL(totalPending)}
            </h3>
            <p className="mt-1 sm:mt-1.5 text-[10px] xs:text-xs text-slate-400 truncate">
              {activePendingCount > 0 ? "👉 Clique para controlar" : "Nenhuma pendência"}
            </p>
          </div>
          <div className="p-2.5 xs:p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20 text-yellow-500 shadow-inner group-hover:bg-yellow-400 group-hover:text-slate-950 hover:scale-105 transition-all duration-300 shrink-0">
            <ShieldAlert className="h-4 w-4 xs:h-5 xs:w-5" />
          </div>
        </div>
      </button>

      {/* 6. Acompanhamento de Metas Semanais (Clicável para abrir calendário/metas) */}
      <button
        type="button"
        id="card-metas-semanais"
        onClick={() => onWeeklyGoalClick?.()}
        className="relative text-left group overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-3.5 xs:p-4 sm:p-5 hover:border-emerald-500/40 hover:bg-slate-900/90 transition-all duration-300 cursor-pointer select-none active:scale-[0.99]"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] xs:text-xs font-medium text-slate-400 uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span>Metas da Semana</span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold font-mono text-[8px] xs:text-[9px] uppercase whitespace-nowrap">
                7 dias
              </span>
            </p>
            <h3 className="mt-1 sm:mt-2 text-lg xs:text-xl sm:text-2xl font-bold font-mono text-emerald-400 tracking-tight truncate">
              Desempenho 🏆
            </h3>
            <p className="mt-1 sm:mt-1.5 text-[10px] xs:text-xs text-slate-400 truncate">
              👉 Ver quem bateu a meta
            </p>
          </div>
          <div className="p-2.5 xs:p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400 shadow-inner group-hover:bg-emerald-500 group-hover:text-slate-950 hover:scale-105 transition-all duration-300 shrink-0">
            <Trophy className="h-4 w-4 xs:h-5 xs:w-5" />
          </div>
        </div>
      </button>

      {/* Extra helper stats */}
      <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 bg-slate-900/60 p-2.5 xs:p-3 rounded-xl border border-slate-800 text-[11px] xs:text-xs text-slate-400 font-mono">
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 flex items-center gap-1 truncate"><Truck className="h-3.5 w-3.5" /> Motoboys:</span>
          <span className="text-brand-cyan font-bold whitespace-nowrap">{formatBRL(totalMotoboy)}</span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 flex items-center gap-1 truncate">🏷️ Descontos:</span>
          <span className="text-brand-magenta font-bold whitespace-nowrap">{formatBRL(totalDiscount)}</span>
        </div>
        <div className="xs:col-span-2 md:col-span-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 flex items-center gap-1 truncate"><LayoutDashboard className="h-3.5 w-3.5" /> Pedidos:</span>
          <span className="text-slate-200 font-bold whitespace-nowrap">{salesInPeriod.length}</span>
        </div>
      </div>
    </div>
  );
}
