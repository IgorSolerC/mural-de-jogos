import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Desk, DeskHandlers } from '../core/desk';
import { Mural } from '../core/mural';
import { Wish } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { WISHLIST_PREFS_KEY } from '../core/wishlist-view';
import { WishlistPage } from './wishlist-page';

/** A pasta da Wishlist (PLANO-WISHLIST.md, rodada 2): Filtrar, a ordem, a vista e as tags no recorte e na capa. */

const at = (d: number) => new Date(Date.UTC(2026, 10, d)).toISOString();
const wish = (id: string, name: string, extra: Partial<Wish> = {}): Wish => ({ id, kind: 'jogos', game: { name, coverUrl: null, source: 'manual' }, createdAt: at(1), updatedAt: at(1), ...extra });

describe('a pasta da Wishlist', () => {
  let host: HTMLElement;
  let store: ReviewStore;
  let fixture: ComponentFixture<WishlistPage>;

  /** As trocas passam pela transição de vista, que muda no quadro seguinte: espera os quadros também. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      TestBed.tick();
    }
  }
  async function mount(): Promise<void> {
    fixture = TestBed.createComponent(WishlistPage);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  }
  const shown = () => [...host.querySelectorAll<HTMLElement>('[data-ficha]')].map((x) => x.getAttribute('data-ficha'));
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent!.trim()) === label)!;
  const filterBtn = () => host.querySelector<HTMLButtonElement>('[aria-controls="cartela-desejos"]')!;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    TestBed.inject(Mural).kind.set('jogos');
    store = TestBed.inject(ReviewStore);
    const noop = () => undefined;
    const handlers: DeskHandlers = {
      newReview: noop, openReview: noop, newNote: noop, newNoteIn: noop, newWish: noop, newDraft: noop, openLoose: noop, closeReader: noop,
      editReview: noop, removeReview: noop, openDraft: noop, openWish: noop, removeDraft: noop, removeWish: noop,
    };
    TestBed.inject(Desk).register(handlers);
    store.saveWish(wish('w1', 'Celeste', { createdAt: at(3), tags: ['curto', 'história'], note: 'Indicação do Rafa' }));
    store.saveWish(wish('w2', 'Hades', { createdAt: at(5), tags: ['co-op'], relevance: 'later' }));
    store.saveWish(wish('w3', 'Outer Wilds', { createdAt: at(1), relevance: 'must' }));
  });

  afterEach(() => {
    host?.remove();
    localStorage.clear();
  });

  it('a ordem de sempre: MUST PLAY na frente, depois os que entraram há pouco, LATER no fim', async () => {
    localStorage.setItem(WISHLIST_PREFS_KEY, JSON.stringify({ vista: 'grade' }));
    await mount();
    expect(shown()).toEqual(['w3', 'w1', 'w2']);
  });

  it('MUST 1º desligado: só a ordem; o inverter e a ordem por nome; tudo guardado no aparelho', async () => {
    // na Grade, a ordem da tela é a da lista (a colagem reparte em colunas)
    localStorage.setItem(WISHLIST_PREFS_KEY, JSON.stringify({ vista: 'grade' }));
    await mount();
    button('MUST PLAY na frente').click();
    await settle();
    expect(shown()).toEqual(['w2', 'w1', 'w3']);
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Ordenar por"]')!;
    select.value = 'nome';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(shown()).toEqual(['w1', 'w2', 'w3']);
    host.querySelector<HTMLButtonElement>('[aria-label$="Inverter ordem"]')!.click();
    await settle();
    expect(shown()).toEqual(['w3', 'w2', 'w1']);
    expect(JSON.parse(localStorage.getItem(WISHLIST_PREFS_KEY)!)).toEqual({ vista: 'grade', ordem: 'nome', direcao: 'desc', vontadePrimeiro: false });
  });

  it('a vista guardada vale na volta: a Grade, com as capas e as tags embaixo', async () => {
    localStorage.setItem(WISHLIST_PREFS_KEY, JSON.stringify({ vista: 'grade', ordem: 'recentes', direcao: 'desc', vontadePrimeiro: true }));
    await mount();
    expect(host.querySelectorAll('app-wish-cover').length).toBe(3);
    expect(host.querySelector('app-wish-clip')).toBeNull();
    expect(button('Grade').getAttribute('aria-pressed')).toBe('true');
    const celeste = host.querySelector<HTMLElement>('app-wish-cover[data-ficha="w1"]')!;
    expect(celeste.querySelector('app-wish-tags')!.textContent).toContain('Tags: curto, história');
    button('Recortes').click();
    await settle();
    expect(host.querySelectorAll('app-wish-clip').length).toBe(3);
    // nos recortes, a legenda das tags fica embaixo do recorte, fora dele (não entorta com o papel)
    const box = host.querySelector<HTMLElement>('.desejo[data-ficha="w1"]')!;
    expect(box.querySelector(':scope > app-wish-tags')).not.toBeNull();
    expect(box.querySelector('app-wish-clip app-wish-tags')).toBeNull();
  });

  it('a cor da tag vem das configurações da Wishlist do mural; sem cor, só o contorno', async () => {
    const settings = TestBed.inject(Settings);
    settings.notesConfig.update((c) => ({ ...c, wishTagColors: { 'jogos|historia': 'azul' } }));
    await mount();
    const tags = [...host.querySelectorAll<HTMLElement>('.desejo[data-ficha="w1"] app-wish-tags .tag')];
    expect(tags.map((t) => t.textContent!.trim())).toEqual(['curto', 'história']);
    expect(tags[0].classList).toContain('sem-cor');
    expect(tags[1].classList).not.toContain('sem-cor');
    expect(tags[1].style.getPropertyValue('--t')).toMatch(/^#/);
  });

  it('Filtrar: a folha com a Vontade e as Tags; os ligados viram adesivos com X e o Pronto fecha', async () => {
    await mount();
    filterBtn().click();
    await settle();
    const card = host.querySelector<HTMLElement>('app-filter-card')!;
    expect(card.querySelector('.linha-titulo')!.textContent).toBe('Vontade');
    expect(card.textContent).toContain('3 recortes');
    const later = [...card.querySelectorAll<HTMLInputElement>('input[type=radio]')].find((r) => r.value === 'later')!;
    later.click();
    await settle();
    expect(shown()).toEqual(['w2']);
    expect(host.querySelector('.pasta .achados')!.textContent).toContain('Mostrando 1 de 3');
    expect(filterBtn().textContent).toContain('1');
    card.querySelector<HTMLButtonElement>('.pronto')!.click();
    await settle();
    expect(host.querySelector('app-filter-card')).toBeNull();
    // o adesivo do filtro ligado, com o X, solta a vontade
    host.querySelector<HTMLButtonElement>('app-filter-tags button')!.click();
    await settle();
    expect(shown().length).toBe(3);
  });

  it('as tags da folha: um toque mostra só as com ela; o botão direito esconde', async () => {
    localStorage.setItem(WISHLIST_PREFS_KEY, JSON.stringify({ vista: 'grade' }));
    await mount();
    filterBtn().click();
    await settle();
    const tag = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('app-filter-card .atalho')].find((b) => b.textContent!.includes(label))!;
    tag('co-op').click();
    await settle();
    expect(shown()).toEqual(['w2']);
    tag('co-op').click();
    await settle();
    tag('curto').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settle();
    expect(shown()).toEqual(['w3', 'w2']);
  });

  it('a busca acha pelo lembrete, e sem nada achado diz onde procurou', async () => {
    await mount();
    const input = host.querySelector<HTMLInputElement>('#busca-desejos')!;
    input.value = 'rafa';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(shown()).toEqual(['w1']);
    input.value = 'zelda';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(host.querySelector('.none')!.textContent).toContain('no nome ou no lembrete');
  });

  it('abrir a página não grava nada: a vista só vai para o aparelho quando muda', async () => {
    await mount();
    expect(localStorage.getItem(WISHLIST_PREFS_KEY)).toBeNull();
    button('Grade').click();
    await settle();
    expect(JSON.parse(localStorage.getItem(WISHLIST_PREFS_KEY)!).vista).toBe('grade');
  });

  it('trocar de mural começa sem a busca e sem os filtros do outro', async () => {
    store.saveWish({ ...wish('l1', 'Duna'), kind: 'livros' });
    await mount();
    filterBtn().click();
    await settle();
    [...host.querySelectorAll<HTMLInputElement>('app-filter-card input[type=radio]')].find((r) => r.value === 'later')!.click();
    await settle();
    TestBed.inject(Mural).kind.set('livros');
    await settle();
    expect(shown()).toEqual(['l1']);
    expect(host.querySelector('app-filter-card')).toBeNull();
    expect(host.querySelector('app-filter-tags')).toBeNull();
  });

  it('a tag ligada que nenhum desejo tem mais continua no adesivo, para dar para desligar', async () => {
    localStorage.setItem(WISHLIST_PREFS_KEY, JSON.stringify({ vista: 'grade' }));
    await mount();
    filterBtn().click();
    await settle();
    [...host.querySelectorAll<HTMLButtonElement>('app-filter-card .atalho')].find((b) => b.textContent!.includes('co-op'))!.click();
    await settle();
    store.updateWish('w2', { tags: [] });
    await settle();
    expect(shown()).toEqual([]);
    const chip = host.querySelector<HTMLElement>('app-filter-tags')!;
    expect(chip.textContent).toContain('#co-op');
    chip.querySelector<HTMLButtonElement>('button')!.click();
    await settle();
    expect(shown().length).toBe(3);
  });

  it('a margem da capa não usa a classe global .papel (a da cartolina, que mistura as camadas)', async () => {
    localStorage.setItem(WISHLIST_PREFS_KEY, JSON.stringify({ vista: 'grade' }));
    await mount();
    const cover = host.querySelector<HTMLElement>('app-wish-cover')!;
    expect(cover.querySelector('.papel')).toBeNull();
    expect(getComputedStyle(cover.querySelector('.margem')!).backgroundBlendMode).not.toContain('hard-light');
  });
});
