import { publicStudy, publicStudyGroups, readPublicStudy, readVisitStudy } from './public-study';
import { StudyState, addCard, addDeck, answer, emptyStudy, liveStudy, updateDeck } from './study';

const T0 = '2026-11-05T15:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

/** Kanji (público) e Verbos (privado), do grupo Japonês; n1 nos dois, n2 só no Kanji, n3 só nos Verbos. */
function sample(): StudyState {
  let st = emptyStudy();
  st = addDeck(st, 'Kanji', 'amarelo', T0, 'livro', 'dkanji', 'Japonês').state;
  st = addDeck(st, 'Verbos', 'azul', T0, null, 'dverbo', 'Japonês').state;
  st = addCard(st, 'nn01', ['dkanji', 'dverbo'], { title: '日' }, at(1));
  st = addCard(st, 'nn02', ['dkanji'], { title: '月' }, at(2));
  st = addCard(st, 'nn03', ['dverbo'], { title: 'taberu' }, at(3));
  st = answer(st, 'nn01', true, new Date(at(4)));
  return updateDeck(st, 'dkanji', { public: true }, at(5));
}

const all = () => true;

describe('os baralhos públicos (core/public-study.ts)', () => {
  it('sem baralho público, nada vai', () => {
    const st = updateDeck(sample(), 'dkanji', { public: undefined }, at(6));
    expect(publicStudy(st, all, false)).toBeNull();
  });

  it('vão só os públicos, as cartas de anotações à mostra e, de cada carta, só os baralhos públicos', () => {
    const out = publicStudy(sample(), (id) => id !== 'nn02', false)!;
    const decks = out['decks'] as Record<string, unknown>[];
    expect(decks.map((d) => d['id'])).toEqual(['dkanji']);
    // o que é só do dono não vai: as novas por dia, o "no mural", a hora de verdade
    expect(Object.keys(decks[0]).sort()).toEqual(['at', 'color', 'group', 'icon', 'id', 'name', 'order']);
    const cards = out['cards'] as Record<string, unknown>[];
    expect(cards.map((c) => [c['note'], c['decks']])).toEqual([['nn01', ['dkanji']]]);
    expect((cards[0]['stats'] as { seen: number }).seen).toBe(1);
    expect(out['progress']).toBeUndefined();
  });

  it('com o progresso escondido, as cartas vão sem ele, e quem lê sabe', () => {
    const out = publicStudy(sample(), all, true)!;
    const cards = out['cards'] as Record<string, unknown>[];
    expect(cards.every((c) => !('srs' in c) && !('stats' in c))).toBeTrue();
    const read = readPublicStudy(JSON.parse(JSON.stringify(out)))!;
    expect(read.progress).toBeFalse();
    expect(read.cards.every((c) => c.srs.state === 'nova' && c.stats.seen === 0)).toBeTrue();
  });

  it('a carta que dorme (a anotação mudou de grupo) não vai', () => {
    const view = liveStudy(sample(), (note) => (note === 'nn02' ? 'Outro' : 'Japonês'));
    const cards = publicStudy(view, all, false)!['cards'] as { note: string }[];
    expect(cards.map((c) => c.note)).toEqual(['nn01']);
  });

  it('o grupo dos baralhos públicos, para a cor e o ícone da orelha', () => {
    expect(publicStudyGroups(sample())).toEqual(['Japonês']);
  });

  it('quem visita lê o que foi: o progresso, a frente e a ordem', () => {
    const read = readPublicStudy(JSON.parse(JSON.stringify(publicStudy(sample(), all, false))))!;
    expect(read.progress).toBeTrue();
    expect(read.decks.map((d) => [d.id, d.name, d.group, d.public])).toEqual([['dkanji', 'Kanji', 'Japonês', true]]);
    expect(read.cards.map((c) => [c.note, c.front.title, c.srs.state])).toEqual([
      ['nn01', '日', 'aprendendo'],
      ['nn02', '月', 'nova'],
    ]);
  });

  it('a leitura joga fora o que não serve: baralho sem grupo, carta de baralho que não veio, lixo', () => {
    expect(readPublicStudy(null)).toBeNull();
    expect(readPublicStudy([])).toBeNull();
    expect(readPublicStudy({ decks: [{ id: 'dx', name: 'Sem grupo', at: T0 }] })).toBeNull();
    const read = readPublicStudy({
      decks: [{ id: 'dk', name: 'Kanji', group: 'Japonês', at: T0 }, 'lixo'],
      cards: [
        { note: 'nn01', decks: ['dk'], front: {}, added: T0, at: T0 },
        { note: 'nn02', decks: ['outro'], front: {}, added: T0, at: T0 },
        { note: 'nn01', decks: ['dk'], front: { title: 'repetida' }, added: T0, at: T0 },
      ],
    })!;
    expect(read.cards.map((c) => [c.note, c.front.title])).toEqual([['nn01', undefined]]);
  });

  describe('readVisitStudy', () => {
    const estudos = () => JSON.parse(JSON.stringify(publicStudy(sample(), all, false)));
    const note = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      kind: 'anotacoes',
      game: { name: id, coverUrl: null, source: 'manual' },
      scores: { final: 0 },
      status: 'finalizado',
      text: 'atrás',
      createdAt: T0,
      updatedAt: T0,
      ...extra,
    });

    it('guarda só as anotações fora do mural que alguma carta pública usa', () => {
      const parts = readVisitStudy({ estudos: estudos(), soKanban: [note('nn02'), note('nn09')] }, new Set(['nn01']));
      expect(parts.estudos?.decks.length).toBe(1);
      expect(parts.studyNotes.map((r) => r.id)).toEqual(['nn02']);
    });

    it('a privada que viesse fica de fora; sem estudos, nada', () => {
      expect(readVisitStudy({ estudos: estudos(), soKanban: [note('nn02', { private: true })] }, new Set()).studyNotes).toEqual([]);
      expect(readVisitStudy({ soKanban: [note('nn02')] }, new Set())).toEqual({ estudos: null, studyNotes: [] });
      expect(readVisitStudy(null, new Set())).toEqual({ estudos: null, studyNotes: [] });
    });
  });
});
