import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle OPTIONS requests for CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { 
      status: 405,
      headers: corsHeaders 
    });
  }

  try {
    const body = await req.json();
    console.log("[Asaas Webhook] Webhook payload recebido:", JSON.stringify(body, null, 2));

    const { event, payment } = body;

    // Validação de segurança via Token do Asaas (ASAAS_WEBHOOK_SECRET)
    const tokenAsaas = req.headers.get("asaas-access-token");
    const secret = Deno.env.get("ASAAS_WEBHOOK_SECRET");
    if (secret && tokenAsaas && tokenAsaas !== secret) {
      console.warn(`[Asaas Webhook] Token enviado ("${tokenAsaas}") não confere com ASAAS_WEBHOOK_SECRET.`);
      return new Response(JSON.stringify({ error: "Não autorizado" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!payment) {
      console.error("[Asaas Webhook] Dados de pagamento ausentes na requisição.");
      return new Response(JSON.stringify({ received: true, message: "Sem dados de pagamento" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseKey) {
      console.error("[Asaas Webhook] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente na Edge Function.");
      return new Response(JSON.stringify({ error: "Configuração do Supabase ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const isConfirmed = 
      event === "PAYMENT_RECEIVED" || 
      event === "PAYMENT_CONFIRMED" ||
      event === "PAYMENT_CREDITED" ||
      payment.status === "RECEIVED" ||
      payment.status === "CONFIRMED";

    const isOverdueOrDeleted = 
      event === "PAYMENT_OVERDUE" || 
      event === "PAYMENT_DELETED" || 
      event === "PAYMENT_REFUNDED";

    let usuarioIdNoSupabase = payment.externalReference || body.externalReference;
    const clienteIdNoAsaas = payment.customer;

    // Se externalReference não veio no pagamento, tenta localizar pelo customer ID do Asaas
    if (!usuarioIdNoSupabase && clienteIdNoAsaas) {
      try {
        const { data: userByCust } = await supabase
          .from("users")
          .select("id")
          .eq("asaas_customer_id", clienteIdNoAsaas)
          .maybeSingle();

        if (userByCust?.id) {
          usuarioIdNoSupabase = userByCust.id;
        } else {
          const { data: assByCust } = await supabase
            .from("assinaturas")
            .select("user_id")
            .eq("asaas_customer_id", clienteIdNoAsaas)
            .maybeSingle();
          if (assByCust?.user_id) {
            usuarioIdNoSupabase = assByCust.user_id;
          }
        }
      } catch (findErr) {
        console.warn("[Asaas Webhook] Falha na busca por clienteIdNoAsaas:", findErr);
      }
    }

    if (!usuarioIdNoSupabase) {
      console.warn("[Asaas Webhook] externalReference / ID do usuário não encontrado para o pagamento:", payment.id);
      return new Response(JSON.stringify({ received: true, warning: "Usuário não identificado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Calcula período de 30 dias de acesso a partir de agora
    const trialEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    if (isConfirmed) {
      console.log(`[Asaas Webhook] Pagamento confirmado! Liberando acesso para usuário ${usuarioIdNoSupabase} até ${trialEndDate}`);

      // 1. Atualiza/Cria registro na tabela 'assinaturas' com status 'ativo' e trial_end > data atual
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

        if (assError) {
          console.warn("[Asaas Webhook] Erro ao gravar em assinaturas:", assError.message);
        } else {
          console.log("[Asaas Webhook] Tabela 'assinaturas' atualizada com sucesso (status: 'ativo')!");
        }
      } catch (assEx: any) {
        console.warn("[Asaas Webhook] Exceção na tabela assinaturas:", assEx?.message);
      }

      // 2. Atualiza tabela 'users' (gatilho para Supabase Realtime)
      try {
        const { error: userError } = await supabase
          .from("users")
          .update({
            status: "ATIVO",
            status_assinatura: "ativo",
            trial_end: trialEndDate,
            asaas_customer_id: clienteIdNoAsaas,
            updated_at: new Date().toISOString()
          })
          .eq("id", usuarioIdNoSupabase);

        if (userError) {
          console.warn("[Asaas Webhook] Falha ao atualizar 'users', tentando status_assinatura...", userError.message);
          await supabase.from("users").update({ status: "ATIVO", trial_end: trialEndDate }).eq("id", usuarioIdNoSupabase);
        } else {
          console.log("[Asaas Webhook] Tabela 'users' atualizada para 'ATIVO'!");
        }
      } catch (userEx: any) {
        console.warn("[Asaas Webhook] Exceção ao atualizar 'users':", userEx?.message);
      }

      // 3. Atualiza tabela 'usuarios' caso exista
      try {
        await supabase
          .from("usuarios")
          .update({
            status: "ativo",
            updated_at: new Date().toISOString()
          })
          .eq("id", usuarioIdNoSupabase);
      } catch (_) {}

      // 4. Atualiza tabela 'profiles' para compatibilidade
      try {
        await supabase
          .from("profiles")
          .update({
            status: "ATIVO",
            status_assinatura: "ativo",
            trial_end: trialEndDate,
            asaas_customer_id: clienteIdNoAsaas,
            updated_at: new Date().toISOString()
          })
          .eq("id", usuarioIdNoSupabase);
      } catch (_) {}

      return new Response(JSON.stringify({ 
        received: true, 
        success: true, 
        userId: usuarioIdNoSupabase, 
        status: "ativo", 
        trial_end: trialEndDate 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (isOverdueOrDeleted) {
      console.log(`[Asaas Webhook] Cobrança expirada/cancelada para o usuário: ${usuarioIdNoSupabase}`);
      try {
        await supabase
          .from("assinaturas")
          .update({ status: "expirado", updated_at: new Date().toISOString() })
          .eq("user_id", usuarioIdNoSupabase);

        await supabase
          .from("users")
          .update({ status: "expirado", status_assinatura: "expirado", updated_at: new Date().toISOString() })
          .eq("id", usuarioIdNoSupabase);
      } catch (e: any) {
        console.warn("[Asaas Webhook] Aviso ao expirar usuário:", e?.message);
      }
    }

    return new Response(JSON.stringify({ received: true, event }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("[Asaas Webhook] Erro crítico:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
