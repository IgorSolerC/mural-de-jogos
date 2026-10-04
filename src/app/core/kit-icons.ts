/**
 * Os ícones do estojo da ficha para os rabiscos, os estragos, as manchas e as decorações: um desenho a
 * giz de cada, num quadro de 40×40, como os das estampas (traço de `currentColor`; `class='f'` pinta).
 * Só desenhos nossos, nada que a pessoa escreveu.
 */
import type { Damage, Decor, Scribble, Stain } from './paper';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Uma estrela de `n` pontas em volta de `cx,cy`. */
function star(cx: number, cy: number, R: number, r: number, n = 5, rot = -90): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180,
      rr = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${r1(cx + Math.cos(a) * rr)} ${r1(cy + Math.sin(a) * rr)}`;
  }
  return d + 'Z';
}

/** Contas em volta de um círculo. */
function beads(cx: number, cy: number, R: number, n: number, r: number, skip: (i: number) => boolean = () => false): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    if (skip(i)) continue;
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    out += `<circle cx='${r1(cx + Math.cos(a) * R)}' cy='${r1(cy + Math.sin(a) * R)}' r='${r}'/>`;
  }
  return out;
}

/** Um desenho de pixels, cheio: cada `#` vira um quadradinho de `cell` a partir de `x0,y0`. */
function pix(rows: string[], x0: number, y0: number, cell: number): string {
  let d = '';
  rows.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && (d += `M${r1(x0 + i * cell)} ${r1(y0 + j * cell)}h${cell}v${cell}h-${cell}Z`)));
  return d;
}

/** A trama neotribal miúda: dois fios espinhentos trançados e uma membrana furada entre eles. */
const TRIBAL =
  `<path d='M12 2C20 10 6 18 14 26S22 34 16 38' style='stroke-width:2'/><path d='M28 2C20 10 34 18 26 26S18 34 24 38' style='stroke-width:1.6'/>` +
  `<path class='f' d='M14.6 7.4L10 5.6L13 8.6ZM11.4 16L6.6 15.6L10.2 17.8ZM16.8 29L21 27.6L17.4 31ZM25.4 6.8L30 4.8L27 8.2ZM29 17.4L33.6 17.2L30 19.2ZM23 31.4L18.6 30.6L22.4 33.4Z'/>` +
  `<path class='f' fill-rule='evenodd' d='M20 14C24.4 16 25 21 20 25.6C15 21 15.6 16 20 14ZM18.6 18.4A1.4 1.8 0 1 0 18.6 18.5ZM21.6 20.6A1.2 1.6 0 1 0 21.6 20.7Z'/>`;

export const SCRIBBLE_ICON: Record<Scribble, string> = {
  contorno: `<path d='M6 7.5H34V32.5H6Z'/><path d='M3.5 9.8L35.8 9.2M36 30.4L4.4 30.8M8.2 35.6L7.8 4.6M32.2 4.2L31.6 35.4' style='stroke-width:1.4'/>`,
  moldura: `<path d='M4 6H36V34H4Z'/><path d='M9 11H31V29H9Z' style='stroke-width:1.6'/><path class='f' d='M9 8.6L11.4 11L9 13.4L6.6 11ZM31 8.6L33.4 11L31 13.4L28.6 11ZM31 26.6L33.4 29L31 31.4L28.6 29ZM9 26.6L11.4 29L9 31.4L6.6 29Z'/>`,
  gotica: `<path d='M12 36V16C12 10.4 15.4 6.2 20 3.6C24.6 6.2 28 10.4 28 16V36'/><path d='M16 36V18.4C16 14.8 17.8 12.2 20 10.8C22.2 12.2 24 14.8 24 18.4V36' style='stroke-width:1.4'/><path d='M3 36V24C3 20.6 5 18.2 7.5 16.6C10 18.2 12 20.6 12 24M28 24C28 20.6 30 18.2 32.5 16.6C35 18.2 37 20.6 37 24V36'/><path d='M20 3.6V-.4M18.4 1.2H21.6' style='stroke-width:1.4'/>`,
  cybertribal: TRIBAL,
  arabesco: `<path d='M4 34C4 22 13 16.6 19.4 20.4C23.8 23 21.4 29.4 16.8 28C13.6 27 14.4 22.8 17.4 23.4'/><path d='M36 6C36 18 27 23.4 20.6 19.6C16.2 17 18.6 10.6 23.2 12C26.4 13 25.6 17.2 22.6 16.6'/><path d='M9 26.4Q7.4 23 9.2 20.6Q11 23.4 9 26.4ZM31 13.6Q32.6 17 30.8 19.4Q29 16.6 31 13.6Z' class='f'/>`,
  dialogo: `<path d='M8 5H32V7H34V9H36V31H34V33H32V35H8V33H6V31H4V9H6V7H8Z'/><path d='M9 10H31V30H9Z' style='stroke-width:1.4'/><path class='f' d='M22 23H30L26 27.4Z'/><path d='M13 15H25M13 19H21' style='stroke-width:1.8'/>`,
  hud: `<path d='M4 13V4H13M27 4H36V13M36 27V36H27M13 36H4V27'/><circle cx='20' cy='20' r='6.4'/><path d='M20 9V14.4M20 25.6V31M9 20H14.4M25.6 20H31'/><circle class='f' cx='20' cy='20' r='1.4'/>`,
  runas: `<path d='M4 6H36V34H4Z' style='stroke-width:1.5'/><path d='M10 12V28M10 15L15 12.4M10 19.6L15 17M20 12V28M16.4 15.6L20 12L23.6 15.6M20 20L16.4 23.6M20 20L23.6 23.6M26.6 12V28M26.6 12L31 15.6L26.6 19.2L31 28'/>`,
  farpado: `<path d='M2 14C6 10 10 18 14 14S22 10 26 14S34 18 38 14'/><path d='M2 14C6 18 10 10 14 14S22 18 26 14S34 10 38 14' style='stroke-width:1.6'/><path d='M8 9L12 19M12 9L8 19M28 9L32 19M32 9L28 19'/><path d='M2 30C6 26 10 34 14 30S22 26 26 30S34 34 38 30' style='stroke-width:1.6'/><path d='M18 25L22 35M22 25L18 35'/>`,
  renda: `<path d='M3 22A4.25 4.25 0 0 1 11.5 22A4.25 4.25 0 0 1 20 22A4.25 4.25 0 0 1 28.5 22A4.25 4.25 0 0 1 37 22'/><path d='M3 29H37' style='stroke-dasharray:3 2.6;stroke-width:1.6'/>${[7.25, 15.75, 24.25, 32.75].map((x) => `<circle cx='${x}' cy='17' r='1.5'/>`).join('')}<path d='M3 10H37' style='stroke-width:1.4'/>`,
  cupom: `<path d='M4 8H36V32H4Z' style='stroke-dasharray:3.4 2.6'/><g transform='translate(15 20) rotate(-18) scale(.52) translate(-20 -20)'><circle cx='8.5' cy='12.5' r='5'/><circle cx='8.5' cy='27.5' r='5'/><path d='M12.6 15.4L24.2 20L37.5 25.6M12.6 24.6L24.2 20L37.5 14.4'/></g>`,
  pelicula: `<path d='M3 6H37V34H3Z'/><path d='M3 12H37M3 28H37' style='stroke-width:1.6'/>${[6.5, 13.5, 20.5, 27.5, 33.5].map((x) => `<rect class='f' x='${x - 1.6}' y='7.6' width='3.2' height='2.8' rx='.6'/><rect class='f' x='${x - 1.6}' y='29.6' width='3.2' height='2.8' rx='.6'/>`).join('')}<path d='M12 16L28 24' style='stroke-width:1.4'/>`,
  regua: `<path d='M4 30L30 4L36 10L10 36Z'/><path d='M9 25L12 28M13 21L15 23M17 17L20 20M21 13L23 15M25 9L28 12' style='stroke-width:1.7'/>`,
  trepadeira: `<path d='M3 37V3H37' style='stroke-width:1.2;opacity:.55'/><path d='M7 37C9.4 31 5.4 27 8 22S10.6 13 9 9C12.6 9.4 15 7 19 7.6S27 8.6 31 6.6' style='stroke-width:2.1'/><path d='M31 6.6C34 5.2 36 7.4 34.8 9.4C34 10.6 32.4 10 32.8 8.8' style='stroke-width:1.5'/><path d='M7.6 23.4C4.6 23 4 20 6 19.4' style='stroke-width:1.4'/><path class='f' transform='translate(8.2 30.4) rotate(58) scale(1)' d='M0 0C-2.6 -.6 -5.4 -2.6 -4.2 -5.4C-3.4 -7 -1.6 -6.8 -1 -6.2C-1.2 -8 0 -9.4 0 -9.4C0 -9.4 1.2 -8 1 -6.2C1.6 -6.8 3.4 -7 4.2 -5.4C5.4 -2.6 2.6 -.6 0 0Z'/><path class='f' transform='translate(7.4 17.2) rotate(-62) scale(0.95)' d='M0 0C-2.6 -.6 -5.4 -2.6 -4.2 -5.4C-3.4 -7 -1.6 -6.8 -1 -6.2C-1.2 -8 0 -9.4 0 -9.4C0 -9.4 1.2 -8 1 -6.2C1.6 -6.8 3.4 -7 4.2 -5.4C5.4 -2.6 2.6 -.6 0 0Z'/><path class='f' transform='translate(14.6 8.2) rotate(-150) scale(0.9)' d='M0 0C-2.6 -.6 -5.4 -2.6 -4.2 -5.4C-3.4 -7 -1.6 -6.8 -1 -6.2C-1.2 -8 0 -9.4 0 -9.4C0 -9.4 1.2 -8 1 -6.2C1.6 -6.8 3.4 -7 4.2 -5.4C5.4 -2.6 2.6 -.6 0 0Z'/><path class='f' transform='translate(24 8.4) rotate(-28) scale(0.95)' d='M0 0C-2.6 -.6 -5.4 -2.6 -4.2 -5.4C-3.4 -7 -1.6 -6.8 -1 -6.2C-1.2 -8 0 -9.4 0 -9.4C0 -9.4 1.2 -8 1 -6.2C1.6 -6.8 3.4 -7 4.2 -5.4C5.4 -2.6 2.6 -.6 0 0Z'/>`,
  bandeirinhas: `<path d='M2 8Q20 18 38 8'/><path class='f' d='M6 10L12 13L8.4 20Z'/><path d='M14.6 13.6L21 14.2L18.4 22Z'/><path class='f' d='M23.6 13.8L30 11.8L29.4 20.2Z'/><path d='M32 10.6L37 8L37.6 16.4Z'/>`,
  terco: `${beads(22, 15, 11, 16, 1.5, (i) => i === 8)}<path d='M17.6 25.4L14 30' style='stroke-width:1.5'/><path d='M12.6 30V38.4M9 33.4H16.2'/>`,
  invocacao: `<circle cx='20' cy='20' r='16'/><circle cx='20' cy='20' r='12.4' style='stroke-width:1.4'/><path d='M20 7.6L27.3 30L8.2 16.2H31.8L12.7 30Z' style='stroke-width:1.5'/>`,
  tesouro: `<path d='M4 32C10 30 8 22 14 20S24 24 26 18' style='stroke-dasharray:2.8 2.6'/><path d='M27 9L35 17M35 9L27 17' style='stroke-width:3'/><circle cx='8' cy='9' r='4.4' style='stroke-width:1.6'/><path class='f' d='M8 3.2L9.3 9L8 14.8L6.7 9Z'/>`,
  olhos: `<path d='M3 20Q20 4 37 20Q20 36 3 20Z'/><circle cx='20' cy='20' r='6.4'/><circle class='f' cx='20' cy='20' r='3'/><path d='M9 12.4L7 9M15 9.4L14 5.6M25 9.4L26 5.6M31 12.4L33 9' style='stroke-width:1.7'/>`,
  aula: `<path d='${star(12, 12, 7.4, 3.2)}' style='stroke-width:1.8'/><path d='M28 36C22.8 32 19.6 29.4 19.6 26C19.6 23.8 21.2 22.4 23 22.4C24.6 22.4 25.8 23.4 26.4 24.6C27 23.4 28.2 22.4 29.8 22.4C31.6 22.4 33.2 23.8 33.2 26C33.2 29.4 30 32 28 36Z' style='stroke-width:1.8'/><circle cx='29' cy='10' r='6'/><path d='M26.6 9.2v.2M31.4 9.2v.2M26.6 12.4Q29 14.4 31.4 12.4'/><path d='M4 32Q8 26 12 32T20 32' style='stroke-width:1.8'/>`,
  novelo: `<path d='M8 22C8 10 31 8 32 18C33 28 12 32 11 22C10 14 27 12 28 20C29 26 16 27 16 21C16 17 23 16 24 20C24.4 22.4 20 23 19.6 21'/><path d='M32 18Q36 24 38 33' style='stroke-width:1.6'/>`,
  hachura: `<path d='M4 16L16 4M4 24L24 4M4 32L32 4M8 36L36 8M16 36L36 16M24 36L36 24'/>`,
  riscado: `<path d='M5 11L35 8L6 17L34 15L7 24L33 22L8 30L31 29'/>`,
  pixelart: `${[3, 12, 21, 30].map((x) => `<rect x='${x}' y='3' width='6' height='6'/><rect x='${x}' y='31' width='6' height='6'/>`).join('')}<rect x='3' y='17' width='6' height='6'/><rect x='31' y='17' width='6' height='6'/><path class='f' d='${pix(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], 12.3, 13.4, 2.2)}'/>`,
  janela: `<path d='M4 6H36V34H4Z'/><path d='M4 12.4H36M30.6 12.4V34M30.6 17.4H36' style='stroke-width:1.5'/><path d='M27.4 8.4L30 11M30 8.4L27.4 11M22 9.7H24.6' style='stroke-width:1.4'/><path class='f' d='M14 17V31L17.4 28L19.6 32.6L21.8 31.6L19.6 27H24Z'/>`,
  circuito: `<path d='M14 14H26V26H14Z'/><path d='M17.4 14V9.6M22.6 14V9.6M17.4 26V30.4M22.6 26V30.4' style='stroke-width:1.5'/><path d='M3 8H9L13.6 12.6M37 32H31L26.4 27.4M3 30H8L12 26' style='stroke-width:1.5'/><circle cx='4' cy='8' r='2.2'/><circle cx='36' cy='32' r='2.2'/><circle cx='4' cy='30' r='2.2'/><circle class='f' cx='16.6' cy='16.6' r='1'/>`,
  blocos: `<path d='M4 8V36H36V8' style='stroke-width:1.4'/><path d='M6 34V28H12V22H18V34ZM18 34V28H34V34ZM24 28V22H30V28' style='stroke-width:1.6'/><path class='f' d='M20 4H25V9H30V14H20Z'/><path d='M22.5 1V-1M27.5 6V3' style='stroke-width:1.2;stroke-dasharray:1.4 1.4'/>`,
  codigo: `<path d='M6.4 8.4L9.6 5.4V16.6M6.4 16.6H12.6'/><ellipse cx='25' cy='11' rx='4.4' ry='5.8'/><ellipse cx='12.6' cy='29' rx='4.4' ry='5.8'/><path d='M24 26.4L27.2 23.4V34.6M24 34.6H30.2'/>`,
  // 2026-10-03, a quarta leva
  ossada: `<path d='M11 11L29 29M29 11L11 29' style='stroke-width:3.2'/>${[[8, 10.6], [10.6, 8], [32, 29.4], [29.4, 32], [29.4, 8], [32, 10.6], [8, 29.4], [10.6, 32]].map(([x, y]) => `<circle class='f' cx='${x}' cy='${y}' r='2.7'/>`).join('')}`,
  chamas: `<path d='M2 37C2 31 5 29 6 24C8 28 10 29 11 32C10.6 25 14 20 15 12C18 19 21 23 20.6 30C22 26 25 24 25.4 18C28.6 24 31 27 30.4 33C32 31 34 30 35 26C37 30 38 33 38 37Z'/><path d='M8 37C8 34 9.6 33 10.4 31.4C11.6 33 12.6 34.2 12.4 37M17 37C17 32 18.6 29 19.6 25C21.6 29 22.6 32 22 37M27 37C27 34 28.4 32.6 29.2 31C30.4 32.8 31.2 34.6 31 37' style='stroke-width:1.5'/>`,
  acao: `<path d='M20 2L20 11M20 38L20 29M2 20L11 20M38 20L29 20M6 6L13 13M34 34L27 27M34 6L27 13M6 34L13 27' style='stroke-width:2.4'/><path d='M12 2L15.4 11.4M28 2L24.6 11.4M12 38L15.4 28.6M28 38L24.6 28.6M2 12L11.4 15.4M2 28L11.4 24.6M38 12L28.6 15.4M38 28L28.6 24.6' style='stroke-width:1.3'/>`,
  corrente: `<rect x='2.4' y='14.4' width='14' height='11.2' rx='5.6'/><rect x='6.2' y='18' width='6.4' height='4' rx='2' style='stroke-width:1.3'/><path d='M13.4 20H26.6' style='stroke-width:4.4'/><rect x='23.6' y='14.4' width='14' height='11.2' rx='5.6'/><rect x='27.4' y='18' width='6.4' height='4' rx='2' style='stroke-width:1.3'/>`,
  celta: `<path d='M2 8H38M2 32H38' style='stroke-width:1.3'/><path d='M2 14C7 14 8 26 13 26S19 14 20 14S26 26 27 26S33 14 38 14'/><path d='M2 26C7 26 8 14 13 14' /><path d='M15.6 18.2C17 23 18.4 26 20 26S24.6 14 27 14M30.2 21.4C31.4 24.4 33.4 26 38 26'/>`,
  apaixonado: `<path d='M21 33C13 27.4 8.6 23.4 8.6 17.6C8.6 13.8 11.4 11.2 14.6 11.2C17.4 11.2 19.6 12.8 21 15.4C22.4 12.8 24.6 11.2 27.4 11.2C30.6 11.2 33.4 13.8 33.4 17.6C33.4 23.4 29 27.4 21 33Z'/><path d='M3 31L13 25.6M27.6 17.6L37 12.4' style='stroke-width:1.8'/><path d='M37 12.4L32.4 12.2M37 12.4L35.2 16.6M3 31L5 27.6M3 31L6.8 31.6' style='stroke-width:1.6'/>`,
  partitura: `<path d='M2 10H38M2 15H38M2 20H38M2 25H38M2 30H38' style='stroke-width:1.1'/><ellipse class='f' cx='16' cy='25' rx='3.2' ry='2.4' transform='rotate(-20 16 25)'/><ellipse class='f' cx='28' cy='20' rx='3.2' ry='2.4' transform='rotate(-20 28 20)'/><path d='M19 24.4V7M31 19.4V5' style='stroke-width:1.8'/><path class='f' d='M19 7L31 5V8L19 10Z'/>`,
  contagem: `<path d='M6 9V31M11.6 9.4V30.6M17.2 9V31M22.8 9.4V31M2.6 26.4L26.2 13.6' style='stroke-width:2.2'/><path d='M30 10V30M35.6 10.4V30.4' style='stroke-width:2.2'/>`,
};

export const DAMAGE_ICON: Record<Damage, string> = {
  rasgado: `<path d='M8 4H22L24.4 7.6L22.4 10.4L26.2 12.2L25.4 15.8L29.4 16.6L32 19.4V36H8Z'/><path d='M26 4.4L28.6 8L27 10.6L31 12.6L30.4 15' style='stroke-width:1.6'/>`,
  rasgao: `<path d='M6 4H18L16 9L19.6 13L16.4 18L20 23L17 28L19 36H6Z'/><path d='M24 4H34V36H25L23.4 31L26 26L22.6 21L25.8 16L22.8 11L25 7Z'/>`,
  remendado: `<path d='M8 4H32V36H8Z'/><path d='M8 22L13 19.4L17 23L22 18.4L26 22L32 18' style='stroke-width:1.6'/><path class='f' d='M15.4 13.4L28.4 17.6L25.6 26.4L12.6 22.2Z' style='opacity:.45'/><path d='M15.4 13.4L28.4 17.6L25.6 26.4L12.6 22.2Z' style='stroke-width:1.5'/>`,
  costurado: `<path d='M8 4H32V36H8Z'/><path d='M8 21L14 18L19 22L25 17.6L32 20.4' style='stroke-width:1.6'/><path d='M12 15.4L15.4 21.4M15.4 15.4L12 21.4M20.4 16.6L23.8 22.6M23.8 16.6L20.4 22.6M28 15L31 21M31 15L28 21' style='stroke-width:1.8'/>`,
  colado: `<path d='M5 4H19V18.6H5Z'/><path d='M21.4 4.6H35V18H21.8Z'/><path d='M5.4 20.8H19.2V36H5Z'/><path d='M21.6 20.4H35.4V35.4H21Z'/>`,
  picotado: `<path d='M8 4H32V16L30 18L32 20L30 22L32 24L30 26L32 28L30 30L32 32L30 34L32 36H8Z'/><path d='M12 11H24M12 16H22M12 21H24' style='stroke-width:1.6'/>`,
  caderno: `<path d='M11 4H34V36H11L9 33L11 30L9 27L11 24L9 21L11 18L9 15L11 12L9 9L11 6Z'/>${[9, 16, 23, 30].map((y) => `<circle cx='15' cy='${y}' r='1.6'/>`).join('')}<path d='M20 12H30M20 18H30M20 24H28' style='stroke-width:1.5'/>`,
  orelha: `<path d='M8 4H24L32 12V36H8Z'/><path class='f' d='M24 4V12H32Z' style='opacity:.5'/><path d='M24 4V12H32'/>`,
  dobrado: `<path d='M6 6H34V34H6Z'/><path d='M20 6V34M6 20H34' style='stroke-dasharray:2.4 2.2;stroke-width:1.6'/>`,
  amassado: `<path d='M7 6L18 4L33 7L35 20L32 35L19 33L6 36L5 21Z'/><path d='M18 4L15 14L5 21M15 14L22 19L35 20M22 19L19 33M22 19L28 11L33 7' style='stroke-width:1.4'/>`,
  arranhado: `<path d='M8 6Q16 20 30 32M13 5Q21 18 34 28M5 12Q12 25 24 35'/>`,
  garras: `<path class='f' d='M9 4Q18 18 22 36Q16 20 7 5.4Z'/><path class='f' d='M16 3Q25 17 29 35Q23 19 14 4.4Z'/><path class='f' d='M23 3.4Q31 15 35 31Q29 18 21 4.6Z'/>`,
  mordido: `<path d='M8 4H32V20C28.6 20 27 22.6 28 25.6C25 25 22.6 27 23 30C20 29.6 18 31.6 18.4 34.6C16 34.4 14.8 35.2 14.4 36H8Z'/><path d='M29.6 21.6L28 20.6M24.8 26.4L23.6 25M19.6 31L18.4 29.8' style='stroke-width:1.5'/>`,
  furado: `<path d='M8 4H32V36H8Z'/><circle cx='20' cy='20' r='6'/><circle class='f' cx='20' cy='20' r='3.6'/><path d='M13 13L15 15M27 27L25 25M27 13L25 15M13 27L15 25' style='stroke-width:1.5'/>`,
  baleado: `<path d='M8 4H32V36H8Z'/><circle class='f' cx='16' cy='15' r='2.8'/><path d='M16 15L11 11M16 15L21.6 13M16 15L14.6 21M16 15L20 19.6' style='stroke-width:1.3'/><circle class='f' cx='24' cy='27' r='2.4'/><path d='M24 27L28.6 24M24 27L19.6 28.4M24 27L25.4 31.8' style='stroke-width:1.3'/>`,
  queimado: `<path d='M8 4H32V22C29 23 30 26 27 27C25 29.4 27 32 24 33.4C21.6 34.4 21.6 36 20 36H8Z'/><path class='f' d='M30 38C26.4 38 24.8 35.4 25.6 32.6C26.4 30.2 28.4 29.4 28.6 26.4C30.8 28.4 31 30.4 31 31.6C32 31 32.4 30 32.4 29C34 30.8 34.4 32.6 34.2 34C33.8 36.4 32.4 38 30 38Z'/>`,
  glitch: `<path d='M8 4H32V11H8Z'/><path d='M12.6 13.4H36.4V20.4H12.6Z'/><path d='M4.4 22.6H28.4V28H4.4Z'/><path d='M8 30.4H32V36H8Z'/><path class='f' d='M30.6 24H36V26.2H30.6ZM2.4 15.6H8.6V17.6H2.4Z'/>`,
  corrompido: `<path d='M8 4H32V18H28V22H24V26H20V36H8Z'/><path class='f' d='M28 26H31.4V29.4H28ZM33 21.4H36.4V24.8H33ZM24 31.4H27.4V34.8H24ZM31 32H33.4V34.4H31Z'/><path d='M12 9.6V15M15.6 9.6Q18.6 9.6 18.6 12.3Q18.6 15 15.6 15Q12.6 15 15.6 9.6' style='stroke-width:1.6'/>`,
  desintegrado: `<path d='M8 4H24V9H21V15H25V21H21V28H24V36H8Z'/><path class='f' d='M27 7H30.4V10.4H27ZM29 15H32.4V18.4H29ZM26.4 24H29.8V27.4H26.4ZM32.6 26.6H35.2V29.2H32.6ZM34 11H36.4V13.4H34ZM28 32H31V35H28Z'/>`,
  descascado: `<path d='M8 4H32V36H8Z'/><path d='M22 2L36 9L32.6 16L18.6 9Z' style='stroke-width:1.6'/><path class='f' d='M24.4 9.6L31.2 13L29.4 16.4L23 13.2Z' style='opacity:.6'/>`,
  // 2026-10-03, a quarta leva
  partido: `<path d='M4 4H17.6L16.2 9L18.4 14L16 20L18.2 26L16.4 31L17.6 36H4Z'/><path d='M22.4 5.6L36 3.6V35H24.4L23.2 30.4L25.4 25.4L22.8 20L25 14.6L22.2 10.2Z'/>`,
  quebracabeca: `<path d='M7 12H14.4C13.4 6.6 21.6 6.6 20.6 12H28V19.4C33.4 18.4 33.4 26.6 28 25.6V33H20.6C21.6 27.6 13.4 27.6 14.4 33H7V25.6C12.4 26.6 12.4 18.4 7 19.4Z'/>`,
  cantos: `<path d='M12 4H28A8 8 0 0 1 36 12V28A8 8 0 0 1 28 36H12A8 8 0 0 1 4 28V12A8 8 0 0 1 12 4Z'/><path d='M4 8V4H8M32 4H36V8M36 32V36H32M8 36H4V32' style='stroke-width:1.2;stroke-dasharray:1.4 1.4'/>`,
  desgrampeado: `<path d='M8 4H32V36H8Z'/><path class='f' d='M21.4 8.6L23.4 7.2L24.6 8.8L22.6 10.2ZM28.2 15.4L30.2 14L31.4 15.6L29.4 17ZM20.4 13L22.4 11.6L23.6 13.2L21.6 14.6ZM27.2 19.8L29.2 18.4L30.4 20L28.4 21.4Z'/><path d='M23.4 9.4L29.6 15.8M22.4 13.8L28.6 20.2' style='stroke-width:1.1;opacity:.6'/><path d='M14 26L17 22.6L19.4 24' style='stroke-width:1.5'/>`,
  esfarelado: `<path d='M8 6L11 4.4L14 6.2L18 4L22 5.8L26 4.2L29 6L32.4 5.6L31 9L33 12.4L31.4 16L33.6 20L31.4 24L32.6 27L30.6 30.4L28 32.6L24 31L20.4 33L16 31.4L12.4 32.8L9 30.6L7.4 27L9 23.4L6.6 19.6L8.6 16L6.4 12L8.4 9Z'/><path d='M11 37l1.4-1.4M18 38.4l1-1.6M26 37.2l1.6-.8M33.4 35l.8-1.6' style='stroke-width:1.8'/>`,
  desbotado: `<circle cx='9' cy='9' r='4.2' style='stroke-width:1.7'/><path d='M9 1.4V2.6M9 15.4V16.6M1.4 9H2.6M15.4 9H16.6M3.6 3.6L4.4 4.4M13.6 13.6L14.4 14.4M14.4 3.6L13.6 4.4M3.6 14.4L4.4 13.6' style='stroke-width:1.5'/><path d='M14 18H36V36H14Z'/><path class='f' d='M24.6 24.6H33.4V33.4H24.6Z' style='opacity:.5'/><path d='M24.6 24.6H33.4V33.4H24.6Z' style='stroke-width:1.2;stroke-dasharray:1.6 1.4'/>`,
  laser: `<path d='M8 4H32V36H8Z'/><path d='M8 31L27 15' style='stroke-width:2.6'/><path d='M36 1L27 15' style='stroke-width:1.2;stroke-dasharray:2 1.6'/><path class='f' d='M27 11.4L27.9 14.1L30.6 15L27.9 15.9L27 18.6L26.1 15.9L23.4 15L26.1 14.1Z'/>`,
  raio: `<circle class='f' cx='19' cy='20' r='3'/><path d='M19 20L13 13L11 5M13 13L5 11.4M19 20L27 14L31 5M27 14L36 15M19 20L17 29L11 36M17 29L23 35.6M19 20L29 25L37 27M29 25L31.4 33M13 13L8.4 18M27 14L24 6.6' style='stroke-width:1.6'/>`,
  acido: `<path class='f' d='M20 2.6C22.4 6.8 24.6 9.4 24.6 12.4A4.6 4.6 0 0 1 15.4 12.4C15.4 9.4 17.6 6.8 20 2.6Z'/><path d='M20 20.4C22 20.4 22.4 22 24 21.8C25.6 21.6 27 23 26.6 24.8C26.4 26.2 28 27.4 27 29.2C26 30.8 24.6 30.2 23.6 31.6C22.4 33 20.8 32.4 19.6 33.2C18 34 16.4 32.6 15.8 31.2C15.2 29.8 13.2 29.6 13.4 27.6C13.6 26 12.6 24.8 13.8 23.4C15 22 16.4 22.6 17.4 21.4C18.2 20.6 19 20.4 20 20.4Z'/><circle cx='31.4' cy='19' r='1.4' style='stroke-width:1.3'/><circle cx='9' cy='33' r='1.2' style='stroke-width:1.3'/><circle cx='31' cy='35' r='1' style='stroke-width:1.2'/>`,
  carregando: `<path d='M6 6H34V34H6Z'/><path class='f' d='M6 22H20V18H34V34H6Z' style='opacity:.5'/><path d='M8 18H12M14 18H18M8 14H12M14 14H18M20 14H24M26 14H30' style='stroke-width:1.2;opacity:.6'/>${[0, 1, 2, 3, 4, 5].map((i) => `<circle class='f' cx='${r1(26 + Math.cos((i / 6) * Math.PI * 2) * 4)}' cy='${r1(27 + Math.sin((i / 6) * Math.PI * 2) * 4)}' r='${r1(0.7 + i * 0.16)}'/>`).join('')}`,
};

export const STAIN_ICON: Record<Stain, string> = {
  cafe: `<path d='M20 5.4A14.6 14.6 0 1 1 5.6 18.2'/><path d='M6.6 12.4A14.6 14.6 0 0 1 12 7.4' style='stroke-dasharray:2.4 2.6'/><path class='f' d='M27 26C24.6 26 23.6 24 24.4 22.2C25 20.6 26.6 20 28 20.4C30 21 30.6 23 29.8 24.6C29.2 25.6 28.2 26 27 26Z'/><circle class='f' cx='33' cy='31' r='1.4'/><circle class='f' cx='30' cy='34.4' r='.9'/>`,
  molhado: `<path d='M20 4C24 11 28 15 28 20.4A8 8 0 0 1 12 20.4C12 15 16 11 20 4Z'/><path d='M5 32C9 28 15 29 20 31S31 34 36 30' style='stroke-width:1.8'/><path d='M16.4 21.6A3.6 3.6 0 0 0 19 24.6' style='stroke-width:1.6'/>`,
  lagrimas: `<path d='M12 5C14.6 9.6 17 12.4 17 15.8A5 5 0 0 1 7 15.8C7 12.4 9.4 9.6 12 5Z'/><path d='M27 13C29.6 17.6 32 20.4 32 23.8A5 5 0 0 1 22 23.8C22 20.4 24.4 17.6 27 13Z'/><path d='M14 26C15.8 29.2 17.4 31 17.4 33.4A3.4 3.4 0 0 1 10.6 33.4C10.6 31 12.2 29.2 14 26Z'/>`,
  sangue: `<path class='f' d='M20 9C24 9 25 12 28.4 12.6C32 13.2 33 17.4 30.6 20C29 21.8 31 25 28.6 27.4C26 30 22.6 27.6 20 30C17 32.8 13 30.6 12.4 27.4C12 25 8.4 24.4 8.6 20.6C8.8 17.4 12 17 12.8 14C13.6 11 16.4 9 20 9Z'/><circle class='f' cx='34.6' cy='9' r='2'/><circle class='f' cx='6' cy='33' r='1.8'/><circle class='f' cx='33' cy='33.6' r='1.2'/><circle class='f' cx='7.4' cy='8.4' r='1.2'/>`,
  mao: `<path d='M12 36C9.6 31 8 26.6 6 22.6C5 20.6 7.4 19 9 20.6L12.4 24.4V10C12.4 8 15.6 8 15.6 10V19V6.6C15.6 4.6 18.8 4.6 18.8 6.6V19V8C18.8 6 22 6 22 8V19.6V11C22 9 25.2 9 25.2 11V26C25.2 31 23.4 34 22 36Z'/><path d='M13.8 29.4Q18 27.4 21.6 29.6' style='stroke-width:1.4'/>`,
  nanquim: `<path class='f' d='M20 11L22 4.6L23.2 11.6L29.4 7.2L26.4 13.6L34.4 13.4L27.8 17.8L35 22.6L27 22.4L30 29.4L23.8 25.4L22.6 33.6L19.6 26.4L15.4 33L15.8 25.2L8.6 28.4L13 22.2L5 20.4L12.4 17.2L7 11L14.4 13.2L14.2 5.6Z'/><circle class='f' cx='34' cy='32' r='1.5'/><circle class='f' cx='6' cy='6' r='1.3'/>`,
  gosma: `<path class='f' d='M3 3H37V8C35 8 34.6 10 34.6 12V22A2.6 2.6 0 0 1 29.4 22V12C29.4 10 28 9.4 26.6 10.4C25.4 11.4 25.4 13 25.4 15V30A3 3 0 0 1 19.4 30V14C19.4 11.6 17.4 10.6 16 12.4C15 13.6 15 15 15 16V19A2.4 2.4 0 0 1 10.2 19V13C10.2 10.4 8.4 9 6.6 10C5 11 3 10 3 8Z' style='opacity:.8'/><circle cx='22.4' cy='37' r='1.6'/><path d='M22.6 16V26M31.4 13V20' style='stroke:#fff;stroke-width:1.2;opacity:.7'/>`,
  salgadinho: `<ellipse cx='20' cy='20' rx='11' ry='15'/><path d='M13 25C13 13 27 13 27 25M15.6 26C15.6 17 24.4 17 24.4 26M18.2 27C18.2 21 21.8 21 21.8 27M11.6 18C14 8 26 8 28.4 18' style='stroke-width:1.5'/><circle class='f' cx='35' cy='8' r='1.8'/><circle class='f' cx='6' cy='32' r='1.4'/>`,
  mofado: `<circle cx='14' cy='16' r='7' style='stroke-dasharray:1.6 1.6'/><circle cx='27' cy='25' r='8.4' style='stroke-dasharray:1.6 1.6'/><circle class='f' cx='14' cy='16' r='2.4'/><circle class='f' cx='27' cy='25' r='3'/><circle class='f' cx='30' cy='9' r='1.6'/><circle class='f' cx='9' cy='31' r='1.4'/>`,
  tracas: `<path d='M20 12V30'/><path d='M19 14C12 6 4 8 5 15C6 21 13 21 19 18M21 14C28 6 36 8 35 15C34 21 27 21 21 18M19 21C13 23 9 28 11 32C13 35 17 30 19 25M21 21C27 23 31 28 29 32C27 35 23 30 21 25'/><path d='M19 11L16 6M21 11L24 6' style='stroke-width:1.5'/>`,
  pisado: `<path d='M20 3C27 3 30 8 29.6 14C29.2 20 26 21 26.4 26C26.8 30 28 37 20.4 37.4C13 37.8 13.4 31 14.4 26C15.4 21 11 18 11 12C11 6.4 14 3 20 3Z'/><path d='M13 10H28M12 14H29M13.6 18H28M16 29H25M15.6 33H25' style='stroke-width:1.5'/>`,
  pegadas: `<g class='f'><path d='M20 34C15 34 11.6 31 12.4 27.4C13.4 23.4 17 22.6 20 22.6C23 22.6 26.6 23.4 27.6 27.4C28.4 31 25 34 20 34Z'/><ellipse cx='10' cy='18' rx='3' ry='4' transform='rotate(-24 10 18)'/><ellipse cx='16' cy='12' rx='3' ry='4.2' transform='rotate(-8 16 12)'/><ellipse cx='24' cy='12' rx='3' ry='4.2' transform='rotate(8 24 12)'/><ellipse cx='30' cy='18' rx='3' ry='4' transform='rotate(24 30 18)'/></g>`,
  passos: `<g class='f'><path d='M13.4 4C16 4 17 6.8 16.8 9.6C16.6 12.4 15.6 14.6 14.8 16H10.6C9.8 14.2 9 11.6 9.2 9C9.4 6.2 11 4 13.4 4Z'/><ellipse cx='12.6' cy='19.6' rx='2.4' ry='2.8'/><path d='M27 18C29.6 18 30.6 20.8 30.4 23.6C30.2 26.4 29.2 28.6 28.4 30H24.2C23.4 28.2 22.6 25.6 22.8 23C23 20.2 24.6 18 27 18Z'/><ellipse cx='26.2' cy='33.6' rx='2.4' ry='2.8'/></g>`,
  cybertribal: TRIBAL,
  // 2026-10-03, a quarta leva
  fuligem: `<path class='f' d='M6 9C14 9 26 13 34 21C30 21 22 18 7 14.4Z' style='opacity:.7'/><path class='f' d='M5 18C13 18 24 22 31 29C27 29 20 27 6 23.4Z' style='opacity:.7'/><path class='f' d='M7 27C13 27 21 30 26 35C23 35 18 34 8 32Z' style='opacity:.7'/>${[[33, 8, 1.1], [36, 14, 0.8], [35, 31, 1], [14, 36, 0.8], [27, 5, 0.8]].map(([x, y, r]) => `<circle class='f' cx='${x}' cy='${y}' r='${r}'/>`).join('')}`,
  refri: `<circle cx='17' cy='17' r='12' style='stroke-dasharray:14 2.6 9 2 18 2.4'/><circle cx='17' cy='17' r='9.6' style='stroke-width:1;opacity:.6'/><path class='f' d='M29.6 24.6C32.6 24 35.8 26.4 35.4 29.6C35 33 31.6 34.6 28.6 33.6C25.6 32.6 24.8 29.4 26.4 27C27.2 25.8 28.4 24.8 29.6 24.6Z' style='opacity:.55'/><circle class='f' cx='9' cy='34' r='1.3'/><circle class='f' cx='35' cy='9' r='1'/>`,
  pizza: `<path d='M20 37L5.4 9.6Q20 3 34.6 9.6Z' style='stroke-dasharray:3 2'/><path d='M7.4 12.6Q20 7 32.6 12.6' style='stroke-width:1.4'/><circle class='f' cx='16' cy='17' r='3'/><circle class='f' cx='24.4' cy='19.6' r='2.6'/><circle class='f' cx='19.4' cy='26.6' r='2.4'/><circle class='f' cx='34' cy='30' r='1.4'/>`,
  cera: `<path d='M14 15H26V37H14Z'/><path d='M20 12.6C17.6 10.4 18.6 7 20 4C21.4 7 22.4 10.4 20 12.6Z' class='f'/><path class='f' d='M14 15H26V18.4A1.6 1.6 0 0 1 22.8 18.4V17.4A1.4 1.4 0 0 0 21.2 17.4V25.4A1.8 1.8 0 0 1 17.6 25.4V17.6A1.2 1.2 0 0 0 16.2 17.6V21A1.1 1.1 0 0 1 14 21Z'/><circle class='f' cx='31' cy='31' r='1.6'/><circle class='f' cx='8.6' cy='27' r='1.3'/>`,
  graxa: `<path d='M24.4 16.8L9 32.2A3 3 0 0 1 4.8 28L20.2 12.6C18.8 8.4 21.4 3.8 26 3.2L22.6 8.4L25.2 12.4L30 12.2L33.6 7.4C35.4 12 32 16.8 27.4 16.8Z'/><ellipse cx='28.6' cy='29' rx='6' ry='7.6' style='stroke-width:1.4'/><path d='M25.4 31C25.4 26 31.8 26 31.8 31M27.4 31.6C27.4 29.2 29.8 29.2 29.8 31.6' style='stroke-width:1.2'/>`,
  lama: `<path class='f' d='M2 32C6 29.6 9.4 31.6 13 29.4C16.6 31.6 20 29 24 31C27.6 28.8 31.6 31 38 29.4V38H2Z'/>${[[8, 22, 1.8, 3.4, -70], [15, 15, 1.5, 3, -80], [23, 19, 2, 3.6, -95], [30, 12, 1.4, 2.8, -105], [34, 22, 1.7, 3, -115], [19, 7, 1.1, 2.2, -88]].map(([x, y, a, b, r]) => `<ellipse class='f' cx='${x}' cy='${y}' rx='${b}' ry='${a}' transform='rotate(${r} ${x} ${y})'/>`).join('')}`,
  pneu: `<path d='M10 2V38M30 2V38' style='stroke-width:1.5'/><path d='M13 4L20 8.6L27 4M13 12L20 16.6L27 12M13 20L20 24.6L27 20M13 28L20 32.6L27 28M13 36L20 40' style='stroke-width:2.6'/>`,
};

export const DECOR_ICON: Record<Decor, string> = {
  purpurina: `<path class='f' d='M14 4L15.6 12.4L24 14L15.6 15.6L14 24L12.4 15.6L4 14L12.4 12.4Z'/><path class='f' d='M29 20L30 25L35 26L30 27L29 32L28 27L23 26L28 25Z'/>${[[30, 8, 1.4], [8, 30, 1.6], [20, 34, 1], [35, 14, 1], [22, 22, 0.9]].map(([x, y, r]) => `<circle class='f' cx='${x}' cy='${y}' r='${r}'/>`).join('')}`,
  confete: `<rect class='f' x='6' y='6' width='6' height='3.4' transform='rotate(24 9 7.7)'/><rect x='25' y='5' width='6' height='3.4' transform='rotate(-30 28 6.7)'/><circle class='f' cx='20' cy='17' r='2.4'/><rect class='f' x='27' y='24' width='6' height='3.4' transform='rotate(50 30 25.7)'/><circle cx='9' cy='26' r='2.6'/><path d='M14 36C12 32 17 31 15.4 28C14 25.4 18 23.6 19.6 26' style='stroke-width:1.8'/><rect x='22' y='31' width='5' height='3' transform='rotate(-12 24.5 32.5)'/>`,
  estrelinhas: `<path class='f' d='${star(15, 15, 11, 4.6)}'/><path d='${star(30, 29, 7.4, 3.1)}'/><path class='f' d='${star(32, 8, 3.6, 1.6)}'/>`,
  neon: `<path d='M20 34C11 27 5 22 5 15C5 10 8.8 6.6 12.8 6.6C16 6.6 18.6 8.6 20 11.6C21.4 8.6 24 6.6 27.2 6.6C31.2 6.6 35 10 35 15C35 22 29 27 20 34Z'/><path d='M20 28C14.6 23.8 10.6 20.6 10.6 16.2C10.6 13.6 12.4 11.8 14.4 11.8' style='stroke-width:1.4;stroke-dasharray:1 2.6'/>`,
  adesivos: `<path d='M20 34.6C10.6 27 4.6 22 4.6 14.8C4.6 9.6 8.6 6 13 6C16.4 6 19 8 20 10.6C21 8 23.6 6 27 6C31.4 6 35.4 9.6 35.4 14.8C35.4 22 29.4 27 20 34.6Z'/><path d='M20 29.6C12.8 23.8 9.2 20.2 9.2 15C9.2 12.2 11.2 10.4 13.2 10.4C15.8 10.4 18 12.6 20 16C22 12.6 24.2 10.4 26.8 10.4C28.8 10.4 30.8 12.2 30.8 15C30.8 20.2 27.2 23.8 20 29.6Z' class='f' style='opacity:.5'/><circle class='f' cx='15' cy='17' r='1.4'/><circle class='f' cx='25' cy='17' r='1.4'/>`,
  gamer: `<path d='M11 13H29C34 13 37 18 37 24C37 29 34 32 31 30C29 28.6 28 26 26 26H14C12 26 11 28.6 9 30C6 32 3 29 3 24C3 18 6 13 11 13Z'/><path d='M11 17V23M8 20H14'/><circle class='f' cx='27' cy='18' r='1.6'/><circle class='f' cx='31' cy='21.6' r='1.6'/>`,
  bottons: `<circle cx='20' cy='20' r='15'/><circle cx='20' cy='20' r='11' style='stroke-width:1.4'/><path class='f' d='${star(20, 20, 7, 3)}'/>`,
  vidas: `<path class='f' d='M8.5 6.2h4.6v4.6h-4.6ZM13.1 6.2h4.6v4.6h-4.6ZM22.3 6.2h4.6v4.6h-4.6ZM26.9 6.2h4.6v4.6h-4.6ZM3.9 10.8h4.6v4.6h-4.6ZM8.5 10.8h4.6v4.6h-4.6ZM13.1 10.8h4.6v4.6h-4.6ZM17.7 10.8h4.6v4.6h-4.6ZM22.3 10.8h4.6v4.6h-4.6ZM26.9 10.8h4.6v4.6h-4.6ZM31.5 10.8h4.6v4.6h-4.6ZM3.9 15.4h4.6v4.6h-4.6ZM8.5 15.4h4.6v4.6h-4.6ZM13.1 15.4h4.6v4.6h-4.6ZM17.7 15.4h4.6v4.6h-4.6ZM22.3 15.4h4.6v4.6h-4.6ZM26.9 15.4h4.6v4.6h-4.6ZM31.5 15.4h4.6v4.6h-4.6ZM8.5 20.0h4.6v4.6h-4.6ZM13.1 20.0h4.6v4.6h-4.6ZM17.7 20.0h4.6v4.6h-4.6ZM22.3 20.0h4.6v4.6h-4.6ZM26.9 20.0h4.6v4.6h-4.6ZM13.1 24.6h4.6v4.6h-4.6ZM17.7 24.6h4.6v4.6h-4.6ZM22.3 24.6h4.6v4.6h-4.6ZM17.7 29.2h4.6v4.6h-4.6Z'/><path d='M10.8 12.6v2.4' style='stroke:#fff;stroke-width:2;opacity:.6'/>`,
  selo: `<path d='M8 6H32V34H8Z' style='stroke-dasharray:2 1.8'/><path d='M11.6 9.6H28.4V30.4H11.6Z' style='stroke-width:1.6'/><path d='M13 26L18 19L21 23L24 20L27 26Z' class='f'/><circle cx='24' cy='14' r='2.2' style='stroke-width:1.5'/>`,
  postit: `<path d='M6 6H34V26L26 34H6Z'/><path class='f' d='M26 34V26H34Z' style='opacity:.55'/><path d='M11 13H28M11 18H26M11 23H20' style='stroke-width:1.6'/>`,
  ingresso: `<path d='M3 11H37V16A4 4 0 0 0 37 24V29H3V24A4 4 0 0 0 3 16Z'/><path d='M27 11V29' style='stroke-dasharray:2 2;stroke-width:1.5'/><path d='M8 17H22M8 22H18' style='stroke-width:1.6'/>`,
  promocao: `<path d='M4 18L18 4H34V20L20 34Z'/><circle cx='28' cy='10' r='2.6'/><path d='M13 24L23 14M14 16.6v.2M21.4 23.6v.2' style='stroke-width:2.2'/>`,
  carimbo: `<path d='M15 4H25V14H15Z'/><path d='M13 14H27L30 20H10Z'/><path d='M8 20H32V24H8Z'/><path d='M6 31H34' style='stroke-width:3'/><path d='M10 35H30' style='stroke-width:1.4;stroke-dasharray:2 2'/>`,
  medalha: `<path d='M14 24L10 37L15 34L18 38L20 27M26 24L30 37L25 34L22 38L20 27' style='stroke-width:1.8'/><circle cx='20' cy='15' r='11'/><circle cx='20' cy='15' r='7' style='stroke-width:1.4'/><path class='f' d='${star(20, 15, 4.6, 2)}'/>`,
  lacre: `<path d='M20 4C24 3.6 26 6 29.6 6.4C33.4 7 35.4 10.6 35 14.4C34.8 17.4 37 19.6 35.6 23.4C34.2 27.4 31.8 28 30.4 31.4C28.8 34.6 25 36.6 20.6 35.8C16.4 35 13.6 36.4 10.6 33.6C7.6 30.8 7.4 28 5.4 25C3.4 21.6 4.6 17.8 5.2 14.6C6 10.4 9.2 8 12.4 6.4C15 5 17 4.2 20 4Z'/><circle cx='20' cy='20' r='9.6'/><path d='M16 25V15.4L20 21L24 15.4V25' style='stroke-width:2'/>`,
  clipe: `<path d='M16 30V10A5 5 0 0 1 26 10V29A7 7 0 0 1 12 29V13' transform='rotate(18 20 20)'/>`,
  grampos: `<path d='M6 15V10H24V15' style='stroke-width:3'/><path d='M16 31V26H34V31' style='stroke-width:3'/><path d='M4 36H36' style='stroke-width:1.2;opacity:.6'/>`,
  alfinete: `<path d='M9 30L30 9.4C33 6.6 37 10.4 34.2 13.4L14.4 33.4'/><path d='M9 30C6 33 9.6 36.6 12.6 33.8L14.4 33.4'/><path d='M6.4 27.6L27 7' style='stroke-width:1.8'/><path d='M24 5H31L35 9V14' style='stroke-width:2.8'/>`,
  argolas: `<path d='M5 8H35V34H5Z' style='stroke-width:1.5'/>${[13, 21, 29].map((x) => `<path d='M${x} 12C${x - 3} 12 ${x - 3} 3 ${x} 3C${x + 3} 3 ${x + 3} 12 ${x} 12' style='stroke-width:2.4'/><circle class='f' cx='${x}' cy='12' r='1.5'/>`).join('')}`,
  ilhoses: `<circle cx='12' cy='12' r='6'/><circle class='f' cx='12' cy='12' r='2.8'/><circle cx='28' cy='28' r='6'/><circle class='f' cx='28' cy='28' r='2.8'/><path d='M12 18Q16 26 22 28' style='stroke-width:1.6'/>`,
  curativo: `<path d='M8.4 24.4L24.4 8.4A6 6 0 0 1 31.6 15.6L15.6 31.6A6 6 0 0 1 8.4 24.4Z'/><path d='M14.6 18.2L21.8 25.4M18.2 14.6L25.4 21.8' style='stroke-width:1.5'/>${[[18, 20], [20, 18], [22, 20], [20, 22]].map(([x, y]) => `<circle class='f' cx='${x}' cy='${y}' r='.9'/>`).join('')}`,
  cuidado: `<path d='M2 12L38 22V30L2 20Z'/><path class='f' d='M8 13.6L14 15.2L10 22.4L4 20.8ZM20 17L26 18.6L22 25.8L16 24.2ZM32 20.4L38 22V24.6L34 29.2L28 27.6Z'/>`,
  neve: `<path d='M20 3V37M5.3 11.5L34.7 28.5M5.3 28.5L34.7 11.5'/><path d='M16 6L20 10L24 6M16 34L20 30L24 34M5 16.4L10.4 15L9 9.6M35 23.6L29.6 25L31 30.4M5 23.6L10.4 25L9 30.4M35 16.4L29.6 15L31 9.6' style='stroke-width:1.8'/>`,
  petalas: `${[0, 72, 144, 216, 288].map((a) => `<path d='M20 20C15.6 15 16 8 20 4.6C21 6.6 22.4 6 23.2 5C25.6 9 24.6 15.4 20 20Z' transform='rotate(${a} 20 20)'/>`).join('')}<circle class='f' cx='20' cy='20' r='2'/>`,
  teia: `<path d='M4 4L36 36M4 4L20 38M4 4L38 20M4 4L38 8M4 4L8 38'/><path d='M4 14Q9 10 14 4M4 23Q14 18 23 4M6 32Q21 26 32 5M12 38Q29 30 38 12' style='stroke-width:1.5'/>`,
  antena: `<path d='M10 35Q10 26.4 20 26.4Q30 26.4 30 35Z'/><path d='M8 35H32'/><path d='M18 26.6L8.4 5M22 26.6L33 6.4' style='stroke-width:2'/><circle class='f' cx='8.4' cy='5' r='2.4'/><circle class='f' cx='33' cy='6.4' r='2.4'/>`,
  crt: `<path d='M6 7Q20 4.4 34 7Q36.6 20 34 33Q20 35.6 6 33Q3.4 20 6 7Z'/><path d='M8.4 12H31.6M7.4 16H32.6M7 20H33M7.4 24H32.6M8.4 28H31.6' style='stroke-width:1.1;opacity:.65'/><path d='M10 9.6Q14 8.8 18 8.8' style='stroke-width:1.4'/>`,
  barras: `<path d='M4 8H36V32H4Z'/><path class='f' d='M8.6 8H13.2V25H8.6ZM17.8 8H22.4V25H17.8ZM27 8H31.6V25H27Z'/><path d='M4 25H36M13 25V32M25 25V32' style='stroke-width:1.4'/>`,
  disquete: `<path d='M6 4.5H30.5L35.5 9.5V35.5H6Z'/><path d='M12.5 4.5V13.5H27.5V4.5'/><path class='f' d='M22.4 6.4H25.4V11.6H22.4Z'/><path d='M10 19.5H31.5V35.5H10Z' style='stroke-width:1.5'/><path d='M13.6 24.4H27.6M13.6 28.8H23.6' style='stroke-width:1.4'/>`,
  erro: `<path d='M3 7H37V33H3Z'/><path d='M3 12.6H37'/><circle cx='11.6' cy='20.6' r='4.6'/><path d='M9.8 18.8L13.4 22.4M13.4 18.8L9.8 22.4' style='stroke-width:1.5'/><path d='M19 18.6H31M19 22.6H27' style='stroke-width:1.6'/><path d='M24 26H32V30.4H24Z' style='stroke-width:1.4'/>`,
  beijo: `<path class='f' d='M4 20C8 14 13 11 17 13C18.6 13.8 19.4 14 20 14C20.6 14 21.4 13.8 23 13C27 11 32 14 36 20C32 20.6 26 19.6 20 20.6C14 19.6 8 20.6 4 20Z'/><path class='f' d='M4 21.2C9.6 20.6 14.4 21.8 20 22C25.6 21.8 30.4 20.6 36 21.2C32 27.4 26.4 30 20 30C13.6 30 8 27.4 4 21.2Z' style='opacity:.8'/>`,
  // 2026-10-03, a quarta leva
  cogumelos: `<path d='M5 21C5 10.6 35 10.6 35 21Q20 24 5 21Z'/><path d='M15.6 22.6C15.6 28 14.6 32 13.6 36H26.4C25.4 32 24.4 28 24.4 22.6'/>${[[12, 16, 2], [20, 13.4, 1.6], [27.6, 16.4, 2.2], [17, 19, 1.2]].map(([x, y, r]) => `<circle class='f' cx='${x}' cy='${y}' r='${r}'/>`).join('')}<path d='M4 37H36' style='stroke-width:1.2;opacity:.6'/>`,
  cristais: `<path d='M14 36V15L18 8L22 15V36'/><path d='M18 8V36' style='stroke-width:1.1;opacity:.6'/><path d='M23 36V20.6L28.6 12.4L33.2 17.6L30 36'/><path d='M7 36L5 24L9.6 19.6L13.4 25.6'/><path class='f' d='M30 4L30.8 6.2L33 7L30.8 7.8L30 10L29.2 7.8L27 7L29.2 6.2Z'/><path d='M3 37H37' style='stroke-width:1.4'/>`,
  silvertape: `<path d='M3.6 15L15 3.6L17 6L18.6 4.8L20.4 7.2L35.4 22.2L34 24L36.4 26L25 37.4L22.8 35.4L21.6 37L19.6 34.8L4.6 19.8L6.4 18.2Z'/><path d='M9 17L23 31M14 12L28 26M19 7L33 21' style='stroke-width:1;opacity:.5;stroke-dasharray:1.4 1.4'/>`,
  rotuladora: `<path d='M3 13H37V27H3Z'/><path d='M7.4 24L9.6 16.4L11.8 24M8.2 21.4H11' style='stroke-width:1.5'/><path d='M15.4 16.4V24H17.8A2 2 0 0 0 17.8 20.2H15.4M15.4 16.4H17.6A1.9 1.9 0 0 1 17.6 20.2' style='stroke-width:1.5'/><path d='M27.4 17.4A3.4 3.4 0 1 0 27.4 23' style='stroke-width:1.5'/><path d='M31 16.4V24M31 16.4H34M31 20.2H33.4M31 24H34' style='stroke-width:1.5'/>`,
  prendedor: `<path class='f' d='M8 20H32L28.4 33H11.6Z'/><path d='M11.6 20.4V6.4H28.4V20.4' style='stroke-width:1.8'/><path d='M14.4 20.4V9.4H25.6V20.4' style='stroke-width:1.3;opacity:.7'/><path d='M3 34H37' style='stroke-width:1.2;opacity:.6'/>`,
  pregador: `<path d='M14.6 2H25.4V22L23.6 24.4L25.4 27V38H14.6V27L16.4 24.4L14.6 22Z'/><path d='M20 25V38' style='stroke-width:1.4'/><path class='f' d='M12.6 13H27.4V18H12.6Z'/><path d='M27.4 15.6Q30.6 11 27 6' style='stroke-width:1.4'/>`,
  parafusos: `<circle cx='20' cy='20' r='11'/><path d='M14 20H26M20 14V26' style='stroke-width:2.8'/><path d='M7 9L4 6M33 9L36 6M33 31L36 34M7 31L4 34M20 4.6V2M20 35.4V38' style='stroke-width:1.4'/>`,
  lapis: `<path d='M6 34L8.4 26.4L27.4 7.4L32.6 12.6L13.6 31.6Z'/><path class='f' d='M6 34L7.2 30.2L9.8 32.8Z'/><path d='M8.4 26.4L13.6 31.6M24.6 10.2L29.8 15.4' style='stroke-width:1.4'/><path d='M27.4 7.4L29.6 5.2A3.7 3.7 0 0 1 34.8 10.4L32.6 12.6' style='stroke-width:1.8'/>`,
  cantoneiras: `<path d='M4 4H28Q22 9 20 14.8Q14.8 14.8 14.8 20Q9 22 4 28Z'/><path d='M7 7H22Q17 11 15.6 15.6Q11 15.6 11 20Q7 22 7 22Z' style='stroke-width:1.2;opacity:.6'/><circle class='f' cx='9' cy='9' r='1.8'/><circle class='f' cx='20' cy='8' r='1.5'/><circle class='f' cx='8' cy='20' r='1.5'/><path d='M36 36H12Q18 31 20 25.2Q25.2 25.2 25.2 20Q31 18 36 12Z' style='stroke-width:1.5'/>`,
  locadora: `<path d='M3 9H33V29H3Z'/><path class='f' d='M3 9H33V15H3Z'/><path d='M6.6 20.4H18M6.6 25H14' style='stroke-width:1.5'/><path d='M19 25.4Q22 22.4 26 24.4' style='stroke-width:1.5'/><circle cx='32' cy='30' r='6.4' style='stroke-width:1.8'/><path class='f' d='${star(32, 30, 3.4, 1.5)}'/>`,
  joias: `<path d='M7 15L13.4 6.6H26.6L33 15L20 34.6Z'/><path d='M7 15H33M13.4 6.6L16.6 15L20 34.6L23.4 15L26.6 6.6M20 6.6L16.6 15M20 6.6L23.4 15' style='stroke-width:1.3'/><path class='f' d='M34 3L34.7 5.3L37 6L34.7 6.7L34 9L33.3 6.7L31 6L33.3 5.3Z'/>`,
  laco: `<path d='M20 18C14.6 8 4.4 9.4 5.6 16.6C6.6 22 14 21.4 20 18ZM20 18C25.4 8 35.6 9.4 34.4 16.6C33.4 22 26 21.4 20 18Z'/><path d='M18.4 20.4L12.6 35L16.2 32.4L17.8 36.4L20.6 21M21.6 20.4L27.4 35L23.8 32.4L22.2 36.4L19.4 21'/><path class='f' d='M17.4 15.4H22.6V21H17.4Z'/>`,
  pena: `<path d='M7 37C13 27 21 15.4 33.6 3.4'/><path d='M10.4 31C7.4 20.6 16 9.6 33.6 3.4C31.6 17 23.4 28 12.6 32.8Z'/><path d='M14.6 26.6L10 25.4M18.6 21.4L12.4 18.4M23 15.6L16.8 11.8M18 26.2L22.6 28.2M22.6 20.6L28 21.6M27 14.6L31.6 13.6' style='stroke-width:1.2'/>`,
  morcego: `<path d='M4 4H36' style='stroke-width:1.4;opacity:.6'/><path d='M17 4V8.6M23 4V8.6' style='stroke-width:1.6'/><path d='M14 8.6H26C28.6 14 28.6 22 25.4 27.4L22.6 25.6L20 28L17.4 25.6L14.6 27.4C11.4 22 11.4 14 14 8.6Z'/><path d='M15.6 26.4C14.4 31.4 25.6 31.4 24.4 26.4'/><path d='M16 29L13.6 34L18.2 31M24 29L26.4 34L21.8 31' style='stroke-width:1.5'/><circle class='f' cx='18.2' cy='28.6' r='1'/><circle class='f' cx='21.8' cy='28.6' r='1'/>`,
};

/** O ícone inteiro, pronto para o `innerHTML`. */
export function kitIcon(body: string): string {
  return `<svg viewBox='-2 -2 44 44' aria-hidden='true' focusable='false'><g class='l'>${body}</g></svg>`;
}

