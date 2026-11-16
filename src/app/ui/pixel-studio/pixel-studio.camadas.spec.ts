import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StoredLayer } from '../../core/pixel-layers';
import { WidgetValues } from '../../core/widgets';
import { Confirm } from '../confirm';
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
      providers: [provideZonelessChangeDetection(), { provide: Confirm, useValue: { ask: () => (asked++, Promise.resolve(answer)) } }],
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

  it('no widget, uma camada só: sem painel, a linha que diz onde as camadas moram, e nada de pilha', async () => {
    await make({ width: '2', height: '1', pixels: '1' }, { layered: false });
    expect(host.querySelector('.camadas')).toBeNull();
    expect(host.querySelector('.camadas-so-galeria')?.textContent).toContain('galeria');
    click(1, 0);
    expect(values['pixels']).toBe('11');
    key('N', { shiftKey: true });
    expect(host.querySelectorAll('.folha-papel svg.camada').length).toBe(1);
    expect(stacked).toBe(0);
  });
});
