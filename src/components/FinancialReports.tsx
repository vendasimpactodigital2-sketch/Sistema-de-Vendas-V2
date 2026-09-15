import React, { useState } from "react";
import { Sale, Expense, CompanyProfile, getSaleOrderDate, getSaleOperationCost, CashRegisterState, CashRegisterSession, isQuickSaleClient } from "../types";
import {
  Calendar,
  FileDown,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  RefreshCw,
  ShoppingBag,
  ListFilter,
  BarChart4,
  ArrowRight,
  Lock,
  Unlock,
  PieChart as PieChartIcon,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Target,
  ShieldAlert
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { jsPDF } from "jspdf";
import { AttendantAuditReport } from "./AttendantAuditReport";

interface FinancialReportsProps {
  sales: Sale[];
  expenses: Expense[];
  company: CompanyProfile;
  cashRegister?: CashRegisterState;
}

export function FinancialReports({ sales, expenses, company, cashRegister }: FinancialReportsProps) {
  const [activeReportTab, setActiveReportTab] = useState<"financeiro" | "auditoria_atendente" | "acessos">("financeiro");
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

  // Date boundary defaults
  const getFirstDayOfMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };

  const getTodayDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const [startDate, setStartDate] = useState<string>(getTodayDateString());
  const [endDate, setEndDate] = useState<string>(getTodayDateString());
  const [activePreset, setActivePreset] = useState<"today" | "week" | "month" | "custom">("today");
  const [displayMode, setDisplayMode] = useState<"geral" | "entradas" | "gastos" | "lucro" | "total_vendido">("geral");

  // Format helper
  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  const applyPreset = (preset: "today" | "week" | "month" | "custom") => {
    setActivePreset(preset);
    const today = new Date();

    switch (preset) {
      case "today": {
        const dStr = getTodayDateString();
        setStartDate(dStr);
        setEndDate(dStr);
        break;
      }
      case "week": {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 6);
        const fStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(sevenDaysAgo.getDate()).padStart(2, "0")}`;
        setStartDate(fStr);
        setEndDate(getTodayDateString());
        break;
      }
      case "month": {
        const firstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
        const lastDayOfM = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const lastDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(lastDayOfM.getDate()).padStart(2, "0")}`;
        setStartDate(firstDay);
        setEndDate(lastDay);
        break;
      }
      case "custom": {
        break;
      }
    }
  };

  // Safe checks for date boundaries based on local date strings
  const isWithinRange = (dateStr: string) => {
    if (!dateStr) return false;
    const itemLocalDate = getLocalDateFromISO(dateStr);
    return itemLocalDate >= startDate && itemLocalDate <= endDate;
  };

  // Filter lists based on boundaries
  const filteredSales = sales.filter((s) => !s.isBudget && isWithinRange(s.date));
  const filteredExpenses = expenses.filter((e) => isWithinRange(e.date));

  // Real cash inflow received within the filtered period ("Entradas / Sinais")
  const totalRevenuePaid = React.useMemo(() => {
    let totalInflow = 0;
    sales.forEach(sale => {
      if (sale.isBudget) return;
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach(payment => {
          if (isWithinRange(payment.date)) {
            totalInflow += payment.amount;
          }
        });
      } else {
        if (sale.downPayment > 0 && isWithinRange(sale.date)) {
          totalInflow += sale.downPayment;
        }
      }
    });
    return totalInflow;
  }, [sales, activePreset, startDate, endDate]);

  // Calculations for KPI numbers
  const faturamentoTotal = React.useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + s.totalValue, 0);
  }, [filteredSales]);
  const totalSinalRecebido = totalRevenuePaid; // signal received matches total revenues paid in period
  const totalSaldoDevedor = sales.filter((s) => !s.isBudget && !isQuickSaleClient(s.clientName)).reduce((acc, s) => acc + (s.balanceDue || 0), 0); // Cumulative outstanding balance of identified client sales
  
  const totalDescontoConcedido = React.useMemo(() => {
    return sales
      .filter((s) => !s.isBudget)
      .reduce((acc, s) => {
        const orderDate = getSaleOrderDate(s);
        if (isWithinRange(orderDate)) {
          return acc + s.discount;
        }
        return acc;
      }, 0);
  }, [sales, activePreset, startDate, endDate]);

  // Saídas (Costs/Outflows)
  const totalCustosOp = React.useMemo(() => {
    return sales
      .filter((s) => !s.isBudget)
      .reduce((acc, s) => {
        const orderDate = getSaleOrderDate(s);
        if (isWithinRange(orderDate)) {
          return acc + getSaleOperationCost(s) + (s.useMotoboy ? (s.motoboyCost || 0) : 0);
        }
        return acc;
      }, 0);
  }, [sales, activePreset, startDate, endDate]);

  const totalDespesasGerais = filteredExpenses.reduce((acc, e) => acc + e.value, 0);
  const totalSaidasGeral = totalCustosOp + totalDespesasGerais;

  // Real Net Profit
  const lucroLiquidoReal = faturamentoTotal - totalSaidasGeral;
  const margemLucro = faturamentoTotal > 0 ? (lucroLiquidoReal / faturamentoTotal) * 100 : 0;

  // Ticket Médio & Financial Health Metrics
  const totalVendasCount = filteredSales.length;
  const ticketMedio = totalVendasCount > 0 ? faturamentoTotal / totalVendasCount : 0;
  const proporcaoGastosVendas = faturamentoTotal > 0 ? (totalSaidasGeral / faturamentoTotal) * 100 : 0;
  const proporcaoLucroVendas = faturamentoTotal > 0 ? (Math.max(0, lucroLiquidoReal) / faturamentoTotal) * 100 : 0;

  // Pie Chart Data (O Que Vendeu em VERDE, Gastos em VERMELHO, O Que Sobrou em AMARELO)
  const pieChartData = React.useMemo(() => [
    { name: "O Que Vendeu", value: faturamentoTotal, color: "#10b981", rawLabel: "Vendeu" },
    { name: "Gastos / Saídas", value: totalSaidasGeral, color: "#ef4444", rawLabel: "Gastou" },
    { name: "O Que Sobrou (Lucro)", value: Math.max(0, lucroLiquidoReal), color: "#f59e0b", rawLabel: "Sobrou" }
  ], [faturamentoTotal, totalSaidasGeral, lucroLiquidoReal]);

  // Financial Health Mode Diagnosis
  const healthMode = React.useMemo(() => {
    if (faturamentoTotal === 0 && totalSaidasGeral === 0) {
      return {
        status: "neutral",
        title: "Modo Neutro: Sem Movimentação",
        badge: "ℹ️ SEM DADOS SUFICIENTES",
        color: "text-slate-400 bg-slate-900/60 border-slate-800",
        badgeColor: "bg-slate-800 text-slate-300 border-slate-700",
        message: "Não foram registradas vendas nem despesas no período selecionado.",
        tip: "Selecione outro período no filtro de datas para analisar a saúde financeira."
      };
    }

    if (lucroLiquidoReal < 0 || totalSaidasGeral > faturamentoTotal) {
      return {
        status: "danger",
        title: "Alerta de Gastos: Despesas Superaram as Vendas",
        badge: "🚨 MODO ALERTA VERMELHO: GASTOS EXCESSIVOS",
        color: "text-rose-400 bg-rose-500/10 border-rose-500/30",
        badgeColor: "bg-rose-500/20 text-rose-400 border-rose-500/40",
        message: `Atenção! Seus gastos (${formatBRL(totalSaidasGeral)}) superaram o total vendido (${formatBRL(faturamentoTotal)}) no período selecionado, gerando déficit de ${formatBRL(Math.abs(lucroLiquidoReal))}.`,
        tip: `Seu Ticket Médio atual é de ${formatBRL(ticketMedio)}. Recomenda-se conter despesas administrativas imediatamente ou promover produtos de maior valor agregado.`
      };
    }

    if (margemLucro < 25 || proporcaoGastosVendas > 75) {
      return {
        status: "warning",
        title: "Atenção à Margem: Lucro Moderado",
        badge: "⚠️ MODO ATENÇÃO: MARGEM COMPROMETIDA",
        color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
        badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/40",
        message: `As vendas cobriram as despesas, mas os gastos consumiram ${proporcaoGastosVendas.toFixed(1)}% do faturamento. O que sobrou (amarelo) foi de ${formatBRL(lucroLiquidoReal)} (${margemLucro.toFixed(1)}%).`,
        tip: `Seu Ticket Médio é de ${formatBRL(ticketMedio)} em ${totalVendasCount} vendas. Pequenas reduções em custos farão o lucro líquido disparar!`
      };
    }

    return {
      status: "success",
      title: "Vendas em Alta: Excelente Saúde Financeira",
      badge: "🚀 MODO VENDAS EM ALTA • DESEMPENHO EXCELENTE",
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
      message: `Excelente ritmo de vendas! Você faturou ${formatBRL(faturamentoTotal)} e o que sobrou no caixa foi ${formatBRL(lucroLiquidoReal)} (Margem de ${margemLucro.toFixed(1)}%).`,
      tip: `Seu Ticket Médio está forte em ${formatBRL(ticketMedio)} em ${totalVendasCount} pedidos. A proporção de gastos ficou controlada em apenas ${proporcaoGastosVendas.toFixed(1)}%.`
    };
  }, [faturamentoTotal, totalSaidasGeral, lucroLiquidoReal, margemLucro, proporcaoGastosVendas, ticketMedio, totalVendasCount]);

  const faturamentoVendasRapidas = React.useMemo(() => {
    return filteredSales
      .filter((s) => s.clientName === "Venda Rápida")
      .reduce((acc, s) => acc + s.totalValue, 0);
  }, [filteredSales]);

  const faturamentoVendasPadrao = React.useMemo(() => {
    return filteredSales
      .filter((s) => s.clientName !== "Venda Rápida")
      .reduce((acc, s) => acc + s.totalValue, 0);
  }, [filteredSales]);

  // Aggregated top selling products memo based on filteredSales
  const topProducts = React.useMemo(() => {
    const productMap: Record<string, { description: string; quantity: number; totalValue: number; salesCount: number }> = {};
    
    filteredSales.forEach(sale => {
      if (sale.items && sale.items.length > 0) {
        sale.items.forEach(item => {
          const desc = item.description ? item.description.trim().toUpperCase() : "";
          if (!desc) return;
          if (!productMap[desc]) {
            productMap[desc] = {
              description: item.description,
              quantity: 0,
              totalValue: 0,
              salesCount: 0
            };
          }
          productMap[desc].quantity += item.quantity || 0;
          productMap[desc].totalValue += item.totalValue || 0;
          productMap[desc].salesCount += 1;
        });
      }
    });

    return Object.values(productMap).sort((a, b) => b.quantity - a.quantity);
  }, [filteredSales]);

  // Safe checks helper for dates inside list generators
  const listIsWithinRange = (dateStr: string) => {
    if (!dateStr) return false;
    const itemLocalDate = getLocalDateFromISO(dateStr);
    return itemLocalDate >= startDate && itemLocalDate <= endDate;
  };

  // Memo for Entries list
  const entriesList = React.useMemo(() => {
    const list: { id: string; date: string; clientName: string; method: string; amount: number; saleId: string }[] = [];
    sales.forEach(sale => {
      if (sale.isBudget) return;
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach((payment, idx) => {
          if (listIsWithinRange(payment.date)) {
            list.push({
              id: `${sale.id}-p-${idx}`,
              date: payment.date,
              clientName: sale.clientName,
              method: payment.method || sale.paymentMethod || "dinheiro",
              amount: payment.amount,
              saleId: sale.id
            });
          }
        });
      } else {
        if (sale.downPayment > 0 && listIsWithinRange(sale.date)) {
          list.push({
            id: `${sale.id}-down`,
            date: sale.date,
            clientName: sale.clientName,
            method: sale.paymentMethod || "dinheiro",
            amount: sale.downPayment,
            saleId: sale.id
          });
        }
      }
    });
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, startDate, endDate]);

  // Memo for Expenses list
  const expensesList = React.useMemo(() => {
    const list: { id: string; date: string; description: string; category: string; value: number }[] = [];
    
    // Add administrative expenses
    filteredExpenses.forEach(exp => {
      list.push({
        id: exp.id,
        date: exp.date,
        description: exp.description,
        category: exp.category || "Despesa Administrativa",
        value: exp.value
      });
    });

    // Add operational costs of standard sales
    filteredSales.forEach(sale => {
      const opCost = getSaleOperationCost(sale);
      if (opCost > 0) {
        list.push({
          id: `${sale.id}-opcost`,
          date: getSaleOrderDate(sale),
          description: `Custo Operacional de Produção - Venda de ${sale.clientName}`,
          category: "Custo Operacional",
          value: opCost
        });
      }
      if (sale.useMotoboy && sale.motoboyCost > 0) {
        list.push({
          id: `${sale.id}-motoboy`,
          date: getSaleOrderDate(sale),
          description: `Taxa / Custo de Motoboy - Entrega ${sale.clientName}`,
          category: "Logística / Entrega",
          value: sale.motoboyCost
        });
      }
    });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredExpenses, filteredSales]);

  // Memo for Profit list
  const profitList = React.useMemo(() => {
    return filteredSales.map(sale => {
      const opCost = getSaleOperationCost(sale) + (sale.useMotoboy ? sale.motoboyCost : 0);
      const profit = sale.totalValue - opCost;
      return {
        id: sale.id,
        date: sale.date,
        clientName: sale.clientName,
        totalValue: sale.totalValue,
        opCost,
        profit
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredSales]);

  // Memo for Sales list
  const salesList = React.useMemo(() => {
    return filteredSales.map(sale => ({
      id: sale.id,
      date: sale.date,
      clientName: sale.clientName,
      paymentMethod: sale.paymentMethod || "dinheiro",
      totalValue: sale.totalValue
    })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredSales]);

  // PDF report specific for top selling products
  const handleDownloadTopProductsReport = () => {
    const doc = new jsPDF();
    const todayStr = new Date().toLocaleDateString("pt-BR");
    
    // Header design
    doc.setFillColor(15, 23, 42); // dark navy
    doc.rect(0, 0, 210, 38, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(company.tradingName ? company.tradingName.toUpperCase() : "IMPACTO DIGITAL", 14, 15);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Relatório de Produtos Mais Vendidos - Gerado em ${todayStr}`, 14, 21);
    doc.text(`Período: ${new Date(startDate + "T12:00:00").toLocaleDateString("pt-BR")} até ${new Date(endDate + "T12:00:00").toLocaleDateString("pt-BR")}`, 14, 26);
    
    let y = 48;
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("RANKING DE PRODUTOS MAIS VENDIDOS", 14, y);
    y += 8;

    // Table mapping
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 8, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("Pos.", 17, y + 5.5);
    doc.text("Descrição do Produto / Serviço", 30, y + 5.5);
    doc.text("Qtde Vendida", 115, y + 5.5);
    doc.text("Faturamento", 145, y + 5.5);
    doc.text("% Qtd", 180, y + 5.5);
    y += 9;

    const totalQuantity = topProducts.reduce((acc, p) => acc + p.quantity, 0);

    if (topProducts.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("Nenhum produto vendido localizado neste período.", 16, y + 5);
    } else {
      topProducts.forEach((prod, index) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
        }
        
        doc.setFont("helvetica", index < 3 ? "bold" : "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);

        const pos = `${index + 1}º`;
        const descTrunc = prod.description.length > 50 ? prod.description.slice(0, 48) + "..." : prod.description;
        const qty = `${prod.quantity}`;
        const fat = formatBRL(prod.totalValue);
        const percentage = totalQuantity > 0 ? `${((prod.quantity / totalQuantity) * 100).toFixed(1)}%` : "0%";

        doc.text(pos, 17, y + 4.5);
        doc.text(descTrunc, 30, y + 4.5);
        doc.text(qty, 115, y + 4.5);
        doc.text(fat, 145, y + 4.5);
        doc.text(percentage, 180, y + 4.5);

        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 6.5, 196, y + 6.5);
        y += 7;
      });
      
      // Print total sum footer
      y += 3;
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, 182, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("TOTAL GERAL DE PRODUTOS VENDIDOS", 20, y + 5.5);
      doc.text(`${totalQuantity}`, 115, y + 5.5);
      const totalFat = topProducts.reduce((acc, p) => acc + p.totalValue, 0);
      doc.text(formatBRL(totalFat), 145, y + 5.5);
    }

    doc.save(`Relatorio_Produtos_Mais_Vendidos_${activePreset}_${todayStr}.pdf`);
  };

  // Interactive Recharts calculations
  const getGroupedTimelineData = () => {
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    const daysDiff = (endObj.getTime() - startObj.getTime()) / (1000 * 3600 * 24);
    
    // Choose monthly grouping if the date range covers more than 40 days
    const useMonthly = daysDiff > 40 || !startDate || !endDate;
    const groups: { [key: string]: { label: string; key: string; faturamento: number; despesas: number; lucro: number } } = {};
    
    // Record operation costs in the month/day of the order date
    sales.forEach((sale) => {
      if (sale.isBudget) return;
      const orderDate = getSaleOrderDate(sale);
      if (!isWithinRange(orderDate)) return;
      
      const d = new Date(orderDate);
      if (isNaN(d.getTime())) return;
      const key = useMonthly 
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      
      const label = useMonthly
        ? d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
        : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        
      if (!groups[key]) {
        groups[key] = { label, key, faturamento: 0, despesas: 0, lucro: 0 };
      }
      groups[key].despesas += getSaleOperationCost(sale) + (sale.useMotoboy ? (sale.motoboyCost || 0) : 0);
    });

    // Record faturamento based on payment dates
    sales.forEach((sale) => {
      if (sale.isBudget) return;
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach(payment => {
          if (isWithinRange(payment.date)) {
            const d = new Date(payment.date);
            if (isNaN(d.getTime())) return;
            const key = useMonthly 
              ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
              : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const label = useMonthly
              ? d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
              : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
              
            if (!groups[key]) {
              groups[key] = { label, key, faturamento: 0, despesas: 0, lucro: 0 };
            }
            groups[key].faturamento += payment.amount;
          }
        });
      } else {
        if (sale.downPayment > 0 && isWithinRange(sale.date)) {
          const d = new Date(sale.date);
          if (isNaN(d.getTime())) return;
          const key = useMonthly 
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
            : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const label = useMonthly
            ? d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
            : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            
          if (!groups[key]) {
            groups[key] = { label, key, faturamento: 0, despesas: 0, lucro: 0 };
          }
          groups[key].faturamento += sale.downPayment;
        }
      }
    });

    filteredExpenses.forEach((exp) => {
      const d = new Date(exp.date);
      if (isNaN(d.getTime())) return;
      const key = useMonthly 
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      
      const label = useMonthly
        ? d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
        : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        
      if (!groups[key]) {
        groups[key] = { label, key, faturamento: 0, despesas: 0, lucro: 0 };
      }
      groups[key].despesas += exp.value;
    });

    // Populate net profit in groups
    Object.keys(groups).forEach((k) => {
      groups[k].lucro = groups[k].faturamento - groups[k].despesas;
    });

    return Object.keys(groups)
      .sort()
      .map((k) => groups[k]);
  };

  const chartData = getGroupedTimelineData();

  // PDF Generator Block
  const handleDownLoadPdfReport = (customStart?: string, customEnd?: string, reportTitleSuffix?: string) => {
    const activeStart = customStart || startDate;
    const activeEnd = customEnd || endDate;

    const formattedStart = new Date(activeStart + "T12:00:00").toLocaleDateString("pt-BR");
    const formattedEnd = new Date(activeEnd + "T12:00:00").toLocaleDateString("pt-BR");
    const docDate = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    const isWithinCustomRange = (dateStr: string) => {
      if (!dateStr) return false;
      const targetDate = getLocalDateFromISO(dateStr);
      
      const localDateNow = new Date();
      const todayStr = `${localDateNow.getFullYear()}-${String(localDateNow.getMonth() + 1).padStart(2, '0')}-${String(localDateNow.getDate()).padStart(2, '0')}`;
      
      const oneWeekAgo = new Date();
      oneWeekAgo.setHours(0, 0, 0, 0);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      if (activePreset === "today" && !customStart && !customEnd) {
        return targetDate === todayStr;
      }
      if (activePreset === "week" && !customStart && !customEnd) {
        try {
          return new Date(dateStr) >= oneWeekAgo;
        } catch (e) {
          return false;
        }
      }
      return targetDate >= activeStart && targetDate <= activeEnd;
    };

    const pdfSales = sales.filter((s) => !s.isBudget && isWithinCustomRange(s.date));
    const pdfExpenses = expenses.filter((e) => isWithinCustomRange(e.date));

    // Calculations for KPI numbers inside PDF
    const pdfFaturamentoTotal = pdfSales.reduce((acc, s) => acc + s.totalValue, 0);
    const pdfTotalSinalRecebido = pdfSales.reduce((acc, s) => acc + s.downPayment, 0);
    const pdfTotalSaldoDevedor = pdfSales.reduce((acc, s) => acc + s.balanceDue, 0);
    const pdfTotalDescontoConcedido = pdfSales.reduce((acc, s) => acc + s.discount, 0);

    // Real cash inflow received within the filtered period ("Entradas / Sinais") for PDF
    let pdfTotalRevenuePaid = 0;
    const pdfEntries: { date: string; clientName: string; method: string; amount: number }[] = [];

    sales.forEach(sale => {
      if (sale.isBudget) return;
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach(payment => {
          if (isWithinCustomRange(payment.date)) {
            pdfTotalRevenuePaid += payment.amount;
            pdfEntries.push({
              date: payment.date,
              clientName: sale.clientName,
              method: payment.method || sale.paymentMethod || "dinheiro",
              amount: payment.amount
            });
          }
        });
      } else {
        if (sale.downPayment > 0 && isWithinCustomRange(sale.date)) {
          pdfTotalRevenuePaid += sale.downPayment;
          pdfEntries.push({
            date: sale.date,
            clientName: sale.clientName,
            method: sale.paymentMethod || "dinheiro",
            amount: sale.downPayment
          });
        }
      }
    });

    // Sort PDF entries by date oldest first
    pdfEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const pdfTotalCustosOp = sales
      .filter((s) => !s.isBudget)
      .reduce((acc, s) => {
        const orderDate = getSaleOrderDate(s);
        if (isWithinCustomRange(orderDate)) {
          return acc + getSaleOperationCost(s) + (s.useMotoboy ? (s.motoboyCost || 0) : 0);
        }
        return acc;
      }, 0);
    const pdfTotalDespesasGerais = pdfExpenses.reduce((acc, e) => acc + e.value, 0);
    const pdfTotalSaidasGeral = pdfTotalCustosOp + pdfTotalDespesasGerais;

    const pdfLucroLiquidoReal = pdfFaturamentoTotal - pdfTotalSaidasGeral;
    const pdfMargemLucro = pdfFaturamentoTotal > 0 ? (pdfLucroLiquidoReal / pdfFaturamentoTotal) * 100 : 0;
    const pdfSalesCount = pdfSales.length;
    const pdfTicketMedio = pdfSalesCount > 0 ? pdfFaturamentoTotal / pdfSalesCount : 0;
    const pdfProporcaoGastos = pdfFaturamentoTotal > 0 ? (pdfTotalSaidasGeral / pdfFaturamentoTotal) * 100 : 0;
    const pdfProporcaoLucro = pdfFaturamentoTotal > 0 ? (Math.max(0, pdfLucroLiquidoReal) / pdfFaturamentoTotal) * 100 : 0;

    const doc = new jsPDF();
    // Elegant header
    doc.setFillColor(15, 23, 42); // slate navy background header block
    doc.rect(0, 0, 210, 42, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text((company.tradingName || "SISTEMA NÚCLEO").toUpperCase(), 14, 18);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(56, 189, 248); // light blue
    const themeLabel = reportTitleSuffix 
      ? `RELATÓRIO DE COMPROVAÇÃO DE RESULTADOS (${reportTitleSuffix.toUpperCase()})` 
      : "RELATÓRIO FINANCEIRO DE ENTRADAS, SAÍDAS E LUCROS";
    doc.text(themeLabel, 14, 25);
    doc.text(`Período: ${formattedStart} até ${formattedEnd}`, 14, 30);

    doc.setTextColor(156, 163, 175);
    doc.text(`Gerado em: ${docDate}`, 140, 30);

    let y = 50;

    // Check page break utility
    const checkPageBreak = (neededSpace: number) => {
      if (y + neededSpace > 280) {
        doc.addPage();
        y = 20;
        return true;
      }
      return false;
    };

    // SECTION 1: DIAGNÓSTICO DE SAÚDE FINANCEIRA & TICKET MÉDIO
    checkPageBreak(38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("1. DIAGNÓSTICO DE SAÚDE FINANCEIRA & TICKET MÉDIO", 14, y);
    y += 5;

    // Dynamic color setup based on health status
    let bgR = 240, bgG = 253, bgB = 244; // Green
    let borderR = 16, borderG = 185, borderB = 129;
    let statusText = "🚀 MODO VENDAS EM ALTA • SAÚDE FINANCEIRA EXCELENTE";
    let statusTip = `As vendas geraram ${formatBRL(pdfFaturamentoTotal)} com margem líquida de ${pdfMargemLucro.toFixed(1)}%. Gastos controlados em ${pdfProporcaoGastos.toFixed(1)}%.`;

    if (pdfLucroLiquidoReal < 0 || pdfTotalSaidasGeral > pdfFaturamentoTotal) {
      bgR = 254; bgG = 242; bgB = 242; // Red
      borderR = 239; borderG = 68; borderB = 68;
      statusText = "🚨 MODO ALERTA VERMELHO • GASTOS SUPERARAM AS VENDAS";
      statusTip = `Atenção! Saídas (${formatBRL(pdfTotalSaidasGeral)}) foram maiores que as vendas (${formatBRL(pdfFaturamentoTotal)}). Déficit: ${formatBRL(Math.abs(pdfLucroLiquidoReal))}.`;
    } else if (pdfMargemLucro < 25 || pdfProporcaoGastos > 75) {
      bgR = 254; bgG = 252; bgB = 232; // Yellow
      borderR = 245; borderG = 158; borderB = 11;
      statusText = "⚠️ MODO ATENÇÃO • MARGEM DE LUCRO COMPROMETIDA";
      statusTip = `Os custos consumiram ${pdfProporcaoGastos.toFixed(1)}% das vendas. O que sobrou no caixa foi ${formatBRL(pdfLucroLiquidoReal)} (${pdfMargemLucro.toFixed(1)}%).`;
    }

    // Render Diagnostic Box
    doc.setFillColor(bgR, bgG, bgB);
    doc.rect(14, y, 182, 28, "F");
    doc.setDrawColor(borderR, borderG, borderB);
    doc.rect(14, y, 182, 28, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(statusText, 18, y + 6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`TICKET MÉDIO POR VENDA: ${formatBRL(pdfTicketMedio)}`, 18, y + 12);
    doc.text(`TOTAL DE VENDAS: ${pdfSalesCount} pedidos`, 105, y + 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(statusTip, 18, y + 18);
    doc.text(`• O que vendeu (Verde): ${formatBRL(pdfFaturamentoTotal)} | Gastos (Vermelho): ${formatBRL(pdfTotalSaidasGeral)} | Sobrou (Amarelo): ${formatBRL(Math.max(0, pdfLucroLiquidoReal))}`, 18, y + 23);

    y += 34;

    // SECTION 2: PROPORÇÃO VISUAL (GRÁFICO DE PIZZA EM BLOCOS COLORIDOS)
    checkPageBreak(25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("2. RESUMO DE PROPORÇÃO FINANCEIRA (GRÁFICO DE PIZZA)", 14, y);
    y += 5;

    // Block 1: O Que Vendeu (Verde)
    doc.setFillColor(240, 253, 244);
    doc.rect(14, y, 58, 18, "F");
    doc.setDrawColor(16, 185, 129);
    doc.rect(14, y, 58, 18, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(22, 101, 52);
    doc.text("O QUE VENDEU (VERDE)", 17, y + 5);
    doc.setFontSize(9);
    doc.text(formatBRL(pdfFaturamentoTotal), 17, y + 11);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text("100% da Base de Vendas", 17, y + 15);

    // Block 2: Gastos (Vermelho)
    doc.setFillColor(254, 242, 242);
    doc.rect(76, y, 58, 18, "F");
    doc.setDrawColor(239, 68, 68);
    doc.rect(76, y, 58, 18, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(153, 27, 27);
    doc.text("GASTOS (VERMELHO)", 79, y + 5);
    doc.setFontSize(9);
    doc.text(formatBRL(pdfTotalSaidasGeral), 79, y + 11);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text(`${pdfProporcaoGastos.toFixed(1)}% do Faturamento`, 79, y + 15);

    // Block 3: O Que Sobrou (Amarelo)
    doc.setFillColor(254, 252, 232);
    doc.rect(138, y, 58, 18, "F");
    doc.setDrawColor(245, 158, 11);
    doc.rect(138, y, 58, 18, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(113, 63, 18);
    doc.text("O QUE SOBROU (AMARELO)", 141, y + 5);
    doc.setFontSize(9);
    doc.text(formatBRL(Math.max(0, pdfLucroLiquidoReal)), 141, y + 11);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text(`${pdfProporcaoLucro.toFixed(1)}% Sobra Líquida`, 141, y + 15);

    y += 24;

    // SECTION 3: DEMONSTRATIVO FINANCEIRO CONSOLIDADO
    checkPageBreak(15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("3. DEMONSTRATIVO FINANCEIRO CONSOLIDADO", 14, y);
    y += 6;

    // Draw grid headers
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Indicador Financeiro", 16, y + 5);
    doc.text("Valor Calculado", 150, y + 5);
    y += 7;

    const indicators = [
      { name: "Faturamento Bruto (Total de Vendas)", val: formatBRL(pdfFaturamentoTotal), isBold: true },
      { name: "Entradas / Sinais (Dinheiro Líquido em Caixa)", val: formatBRL(pdfTotalRevenuePaid), isBold: true, isHighlight: true },
      { name: "  (-) Custos Operacionais das Vendas", val: formatBRL(pdfTotalCustosOp), isBold: false },
      { name: "  (-) Despesas Gerais Administrativas", val: formatBRL(pdfTotalDespesasGerais), isBold: false },
      { name: "  (=) Total de Saídas / Custos Gerais", val: formatBRL(pdfTotalSaidasGeral), isBold: true },
      { name: "Lucro Líquido Real no Período", val: formatBRL(pdfLucroLiquidoReal), isBold: true, isHighlight: true },
      { name: "Sinal / Entrada Recebida em Mão", val: formatBRL(pdfTotalSinalRecebido), isBold: false },
      { name: "Saldo Residual (Contas a Receber)", val: formatBRL(pdfTotalSaldoDevedor), isBold: false },
      { name: "Descontos Concedidos aos Clientes", val: formatBRL(pdfTotalDescontoConcedido), isBold: false },
      { name: "Margem de Lucro (% sobre Faturamento)", val: `${pdfMargemLucro.toFixed(1)}%`, isBold: true }
    ];

    indicators.forEach((ind) => {
      checkPageBreak(8);
      if (ind.isHighlight) {
        doc.setFillColor(240, 253, 244); // light lime green
        doc.rect(14, y, 182, 7, "F");
      }
      doc.setFont("helvetica", ind.isBold ? "bold" : "normal");
      doc.setFontSize(8.5);
      if (ind.isHighlight) {
        doc.setTextColor(22, 101, 52);
      } else {
        doc.setTextColor(15, 23, 42);
      }
      doc.text(ind.name, 16, y + 5);
      doc.text(ind.val, 150, y + 5);
      
      // dotted guideline
      doc.setDrawColor(226, 232, 240);
      doc.line(14, y + 7, 196, y + 7);
      y += 7;
    });

    y += 4;

    // Section 4: Detailed entries list
    checkPageBreak(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("4. REGISTRO DETALHADO DE ENTRADAS EM CAIXA (RECEBIMENTOS)", 14, y);
    y += 5;

    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, 182, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("Data", 16, y + 4.5);
    doc.text("Cliente", 34, y + 4.5);
    doc.text("Meio de Pagamento", 100, y + 4.5);
    doc.text("Valor Recebido", 164, y + 4.5);
    y += 6;

    if (pdfEntries.length === 0) {
      checkPageBreak(10);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Nenhuma entrada ou recebimento de caixa localizado neste período.", 16, y + 5);
      y += 8;
    } else {
      pdfEntries.forEach((entry) => {
        checkPageBreak(5.5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);

        const dStr = new Date(entry.date).toLocaleDateString("pt-BR");
        const clientTrunc = entry.clientName.length > 35 ? entry.clientName.slice(0, 33) + "..." : entry.clientName;
        const method = entry.method.toUpperCase();

        doc.text(dStr, 16, y + 4);
        doc.text(clientTrunc, 34, y + 4);
        doc.text(method, 100, y + 4);
        doc.text(formatBRL(entry.amount), 164, y + 4);

        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 5.5, 196, y + 5.5);
        y += 5.5;
      });

      // Section 2 Total Row
      checkPageBreak(10);
      doc.setFillColor(241, 245, 249);
      doc.rect(14, y, 182, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text("TOTAL DE ENTRADAS RECEBIDAS NO PERÍODO:", 16, y + 4.5);
      doc.text(formatBRL(pdfTotalRevenuePaid), 164, y + 4.5);
      y += 9;
    }

    y += 4;

    // Section 5: Detailed transactions list
    checkPageBreak(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("5. REGISTRO DETALHADO DE VENDAS (FATURAMENTO BRUTO)", 14, y);
    y += 5;

    // Table mapping
    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, 182, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("Data", 16, y + 4.5);
    doc.text("Cliente", 34, y + 4.5);
    doc.text("Pagamento", 90, y + 4.5);
    doc.text("Faturamento", 124, y + 4.5);
    doc.text("Custos", 154, y + 4.5);
    doc.text("Lucro Líq.", 178, y + 4.5);
    y += 6;

    if (pdfSales.length === 0) {
      checkPageBreak(10);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Nenhuma venda faturada localizada neste período.", 16, y + 5);
      y += 8;
    } else {
      let totalVendaOpCost = 0;
      let totalVendaNetProfit = 0;

      pdfSales.forEach((sale) => {
        checkPageBreak(5.5);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);

        const dStr = new Date(sale.date).toLocaleDateString("pt-BR");
        const clientTrunc = sale.clientName.length > 28 ? sale.clientName.slice(0, 26) + "..." : sale.clientName;
        const method = (sale.paymentMethod || "dinheiro").toUpperCase();
        
        const opCost = getSaleOperationCost(sale);
        const netProfitValue = sale.totalValue - opCost - (sale.useMotoboy ? sale.motoboyCost : 0);
        
        totalVendaOpCost += opCost;
        totalVendaNetProfit += netProfitValue;

        doc.text(dStr, 16, y + 4);
        doc.text(clientTrunc, 34, y + 4);
        doc.text(method, 90, y + 4);
        doc.text(formatBRL(sale.totalValue), 124, y + 4);
        doc.text(formatBRL(opCost), 154, y + 4);
        doc.text(formatBRL(netProfitValue), 178, y + 4);

        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 5.5, 196, y + 5.5);
        y += 5.5;
      });

      // Section 3 Total Row
      checkPageBreak(10);
      doc.setFillColor(241, 245, 249);
      doc.rect(14, y, 182, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text("TOTAL DE VENDAS / FATURAMENTO:", 16, y + 4.5);
      doc.text(formatBRL(pdfFaturamentoTotal), 124, y + 4.5);
      doc.text(formatBRL(totalVendaOpCost), 154, y + 4.5);
      doc.text(formatBRL(totalVendaNetProfit), 178, y + 4.5);
      y += 9;
    }

    y += 4;
    // Section 6: Detailed expenses & costs list
    checkPageBreak(20);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("6. DETALHAMENTO DE DESPESAS E CUSTOS (SAÍDAS)", 14, y);
    y += 5;

    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, 182, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("Data", 16, y + 4.5);
    doc.text("Descrição da Despesa / Custo", 36, y + 4.5);
    doc.text("Categoria", 120, y + 4.5);
    doc.text("Valor Pago", 164, y + 4.5);
    y += 6;

    // Build unified expenses & operational costs list for PDF
    const pdfExpensesAndCosts: { date: string; description: string; category: string; value: number }[] = [];
    pdfExpenses.forEach(exp => {
      pdfExpensesAndCosts.push({
        date: exp.date,
        description: exp.description,
        category: exp.category || "Despesa Administrativa",
        value: exp.value
      });
    });
    pdfSales.forEach(sale => {
      const opCost = getSaleOperationCost(sale);
      if (opCost > 0) {
        pdfExpensesAndCosts.push({
          date: getSaleOrderDate(sale),
          description: `Custo de Produção - Venda de ${sale.clientName}`,
          category: "Custo Operacional",
          value: opCost
        });
      }
      if (sale.useMotoboy && sale.motoboyCost > 0) {
        pdfExpensesAndCosts.push({
          date: getSaleOrderDate(sale),
          description: `Custo de Entrega / Motoboy - Venda de ${sale.clientName}`,
          category: "Logística",
          value: sale.motoboyCost
        });
      }
    });

    // Sort PDF expenses and costs chronologically
    pdfExpensesAndCosts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (pdfExpensesAndCosts.length === 0) {
      checkPageBreak(10);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Nenhuma despesa ou custo registrado neste período.", 16, y + 5);
      y += 8;
    } else {
      pdfExpensesAndCosts.forEach((item) => {
        checkPageBreak(5.5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);

        const dStr = new Date(item.date + (item.date.includes("T") ? "" : "T12:00:00")).toLocaleDateString("pt-BR");
        const descTrunc = item.description.length > 50 ? item.description.slice(0, 48) + "..." : item.description;
        const cat = item.category.toUpperCase();

        doc.text(dStr, 16, y + 4);
        doc.text(descTrunc, 36, y + 4);
        doc.text(cat, 120, y + 4);
        doc.text(formatBRL(item.value), 164, y + 4);

        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 5.5, 196, y + 5.5);
        y += 5.5;
      });

      // Section 4 Total Row
      checkPageBreak(10);
      doc.setFillColor(241, 245, 249);
      doc.rect(14, y, 182, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text("TOTAL DE GASTOS / SAÍDAS NO PERÍODO:", 16, y + 4.5);
      doc.text(formatBRL(pdfTotalSaidasGeral), 164, y + 4.5);
      y += 9;
    }

    // Centered footer signature
    checkPageBreak(25);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Comprovante Financeiro de uso interno para planejamento da empresa.`, 14, y + 10);
    doc.text(`Software de Gestão Núcleo v1.0.0`, 14, y + 14);

    const suffix = reportTitleSuffix ? `_${reportTitleSuffix}` : "";
    doc.save(`Relatorio_Financeiro${suffix}_${activeStart}_a_${activeEnd}.pdf`);
  };

  const handleDownloadAccessReport = () => {
    const doc = new jsPDF();
    const todayStr = new Date().toLocaleDateString("pt-BR");
    
    // Header design
    doc.setFillColor(15, 23, 42); // dark navy
    doc.rect(0, 0, 210, 38, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(company.tradingName ? company.tradingName.toUpperCase() : "IMPACTO DIGITAL", 14, 15);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Relatório de Acessos e Abertura de Caixa - Gerado em ${todayStr}`, 14, 21);
    
    let y = 48;
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("REGISTRO DE ACESSOS E ABERTURA DE CAIXA", 14, y);
    y += 8;

    // Table headers
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 8, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("Status", 17, y + 5.5);
    doc.text("Responsável / Operador", 40, y + 5.5);
    doc.text("Abertura", 100, y + 5.5);
    doc.text("Valor Inicial", 145, y + 5.5);
    doc.text("Fechamento", 170, y + 5.5);
    y += 9;

    const allSessions: CashRegisterSession[] = [];
    if (cashRegister?.currentSession) {
      allSessions.push(cashRegister.currentSession);
    }
    if (cashRegister?.history) {
      allSessions.push(...cashRegister.history);
    }

    // Sort by newest opening first
    allSessions.sort((a, b) => new Date(b.dataAbertura).getTime() - new Date(a.dataAbertura).getTime());

    if (allSessions.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("Nenhum registro de acesso de caixa localizado.", 16, y + 5);
    } else {
      allSessions.forEach((session, index) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
        }
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);

        const status = (session.status || "aberto").toUpperCase();
        const op = (session.operador || "Operador").toUpperCase();
        const dateOpen = new Date(session.dataAbertura).toLocaleString("pt-BR");
        const valIni = formatBRL(session.valorAbertura || 0);
        const dateClose = session.dataFechamento ? new Date(session.dataFechamento).toLocaleString("pt-BR") : "Ativo";

        doc.text(status, 17, y + 4.5);
        doc.text(op.length > 25 ? op.slice(0, 23) + "..." : op, 40, y + 4.5);
        doc.text(dateOpen, 100, y + 4.5);
        doc.text(valIni, 145, y + 4.5);
        doc.text(dateClose, 170, y + 4.5);

        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 6.5, 196, y + 6.5);
        y += 7;
      });
    }

    doc.save(`Relatorio_Acessos_Caixa_${todayStr}.pdf`);
  };

  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-950 border border-slate-850 p-3 rounded-xl shadow-2xl font-sans text-[11px] text-left">
          <p className="text-slate-350 font-bold mb-1 border-b border-slate-800 pb-1 uppercase tracking-wider">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="flex justify-between gap-6 py-0.5">
              <span className="font-semibold">{entry.name}:</span>
              <span className="font-mono font-bold">{formatBRL(entry.value)}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div id="financial-reports-panel" className="space-y-6">
      {/* Tab selection */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-1.5 font-sans">
        <button
          type="button"
          onClick={() => setActiveReportTab("financeiro")}
          className={`py-2 px-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeReportTab === "financeiro"
              ? "bg-brand-magenta text-white shadow-md shadow-brand-magenta/15"
              : "bg-slate-900 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
          }`}
        >
          📊 Demonstrativo Financeiro
        </button>
        <button
          type="button"
          onClick={() => setActiveReportTab("auditoria_atendente")}
          className={`py-2 px-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeReportTab === "auditoria_atendente"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20 font-black"
              : "bg-slate-900 text-emerald-400/90 hover:bg-slate-850 hover:text-emerald-300 border border-emerald-950"
          }`}
        >
          <span>🛡️ Auditoria do Atendente (Anti-Fraude)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveReportTab("acessos")}
          className={`py-2 px-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeReportTab === "acessos"
              ? "bg-brand-magenta text-white shadow-md shadow-brand-magenta/15"
              : "bg-slate-900 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
          }`}
        >
          🔐 Relatório de Acesso e Abertura
        </button>
      </div>

      {activeReportTab === "financeiro" ? (
        <>
          {/* Title Header with download button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 bg-slate-950/45 p-4 rounded-xl border border-slate-850 font-sans">
        <div className="text-left">
          <h2 className="text-sm font-extrabold uppercase text-white tracking-widest flex items-center gap-2">
            📊 Relatórios Financeiros Consolidados
          </h2>
          <p className="text-xs text-slate-400 mt-1">Gere demonstrativos de fluxo de caixa, custos e faturamentos com análise histórica</p>
        </div>
        
        <button
          type="button"
          onClick={() => handleDownLoadPdfReport()}
          className="w-full sm:w-auto py-2 px-4 bg-violet-650 hover:bg-violet-700 text-white font-bold text-[11px] uppercase rounded-xl border border-violet-550 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-violet-950/40 shrink-0 cursor-pointer"
        >
          <FileDown className="h-4 w-4 text-violet-200" />
          <span>Exportar PDF Completo</span>
        </button>
      </div>

      {/* Date filter component & preset selection */}
      <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-850 font-sans space-y-4">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="space-y-1 text-left">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-magenta">Filtros Rápidos e Busca</span>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              {/* BUTTON DO DIA */}
              <div className={`inline-flex items-center rounded-lg border text-xs overflow-hidden transition-all duration-200 ${
                activePreset === "today"
                  ? "bg-brand-cyan/20 border-brand-cyan text-brand-cyan shadow-sm"
                  : "bg-slate-900 border-slate-850 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
              }`}>
                <button
                  type="button"
                  onClick={() => applyPreset("today")}
                  className="py-1.5 px-3.5 font-bold select-none cursor-pointer outline-none transition-colors border-r border-slate-800/40"
                >
                  Do Dia
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const targetDay = getTodayDateString();
                    handleDownLoadPdfReport(targetDay, targetDay, "Diario");
                  }}
                  title="Gerar PDF do Dia"
                  className="py-1.5 px-2 hover:bg-brand-cyan/25 hover:text-white transition-colors cursor-pointer outline-none"
                >
                  <FileDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* BUTTON DA SEMANA */}
              <div className={`inline-flex items-center rounded-lg border text-xs overflow-hidden transition-all duration-200 ${
                activePreset === "week"
                  ? "bg-brand-cyan/20 border-brand-cyan text-brand-cyan shadow-sm"
                  : "bg-slate-900 border-slate-850 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
              }`}>
                <button
                  type="button"
                  onClick={() => applyPreset("week")}
                  className="py-1.5 px-3.5 font-bold select-none cursor-pointer outline-none transition-colors border-r border-slate-800/40"
                >
                  Da Semana
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const today = new Date();
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(today.getDate() - 6);
                    const fStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(sevenDaysAgo.getDate()).padStart(2, "0")}`;
                    handleDownLoadPdfReport(fStr, getTodayDateString(), "Semanal");
                  }}
                  title="Gerar PDF da Semana"
                  className="py-1.5 px-2 hover:bg-brand-cyan/25 hover:text-white transition-colors cursor-pointer outline-none"
                >
                  <FileDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* BUTTON DO MÊS */}
              <div className={`inline-flex items-center rounded-lg border text-xs overflow-hidden transition-all duration-200 ${
                activePreset === "month"
                  ? "bg-brand-cyan/20 border-brand-cyan text-brand-cyan shadow-sm"
                  : "bg-slate-900 border-slate-850 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
              }`}>
                <button
                  type="button"
                  onClick={() => applyPreset("month")}
                  className="py-1.5 px-3.5 font-bold select-none cursor-pointer outline-none transition-colors border-r border-slate-800/40"
                >
                  Do Mês
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const today = new Date();
                    const firstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
                    const lastDayOfM = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    const lastDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(lastDayOfM.getDate()).padStart(2, "0")}`;
                    handleDownLoadPdfReport(firstDay, lastDay, "Mensal");
                  }}
                  title="Gerar PDF do Mês"
                  className="py-1.5 px-2 hover:bg-brand-cyan/25 hover:text-white transition-colors cursor-pointer outline-none"
                >
                  <FileDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Slices of dates */}
          <div className="space-y-1 w-full xl:w-auto text-left">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-cyan">Seletor de Período Personalizado & Modo de Exibição</span>
            <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
              <div className={`flex items-center gap-1.5 p-1.5 px-2.5 rounded-lg border transition-all ${
                activePreset === "custom" 
                  ? "bg-brand-cyan/10 border-brand-cyan text-brand-cyan shadow-sm" 
                  : "bg-slate-950 border-slate-850"
              }`}>
                <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">De:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setActivePreset("custom"); // Custom transition
                  }}
                  className="bg-transparent border-none text-xs font-mono text-slate-200 outline-none p-0 cursor-pointer focus:ring-0"
                />
              </div>
              
              <ArrowRight className="h-3 w-3 text-slate-600 shrink-0 hidden sm:block" />

              <div className={`flex items-center gap-1.5 p-1.5 px-2.5 rounded-lg border transition-all ${
                activePreset === "custom" 
                  ? "bg-brand-cyan/10 border-brand-cyan text-brand-cyan shadow-sm" 
                  : "bg-slate-950 border-slate-850"
              }`}>
                <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">Até:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setActivePreset("custom"); // Custom transition
                  }}
                  className="bg-transparent border-none text-xs font-mono text-slate-200 outline-none p-0 cursor-pointer focus:ring-0"
                />
              </div>

              <button
                type="button"
                onClick={() => handleDownLoadPdfReport(startDate, endDate, "Periodo_Personalizado")}
                title="Gerar PDF do período customizado"
                className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold rounded-lg border border-slate-850 transition-all flex items-center gap-1.5 cursor-pointer outfit-none select-none shrink-0"
              >
                <FileDown className="h-3.5 w-3.5 text-brand-cyan" />
                <span>Gerar PDF</span>
              </button>

              {/* Vertical Divider */}
              <div className="h-6 w-px bg-slate-800/80 hidden xl:block mx-1" />

              {/* Modo de Exibição Inline controls */}
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                <ListFilter className="h-3.5 w-3.5 text-brand-magenta shrink-0 animate-pulse" />
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Modo de Exibição:</span>
              </div>

              <div className="flex flex-wrap gap-1.5 items-center">
                <button
                  type="button"
                  onClick={() => setDisplayMode("geral")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    displayMode === "geral"
                      ? "bg-brand-magenta text-white shadow-md shadow-brand-magenta/20"
                      : "bg-slate-900 border border-slate-850/60 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <span>📊 Relatório Geral</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode("entradas")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    displayMode === "entradas"
                      ? "bg-brand-cyan text-slate-950 font-extrabold shadow-md shadow-brand-cyan/20"
                      : "bg-slate-900 border border-slate-850/60 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  <span>Só Entradas (O que Entrou)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode("gastos")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    displayMode === "gastos"
                      ? "bg-rose-500 text-white font-extrabold shadow-md shadow-rose-500/20"
                      : "bg-slate-900 border border-slate-850/60 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  <span>Só Gastos (Saídas)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode("lucro")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    displayMode === "lucro"
                      ? "bg-emerald-500 text-slate-950 font-extrabold shadow-md shadow-emerald-500/20"
                      : "bg-slate-900 border border-slate-850/60 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <Percent className="h-3.5 w-3.5" />
                  <span>Só Ganho Real (Lucro)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode("total_vendido")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    displayMode === "total_vendido"
                      ? "bg-violet-600 text-white font-extrabold shadow-md shadow-violet-600/20"
                      : "bg-slate-900 border border-slate-850/60 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>Só Valor Vendido</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {displayMode === "geral" && (
        <>
          {/* DIAGNÓSTICO DE SAÚDE FINANCEIRA E TICKET MÉDIO */}
          <div className={`p-5 rounded-xl border font-sans space-y-4 transition-all duration-300 ${healthMode.color}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border tracking-widest ${healthMode.badgeColor}`}>
                  {healthMode.badge}
                </span>
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">{healthMode.title}</h3>
              </div>

              {/* Quick metric pill for ticket medio */}
              <div className="flex items-center gap-3 bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800 shrink-0 shadow-lg">
                <Target className="h-4 w-4 text-brand-cyan" />
                <div className="text-left font-mono">
                  <span className="text-[9px] text-slate-400 uppercase block font-sans">Ticket Médio por Venda</span>
                  <span className="text-sm font-extrabold text-slate-100">{formatBRL(ticketMedio)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800/60 font-mono text-left">
              <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-850">
                <span className="text-[9px] text-slate-400 block uppercase font-sans">Total de Vendas</span>
                <span className="text-sm font-black text-slate-100">{totalVendasCount} <span className="text-[10px] text-slate-400 font-normal">pedidos</span></span>
              </div>
              <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-850">
                <span className="text-[9px] text-slate-400 block uppercase font-sans">Ticket Médio</span>
                <span className="text-sm font-black text-brand-cyan">{formatBRL(ticketMedio)}</span>
              </div>
              <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-850">
                <span className="text-[9px] text-slate-400 block uppercase font-sans">Comprometimento de Gastos</span>
                <span className={`text-sm font-black ${proporcaoGastosVendas > 75 ? "text-rose-400" : "text-amber-400"}`}>
                  {proporcaoGastosVendas.toFixed(1)}%
                </span>
              </div>
              <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-850">
                <span className="text-[9px] text-slate-400 block uppercase font-sans">Sobra Líquida (Amarelo)</span>
                <span className="text-sm font-black text-yellow-400">{formatBRL(Math.max(0, lucroLiquidoReal))}</span>
              </div>
            </div>

            <div className="text-left space-y-1 bg-slate-950/80 p-3.5 rounded-xl border border-slate-850">
              <p className="text-xs text-slate-200 font-medium leading-relaxed">{healthMode.message}</p>
              <p className="text-[11px] text-slate-400 italic font-sans">💡 <span className="font-bold text-slate-300">Análise Estratégica:</span> {healthMode.tip}</p>
            </div>
          </div>

          {/* KPI Display Metrics overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* RELATÓRIO DE ENTRADA */}
            <div className="bg-slate-950/60 rounded-xl border border-slate-850 p-5 font-sans flex flex-col justify-between hover:border-slate-800 transition-all">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-brand-cyan uppercase tracking-widest block font-sans">
                    1. RELATÓRIO DE ENTRADA
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-brand-cyan animate-pulse" />
                </div>
                <p className="text-[10px] font-semibold text-slate-400 text-left">Faturamento bruto das vendas e vendas rápidas</p>
              </div>
              
              <div className="my-5 text-left font-sans">
                <div className="space-y-1">
                  <span className="text-3xl font-black text-slate-100 font-mono tracking-tight block">
                    {formatBRL(faturamentoTotal)}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Total de Entradas Brutas</span>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-900 space-y-1">
                  <span className="text-lg font-extrabold text-brand-cyan/95 font-mono block">
                    {formatBRL(totalRevenuePaid)}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                    Dinheiro Real em Caixa (Recebidos)
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-850/80 space-y-1.5 text-xs font-mono text-slate-450">
                <div className="flex justify-between items-center">
                  <span>Vendas Tradicionais:</span>
                  <span className="font-bold text-slate-200">{formatBRL(faturamentoVendasPadrao)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Vendas Rápidas:</span>
                  <span className="font-bold text-brand-cyan">{formatBRL(faturamentoVendasRapidas)}</span>
                </div>
              </div>
            </div>

            {/* RELATÓRIO DE GASTO */}
            <div className="bg-slate-950/60 rounded-xl border border-slate-850 p-5 font-sans flex flex-col justify-between hover:border-slate-800 transition-all">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-rose-500 uppercase tracking-widest block font-sans">
                    2. RELATÓRIO DE GASTO
                  </span>
                  <ArrowDownRight className="h-4 w-4 text-rose-500" />
                </div>
                <p className="text-[10px] font-semibold text-slate-400 text-left">Despesas fixas e custos operacionais registrados</p>
              </div>

              <div className="my-5 text-left font-sans">
                <div className="space-y-1">
                  <span className="text-3xl font-black text-slate-100 font-mono tracking-tight block">
                    {formatBRL(totalSaidasGeral)}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Total de Gastos/Custos</span>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-900 space-y-1">
                  <span className="text-lg font-bold text-rose-400 font-mono block">
                    {formatBRL(totalCustosOp)}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                    Custos Operacionais das Vendas
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-850/80 space-y-1.5 text-xs font-mono text-slate-450">
                <div className="flex justify-between items-center">
                  <span>Despesas Fixas / Adm:</span>
                  <span className="font-bold text-rose-400/90">{formatBRL(totalDespesasGerais)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Descontos Concedidos:</span>
                  <span className="font-bold text-slate-300">{formatBRL(totalDescontoConcedido)}</span>
                </div>
              </div>
            </div>

            {/* RELATÓRIO DE LUCRO REAL */}
            <div className="bg-slate-950/60 rounded-xl border border-slate-850 p-5 font-sans flex flex-col justify-between hover:border-slate-800 transition-all">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-400 uppercase tracking-widest block font-sans">
                    3. RELATÓRIO DE LUCRO REAL
                  </span>
                  <Percent className="h-4 w-4 text-emerald-400" />
                </div>
                <p className="text-[10px] font-semibold text-slate-400 text-left">Resultado auferido (Entradas - Gastos)</p>
              </div>

              <div className="my-5 text-left font-sans">
                <div className="space-y-1">
                  <span className={`text-3xl font-black font-mono tracking-tight block ${lucroLiquidoReal >= 0 ? "text-emerald-450" : "text-rose-500"}`}>
                    {formatBRL(lucroLiquidoReal)}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Lucro Líquido Real</span>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-900 space-y-1">
                  <span className="text-lg font-extrabold text-emerald-450 font-mono block">
                    {margemLucro.toFixed(1)}%
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                    Margem Líquida Real do Período
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-850/80 space-y-1.5 text-xs font-mono text-slate-450">
                <div className="flex justify-between items-center">
                  <span>Saldo a Receber Pendente:</span>
                  <span className="font-bold text-slate-200">{formatBRL(totalSaldoDevedor)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Status Financeiro:</span>
                  <span className={`font-bold uppercase text-[10px] px-1.5 py-0.2 rounded border ${lucroLiquidoReal >= 0 ? "bg-emerald-500/10 text-emerald-450 border-emerald-500/15" : "bg-rose-500/10 text-rose-500 border-rose-500/15"}`}>
                    {lucroLiquidoReal >= 0 ? "Superavitário" : "Déficit"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 🏆 TOP SELLING PRODUCTS REPORT */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 font-sans space-y-3">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-2 border-b border-slate-850 gap-2">
              <div>
                <h3 className="text-xs font-extrabold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                  <span>🏆 Produtos Mais Vendidos</span>
                  <span className="text-[10px] font-mono text-brand-cyan normal-case bg-brand-cyan/10 px-2 py-0.5 rounded border border-brand-cyan/15">
                    {activePreset === "today" ? "Hoje" : activePreset === "week" ? "Esta Semana" : activePreset === "month" ? "Este Mês" : "Período Selecionado"}
                  </span>
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5 font-sans">Ranking de quantidade física e faturamento por produto faturado</p>
              </div>
              
              <button
                type="button"
                onClick={() => handleDownloadTopProductsReport()}
                className="self-start sm:self-auto py-1 px-2.5 bg-slate-900 hover:bg-slate-800 text-[10px] font-bold uppercase rounded-lg border border-slate-850 text-brand-cyan hover:text-white transition-all flex items-center gap-1 cursor-pointer"
              >
                <FileDown className="h-3 w-3" />
                <span>Gerar Relatório de Produtos (PDF)</span>
              </button>
            </div>

            {topProducts.length === 0 ? (
              <div className="py-6 flex flex-col items-center justify-center text-slate-550 border border-dashed border-slate-850 rounded-xl bg-slate-950/40 font-mono text-xs p-4">
                <span>Nenhum item vendido localizado no filtro selecionado para ranking.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {topProducts.slice(0, 9).map((prod, index) => {
                  const totalQuantity = topProducts.reduce((acc, p) => acc + p.quantity, 0);
                  const percentage = totalQuantity > 0 ? (prod.quantity / totalQuantity) * 100 : 0;
                  
                  return (
                    <div key={index} className="p-3 bg-slate-950/80 border border-slate-850/80 rounded-xl flex flex-col justify-between hover:border-slate-800 transition-all space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                            index === 0 ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30" :
                            index === 1 ? "bg-slate-400/20 text-slate-300 border border-slate-400/30" :
                            index === 2 ? "bg-amber-600/20 text-amber-500 border border-amber-600/30" :
                            "bg-slate-900 text-slate-400 border border-slate-850"
                          }`}>
                            {index + 1}
                          </span>
                          <span className="font-bold text-slate-150 text-xs truncate max-w-[150px] uppercase block font-sans" title={prod.description}>
                            {prod.description}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-brand-magenta select-none bg-brand-magenta/10 px-2 py-0.2 rounded border border-brand-magenta/15 font-sans">
                          {prod.quantity} {prod.quantity === 1 ? "un" : "uns"}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="w-full bg-slate-900 rounded-full h-1 border border-slate-850 overflow-hidden">
                          <div 
                            className="bg-brand-cyan h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(3, percentage))}%` }}
                          />
                        </div>
                        
                        <div className="flex justify-between items-center text-[9px] font-mono text-slate-450 pt-0.5">
                          <span>Proporção: {percentage.toFixed(1)}%</span>
                          <span className="font-bold text-slate-200">{formatBRL(prod.totalValue)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Main Charts area on Screen: Gráfico Redondo + Evolução Histórica */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Gráfico Redondo / Pizza (5 cols) */}
            <div className="lg:col-span-5 bg-slate-950/60 p-5 rounded-xl border border-slate-850 font-sans space-y-4 flex flex-col justify-between">
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-850">
                <h3 className="text-xs font-extrabold uppercase text-slate-200 tracking-wider flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-brand-cyan" />
                  <span>Proporção Financeira (Gráfico Redondo)</span>
                </h3>
                <span className="text-[9px] font-mono text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20 font-bold">
                  Vendeu x Gastou x Sobrou
                </span>
              </div>

              {/* Pie Chart Display */}
              <div className="h-60 w-full relative flex items-center justify-center">
                {faturamentoTotal === 0 && totalSaidasGeral === 0 ? (
                  <div className="text-center text-slate-500 font-mono text-xs">Sem dados no período para o gráfico redondo</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="#020617" strokeWidth={3} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any) => [formatBRL(Number(value)), "Valor"]}
                        contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", borderRadius: "12px", color: "#fff", fontSize: "11px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Color Legend Breakdown */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-850/80 font-mono text-center">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                  <span className="text-[9px] font-extrabold text-emerald-400 block uppercase font-sans">O Que Vendeu</span>
                  <span className="text-xs font-black text-white block mt-0.5">{formatBRL(faturamentoTotal)}</span>
                  <span className="text-[8px] text-emerald-300 font-bold block mt-0.5">100% Base</span>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
                  <span className="text-[9px] font-extrabold text-rose-400 block uppercase font-sans">Gastos (Vermelho)</span>
                  <span className="text-xs font-black text-white block mt-0.5">{formatBRL(totalSaidasGeral)}</span>
                  <span className="text-[8px] text-rose-300 font-bold block mt-0.5">{proporcaoGastosVendas.toFixed(1)}% do total</span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
                  <span className="text-[9px] font-extrabold text-yellow-400 block uppercase font-sans">O Que Sobrou</span>
                  <span className="text-xs font-black text-white block mt-0.5">{formatBRL(Math.max(0, lucroLiquidoReal))}</span>
                  <span className="text-[8px] text-yellow-300 font-bold block mt-0.5">{proporcaoLucroVendas.toFixed(1)}% sobra</span>
                </div>
              </div>
            </div>

            {/* Evolução Histórica / Gráfico de Barras (7 cols) */}
            <div className="lg:col-span-7 bg-slate-950/60 p-5 rounded-xl border border-slate-850 font-sans space-y-3 flex flex-col justify-between">
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-850">
                <h3 className="text-xs font-extrabold uppercase text-slate-200 tracking-wider flex items-center gap-2">
                  <BarChart4 className="h-4 w-4 text-brand-magenta" />
                  <span>📶 Evolução Temporal (Entradas, Gastos e Sobra)</span>
                </h3>
                <span className="text-[9px] font-mono text-slate-500 uppercase">
                  {chartData.length} Pontos
                </span>
              </div>

              <div className="h-64 w-full pt-2">
                {chartData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-555 border border-dashed border-slate-850 rounded-xl bg-slate-950/40 font-mono text-xs p-6">
                    <span>Nenhum faturamento ou despesa localizada no filtro selecionado para rendering do gráfico.</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: -5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} tickFormatter={(v) => `R$${v}`} />
                      <Tooltip content={<CustomChartTooltip />} cursor={{ fill: "#1e293b", opacity: 0.2 }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                      <Bar name="Vendeu (Verde)" dataKey="faturamento" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar name="Gastos (Vermelho)" dataKey="despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Bar name="Sobrou (Amarelo)" dataKey="lucro" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Grid listing transaction logs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales log list */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 space-y-3 font-sans">
              <h4 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                🛍️ Vendas no Período ({filteredSales.length})
              </h4>
              
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {filteredSales.length === 0 ? (
                  <p className="text-[11px] text-slate-500 font-mono pt-4 text-center italic">Não foram encontradas vendas faturadas.</p>
                ) : (
                  filteredSales.map((sale) => (
                    <div key={sale.id} className="p-2.5 bg-slate-950/85 border border-slate-850 rounded-lg flex items-center justify-between text-xs font-mono">
                      <div className="text-left space-y-0.5">
                        <span className="text-[10px] text-slate-500 block">{new Date(sale.date).toLocaleDateString("pt-BR")}</span>
                        <span className="font-bold text-slate-200 block truncate max-w-[170px] font-sans">{sale.clientName}</span>
                        <span className="text-[9px] font-bold text-brand-magenta select-none bg-brand-magenta/10 px-1.5 py-0.2 rounded border border-brand-magenta/15 inline-block font-sans">
                          {(sale.paymentMethod || "dinheiro").toUpperCase()}
                        </span>
                      </div>
                      <div className="text-right space-y-0.5 font-sans">
                        <span className="text-[11px] font-bold text-slate-150 block font-mono">{formatBRL(sale.totalValue)}</span>
                        <span className="text-[9px] text-red-400 block font-mono">Custos: {formatBRL(getSaleOperationCost(sale))}</span>
                        <span className="text-[9px] text-emerald-450 font-bold block font-mono">Prof: {formatBRL(sale.totalValue - getSaleOperationCost(sale) - (sale.useMotoboy ? sale.motoboyCost : 0))}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Expenses log list */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 space-y-3 font-sans">
              <h4 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                🧾 Despesas no Período ({filteredExpenses.length})
              </h4>
              
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {filteredExpenses.length === 0 ? (
                  <p className="text-[11px] text-slate-500 font-mono pt-4 text-center italic">Não foram encontradas despesas avulsas.</p>
                ) : (
                  filteredExpenses.map((exp) => (
                    <div key={exp.id} className="p-2.5 bg-slate-950/85 border border-slate-850 rounded-lg flex items-center justify-between text-xs font-mono">
                      <div className="text-left space-y-0.5">
                        <span className="text-[10px] text-slate-500 block">{new Date(exp.date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                        <span className="font-bold text-slate-200 block truncate max-w-[170px] font-sans">{exp.description}</span>
                        <span className="text-[9px] text-brand-cyan uppercase bg-brand-cyan/10 border border-brand-cyan/20 px-1 rounded font-sans">
                          {exp.category || "Outros"}
                        </span>
                      </div>
                      <div className="text-right flex items-center font-sans">
                        <span className="text-xs font-bold text-red-400 font-mono">{formatBRL(exp.value)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {displayMode === "entradas" && (
        <div className="space-y-4 animate-fade-in">
          {/* KPI Banner */}
          <div className="bg-slate-950/60 rounded-xl border border-brand-cyan/25 p-5 font-sans flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-cyan block">
                Entradas Reais em Caixa (Recebidos)
              </span>
              <h3 className="text-3xl font-black text-white font-mono">{formatBRL(totalRevenuePaid)}</h3>
              <p className="text-xs text-slate-400">Total de sinais e pagamentos efetivamente recebidos no período</p>
            </div>
            <div className="text-left font-mono text-xs space-y-1 p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <div className="flex justify-between gap-6">
                <span className="text-slate-450">Vendas normais (sinais/parcelas):</span>
                <span className="font-bold text-slate-200">
                  {formatBRL(entriesList.filter(e => e.clientName !== "Venda Rápida").reduce((acc, curr) => acc + curr.amount, 0))}
                </span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-slate-450">Vendas Rápidas:</span>
                <span className="font-bold text-brand-cyan">
                  {formatBRL(entriesList.filter(e => e.clientName === "Venda Rápida").reduce((acc, curr) => acc + curr.amount, 0))}
                </span>
              </div>
            </div>
          </div>

          {/* List of cash entries */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-850 font-sans space-y-4">
            <h4 className="text-xs font-extrabold text-slate-355 uppercase tracking-wider text-left">
              📋 Histórico Detalhado de Entradas ({entriesList.length})
            </h4>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-2.5 px-2">Data</th>
                    <th className="py-2.5 px-2">Cliente</th>
                    <th className="py-2.5 px-2">Forma de Pagamento</th>
                    <th className="py-2.5 px-2 text-right">Valor Recebido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/40 text-xs font-mono">
                  {entriesList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 italic">
                        Nenhuma entrada de caixa localizada no período.
                      </td>
                    </tr>
                  ) : (
                    entriesList.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-900/20 transition-all">
                        <td className="py-3 px-2 text-slate-400">
                          {new Date(entry.date).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-3 px-2 font-bold text-slate-200 font-sans">
                          {entry.clientName}
                        </td>
                        <td className="py-3 px-2">
                          <span className="text-[10px] font-bold text-brand-cyan uppercase bg-brand-cyan/10 px-2 py-0.5 rounded border border-brand-cyan/15 font-sans">
                            {entry.method.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-emerald-400">
                          {formatBRL(entry.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Sum total row/banner at the bottom */}
            <div className="pt-3 border-t border-slate-800 flex justify-between items-center bg-slate-900/40 p-4 rounded-xl border border-slate-800/60">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 font-sans">
                Valor Total de Entradas no Período:
              </span>
              <span className="text-lg font-black text-emerald-400 font-mono">
                {formatBRL(totalRevenuePaid)}
              </span>
            </div>
          </div>
        </div>
      )}

      {displayMode === "gastos" && (
        <div className="space-y-4 animate-fade-in">
          {/* KPI Banner */}
          <div className="bg-slate-950/60 rounded-xl border border-rose-500/25 p-5 font-sans flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-500 block">
                Gastos & Custos (Saídas)
              </span>
              <h3 className="text-3xl font-black text-white font-mono">{formatBRL(totalSaidasGeral)}</h3>
              <p className="text-xs text-slate-400">Despesas fixas corporativas e custos operacionais dos pedidos</p>
            </div>
            <div className="text-left font-mono text-xs space-y-1 p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <div className="flex justify-between gap-6">
                <span className="text-slate-450">Despesas Administrativas (Fixas/Gerais):</span>
                <span className="font-bold text-rose-400">{formatBRL(totalDespesasGerais)}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-slate-450">Custos Operacionais de Vendas:</span>
                <span className="font-bold text-red-400">{formatBRL(totalCustosOp)}</span>
              </div>
            </div>
          </div>

          {/* List of expenses & costs */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-850 font-sans space-y-4">
            <h4 className="text-xs font-extrabold text-slate-355 uppercase tracking-wider text-left">
              📋 Histórico Detalhado de Gastos ({expensesList.length})
            </h4>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-2.5 px-2">Data</th>
                    <th className="py-2.5 px-2">Descrição / Categoria</th>
                    <th className="py-2.5 px-2">Tipo de Gasto</th>
                    <th className="py-2.5 px-2 text-right">Valor Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/40 text-xs font-mono">
                  {expensesList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 italic">
                        Nenhuma saída de caixa localizada no período.
                      </td>
                    </tr>
                  ) : (
                    expensesList.map((expense) => (
                      <tr key={expense.id} className="hover:bg-slate-900/20 transition-all">
                        <td className="py-3 px-2 text-slate-400">
                          {new Date(expense.date + (expense.date.includes("T") ? "" : "T12:00:00")).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-3 px-2">
                          <span className="font-bold text-slate-200 block font-sans">{expense.description}</span>
                          <span className="text-[9px] text-slate-450 uppercase">{expense.category}</span>
                        </td>
                        <td className="py-3 px-2">
                          <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border font-sans ${
                            expense.category === "Custo Operacional"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/15"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/15"
                          }`}>
                            {expense.category === "Custo Operacional" ? "Produção" : "Administrativo"}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-rose-400">
                          {formatBRL(expense.value)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Sum total row/banner at the bottom */}
            <div className="pt-3 border-t border-slate-800 flex justify-between items-center bg-slate-900/40 p-4 rounded-xl border border-slate-800/60">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 font-sans">
                Valor Total de Gastos no Período:
              </span>
              <span className="text-lg font-black text-rose-400 font-mono">
                {formatBRL(totalSaidasGeral)}
              </span>
            </div>
          </div>
        </div>
      )}

      {displayMode === "lucro" && (
        <div className="space-y-4 animate-fade-in">
          {/* KPI Banner */}
          <div className="bg-slate-950/60 rounded-xl border border-emerald-500/25 p-5 font-sans flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 block">
                Ganho Real (Lucro Líquido)
              </span>
              <h3 className={`text-3xl font-black font-mono ${lucroLiquidoReal >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                {formatBRL(lucroLiquidoReal)}
              </h3>
              <p className="text-xs text-slate-400">Faturamento Bruto descontado de todos os Custos e Despesas do período</p>
            </div>
            <div className="text-left font-mono text-xs space-y-1 p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <div className="flex justify-between gap-6">
                <span className="text-slate-450">Faturamento Bruto Total:</span>
                <span className="font-bold text-slate-200">{formatBRL(faturamentoTotal)}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-slate-450">(-) Custos & Saídas Gerais:</span>
                <span className="font-bold text-rose-400">{formatBRL(totalSaidasGeral)}</span>
              </div>
              <div className="flex justify-between gap-6 pt-1.5 border-t border-slate-800">
                <span className="text-slate-400 font-bold font-sans">Margem de Lucro Real:</span>
                <span className="font-bold text-emerald-400">{margemLucro.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* List of profit margins by sale */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-850 font-sans space-y-4">
            <h4 className="text-xs font-extrabold text-slate-355 uppercase tracking-wider text-left">
              📋 Demonstração de Lucratividade por Venda ({profitList.length})
            </h4>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-2.5 px-2">Data</th>
                    <th className="py-2.5 px-2">Cliente</th>
                    <th className="py-2.5 px-2 text-right">Faturamento</th>
                    <th className="py-2.5 px-2 text-right">Custos Op.</th>
                    <th className="py-2.5 px-2 text-right">Lucro Real</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/40 text-xs font-mono">
                  {profitList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                        Nenhuma venda registrada no período.
                      </td>
                    </tr>
                  ) : (
                    profitList.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-900/20 transition-all">
                        <td className="py-3 px-2 text-slate-400">
                          {new Date(item.date).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-3 px-2 font-bold text-slate-200 font-sans">
                          {item.clientName}
                        </td>
                        <td className="py-3 px-2 text-right text-slate-300">
                          {formatBRL(item.totalValue)}
                        </td>
                        <td className="py-3 px-2 text-right text-rose-400">
                          {formatBRL(item.opCost)}
                        </td>
                        <td className={`py-3 px-2 text-right font-bold ${item.profit >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                          {formatBRL(item.profit)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Sum total row/banner at the bottom */}
            <div className="pt-3 border-t border-slate-800 flex justify-between items-center bg-slate-900/40 p-4 rounded-xl border border-slate-800/60">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 font-sans">
                Ganho Real Total Acumulado:
              </span>
              <span className={`text-lg font-black font-mono ${lucroLiquidoReal >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                {formatBRL(lucroLiquidoReal)}
              </span>
            </div>
          </div>
        </div>
      )}

      {displayMode === "total_vendido" && (
        <div className="space-y-4 animate-fade-in">
          {/* KPI Banner */}
          <div className="bg-slate-950/60 rounded-xl border border-violet-500/25 p-5 font-sans flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-violet-400 block">
                Valor Total Vendido (Faturamento Bruto)
              </span>
              <h3 className="text-3xl font-black text-white font-mono">{formatBRL(faturamentoTotal)}</h3>
              <p className="text-xs text-slate-400">Somatório de todas as vendas e encomendas faturadas no período</p>
            </div>
            <div className="text-left font-mono text-xs space-y-1 p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <div className="flex justify-between gap-6">
                <span className="text-slate-450">Vendas Tradicionais:</span>
                <span className="font-bold text-slate-200">{formatBRL(faturamentoVendasPadrao)}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-slate-450">Vendas Rápidas PDV:</span>
                <span className="font-bold text-violet-400">{formatBRL(faturamentoVendasRapidas)}</span>
              </div>
            </div>
          </div>

          {/* List of sales */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-850 font-sans space-y-4">
            <h4 className="text-xs font-extrabold text-slate-355 uppercase tracking-wider text-left">
              📋 Histórico Detalhado de Vendas ({salesList.length})
            </h4>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-2.5 px-2">Data</th>
                    <th className="py-2.5 px-2">Cliente</th>
                    <th className="py-2.5 px-2">Meio de Pagamento</th>
                    <th className="py-2.5 px-2 text-right">Valor Faturado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/40 text-xs font-mono">
                  {salesList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 italic">
                        Nenhuma venda faturada localizada no período.
                      </td>
                    </tr>
                  ) : (
                    salesList.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-900/20 transition-all">
                        <td className="py-3 px-2 text-slate-400">
                          {new Date(sale.date).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-3 px-2 font-bold text-slate-200 font-sans">
                          {sale.clientName}
                        </td>
                        <td className="py-3 px-2">
                          <span className="text-[10px] font-bold text-violet-400 uppercase bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/15 font-sans">
                            {sale.paymentMethod.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-violet-400">
                          {formatBRL(sale.totalValue)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Sum total row/banner at the bottom */}
            <div className="pt-3 border-t border-slate-800 flex justify-between items-center bg-slate-900/40 p-4 rounded-xl border border-slate-800/60">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 font-sans">
                Valor Total Vendido no Período:
              </span>
              <span className="text-lg font-black text-violet-400 font-mono">
                {formatBRL(faturamentoTotal)}
              </span>
            </div>
          </div>
        </div>
      )}
        </>
      ) : activeReportTab === "auditoria_atendente" ? (
        <AttendantAuditReport sales={sales} company={company} />
      ) : (
        /* ACCESS / OPENING REPORT VIEWPORT */
        <div className="space-y-6 animate-fade-in">
          {/* Access Report Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 bg-slate-950/45 p-4 rounded-xl border border-slate-850 font-sans">
            <div className="text-left">
              <h2 className="text-sm font-extrabold uppercase text-white tracking-widest flex items-center gap-2">
                🔐 Relatório de Acesso e Abertura de Caixa
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Monitore o histórico de aberturas, fechamentos e responsáveis pelas operações de caixa.
              </p>
            </div>
            
            <button
              type="button"
              onClick={handleDownloadAccessReport}
              className="w-full sm:w-auto py-2 px-4 bg-violet-650 hover:bg-violet-700 text-white font-bold text-[11px] uppercase rounded-xl border border-violet-550 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-violet-950/40 shrink-0 cursor-pointer"
            >
              <FileDown className="h-4 w-4 text-violet-200" />
              <span>Exportar PDF de Acessos</span>
            </button>
          </div>

          {/* Access report table / list */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-850 font-sans space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-3 px-2">Status</th>
                    <th className="py-3 px-2">Responsável / Operador</th>
                    <th className="py-3 px-2">Data e Hora Abertura</th>
                    <th className="py-3 px-2">Valor Inicial</th>
                    <th className="py-3 px-2">Data e Hora Fechamento</th>
                    <th className="py-3 px-2 text-right">Resultado Real</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 text-xs">
                  {(() => {
                    const allSessions: CashRegisterSession[] = [];
                    if (cashRegister?.currentSession) {
                      allSessions.push(cashRegister.currentSession);
                    }
                    if (cashRegister?.history) {
                      allSessions.push(...cashRegister.history);
                    }
                    
                    // Sort by newest opening first
                    allSessions.sort((a, b) => new Date(b.dataAbertura).getTime() - new Date(a.dataAbertura).getTime());

                    if (allSessions.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-550 font-mono italic">
                            Nenhum registro de acesso ao caixa localizado.
                          </td>
                        </tr>
                      );
                    }

                    return allSessions.map((session) => {
                      const isActive = session.status === "aberto";
                      return (
                        <tr key={session.id} className="hover:bg-slate-900/30 transition-all">
                          <td className="py-3.5 px-2">
                            <span className={`inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[9px] font-black uppercase border ${
                              isActive
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-slate-900 border-slate-800 text-slate-450"
                            }`}>
                              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                              {session.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-2 font-bold text-slate-150 uppercase">
                            {session.operador}
                          </td>
                          <td className="py-3.5 px-2 font-mono text-slate-400">
                            {new Date(session.dataAbertura).toLocaleString("pt-BR")}
                          </td>
                          <td className="py-3.5 px-2 font-mono text-brand-cyan font-bold">
                            {formatBRL(session.valorAbertura)}
                          </td>
                          <td className="py-3.5 px-2 font-mono text-slate-400">
                            {session.dataFechamento
                              ? new Date(session.dataFechamento).toLocaleString("pt-BR")
                              : <span className="text-emerald-400 font-bold italic">Sessão Ativa</span>}
                          </td>
                          <td className="py-3.5 px-2 font-mono font-bold text-right text-slate-200">
                            {session.valorFechamentoReal !== undefined
                              ? formatBRL(session.valorFechamentoReal)
                              : <span className="text-slate-500 italic font-normal">—</span>}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
