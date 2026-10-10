import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AudioTrack } from './audio-track';


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

describe('a faixa de áudio', () => {
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
});
