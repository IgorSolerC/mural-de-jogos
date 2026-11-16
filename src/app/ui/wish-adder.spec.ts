import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Desk, DeskHandlers } from '../core/desk';
import { wishTagKey } from '../core/mural-config';
import { Mural } from '../core/mural';
import { Wish } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { Toasts } from './toast';
import { WishAdder } from './wish-adder';
import { WishFolders } from '../core/wish-folders';
import { comMarkdown } from '../testing/writing-mode.spec';
import { Confirm } from './confirm';

/** O "Editar recorte" (PLANO-WISHLIST.md, rodada 4): a folha do "Pôr na wishlist" aberta com um desejo. */

const at = (d: number) => new Date(Date.UTC(2026, 10, d)).toISOString();
const wish = (id: string, name: string, extra: Partial<Wish> = {}): Wish => ({ id, kind: 'jogos', game: { name, coverUrl: null, source: 'manual' }, createdAt: at(1), updatedAt: at(1), ...extra });

describe('a folha do desejo: editar sem resenhar', () => {
  comMarkdown();
  let fixture: ComponentFixture<WishAdder>;
  let host: HTMLElement;
  let store: ReviewStore;
  let calls: string[];

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      TestBed.tick();
    }
  }
  const adder = () => fixture.componentInstance;
  const dialog = () => host.querySelector<HTMLDialogElement>('dialog')!;
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label);
  const noteField = () => host.querySelector<HTMLTextAreaElement>('.descricao app-rich-editor textarea');
  /** Abre a parte da etiqueta (se já não está aberta). */
  async function part(id: string): Promise<void> {
    const b = host.querySelector<HTMLButtonElement>(`.prop[data-prop="${id}"]`)!;
    if (b.getAttribute('aria-expanded') !== 'true') b.click();
    await settle();
  }
  const tagOn = () => [...host.querySelectorAll<HTMLButtonElement>('app-tag-picker .op[aria-pressed="true"]')].map((b) => b.querySelector('app-note-tag')!.textContent!.trim());
  async function write(text: string): Promise<void> {
    noteField()!.value = text;
    noteField()!.dispatchEvent(new Event('input'));
    await settle();
  }
  async function newTag(text: string): Promise<void> {
    await part('tags');
    const field = host.querySelector<HTMLInputElement>('app-tag-picker input')!;
    field.value = text;
    field.dispatchEvent(new Event('input'));
    await settle();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
  }

  beforeEach(async () => {
    localStorage.clear();
    calls = [];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    TestBed.inject(Mural).kind.set('jogos');
    store = TestBed.inject(ReviewStore);
    const noop = () => undefined;
    const handlers: DeskHandlers = {
      newReview: noop, newNote: noop, newNoteIn: noop, newWish: noop, newDraft: noop, openLoose: noop, closeReader: noop, openReview: noop,
      editReview: noop, removeReview: noop, openDraft: noop, removeDraft: noop, editWish: noop,
      openWish: (id) => void calls.push(`openWish:${id}:${store.getWish(id)?.note ?? ''}`),
      removeWish: (id) => void calls.push(`removeWish:${id}`),
    };
    TestBed.inject(Desk).register(handlers);
    store.saveWish(wish('w1', 'Celeste', { tags: ['curto'], note: 'Indicação do Rafa', relevance: 'must' }));
    store.saveWish(wish('w2', 'Hades', { tags: ['co-op', 'curto'] }));
    fixture = TestBed.createComponent(WishAdder);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  });

  afterEach(() => {
    if (dialog()?.open) dialog().close();
    host?.remove();
    TestBed.inject(Toasts).dismiss();
    localStorage.clear();
  });

  it('abre com o desejo: o título, o recorte de verdade (sem "Outro recorte"), a vontade, as tags e a descrição', async () => {
    adder().edit(store.getWish('w1')!);
    await settle();
    expect(dialog().open).toBeTrue();
    expect(host.querySelector('h2')!.textContent!.trim()).toBe('Editar recorte');
    expect(button('Outro recorte')).toBeUndefined();
    expect(host.querySelector('app-wish-clip')).not.toBeNull();
    // as etiquetas dizem o que está escolhido
    expect(host.querySelector('.prop[data-prop="vontade"] app-relevance-sticker')).not.toBeNull();
    expect(host.querySelector('.prop[data-prop="tags"]')!.getAttribute('aria-label')).toBe('Tags: curto');
    await part('vontade');
    expect(host.querySelector<HTMLInputElement>('input[name="desejo-vontade"][aria-label="MUST PLAY"]')!.checked).toBeTrue();
    await part('tags');
    expect(tagOn()).toEqual(['curto']);
    expect(noteField()!.value).toBe('Indicação do Rafa');
    // as tags da Wishlist do mural, sem a estrela das anotações
    expect(host.querySelector('app-tag-picker .estrela')).toBeNull();
    expect(host.querySelector('.ti-nome')!.textContent).toContain('Celeste');
    expect(button('Tirar da wishlist')).toBeDefined();
    expect(button('Começar a resenha')).toBeDefined();
  });

  it('o Desfazer do Salvar volta só o que ele mudou; o foco da Vontade vai para a escolhida', async () => {
    adder().edit(store.getWish('w1')!);
    await settle();
    await part('vontade');
    expect(document.activeElement).toBe(host.querySelector('input[name="desejo-vontade"][aria-label="MUST PLAY"]'));
    await write('Outra descrição');
    button('Salvar')!.click();
    await settle();
    const undo = TestBed.inject(Toasts).current()!.action!.run;
    // no meio, a vontade mudou pelo botão (e uma tag chegou de outro aparelho)
    store.updateWish('w1', { relevance: 'later', tags: ['curto', 'presente'] });
    undo();
    await settle();
    const w = store.getWish('w1')!;
    expect(w.note).toBe('Indicação do Rafa');
    expect(w.relevance).toBe('later');
    expect(w.tags).toEqual(['curto', 'presente']);
  });

  it('Salvar muda numa gravação só, mantém o id e a data de entrada, e o Desfazer volta como estava', async () => {
    adder().edit(store.getWish('w1')!);
    await settle();
    await write('  Ver o trailer de novo  ');
    await newTag('co-op');
    await part('vontade');
    host.querySelector<HTMLInputElement>('input[name="desejo-vontade"][aria-label="LATER"]')!.click();
    await settle();
    button('Salvar')!.click();
    await settle();
    expect(dialog().open).toBeFalse();
    const w = store.getWish('w1')!;
    expect(w.note).toBe('Ver o trailer de novo');
    expect(w.tags).toEqual(['curto', 'co-op']);
    expect(w.relevance).toBe('later');
    expect(w.createdAt).toBe(at(1));
    expect(w.updatedAt).not.toBe(at(1));
    expect(store.wishes().length).toBe(2);
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('“Celeste” mudou na wishlist');
    toast.action!.run();
    await settle();
    const back = store.getWish('w1')!;
    expect(back.note).toBe('Indicação do Rafa');
    expect(back.tags).toEqual(['curto']);
    expect(back.relevance).toBe('must');
  });

  it('apagar o lembrete e as tags tira os campos; sem nada mudado, Salvar só fecha (sem aviso, sem data nova)', async () => {
    adder().edit(store.getWish('w2')!);
    await settle();
    button('Salvar')!.click();
    await settle();
    expect(TestBed.inject(Toasts).current()).toBeNull();
    expect(store.getWish('w2')!.updatedAt).toBe(at(1));
    adder().edit(store.getWish('w1')!);
    await settle();
    await write('   ');
    await part('tags');
    host.querySelector<HTMLButtonElement>('app-tag-picker .op[aria-pressed="true"]')!.click();
    await settle();
    button('Salvar')!.click();
    await settle();
    const w = store.getWish('w1')!;
    expect('note' in w).toBeFalse();
    expect('tags' in w).toBeFalse();
  });

  it('fechar com algo mudado pergunta antes de descartar; sem nada mudado, fecha direto', async () => {
    const confirm = TestBed.inject(Confirm);
    adder().edit(store.getWish('w1')!);
    await settle();
    host.querySelector<HTMLButtonElement>('.fechar')!.click();
    await settle();
    expect(confirm.current()).toBeNull();
    expect(dialog().open).toBeFalse();
    adder().edit(store.getWish('w1')!);
    await settle();
    await write('Mudei a descrição');
    // o Esc da folha (o cancel do diálogo) também pergunta
    const esc = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(esc);
    await settle();
    expect(esc.defaultPrevented).toBeTrue();
    expect(confirm.current()!.title).toBe('Descartar o que você mudou?');
    confirm.current()!.resolve(null);
    await settle();
    expect(dialog().open).toBeTrue();
    expect(noteField()!.value).toBe('Mudei a descrição');
    host.querySelector<HTMLButtonElement>('.fechar')!.click();
    await settle();
    confirm.current()!.resolve('confirm');
    await settle();
    expect(dialog().open).toBeFalse();
    expect(store.getWish('w1')!.note).toBe('Indicação do Rafa');
  });

  it('pôr é a mesma folha de editar, com tudo à vista desde o começo; a Capa espera o item; Esc fecha só a parte', async () => {
    adder().open();
    await settle();
    expect(host.querySelector('h2')!.textContent!.trim()).toBe('Pôr na wishlist');
    expect([...host.querySelectorAll('.prop')].map((b) => b.getAttribute('data-prop'))).toEqual(['vontade', 'tags', 'pasta', 'capa']);
    expect(host.querySelector<HTMLButtonElement>('.prop[data-prop="capa"]')!.disabled).toBeTrue();
    expect(noteField()).not.toBeNull();
    // a descrição e as tags escritas antes de escolher o item ficam
    await write('Vi no trailer da Nintendo');
    await newTag('plataforma');
    const part0 = host.querySelector<HTMLElement>('#desejo-parte')!;
    part0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    expect(host.querySelector('#desejo-parte')).toBeNull();
    expect(dialog().open).toBeTrue();
    (adder() as unknown as { pick(g: Wish['game']): void }).pick({ name: 'Hollow Knight', coverUrl: null, source: 'manual' });
    await settle();
    expect(host.querySelector<HTMLButtonElement>('.prop[data-prop="capa"]')!.disabled).toBeFalse();
    button('Pôr na lista')!.click();
    await settle();
    const w = store.wishes().find((x) => x.game.name === 'Hollow Knight')!;
    expect(w.note).toBe('Vi no trailer da Nintendo');
    expect(w.tags).toEqual(['plataforma']);
  });

  it('trocar para um item que já é outro desejo: o aviso, e o Salvar não fecha nem perde o que foi escrito', async () => {
    adder().edit(store.getWish('w1')!);
    await settle();
    await write('Não perder isto');
    (adder() as unknown as { pick(g: Wish['game']): void }).pick({ name: 'Hades', coverUrl: null, source: 'manual' });
    await settle();
    expect(host.querySelector('.aviso')!.textContent).toContain('troque o item para salvar');
    let seen = '';
    adder().seen.subscribe((id) => (seen = id));
    button('Salvar')!.click();
    await settle();
    expect(seen).toBe('');
    expect(dialog().open).toBeTrue();
    expect(document.activeElement).toBe(button('Trocar')!);
    expect(noteField()!.value).toBe('Não perder isto');
    expect(store.getWish('w1')!.game.name).toBe('Celeste');
  });

  it('Salvar só grava o que mudou na folha: o que chegou de outro aparelho enquanto ela estava aberta fica', async () => {
    let saved = 0;
    adder().edit(store.getWish('w1')!, { saved: () => saved++ });
    await settle();
    // de outro aparelho: uma tag nova e o LATER
    store.updateWish('w1', { tags: ['curto', 'presente'], relevance: 'later' });
    await write('Só o lembrete');
    button('Salvar')!.click();
    await settle();
    const w = store.getWish('w1')!;
    expect(w.note).toBe('Só o lembrete');
    expect(w.tags).toEqual(['curto', 'presente']);
    expect(w.relevance).toBe('later');
    // a página é avisada (o foco vai atrás do recorte, que pode ter mudado de lugar)
    expect(saved).toBe(1);
  });

  it('a cor sorteada da tag nova só vai para as configurações ao salvar, e só a das tags que ficaram', async () => {
    const colors = () => TestBed.inject(Settings).notesConfig().wishTagColors;
    adder().edit(store.getWish('w1')!);
    await settle();
    await newTag('Explorar');
    // a cor já aparece na folha
    expect(host.querySelector<HTMLElement>('app-tag-picker .op[aria-pressed="true"] app-note-tag')).not.toBeNull();
    button('Cancelar')?.click();
    host.querySelector<HTMLButtonElement>('.fechar')!.click();
    await settle();
    // a tag nova é coisa mudada: a pergunta de descartar, e descarta
    TestBed.inject(Confirm).current()!.resolve('confirm');
    await settle();
    expect(colors()[wishTagKey('jogos', 'Explorar')]).toBeUndefined();
    adder().edit(store.getWish('w1')!);
    await settle();
    await newTag('Explorar');
    await newTag('Exploração');
    // desmarca a com erro
    [...host.querySelectorAll<HTMLButtonElement>('app-tag-picker .op[aria-pressed="true"]')].find((b) => b.textContent!.includes('Explorar'))!.click();
    await settle();
    button('Salvar')!.click();
    await settle();
    expect(colors()[wishTagKey('jogos', 'Explorar')]).toBeUndefined();
    expect(colors()[wishTagKey('jogos', 'Exploração')]).toBeDefined();
  });

  it('Começar a resenha guarda o que mudou e abre o editor; Tirar da wishlist usa o tirar de quem abriu', async () => {
    adder().edit(store.getWish('w1')!);
    await settle();
    await write('Comprar na promoção');
    button('Começar a resenha')!.click();
    await settle();
    expect(dialog().open).toBeFalse();
    expect(calls).toEqual(['openWish:w1:Comprar na promoção']);
    let removed = false;
    adder().edit(store.getWish('w2')!, { remove: () => (removed = true) });
    await settle();
    button('Tirar da wishlist')!.click();
    await settle();
    expect(removed).toBeTrue();
    expect(dialog().open).toBeFalse();
    // sem quem abriu: o Tirar da mesa (com o Desfazer dele)
    adder().edit(store.getWish('w2')!);
    await settle();
    button('Tirar da wishlist')!.click();
    expect(calls).toContain('removeWish:w2');
  });

  it('a Pasta: o novo nasce na pasta aberta na Wishlist; editar troca, e o Criar faz a pasta na hora', async () => {
    const folders = TestBed.inject(WishFolders);
    const coop = folders.create('jogos', null, 'Co-op')!.id;
    folders.open.set({ kind: 'jogos', id: coop });
    adder().open();
    await settle();
    (adder() as unknown as { pick(g: Wish['game']): void }).pick({ name: 'Unravel', coverUrl: null, source: 'manual' });
    await settle();
    expect(host.querySelector('.prop[data-prop="pasta"]')!.textContent).toContain('Co-op');
    await part('pasta');
    expect(host.querySelector('#desejo-parte [role="radio"][aria-checked="true"]')!.textContent).toContain('Co-op');
    button('Pôr na lista')!.click();
    await settle();
    expect(store.wishes().find((w) => w.game.name === 'Unravel')!.folder).toBe(coop);
    // a pasta aberta de outro mural não vale
    folders.open.set({ kind: 'livros', id: coop });
    adder().edit(store.getWish('w1')!);
    await settle();
    await part('pasta');
    expect(host.querySelector('#desejo-parte [role="radio"][aria-checked="true"]')!.textContent).toContain('Sem pasta');
    const field = host.querySelector<HTMLInputElement>('#desejo-parte input')!;
    field.value = 'Curtinhos';
    field.dispatchEvent(new Event('input'));
    await settle();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    button('Salvar')!.click();
    await settle();
    const made = folders.tree().kids('desejos:jogos', null).find((f) => f.name === 'Curtinhos')!;
    expect(store.getWish('w1')!.folder).toBe(made.id);
  });

  it('o Pôr na wishlist ganha as tags (a nova com uma cor da Wishlist do mural) e o lembrete; o Pra depois, não', async () => {
    adder().open();
    await settle();
    expect(host.querySelector('h2')!.textContent!.trim()).toBe('Pôr na wishlist');
    (adder() as unknown as { pick(g: Wish['game']): void }).pick({ name: 'Outer Wilds', coverUrl: null, source: 'manual' });
    await settle();
    await newTag('Exploração');
    await write('Sem spoiler!');
    button('Pôr na lista')!.click();
    await settle();
    const w = store.wishes().find((x) => x.game.name === 'Outer Wilds')!;
    expect(w.tags).toEqual(['Exploração']);
    expect(w.note).toBe('Sem spoiler!');
    const settings = TestBed.inject(Settings);
    expect(settings.notesConfig().wishTagColors[wishTagKey('jogos', 'Exploração')]).toBeDefined();
    // a cor das tags das anotações não muda
    expect(Object.keys(settings.categoryLooks()).length).toBe(0);
    adder().open('draft');
    await settle();
    (adder() as unknown as { pick(g: Wish['game']): void }).pick({ name: 'Tunic', coverUrl: null, source: 'manual' });
    await settle();
    expect(host.querySelector('app-tag-picker')).toBeNull();
    expect(noteField()).toBeNull();
  });
});
