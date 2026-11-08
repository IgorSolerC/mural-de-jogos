import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { POMODORO_KEY, POMODORO_SKINS } from '../core/pomodoro';
import { PomodoroStore } from '../core/pomodoro-store';
import { PomodoroPage } from './pomodoro-page';

describe('a página do Pomodoro', () => {
  beforeEach(() => {
    localStorage.removeItem(POMODORO_KEY);
    TestBed.configureTestingModule({ imports: [PomodoroPage], providers: [provideZonelessChangeDetection(), provideRouter([])] });
  });
  afterEach(() => localStorage.removeItem(POMODORO_KEY));

  async function open() {
    const f = TestBed.createComponent(PomodoroPage);
    await f.whenStable();
    const host = f.nativeElement as HTMLElement;
    const store = TestBed.inject(PomodoroStore);
    const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(text));
    return { f, host, store, button };
  }

  it('desligada, mostra 25/5 prontos e um botão só para começar', async () => {
    const { host, button } = await open();
    expect(host.querySelector('.estado')!.textContent).toContain('Desligado. Começa com 25 min de estudo e 5 de pausa.');
    expect(host.querySelector('.vitrine app-pomodoro-dial')!.getAttribute('data-tempo')).toBe('25:00');
    expect(button('Começar o foco')).toBeDefined();
    expect(button('Pausar')).toBeUndefined();
  });

  it('Começar o foco liga o Pomodoro e grava no aparelho', async () => {
    const { f, store, button } = await open();
    button('Começar o foco')!.click();
    await f.whenStable();
    expect(store.on()).toBeTrue();
    expect(JSON.parse(localStorage.getItem(POMODORO_KEY)!).on).toBeTrue();
    expect(button('Pausar')).toBeDefined();
    expect(button('Pular para a pausa')).toBeDefined();
    expect(button('Desligar')).toBeDefined();
    expect(f.nativeElement.querySelector('.estado').textContent).toMatch(/^Faltam 25 min de estudo\. A pausa começa às \d{1,2}h\d{2}\.$/);
  });

  it('as réguas mudam os tempos, de 5 em 5, de 5 a 120', async () => {
    const { f, host, store } = await open();
    const range = host.querySelector<HTMLInputElement>('#pomodoro-estudo')!;
    expect(range.min).toBe('5');
    expect(range.max).toBe('120');
    expect(range.step).toBe('5');
    range.value = '50';
    range.dispatchEvent(new Event('input'));
    await f.whenStable();
    expect(store.save().study).toBe(50);
    // o mais e o menos da pausa
    const plus = host.querySelector<HTMLButtonElement>('[aria-label="Mais 5 minutos de pausa"]')!;
    plus.click();
    await f.whenStable();
    expect(store.save().rest).toBe(10);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Menos 5 minutos de pausa"]')!.disabled).toBeFalse();
  });

  it('os tempos prontos trocam os dois de uma vez', async () => {
    const { f, store, button } = await open();
    button('Profundo')!.click();
    await f.whenStable();
    expect([store.save().study, store.save().rest]).toEqual([90, 20]);
    expect(button('Profundo')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('o link que o site não sabe tocar mostra o erro e não vale; vazio é a música de sempre', async () => {
    const { f, host, store } = await open();
    const input = host.querySelector<HTMLInputElement>('#pomodoro-link')!;
    input.value = 'https://exemplo.com/pagina';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await f.whenStable();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('.link-dica')!.textContent).toContain('não é de um som');
    expect(store.save().musicUrl).toBe('');
    input.value = 'https://exemplo.com/foco.mp3';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await f.whenStable();
    expect(store.save().musicUrl).toBe('https://exemplo.com/foco.mp3');
    expect(host.querySelector('.link-dica')!.textContent).toContain('Toca o arquivo');
  });

  it('a música desligada esconde o campo do link', async () => {
    const { f, host, store } = await open();
    host.querySelector<HTMLButtonElement>('.interruptor')!.click();
    await f.whenStable();
    expect(store.save().music).toBeFalse();
    expect(host.querySelector('#pomodoro-link')).toBeNull();
  });

  it('a parede tem as 12 skins vivas, e tocar uma escolhe o relógio do canto', async () => {
    const { f, host, store } = await open();
    const clocks = host.querySelectorAll<HTMLButtonElement>('.relogios [role="radio"]');
    expect(clocks.length).toBe(POMODORO_SKINS.length);
    clocks[3].click();
    await f.whenStable();
    expect(store.save().skin).toBe(POMODORO_SKINS[3].value);
    expect(clocks[3].getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('.vitrine app-pomodoro-dial')!.classList).toContain('d-' + POMODORO_SKINS[3].value);
  });

  it('o canto da tela muda pela telinha', async () => {
    const { f, host, store } = await open();
    host.querySelector<HTMLButtonElement>('.tela [aria-label="Em cima, à esquerda"]')!.click();
    await f.whenStable();
    expect(store.save().corner).toBe('se');
  });

  it('desligar pela página tem Desfazer', async () => {
    const { f, store, button } = await open();
    button('Começar o foco')!.click();
    await f.whenStable();
    button('Desligar')!.click();
    await f.whenStable();
    expect(store.on()).toBeFalse();
    expect(button('Começar o foco')).toBeDefined();
  });
});
