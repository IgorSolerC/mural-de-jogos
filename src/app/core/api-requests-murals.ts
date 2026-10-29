import type { DesejoV1, FichaV1, MuralV1, PraDepoisV1 } from '../../../contrato/api-v1/murais';
import {
  conferirOpMural,
  regrasDaFicha,
  type CamposDaFicha,
  type CriarFichaV1,
  type EditarDesejoV1,
  type EditarFichaV1,
  type OpMural,
  type PorItemV1,
} from '../../../contrato/api-v1/operacoes-murais';
import { andList } from './api-keys';
import { contextoFichasV1, desejoV1, fichaV1, praDepoisV1 } from './api-mirror-murals';
import { type RequestStamps, onlyOwnSince } from './api-requests-spending';
import { BUILD } from './build';
import { sameGame } from './game-lookup';
import { isMusic } from './kinds';
import { Draft, Kind, PickedGame, Review, Wish, audienceFields, isNote, relevanceLabel, sanitizeDraft, sanitizeReview, sanitizeWish } from './review';
import type { ReviewStore } from './review-store';

/**
 * Os pedidos da Wishlist, do Pra depois e das fichas aplicados pelo site (PLANO-API.md, 9.2; rodada 9),
 * pelas mesmas funções da tela: `saveWish`/`removeWish`, `saveDraft`/`removeDraft` (como o
 * wish-adder) e `ReviewStore.add`/`update` (a ficha nova ganha a cartolina da vez e, com o nome de
 * outra do mural, vira a releitura dela). Tudo passa por `sanitizeWish`, `sanitizeDraft` e
 * `sanitizeReview`; a nota final sai de `computeFinal`, nunca da AI. A capa que a AI não deu é
 * procurada no catálogo do mural (`findCover`, a busca da tela).
 */

export type MuralResult =
  | { desejo: DesejoV1 | null }
  | { pra_depois: PraDepoisV1 | null }
  | { ficha: FichaV1 }
  | { erro: string; desejo?: DesejoV1; pra_depois?: PraDepoisV1; ficha?: FichaV1 };

export interface MuralApplied {
  estado: 'aplicado' | 'conflito' | 'falhou';
  resultado: MuralResult;
  /** O item como era (o Desfazer); null no pôr e no criar. */
  antes: unknown;
  carimbo?: string;
  /** A versão de antes do carimbo (null: o pedido criou). */
  desde?: string | null;
}

export interface MuralApplyContext {
  now: string;
  today: string;
  stamps: RequestStamps;
  /** O item do catálogo do mural com este nome (a capa), ou null (sem achar, sem internet). */
  findCover(kind: Kind, name: string, year: string | undefined): Promise<PickedGame | null>;
  /** Quem vê não é dos desenhos da ficha: o "só no Kanban" das notas não vale aqui. */
  boardOnly?: ReadonlySet<string>;
}

/** É um pedido dos murais de resenhas? */
export function isMuralOp(op: string): boolean {
  return op.startsWith('desejo.') || op.startsWith('pra-depois.') || op.startsWith('ficha.');
}

const failed = (erro: string, extra: Partial<Record<'desejo' | 'pra_depois' | 'ficha', unknown>> = {}): MuralApplied => ({
  estado: 'falhou',
  resultado: { erro, ...extra } as MuralResult,
  antes: null,
});

/** O item do catálogo pelo nome, com o que a AI disse por cima (o nome, o ano e o por dela valem). */
async function itemOf(kind: Kind, d: { nome: string; ano?: string | null; por?: string | null; capa?: string | null; buscar_capa?: false }, ctx: MuralApplyContext): Promise<PickedGame> {
  const own: PickedGame = { name: d.nome, coverUrl: d.capa ?? null, source: 'manual', ...(d.ano ? { year: d.ano } : {}), ...(d.por ? { by: d.por } : {}) };
  if (d.capa || d.buscar_capa === false) return own;
  const found = await ctx.findCover(kind, d.nome, d.ano ?? undefined).catch(() => null);
  if (!found?.coverUrl) return own;
  return { ...found, name: d.nome, ...(d.ano ? { year: d.ano } : {}), ...(d.por ? { by: d.por } : {}) };
}

/** Os campos da ficha no formato do Murall, por cima de `base` (o que a v1 não mostra fica). */
function reviewWith(base: Review, d: CamposDaFicha, game: PickedGame, now: string): Review {
  const next: Review = { ...base, game: { ...game, ...(isMusic(base.kind) && d.forma ? { form: d.forma } : {}) } };
  if (d.notas) next.scores = { ...base.scores, ...Object.fromEntries(Object.entries(d.notas).map(([k, v]) => [k, v])) };
  if (d.status) next.status = d.status;
  if (d.dificuldade) next.difficulty = d.dificuldade;
  if (d.veredito !== undefined) next.verdict = d.veredito;
  if (d.quantidade !== undefined) next.hoursPlayed = d.quantidade;
  if (d.texto !== undefined) next.text = d.texto;
  if (d.concluida_em !== undefined) next.completedAt = d.concluida_em;
  if (isMusic(base.kind) && d.artista !== undefined) {
    if (d.artista) next.category = d.artista;
    else delete next.category;
  }
  if (d.visibilidade !== undefined) {
    delete next.private;
    delete next.quiet;
    delete next.publishedAt;
    // Público vai para o Feed, como o Pregar da tela
    Object.assign(next, audienceFields(d.visibilidade === 'publica' ? 'publicar' : 'privada', base, now));
  }
  return next;
}

/** Aplica um pedido dos murais e diz como foi. */
export async function applyMuralRequest(store: ReviewStore, req: { op: string; alvo: string; dados: unknown }, ctx: MuralApplyContext): Promise<MuralApplied> {
  const op = req.op as OpMural;
  const checked = conferirOpMural(op, req.dados);
  if (!checked.ok) return failed(`${checked.erro} (campo ${checked.campo})`);
  const now = ctx.now;
  const stamped = (before: { id: string; updatedAt: string }, after: { updatedAt: string }) => ({ carimbo: after.updatedAt, desde: before.updatedAt });

  switch (op) {
    case 'desejo.por':
    case 'pra-depois.por': {
      const wish = op === 'desejo.por';
      const there = wish ? store.getWish(req.alvo) : store.getDraft(req.alvo);
      // já entrou (aplicado aqui antes, numa aba que fechou sem concluir): o mesmo id, nada de novo
      if (there) return { estado: 'aplicado', resultado: wish ? { desejo: desejoV1(there as Wish) } : { pra_depois: praDepoisV1(there) }, antes: null };
      const d = checked.dados as PorItemV1;
      const kind = d.mural as Kind;
      const probe: PickedGame = { name: d.nome, coverUrl: null, source: 'manual', ...(d.ano ? { year: d.ano } : {}) };
      const list: (Wish | Draft)[] = wish ? store.wishes() : store.drafts();
      const dup = list.find((x) => x.kind === kind && sameGame(x.game, probe));
      if (dup) return failed(`“${dup.game.name}” já está ${wish ? 'na wishlist' : 'no Pra depois'} (id ${dup.id}).`);
      const game = await itemOf(kind, d, ctx);
      if (wish) {
        const w = sanitizeWish({ id: req.alvo, kind, game, ...(d.relevancia ? { relevance: d.relevancia } : {}), createdAt: now, updatedAt: now });
        if (!w || w.id !== req.alvo) return failed('O desejo não pôde ser guardado.');
        store.saveWish(w);
        return { estado: 'aplicado', resultado: { desejo: desejoV1(store.getWish(w.id) ?? w) }, antes: null, carimbo: w.updatedAt, desde: null };
      }
      const draft = sanitizeDraft({ id: req.alvo, kind, game, createdAt: now, updatedAt: now });
      if (!draft || draft.id !== req.alvo) return failed('O item não pôde ser guardado.');
      store.saveDraft(draft);
      // estava na wishlist: agora está no Pra depois, e a wishlist não fica com o mesmo título (como na tela)
      const wished = store.wishes().find((w) => w.kind === kind && sameGame(w.game, game));
      if (wished) store.removeWish(wished.id);
      return { estado: 'aplicado', resultado: { pra_depois: praDepoisV1(draft) }, antes: null, carimbo: draft.updatedAt, desde: null };
    }
    case 'desejo.editar':
    case 'desejo.tirar': {
      const before = store.getWish(req.alvo);
      if (!before) return failed('O desejo não existe mais na wishlist.');
      if (!onlyOwnSince(before.id, before.updatedAt, (checked.dados as { versao: string }).versao, ctx.stamps)) {
        return { estado: 'conflito', resultado: { erro: 'O desejo mudou depois que você o leu. Leia de novo e mande a versao nova.', desejo: desejoV1(before) }, antes: null };
      }
      if (op === 'desejo.tirar') {
        store.removeWish(before.id);
        return { estado: 'aplicado', resultado: { desejo: null }, antes: before };
      }
      const e = checked.dados as EditarDesejoV1;
      const game: PickedGame = { ...before.game };
      if (e.nome !== undefined) game.name = e.nome;
      if (e.ano !== undefined) game.year = e.ano ?? undefined;
      if (e.por !== undefined) game.by = e.por ?? undefined;
      if (e.capa !== undefined) game.coverUrl = e.capa;
      const { relevance: _r, ...rest } = before;
      const relevance = e.relevancia ?? before.relevance ?? 'comum';
      const next = sanitizeWish({ ...rest, game, ...(relevance === 'comum' ? {} : { relevance }), updatedAt: now });
      if (!next) return failed('O desejo não pôde ser guardado.', { desejo: desejoV1(before) });
      store.saveWish(next);
      return { estado: 'aplicado', resultado: { desejo: desejoV1(next) }, antes: before, ...stamped(before, next) };
    }
    case 'pra-depois.tirar': {
      const before = store.getDraft(req.alvo);
      if (!before) return failed('O item não existe mais no Pra depois.');
      if (!onlyOwnSince(before.id, before.updatedAt, (checked.dados as { versao: string }).versao, ctx.stamps)) {
        return { estado: 'conflito', resultado: { erro: 'O item mudou depois que você o leu. Leia de novo e mande a versao nova.', pra_depois: praDepoisV1(before) }, antes: null };
      }
      store.removeDraft(before.id);
      return { estado: 'aplicado', resultado: { pra_depois: null }, antes: before };
    }
    case 'ficha.criar': {
      const there = store.get(req.alvo);
      if (there && !isNote(there)) return { estado: 'aplicado', resultado: { ficha: fichaV1(there, ctx.boardOnly) }, antes: null };
      const d = checked.dados as CriarFichaV1;
      const kind = d.mural as Kind;
      const perfil = contextoFichasV1([]).murais.find((m) => m.mural === d.mural)!;
      const broken = regrasDaFicha(d, perfil);
      if (broken) return failed(`${broken.erro} (campo ${broken.campo})`);
      const game = await itemOf(kind, d, ctx);
      const blank = {
        id: req.alvo,
        kind,
        game,
        scores: {},
        status: 'finalizado',
        difficulty: 'nenhuma',
        verdict: null,
        weights: {},
        bonuses: [],
        hoursPlayed: null,
        text: '',
        completedAt: ctx.today,
        // nasce privada: só a chave com `publicar` diz outra coisa
        ...audienceFields('privada', null, now),
        createdAt: now,
        updatedAt: now,
      } as unknown as Review;
      const review = sanitizeReview(reviewWith(blank, d, game, now), BUILD);
      if (!review || review.id !== req.alvo) return failed('A ficha não pôde ser criada (dê pelo menos uma nota do mural).');
      store.add(review);
      const born = store.get(review.id) ?? review;
      return { estado: 'aplicado', resultado: { ficha: fichaV1(born, ctx.boardOnly) }, antes: null, carimbo: born.updatedAt, desde: null };
    }
    case 'ficha.editar': {
      const found = store.get(req.alvo);
      const before = found && !isNote(found) ? found : undefined;
      if (!before) return failed('A ficha não existe mais.');
      const e = checked.dados as EditarFichaV1;
      if (!onlyOwnSince(before.id, before.updatedAt, e.versao, ctx.stamps)) {
        return { estado: 'conflito', resultado: { erro: 'A ficha mudou depois que você a leu. Leia de novo e mande a versao nova.', ficha: fichaV1(before, ctx.boardOnly) }, antes: null };
      }
      const { versao: _v, ...campos } = e;
      const perfil = contextoFichasV1([]).murais.find((m) => m.mural === (before.kind as MuralV1))!;
      const broken = regrasDaFicha(campos, perfil);
      if (broken) return failed(`${broken.erro} (campo ${broken.campo})`, { ficha: fichaV1(before, ctx.boardOnly) });
      const game: PickedGame = { ...before.game };
      if (campos.nome !== undefined) game.name = campos.nome;
      if (campos.ano !== undefined) game.year = campos.ano ?? undefined;
      if (campos.por !== undefined) game.by = campos.por ?? undefined;
      if (campos.capa !== undefined) game.coverUrl = campos.capa;
      const next = sanitizeReview({ ...reviewWith(before, campos, game, now), updatedAt: now }, BUILD);
      if (!next) return failed('A ficha ficaria sem nenhuma nota.', { ficha: fichaV1(before, ctx.boardOnly) });
      store.update(next, before);
      const after = store.get(before.id) ?? next;
      return { estado: 'aplicado', resultado: { ficha: fichaV1(after, ctx.boardOnly) }, antes: before, ...stamped(before, after) };
    }
    default:
      return failed('Este site não sabe aplicar esse pedido.');
  }
}

const FIELD_WORDS: Record<string, string> = {
  nome: 'o nome',
  ano: 'o ano',
  por: 'o autor',
  capa: 'a capa',
  relevancia: 'a relevância',
  notas: 'as notas',
  status: 'o status',
  dificuldade: 'a dificuldade',
  veredito: 'o veredito',
  quantidade: 'a quantidade',
  texto: 'o texto',
  concluida_em: 'o dia',
  visibilidade: 'quem vê',
  forma: 'a forma',
  artista: 'o artista',
};

/** Onde fica a ficha ("nos jogos"). */
const IN_MURAL: Record<string, string> = { jogos: 'nos jogos', livros: 'nos livros', filmes: 'nos filmes', series: 'nas séries', animes: 'nos animes', musicas: 'nas músicas' };
/** De que mural é a lista ("a wishlist dos jogos"). */
const OF_MURAL: Record<string, string> = { jogos: 'dos jogos', livros: 'dos livros', filmes: 'dos filmes', series: 'das séries', animes: 'dos animes', musicas: 'das músicas' };

/**
 * O pedido dos murais em palavras: "Pôr “Silksong” na wishlist dos jogos (MUST PLAY)" (esperando) ou
 * "pôs …" (no histórico, `past`). `title` é o nome do item, já resolvido.
 */
export function muralWords(op: string, dados: unknown, title: string, past = false): string | null {
  const d = (dados ?? {}) as Record<string, unknown>;
  const v = (now: string, then: string) => (past ? then : now);
  const t = `“${title}”`;
  const mural = typeof d['mural'] === 'string' && IN_MURAL[d['mural']] ? d['mural'] : null;
  const where = mural ? ` ${IN_MURAL[mural]}` : '';
  const of = mural ? ` ${OF_MURAL[mural]}` : '';
  switch (op) {
    case 'desejo.por': {
      const rel = d['relevancia'] === 'must' || d['relevancia'] === 'later' ? ` (${relevanceLabel((d['mural'] as Kind) ?? 'jogos', d['relevancia'])})` : '';
      return `${v('Pôr', 'pôs')} ${t} na wishlist${of}${rel}`;
    }
    case 'desejo.editar': {
      if (d['relevancia'] !== undefined && Object.keys(d).length === 2) return `${v('Mudar', 'mudou')} a relevância de ${t} para ${String(d['relevancia']).toUpperCase()}`;
      const fields = Object.keys(FIELD_WORDS).filter((k) => d[k] !== undefined);
      return `${v('Mudar', 'mudou')} ${fields.length ? `${andList(fields.map((k) => FIELD_WORDS[k]!))} de ` : ''}${t} na wishlist`;
    }
    case 'desejo.tirar':
      return `${v('Tirar', 'tirou')} ${t} da wishlist`;
    case 'pra-depois.por':
      return `${v('Pôr', 'pôs')} ${t} no Pra depois${of}`;
    case 'pra-depois.tirar':
      return `${v('Tirar', 'tirou')} ${t} do Pra depois`;
    case 'ficha.criar':
      return `${v('Criar', 'criou')} a ficha de ${t}${where}`;
    case 'ficha.editar': {
      const fields = Object.keys(FIELD_WORDS).filter((k) => d[k] !== undefined);
      return `${v('Mudar', 'mudou')} ${fields.length ? `${andList(fields.map((k) => FIELD_WORDS[k]!))} da ficha de ` : 'a ficha de '}${t}`;
    }
    default:
      return null;
  }
}

/** O nome que a pessoa reconhece num pedido dos murais: o do pedido, o de agora, o de depois, o de antes. */
export function muralTitle(store: ReviewStore, t: { op: string; alvo: string; dados: unknown; resultado?: unknown; antes?: unknown }): string {
  const named = (t.dados as { nome?: string } | null)?.nome;
  if (t.op.endsWith('.por') || t.op === 'ficha.criar') return named ?? 'um item';
  const now = t.op.startsWith('ficha.') ? store.get(t.alvo)?.game.name : t.op.startsWith('desejo.') ? store.getWish(t.alvo)?.game.name : store.getDraft(t.alvo)?.game.name;
  const r = (t.resultado ?? {}) as { desejo?: DesejoV1 | null; pra_depois?: PraDepoisV1 | null; ficha?: FichaV1 };
  return now ?? r.desejo?.nome ?? r.pra_depois?.nome ?? r.ficha?.nome ?? (t.antes as { game?: { name?: string } } | null)?.game?.name ?? 'um item que não existe mais';
}

/**
 * Desfaz um pedido dos murais aplicado: o posto sai, o tirado volta (`restoreWish`/`restoreDraft`), o
 * desejo e a ficha mudados voltam como eram (carimbados agora, para valer nos outros aparelhos); a ficha
 * criada sai (guardada antes em Versões guardadas, se mudou depois).
 */
export function undoMural(store: ReviewStore, t: { op: string; alvo: string; antes?: unknown; resultado?: unknown }): void {
  const now = new Date().toISOString();
  switch (t.op) {
    case 'desejo.por':
      store.removeWish(t.alvo);
      return;
    case 'pra-depois.por':
      store.removeDraft(t.alvo);
      return;
    case 'desejo.tirar': {
      const w = sanitizeWish(t.antes);
      if (w) store.restoreWish(w);
      return;
    }
    case 'pra-depois.tirar': {
      const d = sanitizeDraft(t.antes);
      if (d) store.restoreDraft(d);
      return;
    }
    case 'desejo.editar': {
      const w = sanitizeWish(t.antes);
      if (w) store.saveWish({ ...w, updatedAt: now });
      return;
    }
    case 'ficha.criar': {
      const cur = store.get(t.alvo);
      if (!cur || isNote(cur)) return;
      const after = (t.resultado as { ficha?: FichaV1 } | null)?.ficha;
      // mexida depois do pedido: a de agora não se perde
      if (cur.updatedAt !== after?.versao) store.keepVersions([cur], 'api', false);
      store.remove(cur.id);
      return;
    }
    case 'ficha.editar': {
      const before = sanitizeReview(t.antes, BUILD);
      const cur = store.get(t.alvo);
      if (!before || isNote(before)) return;
      if (cur && cur.updatedAt !== (t.resultado as { ficha?: FichaV1 } | null)?.ficha?.versao) store.keepVersions([cur], 'api', false);
      store.update({ ...before, updatedAt: now });
    }
  }
}
