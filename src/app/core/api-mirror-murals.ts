import type { ContextoFichasV1, DesejoV1, FichaV1, MuralV1, PraDepoisV1 } from '../../../contrato/api-v1/murais';
import { CONTEXTO_FICHAS } from '../../../contrato/api-v1/murais';
import { KIND_PROFILES, SCORED_KINDS, isMusic } from './kinds';
import { Draft, Review, SCORE_LABEL, Wish, isNote, musicFormOf, relevanceOf, shownToOthers } from './review';

/**
 * Os murais de resenhas no espelho da API das AIs (PLANO-API.md, seção 8; rodada 9): cada desejo da
 * wishlist, cada pra depois e cada ficha em v1, e o contexto com o que cada mural tem, tirado de
 * `KIND_PROFILES` (core/kinds.ts): as quatro notas e o peso delas, os nomes dos status, a dificuldade e
 * a quantidade. A nota final é a que a ficha já guarda (`computeFinal`, ou a dada na mão). Só funções
 * puras; quem chama é `ApiMirror`.
 */

/** O item da wishlist ou do Pra depois (sem a relevância, que só o desejo tem). */
function itemV1(x: Draft | Wish): PraDepoisV1 {
  return {
    id: x.id,
    mural: x.kind as MuralV1,
    nome: x.game.name,
    ano: x.game.year ?? null,
    por: x.game.by ?? null,
    capa: x.game.coverUrl,
    criado_em: x.createdAt,
    versao: x.updatedAt,
  };
}

export function desejoV1(w: Wish): DesejoV1 {
  const { criado_em, versao, ...rest } = itemV1(w);
  return { ...rest, relevancia: relevanceOf(w), criado_em, versao };
}

export function praDepoisV1(d: Draft): PraDepoisV1 {
  return itemV1(d);
}

/** Uma ficha em v1 (o "quem vê" de verdade, como o das notas). */
export function fichaV1(r: Review, boardOnly: ReadonlySet<string> = new Set()): FichaV1 {
  const profile = KIND_PROFILES[r.kind];
  const music = isMusic(r.kind);
  return {
    id: r.id,
    mural: r.kind as MuralV1,
    nome: r.game.name,
    por: r.game.by ?? null,
    ano: r.game.year ?? null,
    capa: r.game.coverUrl,
    forma: music ? musicFormOf(r.game) : null,
    artista: music ? (r.category ?? null) : null,
    nota_final: r.scores.final,
    notas: Object.fromEntries(profile.categories.map((c) => [c.key, r.scores[c.key] ?? null])),
    nota_final_na_mao: r.finalOverride !== undefined,
    status: r.status,
    dificuldade: profile.difficulty ? r.difficulty : null,
    veredito: r.verdict,
    quantidade: profile.amount ? r.hoursPlayed : null,
    texto: r.text,
    concluida_em: r.completedAt,
    visibilidade: shownToOthers(r, boardOnly) ? 'publica' : 'privada',
    releitura_de: r.revisitOf ?? null,
    criada_em: r.createdAt,
    versao: r.updatedAt,
  };
}

/** O que cada mural de resenhas tem, com quantas fichas há nele. */
export function contextoFichasV1(reviews: readonly Review[]): ContextoFichasV1 {
  return {
    murais: SCORED_KINDS.map((kind) => {
      const p = KIND_PROFILES[kind];
      return {
        mural: kind as MuralV1,
        nome: p.plural,
        notas: p.categories.map((c) => ({ id: c.key, nome: SCORE_LABEL[c.key], peso: c.base })),
        status: { ...p.status },
        dificuldade: p.difficulty,
        quantidade: p.amount ? { unidade: p.amount.unit, fracao: p.amount.decimals } : null,
        releitura: p.revisit.one,
        fichas: reviews.filter((r) => r.kind === kind).length,
      };
    }),
  };
}

type MuralItem =
  | { tipo: 'desejo'; id: string; dados: DesejoV1 }
  | { tipo: 'pra-depois'; id: string; dados: PraDepoisV1 }
  | { tipo: 'ficha'; id: string; dados: FichaV1 }
  | { tipo: 'contexto-fichas'; id: string; dados: ContextoFichasV1 };

/** O que os murais mandam ao espelho, só das áreas pedidas (as anotações nunca). */
export function muralsMirror(
  src: { wishes: readonly Wish[]; drafts: readonly Draft[]; reviews: readonly Review[]; boardOnly: ReadonlySet<string> },
  areas: readonly string[],
): MuralItem[] {
  const scored = (k: string) => (SCORED_KINDS as readonly string[]).includes(k);
  const out: MuralItem[] = [];
  if (areas.includes('desejos')) for (const w of src.wishes) if (scored(w.kind)) out.push({ tipo: 'desejo', id: w.id, dados: desejoV1(w) });
  if (areas.includes('pra-depois')) for (const d of src.drafts) if (scored(d.kind)) out.push({ tipo: 'pra-depois', id: d.id, dados: praDepoisV1(d) });
  if (areas.includes('fichas')) {
    const reviews = src.reviews.filter((r) => !isNote(r));
    for (const r of reviews) out.push({ tipo: 'ficha', id: r.id, dados: fichaV1(r, src.boardOnly) });
    out.push({ tipo: 'contexto-fichas', id: CONTEXTO_FICHAS, dados: contextoFichasV1(reviews) });
  }
  return out;
}
