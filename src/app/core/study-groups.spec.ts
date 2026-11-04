import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { applyStudyRequest, placeInDecks, undoStudy } from './api-requests-study';
import { KanbanStore } from './kanban-store';
import { LabelEdits } from './label-edits';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import {
  GroupOf,
  StudyState,
  addCard,
  addDeck,
  convertGroups,
  deckCopyId,
  decksInGroup,
  emptyStudy,
  liveStudy,
  mergeStudy,
  sameView,
  moveGroup,
  sanitizeDeck,
  sanitizeStudy,
} from './study';
import { STUDY_KEY, StudyStore } from './study-store';

const T0 = '2026-11-02T15:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const NOW = '2026-11-04T12:00:00.000Z';

/** O grupo de cada anotação, de um mapa (a que não está no mapa não existe). */
const groups = (map: Record<string, string | null>): GroupOf => (note) => (note in map ? map[note] : undefined);

/** Um baralho de antes dos grupos (sem o campo), como o guardado por um site da build 732. */
function oldDeck(st: StudyState, name: string, id: string, minute = 0): StudyState {
  return addDeck(st, name, 'amarelo', at(minute), null, id).state;
}

describe('os Estudos por grupo (PLANO-ESTUDOS-GRUPOS.md)', () => {
  describe('o grupo do baralho e a carta que dorme', () => {
    it('o baralho guarda o grupo limpo; sem ele, fica sem o campo (o de antes, por converter)', () => {
      expect(sanitizeDeck({ id: 'd1', name: 'Kana', group: '  Estudo   Japones ', at: T0 })!.group).toBe('Estudo Japones');
      expect('group' in sanitizeDeck({ id: 'd1', name: 'Kana', at: T0 })!).toBeFalse();
      expect('group' in sanitizeDeck({ id: 'd1', name: 'Kana', group: '   ', at: T0 })!).toBeFalse();
    });

    it('a carta só vale nos baralhos do grupo da anotação; mudou de grupo, dorme; voltou, volta', () => {
      let st = addDeck(emptyStudy(), 'Kana', 'amarelo', T0, null, 'dkana', 'Japonês').state;
      st = addDeck(st, 'Redes', 'azul', T0, null, 'dredes', 'Computação').state;
      st = addCard(st, 'n1', ['dkana'], {}, at(1));
      // o mesmo grupo, sem ligar para acento e caixa: nada muda (o mesmo estado)
      expect(liveStudy(st, groups({ n1: 'japones' }))).toBe(st);
      const moved = liveStudy(st, groups({ n1: 'Computação' }));
      expect(moved.cards[0].decks).toEqual([]);
      expect(moved.cards[0].srs).toEqual(st.cards[0].srs);
      // o guardado não muda: voltando ao grupo, a carta volta ao baralho
      expect(st.cards[0].decks).toEqual(['dkana']);
      expect(liveStudy(st, groups({ n1: 'Japonês' })).cards[0].decks).toEqual(['dkana']);
      // sem grupo, ou com o baralho ainda sem grupo, não vale em nenhum
      expect(liveStudy(st, groups({ n1: null })).cards[0].decks).toEqual([]);
      const old = addCard(oldDeck(emptyStudy(), 'Velho', 'dvelho'), 'n1', ['dvelho'], {}, at(1));
      expect(liveStudy(old, groups({ n1: 'Japonês' })).cards[0].decks).toEqual([]);
    });

    it('a vista igual é a mesma: mudar uma anotação sem mudar os Estudos não refaz quem lê', () => {
      let st = addDeck(emptyStudy(), 'Kana', 'amarelo', T0, null, 'dkana', 'Japonês').state;
      st = addCard(st, 'n1', ['dkana'], {}, at(1));
      st = addCard(st, 'n2', ['dkana'], {}, at(2));
      // n2 dorme: a vista é um estado novo a cada vez, mas igual
      const a = liveStudy(st, groups({ n1: 'Japonês', n2: 'Trabalho' }));
      const b = liveStudy(st, groups({ n1: 'Japonês', n2: 'Trabalho' }));
      expect(a).not.toBe(b);
      expect(sameView(a, b)).toBeTrue();
      // n2 volta ao grupo: outra vista
      expect(sameView(a, liveStudy(st, groups({ n1: 'Japonês', n2: 'Japonês' })))).toBeFalse();
    });

    it('os baralhos que a anotação pode ter: os que existem, do grupo dela, sem repetir', () => {
      let st = addDeck(emptyStudy(), 'Kana', 'amarelo', T0, null, 'dkana', 'Japonês').state;
      st = addDeck(st, 'Redes', 'azul', T0, null, 'dredes', 'Computação').state;
      expect(decksInGroup(st, ['dkana', 'dredes', 'dkana', 'nada'], 'JAPONÊS')).toEqual(['dkana']);
      expect(decksInGroup(st, ['dkana'], null)).toEqual([]);
    });
  });

  describe('a conversão dos baralhos de antes', () => {
    it('o grupo é o que mais aparece nas cartas; no empate, o da carta mais antiga; sem cartas, o de sempre', () => {
      let st = oldDeck(emptyStudy(), 'Kana', 'dkana');
      st = oldDeck(st, 'Empate', 'dempate');
      st = oldDeck(st, 'Vazio', 'dvazio');
      st = addCard(st, 'n1', ['dkana', 'dempate'], {}, at(1));
      st = addCard(st, 'n2', ['dkana', 'dempate'], {}, at(2));
      st = addCard(st, 'n3', ['dkana'], {}, at(3));
      const out = convertGroups(st, groups({ n1: 'Inglês', n2: 'Japonês', n3: 'japonês' }), 'Estudos', NOW)!;
      const group = (id: string) => out.state.decks.find((d) => d.id === id)?.group;
      expect(group('dkana')).toBe('Japonês');
      expect(group('dempate')).toBe('Inglês');
      expect(group('dvazio')).toBe('Estudos');
      // o baralho que ganha o grupo fica com a hora de antes
      expect(out.state.decks.find((d) => d.id === 'dkana')!.at).toBe(at(0));
    });

    it('o baralho misto vira um por grupo: a cópia com o mesmo nome e ajustes, o mesmo id em todo aparelho; nada some', () => {
      let st = oldDeck(emptyStudy(), 'Vocabulário', 'dvoc');
      st = { ...st, decks: st.decks.map((d) => ({ ...d, newPerDay: 12, color: 'rosa' as const, icon: 'livro' as const, look: 'selo' as const, wall: true as const })) };
      st = addCard(st, 'n1', ['dvoc'], { title: 'a' }, at(1));
      st = addCard(st, 'n2', ['dvoc'], {}, at(2));
      st = addCard(st, 'n3', ['dvoc'], {}, at(3));
      const g = groups({ n1: 'Japonês', n2: 'Japonês', n3: 'Coreano' });
      const out = convertGroups(st, g, 'Estudos', NOW)!;
      const copy = deckCopyId('dvoc', 'Coreano');
      expect(out.state.decks.map((d) => [d.id, d.name, d.group])).toEqual([
        ['dvoc', 'Vocabulário', 'Japonês'],
        [copy, 'Vocabulário', 'Coreano'],
      ]);
      expect(out.state.decks[1]).toEqual(jasmine.objectContaining({ newPerDay: 12, color: 'rosa', icon: 'livro', look: 'selo', wall: true }));
      expect(out.state.cards.map((c) => [c.note, c.decks])).toEqual([
        ['n1', ['dvoc']],
        ['n2', ['dvoc']],
        ['n3', [copy]],
      ]);
      // a carta que trocou de baralho ganha a hora; o progresso é o mesmo
      expect(out.state.cards[2].at).toBe(NOW);
      expect(out.state.cards[2].srs).toEqual(st.cards[2].srs);
      // todas valem, cada uma no baralho do grupo dela
      expect(liveStudy(out.state, g).cards.every((c) => c.decks.length === 1)).toBeTrue();
      // outro aparelho converte o mesmo: o mesmo resultado, e a junção não duplica
      const there = convertGroups(st, g, 'Estudos', at(99))!;
      expect(mergeStudy(out.state, there.state).decks.map((d) => d.id)).toEqual(['dvoc', copy]);
      // de novo: nada a converter
      expect(convertGroups(out.state, g, 'Estudos', NOW)).toBeNull();
    });

    it('a anotação sem grupo ganha o do baralho dela; a que não existe não conta', () => {
      let st = oldDeck(emptyStudy(), 'Kana', 'dkana');
      st = addCard(st, 'n1', ['dkana'], {}, at(1));
      st = addCard(st, 'n2', ['dkana'], {}, at(2));
      st = addCard(st, 'napagada', ['dkana'], {}, at(3));
      const out = convertGroups(st, groups({ n1: 'Japonês', n2: null }), 'Estudos', NOW)!;
      expect([...out.noteGroups]).toEqual([['n2', 'Japonês']]);
      expect(out.state.cards.map((c) => c.decks)).toEqual([['dkana'], ['dkana'], ['dkana']]);
    });

    it('um grupo vazio nunca é gravado: sem nenhum, nada muda (e a conversão não gira sem fim)', () => {
      const st = oldDeck(emptyStudy(), 'Vazio', 'dvazio');
      expect(convertGroups(st, groups({}), '   ', NOW)).toBeNull();
    });

    it('sem anotações carregadas, o baralho com cartas espera; carregadas e todas apagadas, vai para o de sempre', () => {
      let st = oldDeck(emptyStudy(), 'Kana', 'dkana');
      st = oldDeck(st, 'Vazio', 'dvazio');
      st = addCard(st, 'n1', ['dkana'], {}, at(1));
      const waiting = convertGroups(st, groups({}), 'Estudos', NOW, false)!;
      expect(waiting.state.decks.map((d) => d.group)).toEqual([undefined, 'Estudos']);
      expect(convertGroups(waiting.state, groups({}), 'Estudos', NOW, false)).toBeNull();
      expect(convertGroups(waiting.state, groups({}), 'Estudos', NOW, true)!.state.decks.map((d) => d.group)).toEqual(['Estudos', 'Estudos']);
    });

    it('na junção, o baralho com o grupo vence o de antes sem ele na mesma hora (o site velho jogou o campo fora)', () => {
      let st = oldDeck(emptyStudy(), 'Kana', 'dkana');
      st = addCard(st, 'n1', ['dkana'], {}, at(1));
      const converted = convertGroups(st, groups({ n1: 'Japonês' }), 'Estudos', NOW)!.state;
      expect(mergeStudy(converted, st).decks[0].group).toBe('Japonês');
      expect(mergeStudy(st, converted).decks[0].group).toBe('Japonês');
      // e volta do armazenamento igual
      expect(sanitizeStudy(JSON.parse(JSON.stringify(converted)))).toEqual(converted);
    });
  });

  describe('renomear, juntar e apagar o grupo', () => {
    function sample(): StudyState {
      let st = addDeck(emptyStudy(), 'Kana', 'amarelo', T0, null, 'dkana', 'Japonês').state;
      st = addDeck(st, 'Kanji', 'azul', T0, null, 'dkanji', 'Japonês').state;
      st = addDeck(st, 'kana', 'verde', T0, null, 'dkana2', 'Idiomas').state;
      st = addDeck(st, 'Redes', 'rosa', T0, null, 'dredes', 'Computação').state;
      st = addCard(st, 'n1', ['dkana'], {}, at(1));
      st = addCard(st, 'n2', ['dkanji'], {}, at(2));
      st = addCard(st, 'n3', ['dkana2'], {}, at(3));
      st = addCard(st, 'n4', ['dredes'], {}, at(4));
      return st;
    }

    it('renomeado, os baralhos vão para o nome novo (também quando só muda a escrita)', () => {
      const st = moveGroup(sample(), 'Japonês', 'Nihongo', NOW);
      expect(st.decks.filter((d) => d.group === 'Nihongo').map((d) => d.id)).toEqual(['dkana', 'dkanji']);
      expect(moveGroup(sample(), 'japonês', 'JAPONÊS', NOW).decks.filter((d) => d.group === 'JAPONÊS').map((d) => d.id)).toEqual(['dkana', 'dkanji']);
      expect(moveGroup(sample(), 'Nenhum', 'Outro', NOW)).toEqual(sample());
    });

    it('juntado a um grupo com baralho de mesmo nome, as cartas entram nele e o de antes sai', () => {
      const st = moveGroup(sample(), 'Japonês', 'Idiomas', NOW);
      expect(st.decks.map((d) => [d.id, d.group])).toEqual([
        ['dkanji', 'Idiomas'],
        ['dkana2', 'Idiomas'],
        ['dredes', 'Computação'],
      ]);
      expect(st.cards.map((c) => [c.note, c.decks])).toEqual([
        ['n1', ['dkana2']],
        ['n2', ['dkanji']],
        ['n3', ['dkana2']],
        ['n4', ['dredes']],
      ]);
      expect(st.removed['deck:dkana']).toBe(NOW);
    });

    it('apagado, os baralhos dele saem, com as cartas que só estavam neles', () => {
      const st = moveGroup(sample(), 'Japonês', null, NOW);
      expect(st.decks.map((d) => d.id)).toEqual(['dkana2', 'dredes']);
      expect(st.cards.map((c) => c.note)).toEqual(['n3', 'n4']);
    });
  });

  describe('no site (StudyStore)', () => {
    const note = (id: string, category: string | null): Review => ({
      ...sanitizeReview({
        kind: 'anotacoes',
        game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' },
        ...(category ? { category } : {}),
        scores: { final: 0 },
        status: 'finalizado',
        difficulty: 'nenhuma',
        text: '',
        createdAt: T0,
        updatedAt: T0,
      })!,
      id,
    });
    let store: ReviewStore;

    function boot(saved: StudyState | null, notes: Review[]): StudyStore {
      localStorage.clear();
      if (saved) localStorage.setItem(STUDY_KEY, JSON.stringify(saved));
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      store = TestBed.inject(ReviewStore);
      store.reviews.set(notes);
      const study = TestBed.inject(StudyStore);
      TestBed.tick();
      return study;
    }

    afterEach(() => localStorage.clear());

    it('ao abrir, converte os baralhos de antes: o grupo das cartas, e a anotação sem grupo ganha o do baralho', () => {
      let st = oldDeck(emptyStudy(), 'Kana', 'dkana');
      st = oldDeck(st, 'Vazio', 'dvazio');
      st = addCard(st, 'n1', ['dkana'], {}, at(1));
      st = addCard(st, 'n2', ['dkana'], {}, at(2));
      const study = boot(st, [note('n1', 'Estudo Japones'), note('n2', null), note('n9', 'Trabalho'), note('n8', 'Trabalho')]);
      expect(study.decks().map((d) => [d.name, d.group])).toEqual([
        ['Kana', 'Estudo Japones'],
        // sem cartas: o grupo com mais anotações (não há o grupo Estudos)
        ['Vazio', 'Trabalho'],
      ]);
      expect(store.get('n2')!.category).toBe('Estudo Japones');
      expect(study.cardOf().get('n2')!.decks).toEqual(['dkana']);
      expect(study.changedAt()).toBeGreaterThan(0);
      TestBed.tick();
      expect(JSON.parse(localStorage.getItem(STUDY_KEY)!).decks[0].group).toBe('Estudo Japones');
    });

    it('o baralho novo é do grupo pedido; sem ele, do grupo Estudos', () => {
      const study = boot(null, [note('n1', 'Estudos'), note('n2', 'Trabalho'), note('n3', 'Trabalho')]);
      expect(study.deck(study.addDeck('A', 'amarelo', null, undefined, 'Trabalho'))!.group).toBe('Trabalho');
      expect(study.deck(study.addDeck('B', 'amarelo'))!.group).toBe('Estudos');
    });

    it('só entra em baralho do grupo dela; pedir só os de outro grupo não tira a carta', () => {
      const study = boot(null, [note('n1', 'Japonês')]);
      const kana = study.addDeck('Kana', 'amarelo', null, undefined, 'Japonês');
      const redes = study.addDeck('Redes', 'azul', null, undefined, 'Computação');
      study.addCard('n1', [redes]);
      expect(study.cardOf().has('n1')).toBeFalse();
      study.addCard('n1', [kana, redes]);
      expect(study.cardOf().get('n1')!.decks).toEqual([kana]);
      study.setDecks('n1', [redes]);
      expect(study.cardOf().get('n1')!.decks).toEqual([kana]);
      study.setDecks('n1', []);
      expect(study.cardOf().has('n1')).toBeFalse();
    });

    it('a carta que dorme não tira a anotação do mural; voltando ao grupo, volta a valer (e a tirar)', () => {
      const study = boot(null, [note('n1', 'Japonês')]);
      const kanban = TestBed.inject(KanbanStore);
      const kana = study.addDeck('Kana', 'amarelo', null, undefined, 'Japonês');
      study.addCard('n1', [kana]);
      expect(kanban.boardOnly().has('n1')).toBeTrue();
      store.update({ ...store.get('n1')!, category: 'Computação' });
      expect(study.cardOf().get('n1')!.decks).toEqual([]);
      expect(kanban.boardOnly().has('n1')).toBeFalse();
      // a carta continua guardada, com o baralho de antes
      expect(study.state().cards[0].decks).toEqual([kana]);
      // entrando num baralho do grupo novo, os de outro grupo saem
      const redes = study.addDeck('Redes', 'azul', null, undefined, 'Computação');
      study.addCard('n1', [redes]);
      expect(study.state().cards[0].decks).toEqual([redes]);
    });

    it('renomear e apagar o grupo nas configurações leva os baralhos', () => {
      const study = boot(null, [note('n1', 'Japonês'), note('n2', 'Japonês')]);
      const kana = study.addDeck('Kana', 'amarelo', null, undefined, 'Japonês');
      study.addCard('n1', [kana]);
      const edits = TestBed.inject(LabelEdits);
      edits.renameCategory('Japonês', 'Nihongo');
      expect(study.deck(kana)!.group).toBe('Nihongo');
      expect(study.cardOf().get('n1')!.decks).toEqual([kana]);
      edits.renameCategory('Nihongo', null);
      expect(study.deck(kana)).toBeUndefined();
      expect(study.cardOf().has('n1')).toBeFalse();
    });

    it('pela API, a carta guardada fora dos baralhos não é respondida, e o Desfazer devolve os baralhos dela', () => {
      const study = boot(null, [note('n1', 'Japonês')]);
      const kana = study.addDeck('Kana', 'amarelo', null, undefined, 'Japonês');
      study.addCard('n1', [kana]);
      store.update({ ...store.get('n1')!, category: 'Computação' });
      const ctx = { ownNote: () => ({ name: 'Nota' }), onWall: () => true };
      const answer = applyStudyRequest(study, { op: 'carta.responder', alvo: 'n1', dados: { acertou: true }, criado_em: new Date().toISOString() }, ctx);
      expect(answer.estado).toBe('falhou');
      expect((answer.resultado as { erro: string }).erro).toContain('guardada fora dos baralhos');
      expect(study.state().today).toBeNull();
      // mudar a frente e desfazer: a carta guardada volta inteira, com o baralho de antes (não a da vista, sem nenhum)
      const edit = applyStudyRequest(study, { op: 'carta.editar', alvo: 'n1', dados: { titulo: 'カ' }, criado_em: new Date().toISOString() }, ctx);
      expect(edit.estado).toBe('aplicado');
      undoStudy(study, { op: 'carta.editar', alvo: 'n1', antes: JSON.parse(JSON.stringify(edit.antes)) });
      expect(study.state().cards[0].decks).toEqual([kana]);
      expect(sanitizeStudy(JSON.parse(JSON.stringify(study.state()))).cards.length).toBe(1);
      store.update({ ...store.get('n1')!, category: 'Japonês' });
      expect(study.cardOf().get('n1')!.decks).toEqual([kana]);
    });

    it('os pedidos da API: o baralho de outro grupo é recusado com o motivo; a nota nova sem grupo ganha o do baralho', () => {
      const study = boot(null, [note('n1', 'Japonês'), note('n2', null)]);
      const redes = study.addDeck('Redes', 'azul', null, undefined, 'Computação');
      const ctx = { ownNote: () => ({ name: 'Nota' }), onWall: () => true };
      const out = applyStudyRequest(study, { op: 'carta.por', alvo: 'n1', dados: { baralhos: [redes] }, criado_em: NOW }, ctx);
      expect(out.estado).toBe('falhou');
      expect((out.resultado as { erro: string }).erro).toContain('não são do grupo Japonês');
      expect(placeInDecks(study, 'n2', { baralhos: [redes] } as never)).toBeNull();
      expect(store.get('n2')!.category).toBe('Computação');
      expect(study.cardOf().get('n2')!.decks).toEqual([redes]);
    });
  });
});
