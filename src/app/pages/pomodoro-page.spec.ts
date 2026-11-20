import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { POMODORO_KEY, POMODORO_SKINS } from '../core/pomodoro';
import { PomodoroStore } from '../core/pomodoro-store';
import { TRACKS_KEY } from '../core/pomodoro-tracks';
import { PomodoroTracks } from '../core/pomodoro-tracks-store';
import { Toasts } from '../ui/toast';
import { PomodoroPage } from './pomodoro-page';

describe('a página do Pomodoro', () => {
  beforeEach(() => {
    localStorage.removeItem(POMODORO_KEY);
    localStorage.removeItem(TRACKS_KEY);
    // o título das músicas do YouTube (o oEmbed): nada sai para a internet nos testes
    spyOn(window, 'fetch').and.callFake(async () => new Response(JSON.stringify({ title: 'lofi hip hop radio' }), { status: 200 }));
    TestBed.configureTestingModule({ imports: [PomodoroPage], providers: [provideZonelessChangeDetection(), provideRouter([])] });
  });
  afterEach(() => {
    localStorage.removeItem(POMODORO_KEY);
    localStorage.removeItem(TRACKS_KEY);
  });

  async function open() {
    const f = TestBed.createComponent(PomodoroPage);
    await f.whenStable();
    const host = f.nativeElement as HTMLElement;
    const store = TestBed.inject(PomodoroStore);
    const tracks = TestBed.inject(PomodoroTracks);
    const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(text));
    const rows = () => [...host.querySelectorAll<HTMLElement>('.faixa:not(.vazia)')];
    const names = () => rows().map((r) => r.querySelector('.faixa-nome')!.textContent!.trim());
    /** Escreve o link no "Pôr uma música" e aperta o Pôr na lista. */
    const put = async (url: string) => {
      const input = host.querySelector<HTMLInputElement>('#pomodoro-link')!;
      input.value = url;
      input.dispatchEvent(new Event('input'));
      button('Pôr na lista')!.click();
      await f.whenStable();
      await new Promise((r) => setTimeout(r));
      await f.whenStable();
    };
    return { f, host, store, tracks, button, rows, names, put };
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

  it('a lista começa com a rádio de sempre, marcada no sorteio; ligado, é ela que toca', async () => {
    const { f, names, rows, button } = await open();
    expect(names()).toEqual(['Rádio lofi de sempre']);
    expect(rows()[0].querySelector('.faixa-marca')!.getAttribute('aria-checked')).toBe('true');
    expect(rows()[0].classList).not.toContain('da-vez');
    button('Começar o foco')!.click();
    await f.whenStable();
    expect(rows()[0].classList).toContain('da-vez');
    expect(rows()[0].querySelector('.faixa-vez')!.textContent).toContain('tocando agora');
  });

  it('as marcadas entram no sorteio de cada estudo; a dica diz quantas', async () => {
    const { f, host, store, tracks, rows, put, button } = await open();
    const hint = () => host.querySelector('.link-dica')!.textContent!.trim();
    expect(hint()).toContain('Ela toca em todo estudo');
    await put('https://exemplo.com/a.mp3');
    await put('https://exemplo.com/b.mp3');
    expect(hint()).toBe('Cada estudo sorteia uma das 3 marcadas, sem repetir a do estudo de antes.');
    // tira a rádio e a primeira do sorteio
    rows()[0].querySelector<HTMLButtonElement>('.faixa-marca')!.click();
    rows()[1].querySelector<HTMLButtonElement>('.faixa-marca')!.click();
    await f.whenStable();
    expect(rows()[0].querySelector('.faixa-marca')!.getAttribute('aria-checked')).toBe('false');
    expect(rows()[0].classList).toContain('fora');
    expect(hint()).toBe('Só uma marcada: ela toca em todo estudo. Marque mais para sortear.');
    expect(JSON.parse(localStorage.getItem(TRACKS_KEY)!).tracks.map((t: { on: boolean }) => t.on)).toEqual([false, false, true]);
    button('Começar o foco')!.click();
    await f.whenStable();
    expect(tracks.current()?.id).toBe(tracks.tracks()[2].id);
    // nenhuma marcada: a rádio de sempre (fora da lista)
    rows()[2].querySelector<HTMLButtonElement>('.faixa-marca')!.click();
    await f.whenStable();
    expect(hint()).toContain('Nenhuma marcada: toca a rádio lofi de sempre');
    store.stop();
    await f.whenStable();
    expect(tracks.current()).toBeNull();
  });

  it('a música única de antes da lista vira o primeiro item, com o título achado', async () => {
    localStorage.setItem(POMODORO_KEY, JSON.stringify({ v: 1, musicUrl: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' }));
    const { f, names } = await open();
    await new Promise((r) => setTimeout(r));
    await f.whenStable();
    expect(names()).toEqual(['lofi hip hop radio']);
    expect(JSON.parse(localStorage.getItem(TRACKS_KEY)!).tracks[0].url).toBe('https://www.youtube.com/watch?v=jfKfPfyJRdk');
  });

  it('pôr uma música: o link que toca entra no fim com o título do vídeo; o que não toca mostra o erro', async () => {
    const { host, names, put } = await open();
    await put('https://exemplo.com/pagina');
    const input = host.querySelector<HTMLInputElement>('#pomodoro-link')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('.link-dica')!.textContent).toContain('não é de um som');
    expect(names().length).toBe(1);
    await put('https://www.youtube.com/watch?v=jfKfPfyJRdk');
    expect(names()).toEqual(['Rádio lofi de sempre', 'lofi hip hop radio']);
    expect(input.value).toBe('');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    // o mesmo link de novo não entra
    await put('https://youtu.be/jfKfPfyJRdk');
    expect(names().length).toBe(2);
    expect(host.querySelector('.link-dica')!.textContent).toContain('já está na lista, como "lofi hip hop radio"');
    // um arquivo fica com o nome dele
    await put('https://exemplo.com/foco_total.mp3');
    expect(names()[2]).toBe('foco total');
  });

  it('o lápis renomeia ali mesmo; o Esc desiste e o foco volta ao lápis', async () => {
    const { f, host, names, tracks, put } = await open();
    await put('https://exemplo.com/foco.mp3');
    const id = tracks.tracks()[1].id;
    host.querySelector<HTMLButtonElement>(`[data-faixa-lapis="${id}"]`)!.click();
    await f.whenStable();
    let input = host.querySelector<HTMLInputElement>(`[data-faixa-campo="${id}"]`)!;
    expect(document.activeElement).toBe(input);
    input.value = 'Chuva para estudar';
    input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await f.whenStable();
    expect(names()[1]).toBe('Chuva para estudar');
    expect(document.activeElement).toBe(host.querySelector(`[data-faixa-lapis="${id}"]`));
    // de novo, e o Esc desiste
    host.querySelector<HTMLButtonElement>(`[data-faixa-lapis="${id}"]`)!.click();
    await f.whenStable();
    input = host.querySelector<HTMLInputElement>(`[data-faixa-campo="${id}"]`)!;
    input.value = 'outro';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await f.whenStable();
    expect(names()[1]).toBe('Chuva para estudar');
  });

  it('tocar outra escolhe a da vez; tirar da lista tem Desfazer', async () => {
    const { f, host, names, tracks, rows, put, button } = await open();
    await put('https://exemplo.com/foco.mp3');
    const id = tracks.tracks()[1].id;
    rows()[1].querySelector<HTMLButtonElement>('[title="Tocar no próximo estudo"]')!.click();
    await f.whenStable();
    expect(tracks.next()?.id).toBe(id);
    expect(rows()[1].classList).toContain('da-vez');
    expect(rows()[1].querySelector('.faixa-vez')!.textContent).toContain('a do próximo estudo');
    // ligado, ela é a deste estudo, tocando
    button('Começar o foco')!.click();
    await f.whenStable();
    expect(tracks.current()?.id).toBe(id);
    expect(rows()[1].querySelector('.faixa-vez')!.textContent).toContain('tocando agora');
    // tirar a da vez: a primeira volta a ser a da vez, e o Desfazer põe de volta
    rows()[1].querySelector<HTMLButtonElement>('[title="Tirar da lista"]')!.click();
    await f.whenStable();
    expect(names()).toEqual(['Rádio lofi de sempre']);
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('"foco" saiu da lista.');
    toast.action!.run();
    await f.whenStable();
    expect(names()).toEqual(['Rádio lofi de sempre', 'foco']);
    expect(tracks.current()?.id).toBe(id);
    // sem nenhuma, a frase da rádio de sempre
    for (const t of tracks.tracks()) tracks.remove(t.id);
    await f.whenStable();
    expect(host.querySelector('.faixa.vazia')!.textContent).toContain('toca a rádio lofi de sempre');
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

  it('o Desfazer do desligar volta com a música que tocava, mesmo escolhida outra para o próximo no meio', async () => {
    const { f, tracks, rows, put, button } = await open();
    await put('https://exemplo.com/a.mp3');
    button('Começar o foco')!.click();
    await f.whenStable();
    tracks.settle(TestBed.inject(PomodoroStore).save().session);
    const playing = tracks.current()!.id;
    button('Desligar')!.click();
    await f.whenStable();
    const undo = TestBed.inject(Toasts).current()!.action!;
    const other = tracks.tracks().find((t) => t.id !== playing)!;
    rows().find((r) => r.dataset['faixa'] === other.id)!.querySelector<HTMLButtonElement>('[title="Tocar no próximo estudo"]')!.click();
    undo.run();
    await f.whenStable();
    expect(tracks.current()!.id).toBe(playing);
  });

  it('um site mais velho em outra aba (sem a rodada) não faz a música do estudo ser sorteada de novo', async () => {
    const { store } = await open();
    store.start();
    store.skip();
    store.skip();
    const session = store.save().session;
    const { session: _gone, ...old } = store.save();
    localStorage.setItem(POMODORO_KEY, JSON.stringify(old));
    window.dispatchEvent(new StorageEvent('storage', { key: POMODORO_KEY }));
    expect(store.save().session).toBe(session);
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
