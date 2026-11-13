import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { LinkedCard } from './linked-card';
import { ReviewCard } from './review-card';
import { StudyCardBack } from './study-card-back';

/** O verso de uma carta dos Flashcards, como a parede do baralho o põe (com a classe .cartolina). */
@Component({
  imports: [StudyCardBack],
  template: `<article appStudyBack class="verso cartolina" note="raio0001" style="display: block; width: 200px; height: 280px"></article>`,
})
class BackHost {}

function review(extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: 'raio0001',
    kind: 'anotacoes',
    game: { name: 'Canto da cartolina', coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    stock: 'rosa',
    text: 'O canto arredondado.',
    createdAt: '2026-11-13T10:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
    ...extra,
  })!;
}

const corners = (el: Element) => {
  const s = getComputedStyle(el);
  return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
};

/** Toda cartolina tem o canto de pelo menos 5px (--raio-cartolina, styles.scss), pedido de 13/nov/2026. */
describe('o canto das cartolinas', () => {
  let fixture: ComponentFixture<ReviewCard> | undefined;
  const extras: Element[] = [];

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    for (const e of extras.splice(0)) e.remove();
    localStorage.clear();
  });

  it('o token vale 5px', () => {
    expect(getComputedStyle(document.documentElement).getPropertyValue('--raio-cartolina').trim()).toBe('5px');
  });

  it('a classe .cartolina já arredonda: a cartolina nova não precisa escrever o canto', () => {
    const el = document.createElement('section');
    el.className = 'cartolina';
    document.body.append(el);
    extras.push(el);
    expect(corners(el)).toEqual(['5px', '5px', '5px', '5px']);
  });

  it('o botão de cartolina em branco também', () => {
    const el = document.createElement('button');
    el.className = 'btn-cartolina';
    document.body.append(el);
    extras.push(el);
    expect(corners(el)).toEqual(['5px', '5px', '5px', '5px']);
  });

  for (const [vista, inputs] of [
    ['comum', {}],
    ['simples', { compact: true }],
    ['capas', { capas: true }],
    ['visão geral', { compact: true, overview: true }],
  ] as const) {
    it(`a ficha do mural na vista ${vista}, com o botão e a vaga seguindo o canto dela`, async () => {
      TestBed.configureTestingModule({ imports: [ReviewCard], providers: [provideZonelessChangeDetection()] });
      fixture = TestBed.createComponent(ReviewCard);
      fixture.componentRef.setInput('review', review());
      for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('cartolina');
      expect(corners(host)).toEqual(['5px', '5px', '5px', '5px']);
      // as camadas do papel (sem o canto, a cartolina pintava quadrada por cima dele), o botão que cobre a
      // ficha (o anel do foco) e a vaga tracejada que espera o papel
      const layers = host.querySelectorAll('app-paper-art .camada');
      expect(layers.length).toBeGreaterThan(0);
      for (const l of Array.from(layers)) expect(corners(l)).toEqual(['5px', '5px', '5px', '5px']);
      expect(corners(host.querySelector('.hit')!)).toEqual(['5px', '5px', '5px', '5px']);
      expect(getComputedStyle(host, '::before').borderTopLeftRadius).toBe('5px');
    });
  }

  it('numa análise também (o mural dos jogos)', async () => {
    TestBed.configureTestingModule({ imports: [ReviewCard], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', review({ id: 'raio0002', kind: 'jogos', scores: { final: 8 }, stock: 'verde' }));
    await fixture.whenStable();
    expect(corners(fixture.nativeElement as HTMLElement)).toEqual(['5px', '5px', '5px', '5px']);
  });

  it('a ficha colada no texto: a tira e a faixa do texto inteiro, com a folha creme no mesmo canto', async () => {
    TestBed.configureTestingModule({ imports: [LinkedCard], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([review({ id: 'raio0003', category: 'Casa' })]);
    for (const look of ['tira', 'inteira']) {
      const f = TestBed.createComponent(LinkedCard);
      f.componentRef.setInput('args', ['#raio0003', look]);
      f.componentRef.setInput('links', null);
      const el = f.nativeElement as HTMLElement;
      el.style.setProperty('--widget-alto', '200px');
      el.style.width = '500px';
      document.body.append(el);
      extras.push(el);
      await f.whenStable();
      if (look === 'tira') {
        expect(corners(el.querySelector('.tira.cartolina')!)).toEqual(['5px', '5px', '5px', '5px']);
      } else {
        expect(corners(el.querySelector('.inteira')!)).toEqual(['5px', '5px', '5px', '5px']);
        expect(corners(el.querySelector('.faixa.cartolina')!)).toEqual(['5px', '5px', '0px', '0px']);
      }
      f.destroy();
    }
  });

  it('os Flashcards ficam de fora: o verso, que também é .cartolina, guarda os cantos dele (6% da carta)', async () => {
    TestBed.configureTestingModule({ imports: [BackHost], providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(BackHost);
    await f.whenStable();
    const back = (f.nativeElement as HTMLElement).querySelector('article.cartolina')!;
    // 6% de 200px na horizontal, 4,2857% de 280px na vertical: 12px nos dois
    expect(getComputedStyle(back).borderTopLeftRadius).toBe('6% 4.2857%');
    f.destroy();
  });
});
