import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GluedMedia } from './glued-media';


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

describe('a foto colada na anotação', () => {
  it('trocar o link começa de novo: o "não abriu" do link de antes não fica', async () => {
    TestBed.configureTestingModule({ imports: [GluedMedia], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(GluedMedia);
    fixture.componentRef.setInput('kind', 'imagem');
    // digitando o link: um pedaço dele já passa por link e não abre
    fixture.componentRef.setInput('args', ['https://i.im']);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector('img')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(el.querySelector('.falha-nome')?.textContent).toBe('A imagem não abriu');
    fixture.componentRef.setInput('args', ['https://i.imgur.com/foto.jpg']);
    await fixture.whenStable();
    expect(el.querySelector('.falha')).toBeNull();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://i.imgur.com/foto.jpg');
  });

  it('mexer na legenda não remonta o player do vídeo tocando', async () => {
    TestBed.configureTestingModule({ imports: [GluedMedia], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(GluedMedia);
    const yt = 'https://youtu.be/dQw4w9WgXcQ';
    fixture.componentRef.setInput('kind', 'video');
    fixture.componentRef.setInput('args', [yt, 'Clipe']);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.tocar')!.click();
    await fixture.whenStable();
    const frame = el.querySelector('iframe')!;
    const src = frame.src;
    const writes = countSrcWrites(frame);
    fixture.componentRef.setInput('args', [yt, 'Clipe novo']);
    await fixture.whenStable();
    expect(el.querySelector('iframe')).toBe(frame);
    expect(frame.src).toBe(src);
    expect(writes()).toBe(0);
  });
});
