import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { POMODORO_KEY } from '../core/pomodoro';
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

  /** Abre a página; com `part`, toca a fita dela (a folha dos ajustes abre nessa parte). */
  async function open(part?: 'tempo' | 'musica' | 'relogio') {
    const f = TestBed.createComponent(PomodoroPage);
    await f.whenStable();
    const host = f.nativeElement as HTMLElement;
    const store = TestBed.inject(PomodoroStore);
    const tracks = TestBed.inject(PomodoroTracks);
    /** Um botão pelo começo do texto ou pelo nome (os de só desenho). */
    const button = (text: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(text) || b.getAttribute('aria-label') === text);
    const tape = (i: number) => host.querySelectorAll<HTMLButtonElement>('.fita')[i];
    if (part) {
      tape({ tempo: 0, musica: 1, relogio: 2 }[part]).click();
      await f.whenStable();
    }
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
    return { f, host, store, tracks, button, tape, rows, names, put };
  }

  it('desligada: o relógio de pé na prateleira, pronto, e um botão só para começar', async () => {
    const { host, button } = await open();
    expect(host.querySelector('.estado')!.textContent).toBe('Pronto para 25 min de estudo.');
    expect(host.querySelector('app-shelf app-pomodoro-dial')!.getAttribute('data-tempo')).toBe('25:00');
    expect(button('Começar o foco')).toBeDefined();
    expect(button('Pausar')).toBeUndefined();
    // nada dos ajustes na página: só as três fitas
    expect(host.querySelector('app-minutes-ruler')).toBeNull();
    expect(host.querySelector('app-pomodoro-tracks')).toBeNull();
    expect(host.querySelectorAll('app-pomodoro-dial').length).toBe(1);
  });

  it('Começar o foco liga o Pomodoro e grava no aparelho', async () => {
    const { f, store, button, host } = await open();
    button('Começar o foco')!.click();
    await f.whenStable();
    expect(store.on()).toBeTrue();
    expect(JSON.parse(localStorage.getItem(POMODORO_KEY)!).on).toBeTrue();
    expect(button('Pausar')).toBeDefined();
    expect(button('Pular para a pausa')).toBeDefined();
    expect(button('Desligar')).toBeDefined();
    expect(host.querySelector('.estado')!.textContent).toMatch(/^Estudando\. A pausa começa às \d{1,2}h\d{2}\.$/);
    button('Pausar')!.click();
    await f.whenStable();
    expect(host.querySelector('.estado')!.textContent).toBe('Parado. Faltam 25 min de estudo.');
  });

  it('as três fitas dizem o que está valendo e abrem a folha na parte de cada uma', async () => {
    const { f, host, store, tape } = await open();
    const text = (i: number) => tape(i).querySelector('.fita-texto')!.textContent!.trim();
    expect([text(0), text(1), text(2)]).toEqual(['25/5 min', 'Rádio lofi de sempre', 'Tomate']);
    expect(tape(0).getAttribute('aria-label')).toBe('Tempo: 25/5 min. Ajustar');
    expect(tape(0).getAttribute('aria-haspopup')).toBe('dialog');
    store.setSkin('neon');
    store.setMusic(false);
    store.preset(50, 10);
    await f.whenStable();
    expect([text(0), text(1), text(2)]).toEqual(['50/10 min', 'Sem música', 'Neon']);
    tape(2).click();
    await f.whenStable();
    const pressed = host.querySelector('app-pomodoro-sheet .parte[aria-pressed="true"] .parte-nome')!;
    expect(pressed.textContent!.trim()).toBe('Relógio');
    expect(host.querySelector<HTMLDialogElement>('app-pomodoro-sheet dialog')!.open).toBeTrue();
    // fechar tira a folha da página
    const dialog = host.querySelector<HTMLDialogElement>('app-pomodoro-sheet dialog')!;
    const fired = new Promise((r) => dialog.addEventListener('close', r, { once: true }));
    dialog.close();
    await fired;
    await f.whenStable();
    expect(host.querySelector('app-pomodoro-sheet')).toBeNull();
  });

  it('os estudos de hoje: um tomatinho na tábua por estudo (até seis) e a régua do dia com os trechos', async () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    const agora = d.getTime();
    spyOn(Date, 'now').and.returnValue(agora);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const log = [{ a: agora - 40 * 60_000, b: agora - 15 * 60_000, f: 'estudo' }];
    localStorage.setItem(POMODORO_KEY, JSON.stringify({ v: 1, day, done: 8, log }));
    const { host } = await open();
    expect(host.querySelectorAll('.tomatinhos .tomatinho').length).toBe(6);
    const day0 = host.querySelector('app-pomodoro-day')!;
    expect(day0.querySelector('.dia-conta')!.textContent).toBe('8 estudos · 25 min de foco');
    expect(day0.querySelectorAll('.trecho').length).toBe(1);
  });

  it('a lista começa com a rádio de sempre, marcada no sorteio; ligado, é ela que toca', async () => {
    const { f, names, rows, button } = await open('musica');
    expect(names()).toEqual(['Rádio lofi de sempre']);
    expect(rows()[0].querySelector('.faixa-marca')!.getAttribute('aria-checked')).toBe('true');
    expect(rows()[0].classList).not.toContain('da-vez');
    button('Começar o foco')!.click();
    await f.whenStable();
    expect(rows()[0].classList).toContain('da-vez');
    expect(rows()[0].querySelector('.faixa-vez')!.textContent).toContain('tocando agora');
  });

  it('as marcadas entram no sorteio de cada estudo; a dica diz quantas', async () => {
    const { f, host, store, tracks, rows, put, button } = await open('musica');
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
    const { f, names } = await open('musica');
    await new Promise((r) => setTimeout(r));
    await f.whenStable();
    expect(names()).toEqual(['lofi hip hop radio']);
    expect(JSON.parse(localStorage.getItem(TRACKS_KEY)!).tracks[0].url).toBe('https://www.youtube.com/watch?v=jfKfPfyJRdk');
  });

  it('pôr uma música: o link que toca entra no fim com o título do vídeo; o que não toca mostra o erro', async () => {
    const { host, names, put } = await open('musica');
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
    const { f, host, names, tracks, put } = await open('musica');
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
    const { f, host, names, tracks, rows, put, button } = await open('musica');
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
    const { f, host, store } = await open('musica');
    host.querySelector<HTMLButtonElement>('.interruptor')!.click();
    await f.whenStable();
    expect(store.save().music).toBeFalse();
    expect(host.querySelector('#pomodoro-link')).toBeNull();
  });

  it('o Desfazer do desligar volta com a música que tocava, mesmo escolhida outra para o próximo no meio', async () => {
    const { f, tracks, rows, put, button } = await open('musica');
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
