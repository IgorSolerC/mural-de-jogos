import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DRAFTS_DB, PixelDraft, PixelDrafts, STASH_PREFIX, draftKey } from '../../core/pixel-drafts';
import { WidgetValues } from '../../core/widgets';
import { Confirm } from '../confirm';
import { Toasts } from '../toast';
import { DraftTarget, PixelStudio, StudioResult } from './pixel-studio';
import { offerUndoDiscard } from './draft-ask';

/** O rascunho que o ateliê guarda neste aparelho (PLANO-RASCUNHOS-PIXEL.md, rodada 2): nada se perde, nem descartando. */
describe('pixel art: o rascunho do ateliê', () => {
  let fixture: ComponentFixture<PixelStudio>;
  let host: HTMLElement;
  let confirm: Confirm;
  let drafts: PixelDrafts;
  let saved: StudioResult[];
  let copied: StudioResult[];
  let discarded: PixelDraft[];
  let closed: number;
  const START: WidgetValues = { width: '2', height: '1', pixels: '1', palette: 'classica', colors: '' };
  const OBRA: DraftTarget = { origin: { kind: 'obra', id: 'gato1234' }, title: 'Gato' };

  async function wipe(): Promise<void> {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DRAFTS_DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }

  async function make(opts: { draft?: DraftTarget | null; resume?: PixelDraft; copy?: boolean; values?: WidgetValues } = {}): Promise<void> {
    TestBed.configureTestingModule({ imports: [PixelStudio], providers: [provideZonelessChangeDetection()] });
    confirm = TestBed.inject(Confirm);
    drafts = TestBed.inject(PixelDrafts);
    await drafts.ready;
    fixture = TestBed.createComponent(PixelStudio);
    fixture.componentRef.setInput('values', opts.values ?? START);
    fixture.componentRef.setInput('draft', opts.draft === undefined ? OBRA : opts.draft);
    if (opts.resume) fixture.componentRef.setInput('resume', opts.resume);
    if (opts.copy) fixture.componentRef.setInput('copy', true);
    saved = [];
    copied = [];
    discarded = [];
    closed = 0;
    const c = fixture.componentInstance;
    c.saved.subscribe((r) => saved.push(r));
    c.copied.subscribe((r) => copied.push(r));
    c.discarded.subscribe((d) => discarded.push(d));
    c.closed.subscribe(() => closed++);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(wipe);
  afterEach(async () => {
    confirm?.answer('confirm');
    host?.querySelectorAll('dialog').forEach((d) => d.open && d.close());
    host?.remove();
    TestBed.resetTestingModule();
    await wipe();
    for (const k of Object.keys(localStorage)) if (k.startsWith(STASH_PREFIX)) localStorage.removeItem(k);
  });

  const board = () => host.querySelector('svg.folha') as SVGSVGElement;
  const tick = async (n = 4) => {
    for (let i = 0; i < n; i++) {
      await new Promise((r) => setTimeout(r, 10));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  };
  /** Os rascunhos no banco agora (a verdade, não a lista da memória). */
  const stored = async () => {
    await drafts.refresh();
    return drafts.list();
  };
  function paint(x: number, y: number): void {
    const r = board().getBoundingClientRect();
    const w = Number(board().getAttribute('viewBox')!.split(' ')[2]);
    const z = r.width / w;
    const at = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: r.left + (x + 0.5) * z, clientY: r.top + (y + 0.5) * z };
    const mesa = host.querySelector('.mesa') as HTMLElement;
    mesa.dispatchEvent(new PointerEvent('pointerdown', at));
    mesa.dispatchEvent(new PointerEvent('pointerup', at));
    fixture.detectChanges();
  }
  function pronto(): void {
    host.querySelector<HTMLButtonElement>('.barra-acoes .pronto')!.click();
    fixture.detectChanges();
  }
  /** A aba some (o celular troca de app, a aba fecha): o rascunho grava na hora. */
  async function hide(): Promise<void> {
    window.dispatchEvent(new Event('pagehide'));
    await tick();
  }
  const barra = () => host.querySelector('footer.estado')!.textContent ?? '';

  it('grava o rascunho um segundo depois da mudança, e a barra de estado diz a hora, sem falar', async () => {
    await make();
    paint(1, 0);
    expect((await stored()).length).toBe(0);
    await new Promise((r) => setTimeout(r, 1200));
    await tick();
    const [d] = await stored();
    expect(d).toEqual(jasmine.objectContaining({ origin: { kind: 'obra', id: 'gato1234' }, title: 'Gato', base: draftKey(START) }));
    expect(d.values['pixels']).toBe('11');
    expect(barra()).toMatch(/Rascunho guardado às \d\d:\d\d/);
    // em silêncio para o leitor de tela: nada da barra está numa região que fala
    expect(host.querySelector('.rascunho')!.closest('[aria-live]')).toBeNull();
  });

  it('a aba que some grava na hora; desfeito até o de antes, o rascunho sai', async () => {
    await make();
    paint(1, 0);
    await hide();
    expect((await stored()).length).toBe(1);
    board().dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await hide();
    expect((await stored()).length).toBe(0);
    expect(barra()).not.toContain('Rascunho guardado');
  });

  it('a aba sumindo guarda às pressas (no localStorage, que grava na hora), e o banco, chegando, leva o guardado às pressas', async () => {
    await make();
    paint(1, 0);
    window.dispatchEvent(new Event('pagehide'));
    // na hora, antes de qualquer espera: é o que sobra se a página sair agora
    const key = Object.keys(localStorage).find((k) => k.startsWith(STASH_PREFIX))!;
    expect(JSON.parse(localStorage.getItem(key)!).values.pixels).toBe('11');
    await tick();
    expect((await stored()).length).toBe(1);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('sem mudança, nada se grava', async () => {
    await make();
    await hide();
    expect((await stored()).length).toBe(0);
  });

  it('sem `draft` (quem abriu não guarda rascunho), nada se grava', async () => {
    await make({ draft: null });
    paint(1, 0);
    await hide();
    expect((await stored()).length).toBe(0);
  });

  it('Salvar: o id do rascunho vai junto, e ele fica até quem recebe guardar o desenho', async () => {
    await make();
    paint(1, 0);
    pronto();
    await tick();
    confirm.answer('confirm');
    await tick();
    const [d] = await stored();
    expect(saved[0].draft).toBe(d.id);
    expect(d.values['pixels']).toBe('11');
  });

  it('Descartar: o rascunho sai; o Desfazer do aviso o traz de volta e reabre o ateliê com ele', async () => {
    await make();
    paint(1, 0);
    await hide();
    pronto();
    await tick();
    confirm.answer('secondary');
    await tick();
    expect(closed).toBe(1);
    expect((await stored()).length).toBe(0);
    expect(discarded.length).toBe(1);
    expect(discarded[0].values['pixels']).toBe('11');
    const toasts = TestBed.inject(Toasts);
    let back: PixelDraft | null = null;
    offerUndoDiscard(toasts, drafts, discarded[0], (d) => (back = d));
    expect(toasts.current()!.text).toBe('Mudanças descartadas');
    toasts.current()!.action!.run();
    await tick();
    expect(back!.values['pixels']).toBe('11');
    expect((await stored()).map((d) => d.id)).toEqual([discarded[0].id]);
  });

  it('continuar um rascunho: o desenho dele por cima do salvo, e o Salvar leva esse desenho com o mesmo rascunho', async () => {
    const d: PixelDraft = { id: 'rcontinua', origin: OBRA.origin, title: 'Gato', values: { ...START, pixels: '22' }, base: draftKey(START), createdAt: 1, savedAt: 2 };
    await make({ resume: d });
    pronto();
    await tick();
    expect(confirm.current()?.title).toBe('Salvar as mudanças?');
    // descartar o continuado leva o rascunho junto: a pergunta diz
    expect(confirm.current()!.text).toContain('e o rascunho guardado em ');
    confirm.answer('confirm');
    await tick();
    expect(saved[0].values['pixels']).toBe('22');
    expect(saved[0].draft).toBe('rcontinua');
  });

  it('o rascunho da ficha (o mesmo de um ateliê para outro): Descartar volta ao desenho que a ficha tem, sem apagá-lo', async () => {
    const ficha: DraftTarget = { ...OBRA, draftId: 'rficha01', base: draftKey({ ...START, pixels: '00' }) };
    await make({ draft: ficha });
    paint(1, 0);
    await hide();
    expect((await stored())[0].values['pixels']).toBe('11');
    pronto();
    await tick();
    confirm.answer('secondary');
    await tick();
    const [d] = await stored();
    expect(d.id).toBe('rficha01');
    expect(d.values['pixels']).toBe('1');
    expect(d.base).toBe(ficha.base!);
  });

  it('o rascunho da ficha e a cópia: a cópia ganha um rascunho só dela, e o da ficha volta ao desenho que a ficha tem', async () => {
    await make({ draft: { ...OBRA, draftId: 'rficha01', base: draftKey(START) }, copy: true });
    paint(1, 0);
    pronto();
    await tick();
    confirm.answer('secondary');
    await tick(12);
    const all = await stored();
    expect(copied[0].draft).not.toBe('rficha01');
    expect(all.find((d) => d.id === 'rficha01')!.values['pixels']).toBe('1');
    const copy = all.find((d) => d.id === copied[0].draft)!;
    expect(copy.values['pixels']).toBe('11');
    expect(copy.origin).toEqual({ kind: 'nova' });
  });

  it('o ateliê aberto segura o rascunho (outra aba não o continua); fechado, solta', async () => {
    await make();
    paint(1, 0);
    await hide();
    const [d] = await stored();
    const held = async () => ((await navigator.locks.query()).held ?? []).map((l) => l.name);
    expect(await held()).toContain('meu-mural:rascunho:' + d.id);
    fixture.destroy();
    await new Promise((r) => setTimeout(r, 30));
    expect(await held()).not.toContain('meu-mural:rascunho:' + d.id);
  });

  it('a hora do rascunho também no alto do ateliê, para o celular (onde a barra de estado não cabe), em silêncio', async () => {
    await make();
    expect(host.querySelector('.guardado')).toBeNull();
    paint(1, 0);
    await hide();
    const top = host.querySelector('.barra .guardado')!;
    expect(top.textContent).toMatch(/^Guardado \d\d:\d\d$/);
    expect(top.getAttribute('aria-hidden')).toBe('true');
  });

  it('sem IndexedDB, a barra avisa que não há rascunho neste navegador', async () => {
    await make();
    drafts.available.set(false);
    fixture.detectChanges();
    expect(barra()).toContain('Sem rascunho neste navegador');
  });
});
