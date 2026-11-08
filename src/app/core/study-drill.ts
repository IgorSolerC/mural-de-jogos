import { DEFAULT_FSRS, seededRandom, studyDay } from './fsrs';
import { StudyCard, StudyState } from './study';
import { QueueItem, QueueKind, StudyScope, scopeCards } from './study-queue';

/**
 * O treino dos Estudos: passar os flashcards de novo sem compromisso, fora do estudo do dia. Nada daqui se
 * guarda em lugar nenhum: nem o progresso da carta, nem o boletim, nem os limites do dia. O treino vive na
 * memória da mesa (ui/study-session.ts) e some ao fechar.
 *
 * Quem errou volta na mesma rodada pelos passos do estudo de verdade (os do aprendizado, 1 e 10 minutos,
 * como no Anki): errou, volta daqui a 1 minuto; acertou depois, volta daqui a 10; acertou de novo, sai.
 * Quem acerta logo na primeira vez sai da rodada. Quando não sobra nada mais, o que está voltando aparece na
 * hora, sem esperar o relógio (o treino não tem dia nem limite).
 *
 * Tudo puro: quem chama passa a hora, a semente do sorteio e quais anotações existem.
 */

export const DRILL_KINDS = ['hoje', 'vistos', 'todos', 'novos', 'escolhidos'] as const;
/** Com o que treinar: o estudo de hoje, os já estudados, todos, os nunca vistos ou os escolhidos à mão. */
export type DrillKind = (typeof DRILL_KINDS)[number];

/** Curtos, para caber no remendo do Treinar sem cortar ("Todos" fica claro entre os já estudados e os nunca vistos). */
export const DRILL_LABEL: Record<DrillKind, string> = {
  hoje: 'Os respondidos hoje',
  vistos: 'Os já estudados',
  todos: 'Todos',
  novos: 'Só os nunca vistos',
  escolhidos: 'Escolher quais',
};

/** O treino que a mesa abre: com o que treinar e as cartas (as de `drillPool`). */
export interface DrillPlan {
  kind: DrillKind;
  items: readonly QueueItem[];
}

/** Os passos de quem errou no treino, em minutos: os do aprendizado do estudo de verdade. */
export const DRILL_STEPS: readonly number[] = DEFAULT_FSRS.learning;

/** O monte da carta no estudo de verdade (só para o desenho da mesa: o treino não muda nada nele). */
function kindOf(card: StudyCard): QueueKind {
  const s = card.srs.state;
  return s === 'nova' ? 'nova' : s === 'revisao' ? 'revisao' : 'aprender';
}

/** A carta entra no treino desse tipo? (`escolhidos` decide fora daqui, pela lista.) */
function fits(card: StudyCard, kind: DrillKind, day: string): boolean {
  switch (kind) {
    case 'hoje':
      return !!card.srs.last && studyDay(new Date(card.srs.last)) === day;
    case 'vistos':
      return card.srs.state !== 'nova';
    case 'novos':
      return card.srs.state === 'nova';
    default:
      return true;
  }
}

/**
 * As cartas do treino, no escopo (o baralho, o grupo ou tudo), cada uma com o baralho que a traz. Em
 * `escolhidos`, só as de `chosen`. "Hoje" são as respondidas no dia de estudo de agora (o que o Desfazer
 * desfez não conta: a última resposta volta junto).
 */
export function drillPool(st: StudyState, now: Date, scope: StudyScope, kind: DrillKind, live?: (note: string) => boolean, chosen: readonly string[] = []): QueueItem[] {
  const day = studyDay(now);
  const picked = new Set(chosen);
  return scopeCards(st, scope, live)
    .filter(({ card }) => (kind === 'escolhidos' ? picked.has(card.note) : fits(card, kind, day)))
    .map(({ card, deck }) => ({ note: card.note, deck: deck.id, kind: kindOf(card) }));
}

/** Quantas cartas cada tipo de treino traria agora (o "Escolher quais" escolhe entre todas). */
export function drillCounts(st: StudyState, now: Date, scope: StudyScope, live?: (note: string) => boolean): Record<DrillKind, number> {
  const day = studyDay(now);
  const out: Record<DrillKind, number> = { hoje: 0, vistos: 0, todos: 0, novos: 0, escolhidos: 0 };
  for (const { card } of scopeCards(st, scope, live)) {
    for (const k of DRILL_KINDS) if (fits(card, k, day)) out[k]++;
  }
  return out;
}

/** Uma carta que errou e volta: em que passo está e quando volta (ms). */
export interface DrillBack {
  item: QueueItem;
  step: number;
  due: number;
}

export interface DrillState {
  /** As que ainda não apareceram nesta rodada, na ordem sorteada. */
  queue: readonly QueueItem[];
  /** As que errou, voltando. */
  back: readonly DrillBack[];
  /** Os números do treino inteiro (somam de rodada em rodada). */
  answered: number;
  right: number;
  wrong: number;
}

/**
 * Uma rodada nova com estas cartas, embaralhadas pela semente. Com `from`, a rodada seguinte do mesmo treino:
 * os números continuam somando.
 */
export function startDrill(items: readonly QueueItem[], seed: string, from?: DrillState): DrillState {
  const tie = (note: string) => seededRandom(`${seed}:${note}`);
  const queue = [...items].sort((a, b) => tie(a.note) - tie(b.note) || a.note.localeCompare(b.note));
  return { queue, back: [], answered: from?.answered ?? 0, right: from?.right ?? 0, wrong: from?.wrong ?? 0 };
}

/**
 * A próxima carta: a que errou e já deu a hora de voltar (a que voltou antes primeiro); depois as que ainda
 * não apareceram; sem mais nada, a que está voltando mais cedo, na hora. Null: a rodada acabou.
 */
export function drillNext(state: DrillState, nowMs: number, live: (note: string) => boolean = () => true): QueueItem | null {
  const back = state.back.filter((b) => live(b.item.note)).sort((a, b) => a.due - b.due);
  if (back.length && back[0].due <= nowMs) return back[0].item;
  const fresh = state.queue.find((i) => live(i.note));
  if (fresh) return fresh;
  return back[0]?.item ?? null;
}

/** Em quantos minutos a carta volta com essa resposta; null: sai da rodada. */
export function drillReturn(state: DrillState, note: string, ok: boolean): number | null {
  if (!ok) return DRILL_STEPS[0];
  const back = state.back.find((b) => b.item.note === note);
  if (!back) return null;
  const step = back.step + 1;
  return step < DRILL_STEPS.length ? DRILL_STEPS[step] : null;
}

/** O treino depois da resposta: a carta sai da fila e, se errou (ou ainda está nos passos), volta depois. */
export function drillAnswer(state: DrillState, note: string, ok: boolean, nowMs: number): DrillState {
  const item = state.queue.find((i) => i.note === note) ?? state.back.find((b) => b.item.note === note)?.item;
  if (!item) return state;
  const minutes = drillReturn(state, note, ok);
  const back = state.back.filter((b) => b.item.note !== note);
  if (minutes !== null) {
    const step = ok ? state.back.find((b) => b.item.note === note)!.step + 1 : 0;
    back.push({ item, step, due: nowMs + minutes * 60_000 });
  }
  return {
    queue: state.queue.filter((i) => i.note !== note),
    back,
    answered: state.answered + 1,
    right: state.right + (ok ? 1 : 0),
    wrong: state.wrong + (ok ? 0 : 1),
  };
}

/** Quantas ainda faltam na rodada: as que não apareceram e as que estão voltando. */
export function drillLeft(state: DrillState): number {
  return state.queue.length + state.back.length;
}
