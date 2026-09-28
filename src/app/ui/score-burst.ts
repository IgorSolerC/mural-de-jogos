/** Estrela de papel recortada à mão: 18 pontas levemente irregulares (a do pendente, ainda por recortar). */
export const BURST_POINTS = (() => {
  const n = 18;
  const jitter = [0, 3, -2, 4, -3, 1, 2, -4, 3, -1, 4, -2, 1, -3, 2, 0, -2, 3];
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const outer = i % 2 === 0;
    const r = outer ? 48 + jitter[(i / 2) % n] * 0.5 : 37 + jitter[((i - 1) / 2) % n] * 0.3;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
})();
