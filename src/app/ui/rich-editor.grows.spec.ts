import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { RichEditor } from './rich-editor';
import { caretBox, scrollerOf } from './caret-follow';
import { needsWindowFocus } from '../testing/window-focus.spec';

const LONGO = Array.from({ length: 120 }, (_, i) => `Linha ${i + 1} de uma nota imensa`).join('\n');

/**
 * A folha que cresce (`grows`, o editor da ficha): sem teto e sem rolagem dentro dela, com o alto da folha e
 * a régua presos em cima do lugar que rola, os painéis pendurados na régua e o que vem do cursor junto dele.
 */
describe('a folha que cresce', () => {
  let fixture: ComponentFixture<RichEditor>;
  let caixa: HTMLElement;

  async function make(text: string, mode: 'visual' | 'markdown', grows = true): Promise<void> {
    localStorage.setItem('mural-de-jogos:config:v1', JSON.stringify({ escrita: mode }));
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(RichEditor);
    fixture.componentRef.setInput('grows', grows);
    fixture.componentRef.setInput('notes', []);
    fixture.componentInstance.value.set(text);
    // o lugar que rola, como o .conteudo do editor da ficha
    caixa = document.createElement('div');
    caixa.style.cssText = 'height: 500px; width: 600px; overflow-y: auto; --conteudo-h: 500px; scroll-padding-block: 110px 32px';
    caixa.append(fixture.nativeElement);
    document.body.append(caixa);
    await settle();
    for (let i = 0; mode === 'visual' && i < 300 && !el().querySelector('.visual .ProseMirror'); i++) {
      await new Promise((r) => setTimeout(r, 10));
      fixture.detectChanges();
    }
    await settle();
  }

  afterEach(() => {
    fixture?.destroy();
    caixa?.remove();
    localStorage.removeItem('mural-de-jogos:config:v1');
  });

  const el = () => fixture.nativeElement as HTMLElement;
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  const area = () => el().querySelector('textarea') as HTMLTextAreaElement;
  const prose = () => el().querySelector('.ProseMirror') as HTMLElement;
  const pm = (): EditorView => (fixture.debugElement.query(By.css('app-visual-editor')).componentInstance as { view: EditorView }).view;
  const top = (s: string) => el().querySelector(s)!.getBoundingClientRect().top;

  it('no Visual e no Markdown, a folha mede o texto inteiro: só o lugar dela rola', async () => {
    await make(LONGO, 'visual');
    expect(prose().scrollHeight).toBeLessThanOrEqual(prose().clientHeight + 1);
    expect(getComputedStyle(prose()).overflowY).toBe('visible');
    expect(prose().clientHeight).toBeGreaterThan(2000);
    expect(caixa.scrollHeight).toBeGreaterThan(2000);
    (el().querySelector('[role=tab][id$="-aba-markdown"]') as HTMLButtonElement).click();
    await settle();
    expect(area().scrollHeight).toBeLessThanOrEqual(area().clientHeight + 1);
    expect(area().clientHeight).toBeGreaterThan(2000);
    expect(getComputedStyle(area()).resize).toBe('none');
  });

  it('rolando, o alto da folha e a régua ficam presos em cima, sem o texto aparecer entre eles', async () => {
    await make(LONGO, 'visual');
    caixa.scrollTop = 1500;
    await new Promise((r) => requestAnimationFrame(r));
    const onde = caixa.getBoundingClientRect().top;
    const cabeca = el().querySelector('.cabeca')!.getBoundingClientRect();
    const regua = el().querySelector('.regua')!.getBoundingClientRect();
    if (matchMedia('(max-height: 500px)').matches) {
      // na janela baixa (a do Karma pode ser), só a régua fica presa
      expect(Math.abs(regua.top - onde)).toBeLessThan(1);
      expect(cabeca.bottom).toBeLessThan(onde);
    } else {
      expect(Math.abs(cabeca.top - onde)).toBeLessThan(1);
      expect(Math.abs(regua.top - cabeca.bottom)).toBeLessThan(1);
      expect(getComputedStyle(el().querySelector('.cabeca')!).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    }
    // o que o cursor evita é a altura dos dois
    expect(Math.abs(regua.bottom - onde - parseFloat(getComputedStyle(el()).getPropertyValue('--topo-h')))).toBeLessThan(1.5);
    // de papel inteiro: o texto passa por baixo
    expect(getComputedStyle(el().querySelector('.regua')!).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  it('o cursor que anda no Visual para acima da régua presa: a folha rola, e ele fica à vista', async () => {
    // (o ProseMirror só leva à vista a seleção que está na folha com o foco)
    needsWindowFocus();
    await make(LONGO, 'visual');
    const v = pm();
    v.focus();
    caixa.scrollTop = 1500;
    let pos = 0;
    for (let k = 0; k < 30; k++) pos += v.state.doc.child(k).nodeSize;
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos + 1)).scrollIntoView());
    await new Promise((r) => requestAnimationFrame(r));
    expect(v.coordsAtPos(v.state.selection.head).top).toBeGreaterThanOrEqual(el().querySelector('.regua')!.getBoundingClientRect().bottom);
  });

  it('os painéis da régua penduram nela, à vista onde quer que o texto esteja', async () => {
    await make(LONGO, 'visual');
    caixa.scrollTop = 1500;
    await settle();
    (el().querySelector('.acao-folha.ajuda') as HTMLButtonElement).click();
    await settle();
    const guia = el().querySelector('.regua .gaveta > .guia') as HTMLElement;
    expect(guia).not.toBeNull();
    const fundo = caixa.getBoundingClientRect().bottom;
    // (o painel desce 6px ao abrir)
    expect(guia.getBoundingClientRect().top).toBeGreaterThanOrEqual(el().querySelector('.regua')!.getBoundingClientRect().bottom - 6);
    expect(guia.getBoundingClientRect().bottom).toBeLessThanOrEqual(fundo);
    // já à vista: abrir não rola o texto
    await new Promise((r) => setTimeout(r, 400));
    expect(caixa.scrollTop).toBe(1500);
  });

  it('o menu que cai da régua presa cabe até o pé do lugar que rola', async () => {
    await make(LONGO, 'visual');
    caixa.style.height = '360px';
    caixa.style.setProperty('--conteudo-h', '360px');
    caixa.scrollTop = 1500;
    (el().querySelector('.menu-botao[data-menu="inserir"]') as HTMLButtonElement).click();
    await settle();
    await new Promise((r) => setTimeout(r, 30));
    expect(el().querySelector('.menu')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(caixa.getBoundingClientRect().bottom);
  });

  it('no Markdown, a tirinha do widget abre logo embaixo da linha tocada, longe do fim da folha', async () => {
    const text = `um\n{{contador: 2026-12-25 | Natal}}\n${LONGO}`;
    await make(text, 'markdown');
    const a = area();
    a.focus();
    a.setSelectionRange(5, 5);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await new Promise((r) => setTimeout(r, 300));
    await settle();
    const tira = el().querySelector('.papel > .widget-tira') as HTMLElement;
    expect(tira).not.toBeNull();
    const linha = caretBox(a, 5);
    const naTela = a.getBoundingClientRect().top + linha.bottom;
    expect(Math.abs(tira.getBoundingClientRect().top - naTela)).toBeLessThan(10);
    expect(document.activeElement).toBe(a);
  });

  it('a linha do widget que quebra em várias: a tirinha abre embaixo dela inteira, sem cobrir o fim', async () => {
    const line = `{{imagem: https://exemplo.invalid/${'caminho/'.repeat(30)}foto.jpg | Legenda}}`;
    await make(`${line}\n${LONGO}`, 'markdown');
    const a = area();
    a.focus();
    // (o foco leva o cursor do fim do texto à vista: o toque é na linha do alto, à vista)
    caixa.scrollTop = 0;
    a.setSelectionRange(5, 5);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await new Promise((r) => setTimeout(r, 300));
    await settle();
    const tira = el().querySelector('.papel > .widget-tira') as HTMLElement;
    const fim = a.getBoundingClientRect().top + caretBox(a, line.length).bottom;
    expect(caretBox(a, line.length).bottom).toBeGreaterThan(caretBox(a, 5).bottom + 20);
    expect(Math.abs(tira.getBoundingClientRect().top - fim)).toBeLessThan(10);
  });

  it('a lista do "[[" abre junto do cursor; sem lugar embaixo, em cima da linha', async () => {
    await make(LONGO, 'markdown');
    const a = area();
    a.focus();
    const digita = async (at: number) => {
      a.setSelectionRange(at, at);
      document.execCommand('insertText', false, '[[C');
      a.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    };
    await digita(0);
    const lista = () => el().querySelector('.papel > .elos') as HTMLElement;
    expect(lista().classList).not.toContain('sobe');
    expect(Math.abs(lista().getBoundingClientRect().top - (a.getBoundingClientRect().top + caretBox(a, a.selectionStart).bottom))).toBeLessThan(10);

    // no pé do que se vê: a lista sobe, sem passar do pé
    const at = a.value.indexOf('Linha 60');
    caixa.scrollTop = a.getBoundingClientRect().top - caixa.getBoundingClientRect().top + caretBox(a, at).top - 440 + caixa.scrollTop;
    await digita(at);
    const fundo = caixa.getBoundingClientRect().bottom;
    expect(lista().classList).toContain('sobe');
    expect(lista().getBoundingClientRect().bottom).toBeLessThanOrEqual(fundo);
  });

  it('no Visual, a lista do "[[" também abre junto do cursor', async () => {
    await make(LONGO, 'visual');
    const v = pm();
    v.dispatch(v.state.tr.setSelection(TextSelection.atStart(v.state.doc)));
    v.dispatch(v.state.tr.insertText('[[C'));
    await settle();
    const lista = el().querySelector('.papel > .elos') as HTMLElement;
    expect(lista).not.toBeNull();
    expect(Math.abs(lista.getBoundingClientRect().top - v.coordsAtPos(v.state.selection.head).bottom)).toBeLessThan(10);
  });

  it('sem `grows` (o comentário, o perfil), a folha tem o teto de sempre, e os painéis ficam embaixo dela', async () => {
    await make(LONGO, 'markdown', false);
    expect(area().clientHeight).toBeLessThan(400);
    expect(el().classList).not.toContain('cresce');
    expect(getComputedStyle(el().querySelector('.regua')!).position).toBe('relative');
    (el().querySelector('.acao-folha.ajuda') as HTMLButtonElement).click();
    await settle();
    expect(el().querySelector('.gaveta')).toBeNull();
    expect(el().querySelector(':scope > .guia')).not.toBeNull();
  });
});

describe('a linha do cursor na <textarea> (caretBox)', () => {
  let area: HTMLTextAreaElement;
  beforeEach(() => {
    area = document.createElement('textarea');
    area.style.cssText = 'width: 200px; height: 300px; font: 16px/20px monospace; padding: 4px; border: 0; margin: 0';
    document.body.append(area);
  });
  afterEach(() => area.remove());

  it('conta as quebras escritas e as que a largura faz; a cópia não fica na página', () => {
    area.value = 'um\ndois\n' + 'palavra '.repeat(20);
    expect(Math.abs(caretBox(area, 0).top - 4)).toBeLessThan(1);
    expect(Math.abs(caretBox(area, 0).bottom - 24)).toBeLessThan(1);
    expect(Math.abs(caretBox(area, 3).top - 24)).toBeLessThan(1);
    expect(Math.abs(caretBox(area, 8).top - 44)).toBeLessThan(1);
    // o cursor no meio da palavra que a largura levou para a linha de baixo: ela vai inteira, com ele
    const longo = 'a'.repeat(14) + ' ' + 'b'.repeat(14);
    area.value = longo;
    expect(Math.abs(caretBox(area, longo.length - 3).top - 24)).toBeLessThan(1);
    area.value = 'um\ndois\n' + 'palavra '.repeat(20);
    // a última palavra está várias linhas abaixo da terceira linha do texto
    expect(caretBox(area, area.value.length - 1).top).toBeGreaterThan(84);
    expect(document.querySelectorAll('body > div[style*="visibility: hidden"]').length).toBe(0);
    expect(area.nextElementSibling?.getAttribute('style')?.includes('visibility') ?? false).toBeFalse();
  });

  it('o lugar que rola em volta é o primeiro com overflow auto', () => {
    const box = document.createElement('div');
    box.style.overflowY = 'auto';
    const inner = document.createElement('div');
    box.append(inner);
    document.body.append(box);
    inner.append(area);
    expect(scrollerOf(area)).toBe(box);
    box.remove();
  });
});
