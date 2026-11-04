import { filaDeAgora } from '../../../contrato/api-v1/estudos';
import { baralhoV1, cartaV1, filaV1, studyMirror } from './api-mirror-study';
import { studyDay } from './fsrs';
import { Review, sanitizeReview } from './review';
import { StudyState, addCard, addDeck, answer, emptyStudy, setCardWall, updateDeck } from './study';
import { dayQueue, nextUp } from './study-queue';

/** Uma anotação de verdade, para a carta ter de onde sair. */
function note(id: string, name: string, extra: Partial<Review> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    text: `O verso de ${name}`,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...extra,
  })!;
}

/** Um número sorteado de 0 a 1, sempre o mesmo para a mesma semente. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const NOW = new Date(2026, 10, 3, 9, 0);
const iso = (d: Date) => d.toISOString();
const later = (min: number) => new Date(NOW.getTime() + min * 60_000);

/** Dois baralhos, 14 cartas (uma nos dois), algumas já respondidas hoje (nos passos) e algumas em revisão. */
function sample(seed: number): StudyState {
  const r = rng(seed);
  let st = emptyStudy();
  st = addDeck(st, 'Kanji', 'amarelo', iso(later(-60 * 24 * 30)), null, 'dk').state;
  st = addDeck(st, 'Grego', 'azul', iso(later(-60 * 24 * 30)), null, 'dg').state;
  st = updateDeck(st, 'dg', { newPerDay: 3 }, iso(later(-60 * 24 * 30)));
  for (let i = 0; i < 14; i++) st = addCard(st, `n${i}`, i === 13 ? ['dg', 'dk'] : [i % 2 ? 'dk' : 'dg'], {}, iso(later(-60 * 24 * (20 - i))));
  // umas respondidas há dias (viram revisão), outras respondidas agora há pouco (nos passos)
  for (let i = 0; i < 14; i++) {
    const x = r();
    if (x < 0.35) {
      const past = later(-60 * 24 * (3 + Math.floor(r() * 10)));
      st = answer(st, `n${i}`, true, past);
      st = answer(st, `n${i}`, true, new Date(past.getTime() + 11 * 60_000));
      st = answer(st, `n${i}`, r() < 0.7, new Date(past.getTime() + 22 * 60_000));
    } else if (x < 0.6) {
      st = answer(st, `n${i}`, r() < 0.5, later(-Math.floor(r() * 30)));
    }
  }
  return st;
}

describe('os Estudos no espelho da API (core/api-mirror-study.ts)', () => {
  it('a fila de agora da API (a do dia inteiro, separada pela hora) é a que o Estudar do app mostraria, a qualquer hora do dia', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const st = sample(seed);
      const live = () => true;
      for (const scope of [undefined, 'dk', 'dg']) {
        const fila = filaV1(st, studyDay(NOW), scope, live);
        for (const min of [0, 3, 9, 15, 45, 180, 600]) {
          const t = later(min);
          const api = filaDeAgora(fila, t);
          const q = dayQueue(st, t, scope);
          const byNote = new Map(st.cards.map((c) => [c.note, c]));
          const dueNow = q.learning.filter((i) => Date.parse(byNote.get(i.note)!.srs.due) <= t.getTime());
          const soon = q.learning.filter((i) => Date.parse(byNote.get(i.note)!.srs.due) > t.getTime());
          const where = `semente ${seed}, ${scope ?? 'todos'}, +${min} min`;
          expect(api.agora.map((i) => `${i.nota}:${i.baralho}:${i.tipo}`))
            .withContext(where)
            .toEqual([...dueNow, ...q.rest, ...soon].map((i) => `${i.note}:${i.deck}:${i.kind === 'aprender' ? 'aprender' : i.kind}`));
          expect(api.contagem).withContext(where).toEqual(q.counts);
          expect(api.agora[0]?.nota ?? "").withContext(where).toBe(nextUp(st, t, scope).item?.note ?? "");
        }
      }
    }
  });

  it('a fila do dia não muda com o relógio (o espelho não regrava à toa); amanhã tem as revisões de amanhã', () => {
    const st = sample(7);
    const day = studyDay(NOW);
    expect(filaV1(st, day, undefined, () => true)).toEqual(filaV1(st, day, undefined, () => true));
    const items = studyMirror(st, new Map(st.cards.map((c) => [c.note, note(c.note, c.note)])), NOW);
    const again = studyMirror(st, new Map(st.cards.map((c) => [c.note, note(c.note, c.note)])), later(300));
    expect(again).toEqual(items);
    const ctx = items.find((i) => i.tipo === 'contexto-estudos')!.dados as { filas: { dia: string }[] };
    expect(ctx.filas.map((f) => f.dia)).toEqual([day, studyDay(later(60 * 24))]);
  });

  it('a carta em v1: a frente (o título da anotação sem título próprio), o verso, o grupo, o "no mural" e o progresso', () => {
    let st = emptyStudy();
    st = addDeck(st, 'Kanji', 'amarelo', iso(NOW), null, 'dk').state;
    st = addCard(st, 'n-fogo', ['dk'], { title: '火', subtitle: 'hi' }, iso(NOW));
    st = addCard(st, 'n-agua', ['dk'], {}, iso(NOW), true);
    const fogo = cartaV1(st.cards[0]!, note('n-fogo', 'Fogo', { category: 'Japonês' }), st.decks);
    expect(fogo).toEqual({
      nota: 'n-fogo',
      titulo: '火',
      titulo_da_frente: '火',
      subtitulo: 'hi',
      imagem: null,
      nota_titulo: 'Fogo',
      verso: 'O verso de Fogo',
      grupo: 'Japonês',
      baralhos: ['dk'],
      no_mural: null,
      fica_no_mural: false,
      nivel: 'desconhecida',
      estado: 'nova',
      volta_em: null,
      vistas: 0,
      acertos: 0,
      erros: 0,
      ultimas: '',
      entrou_em: iso(NOW),
      versao: iso(NOW),
    });
    const agua = cartaV1(st.cards[1]!, note('n-agua', 'Água'), st.decks);
    expect([agua.titulo, agua.titulo_da_frente, agua.no_mural, agua.fica_no_mural, agua.grupo]).toEqual(['Água', null, true, true, null]);
    st = answer(setCardWall(st, 'n-agua', false, iso(NOW)), 'n-agua', false, NOW, 'dk');
    const answered = cartaV1(st.cards[1]!, note('n-agua', 'Água'), st.decks);
    expect(answered).toEqual(jasmine.objectContaining({ no_mural: false, estado: 'aprendendo', nivel: 'nova', vistas: 1, erros: 1, ultimas: '0' }));
    expect(answered.volta_em).toBe(st.cards[1]!.srs.due);
  });

  it('só as cartas de anotações suas que existem, em algum baralho que existe; o baralho conta os níveis', () => {
    let st = emptyStudy();
    st = addDeck(st, 'Kanji', 'amarelo', iso(NOW), null, 'dk').state;
    st = updateDeck(st, 'dk', { wall: true, look: 'biblioteca' }, iso(NOW));
    st = addCard(st, 'n-fogo', ['dk'], {}, iso(NOW));
    st = addCard(st, 'n-apagada', ['dk'], {}, iso(NOW));
    st = addCard(st, 'n-orfa', ['d-apagado'], {}, iso(NOW));
    st = answer(st, 'n-fogo', true, NOW, 'dk');
    const notes = new Map([['n-fogo', note('n-fogo', 'Fogo')], ['n-orfa', note('n-orfa', 'Órfã')]]);
    const items = studyMirror(st, notes, NOW);
    expect(items.filter((i) => i.tipo === 'carta').map((i) => i.id)).toEqual(['n-fogo']);
    const deck = baralhoV1(st.decks[0]!, st, (n) => notes.has(n), NOW);
    expect(deck).toEqual(jasmine.objectContaining({ id: 'dk', nome: 'Kanji', no_mural: true, estilo: 'biblioteca', posicao: 0, cartas: 1 }));
    expect(deck.por_nivel).toEqual({ desconhecida: 0, nova: 1, aprendendo: 0, dominada: 0 });
    // a carta da anotação apagada não entra na fila
    expect(deck.filas[0]!.itens.map((i) => i.nota)).toEqual(['n-fogo']);
    const ctx = items.find((i) => i.tipo === 'contexto-estudos')!.dados as { cartas: number };
    expect(ctx.cartas).toBe(1);
  });
});
