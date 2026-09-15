import React, { useState, useMemo } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Calendar,
  User,
  Clock,
  DollarSign,
  AlertTriangle,
  FileDown,
  Printer,
  Search,
  CheckCircle2,
  Package,
  Layers,
  ArrowRight,
  TrendingUp,
  Receipt,
  Eye,
  X,
  CreditCard,
  QrCode,
  Banknote,
  Percent,
  HelpCircle,
  FileSpreadsheet
} from "lucide-react";
import { Sale, CompanyProfile, isQuickSaleClient } from "../types";

interface AttendantAuditReportProps {
  sales: Sale[];
  company: CompanyProfile;
}

export function AttendantAuditReport({ sales, company }: AttendantAuditReportProps) {
  // Local date helpers
  const getTodayDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const getYesterdayDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const getLocalDateFromISO = (isoStr: string): string => {
    if (!isoStr) return "";
    const clean = isoStr.replace(/['"]/g, "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    if (clean.includes("T00:00:00") || clean.includes(" 00:00:00") || clean.includes("T03:00:00")) {
      return clean.substring(0, 10);
    }
    try {
      const d = new Date(clean);
      if (isNaN(d.getTime())) return clean.substring(0, 10);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return clean.substring(0, 10);
    }
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [datePreset, setDatePreset] = useState<"today" | "yesterday" | "custom">("today");
  const [selectedOperator, setSelectedOperator] = useState<string>("all");
  const [selectedRole, setSelectedRole] = useState<"all" | "atendente" | "administrador">("all");
  const [filterAlertOnly, setFilterAlertOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewingReceiptSale, setViewingReceiptSale] = useState<Sale | null>(null);

  // Format currency
  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val || 0);
  };

  // Format time
  const formatTime = (isoStr: string) => {
    if (!isoStr) return "--:--";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "--:--";
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "--:--";
    }
  };

  // Handle preset date switches
  const handleSetPreset = (preset: "today" | "yesterday" | "custom") => {
    setDatePreset(preset);
    if (preset === "today") {
      setSelectedDate(getTodayDateString());
    } else if (preset === "yesterday") {
      setSelectedDate(getYesterdayDateString());
    }
  };

  // Extract unique operator names from sales
  const uniqueOperators = useMemo(() => {
    const set = new Set<string>();
    sales.forEach((s) => {
      if (s.sellerName) set.add(s.sellerName.trim());
      if (s.deliveredBy) set.add(s.deliveredBy.trim());
      (s.payments || []).forEach((p) => {
        if (p.recordedBy) set.add(p.recordedBy.trim());
      });
      (s.auditLog || []).forEach((a) => {
        if (a.userName) set.add(a.userName.trim());
      });
    });
    return Array.from(set).sort();
  }, [sales]);

  // Build audit activity timeline for the selected day
  const dailyActivities = useMemo(() => {
    const list: {
      id: string;
      timestamp: string;
      timeStr: string;
      actionType: "venda_rapida" | "venda_balcao" | "pagamento" | "entrega_material";
      actionLabel: string;
      operatorName: string;
      operatorRole: "atendente" | "administrador";
      clientName: string;
      clientPhone: string;
      itemsSummary: string;
      actionAmount: number;
      paymentMethod: string;
      saleTotal: number;
      balanceDue: number;
      isDelivered: boolean;
      discount: number;
      hasRiskAlert: boolean;
      alertDetails?: string;
      saleRef: Sale;
    }[] = [];

    sales.forEach((sale) => {
      if (sale.isBudget) return;

      const saleDay = getLocalDateFromISO(sale.date);
      const isAttendant = sale.sellerRole === "atendente";
      const opRole: "atendente" | "administrador" = sale.sellerRole || (isAttendant ? "atendente" : "administrador");
      const opName = sale.sellerName || (isAttendant ? "Atendente" : "Administrador");

      const itemsDesc = (sale.items || [])
        .map((it) => `${it.quantity}x ${it.description}`)
        .join(", ") || "Venda balcão";

      // 1. If the sale was created on this day
      if (saleDay === selectedDate) {
        const isQuick = isQuickSaleClient(sale.clientName);
        const hasRisk = sale.materialEntregue && sale.balanceDue > 0;
        let alertMsg = "";
        if (hasRisk) {
          alertMsg = `⚠️ Material entregue no balcão com saldo pendente não quitado de ${formatBRL(sale.balanceDue)}!`;
        } else if (sale.discount > 0 && opRole === "atendente") {
          alertMsg = `Desconto concedido por atendente: ${formatBRL(sale.discount)}`;
        }

        // Downpayment or full quick sale payment
        const initialMethod = sale.paymentMethod || "dinheiro";
        list.push({
          id: `${sale.id}-created`,
          timestamp: sale.date,
          timeStr: formatTime(sale.date),
          actionType: isQuick ? "venda_rapida" : "venda_balcao",
          actionLabel: isQuick ? "⚡ Venda Rápida" : "🛒 Novo Pedido",
          operatorName: opName,
          operatorRole: opRole,
          clientName: sale.clientName,
          clientPhone: sale.clientPhone,
          itemsSummary: itemsDesc,
          actionAmount: sale.downPayment,
          paymentMethod: initialMethod,
          saleTotal: sale.totalValue,
          balanceDue: sale.balanceDue,
          isDelivered: !!sale.materialEntregue,
          discount: sale.discount || 0,
          hasRiskAlert: hasRisk || (sale.discount > 0 && opRole === "atendente"),
          alertDetails: alertMsg,
          saleRef: sale
        });
      }

      // 2. Check subsequent payments recorded on this day
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach((payment, pIdx) => {
          const payDay = getLocalDateFromISO(payment.date);
          // Skip if this payment is identical to the creation downpayment already recorded
          if (payDay === selectedDate && (payDay !== saleDay || pIdx > 0)) {
            const payOpName = payment.recordedBy || opName;
            const payOpRole = payment.recordedRole || opRole;

            list.push({
              id: `${sale.id}-pay-${payment.id || pIdx}`,
              timestamp: payment.date,
              timeStr: formatTime(payment.date),
              actionType: "pagamento",
              actionLabel: "💰 Quitação / Recebimento",
              operatorName: payOpName,
              operatorRole: payOpRole,
              clientName: sale.clientName,
              clientPhone: sale.clientPhone,
              itemsSummary: `Recebimento referente a pedido: ${itemsDesc}`,
              actionAmount: payment.amount,
              paymentMethod: payment.method || "dinheiro",
              saleTotal: sale.totalValue,
              balanceDue: sale.balanceDue,
              isDelivered: !!sale.materialEntregue,
              discount: 0,
              hasRiskAlert: false,
              saleRef: sale
            });
          }
        });
      }

      // 3. Check material delivery marked on this day (if different from creation date)
      if (sale.materialEntregue && sale.deliveredAt) {
        const delivDay = getLocalDateFromISO(sale.deliveredAt);
        if (delivDay === selectedDate && delivDay !== saleDay) {
          const delivOpName = sale.deliveredBy || opName;
          const delivOpRole = sale.deliveredRole || opRole;
          const hasRisk = sale.balanceDue > 0;

          list.push({
            id: `${sale.id}-delivered`,
            timestamp: sale.deliveredAt,
            timeStr: formatTime(sale.deliveredAt),
            actionType: "entrega_material",
            actionLabel: "📦 Entrega de Material",
            operatorName: delivOpName,
            operatorRole: delivOpRole,
            clientName: sale.clientName,
            clientPhone: sale.clientPhone,
            itemsSummary: `Entrega de material efetuada: ${itemsDesc}`,
            actionAmount: 0,
            paymentMethod: "-",
            saleTotal: sale.totalValue,
            balanceDue: sale.balanceDue,
            isDelivered: true,
            discount: 0,
            hasRiskAlert: hasRisk,
            alertDetails: hasRisk ? `🚨 ALERTA: Pedido entregue com saldo pendente de ${formatBRL(sale.balanceDue)}!` : undefined,
            saleRef: sale
          });
        }
      }
    });

    // Sort descending by timestamp
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [sales, selectedDate]);

  // Filtered activities based on filters
  const filteredActivities = useMemo(() => {
    return dailyActivities.filter((act) => {
      if (selectedOperator !== "all" && act.operatorName !== selectedOperator) {
        return false;
      }
      if (selectedRole !== "all" && act.operatorRole !== selectedRole) {
        return false;
      }
      if (filterAlertOnly && !act.hasRiskAlert) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesClient = act.clientName.toLowerCase().includes(q);
        const matchesPhone = act.clientPhone.toLowerCase().includes(q);
        const matchesItems = act.itemsSummary.toLowerCase().includes(q);
        const matchesOp = act.operatorName.toLowerCase().includes(q);
        if (!matchesClient && !matchesPhone && !matchesItems && !matchesOp) return false;
      }
      return true;
    });
  }, [dailyActivities, selectedOperator, selectedRole, filterAlertOnly, searchQuery]);

  // KPI Calculations for the selected day
  const kpis = useMemo(() => {
    let totalCash = 0; // Dinheiro físico em espécie (gaveta)
    let totalPix = 0;
    let totalCard = 0;
    let totalGrossSales = 0;
    let totalDiscounts = 0;
    let deliveredCount = 0;
    let riskCount = 0;

    // Track unique sales created today to avoid double counting gross
    const countedSaleIds = new Set<string>();

    filteredActivities.forEach((act) => {
      // Payment sums
      const method = (act.paymentMethod || "").toLowerCase();
      if (method.includes("dinheiro")) {
        totalCash += act.actionAmount;
      } else if (method.includes("pix")) {
        totalPix += act.actionAmount;
      } else if (method.includes("cartão") || method.includes("cartao") || method.includes("crédito") || method.includes("débito")) {
        totalCard += act.actionAmount;
      } else {
        totalCash += act.actionAmount; // fallback
      }

      if (act.actionType === "venda_rapida" || act.actionType === "venda_balcao") {
        if (!countedSaleIds.has(act.saleRef.id)) {
          countedSaleIds.add(act.saleRef.id);
          totalGrossSales += act.saleTotal;
          totalDiscounts += act.discount;
        }
      }

      if (act.isDelivered && (act.actionType === "venda_rapida" || act.actionType === "entrega_material")) {
        deliveredCount++;
      }

      if (act.hasRiskAlert) {
        riskCount++;
      }
    });

    const totalReceived = totalCash + totalPix + totalCard;

    return {
      totalCash,
      totalPix,
      totalCard,
      totalReceived,
      totalGrossSales,
      totalDiscounts,
      deliveredCount,
      riskCount,
      operationsCount: filteredActivities.length
    };
  }, [filteredActivities]);

  // Print Daily Attendant Audit Closing Slip (Conferência de Caixa)
  const handlePrintAuditReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Por favor, permita popups no navegador para emitir a impressão do fechamento de auditoria.");
      return;
    }

    const dateFormatted = selectedDate.split("-").reverse().join("/");
    const opDisplay = selectedOperator === "all" ? "Todos os Atendentes / Operadores" : selectedOperator;

    const rowsHtml = filteredActivities
      .map(
        (act, idx) => `
        <tr style="border-bottom: 1px solid #ddd; font-size: 11px;">
          <td style="padding: 6px 4px; font-family: monospace;">${act.timeStr}</td>
          <td style="padding: 6px 4px;"><strong>${act.operatorName}</strong> (${act.operatorRole})</td>
          <td style="padding: 6px 4px;">${act.clientName}</td>
          <td style="padding: 6px 4px;">${act.actionLabel}</td>
          <td style="padding: 6px 4px; text-transform: uppercase;">${act.paymentMethod}</td>
          <td style="padding: 6px 4px; text-align: right; font-family: monospace; font-weight: bold;">${formatBRL(act.actionAmount)}</td>
          <td style="padding: 6px 4px; text-align: right; font-family: monospace;">${act.balanceDue > 0 ? formatBRL(act.balanceDue) : "Quitado"}</td>
        </tr>
      `
      )
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Auditoria Diária do Atendente - ${company.tradingName || "Sistema de Vendas"}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; padding: 10px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
            .title { font-size: 18px; font-weight: 800; text-transform: uppercase; margin: 0; }
            .subtitle { font-size: 12px; color: #555; margin-top: 4px; }
            .kpi-box { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 15px; }
            .kpi-card { flex: 1; border: 1px solid #ccc; padding: 8px; border-radius: 6px; background: #f9f9f9; text-align: center; }
            .kpi-title { font-size: 10px; text-transform: uppercase; color: #666; font-weight: bold; }
            .kpi-val { font-size: 15px; font-weight: bold; font-family: monospace; margin-top: 4px; }
            .cash-box { border: 2px solid #059669; background: #ecfdf5; }
            .cash-val { color: #047857; font-size: 18px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #eee; padding: 8px 4px; text-align: left; font-size: 10px; text-transform: uppercase; border-bottom: 2px solid #333; }
            .signatures { display: flex; justify-content: space-around; margin-top: 50px; page-break-inside: avoid; }
            .sig-line { width: 40%; text-align: center; border-top: 1px solid #000; padding-top: 6px; font-size: 11px; }
            .notice { font-size: 10px; color: #666; border-left: 3px solid #059669; padding-left: 8px; margin: 12px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">${company.tradingName || "SISTEMA DE VENDAS"}</h1>
            <div class="subtitle">RELATÓRIO DIÁRIO DE AUDITORIA & PRESTAÇÃO DE CONTAS DE ATENDENTES</div>
            <div style="font-size: 11px; margin-top: 6px;">
              <strong>Data da Auditoria:</strong> ${dateFormatted} &nbsp;|&nbsp; 
              <strong>Operador Filtrado:</strong> ${opDisplay} &nbsp;|&nbsp; 
              <strong>Gerado em:</strong> ${new Date().toLocaleString("pt-BR")}
            </div>
          </div>

          <div class="notice">
            <strong>DOCUMENTO DE CONFERÊNCIA DE CAIXA:</strong> O valor em <strong>DINHEIRO EM ESPÉCIE</strong> abaixo deve ser integralmente entregue e conferido na gaveta do caixa pelo Administrador.
          </div>

          <div class="kpi-box">
            <div class="kpi-card cash-box">
              <div class="kpi-title">💵 DINHEIRO EM GAVETA (A RECOLHER)</div>
              <div class="kpi-val cash-val">${formatBRL(kpis.totalCash)}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">📱 PIX RECEBIDO</div>
              <div class="kpi-val">${formatBRL(kpis.totalPix)}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">💳 CARTÃO (DÉBITO/CRÉD.)</div>
              <div class="kpi-val">${formatBRL(kpis.totalCard)}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">💰 TOTAL RECEBIDO NO DIA</div>
              <div class="kpi-val">${formatBRL(kpis.totalReceived)}</div>
            </div>
          </div>

          <table style="margin-top: 10px;">
            <thead>
              <tr>
                <th style="width: 65px;">Hora</th>
                <th>Operador</th>
                <th>Cliente</th>
                <th>Tipo de Ação</th>
                <th>Forma Pgto</th>
                <th style="text-align: right;">Valor Pago</th>
                <th style="text-align: right;">Saldo Pendente</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="7" style="text-align: center; padding: 20px;">Nenhuma atividade registrada nesta data.</td></tr>'}
            </tbody>
          </table>

          <div class="signatures">
            <div class="sig-line">
              <strong>Assinatura do Atendente (Conferido)</strong><br />
              <span style="font-size: 9px; color: #666;">Declaro que os valores e entregas acima conferem</span>
            </div>
            <div class="sig-line">
              <strong>Assinatura do Administrador</strong><br />
              <span style="font-size: 9px; color: #666;">Valores recebidos e conferidos na gaveta</span>
            </div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div id="attendant-audit-panel" className="space-y-6 font-sans">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex h-6 px-2.5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
                🛡️ Sistema Anti-Fraude
              </span>
              <span className="text-xs text-slate-400 font-mono">Auditoria & Prestação de Contas em Tempo Real</span>
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              Auditoria Diária de Atendentes & Vendas
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Supervisão detalhada de cada ação dos atendentes minuto a minuto. Acompanhe com precisão o dinheiro em espécie que deve estar na gaveta, confira entregas de balcão e previna desvios ou alterações indevidas.
            </p>
          </div>

          {/* Quick Date and Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintAuditReport}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              title="Imprimir folha de fechamento de caixa e conferência com assinatura"
            >
              <Printer className="h-4 w-4" />
              <span>Imprimir Fechamento do Dia</span>
            </button>
          </div>
        </div>

        {/* Date Filter Strip */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-brand-cyan" />
              Dia Auditado:
            </span>
            <button
              type="button"
              onClick={() => handleSetPreset("today")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                datePreset === "today"
                  ? "bg-brand-cyan text-slate-950 shadow-md font-black"
                  : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800"
              }`}
            >
              Hoje ({getTodayDateString().split("-").reverse().slice(0, 2).join("/")})
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset("yesterday")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                datePreset === "yesterday"
                  ? "bg-brand-cyan text-slate-950 shadow-md font-black"
                  : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800"
              }`}
            >
              Ontem
            </button>

            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Data Específica:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDate(e.target.value);
                    setDatePreset("custom");
                  }
                }}
                className="bg-transparent text-xs text-white font-mono focus:outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* Operator Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-brand-magenta" />
              Operador:
            </span>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-2.5 py-1.5 font-bold focus:outline-none focus:border-brand-cyan"
            >
              <option value="all">👥 Todos os Operadores</option>
              {uniqueOperators.map((op) => (
                <option key={op} value={op}>
                  👤 {op}
                </option>
              ))}
            </select>

            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as any)}
              className="bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-2.5 py-1.5 font-bold focus:outline-none focus:border-brand-cyan"
            >
              <option value="all">Todas as Funções</option>
              <option value="atendente">👤 Apenas Atendentes</option>
              <option value="administrador">👑 Apenas Administradores</option>
            </select>
          </div>
        </div>
      </div>

      {/* Role Notice Card: Administrador vs Atendente */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-white font-bold flex items-center gap-2">
              <span>Distinção de Papéis & Proteção Anti-Fraude Ativa</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">ATIVO</span>
            </div>
            <p className="text-slate-400 text-[11px] mt-0.5">
              O Administrador possui visualização e conferência irrestrita. As ações do Atendente são gravadas com assinatura digital, data/hora e valores para conferência física de caixa ao final do turno.
            </p>
          </div>
        </div>

        {kpis.riskCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterAlertOnly(!filterAlertOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              filterAlertOnly
                ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30 animate-pulse"
                : "bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{filterAlertOnly ? "Ver Todos os Registros" : `Filtrar ${kpis.riskCount} Alertas de Risco`}</span>
          </button>
        )}
      </div>

      {/* RECONCILIATION KPI CARDS (Prestação de Contas Diária) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* CASH GAVETA (Highlight) */}
        <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border-2 border-emerald-500/40 rounded-xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Banknote className="h-4 w-4" />
              💵 Dinheiro em Gaveta
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-black font-mono">
              CONFERIR
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono tracking-tight">
            {formatBRL(kpis.totalCash)}
          </div>
          <p className="text-[10px] text-emerald-400/90 mt-1 font-medium leading-tight">
            Cédulas e moedas recebidas pelo operador. Deve estar fisicamente na gaveta do caixa.
          </p>
        </div>

        {/* PIX */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <QrCode className="h-4 w-4" />
              📱 PIX Recebido
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Bancário</span>
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono tracking-tight">
            {formatBRL(kpis.totalPix)}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Recebido em conta via chave PIX nas vendas do operador.
          </p>
        </div>

        {/* CARDS */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-brand-magenta uppercase tracking-wider flex items-center gap-1.5">
              <CreditCard className="h-4 w-4" />
              💳 Cartões (Maquininha)
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Terminal</span>
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono tracking-tight">
            {formatBRL(kpis.totalCard)}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Débito e Crédito passados na máquina física.
          </p>
        </div>

        {/* TOTAL COLLECTED */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" />
              💰 Total Recebido Hoje
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{kpis.operationsCount} op</span>
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono tracking-tight">
            {formatBRL(kpis.totalReceived)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 font-mono">
            <span>Faturado: {formatBRL(kpis.totalGrossSales)}</span>
            {kpis.totalDiscounts > 0 && (
              <span className="text-yellow-400">Desc: -{formatBRL(kpis.totalDiscounts)}</span>
            )}
          </div>
        </div>
      </div>

      {/* DISCOUNTS & DELIVERIES BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center text-yellow-400">
              <Percent className="h-4 w-4" />
            </div>
            <div>
              <div className="font-bold text-white">Descontos Concedidos</div>
              <div className="text-[10px] text-slate-400">Pelo operador selecionado</div>
            </div>
          </div>
          <div className={`font-mono font-bold text-sm ${kpis.totalDiscounts > 0 ? "text-yellow-400" : "text-slate-400"}`}>
            {formatBRL(kpis.totalDiscounts)}
          </div>
        </div>

        <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <div className="font-bold text-white">Materiais Entregues</div>
              <div className="text-[10px] text-slate-400">Baixas realizadas no balcão</div>
            </div>
          </div>
          <div className="font-mono font-bold text-sm text-cyan-300">
            {kpis.deliveredCount} entregas
          </div>
        </div>

        <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${kpis.riskCount > 0 ? "bg-rose-500/20 text-rose-400 border border-rose-500/40" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"}`}>
              {kpis.riskCount > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            </div>
            <div>
              <div className="font-bold text-white">Inconsistências / Risco</div>
              <div className="text-[10px] text-slate-400">Pontos de atenção auditados</div>
            </div>
          </div>
          <div className={`font-mono font-bold text-sm ${kpis.riskCount > 0 ? "text-rose-400 font-black" : "text-emerald-400"}`}>
            {kpis.riskCount === 0 ? "Nenhum Risco" : `${kpis.riskCount} Alertas`}
          </div>
        </div>
      </div>

      {/* SEARCH & AUDIT LOG TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Table Controls */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/40">
          <div className="space-y-0.5">
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-cyan" />
              Linha do Tempo de Ações do Dia ({filteredActivities.length})
            </h3>
            <p className="text-xs text-slate-400">
              Registros detalhados em ordem cronológica reversa (as mais recentes no topo)
            </p>
          </div>

          <div className="w-full sm:w-72 relative">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por cliente, operador ou item..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-cyan"
            />
          </div>
        </div>

        {/* Table Content */}
        {filteredActivities.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-500 mx-auto">
              <Calendar className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-slate-300">Nenhuma atividade registrada nesta data</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Não foram encontrados lançamentos de vendas, quitações ou entregas para os filtros selecionados no dia {selectedDate.split("-").reverse().join("/")}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800 uppercase text-[10px] tracking-wider">
                  <th className="p-3.5 font-bold">Horário</th>
                  <th className="p-3.5 font-bold">Operador</th>
                  <th className="p-3.5 font-bold">Ação Realizada</th>
                  <th className="p-3.5 font-bold">Cliente / Contato</th>
                  <th className="p-3.5 font-bold">Itens / Descrição</th>
                  <th className="p-3.5 font-bold text-right">Valor Pago</th>
                  <th className="p-3.5 font-bold text-center">Forma Pgto</th>
                  <th className="p-3.5 font-bold text-right">Saldo Pendente</th>
                  <th className="p-3.5 font-bold text-center">Recibo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60 bg-slate-900/30">
                {filteredActivities.map((act) => {
                  const isAttendant = act.operatorRole === "atendente";
                  return (
                    <tr
                      key={act.id}
                      className={`hover:bg-slate-850/40 transition-colors ${
                        act.hasRiskAlert ? "bg-rose-950/15 border-l-2 border-l-rose-500" : ""
                      }`}
                    >
                      {/* Horário */}
                      <td className="p-3.5 font-mono text-slate-300 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span className="font-bold">{act.timeStr}</span>
                        </div>
                      </td>

                      {/* Operador */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isAttendant
                              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                              : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {isAttendant ? "👤 Atendente: " : "👑 Admin: "}
                          {act.operatorName}
                        </span>
                      </td>

                      {/* Ação */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-bold text-white text-xs">{act.actionLabel}</span>
                          {act.hasRiskAlert && act.alertDetails && (
                            <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1 mt-0.5 animate-pulse">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {act.alertDetails}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cliente */}
                      <td className="p-3.5">
                        <div className="font-bold text-slate-200">{act.clientName}</div>
                        {act.clientPhone && act.clientPhone !== "Não informado" && (
                          <div className="text-[10px] text-slate-400 font-mono">{act.clientPhone}</div>
                        )}
                      </td>

                      {/* Itens */}
                      <td className="p-3.5 max-w-xs">
                        <div className="text-slate-300 truncate" title={act.itemsSummary}>
                          {act.itemsSummary}
                        </div>
                        {act.discount > 0 && (
                          <span className="text-[10px] text-yellow-400 font-mono">
                            Desconto concedido: {formatBRL(act.discount)}
                          </span>
                        )}
                      </td>

                      {/* Valor Pago */}
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                        {formatBRL(act.actionAmount)}
                      </td>

                      {/* Forma de Pagamento */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-950 border border-slate-800 text-slate-300">
                          {act.paymentMethod}
                        </span>
                      </td>

                      {/* Saldo Devedor */}
                      <td className="p-3.5 text-right font-mono whitespace-nowrap">
                        {act.balanceDue > 0 ? (
                          <span className="text-yellow-400 font-bold bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded text-[10px]">
                            Falta {formatBRL(act.balanceDue)}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">Quitado</span>
                        )}
                      </td>

                      {/* Recibo */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setViewingReceiptSale(act.saleRef)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer inline-flex items-center justify-center"
                          title="Visualizar Recibo Completo"
                        >
                          <Receipt className="h-3.5 w-3.5 text-brand-cyan" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QUICK RECEIPT MODAL */}
      {viewingReceiptSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-brand-cyan" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Detalhes da Venda #{viewingReceiptSale.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingReceiptSale(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-850">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Cliente</span>
                  <div className="font-bold text-white text-sm">{viewingReceiptSale.clientName}</div>
                  <div className="text-slate-400 font-mono text-[11px]">{viewingReceiptSale.clientPhone}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Operador Responsável</span>
                  <div className="font-bold text-brand-cyan text-sm">
                    {viewingReceiptSale.sellerName || "Não identificado"}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-slate-900 text-slate-400 border border-slate-800 inline-block mt-0.5">
                    {viewingReceiptSale.sellerRole || "atendente"}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-1.5">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Itens Vendidos</span>
                {(viewingReceiptSale.items || []).map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center text-slate-300 font-mono text-[11px]">
                    <span>
                      {it.quantity}x {it.description}
                    </span>
                    <span className="font-bold text-white">{formatBRL(it.totalValue)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-1 font-mono text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Valor Total:</span>
                  <span className="text-white font-bold">{formatBRL(viewingReceiptSale.totalValue)}</span>
                </div>
                {viewingReceiptSale.discount > 0 && (
                  <div className="flex justify-between text-yellow-400">
                    <span>Desconto Concedido:</span>
                    <span>-{formatBRL(viewingReceiptSale.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Total Pago:</span>
                  <span>{formatBRL(viewingReceiptSale.downPayment)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Saldo Devedor:</span>
                  <span className={viewingReceiptSale.balanceDue > 0 ? "text-yellow-400 font-bold" : "text-slate-400"}>
                    {formatBRL(viewingReceiptSale.balanceDue)}
                  </span>
                </div>
              </div>

              {/* Delivery info */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-xs flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Status da Entrega</span>
                  <span className={viewingReceiptSale.materialEntregue ? "text-emerald-400 font-bold" : "text-yellow-400 font-bold"}>
                    {viewingReceiptSale.materialEntregue ? "✅ Entregue / Retirado" : "⏳ Pendente de Retirada"}
                  </span>
                </div>
                {viewingReceiptSale.deliveredBy && (
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Entregue Por</span>
                    <span className="text-slate-200 font-bold">{viewingReceiptSale.deliveredBy}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setViewingReceiptSale(null)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
