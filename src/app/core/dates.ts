/**
 * Os dias e meses de todo o site, no fuso de quem usa. Não importa nada: qualquer módulo pode usar,
 * até os que `review.ts` importa, sem ciclo.
 */

/** Um dia, em milissegundos. */
export const DAY_MS = 86_400_000;

/** Os meses abreviados, como o site escreve nas datas curtas ("7 out"). */
export const MONTHS_SHORT: readonly string[] = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Os meses por extenso. */
export const MONTHS_LONG: readonly string[] = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "15 de março de 2024". */
export const longDayFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
/** "março de 2024". */
export const longMonthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/** Uma data no fuso local, 'AAAA-MM-DD'. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Hoje no fuso local, 'AAAA-MM-DD'. */
export function todayISO(): string {
  return localDay(new Date());
}

/** 'AAAA-MM-DD' → Date à meia-noite local (sem o pulo de fuso de `new Date('AAAA-MM-DD')`). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Quantos dias faz, escrito: "hoje", "ontem", "há 3 dias". */
export function daysAgoLabel(days: number): string {
  return days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
}
