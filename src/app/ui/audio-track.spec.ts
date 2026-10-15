import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { setSoundVolume, settleSoundVolume, soundVolume } from '../core/volume';
import { AudioTrack } from './audio-track';
import { EmbedBridge, EmbedCommand, EmbedReport } from './embed-bridge';
import { warmups } from './sound-warmup';


/** Conta quantas vezes o `src` do iframe é escrito (escrever o mesmo endereço recarrega o player). */
function countSrcWrites(frame: HTMLIFrameElement): () => number {
  let n = 0;
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')!;
  Object.defineProperty(frame, 'src', {
    configurable: true,
    get: () => desc.get!.call(frame),
    set: (v: string) => {
      n++;
      desc.set!.call(frame, v);
    },
  });
  return () => n;
}

/** Espera o próximo quadro (o tempo à mostra anda em requestAnimationFrame). */
const frames = (n = 2) => new Promise<void>((r) => {
  const step = () => (--n <= 0 ? r() : requestAnimationFrame(step));
  requestAnimationFrame(step);
});

describe('a faixa de áudio', () => {
  let volumeBefore: number;
  beforeEach(() => {
    // os testes aquecem na mão, quando querem
    warmups.enabled = false;
    volumeBefore = soundVolume();
  });
  afterEach(() => {
    warmups.enabled = true;
    setSoundVolume(volumeBefore);
    settleSoundVolume();
  });

  it('mexer no nome não remonta o player do YouTube (ele recarregaria e tocaria de novo)', async () => {
    TestBed.configureTestingModule({ imports: [AudioTrack], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(AudioTrack);
    const yt = 'https://youtu.be/dQw4w9WgXcQ';
    fixture.componentRef.setInput('args', [yt, 'Nome', 'simples']);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.tocar-tira')!.click();
    await fixture.whenStable();
    const frame = el.querySelector('iframe')!;
    const src = frame.src;
    expect(src).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    const writes = countSrcWrites(frame);
    // escrevendo o nome, letra por letra
    for (const name of ['Nome n', 'Nome no', 'Nome novo']) {
      fixture.componentRef.setInput('args', [yt, name, 'simples']);
      await fixture.whenStable();
    }
    expect(el.querySelector('iframe')).toBe(frame);
    expect(frame.src).toBe(src);
    expect(writes()).toBe(0);
    expect(el.querySelector('.tira-nome')?.textContent).toBe('Nome novo');
    // trocar o link, sim, começa de novo (parado: o player só volta no próximo toque)
    fixture.componentRef.setInput('args', ['https://youtu.be/jNQXAC9IVRw', 'Nome novo', 'simples']);
    await fixture.whenStable();
    expect(el.querySelector('iframe')).toBeNull();
    fixture.destroy();
  });

  describe('o player do YouTube aquecido', () => {
    let sent: EmbedCommand[];
    let fixture: ReturnType<typeof TestBed.createComponent<AudioTrack>>;
    let el: HTMLElement;
    /** O que o player "conta" (o widget ouve pela conversa, ui/embed-bridge.ts). */
    const report = async (r: EmbedReport) => {
      (fixture.componentInstance as unknown as { onReport(r: EmbedReport): void }).onReport(r);
      await fixture.whenStable();
    };
    const commands = () => sent.map((c) => (c.do === 'seek' ? `seek ${c.t}` : c.do === 'volume' ? `volume ${c.v}` : c.do));
    const faixa = () => el.querySelector('.faixa')!;

    beforeEach(async () => {
      sent = [];
      // os pedidos ficam anotados aqui, e não vão para o YouTube
      spyOn(EmbedBridge.prototype, 'send').and.callFake((c: EmbedCommand) => void sent.push(c));
      TestBed.configureTestingModule({ imports: [AudioTrack], providers: [provideZonelessChangeDetection()] });
      fixture = TestBed.createComponent(AudioTrack);
      fixture.componentRef.setInput('args', ['https://youtu.be/dQw4w9WgXcQ?t=15', 'Nome', 'simples']);
      await fixture.whenStable();
      el = fixture.nativeElement as HTMLElement;
      fixture.componentInstance.warmUp();
      await fixture.whenStable();
    });

    it('chega calado e parado; toca um instante para encher o começo e volta para ele, sem a faixa parecer tocando', async () => {
      const src = el.querySelector('iframe')!.src;
      expect(src).toContain('autoplay=0');
      expect(src).toContain('mute=1');
      expect(src).toContain('start=15');
      await report({ ready: true });
      expect(commands()).toEqual(['play']);
      await report({ state: 'playing', time: 15.1, duration: 200 });
      expect(commands()).toEqual(['play', 'pause', 'seek 15']);
      // o eco do aquecimento (o YouTube repete o estado) não faz a faixa tocar
      await report({ state: 'playing', time: 15.2 });
      await report({ state: 'paused', time: 15 });
      expect(faixa().classList).not.toContain('tocando');
      expect(faixa().classList).not.toContain('esperando');
      // a duração já aparece, e o tempo é o do começo do link
      expect(el.querySelector('.tempo')?.textContent).toBe('0:15 / 3:20');
    });

    it('o play solta o som no volume do site, sem pular; um "parado" atrasado de antes não desfaz o pedido', async () => {
      await report({ ready: true });
      await report({ state: 'playing', time: 15.1, duration: 200 });
      setSoundVolume(0.3);
      await fixture.whenStable();
      sent.length = 0;
      el.querySelector<HTMLButtonElement>('.tocar-tira')!.click();
      await fixture.whenStable();
      expect(commands()).toEqual(['volume 0.3', 'play']);
      expect(faixa().classList).toContain('esperando');
      await report({ state: 'paused', time: 15 });
      expect(faixa().classList).toContain('esperando');
      await report({ state: 'playing', time: 15.05 });
      expect(faixa().classList).toContain('tocando');
      // mexer no volume chega na hora a quem toca
      sent.length = 0;
      setSoundVolume(0.8);
      await fixture.whenStable();
      expect(commands()).toEqual(['volume 0.8']);
      fixture.componentInstance.pause();
    });

    it('o tempo à mostra não corre na frente quando o player para de avisar', async () => {
      let now = 1000;
      spyOn(performance, 'now').and.callFake(() => now);
      await report({ ready: true });
      await report({ state: 'playing', time: 15.1, duration: 200 });
      el.querySelector<HTMLButtonElement>('.tocar-tira')!.click();
      await report({ state: 'playing', time: 15 });
      // o player engasgou sem dizer: passam 5 segundos sem aviso
      now += 5000;
      await frames();
      await fixture.whenStable();
      expect(el.querySelector('.tempo')?.textContent).toBe('0:15 / 3:20');
      // voltou a avisar: o tempo segue dali
      await report({ time: 16.2 });
      await frames();
      await fixture.whenStable();
      expect(el.querySelector('.tempo')?.textContent).toBe('0:16 / 3:20');
      fixture.componentInstance.pause();
    });

    it('um aviso atrasado de antes do pulo não leva a barra de volta', async () => {
      await report({ ready: true });
      await report({ state: 'playing', time: 15.1, duration: 200 });
      el.querySelector<HTMLButtonElement>('.tocar-tira')!.click();
      await report({ state: 'playing', time: 15 });
      const bar = el.querySelector<HTMLInputElement>('.barra')!;
      bar.value = '120';
      bar.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      expect(commands()).toContain('seek 120');
      await report({ time: 15.4 });
      await frames();
      await fixture.whenStable();
      expect(el.querySelector('.tempo')?.textContent).toBe('2:00 / 3:20');
      fixture.componentInstance.pause();
    });
  });

  it('o alto-falante aparece na faixa que toca, e não no aviso do link quebrado', async () => {
    TestBed.configureTestingModule({ imports: [AudioTrack], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(AudioTrack);
    fixture.componentRef.setInput('args', ['https://exemplo.com.br/faixa.mp3', 'Nome', 'fita']);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.faixa.som .cassete app-volume-knob')).not.toBeNull();
    expect(el.querySelector('audio')!.volume).toBeCloseTo(soundVolume(), 5);
    setSoundVolume(0.25);
    await fixture.whenStable();
    expect(el.querySelector('audio')!.volume).toBeCloseTo(0.25, 5);
    fixture.componentRef.setInput('args', ['https://exemplo.com.br/pagina.html', 'Nome', 'fita']);
    await fixture.whenStable();
    expect(el.querySelector('.falha')).not.toBeNull();
    expect(el.querySelector('app-volume-knob')).toBeNull();
  });
});

