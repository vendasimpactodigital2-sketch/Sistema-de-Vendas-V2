import React, { useState, useEffect } from "react";
import { 
  User, Plus, Search, Trash2, Edit, Phone, Mail, 
  MapPin, Check, X, Shield, RefreshCw, Briefcase, FileText,
  Calendar, DollarSign, ShoppingBag, TrendingUp, Wallet, AlertCircle, ShoppingCart,
  Printer, FileDown, CheckCircle2, Clock, AlertTriangle, Share2, Clipboard, Edit2
} from "lucide-react";
import { dbGetClientes, dbSaveCliente, dbDeleteCliente } from "../supabase";
import { jsPDF } from "jspdf";

interface Cliente {
  id: string;
  user_id?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  updated_at?: string;
}

interface ClientesManagerProps {
  addToast: (msg: string, type?: "success" | "info" | "warning" | "error") => void;
  currentUser: any;
  sales?: any[];
  onNewOrderWithClient?: (clientName: string, clientPhone: string) => void;
  onEditSale?: (sale: any) => void;
  onSaveSale?: (sale: any) => void;
  company?: any;
  adminUnlocked?: boolean;
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
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return clean.substring(0, 10);
  }
};

export const ClientesManager: React.FC<ClientesManagerProps> = ({ 
  addToast, 
  currentUser,
  sales = [],
  onNewOrderWithClient,
  onEditSale,
  onSaveSale,
  company,
  adminUnlocked
}) => {
  const isAttendant = Boolean(
    currentUser && (
      currentUser.role === "atendente" ||
      currentUser.role === "seller" ||
      (currentUser.owner_id && currentUser.owner_id !== currentUser.id && currentUser.role !== "administrador" && !currentUser.is_admin)
    )
  );

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  
  // Form states
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [startSaleAfterCreate, setStartSaleAfterCreate] = useState<boolean>(false);

  // "Dar Baixa" inline state per sale
  const [baixaSaleId, setBaixaSaleId] = useState<string | null>(null);
  const [baixaAmount, setBaixaAmount] = useState<string>("");
  const [baixaMethod, setBaixaMethod] = useState<'dinheiro' | 'cartão' | 'pix'>("pix");
  const [baixaDeliverToday, setBaixaDeliverToday] = useState<boolean>(true);

  // Delivery Rescheduling inline state per sale
  const [rescheduleSaleId, setRescheduleSaleId] = useState<string | null>(null);
  const [newDeliveryDate, setNewDeliveryDate] = useState<string>("");
  const [newDeliveryReason, setNewDeliveryReason] = useState<string>("");

  const fetchClientes = async () => {
    setLoading(true);
    try {
      const data = await dbGetClientes();
      if (data) {
        setClientes(data);
      } else {
        setClientes([]);
      }
    } catch (err) {
      console.error("Error loading clients:", err);
      addToast("Erro ao carregar clientes do servidor.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchClientes();
    }
  }, [currentUser]);

  const handleClearForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");
  };

  const handleEditClick = (cliente: Cliente) => {
    setIsEditing(true);
    setEditingId(cliente.id);
    setName(cliente.name);
    setPhone(cliente.phone || "");
    setEmail(cliente.email || "");
    setAddress(cliente.address || "");
    setNotes(cliente.notes || "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast("O nome do cliente é obrigatório.", "warning");
      return;
    }

    const payload: any = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      notes: notes.trim()
    };

    if (isEditing && editingId && !editingId.startsWith("virtual_")) {
      payload.id = editingId;
    } else {
      payload.id = "cli_" + Math.random().toString(36).substring(2, 9);
    }

    try {
      const success = await dbSaveCliente(payload);
      if (success) {
        addToast(
          (isEditing && !editingId?.startsWith("virtual_")) ? "Cliente atualizado com sucesso!" : "Cliente cadastrado permanentemente!", 
          "success"
        );
        handleClearForm();
        await fetchClientes();
        // Update selectedCliente details if currently open
        if (selectedCliente && selectedCliente.id === payload.id) {
          setSelectedCliente(payload);
        }

        // Trigger new sale with this client if requested
        if (startSaleAfterCreate && onNewOrderWithClient) {
          onNewOrderWithClient(payload.name, payload.phone || "");
          setStartSaleAfterCreate(false);
        }
      } else {
        addToast("Falha ao salvar cliente. Verifique sua conexão.", "error");
      }
    } catch (err) {
      console.error("Error saving client:", err);
      addToast("Erro ao salvar o cliente.", "error");
    }
  };

  const handleDeleteClick = async (id: string, clienteName: string) => {
    if (isAttendant && !adminUnlocked) {
      addToast("Apenas o Administrador pode excluir clientes do sistema.", "warning");
      return;
    }

    if (id.startsWith("virtual_")) {
      addToast(`O cliente "${clienteName}" é temporário e gerado a partir de vendas existentes. Para excluí-lo, remova suas vendas no Histórico de Vendas.`, "warning");
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o cliente "${clienteName}"? Esta operação é irreversível.`)) {
      return;
    }

    try {
      const success = await dbDeleteCliente(id);
      if (success) {
        addToast("Cliente excluído com sucesso!", "success");
        await fetchClientes();
        if (editingId === id) {
          handleClearForm();
        }
        if (selectedCliente?.id === id) {
          setSelectedCliente(null);
        }
      } else {
        addToast("Falha ao excluir o cliente do servidor.", "error");
      }
    } catch (err) {
      console.error("Error deleting client:", err);
      addToast("Erro ao excluir o cliente.", "error");
    }
  };

  // 1. Compile all registered clients and all clients found in sales
  const allUnifiedClientes = React.useMemo(() => {
    const unified: (Cliente & {
      isVirtual?: boolean;
      hasPendingDebts?: boolean;
      isPlacingOrder?: boolean;
      totalSalesCount?: number;
    })[] = [];

    const seen = new Map<string, number>();

    // Add all officially registered clients
    clientes.forEach((c) => {
      const nameKey = c.name.toLowerCase().trim();
      seen.set(nameKey, unified.length);
      unified.push({
        ...c,
        isVirtual: false,
        hasPendingDebts: false,
        isPlacingOrder: false,
        totalSalesCount: 0,
      });
    });

    // Add/Update using sales list
    sales.forEach((s) => {
      if (!s.clientName) return;
      const cleanName = s.clientName.trim();
      const cleanPhone = (s.clientPhone || "").trim();
      const nameKey = cleanName.toLowerCase();

      // Check if they have pending debts (balanceDue > 0)
      const hasDebt = s.balanceDue > 0 && !s.isBudget;
      // Check if they are currently making a request or active order
      const isPlacing = !!s.isBudget || (s.deliveryDate && !s.isBudget);

      if (seen.has(nameKey)) {
        const index = seen.get(nameKey)!;
        const existing = unified[index];
        if (hasDebt) existing.hasPendingDebts = true;
        if (isPlacing) existing.isPlacingOrder = true;
        existing.totalSalesCount = (existing.totalSalesCount || 0) + 1;
        if (!existing.phone && cleanPhone) {
          existing.phone = cleanPhone;
        }
        if (!existing.address && s.deliveryAddress) {
          existing.address = s.deliveryAddress;
        }
      } else {
        seen.set(nameKey, unified.length);
        unified.push({
          id: `virtual_${s.id || Math.random().toString(36).substring(2, 9)}`,
          name: cleanName,
          phone: cleanPhone,
          address: s.deliveryAddress || "",
          notes: "Cadastrado temporariamente via fluxo de venda",
          isVirtual: true,
          hasPendingDebts: hasDebt,
          isPlacingOrder: isPlacing,
          totalSalesCount: 1,
        });
      }
    });

    return unified;
  }, [clientes, sales]);

  // Real-time filtering (local search) over unified list
  const filteredClientes = React.useMemo(() => {
    return allUnifiedClientes.filter(c => {
      const term = searchTerm.toLowerCase().trim();
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        (c.phone && c.phone.toLowerCase().includes(term)) ||
        (c.email && c.email.toLowerCase().includes(term)) ||
        (c.address && c.address.toLowerCase().includes(term)) ||
        (c.hasPendingDebts && ("devedor".includes(term) || "baixa".includes(term) || "pendente".includes(term))) ||
        (c.isPlacingOrder && ("pedido".includes(term) || "fazendo".includes(term) || "orçamento".includes(term))) ||
        (c.isVirtual && "não cadastrado".includes(term))
      );
    });
  }, [allUnifiedClientes, searchTerm]);

  // Calculate matching sales/budgets for a client
  const getClientSales = (cliente: Cliente) => {
    if (!sales) return [];
    return sales.filter(s => {
      const sName = (s.clientName || "").toLowerCase().trim();
      const cName = (cliente.name || "").toLowerCase().trim();
      
      const sPhone = (s.clientPhone || "").replace(/\D/g, "");
      const cPhone = (cliente.phone || "").replace(/\D/g, "");
      
      const nameMatches = sName && cName && sName === cName;
      const phoneMatches = sPhone && cPhone && sPhone === cPhone;
      
      return nameMatches || phoneMatches;
    });
  };

  // Get all unique service descriptions performed for a client
  const getClientServices = (cliente: Cliente) => {
    if (!sales) return [];
    const clientSales = getClientSales(cliente);
    const servicesSet = new Set<string>();
    clientSales.forEach(s => {
      if (s.items) {
        s.items.forEach((item: any) => {
          if (item.description) {
            servicesSet.add(item.description.trim());
          }
        });
      }
    });
    return Array.from(servicesSet);
  };

  // Helper to format date
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    } catch (e) {
      return dateStr;
    }
  };

  // Calculations for current selected client
  const clientSales = selectedCliente ? getClientSales(selectedCliente) : [];
  const totalOrders = clientSales.length;
  const totalSpent = clientSales
    .filter(s => !s.isBudget)
    .reduce((sum, s) => sum + (s.totalValue || 0), 0);
  const totalPending = clientSales
    .filter(s => !s.isBudget)
    .reduce((sum, s) => sum + (s.balanceDue || 0), 0);

  // Dar Baixa handler
  const handleExecuteBaixa = (sale: any) => {
    if (!onSaveSale) {
      addToast("Erro crítico: Função de salvamento não está disponível.", "error");
      return;
    }

    const amountPaidNow = parseFloat(baixaAmount) || 0;
    if (amountPaidNow < 0) {
      addToast("O valor do pagamento não pode ser negativo.", "warning");
      return;
    }

    if (amountPaidNow > sale.balanceDue) {
      if (!confirm(`O valor pago (R$ ${amountPaidNow}) é maior que o saldo devedor (R$ ${sale.balanceDue}). Confirmar mesmo assim?`)) {
        return;
      }
    }

    const updatedDownPayment = sale.downPayment + amountPaidNow;
    const updatedBalanceDue = Math.max(0, sale.totalValue - updatedDownPayment);
    const updatedNetProfit = sale.totalValue - (sale.operationCost || 0);

    const currentPayments = sale.payments && sale.payments.length > 0 
      ? sale.payments 
      : (sale.downPayment > 0 
          ? [{
              id: Math.random().toString(36).substring(2, 9).toUpperCase(),
              amount: sale.downPayment,
              date: sale.date,
              method: sale.paymentMethod || 'dinheiro' as const
            }]
          : []
        );

    const updatedPayments = [...currentPayments];
    if (amountPaidNow > 0) {
      updatedPayments.push({
        id: Math.random().toString(36).substring(2, 9).toUpperCase(),
        amount: amountPaidNow,
        date: new Date().toISOString(),
        method: baixaMethod
      });
    }

    const originalOrderDate = sale.orderDate || (sale.date ? getLocalDateFromISO(sale.date) : getLocalDateFromISO(new Date().toISOString()));

    const updatedSale: any = {
      ...sale,
      downPayment: updatedDownPayment,
      balanceDue: updatedBalanceDue,
      netProfit: updatedNetProfit,
      orderDate: originalOrderDate,
      payments: updatedPayments,
    };

    if (baixaDeliverToday) {
      updatedSale.deliveryDate = new Date().toISOString().substring(0, 10);
      updatedSale.materialEntregue = true;
    }

    try {
      onSaveSale(updatedSale);
      addToast(
        amountPaidNow > 0 
          ? `Baixa registrada com sucesso! Recebido R$ ${amountPaidNow.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.` 
          : "Entrega registrada com sucesso!", 
        "success"
      );
      setBaixaSaleId(null);
      setBaixaAmount("");
    } catch (err) {
      console.error("Error executing baixa:", err);
      addToast("Erro ao registrar a baixa do pedido.", "error");
    }
  };

  // Reschedule delivery handler
  const handleSaveReschedule = (sale: any) => {
    if (!onSaveSale) {
      addToast("Erro crítico: Função de salvamento não está disponível.", "error");
      return;
    }
    if (!newDeliveryDate) {
      addToast("Por favor, selecione uma data de entrega válida.", "warning");
      return;
    }

    const updatedSale = {
      ...sale,
      deliveryDate: newDeliveryDate,
      deliveryReason: newDeliveryReason.trim() || undefined
    };

    try {
      onSaveSale(updatedSale);
      addToast(`Entrega atualizada para ${newDeliveryDate.split("-").reverse().join("/")}! 🚚`, "success");
      setRescheduleSaleId(null);
      setNewDeliveryDate("");
      setNewDeliveryReason("");
    } catch (err) {
      console.error("Error rescheduling:", err);
      addToast("Erro ao reagendar entrega.", "error");
    }
  };

  // Receipt PDF Download handler
  const handleDownloadPDF = (sale: any) => {
    const doc = new jsPDF();
    const formattedDate = formatDate(sale.date);

    const formatCurrency = (val: number) => {
      return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const docId = sale.id;
    const formattedDocId = (() => {
      const rawId = docId || "";
      const digits = rawId.replace(/\D/g, "");
      if (digits) {
        return digits.padStart(5, "0");
      }
      return String(rawId).padStart(5, "0");
    })();
    const subtotal = sale.items ? sale.items.reduce((acc: number, current: any) => acc + (current.totalValue || 0), 0) : 0;

    const drawReceiptCopy = (yOffset: number, label: "VIA DO CLIENTE" | "VIA DA EMPRESA") => {
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, yOffset, 210, 32, "F");

      let startTextX = 15;
      if (company?.logo) {
        try {
          let format = "JPEG";
          if (company.logo.includes("image/png")) format = "PNG";
          else if (company.logo.includes("image/webp")) format = "WEBP";
          doc.addImage(company.logo, format, 15, yOffset + 5, 22, 22, undefined, "FAST");
          startTextX = 42;
        } catch (e) {
          console.error("Erro ao incluir logotipo no PDF:", e);
        }
      }

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text((company?.tradingName || "SISTEMA NÚCLEO").toUpperCase(), startTextX, yOffset + 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(190, 201, 214);
      
      let lineY = yOffset + 15;
      if (company?.cnpjCpf) {
        doc.text(`CNPJ/CPF: ${company.cnpjCpf}`, startTextX, lineY);
        lineY += 3.5;
      }
      
      doc.text(`Fone/Contato: ${company?.phone || "Não informado"}`, startTextX, lineY);
      lineY += 3.5;
      
      const formattedAddress = [
        company?.address, 
        company?.number ? `${company.number}` : "", 
        company?.neighborhood ? `${company.neighborhood}` : "",
        company?.city ? `${company.city}` : "",
        company?.cep ? `CEP ${company.cep}` : ""
      ].filter(Boolean).join(" - ");
      
      if (formattedAddress.trim()) {
        const truncatedAddress = formattedAddress.length > 60 ? formattedAddress.substring(0, 57) + "..." : formattedAddress;
        doc.text(truncatedAddress, startTextX, lineY);
        lineY += 3.5;
      }

      const openingTime = company?.openingTime || "08:00";
      const closingTime = company?.closingTime || "18:00";
      doc.text(`Horário de Funcionamento: ${openingTime} às ${closingTime}`, startTextX, lineY);

      doc.setFontSize(9);
      doc.setTextColor(0, 182, 255);
      doc.setFont("helvetica", "bold");
      doc.text("RECIBO DE VENDA", 145, yOffset + 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(200, 200, 200);
      doc.text(`Data: ${formattedDate}`, 145, yOffset + 15.5);
      doc.text(`Documento: #${formattedDocId}`, 145, yOffset + 19.5);
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.setFillColor(255, 20, 147);
      doc.rect(145, yOffset + 22, 50, 4.5, "F");
      doc.text(label, 147, yOffset + 25.5);

      doc.setDrawColor(0, 182, 255);
      doc.setLineWidth(1);
      doc.line(0, yOffset + 32, 210, yOffset + 32);

      doc.setFillColor(248, 250, 252);
      doc.rect(10, yOffset + 36, 190, 9, "F");
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.rect(10, yOffset + 36, 190, 9, "D");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`CLIENTE: ${sale.clientName.toUpperCase()}`, 13, yOffset + 41.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`CONTATO: ${sale.clientPhone || "Não Informado"}`, 120, yOffset + 41.5);

      doc.setFillColor(15, 23, 42);
      doc.rect(10, yOffset + 49, 190, 6, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text("DESCRIÇÃO DO ITEM / SERVIÇO", 13, yOffset + 53);
      doc.text("QTD", 115, yOffset + 53);
      doc.text("V. UNITÁRIO", 138, yOffset + 53);
      doc.text("V. TOTAL", 170, yOffset + 53);

      let itemY = yOffset + 58;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(50, 50, 50);

      if (sale.items && sale.items.length > 0) {
        sale.items.forEach((item: any) => {
          doc.text(String(item.description || "Item Sem Descrição").toUpperCase(), 13, itemY);
          doc.text(String(item.quantity || 1), 115, itemY);
          doc.text(formatCurrency(item.unitValue || 0), 138, itemY);
          doc.text(formatCurrency(item.totalValue || 0), 170, itemY);
          itemY += 4.5;
        });
      }

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(10, itemY + 1, 200, itemY + 1);
      itemY += 5;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text("CONDIÇÕES FINANCEIRAS DESTA COMPRA", 10, itemY);
      itemY += 4.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Subtotal Geral dos Itens: ${formatCurrency(subtotal)}`, 10, itemY);
      doc.text(`Desconto Aplicado: -${formatCurrency(sale.discount || 0)}`, 100, itemY);
      itemY += 4;
      doc.text(`Sinal/Pago: ${formatCurrency(sale.downPayment || 0)}`, 10, itemY);
      
      doc.setFont("helvetica", "bold");
      if (sale.balanceDue > 0) {
        doc.setTextColor(220, 38, 38);
        doc.text(`A RECEBER / SALDO DEVEDOR: ${formatCurrency(sale.balanceDue)}`, 100, itemY);
      } else {
        doc.setTextColor(22, 163, 74);
        doc.text("PAGO INTEGRAL / RETIRADA LIBERADA", 100, itemY);
      }
      
      itemY += 4.5;
      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "normal");
      if (sale.deliveryDate) {
        const dStr = sale.deliveryDate.split("T")[0].split("-").reverse().join("/");
        doc.text(`Previsão / Retirado em: ${dStr}`, 10, itemY);
      } else {
        doc.text("Previsão / Retirado em: RETIRADA PENDENTE", 10, itemY);
      }
      
      itemY += 6;
      doc.setFillColor(241, 245, 249);
      doc.rect(10, itemY, 190, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`TOTAL FINAL DO DOCUMENTO: ${formatCurrency(sale.totalValue || 0)}`, 13, itemY + 5);

      if (sale.isBudget) {
        doc.setFontSize(7.5);
        doc.setTextColor(220, 100, 0);
        doc.text("ESTE DOCUMENTO É APENAS UM ORÇAMENTO", 120, itemY + 5);
      }

      itemY += 15;
      doc.setDrawColor(180, 180, 180);
      doc.line(15, itemY, 95, itemY);
      doc.line(115, itemY, 195, itemY);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 100, 100);
      doc.text("ASSINATURA DO EMISSOR", 40, itemY + 3.5);
      doc.text("ASSINATURA DO CLIENTE / RETIRADA", 140, itemY + 3.5);
    };

    drawReceiptCopy(5, "VIA DO CLIENTE");
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.5);
    doc.line(0, 148, 210, 148);
    drawReceiptCopy(152, "VIA DA EMPRESA");

    const docName = `Recibo_${sale.clientName.replace(/\s+/g, "_")}_${sale.id}.pdf`;
    doc.save(docName);
    addToast("PDF do recibo gerado e baixado!", "success");
  };

  // Whatsapp receipt sharing handler
  const handleShareWhatsApp = (sale: any) => {
    const companyName = company?.tradingName || "Sistema de Vendas";
    const formattedTotal = `R$ ${sale.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    const balanceMessage = sale.balanceDue > 0 
      ? `\n⚠️ *Saldo Devedor:* R$ ${sale.balanceDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      : `\n✅ *Status:* Totalmente Pago!`;

    const messageText = `Olá, *${sale.clientName}*!\n\nSegue o resumo de sua compra na *${companyName}*:\n\n📄 *Recibo:* #${sale.id}\n💰 *Valor Total:* ${formattedTotal}\n📥 *Sinal/Pago:* R$ ${sale.downPayment.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${balanceMessage}\n\nSeu recibo digital em PDF foi registrado no sistema! Agradecemos a preferência.\n\nAtenciosamente,\n*${companyName}*`;
    
    let cleanPhone = (sale.clientPhone || "").replace(/\D/g, "");
    if (cleanPhone.length > 0 && !cleanPhone.startsWith("55") && cleanPhone.length <= 11) {
      cleanPhone = "55" + cleanPhone;
    }
    
    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(messageText)}`;
    window.open(url, "_blank");
    addToast("Redirecionando para o WhatsApp do cliente...", "info");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-in font-sans">
      {/* 1. Add/Edit Form Column */}
      <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden h-fit">
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-cyan-500/10 text-cyan-405 rounded-lg">
              <User className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-xs font-black text-slate-100 uppercase tracking-widest">
                {isEditing ? "Editar Cliente" : "Novo Cliente"}
              </h2>
              <p className="text-[9px] text-slate-400 font-mono uppercase mt-0.5">
                {isEditing ? "Atualizar registro seguro" : "Cadastro isolado multi-tenant"}
              </p>
            </div>
          </div>
          {isEditing && (
            <button 
              onClick={handleClearForm}
              className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded transition cursor-pointer"
              title="Cancelar Edição"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-2.5">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-wider block">
              Nome Completo <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ex: João da Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-sans"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-wider block">
              Telefone Celular
            </label>
            <input
              type="tel"
              placeholder="Ex: (11) 98765-4321"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-sans"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-wider block">
              E-mail
            </label>
            <input
              type="email"
              placeholder="Ex: cliente@provedor.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-sans"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-wider block">
              Endereço / Entrega
            </label>
            <input
              type="text"
              placeholder="Ex: Rua das Flores, 123 - Centro"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-sans"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-wider block">
              Anotações Internas
            </label>
            <textarea
              placeholder="Ex: Prefere entregas à tarde, cliente recorrente, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-sans resize-none"
            />
          </div>

          <div className="flex items-center gap-2 py-0.5 select-none">
            <input
              type="checkbox"
              id="startSaleAfterCreate"
              checked={startSaleAfterCreate}
              onChange={(e) => setStartSaleAfterCreate(e.target.checked)}
              className="h-3.5 w-3.5 bg-slate-950 border-slate-800 rounded text-cyan-500 focus:ring-cyan-500/20 cursor-pointer"
            />
            <label htmlFor="startSaleAfterCreate" className="text-[9.5px] text-slate-400 hover:text-slate-200 font-bold uppercase tracking-wider cursor-pointer">
              Fazer nova venda com ele após cadastrar
            </label>
          </div>

          <div className="pt-1.5 flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-[10px] font-black uppercase tracking-wider py-2.5 px-3 rounded-lg shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 transition duration-200 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{isEditing ? "Salvar Alterações" : "Cadastrar Cliente"}</span>
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={handleClearForm}
                className="bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[10px] font-black uppercase tracking-wider py-2.5 px-3 rounded-lg border border-slate-850 transition cursor-pointer"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="px-4 py-3 bg-slate-950/40 border-t border-slate-800 text-[9px] text-slate-500 flex items-center gap-1 font-mono select-none">
          <Shield className="h-3 w-3 text-cyan-455 animate-pulse" />
          <span className="uppercase tracking-wider">🔒 Isolar dados por ID: {currentUser?.id?.substring(0, 10)}...</span>
        </div>
      </div>

      {/* 2. Client Grid/List Column */}
      <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col min-h-[500px]">
        {/* Search & Header controls */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="w-full sm:w-72 relative">
            <input
              type="text"
              placeholder="Buscar por nome, telefone, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 focus:border-cyan-500 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-sans"
            />
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-600" />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={fetchClientes}
              className="p-2 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-slate-200 rounded-xl border border-slate-850 hover:border-slate-800 transition-all cursor-pointer flex items-center gap-2 text-xs font-bold"
              title="Sincronizar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-cyan-400" : ""}`} />
              <span className="font-sans">Atualizar</span>
            </button>
            <div className="px-3 py-1.5 bg-slate-950 text-cyan-405 font-mono text-[10px] font-black rounded-lg border border-slate-850 select-none uppercase tracking-wider">
              Total: {filteredClientes.length}
            </div>
          </div>
        </div>

        {/* Content View */}
        <div className="flex-grow p-5 overflow-y-auto max-h-[650px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin text-cyan-500 stroke-[1.5]" />
              <p className="text-xs font-mono uppercase tracking-widest">Buscando banco de dados isolado...</p>
            </div>
          ) : filteredClientes.length === 0 ? (
            <div className="text-center py-20 text-slate-600 space-y-3">
              <User className="h-12 w-12 mx-auto text-slate-700 stroke-[1.2]" />
              <div>
                <p className="text-sm font-bold text-slate-400">Nenhum cliente cadastrado</p>
                <p className="text-xs text-slate-500 mt-1">Insira as informações ao lado para criar o primeiro registro seguro.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredClientes.map((cliente) => {
                const totalMatchingSales = getClientSales(cliente).length;
                return (
                  <div 
                    key={cliente.id} 
                    onClick={() => setSelectedCliente(cliente)}
                    className="bg-slate-950/30 hover:bg-slate-950/60 border border-slate-850 hover:border-slate-800 rounded-lg p-2 flex items-center justify-between gap-3 transition-all duration-150 cursor-pointer group"
                    id={`client-row-${cliente.id}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Mini visual avatar */}
                      <div className="w-6.5 h-6.5 bg-cyan-500/10 group-hover:bg-cyan-500/20 text-cyan-400 rounded-md flex items-center justify-center font-bold text-xs shrink-0 select-none">
                        {cliente.name.charAt(0).toUpperCase()}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
                        {/* Clickable Client Name */}
                        <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-400 transition-colors uppercase tracking-wide truncate">
                          {cliente.name}
                        </span>

                        {cliente.phone && (
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            ({cliente.phone})
                          </span>
                        )}

                        {/* Tiny Status Badges */}
                        <div className="flex items-center gap-1 shrink-0">
                          {cliente.isVirtual ? (
                            <span className="text-[8px] font-black uppercase px-1 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              Temp
                            </span>
                          ) : (
                            <span className="text-[8px] font-black uppercase px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              Salvo
                            </span>
                          )}

                          {cliente.hasPendingDebts && (
                            <span className="text-[8px] font-black uppercase px-1 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse">
                              ⚠️ Tem que dar Baixa
                            </span>
                          )}

                          {cliente.isPlacingOrder && (
                            <span className="text-[8px] font-black uppercase px-1 py-0.5 rounded bg-cyan-500/10 text-brand-cyan border border-brand-cyan/20">
                              📦 Fazendo Pedido
                            </span>
                          )}

                          {totalMatchingSales > 0 && (
                            <span className="text-[8px] font-mono font-bold px-1 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                              {totalMatchingSales} Ped.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Action buttons for editing */}
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleEditClick(cliente)}
                        className="p-1 hover:bg-slate-800 text-slate-500 hover:text-cyan-400 rounded transition cursor-pointer"
                        title={cliente.isVirtual ? "Cadastrar / Editar Cliente" : "Editar Cadastro"}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      {(!isAttendant || adminUnlocked) && (
                        <button
                          onClick={() => handleDeleteClick(cliente.id, cliente.name)}
                          className="p-1 hover:bg-slate-800 text-slate-500 hover:text-rose-500 rounded transition cursor-pointer"
                          title="Excluir Cliente"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. Detailed Client History & CRM Analytics Modal */}
      {selectedCliente && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 text-cyan-405 rounded-xl">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-100 uppercase tracking-widest">
                    Perfil & Histórico Operacional
                  </h2>
                  <p className="text-[10px] text-slate-400 font-mono uppercase mt-0.5">
                    Sincronização analítica em tempo real
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedCliente(null)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Split Modal Content */}
            <div className="flex-grow p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column: Profile Card & Dynamic Metrics */}
              <div className="md:col-span-1 space-y-5">
                <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-5 text-center space-y-4">
                  <div className="w-16 h-16 bg-gradient-to-tr from-cyan-500 to-blue-600 text-white rounded-2xl flex items-center justify-center font-black text-2xl mx-auto shadow-lg shadow-cyan-500/10">
                    {selectedCliente.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-100 uppercase tracking-wide">
                      {selectedCliente.name}
                    </h3>
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block mt-1">
                      Código: {selectedCliente.id}
                    </span>
                  </div>

                  <div className="border-t border-slate-850/60 pt-4 space-y-2.5 text-xs text-left">
                    {selectedCliente.phone && (
                      <div className="flex items-center gap-2 text-slate-400">
                        <Phone className="h-4 w-4 text-slate-600 shrink-0" />
                        <span className="font-mono">{selectedCliente.phone}</span>
                      </div>
                    )}
                    {selectedCliente.email && (
                      <div className="flex items-center gap-2 text-slate-400 min-w-0">
                        <Mail className="h-4 w-4 text-slate-600 shrink-0" />
                        <span className="truncate block" title={selectedCliente.email}>{selectedCliente.email}</span>
                      </div>
                    )}
                    {selectedCliente.address && (
                      <div className="flex items-center gap-2 text-slate-400">
                        <MapPin className="h-4 w-4 text-slate-600 shrink-0" />
                        <span className="leading-tight text-slate-450">{selectedCliente.address}</span>
                      </div>
                    )}
                  </div>

                  {selectedCliente.notes && (
                    <div className="bg-slate-900/60 border border-slate-850/60 rounded-xl p-3 text-left">
                      <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider block mb-1">Observações Internas</span>
                      <p className="text-[11px] text-slate-400 italic font-serif leading-relaxed">
                        "{selectedCliente.notes}"
                      </p>
                    </div>
                  )}
                </div>

                {/* Dynamic CRM Metrics Widgets */}
                <div className="space-y-3">
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block pl-1">Indicadores de Compra</span>
                  
                  <div className="grid grid-cols-1 gap-2.5">
                    <div className="bg-slate-950/30 border border-slate-850/40 rounded-xl p-3.5 flex items-center gap-3.5">
                      <div className="p-2 bg-cyan-500/10 text-cyan-405 rounded-lg shrink-0">
                        <ShoppingBag className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider">Volume de Pedidos</span>
                        <strong className="text-sm font-black text-slate-200 font-mono">{totalOrders}</strong>
                      </div>
                    </div>

                    <div className="bg-slate-950/30 border border-slate-850/40 rounded-xl p-3.5 flex items-center gap-3.5">
                      <div className="p-2 bg-emerald-500/10 text-emerald-455 rounded-lg shrink-0">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider">Total Consumido</span>
                        <strong className="text-sm font-black text-cyan-400 font-mono">
                          R$ {totalSpent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </strong>
                      </div>
                    </div>

                    <div className="bg-slate-950/30 border border-slate-850/40 rounded-xl p-3.5 flex items-center gap-3.5">
                      <div className={`p-2 rounded-lg shrink-0 ${totalPending > 0 ? "bg-rose-500/10 text-rose-455 animate-pulse" : "bg-slate-900 text-slate-650"}`}>
                        <Wallet className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider">Saldo Pendente</span>
                        <strong className={`text-sm font-black font-mono ${totalPending > 0 ? "text-rose-500" : "text-slate-400"}`}>
                          R$ {totalPending.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Complete Orders History Scroll list with Thermal Ticket design and Dar Baixa */}
              <div className="md:col-span-2 flex flex-col h-full min-h-[350px]">
                <div className="border-b border-slate-850 pb-3 flex justify-between items-center">
                  <span className="text-xs font-black uppercase text-slate-300 tracking-wider">Histórico de Transações e Serviços</span>
                  <button
                    onClick={() => {
                      if (onNewOrderWithClient) {
                        onNewOrderWithClient(selectedCliente.name, selectedCliente.phone || "");
                        setSelectedCliente(null);
                        addToast("Direcionado com cliente selecionado para Novo Pedido!", "success");
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-slate-950 text-[11px] font-black uppercase rounded-lg transition shadow-lg shadow-cyan-500/10 cursor-pointer"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span>Novo Pedido</span>
                  </button>
                </div>

                <div className="flex-grow overflow-y-auto max-h-[550px] mt-4 space-y-5 pr-1 customize-scrollbar">
                  {clientSales.length === 0 ? (
                    <div className="text-center py-16 text-slate-600 space-y-2">
                      <AlertCircle className="h-10 w-10 mx-auto text-slate-700 stroke-[1.2]" />
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sem transações</p>
                        <p className="text-[11px] text-slate-500 mt-1">Este cliente ainda não possui nenhuma venda ou orçamento faturado.</p>
                      </div>
                    </div>
                  ) : (
                    clientSales.map((sale) => {
                      const isBudget = !!sale.isBudget;
                      const hasBalanceDue = (sale.balanceDue || 0) > 0;
                      
                      return (
                        <div 
                          key={sale.id} 
                          className="bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-xl p-5 space-y-4 relative overflow-hidden transition-all duration-200 shadow-md"
                        >
                          {/* Receipt Top Header */}
                          <div className="flex justify-between items-start border-b border-dashed border-slate-700/60 pb-3">
                            <div>
                              <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-mono font-bold tracking-widest uppercase mb-1">
                                <Clipboard className="h-3 w-3" />
                                <span>#{sale.id}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                                <Clock className="h-3 w-3 text-slate-500" />
                                <span>{formatDate(sale.date)}</span>
                              </div>
                            </div>
                            
                            <div className="text-right">
                              {isBudget ? (
                                <span className="text-[9px] font-mono font-black uppercase tracking-wider bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded-md">
                                  Orçamento
                                </span>
                              ) : hasBalanceDue ? (
                                <span className="text-[9px] font-mono font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-md animate-pulse">
                                  Pendente de Entrega / Saldo
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                                  Finalizado e Entregue
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Receipt Items Details */}
                          <div className="space-y-2">
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold">Serviço(s) Realizado(s):</div>
                            <div className="space-y-1 bg-slate-900/60 border border-slate-850/65 p-3.5 rounded-xl font-mono text-xs text-slate-400">
                              {sale.items && sale.items.length > 0 ? (
                                sale.items.map((item: any, idx: number) => (
                                  <div key={item.id || idx} className="flex justify-between gap-3 text-slate-300">
                                    <span className="truncate">
                                      {item.quantity}x {item.description}
                                    </span>
                                    <span className="shrink-0 font-bold text-slate-100">
                                      R$ {Number(item.totalValue || item.unitValue * item.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <span className="italic text-slate-650">Nenhum item cadastrado</span>
                              )}
                            </div>
                          </div>

                          {/* Financial conditions & outstanding balances */}
                          <div className="bg-slate-950/30 rounded-xl p-3 border border-slate-850/30 flex flex-wrap justify-between items-center text-xs font-mono text-slate-400 gap-y-2">
                            <div className="flex gap-4 flex-wrap">
                              <span>
                                Total: <strong className="text-white">R$ {Number(sale.totalValue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                              </span>
                              {Number(sale.discount || 0) > 0 && (
                                <span className="text-rose-450">
                                  Desc: R$ {Number(sale.discount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              {Number(sale.downPayment || 0) > 0 && (
                                <span className="text-emerald-450">
                                  Sinal/Sinal Pago: R$ {Number(sale.downPayment).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                              )}
                            </div>

                            {hasBalanceDue && !isBudget && (
                              <div className="text-[11px] text-rose-400 font-bold bg-rose-500/10 px-2.5 py-0.5 rounded-md flex items-center gap-1 border border-rose-500/20">
                                <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
                                <span>Falta Receber: R$ {Number(sale.balanceDue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}
                          </div>

                          {/* Delivery Date Display */}
                          <div className="border-t border-dashed border-slate-700/60 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                              <Calendar className="h-4 w-4 text-slate-500" />
                              <span>Previsão / Retirado em:</span>
                              <strong className="text-slate-200">
                                {sale.deliveryDate 
                                  ? getLocalDateFromISO(sale.deliveryDate).split("-").reverse().join("/") 
                                  : "RETIRADA PENDENTE"
                                }
                              </strong>
                              {sale.deliveryReason && (
                                <span className="text-[10px] text-amber-500 italic font-sans truncate max-w-xs block ml-1" title={sale.deliveryReason}>
                                  ({sale.deliveryReason})
                                </span>
                              )}
                            </div>
                            
                            {/* Buttons to print PDF or Share on Whatsapp */}
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleDownloadPDF(sale)}
                                className="p-1.5 rounded bg-slate-900 border border-slate-800 text-cyan-405 hover:bg-slate-850 flex items-center gap-1.5 cursor-pointer text-[10px] font-bold uppercase tracking-wider transition hover:-translate-y-0.5"
                                title="Imprimir Recibo PDF"
                              >
                                <FileDown className="h-3.5 w-3.5" />
                                <span>PDF</span>
                              </button>

                              <button
                                onClick={() => handleShareWhatsApp(sale)}
                                className="p-1.5 rounded bg-slate-900 border border-slate-800 text-emerald-400 hover:bg-slate-850 flex items-center gap-1.5 cursor-pointer text-[10px] font-bold uppercase tracking-wider transition hover:-translate-y-0.5"
                                title="Enviar pelo WhatsApp"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                                <span>WhatsApp</span>
                              </button>
                            </div>
                          </div>

                          {/* Inline Dar Baixa and Reschedule Actions */}
                          {!isBudget && (
                            <div className="border-t border-slate-850/60 pt-3 mt-1 flex flex-wrap gap-2 justify-end">
                              {/* If it has outstanding balance, allow "Dar Baixa" */}
                              {hasBalanceDue && (
                                <button
                                  onClick={() => {
                                    if (baixaSaleId === sale.id) {
                                      setBaixaSaleId(null);
                                    } else {
                                      setBaixaSaleId(sale.id);
                                      setBaixaAmount(String(sale.balanceDue));
                                      setBaixaMethod("pix");
                                      setBaixaDeliverToday(true);
                                      setRescheduleSaleId(null);
                                    }
                                  }}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-black uppercase rounded-lg transition-all hover:scale-[1.02] shadow-sm cursor-pointer"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  <span>Dar Baixa e Entregar</span>
                                </button>
                              )}

                              {/* Button to reschedule delivery prediction date */}
                              <button
                                onClick={() => {
                                  if (rescheduleSaleId === sale.id) {
                                    setRescheduleSaleId(null);
                                  } else {
                                    setRescheduleSaleId(sale.id);
                                    setNewDeliveryDate(sale.deliveryDate ? getLocalDateFromISO(sale.deliveryDate) : "");
                                    setNewDeliveryReason(sale.deliveryReason || "");
                                    setBaixaSaleId(null);
                                  }
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10.5px] font-bold uppercase rounded-lg transition-all cursor-pointer"
                              >
                                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                <span>Agendar Entrega</span>
                              </button>

                              {/* Redirect to full edit */}
                              <button
                                onClick={() => {
                                  if (onEditSale) {
                                    onEditSale(sale);
                                    setSelectedCliente(null);
                                  }
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white text-[10.5px] font-bold uppercase rounded-lg transition-all cursor-pointer"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                                <span>Editar</span>
                              </button>
                            </div>
                          )}

                          {/* Dar Baixa Inline Form Panel */}
                          {baixaSaleId === sale.id && (
                            <div className="mt-3 bg-slate-950 border border-slate-850/80 rounded-xl p-4.5 space-y-4 animate-fade-in font-sans">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-455 flex items-center gap-1">
                                  <DollarSign className="h-4 w-4" />
                                  <span>Registrar Recebimento & Baixa de Material</span>
                                </h4>
                                <button 
                                  onClick={() => setBaixaSaleId(null)}
                                  className="p-1 hover:bg-slate-850 rounded-lg text-slate-550 hover:text-white transition"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs text-left text-slate-300">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-450 block">Valor Pago Agora (R$)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                                    value={baixaAmount}
                                    onChange={(e) => setBaixaAmount(e.target.value)}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-450 block">Forma de Pagamento</label>
                                  <select
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs font-medium text-slate-100 focus:outline-none"
                                    value={baixaMethod}
                                    onChange={(e: any) => setBaixaMethod(e.target.value)}
                                  >
                                    <option value="pix">Pix</option>
                                    <option value="dinheiro">Dinheiro</option>
                                    <option value="cartão">Cartão</option>
                                  </select>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 bg-slate-900/50 p-2 rounded-lg border border-slate-850/60">
                                <input
                                  type="checkbox"
                                  id={`deliver-checkbox-${sale.id}`}
                                  className="rounded border-slate-850 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
                                  checked={baixaDeliverToday}
                                  onChange={(e) => setBaixaDeliverToday(e.target.checked)}
                                />
                                <label htmlFor={`deliver-checkbox-${sale.id}`} className="text-[11px] text-slate-300 font-medium select-none cursor-pointer">
                                  Confirmar entrega / retirada completa dos materiais hoje
                                </label>
                              </div>

                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => handleExecuteBaixa(sale)}
                                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-wider rounded-lg transition cursor-pointer"
                                >
                                  Confirmar Baixa
                                </button>
                                <button
                                  onClick={() => setBaixaSaleId(null)}
                                  className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white font-bold uppercase text-[10px] rounded-lg transition cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Reschedule Delivery Inline Form Panel */}
                          {rescheduleSaleId === sale.id && (
                            <div className="mt-3 bg-slate-950 border border-slate-850/80 rounded-xl p-4.5 space-y-4 animate-fade-in font-sans">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-wider text-brand-cyan flex items-center gap-1.5">
                                  <Calendar className="h-4 w-4" />
                                  <span>Agendar ou Reagendar Entrega de Material</span>
                                </h4>
                                <button 
                                  onClick={() => setRescheduleSaleId(null)}
                                  className="p-1 hover:bg-slate-850 rounded-lg text-slate-550 hover:text-white transition"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs text-left text-slate-300">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-450 block">Nova Data Prevista de Entrega</label>
                                  <input
                                    type="date"
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                                    value={newDeliveryDate}
                                    onChange={(e) => setNewDeliveryDate(e.target.value)}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-450 block">Anotação / Observação de Entrega</label>
                                  <input
                                    type="text"
                                    placeholder="Ex: Entregar à tarde, alterado a pedido..."
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                    value={newDeliveryReason}
                                    onChange={(e) => setNewDeliveryReason(e.target.value)}
                                  />
                                </div>
                              </div>

                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => handleSaveReschedule(sale)}
                                  className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-black uppercase text-[10px] tracking-wider rounded-lg transition cursor-pointer"
                                >
                                  Salvar Agenda
                                </button>
                                <button
                                  onClick={() => setRescheduleSaleId(null)}
                                  className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white font-bold uppercase text-[10px] rounded-lg transition cursor-pointer"
                                >
                                  Cancelar
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
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex justify-end">
              <button 
                onClick={() => setSelectedCliente(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
