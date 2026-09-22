import React from "react";
import { 
  Printer, 
  Share2, 
  User, 
  Phone, 
  MapPin, 
  Clock, 
  FileText, 
  Calendar, 
  TrendingUp, 
  DollarSign, 
  CheckCircle, 
  AlertTriangle 
} from "lucide-react";

export interface PerfilEmpresa {
  nome_fantasia: string;
  logo_url?: string | null;
  telefone?: string;
  endereco?: string;
  horario_funcionamento?: string;
}

export interface ItemVenda {
  id: string;
  description: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
}

export interface SaleData {
  id: string;
  date: string;
  clientName: string;
  clientPhone?: string;
  clientAddress?: string;
  items: ItemVenda[];
  totalValue: number;
  discount?: number;
  downPayment: number;
  balanceDue: number;
  isBudget?: boolean;
}

interface SalesReceiptProps {
  perfilEmpresa: PerfilEmpresa;
  sale: SaleData;
  onClose?: () => void;
  onPrint?: () => void;
  onShareWhatsApp?: () => void;
}

// Robust helper to format any ID to a stable 5-digit sequential number
const formatReceiptNumber = (id: string): string => {
  if (!id) return "#00001";
  const numericOnly = id.replace(/\D/g, "");
  if (numericOnly.length > 0) {
    const lastDigits = numericOnly.slice(-5);
    return `#${lastDigits.padStart(5, "0")}`;
  }
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const positiveHash = Math.abs(hash) % 100000;
  return `#${String(positiveHash).padStart(5, "0")}`;
};

const formatDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateStr;
  }
};

export const formatCurrency = (val: number): string => {
  return val.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
};

export const SalesReceipt: React.FC<SalesReceiptProps> = ({
  perfilEmpresa,
  sale,
  onClose,
  onPrint,
  onShareWhatsApp
}) => {
  const receiptNumber = formatReceiptNumber(sale.id);
  const isPaidFull = sale.balanceDue <= 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col font-sans text-slate-300">
      {/* Action Bar Header */}
      <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex justify-between items-center">
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">
          Visualização do Recibo
        </span>
        <div className="flex items-center gap-2">
          {onShareWhatsApp && (
            <button
              onClick={onShareWhatsApp}
              className="p-1.5 hover:bg-slate-850 text-emerald-400 hover:text-emerald-300 rounded-lg transition-all cursor-pointer"
              title="Compartilhar via WhatsApp"
            >
              <Share2 className="h-4 w-4" />
            </button>
          )}
          {/* Botão A4/PDF */}
          <button
            onClick={() => { document.body.classList.add("print-a4"); window.print(); document.body.classList.remove("print-a4"); }}
            className="p-1.5 hover:bg-slate-850 text-cyan-400 hover:text-cyan-300 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
            title="Imprimir A4 / PDF"
          >
            <Printer className="h-4 w-4" />
            <span>A4/PDF</span>
          </button>

          {/* Botão Térmica */}
          <button
            onClick={() => { document.body.classList.add("print-cupom"); window.print(); document.body.classList.remove("print-cupom"); }}
            className="p-1.5 hover:bg-slate-850 text-amber-400 hover:text-amber-300 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
            title="Imprimir Térmica"
          >
            <Printer className="h-4 w-4" />
            <span>Térmica</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-all font-bold uppercase tracking-wider cursor-pointer"
            >
              Fechar
            </button>
          )}
        </div>
      </div>

      {/* Printable Area Wrapper */}
      <div id={`receipt-print-${sale.id}`} className="p-6 bg-white text-slate-900 overflow-y-auto max-h-[75vh]">
        
        {/* Dynamic Header */}
        <div className="flex flex-col items-center text-center pb-5 border-b border-dashed border-slate-300">
          {perfilEmpresa.logo_url ? (
            <img 
              src={perfilEmpresa.logo_url} 
              alt={perfilEmpresa.nome_fantasia} 
              className="h-16 w-auto object-contain mb-3 rounded-md max-w-[150px]"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-14 w-14 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 mb-3 border border-slate-200 shadow-sm font-black text-xl">
              {perfilEmpresa.nome_fantasia ? perfilEmpresa.nome_fantasia.charAt(0).toUpperCase() : "G"}
            </div>
          )}

          <h2 className="text-base font-black text-slate-950 uppercase tracking-wide">
            {perfilEmpresa.nome_fantasia || "Gráfica & Designer"}
          </h2>

          <div className="mt-2 text-[11px] text-slate-500 space-y-0.5 max-w-xs font-medium">
            {perfilEmpresa.endereco && (
              <p className="flex items-center justify-center gap-1">
                <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                <span>{perfilEmpresa.endereco}</span>
              </p>
            )}
            {perfilEmpresa.telefone && (
              <p className="flex items-center justify-center gap-1">
                <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                <span>{perfilEmpresa.telefone}</span>
              </p>
            )}
            {perfilEmpresa.horario_funcionamento && (
              <p className="flex items-center justify-center gap-1">
                <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                <span>{perfilEmpresa.horario_funcionamento}</span>
              </p>
            )}
          </div>
        </div>

        {/* Receipt Sub-Header Info */}
        <div className="py-4 border-b border-dashed border-slate-300 flex justify-between items-center text-xs">
          <div>
            <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Documento</p>
            <p className="text-slate-900 font-black text-sm uppercase">
              {sale.isBudget ? "Orçamento" : "Recibo de Venda"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Recibo Nº</p>
            <p className="text-indigo-600 font-black text-base font-mono">{receiptNumber}</p>
          </div>
        </div>

        {/* Cliente Details */}
        <div className="py-4 border-b border-slate-200 space-y-2 text-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Dados do Cliente</span>
          
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-900 font-bold">
              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>{sale.clientName}</span>
            </div>
            
            {sale.clientPhone && (
              <div className="flex items-center gap-1.5 text-slate-600 font-mono">
                <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>{sale.clientPhone}</span>
              </div>
            )}

            {sale.clientAddress && (
              <div className="flex items-start gap-1.5 text-slate-600">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{sale.clientAddress}</span>
              </div>
            )}
          </div>
        </div>

        {/* Items Table */}
        <div className="py-4 space-y-2.5">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Itens / Serviços Registrados</span>
          
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <th className="p-2.5">Descrição</th>
                  <th className="p-2.5 text-center w-12">Qtd</th>
                  <th className="p-2.5 text-right w-24">V. Unit</th>
                  <th className="p-2.5 text-right w-24">V. Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {sale.items && sale.items.length > 0 ? (
                  sale.items.map((item, index) => (
                    <tr key={item.id || index} className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-medium text-slate-900 truncate max-w-[160px]" title={item.description}>
                        {item.description}
                      </td>
                      <td className="p-2.5 text-center font-mono">{item.quantity}</td>
                      <td className="p-2.5 text-right font-mono text-slate-600">
                        {formatCurrency(item.unitValue)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(item.totalValue || (item.unitValue * item.quantity))}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400 italic">
                      Nenhum item adicionado a este documento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Breakdown */}
        <div className="py-4 border-t border-slate-200 flex flex-col items-end">
          <div className="w-full max-w-sm flex flex-col gap-1.5 ml-auto">
            {/* LINHA 1 - SUBTOTAL */}
            <div className="flex justify-between items-center px-3 py-2 text-sm rounded-sm font-semibold border border-gray-200 bg-white text-gray-700">
              <span>Subtotal:</span>
              <span className="font-mono">{formatCurrency(sale.totalValue + (sale.discount || 0))}</span>
            </div>

            {/* LINHA 2 - VALOR TOTAL COBRADO */}
            <div className="flex justify-between items-center px-3 py-2 text-sm rounded-sm font-semibold border border-blue-500 bg-blue-50/50 text-blue-900">
              <span className="uppercase font-bold">VALOR TOTAL COBRADO:</span>
              <span className="font-mono font-bold text-base">{formatCurrency(sale.totalValue)}</span>
            </div>

            {/* LINHA 3 - SINAL PAGO */}
            <div className="flex justify-between items-center px-3 py-2 text-sm rounded-sm font-semibold border border-emerald-500 bg-emerald-50/50 text-emerald-900">
              <span className="font-bold">Sinal Pago:</span>
              <span className="font-mono font-bold text-base">{formatCurrency(sale.downPayment)}</span>
            </div>

            {/* LINHA 4 - SALDO PENDENTE */}
            <div className="flex justify-between items-center px-3 py-2 text-sm rounded-sm font-semibold border border-amber-500 bg-amber-50/50 text-amber-900">
              <span className="font-bold">Saldo Pendente:</span>
              <span className="font-mono font-bold text-base">{formatCurrency(sale.balanceDue)}</span>
            </div>
          </div>
        </div>

        {/* Date & Signature lines */}
        <div className="mt-8 pt-8 border-t border-dashed border-slate-300 grid grid-cols-2 gap-6 text-center text-[10px]">
          <div>
            <div className="h-0.5 bg-slate-300 w-full mb-1.5" />
            <p className="text-slate-500 font-semibold uppercase tracking-wider">Assinatura do Cliente</p>
          </div>
          <div>
            <div className="h-0.5 bg-slate-300 w-full mb-1.5" />
            <p className="text-slate-500 font-semibold uppercase tracking-wider">Assinatura do Emissor</p>
          </div>
        </div>

        {/* Bottom Metadata Footnote */}
        <div className="mt-8 text-center text-[9px] text-slate-400 font-mono">
          <p>Gerado em {formatDate(sale.date || new Date().toISOString())}</p>
          <p className="mt-0.5 uppercase tracking-widest text-[8px] text-slate-300">
            Powered by SaaS Núcleo
          </p>
        </div>

      </div>
    </div>
  );
};
