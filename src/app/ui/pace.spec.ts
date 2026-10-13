import { budget, perFrame, resetPace, rest, setForcedSlow, slow, spend, struggling, tick } from './pace';

/** O fôlego do aparelho: quanto trabalho de montar e desenhar fichas cabe num quadro. */
describe('o ritmo dos quadros (pace)', () => {
  beforeEach(() => resetPace());
  afterEach(() => resetPace());

  /** Conta `n` quadros seguidos, cada um `gap` ms depois do outro. */
  function frames(gap: number, n: number, from = 1000): number {
    let t = from;
    for (let i = 0; i < n; i++) {
      tick(t);
      t += gap;
    }
    return t;
  }

  it('a 60 Hz sem atraso, cabem três fichas por quadro e o orçamento é a parte pedida do quadro', () => {
    frames(16.7, 20);
    expect(slow()).toBeFalse();
    expect(perFrame(3)).toBe(3);
    expect(budget(0.5)).toBeCloseTo(8.3, 0);
  });

  it('com os quadros atrasando, uma ficha por quadro e metade do orçamento', () => {
    frames(16.7, 5);
    frames(40, 12, 2000);
    expect(slow()).toBeTrue();
    expect(struggling()).toBeFalse();
    expect(perFrame(3)).toBe(1);
    expect(budget(0.5)).toBeLessThan(5);
  });

  it('sem fôlego nenhum, o orçamento cai para um quarto', () => {
    frames(120, 12);
    expect(struggling()).toBeTrue();
    expect(budget(0.48)).toBeLessThan(2.5);
    expect(budget(0.48)).toBeGreaterThanOrEqual(1);
  });

  it('numa tela de 120 Hz o quadro tem metade do tempo: uma ficha por quadro, sem estar lento', () => {
    frames(8.3, 20);
    expect(slow()).toBeFalse();
    expect(perFrame(3)).toBe(1);
    expect(budget(0.5)).toBeCloseTo(4.2, 0);
  });

  it('a pausa entre duas levas de trabalho não conta como quadro lento', () => {
    const t = frames(16.7, 10);
    rest();
    tick(t + 200);
    tick(t + 216.7);
    expect(slow()).toBeFalse();
    // sem o descanso avisado, um intervalo comprido (mas menor que a folga) pesaria na média
    tick(t + 5000);
    expect(slow()).withContext('muito longe: ninguém estava trabalhando').toBeFalse();
  });

  it('o aparelho que travou volta ao ritmo depois de umas folgas', () => {
    frames(120, 12);
    expect(struggling()).toBeTrue();
    for (let i = 0; i < 80; i++) rest();
    expect(struggling()).toBeFalse();
  });

  it('"Menos fichas prontas" trata o aparelho como lento desde o começo', () => {
    frames(16.7, 10);
    setForcedSlow(true);
    expect(slow()).toBeTrue();
    expect(perFrame(3)).toBe(1);
    setForcedSlow(false);
    expect(slow()).toBeFalse();
  });

  it('quem trabalha depois no mesmo quadro leva o que sobrou', () => {
    frames(16.7, 10);
    const now = 5000;
    const whole = budget(0.48, now);
    spend(now, 5);
    expect(budget(0.48, now)).toBeCloseTo(whole - 5, 1);
    // noutro quadro, o orçamento volta inteiro
    expect(budget(0.48, now + 16.7)).toBeCloseTo(whole, 1);
    // e nunca fica sem nada: ao menos uma ficha anda
    spend(now, 50);
    expect(budget(0.48, now)).toBe(1);
  });
});
