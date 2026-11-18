import { SPEECH } from '../core/voz';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SHARED_AUTO } from '../core/shared-store';
import { ReviewReader } from './review-reader';
import { Toasts } from './toast';

/**
 * Duas anotações lado a lado (PLANO-DUAS-NOTAS.md): a segunda é a mesma leitura, no modo ao lado, dentro da
 * primeira. Editar, fechar, só a cartolina ou a tela cheia de uma fecha a outra; finalizar a segunda (ela sai
 * do mural) fecha só ela.
 */

class MemoryData {
  private readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {
    /* sem outras abas */
  }
  takeForeign(): null {
    return null;
  }
}

const N = String.fromCharCode(10);
const LONG = Array.from({ length: 60 }, (_, i) => `Linha ${i + 1} do texto comprido.`).join(N + N);

function note(id: string, name: string, extra: Partial<Review> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    text: '- [ ] Pão' + N + '- [x] Leite',
    completedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  })!;
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('Duas anotações lado a lado (ReviewReader, PLANO-DUAS-NOTAS.md)', () => {
  let fixture: ComponentFixture<ReviewReader>;
  let reader: ReviewReader;
  let el: HTMLElement;
  let store: ReviewStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SPEECH, useValue: null },
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: SHARED_AUTO, useValue: false },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        { provide: CloudAccount, useValue: { account: signal(null), signedIn: signal(false), request: async () => ({}) } },
      ],
    });
    fixture = TestBed.createComponent(ReviewReader);
    reader = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    store = TestBed.inject(ReviewStore);
    store.add(note('nota-a', 'Receita de pão', { text: LONG }));
    store.add(note('nota-b', 'Cronograma', { text: LONG }));
    store.add(note('nota-c', 'Curta'));
  });

  afterEach(() => {
    el.querySelector('dialog')?.close();
    localStorage.clear();
  });

  const outer = () => el.querySelector<HTMLDialogElement>('dialog.reader:not(.ao-lado)')!;
  const beside = () => el.querySelector<HTMLDialogElement>('dialog.reader.ao-lado');
  const nameOf = (root: Element | null) => root?.querySelector('.par > article h2')?.textContent?.trim();

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await wait(20);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function both(a = 'nota-a', b = 'nota-b'): Promise<void> {
    reader.open(store.get(a)!);
    await settle();
    reader.openBeside(store.get(b)!);
    await settle();
  }

  const click = async (sel: string, root: ParentNode = el) => {
    const b = root.querySelector<HTMLElement>(sel);
    expect(b).withContext(sel).not.toBeNull();
    b!.click();
    await settle();
  };

  it('a segunda abre à direita, dentro da primeira: um diálogo aberto sem ser modal, com os ids dela e o foco no nome', async () => {
    await both();
    expect(outer().open).toBeTrue();
    expect(outer().classList).toContain('dupla');
    const b = beside();
    expect(b?.open).toBeTrue();
    // no fluxo do diálogo de fora: não é modal
    expect(b!.matches(':modal')).toBeFalse();
    expect(nameOf(outer())).toBe('Receita de pão');
    expect(nameOf(b)).toBe('Cronograma');
    expect(b!.querySelector('h2')!.id).toBe('leitura-titulo-2');
    expect(b!.getAttribute('aria-labelledby')).toBe('leitura-titulo-2');
    expect(outer().getAttribute('aria-labelledby')).toBe('leitura-titulo');
    expect(document.querySelectorAll('#leitura-titulo').length).toBe(1);
    expect(document.activeElement?.id).toBe('leitura-titulo-2');
  });

  it('não abre a mesma ao lado dela, nem fora da leitura de sempre', async () => {
    reader.open(store.get('nota-a')!);
    await settle();
    reader.openBeside(store.get('nota-a')!);
    await settle();
    expect(beside()).toBeNull();
    await click('.faixa-nome .ler-tela-cheia');
    reader.openBeside(store.get('nota-b')!);
    await settle();
    expect(beside()).toBeNull();
  });

  it('o X da segunda fecha as duas (o pedido: fechar uma fecha a outra)', async () => {
    await both();
    // o X diz o que faz, nas duas
    expect(beside()!.querySelector('.faixa-nome .fecha')!.getAttribute('aria-label')).toBe('Fechar as duas');
    expect(outer().querySelector(':scope > .par .faixa-nome .fecha')!.getAttribute('title')).toBe('Fechar as duas');
    await click('.faixa-nome .fecha', beside()!);
    expect(outer().open).toBeFalse();
    expect(beside()).toBeNull();
  });

  describe('com a conta aberta (os comentários)', () => {
    type Inner = { toggleComments(open?: boolean): void; picked: { set(v: unknown): void }; quoteSelection(): void };
    type Outer = { ladoB(): Inner | undefined; commentsOpen(): boolean; quote(): { text: string } | null };
    beforeEach(() => {
      spyOn(window, 'fetch').and.callFake(async () => new Response('', { status: 404 }));
      const account = TestBed.inject(CloudAccount) as unknown as { signedIn: { set(v: boolean): void }; account: { set(v: unknown): void } };
      account.signedIn.set(true);
      account.account.set({ id: 'u1', codigo: 'ABCDEF', nome: 'Eu' });
    });

    it('abrir os comentários na segunda: ela fica sozinha, com a folha aberta', async () => {
      await both();
      (reader as unknown as Outer).ladoB()!.toggleComments(true);
      await settle();
      expect(beside()).toBeNull();
      expect(nameOf(outer())).toBe('Cronograma');
      expect((reader as unknown as Outer).commentsOpen()).toBeTrue();
    });

    it('citar um trecho da segunda: ela fica sozinha, com o trecho na folha de comentários', async () => {
      await both();
      const inner = (reader as unknown as Outer).ladoB()!;
      inner.picked.set({ text: 'Linha 3 do texto comprido.', left: 0, top: 0 });
      inner.quoteSelection();
      await settle();
      expect(beside()).toBeNull();
      expect(nameOf(outer())).toBe('Cronograma');
      expect((reader as unknown as Outer).commentsOpen()).toBeTrue();
      expect((reader as unknown as Outer).quote()?.text).toBe('Linha 3 do texto comprido.');
    });
  });

  it('o toque no vão entre as duas não fecha a leitura (o vão é da segunda)', async () => {
    await both();
    const b = beside()!;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(outer().open).toBeTrue();
    expect(beside()?.open).toBeTrue();
  });

  it('finalizar a segunda não deixa um Desfazer escondido por baixo da primeira', async () => {
    await both('nota-a', 'nota-c');
    const toasts = TestBed.inject(Toasts);
    const shown = spyOn(toasts, 'show').and.callThrough();
    await click('.foot .finalizar', beside()!);
    expect(shown).not.toHaveBeenCalled();
  });

  it('o X da primeira também fecha as duas, e abrir de novo é com uma só', async () => {
    await both();
    await click(':scope > .par .faixa-nome .fecha', outer());
    expect(outer().open).toBeFalse();
    reader.open(store.get('nota-c')!);
    await settle();
    expect(beside()).toBeNull();
    expect(outer().classList).not.toContain('dupla');
  });

  it('Editar na segunda pede o editor dela (quem usa fecha a leitura)', async () => {
    await both();
    const asked: string[] = [];
    reader.edit.subscribe((id) => asked.push(id));
    const edit = [...beside()!.querySelectorAll<HTMLButtonElement>('.foot .btn-ink')].find((x) => x.textContent?.includes('Editar'))!;
    edit.click();
    await settle();
    expect(asked).toEqual(['nota-b']);
  });

  it('a tela cheia na segunda: ela fica sozinha, em tela cheia, no mesmo trecho, com o foco no botão', async () => {
    await both();
    const bodyB = beside()!.querySelector<HTMLElement>('.par > article > .body')!;
    bodyB.scrollTop = 600;
    const top = bodyB.getBoundingClientRect().top;
    const atTop = [...bodyB.querySelectorAll<HTMLElement>('.text .linha')].find((x) => x.textContent?.trim() && x.getBoundingClientRect().bottom > top + 1)!.textContent;
    await click('.faixa-nome .ler-tela-cheia', beside()!);
    await wait(50);
    expect(beside()).toBeNull();
    expect(outer().classList).toContain('tela-cheia');
    expect(outer().classList).not.toContain('dupla');
    expect(nameOf(outer())).toBe('Cronograma');
    const body = outer().querySelector<HTMLElement>('.par > article > .body')!;
    // a mesma linha no alto da folha (na outra largura e escala, a conta das linhas inteiras pode cair uma acima)
    const t = body.getBoundingClientRect().top;
    const same = [...body.querySelectorAll<HTMLElement>('.text .linha')].find((x) => x.textContent === atTop)!;
    const line = same.getBoundingClientRect().height || 30;
    expect(body.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(same.getBoundingClientRect().top - t)).toBeLessThan(2.5 * line);
    expect(document.activeElement?.classList).toContain('ler-tela-cheia');
  });

  it('só a cartolina na segunda: ela fica sozinha, na cartolina', async () => {
    await both();
    await click('.faixa-nome .ver-cartolina', beside()!);
    expect(beside()).toBeNull();
    expect(outer().classList).toContain('so-a-cartolina');
    expect(outer().querySelector('.cartolina-grande app-review-card')?.textContent).toContain('Cronograma');
  });

  it('a primeira mudando de jeito (cartolina, tela cheia) fecha a segunda', async () => {
    await both();
    await click(':scope > .par .faixa-nome .ver-cartolina', outer());
    expect(beside()).toBeNull();
    expect(outer().classList).toContain('so-a-cartolina');
    expect(nameOf(outer())).toBe('Receita de pão');
    await click('.na-parede .ver-cartolina');
    reader.openBeside(store.get('nota-b')!);
    await settle();
    await click(':scope > .par .faixa-nome .ler-tela-cheia', outer());
    expect(beside()).toBeNull();
    expect(outer().classList).toContain('tela-cheia');
  });

  it('finalizar a segunda fecha só ela: a primeira fica, com o foco no nome', async () => {
    await both('nota-a', 'nota-c');
    await click('.foot .finalizar', beside()!);
    await wait(30);
    fixture.detectChanges();
    expect(store.get('nota-c')?.doneAt).toBeTruthy();
    expect(beside()).toBeNull();
    expect(outer().open).toBeTrue();
    expect(nameOf(outer())).toBe('Receita de pão');
    expect(document.activeElement?.id).toBe('leitura-titulo');
  });

  it('o link no texto da segunda abre ali mesmo, com o Voltar, e a primeira não muda', async () => {
    store.add(note('nota-d', 'Com link', { text: 'Veja [[Curta]].' }));
    await both('nota-a', 'nota-d');
    const link = beside()!.querySelector<HTMLElement>('.text .elo[role=link]');
    expect(link).withContext('o link no texto').not.toBeNull();
    link!.click();
    await settle();
    expect(nameOf(beside())).toBe('Curta');
    expect(beside()!.querySelector('.voltar-elo')).not.toBeNull();
    expect(nameOf(outer())).toBe('Receita de pão');
  });

  it('as teclas da segunda não viram as páginas da primeira', async () => {
    await both();
    const key = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    beside()!.querySelector('h2')!.dispatchEvent(key);
    // nenhuma das duas tem vezes: só não pode dar erro nem trocar a primeira
    expect(nameOf(outer())).toBe('Receita de pão');
  });

  // ===== o "+" e o seletor (feature 2) =====
  const ear = () => outer().querySelector<HTMLButtonElement>(':scope > .par .orelha.abrir-ao-lado');
  const fits = (yes: boolean) => spyOn(reader as unknown as { fitsBeside(): boolean }, 'fitsBeside').and.returnValue(yes);

  async function pickFromEar(name: string): Promise<void> {
    ear()!.click();
    await settle();
    await wait(50);
    await settle();
    const item = [...document.querySelectorAll<HTMLButtonElement>('app-card-picker .escolha')].find((b) => b.textContent?.includes(name));
    expect(item).withContext('no seletor: ' + name).toBeDefined();
    item!.click();
    await settle();
  }

  it('o "+" é um marcador da ficha: só numa anotação, na leitura de sempre, e some com duas abertas', async () => {
    reader.open(store.get('nota-a')!);
    await settle();
    expect(ear()).not.toBeNull();
    expect(ear()!.getAttribute('aria-label')).toBe('Abrir outra anotação ao lado');
    expect(ear()!.getAttribute('aria-haspopup')).toBe('dialog');
    expect(ear()!.classList).toContain('cartolina');
    await click('.faixa-nome .ler-tela-cheia');
    expect(ear()).toBeNull();
    await click('.faixa-nome .ler-tela-cheia');
    reader.openBeside(store.get('nota-b')!);
    await settle();
    expect(ear()).toBeNull();
    expect(beside()!.querySelector('.orelha.abrir-ao-lado')).toBeNull();
  });

  it('a resenha não tem o "+" (ela tem o Lado a lado dela)', async () => {
    store.add(sanitizeReview({ id: 'jogo-1', kind: 'jogos', game: { name: 'Hollow Knight', coverUrl: null, source: 'manual' }, scores: { diversao: 9, historia: 8, jogabilidade: 9, visual: 8 }, status: 'finalizado', text: 'Bom.', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })!);
    reader.open(store.get('jogo-1')!);
    await settle();
    expect(ear()).toBeNull();
  });

  it('o "+" abre o Escolher a nota de sempre, só com as outras anotações, e a escolhida abre ao lado', async () => {
    fits(true);
    store.add(sanitizeReview({ id: 'jogo-1', kind: 'jogos', game: { name: 'Hollow Knight', coverUrl: null, source: 'manual' }, scores: { diversao: 9, historia: 8, jogabilidade: 9, visual: 8 }, status: 'finalizado', text: 'Bom.', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })!);
    reader.open(store.get('nota-a')!);
    await settle();
    ear()!.click();
    await settle();
    await wait(50);
    await settle();
    expect(document.querySelector('app-card-picker h2')?.textContent?.trim()).toBe('Abrir ao lado');
    const names = [...document.querySelectorAll('app-card-picker .escolha .nome')].map((n) => n.textContent!.trim()).sort();
    expect(names).toEqual(['Cronograma', 'Curta']);
    const item = [...document.querySelectorAll<HTMLButtonElement>('app-card-picker .escolha')].find((b) => b.textContent?.includes('Curta'))!;
    item.click();
    await settle();
    expect(nameOf(beside())).toBe('Curta');
    expect(nameOf(outer())).toBe('Receita de pão');
  });

  it('escolhida quando já não cabem duas (a tela estreitou), ela abre no lugar desta, com o Voltar', async () => {
    fits(false);
    reader.open(store.get('nota-a')!);
    await settle();
    await pickFromEar('Curta');
    expect(beside()).toBeNull();
    expect(nameOf(outer())).toBe('Curta');
    expect(outer().querySelector('.voltar-elo')).not.toBeNull();
  });

  it('na de outra pessoa sem outra anotação à mostra, o "+" não aparece (o seletor abriria vazio)', async () => {
    const sozinha = note('dela-9', 'Só esta');
    reader.open(sozinha, 'Ana', [sozinha], false, 'ANA123');
    await settle();
    expect(ear()).toBeNull();
  });

  it('na visita, o "+" mostra as anotações que a pessoa publicou (não as suas), e a segunda é dela', async () => {
    fits(true);
    const dela = [note('dela-1', 'Diário da viagem'), note('dela-2', 'Roteiro do Japão'), note('dela-3', 'Lista de malas')];
    reader.open(dela[0], 'Ana', dela, false, 'ANA123');
    await settle();
    ear()!.click();
    await settle();
    await wait(50);
    await settle();
    const names = [...document.querySelectorAll('app-card-picker .escolha .nome')].map((n) => n.textContent!.trim()).sort();
    expect(names).toEqual(['Lista de malas', 'Roteiro do Japão']);
    [...document.querySelectorAll<HTMLButtonElement>('app-card-picker .escolha')].find((b) => b.textContent?.includes('Roteiro'))!.click();
    await settle();
    expect(nameOf(beside())).toBe('Roteiro do Japão');
    // de outra pessoa: só lê (sem o Editar nem o Finalizar), como a primeira
    expect(beside()!.querySelector('.foot .finalizar')).toBeNull();
    expect(beside()!.querySelector('.foot')?.textContent).toContain('Anotação de Ana');
  });
});
