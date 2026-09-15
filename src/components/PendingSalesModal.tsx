import React, { useState } from "react";
import { X, Search, DollarSign, HandCoins, Printer, MessageCircle, AlertCircle, Calendar, Clock, Check, Coins, Phone, Edit2, Trash2 } from "lucide-react";
import { Sale, CompanyProfile, isQuickSaleClient, isPendingRetiradaOrBaixa } from "../types";
import { jsPDF } from "jspdf";
import { parseClientImages } from "../supabase";

interface PendingSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: Sale[];
  onSaveSale: (sale: Sale) => void;
  company: CompanyProfile;
  onEditSale?: (sale: Sale) => void;
  onDeleteSale?: (id: string) => void;
}

export function PendingSalesModal({ isOpen, onClose, sales, onSaveSale, company, onEditSale, onDeleteSale }: PendingSalesModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [updateDates, setUpdateDates] = useState<Record<string, boolean>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, 'dinheiro' | 'cartão' | 'pix'>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<{ saleId: string; paymentId: string; amount: string; method: 'dinheiro' | 'cartão' | 'pix' } | null>(null);

  const handleDeletePayment = (sale: Sale, paymentId: string) => {
    if (!confirm("Tem certeza que deseja excluir/cancelar este recebimento? O valor pendente do cliente será atualizado.")) {
      return;
    }

    const currentPayments = sale.payments && sale.payments.length > 0 
      ? sale.payments 
      : (sale.downPayment > 0 
          ? [{
              id: "INITIAL",
              amount: sale.downPayment,
              date: sale.date,
              method: (sale.paymentMethod || 'dinheiro') as 'dinheiro' | 'cartão' | 'pix'
            }]
          : []
        );

    const updatedPayments = currentPayments.filter(p => p.id !== paymentId);
    const newDownPayment = Number(updatedPayments.reduce((sum, p) => sum + p.amount, 0).toFixed(2));
    const newBalanceDue = Number((sale.totalValue - newDownPayment).toFixed(2));

    const updatedSale: Sale = {
      ...sale,
      downPayment: newDownPayment,
      balanceDue: newBalanceDue >= 0.01 ? newBalanceDue : 0,
      payments: updatedPayments,
    };

    onSaveSale(updatedSale);
    setSuccessMessage("Recebimento excluído com sucesso!");
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleStartEditPayment = (sale: Sale, p: any) => {
    setEditingPayment({
      saleId: sale.id,
      paymentId: p.id,
      amount: String(p.amount),
      method: p.method || 'dinheiro'
    });
  };

  const handleConfirmEditPayment = (sale: Sale) => {
    if (!editingPayment) return;

    const amountVal = parseFloat(editingPayment.amount.replace(",", "."));
    if (isNaN(amountVal) || amountVal <= 0) {
      alert("Por favor, digite um valor de faturamento válido.");
      return;
    }

    const currentPayments = sale.payments && sale.payments.length > 0 
      ? sale.payments 
      : (sale.downPayment > 0 
          ? [{
              id: "INITIAL",
              amount: sale.downPayment,
              date: sale.date,
              method: (sale.paymentMethod || 'dinheiro') as 'dinheiro' | 'cartão' | 'pix'
            }]
          : []
        );

    const updatedPayments = currentPayments.map(p => {
      if (p.id === editingPayment.paymentId) {
        return {
          ...p,
          amount: amountVal,
          method: editingPayment.method
        };
      }
      return p;
    });

    const newDownPayment = Number(updatedPayments.reduce((sum, p) => sum + p.amount, 0).toFixed(2));
    const newBalanceDue = Number((sale.totalValue - newDownPayment).toFixed(2));

    if (newBalanceDue < 0) {
      alert("Erro: O valor editado ultrapassa o total da venda!");
      return;
    }

    const updatedSale: Sale = {
      ...sale,
      downPayment: newDownPayment,
      balanceDue: newBalanceDue >= 0.01 ? newBalanceDue : 0,
      payments: updatedPayments,
    };

    onSaveSale(updatedSale);
    setEditingPayment(null);
    setSuccessMessage("Recebimento atualizado com sucesso!");
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  if (!isOpen) return null;

  const localDate = new Date();
  const todayStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;

  // Filter sales that are pending payment clearance ("dar baixa") or material pickup
  const pendingSales = sales.filter((sale) => {
    const isPending = isPendingRetiradaOrBaixa(sale);

    const clientName = (sale.clientName || "").toLowerCase();
    const clientPhone = (sale.clientPhone || "").replace(/\D/g, "");
    const searchClean = (searchTerm || "").trim().toLowerCase();
    const searchDigits = (searchTerm || "").replace(/\D/g, "");

    const matchesSearch = !searchClean || 
      clientName.includes(searchClean) || 
      (searchDigits.length > 0 && clientPhone.includes(searchDigits));

    return isPending && matchesSearch;
  });

  const totalPendingAmount = sales.filter(s => {
    return !s.isBudget && 
           !isQuickSaleClient(s.clientName) && 
           (s.balanceDue || 0) > 0.001;
  }).reduce((acc, sale) => acc + (sale.balanceDue || 0), 0);

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (e) {
      return dateStr.slice(0, 10);
    }
  };

  const formatDateOnly = (dateStr: string) => {
    if (!dateStr) return "N/A";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("pt-BR");
    } catch (e) {
      return dateStr.slice(0, 10);
    }
  };

  const getLocalYMD = (isoStr: string): string => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr.slice(0, 10);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return isoStr.slice(0, 10);
    }
  };

  // Inline payment input change handler
  const handlePaymentAmountChange = (saleId: string, value: string) => {
    // Keep only numbers and a decimal separator
    const cleanValue = value.replace(/[^0-9,.]/g, "").replace(",", ".");
    setPaymentAmounts((prev) => ({
      ...prev,
      [saleId]: cleanValue
    }));
  };

  // Quick fill full outstanding balance
  const fillFullBalance = (saleId: string, outstanding: number) => {
    setPaymentAmounts((prev) => ({
      ...prev,
      [saleId]: outstanding.toFixed(2)
    }));
  };

  // Toggle date update option
  const toggleUpdateDate = (saleId: string) => {
    setUpdateDates((prev) => ({
      ...prev,
      [saleId]: !(prev[saleId] !== false) // default is true
    }));
  };

  // Generate PDF Recibo identical to the required double-way ticket
  const generateUpdatedPDF = async (sale: Sale) => {
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
    const formattedDate = formatDateOnly(sale.date);

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

    const drawReceiptCopy = (yOffset: number, label: "VIA DO CLIENTE" | "VIA DA EMPRESA") => {
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, yOffset, 210, 32, "F");

      let startTextX = 15;
      if (companyLogoBase64) {
        try {
          let format = "JPEG";
          if (companyLogoBase64.includes("image/png")) format = "PNG";
          else if (companyLogoBase64.includes("image/webp")) format = "WEBP";
          doc.addImage(companyLogoBase64, format, 15, yOffset + 5, 22, 22, undefined, "FAST");
          startTextX = 42;
        } catch (e) {
          console.error("Erro ao incluir logotipo da empresa no PDF:", e);
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

      if (sale.items.length > 4) {
        doc.setFillColor(254, 242, 242);
        doc.rect(10, itemY, 190, 4.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(220, 38, 38);
        doc.text(`* ${sale.items.length - 4} mais itens resumidos no totalizador *`, 13, itemY + 3);
        itemY += 4.5;
      }

      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.3);
      doc.line(10, itemY, 200, itemY);

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

      const signatureY = yOffset + 112;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Obrigado pela preferência e confiança!", 10, signatureY);
      doc.text(`Contato de Suporte: ${company?.phone || "Não informado"}`, 10, signatureY + 4);

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

    drawReceiptCopy(5, "VIA DO CLIENTE");

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.5);
    for (let i = 0; i < 210; i += 4) {
      doc.line(i, 148.5, i + 2, 148.5);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("--- DOBRAR OU DIRECIONAR CORTE DA FOLHA AQUI ---", 105, 149.5, { align: "center" });

    drawReceiptCopy(153.5, "VIA DA EMPRESA");

    const docName = `Recibo_Atualizado_${sale.clientName.replace(/\s+/g, "_")}_${docId}.pdf`;
    doc.save(docName);
  };

  // Dispatch WhatsApp with updated values
  const shareUpdatedWhatsApp = (sale: Sale, paymentAmount: number) => {
    const phoneDigits = sale.clientPhone.replace(/\D/g, "");
    if (!phoneDigits) {
      alert("Celular do cliente não cadastrado.");
      return;
    }

    const companyName = company?.tradingName || "Sistema de Vendas Núcleo";
    const docId = sale.id;
    const formattedTotal = formatBRL(sale.totalValue);
    const formattedPaidNow = formatBRL(paymentAmount);
    const balanceMessage = sale.balanceDue > 0 
      ? `\n⚠️ *Saldo Pendente Restante:* ${formatBRL(sale.balanceDue)}.`
      : "\n✅ *Saldo quitado integralmente e pedido finalizado!*";

    const messageText = `Olá, *${sale.clientName}*!\n\nRegistramos seu pagamento de retirada na *${companyName}*:\n\n📄 *Recibo:* #${docId}\n💵 *Valor Pago Agora:* ${formattedPaidNow}\n📥 *Total Pago Acumulado:* ${formatBRL(sale.downPayment)}\n💰 *Valor Total do Pedido:* ${formattedTotal}${balanceMessage}\n\nSeu recibo digital atualizado em formato PDF foi gerado no sistema! Agradecemos o contato e a preferência.\n\nAtenciosamente,\n*${companyName}*`;
    const encodedMessage = encodeURIComponent(messageText);
    
    window.open(`https://api.whatsapp.com/send?phone=55${phoneDigits}&text=${encodedMessage}`, "_blank");
  };

  // Execute the payment confirmation
  const handleConfirmPayment = (sale: Sale) => {
    const rawVal = paymentAmounts[sale.id];
    const amountToPay = rawVal ? parseFloat(rawVal) : sale.balanceDue;

    if (isNaN(amountToPay) || amountToPay <= 0) {
      alert("Por favor, digite um valor de pagamento válido maior que R$ 0,00.");
      return;
    }

    if (amountToPay > sale.balanceDue + 0.01) {
      alert(`O valor digitado (${formatBRL(amountToPay)}) é maior que o saldo pendente (${formatBRL(sale.balanceDue)}).`);
      return;
    }

    const updateDateToToday = updateDates[sale.id] !== false; // Default is true

    // Compute updated sale metrics
    const newDownPayment = Number((sale.downPayment + amountToPay).toFixed(2));
    const newBalanceDue = Number((sale.totalValue - newDownPayment).toFixed(2));
    const newDate = updateDateToToday ? new Date().toISOString() : sale.date;

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

    const selectedPayMethod = paymentMethods[sale.id] || sale.paymentMethod || 'dinheiro';

    const updatedPayments = [...currentPayments, {
      id: Math.random().toString(36).substring(2, 9).toUpperCase(),
      amount: amountToPay,
      date: new Date().toISOString(), // ALWAYS today's date because it occurred physically today
      method: selectedPayMethod
    }];

    const originalOrderDate = sale.orderDate || (sale.date ? getLocalYMD(sale.date) : getLocalYMD(new Date().toISOString()));

    const updatedSale: Sale = {
      ...sale,
      downPayment: newDownPayment,
      balanceDue: newBalanceDue >= 0.01 ? newBalanceDue : 0,
      date: newDate,
      deliveryDate: new Date().toISOString().substring(0, 10), // Register delivery / withdrawal today
      materialEntregue: true, // Automatically confirm delivery/withdrawal when checked off
      orderDate: originalOrderDate,
      payments: updatedPayments,
    };

    // Save changes
    onSaveSale(updatedSale);

    // Provide immediate user visual feedback
    setSuccessMessage(`Recebimento de ${formatBRL(amountToPay)} registrado e retirada concluída com sucesso para ${sale.clientName.toUpperCase()}!`);

    // Reset localized states
    const updatedAmounts = { ...paymentAmounts };
    delete updatedAmounts[sale.id];
    setPaymentAmounts(updatedAmounts);

    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  // Print a daily summary of all picked up or checked off orders today
  const handlePrintDailyReport = () => {
    const todaySalesWithActivity = sales.filter((sale) => {
      if (sale.isBudget) return false;

      // 1. Check if delivered today
      const isDeliveredToday = sale.materialEntregue && getLocalYMD(sale.deliveryDate) === todayStr;

      // 2. Check if payment today
      const hasPaymentToday = sale.payments && sale.payments.some(p => getLocalYMD(p.date) === todayStr);

      return isDeliveredToday || hasPaymentToday;
    });

    const reportData = todaySalesWithActivity.map((sale) => {
      let paidToday = 0;
      const methodsToday: Record<string, number> = { dinheiro: 0, pix: 0, cartão: 0 };

      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach((p) => {
          if (getLocalYMD(p.date) === todayStr) {
            paidToday += p.amount;
            const m = String(p.method || 'dinheiro').toLowerCase();
            if (m.includes('pix')) {
              methodsToday.pix += p.amount;
            } else if (m.includes('cart') || m.includes('card')) {
              methodsToday.cartão += p.amount;
            } else {
              methodsToday.dinheiro += p.amount;
            }
          }
        });
      } else {
        if (getLocalYMD(sale.date) === todayStr && sale.downPayment > 0) {
          paidToday = sale.downPayment;
          const m = String(sale.paymentMethod || 'dinheiro').toLowerCase();
          if (m.includes('pix')) {
            methodsToday.pix = sale.downPayment;
          } else if (m.includes('cart') || m.includes('card')) {
            methodsToday.cartão = sale.downPayment;
          } else {
            methodsToday.dinheiro = sale.downPayment;
          }
        }
      }

      const deliveredToday = sale.materialEntregue && getLocalYMD(sale.deliveryDate) === todayStr;

      return {
        id: sale.id,
        clientName: sale.clientName,
        totalValue: sale.totalValue,
        balanceDue: sale.balanceDue,
        paidToday,
        methodsToday,
        deliveredToday,
        items: sale.items
      };
    });

    const totalPaidToday = reportData.reduce((sum, item) => sum + item.paidToday, 0);
    const totalDinheiro = reportData.reduce((sum, item) => sum + item.methodsToday.dinheiro, 0);
    const totalPix = reportData.reduce((sum, item) => sum + item.methodsToday.pix, 0);
    const totalCartao = reportData.reduce((sum, item) => sum + item.methodsToday.cartão, 0);
    const totalDeliveredToday = reportData.filter(item => item.deliveredToday).length;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const formattedDate = todayStr.split("-").reverse().join("/");

    const itemsHtml = reportData.map((d) => {
      const methodsStr = Object.entries(d.methodsToday)
        .filter(([_, val]) => val > 0)
        .map(([m, val]) => `${m.toUpperCase()}: ${formatBRL(val)}`)
        .join(", ");

      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: bold;">${d.clientName}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">${d.items.map(i => `${i.quantity}x ${i.description}`).join("<br/>")}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: center;">
            ${d.deliveredToday 
              ? '<span style="color: #16a34a; font-weight: bold; background-color: #f0fdf4; padding: 2px 6px; border-radius: 4px;">SIM</span>' 
              : '<span style="color: #64748b; background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px;">NÃO</span>'}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: right; font-weight: bold; color: ${d.paidToday > 0 ? '#16a34a' : '#64748b'};">
            ${formatBRL(d.paidToday)}
            ${methodsStr ? `<br/><span style="font-size: 9px; color: #64748b; font-weight: normal;">(${methodsStr})</span>` : ''}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: right; font-family: monospace;">${formatBRL(d.balanceDue)}</td>
        </tr>
      `;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Relatório de Entregas e Baixas - ${formattedDate}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #1e293b; padding: 30px; line-height: 1.5; }
            .header { text-align: center; margin-bottom: 35px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
            .title { font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
            .subtitle { font-size: 13px; color: #64748b; font-weight: 500; }
            .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 35px; }
            .summary-card { padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc; }
            .summary-card .label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.5px; }
            .summary-card .value { font-size: 18px; font-weight: 800; margin-top: 6px; color: #0f172a; }
            .section-title { font-size: 14px; font-weight: 800; margin: 35px 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
            th, td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 12px; }
            th { background-color: #f1f5f9; font-weight: bold; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
            .text-right { text-align: right; }
            .print-btn-container { text-align: center; margin-top: 40px; }
            .print-btn { padding: 12px 24px; font-size: 14px; font-weight: bold; background-color: #0284c7; color: white; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); transition: all 0.2s; }
            .print-btn:hover { background-color: #0369a1; }
            @media print {
              body { padding: 10px; }
              .print-btn-container { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Relatório Diário de Entregas e Baixas</div>
            <div class="subtitle">Data de Referência: <b>${formattedDate}</b> &nbsp;|&nbsp; Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</div>
          </div>
          
          <div class="summary-grid">
            <div class="summary-card">
              <div class="label">Total Recebido Hoje</div>
              <div class="value" style="color: #16a34a;">${formatBRL(totalPaidToday)}</div>
            </div>
            <div class="summary-card">
              <div class="label">Dinheiro Hoje</div>
              <div class="value" style="color: #0284c7;">${formatBRL(totalDinheiro)}</div>
            </div>
            <div class="summary-card">
              <div class="label">PIX Hoje</div>
              <div class="value" style="color: #8b5cf6;">${formatBRL(totalPix)}</div>
            </div>
            <div class="summary-card">
              <div class="label">Pedidos Entregues Hoje</div>
              <div class="value" style="color: #1e293b;">${totalDeliveredToday}</div>
            </div>
          </div>
          
          <div class="section-title">Detalhamento dos Pedidos com Movimentação</div>
          ${reportData.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Itens</th>
                  <th style="text-align: center; width: 100px;">Retirado Hoje</th>
                  <th class="text-right" style="width: 150px;">Valor Pago Hoje</th>
                  <th class="text-right" style="width: 120px;">Saldo Restante</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          ` : `<p style="font-size: 13px; color: #64748b; font-style: italic; text-align: center; padding: 30px; border: 1px dashed #cbd5e1; border-radius: 8px;">Nenhuma entrega ou baixa de saldo pendente realizada nesta data.</p>`}
          
          <div class="print-btn-container">
            <button class="print-btn" onclick="window.print()">Imprimir Relatório</button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Confirm ONLY the delivery / withdrawal of the material (when balanceDue is already 0)
  const handleConfirmOnlyDelivery = (sale: Sale) => {
    const originalOrderDate = sale.orderDate || (sale.date ? getLocalYMD(sale.date) : getLocalYMD(new Date().toISOString()));

    const updatedSale: Sale = {
      ...sale,
      deliveryDate: new Date().toISOString().substring(0, 10), // Register delivery / withdrawal today
      materialEntregue: true,
      orderDate: originalOrderDate,
    };

    // Save changes
    onSaveSale(updatedSale);

    // Provide immediate user visual feedback
    setSuccessMessage(`Retirada de material registrada com sucesso para ${sale.clientName.toUpperCase()}!`);

    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col my-4 max-h-[95vh]">
        
        {/* Header containing metadata counters */}
        <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <span className="h-5 w-1 rounded bg-yellow-500 animate-pulse"></span>
              <span>Retirada de Material & Recebimento de Saldos</span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Gerencie a entrega de produtos e registre o recebimento dos saldos pendentes no caixa de hoje.
            </p>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              type="button"
              onClick={handlePrintDailyReport}
              className="px-3 py-1.5 bg-brand-cyan/15 hover:bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan hover:text-brand-cyan/90 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Relatório do Dia</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-950/40 hover:bg-slate-950/80 rounded-full border border-slate-800 transition-all cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Search header & cumulative summary boxes */}
        <div className="p-3 bg-slate-950/40 border-b border-slate-800/60 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar cliente pendente por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-4 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-cyan transition-all"
            />
          </div>

          <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center justify-between text-yellow-500">
            <div>
              <span className="text-[9px] font-mono tracking-wider uppercase block text-slate-400">Total Pendente</span>
              <span className="text-xs font-bold font-mono">{formatBRL(totalPendingAmount)}</span>
            </div>
            <Coins className="h-4 w-4 text-yellow-500" />
          </div>
        </div>

        {/* Scrollable list content block */}
        <div className="flex-grow overflow-y-auto p-4 space-y-2.5 max-h-[65vh]">
          {successMessage && (
            <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-400 text-xs font-semibold animate-fadeIn">
              <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {pendingSales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-1.5">
              <div className="p-3 bg-slate-950 border border-slate-850 rounded-full text-slate-600">
                <AlertCircle className="h-8 w-8 text-slate-500" />
              </div>
              <h4 className="text-sm font-bold text-slate-300">Nenhuma retirada ou saldo pendente encontrado</h4>
              <p className="text-[11px] text-slate-500">Todas as notinhas foram entregues e quitadas.</p>
            </div>
          ) : (
            pendingSales.map((sale) => {
              const typedPayNow = paymentAmounts[sale.id] ?? "";
              const shouldUpdateDate = updateDates[sale.id] !== false;
              
              return (
                <div 
                  key={sale.id} 
                  className="bg-slate-950 rounded-xl border border-slate-850 hover:border-slate-800 p-3 flex flex-col lg:flex-row justify-between gap-3.5 transition-all"
                >
                  {/* Left Metadata Block */}
                  <div className="space-y-2 lg:max-w-md w-full">
                    <div className="flex items-start justify-between">
                      <div>
                        {(sale.balanceDue || 0) > 0.001 ? (
                          <span className="px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-500 text-[8px] font-mono uppercase tracking-wider font-bold">
                            Falta Retirar & Pagar
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-mono uppercase tracking-wider font-black border border-emerald-500/30">
                            Pronto P/ Retirar • ND A RECEBER
                          </span>
                        )}
                        <h3 className="mt-0.5 text-sm font-extrabold text-white uppercase font-sans">
                          {sale.clientName}
                        </h3>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono text-slate-500 block">
                          #{sale.id}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {onEditSale && (
                            <button
                              type="button"
                              onClick={() => {
                                onEditSale(sale);
                                onClose();
                              }}
                              title="Editar Venda"
                              className="bg-slate-900 hover:bg-brand-cyan/15 border border-slate-850 hover:border-brand-cyan/30 text-slate-400 hover:text-brand-cyan px-2 py-0.5 rounded text-[9px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Edit2 className="h-2.5 w-2.5" />
                              <span>Editar</span>
                            </button>
                          )}
                          {onDeleteSale && (
                            <button
                              type="button"
                              onClick={() => onDeleteSale(sale.id)}
                              title="Excluir/Cancelar Venda"
                              className="bg-slate-900 hover:bg-red-500/15 border border-slate-850 hover:border-red-500/30 text-slate-400 hover:text-red-400 px-2 py-0.5 rounded text-[9px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                              <span>Cancelar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-slate-500" />
                        <span>Data: {formatDate(sale.date)}</span>
                      </div>
                      {sale.clientPhone && sale.clientPhone !== "Não informado" && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-slate-500" />
                          <span>Contact: {sale.clientPhone}</span>
                        </div>
                      )}
                      {sale.orderDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-500" />
                          <span>Ped: {sale.orderDate.split("-").reverse().join("/")}</span>
                        </div>
                      )}
                      {sale.deliveryDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-500" />
                          <span className="text-brand-magenta font-medium">Ent: {sale.deliveryDate.split("-").reverse().join("/")}</span>
                        </div>
                      )}
                    </div>

                    {/* Summary of items */}
                    <div className="border-t border-slate-900 pt-1.5">
                      <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Itens Solicitados:</span>
                      <ul className="text-[11px] text-slate-300 space-y-0.5 mt-0.5 max-h-20 overflow-y-auto">
                        {sale.items.map((item, idx) => (
                          <li key={idx} className="flex justify-between items-center text-slate-350">
                            <span>• {item.quantity}x {item.description}</span>
                            <span className="font-mono">{formatBRL(item.totalValue)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Receipts History */}
                    {(() => {
                      const listPayments = sale.payments && sale.payments.length > 0 
                        ? sale.payments 
                        : (sale.downPayment > 0 
                            ? [{
                                id: "INITIAL",
                                amount: sale.downPayment,
                                date: sale.date,
                                method: (sale.paymentMethod || 'dinheiro') as 'dinheiro' | 'cartão' | 'pix'
                              }]
                            : []
                          );

                      if (listPayments.length === 0) return null;

                      return (
                        <div className="border-t border-slate-900 pt-1.5">
                          <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider mb-1 flex items-center gap-1">
                            <HandCoins className="h-3.5 w-3.5 text-brand-cyan" />
                            <span>Histórico de Recebimentos / Sinais:</span>
                          </span>
                          <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                            {listPayments.map((p, pIdx) => {
                              const isEditingThis = editingPayment && editingPayment.saleId === sale.id && editingPayment.paymentId === p.id;
                              
                              return (
                                <div key={p.id || pIdx} className="bg-slate-900/40 p-1.5 rounded border border-slate-850 flex flex-col gap-1">
                                  {isEditingThis ? (
                                    <div className="space-y-1">
                                      <div className="grid grid-cols-2 gap-1">
                                        <div>
                                          <span className="text-[7.5px] text-slate-500 block uppercase font-mono font-bold">Valor R$</span>
                                          <input
                                            type="text"
                                            value={editingPayment.amount}
                                            onChange={(e) => setEditingPayment({ ...editingPayment, amount: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono text-white font-bold"
                                          />
                                        </div>
                                        <div>
                                          <span className="text-[7.5px] text-slate-500 block uppercase font-bold">Meio</span>
                                          <select
                                            value={editingPayment.method}
                                            onChange={(e) => setEditingPayment({ ...editingPayment, method: e.target.value as any })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-[9.5px] text-slate-300"
                                          >
                                            <option value="dinheiro">Dinheiro</option>
                                            <option value="pix">PIX</option>
                                            <option value="cartão">Cartão</option>
                                          </select>
                                        </div>
                                      </div>
                                      <div className="flex gap-1 justify-end text-[9px]">
                                        <button
                                          type="button"
                                          onClick={() => setEditingPayment(null)}
                                          className="bg-slate-850 hover:bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded cursor-pointer"
                                        >
                                          Voltar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleConfirmEditPayment(sale)}
                                          className="bg-brand-cyan hover:bg-cyan-500 text-slate-950 font-bold px-1.5 py-0.5 rounded cursor-pointer"
                                        >
                                          Salvar
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex justify-between items-center text-[10.5px]">
                                      <div className="flex flex-col min-w-0">
                                        <span className="text-slate-200 font-bold font-mono">
                                          {formatBRL(p.amount)} <span className="text-[8.5px] text-slate-400 font-sans uppercase font-normal">({p.method})</span>
                                        </span>
                                        <span className="text-[8px] text-slate-500">
                                          {formatDate(p.date)}
                                        </span>
                                      </div>
                                      
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditPayment(sale, p)}
                                          className="p-1 hover:bg-brand-cyan/10 rounded text-slate-400 hover:text-brand-cyan transition-colors cursor-pointer"
                                          title="Editar Lançamento"
                                        >
                                          <Edit2 className="h-3 w-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeletePayment(sale, p.id)}
                                          className="p-1 hover:bg-rose-500/10 rounded text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                                          title="Excluir/Cancelar Lançamento"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Divider */}
                  <div className="hidden lg:block w-px bg-slate-850/60 self-stretch"></div>

                  {/* Right Financial & Interactive Payments Block */}
                  <div className="flex flex-col justify-between gap-2.5 lg:w-72 w-full bg-slate-900/40 p-2.5 rounded-xl border border-slate-850/60">
                    <div className="grid grid-cols-3 gap-1.5 text-center text-[9px] font-mono">
                      <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-500 block uppercase">Total</span>
                        <span className="text-[10px] font-bold text-white">{formatBRL(sale.totalValue)}</span>
                      </div>
                      <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-500 block uppercase">Sinal</span>
                        <span className="text-[10px] font-bold text-emerald-400">{formatBRL(sale.downPayment)}</span>
                      </div>
                      {sale.balanceDue > 0 ? (
                        <div className="bg-yellow-500/10 p-1.5 rounded-lg border border-yellow-500/20">
                          <span className="text-yellow-500/60 block uppercase">Pendente</span>
                          <span className="text-[10px] font-extrabold text-yellow-500">{formatBRL(sale.balanceDue)}</span>
                        </div>
                      ) : (
                        <div className="bg-emerald-500/15 p-1.5 rounded-lg border border-emerald-500/30">
                          <span className="text-emerald-400 block uppercase font-bold text-[8px]">Status</span>
                          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider block">ND A RECEBER</span>
                        </div>
                      )}
                    </div>

                    {/* Form Input paying Area */}
                    {sale.balanceDue > 0 ? (
                      <div className="space-y-1.5 mt-0.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] uppercase font-bold text-slate-400">Receber Agora:</label>
                          <button
                            type="button"
                            onClick={() => fillFullBalance(sale.id, sale.balanceDue)}
                            className="text-[9px] text-brand-cyan hover:underline hover:text-brand-cyan/80 font-bold uppercase cursor-pointer"
                          >
                            Quitar Saldo
                          </button>
                        </div>

                        <div className="relative">
                          <span className="absolute left-2.5 top-1.5 text-[10px] font-mono font-bold text-slate-500">R$</span>
                          <input
                            type="text"
                            value={paymentAmounts[sale.id] ?? ""}
                            onChange={(e) => handlePaymentAmountChange(sale.id, e.target.value)}
                            placeholder={sale.balanceDue.toFixed(2)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-3 py-1 text-xs text-white font-mono font-bold focus:outline-none focus:border-brand-cyan transition-all"
                          />
                        </div>

                        {/* Meio de Recebimento Picker */}
                        <div className="space-y-1">
                          <span className="text-[8.5px] uppercase font-bold text-slate-400">Meio de Recebimento:</span>
                          <div className="grid grid-cols-3 gap-1">
                            {(['dinheiro', 'pix', 'cartão'] as const).map((meth) => {
                              const isSel = (paymentMethods[sale.id] || sale.paymentMethod || 'dinheiro') === meth;
                              return (
                                <button
                                  key={meth}
                                  type="button"
                                  onClick={() => setPaymentMethods((prev) => ({ ...prev, [sale.id]: meth }))}
                                  className={`py-1 px-1 rounded-lg border text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    isSel
                                      ? "bg-brand-cyan/20 border-brand-cyan text-brand-cyan font-extrabold"
                                      : "bg-slate-950 border-slate-850 text-slate-500 hover:text-slate-350"
                                  }`}
                                >
                                  {meth}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Checkbox update Date */}
                        <div className="flex items-center gap-1.5 py-0">
                          <input
                            type="checkbox"
                            id={`update-date-${sale.id}`}
                            checked={shouldUpdateDate}
                            onChange={() => toggleUpdateDate(sale.id)}
                            className="rounded bg-slate-950 border-slate-800 text-brand-magenta focus:ring-0 h-3 w-3 cursor-pointer"
                          />
                          <label 
                            htmlFor={`update-date-${sale.id}`} 
                            className="text-[8.5px] text-slate-400 font-medium cursor-pointer select-none"
                          >
                            Lançar data como HOJE para constar no caixa atual
                          </label>
                        </div>

                        {/* Actions Confirmation buttons */}
                        <div className="flex gap-1.5 pt-1.5 border-t border-slate-900">
                          <button
                            type="button"
                            onClick={() => handleConfirmPayment(sale)}
                            className="flex-grow bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white py-1.5 px-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all shadow-md shadow-emerald-950/20 cursor-pointer"
                          >
                            <Check className="h-3 w-3" />
                            <span>Dar Baixa</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => generateUpdatedPDF(sale)}
                            title="Imprimir Recibo Atual"
                            className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white p-1.5 rounded-lg transition-all cursor-pointer"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 mt-1.5 flex-grow flex flex-col justify-between">
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/15 rounded-xl text-center space-y-1">
                          <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wide">
                            Pedido Totalmente Pago! 📄
                          </p>
                          <p className="text-[9px] text-slate-400 leading-normal">
                            Nenhum saldo pendente a receber. Registre apenas a retirada física do material do cliente.
                          </p>
                        </div>

                        <div className="flex gap-1.5 pt-1.5 border-t border-slate-900">
                          <button
                            type="button"
                            onClick={() => handleConfirmOnlyDelivery(sale)}
                            className="flex-grow bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white py-2 px-2.5 rounded-lg font-black text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-950/20 cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Confirmar Retirada</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => generateUpdatedPDF(sale)}
                            title="Imprimir Recibo Atual"
                            className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white p-2 rounded-lg transition-all cursor-pointer"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal simple stats summary footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/40 rounded-b-3xl text-right text-xs text-slate-500 font-mono">
          <span>Total de Clientes Pendentes: </span>
          <strong className="text-white">{pendingSales.length}</strong>
        </div>

      </div>
    </div>
  );
}
