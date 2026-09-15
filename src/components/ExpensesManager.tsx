import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  TrendingDown,
  Plus,
  Trash2,
  Calendar,
  Filter,
  BarChart3,
  Receipt,
  Download,
  AlertCircle,
  TrendingUp,
  Briefcase,
  Layers,
  X,
  Calculator,
  Camera,
  Upload,
  Loader2,
  AlertTriangle
} from "lucide-react";
import { Expense, Sale, getSaleOperationCost, CashRegisterState, User } from "../types";
import { MonthlyBill } from "./MonthlyExpensesMeta";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from "recharts";

interface ExpensesManagerProps {
  expenses: Expense[];
  onAddExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
  sales: Sale[];
  bills?: MonthlyBill[];
  daysWorked?: number;
  cashRegister?: CashRegisterState;
  onRequestOpenRegister?: () => void;
  currentUser?: User | null;
  adminUnlocked?: boolean;
}

const CATEGORY_COLORS: { [key: string]: string } = {
  "Materiais/Insumos": "#f43f5e", // Rose
  "Ferramentas": "#f59e0b", // Amber
  "Combustível/Viagem": "#06b6d4", // Cyan
  "Luz/Água/Aluguel": "#8b5cf6", // Purple
  "Alimentação": "#ec4899", // Pink
  "Comissões/Mão de Obra": "#10b981", // Emerald
  "Manutenção": "#ea580c", // Orange
  "Outros": "#64748b", // Slate
};

const formatDisplayDate = (dateStr: string) => {
  if (!dateStr) return "S/D";
  try {
    let cleanDate = dateStr;
    if (dateStr.includes("T")) {
      cleanDate = dateStr.split("T")[0];
    }
    const parts = cleanDate.split("-");
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1];
      const day = parts[2];
      if (year.length === 4 && month.length === 2 && day.length === 2) {
        return `${day}/${month}/${year}`;
      }
    }
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("pt-BR");
    }
  } catch (e) {
    console.error("formatDisplayDate error:", e);
  }
  return dateStr;
};

const CATEGORIES = [
  "Materiais/Insumos",
  "Ferramentas",
  "Combustível/Viagem",
  "Luz/Água/Aluguel",
  "Alimentação",
  "Comissões/Mão de Obra",
  "Manutenção",
  "Outros"
];

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
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (e) {
    return clean.substring(0, 10);
  }
};

const parseExpenseDescription = (desc: string) => {
  if (!desc) return { cleanDesc: "", method: "dinheiro" };
  const trimmed = desc.trim();
  if (trimmed.startsWith("[Dinheiro]")) {
    return { cleanDesc: trimmed.replace("[Dinheiro]", "").trim(), method: "dinheiro" };
  }
  if (trimmed.startsWith("[Pix]")) {
    return { cleanDesc: trimmed.replace("[Pix]", "").trim(), method: "pix" };
  }
  if (trimmed.startsWith("[Cartão]") || trimmed.startsWith("[Cartao]")) {
    return { cleanDesc: trimmed.replace(/\[Cartã?o\]/, "").trim(), method: "cartão" };
  }
  
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("[dinheiro]")) {
    return { cleanDesc: trimmed.substring(10).trim(), method: "dinheiro" };
  }
  if (lower.startsWith("[pix]")) {
    return { cleanDesc: trimmed.substring(5).trim(), method: "pix" };
  }
  if (lower.startsWith("[cartão]") || lower.startsWith("[cartao]")) {
    return { cleanDesc: trimmed.replace(/\[cartã?o\]/i, "").trim(), method: "cartão" };
  }

  // Word matches:
  if (lower.includes("dinheiro")) return { cleanDesc: trimmed, method: "dinheiro" };
  if (lower.includes("pix")) return { cleanDesc: trimmed, method: "pix" };
  if (lower.includes("cartão") || lower.includes("cartao")) return { cleanDesc: trimmed, method: "cartão" };

  return { cleanDesc: trimmed, method: "dinheiro" };
};

const getSaleOrderDate = (sale: Sale): string => {
  if (sale.orderDate) return sale.orderDate;
  if (sale.payments && sale.payments.length > 0) {
    return sale.payments[0].date;
  }
  return sale.date;
};

export function ExpensesManager({ expenses, onAddExpense, onDeleteExpense, sales, bills = [], daysWorked = 1, cashRegister, onRequestOpenRegister, currentUser, adminUnlocked }: ExpensesManagerProps) {
  const isAttendant = currentUser && (
    currentUser.role === "atendente" ||
    currentUser.role === "seller" ||
    (currentUser.owner_id && currentUser.owner_id !== currentUser.id && currentUser.role !== "administrador" && !currentUser.is_admin)
  ) && !adminUnlocked;
  // Expense registration form state
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("Materiais/Insumos");
  const [paymentMethod, setPaymentMethod] = useState<"dinheiro" | "pix" | "cartão">("dinheiro");
  const [date, setDate] = useState(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  // Success message state
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // AI Scanned expense/receipt states
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isPreRegistered, setIsPreRegistered] = useState(false);
  const [scannedFileName, setScannedFileName] = useState("");

  const compressAndResizeImage = (file: File, maxWidth = 1200, maxHeight = 1200): Promise<{ base64: string, type: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            const resultStr = event.target?.result as string;
            const parts = resultStr.split(",");
            resolve({ base64: parts[1] || "", type: file.type || "image/jpeg" });
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          const parts = dataUrl.split(",");
          if (parts.length > 1) {
            resolve({ base64: parts[1], type: "image/jpeg" });
          } else {
            const resultStr = event.target?.result as string;
            const fallbackParts = resultStr.split(",");
            resolve({ base64: fallbackParts[1] || "", type: file.type || "image/jpeg" });
          }
        };
        img.onerror = () => {
          const resultStr = event.target?.result as string;
          const parts = resultStr.split(",");
          resolve({ base64: parts[1] || "", type: file.type || "image/jpeg" });
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo de imagem."));
    });
  };

  const handleScanReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanError(null);
    setScannedFileName(file.name);

    try {
      const { base64, type } = await compressAndResizeImage(file);

      const response = await fetch("/api/analyze-expense", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: type,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = "Erro ao analisar o comprovante.";
        try {
          const errData = JSON.parse(errText);
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = `${errMsg} (Status: ${response.status})`;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      
      if (data.descricao) {
        setDescription(data.descricao);
      }
      if (data.valor && data.valor > 0) {
        setValue(String(data.valor));
      }
      if (data.data) {
        setDate(data.data);
      } else {
        // use default date (today) if not found on receipt
        const localDate = new Date();
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, '0');
        const day = String(localDate.getDate()).padStart(2, '0');
        setDate(`${year}-${month}-${day}`);
      }
      if (data.categoria && CATEGORIES.includes(data.categoria)) {
        setCategory(data.categoria);
      } else {
        setCategory("Outros");
      }

      setIsPreRegistered(true);
      setSuccessMsg("Comprovante analisado com sucesso! Revise os dados abaixo antes de confirmar o registro.");
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      console.error(err);
      setScanError(err.message || "Não foi possível extrair dados do comprovante automaticamente.");
    } finally {
      setIsScanning(false);
      e.target.value = "";
    }
  };

  const handleDiscardPreRegister = () => {
    setDescription("");
    setValue("");
    setCategory("Materiais/Insumos");
    setPaymentMethod("dinheiro");
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    setDate(`${year}-${month}-${day}`);
    setIsPreRegistered(false);
    setScannedFileName("");
    setScanError(null);
  };
  
  // Custom delete state for iframe safety
  const [expenseToDelete, setExpenseToDelete] = useState<(Expense & { isSaleCost?: boolean }) | null>(null);

  // Report Period selection State: "day" | "month" | "custom"
  const [reportPeriod, setReportPeriod] = useState<"day" | "month" | "custom">("day");
  
  // Custom date selection for reports
  const [reportDate, setReportDate] = useState(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [reportMonth, setReportMonth] = useState(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  const [reportStart, setReportStart] = useState(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  });

  const [reportEnd, setReportEnd] = useState(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  // Expenses filter options for main list
  const [listPeriod, setListPeriod] = useState<"all" | "today" | "week" | "month">("today");

  // Selection of active dashboard card filter
  const [activeCardFilter, setActiveCardFilter] = useState<"standalone" | "sales" | "consolidated" | "bills">("consolidated");

  // Show report modal or inline report section
  const [showLargeReport, setShowLargeReport] = useState(false);

  // Form submit registering
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashRegister?.currentSession) {
      alert("⚠️ CAIXA FECHADO!\n\nVocê precisa abrir o caixa antes de registrar qualquer despesa no sistema. Você será redirecionado para a tela de abertura de caixa.");
      onRequestOpenRegister?.();
      return;
    }
    const numValue = parseFloat(value);
    if (!description.trim() || isNaN(numValue) || numValue <= 0) {
      alert("Por favor, preencha a descrição e um valor de gasto válido.");
      return;
    }

    const generateExpenseUUID = (): string => {
      if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    const prefix = paymentMethod === "dinheiro" ? "[Dinheiro] " : paymentMethod === "pix" ? "[Pix] " : "[Cartão] ";
    const newExpense: Expense = {
      id: generateExpenseUUID(),
      description: prefix + description.trim(),
      value: numValue,
      date,
      category,
    };

    onAddExpense(newExpense);
    
    // Reset form
    setDescription("");
    setValue("");
    setPaymentMethod("dinheiro");
    setIsPreRegistered(false);
    setScannedFileName("");
    setScanError(null);
    setSuccessMsg("Despesa cadastrada com sucesso!");
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  // Filtered standalone expenses for the selected listPeriod
  const filteredExpensesByPeriod = useMemo(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const monthStr = String(localDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(localDate.getDate()).padStart(2, '0');
    const todayYMD = `${year}-${monthStr}-${dayStr}`;
    const thisMonthYM = `${year}-${monthStr}`;

    const isSameWeek = (dateStr: string) => {
      try {
        const parts = dateStr.slice(0, 10).split('-');
        if (parts.length !== 3) return false;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const expenseDate = new Date(y, m, d, 12, 0, 0);

        const today = new Date();
        const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        startOfWeek.setDate(today.getDate() - today.getDay());

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return expenseDate >= startOfWeek && expenseDate <= endOfWeek;
      } catch {
        return false;
      }
    };

    return expenses.filter((exp) => {
      const expDate = getLocalDateFromISO(exp.date);
      if (listPeriod === "today") {
        return expDate === todayYMD;
      }
      if (listPeriod === "week") {
        return isSameWeek(expDate);
      }
      if (listPeriod === "month") {
        return expDate.slice(0, 7) === thisMonthYM;
      }
      return true; // all
    });
  }, [expenses, listPeriod]);

  // Filtered sales for the selected listPeriod
  const filteredSalesByPeriod = useMemo(() => {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const monthStr = String(localDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(localDate.getDate()).padStart(2, '0');
    const todayYMD = `${year}-${monthStr}-${dayStr}`;
    const thisMonthYM = `${year}-${monthStr}`;

    const isSameWeek = (dateStr: string) => {
      try {
        const parts = dateStr.slice(0, 10).split('-');
        if (parts.length !== 3) return false;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const saleDate = new Date(y, m, d, 12, 0, 0);

        const today = new Date();
        const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        startOfWeek.setDate(today.getDate() - today.getDay());

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return saleDate >= startOfWeek && saleDate <= endOfWeek;
      } catch {
        return false;
      }
    };

    return sales.filter((sale) => {
      const orderDate = getSaleOrderDate(sale);
      if (!orderDate) return false;
      const saleDate = getLocalDateFromISO(orderDate);
      if (listPeriod === "today") {
        return saleDate === todayYMD;
      }
      if (listPeriod === "week") {
        return isSameWeek(saleDate);
      }
      if (listPeriod === "month") {
        return saleDate.slice(0, 7) === thisMonthYM;
      }
      return true; // all
    });
  }, [sales, listPeriod]);

  // Combined expenses mapping for list display based on period & activeCardFilter
  const displayedExpenses = useMemo(() => {
    // 0. Registered Monthly Bills / Goals
    if (activeCardFilter === "bills") {
      const bList = bills || [];
      return bList.map((b) => ({
        id: b.id,
        description: `${b.name} (Gasto de Meta Fixa)`,
        value: b.value,
        date: b.dueDate || "",
        category: b.category || "Outros",
        isSaleCost: false,
        isMonthlyBill: true,
      })).sort((a, b) => b.description.localeCompare(a.description));
    }

    // 1. Manually registered (Standalone)
    if (activeCardFilter === "standalone") {
      return filteredExpensesByPeriod.map((e) => ({
        id: e.id,
        description: e.description,
        value: e.value,
        date: e.date,
        category: e.category,
        isSaleCost: false,
      })).sort((a, b) => b.date.localeCompare(a.date));
    }

    // 2. Direct operational cost from sales
    if (activeCardFilter === "sales") {
      const list: Array<{ id: string; description: string; value: number; date: string; category: string; isSaleCost: boolean }> = [];
      filteredSalesByPeriod.forEach((sale) => {
        const orderDate = getSaleOrderDate(sale);
        if (getSaleOperationCost(sale) > 0) {
          if (sale.costItems && sale.costItems.length > 0) {
            sale.costItems.forEach((bItem, idx) => {
              list.push({
                id: `${sale.id}-cost-${idx}`,
                description: `${bItem.description} (Venda p/ ${sale.clientName})`,
                value: bItem.value,
                date: orderDate,
                category: "Materiais/Insumos",
                isSaleCost: true,
              });
            });
          } else {
            list.push({
              id: `${sale.id}-direct-cost`,
              description: `Custo Operacional (Venda p/ ${sale.clientName})`,
              value: sale.operationCost,
              date: orderDate,
              category: "Materiais/Insumos",
              isSaleCost: true,
            });
          }
        }
        if (sale.useMotoboy && sale.motoboyCost > 0) {
          list.push({
            id: `${sale.id}-motoboy`,
            description: `Frete Motoboy (Venda p/ ${sale.clientName})`,
            value: sale.motoboyCost,
            date: orderDate,
            category: "Combustível/Viagem",
            isSaleCost: true,
          });
        }
      });
      return list.sort((a, b) => b.date.localeCompare(a.date));
    }

    // 3. Consolidated - Beide combined!
    const list: Array<{ id: string; description: string; value: number; date: string; category: string; isSaleCost: boolean }> = [];
    filteredExpensesByPeriod.forEach((e) => {
      list.push({
        id: e.id,
        description: e.description,
        value: e.value,
        date: e.date,
        category: e.category,
        isSaleCost: false,
      });
    });

    filteredSalesByPeriod.forEach((sale) => {
      const orderDate = getSaleOrderDate(sale);
      if (getSaleOperationCost(sale) > 0) {
        if (sale.costItems && sale.costItems.length > 0) {
          sale.costItems.forEach((bItem, idx) => {
            list.push({
              id: `${sale.id}-cost-${idx}`,
              description: `${bItem.description} (Venda p/ ${sale.clientName})`,
              value: bItem.value,
              date: orderDate,
              category: "Materiais/Insumos",
              isSaleCost: true,
            });
          });
        } else {
          list.push({
            id: `${sale.id}-direct-cost`,
            description: `Custo Operacional (Venda p/ ${sale.clientName})`,
            value: sale.operationCost,
            date: orderDate,
            category: "Materiais/Insumos",
            isSaleCost: true,
          });
        }
      }
      if (sale.useMotoboy && sale.motoboyCost > 0) {
        list.push({
          id: `${sale.id}-motoboy`,
          description: `Frete Motoboy (Venda p/ ${sale.clientName})`,
          value: sale.motoboyCost,
          date: orderDate,
          category: "Combustível/Viagem",
          isSaleCost: true,
        });
      }
    });

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredExpensesByPeriod, filteredSalesByPeriod, activeCardFilter, bills]);

  // Combine both standalone expenses AND sale-specific costs for absolute accuracy
  const combinedAnalyticsExpenses = useMemo(() => {
    const list: Array<{ id: string; description: string; value: number; date: string; category: string }> = [];
    
    // 1. Standalone registered expenses
    expenses.forEach((e) => {
      list.push({
        id: e.id,
        description: e.description,
        value: e.value,
        date: e.date,
        category: e.category,
      });
    });

    // 2. Direct operational costs inside completed sales
    sales.forEach((sale) => {
      const orderDate = getSaleOrderDate(sale);
      if (getSaleOperationCost(sale) > 0) {
        // If has breakdown items, let's use them
        if (sale.costItems && sale.costItems.length > 0) {
          sale.costItems.forEach((bItem, idx) => {
            list.push({
              id: `${sale.id}-cost-${idx}`,
              description: `${bItem.description} (Venda p/ ${sale.clientName})`,
              value: bItem.value,
              date: orderDate,
              category: "Materiais/Insumos", // default for item sales costs
            });
          });
        } else {
          list.push({
            id: `${sale.id}-direct-cost`,
            description: `Custo Operacional (Venda p/ ${sale.clientName})`,
            value: sale.operationCost,
            date: orderDate,
            category: "Materiais/Insumos",
          });
        }
      }
      // Add motoboy expense if active
      if (sale.useMotoboy && sale.motoboyCost > 0) {
        list.push({
          id: `${sale.id}-motoboy`,
          description: `Frete Motoboy (Venda p/ ${sale.clientName})`,
          value: sale.motoboyCost,
          date: orderDate,
          category: "Combustível/Viagem",
        });
      }
    });

    return list;
  }, [expenses, sales]);

  // Filter analytics data based on selected period
  const filteredAnalyticsData = useMemo(() => {
    return combinedAnalyticsExpenses.filter((item) => {
      const itemDate = item.date.slice(0, 10);

      if (reportPeriod === "day") {
        return itemDate === reportDate;
      }
      if (reportPeriod === "month") {
        return itemDate.slice(0, 7) === reportMonth;
      }
      if (reportPeriod === "custom") {
        return itemDate >= reportStart && itemDate <= reportEnd;
      }
      return true;
    });
  }, [combinedAnalyticsExpenses, reportPeriod, reportDate, reportMonth, reportStart, reportEnd]);

  // Calculations for analytics summary cards
  const totalPeriodValue = useMemo(() => {
    return filteredAnalyticsData.reduce((sum, item) => sum + item.value, 0);
  }, [filteredAnalyticsData]);

  // Build: What category was most spent (ranking totals)
  const categoryChartData = useMemo(() => {
    const totals: { [category: string]: number } = {};
    
    // Initialize keys to ensure they appear
    filteredAnalyticsData.forEach((item) => {
      const cat = item.category || "Outros";
      totals[cat] = (totals[cat] || 0) + item.value;
    });

    return Object.entries(totals)
      .map(([name, value]) => ({
        name,
        value: Number(value.toFixed(2)),
        color: CATEGORY_COLORS[name] || "#64748b",
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredAnalyticsData]);

  // Build: WHAT ITEM WAS MOST SPENT (ranking individual items in a bar chart!)
  const itemsChartData = useMemo(() => {
    const totals: { [description: string]: number } = {};
    
    filteredAnalyticsData.forEach((item) => {
      const desc = item.description;
      totals[desc] = (totals[desc] || 0) + item.value;
    });

    return Object.entries(totals)
      .map(([name, value]) => ({
        name,
        value: Number(value.toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7); // top 7 items
  }, [filteredAnalyticsData]);

  // Card-specific metric selectors linked with the selected listPeriod
  const standaloneTotal = useMemo(() => {
    return filteredExpensesByPeriod.reduce((sum, e) => sum + e.value, 0);
  }, [filteredExpensesByPeriod]);

  const standaloneCount = useMemo(() => {
    return filteredExpensesByPeriod.length;
  }, [filteredExpensesByPeriod]);

  const salesCostsTotal = useMemo(() => {
    return filteredSalesByPeriod.reduce((sum, s) => sum + getSaleOperationCost(s) + (s.useMotoboy ? s.motoboyCost : 0), 0);
  }, [filteredSalesByPeriod]);

  const periodSalesNetProfit = useMemo(() => {
    return filteredSalesByPeriod.reduce((sum, s) => {
      if (s.isBudget) return sum;
      const saleCost = getSaleOperationCost(s);
      const motoboyCost = s.useMotoboy ? (s.motoboyCost || 0) : 0;
      const profit = typeof s.netProfit === 'number' ? s.netProfit : (s.totalValue - saleCost - motoboyCost);
      return sum + profit;
    }, 0);
  }, [filteredSalesByPeriod]);

  const salesCostsCount = useMemo(() => {
    return filteredSalesByPeriod.filter(s => getSaleOperationCost(s) > 0 || (s.useMotoboy && s.motoboyCost > 0)).length;
  }, [filteredSalesByPeriod]);

  const consolidatedTotal = useMemo(() => {
    return standaloneTotal + salesCostsTotal;
  }, [standaloneTotal, salesCostsTotal]);

  const consolidatedCount = useMemo(() => {
    return standaloneCount + salesCostsCount;
  }, [standaloneCount, salesCostsCount]);

  const totalMonthlyBills = useMemo(() => {
    return (bills || []).reduce((sum, b) => sum + b.value, 0);
  }, [bills]);

  const dailyMetaGoalValue = useMemo(() => {
    const worked = daysWorked || 1;
    return totalMonthlyBills / worked;
  }, [totalMonthlyBills, daysWorked]);

  const metaExpenseValue = useMemo(() => {
    if (listPeriod === "today") return dailyMetaGoalValue;
    if (listPeriod === "week") return dailyMetaGoalValue * 7;
    return totalMonthlyBills; // monthly or all
  }, [listPeriod, dailyMetaGoalValue, totalMonthlyBills]);

  // Helper labels for selected report period
  const reportPeriodLabel = useMemo(() => {
    if (reportPeriod === "day") {
      const [y, m, d] = reportDate.split("-");
      return `${d}/${m}/${y}`;
    }
    if (reportPeriod === "month") {
      const [y, m] = reportMonth.split("-");
      const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      return `${months[parseInt(m, 10) - 1]} de ${y}`;
    }
    const [, sm, sd] = reportStart.split("-");
    const [, em, ed] = reportEnd.split("-");
    return `Período de ${sd}/${sm} à ${ed}/${em}`;
  }, [reportPeriod, reportDate, reportMonth, reportStart, reportEnd]);

  return (
    <div className="space-y-6">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
            <span>{isAttendant ? "Lançamento de Despesas e Sangrias" : "Gestão de Gastos e Despesas"}</span>
          </h2>
          <p className="text-xs text-slate-400">
            {isAttendant 
              ? "Cadastre compras de materiais do balcão ou retiradas (sangrias) do dinheiro do caixa de forma simplificada."
              : "Cadastre os gastos fixos ou variáveis da sua empresa para ter um cálculo real de lucros."
            }
          </p>
        </div>

        {!isAttendant && (
          <button
            type="button"
            onClick={() => setShowLargeReport(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer shadow-lg shadow-red-950/40 transform hover:scale-[1.02]"
          >
            <BarChart3 className="h-4 w-4" />
            <span>RELATÓRIO DE GASTOS COM GRÁFICO</span>
          </button>
        )}
      </div>

      {/* 2. Top-level inline stats overview config (Owner/Admin only) */}
      {!isAttendant && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total cadastrado (Standalone/Manuais) */}
        <div 
          onClick={() => setActiveCardFilter("standalone")}
          className={`bg-slate-900 p-4 rounded-2xl flex items-center justify-between transition-all duration-300 cursor-pointer select-none border group ${
            activeCardFilter === "standalone"
              ? "border-brand-magenta ring-1 ring-brand-magenta/30 shadow-xl shadow-brand-magenta/10 scale-[1.01]"
              : "border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Despesas Standalone</span>
              {activeCardFilter === "standalone" ? (
                <span className="text-[8px] bg-brand-magenta/10 text-brand-magenta border border-brand-magenta/20 px-1 py-0.5 rounded uppercase font-mono font-bold tracking-wider">
                  Filtro Ativo
                </span>
              ) : (
                <span className="text-[8px] text-slate-500 uppercase font-mono tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver
                </span>
              )}
            </div>
            <div className="text-lg font-bold font-mono text-white mt-1">
              {formatBRL(standaloneTotal)}
            </div>
            <p className="text-[9.5px] text-slate-400 mt-1 font-mono">{standaloneCount} itens manuais</p>
          </div>
          <div className={`p-2.5 rounded-xl border transition-all ${
            activeCardFilter === "standalone"
              ? "bg-brand-magenta/10 border-brand-magenta/30 text-brand-magenta"
              : "bg-slate-850 border-slate-800 text-slate-300 group-hover:bg-slate-800"
          }`}>
            <Receipt className="h-4 w-4" />
          </div>
        </div>

        {/* Total de Gastos de Vendas */}
        <div 
          onClick={() => setActiveCardFilter("sales")}
          className={`bg-slate-900 p-4 rounded-2xl flex items-center justify-between transition-all duration-300 cursor-pointer select-none border group ${
            activeCardFilter === "sales"
              ? "border-amber-500 ring-1 ring-amber-500/30 shadow-xl shadow-amber-500/10 scale-[1.01]"
              : "border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Custos de Vendas</span>
              {activeCardFilter === "sales" ? (
                <span className="text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1 py-0.5 rounded uppercase font-mono font-bold tracking-wider">
                  Filtro Ativo
                </span>
              ) : (
                <span className="text-[8px] text-slate-500 uppercase font-mono tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver
                </span>
              )}
            </div>
            <div className="text-lg font-bold font-mono text-amber-500 mt-1">
              {formatBRL(salesCostsTotal)}
            </div>
            <p className="text-[9.5px] text-slate-400 mt-1 font-mono">{salesCostsCount} custos de vendas</p>
          </div>
          <div className={`p-2.5 rounded-xl border transition-all ${
            activeCardFilter === "sales"
              ? "bg-amber-500/15 border-amber-500/30 text-amber-500"
              : "bg-slate-850 border-slate-800 text-slate-300 group-hover:bg-slate-800"
          }`}>
            <Briefcase className="h-4 w-4" />
          </div>
        </div>

        {/* CLICKABLE SPOT: Despesas da Meta Diária / Fixa */}
        <div 
          onClick={() => setActiveCardFilter("bills")}
          className={`bg-slate-900 p-4 rounded-2xl flex items-center justify-between transition-all duration-300 cursor-pointer select-none border group ${
            activeCardFilter === "bills"
              ? "border-sky-500 ring-1 ring-sky-500/30 shadow-xl shadow-sky-500/10 scale-[1.01]"
              : "border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                {listPeriod === "today" ? "Meta Diária Fixa" : listPeriod === "week" ? "Meta Semanal Fixa" : "Gasto Fixo Mensal"}
              </span>
              {activeCardFilter === "bills" ? (
                <span className="text-[8px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1 py-0.5 rounded uppercase font-mono font-bold tracking-wider">
                  Filtro A.
                </span>
              ) : (
                <span className="text-[8px] text-slate-500 uppercase font-mono tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver
                </span>
              )}
            </div>
            <div className="text-lg font-bold font-mono text-sky-400 mt-1">
              {formatBRL(metaExpenseValue)}
            </div>
            <p className="text-[9.5px] text-slate-400 mt-1 font-mono">
              {listPeriod === "today" 
                ? `Meta de ${formatBRL(totalMonthlyBills)}/mês`
                : `${(bills || []).length} despesas cadastradas`
              }
            </p>
          </div>
          <div className={`p-2.5 rounded-xl border transition-all ${
            activeCardFilter === "bills"
              ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
              : "bg-slate-850 border-slate-800 text-slate-300 group-hover:bg-slate-800"
          }`}>
            <Calculator className="h-4 w-4" />
          </div>
        </div>

        {/* Despesa Geral Consolidada */}
        <div 
          onClick={() => setActiveCardFilter("consolidated")}
          className={`bg-slate-900 p-4 rounded-2xl flex items-center justify-between transition-all duration-300 cursor-pointer select-none border group ${
            activeCardFilter === "consolidated"
              ? "border-red-500 ring-1 ring-red-500/30 shadow-xl shadow-red-500/10 scale-[1.01]"
              : "border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Despesa Consolidada</span>
              {activeCardFilter === "consolidated" ? (
                <span className="text-[8px] bg-red-500/10 text-red-500 border border-red-500/20 px-1 py-0.5 rounded uppercase font-mono font-bold tracking-wider">
                  Filtro Ativo
                </span>
              ) : (
                <span className="text-[8px] text-slate-500 uppercase font-mono tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver
                </span>
              )}
            </div>
            <div className="text-lg font-bold font-mono text-red-400 mt-1">
              {formatBRL(consolidatedTotal)}
            </div>
            <p className="text-[9.5px] text-slate-400 mt-1 font-mono">{consolidatedCount} saídas consolidadas</p>
          </div>
          <div className={`p-2.5 rounded-xl border transition-all ${
            activeCardFilter === "consolidated"
              ? "bg-red-500/15 border-red-500/30 text-red-400"
              : "bg-slate-850 border-slate-800 text-slate-300 group-hover:bg-slate-800"
          }`}>
            <TrendingDown className="h-4 w-4" />
          </div>
        </div>

        {/* Gasto Geral + Metas (Total) */}
        <div 
          onClick={() => setActiveCardFilter("bills")}
          className={`bg-slate-900 p-4 rounded-2xl flex flex-col justify-between transition-all duration-300 cursor-pointer select-none border group ${
            activeCardFilter === "bills"
              ? "border-emerald-500 ring-1 ring-emerald-500/30 shadow-xl shadow-emerald-950/10 scale-[1.01]"
              : "border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase font-black text-slate-300 tracking-wider">GASTO TOTAL DO DIA</span>
              <span className="text-[8.5px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 py-0.5 rounded uppercase font-mono font-bold tracking-wider">
                Total Geral
              </span>
            </div>
            <div className="p-1 px-1.5 rounded-lg border border-emerald-505/20 bg-emerald-950/20 text-emerald-400 text-[10px] font-mono leading-none">
              SUM
            </div>
          </div>
          <div className="mt-1">
            <div className="text-lg font-black font-mono text-emerald-400 leading-none">
              {formatBRL(consolidatedTotal + metaExpenseValue)}
            </div>
            <p className="text-[9px] text-slate-400 mt-1 font-mono leading-tight">
              {listPeriod === "today" 
                ? `Meta Diária ${formatBRL(metaExpenseValue)} + Despesas do Dia ${formatBRL(consolidatedTotal)}`
                : `Meta F. ${formatBRL(metaExpenseValue)} + Despesas ${formatBRL(consolidatedTotal)}`
              }
            </p>

            {/* Sales Profit Coverage calculation details */}
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-slate-400">
                <span>Cobrado por Lucro:</span>
                <span className="font-bold text-slate-100">{formatBRL(periodSalesNetProfit)}</span>
              </div>
              <div className="flex items-center justify-between text-[9px]">
                {periodSalesNetProfit >= (consolidatedTotal + metaExpenseValue) ? (
                  <>
                    <span className="text-emerald-450 font-bold uppercase tracking-wider">Meta Diária Coberta! 🎉</span>
                    <span className="font-black text-emerald-400">-{formatBRL(periodSalesNetProfit - (consolidatedTotal + metaExpenseValue))}</span>
                  </>
                ) : (
                  <>
                    <span className="text-amber-455 font-bold uppercase tracking-wider">Falta para Cobrir:</span>
                    <span className="font-black text-amber-500">{formatBRL((consolidatedTotal + metaExpenseValue) - periodSalesNetProfit)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* 3. Panel splits: Form registration on left, fast list on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Form panel */}
        <div className={`bg-brand-card border rounded-2xl p-5 space-y-4 transition-all duration-300 ${
          isPreRegistered 
            ? "border-amber-500/50 shadow-lg shadow-amber-950/15 bg-gradient-to-b from-brand-card to-amber-950/5" 
            : "border-slate-800"
        }`}>
          <div className="border-b border-slate-850 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 px-2 rounded bg-red-500/10 border border-red-500/25 text-red-500 text-[10px] font-bold">REGISTRO</div>
              <h3 className="text-sm font-bold text-white">Lançar Novo Gasto</h3>
            </div>
            
            {isPreRegistered && (
              <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full uppercase font-mono font-bold animate-pulse">
                Preenchido por IA
              </span>
            )}
          </div>

          {/* AI Receipt Scanner section */}
          <div className="bg-slate-950/60 border border-slate-850/80 p-3 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-rose-450 uppercase tracking-wider block">
                ⭐ Leitura de Comprovante via IA
              </span>
              <span className="text-[8px] bg-slate-850 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                Beta
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Faça upload ou tire foto do recibo para gerar um pré-cadastro automático para posterior confirmação.
            </p>
            
            <div className="flex gap-2 pt-1">
              {/* Upload Button */}
              <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-[10.5pt] md:text-[10px] text-slate-200 font-bold uppercase rounded-lg transition-all cursor-pointer">
                <Upload className="h-3.5 w-3.5 text-rose-500" />
                <span>Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScanReceipt}
                  disabled={isScanning}
                  className="hidden"
                />
              </label>

              {/* Camera Button (for mobile capture) */}
              <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-[10.5pt] md:text-[10px] text-slate-200 font-bold uppercase rounded-lg transition-all cursor-pointer">
                <Camera className="h-3.5 w-3.5 text-sky-400" />
                <span>Tirar Foto</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleScanReceipt}
                  disabled={isScanning}
                  className="hidden"
                />
              </label>
            </div>

            {/* Scanning status */}
            {isScanning && (
              <div className="flex items-center gap-2 p-2 bg-rose-500/5 border border-rose-500/20 rounded-lg text-rose-400 text-[10.5px]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="font-medium animate-pulse">Analisando comprovante "{scannedFileName}" com IA...</span>
              </div>
            )}

            {/* Scan Error */}
            {scanError && (
              <div className="flex items-start gap-2 p-2 bg-red-950/40 border border-red-900/40 rounded-lg text-red-400 text-[10px] leading-snug">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{scanError}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {isPreRegistered && (
              <div className="flex items-start justify-between bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl gap-2.5">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 animate-pulse shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider block">CONFERÊNCIA REQUERIDA</span>
                    <p className="text-[9px] text-slate-400 leading-snug">
                      Os dados abaixo foram extraídos do recibo. Modifique se necessário e clique em confirmar para oficializar o gasto.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDiscardPreRegister}
                  className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[9px] font-bold uppercase rounded border border-red-500/20 transition-all cursor-pointer whitespace-nowrap"
                >
                  Descartar
                </button>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Descrição do Gasto *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Fita isolante, Gás R410, Almoço da equipe"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 transition-all placeholder:text-slate-600 ${
                  isPreRegistered ? "border-amber-500/40 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/10 font-medium" : "border-slate-850"
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Value */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">
                  Valor (R$) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-orange-400 font-bold text-xs">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0.01"
                    placeholder="25.00"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className={`w-full bg-slate-950 border rounded-xl pl-8 pr-2 py-2 text-xs font-bold text-white focus:outline-none focus:border-red-500 transition-all placeholder:text-slate-600 ${
                      isPreRegistered ? "border-amber-500/40 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/10" : "border-slate-850"
                    }`}
                  />
                </div>
              </div>

              {/* Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Data de Lançamento
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`w-full bg-slate-950 border rounded-xl px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-red-500 transition-all font-mono ${
                    isPreRegistered ? "border-amber-500/40 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/10" : "border-slate-850"
                  }`}
                />
              </div>
            </div>

            {/* Category and Payment Method dropdowns */}
            <div className="grid grid-cols-2 gap-3 font-sans">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Categoria / Classificação
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-red-500 transition-all cursor-pointer ${
                    isPreRegistered ? "border-amber-500/40 focus:border-amber-500" : "border-slate-850"
                  }`}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Meio de Pagamento *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-red-500 transition-all cursor-pointer ${
                    isPreRegistered ? "border-amber-500/40 focus:border-amber-500" : "border-slate-850"
                  }`}
                >
                  <option value="dinheiro">💵 Dinheiro</option>
                  <option value="pix">📱 Pix</option>
                  <option value="cartão">💳 Cartão</option>
                </select>
              </div>
            </div>

            {successMsg && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 font-mono text-[10px] text-center animate-pulse">
                {successMsg}
              </div>
            )}

            {/* Save Button */}
            {isPreRegistered ? (
              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-orange-950/40"
              >
                <Plus className="h-4 w-4 stroke-[3px]" />
                <span>CONFIRMAR E REGISTRAR DESPESA</span>
              </button>
            ) : (
              <button
                type="submit"
                className="w-full py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-black/40"
              >
                <Plus className="h-4 w-4" />
                <span>REGISTRAR DESPESA</span>
              </button>
            )}
          </form>
        </div>

        {/* Expenses list panel */}
        <div className="bg-brand-card border border-slate-800 rounded-2xl p-5 lg:col-span-2 space-y-4">
          
          {/* List Headers and Filter Periods */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-850 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1 px-2 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold font-mono">
                {activeCardFilter === "standalone" ? "DESPESAS MANUAIS" : activeCardFilter === "sales" ? "CUSTOS DE VENDAS" : activeCardFilter === "bills" ? "GASTOS DA META DIÁRIA" : "CONSOLIDADO"}
              </div>
              <h3 className="text-sm font-bold text-white uppercase tracking-tight">
                {activeCardFilter === "standalone" ? "Despesas Standalone" : activeCardFilter === "sales" ? "Custos de Vendas" : activeCardFilter === "bills" ? "Gastos Cadastrados de Meta Diária" : "Exibindo Todo o Consolidado"}
              </h3>
            </div>
            
            {/* Extended list period pills including week */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-850 text-[10.5px]">
              <button
                type="button"
                onClick={() => setListPeriod("today")}
                className={`px-2 py-1 rounded cursor-pointer transition-all ${listPeriod === "today" ? "bg-slate-900 border border-slate-800 text-white font-bold" : "text-slate-450 hover:text-slate-250"}`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setListPeriod("week")}
                className={`px-2 py-1 rounded cursor-pointer transition-all ${listPeriod === "week" ? "bg-slate-900 border border-slate-800 text-white font-bold" : "text-slate-450 hover:text-slate-250"}`}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => setListPeriod("month")}
                className={`px-2 py-1 rounded cursor-pointer transition-all ${listPeriod === "month" ? "bg-slate-900 border border-slate-800 text-white font-bold" : "text-slate-450 hover:text-slate-250"}`}
              >
                Mês
              </button>
              <button
                type="button"
                onClick={() => setListPeriod("all")}
                className={`px-2 py-1 rounded cursor-pointer transition-all ${listPeriod === "all" ? "bg-slate-900 border border-slate-800 text-white font-bold" : "text-slate-450 hover:text-slate-250"}`}
              >
                Todas
              </button>
            </div>
          </div>

          {/* List Body */}
          {displayedExpenses.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2 select-none">
              <div className="mx-auto h-10 w-10 text-slate-650 flex items-center justify-center rounded-full bg-slate-950 border border-slate-900">
                <Receipt className="h-5 w-5 text-slate-600" />
              </div>
              <p className="text-xs">Nenhum gasto ou custo atende a este filtro no período selecionado.</p>
              <p className="text-[10px] text-slate-650">Escolha outro filtro nos botões acima ou mude o período.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-slate-850/60 text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-950/20">
                    <th className="p-2.5">Descrição</th>
                    <th className="p-2.5">Categoria</th>
                    <th className="p-2.5">Data</th>
                    <th className="p-2.5 text-right">Valor</th>
                    <th className="p-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/40">
                  {displayedExpenses.map((expense) => {
                    const { cleanDesc, method } = parseExpenseDescription(expense.description);
                    return (
                      <tr key={expense.id} className="hover:bg-slate-900/40 transition-colors group">
                        <td className="p-2.5 font-medium text-slate-200">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 flex-wrap">
                            <span>{cleanDesc}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase max-w-fit flex items-center gap-1 ${
                              method === "dinheiro" 
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/15" 
                                : method === "pix"
                                  ? "bg-sky-500/10 text-sky-400 border-sky-500/15"
                                  : "bg-purple-500/10 text-purple-400 border-purple-500/15"
                            }`}>
                              {method === "dinheiro" ? "💵 Dinheiro" : method === "pix" ? "📱 Pix" : "💳 Cartão"}
                            </span>
                            {expense.isSaleCost && (
                              <span 
                                title="Origem: Mapeamento Automático de Pedido / Venda"
                                className="text-[9px] font-mono uppercase bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/10 font-bold max-w-fit"
                              >
                                AUTOMÁTICO DEVENDAS
                              </span>
                            )}
                            {(expense as any).isMonthlyBill && (
                              <span 
                                title="Origem: Planejamento / Gastos de Meta cadastrados na guia Metas"
                                className="text-[9px] font-mono uppercase bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded border border-sky-500/15 font-bold max-w-fit"
                              >
                                GASTO DE META
                              </span>
                            )}
                          </div>
                        </td>
                      <td className="p-2.5">
                        <span 
                          style={{ color: CATEGORY_COLORS[expense.category] || "#64748b" }}
                          className="px-2 py-0.5 rounded-full bg-slate-950 border border-slate-850/40 text-[10px] font-mono font-medium"
                        >
                          {expense.category}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-[10px] text-slate-450">
                        {formatDisplayDate(expense.date)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-red-400">
                        {formatBRL(expense.value)}
                      </td>
                      <td className="p-2.5 text-right">
                        {(expense as any).isMonthlyBill ? (
                          <span className="text-[10px] text-slate-500 italic block font-sans">Aba Gastos & Meta</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setExpenseToDelete(expense as any)}
                            className={`p-1 rounded transition-all cursor-pointer opacity-80 group-hover:opacity-100 ${
                              expense.isSaleCost
                                ? "hover:bg-amber-950/20 text-slate-500 hover:text-amber-500"
                                : "hover:bg-red-950/20 text-slate-500 hover:text-red-400"
                            }`}
                            title={expense.isSaleCost ? "Excluir custo automático vinculado a esta venda" : "Excluir Despesa"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 4. ANALYTICAL REPORT MODAL - FULL COCKPIT SCREEN FOR DETAILED GRAPHS */}
      {showLargeReport && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto animate-fade-in">
          <div className="relative max-w-4xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl my-8">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-850 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-650/10 border border-red-500/20 text-red-500">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Relatório Analítico de Gastos</h3>
                  <p className="text-xs text-slate-400">Visão consolidada por categorias e itens do que mais foi gasto</p>
                </div>
              </div>
              
              <button
                onClick={() => setShowLargeReport(false)}
                className="p-1.5 hover:bg-slate-850 text-slate-400 hover:text-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content Dashboard */}
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto select-none">
              
              {/* Report Controls: Dia, Mês, Custom Date */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-850 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-red-400" />
                    <span>Filtrar Período do Relatório</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">Selecione o filtro de escala temporal que deseja analisar</p>
                </div>

                {/* Period Pills */}
                <div className="flex items-center gap-1.5 self-start md:self-auto bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setReportPeriod("day")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      reportPeriod === "day"
                        ? "bg-red-600 text-white shadow-md shadow-red-950/30"
                        : "text-slate-400 hover:text-slate-250"
                    }`}
                  >
                    Hoje (Dia)
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportPeriod("month")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      reportPeriod === "month"
                        ? "bg-red-600 text-white shadow-md shadow-red-950/30"
                        : "text-slate-400 hover:text-slate-250"
                    }`}
                  >
                    Este Mês (Mês)
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportPeriod("custom")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      reportPeriod === "custom"
                        ? "bg-red-600 text-white shadow-md shadow-red-950/30"
                        : "text-slate-400 hover:text-slate-250"
                    }`}
                  >
                    Por Data (Período)
                  </button>
                </div>
              </div>

              {/* Dynamic Inputs corresponding to Selected Period */}
              <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl flex flex-col md:flex-row items-center gap-4 animate-fade-in">
                
                {reportPeriod === "day" && (
                  <div className="space-y-1.5 flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Selecionar Dia para Análise</label>
                    <input
                      type="date"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                    />
                  </div>
                )}

                {reportPeriod === "month" && (
                  <div className="space-y-1.5 flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Selecionar Mês para Análise</label>
                    <input
                      type="month"
                      value={reportMonth}
                      onChange={(e) => setReportMonth(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                    />
                  </div>
                )}

                {reportPeriod === "custom" && (
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Data de Início</label>
                      <input
                        type="date"
                        value={reportStart}
                        onChange={(e) => setReportStart(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Data de Término</label>
                      <input
                        type="date"
                        value={reportEnd}
                        onChange={(e) => setReportEnd(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Quick Stats overview of filtered list */}
                <div className="md:w-64 w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-right">
                  <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider block">Gasto Total no Período</span>
                  <span className="text-xl font-extrabold font-mono text-rose-500 block">
                    {formatBRL(totalPeriodValue)}
                  </span>
                  <p className="text-[10px] text-slate-500 mt-0.5 mt-1 font-mono italic">{reportPeriodLabel}</p>
                </div>
              </div>

              {/* EMPTY STATE */}
              {filteredAnalyticsData.length === 0 ? (
                <div className="py-20 text-center bg-slate-950 border border-slate-850 rounded-2xl space-y-3">
                  <AlertCircle className="mx-auto h-10 w-10 text-yellow-500/80" />
                  <div className="space-y-1">
                    <h5 className="font-bold text-white text-sm">Sem gastos neste período</h5>
                    <p className="text-xs text-slate-500">Não há despesas lançadas ou custos de vendas registrados no período selecionado.</p>
                  </div>
                </div>
              ) : (
                /* INTERACTIVE CHARTS WRAPPER */
                <div className="space-y-8 animate-fade-in">
                  
                  {/* Category Donut & Items Bar Chart Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Category Donut Chart Card */}
                    <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Layers className="h-4 w-4 text-emerald-400" />
                          <span>Distribuição por Categorias</span>
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-1">Como suas despesas estão distribuídas categoricamente</p>
                      </div>

                      {/* Donut Chart visual */}
                      <div className="h-48 my-3">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoryChartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={75}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {categoryChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ backgroundColor: "#020617", border: "1px solid #1e293b", borderRadius: "10px" }}
                              itemStyle={{ color: "#fff", fontFamily: "monospace", fontSize: "11px" }}
                              formatter={(v: number) => formatBRL(v)}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Category list rank custom legend */}
                      <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-xl border border-slate-850 max-h-32 overflow-y-auto">
                        {categoryChartData.map((item) => (
                          <div key={item.name} className="flex items-center justify-between text-[11px] font-mono">
                            <div className="flex items-center gap-1.5">
                              <span style={{ backgroundColor: item.color }} className="h-2 w-2 rounded-full shrink-0"></span>
                              <span className="text-slate-300 font-semibold">{item.name}</span>
                            </div>
                            <span className="font-bold text-slate-100">{formatBRL(item.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Ranking: What was spent most Bar Chart */}
                    <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <BarChart3 className="h-4 w-4 text-red-500" />
                          <span>O Que Mais Foi Gasto (Top 7 Itens)</span>
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-1">Classificação descritiva dos maiores ralos de dinheiro</p>
                      </div>

                      {/* Bar chart visualizer */}
                      <div className="h-52 my-3">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={itemsChartData} layout="vertical" margin={{ left: -15, right: 10, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" stroke="#64748b" style={{ fontSize: "9px" }} />
                            <YAxis dataKey="name" type="category" stroke="#334155" width={75} style={{ fontSize: "8.5px", fontWeight: "semibold" }} tickFormatter={(val) => val.length > 10 ? `${val.slice(0, 9)}...` : val} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#020617", border: "1px solid #1e293b", borderRadius: "10px" }}
                              itemStyle={{ color: "#fff", fontFamily: "monospace", fontSize: "11px" }}
                              formatter={(v: number) => formatBRL(v)}
                            />
                            <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]}>
                              {itemsChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? "#ef4444" : index < 3 ? "#f43f5e" : "#fb7185"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Fast statistics summary */}
                      <div className="p-3 bg-red-650/5 border border-red-500/10 rounded-xl text-slate-400 text-[10.5px]">
                        💡 O item com maior impacto no caixa do período foi <span className="text-white font-bold font-mono">"{itemsChartData[0]?.name}"</span> acumulando o montante de <span className="text-red-400 font-bold font-mono">{formatBRL(itemsChartData[0]?.value || 0)}</span>.
                      </div>
                    </div>

                  </div>

                  {/* Complete Historic Listing for Selected Report Period */}
                  <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Detalhamento dos Lançamentos no Período</h4>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-400 font-mono">
                        {filteredAnalyticsData.length} registros
                      </span>
                    </div>

                    <div className="overflow-x-auto max-h-56 overflow-y-auto border border-slate-850/60 rounded-xl">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead>
                          <tr className="border-b border-slate-850 text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-900 font-mono">
                            <th className="p-2.5">Descrição do Gasto</th>
                            <th className="p-2.5">Data</th>
                            <th className="p-2.5">Categoria</th>
                            <th className="p-2.5 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850/30">
                          {filteredAnalyticsData.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-900/60 transition-colors">
                              <td className="p-2.5 font-sans font-medium text-slate-100 flex items-center gap-1.5">
                                {item.id.includes("-cost") || item.id.includes("-direct") ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-mono">Venda</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20 text-[9px] font-mono">Geral</span>
                                )}
                                <span>{item.description}</span>
                              </td>
                              <td className="p-2.5 font-mono text-[10.5px] text-slate-450">
                                {formatDisplayDate(item.date)}
                              </td>
                              <td className="p-2.5">
                                <span 
                                  style={{ color: CATEGORY_COLORS[item.category] || "#64748b" }}
                                  className="text-[10px] font-semibold"
                                >
                                  {item.category}
                                </span>
                              </td>
                              <td className="p-2.5 text-right font-mono font-extrabold text-red-400">
                                {formatBRL(item.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-slate-850 bg-slate-950 flex justify-between items-center">
              <p className="text-[10px] text-slate-500 italic">Estadísticas compiladas com base no banco de dados local.</p>
              <button
                onClick={() => setShowLargeReport(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                Voltar e Fechar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal confirmation for deleting an expense */}
      <AnimatePresence>
        {expenseToDelete && (
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
                  <h3 className="font-bold text-white text-base">Confirmar Exclusão de Despesa</h3>
                  <p className="text-xs text-slate-400 mt-1">Essa operação excluirá permanente o gasto registrado e reajustará os balancetes.</p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-xl space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-500 font-mono text-[10px] block uppercase">DESCRIÇÃO DA DESPESA / GASTO:</span>
                  <span className="text-slate-200 font-bold text-sm">{expenseToDelete.description}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-900">
                  <div>
                    <span className="text-slate-500 font-mono text-[10px] block uppercase">CATEGORIA:</span>
                    <span className="text-slate-300 font-bold">{expenseToDelete.category}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-mono text-[10px] block uppercase">VALOR:</span>
                    <span className="text-red-400 font-mono font-bold text-sm">{formatBRL(expenseToDelete.value)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setExpenseToDelete(null)}
                  className="flex-grow py-2.5 border border-slate-800 text-slate-300 hover:bg-slate-900 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteExpense(expenseToDelete.id);
                    setExpenseToDelete(null);
                  }}
                  className="flex-grow py-2.5 bg-gradient-to-r from-red-500 to-red-650 hover:from-red-600 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-red-500/10 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Excluir Despesa</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
