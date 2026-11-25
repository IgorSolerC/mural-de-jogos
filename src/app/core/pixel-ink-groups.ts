import { INK_GROUPS_MAX, InkGroup, inkChar, inkIndex, rgbOf, sanitizeInkGroups } from './pixel-art';
import { GREY_SAT, inkTone } from './pixel-tools';

/**
 * Os grupos das cores no ateliê da pixel art (PLANO-GRUPOS-CORES.md): o que se faz com eles. O formato (`InkGroup`,
 * ler e escrever na linha do `{{pixel}}`) mora em core/pixel-art.ts. O grupo só organiza a paleta: nada aqui muda o
 * número de uma cor nem o desenho. As cores fora de qualquer grupo são as soltas, que vêm primeiro. Tudo aqui é puro.
 */

/** O grupo de uma cor (o índice em `groups`); -1, solta. */
export function groupOfInk(groups: readonly InkGroup[], n: number): number {
  return groups.findIndex((g) => g.inks.includes(n));
}

/** As cores soltas de uma paleta de `count` cores, em ordem (sem o transparente). */
export function looseInks(groups: readonly InkGroup[], count: number): number[] {
  const grouped = new Set(groups.flatMap((g) => g.inks));
  const out: number[] = [];
  for (let i = 1; i <= count; i++) if (!grouped.has(i)) out.push(i);
  return out;
}

/** As cores na ordem da tela: o transparente, as soltas, depois cada grupo (o que `[` e `]` andam). */
export function inkOrder(groups: readonly InkGroup[], count: number): number[] {
  return [0, ...looseInks(groups, count), ...groups.flatMap((g) => g.inks.filter((n) => n <= count))];
}

/** As cores `inks` no grupo `to` (-1: soltas), saindo de onde estavam. */
export function moveToGroup(groups: readonly InkGroup[], inks: readonly number[], to: number): InkGroup[] {
  const moving = new Set(inks);
  return groups.map((g, i) => {
    const kept = g.inks.filter((n) => !moving.has(n));
    return { ...g, inks: i === to ? [...kept, ...moving].sort((a, b) => a - b) : kept };
  });
}

/** Um grupo novo no fim, com as cores `inks` (que saem de onde estavam); os mesmos grupos se já não cabe mais um. */
export function addGroup(groups: readonly InkGroup[], name: string, inks: readonly number[] = []): InkGroup[] {
  if (groups.length >= INK_GROUPS_MAX) return [...groups];
  return moveToGroup([...groups, { name, inks: [] }], inks, groups.length);
}

/** O grupo `i` desfeito: as cores dele voltam a ser soltas. */
export function removeGroup(groups: readonly InkGroup[], i: number): InkGroup[] {
  return groups.filter((_, k) => k !== i);
}

/** O grupo `i` um lugar para cima (-1) ou para baixo (1). */
export function moveGroup(groups: readonly InkGroup[], i: number, dir: 1 | -1): InkGroup[] {
  const to = i + dir;
  if (i < 0 || i >= groups.length || to < 0 || to >= groups.length) return [...groups];
  const out = [...groups];
  [out[i], out[to]] = [out[to], out[i]];
  return out;
}

// ===== quando a paleta renumera =====

/** A fileira de prova: cada cor da paleta de `count` cores uma vez, na ordem ("0123…"). */
export function probeRow(count: number): string {
  let out = '';
  for (let i = 0; i <= count; i++) out += inkChar(i);
  return out;
}

/**
 * Os grupos depois de uma conta que renumera a paleta (tirar uma cor, mudar de lugar, ordenar, converter): `after` é a
 * fileira de prova (`probeRow`) depois da conta, que diz para onde foi cada número; a cor que virou o transparente sai
 * do grupo. `count`: quantas cores a paleta tem depois.
 */
export function remapInkGroups(groups: readonly InkGroup[], after: string, count: number): InkGroup[] {
  return sanitizeInkGroups(
    groups.map((g) => ({ ...g, inks: g.inks.map((n) => (after[n] === undefined ? 0 : inkIndex(after[n]))).filter((n) => n > 0) })),
    count,
  );
}

// ===== os nomes e os grupos pelo tom =====

/** As famílias de cor, na ordem do círculo (a ordem de "Agrupar pelo tom"). */
export type InkFamily = 'cinza' | 'vermelho' | 'laranja' | 'marrom' | 'amarelo' | 'verde' | 'azul' | 'roxo' | 'rosa';
const FAMILIES: readonly InkFamily[] = ['cinza', 'vermelho', 'laranja', 'marrom', 'amarelo', 'verde', 'azul', 'roxo', 'rosa'];
const FAMILY_NAME: Readonly<Record<InkFamily, string>> = {
  cinza: 'Cinzas',
  vermelho: 'Vermelhos',
  laranja: 'Laranjas',
  marrom: 'Marrons',
  amarelo: 'Amarelos',
  verde: 'Verdes',
  azul: 'Azuis',
  roxo: 'Roxos',
  rosa: 'Rosas',
};
const WARM: ReadonlySet<InkFamily> = new Set(['vermelho', 'laranja', 'marrom', 'amarelo', 'rosa']);
const COOL: ReadonlySet<InkFamily> = new Set(['verde', 'azul', 'roxo']);

/** A família de uma cor ("#8b5a2b" → marrom): as apagadas e as quase pretas são cinzas; o laranja escuro, marrom. */
export function inkFamily(hex: string): InkFamily {
  const t = inkTone(rgbOf(hex));
  if (t.sat < GREY_SAT || t.light < 0.06) return 'cinza';
  const h = t.hue;
  if (h >= 0.15 && h < 1.1 && t.light < 0.42) return 'marrom';
  if (h < 0.25 || h >= 5.75) return t.light > 0.72 ? 'rosa' : 'vermelho';
  if (h < 0.75) return 'laranja';
  if (h < 1.25) return 'amarelo';
  if (h < 2.6) return 'verde';
  if (h < 4.35) return 'azul';
  if (h < 5.15) return 'roxo';
  return 'rosa';
}

/** `base`, ou "base 2", "base 3"… se já há um grupo com esse nome. */
function freeName(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * O nome de um grupo novo, pelas cores dele: uma família só, o nome dela ("Azuis"); todas quentes, "Quentes"; todas
 * frias, "Frios"; sem cor ou misturadas, "Grupo N". Nunca o de um grupo que já existe.
 */
export function suggestGroupName(colors: readonly string[], taken: readonly string[]): string {
  const families = new Set(colors.map(inkFamily));
  const all = (set: ReadonlySet<InkFamily>) => families.size > 0 && [...families].every((f) => set.has(f));
  if (families.size === 1) return freeName(FAMILY_NAME[[...families][0]], taken);
  if (all(WARM)) return freeName('Quentes', taken);
  if (all(COOL)) return freeName('Frios', taken);
  const used = new Set(taken);
  let n = taken.length + 1;
  while (used.has(`Grupo ${n}`)) n++;
  return `Grupo ${n}`;
}

/** Os grupos pelo tom: cada cor da paleta (`inks`, a do 1 em diante) no grupo da família dela, na ordem do círculo. */
export function groupsByHue(inks: readonly (string | null)[]): InkGroup[] {
  const buckets = new Map<InkFamily, number[]>();
  inks.forEach((c, i) => {
    if (i < 1 || !c) return;
    const f = inkFamily(c);
    buckets.set(f, [...(buckets.get(f) ?? []), i]);
  });
  return FAMILIES.filter((f) => buckets.has(f)).map((f) => ({ name: FAMILY_NAME[f], inks: buckets.get(f)! }));
}
