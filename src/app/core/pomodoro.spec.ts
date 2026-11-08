import {
  POMODORO_DEFAULT,
  advance,
  clampMinutes,
  clockText,
  doneToday,
  pause,
  phaseEnd,
  progressOf,
  readPomodoro,
  remainingMs,
  resume,
  setMinutes,
  skip,
  spokenTime,
  start,
  stop,
} from './pomodoro';

const MIN = 60_000;
/** Uma manhã qualquer, no fuso do aparelho. */
const T0 = new Date(2026, 10, 8, 9, 0, 0).getTime();

describe('Pomodoro: as regras', () => {
  it('lê o guardado e cai no padrão no que estiver estranho', () => {
    expect(readPomodoro(null)).toEqual(POMODORO_DEFAULT);
    expect(readPomodoro('lixo')).toEqual(POMODORO_DEFAULT);
    const r = readPomodoro({ study: 300, rest: 2, skin: 'foguete', corner: 'meio', music: 'sim', on: true, startedAt: 'ontem', done: -3 });
    expect(r.study).toBe(120);
    expect(r.rest).toBe(5);
    expect(r.skin).toBe('tomate');
    expect(r.corner).toBe('id');
    expect(r.music).toBeTrue();
    // ligado sem começo não é ligado
    expect(r.on).toBeFalse();
    expect(r.done).toBe(0);
  });

  it('guarda o que é válido', () => {
    const r = readPomodoro({ study: 50, rest: 10, skin: 'neon', corner: 'se', music: false, musicUrl: ' https://x.com/a.mp3 ', on: true, phase: 'pausa', startedAt: T0, pausedAt: T0 + MIN, day: '2026-11-08', done: 3 });
    expect(r).toEqual({ v: 1, study: 50, rest: 10, skin: 'neon', corner: 'se', music: false, musicUrl: 'https://x.com/a.mp3', on: true, phase: 'pausa', startedAt: T0, pausedAt: T0 + MIN, day: '2026-11-08', done: 3 });
  });

  it('os tempos vão de 5 a 120, de 5 em 5', () => {
    expect(clampMinutes(1)).toBe(5);
    expect(clampMinutes(5)).toBe(5);
    expect(clampMinutes(27)).toBe(25);
    expect(clampMinutes(28)).toBe(30);
    expect(clampMinutes(121)).toBe(120);
    expect(clampMinutes(Number.NaN, 10)).toBe(10);
  });

  it('começa um estudo e conta pelo relógio', () => {
    const s = start(POMODORO_DEFAULT, T0);
    expect(s.on).toBeTrue();
    expect(s.phase).toBe('estudo');
    expect(remainingMs(s, T0)).toBe(25 * MIN);
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(progressOf(s, T0 + 5 * MIN)).toBeCloseTo(0.2, 5);
    // o relógio do site ainda no segundo de antes do começo: nunca mais que a fase inteira
    expect(remainingMs(s, T0 - 800)).toBe(25 * MIN);
  });

  it('pausado, o tempo não anda; continuar desconta a pausa', () => {
    let s = start(POMODORO_DEFAULT, T0);
    s = pause(s, T0 + 10 * MIN);
    expect(remainingMs(s, T0 + 40 * MIN)).toBe(15 * MIN);
    expect(advance(s, T0 + 40 * MIN)).toBe(s);
    s = resume(s, T0 + 40 * MIN);
    expect(s.pausedAt).toBeNull();
    expect(remainingMs(s, T0 + 40 * MIN)).toBe(15 * MIN);
    expect(phaseEnd(s)).toBe(T0 + 55 * MIN);
  });

  it('acabou o estudo: começa a pausa no fim dele (não agora) e conta um tomatinho', () => {
    const s = start(POMODORO_DEFAULT, T0);
    const a = advance(s, T0 + 25 * MIN + 1500);
    expect(a.phase).toBe('pausa');
    expect(a.startedAt).toBe(T0 + 25 * MIN);
    expect(doneToday(a, T0 + 26 * MIN)).toBe(1);
    // duas abas avançam juntas, em instantes diferentes, e gravam o mesmo
    expect(advance(s, T0 + 25 * MIN + 400)).toEqual(a);
    // antes do fim, nada muda (o mesmo objeto)
    expect(advance(s, T0 + 24 * MIN)).toBe(s);
  });

  it('acabou a pausa: volta ao estudo, sem tomatinho', () => {
    const s = advance(start(POMODORO_DEFAULT, T0), T0 + 25 * MIN);
    const b = advance(s, T0 + 30 * MIN);
    expect(b.phase).toBe('estudo');
    expect(b.startedAt).toBe(T0 + 30 * MIN);
    expect(b.done).toBe(1);
  });

  it('Murall fechado por muito tempo: para no começo de um estudo, pausado', () => {
    const s = start(POMODORO_DEFAULT, T0);
    const later = T0 + 3 * 60 * MIN;
    const a = advance(s, later);
    expect(a.phase).toBe('estudo');
    expect(a.pausedAt).toBe(later);
    expect(remainingMs(a, later + 10 * MIN)).toBe(25 * MIN);
    // o estudo que tinha chegado ao fim conta
    expect(a.done).toBe(1);
  });

  it('os tomatinhos zeram no dia seguinte', () => {
    const s = advance(start(POMODORO_DEFAULT, T0), T0 + 25 * MIN);
    expect(doneToday(s, T0 + 60 * MIN)).toBe(1);
    expect(doneToday(s, T0 + 24 * 60 * MIN)).toBe(0);
    const next = advance(start(s, T0 + 24 * 60 * MIN), T0 + 24 * 60 * MIN + 25 * MIN);
    expect(next.done).toBe(1);
  });

  it('pular começa a próxima agora e não conta tomatinho', () => {
    const s = skip(start(POMODORO_DEFAULT, T0), T0 + 3 * MIN);
    expect(s.phase).toBe('pausa');
    expect(s.startedAt).toBe(T0 + 3 * MIN);
    expect(s.done).toBe(0);
    // pausado, continua pausado
    const p = skip(pause(start(POMODORO_DEFAULT, T0), T0 + MIN), T0 + 2 * MIN);
    expect(p.pausedAt).toBe(T0 + 2 * MIN);
    expect(remainingMs(p, T0 + 9 * MIN)).toBe(5 * MIN);
  });

  it('mudar o tempo no meio guarda o que já passou', () => {
    const s = setMinutes(start(POMODORO_DEFAULT, T0), 'estudo', 30, T0 + 10 * MIN);
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(20 * MIN);
    // o tempo novo já passou: a fase acaba agora, e não vira "Murall fechado"
    const short = setMinutes(start(POMODORO_DEFAULT, T0), 'estudo', 5, T0 + 20 * MIN);
    expect(remainingMs(short, T0 + 20 * MIN)).toBe(0);
    const a = advance(short, T0 + 20 * MIN);
    expect(a.phase).toBe('pausa');
    expect(a.pausedAt).toBeNull();
    // mudar a pausa durante o estudo não mexe no estudo
    const r = setMinutes(start(POMODORO_DEFAULT, T0), 'pausa', 15, T0 + 10 * MIN);
    expect(r.rest).toBe(15);
    expect(r.startedAt).toBe(T0);
  });

  it('desligar guarda os ajustes e os tomatinhos', () => {
    const s = stop(advance(start({ ...POMODORO_DEFAULT, study: 50, skin: 'neon' }, T0), T0 + 50 * MIN));
    expect(s.on).toBeFalse();
    expect(s.study).toBe(50);
    expect(s.skin).toBe('neon');
    expect(s.done).toBe(1);
  });

  it('o tempo à mostra passa de 99 minutos e arredonda o segundo para cima', () => {
    expect(clockText(120 * MIN)).toBe('120:00');
    expect(clockText(25 * MIN - 1)).toBe('25:00');
    expect(clockText(200)).toBe('00:01');
    expect(clockText(0)).toBe('00:00');
    expect(clockText(-5)).toBe('00:00');
  });

  it('o leitor de tela ouve a fase e os minutos', () => {
    const s = start(POMODORO_DEFAULT, T0);
    expect(spokenTime(s, T0 + 13 * MIN)).toBe('Estudo: faltam 12 minutos');
    expect(spokenTime(s, T0 + 24.5 * MIN)).toBe('Estudo: falta menos de um minuto');
    expect(spokenTime(pause(s, T0), T0)).toBe('Estudo pausado: faltam 25 minutos');
  });
});
