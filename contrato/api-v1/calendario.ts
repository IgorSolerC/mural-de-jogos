/**
 * O Calendário como a API das AIs mostra (PLANO-API.md, 7.2 e 8; rodada 7): o lembrete como está
 * guardado e a agenda de cada mês, com as repetições já abertas pelo app. Formato público e estável v1:
 * o site monta com as contas da própria tela (core/calendar.ts) e manda ao espelho; a API só serve. Só
 * tipos e funções puras.
 */

/** As cores de um lembrete (as cartolinas claras do Murall). */
export type CorV1 = 'vermelho' | 'laranja' | 'amarelo' | 'verde' | 'azul' | 'lilas' | 'rosa' | 'cinza' | 'branco';
export const CORES: readonly CorV1[] = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'lilas', 'rosa', 'cinza', 'branco'];

export type CadaV1 = 'dia' | 'semana' | 'mes' | 'ano';
export const CADAS: readonly CadaV1[] = ['dia', 'semana', 'mes', 'ano'];

/** Como o lembrete se repete. */
export interface RepeteV1 {
  cada: CadaV1;
  /** A cada quantos dias, semanas, meses ou anos (1 a 99). */
  intervalo: number;
  /** Só na semana: os dias (0 é domingo, 6 é sábado); vazio é o dia da semana do `dia`. */
  dias_da_semana: number[];
  /** Só no mês e no ano: a vez do dia da semana do `dia` no mês ("a terceira terça"): 1 a 5, ou -1 para a última. */
  vez_no_mes: number | null;
  /** Só no mês e no ano, num dia 29, 30 ou 31: só nos meses (ou anos) que têm o dia; senão, cai no último dia dos mais curtos. */
  so_nos_meses_com_o_dia: boolean;
  /** O último dia em que ele pode aparecer (com `vezes`, o da última vez). */
  ate: string | null;
  /** Quantas vezes ele acontece ("depois de 10 vezes"). */
  vezes: number | null;
}

export interface LembreteV1 {
  id: string;
  titulo: string;
  /** O dia (o primeiro, quando se repete): `AAAA-MM-DD`. */
  dia: string;
  /** `HH:MM`; null é o dia todo. */
  hora: string | null;
  /** Mais de um dia: o último dia de cada vez (depois do `dia`). */
  fim: string | null;
  /** Com hora: a hora em que acaba (no último dia, quando são vários). */
  hora_fim: string | null;
  repete: RepeteV1 | null;
  /** Como ele se repete, por extenso ("Toda terça-feira, a partir de 3 de novembro de 2026."); null num pedido que ainda não entrou. */
  em_palavras: string | null;
  /** Os dias tirados de um lembrete que se repete ("só neste dia não"). */
  pulados: string[];
  /** A cor; null num pedido que ainda não entrou sem cor (o Murall sorteia ao aplicar). */
  cor: CorV1 | null;
  /** Uma marcação, não um lembrete: fica no calendário, mas o Google Agenda não avisa. */
  silencioso: boolean;
  /** As anotações presas nele (os ids das notas), na ordem em que foram presas. */
  notas: string[];
  /**
   * Ligado a um evento do Google Agenda: o endereço do evento e, quando o Murall não pode mudar o
   * evento (um convite de outra pessoa, um aniversário do Google), por quê. Travado, só a cor e as
   * notas mudam.
   */
  google: { link: string | null; travado: 'convite' | 'google' | null } | null;
  criado_em: string;
  /** A versão que se manda de volta ao editar ou apagar: muda a cada mudança do lembrete. */
  versao: string;
}

/** Uma vez do lembrete na agenda (a repetição já aberta pelo app). */
export interface VezV1 {
  lembrete: string;
  titulo: string;
  /** O primeiro dia desta vez. */
  dia: string;
  /** O último dia desta vez, quando dura mais de um (null: um dia só). */
  fim: string | null;
  hora: string | null;
  hora_fim: string | null;
  cor: CorV1;
  silencioso: boolean;
  /** É uma vez de um lembrete que se repete. */
  repete: boolean;
  notas: string[];
}

/** A agenda de um mês como o app mostra: as vezes que passam pelo mês, na ordem da folhinha. */
export interface AgendaDoMesV1 {
  mes: string;
  vezes: VezV1[];
}

/** O id da agenda de um mês (`agenda-2026-10`). */
export const agendaDoMes = (mes: string) => `agenda-${mes}`;
/** Os meses com agenda no espelho: os 3 de antes do atual, o atual e os 12 de depois. */
export const AGENDA_PARA_TRAS = 3;
export const AGENDA_PARA_FRENTE = 12;

/** Os tamanhos de sempre do app (core/calendar.ts). */
export const TITULO_DO_LEMBRETE_MAX = 120;
export const NOTAS_DO_LEMBRETE_MAX = 12;
export const PULADOS_MAX = 500;
export const INTERVALO_MAX = 99;
export const VEZES_MAX = 999;
/** Quantos dias uma vez do lembrete pode durar. */
export const DURACAO_MAX = 366;
/** O teto das vezes de um mês na agenda (um lembrete de todo dia dá 31). */
export const VEZES_NO_MES_MAX = 5_000;

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
export const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Um dia de verdade, `AAAA-MM-DD` (o 31 de fevereiro não é). */
export function ehDia(v: unknown): v is string {
  const m = typeof v === 'string' ? DIA.exec(v) : null;
  if (!m) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return a >= 1000 && mes >= 1 && mes <= 12 && d >= 1 && d <= new Date(Date.UTC(a, mes, 0)).getUTCDate();
}

export function ehHora(v: unknown): v is string {
  return typeof v === 'string' && HORA_RE.test(v);
}

/** Quantos dias vão de um dia a outro (os dois contam). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8))) / 86_400_000) + 1;
}

/**
 * As regras que juntam os campos (a API confere o lembrete como vai ficar; o site, de novo, ao aplicar):
 * o que não combina volta em palavras, com o campo. Null: está tudo certo.
 */
export function regrasDoLembrete(l: Pick<LembreteV1, 'dia' | 'hora' | 'fim' | 'hora_fim' | 'repete'>): { campo: string; erro: string } | null {
  if (l.fim !== null) {
    if (l.fim <= l.dia) return { campo: 'fim', erro: 'O fim é o último dia, depois do dia (para um dia só, fim null).' };
    if (diasEntre(l.dia, l.fim) > DURACAO_MAX) return { campo: 'fim', erro: `Cada vez dura no máximo ${DURACAO_MAX} dias.` };
  }
  if (l.hora_fim !== null) {
    if (l.hora === null) return { campo: 'hora_fim', erro: 'hora_fim só vale com hora (o dia todo não tem hora para acabar).' };
    if (l.fim === null && l.hora_fim <= l.hora) return { campo: 'hora_fim', erro: 'No mesmo dia, a hora_fim vem depois da hora.' };
  }
  const r = l.repete;
  if (!r) return null;
  if (r.dias_da_semana.length && r.cada !== 'semana') return { campo: 'repete.dias_da_semana', erro: 'dias_da_semana só vale no cada semana.' };
  if (r.vez_no_mes !== null && r.cada !== 'mes' && r.cada !== 'ano') return { campo: 'repete.vez_no_mes', erro: 'vez_no_mes só vale no cada mes ou ano.' };
  if (r.so_nos_meses_com_o_dia) {
    if (r.cada !== 'mes' && r.cada !== 'ano') return { campo: 'repete.so_nos_meses_com_o_dia', erro: 'so_nos_meses_com_o_dia só vale no cada mes ou ano.' };
    if (r.vez_no_mes !== null) return { campo: 'repete.so_nos_meses_com_o_dia', erro: 'Com vez_no_mes, o dia do mês não conta.' };
    if (Number(l.dia.slice(8)) < 29) return { campo: 'repete.so_nos_meses_com_o_dia', erro: 'so_nos_meses_com_o_dia só vale num dia 29, 30 ou 31.' };
  }
  if (r.ate !== null && r.ate < l.dia) return { campo: 'repete.ate', erro: 'O ate é um dia depois do primeiro (ou null, sem fim).' };
  return null;
}
