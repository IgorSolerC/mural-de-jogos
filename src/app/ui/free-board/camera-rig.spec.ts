import { Camera } from '../../core/free-board-geometry';
import { CameraRig, DRAG_SLOP, RigHost, SETTLE_MS, fromTrackpad, wheelZoomFactor } from './camera-rig';

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class Host implements RigHost {
  applied: { camera: Camera; moving: boolean }[] = [];
  settled: Camera[] = [];
  size() {
    return { w: 800, h: 600 };
  }
  apply(camera: Camera, moving: boolean) {
    this.applied.push({ camera, moving });
  }
  settle(camera: Camera) {
    this.settled.push(camera);
  }
}

describe('Quadro livre: a câmera', () => {
  it('a roda do mouse dá zoom; a do trackpad (passos pequenos, quebrados ou de lado) anda', () => {
    expect(fromTrackpad({ deltaMode: 0, deltaX: 0, deltaY: 100 })).toBeFalse();
    expect(fromTrackpad({ deltaMode: 1, deltaX: 0, deltaY: 3 })).toBeFalse();
    expect(fromTrackpad({ deltaMode: 0, deltaX: 4, deltaY: 10 })).toBeTrue();
    expect(fromTrackpad({ deltaMode: 0, deltaX: 0, deltaY: 12.5 })).toBeTrue();
    expect(fromTrackpad({ deltaMode: 0, deltaX: 0, deltaY: 8 })).toBeTrue();
    // um dente de mouse: uns 14%; a pinça é mais sensível
    expect(wheelZoomFactor(100, false)).toBeCloseTo(0.86, 2);
    expect(wheelZoomFactor(-100, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(10, true)).toBeCloseTo(0.905, 2);
  });

  it('anda e dá zoom no ponto, uma aplicação por quadro de animação, e avisa quando para', async () => {
    const host = new Host();
    const rig = new CameraRig(host, { x: 0, y: 0, z: 1 });
    rig.panBy(100, 50);
    rig.panBy(100, 50);
    rig.zoomBy(2, { x: 0, y: 0 });
    await frame();
    expect(host.applied.length).toBe(1);
    expect(host.applied[0].camera).toEqual({ x: 200, y: 100, z: 2 });
    expect(host.settled).toEqual([]);
    await sleep(SETTLE_MS + 60);
    expect(host.settled).toEqual([{ x: 200, y: 100, z: 2 }]);
  });

  it('o zoom fica entre 5% e 400%', () => {
    const rig = new CameraRig(new Host(), { x: 0, y: 0, z: 1 });
    rig.zoomBy(100, { x: 0, y: 0 });
    expect(rig.camera.z).toBe(4);
    rig.zoomBy(0.0001, { x: 0, y: 0 });
    expect(rig.camera.z).toBe(0.05);
  });

  it('com movimento reduzido, a viagem é um pulo', async () => {
    const host = new Host();
    const rig = new CameraRig(host, { x: 0, y: 0, z: 1 });
    rig.flyTo({ x: 500, y: 500, z: 0.5 }, true);
    expect(rig.camera).toEqual({ x: 500, y: 500, z: 0.5 });
    rig.flyTo({ x: 0, y: 0, z: 1 }, false);
    await sleep(450);
    expect(rig.camera.x).toBeCloseTo(0, 3);
    expect(rig.camera.z).toBeCloseTo(1, 3);
  });

  describe('os gestos', () => {
    let el: HTMLElement;
    let host: Host;
    let rig: CameraRig;
    let off: () => void;

    beforeEach(() => {
      el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px';
      document.body.appendChild(el);
      host = new Host();
      rig = new CameraRig(host, { x: 0, y: 0, z: 1 });
      off = rig.attach(el);
    });
    afterEach(() => {
      off();
      el.remove();
    });

    const ptr = (type: string, x: number, y: number, extra: PointerEventInit = {}) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, ...extra }));

    it('arrastar mais que 4 px anda (para o lado contrário do arrasto), e o clique que fecha o arrasto não chega à peça', () => {
      const clicks = jasmine.createSpy('clique');
      el.addEventListener('click', clicks);
      ptr('pointerdown', 100, 100);
      ptr('pointermove', 100 + DRAG_SLOP - 1, 100);
      expect(rig.camera.x).toBe(0);
      ptr('pointermove', 160, 130);
      expect(rig.camera).toEqual({ x: -60, y: -30, z: 1 });
      ptr('pointerup', 160, 130);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(clicks).not.toHaveBeenCalled();
      // o próximo clique, sem arrasto, chega
      ptr('pointerdown', 10, 10);
      ptr('pointerup', 10, 10);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(clicks).toHaveBeenCalledTimes(1);
    });

    it('dois dedos: a pinça dá zoom no meio deles', () => {
      const touch = (type: string, id: number, x: number, y: number) =>
        el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'touch' }));
      touch('pointerdown', 1, 300, 300);
      touch('pointerdown', 2, 500, 300);
      touch('pointermove', 2, 700, 300);
      // a distância dobrou: zoom 2, e o ponto do mundo do meio de antes (400, 300) foi para o meio de agora (500, 300)
      expect(rig.camera.z).toBeCloseTo(2, 5);
      expect(rig.camera.x + 500 / 2).toBeCloseTo(400, 5);
      expect(rig.camera.y + 300 / 2).toBeCloseTo(300, 5);
      touch('pointerup', 1, 300, 300);
      touch('pointerup', 2, 700, 300);
    });

    it('a roda: o mouse dá zoom no ponteiro, Shift anda de lado, Ctrl (a pinça do trackpad) dá zoom, o trackpad anda', () => {
      const wheel = (init: WheelEventInit) => el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 200, clientY: 100, ...init }));
      wheel({ deltaY: 100 });
      expect(rig.camera.z).toBeCloseTo(0.86, 2);
      // o ponto debaixo do ponteiro ficou parado
      expect(rig.camera.x + 200 / rig.camera.z).toBeCloseTo(200, 5);
      const z = rig.camera.z;
      const x = rig.camera.x;
      wheel({ deltaY: 100, shiftKey: true });
      expect(rig.camera.z).toBe(z);
      expect(rig.camera.x).toBeGreaterThan(x);
      wheel({ deltaY: -10, ctrlKey: true });
      expect(rig.camera.z).toBeGreaterThan(z);
      const before = rig.camera;
      wheel({ deltaX: 6, deltaY: 3.5 });
      expect(rig.camera.z).toBe(before.z);
      expect(rig.camera.y).toBeGreaterThan(before.y);
    });
  });
});
