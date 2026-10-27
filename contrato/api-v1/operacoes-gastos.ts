/**
 * As operações nos Gastos (PLANO-API.md, 7.3, 9.2; rodada 6): lançar (um, a frase rápida), mudar e
 * apagar um lançamento, criar e mudar envelopes e pessoas. Cada escrita da API vira um pedido com uma
 * destas operações, conferida aqui (a API ao receber, o site de novo ao aplicar). O lançamento "como
 * vai ficar" também sai daqui, para a API mostrar o pedido por cima das leituras igual ao que o site
 * vai aplicar. Só tipos e funções puras.
 */

import { dobra, textoLimpo } from './escopos';
import { DIA_RE, MES_RE, type ContextoGastosV1, type EnvelopeV1, type LancamentoV1, type PessoaV1, type PrecisavaV1, type TipoDoLancamentoV1 } from './gastos';

export type OpGasto = 'gasto.lancar' | 'gasto.editar' | 'gasto.apagar' | 'envelope.criar' | 'envelope.editar' | 'pessoa.criar' | 'pessoa.editar';

export const OPS_DE_GASTO: readonly OpGasto[] = ['gasto.lancar', 'gasto.editar', 'gasto.apagar', 'envelope.criar', 'envelope.editar', 'pessoa.criar', 'pessoa.editar'];

/** O escopo que cada operação pede. */
export const ESCOPO_DA_OP_GASTO: Record<OpGasto, string> = {
  'gasto.lancar': 'gastos:lancar',
  'gasto.editar': 'gastos:editar',
  'gasto.apagar': 'gastos:editar',
  'envelope.criar': 'gastos:editar',
  'envelope.editar': 'gastos:editar',
  'pessoa.criar': 'gastos:editar',
  'pessoa.editar': 'gastos:editar',
};

/** Os tamanhos de sempre do app (core/spending.ts). */
export const TITULO_DO_GASTO_MAX = 80;
export const NOME_DO_ENVELOPE_MAX = 24;
export const NOME_DA_PESSOA_MAX = 24;
export const PESSOAS_MAX = 20;
export const CENTAVOS_MAX = 1_000_000_000;
export const PARCELAS_MAX = 72;
export const FRASE_MAX = 200;
/** Lançamentos num pedido de lote (um pedido por lançamento). */
export const LOTE_MAX = 50;

/** Os campos de um lançamento que se escrevem; envelope e pessoas pelo nome (ou pelo id). */
export interface CamposDoLancamento {
  titulo?: string;
  centavos?: number;
  tipo?: TipoDoLancamentoV1;
  envelope?: string;
  pagamento?: 'avista' | 'pix' | 'parcelado';
  parcelas?: number;
  precisava?: PrecisavaV1 | null;
  pessoas?: string[];
  dia?: string;
  fatura?: -1 | 0 | 1;
  /** Repete todo mês (a partir do mês do dia). */
  mensal?: boolean;
  /** Mensal: o último mês (`AAAA-MM`), ou null para sem fim. */
  ate?: string | null;
  reembolso_de?: string | null;
}

/** Lançar: os campos (título e valor obrigatórios) ou a frase rápida, como na linha de anotar. */
export type LancarV1 =
  | (CamposDoLancamento & { titulo: string; centavos: number; criar_envelope?: true; criar_pessoas?: true })
  | { frase: string; criar_pessoas?: true };

export type EditarLancamentoV1 = CamposDoLancamento & { versao: string; criar_envelope?: true; criar_pessoas?: true };
export interface ApagarLancamentoV1 {
  versao: string;
}
export interface CriarEnvelopeV1 {
  nome: string;
  tipo: TipoDoLancamentoV1;
  limite_centavos?: number | null;
}
export interface EditarEnvelopeV1 {
  nome?: string;
  limite_centavos?: number | null;
}
export interface PessoaV1Escrita {
  nome: string;
}

export type DadosDaOpGasto = LancarV1 | EditarLancamentoV1 | ApagarLancamentoV1 | CriarEnvelopeV1 | EditarEnvelopeV1 | PessoaV1Escrita;

export type ConferidoGasto<T> = { ok: true; dados: T } | { ok: false; campo: string; erro: string };
const falha = (campo: string, erro: string) => ({ ok: false as const, campo, erro });

const isVersao = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

function lerCampos(r: Record<string, unknown>, lancando: boolean): ConferidoGasto<CamposDoLancamento> {
  const out: CamposDoLancamento = {};
  if (r['titulo'] !== undefined || lancando) {
    const t = textoLimpo(r['titulo'], TITULO_DO_GASTO_MAX + 1);
    if (!t) return falha('titulo', 'O título é obrigatório (o que foi: "Mercado", "Uber").');
    if (t.length > TITULO_DO_GASTO_MAX) return falha('titulo', `O título tem até ${TITULO_DO_GASTO_MAX} letras.`);
    out.titulo = t;
  }
  if (r['centavos'] !== undefined || lancando) {
    const c = r['centavos'];
    if (!Number.isSafeInteger(c) || (c as number) < 1 || (c as number) > CENTAVOS_MAX) {
      return falha('centavos', 'O valor vai em centavos, inteiro e positivo (R$ 230,50 = 23050).');
    }
    out.centavos = c as number;
  }
  if (r['tipo'] !== undefined) {
    if (r['tipo'] !== 'saida' && r['tipo'] !== 'entrada') return falha('tipo', 'O tipo é saida ou entrada.');
    out.tipo = r['tipo'];
  }
  if (r['envelope'] !== undefined) {
    const e = textoLimpo(r['envelope'], 65);
    if (!e || e.length > 64) return falha('envelope', 'O envelope é o nome (ou o id) de um envelope que existe.');
    out.envelope = e;
  }
  if (r['pagamento'] !== undefined) {
    if (r['pagamento'] !== 'avista' && r['pagamento'] !== 'pix' && r['pagamento'] !== 'parcelado') return falha('pagamento', 'O pagamento é avista, pix ou parcelado.');
    out.pagamento = r['pagamento'];
  }
  if (r['parcelas'] !== undefined) {
    const p = r['parcelas'];
    if (!Number.isInteger(p) || (p as number) < 2 || (p as number) > PARCELAS_MAX) return falha('parcelas', `As parcelas vão de 2 a ${PARCELAS_MAX}.`);
    out.parcelas = p as number;
  }
  if (r['precisava'] !== undefined) {
    const n = r['precisava'];
    if (n !== null && n !== 'luxo' && n !== 'conforto' && n !== 'indispensavel') return falha('precisava', 'precisava é luxo, conforto, indispensavel (ou null).');
    out.precisava = n;
  }
  if (r['pessoas'] !== undefined) {
    const list = r['pessoas'];
    if (!Array.isArray(list) || list.length > PESSOAS_MAX || list.some((x) => typeof x !== 'string' || !x.trim() || x.length > 64)) {
      return falha('pessoas', `pessoas é uma lista de nomes (até ${PESSOAS_MAX}); "eu" é você.`);
    }
    const seen = new Map<string, string>();
    for (const x of list as string[]) {
      const v = textoLimpo(x, 64);
      if (!seen.has(dobra(v))) seen.set(dobra(v), v);
    }
    out.pessoas = [...seen.values()];
  }
  if (r['dia'] !== undefined) {
    if (typeof r['dia'] !== 'string' || !DIA_RE.test(r['dia'])) return falha('dia', 'O dia é AAAA-MM-DD (sem ele, hoje).');
    out.dia = r['dia'];
  }
  if (r['fatura'] !== undefined) {
    if (r['fatura'] !== -1 && r['fatura'] !== 0 && r['fatura'] !== 1) return falha('fatura', 'fatura é -1 (conta no mês de antes), 0 ou 1 (no de depois).');
    out.fatura = r['fatura'];
  }
  if (r['mensal'] !== undefined) {
    if (typeof r['mensal'] !== 'boolean') return falha('mensal', 'mensal é true ou false.');
    out.mensal = r['mensal'];
  }
  if (r['ate'] !== undefined) {
    if (r['ate'] !== null && (typeof r['ate'] !== 'string' || !MES_RE.test(r['ate']))) return falha('ate', 'ate é um mês AAAA-MM (ou null, sem fim).');
    out.ate = r['ate'];
  }
  if (r['reembolso_de'] !== undefined) {
    if (r['reembolso_de'] !== null && (typeof r['reembolso_de'] !== 'string' || !/^[\w-]{1,64}$/.test(r['reembolso_de']))) {
      return falha('reembolso_de', 'reembolso_de é o id do gasto que esta entrada paga de volta (ou null).');
    }
    out.reembolso_de = r['reembolso_de'];
  }
  // o que não combina, recusa já (a tela não deixaria)
  const tipo = out.tipo ?? 'saida';
  if (lancando && tipo === 'entrada' && (out.pagamento || out.parcelas || out.precisava || out.pessoas)) {
    return falha('tipo', 'Uma entrada não tem pagamento, parcelas, precisava nem pessoas.');
  }
  if (out.parcelas && out.pagamento && out.pagamento !== 'parcelado') return falha('parcelas', 'Parcelas só no pagamento parcelado.');
  if (out.parcelas && out.mensal) return falha('mensal', 'Um lançamento é parcelado ou mensal, não os dois.');
  if (out.ate !== undefined && out.mensal === false) return falha('ate', 'ate só vale no mensal.');
  if (out.reembolso_de && lancando && tipo !== 'entrada') return falha('reembolso_de', 'Só uma entrada paga de volta um gasto.');
  return { ok: true, dados: out };
}

const flag = (r: Record<string, unknown>, k: string) => (r[k] === true ? { [k]: true as const } : {});

/** Confere os dados de uma operação (vale na API, ao receber, e no site, ao aplicar). */
export function conferirOpGasto(op: OpGasto, raw: unknown): ConferidoGasto<DadosDaOpGasto> {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  switch (op) {
    case 'gasto.lancar': {
      if (r['frase'] !== undefined) {
        const f = textoLimpo(r['frase'], FRASE_MAX + 1);
        if (!f) return falha('frase', 'A frase é o gasto como se fala: "mercado 230,50 ontem".');
        if (f.length > FRASE_MAX) return falha('frase', `A frase tem até ${FRASE_MAX} letras.`);
        return { ok: true, dados: { frase: f, ...flag(r, 'criar_pessoas') } };
      }
      const c = lerCampos(r, true);
      if (!c.ok) return c;
      return { ok: true, dados: { ...c.dados, titulo: c.dados.titulo!, centavos: c.dados.centavos!, ...flag(r, 'criar_envelope'), ...flag(r, 'criar_pessoas') } };
    }
    case 'gasto.editar': {
      if (!isVersao(r['versao'])) return falha('versao', 'Mande a versao do lançamento que você leu (o campo versao).');
      const c = lerCampos(r, false);
      if (!c.ok) return c;
      if (!Object.keys(c.dados).length) return falha('campos', 'Nada para mudar: mande pelo menos um campo.');
      return { ok: true, dados: { ...c.dados, versao: r['versao'], ...flag(r, 'criar_envelope'), ...flag(r, 'criar_pessoas') } };
    }
    case 'gasto.apagar':
      if (!isVersao(r['versao'])) return falha('versao', 'Mande a versao do lançamento que você leu (o campo versao).');
      return { ok: true, dados: { versao: r['versao'] } };
    case 'envelope.criar': {
      const nome = textoLimpo(r['nome'], NOME_DO_ENVELOPE_MAX + 1);
      if (!nome || nome.length > NOME_DO_ENVELOPE_MAX) return falha('nome', `O nome do envelope tem de 1 a ${NOME_DO_ENVELOPE_MAX} letras.`);
      const tipo = r['tipo'] ?? 'saida';
      if (tipo !== 'saida' && tipo !== 'entrada') return falha('tipo', 'O tipo é saida ou entrada.');
      const limite = lerLimite(r['limite_centavos'], tipo);
      if (limite === false) return falha('limite_centavos', 'O limite do mês vai em centavos (inteiro, 0 ou mais), só num envelope de saída.');
      return { ok: true, dados: { nome, tipo, ...(limite !== undefined ? { limite_centavos: limite } : {}) } };
    }
    case 'envelope.editar': {
      const out: EditarEnvelopeV1 = {};
      if (r['nome'] !== undefined) {
        const nome = textoLimpo(r['nome'], NOME_DO_ENVELOPE_MAX + 1);
        if (!nome || nome.length > NOME_DO_ENVELOPE_MAX) return falha('nome', `O nome do envelope tem de 1 a ${NOME_DO_ENVELOPE_MAX} letras.`);
        out.nome = nome;
      }
      const limite = lerLimite(r['limite_centavos'], 'saida');
      if (limite === false) return falha('limite_centavos', 'O limite do mês vai em centavos (inteiro, 0 ou mais), ou null para tirar.');
      if (limite !== undefined) out.limite_centavos = limite;
      if (!Object.keys(out).length) return falha('campos', 'Nada para mudar: mande o nome ou o limite_centavos.');
      return { ok: true, dados: out };
    }
    case 'pessoa.criar':
    case 'pessoa.editar': {
      const nome = textoLimpo(r['nome'], NOME_DA_PESSOA_MAX + 1);
      if (!nome || nome.length > NOME_DA_PESSOA_MAX) return falha('nome', `O nome da pessoa tem de 1 a ${NOME_DA_PESSOA_MAX} letras.`);
      return { ok: true, dados: { nome } };
    }
  }
}

function lerLimite(v: unknown, tipo: string): number | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (tipo !== 'saida' || !Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > CENTAVOS_MAX) return false;
  return v as number;
}

/** O envelope pelo id ou pelo nome (sem ligar para acento e caixa), ou null. */
export function acharEnvelope(ctx: Pick<ContextoGastosV1, 'envelopes'> | null, raw: string): EnvelopeV1 | null {
  return ctx?.envelopes.find((e) => e.id === raw) ?? ctx?.envelopes.find((e) => dobra(e.nome) === dobra(raw)) ?? null;
}

/** A pessoa pelo id ou pelo nome (sem ligar para acento e caixa); "eu" e "você" são você. */
export function acharPessoa(ctx: Pick<ContextoGastosV1, 'pessoas'> | null, raw: string): PessoaV1 | null {
  const k = dobra(raw);
  if (k === 'eu' || k === 'voce') return ctx?.pessoas.find((p) => p.eu) ?? null;
  return ctx?.pessoas.find((p) => p.id === raw) ?? ctx?.pessoas.find((p) => dobra(p.nome) === k) ?? null;
}

/** O envelope de sempre de cada tipo, quando a AI não diz (os ids de fábrica do app). */
export const ENVELOPE_PADRAO: Record<TipoDoLancamentoV1, string> = { saida: 'outros', entrada: 'outras-entradas' };

/** O mês de um dia, e o mês n meses depois. */
const mesDoDia = (dia: string) => dia.slice(0, 7);
function andarMes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * O lançamento como vai ficar, para a API mostrar por cima das leituras (a frase, que o site entende
 * com o histórico, não tem prévia: null). `hoje` é o dia no fuso da conta.
 */
export function lancamentoDoPedido(id: string, d: LancarV1, ctx: ContextoGastosV1 | null, hoje: string, agora: string): LancamentoV1 | null {
  if ('frase' in d) return null;
  const tipo = d.tipo ?? 'saida';
  const env = d.envelope ? acharEnvelope(ctx, d.envelope) : acharEnvelope(ctx, ENVELOPE_PADRAO[tipo]);
  const eu = ctx?.pessoas.find((p) => p.eu)?.nome ?? 'Eu';
  const pessoas = tipo === 'saida' ? (d.pessoas?.length ? d.pessoas.map((p) => acharPessoa(ctx, p)?.nome ?? p) : [eu]) : [];
  const dia = d.dia ?? hoje;
  const parcelas = d.parcelas ?? null;
  const fatura = d.mensal ? 0 : (d.fatura ?? 0);
  return {
    id,
    titulo: d.titulo,
    centavos: d.centavos,
    tipo,
    envelope: env ? { id: env.id, nome: env.nome } : d.envelope ? { id: '', nome: d.envelope } : null,
    pagamento: tipo === 'saida' ? (parcelas ? 'parcelado' : (d.pagamento ?? 'avista')) : null,
    parcelas,
    precisava: tipo === 'saida' ? (d.precisava ?? null) : null,
    pessoas,
    dia,
    mes: fatura ? andarMes(mesDoDia(dia), fatura) : mesDoDia(dia),
    fatura,
    mensal: d.mensal ? { ate: d.ate ?? null, valores: {}, pulados: [] } : null,
    reembolso_de: tipo === 'entrada' ? (d.reembolso_de ?? null) : null,
    criado_em: agora,
    versao: agora,
  };
}

/** O lançamento com uma mudança por cima (a prévia de `gasto.editar`). */
export function editarLancamentoV1(l: LancamentoV1, d: EditarLancamentoV1, ctx: ContextoGastosV1 | null, agora: string): LancamentoV1 {
  const tipo = d.tipo ?? l.tipo;
  const env = d.envelope ? acharEnvelope(ctx, d.envelope) : null;
  const dia = d.dia ?? l.dia;
  const fatura = d.mensal ? 0 : (d.fatura ?? l.fatura);
  const mensal = d.mensal === false ? null : d.mensal || l.mensal ? { ...(l.mensal ?? { valores: {}, pulados: [] }), ate: d.ate !== undefined ? d.ate : (l.mensal?.ate ?? null) } : null;
  const parcelas = d.parcelas !== undefined ? d.parcelas : d.pagamento && d.pagamento !== 'parcelado' ? null : l.parcelas;
  return {
    ...l,
    titulo: d.titulo ?? l.titulo,
    centavos: d.centavos ?? l.centavos,
    tipo,
    envelope: env ? { id: env.id, nome: env.nome } : d.envelope ? { id: '', nome: d.envelope } : l.envelope,
    pagamento: tipo === 'saida' ? (parcelas ? 'parcelado' : (d.pagamento ?? (l.pagamento === 'parcelado' ? 'avista' : l.pagamento) ?? 'avista')) : null,
    parcelas: tipo === 'saida' ? parcelas : null,
    precisava: tipo === 'saida' ? (d.precisava !== undefined ? d.precisava : l.precisava) : null,
    pessoas: tipo === 'saida' ? (d.pessoas ? d.pessoas.map((p) => acharPessoa(ctx, p)?.nome ?? p) : l.pessoas) : [],
    dia,
    mes: fatura ? andarMes(mesDoDia(dia), fatura) : mesDoDia(dia),
    fatura,
    mensal,
    reembolso_de: d.reembolso_de !== undefined ? d.reembolso_de : l.reembolso_de,
    versao: agora,
  };
}
