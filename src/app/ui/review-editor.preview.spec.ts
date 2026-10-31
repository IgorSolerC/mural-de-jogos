import { WritableSignal, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Selection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Cloud } from '../core/cloud-config';
import { Review, sanitizeReview } from '../core/review';
import { Settings } from '../core/settings';
import { ReviewEditor } from './review-editor';
import { comMarkdown } from '../testing/writing-mode.spec';

const T0 = '2026-10-01T10:00:00.000Z';
const LONG = Array.from({ length: 40 }, (_, i) => `Linha ${i + 1} da anotação comprida.`).join('\n');

function note(text: string): Review {
  return { ...sanitizeReview({ kind: 'anotacoes', game: { name: 'Comprida', coverUrl: null, source: 'manual' }, completedAt: '2026-10-01', createdAt: T0, text })!, id: 'n-comprida' };
}

const frames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Espera a rolagem (suave) parar. */
async function settled(box: HTMLElement): Promise<void> {
  await frames();
  let last = -1;
  for (let i = 0; i < 40 && box.scrollTop !== last; i++) {
    last = box.scrollTop;
    await new Promise((r) => setTimeout(r, 60));
  }
}

/**
 * A prévia do editor: a ficha reta (a inclinação do mural cortava as pontas) e, no largo, o botão
 * "Ficha inteira", que mostra o texto todo e rola junto com o cursor de quem escreve.
 */
describe('o editor: a prévia reta e a ficha inteira', () => {
  // a <textarea> das marcas à vista (o editor abre no Visual para quem não escolheu)
  comMarkdown();
  let fixture: ComponentFixture<ReviewEditor>;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(Cloud).config.set({ api: 'https://api.teste', googleClientId: 'x.apps.googleusercontent.com' });
    const settings = TestBed.inject(Settings);
    settings.askNoCategory.set(false);
    settings.askNoTag.set(false);
    fixture = TestBed.createComponent(ReviewEditor);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.componentInstance['dialog']().nativeElement.close();
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  /** A tela de teste é estreita: a prévia ao lado (o largo) vem à mão. */
  const wide = () => {
    const ed = fixture.componentInstance as unknown as { wide: WritableSignal<boolean>; phone: WritableSignal<boolean> };
    ed.wide.set(true);
    ed.phone.set(false);
  };
  const card = () => el.querySelector<HTMLElement>('.previa app-review-card')!;
  const button = () => el.querySelector<HTMLButtonElement>('.ver-inteira')!;
  const open = async (r: Review) => {
    fixture.componentInstance.open(r);
    await fixture.whenStable();
  };

  it('a ficha da prévia não gira, nem com a inclinação que ela tem no mural', async () => {
    await open(note('Um texto.'));
    expect(getComputedStyle(card()).getPropertyValue('--inclina').trim()).toBe('0');
    expect(getComputedStyle(card()).rotate).toBe('0deg');
  });

  it('o botão mostra a ficha inteira, com cada linha marcada, e o aparelho lembra', async () => {
    wide();
    await open(note(LONG));
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(card().classList).not.toContain('inteira');
    button().click();
    await fixture.whenStable();
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(card().classList).toContain('inteira');
    expect(el.querySelector('.previa-slot')!.classList).toContain('inteira');
    // as linhas desenhadas levam o número da linha do texto (só na prévia)
    expect(card().querySelectorAll('[data-l]').length).toBe(40);
    expect(card().querySelector('[data-l="39"]')!.textContent).toContain('Linha 40');
    expect(localStorage.getItem('meu-mural:editor:ficha-inteira')).toBe('1');

    // aberta de novo, continua inteira
    fixture.componentInstance['dialog']().nativeElement.close();
    await open(note('Outra.'));
    expect(button().getAttribute('aria-pressed')).toBe('true');
    button().click();
    await fixture.whenStable();
    expect(card().classList).not.toContain('inteira');
    expect(localStorage.getItem('meu-mural:editor:ficha-inteira')).toBe('0');
  });

  describe('sozinha, enquanto se escreve o texto', () => {
    const area = () => el.querySelector<HTMLTextAreaElement>('app-rich-editor textarea')!;
    const title = () => el.querySelector<HTMLTextAreaElement>('#editor-titulo-nota')!;
    const focus = async (target: HTMLElement) => {
      target.focus();
      await fixture.whenStable();
    };

    it('o foco no texto (e na régua dele) abre a ficha inteira; fora dele, ela volta', async () => {
      wide();
      await open(note(LONG));
      await focus(title());
      expect(card().classList).not.toContain('inteira');
      await focus(area());
      expect(card().classList).toContain('inteira');
      // o botão mostra que ela está inteira, mas a escolha do aparelho não muda
      expect(button().getAttribute('aria-pressed')).toBe('true');
      expect(localStorage.getItem('meu-mural:editor:ficha-inteira')).toBeNull();
      // a régua do texto é do texto
      await focus(el.querySelector<HTMLButtonElement>('app-rich-editor button')!);
      expect(card().classList).toContain('inteira');
      await focus(title());
      expect(card().classList).not.toContain('inteira');
      expect(button().getAttribute('aria-pressed')).toBe('false');
      await focus(area());
      await focus(el.querySelector<HTMLButtonElement>('.prop')!);
      expect(card().classList).not.toContain('inteira');
    });

    it('aberta pelo botão, não fecha ao sair do texto', async () => {
      wide();
      await open(note(LONG));
      el.querySelector<HTMLElement>('.palco')!.style.display = 'block';
      el.querySelector<HTMLElement>('.palco-topo')!.style.display = 'flex';
      await focus(button());
      button().click();
      await fixture.whenStable();
      await focus(area());
      await focus(title());
      expect(card().classList).toContain('inteira');
      expect(localStorage.getItem('meu-mural:editor:ficha-inteira')).toBe('1');
    });

    it('inteira pelo texto, o botão a fecha (e o foco nele não fecha antes do clique)', async () => {
      wide();
      await open(note(LONG));
      // o palco à vista, como no largo (a tela de teste é estreita): o botão pode receber o foco
      el.querySelector<HTMLElement>('.palco')!.style.display = 'block';
      el.querySelector<HTMLElement>('.palco-topo')!.style.display = 'flex';
      await focus(area());
      await focus(button());
      expect(card().classList).toContain('inteira');
      button().click();
      await fixture.whenStable();
      expect(card().classList).not.toContain('inteira');
      expect(button().getAttribute('aria-pressed')).toBe('false');
      // e voltar ao texto abre de novo
      await focus(area());
      expect(card().classList).toContain('inteira');
    });

    it('o editor abre de novo sem ela inteira', async () => {
      wide();
      await open(note(LONG));
      await focus(area());
      fixture.componentInstance['dialog']().nativeElement.close();
      await open(note('Outra.'));
      await focus(title());
      expect(card().classList).not.toContain('inteira');
    });
  });

  it('no estreito a ficha fica do tamanho do mural (o botão é só do largo)', async () => {
    localStorage.setItem('meu-mural:editor:ficha-inteira', '1');
    await open(note(LONG));
    expect(card().classList).not.toContain('inteira');
  });

  it('a coluna da prévia rola até a linha do cursor', async () => {
    wide();
    await open(note(LONG));
    button().click();
    await fixture.whenStable();
    // a coluna baixa, à vista (no estreito, o palco só aparece na Cartolina)
    const palco = el.querySelector<HTMLElement>('.palco')!;
    palco.style.cssText = 'display: block; width: 360px';
    const slot = el.querySelector<HTMLElement>('.previa-slot')!;
    slot.style.cssText = 'height: 200px; overflow-y: auto';
    const area = el.querySelector<HTMLTextAreaElement>('app-rich-editor textarea')!;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    area.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    await settled(slot);
    const last = card().querySelector<HTMLElement>('[data-l="39"]')!.getBoundingClientRect();
    const view = slot.getBoundingClientRect();
    expect(slot.scrollTop).toBeGreaterThan(0);
    expect(last.top).toBeGreaterThanOrEqual(view.top);
    expect(last.bottom).toBeLessThanOrEqual(view.bottom);

    // de volta ao começo: o alto da ficha também
    area.setSelectionRange(0, 0);
    area.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    await settled(slot);
    expect(slot.scrollTop).toBe(0);
  });

  it('escrevendo no Visual, a coluna da prévia também vai até o cursor da folha (o `caret` do editor)', async () => {
    TestBed.inject(Settings).writingMode.set('visual');
    wide();
    await open(note(LONG));
    button().click();
    await fixture.whenStable();
    const palco = el.querySelector<HTMLElement>('.palco')!;
    palco.style.cssText = 'display: block; width: 360px';
    const slot = el.querySelector<HTMLElement>('.previa-slot')!;
    slot.style.cssText = 'height: 200px; overflow-y: auto';
    // o Visual chega num pedaço à parte
    for (let i = 0; i < 300 && !el.querySelector('app-rich-editor .ProseMirror'); i++) await new Promise((r) => setTimeout(r, 10));
    await fixture.whenStable();
    const v = (fixture.debugElement.query(By.css('app-visual-editor')).componentInstance as { view: EditorView }).view;
    v.focus();
    v.dispatch(v.state.tr.setSelection(Selection.atEnd(v.state.doc)));
    await settled(slot);
    const last = card().querySelector<HTMLElement>('[data-l="39"]')!.getBoundingClientRect();
    const view = slot.getBoundingClientRect();
    expect(slot.scrollTop).toBeGreaterThan(0);
    expect(last.top).toBeGreaterThanOrEqual(view.top);
    expect(last.bottom).toBeLessThanOrEqual(view.bottom);
    v.dispatch(v.state.tr.setSelection(Selection.atStart(v.state.doc)));
    await settled(slot);
    expect(slot.scrollTop).toBe(0);
  });
});
