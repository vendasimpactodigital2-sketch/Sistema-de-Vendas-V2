import React, { useState, useMemo } from "react";
import { 
  X, 
  Calendar, 
  Trophy, 
  AlertTriangle, 
  CheckCircle, 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown,
  BarChart2, 
  RefreshCcw, 
  Target, 
  LineChart as LineIcon, 
  DollarSign,
  Activity,
  ArrowRight
} from "lucide-react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine,
  LineChart,
  Line
} from "recharts";
import { Sale, Expense, getSaleOrderDate, getSaleOperationCost } from "../types";

interface WeeklyGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: Sale[];
  expenses: Expense[];
  dailyMetaGoal: number;
  customWeekdayGoals?: { [key: number]: number };
  setCustomWeekdayGoals?: React.Dispatch<React.SetStateAction<{ [key: number]: number }>>;
}

function getLocalDateFromISO(isoString: string): string {
  if (!isoString) return "";
  const clean = isoString.replace(/['"]/g, "").trim();
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
}


const WEEKDAYS_PT = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado"
];

const WEEKDAYS_SHORT = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb"
];

// Helper to generate list of dates between start and end (inclusive)
function getDaysArray(start: Date, end: Date): Date[] {
  const arr = [];
  const dt = new Date(start);
  dt.setHours(12, 0, 0, 0); // avoid timezone shifts
  const endLimit = new Date(end);
  endLimit.setHours(12, 0, 0, 0);
  
  while (dt <= endLimit) {
    arr.push(new Date(dt));
    dt.setDate(dt.getDate() + 1);
  }
  return arr;
}

export function WeeklyGoalModal({
  isOpen,
  onClose,
  sales,
  expenses,
  dailyMetaGoal,
  customWeekdayGoals,
  setCustomWeekdayGoals
}: WeeklyGoalModalProps) {
  // Local fallback state if not passed as props (to maintain backward compatibility / prevent compilation issues)
  const [localGoals, setLocalGoals] = useState<{ [key: number]: number }>(() => {
    const saved = localStorage.getItem("NUCLEO_WEEKDAY_GOALS");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return {};
  });

  const activeWeekdayGoals = customWeekdayGoals || localGoals;
  const updateWeekdayGoal = (dayOfWeek: number, value: number) => {
    const nextGoals = { ...activeWeekdayGoals, [dayOfWeek]: value };
    if (setCustomWeekdayGoals) {
      setCustomWeekdayGoals(nextGoals);
    } else {
      setLocalGoals(nextGoals);
      localStorage.setItem("NUCLEO_WEEKDAY_GOALS", JSON.stringify(nextGoals));
    }
  };

  // State for which weekday's goal is being configured
  const [selectedWeekdayConfig, setSelectedWeekdayConfig] = useState<number>(() => {
    return new Date().getDay(); // defaults to today's weekday
  });

  const [selectedDayDetails, setSelectedDayDetails] = useState<any | null>(null);

  const printReport = (dateStr: string, dayData: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    
    const formatCurrency = (val: number) => {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(val);
    };
    
    const formattedDate = dateStr.split("-").reverse().join("/");
    
    const salesHtml = dayData.salesList.map((s: any) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${s.id.substring(0, 8)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: bold;">${s.clientName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: right;">${formatCurrency(s.totalValue)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: right; font-weight: bold; color: #16a34a;">${formatCurrency(s.paidAmount)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: right;">${formatCurrency(s.cost)}</td>
      </tr>
    `).join("");
    
    const expensesHtml = dayData.expensesList.map((e: any) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${e.description}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${e.category || "Geral"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: right; font-weight: bold; color: #dc2626;">-${formatCurrency(e.value)}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Relatório de Vendas - ${formattedDate}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #1e293b; padding: 30px; line-height: 1.5; }
            .header { text-align: center; margin-bottom: 35px; border-bottom: 2px solid #0284c7; padding-bottom: 15px; }
            .title { font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
            .subtitle { font-size: 13px; color: #64748b; font-weight: 500; }
            .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 35px; }
            .summary-card { padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc; }
            .summary-card .label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.5px; }
            .summary-card .value { font-size: 18px; font-weight: 800; margin-top: 6px; color: #0f172a; }
            .section-title { font-size: 15px; font-weight: 800; margin: 35px 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
            th, td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 13px; }
            th { background-color: #f1f5f9; font-weight: bold; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
            .text-right { text-align: right; }
            .profit-positive { color: #16a34a; }
            .profit-negative { color: #dc2626; }
            .print-btn-container { text-align: center; margin-top: 40px; }
            .print-btn { padding: 12px 24px; font-size: 14px; font-weight: bold; background-color: #0284c7; color: white; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); transition: all 0.2s; }
            .print-btn:hover { background-color: #0369a1; }
            @media print {
              body { padding: 10px; }
              .print-btn-container { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Relatório Diário de Vendas e Caixa</div>
            <div class="subtitle">Dia do Fluxo: <b>${formattedDate}</b> &nbsp;|&nbsp; Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</div>
          </div>
          
          <div class="summary-grid">
            <div class="summary-card">
              <div class="label">Entradas (Caixa)</div>
              <div class="value" style="color: #16a34a;">${formatCurrency(dayData.realPaymentsReceived)}</div>
            </div>
            <div class="summary-card">
              <div class="label">Custos Operacionais</div>
              <div class="value" style="color: #475569;">${formatCurrency(dayData.daySaleOperationCost + dayData.dayMotoboyCost)}</div>
            </div>
            <div class="summary-card">
              <div class="label">Despesas Standalone</div>
              <div class="value" style="color: #dc2626;">${formatCurrency(dayData.dayExpenses)}</div>
            </div>
            <div class="summary-card">
              <div class="label">Lucro Líquido Real</div>
              <div class="value ${dayData.netProfit >= 0 ? 'profit-positive' : 'profit-negative'}">${formatCurrency(dayData.netProfit)}</div>
            </div>
          </div>
          
          <div class="section-title">Vendas & Recebimentos do Dia</div>
          ${dayData.salesList.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th style="width: 100px;">Pedido</th>
                  <th>Cliente</th>
                  <th class="text-right">Valor Total</th>
                  <th class="text-right">Valor Pago (Hoje)</th>
                  <th class="text-right">Custos Diretos</th>
                </tr>
              </thead>
              <tbody>
                ${salesHtml}
              </tbody>
            </table>
          ` : `<p style="font-size: 13px; color: #64748b; font-style: italic; text-align: center; padding: 20px; border: 1px dashed #cbd5e1; border-radius: 8px;">Nenhuma venda ou recebimento registrado neste dia.</p>`}
          
          <div class="section-title">Despesas do Dia</div>
          ${dayData.expensesList.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th class="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${expensesHtml}
              </tbody>
            </table>
          ` : `<p style="font-size: 13px; color: #64748b; font-style: italic; text-align: center; padding: 20px; border: 1px dashed #cbd5e1; border-radius: 8px;">Nenhuma despesa registrada neste dia.</p>`}
          
          <div class="print-btn-container">
            <button class="print-btn" onclick="window.print()">Imprimir este Relatório</button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDayClick = (dateStr: string) => {
    const daySalesList: any[] = [];
    let realPaymentsReceived = 0;
    
    sales.forEach(sale => {
      if (sale.isBudget) return;
      
      let paidOnThisDay = 0;
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach(payment => {
          if (getLocalDateFromISO(payment.date) === dateStr) {
            paidOnThisDay += payment.amount;
          }
        });
      } else {
        if (sale.downPayment > 0 && getLocalDateFromISO(sale.date) === dateStr) {
          paidOnThisDay += sale.downPayment;
        }
      }
      
      const orderDate = getSaleOrderDate(sale);
      const isOrderToday = getLocalDateFromISO(orderDate) === dateStr;
      
      if (paidOnThisDay > 0 || isOrderToday) {
        realPaymentsReceived += paidOnThisDay;
        daySalesList.push({
          id: sale.id,
          clientName: sale.clientName,
          totalValue: sale.totalValue,
          paidAmount: paidOnThisDay,
          cost: isOrderToday ? (getSaleOperationCost(sale) + (sale.useMotoboy ? (sale.motoboyCost || 0) : 0)) : 0,
          isOrderToday,
          useMotoboy: sale.useMotoboy && isOrderToday,
          motoboyCost: sale.useMotoboy && isOrderToday ? (sale.motoboyCost || 0) : 0
        });
      }
    });

    let daySaleOperationCost = 0;
    let dayMotoboyCost = 0;
    sales.forEach(sale => {
      if (sale.isBudget) return;
      if (getLocalDateFromISO(getSaleOrderDate(sale)) === dateStr) {
        daySaleOperationCost += getSaleOperationCost(sale);
        if (sale.useMotoboy) {
          dayMotoboyCost += sale.motoboyCost || 0;
        }
      }
    });

    const dayExpensesList = expenses.filter(e => {
      const isTargetDate = e.date && getLocalDateFromISO(e.date) === dateStr;
      const isWithdrawal = e.description && /retirada|sangria/i.test(e.description);
      return isTargetDate && !isWithdrawal;
    });
    const dayExpensesValue = dayExpensesList.reduce((sum, e) => sum + e.value, 0);

    const netProfit = realPaymentsReceived - (daySaleOperationCost + dayExpensesValue + dayMotoboyCost);

    setSelectedDayDetails({
      dateStr,
      realPaymentsReceived,
      daySaleOperationCost,
      dayMotoboyCost,
      dayExpenses: dayExpensesValue,
      netProfit,
      salesList: daySalesList,
      expensesList: dayExpensesList
    });
  };


  // Status filtering: "all" | "met" | "missed"
  const [filterStatus, setFilterStatus] = useState<"all" | "met" | "missed">("all");

  // Filters: Mode choice
  const [rangeMode, setRangeMode] = useState<"semana" | "mes" | "personalizado">("semana");
  
  // Navigation offsets
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [monthOffset, setMonthOffset] = useState<number>(0);

  // Custom range parameters (defaults to 15 days ago until today)
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split("T")[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Presentation tab: list or chart
  const [viewTab, setViewTab] = useState<"chart" | "list">("chart");

  // Generate dynamic sequence of dates depending on rangeMode selection
  const daysInSelectedPeriod = useMemo(() => {
    if (rangeMode === "semana") {
      const current = new Date();
      current.setDate(current.getDate() + weekOffset * 7);
      const day = current.getDay();
      
      // Monday is first day of week in pt-BR normally, let's find Monday
      // if current.getDay is 0 (Sunday), diff should go back 6 days
      const diff = current.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(current.setDate(diff));
      
      const arr = [];
      for (let i = 0; i < 6; i++) {
        const nextDay = new Date(monday);
        nextDay.setDate(monday.getDate() + i);
        arr.push(nextDay);
      }
      return arr;
    } 
    else if (rangeMode === "mes") {
      const current = new Date();
      // Set to 1st to avoid month overflow
      current.setDate(1);
      current.setMonth(current.getMonth() + monthOffset);
      
      const start = new Date(current.getFullYear(), current.getMonth(), 1);
      const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      return getDaysArray(start, end);
    } 
    else {
      // Personalizado
      if (!customStart || !customEnd) return [];
      try {
        const start = new Date(customStart + "T12:00:00");
        const end = new Date(customEnd + "T12:00:00");
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
          return [];
        }
        // Cap custom range at 62 days to avoid chart/memory performance issues
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 62) {
          const adjustedEnd = new Date(start);
          adjustedEnd.setDate(start.getDate() + 61);
          return getDaysArray(start, adjustedEnd);
        }
        return getDaysArray(start, end);
      } catch {
        return [];
      }
    }
  }, [rangeMode, weekOffset, monthOffset, customStart, customEnd]);

  // Formatted descriptor string to show at the top
  const formattedPeriodRange = useMemo(() => {
    if (daysInSelectedPeriod.length === 0) return "Período inválido";
    const start = daysInSelectedPeriod[0];
    const end = daysInSelectedPeriod[daysInSelectedPeriod.length - 1];
    
    const formatDateBr = (d: Date) => {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    if (rangeMode === "semana") {
      return `Semana: ${formatDateBr(start)} a ${formatDateBr(end)}`;
    } 
    else if (rangeMode === "mes") {
      const months = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
      ];
      return `Mês: ${months[start.getMonth()]} de ${start.getFullYear()}`;
    } 
    else {
      return `Período: ${formatDateBr(start)} a ${formatDateBr(end)}`;
    }
  }, [daysInSelectedPeriod, rangeMode]);

  // Compute stats for each day inside the chosen active period
  const reportData = useMemo(() => {
    return daysInSelectedPeriod.map((dateObj) => {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      let realPaymentsReceived = 0;
      sales.forEach(sale => {
        if (sale.isBudget) return;
        if (sale.payments && sale.payments.length > 0) {
          sale.payments.forEach(payment => {
            if (getLocalDateFromISO(payment.date) === dateStr) {
              realPaymentsReceived += payment.amount;
            }
          });
        } else {
          if (sale.downPayment > 0 && getLocalDateFromISO(sale.date) === dateStr) {
            realPaymentsReceived += sale.downPayment;
          }
        }
      });

      let daySaleOperationCost = 0;
      let dayMotoboyCost = 0;
      let faturamento = 0;
      let salesCount = 0;
      
      sales.forEach((sale) => {
        if (sale.isBudget) return;
        const oDate = getSaleOrderDate(sale);
        const lDate = getLocalDateFromISO(oDate);
        if (lDate === dateStr) {
          daySaleOperationCost += getSaleOperationCost(sale);
          if (sale.useMotoboy) {
            dayMotoboyCost += sale.motoboyCost || 0;
          }
          faturamento += sale.totalValue;
          salesCount++;
        }
      });

      const dayExpenses = expenses
        .filter((e) => {
          const isTargetDate = e.date && getLocalDateFromISO(e.date) === dateStr;
          const isWithdrawal = e.description && /retirada|sangria/i.test(e.description);
          return isTargetDate && !isWithdrawal;
        })
        .reduce((sum, e) => sum + e.value, 0);

      const netProfit = realPaymentsReceived - (daySaleOperationCost + dayExpenses + dayMotoboyCost);
      const dayOfWeek = dateObj.getDay();
      const weekdayGoal = activeWeekdayGoals[dayOfWeek] !== undefined ? activeWeekdayGoals[dayOfWeek] : dailyMetaGoal;
      const isMet = netProfit >= weekdayGoal;
      const hasSalesOrExpenses = salesCount > 0 || dayExpenses > 0 || realPaymentsReceived > 0;

      // format labels
      const weekdayName = WEEKDAYS_PT[dateObj.getDay()];
      const weekdayShort = WEEKDAYS_SHORT[dateObj.getDay()];
      const dateLabel = `${day}/${month}`;

      return {
        dateStr,
        weekdayName,
        weekdayShort,
        dateLabel,
        salesCount,
        faturamento,
        expensesValue: dayExpenses,
        netProfit,
        isMet,
        hasSalesOrExpenses,
        dailyMetaGoal: weekdayGoal
      };
    });
  }, [daysInSelectedPeriod, sales, expenses, dailyMetaGoal, activeWeekdayGoals]);

  // Dynamically filter reportData based on the interactive filterStatus state
  const filteredReportData = useMemo(() => {
    return reportData.filter((d) => {
      if (filterStatus === "all") return true;
      if (filterStatus === "met") {
        return d.dailyMetaGoal > 0 && d.netProfit >= d.dailyMetaGoal;
      }
      if (filterStatus === "missed") {
        return d.dailyMetaGoal > 0 && d.netProfit < d.dailyMetaGoal;
      }
      return true;
    });
  }, [reportData, filterStatus]);

  // Compute Monday to Saturday stats specifically for the weekly performance widget
  const weeklyPerformanceDays = useMemo(() => {
    const baseDate = daysInSelectedPeriod[0] || new Date();
    const current = new Date(baseDate);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(current.setDate(diff));
    
    const arr = [];
    for (let i = 0; i < 6; i++) {
      const nextDay = new Date(monday);
      nextDay.setDate(monday.getDate() + i);
      
      const year = nextDay.getFullYear();
      const month = String(nextDay.getMonth() + 1).padStart(2, '0');
      const dayStr = String(nextDay.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${dayStr}`;

      let realPaymentsReceived = 0;
      sales.forEach(sale => {
        if (sale.isBudget) return;
        if (sale.payments && sale.payments.length > 0) {
          sale.payments.forEach(payment => {
            if (getLocalDateFromISO(payment.date) === dateStr) {
              realPaymentsReceived += payment.amount;
            }
          });
        } else {
          if (sale.downPayment > 0 && getLocalDateFromISO(sale.date) === dateStr) {
            realPaymentsReceived += sale.downPayment;
          }
        }
      });

      let daySaleOperationCost = 0;
      let dayMotoboyCost = 0;
      let faturamento = 0;
      let salesCount = 0;
      
      sales.forEach((sale) => {
        if (sale.isBudget) return;
        const oDate = getSaleOrderDate(sale);
        const lDate = getLocalDateFromISO(oDate);
        if (lDate === dateStr) {
          daySaleOperationCost += getSaleOperationCost(sale);
          if (sale.useMotoboy) {
            dayMotoboyCost += sale.motoboyCost || 0;
          }
          faturamento += sale.totalValue;
          salesCount++;
        }
      });

      const dayExpenses = expenses
        .filter((e) => {
          const isTargetDate = e.date && getLocalDateFromISO(e.date) === dateStr;
          const isWithdrawal = e.description && /retirada|sangria/i.test(e.description);
          return isTargetDate && !isWithdrawal;
        })
        .reduce((sum, e) => sum + e.value, 0);

      const netProfit = realPaymentsReceived - (daySaleOperationCost + dayExpenses + dayMotoboyCost);
      const dayOfWeek = nextDay.getDay();
      const weekdayGoal = activeWeekdayGoals[dayOfWeek] !== undefined ? activeWeekdayGoals[dayOfWeek] : dailyMetaGoal;
      const isMet = weekdayGoal > 0 && netProfit >= weekdayGoal;
      const hasSalesOrExpenses = salesCount > 0 || dayExpenses > 0 || realPaymentsReceived > 0;

      const weekdayShort = WEEKDAYS_SHORT[nextDay.getDay()];
      const dateLabel = `${dayStr}/${month}`;

      arr.push({
        dateStr,
        weekdayName: WEEKDAYS_PT[nextDay.getDay()],
        weekdayShort,
        dateLabel,
        netProfit,
        dailyMetaGoal: weekdayGoal,
        isMet,
        hasSalesOrExpenses,
        faturamento,
        salesCount
      });
    }
    return arr;
  }, [daysInSelectedPeriod, sales, expenses, dailyMetaGoal, activeWeekdayGoals]);

  // Compute high precision interactive filters
  const stats = useMemo(() => {
    let daysMet = 0;
    let daysMissed = 0;
    let daysWithNoOperations = 0;
    let totalProfit = 0;
    let totalFaturamento = 0;
    let totalExpenses = 0;
    let totalSalesCount = 0;
    let bestDayName = "Nenhum";
    let bestDayProfit = -999999;

    reportData.forEach((d) => {
      totalProfit += d.netProfit;
      totalFaturamento += d.faturamento;
      totalExpenses += d.expensesValue;
      totalSalesCount += d.salesCount;

      if (d.netProfit > bestDayProfit && d.hasSalesOrExpenses) {
        bestDayProfit = d.netProfit;
        bestDayName = `${d.weekdayName} (${d.dateLabel})`;
      }

      if (d.hasSalesOrExpenses || d.dailyMetaGoal > 0) {
        if (d.netProfit >= d.dailyMetaGoal) {
          daysMet++;
        } else {
          daysMissed++;
        }
      } else {
        daysWithNoOperations++;
      }
    });

    const totalDays = reportData.length;
    const averageDailyProfit = totalDays > 0 ? totalProfit / totalDays : 0;

    return {
      daysMet,
      daysMissed,
      daysWithNoOperations,
      totalProfit,
      totalFaturamento,
      totalExpenses,
      totalSalesCount,
      averageDailyProfit,
      bestDay: bestDayProfit > -99999 ? bestDayName : "Nenhum",
      bestDayProfit: bestDayProfit > -99999 ? bestDayProfit : 0,
      totalDays
    };
  }, [reportData, dailyMetaGoal]);

  // Custom tooltips inside Dark Recharts space
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const profit = data.netProfit ?? 0;
      const isPositive = profit >= 0;
      return (
        <div className="bg-slate-950/95 border border-slate-800 rounded-xl p-3.5 shadow-2xl font-sans text-xs min-w-[210px] backdrop-blur-md animate-fade-in relative z-50">
          <p className="font-extrabold text-slate-100 mb-2 border-b border-slate-850 pb-1 flex items-center justify-between">
            <span>{data.weekdayName}</span>
            <span className="text-[10px] text-slate-400 font-mono font-bold">{data.dateLabel}</span>
          </p>
          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between gap-4">
              <span className="text-slate-400 font-sans font-medium">Lucro Líquido:</span>
              <strong className={`font-black ${isPositive ? "text-emerald-450" : "text-rose-500"}`}>
                R$ {profit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-450 font-sans">Faturamento:</span>
              <span className="text-brand-magenta font-semibold">
                R$ {(data.faturamento ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-450 font-sans">Despesas Extra:</span>
              <span className="text-rose-455">
                R$ {(data.expensesValue ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-t border-slate-850 pt-1.5 mt-1.5 text-slate-400 text-[10px]">
              <span>Meta Diária:</span>
              <span>R$ {(data.dailyMetaGoal ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between gap-4 text-[10px] pt-1">
              <span>Rendimento:</span>
              <span className={profit >= (data.dailyMetaGoal ?? 0) && (data.dailyMetaGoal ?? 0) > 0 ? "text-emerald-400 font-black animate-pulse" : "text-rose-400 font-bold"}>
                {profit >= (data.dailyMetaGoal ?? 0) && (data.dailyMetaGoal ?? 0) > 0 ? "🏆 META HITADA" : "❌ ABAIXO DA META"}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in font-sans">
      <div 
        id="weekly-goal-modal-container"
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-850 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh] md:max-h-[86vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between py-3 px-4 border-b border-slate-805 bg-slate-955 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-400 shadow-inner">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-slate-100 uppercase tracking-widest flex items-center gap-2">
                ACOMPANHAMENTO DE METAS DE LUCRO
              </h3>
              <p className="text-[9.5px] text-slate-450 font-mono uppercase tracking-wider font-semibold">Análise de Desempenho e Conciliação Histórica</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-450 hover:text-white hover:bg-slate-850 transition-all cursor-pointer border border-transparent hover:border-slate-800"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters Panel & Filter Tabs */}
        <div className="p-4 border-b border-slate-850 bg-slate-955/90 flex flex-col gap-3 shrink-0">
          {/* Main Scope selectors */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-850 pb-3">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider font-mono">Filtrar Intervalo de Análise:</span>
            
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRangeMode("semana")}
                className={`px-4 py-1.5 text-[11px] font-bold uppercase rounded-xl transition-all duration-300 cursor-pointer border ${
                  rangeMode === "semana" 
                    ? "bg-brand-cyan/15 border-brand-cyan/60 text-brand-cyan shadow-[0_0_12px_rgba(34,211,238,0.15)] font-extrabold" 
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-105 hover:bg-slate-850 hover:border-slate-700"
                }`}
              >
                Por Semana
              </button>
              
              <button
                type="button"
                onClick={() => setRangeMode("mes")}
                className={`px-4 py-1.5 text-[11px] font-bold uppercase rounded-xl transition-all duration-300 cursor-pointer border ${
                  rangeMode === "mes" 
                    ? "bg-brand-cyan/15 border-brand-cyan/60 text-brand-cyan shadow-[0_0_12px_rgba(34,211,238,0.15)] font-extrabold" 
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-105 hover:bg-slate-850 hover:border-slate-700"
                }`}
              >
                Por Mês
              </button>

              <button
                type="button"
                onClick={() => setRangeMode("personalizado")}
                className={`px-4 py-1.5 text-[11px] font-bold uppercase rounded-xl transition-all duration-300 cursor-pointer border ${
                  rangeMode === "personalizado" 
                    ? "bg-brand-cyan/15 border-brand-cyan/60 text-brand-cyan shadow-[0_0_12px_rgba(34,211,238,0.15)] font-extrabold" 
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-105 hover:bg-slate-850 hover:border-slate-700"
                }`}
              >
                Por Intervalo de Datas
              </button>
            </div>
          </div>

          {/* Navigation/Input Block depending on rangeMode */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-950 p-2 sm:p-2.5 rounded-xl border border-slate-850/80">
            
            {/* Range controls */}
            {rangeMode === "semana" && (
              <div className="flex items-center justify-between w-full gap-2">
                <button
                  onClick={() => setWeekOffset(prev => prev - 1)}
                  className="flex items-center gap-1.5 py-1.5 px-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[11px] font-bold text-slate-300 hover:text-white rounded-lg transition-all cursor-pointer select-none"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Anterior</span>
                </button>
                
                <div className="text-xs font-mono font-black text-brand-cyan bg-brand-cyan/5 border border-brand-cyan/15 rounded-xl px-4 py-1.5 text-center flex items-center justify-center gap-2">
                  <Calendar className="h-4 w-4 text-brand-cyan" />
                  <span>{formattedPeriodRange}</span>
                  {weekOffset === 0 && (
                    <span className="text-[8px] bg-emerald-500/20 text-emerald-400 border border-emerald-990/20 px-1 py-0.2 rounded font-black font-sans uppercase">
                      Atual
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setWeekOffset(prev => prev + 1)}
                  className="flex items-center gap-1.5 py-1.5 px-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[11px] font-bold text-slate-300 hover:text-white rounded-lg transition-all cursor-pointer select-none"
                >
                  <span>Próxima</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {rangeMode === "mes" && (
              <div className="flex items-center justify-between w-full gap-2">
                <button
                  onClick={() => setMonthOffset(prev => prev - 1)}
                  className="flex items-center gap-1.5 py-1.5 px-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[11px] font-bold text-slate-300 hover:text-white rounded-lg transition-all cursor-pointer select-none"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Mês Anterior</span>
                </button>
                
                <div className="text-xs font-mono font-black text-brand-cyan bg-brand-cyan/5 border border-brand-cyan/15 rounded-xl px-4 py-1.5 text-center flex items-center justify-center gap-2">
                  <Calendar className="h-4 w-4 text-brand-cyan" />
                  <span>{formattedPeriodRange}</span>
                  {monthOffset === 0 && (
                    <span className="text-[8px] bg-emerald-500/20 text-emerald-400 border border-emerald-990/20 px-1 py-0.2 rounded font-black font-sans uppercase animate-pulse">
                      Mês Atual
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setMonthOffset(prev => prev + 1)}
                  className="flex items-center gap-1.5 py-1.5 px-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[11px] font-bold text-slate-300 hover:text-white rounded-lg transition-all cursor-pointer select-none"
                >
                  <span>Próximo Mês</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {rangeMode === "personalizado" && (
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 self-start sm:self-auto shrink-0 select-none">
                  <Calendar className="h-4.5 w-4.5 text-brand-cyan" />
                  <span>Escolha as datas limite:</span>
                </span>
                
                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-initial">
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-brand-cyan text-slate-200 text-xs rounded-xl py-1.5 px-3 focus:outline-none transition-all font-mono"
                    />
                  </div>
                  
                  <ArrowRight className="h-4 w-4 text-slate-500 shrink-0" />
                  
                  <div className="relative flex-1 sm:flex-initial">
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-brand-cyan text-slate-200 text-xs rounded-xl py-1.5 px-3 focus:outline-none transition-all font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tab selector for Chart vs List breakdown */}
          <div className="flex justify-end gap-1">
            <button
              onClick={() => setViewTab("chart")}
              className={`px-3 py-1.5 text-[10.5px] font-black uppercase rounded-lg transition-all cursor-pointer flex items-center gap-1.5 border ${
                viewTab === "chart"
                  ? "bg-slate-900 border-slate-800 text-brand-cyan shadow-sm"
                  : "bg-slate-950 border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <BarChart2 className="h-3.5 w-3.5" />
              <span>Gráfico Estilizado</span>
            </button>
            <button
              onClick={() => setViewTab("list")}
              className={`px-3 py-1.5 text-[10.5px] font-black uppercase rounded-lg transition-all cursor-pointer flex items-center gap-1.5 border ${
                viewTab === "list"
                  ? "bg-slate-900 border-slate-800 text-brand-cyan shadow-sm"
                  : "bg-slate-950 border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Cronograma Individual</span>
            </button>
          </div>
        </div>

        {/* Modal Scroll Content Body */}
        <div className="p-3 sm:p-4 overflow-y-auto flex flex-col space-y-4 flex-grow w-full bg-slate-905 custom-scrollbar">
          {/* BLOCO DE MÉTRICAS RESUMIDAS (Cards Estilo Dashboard) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* CARD 1: META BATIDA 🏆 */}
            <button
              type="button"
              onClick={() => setFilterStatus(prev => prev === "met" ? "all" : "met")}
              className={`p-4 bg-slate-950/45 border rounded-2xl text-left transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg cursor-pointer block select-none group relative ${
                filterStatus === "met" 
                  ? "border-emerald-500/80 bg-emerald-505/10 ring-1 ring-emerald-500/30" 
                  : "border-slate-850 hover:border-slate-700 hover:bg-slate-900/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 font-mono">Meta Batida</span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <div className="mt-2.5 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-405">{stats.daysMet}</span>
                <span className="text-xs text-slate-450 font-bold">dias</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-500">
                <span>{filterStatus === "met" ? "Filtro Ativo" : "Clique p/ filtrar"}</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">Ver dias ➜</span>
              </div>
            </button>

            {/* CARD 2: NÃO BATEU META ❌ */}
            <button
              type="button"
              onClick={() => setFilterStatus(prev => prev === "missed" ? "all" : "missed")}
              className={`p-4 bg-slate-950/45 border rounded-2xl text-left transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg cursor-pointer block select-none group relative ${
                filterStatus === "missed" 
                  ? "border-rose-500/80 bg-rose-505/10 ring-1 ring-rose-500/30" 
                  : "border-slate-850 hover:border-slate-700 hover:bg-slate-900/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 font-mono">Abaixo da Meta</span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
              </div>
              <div className="mt-2.5 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black font-mono text-rose-405">{stats.daysMissed}</span>
                <span className="text-xs text-slate-450 font-bold">dias</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-500">
                <span>{filterStatus === "missed" ? "Filtro Ativo" : "Clique p/ filtrar"}</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">Ver dias ➜</span>
              </div>
            </button>

            {/* CARD 3: LUCRO LÍQUIDO ACUMULADO 💰 */}
            <button
              type="button"
              onClick={() => setFilterStatus("all")}
              className={`p-4 bg-slate-950/45 border rounded-2xl text-left transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg cursor-pointer block select-none group relative ${
                filterStatus === "all" ? "border-brand-cyan/60 bg-brand-cyan/5" : "border-slate-850 hover:border-slate-700 hover:bg-slate-900/60"
              }`}
              title="Clique para resetar filtros"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 font-mono">Lucro Líquido</span>
                <TrendingUp className="h-4 w-4 text-brand-cyan" />
              </div>
              <div className="mt-2.5">
                <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight block truncate ${stats.totalProfit >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                  R$ {stats.totalProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-500">
                <span>Período Selecionado</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">Resetar Filtros ➜</span>
              </div>
            </button>

            {/* CARD 4: MELHOR DIA 🌟 */}
            <button
              type="button"
              onClick={() => setFilterStatus("all")}
              className="p-4 bg-slate-950/45 border border-slate-850 rounded-2xl text-left transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg cursor-pointer block select-none group relative"
              title="Clique para resetar filtros"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 font-mono">Melhor Dia</span>
                <Trophy className="h-4 w-4 text-amber-400" />
              </div>
              <div className="mt-2.5">
                <span className="text-xs font-black text-slate-100 block truncate leading-tight">
                  {stats.bestDay}
                </span>
                <span className="text-xs font-mono font-black text-emerald-400 block mt-0.5">
                  {stats.bestDayProfit > 0 ? `+R$ ${stats.bestDayProfit.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : "R$ 0"}
                </span>
              </div>
              <div className="mt-1 text-[9px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                Resumo Período ➜
              </div>
            </button>
          </div>

          {/* CALENDÁRIO SEMANAL DE METAS (Segunda a Sábado) */}
          <div className="bg-slate-950/45 border border-slate-850/60 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-brand-cyan" />
                  <span>Calendário Semanal de Metas</span>
                </h4>
                <p className="text-[9px] text-slate-450 mt-0.5 leading-tight">Acompanhamento de metas de Segunda a Sábado no período correspondente</p>
              </div>
              <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded w-fit self-start sm:self-auto">
                Segunda a Sábado
              </span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {weeklyPerformanceDays.map((day) => {
                const isToday = new Date().toISOString().split("T")[0] === day.dateStr;
                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    onClick={() => handleDayClick(day.dateStr)}
                    className={`relative p-3 rounded-xl border flex flex-col justify-between text-left transition-all duration-300 cursor-pointer hover:scale-[1.04] active:scale-[0.96] hover:shadow-[0_0_15px_rgba(34,211,238,0.12)] group ${
                      day.isMet
                        ? "bg-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/55 shadow-[0_0_12px_rgba(16,185,129,0.06)]"
                        : day.hasSalesOrExpenses
                        ? "bg-rose-500/5 border-rose-500/30 hover:border-rose-500/55 shadow-[0_0_12px_rgba(239,68,68,0.06)]"
                        : "bg-slate-900/40 border-slate-850 hover:border-slate-750"
                    } ${isToday ? "ring-2 ring-brand-cyan/50" : ""}`}
                    title="Clique para ver o relatório completo de vendas e despesas"
                  >
                    <div className="flex items-center justify-between gap-1.5 w-full">
                      <span className="text-[10px] font-mono font-black text-slate-300 uppercase">{day.weekdayShort}</span>
                      <span className="text-[9px] font-mono font-semibold text-slate-400">{day.dateLabel}</span>
                    </div>

                    <div className="mt-3 flex items-center justify-between w-full">
                      {day.isMet ? (
                        <span className="flex items-center gap-1 text-[9.5px] font-black text-emerald-450 uppercase">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Batida</span>
                        </span>
                      ) : day.hasSalesOrExpenses ? (
                        <span className="flex items-center gap-1 text-[9.5px] font-black text-rose-455 uppercase">
                          <X className="h-3.5 w-3.5 text-rose-500" />
                          <span>Abaixo</span>
                        </span>
                      ) : (
                        <span className="text-[9.5px] font-bold text-slate-500 uppercase">Sem Vendas</span>
                      )}
                    </div>
                    
                    <div className="mt-2 text-right w-full flex items-center justify-between">
                      <span className="text-[7.5px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">Ver Relatório ➜</span>
                      <p className="text-[11px] font-mono font-black text-slate-100">
                        R$ {day.netProfit.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* WEEKDAY GOALS SETUP & MINI STATS COMPACT ROW */}
          <div className="flex flex-col lg:flex-row gap-4 w-full">
            {/* Left Panel: Weekday Goals Editor */}
            <div className="flex-1 w-full min-w-[300px] bg-slate-950/45 border border-slate-850/60 rounded-2xl p-4 flex flex-col justify-between gap-3">
              <div className="flex flex-col gap-1.5 border-b border-slate-850/50 pb-2">
                <div className="flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-brand-cyan animate-pulse" />
                  <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider">
                    Definir Metas Diárias 🎯
                  </h4>
                </div>
                <span className="text-[8.5px] font-mono font-bold text-slate-400 uppercase bg-slate-900 border border-slate-800/80 px-2 py-0.5 rounded w-fit">
                  Padrão: R$ {dailyMetaGoal.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>

              {/* Grid of weekday buttons ordered Seg -> Dom with Dia 1 -> Dia 7 labels */}
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                {[
                  { dayNum: 1, label: "Seg", sub: "Dia 1" },
                  { dayNum: 2, label: "Ter", sub: "Dia 2" },
                  { dayNum: 3, label: "Qua", sub: "Dia 3" },
                  { dayNum: 4, label: "Qui", sub: "Dia 4" },
                  { dayNum: 5, label: "Sex", sub: "Dia 5" },
                  { dayNum: 6, label: "Sáb", sub: "Dia 6" },
                  { dayNum: 0, label: "Dom", sub: "Dia 7" }
                ].map(({ dayNum, label, sub }) => {
                  const dayGoal = activeWeekdayGoals[dayNum] !== undefined ? activeWeekdayGoals[dayNum] : dailyMetaGoal;
                  const isSelected = selectedWeekdayConfig === dayNum;

                  return (
                    <button
                      key={dayNum}
                      type="button"
                      onClick={() => setSelectedWeekdayConfig(dayNum)}
                      className={`py-2 px-1 rounded-xl border transition-all text-center flex flex-col justify-center items-center cursor-pointer select-none ${
                        isSelected 
                          ? "bg-brand-cyan/15 border-brand-cyan text-brand-cyan shadow-[0_0_8px_rgba(34,211,238,0.12)]" 
                          : "bg-slate-900/40 border-slate-850/70 text-slate-300 hover:bg-slate-900 hover:border-slate-800"
                      }`}
                    >
                      <span className="text-[10px] font-black tracking-tight">{label}</span>
                      <span className="text-[8px] text-slate-500 font-medium leading-none mt-0.5">{sub}</span>
                      <span className="text-[8.5px] font-mono font-bold mt-1 block truncate max-w-full opacity-90">
                        R$ {dayGoal.toFixed(0)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active editor row - Configured as a clean vertical layout to prevent overlapping */}
              {selectedWeekdayConfig !== null && (
                <div className="p-3 bg-slate-900/40 border border-slate-850/50 rounded-xl flex flex-col gap-3 text-left animate-fade-in w-full">
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-slate-200">
                      Meta para toda <span className="text-brand-cyan font-black">{WEEKDAYS_PT[selectedWeekdayConfig]}</span>-feira:
                    </p>
                    <p className="text-[9px] text-slate-450 leading-tight">
                      Este valor personalizado substituirá a meta geral padrão para todas as {WEEKDAYS_PT[selectedWeekdayConfig]}-feiras do período.
                    </p>
                  </div>

                  {/* Input field and action buttons always below the labels */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-850/40 w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">Meta:</span>
                      <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-0.5">
                        <span className="text-[10px] font-mono text-slate-500 font-bold">R$</span>
                        <input
                          type="number"
                          step="10"
                          min="0"
                          value={activeWeekdayGoals[selectedWeekdayConfig] !== undefined ? activeWeekdayGoals[selectedWeekdayConfig] : Math.round(dailyMetaGoal)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            updateWeekdayGoal(selectedWeekdayConfig, isNaN(val) ? 0 : Math.max(0, val));
                          }}
                          className="w-20 bg-transparent text-slate-100 text-[10.5px] font-mono font-black focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const currentVal = activeWeekdayGoals[selectedWeekdayConfig] !== undefined ? activeWeekdayGoals[selectedWeekdayConfig] : dailyMetaGoal;
                            updateWeekdayGoal(selectedWeekdayConfig, Math.max(0, currentVal - 50));
                          }}
                          className="px-2 py-1 bg-slate-950 border border-slate-800 text-[9.5px] font-extrabold text-slate-300 rounded hover:bg-slate-800 cursor-pointer"
                          title="- R$ 50"
                        >
                          -50
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const currentVal = activeWeekdayGoals[selectedWeekdayConfig] !== undefined ? activeWeekdayGoals[selectedWeekdayConfig] : dailyMetaGoal;
                            updateWeekdayGoal(selectedWeekdayConfig, currentVal + 50);
                          }}
                          className="px-2 py-1 bg-slate-950 border border-slate-850 text-[9.5px] font-extrabold text-slate-300 rounded hover:bg-slate-850 cursor-pointer"
                          title="+ R$ 50"
                        >
                          +50
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...activeWeekdayGoals };
                          delete next[selectedWeekdayConfig];
                          if (setCustomWeekdayGoals) {
                            setCustomWeekdayGoals(next);
                          } else {
                            setLocalGoals(next);
                            localStorage.setItem("NUCLEO_WEEKDAY_GOALS", JSON.stringify(next));
                          }
                        }}
                        className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 hover:border-slate-650 text-[9px] font-bold text-slate-400 hover:text-slate-200 rounded-lg cursor-pointer transition-all"
                      >
                        Resetar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel: Compact Goals Accomplishment Stats */}
            <div className="w-full lg:w-[320px] shrink-0 bg-slate-950/45 border border-slate-850/60 rounded-2xl p-4 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between border-b border-slate-850/50 pb-1.5">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider font-mono flex items-center gap-1">
                  <Activity className="h-3 w-3 text-emerald-400" />
                  <span>Aproveitamento de Metas 🎯</span>
                </span>
                <span className="text-[8px] text-slate-500 uppercase font-mono font-bold">filtrado</span>
              </div>

              {(() => {
                const totalDaysActive = stats.daysMet + stats.daysMissed;
                const metPct = totalDaysActive > 0 ? Math.round((stats.daysMet / totalDaysActive) * 100) : 0;
                const missedPct = totalDaysActive > 0 ? 100 - metPct : 0;
                
                return (
                  <div className="space-y-3 py-1">
                    {/* Visual Segmented Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 font-mono">
                        <span>Taxa de Sucesso: {metPct}%</span>
                        <span>{totalDaysActive} dias total</span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden flex border border-slate-850">
                        {totalDaysActive > 0 ? (
                          <>
                            <div 
                              className="bg-emerald-500 h-full transition-all duration-500 shadow-[0_0_6px_rgba(16,185,129,0.3)]" 
                              style={{ width: `${metPct}%` }} 
                              title={`${stats.daysMet} dias batidos (${metPct}%)`}
                            />
                            <div 
                              className="bg-rose-500 h-full transition-all duration-500 shadow-[0_0_6px_rgba(239,68,68,0.3)]" 
                              style={{ width: `${missedPct}%` }}
                              title={`${stats.daysMissed} dias abaixo (${missedPct}%)`}
                            />
                          </>
                        ) : (
                          <div className="w-full bg-slate-800/50 h-full" />
                        )}
                      </div>
                    </div>

                    {/* Stats Rows */}
                    <div className="grid grid-cols-2 gap-2 text-left">
                      <div className="p-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                        <span className="text-[8px] font-mono font-black text-emerald-450 block uppercase">Batidas 🏆</span>
                        <div className="text-sm font-mono font-black text-emerald-400">
                          {stats.daysMet} <span className="text-[9px] font-sans font-bold text-slate-400">dias</span>
                        </div>
                      </div>

                      <div className="p-1.5 rounded-lg bg-rose-500/5 border border-rose-500/10">
                        <span className="text-[8px] font-mono font-black text-rose-455 block uppercase">Abaixo ❌</span>
                        <div className="text-sm font-mono font-black text-rose-400">
                          {stats.daysMissed} <span className="text-[9px] font-sans font-bold text-slate-400">dias</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <p className="text-[8px] text-slate-500 leading-tight italic font-mono pt-1.5 border-t border-slate-850/40">
                Acompanhamento em tempo real para o intervalo de datas selecionado acima.
              </p>
            </div>
          </div>

          {/* DYNAMIC VIEWPORT TAB CONTENT */}
          {daysInSelectedPeriod.length === 0 ? (
            <div className="py-14 text-center space-y-2 bg-slate-950/40 rounded-2xl border border-slate-850">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto animate-bounce" />
              <p className="text-sm font-bold text-slate-300">Nenhum dia encontrado neste período</p>
              <p className="text-xs text-slate-500">Escolha outra semana, mês ou selecione novas datas acima.</p>
            </div>
          ) : (
            <>
              {viewTab === "chart" ? (
                /* VIEW 1: SUPER BEAUTIFUL AND STYLISH HIGH-DEF GRAPHICS CARD */
                <div className="space-y-4 animate-fade-in">
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-850 space-y-4 relative">
                    
                    {/* Floating dynamic design indicators */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wide flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5 text-brand-cyan animate-pulse" />
                          <span>Curva Comparativa de Metas Diárias</span>
                        </h4>
                        <p className="text-[9px] text-slate-450 mt-0.5 leading-tight">Linha do tempo diária registrando faturamentos e lucros vs meta diária de R$ {dailyMetaGoal.toLocaleString("pt-BR")}</p>
                      </div>
                      
                      <div className="flex items-center gap-3 text-[9.5px] font-mono">
                        <span className="flex items-center gap-1.5 text-emerald-450 font-bold">
                          <span className="w-2.5 h-2.5 rounded bg-emerald-400/80 block shrink-0" /> Lucro Líquido
                        </span>
                        <span className="flex items-center gap-1.5 text-rose-500 font-bold">
                          <span className="w-2.5 h-0.5 bg-rose-500 block border-dashed shrink-0" /> Linha de Meta Diária
                        </span>
                      </div>
                    </div>

                    {/* Chart layout wrapper */}
                    <div className="h-60 sm:h-68 w-full select-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={reportData}
                          margin={{ top: 12, right: 10, left: -22, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorProfitGlow" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                            </linearGradient>
                          </defs>
                          
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                          
                          <XAxis 
                            dataKey="dateLabel" 
                            stroke="#475569" 
                            fontSize={9} 
                            tickLine={false}
                            axisLine={false}
                            tickMargin={6}
                          />
                          
                          <YAxis 
                            stroke="#475569" 
                            fontSize={9} 
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => `R$ ${v}`}
                            tickMargin={6}
                          />
                          
                          <Tooltip content={<CustomTooltip />} />
                          
                          {/* 0 threshold benchmark horizontal line */}
                          <ReferenceLine y={0} stroke="#334155" strokeWidth={1} strokeDasharray="2 2" />
                          
                          {/* Daily target line - Draw a dynamic line because goals can vary per weekday! */}
                          <Line 
                            type="monotone" 
                            dataKey="dailyMetaGoal" 
                            stroke="#ef4444" 
                            strokeWidth={1.5} 
                            strokeDasharray="4 4" 
                            dot={false}
                            activeDot={false}
                            name="Meta Diária"
                          />

                          <Area 
                            type="monotone" 
                            dataKey="netProfit" 
                            name="Lucro Líquido"
                            stroke="#10b981" 
                            strokeWidth={2.5}
                            fillOpacity={1} 
                            fill="url(#colorProfitGlow)"
                            activeDot={{ r: 6, strokeWidth: 0, fill: '#34d399' }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Chart bottom helpful context */}
                    <p className="text-[8.5px] text-slate-500 font-mono text-right italic select-none">
                      ⚠️ Mostrando {reportData.length} dias de intervalo selecionados.
                    </p>
                  </div>
                </div>
              ) : (
                /* VIEW 2: ORIGINAL CHRONOGRAM LIST BREAKDOWN MATCHING FILTER SCOPE */
                <div className="space-y-3.5 animate-fade-in">
                  <div className="flex items-center justify-between pl-1">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider font-mono">CRONOGRAMA DETALHADO DO PERÍODO</span>
                    {filterStatus !== "all" && (
                      <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-lg">
                        <span className="text-[9px] font-bold text-slate-400">
                          Filtrando: <span className="text-brand-cyan font-extrabold">{filterStatus === "met" ? "METAS BATIDAS 🏆" : "ABAIXO DA META ❌"}</span>
                        </span>
                        <button
                          onClick={() => setFilterStatus("all")}
                          className="text-[9px] font-black text-brand-cyan hover:underline cursor-pointer uppercase"
                        >
                          Limpar [x]
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2.5">
                    {filteredReportData.map((d, index) => {
                      const isToday = new Date().toISOString().split("T")[0] === d.dateStr;

                      return (
                        <button 
                          key={d.dateStr}
                          type="button"
                          onClick={() => handleDayClick(d.dateStr)}
                          className={`w-full p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 text-left transition-all cursor-pointer hover:scale-[1.015] hover:bg-slate-950/80 active:scale-[0.985] group ${
                            isToday 
                              ? "bg-slate-950 border-brand-cyan/40 shadow-[0_0_12.5px_rgba(34,211,238,0.08)]" 
                              : "bg-slate-950/40 border-slate-850 hover:bg-slate-950/70"
                          }`}
                          title="Clique para ver o relatório completo de vendas e despesas"
                        >
                          {/* Left stats */}
                          <div className="flex items-start gap-3">
                            <div className="w-1.5 h-[34px] rounded-full shrink-0 mt-0.5" style={{
                              backgroundColor: d.dailyMetaGoal === 0
                                ? "#475569" 
                                : d.netProfit >= d.dailyMetaGoal 
                                  ? "#10b981" 
                                  : d.netProfit < 0
                                    ? "#ef4444"
                                    : "#f43f5e"
                            }} />
                            
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-extrabold text-slate-100">
                                  {d.weekdayName}
                                </span>
                                {isToday && (
                                  <span className="text-[8px] bg-brand-cyan text-slate-950 px-1.5 py-[1px] rounded uppercase font-black font-mono tracking-wider animate-pulse leading-none">
                                    HOJE
                                  </span>
                                )}
                                <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-950 border border-slate-850 px-1.5 py-0.2 rounded">
                                  {d.dateLabel}
                                </span>
                              </div>
                              
                              <div className="text-[9.5px] text-slate-450 mt-1 flex items-center gap-2 flex-wrap leading-none">
                                <span>Meta: <strong className="text-slate-350 font-mono">R$ {d.dailyMetaGoal.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</strong></span>
                                <span className="text-slate-700 font-mono">•</span>
                                <span>Faturamento: <strong className="text-slate-350 font-mono">R$ {d.faturamento.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</strong></span>
                                <span className="text-slate-700 font-mono">•</span>
                                <span>Pedidos: <strong className="text-slate-350 font-mono">{d.salesCount}</strong></span>
                              </div>
                            </div>
                          </div>

                          {/* Right dynamic statuses */}
                          <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-slate-850/60 pt-2 sm:pt-0">
                            <div className="text-left sm:text-right">
                              <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wider font-sans">Lucro Líquido</p>
                              <strong className={`text-xs sm:text-sm font-black font-mono tracking-tight ${d.netProfit >= d.dailyMetaGoal && d.dailyMetaGoal > 0 ? "text-emerald-400" : d.netProfit < 0 ? "text-rose-500" : "text-slate-200"}`}>
                                R$ {d.netProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </strong>
                            </div>

                            <div className="min-w-[125px] flex justify-end shrink-0">
                              {d.dailyMetaGoal === 0 ? (
                                <span className="text-[9px] font-bold text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg flex items-center gap-1 uppercase font-sans">
                                  <Target className="h-3 w-3 text-slate-400" />
                                  <span>Sem Meta</span>
                                </span>
                              ) : d.netProfit >= d.dailyMetaGoal ? (
                                <span className="text-[9px] font-black text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 px-2.5 py-1 rounded-lg flex items-center gap-1.5 uppercase font-sans">
                                  <CheckCircle className="h-3 w-3 text-emerald-400" />
                                  <span>BATEU META 🏆</span>
                                </span>
                              ) : !d.hasSalesOrExpenses ? (
                                <span className="text-[9px] font-bold text-slate-500 bg-slate-900 border border-slate-850 px-2.5 py-1 rounded-lg flex items-center gap-1 font-sans uppercase">
                                  <span>Sem Vendas</span>
                                </span>
                              ) : d.netProfit < 0 ? (
                                <span className="text-[9px] font-black text-rose-500 bg-rose-955/20 border border-rose-910/30 px-2.5 py-1 rounded-lg flex items-center gap-1 uppercase font-sans">
                                  <AlertTriangle className="h-3 w-3 text-rose-500" />
                                  <span>PREJUÍZO</span>
                                </span>
                              ) : (
                                <span className="text-[9px] font-black text-amber-500 bg-amber-950/15 border border-amber-900/30 px-2.5 py-1 rounded-lg flex items-center gap-1 uppercase font-sans">
                                  <X className="h-3 w-3 text-amber-500 hover:scale-110 transition-all" />
                                  <span>-R$ {Math.round(d.dailyMetaGoal - d.netProfit)} de meta</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Legend Dynamic Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-805 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 font-sans">
          <div className="flex items-center gap-1.5 text-left text-[9px] text-slate-450 max-w-xl">
            <TrendingUp className="h-3.5 w-3.5 text-brand-cyan shrink-0" />
            <span>Fórmula: Lucros líquidos calculados deduzindo-se custo operacional, fretes de motoboys e gastos excepcionais do dia correspondente.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:border-slate-750 text-slate-200 text-xs font-bold transition-all cursor-pointer shadow-md select-none hover:text-white"
          >
            Fechar Janela
          </button>
        </div>

        {/* Day Details Report Modal Overlay */}
        {selectedDayDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                <div>
                  <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider font-mono">
                    Relatório de Vendas e Caixa Diário
                  </h3>
                  <p className="text-xs text-brand-cyan font-mono font-bold mt-0.5">
                    Data: {selectedDayDetails.dateStr.split("-").reverse().join("/")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDayDetails(null)}
                  className="text-slate-400 hover:text-slate-100 p-1.5 rounded-xl bg-slate-850 hover:bg-slate-800 cursor-pointer transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content - Scrollable */}
              <div className="p-5 overflow-y-auto space-y-5">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-850">
                    <span className="text-[8px] uppercase font-bold text-slate-500 font-mono">Entradas (Caixa)</span>
                    <p className="text-sm font-extrabold font-mono text-emerald-450 mt-0.5">
                      R$ {selectedDayDetails.realPaymentsReceived.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-850">
                    <span className="text-[8px] uppercase font-bold text-slate-500 font-mono">Custos Venda</span>
                    <p className="text-sm font-extrabold font-mono text-slate-350 mt-0.5">
                      R$ {(selectedDayDetails.daySaleOperationCost + selectedDayDetails.dayMotoboyCost).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-850">
                    <span className="text-[8px] uppercase font-bold text-slate-500 font-mono">Despesas</span>
                    <p className="text-sm font-extrabold font-mono text-rose-450 mt-0.5">
                      R$ {selectedDayDetails.dayExpenses.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-850">
                    <span className="text-[8px] uppercase font-bold text-slate-500 font-mono">Lucro Líquido</span>
                    <p className={`text-sm font-extrabold font-mono mt-0.5 ${selectedDayDetails.netProfit >= 0 ? "text-emerald-450" : "text-rose-455"}`}>
                      R$ {selectedDayDetails.netProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Sales list */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-450" />
                    <span>Pedidos e Recebimentos do Dia ({selectedDayDetails.salesList.length})</span>
                  </h4>
                  {selectedDayDetails.salesList.length > 0 ? (
                    <div className="border border-slate-850 rounded-xl overflow-hidden bg-slate-950/15 max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-950/70 text-slate-400 uppercase font-mono text-[8px] border-b border-slate-850 sticky top-0">
                          <tr>
                            <th className="p-2.5 font-bold">Cliente</th>
                            <th className="p-2.5 font-bold text-right">Total Pedido</th>
                            <th className="p-2.5 font-bold text-right text-emerald-450">Valor Pago (Hoje)</th>
                            <th className="p-2.5 font-bold text-right">Custos</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850/50">
                          {selectedDayDetails.salesList.map((s: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-900/30">
                              <td className="p-2.5 font-bold text-slate-200">
                                {s.clientName}
                                {!s.isOrderToday && (
                                  <span className="ml-1 text-[7px] bg-slate-800 text-slate-400 px-1 py-[0.5px] rounded font-mono font-normal">
                                    BAIXA
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono text-right text-slate-400">
                                R$ {s.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 font-mono text-right font-bold text-emerald-450">
                                R$ {s.paidAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 font-mono text-right text-slate-455">
                                R$ {s.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-5 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/5">
                      <p className="text-[10px] text-slate-500 font-medium font-mono">Nenhuma venda/pagamento registrado.</p>
                    </div>
                  )}
                </div>

                {/* Expenses list */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-rose-455" />
                    <span>Despesas Gerais ({selectedDayDetails.expensesList.length})</span>
                  </h4>
                  {selectedDayDetails.expensesList.length > 0 ? (
                    <div className="border border-slate-850 rounded-xl overflow-hidden bg-slate-950/15 max-h-40 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-950/70 text-slate-400 uppercase font-mono text-[8px] border-b border-slate-850 sticky top-0">
                          <tr>
                            <th className="p-2.5 font-bold">Descrição</th>
                            <th className="p-2.5 font-bold">Categoria</th>
                            <th className="p-2.5 font-bold text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850/50">
                          {selectedDayDetails.expensesList.map((e: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-900/30">
                              <td className="p-2.5 text-slate-200 font-medium">{e.description}</td>
                              <td className="p-2.5 text-slate-400">{e.category || "Geral"}</td>
                              <td className="p-2.5 font-mono text-right text-rose-400 font-bold">
                                - R$ {e.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-5 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/5">
                      <p className="text-[10px] text-slate-500 font-medium font-mono">Nenhuma despesa standalone registrada.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Controls */}
              <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/50">
                <button
                  type="button"
                  onClick={() => setSelectedDayDetails(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-slate-100 rounded-xl text-[11px] font-bold cursor-pointer transition-all"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => printReport(selectedDayDetails.dateStr, selectedDayDetails)}
                  className="px-4 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-950 rounded-xl text-[11px] font-black flex items-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(34,211,238,0.25)] transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                  </svg>
                  <span>Imprimir Relatório</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
