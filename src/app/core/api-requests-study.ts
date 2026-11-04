import { dobra } from '../../../contrato/api-v1/escopos';
import type { NivelV1 } from '../../../contrato/api-v1/estudos';
import type { CartaNovaV1 } from '../../../contrato/api-v1/operacoes';
import {
  conferirOpEstudo,
  ehOpEstudo,
  type CriarBaralhoV1,
  type EditarBaralhoV1,
  type EditarCartaV1,
  type FrenteV1,
  type OpEstudo,
  type PorCartaV1,
  type ResponderV1,
} from '../../../contrato/api-v1/operacoes-estudos';
import { andList } from './api-keys';
import type { ColumnNames } from './api-requests-kanban';
import { studyDay } from './fsrs';
import { LightStock } from './review';
import {
  CardFront,
  Deck,
  DeckPatch,
  MAX_CARDS,
  MAX_DECKS,
  StudyCard,
  cardDecks,
  cleanFront,
  frontTitle,
  levelOf,
  sanitizeCard,
  sanitizeDeck,
  type CardLook,
} from './study';
import type { StudyStore } from './study-store';

/**
 * Os pedidos dos Estudos aplicados pelo site (PLANO-API.md, seção 23, rodada 12), pelas mesmas funções
 * da tela (o `StudyStore`): criar, mudar e apagar baralhos; virar carta, mudar a frente, os baralhos e o
 * "no mural", tirar e recomeçar; e responder, com o FSRS do app contando a hora do pedido (quando a
 * pessoa respondeu). Cada um guarda o de antes, para o Desfazer do histórico.
 */

/** O que a AI lê depois: o baralho, ou a carta como ficou (null: saiu), ou o porquê de não ter entrado. */
export type StudyResult =
  | { baralho: { id: string; nome: string } | null; aviso?: string }
  | { carta: { nota: string; titulo: string; baralhos: string[]; nivel: NivelV1; volta_em: string | null } | null; aviso?: string }
  | { erro: string };

export interface StudyApplied {
  estado: 'aplicado' | 'conflito' | 'falhou';
  resultado: StudyResult;
  antes: unknown;
}

export interface StudyApplyContext {
  /** A anotação é sua (não compartilhada) e existe: o nome dela, ou undefined. */
  ownNote(id: string): { name: string } | undefined;
  /** A anotação está no mural agora (fora das só no Kanban)? A que vira carta continua lá. */
  onWall(id: string): boolean;
}

/** É um pedido dos Estudos? */
export function isStudyOp(op: string): op is OpEstudo {
  return ehOpEstudo(op);
}

const failed = (erro: string): StudyApplied => ({ estado: 'falhou', resultado: { erro }, antes: null });

/** O de antes de uma carta (o Desfazer põe de volta). */
interface CardBefore {
  carta: StudyCard | null;
  /** A hora da carta logo depois do pedido: mexida depois disso, o Desfazer não passa por cima. */
  depois?: string | null;
  /** Na resposta: o dia de estudo, e o que ela somou nele (a nova do baralho, ou a revisão). */
  dia?: string;
  conta?: 'nova' | 'revisao' | null;
  baralho?: string | null;
}

/** A frente nova: a de agora com os campos do pedido por cima (null ou vazio tira). */
function frontWith(cur: CardFront, d: FrenteV1): CardFront {
  return cleanFront({
    title: d.titulo !== undefined ? (d.titulo ?? '') : cur.title,
    subtitle: d.subtitulo !== undefined ? (d.subtitulo ?? '') : cur.subtitle,
    image: d.imagem !== undefined ? (d.imagem ?? '') : cur.image,
  });
}

const hasFront = (d: FrenteV1) => d.titulo !== undefined || d.subtitulo !== undefined || d.imagem !== undefined;

/**
 * Os baralhos do pedido que a anotação pode ter (os que existem aqui e são do grupo dela), e o aviso dos
 * que sumiram ou são de outro grupo (PLANO-ESTUDOS-GRUPOS.md).
 */
function liveDecks(study: StudyStore, note: string, ids: readonly string[]): { ids: string[]; aviso: string | null; erro: string } {
  const there = ids.filter((id) => !!study.deck(id));
  const ok = study.decksFor(note, there);
  const gone = ids.length - there.length;
  const other = there.length - ok.length;
  const group = study.groupOf(note)?.trim();
  const where = group ? `do grupo ${group}, o da anotação` : 'de nenhum grupo, porque a anotação não tem grupo';
  const parts = [
    gone ? (gone === 1 ? 'um baralho do pedido não existe mais' : `${gone} baralhos do pedido não existem mais`) : '',
    other ? (other === 1 ? `um baralho do pedido não é ${where}` : `${other} baralhos do pedido não são ${where}`) : '',
  ].filter(Boolean);
  const aviso = parts.length ? `${parts.join(' e ')}: a carta ficou nos outros.` : null;
  const erro = other ? `Os baralhos do pedido não são ${where} (um baralho só tem cartas do grupo dele).` : 'Os baralhos do pedido não existem mais.';
  return { ids: ok, aviso: aviso && aviso[0].toUpperCase() + aviso.slice(1), erro };
}

/** A carta como a AI lê no resultado. */
function cardOut(study: StudyStore, note: string, name: string) {
  const c = study.cardOf().get(note);
  return c ? { nota: c.note, titulo: frontTitle(c, name), baralhos: [...c.decks], nivel: levelOf(c.srs), volta_em: c.srs.state === 'nova' ? null : c.srs.due } : null;
}

/** A hora da carta agora (null: não é carta). */
const stampOf = (study: StudyStore, note: string) => study.cardOf().get(note)?.at ?? null;

/** O deck como a AI lê no resultado. */
const deckOut = (d: Deck | undefined) => (d ? { id: d.id, nome: d.name } : null);

/** O que mudar num baralho (do pedido para o formato do Murall). */
function deckPatch(d: EditarBaralhoV1 | CriarBaralhoV1): Partial<DeckPatch> {
  const out: Partial<DeckPatch> = {};
  if (d.nome !== undefined) out.name = d.nome;
  if (d.cor !== undefined) out.color = d.cor as LightStock;
  if (d.novas_por_dia !== undefined) out.newPerDay = d.novas_por_dia;
  if (d.no_mural !== undefined) out.wall = d.no_mural ? true : undefined;
  if (d.estilo !== undefined) out.look = (d.estilo === 'classica' ? undefined : d.estilo) as Exclude<CardLook, 'classica'> | undefined;
  return out;
}

/** Outro baralho com este nome (sem ligar para acento e caixa)? */
const sameName = (study: StudyStore, name: string, except?: string) => study.decks().find((d) => d.id !== except && dobra(d.name) === dobra(name));

/** Aplica um pedido dos Estudos, pelo `StudyStore`, e diz como foi. */
export function applyStudyRequest(
  study: StudyStore,
  req: { op: string; alvo: string; dados: unknown; criado_em: string },
  ctx: StudyApplyContext,
): StudyApplied {
  if (!isStudyOp(req.op)) return failed('Um pedido que este site ainda não conhece.');
  const op = req.op;
  const checked = conferirOpEstudo(op, req.dados);
  if (!checked.ok) return failed(`${checked.erro} (campo ${checked.campo})`);
  const id = req.alvo;

  if (op === 'baralho.criar') {
    const d = checked.dados as CriarBaralhoV1;
    // já entrou (aplicado aqui antes, numa aba que fechou sem concluir): o mesmo baralho
    if (study.deck(id)) return { estado: 'aplicado', resultado: { baralho: deckOut(study.deck(id)) }, antes: null };
    const same = sameName(study, d.nome);
    if (same) return failed(`Já existe o baralho “${same.name}”.`);
    if (study.decks().length >= MAX_DECKS) return failed(`Os Estudos têm até ${MAX_DECKS} baralhos.`);
    const made = study.addDeck(d.nome, (d.cor ?? 'amarelo') as LightStock, null, id);
    if (!made) return failed('O baralho não pôde ser criado.');
    const { nome: _n, cor: _c, ...rest } = d;
    const patch = deckPatch(rest);
    if (Object.keys(patch).length) study.updateDeck(made, patch);
    return { estado: 'aplicado', resultado: { baralho: deckOut(study.deck(made)) }, antes: null };
  }

  if (op === 'baralho.editar' || op === 'baralho.apagar') {
    const deck = study.deck(id);
    if (!deck) return failed('O baralho não existe mais.');
    const posicao = study.decks().indexOf(deck);
    if (op === 'baralho.apagar') {
      // as guardadas (também as que dormem nele), para o Desfazer trazer todas
      const cartas = study.state().cards.filter((c) => c.decks.includes(id));
      study.removeDeck(id);
      return { estado: 'aplicado', resultado: { baralho: null }, antes: { baralho: deck, cartas, posicao } };
    }
    const d = checked.dados as EditarBaralhoV1;
    if (d.nome !== undefined) {
      const same = sameName(study, d.nome, id);
      if (same) return failed(`Já existe o baralho “${same.name}”.`);
    }
    const patch = deckPatch(d);
    if (Object.keys(patch).length) study.updateDeck(id, patch);
    if (d.posicao !== undefined && d.posicao !== posicao) study.moveDeck(id, d.posicao);
    return { estado: 'aplicado', resultado: { baralho: deckOut(study.deck(id)) }, antes: { baralho: deck, cartas: [], posicao } };
  }

  // ===== as cartas =====
  const note = ctx.ownNote(id);
  if (!note) return failed('A anotação não existe mais (foi apagada, ou virou compartilhada).');
  const card = study.cardOf().get(id);
  // o Desfazer põe de volta a carta guardada (com os baralhos de outro grupo em que ela dorme), não a da vista
  const before: CardBefore = { carta: study.state().cards.find((c) => c.note === id) ?? null };

  if (op === 'carta.por') {
    const d = checked.dados as PorCartaV1;
    const { ids, aviso, erro } = liveDecks(study, id, d.baralhos);
    if (!ids.length) return failed(erro);
    if (card) {
      // a que já é carta só ganha os baralhos (a frente e o mural mudam pelo carta.editar, que espera a aprovação)
      const all = [...new Set([...card.decks, ...ids])];
      if (all.join() !== card.decks.join()) study.setDecks(id, all);
    } else {
      if (study.cards().length >= MAX_CARDS) return failed(`Os Estudos têm até ${MAX_CARDS} cartas.`);
      // a anotação que já estava no mural continua lá (como o "Trazer anotações" da tela)
      const wall = d.no_mural !== undefined ? (d.no_mural ?? undefined) : ctx.onWall(id) ? true : undefined;
      study.addCard(id, ids, frontWith({}, d), wall);
      if (!study.cardOf().has(id)) return failed('A anotação não pôde virar carta.');
    }
    return { estado: 'aplicado', resultado: { carta: cardOut(study, id, note.name), ...(aviso ? { aviso } : {}) }, antes: { ...before, depois: stampOf(study, id) } };
  }

  if (!card) return failed('A anotação não é mais carta (saiu dos Estudos).');

  switch (op) {
    case 'carta.editar': {
      const d = checked.dados as EditarCartaV1;
      let aviso: string | null = null;
      if (d.baralhos) {
        const live = liveDecks(study, id, d.baralhos);
        if (!live.ids.length) return failed(live.erro);
        aviso = live.aviso;
        if (live.ids.join() !== card.decks.join()) study.setDecks(id, live.ids);
      }
      if (hasFront(d)) study.updateFront(id, frontWith(card.front, d));
      if (d.no_mural !== undefined) study.setWall(id, d.no_mural ?? undefined);
      return { estado: 'aplicado', resultado: { carta: cardOut(study, id, note.name), ...(aviso ? { aviso } : {}) }, antes: { ...before, depois: stampOf(study, id) } };
    }
    case 'carta.tirar':
      study.removeCard(id);
      return { estado: 'aplicado', resultado: { carta: null }, antes: before };
    case 'carta.recomecar':
      study.resetCard(id);
      return { estado: 'aplicado', resultado: { carta: cardOut(study, id, note.name) }, antes: { ...before, depois: stampOf(study, id) } };
    case 'carta.responder': {
      const d = checked.dados as ResponderV1;
      const when = new Date(req.criado_em);
      // respondida depois do pedido (na sessão, noutro aparelho): a resposta da AI chegou tarde
      if (card.srs.last && card.srs.last > when.toISOString()) {
        return { estado: 'conflito', resultado: { erro: 'A carta foi respondida no Murall depois deste pedido: a resposta não entrou.' }, antes: null };
      }
      // guardada fora dos baralhos (a anotação mudou de grupo), ela não está em fila nenhuma
      if (!card.decks.length) return failed('A carta está guardada fora dos baralhos: a anotação mudou de grupo. Ela volta a ser estudada se a anotação voltar ao grupo do baralho.');
      const deck = d.baralho && card.decks.includes(d.baralho) ? d.baralho : undefined;
      const counted = deck ?? cardDecks(card, study.decks())[0]?.id ?? card.decks[0] ?? null;
      const conta = card.srs.state === 'nova' ? 'nova' : card.srs.state === 'revisao' ? 'revisao' : null;
      // a nova conta num baralho em que ela vale (nunca num de outro grupo em que dorme)
      study.answerAt(id, d.acertou, when, counted ?? undefined);
      return { estado: 'aplicado', resultado: { carta: cardOut(study, id, note.name) }, antes: { ...before, depois: stampOf(study, id), dia: studyDay(when), conta, baralho: counted } satisfies CardBefore };
    }
    default:
      return failed('Um pedido que este site ainda não conhece.');
  }
}

/** Desfaz um pedido dos Estudos aplicado: o baralho e a carta voltam como estavam (com a hora de agora). */
export function undoStudy(study: StudyStore, t: { op: string; alvo: string; antes?: unknown }): void {
  const a = (t.antes ?? {}) as { baralho?: unknown; cartas?: unknown[]; posicao?: number } & Omit<CardBefore, 'carta'> & { carta?: unknown };
  switch (t.op) {
    case 'baralho.criar':
      study.removeDeck(t.alvo);
      return;
    case 'baralho.editar':
    case 'baralho.apagar': {
      const deck = sanitizeDeck(a.baralho);
      if (!deck) return;
      const cards = (a.cartas ?? []).map((c) => sanitizeCard(c)).filter((c): c is StudyCard => !!c);
      study.restoreDeck(deck, cards);
      if (typeof a.posicao === 'number' && study.decks().findIndex((d) => d.id === deck.id) !== a.posicao) study.moveDeck(deck.id, a.posicao);
      return;
    }
    default: {
      if (!isStudyOp(t.op)) return;
      const card = a.carta === null ? null : sanitizeCard(a.carta);
      if (t.op === 'carta.por' && a.carta === null) {
        study.removeCard(t.alvo);
        return;
      }
      if (!card) return;
      const now = study.cardOf().get(t.alvo);
      // a carta de agora não é mais a que o pedido deixou (respondida, mudada ou posta de volta depois):
      // o Desfazer não passa por cima do que veio depois
      const changed = !!now && (t.op === 'carta.tirar' || (a.depois !== undefined && now.at !== a.depois));
      if (!changed) {
        study.restoreCard(card);
        if (t.op === 'carta.responder' && a.dia && a.conta) study.uncount(a.dia, a.baralho ?? null, a.conta === 'revisao');
        return;
      }
      // a frente, os baralhos e o mural voltam (o que o pedido mudou); as respostas de depois ficam
      if (t.op === 'carta.por' || t.op === 'carta.editar') {
        const { wall: _w, ...rest } = now!;
        study.restoreCard({ ...rest, front: card.front, decks: card.decks, ...(card.wall === undefined ? {} : { wall: card.wall }) });
      }
    }
  }
}

const FRONT_WORDS: [keyof EditarCartaV1, string][] = [
  ['titulo', 'o título'],
  ['subtitulo', 'o subtítulo'],
  ['imagem', 'a imagem'],
  ['baralhos', 'os baralhos'],
  ['no_mural', 'onde ela aparece'],
];
const DECK_WORDS: [keyof EditarBaralhoV1, string][] = [
  ['nome', 'o nome'],
  ['cor', 'a cor'],
  ['novas_por_dia', 'as novas por dia'],
  ['no_mural', 'o mural'],
  ['estilo', 'o estilo'],
  ['posicao', 'o lugar'],
];

/**
 * O pedido dos Estudos em palavras: "Pôr “Montanha” em Kanji" (esperando) ou "pôs “Montanha” em Kanji"
 * (no histórico, `past`). `title` é o nome do baralho ou da anotação; `names.of` dá o nome de um baralho
 * pelo id. Null: não é dos Estudos.
 */
export function studyWords(op: string, dados: unknown, title: string, past: boolean, names: ColumnNames): string | null {
  if (!isStudyOp(op)) return null;
  const d = (dados ?? {}) as Record<string, unknown>;
  const v = (now: string, then: string) => (past ? then : now);
  const t = `“${title}”`;
  const decks = (ids: unknown) => andList((Array.isArray(ids) ? (ids as string[]) : []).map((id) => names.of(id) ?? 'um baralho que não existe mais'));
  const fields = (list: [string, string][]) => list.filter(([k]) => d[k] !== undefined).map(([, w]) => w);
  switch (op) {
    case 'baralho.criar':
      return `${v('Criar', 'criou')} o baralho ${t}`;
    case 'baralho.editar': {
      const f = fields(DECK_WORDS);
      return f.length ? `${v('Mudar', 'mudou')} ${andList(f)} do baralho ${t}` : `${v('Mudar', 'mudou')} o baralho ${t}`;
    }
    case 'baralho.apagar':
      return `${v('Apagar', 'apagou')} o baralho ${t}`;
    case 'carta.por':
      return `${v('Pôr', 'pôs')} ${t} ${Array.isArray(d['baralhos']) && (d['baralhos'] as unknown[]).length > 1 ? 'nos baralhos' : 'no baralho'} ${decks(d['baralhos'])}`;
    case 'carta.editar': {
      const f = fields(FRONT_WORDS);
      return f.length ? `${v('Mudar', 'mudou')} ${andList(f)} de ${t} nos Estudos` : `${v('Mudar', 'mudou')} a carta ${t}`;
    }
    case 'carta.tirar':
      return `${v('Tirar', 'tirou')} ${t} dos Estudos`;
    case 'carta.recomecar':
      return `${v('Recomeçar', 'recomeçou')} o progresso de ${t}`;
    case 'carta.responder':
      return `${v('Responder', 'respondeu')} ${t}: ${d['acertou'] === true ? 'acertou' : 'errou'}`;
  }
}

/** O nome que a pessoa reconhece: o do baralho (o de agora, o do pedido, o de antes), ou o da carta. */
export function studyTitle(study: StudyStore, noteName: (id: string) => string | undefined, t: { op: string; alvo: string; dados: unknown; antes?: unknown }): string {
  if (t.op.startsWith('baralho.')) {
    return (
      study.deck(t.alvo)?.name ??
      (t.dados as { nome?: string } | null)?.nome ??
      ((t.antes as { baralho?: { name?: string } } | null)?.baralho?.name || 'um baralho que não existe mais')
    );
  }
  const card = study.cardOf().get(t.alvo);
  const name = noteName(t.alvo);
  if (name !== undefined) return card ? frontTitle(card, name) : name;
  return 'uma anotação que não existe mais';
}

/** Os nomes dos baralhos de um pedido dos Estudos (para as frases da folha e do histórico). */
export function deckNames(study: StudyStore): ColumnNames {
  return { target: null, of: (id) => study.deck(id)?.name ?? null };
}

/**
 * A nota nova de um pedido que já nasce carta (o `estudos` de `nota.criar`): ela segue os baralhos, como o
 * "Nova carta" da tela. Devolve o aviso, se houver.
 */
export function placeInDecks(study: StudyStore, note: string, e: CartaNovaV1): string | null {
  // a nota sem grupo ganha o do primeiro baralho (como a "Nova carta" da tela nasce no grupo do baralho)
  study.adoptGroup(note, e.baralhos.filter((id) => !!study.deck(id)));
  const { ids, aviso, erro } = liveDecks(study, note, e.baralhos);
  if (!ids.length) return `${erro.replace(/\.$/, '')}: a nota nasceu sem carta.`;
  if (study.cards().length >= MAX_CARDS) return `Os Estudos têm até ${MAX_CARDS} cartas: a nota nasceu sem carta.`;
  study.addCard(note, ids, frontWith({}, e));
  return aviso;
}
