import {
  Plus,
  Trash2,
  Upload,
  Clipboard,
  Truck,
  DollarSign,
  FileDown,
  RefreshCw,
  X,
  User as UserIcon,
  Phone,
  Paperclip,
  CheckCircle,
  HelpCircle,
  Eye,
  EyeOff,
  Lock,
  Save,
  FileText,
  Check,
  Calendar,
  Package,
  Edit,
  Search,
  ArrowUpRight,
  Boxes,
  Layers,
  Zap,
  Settings,
  Wallet,
  Printer,
  MapPin
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { ProductSaleItem, Sale, CompanyProfile, CostItem, CatalogProduct, User, CashRegisterState, SaleAuditEntry } from "../types";
import { jsPDF } from "jspdf";
import { dbUploadImages, parseClientImages, isSupabaseConfigured, getSupabase, dbGetQuickSales, dbSaveQuickSale, dbDeleteQuickSale } from "../supabase";

const formatCurrency = (val: number) => {
  return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
};

interface ImageItem {
  id: string;
  url: string; // Public URL or Local BLOB URL
  file?: File; // Present if newly pasted or chosen via file selector
}

interface SaleFormProps {
  onSaleSaved: (sale: Sale) => void;
  onBudgetSaved: (budget: Sale) => void;
  onBudgetExecuted?: (id: string) => void;
  activeEditingSale: Sale | null;
  clearActiveEditing: () => void;
  company: CompanyProfile;
  catalogProducts?: CatalogProduct[];
  existingSales?: Sale[];
  locateClientClicks?: number;
  currentUser: User | null;
  adminUnlocked?: boolean;
  onRequestAdminUnlock?: (callback: () => void, message?: string) => void;
  preselectedClient?: { name: string; phone?: string } | null;
  clearPreselectedClient?: () => void;
  cashRegister?: CashRegisterState;
  isGlobalRegisterOpen?: boolean;
  onRequestOpenRegister?: () => void;
}

export function SaleForm({
  onSaleSaved,
  onBudgetSaved,
  onBudgetExecuted,
  activeEditingSale,
  clearActiveEditing,
  company,
  catalogProducts = [],
  existingSales = [],
  locateClientClicks = 0,
  currentUser,
  adminUnlocked = false,
  onRequestAdminUnlock,
  preselectedClient,
  clearPreselectedClient,
  cashRegister,
  isGlobalRegisterOpen = false,
  onRequestOpenRegister
}: SaleFormProps) {
  // Helper to format today's date in local system timezone as YYYY-MM-DD
  const getLocalDateString = () => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getLocalDateFromISO = (isoStr: string): string => {
    if (!isoStr) return "";
    const clean = isoStr.replace(/['"]/g, "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      return clean;
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

  // Client Info
  const isAttendant = Boolean(
    currentUser && (
      currentUser.role === "atendente" ||
      currentUser.role === "seller" ||
      (currentUser.owner_id && currentUser.owner_id !== currentUser.id && currentUser.role !== "administrador" && !currentUser.is_admin)
    )
  );
  const isPricingLocked = Boolean(isAttendant && !adminUnlocked);

  // Strict Cash Register status check for SaleForm: prevents adding anything when register is closed
  const isRegisterOpen = Boolean(
    isGlobalRegisterOpen ||
    (cashRegister?.currentSession && cashRegister.currentSession.status === "aberto")
  );

  const checkRegisterBeforeAction = (actionDesc = "lançar informações na venda"): boolean => {
    if (!isRegisterOpen) {
      alert(`⚠️ CAIXA FECHADO!\n\nVocê precisa abrir o caixa antes de ${actionDesc}. Clique no botão "Abrir Caixa Agora" para iniciar seu turno de trabalho.`);
      onRequestOpenRegister?.();
      return false;
    }
    return true;
  };

   const [clientName, setClientName] = useState(() => {
    return localStorage.getItem("NUCLEO_CART_CLIENT_NAME") || "";
  });
  const [clientPhone, setClientPhone] = useState(() => {
    return localStorage.getItem("NUCLEO_CART_CLIENT_PHONE") || "";
  });
  const [orderDate, setOrderDate] = useState(() => {
    const today = getLocalDateString();
    const saved = localStorage.getItem("NUCLEO_CART_ORDER_DATE");
    if (saved && saved.length === 10 && saved < today) {
      // If cached cart order date is from an old day, reset to today
      return today;
    }
    return saved || today;
  });
  const [deliveryDate, setDeliveryDate] = useState(() => {
    return localStorage.getItem("NUCLEO_CART_DELIVERY_DATE") || "";
  });
  
  // Products / Items List (stored internally as string inputs)
  const [items, setItems] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_CART_ITEMS");
      return saved ? JSON.parse(saved) : [
        { id: "1", description: "", quantity: "1", unitValue: "0", totalValue: 0, unitCost: "0" }
      ];
    } catch {
      return [
        { id: "1", description: "", quantity: "1", unitValue: "0", totalValue: 0, unitCost: "0" }
      ];
    }
  });

  // Motoboy Cost & Delivery Address
  const [useMotoboy, setUseMotoboy] = useState(() => {
    return localStorage.getItem("NUCLEO_CART_USE_MOTOBOY") === "true";
  });
  const [motoboyCostInput, setMotoboyCostInput] = useState<string>(() => {
    return localStorage.getItem("NUCLEO_CART_MOTOBOY_COST") || "0";
  });
  const [deliveryAddress, setDeliveryAddress] = useState<string>(() => {
    return localStorage.getItem("NUCLEO_CART_DELIVERY_ADDRESS") || "";
  });
  const [materialEntregue, setMaterialEntregue] = useState<boolean>(false);

  // Financial details
  const [discountInput, setDiscountInput] = useState<string>(() => {
    return localStorage.getItem("NUCLEO_CART_DISCOUNT") || "0";
  });
  const [downPaymentInput, setDownPaymentInput] = useState<string>(() => {
    return localStorage.getItem("NUCLEO_CART_DOWN_PAYMENT") || "0";
  }); // sinal
  const [operationCostInput, setOperationCostInput] = useState<string>(() => {
    return localStorage.getItem("NUCLEO_CART_OPERATION_COST") || "0";
  }); // gasto dessa venda
  const [clientMode, setClientMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("NUCLEO_CART_CLIENT_MODE");
    return saved !== "false";
  });
  const [costBreakdownItems, setCostBreakdownItems] = useState<CostItem[]>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_CART_COST_BREAKDOWN_ITEMS");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showCostBreakdown, setShowCostBreakdown] = useState<boolean>(false);

  // Auto-save form progress to localStorage for seamless tab changing caching
  useEffect(() => {
    localStorage.setItem("NUCLEO_CART_CLIENT_NAME", clientName);
    localStorage.setItem("NUCLEO_CART_CLIENT_PHONE", clientPhone);
    localStorage.setItem("NUCLEO_CART_ORDER_DATE", orderDate);
    localStorage.setItem("NUCLEO_CART_DELIVERY_DATE", deliveryDate);
    localStorage.setItem("NUCLEO_CART_ITEMS", JSON.stringify(items));
    localStorage.setItem("NUCLEO_CART_USE_MOTOBOY", String(useMotoboy));
    localStorage.setItem("NUCLEO_CART_MOTOBOY_COST", motoboyCostInput);
    localStorage.setItem("NUCLEO_CART_DELIVERY_ADDRESS", deliveryAddress);
    localStorage.setItem("NUCLEO_CART_DISCOUNT", discountInput);
    localStorage.setItem("NUCLEO_CART_DOWN_PAYMENT", downPaymentInput);
    localStorage.setItem("NUCLEO_CART_OPERATION_COST", operationCostInput);
    localStorage.setItem("NUCLEO_CART_CLIENT_MODE", String(clientMode));
    localStorage.setItem("NUCLEO_CART_COST_BREAKDOWN_ITEMS", JSON.stringify(costBreakdownItems));
  }, [clientName, clientPhone, orderDate, deliveryDate, items, useMotoboy, motoboyCostInput, deliveryAddress, discountInput, downPaymentInput, operationCostInput, clientMode, costBreakdownItems]);

  // Realtime channel for quick sales configuration updates across devices
  const [sessionClientId] = useState(() => Math.random().toString(36).substring(2, 9));
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Se o usuário não estiver autenticado, encerra imediatamente
    if (!currentUser || !currentUser.id || !isSupabaseConfigured()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const scopeId = currentUser.owner_id || currentUser.id;
    const channelName = `quick_sales_config:${scopeId}`;

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false }
      }
    });

    channel
      .on("broadcast", { event: "quick_sales_config_update" }, async (response: any) => {
        const payload = response.payload;
        if (payload && payload.senderId !== sessionClientId) {
          if (isSupabaseConfigured() && currentUser) {
            const ownerId = currentUser.owner_id || currentUser.id;
            const dbSales = await dbGetQuickSales(ownerId);
            if (dbSales && dbSales.length > 0) {
              setQuickSales(dbSales);
            }
          }
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [currentUser, sessionClientId]);

  // Automatically sum up individual product costs into the total operation cost of the sale
  useEffect(() => {
    // 1. Check if any item is matching a catalog product and doesn't have a unitCost set yet
    let itemsChanged = false;
    const updatedItems = items.map(item => {
      const desc = String(item.description).trim().toLowerCase();
      if (!desc) return item;

      const matchedProd = catalogProducts?.find(
        p => String(p.description).trim().toLowerCase() === desc
      );

      // If matched and unitCost is currently empty, "0" or undefined, populate it
      if (matchedProd && (!item.unitCost || item.unitCost === "0" || item.unitCost === "")) {
        itemsChanged = true;
        return {
          ...item,
          unitCost: String(matchedProd.costPrice || 0)
        };
      }
      return item;
    });

    if (itemsChanged) {
      setItems(updatedItems);
      return;
    }

    // 2. Sum up total cost of all items in the list
    const hasSomeUnitCost = items.some(item => Number(item.unitCost) > 0);
    if (hasSomeUnitCost) {
      const totalItemsCost = items.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        const unitC = Number(item.unitCost) || 0;
        return sum + (qty * unitC);
      }, 0);
      
      setOperationCostInput(prev => Math.abs(Number(prev) - totalItemsCost) > 0.01 ? String(totalItemsCost) : prev);
    } else {
      // If none of the items has a unit cost but there was an automatic sum before, reset it
      if (!activeEditingSale && items.length > 0 && items.every(item => Number(item.unitCost) === 0)) {
        // Only reset if cost items are empty (to preserve manual or detailed costs)
        if (costBreakdownItems.length === 0) {
          setOperationCostInput(prev => Number(prev) > 0 ? "0" : prev);
        }
      }
    }
  }, [items, catalogProducts, costBreakdownItems, activeEditingSale]);
  
  // Client Image Items management
  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  
  // Payment Options State
  const [paymentMethod, setPaymentMethod] = useState<'dinheiro' | 'cartão' | 'pix'>(() => {
    return (localStorage.getItem("NUCLEO_CART_PAYMENT_METHOD") as 'dinheiro' | 'cartão' | 'pix') || 'dinheiro';
  });

  useEffect(() => {
    localStorage.setItem("NUCLEO_CART_PAYMENT_METHOD", paymentMethod);
  }, [paymentMethod]);
  
  // Product Catalog States (Visual alerts only)
  const [catalogSuccessMessage, setCatalogSuccessMessage] = useState<string | null>(null);
  
  // Flags and UI helpers
  const [dragActive, setDragActive] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savedSaleSummary, setSavedSaleSummary] = useState<Sale | null>(null);
  const [latestReceiptModalData, setLatestReceiptModalData] = useState<{
    pdfBlobUrl: string;
    pdfBase64: string;
    docName: string;
    clientName: string;
    totalValue: number;
    paymentMethod: string;
    pixKey: string;
    deliveryAddress?: string;
  } | null>(null);
  const [receiptSendSuccess, setReceiptSendSuccess] = useState<string | null>(null);
  const pastezoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Locate Client States
  const [showLocateClientModal, setShowLocateClientModal] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState("");

  // Quick Sales (Vendas Rápidas) States
  const [quickSales, setQuickSales] = useState<{ id: string; description: string; price: number; cost?: number; gradient: string }[]>(() => {
    return [
      { id: "q1", description: "Impressão Colorida A4", price: 2.50, cost: 0.50, gradient: "from-purple-600 via-fuchsia-600 to-pink-500" },
      { id: "q2", description: "Plastificação de Documento", price: 5.00, cost: 1.20, gradient: "from-cyan-500 to-blue-600" },
      { id: "q3", description: "Cópia / Xerox Preto", price: 0.50, cost: 0.10, gradient: "from-slate-700 to-slate-900" },
      { id: "q4", description: "Adesivo Personalizado", price: 1.50, cost: 0.35, gradient: "from-pink-500 to-rose-500" },
      { id: "q5", description: "Encadernação Completa", price: 12.00, cost: 3.50, gradient: "from-emerald-500 to-teal-600" },
      { id: "q6", description: "Formatação de PC / Notbook", price: 80.00, cost: 0.00, gradient: "from-blue-600 to-indigo-700" }
    ];
  });

  const [showQuickSalesManager, setShowQuickSalesManager] = useState(false);
  const [newQSDescription, setNewQSDescription] = useState("");
  const [newQSPrice, setNewQSPrice] = useState("");
  const [newQSCost, setNewQSCost] = useState("");
  const [newQSGradient, setNewQSGradient] = useState("from-purple-600 via-fuchsia-600 to-pink-500");
  const [activeQuickSaleItem, setActiveQuickSaleItem] = useState<{ id: string; description: string; price: number; cost?: number; gradient: string } | null>(null);
  const [quickSaleQty, setQuickSaleQty] = useState("1");
  const [editingQSId, setEditingQSId] = useState<string | null>(null);

  useEffect(() => {
    const loadQuickSales = async () => {
      if (!isSupabaseConfigured() || !currentUser) return;
      const ownerId = currentUser.owner_id || currentUser.id;
      try {
        const dbSales = await dbGetQuickSales(ownerId);
        if (dbSales !== null) {
          if (dbSales.length > 0) {
            setQuickSales(dbSales);
          } else {
            // If the DB is empty (first-time use), seed the DB with initial/default items!
            const defaultItems = [
              { id: "q1", description: "Impressão Colorida A4", price: 2.50, cost: 0.50, gradient: "from-purple-600 via-fuchsia-600 to-pink-500" },
              { id: "q2", description: "Plastificação de Documento", price: 5.00, cost: 1.20, gradient: "from-cyan-500 to-blue-600" },
              { id: "q3", description: "Cópia / Xerox Preto", price: 0.50, cost: 0.10, gradient: "from-slate-700 to-slate-900" },
              { id: "q4", description: "Adesivo Personalizado", price: 1.50, cost: 0.35, gradient: "from-pink-500 to-rose-500" },
              { id: "q5", description: "Encadernação Completa", price: 12.00, cost: 3.50, gradient: "from-emerald-500 to-teal-600" },
              { id: "q6", description: "Formatação de PC / Notbook", price: 80.05, cost: 0.00, gradient: "from-blue-600 to-indigo-700" }
            ];
            
            if (!isPricingLocked) {
              await Promise.all(defaultItems.map(item => dbSaveQuickSale(ownerId, item)));
            }
            setQuickSales(defaultItems);
          }
        }
      } catch (err) {
        console.error("Error loading/seeding quick sales", err);
      }
    };
    loadQuickSales();
  }, [currentUser]);

  const handleAddQuickSaleToForm = (name: string, price: number, qty: number, cost: number = 0) => {
    const hasEmptyFirstRow = items.length === 1 && items[0].description === "" && items[0].unitValue === "0";
    
    const newItem = {
      id: Math.random().toString(36).substring(2, 9),
      description: name,
      quantity: String(qty),
      unitValue: String(price),
      totalValue: qty * price,
      unitCost: String(cost),
    };
    
    if (hasEmptyFirstRow) {
      setItems([newItem]);
    } else {
      setItems([...items, newItem]);
    }

    // Auto-populate the direct operating cost detailed table if cost > 0
    if (cost > 0) {
      const calculatedCost = qty * cost;
      const newCostItem: CostItem = {
        id: "cost-" + Math.random().toString(36).substring(2, 9),
        description: `Custo: ${name} (x${qty})`,
        value: calculatedCost
      };

      setCostBreakdownItems(prev => {
        const updated = [...prev, newCostItem];
        const sum = updated.reduce((s, x) => s + x.value, 0);
        setOperationCostInput(String(sum));
        return updated;
      });
    }
    
    setSuccessMessage(`"${name}" (${qty}x) adicionado ao carrinho! com seu preço R$ ${price.toFixed(2)} e custo R$ ${cost.toFixed(2)} salvos.`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleStartEditQS = (qs: { id: string; description: string; price: number; cost?: number; gradient: string }, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isPricingLocked) {
      alert("Apenas o Administrador pode editar botões de Vendas Rápidas.");
      return;
    }
    setEditingQSId(qs.id);
    setNewQSDescription(qs.description);
    setNewQSPrice(String(qs.price));
    setNewQSCost(String(qs.cost || 0));
    setNewQSGradient(qs.gradient);
  };

  const handleAddNewQS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPricingLocked) {
      alert("Apenas o Administrador pode cadastrar ou alterar botões de Vendas Rápidas.");
      return;
    }
    if (!newQSDescription.trim()) {
      alert("Por favor, digite a descrição da venda rápida.");
      return;
    }
    const priceVal = parseFloat(newQSPrice.replace(",", "."));
    if (isNaN(priceVal) || priceVal < 0) {
      alert("Por favor, digite um preço de venda válido.");
      return;
    }

    const costVal = newQSCost ? parseFloat(newQSCost.replace(",", ".")) : 0;
    if (isNaN(costVal) || costVal < 0) {
      alert("Por favor, digite um preço de custo válido (ou deixe vazio para R$ 0,00).");
      return;
    }
    
    if (editingQSId) {
      // Edit Mode
      const updatedItem = {
        id: editingQSId,
        description: newQSDescription.trim(),
        price: priceVal,
        cost: costVal,
        gradient: newQSGradient
      };
      
      setQuickSales(prev => prev.map(q => q.id === editingQSId ? updatedItem : q));
      
      if (isSupabaseConfigured() && currentUser) {
        const ownerId = currentUser.owner_id || currentUser.id;
        await dbSaveQuickSale(ownerId, updatedItem);
        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "quick_sales_config_update",
            payload: { senderId: sessionClientId }
          }).catch((err: any) => console.warn(err));
        }
      }
      
      setEditingQSId(null);
      setNewQSDescription("");
      setNewQSPrice("");
      setNewQSCost("");
      alert("Venda rápida atualizada com sucesso!");
    } else {
      // Create Mode
      const newQS = {
        id: "q-" + Math.random().toString(36).substring(2, 9),
        description: newQSDescription.trim(),
        price: priceVal,
        cost: costVal,
        gradient: newQSGradient
      };
      
      setQuickSales([...quickSales, newQS]);
      
      if (isSupabaseConfigured() && currentUser) {
        const ownerId = currentUser.owner_id || currentUser.id;
        await dbSaveQuickSale(ownerId, newQS);
        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "quick_sales_config_update",
            payload: { senderId: sessionClientId }
          }).catch((err: any) => console.warn(err));
        }
      }
      
      setNewQSDescription("");
      setNewQSPrice("");
      setNewQSCost("");
      alert("Venda rápida cadastrada com sucesso!");
    }
  };

  const handleDeleteQS = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isPricingLocked) {
      alert("Apenas o Administrador pode excluir botões de Vendas Rápidas.");
      return;
    }
    if (confirm("Deseja realmente excluir esta venda rápida?")) {
      setQuickSales(prev => prev.filter(q => q.id !== id));
      
      if (isSupabaseConfigured() && currentUser) {
        const ownerId = currentUser.owner_id || currentUser.id;
        await dbDeleteQuickSale(ownerId, id);
        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "quick_sales_config_update",
            payload: { senderId: sessionClientId }
          }).catch((err: any) => console.warn(err));
        }
      }
      
      if (editingQSId === id) {
        setEditingQSId(null);
        setNewQSDescription("");
        setNewQSPrice("");
        setNewQSCost("");
      }
    }
  };

  const previousClients = React.useMemo(() => {
    if (!existingSales || existingSales.length === 0) return [];
    
    const map = new Map<string, { name: string; phone: string; lastOrderDate?: string; orderCount: number }>();
    
    const sorted = [...existingSales].sort((a, b) => {
      const dateA = a.orderDate || a.date || "";
      const dateB = b.orderDate || b.date || "";
      return dateB.localeCompare(dateA);
    });
    
    sorted.forEach(sale => {
      if (!sale.clientName) return;
      const key = sale.clientName.trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.orderCount += 1;
      } else {
        map.set(key, {
          name: sale.clientName.trim(),
          phone: sale.clientPhone || "",
          lastOrderDate: sale.orderDate || (sale.date ? sale.date.substring(0, 10) : undefined),
          orderCount: 1
        });
      }
    });
    
    return Array.from(map.values());
  }, [existingSales]);

  const filteredClientsForSearch = React.useMemo(() => {
    if (!clientSearchTerm) return previousClients;
    const term = clientSearchTerm.toLowerCase().trim();
    return previousClients.filter(c => 
      c.name.toLowerCase().includes(term) || 
      c.phone.includes(term)
    );
  }, [previousClients, clientSearchTerm]);

  // Watch for trigger from parent toolbar to open find client modal
  useEffect(() => {
    if (locateClientClicks > 0) {
      setClientSearchTerm("");
      setShowLocateClientModal(true);
    }
  }, [locateClientClicks]);

  // Watch for editing triggers
  useEffect(() => {
    if (activeEditingSale) {
      setClientName(activeEditingSale.clientName);
      setClientPhone(activeEditingSale.clientPhone);
      setItems(activeEditingSale.items.length > 0 ? activeEditingSale.items.map(it => ({
        id: it.id,
        description: it.description,
        quantity: String(it.quantity),
        unitValue: String(it.unitValue),
        totalValue: it.totalValue,
        unitCost: String(it.unitCost || 0)
      })) : [{ id: "1", description: "", quantity: "1", unitValue: "0", totalValue: 0, unitCost: "0" }]);
      setUseMotoboy(activeEditingSale.useMotoboy);
      setMotoboyCostInput(String(activeEditingSale.motoboyCost || 0));
      setDeliveryAddress(activeEditingSale.deliveryAddress || "");
      setMaterialEntregue(Boolean(activeEditingSale.materialEntregue));
      setDiscountInput(String(activeEditingSale.discount || 0));
      setDownPaymentInput(String(activeEditingSale.downPayment || 0));
      setOperationCostInput(String(activeEditingSale.operationCost || 0));
      setCostBreakdownItems(activeEditingSale.costItems || []);
      setShowCostBreakdown(!!activeEditingSale.costItems && activeEditingSale.costItems.length > 0);
      
      const parsed = parseClientImages(activeEditingSale.clientImage);
      setImageItems(parsed.map((url, index) => ({
        id: `existing-${index}-${Date.now()}`,
        url
      })));
      
      setPaymentMethod(activeEditingSale.paymentMethod || 'dinheiro');
      setOrderDate(activeEditingSale.orderDate || (activeEditingSale.date ? getLocalDateFromISO(activeEditingSale.date) : getLocalDateString()));
      setDeliveryDate(activeEditingSale.deliveryDate || "");
    }
  }, [activeEditingSale]);

  // Watch for preselected client (for Novo Pedido from Clientes tab)
  useEffect(() => {
    if (preselectedClient) {
      setClientName(preselectedClient.name);
      if (preselectedClient.phone) {
        handlePhoneChange(preselectedClient.phone);
      } else {
        setClientPhone("");
      }
      if (clearPreselectedClient) {
        clearPreselectedClient();
      }
    }
  }, [preselectedClient]);

  // Format Phone in real-time -> (XX) XXXXX-XXXX or (XX) XXXX-XXXX
  const handlePhoneChange = (val: string) => {
    const numbersOnly = val.replace(/\D/g, "");
    if (numbersOnly.length <= 11) {
      let formatted = numbersOnly;
      if (numbersOnly.length > 2) {
        formatted = `(${numbersOnly.slice(0, 2)}) ${numbersOnly.slice(2)}`;
      }
      if (numbersOnly.length > 7) {
        formatted = `(${numbersOnly.slice(0, 2)}) ${numbersOnly.slice(2, 7)}-${numbersOnly.slice(7)}`;
      }
      setClientPhone(formatted);
    }
  };

  // Product Catalog Core Actions
  const handleAddCatalogProductToSale = (prod: CatalogProduct) => {
    if (!checkRegisterBeforeAction("adicionar produtos do catálogo")) return;
    const hasEmptyFirstRow = items.length === 1 && items[0].description === "" && items[0].unitValue === "0";
    
    const newItem = {
      id: Math.random().toString(36).substring(2, 9),
      description: prod.description,
      quantity: "1",
      unitValue: String(prod.salePrice),
      totalValue: prod.salePrice,
      unitCost: String(prod.costPrice || 0),
    };
    
    if (hasEmptyFirstRow) {
      setItems([newItem]);
    } else {
      setItems([...items, newItem]);
    }
    
    setCatalogSuccessMessage(`"${prod.description}" adicionado à sua lista de itens! 🚀`);
    setTimeout(() => setCatalogSuccessMessage(null), 3500);
  };

  // Add Product list item
  const handleAddItem = () => {
    if (!checkRegisterBeforeAction("adicionar produtos ou serviços")) return;
    if (isPricingLocked) {
      alert("Atendentes só podem vender produtos previamente cadastrados no Catálogo ou nas Vendas Rápidas.");
      const catalogSelect = document.getElementById("catalog-product-selector");
      if (catalogSelect) {
        catalogSelect.focus();
        catalogSelect.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    const newItem = {
      id: Math.random().toString(36).substring(2, 9),
      description: "",
      quantity: "1",
      unitValue: "0",
      totalValue: 0,
      unitCost: "0",
    };
    setItems([...items, newItem]);
  };

  // Remove Product list item
  const handleRemoveItem = (id: string) => {
    if (items.length === 1) {
      // Just clear instead of deleting the last one
      setItems([{ id: "1", description: "", quantity: "1", unitValue: "0", totalValue: 0, unitCost: "0" }]);
    } else {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  // Update item fields
  const handleItemFieldChange = (
    id: string,
    field: "description" | "quantity" | "unitValue" | "unitCost",
    value: string
  ) => {
    if (isPricingLocked && (field === "description" || field === "unitValue" || field === "unitCost")) {
      if (field === "unitValue" && onRequestAdminUnlock) {
        onRequestAdminUnlock(() => {}, "Alterar o valor do produto exige autorização do Administrador.");
      }
      return;
    }
    const updated = items.map((item) => {
      if (item.id === id) {
        const updatedItem = { ...item };
        if (field === "description") {
          updatedItem.description = value;
        } else if (field === "quantity") {
          updatedItem.quantity = value;
          const qty = Number(value) || 0;
          const unit = Number(item.unitValue) || 0;
          updatedItem.totalValue = qty * unit;
        } else if (field === "unitValue") {
          updatedItem.unitValue = value;
          const qty = Number(item.quantity) || 0;
          const unit = Number(value) || 0;
          updatedItem.totalValue = qty * unit;
        } else if (field === "unitCost") {
          updatedItem.unitCost = value;
        }
        return updatedItem;
      }
      return item;
    });
    setItems(updated);
  };

  // Financial Calculations parsed into numbers
  const discount = Math.max(0, Number(discountInput) || 0);
  const downPayment = Math.max(0, Number(downPaymentInput) || 0);
  const operationCost = Math.max(0, Number(operationCostInput) || 0);
  const motoboyCost = Math.max(0, Number(motoboyCostInput) || 0);

  const subtotalProducts = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const unit = Number(item.unitValue) || 0;
    return sum + (qty * unit);
  }, 0);
  const activeMotoboyCost = useMotoboy ? motoboyCost : 0;
  
  // Total charged to customer
  const finalTotalValue = Math.max(0, subtotalProducts + activeMotoboyCost - discount);
  // Remaining amount to pay
  const balanceDueValue = Math.max(0, finalTotalValue - downPayment);
  // Net profit (Total earned - direct operartion cost of the sale)
  const netProfitValue = finalTotalValue - operationCost;

  // Remove individual selected/uploaded image item
  const handleRemoveImageItem = (id: string) => {
    setImageItems((prev) => {
      const item = prev.find((x) => x.id === id);
      if (item && item.url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(item.url);
        } catch (e) {
          console.error("Error revoking object URL:", e);
        }
      }
      return prev.filter((x) => x.id !== id);
    });
  };

  // Helper to compress image files on client before upload/storage
  const compressImageFile = async (file: File, maxWidth = 1600, maxHeight = 1600, quality = 0.82): Promise<File> => {
    if (file.size <= 200 * 1024) return file;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(file);
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob || blob.size >= file.size) return resolve(file);
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                type: "image/jpeg",
                lastModified: Date.now()
              });
              resolve(compressedFile);
            },
            "image/jpeg",
            quality
          );
        };
        img.onerror = () => resolve(file);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  // Process a list or array of image files with auto-compression
  const processImageFiles = async (files: File[]) => {
    const validImages = files.filter(file => file.type.startsWith("image/"));
    if (validImages.length === 0) {
      alert("Por favor, adicione apenas arquivos de imagem válidos.");
      return;
    }

    const compressed = await Promise.all(validImages.map(f => compressImageFile(f)));

    const newImageItems: ImageItem[] = compressed.map((file) => ({
      id: Math.random().toString(36).substring(2, 10) + "_" + Date.now(),
      url: URL.createObjectURL(file),
      file
    }));

    setImageItems((prev) => [...prev, ...newImageItems]);
  };

  // Handle Drag-and-drop Image
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Handle standard File picking
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processImageFiles(Array.from(e.target.files));
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Handle Clipboard Paste Handler
  const handlePaste = (e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < clipItems.length; i++) {
      if (clipItems[i].type.indexOf("image") !== -1) {
        const file = clipItems[i].getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }
    if (pastedFiles.length > 0) {
      processImageFiles(pastedFiles);
    }
  };

  const handleAddCostItem = () => {
    const newItem: CostItem = {
      id: Math.random().toString(36).substring(2, 9),
      description: "",
      value: 0
    };
    setCostBreakdownItems([...costBreakdownItems, newItem]);
  };

  const handleRemoveCostItem = (id: string) => {
    const updated = costBreakdownItems.filter(item => item.id !== id);
    setCostBreakdownItems(updated);
    const sum = updated.reduce((s, x) => s + x.value, 0);
    setOperationCostInput(String(sum));
  };

  const handleCostItemChange = (id: string, field: "description" | "value", val: any) => {
    const updated = costBreakdownItems.map(item => {
      if (item.id === id) {
        return { ...item, [field]: val };
      }
      return item;
    });
    setCostBreakdownItems(updated);
    if (field === "value") {
      const sum = updated.reduce((s, x) => s + x.value, 0);
      setOperationCostInput(String(sum));
    }
  };

  // Reset the entire form fields
  const handleResetForm = () => {
    setClientName("");
    setClientPhone("");
    setItems([{ id: "1", description: "", quantity: "1", unitValue: "0", totalValue: 0 }]);
    setUseMotoboy(false);
    setMotoboyCostInput("0");
    setDeliveryAddress("");
    setMaterialEntregue(false);
    localStorage.removeItem("NUCLEO_CART_DELIVERY_ADDRESS");
    setDiscountInput("0");
    setDownPaymentInput("0");
    setOperationCostInput("0");
    setCostBreakdownItems([]);
    setShowCostBreakdown(false);
    
    // Clear and revoke Object URLs if they start with blob:
    imageItems.forEach((item) => {
      if (item.url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(item.url);
        } catch (e) {
          console.error("Error revoking object URL:", e);
        }
      }
    });
    setImageItems([]);
    
    setPaymentMethod('dinheiro');
    setOrderDate(getLocalDateString());
    setDeliveryDate("");
    clearActiveEditing();

    // Clear cart cached progress to start completely fresh
    try {
      localStorage.removeItem("NUCLEO_CART_CLIENT_NAME");
      localStorage.removeItem("NUCLEO_CART_CLIENT_PHONE");
      localStorage.removeItem("NUCLEO_CART_ORDER_DATE");
      localStorage.removeItem("NUCLEO_CART_DELIVERY_DATE");
      localStorage.removeItem("NUCLEO_CART_ITEMS");
      localStorage.removeItem("NUCLEO_CART_USE_MOTOBOY");
      localStorage.removeItem("NUCLEO_CART_MOTOBOY_COST");
      localStorage.removeItem("NUCLEO_CART_DISCOUNT");
      localStorage.removeItem("NUCLEO_CART_DOWN_PAYMENT");
      localStorage.removeItem("NUCLEO_CART_OPERATION_COST");
      localStorage.removeItem("NUCLEO_CART_CLIENT_MODE");
      localStorage.removeItem("NUCLEO_CART_COST_BREAKDOWN_ITEMS");
      localStorage.removeItem("NUCLEO_CART_PAYMENT_METHOD");
    } catch (e) {
      console.warn("Failed to clear local storage cache on form reset:", e);
    }
  };

  // Helper to upload all unsaved images from imageItems and return the compiled string Array (as string or JSON string)
  const uploadUnsavedImages = async (): Promise<string | null> => {
    setIsUploading(true);
    try {
      const finalUrls: string[] = [];
      const filesToUpload: File[] = [];

      // Collect existing public urls and files to upload
      for (const item of imageItems) {
        if (item.file) {
          filesToUpload.push(item.file);
        } else {
          finalUrls.push(item.url);
        }
      }

      if (filesToUpload.length > 0) {
        // Upload via dbUploadImages (supports direct storage and server API fallback)
        const uploaded = await dbUploadImages(filesToUpload);
        if (uploaded && uploaded.length > 0) {
          finalUrls.push(...uploaded);
        } else {
          // Graceful fallback: convert compressed files to data URL only if small
          const base64s = await Promise.all(
            filesToUpload.map(async (file) => {
              const compressed = await compressImageFile(file, 800, 800, 0.7);
              return new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = () => resolve("");
                reader.readAsDataURL(compressed);
              });
            })
          );
          const validBase64s = base64s.filter(s => s && s.length < 50000);
          finalUrls.push(...validBase64s);
        }
      }

      if (finalUrls.length === 0) return null;
      // Store array of URLs as a JSON string
      return JSON.stringify(finalUrls);
    } catch (err) {
      console.error("Erro no processamento das imagens:", err);
      // Fallback: return already uploaded urls
      const existing = imageItems.filter(x => !x.file).map(x => x.url);
      return existing.length > 0 ? JSON.stringify(existing) : null;
    } finally {
      setIsUploading(false);
    }
  };

  // Save changes to Database/State
  const handleSaveSale = async (isQuickSale = false) => {
    if (!isRegisterOpen) {
      alert("⚠️ CAIXA FECHADO!\n\nVocê precisa abrir o caixa antes de registrar vendas no sistema.");
      onRequestOpenRegister?.();
      return;
    }
    if (!checkRegisterBeforeAction("registrar vendas no sistema")) return;

    const finalClientName = isQuickSale ? "Venda Rápida" : clientName.trim();
    if (!finalClientName) {
      alert("Por favor, preencha o nome do cliente.");
      return;
    }
    
    const validItems = items.filter(item => item.description.trim() !== "");
    if (validItems.length === 0) {
      alert("Por favor, adicione pelo menos um item com descrição.");
      return;
    }

    const uploadedClientImage = await uploadUnsavedImages();

    const isAttendantRole = currentUser && (
      currentUser.role === "atendente" ||
      currentUser.role === "seller" ||
      (currentUser.owner_id && currentUser.owner_id !== currentUser.id && currentUser.role !== "administrador" && !currentUser.is_admin)
    );
    const currentOperatorRole: 'atendente' | 'administrador' = isAttendantRole ? 'atendente' : 'administrador';
    const currentOperatorName = currentUser?.name || currentUser?.username || (isAttendantRole ? "Atendente" : "Administrador");

    const actualDownPayment = isQuickSale ? finalTotalValue : downPayment;
    const actualBalanceDue = isQuickSale ? 0 : balanceDueValue;
    const actualDate = isQuickSale ? new Date().toISOString() : (activeEditingSale?.date || new Date().toISOString());
    const actualOrderDate = isQuickSale ? getLocalDateString() : (orderDate || getLocalDateString());
    const actualDeliveryDate = isQuickSale ? getLocalDateString() : (deliveryDate || undefined);

    const auditEntry: SaleAuditEntry = {
      action: activeEditingSale ? "edicao" : (isQuickSale ? "venda_rapida" : "venda_balcao"),
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || "",
      userName: currentOperatorName,
      userRole: currentOperatorRole,
      details: `${isQuickSale ? "Venda Rápida" : "Venda"}: ${validItems.map(it => `${it.quantity}x ${it.description}`).join(", ")} | Total: R$ ${finalTotalValue.toFixed(2)} | Pago: R$ ${actualDownPayment.toFixed(2)} (${paymentMethod || 'dinheiro'})`
    };

    const savedSale: Sale = {
      id: activeEditingSale?.id || Math.random().toString(36).substring(2, 9).toUpperCase(),
      clientName: finalClientName,
      clientPhone: clientPhone || "Não informado",
      items: validItems.map(it => ({
        id: it.id,
        description: it.description,
        quantity: Number(it.quantity) || 0,
        unitValue: Number(it.unitValue) || 0,
        totalValue: it.totalValue,
        unitCost: Number(it.unitCost) || 0
      })),
      useMotoboy,
      motoboyCost: activeMotoboyCost,
      deliveryAddress: deliveryAddress.trim() || undefined,
      discount,
      downPayment: actualDownPayment,
      operationCost,
      costItems: costBreakdownItems,
      totalValue: finalTotalValue,
      balanceDue: actualBalanceDue,
      netProfit: netProfitValue,
      clientImage: uploadedClientImage,
      date: actualDate,
      paymentMethod,
      orderDate: actualOrderDate,
      deliveryDate: actualDeliveryDate,
      materialEntregue: isQuickSale ? true : (materialEntregue || activeEditingSale?.materialEntregue || false),
      sellerId: activeEditingSale?.sellerId || currentUser?.id || "admin",
      sellerName: activeEditingSale?.sellerName || currentOperatorName,
      sellerRole: activeEditingSale?.sellerRole || currentOperatorRole,
      deliveredBy: isQuickSale ? currentOperatorName : (activeEditingSale?.deliveredBy || undefined),
      deliveredAt: isQuickSale ? actualDate : (activeEditingSale?.deliveredAt || undefined),
      deliveredRole: isQuickSale ? currentOperatorRole : (activeEditingSale?.deliveredRole || undefined),
      auditLog: [
        ...(activeEditingSale?.auditLog || []),
        auditEntry
      ],
      payments: isQuickSale 
        ? [{
            id: Math.random().toString(36).substring(2, 9).toUpperCase(),
            amount: finalTotalValue,
            date: actualDate,
            method: paymentMethod || 'dinheiro',
            recordedBy: currentOperatorName,
            recordedRole: currentOperatorRole
          }]
        : (activeEditingSale?.payments?.length 
            ? (() => {
                const totalOfCurrentPayments = activeEditingSale.payments.reduce((sum, p) => sum + p.amount, 0);
                const difference = actualDownPayment - totalOfCurrentPayments;
                if (Math.abs(difference) > 0.01) {
                  const adjustedPayments = [...activeEditingSale.payments];
                  if (adjustedPayments.length > 0) {
                    adjustedPayments[0] = {
                      ...adjustedPayments[0],
                      amount: Number(Math.max(0, adjustedPayments[0].amount + difference).toFixed(2))
                    };
                  }
                  return adjustedPayments;
                }
                return activeEditingSale.payments;
              })()
            : (actualDownPayment > 0 
                ? [{
                    id: Math.random().toString(36).substring(2, 9).toUpperCase(),
                    amount: actualDownPayment,
                    date: activeEditingSale?.date || new Date().toISOString(),
                    method: paymentMethod || 'dinheiro',
                    recordedBy: currentOperatorName,
                    recordedRole: currentOperatorRole
                  }]
                : []))
    };

    onSaleSaved(savedSale);
    setSavedSaleSummary(savedSale);
    
    setSuccessMessage(
      activeEditingSale 
        ? "Venda atualizada com sucesso!" 
        : "Venda salva no histórico com sucesso!"
    );
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);

    // Reset if we were not editing or if we finished
    handleResetForm();
  };

  // Save changes as Budget/Estimate
  const handleSaveBudget = async () => {
    if (!checkRegisterBeforeAction("registrar qualquer orçamento no sistema")) return;

    if (!clientName.trim()) {
      alert("Por favor, preencha o nome do cliente.");
      return;
    }
    
    const validItems = items.filter(item => item.description.trim() !== "");
    if (validItems.length === 0) {
      alert("Por favor, adicione pelo menos um item com descrição.");
      return;
    }

    const uploadedClientImage = await uploadUnsavedImages();

    const savedBudget: Sale = {
      id: activeEditingSale?.id || Math.random().toString(36).substring(2, 9).toUpperCase(),
      clientName: clientName.trim(),
      clientPhone: clientPhone || "Não informado",
      items: validItems.map(it => ({
        id: it.id,
        description: it.description,
        quantity: Number(it.quantity) || 0,
        unitValue: Number(it.unitValue) || 0,
        totalValue: it.totalValue,
        unitCost: Number(it.unitCost) || 0
      })),
      useMotoboy,
      motoboyCost: activeMotoboyCost,
      deliveryAddress: deliveryAddress.trim() || undefined,
      discount,
      downPayment,
      operationCost,
      costItems: costBreakdownItems,
      totalValue: finalTotalValue,
      balanceDue: balanceDueValue,
      netProfit: netProfitValue,
      clientImage: uploadedClientImage,
      date: activeEditingSale?.date || new Date().toISOString(),
      isBudget: true,
      paymentMethod,
      orderDate: orderDate || undefined,
      deliveryDate: deliveryDate || undefined,
    };

    onBudgetSaved(savedBudget);
    
    setSuccessMessage(
      activeEditingSale 
        ? "Orçamento atualizado com sucesso!" 
        : "Orçamento salvo no sistema com sucesso!"
    );
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);

    // Reset form after saving
    handleResetForm();
  };

  // Execute budget and convert into a definitive Sale
  const handleExecuteBudget = async () => {
    if (!isRegisterOpen) {
      alert("⚠️ CAIXA FECHADO!\n\nVocê precisa abrir o caixa antes de converter orçamentos em vendas.");
      onRequestOpenRegister?.();
      return;
    }
    if (!checkRegisterBeforeAction("converter orçamento em venda")) return;

    if (!clientName.trim()) {
      alert("Por favor, preencha o nome do cliente.");
      return;
    }
    
    const validItems = items.filter(item => item.description.trim() !== "");
    if (validItems.length === 0) {
      alert("Por favor, adicione pelo menos um item com descrição.");
      return;
    }

    const uploadedClientImage = await uploadUnsavedImages();

    const convertedSale: Sale = {
      id: activeEditingSale?.id || Math.random().toString(36).substring(2, 9).toUpperCase(),
      clientName: clientName.trim(),
      clientPhone: clientPhone || "Não informado",
      items: validItems.map(it => ({
        id: it.id,
        description: it.description,
        quantity: Number(it.quantity) || 0,
        unitValue: Number(it.unitValue) || 0,
        totalValue: it.totalValue,
        unitCost: Number(it.unitCost) || 0
      })),
      useMotoboy,
      motoboyCost: activeMotoboyCost,
      deliveryAddress: deliveryAddress.trim() || undefined,
      discount,
      downPayment,
      operationCost,
      costItems: costBreakdownItems,
      totalValue: finalTotalValue,
      balanceDue: balanceDueValue,
      netProfit: netProfitValue,
      clientImage: uploadedClientImage,
      date: new Date().toISOString(), // Update date to time of execution
      isBudget: false, // Convert to Sale!
      orderDate: orderDate || undefined,
      deliveryDate: deliveryDate || undefined,
      payments: downPayment > 0 
        ? [{
            id: Math.random().toString(36).substring(2, 9).toUpperCase(),
            amount: downPayment,
            date: new Date().toISOString(),
            method: paymentMethod || 'dinheiro'
          }]
        : []
    };

    // Convert into a System Sale
    onSaleSaved(convertedSale);

    // Remove from the budgets list
    if (onBudgetExecuted && activeEditingSale) {
      onBudgetExecuted(activeEditingSale.id);
    }

    setSuccessMessage("Orçamento convertido em venda real com sucesso!");
    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);

    handleResetForm();
  };

  // WhatsApp share function direct from the form
  const handleShareWhatsApp = () => {
    const phoneDigits = clientPhone.replace(/\D/g, "");
    if (!phoneDigits) {
      alert("Por favor, preencha o celular do cliente com DDD para enviar.");
      return;
    }

    if (!clientName.trim()) {
      alert("Por favor, informe o nome do cliente.");
      return;
    }

    const companyName = company?.tradingName || "Sistema de Vendas Núcleo";
    const docId = activeEditingSale?.id || `V-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const formattedTotal = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(finalTotalValue);

    const balanceMessage = balanceDueValue > 0 
      ? ` Restante a Pagar: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(balanceDueValue)}.`
      : " Pago integralmente!";

    const messageText = `Olá, *${clientName}*!\n\nSegue o resumo de sua compra na *${companyName}*:\n\n📄 *Recibo:* #${docId}\n💰 *Valor Total:* ${formattedTotal}\n📥 *Sinal/Pago:* ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(downPayment)}${balanceMessage}\n\nSeu recibo digital em PDF foi gerado e registrado no sistema! Agradecemos a preferência.\n\nAtenciosamente,\n*${companyName}*`;
    
    const encodedMessage = encodeURIComponent(messageText);
    
    let destinationPhone = phoneDigits;
    if (phoneDigits.length === 10 || phoneDigits.length === 11) {
      destinationPhone = "55" + phoneDigits;
    }

    const url = `https://api.whatsapp.com/send?phone=${destinationPhone}&text=${encodedMessage}`;
    window.open(url, "_blank");
  };

  // PDF Generation Function
  const generatePDF = async (isBudgetParam?: boolean, isQuickSale = false) => {
    const finalClient = isQuickSale ? "Venda Rápida" : clientName.trim();
    if (!finalClient) {
      alert("Adicione o nome do cliente antes de gerar o PDF.");
      return;
    }

    const isActuallyBudget = typeof isBudgetParam === "boolean" ? isBudgetParam : (activeEditingSale?.isBudget || false);
    const effectiveOrderDate = isQuickSale ? getLocalDateString() : (orderDate || activeEditingSale?.orderDate || getLocalDateString());
    const effectiveDeliveryDate = isQuickSale ? getLocalDateString() : (deliveryDate || activeEditingSale?.deliveryDate || getLocalDateString());
    const effectiveDownPayment = isQuickSale ? finalTotalValue : downPayment;
    const effectiveBalanceDue = isQuickSale ? 0 : balanceDueValue;

    // Preload company logo if it exists
    const companyLogoBase64 = await (async () => {
      if (!company?.logo) return "";
      try {
        return await new Promise<string>((resolve) => {
          const url = company.logo!;
          if (url.startsWith("data:image/")) {
            resolve(url);
            return;
          }
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth || img.width;
              canvas.height = img.naturalHeight || img.height;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL("image/jpeg", 0.8));
              } else {
                resolve("");
              }
            } catch (e) {
              resolve("");
            }
          };
          img.onerror = () => {
            fetch(url)
              .then(res => res.blob())
              .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  resolve(reader.result as string);
                };
                reader.onerror = () => resolve("");
                reader.readAsDataURL(blob);
              })
              .catch(() => resolve(""));
          };
          img.src = url;
        });
      } catch (e) {
        return "";
      }
    })();

    // Preload client images to Base64 to support jsPDF synchronous adding
    const urlsToPreload = imageItems.map(item => item.url);
    const preloadedBase64s = await (async () => {
      try {
        const promises = urlsToPreload.map(async (url) => {
          return new Promise<string>((resolve) => {
            if (url.startsWith("data:image/")) {
              resolve(url);
              return;
            }
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              try {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  ctx.drawImage(img, 0, 0);
                  resolve(canvas.toDataURL("image/jpeg", 0.8));
                } else {
                  resolve("");
                }
              } catch (e) {
                resolve("");
              }
            };
            img.onerror = () => {
              // Try fetching
              fetch(url)
                .then(res => res.blob())
                .then(blob => {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    resolve(reader.result as string);
                  };
                  reader.onerror = () => resolve("");
                  reader.readAsDataURL(blob);
                })
                .catch(() => resolve(""));
            };
            img.src = url;
          });
        });
        const results = await Promise.all(promises);
        return results.filter(r => r !== "");
      } catch (e) {
        console.error("Error preloading images:", e);
        return [];
      }
    })();

    const doc = new jsPDF();
    const currentDateStr = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    


    const docId = activeEditingSale?.id 
      ? activeEditingSale.id 
      : (isActuallyBudget ? `O-${Math.random().toString(36).substring(2, 6).toUpperCase()}` : `V-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);

    const formattedDocId = (() => {
      const rawId = docId || "";
      const digits = rawId.replace(/\D/g, "");
      if (digits) {
        return digits.padStart(5, "0");
      }
      return String(rawId).padStart(5, "0");
    })();

    // Helper to draw a single copy of the receipt at yOffset
    const drawReceiptCopy = (yOffset: number, label: "VIA DO CLIENTE" | "VIA DA EMPRESA") => {
      // Color definitions matching design (Deep dark headers + pink accents inside text)
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, yOffset, 210, 32, "F");

      // Check if company has custom logo
      let startTextX = 15;
      if (companyLogoBase64) {
        try {
          let format = "JPEG";
          if (companyLogoBase64.includes("image/png")) format = "PNG";
          else if (companyLogoBase64.includes("image/webp")) format = "WEBP";
          
          // Draw logo inside header
          doc.addImage(companyLogoBase64, format, 15, yOffset + 5, 22, 22, undefined, "FAST");
          startTextX = 42; // Shift company text to avoid overlapping the Logo
        } catch (e) {
          console.error("Erro ao incluir logotipo da empresa no PDF:", e);
        }
      }

      // Title & Header (Branding using user registered company details)
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text((company?.tradingName || "SISTEMA NÚCLEO").toUpperCase(), startTextX, yOffset + 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(190, 201, 214); // Sleek light gray
      
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

      // Right-aligned Invoice Title Box
      doc.setFontSize(9);
      doc.setTextColor(0, 182, 255); // Neon Cyan Hex
      doc.setFont("helvetica", "bold");
      doc.text(isActuallyBudget ? "ORÇAMENTO" : "RECIBO DE VENDA", 145, yOffset + 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(200, 200, 200);
      doc.text(`Data: ${currentDateStr}`, 145, yOffset + 15.5);
      doc.text(`Documento: #${formattedDocId}`, 145, yOffset + 19.5);
      
      // Label in Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.setFillColor(255, 20, 147); // deep pink background or just pink badge
      doc.rect(145, yOffset + 22, 50, 4.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(label, 147, yOffset + 25.5);

      // Separator Line
      doc.setDrawColor(0, 182, 255);
      doc.setLineWidth(1);
      doc.line(0, yOffset + 32, 210, yOffset + 32);

      // Customer Information Block (Very clean, narrow single visual row)
      const hasDates = !!orderDate || !!deliveryDate;
      const boxHeight = hasDates ? 14 : 9;
      const shiftY = hasDates ? 5 : 0;

      doc.setFillColor(248, 250, 252);
      doc.rect(10, yOffset + 36, 190, boxHeight, "F");
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.rect(10, yOffset + 36, 190, boxHeight, "D");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`CLIENTE: ${finalClient.toUpperCase()}`, 13, yOffset + 41.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`CONTATO: ${clientPhone || "Não Informado"}`, 120, yOffset + 41.5);

      if (hasDates) {
        const formatBtnDate = (dStr?: string) => {
          if (!dStr) return "Não informada";
          const parts = dStr.split("-");
          if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
          }
          return dStr;
        };

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`DATA PEDIDO:`, 13, yOffset + 46.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(`${formatBtnDate(effectiveOrderDate)}`, 37, yOffset + 46.5);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(`PREVISÃO ENTREGA:`, 120, yOffset + 46.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(`${formatBtnDate(effectiveDeliveryDate)}`, 155, yOffset + 46.5);
      }

      // Products & Services Table
      doc.setFillColor(15, 23, 42);
      doc.rect(10, yOffset + 49 + shiftY, 190, 6, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text("DESCRIÇÃO DO ITEM / SERVIÇO", 13, yOffset + 53 + shiftY);
      doc.text("QTD", 115, yOffset + 53 + shiftY);
      doc.text("V. UNITÁRIO", 138, yOffset + 53 + shiftY);
      doc.text("V. TOTAL", 170, yOffset + 53 + shiftY);

      let itemY = yOffset + 55 + shiftY;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);

      const itemsToRender = items.slice(0, 4);
      itemsToRender.forEach((item, idx) => {
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(10, itemY, 190, 5, "F");
        }
        doc.setTextColor(15, 23, 42);
        const desc = item.description || "Sem descrição";
        const truncatedDesc = desc.length > 55 ? desc.substring(0, 52) + "..." : desc;
        doc.text(truncatedDesc, 13, itemY + 3.5);
        doc.text(String(item.quantity), 115, itemY + 3.5);
        doc.text(formatCurrency(item.unitValue), 138, itemY + 3.5);
        doc.text(formatCurrency(item.totalValue), 170, itemY + 3.5);
        itemY += 5;
      });

      // Truncation Notice
      if (items.length > 4) {
        doc.setFillColor(254, 242, 242);
        doc.rect(10, itemY, 190, 4.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(220, 38, 38);
        doc.text(`* ${items.length - 4} mais itens resumidos no totalizador *`, 13, itemY + 3);
        itemY += 4.5;
      }

      // Draw bottom table border
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.3);
      doc.line(10, itemY, 200, itemY);

      // Financial Calculation box & Image placement
      const calcY = yOffset + 79 + shiftY;
      const calcBoxX = 120;
      
      let topBoxHeight = 4.5;
      if (useMotoboy) topBoxHeight += 3.8;

      // Draw top neutral calculator box
      doc.setFillColor(248, 250, 252);
      doc.rect(calcBoxX, calcY, 80, topBoxHeight, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(calcBoxX, calcY, 80, topBoxHeight, "D");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);

      let calcRowY = calcY + 3.2;
      doc.text("Subtotal:", calcBoxX + 3, calcRowY);
      doc.text(formatCurrency(subtotalProducts), calcBoxX + 77, calcRowY, { align: "right" });

      if (useMotoboy) {
        calcRowY += 3.8;
        doc.text("Motoboy:", calcBoxX + 3, calcRowY);
        doc.text(formatCurrency(motoboyCost), calcBoxX + 77, calcRowY, { align: "right" });
      }

      // Stacked Colored Boxes for main metrics
      let blockY = calcY + topBoxHeight + 1.2;

      // 1. VALOR TOTAL (Green Highlight Frame)
      doc.setFillColor(240, 253, 244); // emerald-50 (light green)
      doc.rect(calcBoxX, blockY, 80, 6, "F");
      doc.setDrawColor(34, 197, 94); // green-500
      doc.rect(calcBoxX, blockY, 80, 6, "D");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(21, 128, 61); // green-700
      doc.text("VALOR TOTAL:", calcBoxX + 3, blockY + 4.2);
      doc.text(formatCurrency(finalTotalValue), calcBoxX + 77, blockY + 4.2, { align: "right" });

      // 2. SINAL (Orange Highlight Frame)
      blockY += 7;
      doc.setFillColor(255, 247, 237); // orange-50 (light orange)
      doc.rect(calcBoxX, blockY, 80, 6, "F");
      doc.setDrawColor(249, 115, 22); // orange-500
      doc.rect(calcBoxX, blockY, 80, 6, "D");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(194, 65, 12); // orange-700
      doc.text("Sinal Pago:", calcBoxX + 3, blockY + 4.2);
      doc.text(formatCurrency(effectiveDownPayment), calcBoxX + 77, blockY + 4.2, { align: "right" });

      // 3. RESTA (Blue Highlight Frame)
      blockY += 7;
      doc.setFillColor(239, 246, 255); // blue-50 (light blue)
      doc.rect(calcBoxX, blockY, 80, 6, "F");
      doc.setDrawColor(59, 130, 246); // blue-500
      doc.rect(calcBoxX, blockY, 80, 6, "D");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(30, 58, 138); // blue-900 (deep navy)
      doc.text("Resta:", calcBoxX + 3, blockY + 4.2);
      doc.text(formatCurrency(effectiveBalanceDue), calcBoxX + 77, blockY + 4.2, { align: "right" });

      // 4. DESCONTO (Salmon Highlight Frame)
      blockY += 7;
      doc.setFillColor(254, 242, 242); // red-50 (light salmon/rose-50)
      doc.rect(calcBoxX, blockY, 80, 6, "F");
      doc.setDrawColor(250, 128, 114); // salmon (#FA8072)
      doc.rect(calcBoxX, blockY, 80, 6, "D");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(153, 27, 27); // red-800
      doc.text("Desconto:", calcBoxX + 3, blockY + 4.2);
      doc.text(formatCurrency(discount), calcBoxX + 77, blockY + 4.2, { align: "right" });

      // If client has visual attachments (proof of service photo grid)
      if (preloadedBase64s.length > 0) {
        const imgWidth = 45;
        const imgHeight = 22;
        
        preloadedBase64s.slice(0, 2).forEach((base64Data, imgIndex) => {
          const shiftX = imgIndex * 48; // Shift to the right for the second image
          const startX = 10 + shiftX;
          
          doc.setFillColor(248, 250, 252);
          doc.rect(startX, calcY, imgWidth, imgHeight, "F");
          doc.setDrawColor(226, 232, 240);
          doc.rect(startX, calcY, imgWidth, imgHeight, "D");
          
          try {
            let format = "JPEG";
            if (base64Data.includes("image/png")) format = "PNG";
            else if (base64Data.includes("image/webp")) format = "WEBP";
            doc.addImage(base64Data, format, startX + 1, calcY + 1, imgWidth - 2, imgHeight - 2, undefined, "FAST");
          } catch (err) {
            doc.setTextColor(220, 38, 38);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6);
            doc.text("Erro imagem.", startX + 2, calcY + 12);
          }
        });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(15, 23, 42);
        doc.text("COMPROVAÇÃO VISUAL DO SERVIÇO", 10, calcY + imgHeight + 3.5);
      }

      // Payment Details & PIX Box on the left side
      const pixBoxY = calcY;
      const pixBoxWidth = 105;
      const pixBoxHeight = preloadedBase64s.length > 0 ? 18 : 28;
      const effectivePixBoxY = preloadedBase64s.length > 0 ? calcY + 24 : pixBoxY;

      doc.setFillColor(248, 250, 252);
      doc.rect(10, effectivePixBoxY, pixBoxWidth, pixBoxHeight, "F");
      doc.setDrawColor(203, 213, 225);
      doc.rect(10, effectivePixBoxY, pixBoxWidth, pixBoxHeight, "D");

      const chosenMethod = (paymentMethod || activeEditingSale?.paymentMethod || "dinheiro").toUpperCase();
      const pixKeyStr = company?.pixKey || "Chave PIX cadastrada no sistema";

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`FORMA DE PAGAMENTO: ${chosenMethod}`, 13, effectivePixBoxY + 5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      doc.text(`CHAVE PIX: ${pixKeyStr}`, 13, effectivePixBoxY + 10);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Beneficiário: ${company?.tradingName || company?.corporateName || "Núcleo Comunicação Visual"}`, 13, effectivePixBoxY + 14.5);

      if (company?.cnpj) {
        doc.text(`CNPJ: ${company.cnpj}`, 13, effectivePixBoxY + 18.5);
      }

      if (deliveryAddress || useMotoboy) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(14, 116, 144);
        doc.text(`ENTREGA: ${deliveryAddress || "Entrega por Motoboy"}`, 13, effectivePixBoxY + (company?.cnpj ? 23 : 19));
      }

      // Bottom Signature Row
      const signatureY = yOffset + 112 + shiftY;

      // Thanks text
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Obrigado pela preferência e confiança!", 10, signatureY);
      doc.text(`Contato de Suporte: ${company?.phone || "Não informado"}`, 10, signatureY + 4);

      // Signature line
      doc.setDrawColor(203, 213, 225);
      doc.line(10, signatureY + 12, 90, signatureY + 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);
      
      const mainSigLabel = label === "VIA DO CLIENTE" 
        ? "Assinatura do Cliente / Recebedor" 
        : "Assinatura da Empresa / Responsável";
      doc.text(mainSigLabel, 10, signatureY + 15.5);
    };

    // Draw Top Half - VIA DO CLIENTE
    drawReceiptCopy(5, "VIA DO CLIENTE");

    // Dash Line Divider exactly in the middle!
    doc.setDrawColor(148, 163, 184); // slate-400
    doc.setLineWidth(0.5);
    for (let i = 0; i < 210; i += 4) {
      doc.line(i, 148.5, i + 2, 148.5);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("--- DOBRAR OU DIRECIONAR CORTE DA FOLHA AQUI ---", 105, 149.5, { align: "center" });

    // Draw Bottom Half - VIA DA EMPRESA
    drawReceiptCopy(153.5, "VIA DA EMPRESA");

    // Save PDF file and open preview in screen
    const docName = isActuallyBudget 
      ? `Orcamento_${finalClient.replace(/\s+/g, "_")}_${docId}.pdf`
      : `Recibo_${finalClient.replace(/\s+/g, "_")}_${docId}.pdf`;
    
    let blobUrl = "";
    let base64Pdf = "";
    try {
      const blob = doc.output("blob");
      blobUrl = URL.createObjectURL(blob);
      base64Pdf = doc.output("datauristring");
      (window as any).latestReceiptPdf = blobUrl;
      (window as any).latestReceiptBlob = blob;
      (window as any).latestReceiptBase64 = base64Pdf;
    } catch (e) {
      try {
        blobUrl = doc.output("bloburl");
      } catch (err) {}
    }

    const chosenMethod = (paymentMethod || activeEditingSale?.paymentMethod || "dinheiro").toUpperCase();
    const pixKeyStr = company?.pixKey || "Chave cadastrada";
    const receiptText = `Recibo #${docId}\nCliente: ${finalClient}\nValor: R$ ${finalTotalValue.toFixed(2)}\nPagamento: ${chosenMethod}\nPIX: ${pixKeyStr}\nEntrega: ${deliveryAddress || (useMotoboy ? "Motoboy" : "Balcão")}`;
    (window as any).latestReceiptText = receiptText;

    // Send to backend store for headless/E2E test verification
    try {
      fetch("/api/receipts/latest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64: base64Pdf,
          filename: docName,
          clientName: finalClient,
          totalValue: finalTotalValue,
          paymentMethod: chosenMethod,
          pixKey: pixKeyStr,
          textContent: receiptText
        })
      }).catch(() => {});
    } catch (err) {}

    // In-app modal state so tests and users can see and interact with the receipt immediately
    setLatestReceiptModalData({
      pdfBlobUrl: blobUrl,
      pdfBase64: base64Pdf,
      docName,
      clientName: finalClient,
      totalValue: finalTotalValue,
      paymentMethod: chosenMethod,
      pixKey: pixKeyStr,
      deliveryAddress: deliveryAddress || (useMotoboy ? "Entrega via Motoboy" : undefined)
    });

    // Provide anchor link in DOM for test suite
    if (blobUrl || base64Pdf) {
      try {
        const link = document.createElement("a");
        link.id = "download-receipt-link";
        link.setAttribute("data-testid", "download-receipt-link");
        link.href = blobUrl || base64Pdf;
        link.download = docName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => link.remove(), 1000);
      } catch (e) {}
    }

    try {
      if (blobUrl) {
        window.open(blobUrl, "_blank");
      }
    } catch (e) {
      console.warn("Aviso ao abrir visualização do PDF:", e);
    }
    doc.save(docName);
  };

  // Impressão nativa do Cupom Não Fiscal (Térmica 80mm)
  const handlePrintThermalReceipt = () => {
    if (items.length === 0 && finalTotalValue <= 0) {
      alert("Por favor, adicione itens ou valor à venda antes de imprimir o cupom.");
      return;
    }
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Closed register banner */}
      {!isRegisterOpen && (
        <div className="p-4 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-300 animate-fade-in">
          <div className="flex items-center gap-3">
            <Lock className="h-6 w-6 text-amber-400 shrink-0" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-amber-200">Caixa do Dia Fechado 🔒</h3>
              <p className="text-xs text-amber-400/80">O registro de vendas está bloqueado. Abra o caixa para autorizar novos lançamentos.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRequestOpenRegister}
            className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wide rounded-xl transition-all shadow-md cursor-pointer shrink-0"
          >
            Abrir Caixa Agora
          </button>
        </div>
      )}

      {/* Visual Success Alert */}
      {successMessage && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl animate-fade-in">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {/* Persistent Saved Sale Summary with Delivery and Actions */}
      {savedSaleSummary && (
        <div
          id="saved-sale-summary"
          data-testid="saved-sale-summary"
          className="p-4 bg-slate-900/90 border-2 border-emerald-500/40 rounded-2xl space-y-3.5 shadow-xl animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-wider">
              <CheckCircle className="h-4 w-4" />
              <span>Resumo do Pedido Salvo com Sucesso</span>
            </div>
            <button
              type="button"
              onClick={() => setSavedSaleSummary(null)}
              className="text-slate-400 hover:text-white text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 transition-colors"
            >
              ✕ Fechar
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-850">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Cliente</span>
              <strong className="text-white text-sm block truncate">{savedSaleSummary.clientName}</strong>
            </div>
            <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-850">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Valor Total</span>
              <strong className="text-emerald-400 font-mono text-sm block">
                {formatCurrency(savedSaleSummary.totalValue)}
              </strong>
            </div>
            <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-850">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Pagamento</span>
              <strong className="text-cyan-400 uppercase text-xs block">
                {savedSaleSummary.paymentMethod || "Dinheiro"}
              </strong>
            </div>
            <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-850">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Situação</span>
              <strong className={`text-xs block ${savedSaleSummary.balanceDue > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {savedSaleSummary.balanceDue > 0
                  ? `Sinal: ${formatCurrency(savedSaleSummary.downPayment)} (Resta ${formatCurrency(savedSaleSummary.balanceDue)})`
                  : "Quitada Integralmente"}
              </strong>
            </div>
          </div>

          {/* Delivery & Logistics Details */}
          <div
            id="saved-sale-delivery-details"
            data-testid="saved-sale-delivery-details"
            className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-brand-cyan font-bold text-xs uppercase tracking-wide">
                <Truck className="h-4 w-4" />
                <span>Dados de Logística e Entrega</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                {savedSaleSummary.useMotoboy ? "🛵 Entrega por Motoboy" : "🏢 Retirada no Balcão"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11px]">
              <div>
                <span className="text-slate-500 block text-[10px]">Endereço de Entrega:</span>
                <span
                  id="saved-delivery-address"
                  data-testid="saved-delivery-address"
                  className="font-bold text-slate-100 block"
                >
                  {savedSaleSummary.deliveryAddress || "Endereço não informado"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Custo / Taxa Motoboy:</span>
                <span className="font-mono font-bold text-slate-200 block">
                  {savedSaleSummary.motoboyCost ? formatCurrency(savedSaleSummary.motoboyCost) : "R$ 0,00"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Data de Previsão:</span>
                <span className="font-bold text-slate-200 block">
                  {savedSaleSummary.deliveryDate || "Não informada"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              id="btn-print-receipt-from-summary"
              data-testid="btn-print-receipt-from-summary"
              onClick={() => generatePDF(savedSaleSummary)}
              className="px-3.5 py-2 bg-brand-cyan/20 hover:bg-brand-cyan/30 text-brand-cyan font-bold text-xs rounded-xl border border-brand-cyan/40 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <FileText className="h-4 w-4" />
              <span>Gerar / Baixar Recibo PDF</span>
            </button>
            <button
              type="button"
              onClick={() => {
                fetch("/api/send-receipt", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    filename: `Recibo_${savedSaleSummary.clientName.replace(/\s+/g, "_")}_${savedSaleSummary.id}.pdf`,
                    clientName: savedSaleSummary.clientName
                  })
                })
                .then(r => r.json())
                .then(d => setSuccessMessage(d.message || "Recibo enviado com sucesso!"))
                .catch(() => setSuccessMessage("Recibo enviado!"));
              }}
              className="px-3.5 py-2 bg-brand-magenta/20 hover:bg-brand-magenta/30 text-brand-magenta font-bold text-xs rounded-xl border border-brand-magenta/40 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <span>Enviar Recibo p/ Cliente 📤</span>
            </button>
          </div>
        </div>
      )}

      {/* In-App Receipt Modal for Visual Inspection & E2E Validation */}
      {latestReceiptModalData && (
        <div
          id="receipt-modal"
          data-testid="receipt-modal"
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="bg-slate-900 border border-brand-cyan/40 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-brand-cyan" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Recibo Digital do Pedido</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLatestReceiptModalData(null);
                  setReceiptSendSuccess(null);
                }}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-md bg-slate-800 cursor-pointer"
              >
                ✕ Fechar
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-300 p-2 bg-slate-950/60 rounded-lg">
                <span className="text-slate-400">Cliente:</span>
                <strong className="text-white">{latestReceiptModalData.clientName}</strong>
              </div>
              <div className="flex justify-between text-slate-300 p-2 bg-slate-950/60 rounded-lg">
                <span className="text-slate-400">Valor Total:</span>
                <strong className="text-emerald-400 font-mono text-sm">
                  {formatCurrency(latestReceiptModalData.totalValue)}
                </strong>
              </div>
              <div className="flex justify-between text-slate-300 p-2 bg-slate-950/60 rounded-lg">
                <span className="text-slate-400">Forma de Pagamento:</span>
                <span className="font-bold text-cyan-300 uppercase">{latestReceiptModalData.paymentMethod}</span>
              </div>

              {/* PIX Payment Details Box */}
              <div
                id="receipt-pix-info"
                data-testid="receipt-pix-info"
                className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs"
              >
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Dados de Pagamento PIX:
                </div>
                <div className="text-cyan-300 font-mono font-bold text-sm">
                  Chave PIX: {latestReceiptModalData.pixKey}
                </div>
                <div className="text-slate-400 text-[11px]">
                  Beneficiário: {company?.tradingName || company?.corporateName || "Núcleo Comunicação Visual"}
                </div>
                {company?.cnpj && (
                  <div className="text-slate-500 text-[10px]">
                    CNPJ: {company.cnpj}
                  </div>
                )}
              </div>

              {latestReceiptModalData.deliveryAddress && (
                <div
                  id="receipt-delivery-info"
                  data-testid="receipt-delivery-info"
                  className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs"
                >
                  <span className="text-slate-400">Destino / Entrega: </span>
                  <span className="text-white font-bold">{latestReceiptModalData.deliveryAddress}</span>
                </div>
              )}
            </div>

            {receiptSendSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>{receiptSendSuccess}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <a
                id="btn-download-receipt-pdf"
                data-testid="btn-download-receipt-pdf"
                href={latestReceiptModalData.pdfBlobUrl || latestReceiptModalData.pdfBase64}
                download={latestReceiptModalData.docName}
                className="flex-1 py-2.5 px-3 bg-brand-cyan hover:bg-brand-cyan/80 text-slate-950 font-black text-xs uppercase text-center rounded-xl transition-all cursor-pointer shadow-md"
              >
                Baixar PDF
              </a>
              <button
                type="button"
                id="btn-send-receipt"
                data-testid="btn-send-receipt"
                onClick={() => {
                  fetch("/api/send-receipt", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      filename: latestReceiptModalData.docName,
                      clientName: latestReceiptModalData.clientName
                    })
                  })
                  .then(res => res.json())
                  .then(data => {
                    setReceiptSendSuccess(data.message || "Recibo enviado com sucesso!");
                  })
                  .catch(() => {
                    setReceiptSendSuccess("Recibo enviado para o cliente!");
                  });
                }}
                className="flex-1 py-2.5 px-3 bg-brand-magenta hover:bg-brand-magenta/80 text-white font-black text-xs uppercase text-center rounded-xl transition-all cursor-pointer shadow-md"
              >
                Enviar Recibo 📤
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main card grid layout for sales inputs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Columns - Client data and Products Table (2/3 width on large) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Section 1: Client Metadata */}
          <div className="bg-brand-card border border-slate-800 rounded-xl p-4 relative">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-xs font-black text-slate-100 uppercase tracking-widest flex items-center gap-1.5">
                <span className="h-4.5 w-1 rounded bg-brand-magenta"></span>
                Dados do Cliente
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (!checkRegisterBeforeAction("localizar clientes")) return;
                  setClientSearchTerm("");
                  setShowLocateClientModal(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black text-white bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 active:scale-95 transition-all duration-200 cursor-pointer border border-blue-450/20 shrink-0"
              >
                <Search className="h-3 w-3" />
                Localizar Cliente
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                  <UserIcon className="h-3 w-3 text-slate-500" />
                  Nome do Cliente <span className="text-brand-magenta">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    disabled={!isRegisterOpen}
                    placeholder={!isRegisterOpen ? "🔒 Abra o caixa para informar o cliente" : "Ex: João Silva de Souza"}
                    value={clientName}
                    onClick={() => { if (!isRegisterOpen) checkRegisterBeforeAction("informar o nome do cliente"); }}
                    onChange={(e) => setClientName(e.target.value)}
                    className={`w-full bg-slate-950/80 border ${!isRegisterOpen ? 'border-red-900/40 text-slate-500 cursor-not-allowed' : 'border-slate-800 text-slate-100'} rounded-lg py-1.5 pl-2.5 pr-8 text-xs placeholder-slate-650 focus:outline-none focus:border-brand-magenta focus:ring-1 focus:ring-brand-magenta/30 transition-all font-medium h-[32px]`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                  <Phone className="h-3 w-3 text-slate-500" />
                  Telefone / Celular
                </label>
                <input
                  type="text"
                  disabled={!isRegisterOpen}
                  placeholder={!isRegisterOpen ? "🔒 Caixa fechado" : "Ex: (11) 99999-9999"}
                  value={clientPhone}
                  onClick={() => { if (!isRegisterOpen) checkRegisterBeforeAction("informar o telefone do cliente"); }}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className={`w-full bg-slate-950/80 border ${!isRegisterOpen ? 'border-red-900/40 text-slate-500 cursor-not-allowed' : 'border-slate-800 text-slate-100'} rounded-lg py-1.5 px-2.5 text-xs placeholder-slate-600 focus:outline-none focus:border-brand-magenta focus:ring-1 focus:ring-brand-magenta/30 transition-all font-mono h-[32px]`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-500" />
                  Data do Pedido
                </label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg py-1.5 px-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta focus:ring-1 focus:ring-brand-magenta/30 transition-all font-mono h-[32px]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-500" />
                  Entrega / Previsão
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg py-1.5 px-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta focus:ring-1 focus:ring-brand-magenta/30 transition-all font-mono h-[32px]"
                />
              </div>
            </div>

            {/* Imagens Anexadas (Opcional) - Versão Compacta Estilo "Dense UI" */}
            <div 
              ref={pastezoneRef}
              onPaste={handlePaste}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`mt-3 p-2 rounded-lg border border-dashed transition-all ${
                dragActive 
                  ? "border-brand-magenta bg-brand-magenta/10" 
                  : "border-slate-800 bg-slate-950/30 hover:bg-slate-950/55"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 px-1.5 bg-brand-magenta/10 text-brand-magenta rounded border border-brand-magenta/15 shrink-0">
                    <Paperclip className="h-3 w-3" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-slate-200 uppercase tracking-wider leading-none">Imagens do Cliente / Orçamento</h4>
                    <span className="text-[8px] text-slate-500 mt-0.5 block leading-none">Pressione Ctrl+V para colar, ou arraste e solte</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    multiple
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={triggerFileSelect}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:border-slate-700 text-slate-200 text-[10px] font-bold cursor-pointer transition-colors h-[24px]"
                  >
                    <Upload className="h-2.5 w-2.5 text-brand-magenta" />
                    <span>Anexar</span>
                  </button>
                </div>
              </div>

              {/* Grid Compacto de Previsualização */}
              {imageItems.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2 pt-2 border-t border-slate-900">
                  {imageItems.map((img) => (
                    <div key={img.id} className="relative group aspect-square rounded overflow-hidden bg-slate-900 border border-slate-850">
                      <img 
                        src={img.url} 
                        alt="Anexada" 
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImageItems(prev => prev.filter(x => x.id !== img.id));
                          if (img.url.startsWith("blob:")) {
                            URL.revokeObjectURL(img.url);
                          }
                        }}
                        className="absolute inset-0 bg-red-950/90 hover:bg-red-900/90 text-red-200 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center text-[8px] font-black uppercase cursor-pointer"
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400 mb-0.5" />
                        Excluir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Products & Line Items Table */}
          <div className="bg-brand-card border border-slate-800 rounded-2xl p-6 relative">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="h-5 w-1.5 rounded bg-brand-cyan"></span>
                Itens e Serviços Adicionados
              </h2>
              
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/20 transition-all cursor-pointer"
                title={isPricingLocked ? "Adicione produtos cadastrados pelo Administrador" : "Adicionar Linha"}
              >
                <Plus className="h-3.5 w-3.5" />
                {isPricingLocked ? "Adicionar Produto Cadastrado" : "Adicionar Linha"}
              </button>
            </div>

            {/* Dynamic Items list */}
            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="bg-slate-950/55 p-3 rounded-xl border border-slate-850 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                >
                  {/* Badge + Description field combined */}
                  <div className={`col-span-1 ${isPricingLocked ? "md:col-span-6" : "md:col-span-5"} flex items-center gap-2`}>
                    <span className="inline-flex items-center justify-center h-5 w-5 shrink-0 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      placeholder="Descrição do produto ou serviço"
                      value={item.description}
                      readOnly={isPricingLocked}
                      onChange={(e) => handleItemFieldChange(item.id, "description", e.target.value)}
                      className={`w-full bg-slate-900/90 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-750 focus:ring-1 focus:ring-slate-700 font-medium ${
                        isPricingLocked ? "cursor-not-allowed text-slate-300 bg-slate-950/40" : ""
                      }`}
                      title={isPricingLocked ? "Descrição fixa cadastrada pelo Administrador" : "Descrição do produto ou serviço"}
                    />
                  </div>

                  {/* Quantity field */}
                  <div className={`col-span-1 ${isPricingLocked ? "md:col-span-2" : "md:col-span-1"}`}>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-medium text-slate-500 md:hidden">Qtd:</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="Qtd"
                        value={item.quantity === "0" ? "" : item.quantity}
                        onChange={(e) => handleItemFieldChange(item.id, "quantity", e.target.value)}
                        className="w-full bg-slate-900/90 border border-slate-800 rounded-lg py-2 px-1 text-xs text-center font-mono text-slate-100 placeholder-slate-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Unit cost field (individual product expense - hidden for attendants) */}
                  {(!isAttendant || adminUnlocked) && (
                    <div className="col-span-1 md:col-span-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-medium text-slate-500 md:hidden">Custo Unit:</span>
                        <div className="relative w-full">
                          <span className="absolute left-2.5 top-2 text-[10px] font-mono text-red-400">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Custo Unit"
                            value={item.unitCost === "0" || !item.unitCost ? "" : item.unitCost}
                            onChange={(e) => handleItemFieldChange(item.id, "unitCost", e.target.value)}
                            className="w-full bg-slate-900/90 border border-slate-800 rounded-lg py-2 pl-7 pr-1.5 text-xs font-mono text-red-300 placeholder-slate-500 focus:outline-none focus:border-red-500/20"
                            title="Custo unitário de compra/produção"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Unit retail price field */}
                  <div className="col-span-1 md:col-span-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-medium text-slate-500 md:hidden">Venda Unit:</span>
                      <div className="relative w-full">
                        <span className="absolute left-2.5 top-2 text-[10px] font-mono text-slate-500">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Preço Venda"
                          readOnly={isPricingLocked}
                          onClick={() => {
                            if (isPricingLocked && onRequestAdminUnlock) {
                              onRequestAdminUnlock(() => {}, "Alterar o valor unitário do produto exige autorização do Administrador.");
                            }
                          }}
                          value={item.unitValue === "0" ? "" : item.unitValue}
                          onChange={(e) => handleItemFieldChange(item.id, "unitValue", e.target.value)}
                          className={`w-full bg-slate-900/90 border border-slate-800 rounded-lg py-2 pl-7 pr-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none ${isPricingLocked ? "cursor-not-allowed text-slate-400 border-slate-900 bg-slate-950/20" : ""}`}
                          title={isPricingLocked ? "Clique para solicitar liberação da alteração de valores" : "Preço Unitário de Venda"}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Computed item total */}
                  <div className="col-span-1 md:col-span-2 flex items-center justify-between gap-2 pl-2">
                    <div className="hidden md:block text-right">
                      <span className="text-[10px] block text-slate-500 font-mono">Total</span>
                      <span className="text-xs font-semibold text-slate-300 font-mono">
                        R$ {item.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    
                    {/* Display inline total for mobile view */}
                    <span className="md:hidden text-xs text-slate-400 font-mono">
                      Subtotal: <strong className="text-slate-250">R$ {item.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                    </span>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-900 transition-colors cursor-pointer"
                      title="Excluir item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Catalog Item Injection Selector */}
            {catalogProducts && catalogProducts.length > 0 && (
              <div className="mt-4 p-3 bg-slate-900/60 border border-slate-850 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-350 uppercase tracking-wide">
                  <Boxes className="h-3.5 w-3.5 text-brand-cyan" />
                  <span>Adicionar Produto Já Cadastrado:</span>
                </div>
                {catalogSuccessMessage && (
                  <div className="text-[10px] text-emerald-450 font-bold bg-emerald-950/20 border border-emerald-940/30 px-2 py-1 rounded-lg animate-fade-in flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                    <span>{catalogSuccessMessage}</span>
                  </div>
                )}
                <div className="relative">
                  <select
                    id="catalog-product-selector"
                    disabled={!isRegisterOpen}
                    onChange={(e) => {
                      if (!checkRegisterBeforeAction("adicionar produtos do catálogo")) {
                        e.target.value = "";
                        return;
                      }
                      const val = e.target.value;
                      if (val) {
                        const prod = catalogProducts.find(p => p.id === val);
                        if (prod) {
                          handleAddCatalogProductToSale(prod);
                        }
                        e.target.value = ""; // Reset
                      }
                    }}
                    className={`w-full bg-slate-950/90 border ${!isRegisterOpen ? 'border-red-900/40 text-slate-500 cursor-not-allowed' : 'border-slate-800 text-slate-300'} rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-brand-cyan transition-all cursor-pointer`}
                  >
                    <option value="">{isRegisterOpen ? "-- Selecione do catálogo de produtos cadastrados --" : "🔒 Abra o caixa para selecionar do catálogo"}</option>
                    {catalogProducts.map(p => (
                      <option key={p.id} value={p.id} className="text-slate-200">
                        {p.description} (Preço de Venda: R$ {p.salePrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | Estoque Disponível: {p.currentStock})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* List subtotal helper */}
            <div className="mt-4 pt-3 border-t border-slate-850 flex justify-between items-center text-xs text-slate-400 font-mono">
              <span>Soma Parcial dos Itens:</span>
              <span className="text-md text-slate-200 font-bold">
                R$ {subtotalProducts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Section 3: Vendas Rápidas */}
          <div className="bg-brand-card border border-slate-800 rounded-2xl p-6 relative">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="h-5 w-1.5 rounded bg-brand-magenta"></span>
                Vendas Rápidas
              </h2>
              {(!isAttendant || adminUnlocked) && (
                <button
                  type="button"
                  onClick={() => setShowQuickSalesManager(!showQuickSalesManager)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer transition-all uppercase tracking-wider"
                >
                  {showQuickSalesManager ? (
                    <>
                      <X className="h-3 w-3 text-red-550" />
                      <span>Voltar</span>
                    </>
                  ) : (
                    <>
                      <Settings className="h-3 w-3 text-brand-cyan" />
                      <span>Configurar</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {showQuickSalesManager && (!isAttendant || adminUnlocked) ? (
              /* Configurator and manager view */
              <div className="space-y-4">
                <form onSubmit={handleAddNewQS} className="p-4 bg-slate-950/60 border border-slate-850 rounded-xl space-y-3">
                  <h3 className="text-xs font-bold text-slate-305 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-850/60 pb-2">
                    {editingQSId ? (
                      <>
                        <Edit className="h-3.5 w-3.5 text-brand-magenta animate-pulse" />
                        Editar Botão de Venda Rápida
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5 text-brand-magenta" />
                        Cadastrar Botão de Venda Rápida
                      </>
                    )}
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição / Nome do Item</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Plastificação A4"
                        value={newQSDescription}
                        onChange={(e) => setNewQSDescription(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none focus:border-brand-magenta"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Preço Venda (R$)</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: 5,00"
                          value={newQSPrice}
                          onChange={(e) => setNewQSPrice(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 px-2.5 text-xs text-white font-mono focus:outline-none focus:border-brand-magenta"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Preço Custo (R$)</label>
                        <input
                          type="text"
                          placeholder="Ex: 1,50"
                          value={newQSCost}
                          onChange={(e) => setNewQSCost(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 px-2.5 text-xs text-white font-mono focus:outline-none focus:border-brand-magenta"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Selecione uma Cor Gradiente (Mais Opções)</label>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {[
                        { name: "Cobalto", grad: "from-purple-600 via-fuchsia-600 to-pink-500" },
                        { name: "Oceano", grad: "from-cyan-500 to-blue-600" },
                        { name: "Vulcão", grad: "from-orange-500 to-rose-600" },
                        { name: "Floresta", grad: "from-emerald-500 to-teal-600" },
                        { name: "Roxo Real", grad: "from-indigo-650 via-purple-600 to-fuchsia-600" },
                        { name: "Solar", grad: "from-amber-500 to-yellow-600" },
                        { name: "Cinza Estelar", grad: "from-slate-705 to-slate-900" },
                        { name: "Neon", grad: "from-pink-600 to-rose-500" },
                        { name: "Pôr do Sol", grad: "from-orange-400 via-rose-500 to-purple-600" },
                        { name: "Menta Fresca", grad: "from-teal-400 to-emerald-500" },
                        { name: "Aurora", grad: "from-green-400 to-blue-500" },
                        { name: "Miami Beach", grad: "from-cyan-400 via-pink-400 to-purple-500" },
                        { name: "Elétrico", grad: "from-blue-600 via-violet-500 to-pink-500" },
                        { name: "Cacau", grad: "from-amber-700 to-amber-900" },
                        { name: "Beringela", grad: "from-fuchsia-800 to-purple-950" },
                        { name: "Abissal Black", grad: "from-slate-900 to-black" }
                      ].map((item) => (
                        <button
                          key={item.grad}
                          type="button"
                          onClick={() => setNewQSGradient(item.grad)}
                          className={`h-8 rounded-lg bg-gradient-to-r ${item.grad} relative flex items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95 border ${
                            newQSGradient === item.grad ? "border-white ring-2 ring-brand-magenta" : "border-transparent"
                          }`}
                          title={item.name}
                        >
                          {newQSGradient === item.grad && <Check className="h-4 w-4 text-white drop-shadow" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    {editingQSId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQSId(null);
                          setNewQSDescription("");
                          setNewQSPrice("");
                          setNewQSCost("");
                        }}
                        className="px-3 py-2 rounded-lg text-xs font-bold text-slate-400 bg-slate-900 hover:bg-slate-850 border border-slate-800 transition-all cursor-pointer"
                      >
                        Cancelar Edição
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-brand-magenta to-pink-600 hover:from-pink-650 hover:to-brand-magenta active:scale-95 transition-all shadow-md cursor-pointer"
                    >
                      {editingQSId ? "Salvar Alterações" : "+ Cadastrar Botão de Venda"}
                    </button>
                  </div>
                </form>

                {/* List of current quick sales for deletion */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider font-mono">Botões Ativos ({quickSales.length})</h4>
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 border border-slate-900 rounded-xl p-2 bg-slate-950/20">
                    {quickSales.length === 0 ? (
                      <div className="text-center py-4 text-slate-500 text-xs">Nenhum botão cadastrado ainda.</div>
                    ) : (
                      quickSales.map((qs) => (
                        <div key={qs.id} className="flex items-center justify-between p-2 bg-slate-900 border border-slate-850 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className={`h-3 w-3 rounded bg-gradient-to-r ${qs.gradient} shrink-0`}></span>
                            <span className="text-xs font-semibold text-slate-200">{qs.description}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right text-[10px] font-mono leading-tight">
                              <div className="text-brand-cyan font-bold">Venda: R$ {qs.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                              <div className="text-slate-550">Custo: R$ {(qs.cost || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleStartEditQS(qs, e)}
                              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded cursor-pointer transition-colors"
                              title="Editar Botão"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteQS(qs.id, e)}
                              className="p-1 hover:bg-slate-800 text-red-400 hover:text-red-300 rounded cursor-pointer transition-colors"
                              title="Excluir Botão"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Display clickable Quick Sales gradient buttons */
              <div className="space-y-4">
                <p className="text-xs text-slate-400">
                  Clique nos botões gradientes para escolher a quantidade do item. O valor e a soma serão gerados automaticamente para salvar ou imprimir de forma ultra-rápida!
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {quickSales.map((qs) => (
                    <button
                      key={qs.id}
                      type="button"
                      onClick={() => {
                        if (!checkRegisterBeforeAction("lançar itens de vendas rápidas")) return;
                        setActiveQuickSaleItem(qs);
                        setQuickSaleQty("1");
                      }}
                      className="group flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold rounded-lg text-slate-300 bg-slate-950 border border-slate-800 hover:bg-gradient-to-r hover:from-brand-magenta hover:to-pink-600 hover:text-white hover:border-transparent shadow-sm hover:scale-[1.02] active:scale-95 cursor-pointer transition-all duration-200 min-w-0"
                    >
                      <Zap className="h-3.5 w-3.5 text-brand-magenta group-hover:text-white shrink-0 transition-colors" />
                      <span className="truncate tracking-wide">{qs.description}</span>
                    </button>
                  ))}
                </div>

                {/* Real-time Order Summary and Fast Actions */}
                <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-4 w-4 text-brand-magenta fill-brand-magenta" />
                      <span className="text-xs font-bold text-slate-300">Total do Carrinho:</span>
                    </div>
                    <span className="text-lg font-mono font-black text-white bg-slate-900 border border-slate-850 px-3 py-1 rounded-xl shadow-[0_0_10px_rgba(255,20,147,0.1)]">
                      R$ {subtotalProducts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!checkRegisterBeforeAction("salvar vendas rápidas")) return;
                        const validItems = items.filter(item => item.description.trim() !== "");
                        if (validItems.length === 0) {
                          alert("Adicione produtos clicando nas vendas rápidas acima antes de salvar.");
                          return;
                        }
                        await handleSaveSale(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:from-green-600 hover:to-emerald-500 shadow-md shadow-emerald-900/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>Salvar Venda Rápida</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!checkRegisterBeforeAction("imprimir vendas rápidas")) return;
                        const validItems = items.filter(item => item.description.trim() !== "");
                        if (validItems.length === 0) {
                          alert("Adicione produtos clicando nas vendas rápidas acima antes de imprimir.");
                          return;
                        }
                        generatePDF(false, true);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-brand-cyan to-blue-600 hover:from-blue-600 hover:to-brand-cyan shadow-md shadow-cyan-900/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      <span>Imprimir Venda Rápida</span>
                    </button>
                  </div>
                  
                  {items.length > 0 && !(items.length === 1 && items[0].description === "" && items[0].unitValue === "0") && (
                    <div className="flex justify-center pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Deseja realmente limpar todos os itens do pedido atual?")) {
                            setItems([{ id: "1", description: "", quantity: "1", unitValue: "0", totalValue: 0 }]);
                            setCostBreakdownItems([]);
                            setOperationCostInput("0");
                          }
                        }}
                        className="text-[10px] font-extrabold text-red-400 hover:text-red-300 hover:underline flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <Trash2 className="h-3 w-3" /> Limpar Carrinho Atual
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Sale Quantity Chosen modal popup overlay */}
          {activeQuickSaleItem && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-4">
              <div className="bg-brand-card border border-slate-800 rounded-2xl w-full max-w-sm p-6 text-slate-100 shadow-2xl relative animate-scale-up">
                <button
                  type="button"
                  onClick={() => setActiveQuickSaleItem(null)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-905 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-lg bg-gradient-to-r ${activeQuickSaleItem.gradient} flex items-center justify-center shadow`}>
                      <Zap className="h-4 w-4 text-white fill-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">{activeQuickSaleItem.description}</h3>
                      <p className="text-[11px] text-slate-400 leading-none">Preço: R$ {activeQuickSaleItem.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>

                  <div className="space-y-2 p-3 bg-slate-950/40 rounded-xl border border-slate-900">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quantidade</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={quickSaleQty}
                        onChange={(e) => setQuickSaleQty(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2.5 px-3 text-lg font-mono font-bold text-brand-cyan text-center focus:outline-none"
                        autoFocus
                      />
                    </div>

                    {/* Common Quantities Fast Selection Buttons */}
                    <div className="grid grid-cols-5 gap-1 pt-2">
                      {["1", "2", "5", "10", "50"].map((qt) => (
                        <button
                          key={qt}
                          type="button"
                          onClick={() => setQuickSaleQty(qt)}
                          className={`py-1 rounded text-[10px] font-mono font-bold border cursor-pointer transition-colors ${
                            quickSaleQty === qt 
                              ? "bg-brand-cyan/25 border-brand-cyan text-brand-cyan shadow-sm" 
                              : "bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-350"
                          }`}
                        >
                          {qt}x
                        </button>
                      ))}
                    </div>

                    {/* Quick math calculation visual assist */}
                    <div className="flex flex-col gap-1 text-[11px] font-mono border-t border-slate-800/60 mt-3 pt-2">
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Preço Unitário:</span>
                        <span>R$ {activeQuickSaleItem.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </div>
                      {(!isAttendant || adminUnlocked) && (
                        <div className="flex justify-between items-center text-slate-500">
                          <span>Custo Unitário:</span>
                          <span>R$ {(activeQuickSaleItem.cost || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-slate-300 mt-1 border-t border-slate-900 pt-1">
                        <span>Subtotal Total:</span>
                        <span className="text-brand-cyan font-bold">
                          R$ {((Number(quickSaleQty) || 1) * activeQuickSaleItem.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveQuickSaleItem(null)}
                      className="flex-1 py-2 rounded-lg text-xs font-bold text-slate-400 bg-slate-900 hover:bg-slate-850 hover:text-slate-300 border border-slate-800 transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const qtyVal = parseInt(quickSaleQty);
                        if (isNaN(qtyVal) || qtyVal <= 0) {
                          alert("Por favor, digite uma quantidade maior de 0.");
                          return;
                        }
                        handleAddQuickSaleToForm(activeQuickSaleItem.description, activeQuickSaleItem.price, qtyVal, activeQuickSaleItem.cost || 0);
                        setActiveQuickSaleItem(null);
                      }}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r ${activeQuickSaleItem.gradient} hover:brightness-110 active:scale-95 transition-all cursor-pointer text-center flex items-center justify-center gap-1`}
                    >
                      <Check className="h-3.5 w-3.5" /> Adicionar ao Carrinho
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Financial Dashboard Column (1/3 width on large) */}
        <div className="space-y-6">
          {/* Motoboy Service Frame */}
          <div className="bg-brand-card border border-slate-800 rounded-2xl p-6 relative">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span className="h-5 w-1.5 rounded bg-brand-cyan"></span>
              Serviço de Motoboy
            </h2>

            <div className="space-y-4">
              <label className="flex items-center gap-3 p-3 bg-slate-950/65 border border-slate-850 rounded-xl cursor-pointer hover:border-brand-cyan/30 transition-all select-none">
                <input
                  type="checkbox"
                  checked={useMotoboy}
                  onChange={(e) => setUseMotoboy(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-800 text-brand-cyan bg-slate-900 focus:ring-brand-cyan/20"
                />
                <div>
                  <span className="text-sm font-medium text-slate-200 block">Ativar Motoboy</span>
                  <span className="text-[11px] text-slate-400 block">Adicionar custos de frete à venda</span>
                </div>
              </label>

              {useMotoboy && (
                <div className="space-y-3 p-3 rounded-xl bg-slate-900 border border-slate-850 animate-fade-in">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5 text-slate-500" />
                      Valor do Motoboy (Para Cliente)
                    </label>
                    <div className="relative rounded-lg shadow-sm">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <span className="text-xs font-mono text-slate-500">R$</span>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={motoboyCostInput === "0" ? "" : motoboyCostInput}
                        onChange={(e) => setMotoboyCostInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm font-mono text-slate-150 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-500" />
                      Endereço de Entrega (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Rua, número, bairro, complemento..."
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-sm text-slate-150 focus:outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Checkout & Ledger (Gasto da Venda, Sinal, Desconto, Totais) */}
          <div className="bg-brand-card border-2 border-slate-800 rounded-2xl p-6 relative">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center justify-between w-full">
              <span className="flex items-center gap-2">
                <span className="h-5 w-1.5 rounded bg-brand-magenta"></span>
                Ajustes Financeiros
              </span>
              {!isAttendant && (
                <button
                  type="button"
                  onClick={() => setClientMode(!clientMode)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] md:text-xs font-bold transition-all border ${
                    clientMode 
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" 
                      : "bg-slate-850 text-slate-400 hover:text-slate-205 border-slate-800"
                  }`}
                  title={clientMode ? "Desativar Modo Cliente para exibir dados sensíveis" : "Ativar Modo Cliente para ocultar Custo e Lucro"}
                >
                  {clientMode ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" />
                      <span>Modo Cliente: ATIVO</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      <span>Modo Cliente: DESATIVADO</span>
                    </>
                  )}
                </button>
              )}
            </h2>

            <div className="space-y-4">
              {/* Internal Cost of Sale */}
              {(!isAttendant || adminUnlocked) && (
                clientMode ? (
                  <div className="p-4 bg-slate-900 border-2 border-dashed border-emerald-500/20 rounded-xl flex flex-col items-center justify-center text-center gap-2 transition-all">
                    <Lock className="h-5 w-5 text-emerald-400 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">🔒 MODO CLIENTE ATIVO</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Valores de custo de compra e margens de lucro líquido estão ocultos do monitor.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setClientMode(false)}
                      className="mt-1 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[10px] font-bold hover:bg-emerald-500/20 transition-all"
                    >
                      Exibir Custos
                    </button>
                  </div>
                ) : (
                <div className="p-3 bg-red-950/10 border border-red-900/10 rounded-xl space-y-2.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                      💸 Custo de Compra / Venda
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCostBreakdown(!showCostBreakdown);
                        if (!showCostBreakdown && costBreakdownItems.length === 0) {
                          handleAddCostItem();
                        }
                      }}
                      className="text-[10px] font-extrabold text-brand-cyan hover:underline flex items-center gap-1"
                    >
                      {showCostBreakdown ? "✍️ Valor Fixo" : "📋 Detalhar Peças/Gastos"}
                    </button>
                  </div>

                  {!showCostBreakdown ? (
                    <div className="space-y-1.5">
                      <div className="relative rounded-lg shadow-sm">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <span className="text-xs font-mono text-red-500/70">R$</span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Peças, insumos, frete terceirizado"
                          value={operationCostInput === "0" ? "" : operationCostInput}
                          onChange={(e) => {
                            setOperationCostInput(e.target.value);
                            if (costBreakdownItems.length > 0) setCostBreakdownItems([]);
                          }}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg py-2 pl-9 pr-3 text-sm font-mono text-red-350 focus:outline-none focus:border-red-500/40"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 block leading-tight">
                        Digite o custo total direto das peças ou frete terceirizado.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {costBreakdownItems.length === 0 ? (
                        <div className="text-center py-2 px-1 bg-slate-950/40 rounded-lg border border-slate-850/40 text-[10px] text-slate-400 italic">
                          Nenhum gasto detalhado ainda.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {costBreakdownItems.map((cItem, index) => (
                            <div key={cItem.id} className="flex gap-1.5 items-center">
                              <input
                                type="text"
                                placeholder={`Peça / Despesa ${index + 1}`}
                                value={cItem.description}
                                onChange={(e) => {
                                  handleCostItemChange(cItem.id, "description", e.target.value);
                                }}
                                className="flex-grow bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-red-500/20"
                              />
                              <div className="relative w-20 shrink-0">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="0,00"
                                  value={cItem.value === 0 ? "" : cItem.value}
                                  onChange={(e) => {
                                    handleCostItemChange(cItem.id, "value", Math.max(0, parseFloat(e.target.value) || 0));
                                  }}
                                  className="w-full bg-slate-950 border border-slate-850 rounded-lg pl-6 pr-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-red-500/20"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveCostItem(cItem.id)}
                                className="p-1.5 bg-red-950/20 text-red-400 hover:bg-red-950/40 rounded-lg border border-red-900/10 transition-colors shrink-0 cursor-pointer"
                                title="Remover item de gasto"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <button
                        type="button"
                        onClick={handleAddCostItem}
                        className="w-full flex items-center justify-center gap-1 py-1 px-3 bg-red-950/10 hover:bg-red-950/25 text-red-300 rounded-lg border border-dashed border-red-900/30 text-[11px] font-extrabold transition-colors cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Adicionar Item de Gasto</span>
                      </button>

                      <div className="pt-1.5 border-t border-slate-850 flex items-center justify-between text-xs text-slate-400">
                        <span>Total Custos Somados:</span>
                        <span className="font-mono font-bold text-red-400 bg-red-950/30 px-2 py-0.5 rounded border border-red-900/20">
                          R$ {operationCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
              )}

              {/* Final Discount */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  🏷️ Desconto Final Concedido
                </label>
                <div className="relative rounded-lg shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-xs font-mono text-slate-500">R$</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    readOnly={isPricingLocked}
                    onClick={() => {
                      if (isPricingLocked && onRequestAdminUnlock) {
                        onRequestAdminUnlock(() => {}, "Conceder desconto em vendas exige autorização do Administrador.");
                      }
                    }}
                    value={discountInput === "0" ? "" : discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className={`w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm font-mono text-slate-200 focus:outline-none ${isPricingLocked ? "cursor-not-allowed text-slate-400 bg-gradient-to-r from-slate-950 to-slate-950/40" : ""}`}
                    title={isPricingLocked ? "Clique para solicitar liberação de descontos com o Administrador" : "Desconto Concedido"}
                  />
                </div>
              </div>

              {/* Signal/Downpayment */}
              <div className="p-3 bg-emerald-950/10 border border-emerald-900/10 rounded-xl space-y-1.5 font-sans">
                <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  📥 Sinal / Entrada Recebida
                </label>
                <div className="relative rounded-lg shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-xs font-mono text-emerald-500/70">R$</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Valor pago na entrada"
                    value={downPaymentInput === "0" ? "" : downPaymentInput}
                    onChange={(e) => setDownPaymentInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg py-2 pl-9 pr-3 text-sm font-mono text-emerald-300 focus:outline-none focus:border-emerald-500/40"
                  />
                </div>
              </div>

              {/* Opções de Forma de Pagamento */}
              <div className="space-y-3 p-3.5 bg-slate-950/40 border border-slate-800 rounded-xl font-sans">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  💰 Forma de Pagamento da Entrada / Sinal
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('dinheiro')}
                    className={`py-2 px-1 rounded-xl border font-bold text-[10px] transition-all flex flex-col items-center gap-1.5 cursor-pointer hover:bg-slate-900/40 ${
                      paymentMethod === 'dinheiro'
                        ? 'bg-brand-magenta/10 border-brand-magenta text-brand-magenta scale-[1.03]'
                        : 'bg-slate-950 border-slate-850 text-slate-400'
                    }`}
                  >
                    <span className="text-sm">💵</span>
                    <span>DINHEIRO</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cartão')}
                    className={`py-2 px-1 rounded-xl border font-bold text-[10px] transition-all flex flex-col items-center gap-1.5 cursor-pointer hover:bg-slate-900/40 ${
                      paymentMethod === 'cartão'
                        ? 'bg-brand-magenta/10 border-brand-magenta text-brand-magenta scale-[1.03]'
                        : 'bg-slate-950 border-slate-850 text-slate-400'
                    }`}
                  >
                    <span className="text-sm">💳</span>
                    <span>CARTÃO</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('pix')}
                    className={`py-2 px-1 rounded-xl border font-bold text-[10px] transition-all flex flex-col items-center gap-1.5 cursor-pointer hover:bg-slate-900/40 ${
                      paymentMethod === 'pix'
                        ? 'bg-brand-magenta/10 border-brand-magenta text-brand-magenta scale-[1.03]'
                        : 'bg-slate-950 border-slate-850 text-slate-400'
                    }`}
                  >
                    <span className="text-sm">🌀</span>
                    <span>PIX</span>
                  </button>
                </div>
              </div>

              {/* Live Calculations Display Panel */}
              <div className="pt-4 border-t border-slate-800 space-y-2.5 font-mono text-sm text-slate-350">
                <div className="flex justify-between">
                  <span>Soma Itens:</span>
                  <span className="text-slate-200">
                    R$ {subtotalProducts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {useMotoboy && (
                  <div className="flex justify-between text-xs">
                    <span>Taxa Motoboy:</span>
                    <span className="text-brand-cyan">
                      + R$ {motoboyCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {discount > 0 && (
                  <div className="flex justify-between text-xs text-red-400">
                    <span>Desconto Concedido:</span>
                    <span>
                      - R$ {discount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-base font-bold bg-slate-950 p-2.5 rounded-xl border border-slate-850 text-white leading-normal">
                  <span className="text-brand-cyan">Total Cobrado:</span>
                  <span className="text-brand-cyan font-extrabold">
                    R$ {finalTotalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between text-xs px-2 text-slate-400">
                  <span>Valor Pago (Sinal):</span>
                  <span className="text-emerald-400">
                    R$ {downPayment.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between text-xs px-2 pb-2 text-slate-400">
                  <span>Saldo a Receber:</span>
                  <span className={balanceDueValue > 0 ? "text-yellow-500 font-bold" : "text-slate-400"}>
                    R$ {balanceDueValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {(!isAttendant || adminUnlocked) && !clientMode && (
                  <>
                    <div className="flex justify-between text-xs px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                      <span className="flex items-center gap-1">💸 Custo da Venda:</span>
                      <span className="text-red-400">
                        R$ {operationCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs px-2.5 py-1.5 rounded bg-brand-cyan/5 border border-brand-cyan/15 text-slate-200">
                      <span className="flex items-center gap-1 font-bold">✨ Lucro do Pedido:</span>
                      <span className="text-brand-cyan font-bold">
                        R$ {netProfitValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons Frame */}
              <div className="space-y-2 pt-4">
                {activeEditingSale ? (
                  activeEditingSale.isBudget ? (
                    <div className="space-y-2">
                      {/* We are editing/loading an existing Budget */}
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={handleSaveBudget}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-brand-cyan to-cyan-500 shadow-lg shadow-brand-cyan/20 cursor-pointer transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {isUploading ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        <span>{isUploading ? "Atualizando..." : "Atualizar Orçamento"}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={handleExecuteBudget}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-950/40 cursor-pointer transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <Check className="h-4 w-4 text-emerald-100" />
                        <span>Executar Orçamento (Lançar como Venda)</span>
                      </button>
                    </div>
                  ) : (
                    /* We are editing a definitive Sale */
                    <div className="space-y-2">
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Truck className="h-4 w-4 text-cyan-400" />
                            <span>Entrega do Material</span>
                          </span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                            materialEntregue
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                          }`}>
                            {materialEntregue ? "Entregue" : "Pendente"}
                          </span>
                        </div>

                        {!materialEntregue ? (
                          <button
                            type="button"
                            id="confirm-delivery-btn"
                            data-testid="confirm-delivery-button"
                            aria-label="Confirmar Entrega"
                            onClick={() => {
                              setMaterialEntregue(true);
                            }}
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] transition-all cursor-pointer shadow-md uppercase tracking-wide"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Confirmar Entrega</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setMaterialEntregue(false);
                            }}
                            className="w-full text-center text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer py-1"
                          >
                            Reverter para Pendente
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isUploading || !isRegisterOpen}
                        onClick={() => handleSaveSale(false)}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-white bg-gradient-to-r from-brand-magenta to-pink-600 hover:from-pink-600 hover:to-brand-magenta shadow-lg shadow-pink-900/30 transition-all cursor-pointer transform hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {isUploading ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        <span>{isUploading ? "Atualizando..." : "Atualizar Histórico de Venda"}</span>
                      </button>
                    </div>
                  )
                ) : (
                  /* Standard creation mode - Can choose to Save as definitive Sale or Orçamento */
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={isUploading || !isRegisterOpen}
                      onClick={() => handleSaveSale(false)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl font-bold text-white bg-gradient-to-r from-brand-magenta to-pink-600 hover:from-pink-600 hover:to-brand-magenta shadow-lg shadow-pink-900/30 transition-all cursor-pointer transform hover:-translate-y-0.5 text-xs sm:text-sm disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {isUploading ? (
                        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 shrink-0" />
                      )}
                      <span>{isUploading ? "Salvando..." : "Salvar no Sistema"}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUploading || !isRegisterOpen}
                      onClick={handleSaveBudget}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-brand-cyan to-cyan-500 shadow-lg shadow-brand-cyan/20 cursor-pointer transform hover:-translate-y-0.5 transition-all text-xs sm:text-sm disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {isUploading ? (
                        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0" />
                      )}
                      <span>{isUploading ? "Trabalhando..." : "Orçamento"}</span>
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => generatePDF()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-1.5 rounded-xl font-bold text-slate-200 bg-slate-900 border border-slate-800 hover:border-brand-cyan/40 hover:bg-slate-850 cursor-pointer transition-colors text-[10px] md:text-xs"
                    title="Gerar e abrir PDF do cupom A4 na tela para download"
                  >
                    <FileDown className="h-4 w-4 text-brand-cyan shrink-0" />
                    <span>Emissão PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintThermalReceipt}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-1.5 rounded-xl font-bold text-amber-400 bg-slate-900 border border-slate-800 hover:border-amber-500/40 hover:bg-slate-850 cursor-pointer transition-colors text-[10px] md:text-xs"
                    title="Imprimir Cupom Não Fiscal (Térmica 80mm)"
                  >
                    <Printer className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>Imprimir Cupom</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-1.5 rounded-xl font-bold text-emerald-400 bg-slate-900 border border-slate-800 hover:border-emerald-500/30 hover:bg-slate-850 cursor-pointer transition-colors text-[10px] md:text-xs"
                    title="Enviar recibo digital via WhatsApp para o cliente"
                  >
                    <svg className="h-4 w-4 fill-current text-emerald-450 shrink-0" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.32 1.448 5.148 1.451h-.001c5.45-.002 9.88-4.416 9.884-9.84a9.75 9.75 0 0 0-2.882-6.956 9.773 9.773 0 0 0-6.968-2.891c-5.462 0-9.897 4.417-9.901 9.844a9.78 9.78 0 0 0 1.47 5.006l-.995 3.634 3.74-.984zm11.166-7.531c-.301-.15-1.78-.876-2.056-.976-.275-.1-.475-.15-.675.15-.199.3-.775.976-.95 1.176-.175.2-.35.225-.65.075-.301-.15-1.267-.467-2.414-1.485-.893-.795-1.495-1.778-1.671-2.078-.175-.3-.018-.462.13-.61.135-.133.301-.35.451-.524.15-.175.2-.3.3-.5.1-.2.05-.375-.025-.526-.075-.15-.675-1.625-.925-2.225-.244-.588-.493-.508-.675-.517-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.376-.275.3-1.05 1.026-1.05 2.5 0 1.475 1.075 2.9 1.225 3.1.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.228 1.368.196 1.883.119.574-.086 1.78-.726 2.03-1.426.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.35z"/>
                    </svg>
                    <span>Faturar Whats</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-1.5 rounded-xl font-semibold text-slate-400 bg-slate-950 border border-slate-900 hover:text-slate-200 hover:border-slate-800 hover:bg-slate-900 cursor-pointer transition-colors text-[10px] md:text-xs"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Limpar</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* 
        =========================================
        LOCATE CLIENT MODAL OVERLAY
        =========================================
      */}
      {showLocateClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in text-slate-100">
          <div className="relative max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Search className="h-4 w-4 text-brand-magenta" />
                Localizar Cliente Registrado
              </h3>
              <button
                type="button"
                onClick={() => setShowLocateClientModal(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="p-4 border-b border-slate-850 bg-slate-900/50">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar pelo nome ou telefone..."
                  value={clientSearchTerm}
                  onChange={(e) => setClientSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-magenta focus:ring-1 focus:ring-brand-magenta/30 transition-all font-medium"
                  autoFocus
                />
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              </div>
              <p className="text-[10px] text-slate-500 mt-2 font-medium">
                Retornando clientes recorrentes dos históricos de pedidos e orçamentos anteriores.
              </p>
            </div>

            {/* Client Lists Container */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-950/20 max-h-[50vh]">
              {previousClients.length === 0 ? (
                <div className="text-center py-8 text-slate-500 space-y-2">
                  <UserIcon className="h-8 w-8 mx-auto text-slate-700 stroke-[1.5]" />
                  <p className="text-sm">Nenhum cliente registrado no sistema ainda.</p>
                  <p className="text-xs text-slate-600">Salve uma venda ou orçamento para cadastrar.</p>
                </div>
              ) : filteredClientsForSearch.length === 0 ? (
                <div className="text-center py-8 text-slate-500 space-y-1">
                  <Search className="h-8 w-8 mx-auto text-slate-700 stroke-[1.5]" />
                  <p className="text-sm">Nenhum cliente encontrado para "{clientSearchTerm}"</p>
                  <p className="text-xs text-slate-650">Verifique a grafia ou o número digitado.</p>
                </div>
              ) : (
                filteredClientsForSearch.map((client, idx) => {
                  const initial = client.name ? client.name.charAt(0).toUpperCase() : "?";
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setClientName(client.name);
                        setClientPhone(client.phone);
                        setShowLocateClientModal(false);
                      }}
                      className="w-full text-left bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-brand-magenta/20 p-3.5 rounded-xl flex items-center justify-between gap-3 transition-all group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-pink-950/40 border border-pink-900/30 text-brand-magenta font-bold flex items-center justify-center text-sm uppercase shrink-0 group-hover:scale-105 transition-transform">
                          {initial}
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-sm text-slate-200 group-hover:text-white transition-colors">
                            {client.name}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-slate-450 font-mono">
                            <span>{client.phone || "Sem telefone"}</span>
                            {client.lastOrderDate && (
                              <>
                                <span className="text-slate-700">•</span>
                                <span className="text-slate-450 font-sans">Ped: {client.lastOrderDate.split('-').reverse().join('/')}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="shrink-0 flex items-center gap-2">
                        <span className="text-[10px] py-0.5 px-2 rounded-full font-bold bg-slate-800 text-slate-300 border border-slate-750 group-hover:bg-brand-magenta/15 group-hover:text-brand-magenta group-hover:border-brand-magenta/10 transition-all">
                          {client.orderCount} {client.orderCount === 1 ? "pedido" : "pedidos"}
                        </span>
                        <div className="h-7 w-7 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:text-brand-magenta group-hover:border-brand-magenta/30 transition-all shrink-0">
                          <Check className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity animate-fade-in" />
                          <span className="text-xs font-bold block group-hover:hidden transition-all">...</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end gap-2 text-xs">
              <span className="text-slate-500 font-medium self-center">
                Total de {previousClients.length} {previousClients.length === 1 ? "cliente único" : "clientes únicos"}
              </span>
              <button
                type="button"
                onClick={() => setShowLocateClientModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg font-bold transition-all cursor-pointer"
              >
                Voltar
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* 
        =========================================
        THERMAL RECEIPT PRINT CONTAINER (80mm)
        =========================================
      */}
      <div id="thermal-receipt-print" className="hidden print:block bg-white text-black p-2 max-w-[80mm] font-mono text-[11px] leading-tight">
        <div className="text-center mb-2">
          <div className="font-bold text-sm uppercase tracking-wide">
            {company?.tradingName || "NEXVOLT GESTÃO"}
          </div>
          {company?.cnpjCpf && <div className="text-[10px]">CNPJ/CPF: {company.cnpjCpf}</div>}
          {company?.phone && <div className="text-[10px]">Fone: {company.phone}</div>}
          {company?.address && (
            <div className="text-[9px]">
              {[company.address, company.number, company.neighborhood, company.city].filter(Boolean).join(", ")}
            </div>
          )}
          <div className="my-1.5 border-b border-dashed border-black" />
          <div className="font-bold text-xs uppercase">
            {activeEditingSale?.isBudget ? "*** ORÇAMENTO NÃO FISCAL ***" : "*** COMPROVANTE NÃO FISCAL ***"}
          </div>
          <div className="text-[10px]">
            Doc: #{activeEditingSale?.id ? activeEditingSale.id.slice(0, 8).toUpperCase() : "NOVA"} | Data: {new Date().toLocaleDateString("pt-BR")} {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>

        <div className="text-[10px] text-left mb-1.5">
          <div><span className="font-bold">Cliente:</span> {clientName.trim() || "Consumidor"}</div>
          {clientPhone && <div><span className="font-bold">Contato:</span> {clientPhone}</div>}
        </div>

        <div className="border-b border-dashed border-black my-1" />

        {/* Itens da Venda */}
        <div className="mb-2">
          <div className="flex justify-between font-bold text-[10px] border-b border-black pb-0.5 mb-1">
            <span>Item / Qtd</span>
            <span>Total</span>
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="flex justify-between text-[10px] py-0.5">
              <span className="max-w-[70%] truncate">
                {it.quantity}x {it.description}
              </span>
              <span className="font-semibold">
                R$ {(it.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>

        <div className="border-b border-dashed border-black my-1.5" />

        {/* Dados Essenciais da Venda */}
        <div className="text-[11px] space-y-1">
          <div className="flex justify-between">
            <span>Soma Itens:</span>
            <span className="font-semibold">
              R$ {subtotalProducts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          {activeMotoboyCost > 0 && (
            <div className="flex justify-between text-[10px]">
              <span>Taxa Entrega / Motoboy:</span>
              <span>R$ {activeMotoboyCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          {discount > 0 && (
            <div className="flex justify-between text-[10px]">
              <span>Desconto:</span>
              <span>- R$ {discount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          <div className="flex justify-between font-bold text-xs border-t border-black pt-1 mt-1">
            <span>Total Cobrado:</span>
            <span>R$ {finalTotalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex justify-between">
            <span>Valor Pago:</span>
            <span className="font-semibold">
              R$ {downPayment.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex justify-between font-bold">
            <span>Saldo a Receber:</span>
            <span>
              R$ {balanceDueValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="border-b border-dashed border-black my-2" />

        {paymentMethod && (
          <div className="text-[10px] uppercase mb-2">
            Forma de Pagto: <span className="font-bold">{paymentMethod}</span>
          </div>
        )}

        <div className="text-center text-[9px] pt-1">
          Obrigado pela preferência e confiança!
        </div>
        <div className="text-center text-[8px] text-gray-600 mt-0.5">
          Documento Auxiliar de Venda
        </div>
      </div>
    </div>
  );
}
