/**
 * As operações no Calendário (PLANO-API.md, 7.3, 9.2; rodada 7): criar, mudar e apagar um lembrete (ou
 * só um dia dele). Cada escrita da API vira um pedido com uma destas operações, conferida aqui (a API ao
 * receber, o site de novo ao aplicar). O lembrete "como vai ficar" também sai daqui, para a API mostrar
 * o pedido por cima das leituras igual ao que o site vai aplicar; quando ele aparece (as repetições
 * abertas) continua conta do site. Só tipos e funções puras.
 */

import {
  CADAS,
  CORES,
  INTERVALO_MAX,
  NOTAS_DO_LEMBRETE_MAX,
  TITULO_DO_LEMBRETE_MAX,
  VEZES_MAX,
  diasEntre,
  ehDia,
  ehHora,
  type CadaV1,
  type CorV1,
  type LembreteV1,
  type RepeteV1,
} from './calendario';
import { textoLimpo } from './escopos';

export type OpLembrete = 'lembrete.criar' | 'lembrete.editar' | 'lembrete.apagar';

export const OPS_DO_CALENDARIO: readonly OpLembrete[] = ['lembrete.criar', 'lembrete.editar', 'lembrete.apagar'];

/** O escopo que cada operação pede. */
export const ESCOPO_DA_OP_LEMBRETE: Record<OpLembrete, string> = {
  'lembrete.criar': 'calendario:escrever',
  'lembrete.editar': 'calendario:escrever',
  'lembrete.apagar': 'calendario:apagar',
};

/** Como se escreve a repetição: só o `cada` é obrigatório; o resto, o de sempre. */
export interface RepeteEscritoV1 {
  cada: CadaV1;
  intervalo?: number;
  dias_da_semana?: number[];
  vez_no_mes?: number | null;
  so_nos_meses_com_o_dia?: boolean;
  ate?: string | null;
  vezes?: number | null;
}

/** Os campos de um lembrete que se escrevem. */
export interface CamposDoLembrete {
  titulo?: string;
  dia?: string;
  hora?: string | null;
  fim?: string | null;
  hora_fim?: string | null;
  /** A repetição inteira (troca a de antes); null: não se repete. */
  repete?: RepeteV1 | null;
  cor?: CorV1;
  silencioso?: boolean;
  notas?: string[];
}

export type CriarLembreteV1 = CamposDoLembrete & { titulo: string; dia: string };
export type EditarLembreteV1 = CamposDoLembrete & { versao: string };
export interface ApagarLembreteV1 {
  versao: string;
  /** Só esta vez de um lembrete que se repete (o primeiro dia dela). */
  dia?: string;
}

export type DadosDaOpLembrete = CriarLembreteV1 | EditarLembreteV1 | ApagarLembreteV1;

/** O que um lembrete travado pelo Google ainda muda (o resto é do Google). */
export const SO_DO_MURALL: readonly (keyof CamposDoLembrete)[] = ['cor', 'notas'];

export type ConferidoLembrete<T> = { ok: true; dados: T } | { ok: false; campo: string; erro: string };
const falha = (campo: string, erro: string) => ({ ok: false as const, campo, erro });

const isVersao = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const ID_RE = /^[\w-]{1,64}$/;

function lerRepete(raw: unknown): ConferidoLembrete<RepeteV1 | null> {
  if (raw === null) return { ok: true, dados: null };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return falha('repete', 'repete é {cada, intervalo, ...} (ou null, para não repetir).');
  const r = raw as Record<string, unknown>;
  if (!(CADAS as readonly unknown[]).includes(r['cada'])) return falha('repete.cada', 'cada é dia, semana, mes ou ano.');
  const intervalo = r['intervalo'] ?? 1;
  if (!Number.isInteger(intervalo) || (intervalo as number) < 1 || (intervalo as number) > INTERVALO_MAX) return falha('repete.intervalo', `O intervalo vai de 1 a ${INTERVALO_MAX}.`);
  const dias = r['dias_da_semana'] ?? [];
  if (!Array.isArray(dias) || dias.length > 7 || dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return falha('repete.dias_da_semana', 'dias_da_semana é uma lista de 0 (domingo) a 6 (sábado).');
  }
  const vez = r['vez_no_mes'] ?? null;
  if (vez !== null && ![1, 2, 3, 4, 5, -1].includes(vez as number)) return falha('repete.vez_no_mes', 'vez_no_mes é de 1 a 5 (a primeira à quinta), -1 (a última) ou null.');
  const so = r['so_nos_meses_com_o_dia'] ?? false;
  if (typeof so !== 'boolean') return falha('repete.so_nos_meses_com_o_dia', 'so_nos_meses_com_o_dia é true ou false.');
  const ate = r['ate'] ?? null;
  if (ate !== null && !ehDia(ate)) return falha('repete.ate', 'ate é um dia AAAA-MM-DD (ou null, sem fim).');
  const vezes = r['vezes'] ?? null;
  if (vezes !== null && (!Number.isInteger(vezes) || (vezes as number) < 1 || (vezes as number) > VEZES_MAX)) return falha('repete.vezes', `vezes vai de 1 a ${VEZES_MAX} (ou null).`);
  if (vezes !== null && ate !== null) return falha('repete.vezes', 'Mande ate ou vezes, não os dois.');
  return {
    ok: true,
    dados: {
      cada: r['cada'] as CadaV1,
      intervalo: intervalo as number,
      dias_da_semana: [...new Set(dias as number[])].sort(),
      vez_no_mes: vez as number | null,
      so_nos_meses_com_o_dia: so,
      ate: ate as string | null,
      vezes: vezes as number | null,
    },
  };
}

function lerCampos(r: Record<string, unknown>, criando: boolean): ConferidoLembrete<CamposDoLembrete> {
  const out: CamposDoLembrete = {};
  if (r['titulo'] !== undefined || criando) {
    const t = textoLimpo(r['titulo'], TITULO_DO_LEMBRETE_MAX + 1);
    if (!t) return falha('titulo', 'O título é obrigatório ("Dentista", "Pagar o aluguel").');
    if (t.length > TITULO_DO_LEMBRETE_MAX) return falha('titulo', `O título tem até ${TITULO_DO_LEMBRETE_MAX} letras.`);
    out.titulo = t;
  }
  if (r['dia'] !== undefined || criando) {
    if (!ehDia(r['dia'])) return falha('dia', 'O dia é AAAA-MM-DD, um dia que existe (o primeiro, quando se repete).');
    out.dia = r['dia'];
  }
  for (const k of ['hora', 'hora_fim'] as const) {
    if (r[k] === undefined) continue;
    if (r[k] !== null && !ehHora(r[k])) return falha(k, `${k} é HH:MM, de 00:00 a 23:59 (ou null).`);
    out[k] = r[k] as string | null;
  }
  if (r['fim'] !== undefined) {
    if (r['fim'] !== null && !ehDia(r['fim'])) return falha('fim', 'fim é o último dia, AAAA-MM-DD (ou null, um dia só).');
    out.fim = r['fim'] as string | null;
  }
  if (r['repete'] !== undefined) {
    const rep = lerRepete(r['repete']);
    if (!rep.ok) return rep;
    out.repete = rep.dados;
  }
  if (r['cor'] !== undefined) {
    if (!(CORES as readonly unknown[]).includes(r['cor'])) return falha('cor', `A cor é uma destas: ${CORES.join(', ')}.`);
    out.cor = r['cor'] as CorV1;
  }
  if (r['silencioso'] !== undefined) {
    if (typeof r['silencioso'] !== 'boolean') return falha('silencioso', 'silencioso é true (uma marcação, que o Google Agenda não avisa) ou false.');
    out.silencioso = r['silencioso'];
  }
  if (r['notas'] !== undefined) {
    const n = r['notas'];
    if (!Array.isArray(n) || n.some((x) => typeof x !== 'string' || !ID_RE.test(x))) return falha('notas', 'notas é uma lista de ids de anotações.');
    const ids = [...new Set(n as string[])];
    if (ids.length > NOTAS_DO_LEMBRETE_MAX) return falha('notas', `Cabem até ${NOTAS_DO_LEMBRETE_MAX} anotações num lembrete.`);
    out.notas = ids;
  }
  return { ok: true, dados: out };
}

/** Confere os dados de uma operação (vale na API, ao receber, e no site, ao aplicar). */
export function conferirOpLembrete(op: OpLembrete, raw: unknown): ConferidoLembrete<DadosDaOpLembrete> {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  switch (op) {
    case 'lembrete.criar': {
      const c = lerCampos(r, true);
      if (!c.ok) return c;
      return { ok: true, dados: { ...c.dados, titulo: c.dados.titulo!, dia: c.dados.dia! } };
    }
    case 'lembrete.editar': {
      if (!isVersao(r['versao'])) return falha('versao', 'Mande a versao do lembrete que você leu (o campo versao).');
      const c = lerCampos(r, false);
      if (!c.ok) return c;
      if (!Object.keys(c.dados).length) return falha('campos', 'Nada para mudar: mande pelo menos um campo.');
      return { ok: true, dados: { ...c.dados, versao: r['versao'] } };
    }
    case 'lembrete.apagar': {
      if (!isVersao(r['versao'])) return falha('versao', 'Mande a versao do lembrete que você leu (o campo versao).');
      if (r['dia'] !== undefined && r['dia'] !== null && !ehDia(r['dia'])) return falha('dia', 'dia é AAAA-MM-DD: só aquela vez sai (num lembrete que se repete).');
      return { ok: true, dados: { versao: r['versao'], ...(ehDia(r['dia']) ? { dia: r['dia'] } : {}) } };
    }
  }
}

/** Os campos que a mudança mexe e que só o Google muda num lembrete travado (vazio: pode). */
export function camposDoGoogle(d: CamposDoLembrete): string[] {
  return Object.keys(d).filter((k) => k !== 'versao' && !(SO_DO_MURALL as readonly string[]).includes(k));
}

/** O dia `n` dias depois. */
function andar(dia: string, n: number): string {
  return new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8) + n)).toISOString().slice(0, 10);
}

/**
 * Os campos por cima do lembrete, com as regras da folha: mudar o dia leva o fim junto (a vez continua
 * com os mesmos dias); sem hora, não há hora_fim; sem repetição, não há dias tirados. A repetição com
 * `vezes` fica com o `ate` em branco (o site conta o último dia).
 */
function juntar(l: LembreteV1, d: CamposDoLembrete): LembreteV1 {
  const dia = d.dia ?? l.dia;
  const fim = d.fim !== undefined ? d.fim : l.fim && d.dia ? andar(l.fim, diasEntre(l.dia, d.dia) - 1) : l.fim;
  const hora = d.hora !== undefined ? d.hora : l.hora;
  const repete = d.repete !== undefined ? d.repete && { ...d.repete, ate: d.repete.vezes ? null : d.repete.ate } : l.repete;
  const mudouQuando = d.dia !== undefined || d.fim !== undefined || d.repete !== undefined;
  return {
    ...l,
    titulo: d.titulo ?? l.titulo,
    dia,
    hora,
    fim,
    hora_fim: hora === null ? null : d.hora_fim !== undefined ? d.hora_fim : l.hora_fim,
    repete,
    em_palavras: mudouQuando ? null : l.em_palavras,
    pulados: repete ? l.pulados : [],
    cor: d.cor ?? l.cor,
    silencioso: d.silencioso ?? l.silencioso,
    notas: d.notas ?? l.notas,
  };
}

/** O lembrete de um pedido de criar, antes de o site aplicar (sem cor, o site sorteia: null). */
export function lembreteDoPedido(id: string, d: CriarLembreteV1, agora: string): LembreteV1 {
  const base: LembreteV1 = {
    id,
    titulo: d.titulo,
    dia: d.dia,
    hora: null,
    fim: null,
    hora_fim: null,
    repete: null,
    em_palavras: null,
    pulados: [],
    cor: null,
    silencioso: false,
    notas: [],
    google: null,
    criado_em: agora,
    versao: agora,
  };
  return { ...juntar(base, d), em_palavras: null };
}

/** O lembrete com uma mudança por cima (a prévia de `lembrete.editar`). */
export function editarLembreteV1(l: LembreteV1, d: EditarLembreteV1, agora: string): LembreteV1 {
  const { versao: _v, ...campos } = d;
  return { ...juntar(l, campos), versao: agora };
}

/** O lembrete sem uma vez (a prévia de `lembrete.apagar` com `dia`). */
export function tirarDiaV1(l: LembreteV1, dia: string, agora: string): LembreteV1 {
  return { ...l, pulados: [...new Set([...l.pulados, dia])].sort(), versao: agora };
}
