import { keptTilt } from './wall-cards';

describe('a inclinação na colagem das fichas inteiras', () => {
  it('a ficha curta fica torta como sempre; a muito comprida, reta', () => {
    expect(keptTilt(260, 3.4, 17)).toBe(1);
    expect(keptTilt(380, 2, 17)).toBe(1);
    expect(keptTilt(960, 3.4, 25)).toBe(0);
    expect(keptTilt(2400, 0.8, 25)).toBe(0);
  });

  it('quanto mais comprida, menos torta', () => {
    let last = 1;
    for (let h = 200; h <= 1000; h += 20) {
      const k = keptTilt(h, 3.4, 20);
      expect(k).withContext(`${h}px`).toBeLessThanOrEqual(last);
      last = k;
    }
  });

  it('o pé da ficha nunca passa do meio do vão, nem com a inclinação maior', () => {
    for (let h = 60; h <= 3000; h += 7) {
      for (const tilt of [0.8, 1.5, 2.6, 3.4]) {
        for (const room of [17, 20, 25]) {
          const deg = tilt * keptTilt(h, tilt, room);
          const reach = (h - 12) * Math.sin((deg * Math.PI) / 180);
          expect(reach).withContext(`${h}px, ${tilt}°, ${room}px`).toBeLessThanOrEqual(room - 1);
        }
      }
    }
  });
});
