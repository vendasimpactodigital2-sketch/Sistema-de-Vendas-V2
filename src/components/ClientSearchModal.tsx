import React, { useState, useMemo } from "react";
import { 
  X, 
  Search, 
  User, 
  Phone, 
  MapPin, 
  Calendar, 
  Clock, 
  FileText, 
  Printer, 
  CheckCircle2, 
  AlertTriangle, 
  ShoppingCart, 
  DollarSign, 
  Wallet, 
  Edit2, 
  ArrowRight,
  ClipboardList,
  Sparkles,
  ChevronRight,
  HandCoins,
  History,
  List,
  LayoutGrid,
  Filter,
  CalendarDays
} from "lucide-react";
import { Sale, CompanyProfile, isQuickSaleClient, getSaleOrderDate } from "../types";
import { jsPDF } from "jspdf";
import { parseClientImages } from "../supabase";

interface ClientSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: Sale[];
  budgets?: Sale[];
  company?: CompanyProfile;
  onNewOrderWithClient?: (clientName: string, clientPhone: string) => void;
  onEditSale?: (sale: Sale) => void;
  onSaveSale?: (updatedSale: Sale) => void;
  initialSearchTerm?: string;
}

interface ConsolidatedClient {
  name: string;
  phone: string;
  sales: Sale[];
  totalOrders: number;
  totalSpent: number;
  totalPending: number;
  lastOrderDate?: string;
}

// Portuguese date helper functions
const getPortugueseDayOfWeek = (isoStr?: string) => {
  if (!isoStr) return "N/D";
  try {
    const [datePart] = isoStr.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    return days[date.getDay()] || "N/D";
  } catch {
    return "N/D";
  }
};

const getPortugueseMonthName = (mNum: number) => {
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  return months[mNum - 1] || "N/D";
};

const getPortugueseMonthYear = (isoStr?: string) => {
  if (!isoStr) return "N/D";
  try {
    const [datePart] = isoStr.split("T");
    const [y, m] = datePart.split("-").map(Number);
    return `${getPortugueseMonthName(m)} / ${y}`;
  } catch {
    return "N/D";
  }
};

const getFormattedFullDate = (isoStr?: string) => {
  if (!isoStr) return "Data N/D";
  try {
    const [datePart] = isoStr.split("T");
    const [year, month, day] = datePart.split("-");
    return `${day}/${month}/${year}`;
  } catch {
    return isoStr;
  }
};

const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isInThisWeek = (isoStr?: string) => {
  if (!isoStr) return false;
  try {
    const [datePart] = isoStr.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    if (!y || !m || !d) return false;
    const orderDate = new Date(y, m - 1, d);
    
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday
    const diffToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
    
    const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return orderDate >= startOfWeek && orderDate <= endOfWeek;
  } catch {
    return false;
  }
};

const isInThisMonth = (isoStr?: string) => {
  if (!isoStr) return false;
  try {
    const today = new Date();
    const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    return isoStr.startsWith(currentMonthPrefix);
  } catch {
    return false;
  }
};

export function ClientSearchModal({
  isOpen,
  onClose,
  sales,
  budgets = [],
  company,
  onNewOrderWithClient,
  onEditSale,
  onSaveSale,
  initialSearchTerm = ""
}: ClientSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [baixaAmount, setBaixaAmount] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"all" | "completed" | "pending">("all");
  
  // View mode for client directory: "list" (default) or "grid"
  const [clientViewMode, setClientViewMode] = useState<"list" | "grid">("list");

  // Date & Period filters for clients and orders
  const [periodFilter, setPeriodFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<string>("all");
  const [selectedExactDate, setSelectedExactDate] = useState<string>("");

  const resetAllFilters = () => {
    setPeriodFilter("all");
    setSelectedMonth("all");
    setSelectedDayOfWeek("all");
    setSelectedExactDate("");
  };

  const isAnyFilterActive = periodFilter !== "all" || selectedMonth !== "all" || selectedDayOfWeek !== "all" || selectedExactDate !== "";

  // Combine all sales and budgets
  const allOrders = useMemo(() => {
    return [...sales, ...budgets];
  }, [sales, budgets]);

  // Available unique months from all orders for dropdown
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    allOrders.forEach((sale) => {
      if (sale.date && sale.date.length >= 7) {
        monthsSet.add(sale.date.substring(0, 7)); // e.g. "2026-07"
      }
    });
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [allOrders]);

  // Consolidate unique clients by normalized name and phone (excluding quick sales)
  const clientsList = useMemo(() => {
    const clientMap: Record<string, ConsolidatedClient> = {};

    allOrders.forEach((sale) => {
      if (isQuickSaleClient(sale.clientName)) return; // Skip anonymous/quick sales

      const cleanName = (sale.clientName || "").trim();
      if (!cleanName) return;

      const normKey = cleanName.toLowerCase();

      if (!clientMap[normKey]) {
        clientMap[normKey] = {
          name: cleanName,
          phone: sale.clientPhone || "",
          sales: [],
          totalOrders: 0,
          totalSpent: 0,
          totalPending: 0,
          lastOrderDate: sale.date
        };
      }

      const clientEntry = clientMap[normKey];
      clientEntry.sales.push(sale);
      
      // Update phone if missing
      if (!clientEntry.phone && sale.clientPhone) clientEntry.phone = sale.clientPhone;

      if (!sale.isBudget) {
        clientEntry.totalOrders += 1;
        clientEntry.totalSpent += Number(sale.totalValue || 0);
        if ((sale.balanceDue || 0) > 0.001) {
          clientEntry.totalPending += Number(sale.balanceDue || 0);
        }
      }

      // Track most recent date
      if (sale.date && (!clientEntry.lastOrderDate || sale.date > clientEntry.lastOrderDate)) {
        clientEntry.lastOrderDate = sale.date;
      }
    });

    // Sort client list alphabetically
    return Object.values(clientMap).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [allOrders]);

  // Filter clients based on search term & date/period filters
  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const phoneDigits = searchTerm.replace(/\D/g, "");

    let list = clientsList;

    if (term) {
      list = list.filter((c) => {
        const matchesName = c.name.toLowerCase().includes(term);
        const matchesPhone = phoneDigits.length > 0 && c.phone.replace(/\D/g, "").includes(phoneDigits);
        return matchesName || matchesPhone;
      });
    }

    // Quick Period Filters (Hoje, Esta Semana, Este Mês)
    if (periodFilter === "today") {
      const todayStr = getTodayStr();
      list = list.filter((c) => c.sales.some((s) => s.date && s.date.startsWith(todayStr)));
    } else if (periodFilter === "week") {
      list = list.filter((c) => c.sales.some((s) => isInThisWeek(s.date)));
    } else if (periodFilter === "month") {
      list = list.filter((c) => c.sales.some((s) => isInThisMonth(s.date)));
    }

    // Month Select
    if (selectedMonth && selectedMonth !== "all") {
      list = list.filter((c) => c.sales.some((s) => s.date && s.date.startsWith(selectedMonth)));
    }

    // Day of Week Select
    if (selectedDayOfWeek && selectedDayOfWeek !== "all") {
      list = list.filter((c) => c.sales.some((s) => getPortugueseDayOfWeek(s.date) === selectedDayOfWeek));
    }

    // Exact Date Select
    if (selectedExactDate) {
      list = list.filter((c) => c.sales.some((s) => s.date && s.date.startsWith(selectedExactDate)));
    }

    return list;
  }, [clientsList, searchTerm, periodFilter, selectedMonth, selectedDayOfWeek, selectedExactDate]);

  // Active selected client data
  const activeClient = useMemo(() => {
    if (selectedClientName) {
      return clientsList.find(c => c.name.toLowerCase() === selectedClientName.toLowerCase()) || null;
    }
    // If search term matches exactly 1 client, select it automatically
    if (filteredClients.length === 1 && searchTerm.trim().length >= 2) {
      return filteredClients[0];
    }
    return null;
  }, [clientsList, selectedClientName, filteredClients, searchTerm]);

  // Filter sales for the active client according to active tab & date filters
  const activeClientSales = useMemo(() => {
    if (!activeClient) return [];
    
    // Sort sales by date descending (newest first)
    let sorted = [...activeClient.sales].sort((a, b) => {
      const dateA = a.date || "";
      const dateB = b.date || "";
      return dateB.localeCompare(dateA);
    });

    if (activeTab === "pending") {
      sorted = sorted.filter(s => !s.isBudget && (s.balanceDue || 0) > 0.001);
    } else if (activeTab === "completed") {
      sorted = sorted.filter(s => !s.isBudget && (s.balanceDue || 0) <= 0.001);
    }

    // Quick Period Filters
    if (periodFilter === "today") {
      const todayStr = getTodayStr();
      sorted = sorted.filter(s => s.date && s.date.startsWith(todayStr));
    } else if (periodFilter === "week") {
      sorted = sorted.filter(s => isInThisWeek(s.date));
    } else if (periodFilter === "month") {
      sorted = sorted.filter(s => isInThisMonth(s.date));
    }

    // Filter by Month
    if (selectedMonth && selectedMonth !== "all") {
      sorted = sorted.filter(s => s.date && s.date.startsWith(selectedMonth));
    }

    // Filter by Day of Week
    if (selectedDayOfWeek && selectedDayOfWeek !== "all") {
      sorted = sorted.filter(s => getPortugueseDayOfWeek(s.date) === selectedDayOfWeek);
    }

    // Filter by Exact Date
    if (selectedExactDate) {
      sorted = sorted.filter(s => s.date && s.date.startsWith(selectedExactDate));
    }

    return sorted;
  }, [activeClient, activeTab, periodFilter, selectedMonth, selectedDayOfWeek, selectedExactDate]);

  if (!isOpen) return null;

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);
  };

  const formatDate = (isoStr?: string) => {
    return getFormattedFullDate(isoStr);
  };

  // Handle Baixa / Partial Payment directly in modal
  const handleDarBaixa = (sale: Sale) => {
    if (!onSaveSale) return;
    const rawVal = baixaAmount[sale.id];
    const amountToPay = rawVal ? parseFloat(rawVal.replace(",", ".")) : sale.balanceDue;

    if (isNaN(amountToPay) || amountToPay <= 0) {
      alert("Por favor, digite um valor válido para dar baixa.");
      return;
    }

    if (amountToPay > sale.balanceDue + 0.01) {
      alert(`O valor digitado (${formatBRL(amountToPay)}) é maior que o saldo pendente (${formatBRL(sale.balanceDue)}).`);
      return;
    }

    const newBalanceDue = Math.max(0, sale.balanceDue - amountToPay);
    const updatedSale: Sale = {
      ...sale,
      downPayment: (sale.downPayment || 0) + amountToPay,
      balanceDue: newBalanceDue >= 0.01 ? newBalanceDue : 0,
      materialEntregue: sale.materialEntregue || false,
      payments: [
        ...(sale.payments || []),
        {
          id: `PAY-${Date.now()}`,
          date: new Date().toISOString(),
          amount: amountToPay,
          method: "pix"
        }
      ]
    };

    onSaveSale(updatedSale);
    setBaixaAmount(prev => ({ ...prev, [sale.id]: "" }));
    alert(`Baixa de ${formatBRL(amountToPay)} realizada com sucesso para a Notinha #${sale.id}!`);
  };

  // Generate Receipt PDF for a specific sale ticket
  const handlePrintReceiptPDF = async (sale: Sale) => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const primaryColor = [14, 165, 233]; // Cyan 500
    const darkBg = [15, 23, 42]; // Slate 900
    const lightGray = [241, 245, 249];

    // Header Branding Box
    doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
    doc.rect(10, 10, 190, 32, "F");

    let logoXOffset = 15;
    if (company?.logo) {
      try {
        const img = new Image();
        img.src = company.logo;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
        if (img.complete && img.naturalWidth !== 0) {
          doc.addImage(img, "PNG", 15, 13, 24, 24);
          logoXOffset = 43;
        }
      } catch (e) {
        console.warn("Error adding logo to PDF:", e);
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text((company?.tradingName || "SISTEMA NÚCLEO").toUpperCase(), logoXOffset, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    let lineY = 25;
    if (company?.cnpjCpf) {
      doc.text(`CNPJ/CPF: ${company.cnpjCpf}`, logoXOffset, lineY);
      lineY += 4;
    }
    doc.text(`Contato: ${company?.phone || "Não informado"}`, logoXOffset, lineY);

    // Document Title & Number
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(56, 189, 248);
    doc.text(`COMPROVANTE DE PEDIDO / NOTINHA #${sale.id}`, 195, 20, { align: "right" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text(`Data: ${formatDate(sale.date)}`, 195, 26, { align: "right" });

    // Client Info Box
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.rect(10, 46, 190, 20, "F");
    doc.setDrawColor(203, 213, 225);
    doc.rect(10, 46, 190, 20, "S");

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`CLIENTE: ${sale.clientName.toUpperCase()}`, 14, 53);
    doc.setFont("helvetica", "normal");
    doc.text(`Telefone: ${sale.clientPhone || "Não informado"}`, 14, 59);

    // Items Table Header
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(10, 71, 190, 8, "F");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("DESCRIÇÃO DO SERVIÇO / PRODUTO", 14, 76);
    doc.text("QTD", 120, 76);
    doc.text("V. UNITÁRIO", 145, 76);
    doc.text("V. TOTAL", 180, 76);

    let curY = 85;
    if (sale.items && sale.items.length > 0) {
      sale.items.forEach((item, idx) => {
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(10, curY - 4, 190, 7, "F");
        }
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 41, 59);
        const itemTotal = Number(item.totalValue || item.unitValue * item.quantity);
        doc.text(item.description.substring(0, 50), 14, curY);
        doc.text(String(item.quantity), 120, curY);
        doc.text(formatBRL(item.unitValue), 145, curY);
        doc.text(formatBRL(itemTotal), 180, curY);
        curY += 7;
      });
    } else {
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100, 116, 139);
      doc.text("Nenhum item discriminado.", 14, curY);
      curY += 7;
    }

    // Totals Box
    curY += 5;
    doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
    doc.rect(110, curY, 90, 32, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("VALOR TOTAL:", 115, curY + 8);
    doc.text(formatBRL(sale.totalValue), 195, curY + 8, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text("Sinal / Valor Pago:", 115, curY + 16);
    doc.text(formatBRL(sale.downPayment), 195, curY + 16, { align: "right" });

    doc.setFont("helvetica", "bold");
    if ((sale.balanceDue || 0) > 0) {
      doc.setTextColor(248, 113, 113); // Red
      doc.text("RESTANTE PENDENTE:", 115, curY + 24);
      doc.text(formatBRL(sale.balanceDue), 195, curY + 24, { align: "right" });
    } else {
      doc.setTextColor(74, 222, 128); // Green
      doc.text("STATUS: QUITADO", 115, curY + 24);
      doc.text("R$ 0,00", 195, curY + 24, { align: "right" });
    }

    // Footer signature
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Obrigado pela preferência e confiança!", 10, 270);
    doc.text(`Documento gerado em ${new Date().toLocaleString("pt-BR")}`, 10, 275);

    doc.save(`Notinha_${sale.id}_${sale.clientName.replace(/\s+/g, "_")}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-100">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-xl text-slate-950 shadow-lg shadow-cyan-500/20">
              <History className="h-5 w-5 font-black" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                Consulta & Histórico de Pedidos por Cliente
              </h2>
              <p className="text-xs text-slate-400 hidden sm:block">
                Pesquise por nome ou telefone para visualizar notinhas, serviços e débitos de cada cliente.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Bar & Auto-Complete Header */}
        <div className="p-4 border-b border-slate-850 bg-slate-900/90 shrink-0 space-y-3">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedClientName(null);
              }}
              placeholder="Digite o nome do cliente ou número do celular..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl py-3 pl-11 pr-10 text-sm font-medium text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition shadow-inner"
              autoFocus
            />
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-cyan-400" />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedClientName(null);
                }}
                className="absolute right-3.5 top-3.5 text-slate-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick Period Filter Buttons Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-850/80">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono font-bold uppercase text-slate-400 mr-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                <span>Visualizar por:</span>
              </span>

              <button
                type="button"
                onClick={() => setPeriodFilter("all")}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  periodFilter === "all"
                    ? "bg-cyan-500 text-slate-950 font-black shadow-md"
                    : "bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800"
                }`}
              >
                <span>Todos</span>
              </button>

              <button
                type="button"
                onClick={() => setPeriodFilter("today")}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  periodFilter === "today"
                    ? "bg-cyan-500 text-slate-950 font-black shadow-md"
                    : "bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800"
                }`}
              >
                <Clock className="h-3 w-3" />
                <span>Hoje</span>
              </button>

              <button
                type="button"
                onClick={() => setPeriodFilter("week")}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  periodFilter === "week"
                    ? "bg-cyan-500 text-slate-950 font-black shadow-md"
                    : "bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800"
                }`}
              >
                <CalendarDays className="h-3 w-3" />
                <span>Esta Semana</span>
              </button>

              <button
                type="button"
                onClick={() => setPeriodFilter("month")}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  periodFilter === "month"
                    ? "bg-cyan-500 text-slate-950 font-black shadow-md"
                    : "bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800"
                }`}
              >
                <Calendar className="h-3 w-3" />
                <span>Este Mês</span>
              </button>
            </div>

            {/* Clear active date filters button */}
            {isAnyFilterActive && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-[11px] font-mono text-rose-400 hover:text-rose-300 underline cursor-pointer font-bold flex items-center gap-1 ml-auto"
              >
                <span>✕ Limpar Filtros de Data</span>
              </button>
            )}
          </div>

          {/* Quick Client Selection Chips if multiple clients match */}
          {searchTerm.trim().length > 0 && !activeClient && filteredClients.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 customize-scrollbar">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
                Clientes encontrados ({filteredClients.length}):
              </span>
              {filteredClients.slice(0, 8).map((client, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedClientName(client.name)}
                  className="px-3 py-1 bg-slate-800 hover:bg-cyan-500/20 hover:border-cyan-500/40 border border-slate-700/80 rounded-lg text-xs font-bold text-slate-200 hover:text-cyan-400 shrink-0 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <User className="h-3 w-3 text-cyan-400" />
                  <span>{client.name}</span>
                  <span className="text-[10px] opacity-60">({client.totalOrders})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 customize-scrollbar">
          {!activeClient ? (
            /* Clients directory / selection view */
            <div>
              <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <User className="h-4 w-4 text-cyan-400" />
                  <span>
                    {searchTerm ? `Resultados da busca (${filteredClients.length})` : `Todos os Clientes Cadastrados (${clientsList.length})`}
                  </span>
                </h3>

                {/* View Mode Switcher: Lista vs Quadrado */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setClientViewMode("list")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      clientViewMode === "list"
                        ? "bg-cyan-500 text-slate-950 font-black shadow-md"
                        : "text-slate-400 hover:text-white"
                    }`}
                    title="Visualizar em Lista"
                  >
                    <List className="h-3.5 w-3.5" />
                    <span>Lista</span>
                  </button>
                  <button
                    onClick={() => setClientViewMode("grid")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      clientViewMode === "grid"
                        ? "bg-cyan-500 text-slate-950 font-black shadow-md"
                        : "text-slate-400 hover:text-white"
                    }`}
                    title="Visualizar em Quadrados (Grade)"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>Quadrados</span>
                  </button>
                </div>
              </div>

              {/* Filter Controls Bar: Dia da Semana, Mês do Ano, Data Específica */}
              <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl mb-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Filter className="h-3.5 w-3.5" />
                    <span>Filtros Específicos por Data</span>
                  </span>
                  <span>{filteredClients.length} cliente(s) encontrado(s)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Day of Week */}
                  <div>
                    <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-1 flex items-center gap-1">
                      <CalendarDays className="h-3 w-3 text-cyan-400" />
                      <span>Dia da Semana</span>
                    </label>
                    <select
                      value={selectedDayOfWeek}
                      onChange={(e) => setSelectedDayOfWeek(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="all">Todos os dias</option>
                      <option value="Segunda-feira">Segunda-feira</option>
                      <option value="Terça-feira">Terça-feira</option>
                      <option value="Quarta-feira">Quarta-feira</option>
                      <option value="Quinta-feira">Quinta-feira</option>
                      <option value="Sexta-feira">Sexta-feira</option>
                      <option value="Sábado">Sábado</option>
                      <option value="Domingo">Domingo</option>
                    </select>
                  </div>

                  {/* Specific Month */}
                  <div>
                    <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-cyan-400" />
                      <span>Mês do Ano</span>
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="all">Todos os Meses</option>
                      {availableMonths.map((mKey) => (
                        <option key={mKey} value={mKey}>
                          {getPortugueseMonthYear(`${mKey}-01`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Specific Date */}
                  <div>
                    <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-cyan-400" />
                      <span>Data Específica</span>
                    </label>
                    <input
                      type="date"
                      value={selectedExactDate}
                      onChange={(e) => setSelectedExactDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {filteredClients.length === 0 ? (
                <div className="text-center py-16 text-slate-500 space-y-3 bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl">
                  <User className="h-10 w-10 mx-auto text-slate-700" />
                  <div>
                    <p className="text-sm font-bold text-slate-300">Nenhum cliente encontrado</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {searchTerm ? `Nenhum resultado corresponde a "${searchTerm}"` : "Cadastre uma venda com o nome do cliente para que apareça aqui."}
                    </p>
                  </div>
                </div>
              ) : clientViewMode === "list" ? (
                /* LIST VIEW (DEFAULT) */
                <div className="flex flex-col gap-2.5">
                  {filteredClients.map((client, idx) => {
                    const dayOfWeek = getPortugueseDayOfWeek(client.lastOrderDate);
                    const monthYear = getPortugueseMonthYear(client.lastOrderDate);
                    const formattedDate = getFormattedFullDate(client.lastOrderDate);

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedClientName(client.name)}
                        className="bg-slate-950 hover:bg-slate-900 border border-slate-800/90 hover:border-cyan-500/50 p-3.5 rounded-xl cursor-pointer transition-all duration-200 group flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md"
                      >
                        {/* Left: Avatar & Info */}
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-400 font-black text-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            {client.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-sm text-slate-100 group-hover:text-cyan-400 transition-colors truncate">
                                {client.name}
                              </h4>
                              {client.phone ? (
                                <span className="text-xs font-mono text-cyan-400/90 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-cyan-400 shrink-0" />
                                  <span>{client.phone}</span>
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-600 italic">Sem telefone</span>
                              )}
                            </div>

                            {/* Date Details Breakdown: Day of Week, Month, Full Date */}
                            {client.lastOrderDate && (
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-400">
                                <span className="text-slate-500 text-[10px] uppercase font-bold mr-1">Último Pedido:</span>
                                <span className="text-cyan-300 font-bold bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <span>🗓️</span>
                                  <span>{dayOfWeek}</span>
                                </span>
                                <span className="text-slate-300 font-bold bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <span>📅</span>
                                  <span>{monthYear}</span>
                                </span>
                                <span className="text-cyan-400 font-bold bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <span>🕒</span>
                                  <span>{formattedDate}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Financial & Order Metrics Badges */}
                        <div className="flex items-center gap-2 shrink-0 font-mono text-xs border-t md:border-t-0 pt-2 md:pt-0 border-slate-850 justify-between md:justify-end">
                          <div className="bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 text-center min-w-[70px]">
                            <span className="text-[9px] text-slate-500 uppercase font-bold block">Pedidos</span>
                            <strong className="text-slate-200 text-xs">{client.totalOrders}</strong>
                          </div>
                          <div className="bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 text-center min-w-[90px]">
                            <span className="text-[9px] text-slate-500 uppercase font-bold block">Consumo</span>
                            <strong className="text-cyan-400 text-xs">{formatBRL(client.totalSpent)}</strong>
                          </div>
                          <div className={`px-3 py-1.5 rounded-lg border text-center min-w-[90px] ${client.totalPending > 0 ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : "bg-slate-900/80 border-slate-800 text-slate-400"}`}>
                            <span className="text-[9px] uppercase font-bold block opacity-80">Pendente</span>
                            <strong className="text-xs">{formatBRL(client.totalPending)}</strong>
                          </div>
                          <div className="pl-1">
                            <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-1" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* GRID VIEW (QUADRADO) */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredClients.map((client, idx) => {
                    const dayOfWeek = getPortugueseDayOfWeek(client.lastOrderDate);
                    const monthYear = getPortugueseMonthYear(client.lastOrderDate);
                    const formattedDate = getFormattedFullDate(client.lastOrderDate);

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedClientName(client.name)}
                        className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 p-4 rounded-xl cursor-pointer transition-all duration-200 group flex flex-col justify-between space-y-3 shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-400 font-black text-base flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                              {client.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-sm text-slate-200 group-hover:text-cyan-400 transition-colors truncate">
                                {client.name}
                              </h4>
                              {client.phone ? (
                                <p className="text-xs font-mono text-slate-450 flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-slate-600 shrink-0" />
                                  <span>{client.phone}</span>
                                </p>
                              ) : (
                                <span className="text-[11px] text-slate-600 italic">Sem telefone</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-cyan-400 transition-transform group-hover:translate-x-1 shrink-0" />
                        </div>

                        {/* Date details badge */}
                        {client.lastOrderDate && (
                          <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-850 space-y-1 font-mono text-[10px]">
                            <div className="text-slate-500 font-bold uppercase">Último Pedido:</div>
                            <div className="flex flex-wrap items-center gap-1 text-slate-300 font-bold">
                              <span className="text-cyan-400">{dayOfWeek}</span>
                              <span>•</span>
                              <span>{monthYear}</span>
                              <span>•</span>
                              <span className="text-white">{formattedDate}</span>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-850/80 text-center text-[10px] font-mono">
                          <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-850">
                            <span className="text-slate-500 block uppercase font-bold">Pedidos</span>
                            <strong className="text-slate-200 text-xs font-bold">{client.totalOrders}</strong>
                          </div>
                          <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-850">
                            <span className="text-slate-500 block uppercase font-bold">Consumo</span>
                            <strong className="text-cyan-400 text-xs font-bold">{formatBRL(client.totalSpent)}</strong>
                          </div>
                          <div className={`p-1.5 rounded-lg border ${client.totalPending > 0 ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-slate-900/60 border-slate-850 text-slate-400"}`}>
                            <span className="block uppercase font-bold opacity-80">Pendente</span>
                            <strong className="text-xs font-bold">{formatBRL(client.totalPending)}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Selected Client Detailed History View */
            <div className="space-y-6">
              {/* Back button & Client Header */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <button
                      onClick={() => setSelectedClientName(null)}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold border border-slate-800 transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      ← Outros Clientes
                    </button>
                    <div className="min-w-0">
                      <h2 className="text-lg font-black text-white flex items-center gap-2 truncate">
                        {activeClient.name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-0.5 font-mono">
                        {activeClient.phone && (
                          <span className="flex items-center gap-1 text-cyan-400">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            {activeClient.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {onNewOrderWithClient && (
                    <button
                      onClick={() => {
                        onNewOrderWithClient(activeClient.name, activeClient.phone || "");
                        onClose();
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs uppercase tracking-wide rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center gap-2 cursor-pointer shrink-0"
                    >
                      <ShoppingCart className="h-4 w-4" />
                      <span>Novo Pedido para este Cliente</span>
                    </button>
                  )}
                </div>

                {/* Client Stats Banner */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-850 font-mono">
                  <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Total de Pedidos</span>
                      <strong className="text-base text-white font-black">{activeClient.totalOrders}</strong>
                    </div>
                    <ClipboardList className="h-5 w-5 text-cyan-400 opacity-60" />
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Faturado</span>
                      <strong className="text-base text-cyan-400 font-black">{formatBRL(activeClient.totalSpent)}</strong>
                    </div>
                    <DollarSign className="h-5 w-5 text-emerald-400 opacity-60" />
                  </div>

                  <div className={`border p-3 rounded-xl flex items-center justify-between ${activeClient.totalPending > 0 ? "bg-rose-500/10 border-rose-500/30" : "bg-slate-900/80 border-slate-800"}`}>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Saldo Pendente</span>
                      <strong className={`text-base font-black ${activeClient.totalPending > 0 ? "text-rose-400 animate-pulse" : "text-slate-400"}`}>
                        {formatBRL(activeClient.totalPending)}
                      </strong>
                    </div>
                    <Wallet className={`h-5 w-5 ${activeClient.totalPending > 0 ? "text-rose-400" : "text-slate-600"}`} />
                  </div>
                </div>
              </div>

              {/* Transactions Status Tabs & Advanced Date Filters */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-850 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setActiveTab("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === "all" ? "bg-cyan-500 text-slate-950 font-black" : "bg-slate-900 text-slate-400 hover:bg-slate-800"}`}
                    >
                      Todos os Pedidos ({activeClient.sales.length})
                    </button>
                    <button
                      onClick={() => setActiveTab("completed")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === "completed" ? "bg-emerald-500 text-slate-950 font-black" : "bg-slate-900 text-slate-400 hover:bg-slate-800"}`}
                    >
                      Quitados / Entregues
                    </button>
                    <button
                      onClick={() => setActiveTab("pending")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === "pending" ? "bg-rose-500 text-white font-black" : "bg-slate-900 text-slate-400 hover:bg-slate-800"}`}
                    >
                      Pendentes ({activeClient.sales.filter(s => !s.isBudget && (s.balanceDue || 0) > 0.001).length})
                    </button>
                  </div>

                  <div className="text-xs font-mono text-slate-400 font-bold">
                    Exibindo: <span className="text-cyan-400">{activeClientSales.length}</span> notinha(s)
                  </div>
                </div>

                {/* Filter Controls Bar: Dia da Semana, Mês, Data Específica */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  {/* Filter by Day of Week */}
                  <div>
                    <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-1 flex items-center gap-1">
                      <CalendarDays className="h-3 w-3 text-cyan-400" />
                      <span>Filtrar por Dia da Semana</span>
                    </label>
                    <select
                      value={selectedDayOfWeek}
                      onChange={(e) => setSelectedDayOfWeek(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="all">Todos os dias da semana</option>
                      <option value="Segunda-feira">Segunda-feira</option>
                      <option value="Terça-feira">Terça-feira</option>
                      <option value="Quarta-feira">Quarta-feira</option>
                      <option value="Quinta-feira">Quinta-feira</option>
                      <option value="Sexta-feira">Sexta-feira</option>
                      <option value="Sábado">Sábado</option>
                      <option value="Domingo">Domingo</option>
                    </select>
                  </div>

                  {/* Filter by Month */}
                  <div>
                    <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-cyan-400" />
                      <span>Filtrar por Mês</span>
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="all">Todos os Meses</option>
                      {availableMonths.map((mKey) => (
                        <option key={mKey} value={mKey}>
                          {getPortugueseMonthYear(`${mKey}-01`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filter by Exact Date */}
                  <div>
                    <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-cyan-400" />
                      <span>Filtrar por Data Específica</span>
                    </label>
                    <input
                      type="date"
                      value={selectedExactDate}
                      onChange={(e) => setSelectedExactDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    />
                  </div>
                </div>

                {(selectedDayOfWeek !== "all" || selectedMonth !== "all" || selectedExactDate !== "") && (
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        setSelectedDayOfWeek("all");
                        setSelectedMonth("all");
                        setSelectedExactDate("");
                      }}
                      className="text-xs font-mono text-rose-400 hover:text-rose-300 underline cursor-pointer"
                    >
                      Limpar Filtros de Data
                    </button>
                  </div>
                )}
              </div>

              {/* List of Sale Tickets ("Notinhas") */}
              <div className="space-y-4">
                {activeClientSales.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl">
                    <p className="text-sm font-bold text-slate-400">Nenhum pedido atende aos filtros selecionados.</p>
                  </div>
                ) : (
                  activeClientSales.map((sale) => {
                    const isBudget = !!sale.isBudget;
                    const balanceDue = Number(sale.balanceDue || 0);
                    const isPendingPayment = !isBudget && balanceDue > 0.001;

                    const dayOfWeek = getPortugueseDayOfWeek(sale.date);
                    const monthYear = getPortugueseMonthYear(sale.date);
                    const fullFormattedDate = getFormattedFullDate(sale.date);

                    return (
                      <div
                        key={sale.id}
                        className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-4 shadow-lg transition duration-200"
                      >
                        {/* Notinha Header */}
                        <div className="flex flex-wrap justify-between items-start border-b border-dashed border-slate-800 pb-3 gap-2">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono font-black text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2.5 py-1 rounded-lg">
                                Notinha / Venda nº #{sale.id}
                              </span>
                              {isBudget ? (
                                <span className="text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md">
                                  Orçamento
                                </span>
                              ) : isPendingPayment ? (
                                <span className="text-[10px] font-mono font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-md animate-pulse">
                                  Baixa Pendente
                                </span>
                              ) : !sale.materialEntregue ? (
                                <span className="text-[10px] font-mono font-bold uppercase bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-md">
                                  ND A RECEBER (Pend. Retirada)
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                                  Quitado & Entregue
                                </span>
                              )}
                            </div>

                            {/* Detailed Date Breakdown: Day of week, Month, Full Date */}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-mono">
                              <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md text-cyan-300 font-bold flex items-center gap-1">
                                <span>🗓️</span>
                                <span>{dayOfWeek}</span>
                              </span>
                              <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md text-slate-200 font-bold flex items-center gap-1">
                                <span>📅</span>
                                <span>{monthYear}</span>
                              </span>
                              <span className="bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded-md text-cyan-400 font-bold flex items-center gap-1">
                                <span>🕒</span>
                                <span>Data: {fullFormattedDate}</span>
                              </span>
                              {sale.deliveryDate && (
                                <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md text-slate-400 flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                                  Previsão: {getSaleOrderDate(sale).split("-").reverse().join("/")}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quick Print & Edit buttons */}
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handlePrintReceiptPDF(sale)}
                              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 border border-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                              title="Imprimir Comprovante / Notinha em PDF"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              <span>Notinha (PDF)</span>
                            </button>

                            {onEditSale && (
                              <button
                                onClick={() => {
                                  onEditSale(sale);
                                  onClose();
                                }}
                                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                                title="Editar esta venda"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-slate-400" />
                                <span>Editar</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Services / Items list requested */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                            Serviço(s) & Itens do Pedido:
                          </span>
                          <div className="bg-slate-900/60 border border-slate-850 rounded-xl p-3.5 space-y-2 font-mono text-xs">
                            {sale.items && sale.items.length > 0 ? (
                              sale.items.map((item, i) => {
                                const itemTotal = Number(item.totalValue || item.unitValue * item.quantity);
                                return (
                                  <div key={item.id || i} className="flex justify-between items-center text-slate-200">
                                    <div className="flex items-center gap-2 min-w-0 pr-2">
                                      <span className="px-1.5 py-0.5 bg-cyan-950 text-cyan-400 rounded text-[10px] font-bold border border-cyan-800/40">
                                        {item.quantity}x
                                      </span>
                                      <span className="truncate">{item.description}</span>
                                    </div>
                                    <span className="font-bold shrink-0 text-slate-100">
                                      {formatBRL(itemTotal)}
                                    </span>
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-slate-500 italic text-xs">Sem itens discriminados</span>
                            )}
                          </div>
                        </div>

                        {/* Financial summary & Dar baixa form if balance is due */}
                        <div className="bg-slate-900/40 border border-slate-850 p-3.5 rounded-xl flex flex-wrap justify-between items-center gap-3 text-xs font-mono">
                          <div className="flex items-center gap-4 flex-wrap">
                            <span>
                              Total: <strong className="text-white text-sm">{formatBRL(sale.totalValue)}</strong>
                            </span>
                            {Number(sale.downPayment || 0) > 0 && (
                              <span className="text-emerald-400">
                                Sinal/Pago: <strong>{formatBRL(sale.downPayment)}</strong>
                              </span>
                            )}
                            {Number(sale.discount || 0) > 0 && (
                              <span className="text-rose-400">
                                Desconto: <strong>{formatBRL(sale.discount)}</strong>
                              </span>
                            )}
                          </div>

                          {isPendingPayment && (
                            <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl text-rose-400">
                              <AlertTriangle className="h-4 w-4 animate-pulse shrink-0" />
                              <span>Falta Receber: <strong className="font-bold">{formatBRL(balanceDue)}</strong></span>
                            </div>
                          )}
                        </div>

                        {/* Inline Dar Baixa Input Form if balance is due */}
                        {isPendingPayment && onSaveSale && (
                          <div className="pt-2 border-t border-slate-850 flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-rose-500/20">
                            <div className="flex items-center gap-2">
                              <HandCoins className="h-4 w-4 text-emerald-400 shrink-0" />
                              <span className="text-xs font-bold text-slate-200">Dar Baixa no Saldo Pendente:</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="relative w-32">
                                <span className="absolute left-2.5 top-1.5 text-xs text-slate-500 font-mono">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder={balanceDue.toFixed(2)}
                                  value={baixaAmount[sale.id] || ""}
                                  onChange={(e) => setBaixaAmount({ ...baixaAmount, [sale.id]: e.target.value })}
                                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1 pl-8 pr-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                                />
                              </div>

                              <button
                                onClick={() => setBaixaAmount({ ...baixaAmount, [sale.id]: balanceDue.toFixed(2) })}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 rounded font-mono cursor-pointer"
                              >
                                Total
                              </button>

                              <button
                                onClick={() => handleDarBaixa(sale)}
                                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-lg transition shadow-md shadow-emerald-500/20 cursor-pointer flex items-center gap-1"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Confirmar Baixa</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-between items-center text-xs text-slate-500 shrink-0">
          <span>
            {clientsList.length} clientes cadastrados com histórico de serviços
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
