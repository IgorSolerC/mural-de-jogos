import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { StudyStore } from '../core/study-store';
import { MuralConfig } from './mural-config';

const T0 = '2026-10-10T10:00:00.000Z';
const note = (id: string): Review => ({ ...sanitizeReview({ kind: 'anotacoes', category: 'Estudos', game: { name: id }, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0 })!, id });

/** A engrenagem dos Estudos: a mesma folha do mural, com as partes Estudo e Baralhos. */
describe('as configurações dos Estudos (a folha da engrenagem)', () => {
  let fixture: ComponentFixture<MuralConfig>;
  let el: HTMLElement;
  let study: StudyStore;
  let kanji: string;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [MuralConfig], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([note('n1'), note('n2')]);
    study = TestBed.inject(StudyStore);
    kanji = study.addDeck('Kanjis', 'amarelo', 'livro');
    study.addCard('n1', [kanji]);
    study.addCard('n2', [kanji]);
    fixture = TestBed.createComponent(MuralConfig);
    fixture.componentRef.setInput('study', true);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    el.querySelector('dialog')?.close();
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  const tabs = () => [...el.querySelectorAll('[role="tab"] .parte-nome')].map((t) => t.textContent!.trim());
  const segment = (text: string) =>
    [...el.querySelectorAll<HTMLLabelElement>('.segmento')].find((s) => s.textContent!.trim().startsWith(text))!.querySelector('input')!;
  const go = async (name: string) => {
    el.querySelector<HTMLButtonElement>(`#config-aba-${name}`)!.click();
    await fixture.whenStable();
  };

  it('só as partes dos Estudos, com o título deles, abrindo no Estudo', () => {
    expect(el.querySelector('dialog')!.open).toBeTrue();
    expect(el.querySelector('#config-titulo')!.textContent).toContain('Configurações dos estudos');
    expect(tabs()).toEqual(['Estudo', 'Baralhos']);
    expect(el.querySelector('[role="tab"][aria-selected="true"] .parte-nome')!.textContent!.trim()).toBe('Estudo');
  });

  it('o Estudo: quanto lembrar, as revisões por dia e a ordem das novas valem na hora', async () => {
    segment('85%').click();
    expect(study.config().retention).toBe(0.85);
    const max = el.querySelector<HTMLInputElement>('.numero input')!;
    max.value = '50';
    max.dispatchEvent(new Event('change'));
    expect(study.config().maxReviews).toBe(50);
    // o campo apagado não muda
    max.value = '';
    max.dispatchEvent(new Event('change'));
    expect(study.config().maxReviews).toBe(50);
    segment('Sorteados').click();
    expect(study.config().newOrder).toBe('sorteio');
    await fixture.whenStable();
    expect(el.textContent).toContain('Sorteados, um sorteio novo a cada dia.');
  });

  it('os Baralhos: as novas por dia pelos botões e pelo campo, e o mural também', async () => {
    await go('baralhos');
    expect(el.querySelector('.baralho-nome')!.textContent).toContain('Kanjis');
    expect(el.querySelector('.baralho-n')!.textContent!.trim()).toBe('2 flashcards');
    el.querySelector<HTMLButtonElement>('button[aria-label="Um novo a mais por dia em Kanjis"]')!.click();
    expect(study.deck(kanji)!.newPerDay).toBe(6);
    const field = el.querySelector<HTMLInputElement>('.baralho-config .numero input')!;
    field.value = '0';
    field.dispatchEvent(new Event('change'));
    expect(study.deck(kanji)!.newPerDay).toBe(0);
    await fixture.whenStable();
    expect(el.querySelector<HTMLButtonElement>('button[aria-label="Um novo a menos por dia em Kanjis"]')!.disabled).toBeTrue();
    expect(el.textContent).toContain('Nenhum novo entra: só as revisões.');
    const sw = el.querySelector<HTMLButtonElement>('.baralho-config .interruptor')!;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    expect(study.deck(kanji)!.wall).toBeTrue();
    await fixture.whenStable();
    expect(sw.getAttribute('aria-checked')).toBe('true');
    sw.click();
    expect(study.deck(kanji)!.wall).toBeUndefined();
  });
});
