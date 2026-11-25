import {
  POMODORO_DEFAULT,
  advance,
  clampMinutes,
  clockText,
  doneToday,
  focusMs,
  MAX_RUNS,
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
  todayRuns,
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
    const r = readPomodoro({ study: 50, rest: 10, skin: 'neon', corner: 'se', music: false, musicUrl: ' https://x.com/a.mp3 ', on: true, session: 7, phase: 'pausa', startedAt: T0, pausedAt: T0 + MIN, day: '2026-11-08', done: 3 });
    expect(r).toEqual({ v: 1, study: 50, rest: 10, skin: 'neon', corner: 'se', music: false, musicUrl: 'https://x.com/a.mp3', on: true, session: 7, phase: 'pausa', startedAt: T0, pausedAt: T0 + MIN, day: '2026-11-08', done: 3, log: [], runAt: null });
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

  it('cada estudo que começa é uma rodada nova (a música de cada uma é sorteada uma vez)', () => {
    const s = start(POMODORO_DEFAULT, T0);
    expect(s.session).toBe(1);
    // a pausa é da mesma rodada; a volta ao estudo, a próxima (em todas as abas, igual)
    const p = advance(s, T0 + 25 * MIN);
    expect(p.session).toBe(1);
    expect(advance(p, T0 + 30 * MIN).session).toBe(2);
    // pular para a pausa não muda; pular de volta ao estudo, sim
    expect(skip(s, T0 + MIN).session).toBe(1);
    expect(skip(skip(s, T0 + MIN), T0 + 2 * MIN).session).toBe(2);
    // pausar e continuar, mudar o tempo, desligar: a mesma rodada
    expect(resume(pause(s, T0 + MIN), T0 + 2 * MIN).session).toBe(1);
    expect(setMinutes(s, 'estudo', 50, T0 + MIN).session).toBe(1);
    expect(stop(s, T0 + MIN).session).toBe(1);
    // ligar de novo é outra
    expect(start(stop(s, T0 + MIN), T0 + 60 * MIN).session).toBe(2);
    // fechado por muito tempo: o estudo em que para é uma rodada nova
    expect(advance(s, T0 + 3 * 60 * MIN).session).toBe(2);
    // o guardado estranho começa do zero
    expect(readPomodoro({ ...s, session: -3 }).session).toBe(0);
    expect(readPomodoro({ ...s, session: 1.5 }).session).toBe(0);
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
    const s = stop(advance(start({ ...POMODORO_DEFAULT, study: 50, skin: 'neon' }, T0), T0 + 50 * MIN), T0 + 51 * MIN);
    expect(s.on).toBeFalse();
    expect(s.study).toBe(50);
    expect(s.skin).toBe('neon');
    expect(s.done).toBe(1);
  });

  describe('a régua do dia: os trechos andados hoje', () => {
    const fases = (runs: { a: number; b: number; f: string }[]) => runs.map((r) => `${r.f} ${(r.a - T0) / MIN}-${(r.b - T0) / MIN}`);

    it('cada fase que acaba vira um trecho, fechado no fim exato (duas abas gravam o mesmo)', () => {
      const s = start(POMODORO_DEFAULT, T0);
      expect(s.runAt).toBe(T0);
      // a aba que avança atrasada fecha no mesmo lugar que a que avançou na hora
      const late = advance(s, T0 + 27 * MIN);
      expect(late).toEqual(advance(s, T0 + 25 * MIN));
      expect(fases(late.log)).toEqual(['estudo 0-25']);
      expect(late.runAt).toBe(T0 + 25 * MIN);
      expect(fases(advance(late, T0 + 30 * MIN).log)).toEqual(['estudo 0-25', 'pausa 25-30']);
    });

    it('pausar, pular e desligar fecham o trecho; continuar abre outro', () => {
      let s = start(POMODORO_DEFAULT, T0);
      s = pause(s, T0 + 10 * MIN);
      expect(s.runAt).toBeNull();
      s = resume(s, T0 + 12 * MIN);
      expect(s.runAt).toBe(T0 + 12 * MIN);
      s = skip(s, T0 + 20 * MIN);
      s = stop(s, T0 + 23 * MIN);
      expect(fases(s.log)).toEqual(['estudo 0-10', 'estudo 12-20', 'pausa 20-23']);
      expect(s.runAt).toBeNull();
      // pular pausado não abre trecho nenhum
      const p = skip(pause(start(POMODORO_DEFAULT, T0), T0 + MIN), T0 + 2 * MIN);
      expect(fases(p.log)).toEqual(['estudo 0-1']);
      expect(p.runAt).toBeNull();
    });

    it('o trecho curto demais (pausar e continuar logo) não entra', () => {
      const s = pause(start(POMODORO_DEFAULT, T0), T0 + 3000);
      expect(s.log).toEqual([]);
    });

    it('fechado por muito tempo: só a fase que acabou entra, o resto ninguém viu andar', () => {
      const s = advance(start(POMODORO_DEFAULT, T0), T0 + 3 * 60 * MIN);
      expect(fases(s.log)).toEqual(['estudo 0-25']);
      expect(s.runAt).toBeNull();
    });

    it('o que está andando aparece até agora, sem passar do fim da fase', () => {
      const s = start(POMODORO_DEFAULT, T0);
      expect(fases(todayRuns(s, T0 + 6 * MIN))).toEqual(['estudo 0-6']);
      expect(fases(todayRuns(s, T0 + 40 * MIN))).toEqual(['estudo 0-25']);
      expect(todayRuns(pause(s, T0 + MIN), T0 + 6 * MIN).length).toBe(1);
      expect(todayRuns(POMODORO_DEFAULT, T0)).toEqual([]);
    });

    it('a régua é só de hoje, e o foco soma só os estudos (o de ontem conta da meia-noite)', () => {
      const meiaNoite = new Date(2026, 10, 9).getTime();
      const s = { ...POMODORO_DEFAULT, log: [
        { a: T0, b: T0 + 25 * MIN, f: 'estudo' as const },
        { a: meiaNoite - 10 * MIN, b: meiaNoite + 15 * MIN, f: 'estudo' as const },
        { a: meiaNoite + 15 * MIN, b: meiaNoite + 20 * MIN, f: 'pausa' as const },
      ] };
      const amanha = meiaNoite + 60 * MIN;
      expect(todayRuns(s, amanha).length).toBe(2);
      expect(focusMs(todayRuns(s, amanha), amanha)).toBe(15 * MIN);
      // começar no dia seguinte já leva só os de hoje
      expect(start(s, amanha).log.length).toBe(2);
    });

    it('o guardado estranho cai fora, e o turno andando de um site velho conta do começo da fase', () => {
      const lixo = [{ a: 5, b: 1, f: 'estudo' }, { a: 'x', b: 2, f: 'pausa' }, { a: 1, b: 2, f: 'outra' }, null, { a: 1, b: 2, f: 'pausa' }];
      expect(readPomodoro({ log: lixo }).log).toEqual([{ a: 1, b: 2, f: 'pausa' }]);
      const muitos = Array.from({ length: MAX_RUNS + 10 }, (_, i) => ({ a: i, b: i + 1, f: 'estudo' }));
      expect(readPomodoro({ log: muitos }).log.length).toBe(MAX_RUNS);
      expect(readPomodoro({ on: true, startedAt: T0, pausedAt: null }).runAt).toBe(T0);
      // depois de uma pausa, o começo da fase (empurrado) não passa para antes do último trecho
      expect(readPomodoro({ on: true, startedAt: T0, pausedAt: null, log: [{ a: T0, b: T0 + 9 * MIN, f: 'estudo' }] }).runAt).toBe(T0 + 9 * MIN);
      expect(readPomodoro({ on: true, startedAt: T0, pausedAt: T0 + MIN, runAt: T0 }).runAt).toBeNull();
      expect(readPomodoro({ on: false, runAt: T0 }).runAt).toBeNull();
    });
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
