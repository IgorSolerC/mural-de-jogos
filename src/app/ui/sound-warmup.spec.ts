import { MAX_HELD, Warmable, Warmups } from './sound-warmup';

/** Um widget de mentira: aquecer o "monta" na hora; o teste diz quando terminou. */
class Fake implements Warmable {
  warmed = 0;
  mountedNow = false;
  busy = false;
  constructor(private readonly w: Warmups) {}
  warmUp(): void {
    this.warmed++;
    this.mountedNow = true;
    this.w.mounted(this);
  }
  coolDown(): boolean {
    if (this.busy) return false;
    this.mountedNow = false;
    return true;
  }
}

describe('o aquecimento dos players', () => {
  let idle: (() => void)[];
  let w: Warmups;
  const runIdle = () => {
    const q = idle;
    idle = [];
    q.forEach((cb) => cb());
  };
  beforeEach(() => {
    jasmine.clock().install();
    idle = [];
    w = new Warmups({ dwell: 100, idle: (cb) => idle.push(cb) });
  });
  afterEach(() => jasmine.clock().uninstall());

  it('só quem fica na tela um instante; passar rolando não aquece', () => {
    const a = new Fake(w);
    const b = new Fake(w);
    w.seen(a, true);
    w.seen(b, true);
    jasmine.clock().tick(50);
    w.seen(b, false);
    jasmine.clock().tick(100);
    runIdle();
    expect(a.warmed).toBe(1);
    w.done(a);
    runIdle();
    expect(b.warmed).toBe(0);
  });

  it('um de cada vez, e quando o navegador está à toa', () => {
    const a = new Fake(w);
    const b = new Fake(w);
    w.seen(a, true);
    w.seen(b, true);
    jasmine.clock().tick(100);
    expect(a.warmed).toBe(0);
    runIdle();
    expect([a.warmed, b.warmed]).toEqual([1, 0]);
    runIdle();
    expect(b.warmed).toBe(0);
    w.done(a);
    runIdle();
    expect(b.warmed).toBe(1);
  });

  it(`no máximo ${MAX_HELD} montados: o que saiu da tela há mais tempo dá lugar; o da tela e o que toca, nunca`, () => {
    const all = Array.from({ length: MAX_HELD + 2 }, () => new Fake(w));
    for (const f of all.slice(0, MAX_HELD)) {
      w.seen(f, true);
      jasmine.clock().tick(100);
      runIdle();
      w.done(f);
    }
    expect(all.slice(0, MAX_HELD).every((f) => f.mountedNow)).toBeTrue();
    // todos na tela: o próximo espera
    const next = all[MAX_HELD];
    w.seen(next, true);
    jasmine.clock().tick(100);
    runIdle();
    expect(next.warmed).toBe(0);
    // o primeiro sai da tela, mas está tocando: fica; o segundo sai: dá o lugar
    all[0].busy = true;
    w.seen(all[0], false);
    runIdle();
    expect(next.warmed).toBe(0);
    w.seen(all[1], false);
    runIdle();
    expect(all[0].mountedNow).toBeTrue();
    expect(all[1].mountedNow).toBeFalse();
    expect(next.warmed).toBe(1);
  });

  it('um aquecimento que não acaba não prende a fila', () => {
    const a = new Fake(w);
    const b = new Fake(w);
    w.seen(a, true);
    w.seen(b, true);
    jasmine.clock().tick(100);
    runIdle();
    jasmine.clock().tick(13000);
    runIdle();
    expect(b.warmed).toBe(1);
  });

  it('nada com economia de dados ligada', () => {
    const nav = navigator as Navigator & { connection?: unknown };
    const had = Object.getOwnPropertyDescriptor(nav, 'connection');
    Object.defineProperty(nav, 'connection', { configurable: true, value: { saveData: true } });
    try {
      const a = new Fake(w);
      w.seen(a, true);
      jasmine.clock().tick(100);
      runIdle();
      expect(a.warmed).toBe(0);
    } finally {
      if (had) Object.defineProperty(nav, 'connection', had);
      else delete (nav as { connection?: unknown }).connection;
    }
  });
});
