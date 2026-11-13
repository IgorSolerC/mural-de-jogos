import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { fitInGrid, floodFill, flipH, flipV, inkOf, lineCells, paintCells, quantize, shiftGrid } from '../core/pixel-art';
import { WidgetValues, widgetDef } from '../core/widgets';
import { PixelCanvas } from './pixel-canvas';

/** O que a prancheta faz com os pontos, sem a tela. */
describe('pixel art: as ferramentas', () => {
  it('a reta não pula ponto, para qualquer lado', () => {
    expect(lineCells({ x: 0, y: 0 }, { x: 3, y: 1 }).length).toBe(4);
    expect(lineCells({ x: 2, y: 2 }, { x: 2, y: 0 })).toEqual([
      { x: 2, y: 2 },
      { x: 2, y: 1 },
      { x: 2, y: 0 },
    ]);
  });

  it('o balde enche a mancha pelos lados, não pelas quinas, e só dentro da grade', () => {
    const rows = ['0100', '1000', '0000'];
    expect(floodFill(rows, { x: 3, y: 0 }, 5, 4, 3)).toEqual(['0155', '1555', '5555']);
    // a quina (0,0) fica de fora: está cercada pelos lados
    expect(floodFill(rows, { x: 0, y: 0 }, 5, 4, 3)[0]).toBe('5100');
    // o que está fora da grade não muda
    expect(floodFill(['0000'], { x: 0, y: 0 }, 2, 2, 1)).toEqual(['2200']);
  });

  it('virar, de lado e de cabeça, e empurrar dando a volta', () => {
    expect(flipH(['1200', '0000'], 3, 2)).toEqual(['0210', '0000']);
    expect(flipV(['1', '2', '3'], 1, 2)).toEqual(['2', '1', '3']);
    expect(shiftGrid(['100', '000'], 1, 0, 3, 2)).toEqual(['010', '000']);
    expect(shiftGrid(['001', '000'], 1, 1, 3, 2)).toEqual(['000', '100']);
  });

  it('a imagem: cada ponto na cor mais perto da paleta, e o quase transparente fica transparente', () => {
    const inks = inkOf('classica', {});
    // vermelho puro, quase preto, branco, e um ponto meio transparente
    const data = [255, 0, 0, 255, 10, 10, 10, 255, 255, 255, 255, 255, 255, 0, 0, 60];
    expect(quantize(data, 4, 1, inks)).toEqual(['4120']);
  });

  it('a imagem cabe inteira na grade, no meio, sem deformar', () => {
    expect(fitInGrid(200, 100, 16, 16)).toEqual({ x: 0, y: 4, w: 16, h: 8 });
    expect(fitInGrid(10, 40, 16, 16)).toEqual({ x: 6, y: 0, w: 4, h: 16 });
  });

  it('pintar devolve fileiras novas e deixa as de antes como estavam', () => {
    const before = ['00', '00'];
    const after = paintCells(before, [{ x: 1, y: 1 }], 7);
    expect(after).toEqual(['00', '07']);
    expect(before).toEqual(['00', '00']);
  });
});

/** A prancheta na folha: o mouse, o teclado, o espelho, o desfazer e o que ela manda para a folha. */
describe('pixel art: a prancheta', () => {
  let fixture: ComponentFixture<PixelCanvas>;
  let values: WidgetValues;
  let svg: SVGSVGElement;

  async function make(start: WidgetValues): Promise<void> {
    TestBed.configureTestingModule({ imports: [PixelCanvas], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(PixelCanvas);
    values = { ...start };
    fixture.componentRef.setInput('values', values);
    fixture.componentInstance.changed.subscribe((p) => {
      values = { ...values, ...p };
      fixture.componentRef.setInput('values', values);
    });
    document.body.appendChild(fixture.nativeElement);
    fixture.nativeElement.style.width = '600px';
    fixture.detectChanges();
    await fixture.whenStable();
    svg = fixture.nativeElement.querySelector('svg.prancheta');
  }
  afterEach(() => {
    fixture?.nativeElement.remove();
    TestBed.resetTestingModule();
  });

  /** O mouse no meio do ponto (x, y) da grade de `w` × `h`. */
  function pointer(type: string, x: number, y: number, w: number, h: number, extra: PointerEventInit = {}): void {
    const r = svg.getBoundingClientRect();
    const init = { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: r.left + ((x + 0.5) / w) * r.width, clientY: r.top + ((y + 0.5) / h) * r.height, ...extra };
    svg.dispatchEvent(new PointerEvent(type, init));
  }
  function key(k: string, extra: KeyboardEventInit = {}, on: Element = svg): void {
    on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
  }
  const marked = () => widgetDef('pixel')!.write(values);

  it('a grade nova começa 16 × 16 nos campos', async () => {
    await make({});
    expect(values['width']).toBe('16');
    expect(values['height']).toBe('16');
  });

  it('arrastar pinta a reta toda; o botão direito apaga; um arrasto é um passo do desfazer', async () => {
    await make({ width: '4', height: '2' });
    pointer('pointerdown', 0, 0, 4, 2);
    pointer('pointermove', 3, 0, 4, 2);
    pointer('pointerup', 3, 0, 4, 2);
    expect(values['pixels']).toBe('1111');
    pointer('pointerdown', 1, 0, 4, 2, { button: 2, buttons: 2 });
    pointer('pointerup', 1, 0, 4, 2, { button: 2 });
    expect(values['pixels']).toBe('1011');
    key('z', { ctrlKey: true });
    expect(values['pixels']).toBe('1111');
    key('z', { ctrlKey: true });
    expect(values['pixels']).toBe('');
    key('y', { ctrlKey: true });
    expect(values['pixels']).toBe('1111');
  });

  it('os números escolhem a cor, o G é o balde e o M liga o espelho', async () => {
    await make({ width: '4', height: '2' });
    key('4');
    key('g');
    pointer('pointerdown', 0, 0, 4, 2);
    pointer('pointerup', 0, 0, 4, 2);
    expect(values['pixels']).toBe('4444/4444');
    key('2');
    key('b');
    key('m');
    pointer('pointerdown', 0, 1, 4, 2);
    pointer('pointerup', 0, 1, 4, 2);
    expect(values['pixels']).toBe('4444/2442');
    expect(marked()).toEqual(['4x2', '4444/2442']);
  });

  it('no teclado: as setas andam, o Espaço pinta, o Delete apaga, e Alt+seta empurra', async () => {
    await make({ width: '3', height: '1' });
    svg.focus();
    key('ArrowRight');
    key(' ');
    expect(values['pixels']).toBe('01');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sr-only').textContent).toContain('Linha 1, coluna 2');
    key('ArrowRight', { altKey: true });
    expect(values['pixels']).toBe('001');
    key('ArrowRight');
    key('Delete');
    expect(values['pixels']).toBe('');
  });

  it('o conta-gotas pega a cor do ponto e volta para o lápis', async () => {
    await make({ width: '2', height: '1', pixels: '07' });
    key('i');
    pointer('pointerdown', 1, 0, 2, 1);
    pointer('pointerup', 1, 0, 2, 1);
    key('ArrowLeft');
    key(' ');
    expect(values['pixels']).toBe('77');
  });

  it('diminuir a grade só esconde a beirada: crescer de novo traz de volta', async () => {
    await make({ width: '4', height: '1', pixels: '1001' });
    fixture.componentRef.setInput('values', (values = { ...values, width: '2' }));
    fixture.detectChanges();
    expect(marked()).toEqual(['2x1', '1']);
    fixture.componentRef.setInput('values', (values = { ...values, width: '4' }));
    fixture.detectChanges();
    expect(marked()).toEqual(['4x1', '1001']);
  });

  it('os tamanhos de sempre num toque, e o aviso dos pontos que ficaram fora da grade', async () => {
    await make({ width: '4', height: '1', pixels: '1001' });
    (fixture.nativeElement.querySelector('button.pc-grade') as HTMLButtonElement).click();
    expect([values['width'], values['height']]).toEqual(['8', '8']);
    fixture.componentRef.setInput('values', (values = { ...values, width: '2', height: '1' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pc-fora')?.textContent).toContain('Um ponto pintado ficou fora da grade');
  });

  it('a cor trocada vai escrita e volta à da paleta', async () => {
    await make({ width: '1', height: '1', pixels: '3' });
    const canvas = fixture.componentInstance as unknown as { chooseInk(n: number): void; setColor(v: string): void; resetColor(n: number): void };
    canvas.chooseInk(3);
    canvas.setColor('#00ff00');
    expect(values['colors']).toBe('3#00ff00');
    expect(marked()).toEqual(['1x1', '3', '3#00ff00']);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pastilha.trocada')).not.toBeNull();
    canvas.resetColor(3);
    expect(values['colors']).toBe('');
    // trocar a cor também é um passo do desfazer
    key('z', { ctrlKey: true });
    expect(values['colors']).toBe('3#00ff00');
  });

  it('a grade escrita maior que 64 volta para 64', async () => {
    await make({ width: '70', height: '8' });
    expect(values['width']).toBe('64');
  });

  it('trazer uma imagem: escolhida ou colada, ela vira os pontos, num passo do desfazer', async () => {
    await make({ width: '4', height: '4', pixels: '1' });
    // uma imagem de 8 × 4: a metade de cima vermelha, a de baixo azul, sem fundo nos lados
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 4;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#d8433b';
    ctx.fillRect(0, 0, 8, 2);
    ctx.fillStyle = '#3a6fc4';
    ctx.fillRect(0, 2, 8, 2);
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/png'));
    const file = new File([blob], 'img.png', { type: 'image/png' });
    const data = new DataTransfer();
    data.items.add(file);
    svg.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 300));
    await fixture.whenStable();
    // a imagem é 2 por 1: cabe 4 × 2, no meio da altura
    expect(values['pixels']).toBe('/4444/8888');
    key('z', { ctrlKey: true });
    expect(values['pixels']).toBe('1');
  });

  it('o segundo dedo não começa outro arrasto por cima do primeiro', async () => {
    await make({ width: '4', height: '1' });
    pointer('pointerdown', 0, 0, 4, 1, { pointerId: 1, pointerType: 'touch' });
    pointer('pointerdown', 3, 0, 4, 1, { pointerId: 2, pointerType: 'touch' });
    pointer('pointermove', 3, 0, 4, 1, { pointerId: 2, pointerType: 'touch' });
    pointer('pointerup', 3, 0, 4, 1, { pointerId: 2, pointerType: 'touch' });
    pointer('pointermove', 1, 0, 4, 1, { pointerId: 1, pointerType: 'touch' });
    pointer('pointerup', 1, 0, 4, 1, { pointerId: 1, pointerType: 'touch' });
    expect(values['pixels']).toBe('11');
    // e um passo só no desfazer volta tudo
    key('z', { ctrlKey: true });
    expect(values['pixels']).toBe('');
  });

  it('cinco ou mais pontos iguais saem abreviados, e o abreviado de fora abre por extenso', async () => {
    await make({ width: '6', height: '1' });
    pointer('pointerdown', 0, 0, 6, 1);
    pointer('pointermove', 5, 0, 6, 1);
    pointer('pointerup', 5, 0, 6, 1);
    expect(values['pixels']).toBe('1*06');
    fixture.componentRef.setInput('values', (values = { ...values, pixels: '0*052' }));
    fixture.detectChanges();
    expect(marked()).toEqual(['6x1', '0*052']);
    key('1');
    svg.focus();
    key(' ');
    expect(values['pixels']).toBe('100002');
  });

  it('a mudança de fora (outro desenho) troca a prancheta e esvazia o desfazer', async () => {
    await make({ width: '2', height: '1', pixels: '1' });
    fixture.componentRef.setInput('values', (values = { ...values, pixels: '22' }));
    fixture.detectChanges();
    key('z', { ctrlKey: true });
    expect(values['pixels']).toBe('22');
  });
});
