import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { REF_REACH, StoredLayer } from '../../core/pixel-layers';
import { WidgetValues } from '../../core/widgets';
import { Confirm } from '../confirm';
import { ImageStore } from '../../core/image-store';
import { PixelStudio } from './pixel-studio';

/** As camadas do ateliê (PLANO-CAMADAS.md, rodada 2): pintar na escolhida, a pilha achatada, o painel e o widget sem camadas. */
describe('pixel art: as camadas do ateliê', () => {
  let fixture: ComponentFixture<PixelStudio>;
  let values: WidgetValues;
  let stack: StoredLayer[] | undefined;
  let stacked: number;
  let host: HTMLElement;
  let answer: boolean;
  let asked: number;

  async function make(start: WidgetValues, opts: { layered?: boolean; stack?: StoredLayer[] } = {}): Promise<void> {
    answer = true;
    asked = 0;
    TestBed.configureTestingModule({
      imports: [PixelStudio],
      providers: [provideZonelessChangeDetection(), { provide: Confirm, useValue: { ask: () => (asked++, Promise.resolve(answer)), choose: () => Promise.resolve('confirm') } }],
    });
    fixture = TestBed.createComponent(PixelStudio);
    values = { ...start };
    stack = opts.stack;
    stacked = 0;
    fixture.componentRef.setInput('values', values);
    fixture.componentRef.setInput('layered', opts.layered ?? true);
    if (opts.stack) fixture.componentRef.setInput('stack', opts.stack);
    fixture.componentInstance.changed.subscribe((p) => (values = { ...values, ...p }));
    fixture.componentInstance.stackChanged.subscribe((s) => ((stack = s), stacked++));
    host = fixture.nativeElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  afterEach(() => {
    host?.querySelectorAll('dialog').forEach((d) => d.open && d.close());
    host?.remove();
    TestBed.resetTestingModule();
  });

  const board = () => host.querySelector('svg.folha') as SVGSVGElement;
  const mesa = () => host.querySelector('.mesa') as HTMLElement;
  const studio = () => fixture.componentInstance as unknown as Record<string, (...a: unknown[]) => unknown>;
  const rows = () => [...host.querySelectorAll<HTMLElement>('.camada-linha')].map((li) => li.querySelector('.camada-nome, .camada-nome-campo')?.textContent?.trim() || (li.querySelector('input') as HTMLInputElement | null)?.value);
  const chosen = () => host.querySelector('.camada-escolher[aria-current="true"] .camada-nome')?.textContent?.trim();

  function pointer(type: string, x: number, y: number, extra: PointerEventInit = {}): void {
    const r = board().getBoundingClientRect();
    const w = Number(board().getAttribute('viewBox')!.split(' ')[2]);
    const z = r.width / w;
    mesa().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: r.left + (x + 0.5) * z, clientY: r.top + (y + 0.5) * z, ...extra }));
    fixture.detectChanges();
  }
  function click(x: number, y: number): void {
    pointer('pointerdown', x, y);
    pointer('pointerup', x, y);
  }
  function key(k: string, extra: KeyboardEventInit = {}, on: Element = board()): void {
    on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    fixture.detectChanges();
  }
  function button(label: string): HTMLButtonElement {
    const b = [...host.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.getAttribute('aria-label') === label);
    if (!b) throw new Error('sem o botão ' + label);
    return b;
  }

  it('abre com as camadas da obra, na de pontos de cima, e mostra a pilha de cima para baixo', async () => {
    await make({ width: '2', height: '1', pixels: '12' }, { stack: [{ id: 'a', name: 'Fundo', rows: '1' }, { id: 'b', name: 'Olho', rows: '02' }] });
    expect(rows()).toEqual(['Olho', 'Fundo']);
    expect(chosen()).toBe('Olho');
    expect(host.querySelectorAll('.folha-papel svg.camada').length).toBe(2);
  });

  it('abre na de cima que está à mostra, não na escondida', async () => {
    await make({ width: '1', height: '1', pixels: '1' }, { stack: [{ id: 'a', name: 'Fundo', rows: '1' }, { id: 'b', name: 'Rascunho', hidden: true, rows: '2' }] });
    expect(chosen()).toBe('Fundo');
  });

  it('a camada nova fica acima da escolhida; pintar nela não mexe na de baixo, e o achatado vai para a folha', async () => {
    await make({ width: '3', height: '1', pixels: '111' });
    button('Camada nova').click();
    fixture.detectChanges();
    expect(rows()).toEqual(['Camada 2', 'Camada 1']);
    key(']');
    click(1, 0);
    expect(values['pixels']).toBe('121');
    expect(stack?.map((l) => [l.name, l.rows])).toEqual([
      ['Camada 1', '111'],
      ['Camada 2', '02'],
    ]);
    // a borracha na de cima apaga só nela: a de baixo aparece
    key('e');
    click(1, 0);
    expect(values['pixels']).toBe('111');
  });

  it('a escondida não entra na pixel art e não deixa pintar; o olho é um passo do desfazer', async () => {
    await make({ width: '2', height: '1', pixels: '1' }, { stack: [{ id: 'a', name: 'Fundo', rows: '1' }, { id: 'b', name: 'Cima', rows: '02' }] });
    expect(values['pixels']).toBe('1');
    button('Esconder Cima').click();
    fixture.detectChanges();
    expect(values['pixels']).toBe('1');
    expect(stack?.find((l) => l.id === 'b')?.hidden).toBeTrue();
    click(0, 0);
    expect(stack?.find((l) => l.id === 'b')?.rows).toBe('02');
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain('escondida');
    key('z', { ctrlKey: true });
    expect(stack?.find((l) => l.id === 'b')?.hidden).toBeUndefined();
    expect(values['pixels']).toBe('12');
  });

  it('a única camada escondida também sai do desenho, e o Delete não a apaga sem ser vista', async () => {
    await make({ width: '2', height: '1', pixels: '11' });
    button('Esconder Camada 1').click();
    fixture.detectChanges();
    expect(values['pixels']).toBe('');
    expect(stack).toEqual([{ id: 'c1', name: 'Camada 1', hidden: true, rows: '11' }]);
    key('a', { ctrlKey: true });
    key('Delete');
    expect(stack?.[0].rows).toBe('11');
  });

  it('juntar uma escondida não junta (os pontos dela apareceriam), e a barra de estado diz por quê', async () => {
    await make({ width: '2', height: '1', pixels: '1' }, { stack: [{ id: 'a', name: 'Fundo', rows: '1' }, { id: 'b', name: 'Rascunho', hidden: true, rows: '02' }] });
    studio()['mergeLayerDown']('b');
    fixture.detectChanges();
    expect(stack?.length).toBe(2);
    expect(host.querySelector('.estado-dica')?.textContent).toContain('escondida');
  });

  it('Alt+↑ e Alt+↓ numa fileira mudam a camada de lugar', async () => {
    await make({ width: '1', height: '1', pixels: '2' }, { stack: [{ id: 'a', name: 'A', rows: '1' }, { id: 'b', name: 'B', rows: '2' }] });
    const rowA = host.querySelector('[data-camada="a"] .camada-escolher') as HTMLElement;
    rowA.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(rows()).toEqual(['A', 'B']);
    expect(values['pixels']).toBe('1');
  });

  it('dois cliques renomeiam ali mesmo: Enter grava, Esc volta ao nome de antes', async () => {
    await make({ width: '1', height: '1', pixels: '1' });
    const name = host.querySelector('.camada-escolher') as HTMLButtonElement;
    name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    const input = host.querySelector('.camada-nome-campo') as HTMLInputElement;
    input.value = '  Contorno  ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(rows()).toEqual(['Contorno']);
    expect(stack).toEqual([{ id: 'c1', name: 'Contorno', rows: '1' }]);
    key('F2');
    await fixture.whenStable();
    const again = host.querySelector('.camada-nome-campo') as HTMLInputElement;
    again.value = 'Outro';
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(rows()).toEqual(['Contorno']);
  });

  it('Ctrl+E junta com a de baixo; Shift+N cria; apagar deixa ao menos uma', async () => {
    await make({ width: '2', height: '1', pixels: '12' }, { stack: [{ id: 'a', name: 'Fundo', rows: '1' }, { id: 'b', name: 'Olho', rows: '02' }] });
    key('e', { ctrlKey: true });
    expect(rows()).toEqual(['Fundo']);
    expect(values['pixels']).toBe('12');
    expect(stack).toEqual([{ id: 'a', name: 'Fundo', rows: '12' }]);
    key('N', { shiftKey: true });
    expect(rows()).toEqual(['Camada 2', 'Fundo']);
    studio()['removeLayer']('a');
    fixture.detectChanges();
    expect(rows()).toEqual(['Camada 2']);
    expect(values['pixels']).toBe('');
    studio()['removeLayer'](stack?.[0]?.id ?? 'x');
    fixture.detectChanges();
    expect(rows().length).toBe(1);
  });

  it('subir e descer mudam a ordem da pilha (e quem fica por cima)', async () => {
    await make({ width: '1', height: '1', pixels: '2' }, { stack: [{ id: 'a', name: 'A', rows: '1' }, { id: 'b', name: 'B', rows: '2' }] });
    studio()['stepLayer']('b', -1);
    fixture.detectChanges();
    expect(rows()).toEqual(['A', 'B']);
    expect(values['pixels']).toBe('1');
  });

  it('girar, a tela e a paleta valem para a pilha toda', async () => {
    await make({ width: '2', height: '1', pixels: '1' }, { stack: [{ id: 'a', name: 'A', rows: '1' }, { id: 'b', name: 'B', rows: '02' }] });
    studio()['rotate']('cw');
    fixture.detectChanges();
    expect(values['width']).toBe('1');
    expect(stack?.map((l) => l.rows)).toEqual(['1', '/2']);
    // tirar a cor 1: na pilha toda os pontos dela somem e a 2 vira a 1
    studio()['chooseInk'](1);
    studio()['removeFg']();
    fixture.detectChanges();
    expect(stack?.map((l) => l.rows)).toEqual(['', '/1']);
  });

  it('fechar com todas as camadas com desenho escondidas pergunta antes; sim mostra todas', async () => {
    await make({ width: '1', height: '1', pixels: '1' }, { stack: [{ id: 'a', name: 'A', rows: '1' }, { id: 'b', name: 'B', rows: '' }] });
    studio()['toggleLayer']('a');
    fixture.detectChanges();
    answer = false;
    await studio()['close']();
    expect(asked).toBe(1);
    expect((host.querySelector('dialog.atelie') as HTMLDialogElement).open).toBeTrue();
    answer = true;
    await studio()['close']();
    expect(asked).toBe(2);
    expect(values['pixels']).toBe('1');
  });

  it('o mapa de cor muda a frente na hora, e o arrasto inteiro é um passo do desfazer', async () => {
    await make({ width: '1', height: '1', pixels: '1' }, { layered: false });
    const map = host.querySelector('app-color-map .sv') as HTMLElement;
    map.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
    map.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
    map.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(values['colors']).toMatch(/^1#/);
    key('z', { ctrlKey: true });
    expect(values['colors'] ?? '').toBe('');
    // o transparente na frente: o mapa apagado, e o porquê
    studio()['chooseInk'](0);
    fixture.detectChanges();
    expect(host.querySelector('app-color-map')?.classList).toContain('apagado');
    expect(host.querySelector('.mapa-dica')?.textContent).toContain('transparente');
  });

  it('tirar as cores sem uso conta todas as camadas, a escondida também', async () => {
    await make({ width: '2', height: '1', pixels: '1' }, { stack: [{ id: 'a', name: 'A', rows: '1' }, { id: 'b', name: 'B', hidden: true, rows: '03' }] });
    expect(studio()['unused']()).toEqual([2, 4, 5, 6, 7, 8, 9]);
    studio()['removeUnused']();
    fixture.detectChanges();
    expect(values['palette']).toBe('propria');
    expect(stack?.find((l) => l.id === 'b')?.rows).toBe('02');
    expect(values['pixels']).toBe('1');
  });

  it('no widget, uma camada só: sem painel, sem o menu Camada, e nada de pilha', async () => {
    await make({ width: '2', height: '1', pixels: '1' }, { layered: false });
    expect(host.querySelector('.camadas')).toBeNull();
    expect(host.querySelector('.barra-menus [data-menu="camada"]')).toBeNull();
    expect(host.querySelector('.barra-menus [data-menu="imagem"]')).not.toBeNull();
    click(1, 0);
    expect(values['pixels']).toBe('11');
    key('N', { shiftKey: true });
    expect(host.querySelectorAll('.folha-papel svg.camada').length).toBe(1);
    expect(stacked).toBe(0);
  });
});

/** Esticar a seleção (PLANO-CAMADAS.md, rodada 3): as alças, o Shift e o Tamanho da seleção. */
describe('pixel art: esticar a seleção', () => {
  let fixture: ComponentFixture<PixelStudio>;
  let values: WidgetValues;
  let host: HTMLElement;

  async function make(start: WidgetValues): Promise<void> {
    TestBed.configureTestingModule({ imports: [PixelStudio], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(PixelStudio);
    values = { ...start };
    fixture.componentRef.setInput('values', values);
    fixture.componentInstance.changed.subscribe((p) => (values = { ...values, ...p }));
    host = fixture.nativeElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  afterEach(() => {
    host?.querySelectorAll('dialog').forEach((d) => d.open && d.close());
    host?.remove();
    TestBed.resetTestingModule();
  });
  const board = () => host.querySelector('svg.folha') as SVGSVGElement;
  const zoom = () => board().getBoundingClientRect().width / Number(board().getAttribute('viewBox')!.split(' ')[2]);
  function key(k: string, extra: KeyboardEventInit = {}): void {
    board().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    fixture.detectChanges();
  }
  /** Puxa a alça `h` de `dx`, `dy` pontos. */
  function pull(h: string, dx: number, dy: number, extra: PointerEventInit = {}): void {
    const a = host.querySelector(`.alca[data-alca="${h}"]`) as HTMLElement;
    const r = a.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const ev = (type: string, cx: number, cy: number) => a.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: cx, clientY: cy, ...extra }));
    ev('pointerdown', x, y);
    fixture.detectChanges();
    ev('pointermove', x + dx * zoom(), y + dy * zoom());
    fixture.detectChanges();
    ev('pointerup', x + dx * zoom(), y + dy * zoom());
    fixture.detectChanges();
  }

  it('com a Seleção e algo escolhido, as oito alças; puxar o canto estica, um ponto vira dois', async () => {
    await make({ width: '4', height: '2', pixels: '12' });
    key('m');
    expect(host.querySelectorAll('.alca').length).toBe(0);
    (fixture.componentInstance as unknown as { selectAll(): void }).selectAll();
    fixture.detectChanges();
    expect(host.querySelectorAll('.alca').length).toBe(8);
    key('Escape');
    // só os dois pontos pintados escolhidos
    (fixture.componentInstance as unknown as { sel: { set(m: unknown): void } }).sel.set({ w: 4, h: 2, bits: new Uint8Array([1, 1, 0, 0, 0, 0, 0, 0]) });
    fixture.detectChanges();
    pull('se', 2, 1);
    expect(values['pixels']).toBe('1122/1122');
    key('Enter');
    key('z', { ctrlKey: true });
    expect(values['pixels']).toBe('12');
  });

  it('com o Shift, na proporção', async () => {
    await make({ width: '4', height: '4', pixels: '12' });
    key('m');
    (fixture.componentInstance as unknown as { sel: { set(m: unknown): void } }).sel.set({ w: 4, h: 4, bits: new Uint8Array([1, 1, 0, 0, ...new Array(12).fill(0)]) });
    fixture.detectChanges();
    pull('e', 2, 0, { shiftKey: true });
    // a largura dobrou; a altura acompanhou, crescendo para os dois lados do meio
    expect(values['pixels']).toBe('1122/1122');
  });

  it('o Tamanho da seleção, pelo menu Imagem: a âncora fica parada', async () => {
    await make({ width: '4', height: '1', pixels: '12' });
    const st = fixture.componentInstance as unknown as { sel: { set(m: unknown): void }; openSize(t: string): void; setSizing(p: unknown): void; applySize(): void };
    st.sel.set({ w: 4, h: 1, bits: new Uint8Array([1, 1, 0, 0]) });
    st.openSize('selecao');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelector('.tamanho-titulo')?.textContent).toContain('Tamanho da seleção');
    st.setSizing({ w: 4, h: 1, anchor: { x: 0, y: 0 } });
    st.applySize();
    fixture.detectChanges();
    expect(values['pixels']).toBe('1122');
  });
});

/** As camadas de referência (PLANO-CAMADAS.md, rodada 5): deitar, mover, esticar, a opacidade, e nunca no desenho. */
describe('pixel art: as referências do ateliê', () => {
  const ID = 'A'.repeat(22);
  let fixture: ComponentFixture<PixelStudio>;
  let values: WidgetValues;
  let stack: StoredLayer[] | undefined;
  let host: HTMLElement;

  async function make(start: WidgetValues, stored?: StoredLayer[]): Promise<void> {
    TestBed.configureTestingModule({
      imports: [PixelStudio],
      providers: [provideZonelessChangeDetection(), { provide: ImageStore, useValue: { add: async () => ({ id: ID, largura: 200, altura: 100 }), version: signal(0), url: async () => null } }],
    });
    fixture = TestBed.createComponent(PixelStudio);
    values = { ...start };
    stack = stored;
    fixture.componentRef.setInput('values', values);
    fixture.componentRef.setInput('layered', true);
    if (stored) fixture.componentRef.setInput('stack', stored);
    fixture.componentInstance.changed.subscribe((p) => (values = { ...values, ...p }));
    fixture.componentInstance.stackChanged.subscribe((s) => (stack = s));
    host = fixture.nativeElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  afterEach(() => {
    host?.querySelectorAll('dialog').forEach((d) => d.open && d.close());
    host?.remove();
    TestBed.resetTestingModule();
  });
  const board = () => host.querySelector('svg.folha') as SVGSVGElement;
  const mesa = () => host.querySelector('.mesa') as HTMLElement;
  const zoom = () => board().getBoundingClientRect().width / Number(board().getAttribute('viewBox')!.split(' ')[2]);
  const st = () => fixture.componentInstance as unknown as Record<string, (...a: unknown[]) => unknown>;
  const ref = () => stack?.find((l) => l.ref)?.ref;
  function drag(from: Element, dx: number, dy: number, at?: { x: number; y: number }): void {
    const r = (at ? board() : from).getBoundingClientRect();
    const x = at ? r.left + at.x * zoom() : r.left + r.width / 2;
    const y = at ? r.top + at.y * zoom() : r.top + r.height / 2;
    const ev = (type: string, cx: number, cy: number) => from.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: cx, clientY: cy }));
    ev('pointerdown', x, y);
    fixture.detectChanges();
    ev('pointermove', x + dx * zoom(), y + dy * zoom());
    fixture.detectChanges();
    ev('pointerup', x + dx * zoom(), y + dy * zoom());
    fixture.detectChanges();
  }

  it('a referência deita inteira no papel, no fundo da pilha, e não entra no desenho', async () => {
    await make({ width: '8', height: '8', pixels: '1' });
    await (st()['addReference'] as (f: Blob) => Promise<void>)(new File([new Uint8Array(4)], 'gato.png'));
    fixture.detectChanges();
    expect(stack?.[0]).toEqual({ id: jasmine.any(String), name: 'gato', ref: { src: 'murall://imagem/' + ID, x: 0, y: 2, w: 8, h: 4, opacity: 0.5 } });
    expect(values['pixels']).toBe('1');
    expect(host.querySelectorAll('.camadas-papel img.referencia').length).toBe(1);
    expect(host.querySelectorAll('.alca').length).toBe(8);
  });

  it('com ela escolhida, arrastar no papel a move; a alça estica na proporção; as setas andam um ponto; nada pinta', async () => {
    await make({ width: '8', height: '8' }, [{ id: 'r', name: 'Foto', ref: { src: 'murall://imagem/' + ID, x: 0, y: 2, w: 8, h: 4, opacity: 0.5 } }, { id: 'c1', name: 'Camada 1', rows: '' }]);
    st()['selectLayer']('r');
    fixture.detectChanges();
    drag(mesa(), 1, 1, { x: 4, y: 4 });
    const near = (v: number | undefined, want: number) => expect(v ?? NaN).toBeCloseTo(want, 0);
    near(ref()?.x, 1);
    near(ref()?.y, 3);
    expect(ref()).toEqual(jasmine.objectContaining({ w: 8, h: 4 }));
    expect(values['pixels'] ?? '').toBe('');
    drag(host.querySelector('.alca[data-alca="e"]')!, -4, 0);
    near(ref()?.w, 4);
    near(ref()?.h, 2);
    const x = ref()!.x;
    board().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    near(ref()?.x, x - 1);
    board().dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    near(ref()?.x, x);
  });

  it('a opacidade é um passo do desfazer; escolher uma ferramenta volta a pintar na camada de pontos', async () => {
    await make({ width: '4', height: '4' }, [{ id: 'r', name: 'Foto', ref: { src: 'murall://imagem/' + ID, x: 0, y: 0, w: 4, h: 4, opacity: 0.5 } }, { id: 'c1', name: 'Camada 1', rows: '' }]);
    st()['selectLayer']('r');
    fixture.detectChanges();
    expect(host.querySelector('.opacidade')).not.toBeNull();
    st()['setRefOpacity'](30);
    st()['setRefOpacity'](20, true);
    expect(ref()?.opacity).toBe(0.2);
    st()['undo']();
    expect(ref()?.opacity).toBe(0.5);
    st()['pickTool']('lapis');
    fixture.detectChanges();
    expect(host.querySelector('.opacidade')).toBeNull();
    const r = board().getBoundingClientRect();
    mesa().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: r.left + 0.5 * zoom(), clientY: r.top + 0.5 * zoom() }));
    mesa().dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: r.left + 0.5 * zoom(), clientY: r.top + 0.5 * zoom() }));
    fixture.detectChanges();
    expect(values['pixels']).toBe('1');
  });

  it('com ela escolhida: Esc a solta (o ateliê fica aberto), Delete a apaga com o Desfazer; ela não passa do alcance que a obra guarda', async () => {
    await make({ width: '4', height: '4' }, [{ id: 'r', name: 'Foto', ref: { src: 'murall://imagem/' + ID, x: 0, y: 0, w: 4, h: 4, opacity: 0.5 } }, { id: 'c1', name: 'Camada 1', rows: '1' }]);
    st()['selectLayer']('r');
    fixture.detectChanges();
    drag(host.querySelector('.alca[data-alca="se"]')!, 1200, 1200);
    expect(ref()?.w ?? 0).toBeLessThanOrEqual(REF_REACH);
    board().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect((host.querySelector('dialog.atelie') as HTMLDialogElement).open).toBeTrue();
    expect(host.querySelector('.opacidade')).toBeNull();
    st()['selectLayer']('r');
    board().dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(ref()).toBeUndefined();
    st()['undo']();
    expect(ref()).toBeDefined();
  });

  it('a tela que cresce leva a referência junto, presa na âncora', async () => {
    await make({ width: '4', height: '4' }, [{ id: 'r', name: 'Foto', ref: { src: 'murall://imagem/' + ID, x: 0, y: 0, w: 4, h: 4, opacity: 0.5 } }, { id: 'c1', name: 'Camada 1', rows: '1' }]);
    st()['openSize']();
    st()['setSizing']({ w: 8, h: 8, anchor: { x: 1, y: 1 } });
    st()['applySize']();
    expect(ref()).toEqual(jasmine.objectContaining({ x: 2, y: 2 }));
  });
});

/** Trazer uma imagem pergunta (PLANO-CAMADAS.md, rodada 6): as cores da paleta, as dela, ou a referência. */
describe('pixel art: trazer uma imagem', () => {
  const ID = 'B'.repeat(22);
  let fixture: ComponentFixture<PixelStudio>;
  let values: WidgetValues;
  let stack: StoredLayer[] | undefined;
  let host: HTMLElement;

  async function make(start: WidgetValues, layered: boolean): Promise<void> {
    TestBed.configureTestingModule({
      imports: [PixelStudio],
      providers: [provideZonelessChangeDetection(), { provide: ImageStore, useValue: { add: async () => ({ id: ID, largura: 4, altura: 4 }), version: signal(0), url: async () => null } }],
    });
    fixture = TestBed.createComponent(PixelStudio);
    values = { ...start };
    stack = undefined;
    fixture.componentRef.setInput('values', values);
    fixture.componentRef.setInput('layered', layered);
    fixture.componentInstance.changed.subscribe((p) => (values = { ...values, ...p }));
    fixture.componentInstance.stackChanged.subscribe((s) => (stack = s));
    host = fixture.nativeElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  afterEach(() => {
    host?.querySelectorAll('dialog').forEach((d) => d.open && d.close());
    host?.remove();
    TestBed.resetTestingModule();
  });
  const st = () => fixture.componentInstance as unknown as Record<string, (...a: unknown[]) => unknown>;

  /** Uma imagem de 4 × 4: a metade de cima vermelha, a de baixo azul. */
  async function picture(): Promise<File> {
    const cv = document.createElement('canvas');
    cv.width = 4;
    cv.height = 4;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#e02020';
    g.fillRect(0, 0, 4, 2);
    g.fillStyle = '#2040e0';
    g.fillRect(0, 2, 4, 2);
    const blob = await new Promise<Blob>((r) => cv.toBlob((b) => r(b!), 'image/png'));
    return new File([blob], 'bandeira.png', { type: 'image/png' });
  }
  async function ask(): Promise<void> {
    await (st()['askImport'] as (f: Blob) => Promise<void>)(await picture());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const choices = () => [...host.querySelectorAll('.trazer-cartao .trazer-titulo')].map((t) => t.textContent?.trim());

  it('o menu tem um Trazer só; a imagem abre a folha com as três respostas e a prévia de cada uma', async () => {
    await make({ width: '4', height: '4' }, true);
    const items = (st()['barMenus'] as () => { sections: { id: string }[][] }[])().flatMap((m) => m.sections.flat()).map((i) => i.id);
    expect(items).toContain('imagem');
    expect(items).not.toContain('imagem-cores');
    await ask();
    expect((host.querySelector('dialog.trazer') as HTMLDialogElement).open).toBeTrue();
    expect(choices()).toEqual(['Nas cores da sua paleta', 'Com as cores da imagem', 'Como referência']);
    expect(host.querySelectorAll('.trazer-previa app-pixel-thumb').length).toBe(2);
    expect(host.querySelector('.trazer-nome')?.textContent).toContain('bandeira');
  });

  it('nas cores da paleta, com desenho na obra: os pontos vêm numa camada nova', async () => {
    await make({ width: '4', height: '4', pixels: '1' }, true);
    await ask();
    st()['applyImport']();
    fixture.detectChanges();
    expect(stack?.length).toBe(2);
    expect(stack?.[1].name).toBe('bandeira');
    expect(values['palette']).toBe('classica');
  });

  it('com as cores da imagem: a paleta vira a dela, e o desenho de antes passa para a cor mais perto', async () => {
    await make({ width: '4', height: '4', pixels: '1' }, true);
    await ask();
    st()['setImportChoice']('cores');
    st()['applyImport']();
    fixture.detectChanges();
    expect(values['palette']).toBe('propria');
    expect(stack?.length).toBe(2);
  });

  it('como referência: vira uma camada de referência; Cancelar não muda nada', async () => {
    await make({ width: '4', height: '4', pixels: '1' }, true);
    await ask();
    st()['closeImport']();
    fixture.detectChanges();
    expect(stack).toBeUndefined();
    await ask();
    st()['setImportChoice']('referencia');
    st()['applyImport']();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(stack?.[0].ref?.src).toBe('murall://imagem/' + ID);
    expect(values['pixels']).toBe('1');
  });

  it('no widget: duas respostas, e os pontos no lugar do desenho', async () => {
    await make({ width: '4', height: '4', pixels: '1' }, false);
    await ask();
    expect(choices()).toEqual(['Nas cores da sua paleta', 'Com as cores da imagem']);
    st()['applyImport']();
    fixture.detectChanges();
    expect(values['pixels']).not.toBe('1');
    expect(stack).toBeUndefined();
  });
});
