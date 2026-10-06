import { NUDGE_EVERY_MS, nudgeDue } from './login-nudge';

describe('convite para entrar', () => {
  const now = Date.parse('2026-10-06T12:00:00Z');

  it('aparece se nunca apareceu, ou se a data guardada é inválida', () => {
    expect(nudgeDue(null, now)).toBeTrue();
    expect(nudgeDue('ontem', now)).toBeTrue();
  });

  it('espera os 2 dias depois de aparecer ou ser fechado', () => {
    const next = new Date(now + NUDGE_EVERY_MS).toISOString();
    expect(nudgeDue(next, now)).toBeFalse();
    expect(nudgeDue(next, now + NUDGE_EVERY_MS - 1)).toBeFalse();
    expect(nudgeDue(next, now + NUDGE_EVERY_MS)).toBeTrue();
  });
});
