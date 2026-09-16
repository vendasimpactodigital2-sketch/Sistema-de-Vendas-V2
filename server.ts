import { EventEmitter } from "events";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import QRCode from "qrcode";
import dotenv from "dotenv";

dotenv.config();

// Global Realtime SSE Sync Emitter for multi-device instant sync
const syncEmitter = new EventEmitter();
syncEmitter.setMaxListeners(200);

function broadcastSyncEvent(companyId: string, event: string, data?: any) {
  try {
    syncEmitter.emit("sync", { companyId, event, data, timestamp: Date.now() });
  } catch (e) {
    console.warn("broadcastSyncEvent warning:", e);
  }
}

// Global in-memory cache for fast, non-blocking Asaas payment status polling
const asaasPaymentStatusMap = new Map<string, { status: string; paid: boolean; userId?: string; updatedAt: number }>();

const app = express();
const PORT = 3000;

// Capture raw body for Stripe signature verification
app.use(express.json({
  limit: "50mb",
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

async function startServer() {

  // Lazy Stripe client helper to prevent crash on startup if STRIPE_SECRET_KEY is not set
  const getStripeInstance = () => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("A chave STRIPE_SECRET_KEY não está configurada no servidor.");
    }
    return new Stripe(key, { apiVersion: "2023-10-16" as any });
  };

  // Lazy Gemini client helper to avoid load-time failure and support dynamic updates
  const getAiInstance = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("A chave GEMINI_API_KEY não está configurada no servidor.");
    }
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // API to analyze receipts
  app.post("/api/analyze-receipt", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Nenhuma imagem foi recebida." });
      }

      const activeApiKey = process.env.GEMINI_API_KEY;
      if (!activeApiKey) {
        return res.status(500).json({ error: "A chave GEMINI_API_KEY não está configurada no servidor. Cadastre-a nas Configurações de Segredos para ativar." });
      }

      const ai = getAiInstance();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType || "image/jpeg",
            },
          },
          {
            text: "Analise esta imagem, que é uma nota fiscal, cupom fiscal, recibo ou lista de produtos. Extraia até no máximo 10 produtos ou itens descritos no texto da imagem. Para cada item identificado, você deve obrigatoriamente preencher:\n" +
                  "1. 'nome': Nome ou descrição curta do produto/item.\n" +
                  "2. 'preco_custo': O preço unitário pago/custo em Reais (R$). Se não encontrar, use 0.\n" +
                  "3. 'preco_venda': Preço de venda sugerido em Reais (R$). Se houver preço de custo, aplique uma margem saudável de mercado como custo * 1.5 a 1.8, ou use o valor comercial sugerido. Se for impossível estimar, use 0.\n" +
                  "4. 'estoque_atual': A quantidade comprada ou identificada na nota. Caso não haja quantidade explícita na imagem, defina obrigatoriamente o valor padrão como 5.\n\n" +
                  "Retorne exatamente a lista de objetos no JSON sob o campo 'items'.",
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                description: "List of up to 10 products extracted from the image.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    nome: {
                      type: Type.STRING,
                      description: "Name or short description of the item.",
                    },
                    preco_custo: {
                      type: Type.NUMBER,
                      description: "Unit cost price of the item. Returns 0 if not present.",
                    },
                    preco_venda: {
                      type: Type.NUMBER,
                      description: "Suggested sale price. Use standard markup (e.g. cost * 1.5) or suggested sales price.",
                    },
                    estoque_atual: {
                      type: Type.INTEGER,
                      description: "Quantity purchased or identified. Defaults to 5 if not explicitly mentioned.",
                    },
                  },
                  required: ["nome", "preco_custo", "preco_venda", "estoque_atual"],
                },
              },
            },
            required: ["items"],
          },
        },
      });

      const responseText = response.text || "{}";
      const data = JSON.parse(responseText.trim());
      return res.json(data);
    } catch (error: any) {
      console.error("Gemini analysis error:", error);
      return res.status(500).json({ error: error.message || "Erro interno no servidor de IA." });
    }
  });

  // Helper to get Supabase client safely without crashing
  const getSupabaseClient = () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("your_") || supabaseKey.includes("your_")) {
      return null;
    }
    try {
      return createClient(supabaseUrl, supabaseKey);
    } catch {
      return null;
    }
  };

  // Helper to activate user subscription in database
  const activateUserInDatabase = async (userId?: string) => {
    if (!userId) return false;
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.log(`[Supabase Activation] Supabase não configurado. Usuário ${userId} liberado no escopo da aplicação.`);
      return true;
    }
    try {
      console.log(`[Supabase Activation] Atualizando status diretamente nas tabelas 'assinaturas', 'users' e 'usuarios' para 'ativo' (Usuário: ${userId})`);
      const trialEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // 1. Atualiza/insere na tabela 'assinaturas' (com status 'ativo' e trial_end > data atual)
      try {
        await supabase
          .from("assinaturas")
          .upsert({
            user_id: userId,
            status: "ativo",
            trial_end: trialEndDate,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id" });
        console.log("[Supabase Activation] Tabela 'assinaturas' sincronizada com sucesso!");
      } catch (subErr: any) {
        console.warn("[Supabase Activation] Aviso na tabela 'assinaturas':", subErr?.message);
      }
      
      // 2. Atualiza diretamente na tabela 'users' (onde o Supabase Realtime está ativado)
      let userUpdated = false;
      try {
        const { error: userErr } = await supabase
          .from("users")
          .update({ 
            status: "ATIVO", 
            status_assinatura: "ativo",
            trial_end: trialEndDate,
            updated_at: new Date().toISOString()
          })
          .eq("id", userId);

        if (userErr) {
          console.warn("[Supabase Activation] Tentando atualizar 'users' apenas com status='ATIVO':", userErr.message);
          const { error: fallbackErr } = await supabase.from("users").update({ status: "ATIVO", trial_end: trialEndDate }).eq("id", userId);
          if (!fallbackErr) {
            userUpdated = true;
          } else {
            // Tenta também com status_assinatura="ativo"
            await supabase.from("users").update({ status_assinatura: "ativo", trial_end: trialEndDate }).eq("id", userId);
            userUpdated = true;
          }
        } else {
          userUpdated = true;
        }
      } catch (userErr: any) {
        console.warn(`[Supabase Activation] Aviso na tabela 'users':`, userErr?.message);
      }

      // 3. Atualiza tabela 'usuarios' caso exista no banco
      try {
        await supabase
          .from("usuarios")
          .update({ 
            status: "ativo",
            updated_at: new Date().toISOString()
          })
          .eq("id", userId);
      } catch (usuarioErr: any) {
        // Silencioso se tabela não existir
      }

      // 4. Sincroniza também na tabela 'profiles' para retrocompatibilidade
      try {
        await supabase
          .from("profiles")
          .update({ 
            status: "ATIVO", 
            status_assinatura: "ATIVO",
            trial_end: trialEndDate,
            updated_at: new Date().toISOString()
          })
          .eq("id", userId);
      } catch (profileErr: any) {
        // Silencioso caso profiles não exista
      }

      return userUpdated;
    } catch (err: any) {
      console.error(`[Supabase Activation] Falha ao atualizar banco:`, err?.message);
      return false;
    }
  };

  // Helper to check if an Asaas API key is missing or dummy/placeholder
  const isAsaasKeyPlaceholder = (apiKey?: string) => {
    if (!apiKey) return true;
    const clean = apiKey.trim().toLowerCase();
    return (
      clean === "" ||
      clean.includes("your_") ||
      clean.includes("my_") ||
      clean === "teste" ||
      clean === "test" ||
      clean === "sandbox" ||
      clean === "demo" ||
      clean.length < 10
    );
  };

  // Helper para obter a melhor chave Asaas configurada
  const getActiveAsaasKey = (): string => {
    const candidates = [
      process.env.ASAAS_API_KEY,
      process.env.ASAAS_TOKEN,
      process.env.VITE_ASAAS_TOKEN
    ].map(k => (k || "").trim()).filter(Boolean);

    const validKey = candidates.find(k => !isAsaasKeyPlaceholder(k));
    return validKey || candidates[0] || "";
  };

  // Helper to resolve Asaas API base URL safely (Default: Produção Asaas v3 - https://api.asaas.com/v3)
  const getAsaasBaseUrl = (apiKey?: string) => {
    const raw = (process.env.ASAAS_API_URL || "").trim();
    const lower = raw.toLowerCase();

    // 1. Sandbox explícito (chaves que iniciam com $aae ou url com 'sandbox')
    if (
      (apiKey && apiKey.startsWith("$aae")) ||
      lower.includes("sandbox") ||
      lower === "homologacao"
    ) {
      return "https://api-sandbox.asaas.com/v3";
    }

    // 2. Chave de Produção Oficial do Asaas ($aact_...)
    if (apiKey && (apiKey.startsWith("$aact_") || apiKey.startsWith("$aact"))) {
      return "https://api.asaas.com/v3";
    }

    // 3. Se foi passada uma URL personalizada em ASAAS_API_URL
    if (raw !== "") {
      try {
        const urlStr = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
        const parsed = new URL(urlStr);
        // Corrige se colocaram 'asaas.com' ou 'www.asaas.com' sem o subdomínio 'api'
        if (parsed.hostname === "asaas.com" || parsed.hostname === "www.asaas.com") {
          parsed.hostname = "api.asaas.com";
        }
        let pathname = parsed.pathname.replace(/\/+$/, "");
        if (!pathname.endsWith("/v3")) {
          pathname = `${pathname}/v3`.replace(/\/+/g, "/");
        }
        return `${parsed.origin}${pathname}`;
      } catch (urlErr) {
        console.warn(`[Asaas] URL customizada inválida em ASAAS_API_URL ('${raw}'). Usando endpoint oficial de produção.`);
      }
    }

    // Padrão oficial e definitivo: Produção Asaas v3
    return "https://api.asaas.com/v3";
  };

  // Validador e normalizador de CPF (Módulo 11 oficial)
  const normalizeOrGenerateCpf = (inputCpf?: string): string => {
    if (inputCpf) {
      const digits = inputCpf.replace(/\D/g, "");
      if (digits.length === 11 && !/^(\d)\1{10}$/.test(digits)) {
        let sum = 0;
        for (let i = 1; i <= 9; i++) sum += parseInt(digits.substring(i - 1, i)) * (11 - i);
        let rest = (sum * 10) % 11;
        if (rest === 10 || rest === 11) rest = 0;
        if (rest === parseInt(digits.substring(9, 10))) {
          sum = 0;
          for (let i = 1; i <= 10; i++) sum += parseInt(digits.substring(i - 1, i)) * (12 - i);
          rest = (sum * 10) % 11;
          if (rest === 10 || rest === 11) rest = 0;
          if (rest === parseInt(digits.substring(10, 11))) {
            return digits;
          }
        }
      }
    }
    // CPF válido padrão gerado por algoritmo oficial
    return "38492751088";
  };

  // 1. ENDPOINT: Gerar Cobrança PIX com QR Code Real via Asaas (/api/checkout/pix)
  const handleCreatePix = async (req: express.Request, res: express.Response) => {
    const { userId, name, email, cpf, cpfCnpj, phone, value } = req.body;
    const chargeValue = Number(value) || 26.99;
    const activeApiKey = getActiveAsaasKey();

    // Helper para gerar QR Code de demonstração/contingência com payload Pix válido
    const generateFallbackPixResponse = async (warningNotice?: string) => {
      const simPaymentId = `pay_sim_${Date.now()}`;
      const simPayload = `00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865405${chargeValue.toFixed(2)}5802BR5915NUCLEO GESTAO6009SAO PAULO62070503***6304E64A`;
      const qrCodeDataUrl = await QRCode.toDataURL(simPayload, {
        width: 320,
        margin: 1,
        color: { dark: "#0f172a", light: "#ffffff" }
      });

      asaasPaymentStatusMap.set(simPaymentId, {
        status: "PENDING",
        paid: false,
        userId,
        updatedAt: Date.now()
      });

      return res.json({
        success: true,
        paymentId: simPaymentId,
        encodedImage: qrCodeDataUrl,
        payload: simPayload,
        expirationDate: new Date(Date.now() + 86400000).toISOString(),
        invoiceUrl: "https://asaas.com",
        value: chargeValue,
        status: "PENDING",
        isReal: false,
        isSimulated: true,
        warning: warningNotice || "Chave Asaas não configurada ou em modo de teste. QR Code gerado em modo de demonstração com simulação de liberação."
      });
    };

    // Se a chave não estiver configurada ou for um valor de teste/placeholder
    if (isAsaasKeyPlaceholder(activeApiKey)) {
      console.warn("[Asaas Pix] ASAAS_API_KEY não configurada ou com valor placeholder ('teste'). Gerando QR Code em modo de demonstração funcional.");
      return await generateFallbackPixResponse();
    }

    try {
      const asaasBaseUrl = getAsaasBaseUrl(activeApiKey);
      const isSandbox = activeApiKey.startsWith("$aae");
      console.log(`[Asaas Pix] Conectando à API do Asaas (${isSandbox ? "SANDBOX" : "PRODUÇÃO"}): ${asaasBaseUrl}`);

      // 1. Busca dados do usuário caso não informados
      const supabase = getSupabaseClient();
      let userDb: any = null;
      if (supabase && userId) {
        try {
          const { data } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
          userDb = data;
        } catch (e) {}
      }

      const validCpf = normalizeOrGenerateCpf(cpf || cpfCnpj || userDb?.cpf || userDb?.cpfCnpj || userDb?.documento);
      const customerName = name || userDb?.name || userDb?.nome || "Cliente do Sistema";
      const customerEmail = (email || userDb?.email || `cliente_${(userId || "teste").toString().slice(0, 8)}@empresa.com`).trim().toLowerCase();
      let asaasCustomerId = userDb?.asaas_customer_id;

      // 2. Se não tiver asaasCustomerId, busca no Asaas ou cria
      if (!asaasCustomerId) {
        // Busca por CPF primeiro
        try {
          const searchCpfRes = await fetch(`${asaasBaseUrl}/customers?cpfCnpj=${validCpf}`, {
            headers: { "access_token": activeApiKey }
          });
          const isJson = searchCpfRes.headers.get("content-type")?.includes("json");
          if (searchCpfRes.ok && isJson) {
            const searchData = await searchCpfRes.json();
            if (searchData.data && searchData.data.length > 0) {
              asaasCustomerId = searchData.data[0].id;
              console.log(`[Asaas Pix] Cliente existente localizado por CPF no Asaas: ${asaasCustomerId}`);
            }
          }
        } catch (searchErr) {
          console.warn("[Asaas Pix] Erro ao pesquisar cliente por CPF:", searchErr);
        }

        // Se não achou por CPF, busca por e-mail
        if (!asaasCustomerId) {
          try {
            const searchRes = await fetch(`${asaasBaseUrl}/customers?email=${encodeURIComponent(customerEmail)}`, {
              headers: { "access_token": activeApiKey }
            });
            const isJson = searchRes.headers.get("content-type")?.includes("json");
            if (searchRes.ok && isJson) {
              const searchData = await searchRes.json();
              if (searchData.data && searchData.data.length > 0) {
                asaasCustomerId = searchData.data[0].id;
                console.log(`[Asaas Pix] Cliente existente localizado por e-mail no Asaas: ${asaasCustomerId}`);
              }
            }
          } catch (searchErr) {
            console.warn("[Asaas Pix] Erro ao pesquisar cliente por e-mail:", searchErr);
          }
        }

        // Se ainda não tiver cliente, cria no Asaas com nome, e-mail e CPF válido
        if (!asaasCustomerId) {
          console.log(`[Asaas Pix] Criando novo cliente no Asaas: ${customerName} (${customerEmail}, CPF: ${validCpf})`);
          const createCustomerPayload: any = {
            name: customerName,
            email: customerEmail,
            cpfCnpj: validCpf,
            externalReference: userId || undefined,
            notificationDisabled: true
          };
          if (phone) createCustomerPayload.mobilePhone = phone;

          const createRes = await fetch(`${asaasBaseUrl}/customers`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "access_token": activeApiKey
            },
            body: JSON.stringify(createCustomerPayload)
          });

          const createIsJson = createRes.headers.get("content-type")?.includes("json");
          if (createRes.ok && createIsJson) {
            const createData = await createRes.json();
            asaasCustomerId = createData.id;
            console.log(`[Asaas Pix] Novo cliente registrado no Asaas: ${asaasCustomerId}`);
          } else {
            const errText = await createRes.text();
            let parsedErr: any = null;
            try { parsedErr = JSON.parse(errText); } catch (e) {}
            const errorMsg = parsedErr?.errors?.map((e: any) => e.description).join("; ") || parsedErr?.message || (errText.startsWith("<") ? "O endpoint do Asaas retornou página HTML. Verifique a URL do Asaas." : errText);
            console.error("[Asaas Pix] Erro ao criar cliente no Asaas:", errorMsg);
            throw new Error(`Erro ao cadastrar cliente no Asaas: ${errorMsg}`);
          }
        }

        // Salva asaas_customer_id na tabela users
        if (supabase && userId && asaasCustomerId) {
          try {
            await supabase.from("users").update({ asaas_customer_id: asaasCustomerId }).eq("id", userId);
          } catch (updateErr) {}
        }
      }

      if (!asaasCustomerId) {
        throw new Error("Não foi possível registrar ou localizar o cliente no Asaas.");
      }

      // 3. Cria a cobrança PIX no Asaas
      const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const paymentPayload = {
        customer: asaasCustomerId,
        billingType: "PIX",
        value: chargeValue,
        dueDate: dueDate,
        description: "Assinatura Mensal - Acesso e Desbloqueio do Sistema",
        externalReference: userId,
        postalService: false
      };

      console.log(`[Asaas Pix] Criando cobrança PIX para cliente ${asaasCustomerId}: R$ ${chargeValue}`);
      const paymentRes = await fetch(`${asaasBaseUrl}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": activeApiKey
        },
        body: JSON.stringify(paymentPayload)
      });

      if (!paymentRes.ok) {
        const paymentErrText = await paymentRes.text();
        let parsedPaymentErr: any = null;
        try { parsedPaymentErr = JSON.parse(paymentErrText); } catch (e) {}
        const errMsg = parsedPaymentErr?.errors?.map((e: any) => e.description).join("; ") || parsedPaymentErr?.message || paymentErrText;
        console.error("[Asaas Pix] Erro ao criar cobrança no Asaas:", errMsg);
        throw new Error(`Erro ao criar cobrança no Asaas: ${errMsg}`);
      }

      const paymentData = await paymentRes.json();
      const paymentId = paymentData.id;

      // 4. Busca o QR Code PIX oficial da cobrança no Asaas
      console.log(`[Asaas Pix] Solicitando QR Code Pix para a cobrança ${paymentId}...`);
      const qrRes = await fetch(`${asaasBaseUrl}/payments/${paymentId}/pixQrCode`, {
        headers: { "access_token": activeApiKey }
      });

      let encodedImage = "";
      let payload = "";
      let expirationDate = "";

      if (qrRes.ok) {
        const qrData = await qrRes.json();
        payload = qrData.payload || "";
        expirationDate = qrData.expirationDate || "";
        encodedImage = qrData.encodedImage || "";

        if (encodedImage && !encodedImage.startsWith("data:image")) {
          encodedImage = `data:image/png;base64,${encodedImage}`;
        }
      } else {
        const qrErrText = await qrRes.text();
        console.warn("[Asaas Pix] Erro retornado ao buscar pixQrCode do Asaas:", qrErrText);
      }

      // Se o Asaas retornou payload mas sem imagem, geramos o QR Code usando a biblioteca qrcode com o payload real do Asaas
      if (!encodedImage && payload) {
        encodedImage = await QRCode.toDataURL(payload, {
          width: 320,
          margin: 1,
          color: { dark: "#0f172a", light: "#ffffff" }
        });
      }

      if (!encodedImage && !payload) {
        throw new Error("O Asaas não retornou o QR Code Pix desta cobrança.");
      }

      // Registra no mapa em memória para verificação ultrarrápida
      asaasPaymentStatusMap.set(paymentId, {
        status: paymentData.status || "PENDING",
        paid: paymentData.status === "RECEIVED" || paymentData.status === "CONFIRMED",
        userId,
        updatedAt: Date.now()
      });

      return res.json({
        success: true,
        paymentId: paymentId,
        encodedImage: encodedImage,
        payload: payload,
        expirationDate: expirationDate,
        invoiceUrl: paymentData.invoiceUrl,
        value: paymentData.value || chargeValue,
        status: paymentData.status || "PENDING",
        isReal: true,
        isSandbox: isSandbox
      });
    } catch (err: any) {
      console.error("[Asaas Pix Error]:", err?.message || err);

      const errMessage = (err?.message || "").toString();
      const isAuthError =
        errMessage.includes("chave de API") ||
        errMessage.includes("invalid_access_token") ||
        errMessage.includes("não autorizada") ||
        errMessage.includes("Unauthorized") ||
        errMessage.includes("401");

      if (isAuthError) {
        console.warn("[Asaas Pix] A chave de API do Asaas foi rejeitada pelo servidor Asaas. Gerando Pix em modo de contingência/demonstração.");
        return await generateFallbackPixResponse("A chave ASAAS_API_KEY informada não foi reconhecida pelo Asaas. QR Code gerado em modo de demonstração.");
      }

      return res.status(400).json({
        success: false,
        error: err?.message || "Falha na comunicação com a API do Asaas ao gerar Pix."
      });
    }
  };

  app.post("/api/checkout/pix", handleCreatePix);
  app.post("/api/asaas/create-pix", handleCreatePix);

  // 2. ENDPOINT: Verificar Status do Pagamento em Tempo Real (Polling)
  app.get("/api/asaas/check-status/:paymentId", async (req, res) => {
    try {
      const { paymentId } = req.params;
      const cached = asaasPaymentStatusMap.get(paymentId);

      // Se já estiver confirmado em cache (por webhook ou simulação)
      if (cached && cached.paid) {
        if (cached.userId) {
          activateUserInDatabase(cached.userId).catch(() => {});
        }
        return res.json({
          paid: true,
          status: "RECEIVED",
          message: "Pagamento confirmado com sucesso! Liberando acesso..."
        });
      }

      // Se for pagamento simulado
      if (paymentId.startsWith("pay_sim_")) {
        return res.json({
          paid: cached?.paid || false,
          status: cached?.status || "PENDING",
          isSimulated: true
        });
      }

      // Se for pagamento real do Asaas e tiver chave ativa, consulta a API do Asaas
      const activeApiKey = getActiveAsaasKey();
      if (!isAsaasKeyPlaceholder(activeApiKey)) {
        const asaasBaseUrl = getAsaasBaseUrl(activeApiKey);
        try {
          const response = await fetch(`${asaasBaseUrl}/payments/${paymentId}`, {
            headers: { "access_token": activeApiKey }
          });
          if (response.ok) {
            const data = await response.json();
            const isPaid = data.status === "RECEIVED" || data.status === "CONFIRMED";
            
            if (isPaid) {
              const userId = cached?.userId || data.externalReference;
              asaasPaymentStatusMap.set(paymentId, {
                status: data.status,
                paid: true,
                userId,
                updatedAt: Date.now()
              });
              if (userId) {
                await activateUserInDatabase(userId);
              }
              return res.json({
                paid: true,
                status: data.status,
                message: "Pagamento confirmado pelo Asaas! Acesso liberado automaticamente."
              });
            }

            return res.json({
              paid: false,
              status: data.status || "PENDING",
              message: "Aguardando pagamento via Pix..."
            });
          }
        } catch (fetchErr) {
          console.warn("[Asaas Check Status] Erro de rede ao consultar Asaas:", fetchErr);
        }
      }

      return res.json({
        paid: false,
        status: cached?.status || "PENDING"
      });
    } catch (err: any) {
      console.error("[Asaas Check Status Error]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. ENDPOINT: Simular Confirmação Instantânea (Para Testes e Demonstrações locais)
  app.post("/api/asaas/simulate-confirm", async (req, res) => {
    try {
      const activeApiKey = process.env.ASAAS_API_KEY;
      // Impede simulações se uma chave real de produção estiver ativa
      if (!isAsaasKeyPlaceholder(activeApiKey) && !activeApiKey?.startsWith("$aae")) {
        return res.status(403).json({
          error: "Modo de simulação desativado. O sistema está configurado com credenciais reais de produção do Asaas."
        });
      }

      const { paymentId, userId } = req.body;
      console.log(`[Asaas Simulate Confirm] Aprovando pagamento ${paymentId} para usuário ${userId}`);
      
      if (paymentId) {
        asaasPaymentStatusMap.set(paymentId, {
          status: "RECEIVED",
          paid: true,
          userId,
          updatedAt: Date.now()
        });
      }

      if (userId) {
        await activateUserInDatabase(userId);
      }

      return res.json({
        success: true,
        paid: true,
        status: "RECEIVED",
        message: "Pagamento aprovado via simulação de teste com sucesso!"
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 4. ENDPOINT: Liberação Manual Imediata por ID de Usuário
  app.post("/api/asaas/manual-activate", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "O ID do usuário é obrigatório." });
      }
      await activateUserInDatabase(userId);
      return res.json({ success: true, message: "Acesso liberado com sucesso!" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Rota de compatibilidade retroativa
  app.post("/api/payments/create", async (req, res) => {
    // Redireciona para o criador de PIX
    try {
      const { userId } = req.body;
      const baseUrl = `${req.protocol}://${req.get("host") || "localhost:3000"}`;
      const pixRes = await fetch(`${baseUrl}/api/asaas/create-pix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      const data = await pixRes.json();
      return res.json({
        checkoutUrl: data.invoiceUrl || "https://asaas.com",
        invoiceUrl: data.invoiceUrl || "https://asaas.com",
        ...data
      });
    } catch (e: any) {
      return res.json({
        checkoutUrl: "https://asaas.com",
        invoiceUrl: "https://asaas.com",
        isSimulated: true
      });
    }
  });

  // API to analyze expense receipt/invoice
  app.post("/api/analyze-expense", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Nenhuma imagem foi recebida." });
      }

      const activeApiKey = process.env.GEMINI_API_KEY;
      if (!activeApiKey) {
        return res.status(500).json({ error: "A chave GEMINI_API_KEY não está configurada no servidor. Cadastre-a nas Configurações de Segredos para ativar." });
      }

      const ai = getAiInstance();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType || "image/jpeg",
            },
          },
          {
            text: "Analise esta imagem que é um comprovante ou cupom de gasto enviada pelo usuário, faça a análise de visão computacional e extraia os dados realizando obrigatoriamente as seguintes 4 etapas:\n\n" +
                  "1. IDENTIFICAÇÃO DO ESTABELECIMENTO (CABEÇALHO): Leia o cabeçalho da imagem para identificar o nome do local/estabelecimento (Ex: Posto Ipiranga, Supermercado Extra, Kalunga).\n" +
                  "2. DESCRIÇÃO DO GASTO: Analise o corpo do cupom para entender o que foi comprado (Ex: Combustível, Papel A4, Almoço). A descrição final retornada deve ser a junção do Local + Itens principais (Ex: 'Kalunga - Papel A4 e Canetas').\n" +
                  "3. VALOR TOTAL: Localize o valor total final pago no cupom e formate como um número decimal puro (Ex: 25.00).\n" +
                  "4. CATEGORIA: Classifique automaticamente o gasto com base nos itens lidos em uma destas categorias padrão: 'Materiais/Insumos', 'Alimentação', 'Combustível/Viagem', 'Manutenção' ou 'Outros'.\n\n" +
                  "Retorne estritamente um JSON válido seguindo a estrutura abaixo, sem textos extras ou Markdown:\n" +
                  "{\n" +
                  "  \"descricao\": \"Nome do Local - Descrição dos Itens\",\n" +
                  "  \"valor\": 25.00,\n" +
                  "  \"categoria\": \"Materiais/Insumos\"\n" +
                  "}",
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              descricao: {
                type: Type.STRING,
                description: "Establishment name + description of main items (Format: 'Nome do Local - Descrição dos Itens').",
              },
              valor: {
                type: Type.NUMBER,
                description: "The grand total value as a pure decimal float/number.",
              },
              categoria: {
                type: Type.STRING,
                description: "Classified category. Must be strictly one of: 'Materiais/Insumos', 'Alimentação', 'Combustível/Viagem', 'Manutenção', 'Outros'.",
              },
            },
            required: ["descricao", "valor", "categoria"],
          },
        },
      });

      const responseText = response.text || "{}";
      const data = JSON.parse(responseText.trim());
      return res.json(data);
    } catch (error: any) {
      console.error("Gemini expense analysis error:", error);
      return res.status(500).json({ error: error.message || "Erro interno no servidor de IA despesas." });
    }
  });

  // API for logistics AI agent
  app.post("/api/analyze-logistics", async (req, res) => {
    try {
      const { sales, todayDate } = req.body;
      if (!sales) {
        return res.status(400).json({ error: "Nenhuma lista de pedidos foi informada para análise." });
      }

      const promptText = `
Você é o assistente de logística da gráfica. Analise a lista de pedidos em JSON que enviei e a data atual do sistema. Retorne uma lista limpa e organizada em Markdown apenas com os materiais e clientes cuja data de entrega seja estritamente igual a hoje. Se houver itens com status 'Pendente' ou 'Em produção', coloque um aviso em destaque.

Data atual do sistema: ${todayDate || "03 de Junho de 2026"}

Lista de pedidos:
${JSON.stringify(sales, null, 2)}
      `;

      let responseText = "";
      const currentApiKey = process.env.GEMINI_API_KEY;

      if (!currentApiKey) {
        console.log("Aviso: Chave de API indisponível. Ativando contingência local de alto desempenho.");
        responseText = generateLocalReport(sales, todayDate, "A chave GEMINI_API_KEY não foi configurada. Gerando relatório através do mecanismo local de backup do servidor.");
      } else {
        try {
          const ai = getAiInstance();
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: promptText,
          });
          responseText = response.text || "";
        } catch (error: any) {
          console.log("Aviso: Modelo gemini-3.5-flash com alta demanda. Acionando fallback...");
          try {
            const ai = getAiInstance();
            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: promptText,
            });
            responseText = response.text || "";
          } catch (error2: any) {
            console.log("Informativo: Ambos os modelos em alta demanda. Ativando o gerador customizado local.");
            responseText = generateLocalReport(sales, todayDate, "A API do Google AI Studio está temporariamente sobrecarregada ou indisponível. Gerado em modo de contingência local estruturado de alto desempenho.");
          }
        }
      }

      if (!responseText) {
        responseText = generateLocalReport(sales, todayDate, "Erro ao processar resposta. Gerado em modo de contingência local.");
      }

      return res.json({ result: responseText });
    } catch (error: any) {
      console.error("Gemini logistics analyzer parent error:", error);
      return res.status(500).json({ error: error.message || "Erro ao consultar a inteligência artificial para logística." });
    }
  });

  // Helper local generator to guarantee 100% uptime for logistics card summaries
  function generateLocalReport(sales: any[], todayDate: string, noticeOfContingency: string): string {
    try {
      const safeSales = Array.isArray(sales) ? sales : [];
      const safeTodayDate = String(todayDate || "");
      const todayIso = safeTodayDate.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
      
      const todaysOrders = safeSales.filter((s: any) => {
        if (!s) return false;
        const dDate = s.deliveryDate ? String(s.deliveryDate) : "";
        return dDate && dDate.includes(todayIso);
      });
      
      let report = `## 📋 Relatório Logístico Automático de Hoje\n\n`;
      report += `> ℹ️ **Nota do Sistema:** *${noticeOfContingency}*\n\n`;
      report += `### 🚚 Resumo de Entregas\n`;
      report += `- **Total de Entregas do Dia:** **${todaysOrders.length}** pedido(s)\n`;
      
      const pendingCount = todaysOrders.filter((s: any) => s && Number(s.balanceDue || 0) > 0).length;
      const totalValue = todaysOrders.reduce((acc: number, d: any) => acc + Number(d?.totalValue || 0), 0);
      const balanceDue = todaysOrders.reduce((acc: number, d: any) => acc + Number(d?.balanceDue || 0), 0);
      
      report += `- **Pedidos com Saldo Pendente:** **${pendingCount}**\n`;
      report += `- **Faturamento Total Previsto:** R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
      report += `- **Montante em Aberto a Receber:** R$ ${balanceDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n\n`;
      
      if (pendingCount > 0) {
        report += `> ⚠️ **Aviso de Pendências:** Existem **${pendingCount}** pedidos pendentes de pagamento ou com saldo em aberto agendados para hoje. Certifique-se de cobrar no ato da entrega!\n\n`;
      }
      
      report += `### 📦 Lista de Clientes e Materiais do Dia\n\n`;
      
      if (todaysOrders.length === 0) {
        report += `*Não há pedidos agendados para entrega na data de hoje no banco de dados.*\n`;
      } else {
        todaysOrders.forEach((o: any, idx: number) => {
          if (!o) return;
          const itemsArr = Array.isArray(o.items) ? o.items : [];
          const itemSummary = itemsArr.length > 0
            ? itemsArr.map((i: any) => `**${i?.quantity || 1}x** *${String(i?.description || "Produto s/ descrição")}*`).join(", ")
            : "Não especificado";
          
          const rawClientName = String(o.clientName || "Cliente não informado");
          const clientNameUpper = rawClientName.toUpperCase();
          const clientPhoneStr = o.clientPhone ? String(o.clientPhone) : "Sem telefone cadastrado";
          const dDue = Number(o.balanceDue || 0);
          
          report += `#### ${idx + 1}. 👤 Cliente: **${clientNameUpper}**\n`;
          report += `- **Materiais/Produtos:** ${itemSummary}\n`;
          report += `- **Telefone de Contato:** \`${clientPhoneStr}\`\n`;
          report += `- **Status Financeiro:** ${dDue > 0 ? `🔴 **A receber:** R$ ${dDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : `🟢 **Totalmente Pago**`}\n\n`;
        });
      }
      
      return report;
    } catch (e: any) {
      console.error("Critical fail inside local logistics generator fallback:", e);
      return `## 📋 Relatório Logístico Automático de Hoje\n\nOcorreu uma falha ao renderizar o relatório de backup no servidor: ${e.message || "Erro desconhecido"}`;
    }
  }

  const handleAsaasWebhook = async (req: express.Request, res: express.Response) => {
    try {
      const tokenAsaas = req.headers["asaas-access-token"];
      const secret = process.env.ASAAS_WEBHOOK_SECRET;

      console.log("[Asaas Webhook] Recebido webhook do Asaas.");
      console.log("[Asaas Webhook] Cabeçalho asaas-access-token enviado:", tokenAsaas ? "Sim" : "Não");

      // Validação de segurança do webhook caso ASAAS_WEBHOOK_SECRET real esteja configurado
      const isDummySecret = !secret || secret.trim() === "" || secret.includes("your_") || secret.includes("MY_") || secret.toLowerCase() === "teste" || secret.toLowerCase() === "test";
      if (!isDummySecret && tokenAsaas) {
        if (tokenAsaas !== secret) {
          console.warn(`[Asaas Webhook] Token enviado ("${tokenAsaas}") não corresponde ao ASAAS_WEBHOOK_SECRET configurado.`);
          return res.status(401).json({ error: "Token de webhook não autorizado" });
        }
      }

      const { event, payment } = req.body || {};
      console.log(`[Asaas Webhook] Evento recebido: ${event}`);

      if (!payment) {
        console.warn("[Asaas Webhook] Corpo da requisição não contém objeto payment.");
        return res.status(200).json({ received: true, message: "Sem dados de pagamento para processar" });
      }

      // 2. Escuta os eventos PAYMENT_RECEIVED ou PAYMENT_CONFIRMED enviados pelo Asaas
      const isPaymentConfirmed = 
        event === "PAYMENT_RECEIVED" || 
        event === "PAYMENT_CONFIRMED" || 
        event === "PAYMENT_CREDITED" ||
        payment.status === "RECEIVED" ||
        payment.status === "CONFIRMED";

      if (isPaymentConfirmed) {
        // 3. Usa o externalReference do payload do Asaas (que contém o userId)
        const usuarioIdNoSupabase = payment.externalReference || req.body?.externalReference;
        const clienteIdNoAsaas = payment.customer;

        console.log(`[Asaas Webhook] Pagamento confirmado! externalReference (userId): ${usuarioIdNoSupabase}, Cliente Asaas: ${clienteIdNoAsaas}, ID cobrança: ${payment.id}`);

        if (payment.id) {
          asaasPaymentStatusMap.set(payment.id, {
            status: "RECEIVED",
            paid: true,
            userId: usuarioIdNoSupabase,
            updatedAt: Date.now()
          });
        }

        if (!usuarioIdNoSupabase) {
          console.error("[Asaas Webhook] externalReference (ID do usuário no Supabase) não encontrado no pagamento.");
          return res.status(200).json({ received: true, warning: "externalReference ausente no pagamento" });
        }

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          console.error("[Asaas Webhook] Chaves de conexão do Supabase não configuradas no servidor.");
          return res.status(500).json({ error: "Configuração do Supabase ausente no servidor" });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 3. Atualizar o status do usuário DIRETAMENTE na tabela 'users' do Supabase para 'ATIVO' (Realtime ativo)
        console.log(`[Asaas Webhook] Atualizando status do usuário DIRETAMENTE na tabela 'users' para 'ATIVO' (ID: ${usuarioIdNoSupabase})...`);
        let userUpdated = false;
        try {
          const { error: userError } = await supabase
            .from("users")
            .update({
              status: "ATIVO",
              status_assinatura: "ativo",
              asaas_customer_id: clienteIdNoAsaas,
              updated_at: new Date().toISOString()
            })
            .eq("id", usuarioIdNoSupabase);

          if (userError) {
            console.warn("[Asaas Webhook] Tentando atualizar 'users' apenas com status='ATIVO':", userError.message);
            const { error: fallbackErr1 } = await supabase
              .from("users")
              .update({ status: "ATIVO" })
              .eq("id", usuarioIdNoSupabase);

            if (!fallbackErr1) {
              userUpdated = true;
              console.log("[Asaas Webhook] Tabela 'users' atualizada diretamente para 'ATIVO'!");
            } else {
              // Tenta com status_assinatura
              const { error: fallbackErr2 } = await supabase
                .from("users")
                .update({ status_assinatura: "ativo" })
                .eq("id", usuarioIdNoSupabase);
              if (!fallbackErr2) {
                userUpdated = true;
                console.log("[Asaas Webhook] Tabela 'users' atualizada diretamente com status_assinatura='ativo'!");
              } else {
                console.warn("[Asaas Webhook] Falha ao atualizar 'users':", fallbackErr2.message);
              }
            }
          } else {
            userUpdated = true;
            console.log("[Asaas Webhook] Tabela 'users' atualizada diretamente com sucesso para 'ATIVO'!");
          }
        } catch (userEx: any) {
          console.warn("[Asaas Webhook] Exceção ao atualizar 'users':", userEx?.message);
        }

        // Sincroniza na tabela 'assinaturas' com status 'ativo' e trial_end
        const trialEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        let assinaturaUpdated = false;
        try {
          const { error: assError } = await supabase
            .from("assinaturas")
            .upsert({
              user_id: usuarioIdNoSupabase,
              status: "ativo",
              trial_end: trialEndDate,
              asaas_customer_id: clienteIdNoAsaas,
              asaas_payment_id: payment.id,
              updated_at: new Date().toISOString()
            }, { onConflict: "user_id" });

          if (!assError) {
            assinaturaUpdated = true;
            console.log("[Asaas Webhook] Tabela 'assinaturas' atualizada com sucesso!");
          } else {
            console.warn("[Asaas Webhook] Aviso ao atualizar 'assinaturas':", assError.message);
          }
        } catch (assEx: any) {
          console.warn("[Asaas Webhook] Exceção ao atualizar 'assinaturas':", assEx?.message);
        }

        // Sincroniza também na tabela 'usuarios' caso exista
        try {
          await supabase
            .from("usuarios")
            .update({ status: "ativo", updated_at: new Date().toISOString() })
            .eq("id", usuarioIdNoSupabase);
        } catch (uErr: any) {}

        // Sincroniza também na tabela 'profiles' para retrocompatibilidade
        let profileUpdated = false;
        try {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({
              status: "ATIVO",
              status_assinatura: "ATIVO",
              trial_end: trialEndDate,
              asaas_customer_id: clienteIdNoAsaas,
              updated_at: new Date().toISOString()
            })
            .eq("id", usuarioIdNoSupabase);

          if (!profileError) {
            profileUpdated = true;
          }
        } catch (profileEx: any) {
          // Silencioso se profiles não existir
        }

        console.log(`[Asaas Webhook] Usuário ${usuarioIdNoSupabase} ativado no banco com sucesso!`);
        return res.status(200).json({ 
          received: true, 
          success: true, 
          userId: usuarioIdNoSupabase, 
          status: "ATIVO", 
          userUpdated,
          assinaturaUpdated,
          profileUpdated 
        });
      }

      return res.status(200).json({ received: true, event });
    } catch (err: any) {
      console.error("[Asaas Webhook] Erro interno no processamento:", err);
      return res.status(500).json({ error: err.message });
    }
  };

  app.post("/api/webhook/asaas", handleAsaasWebhook);
  app.post("/api/webhooks/asaas", handleAsaasWebhook);
  app.get("/api/webhook/asaas", (req, res) => res.json({ status: "ok", message: "Asaas Webhook endpoint ativo" }));

  // ==========================================
  // STRIPE CHECKOUT & SUBSCRIPTION INTEGRATION
  // ==========================================

  // 1. Criar Sessão de Checkout do Stripe com 15 dias de Teste Grátis
  app.post("/api/stripe/create-checkout-session", async (req, res) => {
    try {
      const { userId, userEmail, successUrl, cancelUrl } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "O ID do usuário (userId) é obrigatório." });
      }

      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey || stripeSecretKey.trim() === "" || stripeSecretKey.includes("MY_")) {
        console.warn("[Stripe Checkout] STRIPE_SECRET_KEY não configurada. Ativando link de simulação.");
        return res.json({
          url: `${req.headers.origin || "http://localhost:3000"}?payment=simulated_success`,
          isSimulated: true,
          message: "Modo de simulação ativado por falta de chave STRIPE_SECRET_KEY."
        });
      }

      const stripe = getStripeInstance();
      const priceId = process.env.STRIPE_PRICE_ID || "price_1TzmqlD15U3MLrZlaibMpiXL";
      const domain = req.headers.origin || "http://localhost:3000";

      console.log(`[Stripe Checkout] Criando sessão de checkout para usuário ${userId} com 15 dias grátis (Price ID: ${priceId})`);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        subscription_data: {
          trial_period_days: 15, // 15 dias grátis configurados diretamente no código
          metadata: {
            user_id: userId,
          },
        },
        client_reference_id: userId,
        customer_email: userEmail && userEmail.includes("@") ? userEmail : undefined,
        metadata: {
          user_id: userId,
        },
        success_url: successUrl || `${domain}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${domain}/?payment=canceled`,
      });

      return res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("[Stripe Checkout Error]:", error);
      return res.status(500).json({ error: error.message || "Erro ao criar sessão de checkout no Stripe." });
    }
  });

  // 2. Webhook do Stripe para Receber Confirmações de Pagamento e Assinatura
  const handleStripeWebhook = async (req: express.Request, res: express.Response) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret || webhookSecret.trim() === "") {
      console.warn("[Stripe Webhook] STRIPE_WEBHOOK_SECRET não configurado no servidor.");
      return res.status(400).send("Webhook secret não configurado.");
    }

    let event: Stripe.Event;

    try {
      const stripe = getStripeInstance();
      const rawBody = (req as any).rawBody || req.body;
      event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
    } catch (err: any) {
      console.error(`[Stripe Webhook Error] Assinatura inválida: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[Stripe Webhook] Evento recebido com sucesso: ${event.type}`);

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("[Stripe Webhook] Supabase não configurado.");
      return res.status(500).send("Configuração do Supabase ausente.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
      switch (event.type) {
        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;
          const subRaw = (invoice as any).subscription;
          const subscriptionId = (typeof subRaw === "string" ? subRaw : subRaw?.id) || "";
          
          console.log(`[Stripe Webhook] Fatura paga com sucesso (invoice.paid) para o cliente ${customerId}`);
          
          if (customerId) {
            await supabase
              .from("users")
              .update({
                status_assinatura: "ativo",
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
              })
              .eq("stripe_customer_id", customerId);

            // Sincroniza também na tabela 'assinaturas' do Supabase
            await supabase
              .from("assinaturas")
              .upsert({
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                status: "active",
                updated_at: new Date().toISOString()
              }, { onConflict: "stripe_customer_id" });
          }
          break;
        }

        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id || session.metadata?.user_id;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;

          if (userId) {
            console.log(`[Stripe Webhook] Liberando acesso para o usuário ${userId}`);
            await supabase
              .from("users")
              .update({
                status_assinatura: "ativo",
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
              })
              .eq("id", userId);

            await supabase
              .from("assinaturas")
              .upsert({
                user_id: userId,
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                status: "active",
                updated_at: new Date().toISOString()
              }, { onConflict: "user_id" });
          }
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          const status = subscription.status; // 'active', 'trialing', 'past_due', 'canceled', 'unpaid'
          const userId = subscription.metadata?.user_id;

          let statusAssinatura = "bloqueado";
          let statusDb = "canceled";
          if (status === "active") {
            statusAssinatura = "ativo";
            statusDb = "active";
          } else if (status === "trialing") {
            statusAssinatura = "trialing";
            statusDb = "trialing";
          }

          console.log(`[Stripe Webhook] Atualizando status de assinatura para ${statusAssinatura} (Stripe status: ${status})`);

          // Tenta atualizar pelo userId do metadata ou pelo stripe_customer_id
          if (userId) {
            await supabase
              .from("users")
              .update({
                status_assinatura: statusAssinatura,
                stripe_subscription_id: subscription.id,
              })
              .eq("id", userId);

            await supabase
              .from("assinaturas")
              .upsert({
                user_id: userId,
                stripe_customer_id: customerId,
                stripe_subscription_id: subscription.id,
                status: statusDb,
                trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
                updated_at: new Date().toISOString()
              }, { onConflict: "user_id" });
          } else if (customerId) {
            await supabase
              .from("users")
              .update({
                status_assinatura: statusAssinatura,
                stripe_subscription_id: subscription.id,
              })
              .eq("stripe_customer_id", customerId);

            await supabase
              .from("assinaturas")
              .upsert({
                stripe_customer_id: customerId,
                stripe_subscription_id: subscription.id,
                status: statusDb,
                trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
                updated_at: new Date().toISOString()
              }, { onConflict: "stripe_customer_id" });
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          const userId = subscription.metadata?.user_id;

          console.log(`[Stripe Webhook] Assinatura cancelada/encerrada. Bloqueando usuário...`);

          if (userId) {
            await supabase
              .from("users")
              .update({ status_assinatura: "bloqueado" })
              .eq("id", userId);

            await supabase
              .from("assinaturas")
              .update({ status: "canceled", updated_at: new Date().toISOString() })
              .eq("user_id", userId);
          } else if (customerId) {
            await supabase
              .from("users")
              .update({ status_assinatura: "bloqueado" })
              .eq("stripe_customer_id", customerId);

            await supabase
              .from("assinaturas")
              .update({ status: "canceled", updated_at: new Date().toISOString() })
              .eq("stripe_customer_id", customerId);
          }
          break;
        }

        default:
          console.log(`[Stripe Webhook] Evento não tratado explicitamente: ${event.type}`);
      }

      return res.status(200).json({ received: true });
    } catch (dbErr: any) {
      console.error("[Stripe Webhook Exception]:", dbErr);
      return res.status(500).send(`Erro interno ao processar webhook: ${dbErr.message}`);
    }
  };

  app.post("/api/webhook/stripe", handleStripeWebhook);
  app.post("/api/webhooks/stripe", handleStripeWebhook);

  // 3. API para Verificar Validade dos 15 dias de Teste Grátis e Bloqueio Automático
  app.post("/api/stripe/check-access", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "O ID do usuário é obrigatório." });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        // Se Supabase não estiver configurado, libera por padrão no dev
        return res.json({ isAllowed: true, isTrial: true, daysRemaining: 15, status: "trialing" });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error || !user) {
        return res.json({ isAllowed: true, isTrial: true, daysRemaining: 15, status: "trialing" });
      }

      // Se o usuário tem status explicitamente ativo de assinatura paga
      if (user.status_assinatura === "ativo") {
        return res.json({
          isAllowed: true,
          isTrial: false,
          daysRemaining: 0,
          status: "ativo",
          message: "Assinatura Stripe Ativa"
        });
      }

      // Se está bloqueado manualmente
      if (user.status_assinatura === "bloqueado") {
        return res.json({
          isAllowed: false,
          isTrial: false,
          daysRemaining: 0,
          status: "bloqueado",
          message: "Acesso bloqueado. Realize a assinatura de R$ 25,00 para continuar."
        });
      }

      // Cálculo dos 15 dias de teste grátis a partir do cadastro (created_at)
      const createdAt = new Date(user.created_at || Date.now());
      const now = new Date();
      const diffInTime = now.getTime() - createdAt.getTime();
      const diffInDays = Math.floor(diffInTime / (1000 * 3600 * 24));
      const trialDuration = 15;
      const daysRemaining = Math.max(0, trialDuration - diffInDays);

      if (diffInDays >= trialDuration) {
        // Passaram os 15 dias e não possui pagamento ativo -> Atualiza no banco para bloqueado
        await supabase
          .from("users")
          .update({ status_assinatura: "bloqueado" })
          .eq("id", userId);

        return res.json({
          isAllowed: false,
          isTrial: false,
          daysRemaining: 0,
          status: "bloqueado",
          message: "Seu período de teste grátis de 15 dias expirou. Faça o upgrade por R$ 25,00/mês para desbloquear seu sistema!"
        });
      }

      // Ainda dentro dos 15 dias de teste grátis
      return res.json({
        isAllowed: true,
        isTrial: true,
        daysRemaining: daysRemaining,
        status: "trialing",
        message: `Período de Teste Grátis Ativo: restam ${daysRemaining} dias.`
      });
    } catch (err: any) {
      console.error("[Stripe Check Access Error]:", err);
      return res.json({ isAllowed: true, isTrial: true, daysRemaining: 15, status: "trialing" });
    }
  });

  // Quick sales management API (uses service_role to avoid client RLS code 42501)
  app.get("/api/quick-sales", async (req, res) => {
    try {
      const userId = (req.query.userId as string) || "";
      if (!userId) {
        return res.status(400).json({ error: "userId é obrigatório" });
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return res.json({ success: true, data: [] });
      }

      // 1. Fetch from quick_sales table
      const { data, error } = await supabase
        .from("quick_sales")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        const formatted = data.map((item: any) => ({
          id: item.id,
          description: item.description,
          price: Number(item.price) || 0,
          cost: Number(item.cost) || 0,
          gradient: item.gradient || "from-purple-600 via-fuchsia-600 to-pink-500",
        }));
        return res.json({ success: true, data: formatted });
      }

      // 2. Fallback to sales table quick_sales_config
      const { data: salesConfig } = await supabase
        .from("sales")
        .select("items")
        .eq("id", "quick_sales_config")
        .maybeSingle();

      if (salesConfig?.items && Array.isArray(salesConfig.items) && salesConfig.items.length > 0) {
        return res.json({ success: true, data: salesConfig.items });
      }

      return res.json({ success: true, data: [] });
    } catch (err: any) {
      console.error("[Quick Sales GET Error]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/quick-sales", async (req, res) => {
    try {
      const { userId, item, items } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId é obrigatório" });
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return res.json({ success: true, message: "Supabase não configurado" });
      }

      const itemsToUpsert = items || (item ? [item] : []);
      if (itemsToUpsert.length === 0) {
        return res.status(400).json({ error: "Nenhum item informado" });
      }

      const rows = itemsToUpsert.map((it: any) => ({
        id: it.id,
        user_id: userId,
        description: it.description,
        price: Number(it.price) || 0,
        cost: Number(it.cost) || 0,
        gradient: it.gradient || "from-purple-600 via-fuchsia-600 to-pink-500"
      }));

      const { error } = await supabase.from("quick_sales").upsert(rows);
      if (error) {
        console.warn("[Quick Sales Server Upsert Warning]:", error.message);
        try {
          await supabase.from("sales").upsert({
            id: `quick_sales_config_${userId}`,
            user_id: userId,
            client_name: "QUICK_SALES_CONFIG",
            client_phone: "CONFIG",
            items: itemsToUpsert,
            date: new Date().toISOString()
          });
        } catch {}
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Quick Sales POST Error]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/quick-sales/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.query.userId as string) || (req.body?.userId as string) || "";
      if (!userId || !id) {
        return res.status(400).json({ error: "userId e id são obrigatórios" });
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return res.json({ success: true });
      }

      await supabase
        .from("quick_sales")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Quick Sales DELETE Error]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Helper to resolve canonical company owner and all company user IDs (attendants + owner)
  async function resolveCompanyScope(supabase: any, userId: string) {
    let canonicalOwnerId = userId;
    try {
      const { data: userRow } = await supabase
        .from("users")
        .select("id, owner_id")
        .eq("id", userId)
        .maybeSingle();
      if (userRow?.owner_id) {
        canonicalOwnerId = userRow.owner_id;
      }
    } catch (uErr) {}

    const companyUserIds = Array.from(new Set([userId, canonicalOwnerId]));
    try {
      const { data: usersData } = await supabase
        .from("users")
        .select("id")
        .or(`id.eq.${canonicalOwnerId},owner_id.eq.${canonicalOwnerId}`);
      if (usersData && usersData.length > 0) {
        usersData.forEach((u: any) => {
          if (u.id && !companyUserIds.includes(u.id)) {
            companyUserIds.push(u.id);
          }
        });
      }
    } catch (uErr) {}

    return { canonicalOwnerId, companyUserIds };
  }

  // Realtime Server-Sent Events (SSE) Stream Endpoint for Instant Multi-Terminal Sync
  app.get("/api/realtime/stream", (req, res) => {
    const companyId = (req.query.companyId as string) || "global";
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    });
    res.write(`data: ${JSON.stringify({ type: "connected", companyId })}\n\n`);

    const listener = (eventData: any) => {
      if (
        !eventData.companyId ||
        eventData.companyId === "global" ||
        !companyId ||
        companyId === "global" ||
        eventData.companyId === companyId
      ) {
        try {
          res.write(`data: ${JSON.stringify(eventData)}\n\n`);
        } catch (e) {
          // Socket write error handled on close
        }
      }
    };

    syncEmitter.on("sync", listener);

    const pingInterval = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch (e) {}
    }, 20000);

    req.on("close", () => {
      clearInterval(pingInterval);
      syncEmitter.off("sync", listener);
    });
  });

  // Client notification broadcast endpoint
  app.post("/api/realtime/notify", (req, res) => {
    const { companyId, event, data } = req.body;
    broadcastSyncEvent(companyId || "global", event || "sync", data);
    if (companyId && companyId !== "global") {
      broadcastSyncEvent("global", event || "sync", data);
    }
    return res.json({ success: true });
  });

  // Helper to ensure 'comprovantes' bucket exists and convert base64 image strings to public storage URLs
  async function sanitizeAndStoreImages(supabase: any, clientImageValue: any): Promise<string | null> {
    if (!clientImageValue) return null;
    let list: string[] = [];
    if (typeof clientImageValue === "string") {
      if (clientImageValue.startsWith("[") || clientImageValue.startsWith("{")) {
        try {
          const parsed = JSON.parse(clientImageValue);
          list = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          list = [clientImageValue];
        }
      } else {
        list = [clientImageValue];
      }
    } else if (Array.isArray(clientImageValue)) {
      list = clientImageValue;
    }

    const resultUrls: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (typeof item === "string" && item.startsWith("data:image/")) {
        try {
          const matches = item.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const mimeType = matches[1];
            const ext = mimeType.split("/")[1]?.split("+")[0] || "png";
            const buffer = Buffer.from(matches[2], "base64");
            const fileName = `sale_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${i}.${ext}`;
            
            try {
              await supabase.storage.createBucket("comprovantes", { public: true });
            } catch (bErr) {}

            const { error: upErr } = await supabase.storage.from("comprovantes").upload(fileName, buffer, {
              contentType: mimeType,
              upsert: true
            });
            if (!upErr) {
              const { data: pubData } = supabase.storage.from("comprovantes").getPublicUrl(fileName);
              if (pubData?.publicUrl) {
                resultUrls.push(pubData.publicUrl);
                continue;
              }
            }
          }
        } catch (e) {
          console.error("Failed to convert base64 image to storage URL in server:", e);
        }
        // If upload failed, avoid saving huge strings into Postgres
        if (item.length < 50000) {
          resultUrls.push(item);
        }
      } else if (typeof item === "string" && item.trim()) {
        resultUrls.push(item);
      }
    }
    return resultUrls.length > 0 ? JSON.stringify(resultUrls) : null;
  }

  // Safe Image Upload API (uses service_role to upload images to Supabase Storage 'comprovantes')
  app.post("/api/upload", async (req, res) => {
    try {
      const { files } = req.body;
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }
      const supabase = getSupabaseClient();
      if (!supabase) {
        return res.status(500).json({ error: "Supabase não configurado" });
      }

      try {
        await supabase.storage.createBucket("comprovantes", { public: true });
      } catch (e) {}

      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const fileObj = files[i];
        const base64Data = fileObj.data || fileObj.base64;
        if (!base64Data) continue;

        let cleanBase64 = base64Data;
        let mimeType = fileObj.type || "image/jpeg";
        if (cleanBase64.startsWith("data:")) {
          const match = cleanBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            cleanBase64 = match[2];
          }
        }
        const ext = mimeType.split("/")[1]?.split("+")[0] || "jpg";
        const buffer = Buffer.from(cleanBase64, "base64");
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}_${i}.${ext}`;

        const { error: upErr } = await supabase.storage.from("comprovantes").upload(fileName, buffer, {
          contentType: mimeType,
          upsert: true
        });

        if (!upErr) {
          const { data: pubData } = supabase.storage.from("comprovantes").getPublicUrl(fileName);
          if (pubData?.publicUrl) {
            urls.push(pubData.publicUrl);
          }
        } else {
          console.error("Server upload error for image:", upErr);
        }
      }

      return res.json({ success: true, urls });
    } catch (err: any) {
      console.error("[Server POST /api/upload Error]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Sales Management API (uses service_role to bypass client RLS 42501)
  app.post("/api/sales", async (req, res) => {
    try {
      const { userId, sale } = req.body;
      if (!userId || !sale || !sale.id) {
        return res.status(400).json({ error: "userId e dados válidos da venda são obrigatórios" });
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return res.json({ success: true, message: "Supabase não configurado no servidor" });
      }

      const { canonicalOwnerId } = await resolveCompanyScope(supabase, userId);

      const metaStr = JSON.stringify({ 
        orderDate: sale.orderDate, 
        deliveryDate: sale.deliveryDate,
        deliveryReason: sale.deliveryReason || "",
        payments: sale.payments || [],
        materialEntregue: !!sale.materialEntregue,
        sellerId: sale.sellerId || userId || "",
        sellerName: sale.sellerName || "",
        sellerRole: sale.sellerRole || "",
        deliveredBy: sale.deliveredBy || "",
        deliveredAt: sale.deliveredAt || "",
        deliveredRole: sale.deliveredRole || "",
        auditLog: sale.auditLog || []
      });
      const clientPhoneWithMeta = `${sale.clientPhone || ""}::${metaStr}`;

      const sanitizedImage = await sanitizeAndStoreImages(supabase, sale.clientImage);

      const payload: any = {
        id: sale.id,
        user_id: canonicalOwnerId,
        client_name: sale.clientName || "Venda",
        client_phone: clientPhoneWithMeta,
        items: sale.items || [],
        use_motoboy: !!sale.useMotoboy,
        motoboy_cost: Number(sale.motoboyCost) || 0,
        discount: Number(sale.discount) || 0,
        down_payment: Number(sale.downPayment || sale.down_payment || 0),
        operation_cost: Number(sale.operationCost) || 0,
        cost_items: sale.costItems || [],
        total_value: Number(sale.totalValue) || 0,
        balance_due: Number(sale.balanceDue) || 0,
        net_profit: Number(sale.netProfit) || (Number(sale.totalValue || 0) - Number(sale.operationCost || 0)),
        client_image: sanitizedImage,
        date: sale.date || new Date().toISOString(),
        is_budget: !!sale.isBudget,
        payment_method: sale.paymentMethod || "dinheiro"
      };

      const { error } = await supabase.from("sales").upsert(payload);
      if (error) {
        console.warn("[Server Sales Upsert] Warning with payment_method, trying without it:", error.message);
        delete payload.payment_method;
        const { error: fallbackErr } = await supabase.from("sales").upsert(payload);
        if (fallbackErr) {
          console.error("[Server Sales Upsert Error]:", fallbackErr);
          return res.status(500).json({ error: fallbackErr.message });
        }
      }

      // Instant broadcast to all terminals
      broadcastSyncEvent(canonicalOwnerId, "sales_updated", { saleId: sale.id });
      broadcastSyncEvent(userId, "sales_updated", { saleId: sale.id });
      broadcastSyncEvent("global", "sales_updated", { saleId: sale.id });

      return res.json({ success: true, saleId: sale.id });
    } catch (err: any) {
      console.error("[Server POST /api/sales Error]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sales", async (req, res) => {
    try {
      const userId = (req.query.userId as string) || "";
      if (!userId) {
        return res.status(400).json({ error: "userId é obrigatório" });
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return res.json({ success: true, data: [] });
      }

      const { companyUserIds } = await resolveCompanyScope(supabase, userId);

      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .in("user_id", companyUserIds)
        .order("date", { ascending: false });

      if (error) {
        console.error("[Server GET /api/sales Error]:", error);
        return res.status(500).json({ error: error.message });
      }

      const filteredData = (data || []).filter(
        (d: any) => d.id !== "quick_sales_config" && !d.id.startsWith("cash_register_state") && !d.id.startsWith("deletion_audit_log")
      );

      const mappedSales = filteredData.map((d: any) => {
        let realPhone = d.client_phone || "";
        let orderDate = "";
        let deliveryDate = "";
        let deliveryReason = "";
        let payments: any[] = [];
        let materialEntregue = false;
        let sellerId = "";
        let sellerName = "";
        let sellerRole: "atendente" | "administrador" | undefined = undefined;
        let deliveredBy = "";
        let deliveredAt = "";
        let deliveredRole: "atendente" | "administrador" | undefined = undefined;
        let auditLog: any[] = [];

        if (realPhone.includes("::")) {
          const parts = realPhone.split("::");
          realPhone = parts[0];
          try {
            const meta = JSON.parse(parts[1]);
            orderDate = meta.orderDate || "";
            deliveryDate = meta.deliveryDate || "";
            deliveryReason = meta.deliveryReason || "";
            payments = meta.payments || [];
            materialEntregue = !!meta.materialEntregue;
            sellerId = meta.sellerId || "";
            sellerName = meta.sellerName || "";
            sellerRole = meta.sellerRole || undefined;
            deliveredBy = meta.deliveredBy || "";
            deliveredAt = meta.deliveredAt || "";
            deliveredRole = meta.deliveredRole || undefined;
            auditLog = meta.auditLog || [];
          } catch (e) {}
        }

        return {
          id: d.id,
          clientName: d.client_name,
          clientPhone: realPhone,
          items: d.items || [],
          useMotoboy: d.use_motoboy,
          motoboyCost: Number(d.motoboy_cost || 0),
          discount: Number(d.discount || 0),
          downPayment: Number(d.down_payment || 0),
          operationCost: Number(d.operation_cost || 0),
          costItems: d.cost_items || [],
          totalValue: Number(d.total_value || 0),
          balanceDue: Number(d.balance_due || 0),
          netProfit: d.net_profit !== null && d.net_profit !== undefined ? Number(d.net_profit) : (Number(d.total_value || 0) - Number(d.operation_cost || 0)),
          clientImage: d.client_image || null,
          date: d.date,
          isBudget: !!d.is_budget,
          paymentMethod: d.payment_method || 'dinheiro',
          orderDate: orderDate || undefined,
          deliveryDate: deliveryDate || undefined,
          deliveryReason: deliveryReason || undefined,
          payments,
          materialEntregue,
          sellerId: sellerId || undefined,
          sellerName: sellerName || undefined,
          sellerRole,
          deliveredBy: deliveredBy || undefined,
          deliveredAt: deliveredAt || undefined,
          deliveredRole,
          auditLog
        };
      });

      return res.json({ success: true, data: mappedSales });
    } catch (err: any) {
      console.error("[Server GET /api/sales Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/sales/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const supabase = getSupabaseClient();
      if (!supabase) return res.json({ success: true });

      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) {
        console.error("[Server DELETE /api/sales Error]:", error);
        return res.status(500).json({ error: error.message });
      }
      broadcastSyncEvent("global", "sales_updated", { deletedId: id });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Server DELETE /api/sales Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Expenses Management API (Service Role to bypass client RLS 42501)
  app.get("/api/expenses", async (req, res) => {
    try {
      const userId = (req.query.userId as string) || "";
      if (!userId) {
        return res.status(400).json({ error: "userId é obrigatório" });
      }
      const supabase = getSupabaseClient();
      if (!supabase) return res.json({ success: true, data: [] });

      const { companyUserIds } = await resolveCompanyScope(supabase, userId);

      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .in("user_id", companyUserIds)
        .order("date", { ascending: false });

      if (error) {
        console.error("[Server GET /api/expenses Error]:", error);
        return res.status(500).json({ error: error.message });
      }

      const mapped = (data || []).map((d: any) => ({
        id: d.id,
        description: d.description,
        value: Number(d.value),
        date: d.date,
        category: d.category
      }));

      return res.json({ success: true, data: mapped });
    } catch (err: any) {
      console.error("[Server GET /api/expenses Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/expenses", async (req, res) => {
    try {
      const { userId, expense } = req.body;
      if (!userId || !expense || !expense.id) {
        return res.status(400).json({ error: "userId e dados da despesa são obrigatórios" });
      }
      const supabase = getSupabaseClient();
      if (!supabase) return res.json({ success: true });

      const { canonicalOwnerId } = await resolveCompanyScope(supabase, userId);

      const payload = {
        id: expense.id,
        user_id: canonicalOwnerId,
        description: expense.description || "Despesa",
        value: Number(expense.value) || 0,
        date: expense.date || new Date().toISOString(),
        category: expense.category || "Outros"
      };

      const { error } = await supabase.from("expenses").upsert(payload);
      if (error) {
        console.error("[Server POST /api/expenses Error]:", error);
        return res.status(500).json({ error: error.message });
      }

      broadcastSyncEvent(canonicalOwnerId, "expenses_updated", { expenseId: expense.id });
      broadcastSyncEvent("global", "expenses_updated", { expenseId: expense.id });

      return res.json({ success: true, expenseId: expense.id });
    } catch (err: any) {
      console.error("[Server POST /api/expenses Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/expenses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const supabase = getSupabaseClient();
      if (!supabase) return res.json({ success: true });

      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) {
        console.error("[Server DELETE /api/expenses Error]:", error);
        return res.status(500).json({ error: error.message });
      }

      broadcastSyncEvent("global", "expenses_updated", { deletedId: id });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Server DELETE /api/expenses Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Products Management API (Service Role to bypass client RLS 42501 and sync instantly across terminals)
  app.get("/api/products", async (req, res) => {
    try {
      const userId = (req.query.userId as string) || "";
      if (!userId) {
        return res.status(400).json({ error: "userId é obrigatório" });
      }
      const supabase = getSupabaseClient();
      if (!supabase) return res.json({ success: true, data: [] });

      const { companyUserIds } = await resolveCompanyScope(supabase, userId);

      const { data, error } = await supabase
        .from("produtos")
        .select("*")
        .in("user_id", companyUserIds);

      if (error) {
        console.error("[Server GET /api/products Error]:", error);
        return res.status(500).json({ error: error.message });
      }

      const mapped = (data || []).map((d: any) => {
        const cost = Number(d.cost_price ?? d.costPrice ?? d.preco_custo ?? d.valor_custo ?? 0);
        const sale = Number(d.sale_price ?? d.salePrice ?? d.preco_venda ?? d.valor_venda ?? 0);
        return {
          id: d.id,
          description: d.description || d.name || d.nome || d.descricao || "",
          costPrice: cost,
          salePrice: sale,
          profit: Number(d.profit ?? d.lucro ?? (sale - cost)),
          minStock: Number(d.min_stock ?? d.minStock ?? d.estoque_minimo ?? 0),
          currentStock: Number(d.current_stock ?? d.currentStock ?? d.estoque_atual ?? 0)
        };
      });

      return res.json({ success: true, data: mapped });
    } catch (err: any) {
      console.error("[Server GET /api/products Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const { userId, product } = req.body;
      if (!userId || !product || !product.id) {
        return res.status(400).json({ error: "userId e dados do produto são obrigatórios" });
      }
      const supabase = getSupabaseClient();
      if (!supabase) return res.json({ success: true });

      const { canonicalOwnerId } = await resolveCompanyScope(supabase, userId);

      // Ensure user exists in users table to satisfy foreign key constraints
      try {
        await supabase.from("users").upsert({
          id: canonicalOwnerId,
          name: canonicalOwnerId,
          username: canonicalOwnerId,
          password: ""
        }, { onConflict: "id", ignoreDuplicates: true });
      } catch (e) {}

      const descriptionText = String(product.description || product.name || product.nome || "").trim();
      const costValue = Number(product.costPrice ?? product.cost_price ?? product.preco_custo ?? 0);
      const saleValue = Number(product.salePrice ?? product.sale_price ?? product.preco_venda ?? 0);
      const minStockVal = Number(product.minStock ?? product.min_stock ?? product.estoque_minimo ?? 0);
      const currentStockVal = Number(product.currentStock ?? product.current_stock ?? product.estoque_atual ?? 0);
      const calculatedProfit = Number(product.profit ?? (saleValue - costValue));

      const ptPayload: any = {
        id: product.id,
        user_id: canonicalOwnerId,
        nome: descriptionText,
        description: descriptionText,
        name: descriptionText,
        preco_custo: costValue,
        preco_venda: saleValue,
        lucro: calculatedProfit,
        estoque_minimo: minStockVal,
        estoque_atual: currentStockVal,
        cost_price: costValue,
        sale_price: saleValue,
        profit: calculatedProfit,
        min_stock: minStockVal,
        current_stock: currentStockVal
      };

      const { error } = await supabase.from("produtos").upsert(ptPayload);
      if (error) {
        console.warn("[Server POST /api/products Notice]:", error.message);
        const fallbackPayload = {
          id: product.id,
          user_id: canonicalOwnerId,
          nome: descriptionText,
          preco_custo: costValue,
          preco_venda: saleValue,
          estoque_atual: currentStockVal
        };
        await supabase.from("produtos").upsert(fallbackPayload);
      }

      const mappedProduct = {
        id: product.id,
        description: descriptionText,
        costPrice: costValue,
        salePrice: saleValue,
        profit: calculatedProfit,
        minStock: minStockVal,
        currentStock: currentStockVal
      };

      // Broadcast instant update across all company terminals and global
      broadcastSyncEvent(canonicalOwnerId, "products_updated", { product: mappedProduct });
      broadcastSyncEvent(userId, "products_updated", { product: mappedProduct });
      broadcastSyncEvent("global", "products_updated", { product: mappedProduct });

      return res.json({ success: true, product: mappedProduct });
    } catch (err: any) {
      console.error("[Server POST /api/products Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.query.userId as string) || "";
      const supabase = getSupabaseClient();
      if (!supabase) return res.json({ success: true });

      const { canonicalOwnerId, companyUserIds } = userId ? await resolveCompanyScope(supabase, userId) : { canonicalOwnerId: "global", companyUserIds: [] };

      if (companyUserIds.length > 0) {
        await supabase.from("produtos").delete().eq("id", id).in("user_id", companyUserIds);
      } else {
        await supabase.from("produtos").delete().eq("id", id);
      }

      broadcastSyncEvent(canonicalOwnerId, "products_updated", { deletedId: id });
      broadcastSyncEvent("global", "products_updated", { deletedId: id });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Server DELETE /api/products Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Clientes Management API (service_role to bypass client RLS and sync across terminals)
  app.get("/api/clientes", async (req, res) => {
    try {
      const userId = (req.query.userId as string) || "";
      if (!userId) {
        return res.status(400).json({ error: "userId é obrigatório" });
      }
      const supabase = getSupabaseClient();
      if (!supabase) return res.json({ success: true, data: [] });

      const { companyUserIds } = await resolveCompanyScope(supabase, userId);

      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .in("user_id", companyUserIds)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[Server GET /api/clientes Error]:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json({ success: true, data: data || [] });
    } catch (err: any) {
      console.error("[Server GET /api/clientes Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/clientes", async (req, res) => {
    try {
      const { userId, cliente } = req.body;
      if (!userId || !cliente || !cliente.id) {
        return res.status(400).json({ error: "userId e dados do cliente são obrigatórios" });
      }
      const supabase = getSupabaseClient();
      if (!supabase) return res.json({ success: true });

      const { canonicalOwnerId } = await resolveCompanyScope(supabase, userId);

      // Ensure user exists in users table
      try {
        await supabase.from("users").upsert({
          id: canonicalOwnerId,
          name: canonicalOwnerId,
          username: canonicalOwnerId,
          password: ""
        }, { onConflict: "id", ignoreDuplicates: true });
      } catch (e) {}

      const payload = {
        ...cliente,
        user_id: canonicalOwnerId,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from("clientes").upsert(payload);
      if (error) {
        console.error("[Server POST /api/clientes Error]:", error);
        return res.status(500).json({ error: error.message });
      }

      broadcastSyncEvent(canonicalOwnerId, "clients_updated", { cliente: payload });
      broadcastSyncEvent(userId, "clients_updated", { cliente: payload });
      broadcastSyncEvent("global", "clients_updated", { cliente: payload });

      return res.json({ success: true, cliente: payload });
    } catch (err: any) {
      console.error("[Server POST /api/clientes Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/clientes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.query.userId as string) || "";
      const supabase = getSupabaseClient();
      if (!supabase) return res.json({ success: true });

      const { canonicalOwnerId, companyUserIds } = userId ? await resolveCompanyScope(supabase, userId) : { canonicalOwnerId: "global", companyUserIds: [] };

      if (companyUserIds.length > 0) {
        await supabase.from("clientes").delete().eq("id", id).in("user_id", companyUserIds);
      } else {
        await supabase.from("clientes").delete().eq("id", id);
      }

      broadcastSyncEvent(canonicalOwnerId, "clients_updated", { deletedId: id });
      broadcastSyncEvent("global", "clients_updated", { deletedId: id });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Server DELETE /api/clientes Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Direct Server-Side Backup Restore (uses service_role to insert all tables in Supabase and broadcast to all terminals)
  app.post("/api/backup/restore", async (req, res) => {
    try {
      const { userId, backupData } = req.body;
      if (!userId || !backupData) {
        return res.status(400).json({ error: "userId e backupData são obrigatórios" });
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return res.json({ success: true, message: "Supabase não configurado no servidor" });
      }

      const { canonicalOwnerId, companyUserIds } = await resolveCompanyScope(supabase, userId);

      // Ensure user exists in users table
      try {
        await supabase.from("users").upsert({
          id: canonicalOwnerId,
          name: canonicalOwnerId,
          username: canonicalOwnerId,
          password: ""
        }, { onConflict: "id", ignoreDuplicates: true });
      } catch (e) {}

      // Normalize backup payload in case it's a LocalStorage dump or nested backup structure
      const dumpCandidate = backupData.localStorageDump || backupData;
      
      const parseDumpKey = (keyName: string) => {
        if (!dumpCandidate || typeof dumpCandidate !== "object") return null;
        const val = dumpCandidate[keyName];
        if (!val) return null;
        if (typeof val === "string") {
          try {
            return JSON.parse(val);
          } catch (e) {
            return null;
          }
        }
        return val;
      };

      const counts = {
        sales: 0,
        produtos: 0,
        expenses: 0,
        gastos_mensais: 0,
        clientes: 0,
        company_profile: false,
        goals: false,
        cash_register: false
      };

      // 1. Company Profile
      const compProf = backupData.company_profile || backupData.companyProfile || parseDumpKey("NUCLEO_COMPANY_PROFILE") || parseDumpKey("COMPANY_PROFILE");
      if (compProf && typeof compProf === "object") {
        try {
          await supabase.from("company_profile").upsert({
            ...compProf,
            user_id: canonicalOwnerId,
            updated_at: new Date().toISOString()
          });
          counts.company_profile = true;
        } catch (e) {
          console.warn("[Backup Restore] company_profile error:", e);
        }
      }

      // 2. Goals
      const goalsObj = backupData.goals || backupData.metas || parseDumpKey("NUCLEO_GOALS");
      if (goalsObj && typeof goalsObj === "object") {
        try {
          await supabase.from("goals").upsert({
            ...goalsObj,
            user_id: canonicalOwnerId,
            updated_at: new Date().toISOString()
          });
          counts.goals = true;
        } catch (e) {
          console.warn("[Backup Restore] goals error:", e);
        }
      }

      // 3. Clientes
      let rawClientes = Array.isArray(backupData.clientes) ? backupData.clientes : 
                        Array.isArray(backupData.clients) ? backupData.clients : [];
      if (rawClientes.length === 0) {
        const fromDump = parseDumpKey("NUCLEO_CLIENTS") || parseDumpKey("NUCLEO_CLIENTES");
        if (Array.isArray(fromDump)) rawClientes = fromDump;
      }
      if (rawClientes.length > 0) {
        const batchClientes = rawClientes.map((c: any) => ({
          id: c.id || "client_" + Math.random().toString(36).substring(2, 9),
          user_id: canonicalOwnerId,
          name: c.name || c.nome || "Cliente Sem Nome",
          phone: c.phone || c.telefone || "",
          email: c.email || "",
          address: c.address || c.endereco || "",
          notes: c.notes || c.observacao || c.observation || "",
          cpf_cnpj: c.cpf_cnpj || c.cpfCnpj || "",
          created_at: c.created_at || c.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        try {
          for (let i = 0; i < batchClientes.length; i += 50) {
            await supabase.from("clientes").upsert(batchClientes.slice(i, i + 50));
          }
          counts.clientes = batchClientes.length;
        } catch (cErr) {
          console.warn("[Backup Restore] clientes batch error:", cErr);
        }
      }

      // 4. Produtos (both PT and EN columns to ensure compatibility)
      let rawProdutos = Array.isArray(backupData.produtos) ? backupData.produtos : 
                        Array.isArray(backupData.products) ? backupData.products : [];
      if (rawProdutos.length === 0) {
        const fromDump = parseDumpKey("NUCLEO_PRODUCTS") || parseDumpKey("NUCLEO_PRODUTOS");
        if (Array.isArray(fromDump)) rawProdutos = fromDump;
      }
      if (rawProdutos.length > 0) {
        const batchProdutos = rawProdutos.map((p: any) => {
          const id = p.id || "prod_" + Math.random().toString(36).substring(2, 9);
          const name = p.name || p.nome || p.description || p.descricao || "Produto";
          const cost = Number(p.costPrice ?? p.cost_price ?? p.preco_custo ?? p.valor_custo ?? 0);
          const sale = Number(p.salePrice ?? p.sale_price ?? p.preco_venda ?? p.valor_venda ?? 0);
          const minStock = Number(p.minStock ?? p.min_stock ?? p.estoque_minimo ?? 0);
          const currentStock = Number(p.currentStock ?? p.current_stock ?? p.estoque_atual ?? 0);
          const profit = Number(p.profit ?? (sale - cost));

          return {
            id,
            user_id: canonicalOwnerId,
            nome: name,
            description: name,
            name: name,
            preco_custo: cost,
            preco_venda: sale,
            lucro: profit,
            estoque_minimo: minStock,
            estoque_atual: currentStock,
            cost_price: cost,
            sale_price: sale,
            profit: profit,
            min_stock: minStock,
            current_stock: currentStock,
            image: p.image || p.foto || p.imagem || null
          };
        });

        try {
          for (let i = 0; i < batchProdutos.length; i += 50) {
            const chunk = batchProdutos.slice(i, i + 50);
            const { error: pErr } = await supabase.from("produtos").upsert(chunk);
            if (pErr) {
              for (const item of chunk) {
                try {
                  await supabase.from("produtos").upsert({
                    id: item.id,
                    user_id: canonicalOwnerId,
                    nome: item.nome,
                    preco_custo: item.preco_custo,
                    preco_venda: item.preco_venda,
                    estoque_atual: item.estoque_atual
                  });
                } catch (e) {}
              }
            }
          }
          counts.produtos = batchProdutos.length;
        } catch (pErr) {
          console.warn("[Backup Restore] produtos batch error:", pErr);
        }
      }

      // 5. Sales & Budgets
      let rawSales = Array.isArray(backupData.sales) ? backupData.sales : 
                     Array.isArray(backupData.vendas) ? backupData.vendas : [];
      let rawBudgets = Array.isArray(backupData.budgets) ? backupData.budgets : 
                       Array.isArray(backupData.orcamentos) ? backupData.orcamentos : [];
      if (rawSales.length === 0) {
        const fromDump = parseDumpKey("NUCLEO_SALES") || parseDumpKey("NUCLEO_VENDAS");
        if (Array.isArray(fromDump)) rawSales = fromDump;
      }
      if (rawBudgets.length === 0) {
        const fromDump = parseDumpKey("NUCLEO_BUDGETS") || parseDumpKey("NUCLEO_ORCAMENTOS");
        if (Array.isArray(fromDump)) rawBudgets = fromDump;
      }
      const allSales = [...rawSales];
      rawBudgets.forEach((b: any) => {
        if (!allSales.some((s: any) => s.id === b.id)) {
          allSales.push({ ...b, isBudget: true, is_budget: true });
        }
      });

      if (allSales.length > 0) {
        const batchSales: any[] = [];
        allSales.forEach((s: any) => {
          if (!s || !s.id || s.id === "quick_sales_config" || String(s.id).startsWith("cash_register_state")) return;

          const metaStr = JSON.stringify({
            orderDate: s.orderDate || "",
            deliveryDate: s.deliveryDate || "",
            deliveryReason: s.deliveryReason || "",
            payments: s.payments || [],
            materialEntregue: !!s.materialEntregue,
            sellerId: s.sellerId || "",
            sellerName: s.sellerName || "",
            sellerRole: s.sellerRole || "",
            deliveredBy: s.deliveredBy || "",
            deliveredAt: s.deliveredAt || "",
            deliveredRole: s.deliveredRole || "",
            auditLog: s.auditLog || []
          });
          const rawPhone = s.clientPhone || s.client_phone || "";
          const purePhone = rawPhone.includes("::") ? rawPhone.split("::")[0] : rawPhone;
          const phoneWithMeta = `${purePhone}::${metaStr}`;

          batchSales.push({
            id: s.id,
            user_id: canonicalOwnerId,
            client_name: s.clientName || s.client_name || "Cliente",
            client_phone: phoneWithMeta,
            items: s.items || [],
            use_motoboy: !!(s.useMotoboy || s.use_motoboy),
            motoboy_cost: Number(s.motoboyCost ?? s.motoboy_cost ?? 0),
            discount: Number(s.discount ?? 0),
            down_payment: Number(s.downPayment ?? s.down_payment ?? 0),
            operation_cost: Number(s.operationCost ?? s.operation_cost ?? 0),
            cost_items: s.costItems || s.cost_items || [],
            total_value: Number(s.totalValue ?? s.total_value ?? 0),
            balance_due: Number(s.balanceDue ?? s.balance_due ?? 0),
            net_profit: Number(s.netProfit ?? s.net_profit ?? 0),
            client_image: (() => {
              const img = s.clientImage || s.client_image || null;
              if (typeof img === "string" && img.length > 50000) {
                // If it contains huge base64 data, avoid bloating database
                return null;
              }
              return img;
            })(),
            date: s.date || new Date().toISOString(),
            is_budget: !!(s.isBudget || s.is_budget),
            payment_method: s.paymentMethod || s.payment_method || "dinheiro"
          });
        });

        for (let i = 0; i < batchSales.length; i += 50) {
          const chunk = batchSales.slice(i, i + 50);
          const { error: sErr } = await supabase.from("sales").upsert(chunk);
          if (sErr) {
            const stripped = chunk.map((it: any) => {
              const copy = { ...it };
              delete copy.payment_method;
              return copy;
            });
            try {
              await supabase.from("sales").upsert(stripped);
            } catch (e) {}
          }
        }
        counts.sales = batchSales.length;
      }

      // 6. Expenses
      let rawExpenses = Array.isArray(backupData.expenses) ? backupData.expenses : 
                        Array.isArray(backupData.despesas) ? backupData.despesas : 
                        Array.isArray(backupData.gastos) ? backupData.gastos : [];
      if (rawExpenses.length === 0) {
        const fromDump = parseDumpKey("NUCLEO_EXPENSES") || parseDumpKey("NUCLEO_DESPESAS");
        if (Array.isArray(fromDump)) rawExpenses = fromDump;
      }
      if (rawExpenses.length > 0) {
        const batchExpenses = rawExpenses.map((e: any) => ({
          id: e.id || "exp_" + Math.random().toString(36).substring(2, 9),
          user_id: canonicalOwnerId,
          description: e.description || "Despesa",
          value: Number(e.value) || 0,
          date: e.date || new Date().toISOString(),
          category: e.category || "Outros"
        }));

        for (let i = 0; i < batchExpenses.length; i += 50) {
          try {
            await supabase.from("expenses").upsert(batchExpenses.slice(i, i + 50));
          } catch (e) {}
        }
        counts.expenses = batchExpenses.length;
      }

      // 7. Gastos Mensais (Recurring / Monthly Bills)
      let rawGastos = Array.isArray(backupData.gastos_mensais) ? backupData.gastos_mensais : 
                      Array.isArray(backupData.faturas) ? backupData.faturas : 
                      Array.isArray(backupData.recurring_expenses) ? backupData.recurring_expenses : [];
      if (rawGastos.length === 0) {
        const fromDump = parseDumpKey("NUCLEO_RECURRING_EXPENSES") || parseDumpKey("NUCLEO_GASTOS_MENSAIS");
        if (Array.isArray(fromDump)) rawGastos = fromDump;
      }
      if (rawGastos.length > 0) {
        const batchGastos = rawGastos.map((g: any) => ({
          id: g.id || "bill_" + Math.random().toString(36).substring(2, 9),
          user_id: canonicalOwnerId,
          name: g.name || g.description || g.titulo || g.nome || "Fatura",
          value: Number(g.value || g.valor || 0),
          category: g.category || g.categoria || "Outros",
          due_date: g.due_date || g.dueDate || g.vencimento || "",
          observation: g.observation || g.observacao || ""
        }));

        for (let i = 0; i < batchGastos.length; i += 50) {
          try {
            await supabase.from("gastos_mensais").upsert(batchGastos.slice(i, i + 50));
          } catch (e) {}
        }
        counts.gastos_mensais = batchGastos.length;
      }

      // 8. Cash Register State
      let regState = backupData.cash_register_state || backupData.cash_register || backupData.cashRegister;
      if (!regState) {
        regState = parseDumpKey("NUCLEO_CASH_REGISTER") || parseDumpKey("NUCLEO_CASH_REGISTER_STATE");
      }
      if (regState) {
        const nowISO = new Date().toISOString();
        const createPayload = (rowId: string) => ({
          id: rowId,
          user_id: canonicalOwnerId,
          client_name: "CASH_REGISTER_SYNCED_STATE",
          client_phone: "CASH_REGISTER",
          items: regState as any,
          total_value: 0,
          is_budget: true,
          operation_cost: 0,
          balance_due: 0,
          net_profit: 0,
          discount: 0,
          down_payment: 0,
          motoboy_cost: 0,
          date: nowISO
        });

        await Promise.allSettled([
          supabase.from("sales").upsert(createPayload(`cash_register_state_${canonicalOwnerId}`)),
          supabase.from("sales").upsert(createPayload("cash_register_state"))
        ]);
        counts.cash_register = true;
      }

      // BROADCAST REALTIME SYNC ACROSS ALL COMPUTERS AND TERMINALS
      const targets = Array.from(new Set([canonicalOwnerId, userId, ...(companyUserIds || [])]));
      targets.forEach((targetId: string) => {
        broadcastSyncEvent(targetId, "backup_restored", { counts, timestamp: Date.now() });
        broadcastSyncEvent(targetId, "products_updated", { count: counts.produtos });
        broadcastSyncEvent(targetId, "sales_updated", { count: counts.sales });
        broadcastSyncEvent(targetId, "expenses_updated", { count: counts.expenses });
        broadcastSyncEvent(targetId, "clients_updated", { count: counts.clientes });
      });
      broadcastSyncEvent("global", "backup_restored", { counts, timestamp: Date.now() });
      broadcastSyncEvent("global", "products_updated", { count: counts.produtos });
      broadcastSyncEvent("global", "sales_updated", { count: counts.sales });
      broadcastSyncEvent("global", "expenses_updated", { count: counts.expenses });
      broadcastSyncEvent("global", "clients_updated", { count: counts.clientes });

      return res.json({ success: true, counts });
    } catch (err: any) {
      console.error("[Server POST /api/backup/restore Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Cash Register Management API (uses service_role to bypass client RLS 42501)
  app.post("/api/cash-register", async (req, res) => {
    try {
      const { userId, state } = req.body;
      if (!userId || !state) {
        return res.status(400).json({ error: "userId e state são obrigatórios" });
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return res.json({ success: true, message: "Supabase não configurado" });
      }

      const nowISO = new Date().toISOString();
      const todayStr = nowISO.split("T")[0];

      // Resolve company owner id and all user IDs
      const { canonicalOwnerId, companyUserIds } = await resolveCompanyScope(supabase, userId);

      const createPayload = (rowId: string, uid: string) => ({
        id: rowId,
        user_id: uid,
        client_name: "CASH_REGISTER_SYNCED_STATE",
        client_phone: "CASH_REGISTER",
        items: state as any,
        total_value: 0,
        is_budget: true,
        operation_cost: 0,
        balance_due: 0,
        net_profit: 0,
        discount: 0,
        down_payment: 0,
        motoboy_cost: 0,
        date: nowISO
      });

      // Upsert to both owner-scoped, caller-scoped, and legacy canonical rows
      const upsertPromises: any[] = [
        supabase.from("sales").upsert(createPayload(`cash_register_state_${canonicalOwnerId}`, canonicalOwnerId)),
        supabase.from("sales").upsert(createPayload(`cash_register_state_${userId}`, userId)),
        supabase.from("sales").upsert(createPayload("cash_register_state", canonicalOwnerId))
      ];

      // Synchronize auxiliary fluxo_caixa table if present
      if (state.currentSession && state.currentSession.status === "aberto") {
        const isUUID = typeof state.currentSession.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state.currentSession.id);
        if (isUUID) {
          upsertPromises.push(
            supabase.from("sessoes_caixa").upsert({
              id: state.currentSession.id,
              empresa_id: canonicalOwnerId,
              status: "aberto",
              valor_abertura: state.currentSession.valorAbertura || 0,
              data_abertura: state.currentSession.dataAbertura || nowISO
            })
          );
        }
      } else if (!state.currentSession) {
        upsertPromises.push(
          supabase.from("sessoes_caixa").update({
            status: "fechado",
            data_fechamento: nowISO
          }).or("status.ilike.%abert%,status.ilike.%ativ%,data_fechamento.is.null")
        );
      }

      const results = await Promise.allSettled(upsertPromises);
      for (const r of results) {
        if (r.status === "fulfilled" && (r.value as any)?.error) {
          console.warn("[/api/cash-register POST] Upsert notice:", (r.value as any).error.message || (r.value as any).error);
        }
      }

      // Broadcast instant cash register change across all company devices
      broadcastSyncEvent(canonicalOwnerId, "cash_register_updated", { state });
      broadcastSyncEvent(userId, "cash_register_updated", { state });
      broadcastSyncEvent("global", "cash_register_updated", { state });

      return res.json({ success: true, date: nowISO });
    } catch (err: any) {
      console.error("[Server POST /api/cash-register Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cash-register", async (req, res) => {
    try {
      const userId = (req.query.userId as string) || "";
      if (!userId) {
        return res.status(400).json({ error: "userId é obrigatório" });
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return res.json({ success: true, data: null });
      }

      const { canonicalOwnerId, companyUserIds } = await resolveCompanyScope(supabase, userId);

      // Query all candidate rows for this company in sales table
      const idsToCheck = Array.from(new Set([
        `cash_register_state_${canonicalOwnerId}`,
        `cash_register_state_${userId}`,
        "cash_register_state"
      ]));

      const { data: rows } = await supabase
        .from("sales")
        .select("id, user_id, items, date")
        .in("id", idsToCheck);

      // Also query rows where client_name = 'CASH_REGISTER_SYNCED_STATE'
      const { data: syncedRows } = await supabase
        .from("sales")
        .select("id, user_id, items, date")
        .eq("client_name", "CASH_REGISTER_SYNCED_STATE")
        .in("user_id", companyUserIds)
        .order("date", { ascending: false })
        .limit(10);

      const allCandidates = [...(rows || []), ...(syncedRows || [])];

      // Parse items safely if stored as JSON string
      const parsedCandidates = allCandidates.map((r: any) => {
        let itemsObj = r.items;
        if (typeof itemsObj === "string") {
          try { itemsObj = JSON.parse(itemsObj); } catch (e) {}
        }
        return {
          id: r.id,
          date: r.date,
          state: itemsObj as any
        };
      }).filter(c => c.state && typeof c.state === "object");

      // 0. TOP PRIORITY: Real table sessoes_caixa check
      try {
        const { data: sessRows } = await supabase
          .from("sessoes_caixa")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10);

        if (sessRows && sessRows.length > 0) {
          const openSess = sessRows.find((s: any) => {
            const st = String(s.status || s.situacao || "").toLowerCase().trim();
            if (st === "fechado" || st === "fechada" || st === "closed" || st === "encerrado" || st === "encerrada") return false;
            if (st.includes("abert") || st.includes("ativ") || st.includes("open") || s.aberto === true) return true;
            return !s.data_fechamento && !s.fechado_em;
          });

          if (openSess) {
            let histItems: any[] = [];
            try {
              const { data: hRows } = await supabase
                .from("historico_caixas")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50);
              if (hRows && hRows.length > 0) {
                histItems = hRows.map((h: any) => ({
                  id: h.session_id || h.id,
                  status: "fechado",
                  valorAbertura: Number(h.valor_abertura ?? h.valor_inicial ?? h.fundo_troco) || 0,
                  dataAbertura: h.data_abertura || h.created_at,
                  operador: h.operador || "Operador",
                  dataFechamento: h.data_fechamento || h.created_at,
                  valorFechamentoReal: Number(h.valor_fechamento_real) || 0,
                  valorFechamentoEsperado: Number(h.valor_fechamento_esperado) || 0,
                  observacoes: h.observacoes || ""
                }));
              }
            } catch (hErr) {}

            const reconstructedState = {
              currentSession: {
                id: openSess.id || openSess.session_id || `session_${Date.now()}`,
                status: "aberto",
                valorAbertura: Number(openSess.valor_abertura ?? openSess.valor_inicial ?? openSess.fundo_troco) || 0,
                dataAbertura: openSess.data_abertura || openSess.created_at || new Date().toISOString(),
                operador: openSess.operador || openSess.usuario || "Operador"
              },
              history: histItems.length > 0 ? histItems : (parsedCandidates[0]?.state?.history || [])
            };
            return res.json({ success: true, data: reconstructedState, date: openSess.data_abertura || openSess.created_at });
          }
        }
      } catch (sessErr) {
        console.warn("[/api/cash-register GET] sessoes_caixa check notice:", sessErr);
      }

      // 1. TOP PRIORITY: If ANY candidate row has an active OPEN session, that MUST take precedence!
      const openCandidate = parsedCandidates.find(
        (c) => c.state?.currentSession && c.state.currentSession.status === "aberto"
      );

      if (openCandidate) {
        return res.json({ success: true, data: openCandidate.state, date: openCandidate.date });
      }

      // 2. Auxiliary table check: fluxo_caixa for today
      try {
        const todayStr = new Date().toISOString().split("T")[0];
        const { data: fcRow } = await supabase
          .from("fluxo_caixa")
          .select("*")
          .in("user_id", companyUserIds)
          .eq("data", todayStr)
          .eq("status", "aberto")
          .maybeSingle();

        if (fcRow) {
          // Open session active in fluxo_caixa! Return reconstructed open state
          const reconstructedState = {
            currentSession: {
              id: fcRow.session_id || `session_fc_${todayStr}`,
              status: "aberto",
              valorAbertura: Number(fcRow.valor_abertura) || 0,
              dataAbertura: fcRow.data_abertura || new Date().toISOString(),
              operador: fcRow.operador || "Operador"
            },
            history: (parsedCandidates[0]?.state?.history) || []
          };
          return res.json({ success: true, data: reconstructedState, date: fcRow.updated_at });
        }
      } catch (fcErr) {
        // Continue
      }

      // 3. If no open session anywhere, return the most recent closed state
      if (parsedCandidates.length > 0) {
        parsedCandidates.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        return res.json({ success: true, data: parsedCandidates[0].state, date: parsedCandidates[0].date });
      }

      return res.json({ success: true, data: null });
    } catch (err: any) {
      console.error("[Server GET /api/cash-register Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      // Se for uma requisição de ativos com extensão (como .js, .css, .png, etc.) ou na pasta de assets, não serve index.html, retorna 404
      if (req.path.includes('.') || req.path.startsWith('/assets/')) {
        return res.status(404).end();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Não inicia listener HTTP se estiver rodando em ambiente Serverless da Vercel
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
