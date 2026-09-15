import React, { useState, useRef, useEffect } from "react";
import {
  Save,
  Search,
  Package,
  Edit,
  Trash2,
  Boxes,
  Layers,
  Sparkles,
  Check,
  X,
  TrendingUp,
  AlertTriangle,
  Camera,
  Loader2,
  Plus,
  Minus
} from "lucide-react";
import { CatalogProduct, User } from "../types";
import { getSupabase } from "../supabase";

// Helper to generate a valid RFC4122 v4 UUID
const generateProductUUID = (): string => {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Robust helper to read File, compress/resize it, and convert safely to base64 string
const fileToBase64 = (file: File, maxWidth = 1200, maxHeight = 1200): Promise<string> => {
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
          resolve(parts[1] || "");
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        const parts = dataUrl.split(",");
        if (parts.length > 1) {
          resolve(parts[1]);
        } else {
          const resultStr = event.target?.result as string;
          const fallbackParts = resultStr.split(",");
          resolve(fallbackParts[1] || "");
        }
      };
      img.onerror = () => {
        const resultStr = event.target?.result as string;
        const parts = resultStr.split(",");
        resolve(parts[1] || "");
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo de imagem."));
  });
};

interface ProductCatalogManagerProps {
  catalogProducts: CatalogProduct[];
  setCatalogProducts: React.Dispatch<React.SetStateAction<CatalogProduct[]>>;
  addToast: (message: string, type?: "success" | "info" | "warning" | "error" | "goal") => void;
  currentUser: User | null;
}

export function ProductCatalogManager({
  catalogProducts,
  setCatalogProducts,
  addToast,
  currentUser
}: ProductCatalogManagerProps) {
  // Form Fields State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [minStock, setMinStock] = useState("");
  const [currentStock, setCurrentStock] = useState("");
  
  // Filtering and Success States
  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out" | "profitable">("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Deleted products log local state
  const [deletedProducts, setDeletedProducts] = useState<CatalogProduct[]>(() => {
    try {
      const saved = localStorage.getItem("NUCLEO_DELETED_PRODUCTS");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showDeletedLog, setShowDeletedLog] = useState(false);

  // Auto fill by receipt camera picture states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [importedItems, setImportedItems] = useState<Array<{
    id: string;
    description: string;
    costPrice: string;
    salePrice: string;
    minStock: string;
    currentStock: string;
  }>>([]);

  // Safe currency visual formatter that never crashes on string/number conversion anomalies
  const formatBRL = (val: any) => {
    const num = typeof val === "number" ? val : parseFloat(val) || 0;
    return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

    // Helper to save a single product in an isolated, schema-safe way
    const dbSaveCatalogProduct = async (prod: CatalogProduct, userId: string): Promise<boolean> => {
      const supabase = getSupabase();
      if (!supabase) return false;

      // Ensure 'id' is a valid UUID to avoid PostgreSQL 22P02 database error (invalid input syntax for type uuid)
      let cleanId = prod.id;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(cleanId)) {
        cleanId = generateProductUUID();
        // Synchronize back to the react state reference so that state matches DB
        prod.id = cleanId;
      }

      // Ensure 'userId' is a valid UUID to avoid PostgreSQL 22P02 database error
      let cleanUserId = userId;
      if (!uuidRegex.test(cleanUserId)) {
        let hex = "";
        for (let i = 0; i < cleanUserId.length; i++) {
          hex += cleanUserId.charCodeAt(i).toString(16);
        }
        hex = hex.padEnd(32, "0").toLowerCase();
        cleanUserId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      }

      // 1. CAPTURA E CONVERSÃO DE TIPOS (HTML/Campos para Banco de Dados)
      const descriptionText = String(prod.description).trim();
      const costValue = parseFloat(String(prod.costPrice)) || 0;
      const saleValue = parseFloat(String(prod.salePrice)) || 0;
      const minStockVal = parseInt(String(prod.minStock)) || 0;
      const currentStockVal = parseInt(String(prod.currentStock)) || 0;
      const calculatedProfit = saleValue - costValue;

      // A. PT-Snake payload (Active standard scheme for Portuguese columns)
      const ptPayload = {
        id: cleanId,
        user_id: cleanUserId,
        nome: descriptionText, // Correto mapeamento: descrição do formulário gravada na coluna 'nome'
        preco_custo: costValue,
        preco_venda: saleValue,
        lucro: calculatedProfit,
        estoque_minimo: minStockVal,
        estoque_atual: currentStockVal
      };

      // 2. Tentar salvar no formato PT primeiro do banco de dados real
      let ptErrorMsg = "";
      try {
        const { error } = await supabase
          .from("produtos")
          .upsert(ptPayload); // upsert triggers either insert or update safely based on primary key ID

        if (!error) {
          console.log("Produto salvo com sucesso no Supabase (formato PT usando coluna 'nome')!");
          return true;
        }

        ptErrorMsg = error.message;
        console.warn("Erro ao salvar produto com payload PT. Tentando formato secundário EN...", error.message);
      } catch (err: any) {
        ptErrorMsg = err.message || String(err);
        console.warn("Exceção ocorrida ao salvar payload PT:", err);
      }

      // B. EN-Snake payload (Fallback para formato inglês)
      const enPayload = {
        id: cleanId,
        user_id: cleanUserId,
        description: descriptionText,
        name: descriptionText,
        cost_price: costValue,
        sale_price: saleValue,
        profit: calculatedProfit,
        min_stock: minStockVal,
        current_stock: currentStockVal
      };

      try {
        const { error } = await supabase
          .from("produtos")
          .upsert(enPayload);

        if (!error) {
          console.log("Produto salvo com sucesso no Supabase (formato fallback EN)!");
          return true;
        }

        // Se falhar também no formato EN, gera o alerta visual conforme solicitado
        alert(`⚠️ Falha ao salvar produto no Supabase!\n\nErro Formato PT: ${ptErrorMsg}\nErro Formato EN: ${error.message}\nDetalhes: ${error.details || "Nenhum"}\nCódigo: ${error.code}`);
      } catch (err: any) {
        alert(`💥 Exceção Fatal no Aplicativo ao gravar o produto:\n${err.message || err}`);
      }

    return false;
  };

  // Load products from Supabase when component mounts
  useEffect(() => {
    if (!currentUser) return;
    const loadProducts = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      try {
        const { data, error } = await supabase
          .from("produtos")
          .select("*")
          .eq("user_id", currentUser.id);

        if (error) {
          console.error("Erro ao carregar produtos:", error);
          addToast("Erro ao carregar produtos do Supabase ⚠️", "error");
        } else if (data) {
          const mappedProducts: CatalogProduct[] = data.map((d: any) => {
            const cost = Number(d.cost_price ?? d.costPrice ?? d.preco_custo ?? d.valor_custo ?? 0);
            const sale = Number(d.sale_price ?? d.salePrice ?? d.preco_venda ?? d.valor_venda ?? 0);
            return {
              id: d.id,
              description: d.description || d.name || d.nome || d.descricao || "",
              costPrice: cost,
              salePrice: sale,
              profit: sale - cost,
              minStock: Number(d.min_stock ?? d.minStock ?? d.estoque_minimo ?? 0),
              currentStock: Number(d.current_stock ?? d.currentStock ?? d.estoque_atual ?? 0)
            };
          });
          setCatalogProducts(mappedProducts);
        }
      } catch (err) {
        console.error("Erro ao sincronizar produtos:", err);
      }
    };
    loadProducts();
  }, [currentUser]);

  // Quick adjust stock columns directly from list
  const handleQuickAdjustStock = (productId: string, amount: number) => {
    let updatedProduct: CatalogProduct | null = null;

    setCatalogProducts(prev =>
      prev.map(p => {
        if (p.id === productId) {
          const newStock = Math.max(0, p.currentStock + amount);
          updatedProduct = { ...p, currentStock: newStock };
          return updatedProduct;
        }
        return p;
      })
    );

    // Save stock update to Supabase
    if (currentUser) {
      setTimeout(() => {
        if (!updatedProduct) return;
        dbSaveCatalogProduct(updatedProduct, currentUser.id);
      }, 50);
    }

    addToast("Estoque ajustado rapidamente! 📦⚡", "success");
  };

  // Process image locally, send to the Gemini extraction API, and populate draft session for user review
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    addToast("Processando imagem da nota/cupom com inteligência artificial... 📸", "info");

    try {
      // 1. Convert file to Base64 asynchronously and ensure the prefix metadata is stripped cleanly
      let base64String = "";
      try {
        base64String = await fileToBase64(file);
      } catch (err: any) {
        throw new Error(`Falha ao converter ou limpar imagem: ${err.message}`);
      }

      // 2. Perform analytical API request to the backend with clean Base64 payload
      const res = await fetch("/api/analyze-receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64: base64String,
          mimeType: file.type || "image/jpeg",
        }),
      });

      let data;
      const resText = await res.text();
      try {
        data = JSON.parse(resText);
      } catch (parseErr) {
        throw new Error(
          `Não foi possível decodificar a resposta do servidor: ${resText.slice(0, 100)}... (Status: ${res.status}). Certifique-se de que o servidor está online e configurado nas Configurações > Secrets.`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || `Erro na análise da imagem (Código: ${res.status}).`);
      }
      let rawItems = [];

      if (data && data.items && Array.isArray(data.items)) {
        rawItems = data.items;
      } else if (data && (data.nome || data.description)) {
        rawItems = [data];
      } else {
        throw new Error("Não foi possível extrair produtos válidos da foto.");
      }

      if (rawItems.length === 0) {
        throw new Error("Nenhum item identificável ou produto foi retornado pela IA.");
      }

      // Limit batch list to up to 10 products as requested
      const limitedItems = rawItems.slice(0, 10);

      // Map to the draft importedItems state, leaving only sale price (Preço de Venda) for the user to preencher/fill out
      const draftItems = limitedItems.map((item: any) => {
        const id = generateProductUUID();
        const nome = (item.nome || item.description || "Sem descrição").trim();
        const costPrice = String(item.preco_custo || item.costPrice || "0.00");
        const salePrice = String(item.preco_venda || item.salePrice || "0.00");
        const currentStock = String(item.estoque_atual || item.currentStock || "50");

        return {
          id,
          description: nome,
          costPrice,
          salePrice,
          minStock: "5",
          currentStock,
        };
      });

      setImportedItems(draftItems);
      addToast(`${draftItems.length} itens detectados na foto! Defina os preços de venda para finalizar. 📸✨`, "success");

    } catch (err: any) {
      console.error("Erro na requisição ou gravação da imagem:", err);
      addToast(err.message || "Erro no processamento da imagem da foto/cupom.", "error");
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      file = undefined;
    }
  };

  const handleSaveAllImported = () => {
    const invalidItem = importedItems.find(p => !p.salePrice || parseFloat(p.salePrice) <= 0);
    if (invalidItem) {
      addToast("Por favor, defina um preço de venda válido para todos os itens da nota fiscal.", "warning");
      return;
    }

    const newProducts: CatalogProduct[] = importedItems.map(item => {
      const cost = parseFloat(item.costPrice) || 0;
      const sale = parseFloat(item.salePrice) || 0;
      const minS = parseInt(item.minStock) || 5;
      const curS = parseInt(item.currentStock) || 50;
      const profit = sale - cost;

      return {
        id: item.id || generateProductUUID(),
        description: item.description.trim(),
        costPrice: cost,
        salePrice: sale,
        profit: profit,
        minStock: minS,
        currentStock: curS
      };
    });

    setCatalogProducts(prev => [...newProducts, ...prev]);

    // Save imported products to Supabase
    if (currentUser && newProducts.length > 0) {
      newProducts.forEach(prod => {
        dbSaveCatalogProduct(prod, currentUser.id);
      });
    }

    addToast(`${newProducts.length} produtos importados e cadastrados! 🛍️🚀`, "success");
    setImportedItems([]);
  };

  const resetForm = () => {
    setEditingId(null);
    setDescription("");
    setCostPrice("");
    setSalePrice("");
    setMinStock("");
    setCurrentStock("");
    setErrorMessage(null);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMessage("Por favor, preencha o nome / descrição do produto.");
      return;
    }

    const cost = parseFloat(costPrice) || 0;
    const sale = parseFloat(salePrice) || 0;
    const minS = parseInt(minStock) || 0;
    const curS = parseInt(currentStock) || 0;
    const profit = sale - cost;

    if (sale <= 0) {
      setErrorMessage("O preço de venda precisa ser maior que zero.");
      return;
    }

    const targetId = editingId || generateProductUUID();
    const updatedProd: CatalogProduct = {
      id: targetId,
      description: description.trim(),
      costPrice: cost,
      salePrice: sale,
      profit: profit,
      minStock: minS,
      currentStock: curS
    };

    if (editingId) {
      const wasDeleted = deletedProducts.some(p => p.id === editingId);
      if (wasDeleted) {
        // Move back to active catalogProducts (and remove from deletedProducts)
        setCatalogProducts(prev => [updatedProd, ...prev]);
        setDeletedProducts(prev => {
          const next = prev.filter(p => p.id !== editingId);
          localStorage.setItem("NUCLEO_DELETED_PRODUCTS", JSON.stringify(next));
          return next;
        });
        setShowDeletedLog(false);
        addToast("Produto restaurado e atualizado com sucesso! 📦✨", "success");
      } else {
        // Edit existing product
        setCatalogProducts(prev =>
          prev.map(p => p.id === editingId ? updatedProd : p)
        );
        addToast("Produto atualizado com sucesso! 📦✨", "success");
      }
    } else {
      // Create new product
      setCatalogProducts(prev => [updatedProd, ...prev]);
      addToast("Novo produto registrado no catálogo! 🚀", "success");
    }

    // Save to Supabase
    if (currentUser) {
      dbSaveCatalogProduct(updatedProd, currentUser.id);
    }

    resetForm();
  };

  const handleRestoreProduct = (product: CatalogProduct) => {
    // Add back to active catalogProducts
    setCatalogProducts(prev => [product, ...prev]);
    
    // Save to Supabase if currentUser
    if (currentUser) {
      dbSaveCatalogProduct(product, currentUser.id);
    }
    
    // Remove from deletedProducts
    setDeletedProducts(prev => {
      const next = prev.filter(p => p.id !== product.id);
      localStorage.setItem("NUCLEO_DELETED_PRODUCTS", JSON.stringify(next));
      return next;
    });
    
    addToast(`Produto "${product.description}" restaurado com sucesso! 📦`, "success");
  };

  const handleEditProduct = (prod: CatalogProduct) => {
    setEditingId(prod.id);
    setDescription(prod.description);
    setCostPrice(String(prod.costPrice));
    setSalePrice(String(prod.salePrice));
    setMinStock(String(prod.minStock));
    setCurrentStock(String(prod.currentStock));
    setErrorMessage(null);
  };

  // Metrics Dashboard Computations
  const totalItems = catalogProducts.length;
  const totalCostAsset = catalogProducts.reduce((sum, p) => sum + (Number(p.costPrice) || 0) * (Number(p.currentStock) || 0), 0);
  const totalSalesAsset = catalogProducts.reduce((sum, p) => sum + (Number(p.salePrice) || 0) * (Number(p.currentStock) || 0), 0);
  const criticalItemsCount = catalogProducts.filter(p => p.currentStock <= p.minStock).length;

  // Filter Catalog Items
  const filteredProductsBySearch = catalogProducts.filter(p =>
    p.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProducts = filteredProductsBySearch.filter(p => {
    if (stockFilter === "low") {
      return p.currentStock <= p.minStock && p.currentStock > 0;
    }
    if (stockFilter === "out") {
      return p.currentStock === 0;
    }
    return true;
  });

  // Handle Sort/Order
  const displayProducts = [...filteredProducts];
  if (stockFilter === "profitable") {
    displayProducts.sort((a, b) => b.profit - a.profit);
  }

  // Filter Deleted Items
  const displayDeletedProducts = deletedProducts.filter(p =>
    p.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Upper Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Registered Items */}
        <div className="bg-brand-card border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
          <div className="p-2.5 bg-brand-cyan/10 rounded-xl border border-brand-cyan/20 text-brand-cyan">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono block uppercase tracking-wider">Itens do Catálogo</span>
            <span className="text-lg font-bold text-slate-200 mt-0.5 block">{totalItems}</span>
          </div>
        </div>

        {/* Cost Stock Value Asset */}
        <div className="bg-brand-card border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
          <div className="p-2.5 bg-brand-magenta/10 rounded-xl border border-brand-magenta/20 text-brand-magenta">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono block uppercase tracking-wider">Custo do Estoque</span>
            <span className="text-lg font-bold text-slate-200 mt-0.5 block font-mono">
              R$ {formatBRL(totalCostAsset)}
            </span>
          </div>
        </div>

        {/* Sales Asset Value */}
        <div className="bg-brand-card border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-450">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono block uppercase tracking-wider font-bold">Retorno Estimado</span>
            <span className="text-lg font-bold text-slate-200 mt-0.5 block font-mono">
              R$ {formatBRL(totalSalesAsset)}
            </span>
          </div>
        </div>

        {/* Low inventory alert count */}
        <div className="bg-brand-card border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border flex justify-center items-center h-10 w-10 ${
            criticalItemsCount > 0 
              ? "bg-amber-500/10 border-amber-500/20 text-amber-500 animate-pulse" 
              : "bg-slate-800/40 border-slate-800 text-slate-500"
          }`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono block uppercase tracking-wider">Alertas de Estoque</span>
            <span className={`text-lg font-bold mt-0.5 block ${criticalItemsCount > 0 ? "text-amber-500" : "text-slate-450"}`}>
              {criticalItemsCount} {criticalItemsCount === 1 ? "crítico" : "críticos"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Column (Left 5/12 width on large screens) */}
        <div className="lg:col-span-5">
          <div className={`bg-brand-card border rounded-2xl p-6 relative transition-all duration-300 ${
            editingId 
              ? "border-brand-magenta ring-1 ring-brand-magenta/30 shadow-[0_0_15px_rgba(255,0,127,0.15)]" 
              : "border-slate-800 shadow-lg shadow-black/20"
          }`}>
            <h2 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
              <span className={`h-5 w-1.5 rounded transition-all ${editingId ? "bg-brand-magenta animate-pulse" : "bg-brand-magenta"}`}></span>
              {editingId ? "Editar Produto" : "Novo Produto / Serviço"}
            </h2>

            {editingId && (
              <div className="mb-4 bg-brand-magenta/10 border border-brand-magenta/20 p-2.5 text-center text-[10px] text-brand-magenta font-mono uppercase tracking-wider rounded-lg animate-pulse">
                Aviso: Você está editando um produto existente do catálogo.
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 p-3 text-xs bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center gap-2">
                <X className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {importedItems.length > 0 ? (
              <div className="space-y-4">
                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-850 text-xs text-slate-400 flex justify-between items-center">
                  <span className="flex items-center gap-1 text-slate-300">
                    <Sparkles className="h-3.5 w-3.5 text-brand-magenta animate-pulse shrink-0" />
                    Itens detectados na nota
                  </span>
                  <button
                    type="button"
                    onClick={() => setImportedItems([])}
                    className="text-red-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <X className="h-4 w-4" /> Cancelar
                  </button>
                </div>

                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {importedItems.map((item, idx) => {
                    const priceValue = parseFloat(item.salePrice) || 0;
                    const isPriceMissing = priceValue <= 0;
                    return (
                      <div key={item.id} className="p-3.5 bg-slate-900 border border-slate-805 rounded-xl space-y-2.5 relative">
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-[10px] font-bold text-slate-350 font-mono tracking-tight bg-slate-950 py-0.5 px-2 rounded border border-slate-850 shrink-0">
                            Item {idx + 1} de {importedItems.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setImportedItems(prev => prev.filter(p => p.id !== item.id));
                            }}
                            className="text-slate-500 hover:text-red-400 p-0.5 rounded hover:bg-slate-850 cursor-pointer"
                            title="Remover esta item da lista"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Name Input */}
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">
                            Nome / Descrição
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => {
                              const v = e.target.value;
                              setImportedItems(prev => prev.map(p => p.id === item.id ? { ...p, description: v } : p));
                            }}
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {/* Cost Price */}
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">
                              Custo Unitário (R$)
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-2 text-[10.5px] font-mono text-slate-500">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={item.costPrice}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setImportedItems(prev => prev.map(p => p.id === item.id ? { ...p, costPrice: v } : p));
                                }}
                                className="w-full bg-slate-950 border border-slate-855 rounded-xl py-1.5 pl-8 pr-1 text-xs font-mono text-white focus:outline-none focus:border-brand-magenta"
                              />
                            </div>
                          </div>

                          {/* Sale Price (with validation feedback and background changing) */}
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-550 mb-1 tracking-wider">
                              Preço de Venda <span className="text-brand-magenta font-black">*</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-2 text-[10.5px] font-mono text-slate-500">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={item.salePrice}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setImportedItems(prev => prev.map(p => p.id === item.id ? { ...p, salePrice: v } : p));
                                }}
                                className={`w-full border rounded-xl py-1.5 pl-8 pr-1 text-xs font-mono transition-all outline-none ${
                                  isPriceMissing
                                    ? "bg-amber-950/40 border-amber-500/50 text-amber-200 placeholder-amber-700/50 focus:border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                                    : "bg-slate-950 border-slate-855 text-white placeholder-slate-600 focus:border-brand-magenta"
                                }`}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Hidden variables: Estoque Mínimo e estoque Atual fixos para visualização */}
                        <div className="flex gap-4 text-[9px] font-mono text-slate-500/80 bg-slate-950/40 py-1.5 px-2.5 rounded-lg border border-slate-950">
                          <span>Estoque Mínimo: <strong className="text-slate-400 font-bold">5</strong> (Fixo)</span>
                          <span>Estoque Atual: <strong className="text-slate-400 font-bold font-mono">50</strong> (Fixo)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Save All Button (CADASTRAR ITENS DA NOTA) */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSaveAllImported}
                    disabled={importedItems.length === 0 || importedItems.some(p => !p.salePrice || parseFloat(p.salePrice) <= 0)}
                    className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-lg select-none ${
                      importedItems.length === 0 || importedItems.some(p => !p.salePrice || parseFloat(p.salePrice) <= 0)
                        ? "bg-slate-800 border border-slate-850 text-slate-500 cursor-not-allowed opacity-60 shadow-none"
                        : "bg-brand-magenta hover:bg-brand-magenta/90 active:scale-[0.98] text-white cursor-pointer shadow-brand-magenta/20"
                    }`}
                    title={importedItems.some(p => !p.salePrice || parseFloat(p.salePrice) <= 0) ? "Preencha o preço de venda de todos os itens" : ""}
                  >
                    <Save className="h-4 w-4" />
                    CADASTRAR ITENS DA NOTA
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveProduct} className="space-y-4">
                {/* Preencher por Foto/Cupom Button */}
                <div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzing}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-950/70 hover:bg-brand-magenta/10 text-xs text-brand-magenta font-black uppercase tracking-wider rounded-xl border border-brand-magenta/30 hover:border-brand-magenta transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mb-2.5"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-4 w-4 shrink-0 text-brand-magenta animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4 shrink-0 text-brand-magenta" />
                    )}
                    <span>{isAnalyzing ? "Analisando Cupom..." : "Preencher por Foto/Cupom"}</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                    Nome / Descrição do Item <span className="text-brand-magenta">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Impressão Banner Lona 440g 1x1m"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-magenta transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                      Preço de Custo (R$)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-[10.5px] font-mono text-slate-500">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={costPrice}
                        onChange={(e) => setCostPrice(e.target.value.replace(",", "."))}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl py-2 pl-8 pr-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-brand-magenta transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                      Preço de Venda (R$) <span className="text-brand-magenta">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-[10.5px] font-mono text-slate-500">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={salePrice}
                        onChange={(e) => setSalePrice(e.target.value.replace(",", "."))}
                        className={`w-full border rounded-xl py-2 pl-8 pr-2 text-xs font-mono transition-all outline-none ${
                          (!salePrice || parseFloat(salePrice) === 0) && description.trim() !== ""
                            ? "bg-amber-950/40 border-amber-500/50 text-amber-200 placeholder-amber-700/50 focus:border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                            : "bg-slate-950 border-slate-850 text-white placeholder-slate-500 focus:border-brand-magenta"
                        }`}
                      />
                    </div>
                    {(!salePrice || parseFloat(salePrice) === 0) && description.trim() !== "" && (
                      <span className="text-[9px] font-bold text-amber-500 mt-1 block flex items-center gap-1 animate-pulse">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> Defina o preço de venda!
                      </span>
                    )}
                  </div>
                </div>

                {/* Advanced Margin Calculator Preview Card */}
                {parseFloat(salePrice) > 0 && (
                  <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-850 space-y-2.5 animate-fade-in">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-brand-cyan" /> Lucro Líquido:
                      </span>
                      <span className="font-bold text-emerald-450 font-mono">
                        R$ {formatBRL(parseFloat(salePrice) - (parseFloat(costPrice) || 0))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-slate-400 font-sans">Margem Comercial:</span>
                      <span className={`font-bold ${parseFloat(salePrice) - (parseFloat(costPrice) || 0) > 0 ? "text-emerald-450" : "text-amber-500"}`}>
                        {parseFloat(salePrice) > 0 
                          ? (((parseFloat(salePrice) - (parseFloat(costPrice) || 0)) / parseFloat(salePrice)) * 100).toFixed(1)
                          : "0.0"}%
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                      Estoque Mínimo
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 5"
                      value={minStock}
                      onChange={(e) => setMinStock(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl py-2 px-3 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-brand-magenta transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                      Estoque Atual
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 25"
                      value={currentStock}
                      onChange={(e) => setCurrentStock(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl py-2 px-3 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-brand-magenta transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-3">
                  {editingId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-300 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-700"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!salePrice || parseFloat(salePrice) === 0}
                    className={`flex-grow py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-lg select-none ${
                      (!salePrice || parseFloat(salePrice) === 0)
                        ? "bg-slate-800 border border-slate-850 text-slate-400 cursor-not-allowed opacity-60 shadow-none"
                        : "bg-brand-magenta hover:bg-brand-magenta/90 active:scale-[0.98] text-white cursor-pointer shadow-brand-magenta/20"
                    }`}
                    title={(!salePrice || parseFloat(salePrice) === 0) ? "Defina o preço de venda antes de cadastrar" : ""}
                  >
                    <Save className="h-4 w-4" />
                    {editingId ? "Salvar Alterações" : "Cadastrar Produto"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Directory Column (Right 7/12 width) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          {/* Controls Bar: Search on left, filter tabs on right */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search inputs */}
            <div className="relative flex-grow">
              <span className="absolute left-3.5 top-3">
                <Search className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder="Pesquisar catálogo de produtos por descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-slate-700 font-mono transition-all"
              />
            </div>

            {/* Premium Stock filter tabs */}
            <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-850 shrink-0 self-start md:self-auto w-full md:w-auto overflow-x-auto gap-1">
              <button
                type="button"
                onClick={() => setStockFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all ${
                  stockFilter === "all"
                    ? "bg-slate-900 text-brand-cyan border border-slate-800 shadow"
                    : "text-slate-450 hover:text-slate-200"
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setStockFilter("low")}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all ${
                  stockFilter === "low"
                    ? "bg-slate-900 text-amber-500 border border-slate-800 shadow"
                    : "text-slate-450 hover:text-slate-200"
                }`}
              >
                Baixo
              </button>
              <button
                type="button"
                onClick={() => setStockFilter("out")}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all ${
                  stockFilter === "out"
                    ? "bg-slate-900 text-red-400 border border-slate-800 shadow"
                    : "text-slate-450 hover:text-slate-200"
                }`}
              >
                Zero
              </button>
              <button
                type="button"
                onClick={() => setStockFilter("profitable")}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all ${
                  stockFilter === "profitable"
                    ? "bg-slate-900 text-brand-magenta border border-slate-800 shadow animate-pulse hover:animate-none"
                    : "text-slate-450 hover:text-slate-200"
                }`}
                title="Ordenar por maior margem de lucro estimado"
              >
                Lucros
              </button>
            </div>
          </div>

          {/* Active vs Deleted Toggle Bar */}
          <div className="flex items-center justify-between px-1 select-none">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest font-mono">
              {showDeletedLog ? "Histórico de Itens Excluídos" : "Diretório do Catálogo Ativo"}
            </span>
            <button
              type="button"
              onClick={() => setShowDeletedLog(!showDeletedLog)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold tracking-wider border transition-all cursor-pointer ${
                showDeletedLog
                  ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30 shadow-sm"
                  : "bg-slate-900/60 hover:bg-slate-800 border-slate-800 text-slate-450 hover:text-slate-200"
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {showDeletedLog ? "Ver Catálogo Ativo" : `Ver Itens Excluídos (${deletedProducts.length})`}
            </button>
          </div>

          {/* Directory Listings container */}
          <div className="bg-brand-card border border-slate-800 rounded-2xl overflow-hidden shadow-lg shadow-black/20">
            <div className="overflow-x-auto">
              {showDeletedLog ? (
                displayDeletedProducts.length === 0 ? (
                  <div className="p-10 text-center select-none">
                    <Trash2 className="h-12 w-12 text-slate-600/55 mx-auto mb-3 opacity-30 animate-pulse" />
                    <p className="text-xs text-slate-400 font-sans font-medium">Nenhum item excluído encontrado.</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-1">Todos os itens excluídos estarão visíveis aqui.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900/90 text-[10px] font-mono font-bold text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                        <th className="py-3.5 px-4 font-sans text-slate-400">PRODUTO / SERVIÇO EXCLUÍDO</th>
                        <th className="py-3.5 px-4 font-mono">Custo / Venda</th>
                        <th className="py-3.5 px-4 font-mono">LUCRO ESTIMADO</th>
                        <th className="py-3.5 px-4">ESTOQUE</th>
                        <th className="py-3.5 px-4 text-right">AÇÕES</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/40 text-xs">
                      {displayDeletedProducts.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-900/35 transition-colors bg-red-500/[0.005]">
                          <td className="py-4 px-4 text-slate-200 font-medium font-sans">
                            <span className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0 shadow shadow-red-500/50" />
                              {p.description}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-mono">
                            <div className="text-[10px] text-slate-500 font-medium">Custo: R$ {formatBRL(p.costPrice)}</div>
                            <div className="text-slate-100 font-semibold mt-0.5">Venda: R$ {formatBRL(p.salePrice)}</div>
                          </td>
                          <td className="py-4 px-4 font-mono">
                            <div className="text-emerald-450 font-bold">R$ {formatBRL(p.profit)}</div>
                            <div className="text-[10.5px] text-slate-450">
                              Margem: {p.salePrice > 0 ? (((Number(p.salePrice) - (Number(p.costPrice) || 0)) / Number(p.salePrice)) * 100).toFixed(1) : "0.0"}%
                            </div>
                          </td>
                          <td className="py-4 px-4 font-mono text-slate-350">
                            <span className="text-sm font-bold">{p.currentStock}</span>
                            <span className="text-[9.5px] text-slate-500 font-normal">/{p.minStock}</span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditProduct(p)}
                                className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[10px] font-mono font-bold tracking-wider text-slate-350 hover:text-brand-cyan hover:border-brand-cyan/30 transition-all cursor-pointer flex items-center gap-1"
                                title="Editar produto e voltar ao sistema"
                              >
                                <Edit className="h-3.5 w-3.5" />
                                Editar
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => handleRestoreProduct(p)}
                                className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[10px] font-mono font-bold tracking-wider text-slate-350 hover:text-emerald-400 hover:border-emerald-400/30 transition-all cursor-pointer flex items-center gap-1"
                                title="Voltar produto de novo ao sistema"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Restaurar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : displayProducts.length === 0 ? (
                <div className="p-10 text-center">
                  <Boxes className="h-12 w-12 text-slate-600 mx-auto mb-3 opacity-40 animate-pulse" />
                  <p className="text-xs text-slate-400">Nenhum produto cadastrado que atenda os critérios.</p>
                  <p className="text-[10px] text-slate-500 mt-1">Insira um cadastro novo ou altere as abas de filtro.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/90 text-[10px] font-mono font-bold text-slate-400 border-b border-slate-800 selection:bg-slate-800 uppercase tracking-wider selection:text-white">
                      <th className="py-3.5 px-4 font-sans text-slate-400">PRODUTO / SERVIÇO</th>
                      <th className="py-3.5 px-4 font-mono">Custo / Venda</th>
                      <th className="py-3.5 px-4 font-mono">LUCRO ESTIMADO</th>
                      <th className="py-3.5 px-4">Estoque / Min</th>
                      <th className="py-3.5 px-4 text-right">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/40 text-xs">
                    {displayProducts.map((p) => {
                      const isLowStock = p.currentStock <= p.minStock;
                      const isOutOfStock = p.currentStock === 0;
                      return (
                        <tr key={p.id} className={`hover:bg-slate-900/35 transition-colors ${
                          isOutOfStock 
                            ? "bg-red-500/[0.015]" 
                            : isLowStock 
                              ? "bg-amber-500/[0.01]" 
                              : ""
                        }`}>
                          <td className="py-4 px-4 text-slate-200 font-medium font-sans">
                            {p.description}
                          </td>
                          <td className="py-4 px-4 font-mono">
                            <div className="text-[10px] text-slate-500 font-medium">Custo: R$ {formatBRL(p.costPrice)}</div>
                            <div className="text-slate-100 font-semibold mt-0.5">Venda: R$ {formatBRL(p.salePrice)}</div>
                          </td>
                          <td className="py-4 px-4 font-mono">
                            <div className="text-emerald-450 font-bold">R$ {formatBRL(p.profit)}</div>
                            <div className="text-[10.5px] text-slate-450">
                              Margem: {p.salePrice > 0 ? (((Number(p.salePrice) - (Number(p.costPrice) || 0)) / Number(p.salePrice)) * 100).toFixed(1) : "0.0"}%
                            </div>
                          </td>
                          {/* Rich Inventory Adjuster column */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              {/* Decrease Button */}
                              <button
                                type="button"
                                onClick={() => handleQuickAdjustStock(p.id, -1)}
                                className="h-6 w-6 rounded-lg bg-slate-950 hover:bg-slate-850 border border-slate-850 flex items-center justify-center text-slate-400 hover:text-red-400 active:scale-[0.85] active:border-red-500/20 active:bg-red-500/5 transition-all cursor-pointer font-bold shrink-0 shadow-inner"
                                title="Reduzir 1 item do estoque"
                              >
                                <Minus className="h-3 w-3" />
                              </button>

                              <div className={`flex items-center gap-1 font-mono min-w-[50px] justify-center ${
                                isOutOfStock 
                                  ? "text-red-500 font-extrabold" 
                                  : isLowStock 
                                    ? "text-amber-500 font-bold" 
                                    : "text-slate-350"
                              }`}>
                                <span className="text-sm font-bold">{p.currentStock}</span>
                                <span className="text-[9.5px] text-slate-500 font-normal">/{p.minStock}</span>
                              </div>

                              {/* Increase Button */}
                              <button
                                type="button"
                                onClick={() => handleQuickAdjustStock(p.id, 1)}
                                className="h-6 w-6 rounded-lg bg-slate-950 hover:bg-slate-850 border border-slate-850 flex items-center justify-center text-slate-400 hover:text-emerald-450 active:scale-[0.85] active:border-emerald-500/20 active:bg-emerald-500/5 transition-all cursor-pointer font-bold shrink-0 shadow-inner"
                                title="Adicionar 1 item ao estoque"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            
                            {isLowStock && (
                              <div className="mt-1.5 flex select-none">
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${
                                  isOutOfStock 
                                    ? "bg-red-500/10 border-red-500/20 text-red-400 font-bold"
                                    : "bg-amber-500/10 border-amber-500/20 text-amber-500"
                                }`}>
                                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                  {isOutOfStock ? "Esgotado!" : "Baixo!"}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-4 text-right">
                            {deleteConfirmId === p.id ? (
                              <div className="flex justify-end items-center gap-1.5 animate-fade-in select-none">
                                <span className="text-[10px] text-red-400 font-bold">Excluir?</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const deletedId = p.id;
                                    const deletedProduct = catalogProducts.find(prod => prod.id === deletedId);
                                    if (deletedProduct) {
                                      setDeletedProducts(prev => {
                                        const next = [deletedProduct, ...prev.filter(x => x.id !== deletedId)];
                                        localStorage.setItem("NUCLEO_DELETED_PRODUCTS", JSON.stringify(next));
                                        return next;
                                      });
                                    }
                                    setCatalogProducts(prev => prev.filter(prod => prod.id !== deletedId));

                                    // Delete remotely from Supabase
                                    if (currentUser) {
                                      const supabase = getSupabase();
                                      if (supabase) {
                                        supabase
                                          .from("produtos")
                                          .delete()
                                          .eq("id", deletedId)
                                          .then(({ error }) => {
                                            if (error) {
                                              console.error("Erro ao deletar produto do Supabase:", error);
                                            }
                                          });
                                      }
                                    }

                                    addToast("Produto movido para itens excluídos.", "info");
                                    setDeleteConfirmId(null);
                                    if (editingId === deletedId) {
                                      resetForm();
                                    }
                                  }}
                                  className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow shadow-red-900/30"
                                  title="Confirmar exclusão"
                                >
                                  Sim
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="bg-slate-800 hover:bg-slate-700 text-slate-350 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                                >
                                  Não
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleEditProduct(p)}
                                  className="text-slate-450 hover:text-white p-1.5 rounded-lg hover:bg-slate-850 cursor-pointer transition-colors"
                                  title="Editar item"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(p.id)}
                                  className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-850 cursor-pointer transition-colors"
                                  title="Excluir item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
