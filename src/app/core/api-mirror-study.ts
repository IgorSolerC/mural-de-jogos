import {
  CONTEXTO_ESTUDOS,
  FILA_MAX,
  NIVEIS,
  type BaralhoV1,
  type CartaV1,
  type ContextoEstudosV1,
  type FilaDoDiaV1,
  type ItemDaFilaV1,
  type NivelV1,
} from '../../../contrato/api-v1/estudos';
import type { TipoDoEspelho } from '../../../contrato/api-v1/notas';
import { addStudyDays, dayStart, studyDay } from './fsrs';
import { Review } from './review';
import { Deck, StudyCard, StudyState, deckLook, frontTitle, levelOf, studyOnWall } from './study';
import { dayQueue } from './study-queue';

/**
 * Os Estudos no espelho da API das AIs (PLANO-API.md, seção 23, rodada 12): cada carta em v1 (a frente,
 * o verso, o progresso), cada baralho e o contexto, com a fila pronta do dia de hoje e do de amanhã, de
 * todos os baralhos e de cada um. A fila é a do app (`dayQueue`), pedida no fim do dia de estudo: as
 * cartas nos passos de 1 e 10 minutos entram todas, com a hora em que voltam, e a API separa as de agora
 * (`filaDeAgora` do contrato). Assim a fila não muda com o relógio, só com os Estudos, e o espelho não
 * regrava nada à toa. Só as cartas de anotações suas (`notes`: sem as compartilhadas). Só funções puras.
 */

/** O último instante de um dia de estudo (o dia vira às 4h). */
function dayEnd(day: string): Date {
  return new Date(dayStart(addStudyDays(day, 1)).getTime() - 1);
}

/** Uma carta em v1. */
export function cartaV1(card: StudyCard, note: Review, decks: readonly Deck[]): CartaV1 {
  const fresh = card.srs.state === 'nova';
  return {
    nota: card.note,
    titulo: frontTitle(card, note.game.name),
    titulo_da_frente: card.front.title ?? null,
    subtitulo: card.front.subtitle ?? null,
    imagem: card.front.image ?? null,
    nota_titulo: note.game.name,
    verso: note.text,
    grupo: note.category?.trim() || null,
    baralhos: [...card.decks],
    no_mural: card.wall ?? null,
    fica_no_mural: studyOnWall(card, decks) ?? false,
    nivel: levelOf(card.srs),
    estado: card.srs.state,
    volta_em: fresh ? null : card.srs.due,
    vistas: card.stats.seen,
    acertos: card.stats.right,
    erros: card.stats.wrong,
    ultimas: card.stats.marks,
    entrou_em: card.added,
    versao: card.at,
  };
}

/**
 * A fila de um dia de estudo inteiro (de todos, ou do baralho `scope`), como o Estudar mostraria: as de
 * aprender daquele dia pela hora (com o `volta_em`), depois as revisões e as novas intercaladas.
 */
export function filaV1(
  st: StudyState,
  day: string,
  scope: string | undefined,
  live: (note: string) => boolean,
  byNote: ReadonlyMap<string, StudyCard> = new Map(st.cards.map((c) => [c.note, c])),
): FilaDoDiaV1 {
  const q = dayQueue(st, dayEnd(day), scope, live);
  const learning: ItemDaFilaV1[] = [];
  for (const i of q.learning) {
    const due = byNote.get(i.note)!.srs.due;
    // as que voltam depois das 4h já são do dia seguinte
    if (studyDay(new Date(due)) <= day) learning.push({ nota: i.note, baralho: i.deck, tipo: 'aprender', volta_em: due });
  }
  const itens = [...learning, ...q.rest.map((i): ItemDaFilaV1 => ({ nota: i.note, baralho: i.deck, tipo: i.kind, volta_em: null }))];
  return { dia: day, itens: itens.slice(0, FILA_MAX), cortada: itens.length > FILA_MAX };
}

/** As filas de hoje e de amanhã (a de amanhã serve quando o Murall fica fechado de um dia para o outro). */
function filas(st: StudyState, now: Date, scope: string | undefined, live: (note: string) => boolean, byNote?: ReadonlyMap<string, StudyCard>): FilaDoDiaV1[] {
  const today = studyDay(now);
  return [filaV1(st, today, scope, live, byNote), filaV1(st, addStudyDays(today, 1), scope, live, byNote)];
}

/** Um baralho em v1, com quantas cartas, os níveis e as filas dele. */
export function baralhoV1(deck: Deck, st: StudyState, live: (note: string) => boolean, now: Date, byNote?: ReadonlyMap<string, StudyCard>): BaralhoV1 {
  const por_nivel = Object.fromEntries(NIVEIS.map((n) => [n, 0])) as Record<NivelV1, number>;
  let cartas = 0;
  for (const c of st.cards) {
    if (!c.decks.includes(deck.id) || !live(c.note)) continue;
    cartas++;
    por_nivel[levelOf(c.srs)]++;
  }
  return {
    id: deck.id,
    nome: deck.name,
    cor: deck.color,
    icone: deck.icon,
    novas_por_dia: deck.newPerDay,
    no_mural: !!deck.wall,
    estilo: deckLook(deck),
    posicao: st.decks.indexOf(deck),
    cartas,
    por_nivel,
    filas: filas(st, now, deck.id, live, byNote),
    versao: deck.at,
  };
}

/** A carta aparece (no espelho, nas contagens): a anotação existe e algum baralho dela também. */
const shown = (st: StudyState, c: StudyCard, live: (note: string) => boolean) => live(c.note) && c.decks.some((d) => st.decks.some((x) => x.id === d));

export function contextoEstudosV1(st: StudyState, live: (note: string) => boolean, now: Date, byNote?: ReadonlyMap<string, StudyCard>): ContextoEstudosV1 {
  return {
    config: { retencao: st.config.retention, revisoes_por_dia: st.config.maxReviews, ordem_das_novas: st.config.newOrder },
    cartas: st.cards.filter((c) => shown(st, c, live)).length,
    filas: filas(st, now, undefined, live, byNote),
  };
}

export interface StudyMirrorItem {
  tipo: Extract<TipoDoEspelho, 'carta' | 'baralho' | 'contexto-estudos'>;
  id: string;
  dados: CartaV1 | BaralhoV1 | ContextoEstudosV1;
}

/**
 * Os Estudos inteiros para o espelho: as cartas das anotações suas que existem (a de uma apagada ou
 * compartilhada não vai, nem entra nas filas), os baralhos e o contexto.
 */
export function studyMirror(st: StudyState, notes: ReadonlyMap<string, Review>, now: Date): StudyMirrorItem[] {
  const live = (note: string) => notes.has(note);
  const out: StudyMirrorItem[] = [];
  for (const c of st.cards) {
    // a carta sem nenhum baralho que exista (o baralho apagado noutro aparelho) não aparece em lugar nenhum
    if (shown(st, c, live)) out.push({ tipo: 'carta', id: c.note, dados: cartaV1(c, notes.get(c.note)!, st.decks) });
  }
  // as cartas pelo id, uma vez só para todas as filas (a de cada baralho e a de todos, hoje e amanhã)
  const byNote = new Map(st.cards.map((c) => [c.note, c]));
  for (const d of st.decks) out.push({ tipo: 'baralho', id: d.id, dados: baralhoV1(d, st, live, now, byNote) });
  out.push({ tipo: 'contexto-estudos', id: CONTEXTO_ESTUDOS, dados: contextoEstudosV1(st, live, now, byNote) });
  return out;
}
