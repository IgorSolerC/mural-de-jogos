import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { POMODORO_KEY } from '../core/pomodoro';
import { PomodoroStore } from '../core/pomodoro-store';
import { expectEtiquetaPadrao } from '../testing/etiqueta-acoes.spec';
import { PomodoroCorner } from './pomodoro-corner';
import { Toasts } from './toast';

describe('o relógio do canto do Pomodoro', () => {
  beforeEach(() => {
    localStorage.removeItem(POMODORO_KEY);
    TestBed.configureTestingModule({ imports: [PomodoroCorner], providers: [provideZonelessChangeDetection(), provideRouter([])] });
  });
  afterEach(() => localStorage.removeItem(POMODORO_KEY));

  async function open(skin: 'tomate' | 'neon' = 'tomate') {
    const store = TestBed.inject(PomodoroStore);
    store.setMusic(false);
    store.setSkin(skin);
    store.start();
    const f = TestBed.createComponent(PomodoroCorner);
    await f.whenStable();
    return { f, store, host: f.nativeElement as HTMLElement };
  }

  it('mostra a fase e o tempo, e diz ao leitor de tela por minuto', async () => {
    const { host } = await open();
    const timer = host.querySelector('a.mostrador')!;
    expect(timer.getAttribute('aria-label')).toMatch(/^Estudo: faltam 25 minutos\. Abrir o Pomodoro$/);
    expect(host.querySelector('app-pomodoro-dial')!.getAttribute('data-tempo')).toMatch(/^(25:00|24:59)$/);
    expect(timer.getAttribute('href')).toBe('/extras/pomodoro');
  });

  it('os botões seguem a etiqueta de ações dos cards (separados, crescem, ganham cor)', async () => {
    const { host } = await open();
    expectEtiquetaPadrao(host.querySelector<HTMLElement>('.acoes')!);
  });

  it('o X desliga o Pomodoro e o Desfazer liga de novo, como estava', async () => {
    const { host, store } = await open();
    const toasts = TestBed.inject(Toasts);
    const show = spyOn(toasts, 'show').and.callThrough();
    const startedAt = store.save().startedAt;
    host.querySelector<HTMLButtonElement>('.tirar')!.click();
    expect(store.on()).toBeFalse();
    expect(JSON.parse(localStorage.getItem(POMODORO_KEY)!).on).toBeFalse();
    const [text, action] = show.calls.mostRecent().args;
    expect(text).toBe('Pomodoro desligado.');
    // desligado, a pessoa muda a pausa antes de desfazer: a pausa nova fica
    store.setMinutes('pausa', 15);
    action!.run();
    expect(store.on()).toBeTrue();
    expect(store.save().startedAt).toBe(startedAt);
    expect(store.save().rest).toBe(15);
  });

  it('pausa, continua e pula a fase', async () => {
    const { host, store, f } = await open();
    host.querySelector<HTMLButtonElement>('.pausar')!.click();
    await f.whenStable();
    expect(store.paused()).toBeTrue();
    expect(host.querySelector('.pausar')!.getAttribute('aria-label')).toBe('Continuar o Pomodoro');
    host.querySelector<HTMLButtonElement>('.pausar')!.click();
    expect(store.paused()).toBeFalse();
    host.querySelector<HTMLButtonElement>('.pular')!.click();
    expect(store.save().phase).toBe('pausa');
  });

  it('o botão da música liga e desliga a música do estudo', async () => {
    const { host, store, f } = await open();
    const btn = () => host.querySelector<HTMLButtonElement>('.musica')!;
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    btn().click();
    await f.whenStable();
    expect(store.save().music).toBeTrue();
    expect(btn().getAttribute('aria-pressed')).toBe('true');
  });

  it('a fase que acaba vira a próxima sozinha (o relógio anda o turno)', async () => {
    const { store, f } = await open();
    const s = store.save();
    // a fase começou há 25 minutos: o próximo tique a termina
    localStorage.setItem(POMODORO_KEY, JSON.stringify({ ...s, startedAt: Date.now() - 25 * 60_000 - 500 }));
    window.dispatchEvent(new StorageEvent('storage', { key: POMODORO_KEY }));
    store.tick();
    await f.whenStable();
    expect(store.save().phase).toBe('pausa');
  });

  it('arrastar para perto de outro canto leva o relógio para lá', async () => {
    const { host, store, f } = await open();
    const el = host.querySelector<HTMLElement>('.relogio')!;
    expect(el.classList).toContain('canto-id');
    el.setPointerCapture = () => {};
    const dial = host.querySelector<HTMLElement>('.mostrador')!;
    const r = el.getBoundingClientRect();
    const from = { x: r.left + 10, y: r.top + 10 };
    dial.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 7, clientX: from.x, clientY: from.y }));
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: from.x - innerWidth, clientY: from.y - innerHeight }));
    await f.whenStable();
    // ainda solto do canto, seguindo o dedo
    expect(el.style.translate).not.toBe('');
    // o meio do relógio está agora em cima, à esquerda
    spyOn(el, 'getBoundingClientRect').and.returnValue(new DOMRect(10, 10, 120, 80));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: 20, clientY: 20 }));
    await f.whenStable();
    expect(store.save().corner).toBe('se');
    expect(el.classList).toContain('canto-se');
  });
});
