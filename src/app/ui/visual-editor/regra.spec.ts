import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { docToText, textToDoc } from '../../core/rich-doc';
import { WIDGETS } from '../../core/widgets';
import { PDF_BLOCK_SAMPLES, PDF_LOCAL_IMAGE, PDF_SPAN_SAMPLES, PDF_WIDGET_SAMPLES, pdfSampleText } from '../pdf-sheet.samples';
import { VisualEditor } from './visual-editor';

/**
 * A REGRA DO VISUAL (core/rich-text.ts e core/widgets.ts, PLANO-EDITOR-VISUAL.md seção 10): tudo o que
 * se escreve numa anotação abre no modo Visual sem virar trecho cru e sai dele sem mudar um byte. As
 * amostras são as da REGRA DO PDF (ui/pdf-sheet.samples.ts), que os tipos já obrigam: um bloco ou uma
 * marca nova não compila sem a amostra dela, e um widget novo sem amostra faz o pdf-sheet.spec.ts
 * falhar. Com a amostra, este spec confere que o Visual também sabe dele.
 */
describe('a REGRA DO VISUAL: cada bloco, marca e widget abre no Visual sem mudar um byte', () => {
  let fixture: ComponentFixture<VisualEditor>;
  let view: EditorView;
  let valor: string | null;

  async function make(texto: string): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [VisualEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(VisualEditor);
    fixture.componentRef.setInput('texto', texto);
    valor = null;
    fixture.componentInstance.mudou.subscribe((t) => (valor = t));
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    view = (fixture.componentInstance as unknown as { view: EditorView }).view;
  }

  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
  });

  /** Abre, anda com o cursor do começo ao fim (cada posição de letra) e confere que nada mudou. */
  async function confere(nome: string, texto: string): Promise<void> {
    // o tradutor sozinho: ler e escrever devolve o mesmo texto
    const escrita = docToText(textToDoc(texto));
    expect(escrita.texto).withContext(`${nome}: o tradutor`).toBe(texto);
    expect(textToDoc(texto).linhas.some((l) => l.kind === 'cru')).withContext(`${nome}: nenhuma linha crua`).toBeFalse();
    // a folha: nenhum trecho cru, e o cursor andando por ela não escreve nada
    await make(texto);
    expect(fixture.nativeElement.querySelector('.vis-cru')).withContext(`${nome}: trecho cru na folha`).toBeNull();
    const fim = view.state.doc.content.size;
    for (let pos = 0; pos <= fim; pos += Math.max(1, Math.floor(fim / 12))) {
      const $p = view.state.doc.resolve(pos);
      if ($p.parent.inlineContent) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
    }
    expect(valor).withContext(`${nome}: o texto mudou só de abrir`).toBeNull();
  }

  for (const [kind, s] of Object.entries(PDF_BLOCK_SAMPLES)) it(`o bloco ${kind}`, () => confere(kind, s.text));
  for (const [mark, s] of Object.entries(PDF_SPAN_SAMPLES)) it(`a marca ${mark}`, () => confere(mark, s.text));
  for (const [nome, xs] of Object.entries(PDF_WIDGET_SAMPLES)) it(`o widget ${nome}, em cada jeito`, async () => {
    for (const x of xs) await confere(nome, x);
  });
  it('a imagem colada do aparelho', () => confere('imagem do aparelho', PDF_LOCAL_IMAGE.text));
  it('a anotação com tudo junto', () => confere('tudo', pdfSampleText()));

  it('todo widget do registro tem amostra (a do PDF serve aos dois)', () => {
    for (const w of WIDGETS) expect(PDF_WIDGET_SAMPLES[w.name]?.length).withContext(`falta a amostra do widget ${w.name} em ui/pdf-sheet.samples.ts`).toBeGreaterThan(0);
  });
});
