import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WidgetValues } from '../../core/widgets';
import { Confirm } from '../confirm';
import { PixelStudio, StudioResult } from './pixel-studio';

/** Sair do ateliê (PLANO-RASCUNHOS-PIXEL.md, rodada 1): nada sai antes de a pessoa dizer, e sem mudança não se pergunta. */
describe('pixel art: sair do ateliê', () => {
  let fixture: ComponentFixture<PixelStudio>;
  let host: HTMLElement;
  let confirm: Confirm;
  let live: WidgetValues;
  let saved: StudioResult[];
  let copied: StudioResult[];
  let closed: number;

  async function make(start: WidgetValues, opts: { copy?: boolean; layered?: boolean } = {}): Promise<void> {
    TestBed.configureTestingModule({ imports: [PixelStudio], providers: [provideZonelessChangeDetection()] });
    confirm = TestBed.inject(Confirm);
    fixture = TestBed.createComponent(PixelStudio);
    fixture.componentRef.setInput('values', start);
    if (opts.copy) fixture.componentRef.setInput('copy', true);
    if (opts.layered) fixture.componentRef.setInput('layered', true);
    live = { ...start };
    saved = [];
    copied = [];
    closed = 0;
    const c = fixture.componentInstance;
    c.changed.subscribe((v) => (live = { ...live, ...v }));
    c.saved.subscribe((r) => saved.push(r));
    c.copied.subscribe((r) => copied.push(r));
    c.closed.subscribe(() => closed++);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  afterEach(() => {
    confirm?.answer('confirm');
    host?.querySelectorAll('dialog').forEach((d) => d.open && d.close());
    host?.remove();
    TestBed.resetTestingModule();
  });

  const atelie = () => host.querySelector('dialog.atelie') as HTMLDialogElement;
  const board = () => host.querySelector('svg.folha') as SVGSVGElement;
  /** Uma tarefa depois: o `close` do `<dialog>` chega assim. */
  const tick = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 10));
      fixture.detectChanges();
      await fixture.whenStable();
    }
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

  it('sem mudança, o Pronto fecha sem perguntar e não manda nada', async () => {
    await make({ width: '2', height: '1', pixels: '1' });
    pronto();
    await tick();
    expect(confirm.current()).toBeNull();
    expect(closed).toBe(1);
    expect(saved).toEqual([]);
  });

  it('desfazer tudo até o de quando abriu também é não mudar nada', async () => {
    await make({ width: '2', height: '1', pixels: '1' });
    paint(1, 0);
    board().dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    pronto();
    await tick();
    expect(confirm.current()).toBeNull();
    expect(closed).toBe(1);
  });

  it('com mudança, pergunta; Salvar manda o desenho e fecha', async () => {
    await make({ width: '2', height: '1', pixels: '1' });
    paint(1, 0);
    pronto();
    await tick();
    const q = confirm.current()!;
    expect(q.title).toBe('Salvar as mudanças?');
    expect(q.confirm).toBe('Salvar');
    expect(q.cancel).toBe('Voltar ao ateliê');
    // um desenho sem original para deixar como era: sem a cópia
    expect(q.secondary).toBe('Descartar');
    expect(q.third).toBeNull();
    expect(closed).toBe(0);
    confirm.answer('confirm');
    await tick();
    expect(saved.map((r) => r.values['pixels'])).toEqual(['11']);
    expect(copied).toEqual([]);
    expect(closed).toBe(1);
  });

  it('Descartar fecha sem mandar nada', async () => {
    await make({ width: '2', height: '1', pixels: '1' });
    paint(1, 0);
    pronto();
    await tick();
    confirm.answer('secondary');
    await tick();
    expect(saved).toEqual([]);
    expect(copied).toEqual([]);
    expect(closed).toBe(1);
  });

  it('Voltar ao ateliê (o Esc, o clique fora) deixa tudo aberto como estava', async () => {
    await make({ width: '2', height: '1', pixels: '1' });
    paint(1, 0);
    pronto();
    await tick();
    confirm.answer(false);
    await tick();
    expect(atelie().open).toBeTrue();
    expect(closed).toBe(0);
    expect(live['pixels']).toBe('11');
    // e sair de novo pergunta de novo
    pronto();
    await tick();
    expect(confirm.current()).not.toBeNull();
  });

  it('com um original, a cópia: Salvar como cópia manda o desenho pelo copied, e Descartar é a terceira', async () => {
    await make({ width: '2', height: '1', pixels: '1' }, { copy: true });
    paint(1, 0);
    pronto();
    await tick();
    const q = confirm.current()!;
    expect([q.secondary, q.third]).toEqual(['Salvar como cópia', 'Descartar']);
    expect(q.text).toContain('o original fica como era');
    confirm.answer('secondary');
    await tick();
    expect(copied.map((r) => r.values['pixels'])).toEqual(['11']);
    expect(saved).toEqual([]);
    expect(closed).toBe(1);
  });

  it('o Esc não fecha sozinho: pergunta', async () => {
    await make({ width: '2', height: '1', pixels: '1' });
    paint(1, 0);
    const esc = new Event('cancel', { cancelable: true });
    atelie().dispatchEvent(esc);
    await tick();
    expect(esc.defaultPrevented).toBeTrue();
    expect(atelie().open).toBeTrue();
    expect(confirm.current()?.title).toBe('Salvar as mudanças?');
  });

  it('o navegador fechando o diálogo mesmo assim (o segundo Esc do Chrome): abre de novo e pergunta', async () => {
    await make({ width: '2', height: '1', pixels: '1' });
    paint(1, 0);
    atelie().close();
    await tick();
    expect(atelie().open).toBeTrue();
    expect(closed).toBe(0);
    expect(confirm.current()?.title).toBe('Salvar as mudanças?');
    confirm.answer('confirm');
    await tick();
    expect(saved.length).toBe(1);
    expect(closed).toBe(1);
  });

  it('o desenho novo, descartado: o texto diz que ele some', async () => {
    await make({ width: '2', height: '1' });
    paint(0, 0);
    pronto();
    await tick();
    expect(confirm.current()!.text).toContain('o desenho some');
  });

  it('numa obra da galeria, o Salvar leva a pilha junto', async () => {
    await make({ width: '2', height: '1', pixels: '1' }, { layered: true });
    paint(1, 0);
    pronto();
    await tick();
    confirm.answer('confirm');
    await tick();
    expect(saved[0].values['pixels']).toBe('11');
    expect('layers' in saved[0]).toBeTrue();
  });
});
