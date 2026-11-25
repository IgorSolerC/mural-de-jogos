import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { POMODORO_KEY, POMODORO_SKINS } from '../core/pomodoro';
import { PomodoroStore } from '../core/pomodoro-store';
import { TRACKS_KEY } from '../core/pomodoro-tracks';
import { PomodoroPart, PomodoroSheet } from './pomodoro-sheet';

describe('a folha dos ajustes do Pomodoro', () => {
  beforeEach(() => {
    localStorage.removeItem(POMODORO_KEY);
    localStorage.removeItem(TRACKS_KEY);
    // o título das músicas do YouTube (o oEmbed): nada sai para a internet nos testes
    spyOn(window, 'fetch').and.callFake(async () => new Response(JSON.stringify({ title: 'lofi hip hop radio' }), { status: 200 }));
    TestBed.configureTestingModule({ imports: [PomodoroSheet], providers: [provideZonelessChangeDetection(), provideRouter([])] });
  });
  afterEach(() => {
    document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());
    localStorage.removeItem(POMODORO_KEY);
    localStorage.removeItem(TRACKS_KEY);
  });

  async function open(start: PomodoroPart = 'tempo') {
    const f = TestBed.createComponent(PomodoroSheet);
    f.componentRef.setInput('start', start);
    await f.whenStable();
    const host = f.nativeElement as HTMLElement;
    const store = TestBed.inject(PomodoroStore);
    const parts = () => [...host.querySelectorAll<HTMLButtonElement>('.parte')];
    const part = (name: string) => parts().find((b) => b.querySelector('.parte-nome')!.textContent!.trim() === name)!;
    const go = async (name: string) => {
      part(name).click();
      await f.whenStable();
    };
    return { f, host, store, parts, part, go };
  }

  it('abre como diálogo, na parte da fita tocada, com o que está valendo em cada adesivo', async () => {
    const { host, parts, part } = await open('musica');
    expect(host.querySelector('dialog')!.open).toBeTrue();
    expect(parts().map((b) => b.querySelector('.parte-nome')!.textContent!.trim())).toEqual(['Tempo', 'Música', 'Relógio']);
    expect(part('Música').getAttribute('aria-pressed')).toBe('true');
    expect(part('Tempo').getAttribute('aria-pressed')).toBe('false');
    expect(part('Tempo').querySelector('.parte-valor')!.textContent).toBe('25/5 min');
    expect(part('Música').querySelector('.parte-valor')!.textContent).toBe('1 música');
    expect(part('Relógio').querySelector('.parte-valor')!.textContent).toBe('Tomate');
    expect(host.querySelector('app-pomodoro-tracks')).not.toBeNull();
  });

  it('Tempo: as réguas mudam de 5 em 5, de 5 a 120, e o adesivo acompanha', async () => {
    const { f, host, store, part } = await open();
    const range = host.querySelector<HTMLInputElement>('#pomodoro-estudo')!;
    expect([range.min, range.max, range.step]).toEqual(['5', '120', '5']);
    range.value = '50';
    range.dispatchEvent(new Event('input'));
    await f.whenStable();
    expect(store.save().study).toBe(50);
    host.querySelector<HTMLButtonElement>('[aria-label="Mais 5 minutos de pausa"]')!.click();
    await f.whenStable();
    expect(store.save().rest).toBe(10);
    expect(part('Tempo').querySelector('.parte-valor')!.textContent).toBe('50/10 min');
  });

  it('Tempo: os tempos prontos trocam os dois de uma vez, e o sininho toca a amostra', async () => {
    const { f, host, store } = await open();
    const atalho = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('.atalho')].find((b) => b.textContent!.includes(name))!;
    atalho('Profundo').click();
    await f.whenStable();
    expect([store.save().study, store.save().rest]).toEqual([90, 20]);
    expect(atalho('Profundo').getAttribute('aria-pressed')).toBe('true');
    expect(atalho('Clássico').getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('.ouvir')).not.toBeNull();
  });

  it('Música: desligar a música esconde a lista, e o adesivo diz "desligada"', async () => {
    const { f, host, store, part } = await open('musica');
    host.querySelector<HTMLButtonElement>('.interruptor')!.click();
    await f.whenStable();
    expect(store.save().music).toBeFalse();
    expect(host.querySelector('app-pomodoro-tracks')).toBeNull();
    expect(part('Música').querySelector('.parte-valor')!.textContent).toBe('desligada');
  });

  it('Relógio: as 12 skins numa grade, tocar uma escolhe o relógio; a telinha muda o canto', async () => {
    const { f, host, store, go, part } = await open();
    await go('Relógio');
    expect(part('Relógio').getAttribute('aria-pressed')).toBe('true');
    const skins = host.querySelectorAll<HTMLButtonElement>('.skin');
    expect(skins.length).toBe(POMODORO_SKINS.length);
    skins[3].click();
    await f.whenStable();
    expect(store.save().skin).toBe(POMODORO_SKINS[3].value);
    expect(skins[3].getAttribute('aria-checked')).toBe('true');
    expect(part('Relógio').querySelector('.parte-valor')!.textContent).toBe(POMODORO_SKINS[3].label);
    host.querySelector<HTMLButtonElement>('.tela [aria-label="Em cima, à esquerda"]')!.click();
    await f.whenStable();
    expect(store.save().corner).toBe('se');
  });

  it('fechar avisa quem abriu', async () => {
    const { f, host } = await open();
    const closed = jasmine.createSpy('closed');
    f.componentInstance.closed.subscribe(closed);
    // o evento close do <dialog> chega numa tarefa depois do close(): espera por ele
    const fired = new Promise((r) => host.querySelector('dialog')!.addEventListener('close', r, { once: true }));
    host.querySelector<HTMLButtonElement>('.fecha')!.click();
    await fired;
    await f.whenStable();
    expect(host.querySelector('dialog')!.open).toBeFalse();
    expect(closed).toHaveBeenCalled();
  });
});
