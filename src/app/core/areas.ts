import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RedirectFunction, Router, RouterStateSnapshot } from '@angular/router';
import { Kind, NOTES, SCORED_KINDS, isNotes } from './kinds';
import { Mural } from './mural';
import { COFRE_URL, SECOES_DAS_ANOTACOES, SECOES_DAS_UTILIDADES } from '../../../shared/topo-do-murall';

/**
 * As quatro partes do site, as etiquetas do varal: as Anotações, as Análises (os murais de resenhas,
 * com o Pra depois e a Wishlist de cada um), as Utilidades (os Gastos e o cofre de senhas) e os Extras.
 * O resto (Perfil, Amigos, Ajustes, Novidades) é da pessoa e não mora em parte nenhuma.
 */
export type Area = 'anotacoes' | 'analises' | 'utilidades' | 'extras';

/**
 * Uma seção de uma parte: uma aba do índice embaixo do topo. `slug` é o pedaço do caminho depois da
 * parte (e do mural, nas Análises); vazio é o próprio mural.
 */
export interface AreaSection {
  slug: string;
  label: string;
  /** Outras páginas que moram dentro desta seção (o lado a lado é uma vista do mural). */
  also?: string[];
}

/** As seções das Análises, as mesmas em todo mural de resenhas. */
export const REVIEW_SECTIONS: readonly AreaSection[] = [
  { slug: '', label: 'Mural', also: ['lado-a-lado'] },
  { slug: 'pra-depois', label: 'Pra depois' },
  { slug: 'wishlist', label: 'Wishlist' },
];

/**
 * As seções das Anotações: o mural, os quadros Kanban (`/anotacoes/kanban/:quadro`) e o Calendário
 * (`/anotacoes/calendario`). A lista mora em `shared/topo-do-murall.ts`, a mesma do topo do cofre. O Estudo cego entra aqui (e nas rotas) e aparece sozinho no índice.
 */
export const NOTE_SECTIONS: readonly AreaSection[] = SECOES_DAS_ANOTACOES.map((s) => ({ slug: s.slug, label: s.label }));

/**
 * As seções das Utilidades que moram aqui: os Gastos (`/utilidades/gastos`). O cofre vem depois delas,
 * na barra (ver `VAULT_URL`). A lista mora em `shared/topo-do-murall.ts`, a mesma do topo do cofre.
 */
export const UTILITY_SECTIONS: readonly AreaSection[] = SECOES_DAS_UTILIDADES.map((s) => ({ slug: s.slug, label: s.label }));

/** Os Gastos, a primeira das Utilidades (e onde `/utilidades` abre). */
export const SPENDING_PATH = '/utilidades/gastos';

/**
 * O cofre de senhas (PLANO-COFRE.md, 8.6): uma origem só dele. A aba "Cofre" das Utilidades é só um link
 * para lá, na mesma aba do navegador, e só aparece para quem pode usar o cofre.
 */
export const VAULT_URL = COFRE_URL;

/** O caminho de um quadro Kanban (sem quadro: o último aberto, ou o primeiro). */
export function kanbanPath(board?: string): string {
  return '/anotacoes/kanban' + (board ? `/${board}` : '');
}

/** O Calendário das anotações. */
export const CALENDAR_PATH = '/anotacoes/calendario';

/** O caminho de um mural de resenhas, ou de uma seção dele: `/analises/jogos/pra-depois`. */
export function reviewPath(kind: Kind, section = ''): string {
  return `/analises/${kind}` + (section ? `/${section}` : '');
}

/** A parede de um mural: a das anotações, ou a de um mural de resenhas. */
export function wallPath(kind: Kind): string {
  return isNotes(kind) ? '/anotacoes' : reviewPath(kind);
}

/** O caminho aberto, sem query nem fragmento. */
export function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}

/** As páginas de Extras: o Ranking e o Comparar já eram abas e moram lá dentro. */
const EXTRAS = ['/extras', '/ranking', '/comparar'];

/** Em que parte do site fica o caminho (nenhuma, no Perfil, em Amigos, nos Ajustes e nas Novidades). */
export function areaOf(path: string): Area | null {
  const p = pathOf(path);
  if (p === '/anotacoes' || p.startsWith('/anotacoes/')) return 'anotacoes';
  if (p === '/analises' || p.startsWith('/analises/')) return 'analises';
  if (p === '/utilidades' || p.startsWith('/utilidades/')) return 'utilidades';
  if (EXTRAS.some((x) => p === x || p.startsWith(x + '/'))) return 'extras';
  return null;
}

/** Nas Análises: qual mural e qual seção (`''` é o mural; o lado a lado conta como mural). */
export function reviewPlace(path: string): { kind: string; section: string } | null {
  const [area, kind, section = ''] = pathOf(path).split('/').filter(Boolean);
  if (area !== 'analises' || !kind) return null;
  return { kind, section };
}

/** No Pra depois ou na Wishlist de um mural: o botão do topo e o N adicionam à lista. */
export function listOf(path: string): 'fila' | 'wishlist' | null {
  const section = reviewPlace(path)?.section;
  return section === 'pra-depois' ? 'fila' : section === 'wishlist' ? 'wishlist' : null;
}

/** A seção aberta numa parte: a do caminho, ou a que tem o caminho dentro dela. */
export function sectionOf(path: string, sections: readonly AreaSection[]): AreaSection | undefined {
  const p = pathOf(path).split('/').filter(Boolean);
  // nas Análises o mural vem antes da seção: /analises/jogos/pra-depois
  const rest = p[0] === 'analises' ? p.slice(2) : p.slice(1);
  const slug = rest[0] ?? '';
  return sections.find((s) => s.slug === slug || !!s.also?.includes(slug));
}

/** O mural de resenhas de um pedaço do caminho, se ele for um. */
export function scoredKind(v: string | undefined): Kind | null {
  return (SCORED_KINDS as readonly string[]).includes(v ?? '') ? (v as Kind) : null;
}

/** O início ("Murall"): a última parede aberta, a das anotações ou a do último mural de resenhas. */
export const toLastWall: RedirectFunction = () => {
  const mural = inject(Mural);
  return wallPath(isNotes(mural.kind()) ? NOTES : mural.reviewKind());
};

/** As Análises sem mural (e os endereços antigos: /fila, /wishlist): o último mural de resenhas. */
export function toReviews(section = ''): RedirectFunction {
  return () => reviewPath(inject(Mural).reviewKind(), section);
}

/** Entrando nas Anotações: o mural aberto é o de anotações. */
export const enterNotes: CanActivateFn = () => {
  inject(Mural).kind.set(NOTES);
  return true;
};

/**
 * Entrando num mural de resenhas: o do endereço vira o aberto. Um endereço com um mural que não existe
 * (ou o de anotações, que não tem resenhas) vai para o último mural de resenhas, na mesma seção.
 */
export const enterReviews: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const mural = inject(Mural);
  const kind = scoredKind(route.paramMap.get('tipo') ?? undefined);
  if (kind) {
    mural.kind.set(kind);
    return true;
  }
  return inject(Router).parseUrl(reviewPath(mural.reviewKind(), reviewPlace(state.url)?.section));
};

/** Entrando em Extras: os números e os jogos são dos murais de resenhas; vindo das anotações, abre o último. */
export const enterExtras: CanActivateFn = () => {
  const mural = inject(Mural);
  if (isNotes(mural.kind())) mural.kind.set(mural.reviewKind());
  return true;
};
