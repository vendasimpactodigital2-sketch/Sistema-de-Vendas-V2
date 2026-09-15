import React, { useState, useEffect, useMemo } from "react";
import {
  ShoppingCart,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  User as UserIcon,
  CreditCard,
  QrCode,
  Banknote,
  Percent,
  Receipt,
  RotateCcw,
  Search,
  ShieldAlert,
  Loader2
} from "lucide-react";
import { getSupabase } from "../supabase";

// Tipos baseados na modelagem física do banco
export type FormaPagamento = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "a_prazo";

export interface ItemCarrinho {
  id: string;
  descricao: string;
  quantidade: number;
  precoUnitario: number;
  custoUnitario?: number;
  subtotal: number;
}

export interface SessaoCaixaAtiva {
  id: string;
  empresa_id: string;
  status: "aberto" | "fechado";
  valor_abertura: number;
  data_abertura: string;
  aberto_por_usuario_id: string;
  operador_nome?: string;
}

export interface FrenteCaixaPDVProps {
  empresaId: string;
  atendenteId: string;
  atendenteNome: string;
  onVendaConcluida?: (transacaoId: string) => void;
  onSolicitarAberturaCaixa?: () => void;
}

export const FrenteCaixaPDV: React.FC<FrenteCaixaPDVProps> = ({
  empresaId,
  atendenteId,
  atendenteNome,
  onVendaConcluida,
  onSolicitarAberturaCaixa,
}) => {
  const supabase = getSupabase();

  // Estados da Sessão e Caixa
  const [sessaoAtiva, setSessaoAtiva] = useState<SessaoCaixaAtiva | null>(null);
  const [carregandoSessao, setCarregandoSessao] = useState<boolean>(true);

  // Estados da Venda
  const [clienteNome, setClienteNome] = useState<string>("Consumidor Final");
  const [clienteDocumento, setClienteDocumento] = useState<string>("");
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("dinheiro");
  const [desconto, setDesconto] = useState<number>(0);
  const [valorRecebidoDinheiro, setValorRecebidoDinheiro] = useState<number>(0);

  // Estados do Input de Item Rápido
  const [itemDescricao, setItemDescricao] = useState<string>("");
  const [itemQtd, setItemQtd] = useState<number>(1);
  const [itemPreco, setItemPreco] = useState<number>(0);

  // Estados de Processamento e Feedback
  const [processandoVenda, setProcessandoVenda] = useState<boolean>(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [vendaSucessoId, setVendaSucessoId] = useState<string | null>(null);

  // ============================================================================
  // 1. CARREGAR E SINCRONIZAR SESSÃO DE CAIXA EM TEMPO REAL
  // ============================================================================
  const buscarSessaoCaixaAtiva = async () => {
    if (!supabase) return;
    setCarregandoSessao(true);
    setMensagemErro(null);

    try {
      const { data, error } = await supabase
        .from("sessoes_caixa")
        .select(`
          id,
          empresa_id,
          status,
          valor_abertura,
          data_abertura,
          aberto_por_usuario_id,
          usuarios!sessoes_caixa_aberto_por_usuario_id_fkey (nome)
        `)
        .eq("empresa_id", empresaId)
        .eq("status", "aberto")
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Erro ao consultar sessão de caixa:", error);
      }

      if (data) {
        setSessaoAtiva({
          id: data.id,
          empresa_id: data.empresa_id,
          status: data.status,
          valor_abertura: Number(data.valor_abertura) || 0,
          data_abertura: data.data_abertura,
          aberto_por_usuario_id: data.aberto_por_usuario_id,
          operador_nome: (data as any)?.usuarios?.nome || "Operador",
        });
      } else {
        setSessaoAtiva(null);
      }
    } catch (err: any) {
      console.error("Falha ao checar caixa:", err);
    } finally {
      setCarregandoSessao(false);
    }
  };

  useEffect(() => {
    buscarSessaoCaixaAtiva();

    // Inscrição em tempo real para abertura/fechamento do caixa compartilhado
    if (!supabase) return;
    const canal = supabase
      .channel(`caixa_status_${empresaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessoes_caixa",
          filter: `empresa_id=eq.${empresaId}`,
        },
        () => {
          buscarSessaoCaixaAtiva();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [empresaId]);

  // ============================================================================
  // 2. CÁLCULOS FINANCEIROS
  // ============================================================================
  const valorTotalBruto = useMemo(() => {
    return itens.reduce((acc, curr) => acc + curr.subtotal, 0);
  }, [itens]);

  const valorLiquido = useMemo(() => {
    const liq = valorTotalBruto - (Number(desconto) || 0);
    return liq > 0 ? liq : 0;
  }, [valorTotalBruto, desconto]);

  const trocoCalculado = useMemo(() => {
    if (formaPagamento !== "dinheiro") return 0;
    const troco = valorRecebidoDinheiro - valorLiquido;
    return troco > 0 ? troco : 0;
  }, [formaPagamento, valorRecebidoDinheiro, valorLiquido]);

  // ============================================================================
  // 3. MANIPULAÇÃO DO CARRINHO
  // ============================================================================
  const adicionarItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!itemDescricao.trim()) {
      setMensagemErro("Informe o nome ou código do produto.");
      return;
    }
    if (itemPreco <= 0) {
      setMensagemErro("O preço do item deve ser maior que R$ 0,00.");
      return;
    }
    if (itemQtd <= 0) {
      setMensagemErro("A quantidade deve ser de pelo menos 1 item.");
      return;
    }

    const novoItem: ItemCarrinho = {
      id: crypto.randomUUID(),
      descricao: itemDescricao.trim(),
      quantidade: itemQtd,
      precoUnitario: itemPreco,
      subtotal: itemQtd * itemPreco,
    };

    setItens((prev) => [...prev, novoItem]);
    setItemDescricao("");
    setItemQtd(1);
    setItemPreco(0);
    setMensagemErro(null);
  };

  const removerItem = (id: string) => {
    setItens((prev) => prev.filter((i) => i.id !== id));
  };

  const limparCarrinho = () => {
    setItens([]);
    setDesconto(0);
    setValorRecebidoDinheiro(0);
    setClienteNome("Consumidor Final");
    setClienteDocumento("");
    setMensagemErro(null);
    setVendaSucessoId(null);
  };

  // ============================================================================
  // 4. FECHAR VENDA / GRAVAÇÃO NO SUPABASE
  // ============================================================================
  const handleFecharVenda = async () => {
    setMensagemErro(null);

    // Validação preventiva no cliente
    if (!sessaoAtiva || sessaoAtiva.status !== "aberto") {
      setMensagemErro("O Caixa Geral está FECHADO. Abra o caixa para permitir transações de toda a equipe.");
      return;
    }

    if (itens.length === 0) {
      setMensagemErro("Adicione ao menos um item ao carrinho antes de fechar a venda.");
      return;
    }

    if (!supabase) {
      setMensagemErro("Cliente Supabase não está configurado.");
      return;
    }

    setProcessandoVenda(true);

    try {
      // 1. Grava a Transação Principal (vinculada ao atendente_id e à sessao_caixa_id)
      const { data: transacaoGravada, error: transacaoError } = await supabase
        .from("transacoes")
        .insert({
          empresa_id: empresaId,
          sessao_caixa_id: sessaoAtiva.id,
          atendente_id: atendenteId,
          cliente_nome: clienteNome.trim() || "Consumidor Final",
          cliente_documento: clienteDocumento.trim() || null,
          tipo: "venda",
          forma_pagamento: formaPagamento,
          valor_total: valorTotalBruto,
          desconto: desconto || 0.0,
          valor_liquido: valorLiquido,
          percentual_comissao: 0.0,
        })
        .select("id")
        .single();

      // Tratamento da Trigger Postgres 'validar_caixa_aberto()'
      if (transacaoError) {
        if (transacaoError.message?.toLowerCase().includes("caixa") || transacaoError.code === "P0001") {
          throw new Error("Operação Rejeitada pelo Banco: O caixa da loja não está aberto.");
        }
        throw new Error(transacaoError.message || "Erro ao registrar transação no banco.");
      }

      const transacaoId = transacaoGravada.id;

      // 2. Grava os itens individuais da transação
      const itensParaInserir = itens.map((item) => ({
        transacao_id: transacaoId,
        descricao: item.descricao,
        quantidade: item.quantidade,
        preco_unitario: item.precoUnitario,
        custo_unitario: item.custoUnitario || 0.0,
        subtotal: item.subtotal,
      }));

      const { error: itensError } = await supabase
        .from("itens_transacao")
        .insert(itensParaInserir);

      if (itensError) {
        console.error("Aviso ao inserir itens:", itensError);
      }

      // Sucesso Total
      setVendaSucessoId(transacaoId);
      if (onVendaConcluida) {
        onVendaConcluida(transacaoId);
      }
    } catch (err: any) {
      console.error("Falha ao fechar venda:", err);
      setMensagemErro(err.message || "Não foi possível finalizar a venda.");
    } finally {
      setProcessandoVenda(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 space-y-4 font-sans text-slate-100">
      {/* ====================================================================== */}
      {/* BARRA SUPERIOR: STATUS DO CAIXA E IDENTIFICAÇÃO DO ATENDENTE */}
      {/* ====================================================================== */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg border ${
            sessaoAtiva
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
          }`}>
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-wide uppercase text-white">
                Frente de Caixa (PDV)
              </h1>
              {carregandoSessao ? (
                <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                  <Loader2 className="h-3 w-3 animate-spin" /> Verificando...
                </span>
              ) : sessaoAtiva ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  CAIXA COMPARTILHADO ABERTO
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400"></span>
                  CAIXA FECHADO
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {sessaoAtiva
                ? `Aberto por ${sessaoAtiva.operador_nome} com troco inicial de R$ ${sessaoAtiva.valor_abertura.toFixed(2)}`
                : "Nenhuma sessão ativa. Abertura necessária para registrar vendas."}
            </p>
          </div>
        </div>

        {/* Informações do Atendente Logado */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Atendente Atual
            </span>
            <span className="text-xs font-bold text-cyan-300 font-mono">
              👤 {atendenteNome}
            </span>
          </div>
          {!sessaoAtiva && onSolicitarAberturaCaixa && (
            <button
              type="button"
              onClick={onSolicitarAberturaCaixa}
              className="px-3.5 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md cursor-pointer flex items-center gap-2"
            >
              <Wallet className="h-4 w-4" />
              <span>Abrir Caixa Geral</span>
            </button>
          )}
        </div>
      </div>

      {/* ALERTA DE CAIXA FECHADO */}
      {!carregandoSessao && !sessaoAtiva && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-start gap-3 text-amber-200">
          <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <strong className="block text-amber-300 font-bold mb-0.5">
              Atenção: A Trigger de Segurança impedirá qualquer venda enquanto o caixa estiver fechado.
            </strong>
            Basta qualquer operador ou o administrador abrir o caixa para liberar imediatamente a operação de todos os atendentes.
          </div>
        </div>
      )}

      {/* MENSAGEM DE ERRO/ALERTA */}
      {mensagemErro && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-center justify-between gap-3 text-rose-200 animate-fade-in">
          <div className="flex items-center gap-2 text-xs font-medium">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{mensagemErro}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensagemErro(null)}
            className="text-xs text-rose-400 hover:text-rose-200 underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* ====================================================================== */}
      {/* GRID PRINCIPAL: FORMULÁRIO DE PRODUTO + CARRINHO + PAGAMENTO */}
      {/* ====================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* COLUNA ESQUERDA: INCLUSÃO DE PRODUTO & LISTA DO CARRINHO (7 Colunas) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Formulário de Adicionar Item */}
          <form
            onSubmit={adicionarItem}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="h-4 w-4 text-cyan-400" /> Adicionar Produto / Serviço
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                Pressione Enter para lançar
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Descrição / Código de Barras
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={itemDescricao}
                    onChange={(e) => setItemDescricao(e.target.value)}
                    placeholder="Ex: Cartão de Visita 1000un"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Quantidade
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={itemQtd}
                  onChange={(e) => setItemQtd(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Valor Unitário (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemPreco || ""}
                  onChange={(e) => setItemPreco(Number(e.target.value))}
                  placeholder="0,00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Inserir no Pedido</span>
              </button>
            </div>
          </form>

          {/* Lista de Itens do Pedido */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4 text-brand-magenta" /> Itens no Carrinho ({itens.length})
              </span>
              {itens.length > 0 && (
                <button
                  type="button"
                  onClick={limparCarrinho}
                  className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer font-mono"
                >
                  <RotateCcw className="h-3 w-3" /> Limpar Tudo
                </button>
              )}
            </div>

            {itens.length === 0 ? (
              <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-400" />
                <p className="text-xs">Nenhum produto adicionado nesta venda.</p>
                <p className="text-[10px] text-slate-600 mt-1">Utilize o campo acima para incluir produtos ou serviços.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800 font-mono text-[10px] uppercase">
                      <th className="pb-2">Descrição</th>
                      <th className="pb-2 text-center">Qtd</th>
                      <th className="pb-2 text-right">Unitário</th>
                      <th className="pb-2 text-right">Subtotal</th>
                      <th className="pb-2 text-center w-10">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {itens.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 text-slate-200 font-sans font-medium">{item.descricao}</td>
                        <td className="py-2.5 text-center text-slate-300">{item.quantidade}</td>
                        <td className="py-2.5 text-right text-slate-400">R$ {item.precoUnitario.toFixed(2)}</td>
                        <td className="py-2.5 text-right font-bold text-emerald-400">R$ {item.subtotal.toFixed(2)}</td>
                        <td className="py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removerItem(item.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Remover Item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: CLIENTE, FORMA DE PAGAMENTO & FECHAR VENDA (5 Colunas) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Identificação do Cliente */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <UserIcon className="h-4 w-4 text-cyan-400" /> Dados do Cliente
            </span>
            <div className="space-y-2.5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  placeholder="Consumidor Final"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  CPF / CNPJ (Opcional)
                </label>
                <input
                  type="text"
                  value={clienteDocumento}
                  onChange={(e) => setClienteDocumento(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Forma de Pagamento */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <CreditCard className="h-4 w-4 text-emerald-400" /> Forma de Pagamento
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: "dinheiro", label: "Dinheiro", icon: Banknote },
                { id: "pix", label: "PIX", icon: QrCode },
                { id: "cartao_credito", label: "Crédito", icon: CreditCard },
                { id: "cartao_debito", label: "Débito", icon: CreditCard },
                { id: "a_prazo", label: "A Prazo", icon: Receipt },
              ].map((p) => {
                const Icon = p.icon;
                const isSelected = formaPagamento === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFormaPagamento(p.id as FormaPagamento)}
                    className={`p-2.5 rounded-lg border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Se for dinheiro: campo para calcular troco */}
            {formaPagamento === "dinheiro" && (
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 mt-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Valor Recebido:</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={valorRecebidoDinheiro || ""}
                    onChange={(e) => setValorRecebidoDinheiro(Number(e.target.value))}
                    placeholder="0,00"
                    className="w-28 text-right bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                {valorRecebidoDinheiro > 0 && (
                  <div className="flex justify-between items-center text-xs border-t border-slate-800 pt-2 font-mono">
                    <span className="text-slate-400">Troco a Devolver:</span>
                    <span className="font-bold text-amber-400 text-sm">
                      R$ {trocoCalculado.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Resumo Financeiro e Fechamento */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal dos Itens:</span>
                <span>R$ {valorTotalBruto.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1">
                  <Percent className="h-3 w-3 text-slate-500" /> Desconto (R$):
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={desconto || ""}
                  onChange={(e) => setDesconto(Math.max(0, Number(e.target.value)))}
                  placeholder="0,00"
                  className="w-24 text-right bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="border-t border-slate-800 pt-3 flex justify-between items-baseline">
                <span className="text-sm font-black text-white uppercase tracking-wider">
                  Total Líquido:
                </span>
                <span className="text-2xl font-black text-emerald-400">
                  R$ {valorLiquido.toFixed(2)}
                </span>
              </div>
            </div>

            {/* BOTÃO PRINCIPAL: FECHAR VENDA */}
            <button
              type="button"
              disabled={processandoVenda || !sessaoAtiva || itens.length === 0}
              onClick={handleFecharVenda}
              className={`w-full py-3.5 px-4 rounded-xl font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer ${
                !sessaoAtiva || itens.length === 0
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30 hover:shadow-emerald-900/50"
              }`}
            >
              {processandoVenda ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Validando Caixa & Gravando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Finalizar & Fechar Venda</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE SUCESSO APÓS FECHAR VENDA */}
      {vendaSucessoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl space-y-4">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-wide">
                Venda Registrada com Sucesso!
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                A transação foi validada pela Trigger do banco e vinculada ao atendente <strong>{atendenteNome}</strong>.
              </p>
              <div className="mt-2 p-2 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-cyan-300">
                ID da Transação: {vendaSucessoId}
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={limparCarrinho}
                className="flex-1 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Próxima Venda (Novo PDV)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
