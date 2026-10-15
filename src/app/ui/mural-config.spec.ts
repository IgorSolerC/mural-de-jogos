import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { MuralConfig } from './mural-config';

let seq = 0;
const note = (category: string | null): Review =>
  sanitizeReview({
    id: `ncfg${++seq}`,
    kind: 'anotacoes',
    game: { name: `Nota ${seq}`, coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    text: '',
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    private: true,
    ...(category ? { category } : {}),
  })!;

/** A folha da engrenagem do mural de anotações. */
describe('as configurações do mural (a folha)', () => {
  let fixture: ComponentFixture<MuralConfig>;
  let el: HTMLElement;
  let settings: Settings;
  let closed: number;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [MuralConfig], providers: [provideZonelessChangeDetection()] });
    settings = TestBed.inject(Settings);
    // Viagens! (3), Roadmap site (2), Receitas (1) e uma sem categoria
    TestBed.inject(ReviewStore).reviews.set([
      note('Viagens!'),
      note('viagens!'),
      note('Viagens!'),
      note('Roadmap site'),
      note('Roadmap site'),
      note('Receitas'),
      note(null),
    ]);
    fixture = TestBed.createComponent(MuralConfig);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.whenStable();
  });

  afterEach(() => {
    el.querySelector('dialog')?.close();
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  const tab = (name: string) => el.querySelector<HTMLButtonElement>(`#config-aba-${name}`)!;
  const segment = (root: ParentNode, text: string) =>
    Array.from(root.querySelectorAll<HTMLLabelElement>('.segmento')).find((s) => s.textContent!.trim().startsWith(text))!.querySelector('input')!;
  const rows = () => Array.from(el.querySelectorAll('.cat app-cat-label .nome')).map((n) => n.textContent!.trim());
  const go = async (name: string) => {
    tab(name).click();
    await fixture.whenStable();
  };

  it('abre como diálogo, com o índice como lista de abas', async () => {
    expect(el.querySelector('dialog')!.open).toBeTrue();
    await go('padroes');
    expect(tab('padroes').getAttribute('aria-selected')).toBe('true');
    expect(tab('categorias').getAttribute('tabindex')).toBe('-1');
    expect(el.querySelector('h3')!.textContent).toBe('Padrões');
  });

  it('os padrões mudam o mural inteiro na hora', async () => {
    await go('padroes');
    segment(el, 'Disponível').click();
    segment(el, 'Cor da mãe').click();
    await fixture.whenStable();
    expect(settings.notesConfig().audience).toBe('visivel');
    expect(settings.notesConfig().subColor).toBe('mae');
    const tagSwitch = el.querySelector<HTMLButtonElement>('[aria-labelledby="config-t-tag"]')!;
    tagSwitch.click();
    await fixture.whenStable();
    expect(settings.askNoTag()).toBeFalse();
    expect(tagSwitch.getAttribute('aria-checked')).toBe('false');
  });

  it('as setas do índice trocam de parte, e a folha volta na parte em que ficou', async () => {
    await go('padroes');
    tab('padroes').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    expect(tab('categorias').getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('h3')!.textContent).toBe('Categorias');
    const again = TestBed.createComponent(MuralConfig);
    document.body.appendChild(again.nativeElement);
    await again.whenStable();
    expect(again.nativeElement.querySelector('#config-aba-categorias').getAttribute('aria-selected')).toBe('true');
    again.nativeElement.querySelector('dialog')?.close();
    again.nativeElement.remove();
    again.destroy();
  });

  it('lista as categorias da maior para a menor, cada uma seguindo o mural até mudar', async () => {
    await go('categorias');
    expect(rows()).toEqual(['Viagens!', 'Roadmap site', 'Receitas']);
    expect(el.querySelectorAll('.alca').length).toBe(0);
    const first = el.querySelector('.cat')!;
    expect(first.querySelector('.cat-resumo')!.textContent!.trim()).toBe('Segue o mural');
    first.querySelector<HTMLButtonElement>('.cat-abre')!.click();
    await fixture.whenStable();
    const panel = first.querySelector('.cat-painel')!;
    expect(first.querySelector('.cat-abre')!.getAttribute('aria-expanded')).toBe('true');
    // "Do mural" diz o que o mural manda agora
    expect(segment(panel, 'Do mural').closest('label')!.textContent).toContain('Privada');
    segment(panel, 'Publicar').click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories['viagens!']).toEqual({ audience: 'publicar' });
    expect(first.querySelector('.cat-resumo')!.textContent!.trim()).toBe('Nasce Publicar');
    // voltar a seguir o mural tira tudo o que é dela
    first.querySelector<HTMLButtonElement>('.voltar')!.click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories).toEqual({});
  });

  it('na minha ordem, a alça sobe e desce a categoria pelo teclado, e as abas seguem', async () => {
    await go('categorias');
    segment(el, 'Na minha ordem').click();
    await fixture.whenStable();
    expect(settings.notesConfig().orderBy).toBe('minha');
    expect(settings.notesConfig().order).toEqual(['viagens!', 'roadmap site', 'receitas']);
    const handles = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.alca'));
    expect(handles().length).toBe(3);
    handles()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await fixture.whenStable();
    expect(rows()).toEqual(['Viagens!', 'Receitas', 'Roadmap site']);
    handles()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await fixture.whenStable();
    expect(rows()).toEqual(['Receitas', 'Viagens!', 'Roadmap site']);
    expect(el.querySelector('[aria-live="polite"]')!.textContent).toContain('Receitas: 1ª de 3');
    // de volta à quantidade, e de novo à minha: a ordem montada não se perdeu
    segment(el, 'Da maior para a menor').click();
    await fixture.whenStable();
    expect(rows()).toEqual(['Viagens!', 'Roadmap site', 'Receitas']);
    segment(el, 'Na minha ordem').click();
    await fixture.whenStable();
    expect(rows()).toEqual(['Receitas', 'Viagens!', 'Roadmap site']);
  });

  it('o olho esconde a categoria no Mais, e mostra de novo', async () => {
    await go('categorias');
    const second = el.querySelectorAll('.cat')[1];
    const eye = second.querySelector<HTMLButtonElement>('.olho')!;
    expect(eye.getAttribute('aria-pressed')).toBe('false');
    expect(eye.getAttribute('aria-label')).toBe('Esconder Roadmap site no Mais');
    eye.click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories['roadmap site']).toEqual({ hidden: true });
    expect(eye.getAttribute('aria-pressed')).toBe('true');
    expect(second.classList).toContain('escondida');
    expect(second.querySelector('.cat-n')!.textContent).toContain('escondida no Mais');
    // esconder não é um padrão da categoria: ela continua seguindo o mural
    expect(second.querySelector('.cat-resumo')!.textContent!.trim()).toBe('Segue o mural');
    expect(el.querySelector('[aria-live="polite"]')!.textContent).toContain('Roadmap site escondida');
    eye.click();
    await fixture.whenStable();
    expect(settings.notesConfig().categories).toEqual({});
    expect(second.classList).not.toContain('escondida');
  });

  it('fechar avisa quem abriu', async () => {
    el.querySelector<HTMLButtonElement>('.icon-btn')!.click();
    await fixture.whenStable();
    for (let i = 0; i < 20 && !closed; i++) await new Promise((r) => setTimeout(r, 10));
    expect(closed).toBe(1);
    expect(el.querySelector('dialog')!.open).toBeFalse();
  });
});
