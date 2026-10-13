import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { AudioTrack } from './audio-track';
import { ReviewCard } from './review-card';

const PREVIEW = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview1/v4/aa/bb/cc/trecho.plus.aac.p.m4a';

function music(extra: Record<string, unknown> = {}, game: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: 'rmus0001',
    kind: 'musicas',
    game: { name: 'OK Computer', coverUrl: null, source: 'itunes', sourceId: 'album/1', form: 'album', by: 'Radiohead', sample: PREVIEW, ...game },
    category: 'Radiohead',
    scores: { envolvimento: 10, letra: 9, vocal: 9, instrumental: 10 },
    status: 'finalizado',
    stock: 'azul',
    completedAt: '2026-10-02',
    createdAt: '2026-10-02T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    ...extra,
  })!;
}

describe('a ficha de música no mural', () => {
  let fixture: ComponentFixture<ReviewCard>;
  let el: HTMLElement;

  async function show(review: Review, inputs: Record<string, unknown> = {}): Promise<void> {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewCard], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', review);
    fixture.componentRef.setInput('preview', true);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    fixture?.destroy();
    localStorage.clear();
  });

  it('tem o vinil no lugar da foto, o artista na orelha e o tipo antes da data', async () => {
    await show(music());
    expect(el.classList).toContain('ficha-musica');
    expect(el.querySelector('app-record-cover')).not.toBeNull();
    expect(el.querySelector('app-cover-sleeve')).toBeNull();
    expect(el.querySelector('.aba-cat')?.textContent?.trim()).toBe('Radiohead');
    expect(el.querySelector('.meta')!.textContent).toContain('Álbum');
    expect(el.querySelector('.hit')!.getAttribute('aria-label')).toContain('OK Computer, álbum de Radiohead, média 9,6');
    // as quatro notas do mural no boletim
    expect(el.querySelector('app-boletim')!.textContent).toMatch(/Envolv.*Letra.*Vocal.*Instrum/s);
  });

  it('a música solta diz "Música"; sem artista, não tem orelha', async () => {
    await show(music({ category: undefined }, { form: 'faixa', name: 'Karma Police', by: undefined }));
    expect(el.querySelector('.meta')!.textContent).toContain('Música');
    expect(el.querySelector('.aba-cat')).toBeNull();
  });

  it('tocar o disco não abre a ficha: o player entra no lugar do desenho', async () => {
    await show(music());
    const opened: string[] = [];
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));
    expect(el.querySelector('.cover')!.classList).toContain('toca');
    el.querySelector<HTMLButtonElement>('.tocar-disco')!.click();
    // o player chega num pedaço à parte do site (@defer): espera ele ser desenhado
    for (let i = 0; i < 40 && !el.querySelector('app-audio-track audio'); i++) {
      await new Promise((r) => setTimeout(r, 10));
      await fixture.whenStable();
    }
    expect(opened).toEqual([]);
    expect(el.querySelector('app-record-cover app-audio-track audio')?.getAttribute('src')).toBe(PREVIEW);
    // e o toque no resto da ficha continua abrindo a leitura
    el.querySelector<HTMLButtonElement>('.hit')!.click();
    expect(opened).toEqual(['rmus0001']);
  });

  it('na ficha simples e na de capa e nome, o disco fica enfiado na capa, sem tocar', async () => {
    await show(music(), { compact: true });
    expect(el.querySelector('app-record-cover')!.classList).toContain('enfiado');
    expect(el.querySelector('.tocar-disco')).toBeNull();
    expect(el.querySelector('.cover')!.classList).not.toContain('toca');
    fixture.componentRef.setInput('compact', false);
    fixture.componentRef.setInput('capas', true);
    await fixture.whenStable();
    expect(el.querySelector('app-record-cover')!.classList).toContain('enfiado');
    expect(el.querySelector('.aba-cat')).toBeNull();
  });

  it('o que foge do normal vem na faixa do pé da capa: Pulei e No repeat', async () => {
    await show(music({ status: 'platinado' }));
    expect(el.querySelector('.faixa-disco')!.textContent).toContain('No repeat');
    fixture.componentRef.setInput('review', music({ status: 'incompleto' }));
    await fixture.whenStable();
    expect(el.querySelector('.faixa-disco')!.textContent).toContain('Pulei');
    fixture.componentRef.setInput('review', music());
    await fixture.whenStable();
    expect(el.querySelector('.faixa-disco')).toBeNull();
  });

  it('o vinil e a etiqueta ficam lado a lado e o nome embaixo, na largura toda, em qualquer largura de ficha', async () => {
    await show(music({ verdict: 'masterpiece', status: 'platinado' }, { name: '(((((ultraSound)))))' }));
    const part = (s: string) => el.querySelector<HTMLElement>(s)!;
    // da ficha mais estreita do mural (330px) à mais larga (440px)
    for (const width of [330, 380, 440]) {
      el.style.width = `${width}px`;
      // a etiqueta mede o que cabe nela depois de desenhar
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
      await fixture.whenStable();
      // (a tachinha também tem um .head: o da ficha é o filho do corpo)
      const [head, cover, judge, words] = ['.corpo > .head', '.cover', '.judge', '.words'].map(part);
      const coverEnd = cover.offsetTop + cover.offsetHeight;
      // a etiqueta ao lado do vinil, dentro da altura dele
      expect(judge.offsetLeft).withContext(`${width}px`).toBeGreaterThanOrEqual(cover.offsetLeft + cover.offsetWidth);
      expect(judge.offsetTop).withContext(`${width}px`).toBeGreaterThanOrEqual(cover.offsetTop);
      expect(judge.offsetTop + judge.offsetHeight).withContext(`${width}px`).toBeLessThanOrEqual(coverEnd);
      // o nome embaixo dos dois, de uma borda à outra: nada sobra embaixo do disco
      expect(words.offsetTop).withContext(`${width}px`).toBeGreaterThanOrEqual(coverEnd);
      expect(words.offsetWidth).withContext(`${width}px`).toBe(head.offsetWidth);
      // a Média e o canhoto cabem no lugar deles: a etiqueta não sai da ficha
      const ticket = Array.from(judge.children).reduce((w, c) => w + (c as HTMLElement).offsetWidth, 0);
      expect(ticket).withContext(`${width}px`).toBeLessThanOrEqual(judge.offsetWidth);
    }
  });

  it('o artista não pega o ícone nem a cor de uma categoria de anotação de mesmo nome', async () => {
    await show(music({ category: 'Trabalho' }), { looks: { trabalho: { color: 'azul', icon: 'maleta' } } });
    expect(el.querySelector('.aba-cat')!.classList).not.toContain('orelha-cor');
  });
});

describe('o vinil solto do widget de áudio (a capa das fichas de música)', () => {
  async function show(inputs: Record<string, unknown>): Promise<ComponentFixture<AudioTrack>> {
    TestBed.configureTestingModule({ imports: [AudioTrack], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(AudioTrack);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    return fixture;
  }

  it('sem som para tocar, fica o disco parado (e não o aviso de áudio sem link)', async () => {
    const fixture = await show({ args: ['vinil'], bare: true, sleeve: 'Fita demo' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.falha')).toBeNull();
    expect(el.querySelector('.vitrola .disco')).not.toBeNull();
    expect(el.querySelector('.tocar-disco')).toBeNull();
    expect(el.querySelector('.capa-nome')?.textContent).toBe('Fita demo');
    expect(el.querySelector('.barra')).toBeNull();
    fixture.destroy();
  });

  it('usa a capa do álbum, inteira, e diz no botão o que toca', async () => {
    const art = 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/capa.png/600x600bb.jpg';
    const fixture = await show({ args: [PREVIEW, 'vinil'], bare: true, art, spoken: 'Let Down, de OK Computer' });
    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector<HTMLImageElement>('.capa img')!;
    expect(img.getAttribute('src')).toBe(art);
    expect(img.classList).toContain('arte');
    expect(el.querySelector('.tocar-disco')!.getAttribute('aria-label')).toBe('Tocar: Let Down, de OK Computer');
    fixture.destroy();
  });

  it('o widget das anotações continua como era: com a barra, e com o aviso quando falta o link', async () => {
    const fixture = await show({ args: [PREVIEW, 'vinil', 'Nome'] });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.classList).not.toContain('solta');
    expect(el.querySelector('.barra')).not.toBeNull();
    expect(el.querySelector('.tocar-disco')!.getAttribute('aria-label')).toBe('Tocar: Nome');
    fixture.componentRef.setInput('args', ['vinil']);
    await fixture.whenStable();
    expect(el.querySelector('.falha')?.textContent).toContain('Áudio sem link');
    fixture.destroy();
  });
});
