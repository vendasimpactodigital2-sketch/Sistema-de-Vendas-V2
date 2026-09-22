import {
  Search,
  Calendar,
  Phone,
  Paperclip,
  Trash2,
  Edit2,
  FileDown,
  Download,
  Upload,
  User as UserIcon,
  ExternalLink,
  Eye,
  DollarSign,
  TrendingUp,
  X,
  Check,
  Coins,
  AlertCircle,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  ListFilter,
  Layers,
  FileCheck,
  Users,
  PackageCheck,
  Package,
  CheckCheck,
  Truck
} from "lucide-react";
import React, { useState, useMemo } from "react";
import { Sale, CompanyProfile, getSaleOrderDate, isQuickSaleClient, isPendingRetiradaOrBaixa, User } from "../types";
import { jsPDF } from "jspdf";
import { motion, AnimatePresence } from "motion/react";
import { parseClientImages } from "../supabase";

interface SalesHistoryProps {
  sales: Sale[];
  budgets?: Sale[];
  onDeleteSale?: (id: string) => void;
  onDeleteBudget?: (id: string) => void;
  onEditSale?: (sale: Sale) => void;
  onEditBudget?: (budget: Sale) => void;
  onExecuteBudget?: (budget: Sale) => void;
  onImportBackup?: (importedSales: Sale[]) => void;
  company: CompanyProfile;
  onSaveSale?: (sale: Sale) => void;
  statusFilter?: "all" | "pending" | "paid";
  setStatusFilter?: (status: "all" | "pending" | "paid") => void;
  dateFilter?: "today" | "week" | "month" | "all" | "custom";
  setDateFilter?: (date: "today" | "week" | "month" | "all" | "custom") => void;
  customDate?: string;
  setCustomDate?: (date: string) => void;
  customStartDate?: string;
  customEndDate?: string;
  setCustomStartDate?: (date: string) => void;
  setCustomEndDate?: (date: string) => void;
  initialView?: "sales" | "budgets";
  currentUser?: User | null;
  isAttendant?: boolean;
  adminUnlocked?: boolean;
  onRequestAdminUnlock?: (callback: () => void, message?: string) => void;
}

export function SalesHistory({
  sales,
  budgets = [],
  onDeleteSale,
  onDeleteBudget,
  onEditSale,
  onEditBudget,
  onExecuteBudget,
  onImportBackup,
  company,
  onSaveSale,
  statusFilter,
  setStatusFilter,
  dateFilter,
  setDateFilter,
  customDate,
  setCustomDate,
  customStartDate,
  customEndDate,
  setCustomStartDate,
  setCustomEndDate,
  initialView = "sales",
  currentUser,
  isAttendant = false,
  adminUnlocked = false,
  onRequestAdminUnlock
}: SalesHistoryProps) {
  // Local reactive state synchronized with props for instantaneous optimistic UI updates
  const [localSales, setLocalSales] = useState<Sale[]>(sales);
  const [localBudgets, setLocalBudgets] = useState<Sale[]>(budgets || []);

  React.useEffect(() => {
    setLocalSales(sales);
  }, [sales]);

  React.useEffect(() => {
    if (budgets) {
      setLocalBudgets(budgets);
    }
  }, [budgets]);

  // Synchronous optimistic updater to ensure badges flip state without page reload
  const updateSaleLocally = (updated: Sale) => {
    setLocalSales((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    if (onSaveSale) {
      onSaveSale(updated);
    }
  };

  const handleQuickConfirmDelivery = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const opRole: "atendente" | "administrador" = 
      (currentUser?.role === "atendente" || currentUser?.role === "seller" || isAttendant) 
        ? "atendente" 
        : "administrador";
    const opName = currentUser?.name || currentUser?.username || (isAttendant ? "Atendente" : "Administrador");

    const originalOrderDate = sale.orderDate || (sale.date ? getLocalDateFromISO(sale.date) : getLocalDateFromISO(new Date().toISOString()));

    const auditEntry = {
      action: "entrega_material" as const,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || "",
      userName: opName,
      userRole: opRole,
      details: `Material conferido e entregue ao cliente.`
    };

    const updatedSale: Sale = {
      ...sale,
      materialEntregue: true,
      deliveredBy: opName,
      deliveredAt: new Date().toISOString(),
      deliveredRole: opRole,
      deliveryDate: sale.deliveryDate || new Date().toISOString().substring(0, 10),
      orderDate: originalOrderDate,
      auditLog: [
        ...(sale.auditLog || []),
        auditEntry
      ]
    };

    updateSaleLocally(updatedSale);
  };

  const handleQuickToggleDelivery = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (sale.materialEntregue) {
      const updatedSale: Sale = {
        ...sale,
        materialEntregue: false,
        deliveredBy: undefined,
        deliveredAt: undefined,
        deliveredRole: undefined
      };
      updateSaleLocally(updatedSale);
    } else {
      handleQuickConfirmDelivery(sale, e);
    }
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<"sales" | "budgets">(initialView);
  const [selectedAttendant, setSelectedAttendant] = useState<string>("all");

  const handleRequestEdit = (sale: Sale) => {
    if (isAttendant && !adminUnlocked) {
      if (onRequestAdminUnlock) {
        onRequestAdminUnlock(() => {
          if (onEditSale) onEditSale(sale);
        }, "Edição de vendas registradas exige autorização do Administrador.");
      } else {
        alert("Apenas o Administrador pode editar vendas finalizadas.");
      }
      return;
    }
    if (onEditSale) onEditSale(sale);
  };

  const handleRequestDelete = (sale: Sale) => {
    if (isAttendant && !adminUnlocked) {
      if (onRequestAdminUnlock) {
        onRequestAdminUnlock(() => {
          setSaleToDelete(sale);
        }, "Exclusão de vendas no histórico é estritamente restrita ao Administrador para prevenir desvios.");
      } else {
        alert("Apenas o Administrador pode excluir vendas do histórico.");
      }
      return;
    }
    setSaleToDelete(sale);
  };

  const handleRequestEditBudget = (budget: Sale) => {
    if (isAttendant && !adminUnlocked) {
      if (onRequestAdminUnlock) {
        onRequestAdminUnlock(() => {
          if (onEditBudget) onEditBudget(budget);
        }, "Edição de orçamentos exige autorização do Administrador.");
      } else {
        alert("Apenas o Administrador pode editar orçamentos.");
      }
      return;
    }
    if (onEditBudget) onEditBudget(budget);
  };

  const handleRequestDeleteBudget = (budget: Sale) => {
    if (isAttendant && !adminUnlocked) {
      if (onRequestAdminUnlock) {
        onRequestAdminUnlock(() => {
          setBudgetToDelete(budget);
        }, "Exclusão de orçamentos é restrita ao Administrador.");
      } else {
        alert("Apenas o Administrador pode excluir orçamentos.");
      }
      return;
    }
    setBudgetToDelete(budget);
  };

  // Sync initialView if changed externally
  React.useEffect(() => {
    if (initialView) {
      setCurrentView(initialView);
    }
  }, [initialView]);
  
  // State variables for quick pay/delivery modal
  const [quickPaySale, setQuickPaySale] = useState<Sale | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<'dinheiro' | 'cartão' | 'pix'>('dinheiro');
  const [updateDateToToday, setUpdateDateToToday] = useState<boolean>(true);
  const [paySuccessMsg, setPaySuccessMsg] = useState<string | null>(null);

  // For custom visual confirms (bypassing native iframe blocked confirms)
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [budgetToDelete, setBudgetToDelete] = useState<Sale | null>(null);
  const [budgetToExecute, setBudgetToExecute] = useState<Sale | null>(null);
  const [executeSaleDateOption, setExecuteSaleDateOption] = useState<"today" | "original">("today");
  const [overpaidWarningInfo, setOverpaidWarningInfo] = useState<{
    amountPaidNow: number;
    quickPaySale: Sale;
    callback: () => void;
  } | null>(null);

  const handleOpenQuickPay = (sale: Sale) => {
    setQuickPaySale(sale);
    setPayAmount(sale.balanceDue.toFixed(2));
    setPayMethod(sale.paymentMethod || 'dinheiro');
    setUpdateDateToToday(true);
    setPaySuccessMsg(null);
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

  const isDateInCurrentWeek = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const normalized = dateStr.substring(0, 10);
    
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
    
    // We want Monday (Segunda-feira) as start of current week.
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysSinceMonday);
    
    // Sunday of current week is Monday + 6 days
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const formatDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const mondayStr = formatDateStr(monday);
    const sundayStr = formatDateStr(sunday);
    
    return normalized >= mondayStr && normalized <= sundayStr;
  };

  const isDateInCurrentMonth = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const normalized = dateStr.substring(0, 10);
    const today = new Date();
    const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    return normalized.startsWith(currentMonthPrefix);
  };

  const [localStatusFilter, setLocalStatusFilter] = useState<"all" | "pending" | "paid">("all");
  const activeStatusFilter = statusFilter !== undefined ? statusFilter : localStatusFilter;
  const activeSetStatusFilter = setStatusFilter !== undefined ? setStatusFilter : setLocalStatusFilter;

  const [localDateFilter, setLocalDateFilter] = useState<"today" | "week" | "month" | "all" | "custom">("today");
  const activeDateFilter = dateFilter !== undefined ? dateFilter : localDateFilter;
  const activeSetDateFilter = setDateFilter !== undefined ? setDateFilter : setLocalDateFilter;

  const [localSelectedDate, setLocalSelectedDate] = useState<string>(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const activeSelectedDate = customDate !== undefined ? customDate : localSelectedDate;
  const activeSetSelectedDate = setCustomDate !== undefined ? setCustomDate : setLocalSelectedDate;

  const [localStartDate, setLocalStartDate] = useState<string>(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  });
  const [localEndDate, setLocalEndDate] = useState<string>(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const activeStartDate = customStartDate !== undefined ? customStartDate : localStartDate;
  const activeEndDate = customEndDate !== undefined ? customEndDate : localEndDate;
  const activeSetStartDate = setCustomStartDate !== undefined ? setCustomStartDate : setLocalStartDate;
  const activeSetEndDate = setCustomEndDate !== undefined ? setCustomEndDate : setLocalEndDate;

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  const formatDate = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    } catch (e) {
      return "Data Inválida";
    }
  };

  const getCreatedDateLocal = (item: Sale) => {
    return getLocalDateFromISO(item.date || item.orderDate || "");
  };

  const getBaixaDateLocal = (item: Sale) => {
    return getLocalDateFromISO(item.deliveryDate || item.date || "");
  };

  // Calculate statistics per attendant for active view and current filters
  const attendantsStats = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number; role?: string }>();
    const items = currentView === "sales" ? localSales : localBudgets;

    const baseItems = items.filter((item) => {
      const matchesSearch = 
        item.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.clientPhone.replace(/\D/g, "").includes(searchTerm.replace(/\D/g, ""));
      if (!matchesSearch) return false;

      if (currentView === "sales") {
        if (activeStatusFilter === "pending") {
          if (!isPendingRetiradaOrBaixa(item)) return false;
        } else if (activeStatusFilter === "paid") {
          if ((item.balanceDue || 0) > 0.001) return false;
        }
      }

      if (activeStatusFilter === "pending" && currentView === "sales") {
        return true;
      }

      const createdDate = getLocalDateFromISO(item.date);
      const orderDateClean = item.orderDate ? getLocalDateFromISO(item.orderDate) : "";
      const deliveryDateClean = item.deliveryDate ? getLocalDateFromISO(item.deliveryDate) : "";

      if (activeDateFilter === "today") {
        const localDate = new Date();
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, '0');
        const day = String(localDate.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        return (
          createdDate === todayStr ||
          orderDateClean === todayStr ||
          deliveryDateClean === todayStr
        );
      }

      if (activeDateFilter === "week") {
        return (
          isDateInCurrentWeek(createdDate) ||
          (orderDateClean ? isDateInCurrentWeek(orderDateClean) : false) ||
          (deliveryDateClean ? isDateInCurrentWeek(deliveryDateClean) : false)
        );
      }

      if (activeDateFilter === "month") {
        return (
          isDateInCurrentMonth(createdDate) ||
          (orderDateClean ? isDateInCurrentMonth(orderDateClean) : false) ||
          (deliveryDateClean ? isDateInCurrentMonth(deliveryDateClean) : false)
        );
      }

      if (activeDateFilter === "custom") {
        if (activeStartDate && activeEndDate) {
          return (
            (createdDate >= activeStartDate && createdDate <= activeEndDate) ||
            (orderDateClean >= activeStartDate && orderDateClean <= activeEndDate) ||
            (deliveryDateClean >= activeStartDate && deliveryDateClean <= activeEndDate)
          );
        }
        return (
          createdDate === activeSelectedDate ||
          orderDateClean === activeSelectedDate ||
          deliveryDateClean === activeSelectedDate
        );
      }

      return true;
    });

    baseItems.forEach((item) => {
      const seller = item.sellerName || "Venda Balcão / Geral";
      const existing = map.get(seller) || {
        name: seller,
        count: 0,
        total: 0,
        role: item.sellerRole || (seller.toLowerCase().includes("admin") ? "administrador" : "atendente")
      };
      existing.count += 1;
      existing.total += (item.totalValue || 0);
      map.set(seller, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [localSales, localBudgets, currentView, searchTerm, activeStatusFilter, activeDateFilter, activeStartDate, activeEndDate, activeSelectedDate]);

  const totalAttendantsItemsCount = useMemo(() => {
    return attendantsStats.reduce((acc, curr) => acc + curr.count, 0);
  }, [attendantsStats]);

  const totalAttendantsItemsSum = useMemo(() => {
    return attendantsStats.reduce((acc, curr) => acc + curr.total, 0);
  }, [attendantsStats]);

  const filteredSales = localSales.filter((sale) => {
    // 1. Text Search filtering
    const matchesSearch = 
      sale.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.clientPhone.replace(/\D/g, "").includes(searchTerm.replace(/\D/g, ""));
    
    if (!matchesSearch) return false;

    // 2. Attendant filtering
    if (selectedAttendant !== "all") {
      const seller = sale.sellerName || "Venda Balcão / Geral";
      if (seller !== selectedAttendant) return false;
    }

    // 2. Status filtering (separating paid/baixas and pending)
    if (activeStatusFilter === "pending") {
      if (!isPendingRetiradaOrBaixa(sale)) return false;
    } else if (activeStatusFilter === "paid") {
      if ((sale.balanceDue || 0) > 0.001) return false;
    }

    // 3. Temporal/Date filtering
    // Bypass date filtering for pending sales (withdrawal) so we show ALL items that need to be withdrawn regardless of date
    if (activeStatusFilter === "pending") {
      return true;
    }

    const createdDate = getLocalDateFromISO(sale.date);
    const orderDateClean = sale.orderDate ? getLocalDateFromISO(sale.orderDate) : "";
    const deliveryDateClean = sale.deliveryDate ? getLocalDateFromISO(sale.deliveryDate) : "";

    if (activeDateFilter === "today") {
      const localDate = new Date();
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      return (
        createdDate === todayStr ||
        orderDateClean === todayStr ||
        deliveryDateClean === todayStr
      );
    }

    if (activeDateFilter === "week") {
      return (
        isDateInCurrentWeek(createdDate) ||
        (orderDateClean ? isDateInCurrentWeek(orderDateClean) : false) ||
        (deliveryDateClean ? isDateInCurrentWeek(deliveryDateClean) : false)
      );
    }

    if (activeDateFilter === "month") {
      return (
        isDateInCurrentMonth(createdDate) ||
        (orderDateClean ? isDateInCurrentMonth(orderDateClean) : false) ||
        (deliveryDateClean ? isDateInCurrentMonth(deliveryDateClean) : false)
      );
    }
    
    if (activeDateFilter === "custom") {
      if (activeStartDate && activeEndDate) {
        return (
          (createdDate >= activeStartDate && createdDate <= activeEndDate) ||
          (orderDateClean >= activeStartDate && orderDateClean <= activeEndDate) ||
          (deliveryDateClean >= activeStartDate && deliveryDateClean <= activeEndDate)
        );
      }
      return (
        createdDate === activeSelectedDate ||
        orderDateClean === activeSelectedDate ||
        deliveryDateClean === activeSelectedDate
      );
    }

    return true; // "all"
  }).sort((a, b) => {
    const timeA = new Date(a.date).getTime() || 0;
    const timeB = new Date(b.date).getTime() || 0;
    return timeB - timeA;
  });

  const filteredBudgets = localBudgets.filter((budget) => {
    // 1. Text Search filtering
    const matchesSearch = 
      budget.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      budget.clientPhone.replace(/\D/g, "").includes(searchTerm.replace(/\D/g, ""));
    
    if (!matchesSearch) return false;

    // 2. Attendant filtering
    if (selectedAttendant !== "all") {
      const seller = budget.sellerName || "Venda Balcão / Geral";
      if (seller !== selectedAttendant) return false;
    }

    // 3. Temporal/Date filtering
    const targetLocalDate = getCreatedDateLocal(budget);
    const rawDateToCheck = budget.orderDate || budget.date;

    if (activeDateFilter === "today") {
      const localDate = new Date();
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      return targetLocalDate === todayStr;
    }

    if (activeDateFilter === "week") {
      return isDateInCurrentWeek(targetLocalDate);
    }

    if (activeDateFilter === "month") {
      return isDateInCurrentMonth(targetLocalDate);
    }
    
    if (activeDateFilter === "custom") {
      if (!rawDateToCheck) return false;
      if (activeStartDate && activeEndDate) {
        return targetLocalDate >= activeStartDate && targetLocalDate <= activeEndDate;
      }
      return targetLocalDate === activeSelectedDate;
    }

    return true; // "all"
  }).sort((a, b) => {
    const timeA = new Date(a.date || a.orderDate || 0).getTime() || 0;
    const timeB = new Date(b.date || b.orderDate || 0).getTime() || 0;
    return timeB - timeA;
  });

  // KPI Calculations for Budgets
  const budgetKPIs = React.useMemo(() => {
    const totalCount = filteredBudgets.length;
    const totalEstimatedValue = filteredBudgets.reduce((acc, b) => acc + (b.totalValue || 0), 0);
    const totalDownPayment = filteredBudgets.reduce((acc, b) => acc + (b.downPayment || 0), 0);
    const totalBalanceToBill = Math.max(0, totalEstimatedValue - totalDownPayment);

    return {
      totalCount,
      totalEstimatedValue,
      totalDownPayment,
      totalBalanceToBill
    };
  }, [filteredBudgets]);

  // Quick PDF generator helper for previous items
  const handleDownloadPDF = async (sale: Sale) => {
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
    const parsedImages = parseClientImages(sale.clientImage);
    const preloadedBase64s = await (async () => {
      try {
        const promises = parsedImages.map(async (url) => {
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
    const subtotal = sale.items.reduce((acc, current) => acc + current.totalValue, 0);

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
      doc.text("RECIBO DE VENDA", 145, yOffset + 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(200, 200, 200);
      doc.text(`Data: ${formattedDate}`, 145, yOffset + 15.5);
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

      // Products & Services Table
      doc.setFillColor(15, 23, 42);
      doc.rect(10, yOffset + 49, 190, 6, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text("DESCRIÇÃO DO ITEM / SERVIÇO", 13, yOffset + 53);
      doc.text("QTD", 115, yOffset + 53);
      doc.text("V. UNITÁRIO", 138, yOffset + 53);
      doc.text("V. TOTAL", 170, yOffset + 53);

      let itemY = yOffset + 55;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);

      const itemsToRender = sale.items.slice(0, 4);
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
      if (sale.items.length > 4) {
        doc.setFillColor(254, 242, 242);
        doc.rect(10, itemY, 190, 4.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(220, 38, 38);
        doc.text(`* ${sale.items.length - 4} mais itens resumidos no totalizador *`, 13, itemY + 3);
        itemY += 4.5;
      }

      // Draw bottom table border
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.3);
      doc.line(10, itemY, 200, itemY);

      // Financial Calculation box & Image placement
      const calcY = yOffset + 79;
      const calcBoxX = 120;
      
      let topBoxHeight = 4.5;
      if (sale.useMotoboy) topBoxHeight += 3.8;

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
      doc.text(formatCurrency(subtotal), calcBoxX + 77, calcRowY, { align: "right" });

      if (sale.useMotoboy) {
        calcRowY += 3.8;
        doc.text("Motoboy:", calcBoxX + 3, calcRowY);
        doc.text(formatCurrency(sale.motoboyCost), calcBoxX + 77, calcRowY, { align: "right" });
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
      doc.text(formatCurrency(sale.totalValue), calcBoxX + 77, blockY + 4.2, { align: "right" });

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
      doc.text(formatCurrency(sale.downPayment), calcBoxX + 77, blockY + 4.2, { align: "right" });

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
      doc.text(formatCurrency(sale.balanceDue), calcBoxX + 77, blockY + 4.2, { align: "right" });

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
      doc.text(formatCurrency(sale.discount), calcBoxX + 77, blockY + 4.2, { align: "right" });

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
      } else {
        // Institutional text removed
      }

      // Bottom Signature Row
      const signatureY = yOffset + 112;

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

    // Save PDF file
    const docName = `Recibo_${sale.clientName.replace(/\s+/g, "_")}_${docId}.pdf`;
    doc.save(docName);
  };

  const handleShareWhatsApp = (sale: Sale) => {
    const phoneDigits = sale.clientPhone.replace(/\D/g, "");
    if (!phoneDigits) {
      alert("O cliente não possui um número de telefone celular registrado.");
      return;
    }

    const companyName = company?.tradingName || "Sistema de Vendas Núcleo";
    const docId = sale.id;
    const formattedTotal = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(sale.totalValue);

    const balanceMessage = sale.balanceDue > 0 
      ? ` Restante a Pagar: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(sale.balanceDue)}.`
      : " Pago integralmente!";

    const messageText = `Olá, *${sale.clientName}*!\n\nSegue o resumo de sua compra na *${companyName}*:\n\n📄 *Recibo:* #${docId}\n💰 *Valor Total:* ${formattedTotal}\n📥 *Sinal/Pago:* ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(sale.downPayment)}${balanceMessage}\n\nSeu recibo digital em PDF foi gerado e registrado no sistema! Agradecemos a preferência.\n\nAtenciosamente,\n*${companyName}*`;
    
    const encodedMessage = encodeURIComponent(messageText);
    
    let destinationPhone = phoneDigits;
    if (phoneDigits.length === 10 || phoneDigits.length === 11) {
      destinationPhone = "55" + phoneDigits;
    }

    const url = `https://api.whatsapp.com/send?phone=${destinationPhone}&text=${encodedMessage}`;
    window.open(url, "_blank");
  };

  // Export database to JSON safety file
  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sales, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Backup_Vendas_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import JSON backup
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          let salesToImport: Sale[] = [];
          if (Array.isArray(parsed)) {
            salesToImport = parsed;
          } else if (parsed && typeof parsed === "object") {
            const source = parsed.data || parsed.backup || parsed;
            if (Array.isArray(source.sales)) salesToImport = source.sales;
            else if (Array.isArray(source.vendas)) salesToImport = source.vendas;
            else if (source.NUCLEO_SALES) {
              try { salesToImport = JSON.parse(source.NUCLEO_SALES); } catch (e) {}
            }
          }
          
          if (salesToImport.length > 0) {
            onImportBackup(salesToImport);
            alert("Backup importado com sucesso! " + salesToImport.length + " vendas carregadas no sistema.");
          } else {
            alert("Formato de arquivo inválido ou nenhuma venda encontrada no JSON.");
          }
        } catch (err) {
          alert("Erro ao ler o arquivo de backup de dados.");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    }
  };

  const executeQuickPay = (sale: Sale, amountPaidNow: number) => {
    const updatedDownPayment = sale.downPayment + amountPaidNow;
    const updatedBalanceDue = Math.max(0, sale.totalValue - updatedDownPayment);
    const updatedNetProfit = sale.totalValue - sale.operationCost;

    let updatedDate = sale.date;
    if (updateDateToToday) {
      updatedDate = new Date().toISOString();
    }

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

    const opRole: "atendente" | "administrador" = isAttendant ? "atendente" : "administrador";
    const opName = currentUser?.name || currentUser?.username || (isAttendant ? "Atendente" : "Administrador");

    const updatedPayments = [...currentPayments, {
      id: Math.random().toString(36).substring(2, 9).toUpperCase(),
      amount: amountPaidNow,
      date: new Date().toISOString(), // ALWAYS today because the payment occurred today
      method: payMethod,
      recordedBy: opName,
      recordedRole: opRole
    }];

    const originalOrderDate = sale.orderDate || (sale.date ? getLocalDateFromISO(sale.date) : getLocalDateFromISO(new Date().toISOString()));

    const auditEntry = {
      action: "pagamento" as const,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || "",
      userName: opName,
      userRole: opRole,
      details: `Baixa de saldo de R$ ${amountPaidNow.toFixed(2)} (${payMethod}). Material entregue ao cliente.`
    };

    const updatedSale: Sale = {
      ...sale,
      downPayment: updatedDownPayment,
      balanceDue: updatedBalanceDue,
      netProfit: updatedNetProfit,
      date: updatedDate,
      deliveryDate: new Date().toISOString(), // Completed material withdrawal / delivery finalized today
      materialEntregue: true,
      deliveredBy: opName,
      deliveredAt: new Date().toISOString(),
      deliveredRole: opRole,
      orderDate: originalOrderDate,
      payments: updatedPayments,
      auditLog: [
        ...(sale.auditLog || []),
        auditEntry
      ]
    };

    updateSaleLocally(updatedSale);
    setQuickPaySale(updatedSale);

    // Show success confirmation screen
    setPaySuccessMsg(`Baixa registrada com sucesso! Foi recebido o valor de ${formatBRL(amountPaidNow)}.`);
  };

  // Settle outstanding balance & material withdrawal ("Dar Baixa e entregar")
  const handleConfirmQuickPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPaySale) return;

    const amountPaidNow = parseFloat(payAmount) || 0;
    if (amountPaidNow <= 0) {
      alert("Por favor, insira um valor válido de pagamento.");
      return;
    }

    if (amountPaidNow > quickPaySale.balanceDue) {
      setOverpaidWarningInfo({
        amountPaidNow,
        quickPaySale,
        callback: () => {
          executeQuickPay(quickPaySale, amountPaidNow);
          setOverpaidWarningInfo(null);
        }
      });
      return;
    }

    executeQuickPay(quickPaySale, amountPaidNow);
  };

  // Synchronized counts for quick filters
  const counts = React.useMemo(() => {
    const list = currentView === "sales" ? localSales : localBudgets;
    
    // Today's date string
    const localDate = new Date();
    const currentYear = localDate.getFullYear();
    const currentMonthStr = String(localDate.getMonth() + 1).padStart(2, '0');
    const currentDayStr = String(localDate.getDate()).padStart(2, '0');
    const todayStr = `${currentYear}-${currentMonthStr}-${currentDayStr}`;

    let today = 0;
    let week = 0;
    let month = 0;
    let all = 0;
    let custom = 0;

    const matchesSearch = (item: Sale) => 
      item.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.clientPhone.replace(/\D/g, "").includes(searchTerm.replace(/\D/g, ""));

    const matchesStatus = (item: Sale) => {
      if (activeStatusFilter === "pending") {
        return isPendingRetiradaOrBaixa(item);
      } else if (activeStatusFilter === "paid") {
        return (item.balanceDue || 0) <= 0.001;
      }
      return true;
    };

    const matchesFilterBase = (item: Sale) => {
      const searchOk = matchesSearch(item);
      if (currentView === "sales") {
        return searchOk && matchesStatus(item);
      }
      return searchOk;
    };

    list.forEach((item) => {
      if (!matchesFilterBase(item)) return;
      
      all++;

      const useBaixaDate = currentView === "sales" && activeStatusFilter === "paid";
      const targetLocalDate = useBaixaDate ? getBaixaDateLocal(item) : getCreatedDateLocal(item);
      const rawDateToCheck = useBaixaDate 
        ? (item.deliveryDate || item.date) 
        : (item.orderDate || item.date);

      if (!rawDateToCheck) return;
      
      // Today check
      if (targetLocalDate === todayStr) {
        today++;
      }
      
      // Week check
      if (isDateInCurrentWeek(targetLocalDate)) {
        week++;
      }

      // Month check
      if (isDateInCurrentMonth(targetLocalDate)) {
        month++;
      }
      
      // Custom date check
      if (activeStartDate && activeEndDate) {
        if (targetLocalDate >= activeStartDate && targetLocalDate <= activeEndDate) {
          custom++;
        }
      } else if (targetLocalDate === activeSelectedDate) {
        custom++;
      }
    });

    return { today, week, month, all, custom };
  }, [localSales, localBudgets, currentView, activeSelectedDate, activeStartDate, activeEndDate, searchTerm, activeStatusFilter]);

  return (
    <div className="bg-brand-card border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* ROW 1: Header + Vendas/Orçamentos Section switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-850 pb-5">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <span className={`h-5 w-1.5 rounded ${currentView === "sales" ? "bg-brand-magenta" : "bg-brand-cyan"}`}></span>
            {currentView === "sales" ? "Histórico e Listagem de Vendas" : "Painel & Relatório de Orçamentos"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {currentView === "sales" 
              ? `Total de ${filteredSales.length} vendas registradas no período`
              : `Total de ${filteredBudgets.length} orçamentos registrados (aguardando autorização para virar venda)`
            }
          </p>
        </div>

        {/* Tab Switcher between Vendas and Orçamentos */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 shrink-0 select-none self-start md:self-auto">
          <button
            type="button"
            onClick={() => setCurrentView("sales")}
            className={`px-4 py-2 text-[10px] sm:text-xs font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              currentView === "sales"
                ? "bg-gradient-to-r from-brand-magenta to-pink-650 text-white shadow-md shadow-brand-magenta/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            💰 Vendas 
            <span className="bg-slate-900/60 px-1.5 py-0.5 rounded text-[10px] text-white/90 ml-1">
              {filteredSales.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentView("budgets")}
            className={`px-4 py-2 text-[10px] sm:text-xs font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              currentView === "budgets"
                ? "bg-gradient-to-r from-brand-cyan to-cyan-600 text-slate-950 shadow-md font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            📋 Orçamentos
            <span className="bg-slate-900/60 px-1.5 py-0.5 rounded text-[10px] text-white/90 ml-1">
              {filteredBudgets.length}
            </span>
          </button>
        </div>
      </div>

      {/* KPI Cards when viewing Budgets */}
      {currentView === "budgets" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Qtd. Orçamentos</p>
                <p className="text-xl font-black text-white mt-0.5">{budgetKPIs.totalCount}</p>
                <p className="text-[10px] text-brand-cyan mt-0.5">
                  {activeDateFilter === "today" ? "Do dia de hoje" : activeDateFilter === "week" ? "Desta semana" : activeDateFilter === "month" ? "Deste mês" : activeDateFilter === "custom" ? "Período selecionado" : "Todos os registros"}
                </p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-brand-cyan/15 border border-brand-cyan/30 flex items-center justify-center text-brand-cyan">
                <FileText className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Total Previsto</p>
                <p className="text-xl font-black text-brand-cyan mt-0.5">{formatBRL(budgetKPIs.totalEstimatedValue)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Valor bruto das propostas</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Sinais / Entradas</p>
                <p className="text-xl font-black text-emerald-400 mt-0.5">{formatBRL(budgetKPIs.totalDownPayment)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Adiantamentos pagos</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Coins className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Saldo a Faturar</p>
                <p className="text-xl font-black text-amber-400 mt-0.5">{formatBRL(budgetKPIs.totalBalanceToBill)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">A receber após autorização</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-cyan-950/40 via-slate-950/50 to-emerald-950/30 border border-cyan-500/20 p-3 rounded-xl flex items-center gap-3 text-xs text-slate-300">
            <ShieldCheck className="h-5 w-5 text-brand-cyan shrink-0" />
            <div className="flex-1">
              <span className="font-bold text-brand-cyan">Controle de Autorização de Orçamento:</span>
              <span className="text-slate-300 ml-1">
                Estes registros são propostas comerciais. Eles <strong>NÃO</strong> entram no faturamento de vendas do dia nem no caixa até você autorizar. Para aprovar um orçamento e lançá-lo como venda oficial, clique em <strong>AUTORIZAR</strong>.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ROW 2: CONTROL BAR (ALIGN EVERYTHING PERFECTLY) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/20 p-4 rounded-xl border border-slate-850/50">
        {/* Left Span: Filters Group */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 w-full lg:w-auto flex-wrap">
          {/* Status Filters */}
          {currentView === "sales" && (
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 shrink-0 w-full md:w-auto overflow-x-auto">
              {(["all", "pending", "paid"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => activeSetStatusFilter(status)}
                  className={`flex-1 md:flex-none px-3 py-1.5 text-[10px] sm:text-xs font-bold uppercase rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    activeStatusFilter === status
                      ? "bg-brand-magenta/15 text-brand-magenta border border-brand-magenta/35 font-extrabold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {status === "all" ? "Todos os Pedidos" : status === "pending" ? "⚠️ Em Aberto" : "✅ Baixados"}
                </button>
              ))}
            </div>
          )}

          {/* Date Filters Group with counts on the LEFT side */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 overflow-x-auto w-full md:w-auto shrink-0">
            {([
              { key: "today", label: "Hoje (Dia)", count: counts.today },
              { key: "week", label: "Esta Semana", count: counts.week },
              { key: "month", label: "Este Mês", count: counts.month },
              { key: "all", label: "Todas", count: counts.all },
              { key: "custom", label: "Por Data", count: counts.custom }
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => activeSetDateFilter(key)}
                className={`flex-1 md:flex-none px-2.5 py-1.5 text-[10px] sm:text-xs font-bold uppercase rounded-lg transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeDateFilter === key
                    ? currentView === "sales" 
                      ? "bg-brand-magenta/15 text-brand-magenta border border-brand-magenta/30 shadow-sm"
                      : "bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/40 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                }`}
              >
                <span>{label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono ${
                  activeDateFilter === key 
                    ? currentView === "sales" ? "bg-brand-magenta text-white" : "bg-brand-cyan text-slate-950 font-bold"
                    : "bg-slate-850 text-slate-400"
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          {/* Date Picker (visible when "custom" is activated) */}
          {activeDateFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400 w-full md:w-auto shrink-0">
              <span>De:</span>
              <input
                type="date"
                value={activeStartDate}
                onChange={(e) => activeSetStartDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white lg:text-brand-magenta font-mono font-bold focus:outline-none focus:border-brand-magenta transition-all"
              />
              <span>Até:</span>
              <input
                type="date"
                value={activeEndDate}
                onChange={(e) => activeSetEndDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white lg:text-brand-magenta font-mono font-bold focus:outline-none focus:border-brand-magenta transition-all"
              />
            </div>
          )}
        </div>

        {/* Right Span: Search & Import/Export buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto justify-end">
          {/* Search Bar */}
          <div className="relative w-full sm:flex-1 lg:w-60 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por cliente ou celular..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-magenta transition-all"
            />
          </div>

          {/* Export / Import Button Group */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
            <button
              onClick={handleExportData}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-850 cursor-pointer transition-colors"
              title="Exportar dados para JSON"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar</span>
            </button>

            <label className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-850 cursor-pointer transition-colors">
              <Upload className="h-3.5 w-3.5" />
              <span>Importar</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Attendants Breakdown & Synchronization Bar */}
      {attendantsStats.length > 0 && (
        <div className="bg-slate-950/80 border border-slate-800/80 p-3 rounded-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-100 uppercase tracking-wider">
                  Vendas por Atendente
                </span>
                <span className="inline-flex items-center gap-1.5 text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Sincronizado p/ Todos
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Todos veem as vendas em tempo real. Filtre por atendente abaixo ou veja o total:
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto">
            <button
              type="button"
              onClick={() => setSelectedAttendant("all")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer border ${
                selectedAttendant === "all"
                  ? "bg-brand-magenta/20 text-brand-magenta border-brand-magenta/40 shadow-sm"
                  : "bg-slate-900/70 text-slate-400 hover:text-slate-200 border-slate-800"
              }`}
            >
              <span>Todos da Equipe</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                selectedAttendant === "all" ? "bg-brand-magenta text-white" : "bg-slate-800 text-slate-300"
              }`}>
                {totalAttendantsItemsCount} • {formatBRL(totalAttendantsItemsSum)}
              </span>
            </button>

            {attendantsStats.map((att) => (
              <button
                key={att.name}
                type="button"
                onClick={() => setSelectedAttendant(att.name)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer border ${
                  selectedAttendant === att.name
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm"
                    : "bg-slate-900/70 text-slate-400 hover:text-slate-200 border-slate-800"
                }`}
              >
                <span>{att.role === "administrador" ? "👑" : "👤"} {att.name}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                  selectedAttendant === att.name ? "bg-cyan-400 text-slate-950" : "bg-slate-800 text-cyan-300"
                }`}>
                  {att.count} {att.count === 1 ? 'venda' : 'vendas'} • {formatBRL(att.total)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* History table list */}
      {currentView === "sales" ? (
        filteredSales.length === 0 ? (
          <div className="text-center py-12 bg-slate-950/30 rounded-2xl border border-slate-850">
            <p className="text-slate-400 text-sm">Nenhuma venda encontrada que coincida com a pesquisa.</p>
            <p className="text-slate-500 text-xs mt-1">Lançe uma nova venda ou altere os termos de busca.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 font-mono border-b border-slate-850 uppercase text-[10px] tracking-wider">
                  <th className="p-4 font-bold">Cliente / Contato</th>
                  <th className="p-4 font-bold text-center">Atendente</th>
                  <th className="p-4 font-bold">Data</th>
                  <th className="p-4 font-bold text-center">Itens</th>
                  <th className="p-4 font-bold text-right">Gasto Operacional</th>
                  <th className="p-4 font-bold text-right">Valor Venda</th>
                  <th className="p-4 font-bold text-right">Sinal / Pago</th>
                  <th className="p-4 font-bold text-right text-brand-cyan">Lucro (Real / Previsto)</th>
                  <th className="p-4 font-bold text-center">Comprovante</th>
                  <th className="p-4 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60 bg-slate-950/20 font-medium">
                <AnimatePresence mode="popLayout">
                  {filteredSales.map((sale, index) => {
                    const realProfit = sale.downPayment - sale.operationCost;
                    const isProfitable = sale.netProfit > 0;
                    
                    return (
                      <motion.tr
                        key={sale.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3), ease: "easeOut" }}
                        className="hover:bg-slate-900/40 transition-colors"
                      >
                      {/* Customer Info */}
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-brand-magenta/10 border border-brand-magenta/20 flex items-center justify-center text-brand-magenta font-bold text-sm shrink-0">
                            {sale.clientName.charAt(0).toUpperCase()}
                          </div>
                          <div className="space-y-1">
                            <p className="font-bold text-slate-100 text-sm leading-tight">{sale.clientName}</p>
                            <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                              <Phone className="h-2.5 w-2.5 text-slate-500" />
                              {sale.clientPhone}
                            </p>

                            {/* Status Badges Group: Pagamento + Entrega */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {/* Financeiro: Quitada vs Falta */}
                              {(sale.balanceDue || 0) <= 0.001 ? (
                                <span 
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono shadow-xs"
                                  title="Pedido 100% quitado (sem saldo devedor)"
                                >
                                  <Check className="h-2.5 w-2.5" />
                                  <span>Quitada</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenQuickPay(sale)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/25 transition-all cursor-pointer font-mono shadow-xs"
                                  title="Saldo em aberto. Clique para dar baixa"
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                                  <span>Falta {formatBRL(sale.balanceDue)}</span>
                                </button>
                              )}

                              {/* Logística: Entregue vs Aguardando Retirada */}
                              {sale.materialEntregue ? (
                                <button
                                  type="button"
                                  onClick={(e) => handleQuickToggleDelivery(sale, e)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-mono shadow-xs hover:bg-emerald-500/30 transition-all cursor-pointer"
                                  title={sale.deliveredBy ? `Material ENTREGUE por ${sale.deliveredBy}${sale.deliveryDate ? ` em ${formatDate(sale.deliveryDate)}` : ''}. Clique se desejar alterar.` : "Material ENTREGUE. Clique se desejar alterar."}
                                >
                                  <PackageCheck className="h-2.5 w-2.5 text-emerald-400" />
                                  <span>ENTREGUE</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => handleQuickConfirmDelivery(sale, e)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/40 transition-all cursor-pointer font-mono shadow-xs group"
                                  title="Aguardando retirada. Clique para confirmar a entrega imediatamente!"
                                >
                                  <Clock className="h-2.5 w-2.5 text-amber-400 group-hover:hidden" />
                                  <Check className="h-2.5 w-2.5 text-emerald-400 hidden group-hover:inline" />
                                  <span className="group-hover:hidden">AGUARDANDO RETIRADA</span>
                                  <span className="hidden group-hover:inline font-bold">CONFIRMAR ENTREGA</span>
                                </button>
                              )}
                            </div>

                            {(sale.orderDate || sale.deliveryDate) && (
                              <div className="flex gap-2 text-[9px] text-slate-400 font-mono pt-0.5">
                                {sale.orderDate && (
                                  <span>Ped: {sale.orderDate.split("-").reverse().join("/")}</span>
                                )}
                                {sale.deliveryDate && (
                                  <span className={sale.materialEntregue ? "text-emerald-400" : "text-brand-magenta"}>
                                    Ent: {sale.deliveryDate.split("-").reverse().join("/")}
                                  </span>
                                )}
                              </div>
                            )}
                            {sale.sellerName && (
                              <div className="mt-0.5">
                                <span className={`inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                  sale.sellerRole === "atendente"
                                    ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
                                    : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                }`}>
                                  {sale.sellerRole === "atendente" ? "👤 " : "👑 "}
                                  {sale.sellerName}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Attendant / Seller */}
                      <td className="p-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${
                          sale.sellerRole === "administrador"
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                            : "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
                        }`}>
                          {sale.sellerRole === "administrador" ? "👑" : "👤"}
                          <span>{sale.sellerName || "Balcão"}</span>
                        </span>
                        {sale.deliveredBy && sale.deliveredBy !== sale.sellerName && (
                          <div className="text-[8px] text-slate-400 font-mono mt-0.5" title={`Entregue por ${sale.deliveredBy}`}>
                            Entr: {sale.deliveredBy}
                          </div>
                        )}
                      </td>

                      {/* Date */}
                      <td className="p-4 text-slate-300 font-mono whitespace-nowrap">
                        {formatDate(sale.date)}
                      </td>

                      {/* Quantity of items */}
                      <td className="p-4 text-center text-slate-300 font-mono">
                        {sale.items.length}
                      </td>

                      {/* Operatinal cost ("Gasto") */}
                      <td className="p-4 text-right text-red-450 font-mono">
                        {formatBRL(sale.operationCost)}
                      </td>

                      {/* Sum items total */}
                      <td className="p-4 text-right text-slate-100 font-bold font-mono">
                        {formatBRL(sale.totalValue)}
                      </td>

                      {/* Down payment / Signal received */}
                      <td className="p-4 text-right font-mono">
                        <div className="text-emerald-450 font-bold">{formatBRL(sale.downPayment)}</div>
                        {(sale.balanceDue || 0) > 0.001 ? (
                          <button
                            type="button"
                            onClick={() => handleOpenQuickPay(sale)}
                            className="text-[10px] text-yellow-400 font-bold bg-yellow-500/10 hover:bg-yellow-500/20 px-2 py-0.5 rounded-md mt-1 border border-yellow-500/30 transition-all inline-flex items-center gap-1 cursor-pointer font-mono"
                            title="Clique para dar baixa no saldo pendente"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
                            <span>Falta: {formatBRL(sale.balanceDue)}</span>
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-black uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded mt-1 font-mono">
                            <Check className="h-2.5 w-2.5" />
                            <span>Quitada</span>
                          </div>
                        )}
                      </td>

                      {/* Pure Profit (Real vs Previsto) */}
                      <td className="p-4 text-right font-mono whitespace-nowrap">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${realProfit >= 0 ? "text-brand-cyan bg-brand-cyan/5 border border-brand-cyan/15" : "text-rose-500 bg-rose-500/5 border border-rose-500/15"}`} title="Lucro Real (Recebido - Custo)">
                            {formatBRL(realProfit)} <span className="text-[9px] font-normal text-slate-400">real</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-normal" title="Lucro Líquido Previsto (Valor Total - Custo)">
                            Previsto: {formatBRL(sale.netProfit)}
                          </span>
                        </div>
                      </td>

                      {/* Service Visual Image */}
                      <td className="p-4 text-center">
                        {sale.clientImage ? (
                          <button
                            onClick={() => setSelectedImage(sale.clientImage)}
                            className="inline-flex items-center gap-1 text-[10px] text-brand-cyan hover:underline font-mono bg-brand-cyan/10 px-2 py-0.5 rounded border border-brand-cyan/20 cursor-pointer"
                          >
                            <Paperclip className="h-3 w-3" />
                            <span>Ver</span>
                          </button>
                        ) : (
                          <span className="text-slate-600 font-mono">-</span>
                        )}
                      </td>

                      {/* Actions tools */}
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {(sale.balanceDue || 0) > 0.001 ? (
                            <button
                              type="button"
                              onClick={() => handleOpenQuickPay(sale)}
                              className="p-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all hover:scale-[1.03] shadow-md shadow-emerald-950/40 animate-pulse hover:animate-none"
                              title="Dar baixa nesta venda (Registrar entrega de material e acertar o restante)"
                            >
                              <Check className="h-3 w-3" />
                              <span>DAR BAIXA</span>
                            </button>
                          ) : !sale.materialEntregue ? (
                            <button
                              type="button"
                              onClick={(e) => handleQuickConfirmDelivery(sale, e)}
                              className="p-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all hover:scale-[1.03] shadow-md shadow-emerald-950/40"
                              title="Confirmar entrega do material ao cliente"
                            >
                              <PackageCheck className="h-3 w-3" />
                              <span>ENTREGAR</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md font-mono" title="Venda finalizada: quitada e entregue">
                              <CheckCheck className="h-3 w-3 text-emerald-400" />
                              <span>FINALIZADA</span>
                            </span>
                          )}

                          <button
                            onClick={() => handleDownloadPDF(sale)}
                            className="p-1 px-2 rounded bg-slate-900 border border-slate-800 text-brand-cyan hover:bg-slate-800 flex items-center gap-1 cursor-pointer transition-all"
                            title="Gerar e salvar recibo como PDF"
                          >
                            <FileDown className="h-3.5 w-3.5" />
                            <span className="text-[10px] uppercase font-bold">PDF</span>
                          </button>

                          <button
                            onClick={() => handleShareWhatsApp(sale)}
                            className="p-1 px-2 rounded bg-slate-900 border border-slate-800 text-emerald-400 hover:bg-slate-800 hover:border-emerald-500/30 flex items-center gap-1 cursor-pointer transition-all"
                            title="Enviar recibo via WhatsApp para o cliente"
                          >
                            <svg className="h-3.5 w-3.5 fill-current text-emerald-450" viewBox="0 0 24 24">
                              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.32 1.448 5.148 1.451h-.001c5.45-.002 9.88-4.416 9.884-9.84a9.75 9.75 0 0 0-2.882-6.956 9.773 9.773 0 0 0-6.968-2.891c-5.462 0-9.897 4.417-9.901 9.844a9.78 9.78 0 0 0 1.47 5.006l-.995 3.634 3.74-.984zm11.166-7.531c-.301-.15-1.78-.876-2.056-.976-.275-.1-.475-.15-.675.15-.199.3-.775.976-.95 1.176-.175.2-.35.225-.65.075-.301-.15-1.267-.467-2.414-1.485-.893-.795-1.495-1.778-1.671-2.078-.175-.3-.018-.462.13-.61.135-.133.301-.35.451-.524.15-.175.2-.3.3-.5.1-.2.05-.375-.025-.526-.075-.15-.675-1.625-.925-2.225-.244-.588-.493-.508-.675-.517-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.376-.275.3-1.05 1.026-1.05 2.5 0 1.475 1.075 2.9 1.225 3.1.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.228 1.368.196 1.883.119.574-.086 1.78-.726 2.03-1.426.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.35z"/>
                            </svg>
                            <span className="text-[10px] uppercase font-bold">Whats</span>
                          </button>
                          
                          <button
                            onClick={() => handleRequestEdit(sale)}
                            className="p-1 px-2 rounded bg-slate-900 border border-slate-800 text-amber-500 hover:bg-slate-800 flex items-center gap-1 cursor-pointer transition-all"
                            title="Carregar venda para edição"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span className="text-[10px] uppercase font-bold">Editar</span>
                          </button>

                          <button
                            onClick={() => handleRequestDelete(sale)}
                            className="p-1.5 rounded bg-slate-900 border border-slate-800 text-red-500 hover:bg-red-950/40 cursor-pointer transition-all"
                            title="Excluir do histórico"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
            </table>
          </div>
        )
      ) : (
        /* Render Budgets list */
        filteredBudgets.length === 0 ? (
          <div className="text-center py-12 bg-slate-950/30 rounded-2xl border border-slate-850">
            <p className="text-slate-400 text-sm">Nenhum orçamento encontrado que coincida com a pesquisa.</p>
            <p className="text-slate-500 text-xs mt-1">Lançe um novo orçamento para visualizar aqui.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 font-mono border-b border-slate-850 uppercase text-[10px] tracking-wider">
                  <th className="p-4 font-bold">Cliente / Contato</th>
                  <th className="p-4 font-bold text-center">Atendente</th>
                  <th className="p-4 font-bold">Data</th>
                  <th className="p-4 font-bold text-center">Itens</th>
                  <th className="p-4 font-bold text-right">Valor Orçamento</th>
                  <th className="p-4 font-bold text-right">Sinal / Entrada</th>
                  <th className="p-4 font-bold text-center">Comprovante</th>
                  <th className="p-4 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60 bg-slate-950/20 font-medium">
                <AnimatePresence mode="popLayout">
                  {filteredBudgets.map((budget, index) => {
                    return (
                      <motion.tr
                        key={budget.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3), ease: "easeOut" }}
                        className="hover:bg-slate-900/40 transition-colors"
                      >
                      {/* Customer Info */}
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center text-brand-cyan font-bold">
                            {budget.clientName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-200">{budget.clientName}</p>
                            <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                              <Phone className="h-2.5 w-2.5 text-slate-600" />
                              {budget.clientPhone}
                            </p>
                            {(budget.orderDate || budget.deliveryDate) && (
                              <div className="flex gap-2 text-[9px] text-slate-350 font-mono mt-1 bg-slate-950/85 border border-slate-850 rounded px-1.5 py-0.5 w-fit">
                                {budget.orderDate && (
                                  <span>Ped: {budget.orderDate.split("-").reverse().join("/")}</span>
                                )}
                                {budget.deliveryDate && (
                                  <span className="text-brand-magenta">Ent: {budget.deliveryDate.split("-").reverse().join("/")}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Attendant / Seller */}
                      <td className="p-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${
                          budget.sellerRole === "administrador"
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                            : "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
                        }`}>
                          {budget.sellerRole === "administrador" ? "👑" : "👤"}
                          <span>{budget.sellerName || "Balcão"}</span>
                        </span>
                      </td>

                      {/* Date */}
                      <td className="p-4 text-slate-300 font-mono whitespace-nowrap">
                        {formatDate(budget.date)}
                      </td>

                      {/* Quantity of items */}
                      <td className="p-4 text-center text-slate-300 font-mono">
                        <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-[11px] font-bold">
                          {budget.items.length} {budget.items.length === 1 ? 'item' : 'itens'}
                        </span>
                      </td>

                      {/* Sum items total */}
                      <td className="p-4 text-right text-brand-cyan font-bold font-mono text-sm">
                        {formatBRL(budget.totalValue)}
                      </td>

                      {/* Down payment / Signal received */}
                      <td className="p-4 text-right font-mono">
                        {budget.downPayment > 0 ? (
                          <div className="text-emerald-400 font-semibold">{formatBRL(budget.downPayment)}</div>
                        ) : (
                          <div className="text-slate-500 text-[11px]">Sem sinal</div>
                        )}
                      </td>

                      {/* Service Visual Image */}
                      <td className="p-4 text-center">
                        {budget.clientImage ? (
                          <button
                            onClick={() => setSelectedImage(budget.clientImage)}
                            className="inline-flex items-center gap-1 text-[10px] text-brand-cyan hover:underline font-mono bg-brand-cyan/10 px-2 py-0.5 rounded border border-brand-cyan/20 cursor-pointer"
                          >
                            <Paperclip className="h-3 w-3" />
                            <span>Ver</span>
                          </button>
                        ) : (
                          <span className="text-slate-600 font-mono">-</span>
                        )}
                      </td>

                      {/* Actions tools */}
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* EXECUTE BUDGET (Convert to sale) */}
                          <button
                            type="button"
                            onClick={() => {
                              setExecuteSaleDateOption("today");
                              setBudgetToExecute(budget);
                            }}
                            className="p-1 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-emerald-950/40 hover:scale-[1.03]"
                            title="Autorizar este Orçamento e converter em Venda Oficial"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                            <span>AUTORIZAR</span>
                          </button>

                          <button
                            onClick={() => handleDownloadPDF(budget)}
                            className="p-1 px-2 rounded bg-slate-900 border border-slate-800 text-brand-cyan hover:bg-slate-800 flex items-center gap-1 cursor-pointer transition-all"
                            title="Gerar e salvar orçamento como PDF"
                          >
                            <FileDown className="h-3.5 w-3.5" />
                            <span className="text-[10px] uppercase font-bold">PDF</span>
                          </button>

                          <button
                            onClick={() => handleShareWhatsApp(budget)}
                            className="p-1 px-2 rounded bg-slate-900 border border-slate-800 text-emerald-400 hover:bg-slate-800 hover:border-emerald-500/30 flex items-center gap-1 cursor-pointer transition-all"
                            title="Enviar orçamento via WhatsApp para o cliente"
                          >
                            <svg className="h-3.5 w-3.5 fill-current text-emerald-450" viewBox="0 0 24 24">
                              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.32 1.448 5.148 1.451h-.001c5.45-.002 9.88-4.416 9.884-9.84a9.75 9.75 0 0 0-2.882-6.956 9.773 9.773 0 0 0-6.968-2.891c-5.462 0-9.897 4.417-9.901 9.844a9.78 9.78 0 0 0 1.47 5.006l-.995 3.634 3.74-.984zm11.166-7.531c-.301-.15-1.78-.876-2.056-.976-.275-.1-.475-.15-.675.15-.199.3-.775.976-.95 1.176-.175.2-.35.225-.65.075-.301-.15-1.267-.467-2.414-1.485-.893-.795-1.495-1.778-1.671-2.078-.175-.3-.018-.462.13-.61.135-.133.301-.35.451-.524.15-.175.2-.3.3-.5.1-.2.05-.375-.025-.526-.075-.15-.675-1.625-.925-2.225-.244-.588-.493-.508-.675-.517-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.376-.275.3-1.05 1.026-1.05 2.5 0 1.475 1.075 2.9 1.225 3.1.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.228 1.368.196 1.883.119.574-.086 1.78-.726 2.03-1.426.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.35z"/>
                            </svg>
                            <span className="text-[10px] uppercase font-bold">Whats</span>
                          </button>
                          
                          <button
                            onClick={() => handleRequestEditBudget(budget)}
                            className="p-1 px-2 rounded bg-slate-900 border border-slate-800 text-amber-500 hover:bg-slate-800 flex items-center gap-1 cursor-pointer transition-all"
                            title="Carregar orçamento para edição"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span className="text-[10px] uppercase font-bold">Editar</span>
                          </button>

                          <button
                            onClick={() => handleRequestDeleteBudget(budget)}
                            className="p-1.5 rounded bg-slate-900 border border-slate-800 text-red-500 hover:bg-red-950/40 cursor-pointer transition-all"
                            title="Excluir do histórico de orçamentos"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
            </table>
          </div>
        )
      )}

      {/* Image zoom popup Modal */}
      {selectedImage && (() => {
        const parsedImgs = parseClientImages(selectedImage);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in text-slate-100">
            <div className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-brand-cyan" />
                  Visualizar Imagens do Serviço ({parsedImgs.length})
                </h3>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 bg-slate-950 max-h-[75vh] overflow-y-auto space-y-4">
                <div className={`grid gap-4 ${parsedImgs.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
                  {parsedImgs.map((imgUrl, idx) => (
                    <div key={idx} className="relative group border border-slate-800 rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center p-2 min-h-[250px]">
                      <img
                        src={imgUrl}
                        alt={`Anexo ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="max-h-[50vh] object-contain rounded"
                      />
                      <div className="absolute bottom-2 left-2 bg-slate-950/70 backdrop-blur-sm py-1 px-2.5 rounded-lg text-[10px] font-mono text-slate-300">
                        Imagem #{idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Quick Pay & Settle Outstanding Balance Modal (DAR BAIXA) */}
      {quickPaySale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="relative max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Coins className="h-5 w-5 text-emerald-450 animate-bounce" />
                <span>Registrar Retirada & Dar Baixa</span>
              </h3>
              <button
                onClick={() => { setQuickPaySale(null); setPaySuccessMsg(null); }}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {paySuccessMsg ? (
              /* Success message block status */
              <div className="p-6 space-y-6 text-center">
                <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Check className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-base font-bold text-white">Baixa Registrada com Sucesso!</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{paySuccessMsg}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 pt-2 justify-center">
                  <button
                    onClick={() => {
                      if (quickPaySale) {
                        const current = localSales.find(s => s.id === quickPaySale.id) || quickPaySale;
                        handleShareWhatsApp(current);
                      }
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    <svg className="h-4 w-4 fill-current text-emerald-450" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.32 1.448 5.148 1.451h-.001c5.45-.002 9.88-4.416 9.884-9.84a9.75 9.75 0 0 0-2.882-6.956 9.773 9.773 0 0 0-6.968-2.891c-5.462 0-9.897 4.417-9.901 9.844a9.78 9.78 0 0 0 1.47 5.006l-.995 3.634 3.74-.984zm11.166-7.531c-.301-.15-1.78-.876-2.056-.976-.275-.1-.475-.15-.675.15-.199.3-.775.976-.95 1.176-.175.2-.35.225-.65.075-.301-.15-1.267-.467-2.414-1.485-.893-.795-1.495-1.778-1.671-2.078-.175-.3-.018-.462.13-.61.135-.133.301-.35.451-.524.15-.175.2-.3.3-.5.1-.2.05-.375-.025-.526-.075-.15-.675-1.625-.925-2.225-.244-.588-.493-.508-.675-.517-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.376-.275.3-1.05 1.026-1.05 2.5 0 1.475 1.075 2.9 1.225 3.1.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.228 1.368.196 1.883.119.574-.086 1.78-.726 2.03-1.426.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.35z"/>
                    </svg>
                    <span>Enviar no Whats</span>
                  </button>

                  <button
                    onClick={() => {
                      if (quickPaySale) {
                        const current = localSales.find(s => s.id === quickPaySale.id) || quickPaySale;
                        handleDownloadPDF(current);
                      }
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 border border-slate-800 bg-slate-950 hover:bg-slate-850 text-slate-350 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    <FileDown className="h-4 w-4" />
                    <span>Reimprimir (PDF)</span>
                  </button>
                  
                  <button
                    onClick={() => { setQuickPaySale(null); setPaySuccessMsg(null); }}
                    className="px-4 py-2 bg-brand-cyan/20 hover:bg-brand-cyan/35 text-brand-cyan rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirmQuickPay} className="p-5 space-y-4">
                {/* Sale overview */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-850 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-[11px] uppercase tracking-wider">Cliente</span>
                    <strong className="text-white text-xs">{quickPaySale.clientName}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-[11px] uppercase tracking-wider">Contato</span>
                    <span className="text-slate-300 text-xs font-mono">{quickPaySale.clientPhone}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-850/60 pt-2 mt-1">
                    <span className="text-slate-400 text-[11px] uppercase tracking-wider">Valor total</span>
                    <span className="text-slate-300 text-xs font-mono">{formatBRL(quickPaySale.totalValue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-[11px] uppercase tracking-wider">Já pago (Sinal)</span>
                    <span className="text-emerald-450 text-xs font-mono font-bold">{formatBRL(quickPaySale.downPayment)}</span>
                  </div>
                </div>

                {/* Balance indicators card */}
                <div className="py-2.5 px-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                    <div>
                      <h4 className="text-[11px] font-bold text-yellow-400 uppercase tracking-wide">Saldo devedor restante</h4>
                      <p className="text-[10px] text-slate-400">Total a acertar na retirada</p>
                    </div>
                  </div>
                  <span className="text-lg font-extrabold font-mono text-yellow-500 tracking-tight">
                    {formatBRL(quickPaySale.balanceDue)}
                  </span>
                </div>

                {/* Input form */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-widest block">
                    Valor Recebido Hoje (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-500 font-mono text-xs font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0.01"
                      max={(quickPaySale.balanceDue + 10000).toString()}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-24 text-xs font-mono font-bold text-white focus:outline-none focus:border-brand-cyan transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setPayAmount(quickPaySale.balanceDue.toFixed(2))}
                      className="absolute right-2 top-1.5 px-2 py-1 rounded bg-yellow-500 text-slate-950 font-bold text-[9px] hover:bg-yellow-400 transition-colors uppercase cursor-pointer"
                    >
                      Quitar Tudo
                    </button>
                  </div>
                </div>

                {/* Forma de Pagamento Recebida Hoje */}
                <div className="text-left space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-widest block">
                    Meio de Recebimento
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['dinheiro', 'pix', 'cartão'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPayMethod(method)}
                        className={`py-2 px-3 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                          payMethod === method
                            ? "bg-brand-cyan/15 border-brand-cyan text-brand-cyan shadow-sm shadow-brand-cyan/20"
                            : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Options / Updates */}
                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-850/60">
                  <label className="flex items-center gap-2.5 text-slate-300 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={updateDateToToday}
                      onChange={(e) => setUpdateDateToToday(e.target.checked)}
                      className="h-4 w-4 rounded bg-slate-950 border-slate-850 text-brand-cyan focus:ring-brand-cyan cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <span className="font-bold">Lançar data de hoje</span>
                      <p className="text-[10px] text-slate-400 font-mono">
                        Insere esta venda no caixa de hoje ({new Date().toLocaleDateString("pt-BR")})
                      </p>
                    </div>
                  </label>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setQuickPaySale(null)}
                    className="flex-1 px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40"
                  >
                    <Check className="h-4 w-4" />
                    <span>Confirmar Baixa</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Visual confirmation dialog for deleting a standard sale */}
      <AnimatePresence>
        {saleToDelete && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-brand-card border border-slate-800 p-6 rounded-2xl space-y-6 shadow-2xl text-left"
            >
              <div className="flex items-start gap-3.5">
                <div className="p-3 bg-red-950/60 text-red-400 rounded-xl border border-red-900/30">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Confirmar Exclusão de Venda</h3>
                  <p className="text-xs text-slate-400 mt-1">Essa operação excluirá permanentemente o registro da venda de forma definitiva.</p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-xl space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-500 font-mono text-[10px] block uppercase">CLIENTE:</span>
                  <span className="text-slate-200 font-bold text-sm">{saleToDelete.clientName.toUpperCase()}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-900">
                  <div>
                    <span className="text-slate-500 font-mono text-[10px] block uppercase">TOTAL:</span>
                    <span className="text-slate-300 font-mono font-bold">{formatBRL(saleToDelete.totalValue)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-mono text-[10px] block uppercase">PAGO:</span>
                    <span className="text-emerald-450 font-mono font-bold">{formatBRL(saleToDelete.downPayment)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSaleToDelete(null)}
                  className="flex-grow py-2.5 border border-slate-800 text-slate-300 hover:bg-slate-900 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteSale(saleToDelete.id);
                    setSaleToDelete(null);
                  }}
                  className="flex-grow py-2.5 bg-gradient-to-r from-red-500 to-red-650 hover:from-red-650 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-red-500/10 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Excluir Registro</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Visual confirmation dialog for deleting a budget */}
      <AnimatePresence>
        {budgetToDelete && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-brand-card border border-slate-800 p-6 rounded-2xl space-y-6 shadow-2xl text-left"
            >
              <div className="flex items-start gap-3.5">
                <div className="p-3 bg-red-950/60 text-red-400 rounded-xl border border-red-900/30">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Confirmar Exclusão de Orçamento</h3>
                  <p className="text-xs text-slate-400 mt-1">Deseja realmente remover o registro deste orçamento? Esta operação não pode ser desfeita.</p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-xl space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-500 font-mono text-[10px] block uppercase">CLIENTE COM ORÇAMENTO:</span>
                  <span className="text-slate-200 font-bold text-sm">{budgetToDelete.clientName.toUpperCase()}</span>
                </div>
                <div className="pt-1.5 border-t border-slate-900">
                  <span className="text-slate-500 font-mono text-[10px] block uppercase">VALOR ESTIMADO:</span>
                  <span className="text-brand-cyan font-mono font-bold">{formatBRL(budgetToDelete.totalValue)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBudgetToDelete(null)}
                  className="flex-grow py-2.5 border border-slate-800 text-slate-300 hover:bg-slate-900 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onDeleteBudget) {
                      onDeleteBudget(budgetToDelete.id);
                    }
                    setBudgetToDelete(null);
                  }}
                  className="flex-grow py-2.5 bg-gradient-to-r from-red-500 to-red-650 hover:from-red-600 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-red-500/10 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Confirmar Exclusão</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Visual confirmation dialog for executing/promoting a budget to a sale */}
      <AnimatePresence>
        {budgetToExecute && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-brand-card border border-slate-800 p-6 rounded-2xl space-y-5 shadow-2xl text-left"
            >
              <div className="flex items-start gap-3.5 border-b border-slate-850 pb-4">
                <div className="p-3 bg-emerald-950/80 text-emerald-400 rounded-xl border border-emerald-800/40">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Autorizar e Converter em Venda</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Este orçamento será aprovado e inserido oficialmente no histórico de vendas e no faturamento do caixa.
                  </p>
                </div>
              </div>

              {/* Customer & Items Details */}
              <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-slate-500 font-mono text-[10px] block uppercase font-bold">CLIENTE:</span>
                    <span className="text-slate-200 font-bold text-sm">{budgetToExecute.clientName.toUpperCase()}</span>
                  </div>
                  {budgetToExecute.clientPhone && (
                    <div className="text-right">
                      <span className="text-slate-500 font-mono text-[10px] block uppercase font-bold">CONTATO:</span>
                      <span className="text-slate-300 font-mono text-xs">{budgetToExecute.clientPhone}</span>
                    </div>
                  )}
                </div>

                {/* Items preview list */}
                {budgetToExecute.items && budgetToExecute.items.length > 0 && (
                  <div className="pt-2 border-t border-slate-900">
                    <span className="text-slate-500 font-mono text-[10px] block uppercase font-bold mb-1">
                      ITENS DO ORÇAMENTO ({budgetToExecute.items.length}):
                    </span>
                    <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                      {budgetToExecute.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[11px] bg-slate-900/60 px-2 py-1 rounded border border-slate-850/50">
                          <span className="text-slate-300 font-medium truncate max-w-[240px]">
                            {item.quantity}x {item.description}
                          </span>
                          <span className="text-slate-200 font-mono font-bold">
                            {formatBRL(item.totalValue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Financial overview */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-900 font-mono text-xs">
                  <div>
                    <span className="text-slate-500 text-[10px] block font-bold">VALOR TOTAL:</span>
                    <span className="text-brand-cyan font-bold text-sm">{formatBRL(budgetToExecute.totalValue)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block font-bold">SINAL PAGO:</span>
                    <span className="text-emerald-400 font-bold">{formatBRL(budgetToExecute.downPayment || 0)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block font-bold">A RECEBER:</span>
                    <span className="text-amber-400 font-bold">{formatBRL(Math.max(0, budgetToExecute.totalValue - (budgetToExecute.downPayment || 0)))}</span>
                  </div>
                </div>

                {/* Date selection option */}
                <div className="pt-2 border-t border-slate-900">
                  <label className="text-slate-400 text-[11px] font-bold block mb-1.5">
                    Data da Venda Oficial:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExecuteSaleDateOption("today")}
                      className={`p-2 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                        executeSaleDateOption === "today"
                          ? "bg-emerald-950/40 border-emerald-500/50 text-white font-bold"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className={`h-2.5 w-2.5 rounded-full ${executeSaleDateOption === "today" ? "bg-emerald-400" : "bg-slate-700"}`} />
                        <span>Data de Hoje ({formatDate(new Date().toISOString())})</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExecuteSaleDateOption("original")}
                      className={`p-2 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                        executeSaleDateOption === "original"
                          ? "bg-emerald-950/40 border-emerald-500/50 text-white font-bold"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className={`h-2.5 w-2.5 rounded-full ${executeSaleDateOption === "original" ? "bg-emerald-400" : "bg-slate-700"}`} />
                        <span>Data do Orçamento ({formatDate(budgetToExecute.date)})</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBudgetToExecute(null)}
                  className="flex-grow py-2.5 border border-slate-800 text-slate-300 hover:bg-slate-900 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onExecuteBudget) {
                      const updatedBudgetToSave: Sale = {
                        ...budgetToExecute,
                        date: executeSaleDateOption === "today" ? new Date().toISOString() : budgetToExecute.date
                      };
                      onExecuteBudget(updatedBudgetToSave);
                    }
                    setBudgetToExecute(null);
                  }}
                  className="flex-grow py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>Confirmar e Faturar Venda</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom dialog alert warning for overpaid situations in Quick Pay */}
      <AnimatePresence>
        {overpaidWarningInfo && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[120] p-4 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-brand-card border border-slate-800 p-6 rounded-2xl space-y-6 shadow-2xl text-left"
            >
              <div className="flex items-start gap-3.5">
                <div className="p-3 bg-amber-950/60 text-amber-400 rounded-xl border border-amber-900/30">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Alerta de Valor Excedente!</h3>
                  <p className="text-xs text-slate-400 mt-1">O valor informado excede o saldo devedor restante do cliente.</p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-xl space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-500 font-mono text-[10px] block font-semibold">CLIENTE:</span>
                  <span className="text-slate-200 font-bold">{overpaidWarningInfo.quickPaySale.clientName.toUpperCase()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-900 font-mono text-xs">
                  <div>
                    <span className="text-slate-500 text-[10px] block font-semibold">SALDO RESTANTE:</span>
                    <span className="text-amber-400 font-bold">{formatBRL(overpaidWarningInfo.quickPaySale.balanceDue)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block font-semibold">DIGITADO AGORA:</span>
                    <span className="text-emerald-450 font-bold">{formatBRL(overpaidWarningInfo.amountPaidNow)}</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 pt-1.5 border-t border-slate-900 font-sans leading-relaxed">
                  O valor de <strong>{formatBRL(overpaidWarningInfo.amountPaidNow)}</strong> registrará uma baixa maior do que o saldo devedor restante de <strong>{formatBRL(overpaidWarningInfo.quickPaySale.balanceDue)}</strong>. Deseja realizar a baixa com este valor e prosseguir de qualquer forma?
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOverpaidWarningInfo(null)}
                  className="flex-grow py-2.5 border border-slate-800 text-slate-300 hover:bg-slate-900 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Reajustar Valor
                </button>
                <button
                  type="button"
                  onClick={overpaidWarningInfo.callback}
                  className="flex-grow py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-500/10 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>Sim, Prosseguir</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
