# Documento de Requisitos de Produto (PRD)

**Nome do Produto:** Remix — Sistema de Gestão de Vendas, PDV e Emissão de Recibos em PDF  
**Versão:** 2.4.0  
**Data:** Setembro de 2026  
**Status do Projeto:** Em Produção / Estável  
**Classificação:** Confidencial / Documento Técnico e Operacional  

---

## 1. Visão Geral do Produto

### 1.1 Declaração do Problema
Pequenas e médias empresas do varejo, gráficas rápidas, oficinas, assistências técnicas e prestadores de serviços enfrentam gargalos no atendimento presencial:
1. **Lentidão no Atendimento:** Sistemas legados lentos ou cadernos manuais que atrasam a fila do caixa.
2. **Falta de Clareza no Lucro Real:** Dificuldade em calcular na hora o custo dos materiais, insumos e fretes, vendendo muitas vezes com prejuízo ou margem irrisória.
3. **Inadimplência de Serviços Sob Encomenda:** Pedidos iniciados sem entrada (sinal) ou entregues antes do pagamento total do saldo remanescente.
4. **Falta de Comprovantes Profissionais:** Recibos improvisados em papel ou mensagens manuais sem valor institucional.

### 1.2 Proposta de Solução
O **Remix** é uma plataforma integrada de Frente de Caixa (PDV), controle de ordens de serviço, precificação em tempo real com apuração de margem líquida, leitor óptico de despesas fiscais assistido por IA e gerador automatizado de comprovantes térmicos e PDF com envio direto via WhatsApp.

---

## 2. Perfis de Usuários (Personas) & Controle de Acesso (RBAC)

### 2.1 Personas
1. **Proprietário / Administrador Geral:**
   - Visualiza faturamento bruto, custos operacionais, margem líquida consolidada e DRE.
   - Cadastra colaboradores, define comissões e controla metas semanais e mensais.
   - Autoriza estornos, descontos críticos e exclusões através de senha mestra.
2. **Atendente de Balcão / Operador de Caixa:**
   - Realiza abertura de caixa com fundo de troco, registra vendas de balcão e encomendas.
   - Consulta histórico de clientes, anexa fotos dos serviços e emite recibos térmicos ou PDF.
   - Registra baixas de pagamentos parciais de encomendas no momento da retirada.
3. **Entregador / Logística (Motoboy):**
   - Acessa a lista de pedidos com entrega pendente, endereços, telefones e valores a receber.
4. **Contabilidade / Auditoria:**
   - Extrai relatórios por período, conciliação por método de pagamento (Dinheiro, Cartão, Pix) e logs de auditoria.

### 2.2 Matriz de Permissões

| Recurso / Módulo | Super Admin | Administrador | Atendente / Caixa | Motoboy |
| :--- | :---: | :---: | :---: | :---: |
| Abertura e Fechamento de Caixa | Sim | Sim | Sim | Não |
| Lançamento de Vendas e PDV | Sim | Sim | Sim | Não |
| Emissão e Reimpressão de Recibos | Sim | Sim | Sim | Leitura |
| Baixa de Saldo Devedor (Retiradas) | Sim | Sim | Sim | Não |
| Consulta de Lucro Líquido Global | Sim | Sim | Oculto | Oculto |
| Cadastro e Edição de Produtos | Sim | Sim | Apenas Consulta | Não |
| Lançamento e Gestão de Despesas | Sim | Sim | Não | Não |
| Exclusão com Justificativa | Sim | Requer Senha | Bloqueado | Bloqueado |
| Gestão de Mensalistas e Licenças | Sim | Não | Não | Não |

---

## 3. Requisitos Funcionais Detalhados

### 3.1 Módulo: Frente de Caixa (PDV) e Nova Venda
- **RF-01: Inserção Múltipla de Itens:** Possibilidade de adicionar múltiplos itens por venda com descrição, quantidade, valor unitário de venda e custo unitário de aquisição.
- **RF-02: Dinâmica Financeira da Venda:**
  - Aplicação de desconto global em valor (R$).
  - Entrada/Sinal pago no ato (`downPayment`).
  - Cálculo automático de saldo devedor restante (`balanceDue = totalValue - downPayment`).
  - Lançamento de custos operacionais extras (`operationCost`).
  - Exibição de lucro líquido em tempo real (`netProfit = totalValue - operationCost`).
- **RF-03: Logística e Entrega via Motoboy:** Opção de marcar entrega por motoboy com acréscimo de taxa de entrega e campos para taxa do motoboy e repasse.
- **RF-04: Anexos e Imagens da Ordem de Serviço:** Captura via câmera do dispositivo ou upload de arquivos de arte, referência visual ou foto do produto/serviço.
- **RF-05: Seleção e Cadastro de Clientes:** Busca de clientes existentes por nome, telefone ou documento, além de cadastro simplificado em tempo real.
- **RF-06: Venda Rápida de Balcão:** Modo ágil para transações simples com finalização em até 2 cliques.

### 3.2 Módulo: Emissão de Recibos e Documentos
- **RF-07: Recibo em PDF Profissional:** Geração instantânea de comprovante contendo logotipo customizado, dados cadastrais da empresa (CNPJ, Razão Social, Contato), identificação do cliente, tabela de itens, totalização, forma de pagamento, saldo devedor e Chave Pix para quitação.
- **RF-08: Layout Térmico:** Formatação responsiva compatível com bobinas térmicas de 80mm e 58mm.
- **RF-09: Integração WhatsApp:** Disparo de mensagem personalizada com link ou dados do pedido diretamente para o número do cliente sem necessidade de adicionar à agenda.

### 3.3 Módulo: Controle de Sessão de Caixa
- **RF-10: Abertura Obrigatória de Caixa:** Exigência de abertura formal do caixa com registro de operador, data/hora e valor inicial de fundo de troco.
- **RF-11: Trava de Segurança (ClosedRegisterGate):** Bloqueio automático de novas vendas caso o caixa do operador esteja fechado.
- **RF-12: Fechamento com Conferência Cega:** Comparação entre os valores registrados pelo sistema em cada modalidade (Dinheiro, Cartão, Pix) e a contagem real informada pelo operador, registrando eventuais sobras ou faltas.
- **RF-13: Lembrete Automático de Fechamento:** Notificações visuais e sonoras avisando o operador sobre o horário de encerramento do expediente.

### 3.4 Módulo: Pedidos Pendentes e Retiradas
- **RF-14: Gestão de Saldo Devedor:** Listagem filtrável de pedidos com entrega pendente ou com saldo a receber.
- **RF-15: Baixa de Pagamento Parcial/Total:** Quitação de saldos com seleção do método de pagamento e atualização imediata do fluxo de caixa.
- **RF-16: Conclusão de Entrega:** Registro de entrega com timestamp e nome do atendente que efetuou a entrega física do produto.

### 3.5 Módulo: Controle Financeiro, Despesas e Metas
- **RF-17: Cadastro de Despesas:** Classificação por categorias (Insumos, Aluguel, Utilidades, Folha de Pagamento, Manutenção), com anexo do comprovante de pagamento.
- **RF-18: Metas Financeiras Diárias, Semanais e Mensais:** Painel com termômetro de faturamento, cálculo de valor restante para atingir o objetivo e porcentagem de progresso.
- **RF-19: DRE Simplificado:** Apuração de Receita Bruta, Deduções/Descontos, Custos de Mercadorias/Serviços (CPV/CSV), Despesas Operacionais e Resultado Líquido.

### 3.6 Módulo: Inteligência Artificial (Google Gemini)
- **RF-20: Leitor de Cupom Fiscal e Recibos:** Extração automatizada via visão computacional do fornecedor, data, valor total e itens descritos em notas fiscais anexadas.
- **RF-21: Sugestões e Otimizações:** Classificação automática de despesas e sugestão de precificação baseada nos custos operacionais históricos.

### 3.7 Módulo: Auditoria e Segurança
- **RF-22: Trilha de Auditoria (Audit Log):** Gravação permanente de cancelamentos, exclusões e edições retroativas, registrando o operador, horário, justificativa textual e valores originais.
- **RF-23: Desbloqueio Administrativo:** Modais com autorização de PIN/Senha para ações restritas a gerentes.
- **RF-24: Modo Standby (Privacidade do Balcão):** Bloqueio instantâneo da tela em momentos de ausência temporária do atendente.

### 3.8 Módulo: Licenciamento e Assinaturas (SaaS)
- **RF-25: Cobrança Integrada via Pix (Asaas):** Geração dinâmica de cobrança Pix com QR Code e Copia e Cola, com webhook de confirmação automática.
- **RF-26: Cobrança via Cartão (Stripe):** Checkout seguro para assinaturas e pagamentos com cartões de crédito.
- **RF-27: Controle de Trial e Período de Testes:** Sistema de contagem regressiva de dias restantes e bloqueio elegante para renovação.

---

## 4. Requisitos Não-Funcionais

- **RNF-01 (Performance):** Renderização inicial da interface em menos de 1,5 segundos; busca de produtos e clientes com resposta em menos de 50ms.
- **RNF-02 (Confiabilidade e Resiliência):** Sincronização em nuvem via Supabase com contingência de armazenamento local (`localStorage`) para prevenir perda de digitação em caso de queda transitória de conexão.
- **RNF-03 (Segurança):** Autenticação robusta, criptografia HTTPS ponta a ponta e chaves secretas de APIs mantidas exclusivamente no backend Node.js.
- **RNF-04 (Compatibilidade de Dispositivos):** Design responsivo para desktops (1920x1080, 1366x768), tablets e telas de smartphones.
- **RNF-05 (Usabilidade):** Suporte a atalhos rápidos de teclado para agilizar o fluxo de atendimento em balcão.

---

## 5. Estrutura de Dados e Entidades Principais

```typescript
// Entidade de Venda
interface Sale {
  id: string;
  clientName: string;
  clientPhone?: string;
  clientCpfCnpj?: string;
  items: SaleItem[];
  totalValue: number;
  operationCost: number;
  netProfit: number;
  downPayment: number;
  balanceDue: number;
  paymentMethod: 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'fiado';
  status: 'pendente' | 'em_producao' | 'pronto' | 'entregue' | 'cancelado';
  isMotoboyDelivery: boolean;
  motoboyCost?: number;
  photoUrl?: string;
  sellerName: string;
  sellerId?: string;
  createdAt: string;
  companyId: string;
}

// Entidade de Sessão de Caixa
interface CashRegisterSession {
  id: string;
  operatorId: string;
  operatorName: string;
  openedAt: string;
  closedAt?: string;
  initialAmount: number;
  expectedAmount?: number;
  reportedAmount?: number;
  difference?: number;
  status: 'open' | 'closed';
}

// Entidade de Despesa
interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  receiptUrl?: string;
  date: string;
  companyId: string;
}
```

---

## 6. Fluxos de Operação (Workflows)

### 6.1 Fluxo de Atendimento e Pedido com Sinal
1. Atendente pesquisa ou cadastra o cliente.
2. Adiciona os itens negociados e informa o custo operacional.
3. Se houver entrega, marca a opção de motoboy e endereço.
4. Informa o valor de entrada (sinal) pago pelo cliente via Pix/Cartão/Dinheiro.
5. O sistema registra a venda e gera o comprovante com o saldo restante destacado.
6. O comprovante é impresso ou enviado no WhatsApp do cliente com a Chave Pix da empresa.
7. Quando o material fica pronto, o cliente retorna, quita o saldo devedor, o atendente dá baixa e finaliza o pedido.

### 6.2 Fluxo de Fechamento Diário de Caixa
1. Ao término do expediente, o operador clica em **Fechar Caixa**.
2. O sistema exibe o sumário das operações do dia.
3. O operador digita o montante em espécie contado na gaveta e os totais de cartão.
4. O sistema gera o relatório de conferência e salva a sessão arquivada.

---

## 7. Critérios de Aceite e Métricas de Sucesso (KPIs)
- Redução de pelo menos 60% no tempo despendido em emissão de comprovantes.
- Redução a zero de pedidos extraviados ou entregues sem o recebimento do saldo devedor.
- Precisão de 100% na conciliação dos turnos de caixa.
