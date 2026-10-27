/**
 * Os Gastos como a API das AIs mostra (PLANO-API.md, 7.2 e 8; rodada 6): o lançamento, o envelope (a
 * categoria da tela), a pessoa, o vocabulário dos gastos e o mês pronto. Formato público e estável v1:
 * o site monta com as contas da própria tela (core/spending.ts) e manda ao espelho; a API só serve.
 * Valores sempre em centavos (inteiros). Só tipos e funções puras.
 */

export type TipoDoLancamentoV1 = 'saida' | 'entrada';
export type PagamentoV1 = 'avista' | 'pix' | 'parcelado';
export type PrecisavaV1 = 'luxo' | 'conforto' | 'indispensavel';

export interface LancamentoV1 {
  id: string;
  titulo: string;
  /** No parcelado, o valor de cada parcela; no mensal, o do primeiro mês. */
  centavos: number;
  tipo: TipoDoLancamentoV1;
  /** O envelope (categoria); null = um envelope que foi apagado ("Sem categoria"). */
  envelope: { id: string; nome: string } | null;
  /** Só nas saídas. */
  pagamento: PagamentoV1 | null;
  /** Parcelado: quantas parcelas. */
  parcelas: number | null;
  /** Só nas saídas: se precisava. */
  precisava: PrecisavaV1 | null;
  /** Só nas saídas: com quem foi, pelos nomes (você incluído, pelo seu nome nos Gastos). */
  pessoas: string[];
  /** O dia (no parcelado, o da primeira parcela; no mensal, o do primeiro mês). */
  dia: string;
  /** O primeiro mês em que conta (`AAAA-MM`): o do dia, ou o de antes/depois pela fatura. */
  mes: string;
  /** A fatura do cartão: conta no mês do dia (0), no de antes (-1) ou no de depois (1). */
  fatura: -1 | 0 | 1;
  /** Mensal (repete todo mês): até quando, os valores que mudaram e os meses pulados. */
  mensal: { ate: string | null; valores: Record<string, number>; pulados: string[] } | null;
  /** Entrada que paga de volta um gasto (o id do gasto). */
  reembolso_de: string | null;
  criado_em: string;
  /** A versão que se manda de volta ao editar ou apagar: muda a cada mudança do lançamento. */
  versao: string;
}

export interface EnvelopeV1 {
  id: string;
  nome: string;
  tipo: TipoDoLancamentoV1;
  /** A cartolina do envelope na tela. */
  cor: string;
  /** O limite do mês, só nas saídas. */
  limite_centavos: number | null;
  versao: string;
}

export interface PessoaV1 {
  id: string;
  nome: string;
  /** É você (a pessoa de todo gasto que não diz outra). */
  eu: boolean;
}

/** O vocabulário dos Gastos: os envelopes e as pessoas que existem (use estes nomes, não invente). */
export interface ContextoGastosV1 {
  envelopes: EnvelopeV1[];
  pessoas: PessoaV1[];
  /** Os meses com algum lançamento, do mais antigo ao mais novo. */
  meses: string[];
}

/** Uma linha do mês como a tela mostra (uma parcela, um mensal, um lançamento de uma vez só). */
export interface LinhaDoMesV1 {
  id: string;
  titulo: string;
  /** O dia de verdade (a compra de 3/10 que conta em setembro aparece em setembro com 3/10). */
  dia: string;
  centavos: number;
  tipo: TipoDoLancamentoV1;
  envelope: string | null;
  parcela: { n: number; de: number } | null;
  mensal: boolean;
}

/** O mês como o app mostra (a visão: feita pelo site, com as contas da tela). */
export interface MesV1 {
  mes: string;
  /** O que entrou (sem os reembolsos ligados a um gasto, que descontam do que saiu). */
  entradas: number;
  /** O que saiu, já sem o que voltou. */
  saidas: number;
  saldo: number;
  /** Do que saiu, o que já vinha de antes (mensais e parcelas depois da primeira). */
  comprometido: number;
  /** Quanto saiu em cada envelope, do maior para o menor, com o limite. */
  por_envelope: { id: string; nome: string; centavos: number; limite_centavos: number | null }[];
  /** O que entrou em cada envelope de entrada. */
  entradas_por_envelope: { id: string; nome: string; centavos: number }[];
  /** Precisava? Quanto saiu em cada resposta. */
  precisava: { luxo: number; conforto: number; indispensavel: number; sem_resposta: number };
  /** Quanto saiu com cada pessoa (cada gasto dividido em partes iguais). */
  por_pessoa: { nome: string; centavos: number }[];
  /** Os carnês abertos: a parcela deste mês, de quantas, quanto falta depois e o último mês. */
  carnes: { id: string; titulo: string; parcela: number; de: number; falta: number; ultimo_mes: string }[];
  /** As parcelas que ainda vêm depois deste mês. */
  parcelas_a_frente: { total: number; proximo_mes: number; ultimo_mes: string | null };
  linhas: LinhaDoMesV1[];
}

/** O id da linha de contexto dos Gastos (tipo `contexto-gastos`). */
export const CONTEXTO_GASTOS = 'gastos';
/** O id da visão de um mês (`gastos-2026-10`). */
export const visaoDoMes = (mes: string) => `gastos-${mes}`;
/** Os meses com visão no espelho: os 24 mais recentes com lançamento (até o atual) e os 3 próximos. */
export const MESES_PARA_TRAS = 24;
export const MESES_PARA_FRENTE = 3;

export const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DIA_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
