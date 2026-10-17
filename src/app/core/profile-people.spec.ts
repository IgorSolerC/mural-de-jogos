import { photoTilt } from './profile-people';

describe('photoTilt', () => {
  it('fica entre −4 e +4 graus e é sempre o mesmo para o mesmo código', () => {
    for (const code of ['AB12CD', 'ZZZZZZ', '', 'código-com-acento']) {
      const t = photoTilt(code);
      expect(t).toBeGreaterThanOrEqual(-4);
      expect(t).toBeLessThanOrEqual(4);
      expect(photoTilt(code)).toBe(t);
    }
  });

  it('é a mesma conta de antes (h * 31, módulo 9)', () => {
    let h = 0;
    for (const c of 'K7Q2MX') h = (h * 31 + c.charCodeAt(0)) | 0;
    expect(photoTilt('K7Q2MX')).toBe((Math.abs(h) % 9) - 4);
    expect(photoTilt('')).toBe(-4);
  });
});
