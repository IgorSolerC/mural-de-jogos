import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CloudAccount, CloudError } from './cloud-account';
import { Cloud } from './cloud-config';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { GROUPS_AUTO, SharedGroupsStore } from './shared-groups-store';
import { SharedStore } from './shared-store';
import { GroupStudy, StudyPart, mergeStudyParts, overlayStudy, readStudyPart, samePart, studyPart, studyPartDoc } from './shared-study';
import { StudyState, addCard, addDeck, answer, emptyStudy, pauseDeck, sanitizeStudy } from './study';
import { StudyStore } from './study-store';

/** Os Flashcards de um grupo compartilhado (PLANO-FLASHCARDS-GRUPO.md): o documento do grupo, a vista e o serviço. */

const T0 = '2026-11-21T10:00:00.000Z';
const T1 = '2026-11-21T11:00:00.000Z';
const T2 = '2026-11-21T12:00:00.000Z';

/** Os Estudos de alguém com o baralho "Kana" no grupo `group` e a anotação `n-um0001` como carta dele. */
function withDeck(group = 'Trabalho', at = T0): { st: StudyState; deck: string } {
  const made = addDeck(emptyStudy(), 'Kana', 'amarelo', at, null, 'dKana0001', group);
  return { st: addCard(made.state, 'n-um0001', [made.id], { title: 'あ' }, at), deck: made.id };
}

const groupOf = (part: StudyPart | null, extra: Partial<GroupStudy> = {}): GroupStudy => ({ id: 'gTrabalho001', name: 'Trabalho', part, write: true, manage: true, ...extra });

describe('Flashcards do grupo: o documento e a vista (core/shared-study.ts)', () => {
  it('o documento guarda o baralho e a carta sem o progresso, a pausa, nem o grupo de cada um', () => {
    const { st, deck } = withDeck();
    const studied = pauseDeck(answer(st, 'n-um0001', true, new Date(T1)), deck, T1);
    const part = studyPart(studied, groupOf(null), new Set(), T2);
    const doc = studyPartDoc(part) as { decks: Record<string, unknown>[]; cards: Record<string, unknown>[] };
    expect(doc.decks.map((d) => d['name'])).toEqual(['Kana']);
    for (const k of ['paused', 'pauseAt', 'group']) expect(doc.decks[0]).withContext(k).not.toEqual(jasmine.objectContaining({ [k]: jasmine.anything() }));
    expect(doc.cards[0]).toEqual(jasmine.objectContaining({ note: 'n-um0001', decks: [deck], front: { title: 'あ' } }));
    expect(Object.keys(doc.cards[0])).not.toContain('srs');
    expect(Object.keys(doc.cards[0])).not.toContain('stats');
    // e volta igual, com o nome que o grupo tem aqui
    const back = readStudyPart(JSON.parse(JSON.stringify(doc)), 'Trabalho · Ana')!;
    expect(back.decks[0].group).toBe('Trabalho · Ana');
    expect(samePart(back, part)).toBeTrue();
  });

  it('a vista: o baralho e a frente vêm do documento; o progresso, a pausa e as novas por dia, do guardado', () => {
    const { st, deck } = withDeck();
    const doc = studyPart(st, groupOf(null), new Set(), T0);
    // no documento, outra pessoa mudou o nome e a frente
    const theirs: StudyPart = {
      ...doc,
      decks: doc.decks.map((d) => ({ ...d, name: 'Hiragana', at: T2 })),
      cards: doc.cards.map((c) => ({ ...c, front: { title: 'い' }, at: T2 })),
    };
    // aqui, a pessoa estudou, pausou e pôs 10 novas por dia (na cópia guardada, com o nome de antes)
    let mine = answer(st, 'n-um0001', true, new Date(T1));
    mine = pauseDeck({ ...mine, decks: mine.decks.map((d) => ({ ...d, newPerDay: 10 })) }, deck, T1);
    const view = overlayStudy(mine, [groupOf(theirs)]);
    expect(view.decks[0]).toEqual(jasmine.objectContaining({ name: 'Hiragana', newPerDay: 10, paused: T1, group: 'Trabalho' }));
    expect(view.cards[0].front).toEqual({ title: 'い' });
    expect(view.cards[0].stats.right).toBe(1);
    expect(view.cards[0].srs).toBe(mine.cards[0].srs);
  });

  it('a carta do documento que a pessoa nunca estudou chega nova; a carta guardada num baralho que o documento não conhece fica só dela', () => {
    const { st } = withDeck();
    const doc = studyPart(st, groupOf(null), new Set(), T0);
    const own = addDeck(emptyStudy(), 'Meu', 'azul', T0, null, 'dMeu00001', 'Pessoal');
    const mine = addCard(own.state, 'n-outra01', [own.id], {}, T0);
    const view = overlayStudy(mine, [groupOf(doc)]);
    expect(view.decks.map((d) => d.name).sort()).toEqual(['Kana', 'Meu']);
    expect(view.cards.map((c) => c.note).sort()).toEqual(['n-outra01', 'n-um0001']);
    expect(view.cards.find((c) => c.note === 'n-um0001')!.srs.state).toBe('nova');
  });

  it('o apagado no documento some da vista, mesmo com a cópia guardada aqui', () => {
    const { st, deck } = withDeck();
    const doc = studyPart(st, groupOf(null), new Set(), T0);
    const gone: StudyPart = { decks: [], cards: [], removed: { [`deck:${deck}`]: T1, 'card:n-um0001': T1 } };
    const view = overlayStudy(st, [groupOf(mergeStudyParts(doc, gone))]);
    expect(view.decks).toEqual([]);
    expect(view.cards).toEqual([]);
  });

  it('a vista e a parte se desfazem uma na outra: sem mudança, nada a subir', () => {
    const { st } = withDeck();
    const doc = studyPart(st, groupOf(null), new Set(), T0);
    const studied = answer(st, 'n-um0001', false, new Date(T1));
    const view = overlayStudy(studied, [groupOf(doc)]);
    expect(samePart(doc, studyPart(view, groupOf(doc), new Set(), T2))).toBeTrue();
  });

  it('o baralho do documento só sai com o apagado: o que não aparece (o nome do grupo mudando no meio) fica', () => {
    const { st, deck } = withDeck();
    const doc = studyPart(st, groupOf(null), new Set(), T0);
    const elsewhere = { ...st, decks: st.decks.map((d) => ({ ...d, group: 'Outro nome' })), cards: [] };
    // a carta saiu de tudo (com a hora dela): ela sai do documento; o baralho fica
    const out = studyPart({ ...elsewhere, decks: [] }, groupOf(doc), new Set(), T2);
    expect(out.decks.map((d) => d.id)).toEqual([deck]);
    const removed = studyPart({ ...st, decks: [], removed: { [`deck:${deck}`]: T1 } }, groupOf(doc), new Set(), T2);
    expect(removed.decks).toEqual([]);
    expect(removed.removed[`deck:${deck}`]).toBe(T1);
  });

  it('quem não gere o grupo não muda quem vê o baralho; as novas por dia de um baralho que já está no documento ficam as dele', () => {
    const { st, deck } = withDeck();
    const doc = studyPart(st, groupOf(null), new Set(), T0);
    const changed = { ...st, decks: st.decks.map((d) => ({ ...d, public: true as const, newPerDay: 50, name: 'Kana 2', at: T1 })) };
    const out = studyPart(changed, groupOf(doc, { manage: false }), new Set(), T2);
    expect(out.decks[0]).toEqual(jasmine.objectContaining({ id: deck, name: 'Kana 2', newPerDay: doc.decks[0].newPerDay }));
    expect(out.decks[0].public).toBeUndefined();
    expect(studyPart(changed, groupOf(doc), new Set(), T2).decks[0].public).toBeTrue();
  });

  it('o baralho de outro grupo compartilhado não entra, nem um de outro grupo do mural', () => {
    const { st } = withDeck('Casa');
    expect(studyPart(st, groupOf(null), new Set(), T0).decks).toEqual([]);
    const same = withDeck();
    expect(studyPart(same.st, groupOf(null), new Set([same.deck]), T0).decks).toEqual([]);
  });

  it('duas pessoas ao mesmo tempo: o baralho de uma e a carta da outra ficam', () => {
    const { st } = withDeck();
    const base = studyPart(st, groupOf(null), new Set(), T0);
    const a = studyPart(addDeck(overlayStudy(emptyStudy(), [groupOf(base)]), 'Kanji', 'azul', T1, null, 'dKanji001', 'Trabalho').state, groupOf(base), new Set(), T1);
    const b = studyPart(addCard(overlayStudy(emptyStudy(), [groupOf(base)]), 'n-dois001', ['dKana0001'], {}, T2), groupOf(base), new Set(), T2);
    const m = mergeStudyParts(a, b);
    expect(m.decks.map((d) => d.name)).toEqual(['Kana', 'Kanji']);
    expect(m.cards.map((c) => c.note)).toEqual(['n-um0001', 'n-dois001']);
  });

  it('a junção de quem não gere o grupo: a mexida daqui não desfaz o público que a gestora acabou de ligar', () => {
    const { st } = withDeck();
    const base = studyPart(st, groupOf(null), new Set(), T0);
    const theirs: StudyPart = { ...base, decks: base.decks.map((d) => ({ ...d, public: true as const, at: T1 })) };
    const mine: StudyPart = { ...base, decks: base.decks.map((d) => ({ ...d, name: 'Hiragana', at: T2 })) };
    const m = mergeStudyParts(theirs, mine, true);
    expect(m.decks[0]).toEqual(jasmine.objectContaining({ name: 'Hiragana', public: true }));
    expect(mergeStudyParts(theirs, mine).decks[0].public).toBeUndefined();
  });

  it('o baralho que a pessoa já tinha no grupo continua dela enquanto não vai para o documento (o do Leitor)', () => {
    const { st } = withDeck();
    const view = overlayStudy(st, [groupOf({ decks: [], cards: [], removed: {} }, { write: false, manage: false })]);
    expect(view.decks.map((d) => d.name)).toEqual(['Kana']);
    expect(view.cards.map((c) => c.note)).toEqual(['n-um0001']);
  });
});

const ANA = { codigo: 'AAAA-1111', nome: 'Ana Souza' };
const EU = { codigo: 'EEEE-0000', nome: 'Igor' };

const note = (id: string, extra: Record<string, unknown> = {}): Review =>
  sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' },
    text: '',
    category: 'Trabalho',
    completedAt: '2026-11-21',
    createdAt: T0,
    updatedAt: T0,
    private: true,
    ...extra,
  })!;

describe('Flashcards do grupo: o serviço (StudyStore com o SharedGroupsStore)', () => {
  /** A nuvem de mentira de um grupo só ("Trabalho"): a vez de gravar (`rev`) e o 409 com o de agora. */
  let server: { rev: number; dados: Record<string, unknown>; papel: string; here: boolean };
  let puts: number;

  const detail = () => ({
    id: 'gTrabalho001',
    dono: server.papel === 'dono' ? EU : ANA,
    papel: server.papel,
    rev: server.rev,
    versao: server.rev,
    dados: server.dados,
    publico: false,
    notas: 2,
    membros: server.papel === 'dono' ? [{ ...ANA, papel: 'editor', desde: T0 }] : [{ ...EU, papel: server.papel, desde: T0 }],
    atualizadoEm: T0,
  });

  function setup(papel = 'dono', dados: Record<string, unknown> = { nome: 'Trabalho' }, keep = false) {
    if (!keep) server = { rev: 1, dados, papel, here: true };
    puts = 0;
    // as anotações do grupo (as de outra pessoa entram com o grupo, e não contam como um grupo seu de mesmo nome)
    const inGroup = new Set(['n-um0001', 'n-dois001']);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: GROUPS_AUTO, useValue: false },
        {
          provide: SharedStore,
          useValue: {
            entries: signal(new Map()),
            groupNames: signal(new Map()),
            sharedIds: () => new Set(),
            get: (id: string) => (papel !== 'dono' && inGroup.has(id) ? { id, grupo: 'gTrabalho001', papel } : undefined),
            inGroupOf: () => [],
            placeInGroup: () => undefined,
            sync: async () => undefined,
            unshare: async () => false,
          },
        },
        { provide: Cloud, useValue: { config: () => ({ api: 'x' }) } },
        {
          provide: CloudAccount,
          useValue: {
            signedIn: () => true,
            account: () => ({ id: 'u-eu', ...EU }),
            request: async (path: string, init?: { method?: string; body?: { base?: number; dados?: Record<string, unknown> } }) => {
              if (path === '/v1/eu/grupos') return { grupos: server.here ? [{ id: 'gTrabalho001', versao: server.rev, papel: server.papel }] : [] };
              if (path.startsWith('/v1/eu/grupos/detalhes')) return { grupos: [detail()] };
              if (init?.method === 'PUT') {
                puts++;
                if (init.body!.base !== server.rev) throw new CloudError('Outra pessoa gravou antes.', 'conflito', 409, { grupo: detail() });
                server = { ...server, rev: server.rev + 1, dados: init.body!.dados! };
                return { grupo: detail() };
              }
              return { ok: true };
            },
          },
        },
      ],
    });
    const store = TestBed.inject(ReviewStore);
    for (const id of inGroup) if (!store.get(id)) store.add(note(id));
    return { groups: TestBed.inject(SharedGroupsStore), study: TestBed.inject(StudyStore), store };
  }

  /** O que o documento do grupo tem dos Flashcards agora. */
  const docPart = () => readStudyPart(server.dados['estudos'], 'Trabalho');
  /** O documento com o baralho "Kana" da Ana, com a `n-um0001` dentro. */
  const anasDoc = () => {
    const { st } = withDeck();
    return { nome: 'Trabalho', estudos: studyPartDoc(studyPart(st, groupOf(null), new Set(), T0)) };
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('o dono leva para o grupo os baralhos dele que estavam ali (o de antes desta build), com as cartas e sem o progresso', async () => {
    const { st } = withDeck();
    localStorage.setItem('meu-mural:estudos:v1', JSON.stringify(answer(st, 'n-um0001', true, new Date(T1))));
    const { groups, study } = setup();
    await groups.sync();
    TestBed.tick();
    await groups.pushAll();
    expect(puts).toBe(1);
    const part = docPart()!;
    expect(part.decks.map((d) => d.name)).toEqual(['Kana']);
    expect(part.cards.map((c) => c.note)).toEqual(['n-um0001']);
    expect(part.cards[0].stats.right).toBe(0);
    // e o progresso continua aqui
    expect(study.cardOf().get('n-um0001')!.stats.right).toBe(1);
  });

  it('a editora vê o baralho do grupo, e mudar a frente ou o nome sobe para todos; estudar não sobe nada', async () => {
    const { groups, study } = setup('editor', anasDoc());
    await groups.sync();
    TestBed.tick();
    expect(study.decks().map((d) => d.name)).toEqual(['Kana']);
    study.answer('n-um0001', true);
    TestBed.tick();
    await groups.pushAll();
    expect(puts).toBe(0);
    study.updateFront('n-um0001', { title: 'う' });
    study.updateDeck('dKana0001', { name: 'Hiragana' });
    TestBed.tick();
    await groups.pushAll();
    expect(puts).toBe(1);
    expect(docPart()!.decks[0].name).toBe('Hiragana');
    expect(docPart()!.cards[0].front).toEqual({ title: 'う' });
    expect(study.cardOf().get('n-um0001')!.stats.right).toBe(1);
  });

  it('a editora cria um baralho e põe uma carta nele: vão para o grupo', async () => {
    const { groups, study } = setup('editor', anasDoc());
    await groups.sync();
    TestBed.tick();
    const id = study.addDeck('Kanji', 'azul', null, undefined, 'Trabalho');
    study.addCard('n-dois001', [id], { title: '日' });
    TestBed.tick();
    await groups.pushAll();
    expect(docPart()!.decks.map((d) => d.name)).toEqual(['Kana', 'Kanji']);
    expect(docPart()!.cards.find((c) => c.note === 'n-dois001')!.decks).toEqual([id]);
  });

  it('apagar o baralho do grupo apaga para todos, e ele não volta pela cópia guardada', async () => {
    const { groups, study } = setup('editor', anasDoc());
    await groups.sync();
    TestBed.tick();
    study.removeDeck('dKana0001');
    TestBed.tick();
    await groups.pushAll();
    expect(docPart()!.decks).toEqual([]);
    expect(docPart()!.cards).toEqual([]);
    expect(study.decks()).toEqual([]);
  });

  it('quem só lê vê e estuda o baralho do grupo, pausa para si, e não muda nada nele', async () => {
    const { groups, study } = setup('leitor', anasDoc());
    await groups.sync();
    TestBed.tick();
    study.updateDeck('dKana0001', { name: 'Outro' });
    study.updateFront('n-um0001', { title: 'x' });
    study.answer('n-um0001', true);
    study.pauseDeck('dKana0001');
    TestBed.tick();
    await groups.pushAll();
    expect(puts).toBe(0);
    expect(study.deck('dKana0001')!.name).toBe('Kana');
    expect(study.deck('dKana0001')!.paused).toBeTruthy();
    expect(study.cardOf().get('n-um0001')!.front).toEqual({ title: 'あ' });
    expect(study.cardOf().get('n-um0001')!.stats.right).toBe(1);
  });

  it('duas pessoas ao mesmo tempo: a carta da Ana e a daqui ficam (a junção carta a carta)', async () => {
    const { groups, study } = setup('editor', anasDoc());
    await groups.sync();
    TestBed.tick();
    // a Ana pôs a n-dois001 no baralho enquanto isso (rev 2 na nuvem)
    const hers = addCard(overlayStudy(emptyStudy(), [groupOf(docPart())]), 'n-dois001', ['dKana0001'], {}, new Date(Date.now() + 1000).toISOString());
    server = { ...server, rev: server.rev + 1, dados: { ...server.dados, estudos: studyPartDoc(studyPart(hers, groupOf(docPart()), new Set(), T2)) } };
    study.updateFront('n-um0001', { title: 'え' });
    TestBed.tick();
    await groups.pushAll();
    const part = docPart()!;
    expect(part.cards.map((c) => c.note).sort()).toEqual(['n-dois001', 'n-um0001']);
    expect(part.cards.find((c) => c.note === 'n-um0001')!.front).toEqual({ title: 'え' });
  });

  it('parar de compartilhar: o dono fica com os baralhos como estavam no grupo, e com o progresso', async () => {
    const { groups, study } = setup('dono', anasDoc());
    await groups.sync();
    TestBed.tick();
    study.answer('n-um0001', true);
    // outra pessoa renomeou o baralho no grupo
    const part = docPart()!;
    server = { ...server, rev: server.rev + 1, dados: { ...server.dados, estudos: studyPartDoc({ ...part, decks: part.decks.map((d) => ({ ...d, name: 'Hiragana', at: T2 })) }) } };
    await groups.sync();
    TestBed.tick();
    await groups.stop('gTrabalho001');
    TestBed.tick();
    expect(study.saved().decks.map((d) => d.name)).toEqual(['Hiragana']);
    expect(study.decks().map((d) => d.name)).toEqual(['Hiragana']);
    expect(study.cardOf().get('n-um0001')!.stats.right).toBe(1);
  });

  it('sair do grupo: os baralhos dele saem dos seus Estudos', async () => {
    const { groups, study } = setup('editor', anasDoc());
    await groups.sync();
    TestBed.tick();
    study.answer('n-um0001', true);
    expect(study.saved().decks.map((d) => d.id)).toEqual(['dKana0001']);
    await groups.leave('gTrabalho001');
    TestBed.tick();
    expect(study.decks()).toEqual([]);
    expect(sanitizeStudy(JSON.parse(localStorage.getItem('meu-mural:estudos:v1')!)).decks).toEqual([]);
  });

  it('a mudança vai para o guardado inteira (o aparelho de uma build de antes continua vendo o baralho)', async () => {
    const { groups, study } = setup('editor', anasDoc());
    await groups.sync();
    TestBed.tick();
    study.answer('n-um0001', true);
    TestBed.tick();
    expect(study.saved().decks.map((d) => d.name)).toEqual(['Kana']);
    expect(study.saved().cards.map((c) => c.note)).toEqual(['n-um0001']);
  });
});
