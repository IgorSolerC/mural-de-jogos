import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WidgetValues, widgetDef } from '../../core/widgets';
import { PixelStudio } from './pixel-studio';

/** O ateliê da pixel art (PLANO-ATELIE.md, seção 3): o mouse, os dedos, os atalhos do Aseprite e o que vai para a folha. */
describe('pixel art: o ateliê', () => {
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
  const mesa = () => host.querySelector('.mesa') as HTMLElement;

  /** O ponteiro no meio do ponto (x, y) da folha. */
  function pointer(type: string, x: number, y: number, extra: PointerEventInit = {}): void {
    const r = board().getBoundingClientRect();
    const w = Number(board().getAttribute('viewBox')!.split(' ')[2]);
    const z = r.width / w;
    mesa().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: r.left + (x + 0.5) * z, clientY: r.top + (y + 0.5) * z, ...extra }));
    fixture.detectChanges();
  }
  function click(x: number, y: number, extra: PointerEventInit = {}): void {
    pointer('pointerdown', x, y, extra);
    pointer('pointerup', x, y, extra);
  }
  function key(k: string, extra: KeyboardEventInit = {}, on: Element = board()): void {
    on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    fixture.detectChanges();
  }
  const marked = () => widgetDef('pixel')!.write(values);

  it('abre em tela inteira, com a folha do tamanho dos valores, e cabe na mesa', async () => {
    await make({ width: '8', height: '4', pixels: '1' });
    expect((host.querySelector('dialog.atelie') as HTMLDialogElement).open).toBeTrue();
    expect(board().getAttribute('viewBox')).toBe('0 0 8 4');
    const r = board().getBoundingClientRect();
    const m = mesa().getBoundingClientRect();
    expect(r.width).toBeGreaterThan(0);
    expect(r.right).toBeLessThanOrEqual(m.right);
    expect(host.querySelector('.estado')?.textContent).toContain('8 × 4');
  });

  it('arrastar pinta a reta toda; o direito pinta com a do fundo (o transparente); um arrasto é um passo do desfazer', async () => {
    await make({ width: '4', height: '2' });
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 3, 0);
    pointer('pointerup', 3, 0);
    expect(values['pixels']).toBe('1111');
    click(1, 0, { button: 2, buttons: 2 });
    expect(values['pixels']).toBe('1011');
    key('z', { ctrlKey: true });
    expect(values['pixels']).toBe('1111');
    key('z', { ctrlKey: true });
    expect(values['pixels']).toBe('');
    key('y', { ctrlKey: true });
    expect(values['pixels']).toBe('1111');
  });

  it('as teclas do Aseprite: ] e [ andam a paleta, X troca frente e fundo, G é o balde, E a borracha', async () => {
    await make({ width: '3', height: '1' });
    key(']');
    key(']');
    key(']');
    key('g');
    click(0, 0);
    expect(values['pixels']).toBe('444');
    key('x');
    click(1, 0);
    // a frente agora é o transparente: o balde apaga a mancha inteira
    expect(values['pixels']).toBe('');
    key('x');
    key('[');
    key('b');
    click(2, 0);
    expect(values['pixels']).toBe('003');
    key('e');
    click(2, 0);
    expect(values['pixels']).toBe('');
  });

  it('o balde sem "só a mancha" pinta a cor inteira, em qualquer lugar', async () => {
    await make({ width: '5', height: '1', pixels: '10101' });
    key('g');
    (host.querySelector('.opcoes .interruptor') as HTMLButtonElement).click();
    fixture.detectChanges();
    key(']');
    click(0, 0);
    expect(values['pixels']).toBe('20202');
  });

  it('o pincel maior (+) carimba um quadrado; a simetria pinta o outro lado', async () => {
    await make({ width: '4', height: '4' });
    key('+');
    click(0, 0);
    expect(values['pixels']).toBe('11/11');
    key('z', { ctrlKey: true });
    key('-');
    (host.querySelector('.tecla.sim[aria-label="De lado"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    click(0, 3);
    expect(values['pixels']).toBe('///1001');
  });

  it('o pixel perfeito tira o canto do L no traço à mão', async () => {
    await make({ width: '3', height: '3' });
    (host.querySelector('.opcoes .interruptor') as HTMLButtonElement).click();
    fixture.detectChanges();
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 1, 0);
    pointer('pointermove', 1, 1);
    pointer('pointerup', 1, 1);
    expect(values['pixels']).toBe('1/01');
  });

  it('o conta-gotas pega a cor do ponto; o Alt segurado faz dele o conta-gotas', async () => {
    await make({ width: '3', height: '1', pixels: '5' });
    key('Alt');
    expect(host.querySelector('.ferr.segurada[aria-label="Conta-gotas"]')).not.toBeNull();
    click(0, 0);
    board().dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }));
    fixture.detectChanges();
    click(2, 0);
    expect(values['pixels']).toBe('505');
  });

  it('as cores acrescentadas ganham letras e vão escritas na marca', async () => {
    await make({ width: '2', height: '1', palette: 'gameboy' });
    expect(host.querySelectorAll('.pastilha:not(.mais)').length).toBe(5);
    (host.querySelector('.pastilha.mais') as HTMLButtonElement).click();
    fixture.detectChanges();
    const hex = host.querySelector('.hex-campo input') as HTMLInputElement;
    hex.value = '#ff0000';
    hex.dispatchEvent(new Event('input'));
    hex.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    click(0, 0);
    expect(marked()).toEqual(['2x1', '5', 'gameboy', '5#ff0000']);
    // a de número 5 e as que vierem depois seguem em letras: a 10 é a "a"
    for (let i = 0; i < 5; i++) (host.querySelector('.pastilha.mais') as HTMLButtonElement).click();
    fixture.detectChanges();
    click(1, 0);
    expect(values['pixels']).toBe('5a');
  });

  it('o Tamanho da tela (C) cresce com a âncora e é um passo do desfazer', async () => {
    await make({ width: '2', height: '2', pixels: '12/34' });
    key('c');
    await fixture.whenStable();
    fixture.detectChanges();
    const sheet = host.querySelector('dialog.tamanho') as HTMLDialogElement;
    expect(sheet.open).toBeTrue();
    const [w, h] = Array.from(sheet.querySelectorAll('input')) as HTMLInputElement[];
    w.value = '4';
    w.dispatchEvent(new Event('input'));
    h.value = '4';
    h.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (sheet.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(values['width']).toBe('4');
    expect(marked()![1]).toBe('/012/034');
    key('z', { ctrlKey: true });
    expect(values['width']).toBe('2');
  });

  it('trocar de paleta mantém os números; a cor da frente volta para dentro da paleta menor', async () => {
    await make({ width: '1', height: '1', pixels: '9' });
    for (let i = 0; i < 8; i++) key(']');
    const select = host.querySelector('.paleta-campo select') as HTMLSelectElement;
    select.value = 'gameboy';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(values['palette']).toBe('gameboy');
    expect(values['pixels']).toBe('9');
    expect(host.querySelector('.pastilha.on')?.getAttribute('aria-label')).toBe('Cor 1');
  });

  it('a roda e os números aproximam; Ctrl+0 cabe na tela', async () => {
    await make({ width: '8', height: '8' });
    key('1');
    expect(host.querySelector('.zoom-n')?.textContent?.trim()).toBe('100%');
    key('4');
    expect(host.querySelector('.zoom-n')?.textContent?.trim()).toBe('800%');
    const r = board().getBoundingClientRect();
    mesa().dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: r.left, clientY: r.top, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(host.querySelector('.zoom-n')?.textContent?.trim()).toBe('1200%');
    key('0', { ctrlKey: true });
    expect(board().getBoundingClientRect().width).toBeGreaterThan(r.width);
  });

  it('no teclado: as setas andam, Enter pinta e o leitor de tela ouve onde está', async () => {
    await make({ width: '3', height: '2' });
    key('ArrowRight');
    key('ArrowDown');
    key('Enter');
    expect(values['pixels']).toBe('/01');
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain('Linha 2, coluna 2: cor 1');
  });

  it('virar de lado (Shift+H) e de cabeça (Shift+V)', async () => {
    await make({ width: '3', height: '2', pixels: '12' });
    key('H', { shiftKey: true });
    expect(values['pixels']).toBe('021');
    key('V', { shiftKey: true });
    expect(values['pixels']).toBe('/021');
  });

  it('dois dedos aproximam e não pintam', async () => {
    await make({ width: '8', height: '8' });
    const before = host.querySelector('.zoom-n')?.textContent;
    pointer('pointerdown', 2, 2, { pointerType: 'touch', pointerId: 1 });
    pointer('pointerdown', 4, 4, { pointerType: 'touch', pointerId: 2 });
    pointer('pointermove', 7, 7, { pointerType: 'touch', pointerId: 2 });
    pointer('pointerup', 7, 7, { pointerType: 'touch', pointerId: 2 });
    pointer('pointerup', 2, 2, { pointerType: 'touch', pointerId: 1 });
    expect(values['pixels'] ?? '').toBe('');
    expect(host.querySelector('.zoom-n')?.textContent).not.toBe(before);
  });

  it('as formas: a linha (L), o retângulo (U, de novo cheio) e a elipse (Shift+U); a prévia é o resultado e soltar é um passo', async () => {
    await make({ width: '5', height: '5' });
    key('l');
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 4, 4);
    // (a prévia já está na folha, antes de soltar)
    expect(values['pixels']).toBe('1/01/001/0001/00001');
    expect(host.querySelector('.forma-tam')?.textContent).toContain('5 × 5');
    pointer('pointermove', 4, 0);
    pointer('pointerup', 4, 0);
    expect(values['pixels']).toBe('1*05');
    key('z', { ctrlKey: true });
    expect(values['pixels']).toBe('');
    key('u');
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 3, 2);
    pointer('pointerup', 3, 2);
    expect(values['pixels']).toBe('1111/1001/1111');
    key('z', { ctrlKey: true });
    key('u');
    expect(host.querySelector('.opcoes .interruptor')?.getAttribute('aria-checked')).toBe('true');
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 1, 1);
    pointer('pointerup', 1, 1);
    expect(values['pixels']).toBe('11/11');
    key('z', { ctrlKey: true });
    // (o "Cheia" vale para as duas formas: continua ligado)
    key('U', { shiftKey: true });
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 4, 4);
    pointer('pointerup', 4, 4);
    expect(values['pixels']).toBe('0111/1*05/1*05/1*05/0111');
  });

  it('as formas com o Shift (quadrado) e o Ctrl (do meio para fora)', async () => {
    await make({ width: '5', height: '5' });
    key('u');
    pointer('pointerdown', 2, 2);
    pointer('pointermove', 3, 3, { ctrlKey: true });
    pointer('pointerup', 3, 3, { ctrlKey: true });
    expect(values['pixels']).toBe('/0111/0101/0111');
    key('z', { ctrlKey: true });
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 4, 2, { shiftKey: true });
    pointer('pointerup', 4, 2, { shiftKey: true });
    expect(values['pixels']).toBe('1*05/10001/10001/10001/1*05');
  });

  it('o Shift apertado com a forma na mão já a faz quadrada; cheia, o pincel grande não passa da caixa', async () => {
    await make({ width: '6', height: '6' });
    key('u');
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 3, 1);
    expect(values['pixels']).toBe('1111/1111');
    key('Shift', { shiftKey: true });
    expect(values['pixels']).toBe('1111/1001/1001/1111');
    pointer('pointerup', 3, 1, { shiftKey: true });
    key('z', { ctrlKey: true });
    key('u');
    key('+');
    key('+');
    pointer('pointerdown', 1, 1);
    pointer('pointermove', 2, 2);
    pointer('pointerup', 2, 2);
    expect(values['pixels']).toBe('/011/011');
  });
});
