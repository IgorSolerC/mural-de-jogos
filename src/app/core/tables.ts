/**
 * A tabela das anotações, como dados: o texto dela continua o markdown de sempre (as linhas com "|",
 * a segunda só de traços), que qualquer lugar lê, e a folha da tabela (ui/table-grid.ts) mexe nas
 * células sem a pessoa tocar nas barras. O jeito dela (branca, listrada…) vai numa linha só dele, logo
 * em cima, como os widgets ("{{tabela: listrada}}", ver core/widgets.ts); a branca, a de sempre, não
 * se escreve, e a tabela fica só o markdown.
 *
 * Aqui não entra nada de core/rich-text.ts nem de core/widgets.ts: os dois usam este arquivo.
 */

/** O alinhamento de uma coluna da tabela (":--", ":-:", "--:"); null, o de sempre. */
export type Align = 'left' | 'center' | 'right' | null;

/**
 * Os jeitos da tabela:
 * - `branca`: a folha branca colada na cartolina, o cabeçalho em letra de impresso sobre um fio de tinta
 *   e as linhas separadas por um fio fino (a de sempre);
 * - `listrada`: o cabeçalho numa faixa de tinta e as linhas uma sim, uma não num papel mais escuro;
 * - `quadriculada`: o papel quadriculado do caderno, o cabeçalho passado com marca-texto;
 * - `caneta`: riscada a caneta direto na cartolina, o cabeçalho em letra de carimbo (a de antes);
 * - `recibo`: a bobina do cupom, com o pé e o alto picotados e os fios tracejados.
 */
export type TableLook = 'branca' | 'listrada' | 'quadriculada' | 'caneta' | 'recibo';
export const TABLE_LOOKS: readonly { value: TableLook; label: string }[] = [
  { value: 'branca', label: 'Branca' },
  { value: 'listrada', label: 'Listrada' },
  { value: 'quadriculada', label: 'Quadriculada' },
  { value: 'caneta', label: 'Caneta' },
  { value: 'recibo', label: 'Recibo' },
];
/** O jeito de quando nada foi escrito (e o que não se escreve). */
export const DEFAULT_TABLE_LOOK: TableLook = 'branca';

/** Os nomes que valem para cada jeito, escritos à mão (sem acento, em minúsculas). */
const LOOK_WORDS: Record<string, TableLook> = {
  branca: 'branca',
  branco: 'branca',
  limpa: 'branca',
  profissional: 'branca',
  listrada: 'listrada',
  listras: 'listrada',
  zebra: 'listrada',
  quadriculada: 'quadriculada',
  quadriculado: 'quadriculada',
  caderno: 'quadriculada',
  caneta: 'caneta',
  riscada: 'caneta',
  recibo: 'recibo',
  cupom: 'recibo',
  nota: 'recibo',
};

/** O jeito que uma palavra nomeia ("Zebra" → listrada), ou null. */
export function tableLookWord(a: string): TableLook | null {
  const k = a.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return Object.hasOwn(LOOK_WORDS, k) ? LOOK_WORDS[k] : null;
}

/** O jeito escrito nos parâmetros da marca (o primeiro que é um jeito), ou o de sempre. */
export function tableLookOf(args: readonly string[]): TableLook {
  for (const a of args) {
    const l = tableLookWord(a);
    if (l) return l;
  }
  return DEFAULT_TABLE_LOOK;
}

/** A linha de traços embaixo do cabeçalho da tabela: "| --- | :-: |". */
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** A linha de traços da tabela ("| --- | :-: |"). */
export function isTableSep(line: string): boolean {
  return line.includes('-') && TABLE_SEP.test(line);
}

/** As células de uma linha de tabela ("| a | b |" ou "a | b"), sem as barras das pontas; "\|" fica na célula. */
export function tableCells(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return t.split(/(?<!\\)\|/).map((c) => c.trim());
}

/** O alinhamento escrito numa célula da linha de traços. */
export function alignOf(cell: string): Align {
  const l = cell.startsWith(':');
  const r = cell.endsWith(':');
  return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
}

/** A linha `i` começa uma tabela: ela tem "|" e a de baixo é a de traços, com o mesmo número de colunas. */
export function startsTable(lines: readonly string[], i: number): boolean {
  const head = lines[i];
  const sep = lines[i + 1];
  return !!head && !!sep && head.includes('|') && sep.includes('|') && isTableSep(sep) && tableCells(head).length === tableCells(sep).length;
}

/** Uma linha da tabela continua (as linhas dela vão até a primeira em branco ou sem "|"). */
export function continuesTable(line: string | undefined): boolean {
  return line !== undefined && line.includes('|') && !!line.trim();
}

/** A tabela em dados: as células como foram escritas (com as marcas), e o alinhamento de cada coluna. */
export interface TableData {
  head: string[];
  rows: string[][];
  align: Align[];
}

/** Os limites da folha da tabela: até quantas colunas e linhas ela monta. */
export const MAX_TABLE_COLS = 12;
export const MAX_TABLE_ROWS = 200;

/**
 * As linhas de uma tabela (a do cabeçalho, a de traços e as de baixo) em dados. Cada linha fica com
 * o número de colunas do cabeçalho: a que tem menos ganha células vazias, a que tem mais perde as de
 * sobra (como a leitura mostra). Linhas que não são de tabela dão uma tabela vazia de uma coluna.
 */
export function readTable(lines: readonly string[]): TableData {
  const rows = lines.map((l) => l.trim()).filter(Boolean);
  if (!startsTable(rows, 0)) return { head: [''], rows: [], align: [null] };
  const head = tableCells(rows[0]);
  const align = tableCells(rows[1]).map(alignOf);
  const body = rows.slice(2).map((l) => {
    const cells = tableCells(l);
    return head.map((_, c) => cells[c] ?? '');
  });
  return { head, rows: body, align };
}

/** A célula escrita de volta: numa linha só, e o "|" que ainda não foi escapado ganha a barra. */
function escapeCell(c: string): string {
  return c
    .replace(/\s+/g, ' ')
    .replace(/(?<!\\)\|/g, '\\|')
    .trim();
}

const SEP_OF: Record<Exclude<Align, null> | 'none', string> = { left: ':---', center: ':---:', right: '---:', none: '---' };

/** A tabela em linhas de markdown: "| a | b |", "| --- | ---: |", "| 1 | 2 |". */
export function writeTable(t: TableData): string[] {
  const cols = Math.max(1, t.head.length);
  const line = (cells: readonly string[]) => '| ' + Array.from({ length: cols }, (_, c) => escapeCell(cells[c] ?? '')).join(' | ') + ' |';
  const sep = '| ' + Array.from({ length: cols }, (_, c) => SEP_OF[t.align[c] ?? 'none']).join(' | ') + ' |';
  return [line(t.head), sep, ...t.rows.map(line)];
}

/** Uma tabela vazia, `cols` colunas por `rows` linhas (sem contar o cabeçalho). */
export function emptyTable(cols = 3, rows = 2): TableData {
  return { head: Array(cols).fill(''), rows: Array.from({ length: rows }, () => Array(cols).fill('')), align: Array(cols).fill(null) };
}

/** Nenhuma célula tem nada escrito. */
export function tableIsEmpty(t: TableData): boolean {
  return [t.head, ...t.rows].every((r) => r.every((c) => !c.trim()));
}

/** A tabela como o valor guardado na folha: o markdown dela, uma linha por linha. */
export function tableText(t: TableData): string {
  return writeTable(t).join('\n');
}

/** O valor guardado na folha de volta em dados. */
export function parseTableText(text: string): TableData {
  return readTable(text.split(/\r?\n/));
}

/**
 * O que foi colado de uma planilha (Excel, Planilhas Google, Numbers): as linhas separadas por quebra
 * de linha e as células por tab. Null se não tem tab nenhum (aí é um texto comum, para uma célula só).
 */
export function pastedGrid(text: string): string[][] | null {
  if (!text.includes('\t')) return null;
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  return lines.map((l) => l.split('\t').map((c) => c.replace(/\s+/g, ' ').trim()));
}
