import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Clock } from '../core/clock';
import { Countdown } from './countdown';

/** O bloquinho do contador: o que ele escreve ao lado e o carimbo, uma vez só e nos que se repetem. */
describe('contador (o bloquinho)', () => {
  const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
  const now = signal(at(2026, 10, 17, 12));

  function make(args: string[]): HTMLElement {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: Clock, useValue: { now, use: () => undefined } }],
    });
    const f = TestBed.createComponent(Countdown);
    f.componentRef.setInput('args', args);
    f.detectChanges();
    return f.nativeElement;
  }
  const text = (el: HTMLElement, sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('uma vez só e todo ano: a data, como sempre', () => {
    now.set(at(2026, 10, 17, 12));
    const once = make(['19/11/2026 18:00', 'GTA VI']);
    expect(text(once, '.nome')).toBe('GTA VI');
    expect(text(once, '.quando')).toBe('19 nov 2026 · 18:00');
    TestBed.resetTestingModule();
    const xmas = make(['25/12']);
    expect(text(xmas, '.nome')).toBe('25 dez');
    expect(text(xmas, '.quando')).toBe('todo ano');
  });

  it('toda semana: a regra é o nome, e a linha diz o próximo dia', () => {
    now.set(at(2026, 10, 17, 12));
    const el = make(['toda sexta 18:00']);
    expect(text(el, '.nome')).toBe('Toda sexta');
    expect(text(el, '.quando')).toBe('23 out · 18:00');
    expect(el.querySelector('.contador')!.getAttribute('aria-label')).toBe('Contador. Faltam 6 dias e 6 horas, até 23 de outubro às 18:00 (toda sexta).');
  });

  it('com título, a regra vai para a linha do dia', () => {
    now.set(at(2026, 10, 17, 12));
    const el = make(['todo dia 5 10:00', 'Aluguel']);
    expect(text(el, '.nome')).toBe('Aluguel');
    expect(text(el, '.quando')).toBe('todo dia 5 · 5 nov · 10:00');
  });

  it('todo dia: só a hora; na hora, "É agora!", e logo volta a contar', () => {
    now.set(at(2026, 10, 17, 7));
    const el = make(['todo dia 08:00', 'Remédio']);
    expect(text(el, '.quando')).toBe('todo dia · 08:00');
    expect(text(el, '.folha .unid')).toBe('hora');
    now.set(at(2026, 10, 17, 8, 20));
    TestBed.tick();
    expect(text(el, '.carimbo')).toBe('É agora!');
    expect(el.querySelector('.contador')!.getAttribute('aria-label')).toBe('Contador: Remédio. É agora, 08:00.');
    now.set(at(2026, 10, 17, 9, 30));
    TestBed.tick();
    expect(el.querySelector('.carimbo')).toBeNull();
    expect(text(el, '.folha .num')).toBe('22');
  });

  it('toda semana no dia: "É hoje!", sem o "Foi em"', () => {
    now.set(at(2026, 10, 23, 20));
    const el = make(['toda sexta 18:00']);
    expect(text(el, '.carimbo')).toBe('É hoje!');
    expect(text(el, '.quando')).not.toContain('Foi em');
    expect(text(el, '.resto')).toBe('Hoje. Amanhã volta a contar para a semana que vem.');
  });
});
