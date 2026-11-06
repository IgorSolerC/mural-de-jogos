import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Kind, sanitizeReview } from '../core/review';
import { Settings } from '../core/settings';
import { caretBox } from './caret-follow';
import { ReviewEditor } from './review-editor';
import { comMarkdown } from '../testing/writing-mode.spec';

const TEXTO = Array.from({ length: 150 }, (_, i) => `Linha ${i + 1} do texto`).join('\n');
const TIPOS: readonly Kind[] = ['anotacoes', 'jogos', 'livros', 'filmes', 'series', 'animes', 'musicas'];
/** Da cartolina clara à escura: a fibra aparece numas e quase some noutras, e o fundo tem de ser um só. */
const CORES = ['amarelo', 'azul', 'branco', 'azul-escuro', 'preto'];

/**
 * Todo editor com a régua (a anotação e a análise de cada mural, onde a folha começa lá embaixo, depois das
 * notas e do veredito): o fundo liso, o alto da folha preso com esse mesmo fundo atrás, e o painel longe do cursor.
 */
describe('o editor de todos os murais: o alto preso e o painel', () => {
  comMarkdown();
  let fixture: ComponentFixture<ReviewEditor>;

  async function abre(kind: Kind, stock = 'amarelo'): Promise<void> {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    const settings = TestBed.inject(Settings);
    settings.askNoCategory.set(false);
    settings.askNoTag.set(false);
    fixture = TestBed.createComponent(ReviewEditor);
    document.body.appendChild(fixture.nativeElement);
    const review = sanitizeReview({ kind, stock, text: TEXTO, game: { name: 'Item', coverUrl: null, source: 'manual' }, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' });
    fixture.componentInstance.open(review!);
    await espera();
  }

  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
    localStorage.clear();
  });

  async function espera(ms = 60): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, ms));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const conteudo = () => el().querySelector('.conteudo') as HTMLElement;
  const editor = () => el().querySelector('app-rich-editor') as HTMLElement;
  const folha = () => editor().querySelector(':scope > .papel') as HTMLElement;

  /** De uma vez (como a barra de rolar arrastada), para dentro do texto. */
  async function rolaParaDentro(px: number): Promise<void> {
    const c = conteudo();
    c.scrollTop += folha().getBoundingClientRect().top - c.getBoundingClientRect().top + px;
    await espera(120);
  }

  for (const kind of TIPOS) {
    it(`${kind}: a folha que cresce, e rolando de uma vez, o alto prende com o texto escondido`, async () => {
      await abre(kind);
      expect(editor().classList).toContain('cresce');
      expect(editor().classList).not.toContain('no-alto');
      await rolaParaDentro(1500);
      expect(editor().classList).toContain('no-alto');
      const c = conteudo().getBoundingClientRect();
      const regua = editor().querySelector('.regua')!.getBoundingClientRect();
      const topo = parseFloat(getComputedStyle(editor()).getPropertyValue('--topo-h'));
      expect(Math.abs(regua.bottom - c.top - topo)).toBeLessThan(1.5);
      if (!matchMedia('(max-height: 500px)').matches) {
        const fundo = getComputedStyle(editor().querySelector('.cabeca')!, '::before');
        expect(fundo.content).not.toBe('none');
        expect(fundo.backgroundColor).toBe(getComputedStyle(el().querySelector('form.ficha')!).backgroundColor);
        expect(parseFloat(fundo.bottom)).toBe(0);
      }
      await rolaParaDentro(-5000);
      expect(editor().classList).not.toContain('no-alto');
    });

    it(`${kind}: o painel do link abre sem cobrir o cursor`, async () => {
      await abre(kind);
      await rolaParaDentro(1000);
      const a = editor().querySelector('textarea') as HTMLTextAreaElement;
      const c = conteudo().getBoundingClientRect();
      const regua = editor().querySelector('.regua')!.getBoundingClientRect();
      // a linha logo abaixo da régua, onde o painel abriria se ficasse pendurado nela
      const box = a.getBoundingClientRect();
      const linhas = a.value.split('\n');
      let at = 0;
      for (const l of linhas) {
        if (box.top + caretBox(a, at).top >= regua.bottom + 8) break;
        at += l.length + 1;
      }
      a.setSelectionRange(at, at);
      const scroll = conteudo().scrollTop;
      (editor().querySelector('.menu-botao[data-menu="inserir"]') as HTMLButtonElement).click();
      await espera(40);
      [...editor().querySelectorAll<HTMLElement>('.menu button')].find((b) => /endereço/i.test(b.textContent ?? ''))!.click();
      await espera(400);
      const painel = editor().querySelector('.papel > .gaveta > .url-painel') as HTMLElement;
      expect(painel).not.toBeNull();
      const p = painel.getBoundingClientRect();
      const agora = a.getBoundingClientRect().top;
      const linha = { top: agora + caretBox(a, at).top, bottom: agora + caretBox(a, at).bottom };
      expect(linha.bottom <= p.top || linha.top >= p.bottom).withContext(`linha ${linha.top}–${linha.bottom}, painel ${p.top}–${p.bottom}, ${scroll}`).toBeTrue();
      // (na janela bem baixa, a do Karma pode ser, o painel não cabe na altura que sobra: o cursor é o que conta)
      if (c.height > 400) expect(p.bottom).toBeLessThanOrEqual(c.bottom);
    });
  }

  for (const stock of CORES) {
    it(`cartolina ${stock}: o corpo do editor é liso, e a faixa do alto continua com a cartolina`, async () => {
      await abre('jogos', stock);
      const ficha = getComputedStyle(el().querySelector('form.ficha')!);
      expect(ficha.backgroundImage).toBe('none');
      const paper = document.createElement('i');
      paper.style.color = 'var(--paper)';
      document.body.append(paper);
      expect(ficha.backgroundColor).toBe(getComputedStyle(paper).color);
      paper.remove();
      expect(getComputedStyle(el().querySelector('form.ficha .head')!).backgroundColor).not.toBe(ficha.backgroundColor);
    });
  }
});
