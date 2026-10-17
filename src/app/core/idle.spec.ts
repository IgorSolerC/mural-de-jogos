import { IdleDeadlineLike, cancelIdle, whenIdle } from './idle';

describe('whenIdle', () => {
  const g = globalThis as { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };

  it('usa o requestIdleCallback com o prazo pedido', () => {
    const ric = jasmine.createSpy('ric').and.returnValue(7);
    const cic = jasmine.createSpy('cic');
    const before = [g.requestIdleCallback, g.cancelIdleCallback];
    g.requestIdleCallback = ric;
    g.cancelIdleCallback = cic;
    try {
      const run = () => {};
      expect(whenIdle(run, 600, { after: 80, deadline: { timeRemaining: () => 8 } })).toBe(7);
      expect(ric).toHaveBeenCalledWith(run, { timeout: 600 });
      whenIdle(run, undefined, { after: 80, deadline: { timeRemaining: () => 8 } });
      expect(ric.calls.mostRecent().args).toEqual([run]);
      cancelIdle(7);
      expect(cic).toHaveBeenCalledWith(7);
    } finally {
      [g.requestIdleCallback, g.cancelIdleCallback] = before;
    }
  });

  it('sem requestIdleCallback, roda depois do tempo de reserva com o prazo de reserva', () => {
    jasmine.clock().install();
    const before = [g.requestIdleCallback, g.cancelIdleCallback];
    g.requestIdleCallback = undefined;
    g.cancelIdleCallback = undefined;
    try {
      const seen: IdleDeadlineLike[] = [];
      const deadline = { timeRemaining: () => 8, didTimeout: true };
      whenIdle((d) => seen.push(d), 600, { after: 80, deadline });
      jasmine.clock().tick(79);
      expect(seen).toEqual([]);
      jasmine.clock().tick(1);
      expect(seen).toEqual([deadline]);
      const id = whenIdle((d) => seen.push(d), 600, { after: 80, deadline });
      cancelIdle(id);
      jasmine.clock().tick(200);
      expect(seen.length).toBe(1);
    } finally {
      [g.requestIdleCallback, g.cancelIdleCallback] = before;
      jasmine.clock().uninstall();
    }
  });
});
