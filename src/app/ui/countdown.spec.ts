import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Clock } from '../core/clock';
import { Countdown } from './countdown';

/** O bloquinho do contador: o que ele escreve ao lado e o carimbo, uma vez só e nos que se repetem. */
describe('contador (o bloquinho)', () => {
  const at = (y: number, m: number, d: number, h = 0, min = 0, sec = 0) => new Date(y, m - 1, d, h, min, sec).getTime();
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
    // com menos de um dia, a folha diz 0 dias (e as horas vão para o lado)
    expect(text(el, '.folha .num')).toBe('0');
    expect(text(el, '.folha .unid')).toBe('dias');
    expect(text(el, '.resto')).toBe('01h00min00s');
    now.set(at(2026, 10, 17, 8, 20));
    TestBed.tick();
    expect(text(el, '.carimbo')).toBe('É agora!');
    expect(el.querySelector('.contador')!.getAttribute('aria-label')).toBe('Contador: Remédio. É agora, 08:00.');
    now.set(at(2026, 10, 17, 9, 30));
    TestBed.tick();
    expect(el.querySelector('.carimbo')).toBeNull();
    expect(text(el, '.folha .num')).toBe('0');
    expect(text(el, '.resto')).toBe('22h30min00s');
  });

  it('o calendário conta sempre em dias, e com mais de um dia o lado fica só com o nome e o dia', () => {
    now.set(at(2026, 10, 17, 12));
    const el = make(['18/10/2026 18:00', 'Show']);
    expect(text(el, '.papelao')).toBe('Falta');
    expect(text(el, '.folha')).toBe('1dia');
    expect(el.querySelector('.resto')).toBeNull();
    expect(el.querySelector('.fita')).toBeNull();
    now.set(at(2026, 10, 18, 9, 15));
    TestBed.tick();
    expect(text(el, '.papelao')).toBe('Faltam');
    expect(text(el, '.folha')).toBe('0dias');
    expect(text(el, '.resto')).toBe('08h45min00s');
  });

  it('neon: dias, horas, minutos e segundos nos sete segmentos, e a palavra quando chega', () => {
    now.set(at(2026, 10, 17, 12));
    const el = make(['19/11/2026 18:00', 'neon', 'GTA VI']);
    expect(el.querySelector('.contador')!.classList).toContain('jeito-neon');
    expect(text(el, '.placa-nome')).toBe('GTA VI');
    expect(text(el, '.placa-quando')).toBe('19 nov 2026 · 18:00');
    // 33 dias, 6 horas: 8 algarismos, e o 3 acende a, b, c, d, g
    const digits = el.querySelectorAll('.seg');
    expect(digits.length).toBe(8);
    const lit = (svg: Element) => [...svg.querySelectorAll('polygon')].map((p) => (p.classList.contains('aceso') ? 1 : 0)).join('');
    expect(lit(digits[0])).toBe('1111001');
    expect(lit(digits[3])).toBe('1011111');
    expect([...el.querySelectorAll('.placa-unid')].map((u) => u.textContent!.trim())).toEqual(['dias', 'horas', 'min', 'seg']);
    now.set(at(2026, 11, 19, 18, 1));
    TestBed.tick();
    expect(text(el, '.neon-palavra')).toBe('Chegou!');
    expect(el.querySelector('.seg')).toBeNull();
  });

  it('placar: cada algarismo numa plaquinha, e a que muda vira (a de antes cai por cima)', () => {
    now.set(at(2026, 10, 17, 12, 0, 5));
    const el = make(['18/10/2026 13:00', 'placar']);
    const cells = () => [...el.querySelectorAll('.cela')].map((c) => c.querySelector('.meia.cima .letra')!.textContent!.trim()).join('');
    expect(cells()).toBe('01005955');
    expect(el.querySelector('.cela.vira')).toBeNull();
    now.set(at(2026, 10, 17, 12, 0, 6));
    TestBed.tick();
    expect(cells()).toBe('01005954');
    const turning = el.querySelectorAll('.cela.vira');
    expect(turning.length).toBe(1);
    expect(turning[0].querySelector('.cai .letra')!.textContent!.trim()).toBe('5');
    expect(turning[0].querySelector('.sobe .letra')!.textContent!.trim()).toBe('4');
    now.set(at(2026, 10, 18, 13, 0, 1));
    TestBed.tick();
    expect(cells()).toBe('CHEGOU');
  });

  it('riscado: o número de hoje à caneta, os dois de antes riscados', () => {
    now.set(at(2026, 10, 17, 12));
    const el = make(['20/10/2026', 'riscado', 'Viagem']);
    expect(text(el, '.recado-falta')).toBe('faltam');
    expect(text(el, '.recado-num')).toBe('2');
    expect([...el.querySelectorAll('.riscado')].map((r) => r.textContent!.trim())).toEqual(['4', '3']);
    expect(text(el, '.recado-unid')).toBe('dias');
    expect(text(el, '.nome')).toBe('Viagem');
    now.set(at(2026, 10, 20, 8));
    TestBed.tick();
    expect(text(el, '.recado-palavra')).toBe('Chegou!');
  });

  it('toda semana no dia: "É hoje!", sem o "Foi em"', () => {
    now.set(at(2026, 10, 23, 20));
    const el = make(['toda sexta 18:00']);
    expect(text(el, '.carimbo')).toBe('É hoje!');
    expect(text(el, '.quando')).not.toContain('Foi em');
    expect(text(el, '.resto')).toBe('Hoje. Amanhã volta a contar para a semana que vem.');
  });
});
