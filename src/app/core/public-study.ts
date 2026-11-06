import { Review, isNote, sanitizeReview } from './review';
import { Deck, StudyCard, StudyState, sanitizeCard, sanitizeDeck } from './study';

/**
 * Os baralhos públicos (PLANO-BARALHOS-PUBLICOS.md): o que vai no mural público, em `estudos`, e o que quem
 * visita lê de lá.
 *
 * Vão só os baralhos que o dono tornou públicos, e só as cartas de anotações que já estão à mostra (no mural
 * público ou nas só fora do mural, `soKanban`): a carta é a anotação, e a da privada nem entra, nem o id dela.
 * O progresso (o FSRS e os números) vai a não ser que o dono o esconda (Ajustes › Amigos); escondido, as
 * cartas chegam sem ele e quem visita não vê nível nem volta.
 *
 * O formato é o mesmo dos Estudos guardados, só com menos campos, para a leitura passar pelo mesmo
 * saneamento (`sanitizeDeck`, `sanitizeCard`).
 */
export interface PublicStudy {
  /** Os baralhos públicos, na ordem da fileira do dono. */
  decks: Deck[];
  /** As cartas, cada uma só com os baralhos públicos em que está. */
  cards: StudyCard[];
  /** O dono deixa ver o progresso (sem: as cartas não mostram nível nem volta). */
  progress: boolean;
}

/** Quantas cartas e quantos baralhos, no máximo, a leitura aceita (os mesmos tetos dos Estudos). */
const MAX_PUBLIC_DECKS = 100;
const MAX_PUBLIC_CARDS = 5000;

/**
 * Os Estudos como vão no público, ou null sem nenhum baralho público. `view` são os Estudos como valem agora
 * (`StudyStore.view`: a carta que dorme num baralho de outro grupo tem `decks` vazio e não entra); `shown`
 * diz se a anotação está à mostra para quem visita.
 */
export function publicStudy(view: StudyState, shown: (note: string) => boolean, hideProgress: boolean): Record<string, unknown> | null {
  const decks = view.decks.filter((d) => d.public && d.group);
  if (!decks.length) return null;
  const ids = new Set(decks.map((d) => d.id));
  const cards: Record<string, unknown>[] = [];
  for (const c of view.cards) {
    const in_ = c.decks.filter((d) => ids.has(d));
    if (!in_.length || !shown(c.note)) continue;
    cards.push({
      note: c.note,
      decks: in_,
      front: c.front,
      ...(hideProgress ? {} : { srs: c.srs, stats: c.stats }),
      added: c.added,
      // a hora da carta conta só para o dono; aqui, a de entrada (não diz quando a pessoa estudou)
      at: c.added,
    });
  }
  return {
    // do baralho, só o que desenha: as novas por dia, o "no mural" e a hora ficam com o dono
    decks: decks.map((d) => ({
      id: d.id,
      name: d.name,
      icon: d.icon,
      color: d.color,
      ...(d.look ? { look: d.look } : {}),
      group: d.group,
      order: d.order,
      at: '1970-01-01T00:00:00.000Z',
    })),
    cards,
    ...(hideProgress ? { progress: false } : {}),
  };
}

/** Os grupos dos baralhos públicos (para o ícone e a cor da orelha deles irem no público). */
export function publicStudyGroups(view: StudyState): string[] {
  return [...new Set(view.decks.filter((d) => d.public && d.group).map((d) => d.group!))];
}

/** O `estudos` do mural público de alguém, saneado; null sem nenhum baralho que sirva. */
export function readPublicStudy(raw: unknown): PublicStudy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const decks = new Map<string, Deck>();
  for (const item of Array.isArray(r['decks']) ? r['decks'].slice(0, MAX_PUBLIC_DECKS) : []) {
    const d = sanitizeDeck(item);
    // o baralho sem grupo não tem aba onde morar
    if (d?.group && !decks.has(d.id)) decks.set(d.id, { ...d, public: true });
  }
  if (!decks.size) return null;
  const progress = r['progress'] !== false;
  const cards = new Map<string, StudyCard>();
  for (const item of Array.isArray(r['cards']) ? r['cards'].slice(0, MAX_PUBLIC_CARDS) : []) {
    const c = sanitizeCard(item);
    if (!c || cards.has(c.note)) continue;
    const in_ = c.decks.filter((d) => decks.has(d));
    if (in_.length) cards.set(c.note, { ...c, decks: in_ });
  }
  const byOrder = (a: Deck, b: Deck) => a.order - b.order || a.id.localeCompare(b.id);
  return {
    decks: [...decks.values()].sort(byOrder),
    cards: [...cards.values()].sort((a, b) => a.added.localeCompare(b.added) || a.note.localeCompare(b.note)),
    progress,
  };
}

/** O que quem visita guarda dos Estudos de alguém: os baralhos públicos e as anotações só fora do mural. */
export interface VisitStudyParts {
  estudos: PublicStudy | null;
  /**
   * As anotações das cartas que não estão no mural da pessoa (só nos Estudos ou no Kanban: vão no público em
   * `soKanban`, que o mural de quem visita não mostra). Só as que alguma carta pública usa.
   */
  studyNotes: Review[];
}

/** Os Estudos do mural público já lido (o objeto do JSON), e as anotações que as cartas pedem. */
export function readVisitStudy(object: Record<string, unknown> | null, onWall: ReadonlySet<string>): VisitStudyParts {
  const estudos = readPublicStudy(object?.['estudos']);
  if (!estudos) return { estudos: null, studyNotes: [] };
  const wanted = new Set(estudos.cards.map((c) => c.note).filter((id) => !onWall.has(id)));
  const studyNotes: Review[] = [];
  const raw = object?.['soKanban'];
  for (const item of Array.isArray(raw) ? raw : []) {
    const id = (item as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || !wanted.has(id)) continue;
    const r = sanitizeReview(item);
    // o público nunca leva a privada; se vier, fica de fora como no resto do mural
    if (r && r.id === id && !r.private && isNote(r)) {
      studyNotes.push(r);
      wanted.delete(id);
    }
  }
  return { estudos, studyNotes };
}
