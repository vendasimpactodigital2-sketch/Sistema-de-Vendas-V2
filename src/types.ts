export interface DailyBusinessHours {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface BusinessHours {
  monday: DailyBusinessHours;
  tuesday: DailyBusinessHours;
  wednesday: DailyBusinessHours;
  thursday: DailyBusinessHours;
  friday: DailyBusinessHours;
  saturday: DailyBusinessHours;
  sunday: DailyBusinessHours;
}

export interface CompanyProfile {
  tradingName: string;
  phone: string;
  cep: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cnpjCpf: string;
  logo: string | null;
  pixKey?: string;
  goalsReminderEnabled?: boolean;
  goalsReminderTime?: string;
  openingTime?: string; // HH:MM format
  closingTime?: string; // HH:MM format
  autoCloseRegisterEnabled?: boolean;
  autoBackupDownloadEnabled?: boolean;
  businessHours?: BusinessHours;
  cashClosingReminderEnabled?: boolean;
  cashClosingReminderTime?: string; // HH:MM format
  cashClosingReminderMessage?: string;
}

export interface ProductSaleItem {
  id: string;
  description: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  unitCost?: number;
}

export interface CostItem {
  id: string;
  description: string;
  value: number;
}

export interface SalePayment {
  id: string;
  amount: number;
  date: string; // ISO string
  method: 'dinheiro' | 'cartão' | 'pix';
  recordedBy?: string; // nome do operador que recebeu
  recordedRole?: 'atendente' | 'administrador';
}

export interface SaleAuditEntry {
  action: 'criacao' | 'edicao' | 'venda_rapida' | 'venda_balcao' | 'pagamento' | 'entrega_material' | 'exclusao';
  timestamp: string;
  userId?: string;
  userName?: string;
  userRole?: 'atendente' | 'administrador';
  details?: string;
}

export interface DeletionAuditRecord {
  id: string;
  deletedAt: string; // ISO string
  itemType: "venda" | "orcamento" | "despesa" | "cliente" | "produto";
  itemId: string;
  itemTitle: string;
  clientName?: string;
  clientPhone?: string;
  totalValue?: number;
  paidValue?: number;
  paymentMethod?: string;
  productsSummary?: string;
  details?: string;
  deletedByUserId: string;
  deletedByName: string;
  deletedByUsername: string;
  deletedByRole: "administrador" | "atendente";
  reason?: string;
}

export interface Sale {
  id: string;
  clientName: string;
  clientPhone: string;
  items: ProductSaleItem[];
  useMotoboy: boolean;
  motoboyCost: number;
  discount: number;
  downPayment: number; // "sinal"
  operationCost: number; // "gasto dessa venda"
  costItems?: CostItem[]; // detalhamento de gastos mais preciso
  totalValue: number; // final total calculated automatically
  balanceDue: number; // remaining value to be paid (totalValue - downPayment)
  netProfit: number; // totalValue - operationCost
  clientImage: string | null; // base64 representation of pasted/uploaded image
  date: string;
  isBudget?: boolean;
  paymentMethod?: 'dinheiro' | 'cartão' | 'pix';
  orderDate?: string; // data do pedido
  deliveryDate?: string; // data de entrega
  deliveryReason?: string; // motivo de reagendamento / observação da entrega
  payments?: SalePayment[]; // precise payment history logs for cash flow
  materialEntregue?: boolean; // indica se o material já foi entregue/retirado pelo cliente
  sellerId?: string; // ID de quem efetuou o lançamento
  sellerName?: string; // Nome do operador (atendente ou admin)
  sellerRole?: 'atendente' | 'administrador'; // Papel de quem vendeu
  deliveredBy?: string; // Nome de quem entregou o material
  deliveredAt?: string; // Data/hora da entrega
  deliveredRole?: 'atendente' | 'administrador'; // Papel de quem entregou
  auditLog?: SaleAuditEntry[]; // Histórico detalhado de ações e alterações
}

export interface DashboardStats {
  totalSalesValue: number;
  totalRevenuePaid: number;
  totalPending: number;
  totalDiscount: number;
  totalMotoboy: number;
  totalOperationCost: number;
  totalNetProfit: number;
}

export interface Expense {
  id: string;
  description: string;
  value: number;
  date: string; // ISO string or YYYY-MM-DD
  category: string;
  comprovanteUrl?: string;
  receiptImage?: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  email?: string;
  password?: string;
  owner_id?: string;
  role?: "motoboy" | "atendente" | "administrador" | string;
  created_at?: string;
  data_expiracao?: string;
  status_assinatura?: string;
  status?: string;
  is_admin?: boolean;
}

export interface CatalogProduct {
  id: string;
  description: string;
  costPrice: number;
  salePrice: number;
  profit: number; // salePrice - costPrice
  minStock: number;
  currentStock: number;
  status?: string;
  is_draft?: boolean;
}

export const getSaleOrderDate = (sale: Sale): string => {
  if (sale.orderDate) return sale.orderDate;
  if (sale.payments && sale.payments.length > 0) {
    return sale.payments[0].date;
  }
  return sale.date;
};

export const getSaleOperationCost = (sale: Sale): number => {
  if (sale.isBudget) return 0;
  if (sale.costItems && sale.costItems.length > 0) {
    return sale.costItems.reduce((sum, item) => sum + item.value, 0);
  }
  return sale.operationCost || 0;
};

export interface CustomReminder {
  id: string;
  title: string;
  type: "date" | "weekly";
  date?: string; // YYYY-MM-DD
  dayOfWeek?: number; // 0-6
  time: string; // HH:MM
  isAllDay?: boolean;
  completed?: boolean;
  notified?: boolean;
}

export interface CashRegisterSession {
  id: string;
  status: "aberto" | "fechado";
  valorAbertura: number;
  valorFechamentoEsperado?: number;
  valorFechamentoReal?: number;
  dataAbertura: string;
  dataFechamento?: string;
  operador: string;
  observacoes?: string;
  historicoVendas?: any[];
}

export interface CashRegisterState {
  currentSession: CashRegisterSession | null;
  history: CashRegisterSession[];
}

export interface SupportFeedback {
  id: string;
  user_id: string;
  user_name: string;
  audio_url: string;
  message?: string;
  resposta_admin?: string;
  respondido_em?: string;
  created_at: string;
}

export interface SupportConfig {
  id: string;
  horario_inicio: string;
  horario_fim: string;
  mensagem_fechado: string;
}

export function isQuickSaleClient(clientName?: string): boolean {
  if (!clientName) return true;
  const name = clientName.trim().toLowerCase();
  return (
    name === "" ||
    name === "venda rápida" ||
    name === "venda rapida" ||
    name === "balcão" ||
    name === "balcao" ||
    name === "consumidor" ||
    name === "cliente não identificado" ||
    name === "cliente nao identificado"
  );
}

export function isPendingRetiradaOrBaixa(sale: Sale): boolean {
  if (!sale || sale.isBudget) return false;
  if (isQuickSaleClient(sale.clientName)) return false;

  const balanceDue = sale.balanceDue || 0;

  // 1. If balance is due (> 0), it MUST be in Retiradas to receive payment ("dar baixa")
  if (balanceDue > 0.001) {
    return true;
  }

  // 2. If balanceDue <= 0.001 (fully paid / ND A RECEBER):
  // If explicitly marked as delivered, it is done and removed from Retiradas
  if (sale.materialEntregue) {
    return false;
  }

  // Check order/delivery date vs today (local date comparison)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const orderDateStr = sale.orderDate || (sale.date ? sale.date.substring(0, 10) : "");
  const deliveryDateStr = sale.deliveryDate || orderDateStr;

  // Fully paid sales created today or with delivery date >= today are pending delivery
  return (deliveryDateStr >= todayStr || orderDateStr >= todayStr);
}




