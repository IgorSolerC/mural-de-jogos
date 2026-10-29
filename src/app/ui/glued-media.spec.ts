import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { setSoundVolume, settleSoundVolume, soundVolume } from '../core/volume';
import { GluedMedia } from './glued-media';
import { deleteDatabase } from '../core/erase-save';
import { IMAGES_DB, ImageStore } from '../core/image-store';
import { localImageUrl } from '../core/images';
import { samplePng } from '../core/images.spec';
import { ACCOUNT_KEY, SESSION_KEY } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';


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

  describe('a imagem guardada no aparelho (murall://imagem/ID)', () => {
    beforeEach(() => deleteDatabase(IMAGES_DB));
    afterAll(() => deleteDatabase(IMAGES_DB));

    async function waitFor(check: () => boolean, fixture: { whenStable(): Promise<unknown>; detectChanges(): void }): Promise<void> {
      for (let i = 0; i < 100 && !check(); i++) {
        await new Promise((r) => setTimeout(r, 10));
        fixture.detectChanges();
        await fixture.whenStable();
      }
    }

    it('aparece pelo endereço blob: dela, sem o site no lugar da falha', async () => {
      TestBed.configureTestingModule({ imports: [GluedMedia], providers: [provideZonelessChangeDetection()] });
      const image = await TestBed.inject(ImageStore).add(await samplePng(400, 300));
      const fixture = TestBed.createComponent(GluedMedia);
      fixture.componentRef.setInput('kind', 'imagem');
      fixture.componentRef.setInput('args', [localImageUrl(image.id), 'Praia']);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      await waitFor(() => !!el.querySelector('img'), fixture);
      expect(el.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/);
      expect(el.querySelector('img')?.getAttribute('alt')).toBe('Praia');
      expect(el.querySelector('.falha')).toBeNull();
    });

    it('com a conta, a que não está neste aparelho desce da nuvem e aparece (e fica guardada aqui)', async () => {
      localStorage.setItem(SESSION_KEY, 'A'.repeat(43));
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: 'conta-1', codigo: 'K7QF-M2XA', nome: 'Igor' }));
      const png = await samplePng(320, 240);
      const id = 'veiodanuvemparaca' + 'x'.repeat(5);
      const asked: string[] = [];
      spyOn(window, 'fetch').and.callFake(async (url: RequestInfo | URL) => {
        asked.push(String(url));
        if (String(url).endsWith(`/v1/imagens/${id}`)) return new Response(png, { headers: { 'Content-Type': 'image/png' } });
        return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      });
      try {
        TestBed.configureTestingModule({
          imports: [GluedMedia],
          providers: [provideZonelessChangeDetection(), { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: 'https://api.teste', googleClientId: 'x' }) } }],
        });
        const fixture = TestBed.createComponent(GluedMedia);
        fixture.componentRef.setInput('kind', 'imagem');
        fixture.componentRef.setInput('args', [localImageUrl(id)]);
        await fixture.whenStable();
        const el = fixture.nativeElement as HTMLElement;
        await waitFor(() => !!el.querySelector('img'), fixture);
        expect(el.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/);
        expect(asked.filter((u) => u.includes('/v1/imagens/'))).toEqual([`https://api.teste/v1/imagens/${id}`]);
        expect((await TestBed.inject(ImageStore).get(id))?.estado).toBe('na-nuvem');
      } finally {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(ACCOUNT_KEY);
      }
    });

    it('a que não está neste aparelho diz que ainda não chegou; colada aqui depois, aparece', async () => {
      TestBed.configureTestingModule({ imports: [GluedMedia], providers: [provideZonelessChangeDetection()] });
      const store = TestBed.inject(ImageStore);
      const png = await samplePng(200, 100);
      const fixture = TestBed.createComponent(GluedMedia);
      fixture.componentRef.setInput('kind', 'imagem');
      const id = 'deoutroaparelho' + 'x'.repeat(7);
      fixture.componentRef.setInput('args', [localImageUrl(id)]);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      await waitFor(() => !!el.querySelector('.falha'), fixture);
      expect(el.querySelector('.falha-nome')?.textContent).toBe('A imagem ainda não chegou a este aparelho');
      expect(el.querySelector('.falha-host')).toBeNull();
      await store.restore([{ id, blob: png, tipo: 'image/png', largura: 200, altura: 100, bytes: png.size, hash: 'h', criada: '', estado: 'local' }]);
      await waitFor(() => !!el.querySelector('img'), fixture);
      expect(el.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/);
    });
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

  it('o vídeo tem o alto-falante do volume do site, e toca nele; a foto, não', async () => {
    const before = soundVolume();
    TestBed.configureTestingModule({ imports: [GluedMedia], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(GluedMedia);
    fixture.componentRef.setInput('kind', 'video');
    fixture.componentRef.setInput('args', ['https://exemplo.com.br/clipe.mp4']);
    setSoundVolume(0.3);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.foto.som app-volume-knob')).not.toBeNull();
    const video = el.querySelector('video')!;
    expect(video.volume).toBeCloseTo(0.3, 5);
    setSoundVolume(0.75);
    await fixture.whenStable();
    expect(video.volume).toBeCloseTo(0.75, 5);
    // a foto não faz som
    fixture.componentRef.setInput('kind', 'imagem');
    fixture.componentRef.setInput('args', ['https://i.imgur.com/foto.jpg']);
    await fixture.whenStable();
    expect(el.querySelector('app-volume-knob')).toBeNull();
    setSoundVolume(before);
    settleSoundVolume();
  });

  it('o YouTube do vídeo conversa pela API (para o volume); com o site calado, já começa calado', async () => {
    const before = soundVolume();
    TestBed.configureTestingModule({ imports: [GluedMedia], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(GluedMedia);
    fixture.componentRef.setInput('kind', 'video');
    fixture.componentRef.setInput('args', ['https://youtu.be/dQw4w9WgXcQ']);
    setSoundVolume(0);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.tocar')!.click();
    await fixture.whenStable();
    const src = el.querySelector('iframe')!.src;
    expect(src).toContain('enablejsapi=1');
    expect(src).toContain('mute=1');
    fixture.destroy();
    setSoundVolume(before);
    settleSoundVolume();
  });

  describe('ampliar a imagem', () => {
    /** O visor carrega à parte, no primeiro toque: espera ele aparecer no `body`. */
    async function viewer(): Promise<HTMLDialogElement> {
      for (let i = 0; i < 100; i++) {
        const d = document.querySelector<HTMLDialogElement>('app-image-viewer dialog');
        if (d) return d;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error('o visor não abriu');
    }
    async function gone(): Promise<void> {
      for (let i = 0; i < 100 && document.querySelector('app-image-viewer'); i++) await new Promise((r) => setTimeout(r, 20));
    }
    async function photo(args: string[]) {
      TestBed.configureTestingModule({ imports: [GluedMedia], providers: [provideZonelessChangeDetection()] });
      const fixture = TestBed.createComponent(GluedMedia);
      fixture.componentRef.setInput('kind', 'imagem');
      fixture.componentRef.setInput('args', args);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      return { fixture, el };
    }
    afterEach(async () => {
      document.querySelector<HTMLDialogElement>('app-image-viewer dialog')?.close();
      document.querySelector('app-image-viewer')?.remove();
    });

    it('o broche de ampliar só aparece com a foto revelada; no vídeo, fica ao lado do alto-falante', async () => {
      const { fixture, el } = await photo(['https://i.imgur.com/foto.jpg']);
      expect(el.querySelector('.ampliar')).toBeNull();
      el.querySelector('img')!.dispatchEvent(new Event('load'));
      await fixture.whenStable();
      const knob = el.querySelector<HTMLButtonElement>('.foto > app-zoom-knob.ampliar button.tocavel')!;
      expect(knob).not.toBeNull();
      expect(knob.getAttribute('aria-label')).toBe('Ampliar a imagem');
      // a foto que não abriu não amplia
      el.querySelector('img')!.dispatchEvent(new Event('error'));
      await fixture.whenStable();
      expect(el.querySelector('.ampliar')).toBeNull();
      fixture.componentRef.setInput('kind', 'video');
      fixture.componentRef.setInput('args', ['https://exemplo.com.br/clipe.mp4', 'Clipe']);
      await fixture.whenStable();
      expect(el.querySelector('.ampliar')).toBeNull();
      const corner = [...el.querySelectorAll('.foto > .broches > *')].map((k) => k.tagName.toLowerCase());
      expect(corner).toEqual(['app-zoom-knob', 'app-volume-knob']);
      expect(el.querySelector('.broches app-zoom-knob button')!.getAttribute('aria-label')).toBe('Ampliar o vídeo: Clipe');
      fixture.destroy();
    });

    it('o desenho do broche fica no meio da lata, qualquer que seja a letra em volta', async () => {
      const { fixture, el } = await photo(['https://i.imgur.com/foto.jpg']);
      // a letra grande da leitura: com a linha de texto em volta, o ícone subia
      el.style.fontSize = '22px';
      el.style.lineHeight = '2';
      el.querySelector('img')!.dispatchEvent(new Event('load'));
      await fixture.whenStable();
      const knob = el.querySelector<HTMLElement>('.ampliar')!;
      const face = knob.querySelector<HTMLElement>('.face')!;
      const icon = face.querySelector<HTMLElement>('lucide-icon')!;
      // sem os giros e o encolhido de escondido, para medir no quadro reto
      const glued = el.querySelector<HTMLElement>('.foto')!;
      glued.style.transition = 'none';
      glued.style.rotate = '0deg';
      knob.style.transition = 'none';
      knob.style.scale = '1';
      face.style.transition = 'none';
      face.style.rotate = '0deg';
      const f = face.getBoundingClientRect();
      const i = icon.getBoundingClientRect();
      expect(i.width).toBeCloseTo(18, 1);
      expect(i.height).toBeCloseTo(18, 1);
      expect(i.left + i.width / 2 - (f.left + f.width / 2)).toBeCloseTo(0, 1);
      // meio pixel acima do meio, como o alto-falante do volume
      expect(i.top + i.height / 2 - (f.top + f.height / 2)).toBeCloseTo(-0.5, 1);
      fixture.destroy();
    });

    it('abre a foto no meio da tela, com a moldura e a legenda, e a colada some até ela voltar', async () => {
      const { fixture, el } = await photo(['https://i.imgur.com/foto.jpg', 'polaroide', 'Na praia']);
      el.querySelector('img')!.dispatchEvent(new Event('load'));
      await fixture.whenStable();
      const knob = el.querySelector<HTMLButtonElement>('.ampliar button')!;
      expect(knob.getAttribute('aria-label')).toBe('Ampliar a imagem: Na praia');
      let opened = false;
      el.addEventListener('click', () => (opened = true));
      knob.click();
      // o toque não sobe (na ficha do mural, abriria a leitura)
      expect(opened).toBeFalse();
      const dialog = await viewer();
      expect(dialog.open).toBeTrue();
      expect(dialog.getAttribute('aria-label')).toBe('Imagem: Na praia');
      expect(dialog.querySelector('img')!.getAttribute('src')).toBe('https://i.imgur.com/foto.jpg');
      expect(dialog.querySelector('.colagem')!.classList).toContain('moldura-polaroid');
      expect(dialog.querySelector('.legenda-polaroide')!.textContent).toBe('Na praia');
      // fora do texto: no body, não dentro da foto colada
      expect(el.contains(dialog)).toBeFalse();
      expect(document.activeElement).toBe(dialog.querySelector('button.fechar'));
      // a colada some inteira: a foto, a etiqueta e o broche
      const glued = el.querySelector<HTMLElement>('figure.colagem')!;
      expect(glued.style.opacity).toBe('0');

      dialog.querySelector<HTMLButtonElement>('button.fechar')!.click();
      await gone();
      expect(document.querySelector('app-image-viewer')).toBeNull();
      expect(glued.style.opacity).toBe('');
      fixture.destroy();
    });

    it('fecha no Esc e tocando na própria foto; sem a faixa da polaroide, a legenda vai na etiqueta', async () => {
      const { fixture, el } = await photo(['https://i.imgur.com/foto.jpg', 'Um bilhete']);
      el.querySelector('img')!.dispatchEvent(new Event('load'));
      await fixture.whenStable();
      el.querySelector<HTMLButtonElement>('.ampliar button')!.click();
      let dialog = await viewer();
      expect(dialog.querySelector('.legenda-polaroide')).toBeNull();
      expect(dialog.querySelector('.etiqueta')!.textContent).toBe('Um bilhete');
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      await gone();
      expect(document.querySelector('app-image-viewer')).toBeNull();

      el.querySelector<HTMLButtonElement>('.ampliar button')!.click();
      dialog = await viewer();
      dialog.querySelector<HTMLElement>('.foto')!.click();
      await gone();
      expect(document.querySelector('app-image-viewer')).toBeNull();
      expect(el.querySelector<HTMLElement>('figure.colagem')!.style.opacity).toBe('');
      fixture.destroy();
    });
  });

  it('o vídeo sobe inteiro para o meio da tela, com a etiqueta e o mesmo player (o que toca continua tocando)', async () => {
    TestBed.configureTestingModule({ imports: [GluedMedia], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(GluedMedia);
    fixture.componentRef.setInput('kind', 'video');
    fixture.componentRef.setInput('args', ['https://exemplo.com.br/clipe.mp4', 'Clipe']);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    const film = el.querySelector('video')!;
    const glued = el.querySelector<HTMLElement>('figure.colagem')!;
    expect(getComputedStyle(el.querySelector('.foto')!).rotate).not.toBe('0deg');
    // o desenhado: a foto e a etiqueta (que pode passar da foto estreita), do canto da figura
    const left = glued.getBoundingClientRect().left;
    const drawn = Math.max(...['.foto', '.etiqueta'].map((q) => el.querySelector(q)!.getBoundingClientRect().right - left));
    expect(drawn).toBeLessThan(el.offsetWidth - 50);
    el.querySelector<HTMLButtonElement>('.broches app-zoom-knob button')!.click();
    expect(glued.classList).toContain('erguida');
    // a figura inteira: a foto, reta, e a etiqueta da legenda junto
    expect(glued.querySelector('.etiqueta')!.textContent).toBe('Clipe');
    expect(getComputedStyle(el.querySelector('.foto')!).rotate).toBe('0deg');
    // da largura do que tem dentro, não da linha
    expect(parseFloat(glued.style.width)).toBe(Math.ceil(drawn));
    expect(glued.matches(':popover-open')).toBeTrue();
    expect(el.querySelector('video')).toBe(film);
    // a foto do vídeo já é papel: sem a folha creme
    expect(glued.classList).not.toContain('erguida-papel');
    (glued.nextElementSibling as HTMLButtonElement).click();
    for (let i = 0; i < 100 && glued.classList.contains('erguida'); i++) await new Promise((r) => setTimeout(r, 20));
    expect(glued.classList).not.toContain('erguida');
    el.remove();
    fixture.destroy();
  });
});
