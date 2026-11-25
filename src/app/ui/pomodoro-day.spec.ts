import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PomodoroPhase, PomodoroRun } from '../core/pomodoro';
import { PomodoroDay, dayWindow, focusText } from './pomodoro-day';

const MIN = 60_000;
const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m).getTime();

describe('a régua do dia do Pomodoro', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  async function open(runs: PomodoroRun[], now: number, done = 0, phase: PomodoroPhase | null = null) {
    const f = TestBed.createComponent(PomodoroDay);
    f.componentRef.setInput('runs', runs);
    f.componentRef.setInput('now', now);
    f.componentRef.setInput('done', done);
    f.componentRef.setInput('phase', phase);
    await f.whenStable();
    return f.nativeElement as HTMLElement;
  }

  it('do primeiro trecho (ou de uma hora antes de agora) até duas horas depois de agora, com pelo menos 8 horas', () => {
    // nada hoje: uma hora antes, oito horas
    expect(dayWindow([], at(14, 20))).toEqual({ from: 13, to: 21 });
    // o dia de estudo desde as 6h40
    expect(dayWindow([{ a: at(6, 40), b: at(7, 5), f: 'estudo' }], at(9))).toEqual({ from: 6, to: 14 });
    expect(dayWindow([{ a: at(6, 40), b: at(7, 5), f: 'estudo' }], at(18, 30))).toEqual({ from: 6, to: 21 });
    // de noite, até a meia-noite, ainda com oito horas
    expect(dayWindow([], at(23, 10))).toEqual({ from: 16, to: 24 });
    // o trecho que veio de ontem começa na meia-noite
    expect(dayWindow([{ a: at(0) - 20 * MIN, b: at(0, 10), f: 'estudo' }], at(9)).from).toBe(0);
  });

  it('o tempo de foco em horas e minutos', () => {
    expect(focusText(0)).toBe('0 min');
    expect(focusText(45 * MIN + 30_000)).toBe('45 min');
    expect(focusText(75 * MIN)).toBe('1h15');
    expect(focusText(120 * MIN)).toBe('2h00');
  });

  it('pinta cada trecho com o marca-texto da fase, no lugar das horas, e diz o resumo', async () => {
    const runs: PomodoroRun[] = [
      { a: at(9), b: at(9, 25), f: 'estudo' },
      { a: at(9, 25), b: at(9, 30), f: 'pausa' },
      { a: at(9, 30), b: at(9, 45), f: 'estudo' },
    ];
    const host = await open(runs, at(10), 1, 'estudo');
    const trechos = host.querySelectorAll<HTMLElement>('.trecho');
    expect(trechos.length).toBe(3);
    expect(trechos[1].classList).toContain('pausa');
    // 9h numa régua das 9h às 17h: o começo
    expect(Number(trechos[0].style.getPropertyValue('--de'))).toBeCloseTo(0, 5);
    expect(Number(trechos[0].style.getPropertyValue('--ate'))).toBeCloseTo(25 / 60 / 8, 5);
    expect(trechos[0].title).toBe('Estudo das 9h00 às 9h25');
    expect(host.querySelector('.dia-conta')!.textContent).toBe('1 estudo · 40 min de foco');
    // o leitor de tela ouve a lista dos trechos
    expect([...host.querySelectorAll('ol.sr-only li')].map((li) => li.textContent)).toEqual(['Estudo das 9h00 às 9h25', 'Pausa das 9h25 às 9h30', 'Estudo das 9h30 às 9h45']);
    // a régua é só desenho
    expect(host.querySelector('.regua')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('os riscos de quarto em quarto de hora, os números de hora em hora, e o agora na fita-crepe', async () => {
    const host = await open([], at(15, 30), 0, null);
    // das 14h às 22h
    expect(host.querySelectorAll('.riscos i').length).toBe(33);
    expect(host.querySelectorAll('.riscos i.grande').length).toBe(9);
    expect([...host.querySelectorAll('.numeros b')].map((b) => b.textContent)).toEqual(['14h', '15h', '16h', '17h', '18h', '19h', '20h', '21h', '22h']);
    const agora = host.querySelector<HTMLElement>('.agora')!;
    expect(Number(agora.style.getPropertyValue('--at'))).toBeCloseTo(1.5 / 8, 5);
    // o número embaixo da fita-crepe some (às 15h30, nenhum: 15h e 16h ficam a meia hora)
    expect(host.querySelectorAll('.numeros b.coberto').length).toBe(0);
    expect(agora.classList).toContain('parado');
    expect(host.querySelector('.dia-conta')!.textContent).toBe('nenhum estudo ainda');
    expect(host.querySelector('ol')).toBeNull();
  });

  it('a meia-noite é 0h, e o número embaixo do agora some', async () => {
    const host = await open([], at(23, 10), 0, null);
    const nums = [...host.querySelectorAll('.numeros b')];
    expect(nums.at(-1)!.textContent).toBe('0h');
    const h = await open([], at(14, 5), 0, null);
    expect([...h.querySelectorAll('.numeros b.coberto')].map((b) => b.textContent)).toEqual(['14h']);
  });

  it('um dia de estudo comprido passa a numerar de duas em duas horas', async () => {
    const host = await open([{ a: at(7), b: at(7, 25), f: 'estudo' }], at(19), 1, null);
    expect([...host.querySelectorAll('.numeros b')].map((b) => b.textContent)).toEqual(['8h', '10h', '12h', '14h', '16h', '18h', '20h']);
    expect(host.querySelectorAll('.riscos i').length).toBe(29);
  });

  it('o primeiro estudo do dia andando já conta o foco', async () => {
    const host = await open([{ a: at(9), b: at(9, 12), f: 'estudo' }], at(9, 12), 0, 'estudo');
    expect(host.querySelector('.dia-conta')!.textContent).toBe('o primeiro andando · 12 min de foco');
  });

  it('o agora leva o traço da fase que anda', async () => {
    const host = await open([], at(15), 0, 'pausa');
    const agora = host.querySelector('.agora')!;
    expect(agora.classList).toContain('pausa');
    expect(agora.classList).not.toContain('parado');
  });
});
