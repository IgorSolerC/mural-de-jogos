import type { ContextoDesejosV1, ContextoFichasV1, DesejoNoEspelhoV1, DesejoV1, FichaV1, MuralV1, PastaDesejoV1, PraDepoisV1 } from '../../../contrato/api-v1/murais';
import { CONTEXTO_DESEJOS, CONTEXTO_FICHAS, desejoParaOEspelho } from '../../../contrato/api-v1/murais';
import type { PastaDesfeitaV1 } from '../../../contrato/api-v1/notas';
import { FolderTree, NO_FOLDERS } from './folders';
import { wishFolderGroup } from './mural-config';
import { wishTagCounts } from './wishlist-view';
import { KIND_PROFILES, SCORED_KINDS, isMusic } from './kinds';
import { Draft, Review, SCORE_LABEL, Wish, isNote, musicFormOf, relevanceOf, shownToOthers } from './review';

/**
 * Os murais de resenhas no espelho da API das AIs (PLANO-API.md, seção 8; rodada 9): cada desejo da
 * wishlist, cada pra depois e cada ficha em v1, e o contexto com o que cada mural tem, tirado de
 * `KIND_PROFILES` (core/kinds.ts): as quatro notas e o peso delas, os nomes dos status, a dificuldade e
 * a quantidade. A nota final é a que a ficha já guarda (`computeFinal`, ou a dada na mão). Só funções
 * puras; quem chama é `ApiMirror`.
 */

/**
 * A capa para a API: só a que tem link. A capa sem link (a imagem do aparelho ou uma pixel art, guardadas pelo id
 * delas) não abre fora do Murall, e a v1 só aceita https: com ela, a nuvem recusava a ficha, e a ficha ficava
 * fora do espelho.
 */
const linkedCover = (url: string | null | undefined): string | null => (url && /^https:\/\//.test(url) ? url : null);

/** O item da wishlist ou do Pra depois (sem a relevância, que só o desejo tem). */
function itemV1(x: Draft | Wish): PraDepoisV1 {
  return {
    id: x.id,
    mural: x.kind as MuralV1,
    nome: x.game.name,
    ano: x.game.year ?? null,
    por: x.game.by ?? null,
    capa: linkedCover(x.game.coverUrl),
    criado_em: x.createdAt,
    versao: x.updatedAt,
  };
}

/**
 * Um desejo em v1: com as tags, a descrição e a pasta da Wishlist do mural (o id da viva e o caminho; a desfeita
 * leva à de cima, como na tela).
 */
export function desejoV1(w: Wish, tree: FolderTree = NO_FOLDERS): DesejoV1 {
  const { criado_em, versao, ...rest } = itemV1(w);
  const at = tree.resolve(w.folder, wishFolderGroup(w.kind));
  const caminho = tree.path(at).map((f) => f.name);
  return {
    ...rest,
    relevancia: relevanceOf(w),
    tags: [...(w.tags ?? [])],
    pasta: at && caminho.length ? { id: at, caminho } : null,
    descricao: w.note ?? null,
    criado_em,
    versao,
  };
}

/** O id da pasta escrito no desejo, se é de uma pasta (viva ou desfeita) da Wishlist do mural dele. */
function storedWishFolder(tree: FolderTree, w: Wish): string | null {
  const f = w.folder ? tree.index.get(w.folder) : undefined;
  return f && f.group === wishFolderGroup(w.kind) ? f.id : null;
}

/**
 * O desejo como o espelho guarda: a pasta pelo id escrito no desejo (que pode ser de uma desfeita): desfazer ou
 * renomear uma pasta muda só o contexto, e a impressão dos desejos dela fica a mesma.
 */
export function desejoNoEspelho(w: Wish, tree: FolderTree = NO_FOLDERS): DesejoNoEspelhoV1 {
  return desejoParaOEspelho(desejoV1(w, tree), storedWishFolder(tree, w));
}

/**
 * O vocabulário das Wishlists: as pastas de cada mural (de A a Z, cada uma depois da de cima, com quantos
 * desejos tem com os de dentro) e as tags (as mais usadas primeiro); e as desfeitas que algum desejo ainda
 * guarda, com a viva que vale (em ordem de id: a impressão não muda à toa).
 */
export function contextoDesejosV1(wishes: readonly Wish[], tree: FolderTree = NO_FOLDERS): ContextoDesejosV1 {
  const desfeitas = new Map<string, string | null>();
  const murais = SCORED_KINDS.map((kind) => {
    const group = wishFolderGroup(kind);
    const list = wishes.filter((w) => w.kind === kind);
    const counts = new Map<string, number>();
    for (const w of list) {
      const stored = storedWishFolder(tree, w);
      const at = tree.resolve(w.folder, group);
      if (stored && tree.index.get(stored)!.gone && !desfeitas.has(stored)) desfeitas.set(stored, at);
      for (const f of tree.path(at)) counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
    }
    const pastas: PastaDesejoV1[] = [];
    const walk = (parent: string | null) => {
      for (const f of tree.kids(group, parent)) {
        pastas.push({ id: f.id, nome: f.name, pai: parent, desejos: counts.get(f.id) ?? 0 });
        walk(f.id);
      }
    };
    walk(null);
    return { mural: kind as MuralV1, desejos: list.length, pastas, tags: wishTagCounts(list).map((t) => ({ nome: t.label, desejos: t.n })) };
  });
  const gone: PastaDesfeitaV1[] = [...desfeitas].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, viva]) => ({ id, viva }));
  return { murais, ...(gone.length ? { desfeitas: gone } : {}) };
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
    capa: linkedCover(r.game.coverUrl),
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
  | { tipo: 'desejo'; id: string; dados: DesejoNoEspelhoV1 }
  | { tipo: 'contexto-desejos'; id: string; dados: ContextoDesejosV1 }
  | { tipo: 'pra-depois'; id: string; dados: PraDepoisV1 }
  | { tipo: 'ficha'; id: string; dados: FichaV1 }
  | { tipo: 'contexto-fichas'; id: string; dados: ContextoFichasV1 };

/** O que os murais mandam ao espelho, só das áreas pedidas (as anotações nunca). */
export function muralsMirror(
  src: { wishes: readonly Wish[]; drafts: readonly Draft[]; reviews: readonly Review[]; boardOnly: ReadonlySet<string>; tree?: FolderTree },
  areas: readonly string[],
): MuralItem[] {
  const scored = (k: string) => (SCORED_KINDS as readonly string[]).includes(k);
  const out: MuralItem[] = [];
  if (areas.includes('desejos')) {
    const wishes = src.wishes.filter((w) => scored(w.kind));
    for (const w of wishes) out.push({ tipo: 'desejo', id: w.id, dados: desejoNoEspelho(w, src.tree) });
    out.push({ tipo: 'contexto-desejos', id: CONTEXTO_DESEJOS, dados: contextoDesejosV1(wishes, src.tree) });
  }
  if (areas.includes('pra-depois')) for (const d of src.drafts) if (scored(d.kind)) out.push({ tipo: 'pra-depois', id: d.id, dados: praDepoisV1(d) });
  if (areas.includes('fichas')) {
    const reviews = src.reviews.filter((r) => !isNote(r));
    for (const r of reviews) out.push({ tipo: 'ficha', id: r.id, dados: fichaV1(r, src.boardOnly) });
    out.push({ tipo: 'contexto-fichas', id: CONTEXTO_FICHAS, dados: contextoFichasV1(reviews) });
  }
  return out;
}
