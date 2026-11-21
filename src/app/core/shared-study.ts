import { canonicalJson } from './canonical-json';
import { freshSrs } from './fsrs';
import { Deck, StudyCard, StudyState, emptyStudy, inGroup, mergeStudy, sanitizeStudy } from './study';

/**
 * Os Flashcards de um grupo compartilhado (PLANO-FLASHCARDS-GRUPO.md): os baralhos e as cartas do grupo moram no
 * documento dele (`grupos.dados.estudos`, ao lado do Kanban), os mesmos para todos que estão nele; o progresso, a
 * pausa e as novas por dia continuam de cada um, nos Estudos dele (D2). Tudo aqui é puro.
 *
 * - `readStudyPart` / `studyPartDoc`: a parte dos Estudos como o documento guarda (sem o progresso nem o que é de
 *   cada um) e de volta.
 * - `overlayStudy`: os Estudos como valem para quem está aqui, com o documento de cada grupo por cima dos guardados
 *   no que é do grupo (o baralho, a carta), e o guardado no que é de cada um.
 * - `studyPart`: a parte de um grupo, tirada dos Estudos depois de uma mudança, para subir ao documento.
 * - `mergeStudyParts`: duas pessoas mexendo no mesmo grupo ao mesmo tempo (a junção de dois aparelhos, `mergeStudy`).
 */

/** O que mora no documento do grupo: os baralhos, as cartas e os apagados (para a junção não os trazer de volta). */
export interface StudyPart {
  decks: Deck[];
  cards: StudyCard[];
  removed: Record<string, string>;
}

/** Um grupo compartilhado, como os Estudos o veem. */
export interface GroupStudy {
  id: string;
  /** O nome que o grupo tem no mural de quem está aqui ("Trabalho · Ana"). */
  name: string;
  /** A parte dos Estudos no documento; null: o grupo ainda não tem (de antes desta build, ou sem baralho). */
  part: StudyPart | null;
  /** Quem está aqui escreve no grupo (Editor, Gestor, dono). */
  write: boolean;
  /** Quem está aqui gere o grupo (Gestor, dono): só ele muda quem vê um baralho (D3). */
  manage: boolean;
}

const deckKey = (id: string) => `deck:${id}`;
const cardKey = (note: string) => `card:${note}`;
const NO_STATS = { seen: 0, right: 0, wrong: 0, marks: '' };

const byOrder = (a: Deck, b: Deck) => a.order - b.order || a.at.localeCompare(b.at) || a.id.localeCompare(b.id);
const byAdded = (a: StudyCard, b: StudyCard) => a.added.localeCompare(b.added) || a.note.localeCompare(b.note);

/** O baralho como o documento guarda: sem o grupo (é o do documento), a pausa e a hora dela (são de cada um). */
function bareDeck(d: Deck): Omit<Deck, 'group' | 'paused' | 'pauseAt'> {
  const { group: _g, paused: _p, pauseAt: _a, ...rest } = d;
  return rest;
}

/** A carta como o documento guarda: sem o progresso (é de cada um). */
function bareCard(c: StudyCard): Omit<StudyCard, 'srs' | 'stats'> {
  const { srs: _s, stats: _t, ...rest } = c;
  return rest;
}

/** A mesma coisa sem contar a hora (a hora que anda sozinha não é mudança). */
const sameDeck = (a: Deck, b: Deck) => canonicalJson({ ...bareDeck(a), at: '' }) === canonicalJson({ ...bareDeck(b), at: '' });
const sameCard = (a: StudyCard, b: StudyCard) => canonicalJson({ ...bareCard(a), at: '' }) === canonicalJson({ ...bareCard(b), at: '' });

/** A parte dos Estudos do documento do grupo, conferida (o grupo de cada baralho é `group`); null sem ela. */
export function readStudyPart(raw: unknown, group: string): StudyPart | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const st = sanitizeStudy({ decks: r['decks'], cards: r['cards'], removed: r['removed'] });
  return {
    decks: st.decks.map((d) => ({ ...bareDeck(d), ...(group ? { group } : {}) }) as Deck),
    cards: st.cards,
    removed: st.removed,
  };
}

/** A parte como vai no documento (o que o `readStudyPart` lê). */
export function studyPartDoc(part: StudyPart): Record<string, unknown> {
  return { decks: part.decks.map(bareDeck), cards: part.cards.map(bareCard), removed: part.removed };
}

const empty = (p: StudyPart | null) => !p || (!p.decks.length && !p.cards.length && !Object.keys(p.removed).length);

/** As duas partes guardariam o mesmo (sem parte e a parte vazia são o mesmo: nada a subir). */
export function samePart(a: StudyPart | null, b: StudyPart | null): boolean {
  if (empty(a) || empty(b)) return empty(a) && empty(b);
  return canonicalJson(studyPartDoc(a!)) === canonicalJson(studyPartDoc(b!));
}

/** A mesma carta em dois documentos (a anotação que mudou de grupo): os baralhos dos dois, a frente da mais nova. */
function joinCards(a: StudyCard, b: StudyCard): StudyCard {
  const [old, now] = a.at >= b.at ? [b, a] : [a, b];
  return { ...now, decks: [...new Set([...now.decks, ...old.decks])], added: old.added < now.added ? old.added : now.added };
}

/**
 * Os Estudos como valem para quem está aqui (D5): os guardados, com cada grupo compartilhado que já tem a parte
 * dos Estudos por cima no que é do grupo.
 *
 * - O baralho que o documento conhece (ele está lá, ou foi apagado lá) vem do documento, com a pausa e as novas
 *   por dia do guardado (D2). O guardado que o documento não conhece fica como está: é só de quem está aqui (o do
 *   Leitor, que não escreve no grupo, ou o que ainda vai para o documento).
 * - A carta do documento vem com a frente, os baralhos e o "no mural" do documento, e o progresso do guardado (a
 *   carta que a pessoa nunca estudou chega nova). Do guardado, a carta só fica nos baralhos que o documento não
 *   conhece.
 *
 * Sem nenhum grupo com a parte, devolve o mesmo guardado.
 */
export function overlayStudy(saved: StudyState, groups: readonly GroupStudy[]): StudyState {
  const parts = groups.filter((g) => !!g.part);
  if (!parts.length) return saved;
  const known = new Set<string>();
  const docDecks: Deck[] = [];
  const docCards = new Map<string, StudyCard>();
  for (const g of parts) {
    const p = g.part!;
    for (const d of p.decks) {
      if (known.has(d.id)) continue;
      known.add(d.id);
      docDecks.push(d.group === g.name ? d : { ...d, group: g.name });
    }
    for (const k of Object.keys(p.removed)) if (k.startsWith('deck:')) known.add(k.slice(5));
    for (const c of p.cards) {
      const o = docCards.get(c.note);
      docCards.set(c.note, o ? joinCards(o, c) : c);
    }
  }
  const mine = new Map(saved.decks.map((d) => [d.id, d]));
  const decks = [
    ...saved.decks.filter((d) => !known.has(d.id)),
    ...docDecks.map((d) => {
      const m = mine.get(d.id);
      if (!m) return d;
      return { ...d, newPerDay: m.newPerDay, ...(m.paused ? { paused: m.paused } : {}), ...(m.pauseAt ? { pauseAt: m.pauseAt } : {}) };
    }),
  ].sort(byOrder);
  const cards: StudyCard[] = [];
  const seen = new Set<string>();
  for (const c of saved.cards) {
    seen.add(c.note);
    const own = c.decks.filter((id) => !known.has(id));
    const doc = docCards.get(c.note);
    if (doc) {
      const { wall: _w, ...base } = c;
      cards.push({
        ...base,
        decks: [...new Set([...doc.decks, ...own])],
        front: doc.front,
        ...(doc.wall === undefined ? {} : { wall: doc.wall }),
        added: doc.added,
        at: doc.at > c.at ? doc.at : c.at,
      });
    } else if (own.length === c.decks.length) cards.push(c);
    else if (own.length) cards.push({ ...c, decks: own });
  }
  for (const [note, doc] of docCards) if (!seen.has(note)) cards.push(doc);
  return { ...saved, decks, cards: cards.sort(byAdded) };
}

/**
 * A parte do grupo `g` tirada dos Estudos `st` (a vista, depois de uma mudança), partindo da que o documento tem:
 *
 * - os baralhos: os do documento (com o que mudou aqui) e os do grupo que ainda não estão nele (o novo, o de antes
 *   desta build: D4), menos os que o documento já apagou e os de outro grupo compartilhado (`others`). O baralho do
 *   documento só sai com o apagado dele aqui: um baralho que não aparece (o nome do grupo mudando no meio) fica.
 * - as cartas: as que estão em algum baralho da parte, só com esses baralhos; a do documento que saiu de todos eles
 *   sai com o apagado.
 * - as novas por dia de um baralho que já está no documento ficam as dele (são de cada um, D2), e quem não gere o
 *   grupo não muda quem vê o baralho (D3).
 *
 * O que não mudou fica como estava, com a hora de antes: a hora que anda sozinha (uma resposta, a pausa) não sobe.
 */
export function studyPart(st: StudyState, g: GroupStudy, others: ReadonlySet<string>, at: string): StudyPart {
  const cur = g.part ?? { decks: [], cards: [], removed: {} };
  const curDecks = new Map(cur.decks.map((d) => [d.id, d]));
  const curCards = new Map(cur.cards.map((c) => [c.note, c]));
  const removed = { ...cur.removed };
  const bury = (key: string, when: string) => {
    if (!removed[key] || when > removed[key]) removed[key] = when;
  };
  const buried = (key: string, when: string) => !!cur.removed[key] && cur.removed[key] >= when;

  const decks: Deck[] = [];
  const live = new Set<string>();
  for (const d of st.decks) {
    const was = curDecks.get(d.id);
    if (!was && (others.has(d.id) || !inGroup(d, g.name) || buried(deckKey(d.id), d.at))) continue;
    const pub = g.manage ? d.public : was?.public;
    const next = { ...bareDeck(d), newPerDay: was ? was.newPerDay : d.newPerDay, ...(pub ? { public: true as const } : {}) } as Deck;
    if (!pub) delete next.public;
    if (g.name) next.group = g.name;
    decks.push(was && sameDeck(next, was) ? was : next);
    live.add(d.id);
  }
  for (const d of cur.decks) {
    if (live.has(d.id)) continue;
    const gone = st.removed[deckKey(d.id)];
    if (gone && gone >= d.at) bury(deckKey(d.id), gone);
    else {
      decks.push(d);
      live.add(d.id);
    }
  }

  const cards: StudyCard[] = [];
  const kept = new Set<string>();
  const here = new Set<string>();
  for (const c of st.cards) {
    here.add(c.note);
    const ds = c.decks.filter((id) => live.has(id));
    const was = curCards.get(c.note);
    if (!ds.length) {
      if (was) bury(cardKey(c.note), c.at > was.at ? c.at : at);
      continue;
    }
    if (!was && buried(cardKey(c.note), c.at)) continue;
    const next: StudyCard = { ...c, decks: ds, srs: was?.srs ?? freshSrs(c.added), stats: was?.stats ?? NO_STATS };
    cards.push(was && sameCard(next, was) ? was : next);
    kept.add(c.note);
  }
  for (const c of cur.cards) {
    if (kept.has(c.note) || here.has(c.note)) continue;
    const gone = st.removed[cardKey(c.note)];
    if (gone && gone >= c.at) {
      bury(cardKey(c.note), gone);
      continue;
    }
    const ds = c.decks.filter((id) => live.has(id));
    if (!ds.length) bury(cardKey(c.note), at);
    else cards.push(ds.length === c.decks.length ? c : { ...c, decks: ds, at });
  }
  return { decks: decks.sort(byOrder), cards: cards.sort(byAdded), removed };
}

/**
 * Duas versões da parte juntas (duas pessoas mexendo ao mesmo tempo): baralho a baralho, carta a carta. Com
 * `theirsAudience` (quem junta não gere o grupo), quem vê cada baralho fica o de `theirs`: a mexida daqui num baralho
 * que a gestora acabou de tornar público não o desfaz (D3), e o baralho novo daqui nasce só de quem está no grupo.
 */
export function mergeStudyParts(theirs: StudyPart, mine: StudyPart, theirsAudience = false): StudyPart {
  const wrap = (p: StudyPart): StudyState => ({ ...emptyStudy(), decks: p.decks, cards: p.cards, removed: p.removed });
  const m = mergeStudy(wrap(theirs), wrap(mine));
  if (!theirsAudience) return { decks: m.decks, cards: m.cards, removed: m.removed };
  const there = new Map(theirs.decks.map((d) => [d.id, !!d.public]));
  const decks = m.decks.map((d) => {
    if (!!d.public === (there.get(d.id) ?? false)) return d;
    const { public: _p, ...rest } = d;
    return there.get(d.id) ? { ...rest, public: true as const } : rest;
  });
  return { decks, cards: m.cards, removed: m.removed };
}

/** Os baralhos que cada grupo conhece (os que estão no documento e os apagados lá), por grupo. */
export function knownDecks(g: GroupStudy): Set<string> {
  const out = new Set<string>();
  if (!g.part) return out;
  for (const d of g.part.decks) out.add(d.id);
  for (const k of Object.keys(g.part.removed)) if (k.startsWith('deck:')) out.add(k.slice(5));
  return out;
}
