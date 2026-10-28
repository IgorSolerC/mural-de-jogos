import { freshBoard, placeCard } from './kanban';
import { Review, sanitizeReview } from './review';
import { planBlock, planBoards, planFichas, stampAfter } from './sync-merge';

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-02T00:00:00.000Z';
const T2 = '2026-01-03T00:00:00.000Z';
const NOW = '2026-01-04T00:00:00.000Z';

function ficha(id: string, text: string, updatedAt: string, patch: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' },
    text,
    createdAt: T0,
    updatedAt,
    ...patch,
  })!;
}

describe('planFichas (o passo da junção de três vias)', () => {
  const base = ficha('rnota01', 'um\ndois\ntrês', T0);
  const known = (id: string, at: string) => id === 'rnota01' && at === T0;

  it('mudanças em linhas diferentes viram uma ficha juntada, mais nova que as duas', () => {
    const plan = planFichas({
      local: [ficha('rnota01', 'um\ndois\nTRÊS', T2)],
      localDeleted: {},
      remote: [ficha('rnota01', 'UM\ndois\ntrês', T1)],
      remoteDeleted: {},
      known,
      base: () => base,
      now: NOW,
    });
    expect(plan.conflicts).toEqual([]);
    expect(plan.replace.length).toBe(1);
    expect(plan.replace[0].text).toBe('UM\ndois\nTRÊS');
    expect(plan.replace[0].updatedAt).toBe(NOW);
    // a daqui saiu do mural, mas está dentro da juntada: não precisa ficar guardada
    expect(plan.known.has(`rnota01@${T2}`)).toBeTrue();
  });

  it('a mesma linha vira conflito: no mural a de lá, e as duas guardadas', () => {
    const plan = planFichas({
      local: [ficha('rnota01', 'um\ndois daqui\ntrês', T2)],
      localDeleted: {},
      remote: [ficha('rnota01', 'um\ndois de lá\ntrês', T1)],
      remoteDeleted: {},
      known,
      base: () => base,
      now: NOW,
    });
    expect(plan.replace.map((r) => r.text)).toEqual(['um\ndois de lá\ntrês']);
    expect(plan.conflicts.length).toBe(1);
    const c = plan.conflicts[0];
    expect(c.parts).toEqual(['texto']);
    expect(c.a!.text).toBe('um\ndois de lá\ntrês');
    expect(c.b!.text).toBe('um\ndois daqui\ntrês');
    expect(c.b!.updatedAt).toBe(T2);
  });

  it('só um lado mudou: fica para a junção de sempre', () => {
    const plan = planFichas({
      local: [base],
      localDeleted: {},
      remote: [ficha('rnota01', 'outro', T1)],
      remoteDeleted: {},
      known,
      base: () => base,
      now: NOW,
    });
    expect(plan.replace).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  describe('só um lado mudou, num aparelho de relógio atrasado (a mudança é mais velha que a base)', () => {
    const late = ficha('rnota01', 'um\ndois\ntrês', T1);
    const knownLate = (id: string, at: string) => id === 'rnota01' && at === T1;

    it('a mudança de lá não perde para a base daqui: volta mais nova', () => {
      const plan = planFichas({
        local: [late],
        localDeleted: {},
        remote: [ficha('rnota01', 'mudei lá', T0)],
        remoteDeleted: {},
        known: knownLate,
        base: () => undefined,
        now: NOW,
      });
      expect(plan.replace.map((r) => [r.text, r.updatedAt])).toEqual([['mudei lá', NOW]]);
      expect(plan.conflicts).toEqual([]);
    });

    it('a mudança daqui não perde para a base que veio de lá: vai no lugar dela, mais nova', () => {
      const plan = planFichas({
        local: [ficha('rnota01', 'mudei aqui', T0)],
        localDeleted: {},
        remote: [late],
        remoteDeleted: {},
        known: knownLate,
        base: () => late,
        now: NOW,
      });
      expect(plan.replace.map((r) => [r.text, r.updatedAt])).toEqual([['mudei aqui', NOW]]);
      expect(plan.conflicts).toEqual([]);
    });
  });

  it('sem o conteúdo da base, também fica para a junção de sempre', () => {
    const plan = planFichas({
      local: [ficha('rnota01', 'a', T2)],
      localDeleted: {},
      remote: [ficha('rnota01', 'b', T1)],
      remoteDeleted: {},
      known,
      base: () => undefined,
      now: NOW,
    });
    expect(plan.replace).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it('apagada lá e mudada aqui: a daqui fica no mural, mais nova que a exclusão, e vira conflito', () => {
    const plan = planFichas({
      local: [ficha('rnota01', 'mudei', T2)],
      localDeleted: {},
      remote: [],
      remoteDeleted: { rnota01: '2026-01-03T12:00:00.000Z' },
      known,
      base: () => base,
      now: NOW,
    });
    expect(plan.replace.length).toBe(1);
    expect(plan.replace[0].updatedAt).toBe(NOW);
    expect(plan.conflicts[0].a).toBeNull();
    expect(plan.conflicts[0].b!.text).toBe('mudei');
  });

  it('apagada aqui e mudada lá: a de lá volta para o mural e vira conflito', () => {
    const plan = planFichas({
      local: [],
      localDeleted: { rnota01: '2026-01-03T12:00:00.000Z' },
      remote: [ficha('rnota01', 'mudei lá', T1)],
      remoteDeleted: {},
      known,
      base: () => base,
      now: NOW,
    });
    expect(plan.replace.map((r) => r.text)).toEqual(['mudei lá']);
    expect(plan.conflicts[0].a!.text).toBe('mudei lá');
    expect(plan.conflicts[0].b).toBeNull();
  });

  it('mudada só na data (o mesmo conteúdo da base) e apagada no outro: só apaga', () => {
    const plan = planFichas({ local: [{ ...base, updatedAt: T2 }], localDeleted: {}, remote: [], remoteDeleted: { rnota01: NOW }, known, base: () => base, now: NOW });
    expect(plan.replace).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it('apagada aqui sem mudança lá: só apaga', () => {
    const plan = planFichas({ local: [], localDeleted: { rnota01: T1 }, remote: [base], remoteDeleted: {}, known, base: () => base, now: NOW });
    expect(plan.replace).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });
});

describe('planBoards', () => {
  it('fichas postas em colunas diferentes do mesmo quadro nos dois aparelhos ficam as duas', () => {
    const o = { ...freshBoard('Trabalho'), at: T0 };
    const [c1, c2] = o.columns;
    const a = placeCard(o, 'rnota01', c1.id, T1);
    const b = placeCard(o, 'n2', c2.id, T2);
    const plan = planBoards([b], [a], { quadrosV: { [o.id]: T0 }, quadros: { [o.id]: o } }, NOW);
    expect(plan.conflicts).toEqual([]);
    expect(plan.replace[0].cards.map((c) => c.note).sort()).toEqual(['n2', 'rnota01']);
    expect(plan.replace[0].at).toBe(NOW);
  });

  it('a mesma ficha em colunas diferentes não pergunta: fica onde foi posta por último', () => {
    const o = placeCard({ ...freshBoard('Trabalho'), at: T0 }, 'rnota01', freshBoard('Trabalho').columns[0].id, T0);
    const [, c2, c3] = o.columns;
    const a = placeCard(o, 'rnota01', c2.id, T1);
    const b = placeCard(o, 'rnota01', c3.id, T2);
    const plan = planBoards([b], [a], { quadrosV: { [o.id]: o.at }, quadros: { [o.id]: o } }, NOW);
    expect(plan.conflicts).toEqual([]);
    // a daqui foi a mexida por último: fica ela mesma
    expect(plan.replace[0]).toBe(b);
    expect(plan.replace[0].cards[0].column).toBe(c3.id);
  });
});

describe('planBlock', () => {
  it('só lá mudou: vale o de lá; só aqui: fica o daqui; os dois, junta', () => {
    expect(planBlock({ x: 1 }, { x: 1 }, { x: 2 })).toEqual({ kind: 'remoto' });
    expect(planBlock({ x: 1 }, { x: 2 }, { x: 1 })).toEqual({ kind: 'local' });
    expect(planBlock({ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 })).toEqual({ kind: 'junto', dados: { x: 2, y: 2 }, outro: null });
    expect(planBlock({ x: 1 }, { x: 2 }, { x: 3 })).toEqual({ kind: 'junto', dados: { x: 3 }, outro: { x: 2 } });
    expect(planBlock(undefined, { x: 2 }, { x: 3 })).toEqual({ kind: 'sempre' });
  });
});

describe('stampAfter', () => {
  it('depois de todas e no mínimo agora', () => {
    expect(stampAfter(T0, T1, T2)).toBe('2026-01-03T00:00:00.001Z');
    expect(stampAfter(NOW, T1)).toBe(NOW);
  });
});
