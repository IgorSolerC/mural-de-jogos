import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { StudyStore } from '../core/study-store';
import { StudySession } from './study-session';

/** A sessão de estudo (PLANO-ESTUDOS.md, 6.7): a carta, virar, Errei e Acertei, as teclas, o Desfazer e o fim. */

@Component({
  imports: [StudySession],
  template: `@if (open()) {
    <app-study-session [deck]="deck()" (closed)="open.set(false)" (all)="deck.set(null)" />
  }`,
})
class Host {
  readonly open = signal(true);
  readonly deck = signal<string | null>(null);
}

const T0 = '2026-10-01T10:00:00.000Z';
const note = (id: string, name: string, extra: Record<string, unknown> = {}): Review => ({ ...sanitizeReview({ kind: 'anotacoes', game: { name }, completedAt: '2026-10-01', createdAt: T0, ...extra })!, id });

describe('a sessão de estudo (ui/study-session.ts)', () => {
  let fixture: ComponentFixture<Host>;
  let study: StudyStore;
  let kanji: string;
  let bio: string;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }
  const dialog = () => document.querySelector<HTMLDialogElement>('dialog.sessao');
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => dialog()?.querySelector<T>(sel) ?? null;
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const key = (k: string, extra: KeyboardEventInit = {}) => dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
  const frontTitle = () => text($('.frente app-study-card .titulo'));

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([
      note('nsol', 'Sol (日)', { text: 'Leitura: nichi.', stock: 'azul', pattern: 'gatinhos', damage: 'rasgado', stains: [{ stain: 'cafe' }] }),
      note('nlua', 'Lua (月)', { text: 'Leitura: getsu.' }),
      note('nbio', 'Mitocôndria', { text: 'Respiração celular.' }),
    ]);
    study = TestBed.inject(StudyStore);
    kanji = study.addDeck('Kanjis', 'amarelo');
    bio = study.addDeck('Biologia', 'verde');
    study.addCard('nsol', [kanji], { title: '日' });
    study.addCard('nlua', [kanji], { title: '月' });
    study.addCard('nbio', [bio]);
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.deck.set(kanji);
    document.body.appendChild(fixture.nativeElement);
    await settle();
  });

  afterEach(() => {
    dialog()?.close();
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  it('abre só com as cartas do baralho escolhido, a frente à mostra e o verso escondido', async () => {
    expect(dialog()?.open).toBeTrue();
    expect(text($('.baralho'))).toBe('Kanjis');
    expect(frontTitle()).toBe('日');
    expect($('.verso')!.hasAttribute('inert')).toBeTrue();
    expect(text($('.mostrar'))).toContain('Mostrar a resposta');
    expect([...dialog()!.querySelectorAll('.monte')].map(text)).toEqual(['2 novas', '0 aprendendo', '0 revisões']);
  });

  it('Espaço vira; o verso é a cartolina da anotação (cor, papel e estampa, sem estrago nem mancha)', async () => {
    key(' ');
    await settle();
    const verso = $('.verso')!;
    expect(verso.hasAttribute('inert')).toBeFalse();
    expect(verso.classList).toContain('cartolina');
    expect(verso.getAttribute('data-cor')).toBe('azul');
    expect(verso.getAttribute('style')).toContain('--estampa');
    // o desenho do papel vai sem o estrago e sem as manchas
    expect(verso.querySelector('app-paper-art .mancha, app-paper-art [class*="estrago"]')).toBeNull();
    expect(text(verso.querySelector('.verso-titulo'))).toBe('Sol (日)');
    expect(text(verso.querySelector('app-rich-text'))).toContain('Leitura: nichi.');
    // embaixo de cada botão, quando a carta voltaria (a nova: 1 min ou 10 min)
    expect(text($('.errei .volta'))).toContain('1 min');
    expect(text($('.acertei .volta'))).toContain('10 min');
  });

  it('1 é Errei, 2 (ou Espaço) é Acertei; a próxima vem, e a resposta fica guardada na hora', async () => {
    key(' ');
    await settle();
    key('2');
    await settle();
    expect(study.cardOf().get('nsol')!.stats).toEqual({ seen: 1, right: 1, wrong: 0, marks: '1' });
    expect(frontTitle()).toBe('月');
    key('Enter');
    await settle();
    key('1');
    await settle();
    expect(study.cardOf().get('nlua')!.stats.wrong).toBe(1);
    // as duas em aprendizado voltam daqui a pouco (dentro dos 20 minutos): a mesa continua com elas
    expect(dialog()!.querySelector('.fim')).toBeNull();
    expect([...dialog()!.querySelectorAll('.monte')].map(text)).toEqual(['0 novas', '2 aprendendo', '0 revisões']);
  });

  it('Desfazer (Z) volta a última resposta e a carta dela, sem virar', async () => {
    key(' ');
    await settle();
    key('2');
    await settle();
    expect(frontTitle()).toBe('月');
    key('z');
    await settle();
    expect(frontTitle()).toBe('日');
    expect($('.verso')!.hasAttribute('inert')).toBeTrue();
    expect(study.cardOf().get('nsol')!.srs.state).toBe('nova');
    expect(study.state().today).toBeNull();
    expect($<HTMLButtonElement>('.desfazer')!.disabled).toBeTrue();
  });

  it('o fim: quantas vistas e acertos, e o Estudar tudo quando outro baralho ainda tem cartas', async () => {
    // as duas formadas de uma vez: Acertei, e de novo depois do passo
    for (let i = 0; i < 6 && !dialog()!.querySelector('.fim'); i++) {
      // o passo de 10 minutos: o relógio da carta anda para agora
      study.state.update((s) => ({ ...s, cards: s.cards.map((c) => (c.srs.state === 'aprendendo' ? { ...c, srs: { ...c.srs, due: new Date(Date.now() - 1000).toISOString() } } : c)) }));
      key(' ');
      await settle();
      key('2');
      await settle();
    }
    expect(text($('.fim h3'))).toBe('Por hoje, é isso.');
    expect(text($('.fim-conta'))).toContain('4 cartas vistas · acertou 4 (100%)');
    const all = $<HTMLButtonElement>('.fim .papel')!;
    expect(text(all)).toBe('Estudar tudo');
    all.click();
    await settle();
    expect(fixture.componentInstance.deck()).toBeNull();
    expect(text($('.baralho'))).toBe('Tudo');
    expect(frontTitle()).toBe('Mitocôndria');
  });

  it('Espaço num botão com o foco é do botão: no Errei escolhido pelo Tab, é Errei', async () => {
    key(' ');
    await settle();
    const errei = $<HTMLButtonElement>('.errei')!;
    errei.focus();
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    errei.dispatchEvent(ev);
    // o atalho não toma o Espaço: o navegador aperta o botão com o foco
    expect(ev.defaultPrevented).toBeFalse();
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(0);
    errei.click();
    await settle();
    expect(study.cardOf().get('nsol')!.stats.wrong).toBe(1);
  });

  it('Parar fecha a mesa; o que foi respondido continua guardado', async () => {
    key(' ');
    await settle();
    key('2');
    await settle();
    $<HTMLButtonElement>('.parar')!.click();
    await settle();
    expect(fixture.componentInstance.open()).toBeFalse();
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(1);
  });
});
