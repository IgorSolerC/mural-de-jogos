import { DRAG_HOLD, DragHold, DragHoldConfig, DragStart, edgeSpeed } from './drag-hold';

/**
 * O gesto de arrastar do site (o do Kanban e o da parede das anotações): o mouse arrasta depois da folga;
 * o dedo, depois de segurar; andar antes de segurar é rolar; o Esc cancela; o dedo que segura e solta
 * parado abre o menu.
 */
describe('o gesto de arrastar (DragHold)', () => {
  let calls: string[];
  let el: HTMLElement;
  let drag: DragHold<string>;
  let holdTo: DragStart<string> | null;

  const config = (extra: Partial<DragHoldConfig<string>> = {}): DragHoldConfig<string> => ({
    begin: (s) => {
      calls.push(`begin:${s.item}`);
      return true;
    },
    move: (x, y) => calls.push(`move:${Math.round(x)},${Math.round(y)}`),
    drop: () => calls.push('drop'),
    end: () => calls.push('end'),
    hold: (s) => {
      holdTo = s;
      calls.push('hold');
    },
    ...extra,
  });
  const ev = (type: string, x: number, y: number, pointerType = 'mouse', id = 1) =>
    new PointerEvent(type, { clientX: x, clientY: y, pointerType, pointerId: id, isPrimary: true, button: 0, bubbles: true, cancelable: true });
  const down = (x: number, y: number, pointerType = 'mouse') => drag.down(ev('pointerdown', x, y, pointerType), 'a', el);
  const move = (x: number, y: number, pointerType = 'mouse') => window.dispatchEvent(ev('pointermove', x, y, pointerType));
  const up = (x: number, y: number, pointerType = 'mouse') => window.dispatchEvent(ev('pointerup', x, y, pointerType));

  beforeEach(() => {
    calls = [];
    holdTo = null;
    el = document.createElement('div');
    document.body.append(el);
    drag = new DragHold(config());
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 10, 9));
  });
  afterEach(() => {
    drag.cancel();
    // (o clique engolido depois de soltar sai no próximo tique: nada fica preso para os outros testes)
    jasmine.clock().tick(1);
    jasmine.clock().uninstall();
    el.remove();
  });

  it('o mouse arrasta só depois de andar uns pixels; soltar cai, e o clique de depois não vale', () => {
    down(100, 100);
    move(103, 102);
    expect(drag.active).toBeFalse();
    move(110, 100);
    expect(drag.active).toBeTrue();
    expect(calls).toEqual(['begin:a', 'move:110,100']);
    up(110, 100);
    expect(calls).toEqual(['begin:a', 'move:110,100', 'drop', 'end']);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(click);
    expect(click.defaultPrevented).toBeTrue();
    expect(drag.pending).toBeFalse();
  });

  it('um clique sem andar não arrasta nem solta nada', () => {
    down(100, 100);
    up(100, 100);
    expect(calls).toEqual(['end']);
  });

  it('o dedo arrasta depois de segurar; andar antes disso é rolar a tela', () => {
    down(50, 50, 'touch');
    move(50, 80, 'touch');
    expect(calls).toEqual(['end']);
    expect(drag.pending).toBeFalse();
    calls = [];
    down(50, 50, 'touch');
    jasmine.clock().tick(DRAG_HOLD + 1);
    expect(drag.active).toBeTrue();
    move(60, 120, 'touch');
    up(60, 120, 'touch');
    expect(calls).toEqual(['begin:a', 'move:50,50', 'move:60,120', 'drop', 'end']);
  });

  it('o dedo que segura o tempo do toque longo e solta parado abre o menu, sem soltar nada', () => {
    down(40, 40, 'touch');
    jasmine.clock().tick(600);
    up(40, 40, 'touch');
    expect(calls).toEqual(['begin:a', 'move:40,40', 'end', 'hold']);
    expect(holdTo).toEqual(jasmine.objectContaining({ item: 'a', x: 40, y: 40, touch: true }));
  });

  it('o Esc cancela no meio, e o que vier depois não cai', () => {
    down(0, 0);
    move(20, 0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(drag.active).toBeFalse();
    up(20, 0);
    expect(calls).toEqual(['begin:a', 'move:20,0', 'end']);
  });

  it('quem não quer arrastar (begin falso) encerra o gesto', () => {
    drag = new DragHold(config({ begin: () => false }));
    down(0, 0);
    move(30, 0);
    expect(drag.active).toBeFalse();
    expect(drag.pending).toBeFalse();
    expect(calls).toEqual(['end']);
  });

  it('a velocidade da beirada cresce perto dela', () => {
    expect(edgeSpeed(70, 70)).toBe(0);
    expect(edgeSpeed(35, 70)).toBe(9);
    expect(edgeSpeed(-5, 70)).toBe(18);
  });
});
