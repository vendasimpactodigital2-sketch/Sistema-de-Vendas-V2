import {
  TrendingUp,
  Award,
  DollarSign,
  TrendingDown,
  Info,
  Layers,
  Sparkles,
  Percent,
  Target,
  Trophy,
  Volume2,
  CheckCircle2
} from "lucide-react";
import React, { useState } from "react";
import { Sale, getSaleOrderDate, getSaleOperationCost, isQuickSaleClient } from "../types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-950 border border-slate-850 p-3 rounded-xl shadow-2xl font-mono text-xs text-left">
        <p className="text-slate-300 font-bold mb-1 border-b border-slate-800 pb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="flex justify-between gap-4 py-0.5">
            <span className="font-semibold">{entry.name}:</span>
            <span className="font-bold">
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(entry.value)}
            </span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

interface DashboardChartsProps {
  sales: Sale[];
  expenses?: any[];
  goalValue: number;
  setGoalValue: (val: number) => void;
  goalType: "daily" | "overall";
  setGoalType: (type: "daily" | "overall") => void;
  onPlayBeep: () => void;
  filterPeriod: "all" | "today" | "week" | "month" | "custom";
  setFilterPeriod: (period: "all" | "today" | "week" | "month" | "custom") => void;
  customDate: string;
  setCustomDate: (date: string) => void;
  customStartDate?: string;
  customEndDate?: string;
}

export function DashboardCharts({
  sales,
  expenses = [],
  goalValue,
  setGoalValue,
  goalType,
  setGoalType,
  onPlayBeep,
  filterPeriod,
  setFilterPeriod,
  customDate,
  setCustomDate,
  customStartDate = "",
  customEndDate = ""
}: DashboardChartsProps) {

  // helper to group and sort sales by month for the line chart
  const getMonthlyRevenueData = () => {
    const groups: { [key: string]: { monthKey: string; faturamento: number; lucro: number } } = {};
    
    // Process all sales to make a proper monthly evolution based on actual payment entries instead of order totals
    sales.forEach((sale) => {
      if (sale.isBudget) return;
      
      // First, operation costs are deducted from the month of the sale date
      if (sale.date) {
        const d = new Date(sale.date);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const key = `${year}-${month}`;
          
          if (!groups[key]) {
            groups[key] = { monthKey: key, faturamento: 0, lucro: 0 };
          }
          groups[key].lucro -= sale.operationCost;
        }
      }

      // Record payments into their correct payment month
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach(payment => {
          if (!payment.date) return;
          const d = new Date(payment.date);
          if (isNaN(d.getTime())) return;
          
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const key = `${year}-${month}`;
          
          if (!groups[key]) {
            groups[key] = { monthKey: key, faturamento: 0, lucro: 0 };
          }
          groups[key].faturamento += payment.amount;
          groups[key].lucro += payment.amount;
        });
      } else {
        if (sale.downPayment > 0 && sale.date) {
          const d = new Date(sale.date);
          if (isNaN(d.getTime())) return;
          
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const key = `${year}-${month}`;
          
          if (!groups[key]) {
            groups[key] = { monthKey: key, faturamento: 0, lucro: 0 };
          }
          groups[key].faturamento += sale.downPayment;
          groups[key].lucro += sale.downPayment;
        }
      }
    });

    const sortedKeys = Object.keys(groups).sort();
    
    if (sortedKeys.length === 0) {
      return [];
    }

    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    
    return sortedKeys.map((key) => {
      const [year, month] = key.split("-");
      const monthIndex = parseInt(month, 10) - 1;
      const label = `${monthNames[monthIndex]}/${year.slice(2)}`;
      return {
        key,
        label,
        faturamento: Number(groups[key].faturamento.toFixed(2)),
        lucro: Number(groups[key].lucro.toFixed(2)),
      };
    });
  };

  const monthlyData = getMonthlyRevenueData();

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

  const filterSales = () => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setHours(0, 0, 0, 0);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return sales.filter((sale) => {
      if (!sale.date) return false;
      const saleLocalDate = getLocalDateFromISO(sale.date);
      if (filterPeriod === "today") {
        return saleLocalDate === todayStr;
      }
      if (filterPeriod === "week") {
        return new Date(sale.date) >= oneWeekAgo;
      }
      if (filterPeriod === "custom") {
        if (customStartDate && customEndDate) {
          return saleLocalDate >= customStartDate && saleLocalDate <= customEndDate;
        }
        return saleLocalDate === customDate;
      }
      return true;
    });
  };

  const activeSales = filterSales();

  // Core metrics calculation
  // Local dates matching user system timezone
  const localDateObj = new Date();
  const dbTodayStr = `${localDateObj.getFullYear()}-${String(localDateObj.getMonth() + 1).padStart(2, '0')}-${String(localDateObj.getDate()).padStart(2, '0')}`;
  const dbOneWeekAgo = new Date();
  dbOneWeekAgo.setHours(0, 0, 0, 0);
  dbOneWeekAgo.setDate(dbOneWeekAgo.getDate() - 7);

  const isDateInSelectedPeriod = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const itemLocalDate = getLocalDateFromISO(dateStr);
    
    if (filterPeriod === "today") {
      return itemLocalDate === dbTodayStr;
    }
    if (filterPeriod === "custom") {
      if (customStartDate && customEndDate) {
        return itemLocalDate >= customStartDate && itemLocalDate <= customEndDate;
      }
      return itemLocalDate === customDate;
    }
    if (filterPeriod === "week") {
      try {
        return new Date(dateStr) >= dbOneWeekAgo;
      } catch (e) {
        return false;
      }
    }
    return true; // "all"
  };

  // 1. FATURAMENTO TOTAL: sums only the cash-inflow payment amounts in the period
  let totalSales = 0;
  sales.forEach(sale => {
    if (sale.isBudget) return;
    if (sale.payments && sale.payments.length > 0) {
      sale.payments.forEach(payment => {
        if (isDateInSelectedPeriod(payment.date)) {
          totalSales += payment.amount;
        }
      });
    } else {
      if (sale.downPayment > 0 && isDateInSelectedPeriod(sale.date)) {
        totalSales += sale.downPayment;
      }
    }
  });

  const totalExpenses = sales
    .filter((s) => !s.isBudget)
    .reduce((sum, s) => {
      const orderDate = getSaleOrderDate(s);
      if (isDateInSelectedPeriod(orderDate)) {
        return sum + getSaleOperationCost(s) + (s.useMotoboy ? (s.motoboyCost || 0) : 0);
      }
      return sum;
    }, 0);
  const totalNetProfit = totalSales - totalExpenses;
  const totalReceived = totalSales;
  const totalPending = sales.filter(s => !s.isBudget && !isQuickSaleClient(s.clientName)).reduce((sum, s) => sum + (s.balanceDue || 0), 0);

  // Average ticket (ticket médio)
  const averageTicket = activeSales.length > 0 ? totalSales / activeSales.length : 0;
  // Margin percentage
  const profitMarginPercent = totalSales > 0 ? (totalNetProfit / totalSales) * 100 : 0;

  // Local-date based Today's Date formatted string matching sales database
  const localDate = new Date();
  const todayStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
  
  // Calculate today's real net profit of sales: payments received today minus direct costs of sales created today
  let todayRevenueReceived = 0;
  let todaySalesCosts = 0;

  sales.forEach(sale => {
    if (sale.isBudget) return;
    
    // 1. Sum payments received today
    if (sale.payments && sale.payments.length > 0) {
      sale.payments.forEach(payment => {
        if (getLocalDateFromISO(payment.date) === todayStr) {
          todayRevenueReceived += payment.amount;
        }
      });
    } else {
      if (sale.downPayment > 0 && getLocalDateFromISO(sale.date) === todayStr) {
        todayRevenueReceived += sale.downPayment;
      }
    }

    // 2. Sum costs of sales ordered today
    const orderDate = getSaleOrderDate(sale);
    if (getLocalDateFromISO(orderDate) === todayStr) {
      const saleCost = getSaleOperationCost(sale);
      const motoboyCost = sale.useMotoboy ? (sale.motoboyCost || 0) : 0;
      todaySalesCosts += (saleCost + motoboyCost);
    }
  });

  const todaySalesNetProfit = todayRevenueReceived - todaySalesCosts;

  // Calculate today's general/standalone expenses excluding withdrawals/sangrias
  const todayExpensesValue = expenses
    ? expenses.filter(e => e.date && getLocalDateFromISO(e.date) === todayStr && !(e.description && /retirada|sangria/i.test(e.description))).reduce((sum, e) => sum + e.value, 0)
    : 0;

  const todayNetProfit = todaySalesNetProfit - todayExpensesValue;

  // Calculate raw sales all-time total net profit (Competence / Accrual basis)
  let totalSalesNetProfit = 0;
  sales.forEach(sale => {
    if (sale.isBudget) return;
    const saleCost = getSaleOperationCost(sale);
    const motoboyCost = sale.useMotoboy ? (sale.motoboyCost || 0) : 0;
    const profit = typeof sale.netProfit === 'number' ? sale.netProfit : (sale.totalValue - saleCost - motoboyCost);
    totalSalesNetProfit += profit;
  });

  const totalExpensesValue = expenses ? expenses.reduce((sum, e) => sum + e.value, 0) : 0;
  const allTimeNetProfit = totalSalesNetProfit - totalExpensesValue;

  // Goal analytics parameters
  const currentGoalProgress = goalType === "daily" ? todayNetProfit : allTimeNetProfit;
  const remainingToGoal = Math.max(0, goalValue - currentGoalProgress);
  const progressPercent = goalValue > 0 ? Math.min(100, (currentGoalProgress / goalValue) * 100) : 0;
  const isGoalAchieved = goalValue > 0 && currentGoalProgress >= goalValue;

  // Manage text fields with local state to prevent keystroke delays or formatting loops
  const [localInputVal, setLocalInputVal] = useState(goalValue > 0 ? String(goalValue) : "");

  React.useEffect(() => {
    setLocalInputVal(goalValue > 0 ? String(goalValue) : "");
  }, [goalValue]);

  const handleLocalGoalChange = (val: string) => {
    // allow typing decimals and numbers
    const cleaned = val.replace(/[^0-9,.]/g, "");
    setLocalInputVal(val); // Keep exact typing for the user
    
    let toParse = cleaned.trim();
    if (toParse === "") {
      setGoalValue(0);
      return;
    }
    
    if (toParse.includes(".") && toParse.includes(",")) {
      if (toParse.indexOf(".") < toParse.indexOf(",")) {
        toParse = toParse.replace(/\./g, "").replace(",", ".");
      } else {
        toParse = toParse.replace(/,/g, "");
      }
    } else if (toParse.includes(",")) {
      toParse = toParse.replace(",", ".");
    } else if (toParse.includes(".")) {
      const parts = toParse.split(".");
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 3) {
        toParse = toParse.replace(/\./g, "");
      }
    }
    
    const num = parseFloat(toParse);
    if (!isNaN(num) && num >= 0) {
      setGoalValue(num);
    }
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  // Safe max for scaling SVG charts
  const maxFinancialValue = Math.max(
    ...activeSales.map((s) => Math.max(s.totalValue, s.operationCost, s.netProfit, 100)),
    totalSales,
    totalExpenses,
    totalNetProfit,
    100
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ticket Médio */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block font-medium">Ticket Médio</span>
            <span className="text-lg font-bold font-mono text-slate-200 mt-1 block">
              {formatBRL(averageTicket)}
            </span>
          </div>
          <div className="p-3 bg-brand-cyan/10 rounded-xl text-brand-cyan border border-brand-cyan/10">
            <Award className="h-5 w-5" />
          </div>
        </div>

        {/* Lucratividade média */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block font-medium">Margem Operacional</span>
            <span className={`text-lg font-bold font-mono mt-1 block ${profitMarginPercent > 50 ? "text-emerald-400" : "text-brand-cyan"}`}>
              {profitMarginPercent.toFixed(1)}%
            </span>
          </div>
          <div className="p-3 bg-brand-magenta/10 rounded-xl text-brand-magenta border border-brand-magenta/10">
            <Percent className="h-5 w-5" />
          </div>
        </div>

        {/* Paid ratio */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block font-medium">Taxa de Adiantamento</span>
            <span className="text-lg font-bold font-mono text-slate-200 mt-1 block">
              {totalSales > 0 ? ((totalReceived / totalSales) * 100).toFixed(0) : "0"}%
            </span>
          </div>
          <div className="p-3 bg-slate-800 rounded-xl text-slate-300">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        {/* Volume de Vendas */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block font-medium">Lançamentos</span>
            <span className="text-lg font-bold font-mono text-slate-200 mt-1 block">
              {activeSales.length} transações
            </span>
          </div>
          <div className="p-3 bg-slate-800 rounded-xl text-slate-300">
            <Layers className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Monthly Evolution Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div>
          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
            <TrendingUp className="h-4.5 w-4.5 text-brand-cyan" />
            Evolução Mensal do Faturamento e Lucros
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            Análise consolidada do faturamento bruto (Rosa) e lucro líquido real (Ciano) acumulado mês a mês
          </p>
        </div>

        {monthlyData.length === 0 ? (
          <div className="h-56 flex items-center justify-center bg-slate-950/20 rounded-xl border border-slate-850/60 text-slate-400 text-xs text-center p-4">
            Não há lançamentos de vendas registrados para analisar o histórico mensal.
          </div>
        ) : (
          <div className="h-72 w-full font-mono text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={monthlyData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.4} />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#334155', strokeWidth: 1 }}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#334155', strokeWidth: 1 }}
                  tickFormatter={(val) => `R$ ${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="circle"
                  formatter={(value) => <span className="text-xs text-slate-300 font-sans font-medium">{value}</span>}
                />
                <Line
                  name="Faturamento Bruto"
                  type="monotone"
                  dataKey="faturamento"
                  stroke="#ff007f"
                  strokeWidth={3}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  dot={{ r: 4, strokeWidth: 0, fill: "#ff007f" }}
                />
                <Line
                  name="Lucro Líquido"
                  type="monotone"
                  dataKey="lucro"
                  stroke="#00b6ff"
                  strokeWidth={3}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  dot={{ r: 4, strokeWidth: 0, fill: "#00b6ff" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Main interactive visual layouts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Modern Vectorized Charts (SVG Bars) - Left Panel (2/3 width) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 lg:col-span-2 space-y-6">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-brand-cyan" />
              Comparativo Financeiro e Margens de Lucro
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Escala visual mostrando Faturamento Bruto (Rosa) comparado ao Custo Operacional (Vermelho) e Lucro Líquido (Ciano)
            </p>
          </div>

          {activeSales.length === 0 ? (
            <div className="h-52 flex items-center justify-center bg-slate-950/20 rounded-xl border border-slate-850/60 text-slate-400 text-xs">
              Sem dados de vendas salvos no período selecionado.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Grand summary metrics visual scaling */}
              <div className="space-y-3.5">
                {/* 1. Raw total sales revenue */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300">Faturamento Bruto Total:</span>
                    <span className="text-brand-magenta font-mono">{formatBRL(totalSales)}</span>
                  </div>
                  <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-850 p-0.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-magenta/80 to-brand-magenta transition-all duration-500 shadow-[0_0_12px_rgba(255,0,127,0.4)]"
                      style={{ width: `${Math.max(5, (totalSales / maxFinancialValue) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* 2. Operational Costs bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300">Total Custos Operacionais (Gastos):</span>
                    <span className="text-red-400 font-mono">{formatBRL(totalExpenses)}</span>
                  </div>
                  <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-850 p-0.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-600/80 to-red-500 transition-all duration-500 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                      style={{ width: `${Math.max(2, (totalExpenses / maxFinancialValue) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* 3. Pure Real Profit bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-brand-cyan font-bold">LUCRO LÍQUIDO REAL acumulado:</span>
                    <span className="text-brand-cyan font-extrabold font-mono">{formatBRL(totalNetProfit)}</span>
                  </div>
                  <div className="h-5.5 w-full bg-slate-950 rounded-full overflow-hidden border border-brand-cyan/20 p-[3px]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-cyan/80 to-brand-cyan transition-all duration-500 shadow-[0_0_15px_rgba(0,182,255,0.4)]"
                      style={{ width: `${Math.max(5, (totalNetProfit / maxFinancialValue) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Transaction by Transaction comparison index */}
              <div className="pt-4 border-t border-slate-850 space-y-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Últimos Lançamentos Individuais</span>
                
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {activeSales.slice(-5).reverse().map((sale) => (
                    <div key={sale.id} className="bg-slate-950/40 border border-slate-850 p-2.5 rounded-xl flex items-center justify-between text-xs font-mono">
                      <div className="space-y-0.5">
                        <span className="text-slate-200 block font-bold">{sale.clientName}</span>
                        <span className="text-[9px] text-slate-400 block">{new Date(sale.date).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[9px] text-slate-500 block">Venda</span>
                          <span className="text-white block font-bold">{formatBRL(sale.totalValue)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] text-slate-500 block">Custo</span>
                          <span className="text-red-400 block">{formatBRL(sale.operationCost)}</span>
                        </div>
                        <div className="text-right border-l border-slate-800 pl-3">
                          <span className="text-[9px] text-slate-500 block">Lucro</span>
                          <span className="text-brand-cyan block font-bold">{formatBRL(sale.netProfit)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cost Formula Explanation - Right Panel (1/3 width) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Info className="h-4.5 w-4.5 text-brand-cyan" />
            Entendendo os Lucros
          </h4>

          <div className="space-y-3 text-xs text-slate-300 leading-relaxed font-sans">
            <p>
              O sistema calcula automaticamente as margens com base nas parcelas:
            </p>

            <div className="p-3 bg-slate-950 rounded-xl space-y-2.5 border border-slate-850">
              <div className="flex items-start gap-2">
                <span className="h-2 w-2 rounded-full bg-brand-magenta mt-1.5 shrink-0" />
                <div>
                  <strong className="text-slate-200">Total Bruto Cobrado:</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">Soma dos produtos + Motoboy - Descontos acordados.</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="h-2 w-2 rounded-full bg-red-400 mt-1.5 shrink-0" />
                <div>
                  <strong className="text-slate-200">Gasto Operacional (A):</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">Definido manualmente por você para contabilizar materiais, insumos de terceiros e fretes.</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="h-2 w-2 rounded-full bg-brand-cyan mt-1.5 shrink-0" />
                <div>
                  <strong className="text-slate-200">Lucro Líquido Real (B):</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">Total Recebido menos o Custo (A). É o seu ganho de caixa líquido.</p>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 italic bg-brand-cyan/5 p-2 rounded-lg border border-brand-cyan/10">
              💡 Para manter o fluxo de caixa saudável, certifique-se de preencher o &quot;Gasto da Venda&quot; em todas as suas operações.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
