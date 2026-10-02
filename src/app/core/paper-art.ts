/**
 * Os desenhos do papel da ficha: as estampas de papelaria (um ladrilho que se repete), os rabiscos
 * que tomam a ficha inteira e os estragos. Tudo sai em SVG, em px da ficha, a partir do id: a mesma
 * ficha rasga sempre igual. Nada do que a pessoa escreve entra aqui, só desenhos nossos e números.
 */
import { MORE_MOTIFS, Motif, MotifDrawing } from './pattern-motifs';
import { DEFAULT_LOOK, DEFAULT_SCRIBBLE_INK, Damage, Paper, Pattern, PatternLook, SCRIBBLE_INK, Scribble, Stain, f1, hash, rng, svgUrl, textureOf } from './paper';

// ===================== Desenhinhos a lápis =====================

function starPath(cx: number, cy: number, R: number, r: number, rot = -90): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180,
      rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + f1(cx + rr * Math.cos(a)) + ' ' + f1(cy + rr * Math.sin(a));
  }
  return d + 'Z';
}

function curve(n: number, at: (i: number) => [number, number]): string {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const [x, y] = at(i);
    d += (i ? 'L' : 'M') + f1(x) + ' ' + f1(y);
  }
  return d;
}

const SPIRAL = curve(90, (i) => {
  const t = (i / 90) * Math.PI * 2 * 3.3,
    r = 1 + (i / 90) * 14.5 * (1 + 0.05 * Math.sin(i * 0.7));
  return [20 + r * Math.cos(t), 20 + r * Math.sin(t) * 0.92];
});
const COIL = curve(140, (i) => {
  const t = (i / 140) * Math.PI * 2 * 6.5;
  return [3 + (i / 140) * 31 - 3.2 * Math.sin(t), 16 + (i / 140) * 6 - 6 * Math.cos(t)];
});
const SCRIBBLE = curve(160, (i) => {
  const t = (i / 160) * Math.PI * 2 * 7.3;
  const R = 5.5 + 2.2 * Math.sin(i * 0.23);
  return [
    20 + 11 * Math.sin((i / 160) * Math.PI * 2 * 1.5) + R * Math.cos(t),
    20 + 3.5 * Math.sin((i / 160) * Math.PI * 2 * 2.2) + R * 0.8 * Math.sin(t),
  ];
});

/** Os desenhinhos a lápis do Tédio na aula, num quadro de 40×40. `f` é miolo pintado, `h` é hachura leve. */
export const DOODLE_ART: Record<string, string> = {
  gato: `<path d='M12 14 L12.6 6.5 L17 10.6 Q20 9.8 23 10.6 L27.4 6.5 L28 14 Q29 20.5 20 21 Q11 20.5 12 14 Z'/><path d='M15.3 15.2q1.2-1.3 2.4 0M22.3 15.2q1.2-1.3 2.4 0'/><path d='M19.3 17.1h1.4l-.7.8z' class='f'/><path d='M20 17.9q-.9 1.3-2 .6M20 17.9q.9 1.3 2 .6'/><path d='M11.5 16.4l-5-1M11.6 18l-4.8 1.2M28.5 16.4l5-1M28.4 18l4.8 1.2'/><path d='M14.2 20.4Q9.5 29 13 35.2H27Q30.5 29 25.8 20.4'/><path d='M17.2 35.2v-3.8M22.8 35.2v-3.8'/><path d='M27 34.6Q35.5 35 34.6 27.6Q34 24 31.2 25.2'/>`,
  fogo: `<path d='M20 4.5C22.4 11 29.5 14 29.5 23C29.5 30.4 25 35.5 20 35.5C15 35.5 10.5 31.4 10.5 25.2C10.5 20.4 13.6 18.2 14.8 13.8C16 17.8 17 19 18.4 20.2C17.8 14.4 18.6 9.8 20 4.5Z'/><path d='M20 33.6C17 33.6 15.6 31.4 15.6 29C15.6 26 18.2 24.6 18.6 21C20.4 23.4 20.8 25.6 21.2 27C22.2 26.2 22.6 25 22.6 24C24 25.8 24.4 27.4 24.4 29C24.4 31.6 22.8 33.6 20 33.6Z'/>`,
  caveira: `<path d='M20 5.5C12.2 5.5 8 11 8 17.2C8 21.4 10 23.8 12.6 24.8V28.6H27.4V24.8C30 23.8 32 21.4 32 17.2C32 11 27.8 5.5 20 5.5Z'/><circle cx='15.2' cy='16.8' r='3' class='f'/><circle cx='24.8' cy='16.8' r='3' class='f'/><path d='M20 20.4l-1.5 2.9h3z' class='f'/><path d='M16.6 28.6v-3M20 28.6v-3M23.4 28.6v-3'/><path d='M7.5 31l25 5.6M7.5 36.6l25-5.6'/><circle cx='6.6' cy='30.4' r='1.3'/><circle cx='6.6' cy='37.2' r='1.3'/><circle cx='33.4' cy='30.4' r='1.3'/><circle cx='33.4' cy='37.2' r='1.3'/>`,
  coracao: `<path d='M20 34C12 27.4 6 22.4 6 15.6C6 11 9.4 8 13 8C16 8 18.6 10 20 13C21.4 10 24 8 27 8C30.6 8 34 11 34 15.6C34 22.4 28 27.4 20 34Z'/><path d='M10.6 14.6q.6-3.2 3.8-3.4'/><path d='M22 30l7-7M19 29l10.6-10.6M17.6 26l13.6-13.6M18.8 21.4l8.4-8.4' class='h'/>`,
  fantasma: `<path d='M11 33.5V17.2C11 10.6 15 6 20 6C25 6 29 10.6 29 17.2V33.5L26 30.8L23 33.5L20 30.8L17 33.5L14 30.8Z'/><ellipse cx='16.6' cy='17' rx='1.5' ry='2.2' class='f'/><ellipse cx='23.4' cy='17' rx='1.5' ry='2.2' class='f'/><ellipse cx='20' cy='23' rx='1.6' ry='1.9'/><path d='M11 22.4q-4 1.2-5.2-2M29 22.4q4 1.2 5.2-2'/>`,
  raio: `<path d='M23.5 3.5L10.5 22.4H19L14.6 36.5L29.5 15.8H21.2Z'/><path d='M31 7l3-2M32.5 11.5l3.4.2M6 27l-2.6 1.8'/>`,
  lua: `<path d='M25.6 5.5C17.6 6.6 11.6 13 11.6 21C11.6 29.2 18 35.4 26.2 35.4C21 32.4 17.8 27.2 17.8 21C17.8 14.2 21 9 25.6 5.5Z'/><path d='M30.4 8.4v6.4M27.2 11.6h6.4M31.8 21.6v4.4M29.6 23.8h4.4'/><circle cx='25.5' cy='17.5' r='.6' class='f'/>`,
  flor: `<circle cx='20' cy='14' r='2.8' class='f'/><circle cx='20' cy='7.6' r='3.9'/><circle cx='26.1' cy='12' r='3.9'/><circle cx='23.8' cy='19.2' r='3.9'/><circle cx='16.2' cy='19.2' r='3.9'/><circle cx='13.9' cy='12' r='3.9'/><path d='M20 23Q18.8 29.5 20.4 36.5'/><path d='M19.8 30.2Q24.8 24.8 28.4 27.2Q25 31.6 19.9 30.6'/>`,
  cogumelo: `<path d='M6 21.2C6 12.2 13 6 20 6C27 6 34 12.2 34 21.2C29 22.8 11 22.8 6 21.2Z'/><path d='M15 22.2C14.4 28 14 32 15.2 35.4H24.8C26 32 25.6 28 25 22.2'/><circle cx='13.8' cy='14.6' r='2.2' class='f'/><circle cx='21.6' cy='10.8' r='2.5' class='f'/><circle cx='27.8' cy='16' r='1.7' class='f'/><path d='M17.6 28.4q1 1 2 0M21 28.4q1 1 2 0'/>`,
  coroa: `<path d='M7 28.6L8.6 11.8L14.8 19.6L20 7.4L25.2 19.6L31.4 11.8L33 28.6Z'/><path d='M7 28.6H33V33.4H7Z'/><circle cx='8.6' cy='10.4' r='1.5' class='f'/><circle cx='20' cy='5.9' r='1.5' class='f'/><circle cx='31.4' cy='10.4' r='1.5' class='f'/><path d='M20 29.4l1.7 1.6-1.7 1.6-1.7-1.6z' class='f'/>`,
  carinha: `<circle cx='20' cy='20' r='13.5'/><path d='M15.8 15.4v3.2M24.2 15.4v3.2'/><path d='M13.4 23Q20 30.6 26.6 23'/><path d='M10.4 22.4q1.2.8 2.4 0M27.2 22.4q1.2.8 2.4 0' class='h'/>`,
  aranha: `<path d='M20 0V13.2'/><circle cx='20' cy='15.4' r='2.6'/><ellipse cx='20' cy='23' rx='5' ry='5.8' class='f'/><path d='M15.4 20.4L9.4 16L6.4 19M15.2 22.6L8.2 21.6L5.4 25.6M15.6 25L9.4 27.6L7.6 32M17 27.4L12.4 31.8L11.6 36M24.6 20.4L30.6 16L33.6 19M24.8 22.6L31.8 21.6L34.6 25.6M24.4 25L30.6 27.6L32.4 32M23 27.4L27.6 31.8L28.4 36'/>`,
  nuvem: `<path d='M10.4 22.4C6.2 22.4 4.8 16.4 9.4 15.2C9 10 15 8 18 11.6C20 7 28 7 29.2 13C34.2 13.2 35.4 21.4 30.2 22.4Z'/><path d='M12.4 26.6l-1.6 4M18.4 26.6l-1.6 4M24.4 26.6l-1.6 4M15.4 32l-1.6 4M21.4 32l-1.6 4M27.4 32l-1.6 4'/>`,
  cacto: `<path d='M17 28V12.4C17 8.2 23 8.2 23 12.4V28'/><path d='M17 22.4H13.2Q11 22.4 11 20.2V15.4Q11 13.6 12.6 13.6Q14.2 13.6 14.2 15.4V19.2H17'/><path d='M23 19.6H26V13.2Q26 11.4 27.6 11.4Q29.2 11.4 29.2 13.2V18.6Q29.2 21.8 26.2 21.8H23'/><path d='M11.8 28H28.2L26.4 36.2H13.6Z'/><path d='M19.4 13.4l-1 .4M20.8 17l1-.4M19.2 21.6l-1 .4M20.8 25l1-.4'/>`,
  planeta: `<circle cx='20' cy='20' r='8'/><g transform='rotate(-18 20 20)'><path d='M5 20A15 4.6 0 0 0 35 20'/><path d='M35 20A15 4.6 0 0 0 28.1 16.1M11.9 16.1A15 4.6 0 0 0 5 20'/></g><path d='M16 17.4q1.4-2.2 3.8-2.6' class='h'/><circle cx='7' cy='8' r='.7' class='f'/><circle cx='33' cy='32' r='.7' class='f'/><path d='M32 6v3.6M30.2 7.8h3.6'/>`,
  olho: `<path d='M4.5 20.4Q20 6.4 35.5 20.4Q20 34.4 4.5 20.4Z'/><circle cx='20' cy='20.4' r='5.6'/><circle cx='20' cy='20.4' r='2.4' class='f'/><path d='M11.6 13.4l-1.6-3.2M20 11.2V7.4M28.4 13.4l1.6-3.2'/>`,
  espiral: `<path d='${SPIRAL}'/>`,
  teste: `<path d='${COIL}'/>`,
  rabisco: `<path d='${SCRIBBLE}'/>`,
  velha: `<path d='M15.2 5.6V34.6M24.8 5.4V34.4M5.6 15.2H34.6M5.4 24.8H34.4'/><path d='M7.6 7.6l4.8 4.8M12.4 7.6l-4.8 4.8M17.6 17.6l4.8 4.8M22.4 17.6l-4.8 4.8M27.6 27.6l4.8 4.8M32.4 27.6l-4.8 4.8'/><circle cx='30' cy='10' r='2.8'/><circle cx='10' cy='20' r='2.8'/><path d='M5 5.4L35 34.8'/>`,
  pauzinhos: `<path d='M6.4 10.4v18.2M10.4 9.8v18.6M14.4 10.2v18.2M18.4 9.8v18.6M3.4 24.2L21.6 13.4M27 10.4v18M31 10.8v17.8'/>`,
  estrelinhas: `<path d='${starPath(14, 16, 8.5, 3.6, -84)}'/><path d='${starPath(29, 9, 4.8, 2, -96)}'/><path d='${starPath(28, 29, 5.6, 2.4, -80)}'/>`,
  setinha: `<path d='M4 8Q6 29 31 29.6'/><path d='M31 29.6l-6.4-4.4M31 29.6l-5.6 4.8'/>`,
};


// ===================== Estampas =====================

/** Os motivos, cada um num quadro de 40×40 (o formato está em `pattern-motifs.ts`, com os que vieram depois). */
const MOTIFS: Record<Pattern, Motif> = {
  gatinhos: {
    sil: `<path d='M8 13L9.5 4.5Q10 3 11.3 4L17 9Q20 8.3 23 9L28.7 4Q30 3 30.5 4.5L32 13Q35 18 34 24Q32 34 20 34.5Q8 34 6 24Q5 18 8 13Z'/>`,
    det: `<path d='M12.5 20q2-2.2 4 0M23.5 20q2-2.2 4 0'/><path class='f' d='M18.4 23.2q1.6-1 1.6.5q0-1.5 1.6-.5q.6 1-1.6 2.4q-2.2-1.4-1.6-2.4z'/><path d='M20 25.6q-1.2 1.8-3 .8M20 25.6q1.2 1.8 3 .8'/>`,
    extra: `<path d='M.5 21.5l6.5 1M1 26.5l6-1.4M39.5 21.5l-6.5 1M39 26.5l-6-1.4'/>`,
    c: `<g class='f'><path d='M10 18C6 18 4.5 15.5 5.5 13.2C6.5 11 8.5 10.4 10 10.4C11.5 10.4 13.5 11 14.5 13.2C15.5 15.5 14 18 10 18Z'/><circle cx='4.6' cy='8.6' r='2'/><circle cx='8' cy='5.6' r='2.1'/><circle cx='12' cy='5.6' r='2.1'/><circle cx='15.4' cy='8.6' r='2'/></g>`,
  },
  caveiras: {
    sil: `<path d='M20 4C11 4 6 10.5 6 17.5C6 22 8.5 25 11.5 26.2V31.5Q11.5 33.5 13.5 33.5H26.5Q28.5 33.5 28.5 31.5V26.2C31.5 25 34 22 34 17.5C34 10.5 29 4 20 4Z'/>`,
    det: `<ellipse class='f' cx='14.3' cy='18' rx='3.7' ry='3.3'/><ellipse class='f' cx='25.7' cy='18' rx='3.7' ry='3.3'/><path class='f' d='M20 22.4l-2.1 3.5h4.2z'/><path d='M16.6 33.5v-4.2M20 33.5v-4.2M23.4 33.5v-4.2'/>`,
    c: `<path d='M5 15L15 5' style='stroke-width:3.4'/><g class='f'><circle cx='3.6' cy='13.6' r='2.3'/><circle cx='6.4' cy='16.4' r='2.3'/><circle cx='13.6' cy='3.6' r='2.3'/><circle cx='16.4' cy='6.4' r='2.3'/></g>`,
  },
  foguinhos: {
    sil: `<path d='M20 3C22 10 30 13 30 23C30 30 25.5 35.5 20 35.5C14.5 35.5 10 31 10 24.5C10 19.5 13 17 14.5 12.5C16 17 17.5 18.5 19 19.5C18 14 18.8 8.5 20 3Z'/>`,
    det: `<path class='f' d='M20 33C17.2 33 15.8 31 15.8 28.6C15.8 25.8 18.2 24.4 18.8 21.4C20.6 23.6 21 25.4 21.4 26.6C22.4 25.8 22.8 24.8 22.8 23.8C24.2 25.6 24.4 27.2 24.4 28.6C24.4 31.2 22.8 33 20 33Z'/>`,
    c: `<path class='f' d='M10 2Q11 9 18 10Q11 11 10 18Q9 11 2 10Q9 9 10 2Z'/>`,
  },
  coracoes: {
    sil: `<path d='M20 34C11.5 27 5 21.8 5 14.8C5 9.8 8.8 6.5 12.8 6.5C16 6.5 18.6 8.6 20 11.6C21.4 8.6 24 6.5 27.2 6.5C31.2 6.5 35 9.8 35 14.8C35 21.8 28.5 27 20 34Z'/>`,
    det: `<path d='M10.5 14.5q.6-3.8 4.4-4.2'/>`,
    c: `<g class='f'><circle cx='7' cy='12' r='3.2'/><circle cx='14.5' cy='6.5' r='1.8'/></g>`,
  },
  estrelas: {
    sil: `<path d='M20 3.5L24.4 13.9L35.6 14.9L27.1 22.3L29.7 33.3L20 27.5L10.3 33.3L12.9 22.3L4.4 14.9L15.6 13.9Z'/>`,
    det: `<path d='M16.6 17.6q1.6-1.6 3.4-1.8'/>`,
    c: `<path class='f' d='M13 3C8 4 5 7.5 5 11.5C5 15.5 8.5 18 12.5 18C10 16.4 8.8 14 8.8 11C8.8 7.6 10.4 4.8 13 3Z'/>`,
  },
  fantasmas: {
    sil: `<path d='M9 35V17C9 10 14 5 20 5C26 5 31 10 31 17V35L27.4 31.8L23.8 35L20 31.8L16.2 35L12.6 31.8Z'/>`,
    det: `<ellipse class='f' cx='16' cy='17.5' rx='1.9' ry='2.7'/><ellipse class='f' cx='24' cy='17.5' rx='1.9' ry='2.7'/><ellipse class='f' cx='20' cy='24.6' rx='2' ry='2.5'/>`,
    c: `<path class='f' d='M10 3Q10.8 9.2 17 10Q10.8 10.8 10 17Q9.2 10.8 3 10Q9.2 9.2 10 3Z'/>`,
  },
  cogumelos: {
    sil: `<path d='M5 21C5 11.5 12 5 20 5C28 5 35 11.5 35 21C29.5 23 10.5 23 5 21Z'/><path d='M14.5 22.8C14 28 13.6 32 15 35H25C26.4 32 26 28 25.5 22.8Z'/>`,
    det: `<circle class='f' cx='13' cy='14' r='2.7'/><circle class='f' cx='21.5' cy='10' r='3.1'/><circle class='f' cx='28.4' cy='15.4' r='2.2'/>`,
    c: `<g class='f'><circle cx='8' cy='11' r='3'/><circle cx='14.6' cy='6' r='1.6'/></g>`,
  },
  flores: {
    sil: `<circle cx='20' cy='10.6' r='6'/><circle cx='28.6' cy='16.8' r='6'/><circle cx='25.3' cy='27' r='6'/><circle cx='14.7' cy='27' r='6'/><circle cx='11.4' cy='16.8' r='6'/>`,
    det: `<circle class='f' cx='20' cy='20' r='4.2'/>`,
    c: `<path class='f' d='M3 17Q4 5 17 3Q15 16 3 17Z'/>`,
  },
  raios: {
    sil: `<path d='M23.5 3L10 22H18.5L15 37L30 16H21.5Z'/>`,
    c: `<circle class='f' cx='10' cy='10' r='2.4'/><path d='M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3'/>`,
  },
  planetas: {
    sil: `<circle cx='20' cy='20' r='9.5'/>`,
    det: `<path d='M10.9 23.6A15.5 4.8 0 0 0 29.1 23.6' transform='rotate(-18 20 20)'/>`,
    extra: `<g transform='rotate(-18 20 20)'><path d='M4.5 20A15.5 4.8 0 0 0 10.9 23.6M29.1 23.6A15.5 4.8 0 0 0 35.5 20'/><path d='M35.5 20A15.5 4.8 0 0 0 29 16.1M11 16.1A15.5 4.8 0 0 0 4.5 20'/></g>`,
    c: `<path class='f' d='M10 3Q10.8 9.2 17 10Q10.8 10.8 10 17Q9.2 10.8 3 10Q9.2 9.2 10 3Z'/>`,
  },
  controles: {
    sil: `<path d='M12 12.5H28C33 12.5 36 16.5 36.6 22L37.6 28.6C38.1 32.2 34.6 34.2 32 31.6L28 27.6H12L8 31.6C5.4 34.2 1.9 32.2 2.4 28.6L3.4 22C4 16.5 7 12.5 12 12.5Z'/>`,
    det: `<path d='M10.8 18.6v7M7.3 22.1h7'/><circle class='f' cx='28' cy='18.8' r='1.7'/><circle class='f' cx='31.6' cy='22.2' r='1.7'/><circle class='f' cx='28' cy='25.6' r='1.7'/><circle class='f' cx='24.4' cy='22.2' r='1.7'/>`,
    c: `<path d='M10 3v14M3 10h14' style='stroke-width:3.2'/>`,
  },
  aranhas: {
    sil: `<ellipse cx='20' cy='24' rx='6.4' ry='7.4'/><circle cx='20' cy='14.6' r='3.8'/>`,
    extra: `<path d='M20 0V11'/><path d='M14.4 21L8 16.4L5 19.6M14 23.8L6.6 23L3.8 27.4M14.4 27L8 30L6.6 34.6M16.4 30L12.4 34.6L12 38.6M25.6 21L32 16.4L35 19.6M26 23.8L33.4 23L36.2 27.4M25.6 27L32 30L33.4 34.6M23.6 30L27.6 34.6L28 38.6'/>`,
    c: `<path d='M2 2L18 18M2 2L18.5 7.5M2 2L7.5 18.5M2 10.6Q7 8 10.6 2M2 16Q12.6 13 16 2'/>`,
  },
  ...MORE_MOTIFS,
};

const tiles = new Map<string, Tile>();

/** O ladrilho de uma estampa: a imagem e o lado dela, em px da ficha. */
export interface Tile {
  url: string;
  side: number;
}

/**
 * Os degraus dos ajustes (PatternLook): o vão entre os desenhos, o tamanho (vezes o de sempre, 38px)
 * e a bagunça (0 a 1). O vão negativo é uma fração do desenho: eles se sobrepõem; o positivo é em
 * px. O último tamanho passa dos 500px: um desenho maior que a ficha completa.
 */
const GAP = [-0.55, -0.3, 4, 15, 26, 42, 62];
const SIZE = [0.6, 0.8, 1, 1.3, 1.7, 2.6, 4.2, 7.5, 14];
const JITTER = [0, 0.25, 0.5, 0.75, 1];
/** A tinta da estampa: preto multiplicado, clarinho, para ficar atrás do que está escrito. */
const TINTA = 0.13;

/**
 * O ladrilho de uma estampa, como cartolina temática de papelaria: o motivo em contorno e o motivo
 * cheio se alternando, com o miudinho entre eles, impresso tom sobre tom (preto a 13%, multiplicado:
 * a cor da cartolina escurece, não acinzenta). Quatro por quatro casas, em fileiras desencontradas;
 * o ajuste de alinhamento gira, desloca e muda o tamanho de cada um, e quem passa da beirada do
 * ladrilho aparece do outro lado, para a emenda não aparecer.
 */
export function patternTile(p: Pattern, look: PatternLook = DEFAULT_LOOK, seed?: number): Tile {
  const key = `${p}:${look.spacing}:${look.size}:${look.jitter}${seed ? `:${seed}` : ''}`;
  const hit = tiles.get(key);
  if (hit) return hit;
  const m = MOTIFS[p];
  const z = SIZE[look.size] ?? 1,
    mess = JITTER[look.jitter] ?? 0.25;
  // a casa: o desenho (38px no tamanho de sempre) e o vão até o vizinho, que cresce junto com os
  // desenhos gigantes (senão os Soltos se encostam); negativo, os desenhos entram um no outro
  const g = GAP[look.spacing] ?? 26;
  const gap = g < 0 ? g * 38 * z : g * Math.max(1, z / 1.7);
  // gigantes, cabem um ou dois na ficha: duas casas bastam, e o ladrilho não vira uma imagem enorme
  const N = z >= 4 ? 2 : 4;
  const side = Math.round(N * (38 * z + gap));
  const cell = side / N;
  const r = rng(hash(key));
  // A estampa é posta a partir do meio da ficha (background-position: center): sem sorteio, um
  // desenho grande fica bem no meio, e o gigante aparece inteiro. O sorteio muda qual deles vai para o
  // meio e desloca um pouco, sem deixar o gigante escapar da ficha.
  const shift = Math.min(cell / 2, 150);
  const hop = seed && r() < 0.5 ? cell : 0;
  const px = seed ? hop + (r() - 0.5) * 2 * shift : 0,
    py = seed ? hop + (r() - 0.5) * 2 * shift : 0;
  const wrap = (v: number) => ((v % side) + side) % side;
  // um motivo temático tem vários desenhos, que se revezam nas casas; o primeiro usa os ids de sempre
  const drawings = [m, ...(m.more ?? [])];
  const suffix = (k: number) => (k ? String(k) : '');
  const drawingDefs = (d: MotifDrawing, k: number) => {
    const outline = `<g class='l'>${d.sil}${d.det ?? ''}${d.extra ?? ''}</g>`;
    // os furos do motivo cheio: o papel aparece nos olhos, no nariz, na boca
    const holes = d.det ? `<g class='m'>${d.det}</g>` : '';
    const filled = `<g mask='url(#furos${suffix(k)})'><g class='s'>${d.sil}</g></g><g class='l'>${d.extra ?? ''}</g>`;
    return {
      mask: `<mask id='furos${suffix(k)}' maskUnits='userSpaceOnUse' x='-10' y='-10' width='60' height='60'><rect x='-10' y='-10' width='60' height='60' fill='#fff'/>${holes}</mask>`,
      groups: `<g id='o${suffix(k)}'>${outline}</g><g id='s${suffix(k)}'>${filled}</g>`,
    };
  };
  let body = '';
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const big = (i + j) % 2 === 0;
      const cx = wrap((i + 1) * cell + px + (r() - 0.5) * 2 * mess * 0.3 * cell),
        cy = wrap((j + 1) * cell + py + (r() - 0.5) * 2 * mess * 0.3 * cell);
      const rot = (r() - 0.5) * 2 * mess * 48;
      const s = 0.95 * z * (1 + (r() - 0.5) * 2 * mess * 0.28);
      const v = drawings.length > 1 ? (Math.floor(i / 2) + j) % drawings.length : 0;
      const ref = big ? `${i % 2 ? '#s' : '#o'}${suffix(v)}` : '#c';
      // o raio que o desenho pode ocupar girado: metade da diagonal do quadro dele
      const reach = (big ? 28 : 14) * s;
      const half = big ? 20 : 10;
      for (const ox of [-side, 0, side])
        for (const oy of [-side, 0, side]) {
          const x = cx + ox,
            y = cy + oy;
          if (x + reach < 0 || x - reach > side || y + reach < 0 || y - reach > side) continue;
          body += `<use href='${ref}' transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)}) scale(${s.toFixed(3)}) translate(-${half} -${half})'/>`;
        }
    }
  const first = drawingDefs(m, 0);
  const others = drawings
    .slice(1)
    .map((d, k) => drawingDefs(d, k + 1))
    .map((d) => d.mask + d.groups)
    .join('');
  const svg =
    `<style>.l *{fill:none;stroke:#000;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}.l .f,.l .f *{fill:#000;stroke:none}.s *{fill:#000}.m *{fill:none;stroke:#000;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}.m .f{fill:#000;stroke:none}.c *{fill:none;stroke:#000;stroke-width:2.2;stroke-linecap:round}.c .f,.c .f *{fill:#000;stroke:none}</style>` +
    `<defs>${first.mask}` +
    `${first.groups}<g id='c' class='c'>${m.c}</g>${others}</defs>` +
    `<g opacity='${TINTA}'>${body}</g>`;
  const tile = { url: svgUrl(side, side, svg), side };
  tiles.set(key, tile);
  return tile;
}

/**
 * Um desenho só de cada estampa, em traço, para a seleção no editor: o primeiro desenho do motivo,
 * sem o papel. A cor é a do texto em volta (`currentColor`, no estilo de quem mostra).
 */
export function motifIcon(p: Pattern): string {
  const m = MOTIFS[p];
  return `<svg viewBox='-2 -2 44 44' aria-hidden='true' focusable='false'><g class='l'>${m.sil}${m.det ?? ''}${m.extra ?? ''}</g></svg>`;
}

// ===================== O que sai para a ficha =====================

export interface PaperArt {
  /** Pedaços que somem do papel (px da ficha); `evenodd` quando o caminho é um furo dentro de outro. */
  cut: string[];
  evenodd: boolean;
  /**
   * Onde o papel rasgou, a cor da cartolina (e o que está escrito nela) solta antes da fibra: estas
   * faixas somem da cor e deixam aparecer o miolo claro, que só o `cut` recorta. Como na wishlist.
   */
  core: string[];
  /** Grafite e manchas: multiplicado no papel, atrás do que está escrito. */
  fundo: string;
  /** Pigmento com cor própria (sangue) e o que clareia o papel, atrás do que está escrito. */
  clareia: string;
  /** Relevo do papel (amassado, dobras): cinza em soft-light por cima de tudo, a tinta entorta junto. */
  relevo: string;
  /** Por cima do que está escrito: a orelha, o queimado. Recortado junto com o papel. */
  frente: string;
  /** A fita do remendo: colada por cima do rasgo, atravessa a fresta sem ser recortada. */
  fita: string;
  /**
   * Por cima de tudo, até da foto e da nota: o que caiu na ficha depois de pronta (a gosma). Só existe
   * quando tem algo, para os desenhos de antes continuarem iguais.
   */
  topo?: string;
}

export interface ArtInput {
  id: string;
  W: number;
  H: number;
  scribble?: Scribble;
  damage?: Damage;
  /** O sorteio do estrago (Review.damageSeed); sem ele, o estrago sai só do id. */
  seed?: number;
  /** A mancha por cima do papel (café, água, sangue, mofo, pegadas, traças), com o sorteio dela. */
  stain?: Stain;
  stainSeed?: number;
  /** O sorteio do rabisco (Review.scribbleSeed); sem ele, o rabisco sai só do id. */
  scribbleSeed?: number;
  /** A força do lápis do rabisco (um degrau de SCRIBBLE_INK); sem ela, o Normal. */
  scribbleInk?: number;
  /** Um prefixo único para os ids do SVG. */
  uid: string;
  /** Sem o filtro de lápis (as amostras miúdas do editor). */
  plain?: boolean;
}

type Pt = [number, number];

export function paperArt(input: ArtInput): PaperArt {
  const out: PaperArt = { cut: [], evenodd: false, core: [], fundo: '', clareia: '', relevo: '', frente: '', fita: '' };
  const { W, H } = input;
  if (W < 20 || H < 20) return out;
  // o tamanho de tudo acompanha a ficha: a completa é a referência; a simples e as amostras encolhem
  const k = Math.max(0.2, Math.min(1.2, Math.sqrt((W * H) / (420 * 300))));
  // nas amostras miúdas o traço afina junto, senão o novelo vira borrão
  const sw = input.plain ? Math.max(0.3, k * 1.3) : Math.max(0.6, k);
  if (input.scribble) out.fundo += scribbleArt(input.scribble, W, H, k, sw, rng(hash(`${input.id}:rabisco:${input.scribble}${input.scribbleSeed ? `:${input.scribbleSeed}` : ''}`)), input.plain, SCRIBBLE_INK[input.scribbleInk ?? DEFAULT_SCRIBBLE_INK] ?? 1);
  if (input.damage) damageArt(input.damage, W, H, k, sw, rng(hash(`${input.id}:estrago:${input.damage}${input.seed ? `:${input.seed}` : ''}`)), input.uid, out);
  // a mancha sorteia do mesmo jeito que quando era um estrago: a ficha de antes sai igualzinha
  if (input.stain) {
    const key = `${input.id}:estrago:${input.stain}${input.stainSeed ? `:${input.stainSeed}` : ''}`;
    const random = rng(hash(key));
    // Sorteio separado: a opção de uma bolsa preserva o formato da poça grande aprovada.
    const composition = input.stain === 'sangue' ? rng(hash(`${key}:composicao`)) : null;
    if (composition && composition() < 0.5) out.clareia += smallBloodPoolsArt(W, H, composition() < 0.5 ? 2 : 3, random);
    else damageArt(input.stain, W, H, k, sw, random, input.uid, out);
  }
  return out;
}

/**
 * A máscara do papel: opaca onde há papel, transparente nos pedaços que foram embora. A máscara de
 * CSS lê a transparência, não o preto; por isso o recorte é feito dentro do SVG, com um <mask>.
 */
export function cutMask(art: PaperArt, W: number, H: number, layer: 'cor' | 'miolo' | 'queima' = 'cor'): string | null {
  // a Fita arrancada só tira a cor, sem furar: ela tem máscara da cor, mas não do papel
  if (!art.cut.length && (layer !== 'cor' || !art.core.length)) return null;
  const w = f1(W),
    h = f1(H);
  // cada pedaço num <path> próprio: juntos eles somam, sem o fill-rule de um furar o outro
  const paths = [...art.cut, ...(layer === 'cor' ? art.core : [])];
  // O carvão precisa cobrir a antialiasing do recorte, mas o brilho difuso não deve vazar
  // para o espaço vazio. A máscara da queimadura devolve só 1,5 px ao lado cortado.
  const edge = layer === 'queima'
    ? `<g fill='none' stroke='#fff' stroke-width='3' stroke-linejoin='round'>${art.cut.map((d) => `<path d='${d}'/>`).join('')}</g>`
    : '';
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><mask id='m' maskUnits='userSpaceOnUse' x='-20' y='-20' width='${f1(W + 40)}' height='${f1(H + 40)}'><rect x='-20' y='-20' width='${f1(W + 40)}' height='${f1(H + 40)}' fill='#fff'/><g fill='#000' fill-rule='${art.evenodd ? 'evenodd' : 'nonzero'}'>${paths.map((d) => `<path d='${d}'/>`).join('')}</g>${edge}</mask><rect x='-20' y='-20' width='${f1(W + 40)}' height='${f1(H + 40)}' fill='#fff' mask='url(#m)'/></svg>`,
  )}")`;
}

// ===================== Rabiscos: a ficha inteira =====================

/** Uma linha suave passando pelos pontos (Catmull-Rom virando Bézier). */
function smooth(pts: Pt[]): string {
  if (pts.length < 2) return '';
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}

function poly(pts: Pt[]): string {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('');
}

/** Continua uma linha já começada: os mesmos pontos, sem o "M" do começo. */
function cont(pts: Pt[]): string {
  return pts.map(([x, y]) => `L${f1(x)} ${f1(y)}`).join('');
}

/** Uma reta à mão, de `a` a `b`: a mesma linha, tremendo um tiquinho a cada `seg` (as pontas ficam). */
function handLine(a: Pt, b: Pt, r: () => number, wob: number, seg: number): Pt[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n = Math.max(2, Math.round(len / seg));
  const ux = (b[0] - a[0]) / len,
    uy = (b[1] - a[1]) / len;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const w = i === 0 || i === n ? 0 : (r() - 0.5) * wob;
    pts.push([a[0] + ((b[0] - a[0]) * i) / n - uy * w, a[1] + ((b[1] - a[1]) * i) / n + ux * w]);
  }
  return pts;
}

/** Os quatro cantos de um retângulo recuado `m` da borda, no sentido do relógio a partir do de cima à esquerda. */
function inset(W: number, H: number, m: number): Pt[] {
  return [
    [m, m],
    [W - m, m],
    [W - m, H - m],
    [m, H - m],
  ];
}

/** A tesourinha do Cupom, num quadro de 40×40, de ponta para a direita. */
const SCISSORS = `<circle cx='8.5' cy='12.5' r='5'/><circle cx='8.5' cy='27.5' r='5'/><path d='M12.6 15.4L24.2 20L37.5 25.6M12.6 24.6L24.2 20L37.5 14.4'/><circle cx='24.2' cy='20' r='1.2' class='f'/>`;

/** Runas de traço, num quadro de 6×10: umas do alfabeto antigo, para as faixas e os círculos. */
const RUNES = [
  'M1 0V10M1 3L5 1M1 6L5 4', // fehu
  'M1 10V0L5 3V10', // uruz
  'M1 0V10M1 2L4 5L1 8', // thurisaz
  'M1 0V10M1 0L5 3M1 4L5 7', // ansuz
  'M1 0V10M1 0L5 3L1 6L5 10', // raidho
  'M5 0L1 5L5 10', // kaunan
  'M0 0L6 10M6 0L0 10', // gebo
  'M1 0V10M5 0V10M1 3L5 7', // hagalaz
  'M3 0V10M1 3L5 7', // naudiz
  'M3 0V10', // isa
  'M3 0V10M0 2L6 8', // eihwaz? (usado como traço torto)
  'M1 0V10M5 0V10M1 0L5 5L1 10', // mannaz-ish
  'M3 0V10M3 0L0 3M3 0L6 3', // tiwaz
  'M1 0V10M1 0L5 2.5L1 5L5 7.5L1 10', // berkanan
  'M3 0L0 5L3 10L6 5Z', // ingwaz
  'M3 0L6 4L3 8L0 4ZM0 10L3 8L6 10', // othala
  'M0 0L6 10M0 10L3 5M3 0V10', // algiz-ish
]
/** O rabisco é lápis, não caneta: por baixo do que está escrito ele fica clarinho, e a letra lê. */
const GRAFITE = 0.5;

function scribbleArt(s: Scribble, W: number, H: number, k: number, sw: number, r: () => number, plain?: boolean, ink = 1): string {
  // a força do lápis só entra na conta fora do Normal: o de sempre sai igualzinho ao de antes
  const alpha = (op: number) => (ink === 1 ? Math.round(op * GRAFITE * 100) / 100 : Math.min(1, Math.round(op * GRAFITE * ink * 100) / 100));
  const g = (body: string, width = 1.5, op = 1) =>
    `<g class='rabisco' style='stroke-width:${f1(width * sw)}px;opacity:${alpha(op)}'${plain ? '' : " filter='url(#papel-lapis)'"}>${body}</g>`;
  switch (s) {
    case 'novelo': {
      // um novelo de lápis: laçadas de tamanhos diferentes, uma emendada na outra, amontoadas no meio
      const cx = W * (0.44 + r() * 0.14),
        cy = H * (0.46 + r() * 0.1);
      const rx = W * 0.3,
        ry = H * 0.33;
      const pts: Pt[] = [];
      let px = cx,
        py = cy;
      for (let loop = 0; loop < 58; loop++) {
        // o próximo centro, mais perto do meio que da borda (dois sorteios somados)
        const lx = cx + ((r() + r() - 1) * rx) * 0.95,
          ly = cy + ((r() + r() - 1) * ry) * 0.95;
        const lr = Math.min(rx, ry) * (0.18 + r() * 0.5);
        const squash = 0.55 + r() * 0.6;
        const dir = r() < 0.5 ? 1 : -1;
        let a0 = Math.atan2(py - ly, px - lx);
        const turn = (1 + r() * 0.8) * Math.PI * 2;
        const n = 14 + Math.round(lr / 3);
        for (let i = 1; i <= n; i++) {
          const a = a0 + dir * (i / n) * turn;
          pts.push([lx + Math.cos(a) * lr, ly + Math.sin(a) * lr * squash]);
        }
        [px, py] = pts[pts.length - 1];
      }
      // uns riscos compridos que escaparam do novelo
      let fling = '';
      for (let i = 0; i < 6; i++) {
        const ang = r() * Math.PI * 2;
        const p0: Pt = [cx + Math.cos(ang) * rx * 0.4, cy + Math.sin(ang) * ry * 0.4];
        const p1: Pt = [cx + Math.cos(ang) * rx * (1.5 + r() * 0.5), cy + Math.sin(ang) * ry * (1.4 + r() * 0.4)];
        const p2: Pt = [p0[0] + (r() - 0.5) * 30 * k, p0[1] + (r() - 0.5) * 30 * k];
        fling += `<path d='M${f1(p0[0])} ${f1(p0[1])}Q${f1(p1[0])} ${f1(p1[1])} ${f1(p2[0])} ${f1(p2[1])}'/>`;
      }
      return g(`<path d='${smooth(pts)}'/>`, 1.5, 0.95) + g(fling, 1.2, 0.75);
    }
    case 'hachura': {
      let body = '';
      for (let j = 0; j < 4; j++) {
        const pw = W * (0.34 + r() * 0.16),
          ph = H * (0.4 + r() * 0.16);
        const px = (j % 2 ? W * 0.5 : 0) + r() * (W * 0.5 - pw * 0.6) - pw * 0.1,
          py = (j < 2 ? 0 : H * 0.5) + r() * (H * 0.5 - ph * 0.5) - ph * 0.1;
        const lean = (r() < 0.5 ? 1 : -1) * ph * (0.35 + r() * 0.3);
        const gap = (4 + r() * 1.8) * Math.max(0.45, k);
        // vai e volta, na diagonal, como quem sombreia sem tirar o lápis do papel
        const pts: Pt[] = [];
        const n = Math.ceil(pw / gap);
        for (let i = 0; i < n; i++) {
          const x = px + i * gap;
          const top: Pt = [x + (r() - 0.5) * 5 * k, py + (r() - 0.5) * 10 * k];
          const bot: Pt = [x + lean + (r() - 0.5) * 5 * k, py + ph + (r() - 0.5) * 10 * k];
          if (i % 2) pts.push(bot, top);
          else pts.push(top, bot);
        }
        body += `<path d='${poly(pts)}'/>`;
      }
      return g(body, 1.1, 0.8);
    }
    case 'riscado': {
      let body = '';
      for (let j = 0; j < 2; j++) {
        const bw = W * (0.6 + r() * 0.3),
          bh = H * (0.24 + r() * 0.14);
        const bx = r() * (W - bw),
          by = j === 0 ? H * (0.06 + r() * 0.2) : H * (0.52 + r() * 0.2);
        const pts: Pt[] = [];
        const n = Math.round(bh / (3.4 * Math.max(0.45, k)));
        for (let i = 0; i <= n; i++) {
          const y = by + (i / n) * bh;
          pts.push(i % 2 ? [bx + bw - r() * 20 * k, y + (r() - 0.5) * 3 * k] : [bx + r() * 20 * k, y + (r() - 0.5) * 3 * k]);
        }
        body += `<path d='${poly(pts)}'/>`;
      }
      return g(body, 1.7, 0.85);
    }
    case 'contorno': {
      // a borda passada a lápis três vezes, cada volta tremendo e passando do canto
      let body = '';
      for (let pass = 0; pass < 3; pass++) {
        const m = (7 + pass * 3.5 + r() * 3) * Math.max(0.4, k);
        const corners: Pt[] = [
          [m, m],
          [W - m, m],
          [W - m, H - m],
          [m, H - m],
        ];
        for (let s = 0; s < 4; s++) {
          const a = corners[s],
            b = corners[(s + 1) % 4];
          const dx = b[0] - a[0],
            dy = b[1] - a[1],
            len = Math.hypot(dx, dy);
          const ux = dx / len,
            uy = dy / len;
          const over = (4 + r() * 7) * k;
          const pts: Pt[] = [];
          const N = Math.max(4, Math.round(len / (30 * Math.max(0.4, k))));
          for (let i = 0; i <= N; i++) {
            const t = -over + (i / N) * (len + over * 2);
            const wob = (r() - 0.5) * 2.6 * k;
            pts.push([a[0] + ux * t - uy * wob, a[1] + uy * t + ux * wob]);
          }
          body += `<path d='${smooth(pts)}'/>`;
        }
      }
      return g(body, 1.5, 0.9);
    }
    case 'moldura': {
      // a moldura de diploma: dois filetes, e os cantos num de três jeitos clássicos
      const q = Math.max(0.4, k);
      const m1 = (8 + r() * 2) * q,
        m2 = m1 + (4.5 + r() * 1.5) * q;
      const style = Math.floor(r() * 3);
      const wob = 1.2 * k,
        seg = 34 * q;
      const line = (a: Pt, b: Pt) => `<path d='${smooth(handLine(a, b, r, wob, seg))}'/>`;
      // um retângulo, lado a lado; `over` passa do canto (os filetes cruzados)
      const rect = (m: number, over = 0) => {
        const c = inset(W, H, m);
        let d = '';
        for (let s = 0; s < 4; s++) {
          const a = c[s],
            b = c[(s + 1) % 4];
          const ux = Math.sign(b[0] - a[0]),
            uy = Math.sign(b[1] - a[1]);
          d += line([a[0] - ux * over, a[1] - uy * over], [b[0] + ux * over, b[1] + uy * over]);
        }
        return d;
      };
      let inner = '';
      if (style === 0) {
        // os filetes de dentro passam do canto e encostam no de fora, fechando um quadradinho
        inner = rect(m2, m2 - m1);
      } else if (style === 1) {
        // os cantos de dentro cavados para dentro, num quarto de círculo
        const R = (m2 - m1) * 2.2;
        const c = inset(W, H, m2);
        for (let s = 0; s < 4; s++) {
          const a = c[s],
            b = c[(s + 1) % 4];
          const ux = Math.sign(b[0] - a[0]),
            uy = Math.sign(b[1] - a[1]);
          const from: Pt = [a[0] + ux * R, a[1] + uy * R],
            to: Pt = [b[0] - ux * R, b[1] - uy * R];
          inner += line(from, to);
          // do fim deste lado ao começo do próximo, em volta do canto b
          const nx = Math.sign(c[(s + 2) % 4][0] - b[0]),
            ny = Math.sign(c[(s + 2) % 4][1] - b[1]);
          inner += `<path d='M${f1(to[0])} ${f1(to[1])}A${f1(R)} ${f1(R)} 0 0 0 ${f1(b[0] + nx * R)} ${f1(b[1] + ny * R)}'/>`;
        }
      } else {
        // um losangozinho pintado em cada canto de dentro
        inner = rect(m2);
        const d = (m2 - m1) * 0.9;
        for (const [x, y] of inset(W, H, m2)) inner += `<path class='f' d='M${f1(x)} ${f1(y - d)}L${f1(x + d)} ${f1(y)}L${f1(x)} ${f1(y + d)}L${f1(x - d)} ${f1(y)}Z'/>`;
      }
      return g(rect(m1), 1.6, 0.9) + g(inner, 1, 0.8);
    }
    case 'renda': {
      // a toalhinha de renda: a borda em ondinhas, cada uma com o seu furinho, e um alinhavo por dentro
      const q = Math.max(0.4, k);
      const m = (5 + r() * 2) * q;
      const bump = (6 + r() * 3) * q;
      const holes = r() < 0.65;
      const c = inset(W, H, m + bump);
      let wave = '',
        dots = '';
      for (let s = 0; s < 4; s++) {
        const a = c[s],
          b = c[(s + 1) % 4];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(2, Math.round(len / (bump * 2)));
        const ux = (b[0] - a[0]) / len,
          uy = (b[1] - a[1]) / len;
        const step = len / n;
        let d = `M${f1(a[0])} ${f1(a[1])}`;
        for (let i = 1; i <= n; i++) {
          d += `A${f1(step / 2)} ${f1(step / 2)} 0 0 1 ${f1(a[0] + ux * step * i)} ${f1(a[1] + uy * step * i)}`;
          // o furinho no meio da ondinha, um pouco para fora (a esquerda de quem anda é o lado de fora)
          const cx = a[0] + ux * step * (i - 0.5) + uy * step * 0.2,
            cy = a[1] + uy * step * (i - 0.5) - ux * step * 0.2;
          dots += holes ? `<circle cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(step * 0.11)}'/>` : `<circle class='f' cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(step * 0.06)}'/>`;
        }
        wave += `<path d='${d}'/>`;
      }
      const tack = (m + bump + 4 * q);
      const stitch = `<path d='${poly([...inset(W, H, tack), [tack, tack]])}' style='stroke-dasharray:${f1(4 * q)} ${f1(3.5 * q)}'/>`;
      return g(wave, 1.3, 0.9) + g(dots + stitch, 0.9, 0.75);
    }
    case 'cupom': {
      // recorte aqui: o tracejado em volta, e a tesourinha já cortando num dos lados
      const q = Math.max(0.4, k);
      const m = (9 + r() * 3) * q;
      const c = inset(W, H, m);
      // o lado da tesoura: nunca o de cima à esquerda, onde fica a foto
      const side = [0, 1, 1, 2, 3][Math.floor(r() * 5)];
      const at = side === 0 ? 0.62 + r() * 0.26 : side === 3 ? 0.35 + r() * 0.4 : 0.2 + r() * 0.6;
      const sz = 34 * q;
      const dash = `stroke-dasharray:${f1(6 * q)} ${f1(4.5 * q)}`;
      let body = '',
        tool = '';
      for (let s = 0; s < 4; s++) {
        const a = c[s],
          b = c[(s + 1) % 4];
        if (s !== side) {
          body += `<path d='${smooth(handLine(a, b, r, 1.2 * k, 40 * q))}' style='${dash}'/>`;
          continue;
        }
        // o lado da tesoura: o tracejado para onde ela está, e segue depois dela
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ux = (b[0] - a[0]) / len,
          uy = (b[1] - a[1]) / len;
        const p: Pt = [a[0] + ux * len * at, a[1] + uy * len * at];
        const gap = sz * 0.55;
        body += `<path d='${smooth(handLine(a, [p[0] - ux * gap, p[1] - uy * gap], r, 1.2 * k, 40 * q))}' style='${dash}'/>`;
        body += `<path d='${smooth(handLine([p[0] + ux * gap, p[1] + uy * gap], b, r, 1.2 * k, 40 * q))}' style='${dash}'/>`;
        const ang = (Math.atan2(uy, ux) * 180) / Math.PI;
        tool = `<g transform='translate(${f1(p[0])} ${f1(p[1])}) rotate(${f1(ang + (r() - 0.5) * 16)}) scale(${(sz / 40).toFixed(3)}) translate(-20 -20)'>${SCISSORS}</g>`;
      }
      return g(body, 1.3, 0.85) + g(tool, 1.5, 0.95);
    }
    case 'pelicula': {
      // a ficha virou um fotograma: a faixa dos furinhos em cima e embaixo
      const q = Math.max(0.4, k);
      const band = (15 + r() * 3) * q;
      const edge = (3 + r() * 2) * q;
      const pitch = (12 + r() * 3) * q;
      const hw = pitch * 0.5,
        hh = band * 0.4;
      const round = r() < 0.5 ? hh * 0.35 : hh * 0.12;
      const shift = r() * pitch;
      let lines = '',
        holes = '';
      for (const top of [true, false]) {
        const y0 = top ? edge : H - edge,
          y1 = top ? edge + band : H - edge - band;
        lines += `<path d='${smooth(handLine([0, y0], [W, y0], r, 1 * k, 40 * q))}'/><path d='${smooth(handLine([0, y1], [W, y1], r, 1 * k, 40 * q))}'/>`;
        const cy = (y0 + y1) / 2;
        for (let x = shift - pitch; x < W + pitch; x += pitch) {
          if (x - hw / 2 < 0 || x + hw / 2 > W) continue;
          holes += `<rect x='${f1(x - hw / 2)}' y='${f1(cy - hh / 2)}' width='${f1(hw)}' height='${f1(hh)}' rx='${f1(round)}'/>`;
        }
      }
      return g(lines, 1.4, 0.85) + g(holes, 1.1, 0.8);
    }
    case 'regua': {
      // uma régua passada em dois lados, a partir de um canto (nunca o da foto), com os centímetros
      const q = Math.max(0.4, k);
      const corner = 1 + Math.floor(r() * 3);
      const m = (4 + r() * 2) * q;
      const mm = (5 + r() * 1.2) * q;
      const c = inset(W, H, m);
      const o = c[corner];
      // os dois lados que saem do canto, e para que lado as marquinhas entram
      const ends = [c[(corner + 1) % 4], c[(corner + 3) % 4]];
      let base = '',
        ticks = '',
        nums = '';
      for (const e of ends) {
        const len = Math.hypot(e[0] - o[0], e[1] - o[1]);
        const ux = (e[0] - o[0]) / len,
          uy = (e[1] - o[1]) / len;
        // para dentro da ficha: o lado do centro
        const toward = sideOf(o, e, [W / 2, H / 2]);
        const nx = -uy * toward,
          ny = ux * toward;
        const reach = len * (0.7 + r() * 0.3);
        base += `<path d='${smooth(handLine(o, [o[0] + ux * reach, o[1] + uy * reach], r, 0.8 * k, 40 * q))}'/>`;
        for (let i = 1; i * mm < reach; i++) {
          const t = i * mm;
          const lk = i % 10 === 0 ? 2.4 : i % 5 === 0 ? 1.6 : 1;
          const x = o[0] + ux * t,
            y = o[1] + uy * t;
          ticks += `M${f1(x)} ${f1(y)}l${f1(nx * 4.4 * q * lk)} ${f1(ny * 4.4 * q * lk)}`;
          if (i % 10 === 0 && t < reach - mm * 3)
            nums += `<text class='f' x='${f1(x + nx * 4.4 * q * 3.7)}' y='${f1(y + ny * 4.4 * q * 3.7)}' text-anchor='middle' dominant-baseline='central' style='font:800 ${f1(10 * q)}px var(--f-label, sans-serif)'>${i / 10}</text>`;
        }
      }
      return g(base, 1.5, 0.95) + g(`<path d='${ticks}'/>`, 1.1, 0.95) + g(nums, 1, 1.2);
    }
    case 'trepadeira': {
      // um galhinho que nasce num canto (nunca o da foto) e sobe pelos dois lados, folha para lá, folha para cá
      const q = Math.max(0.4, k);
      const corner = 1 + Math.floor(r() * 3);
      const m = (9 + r() * 3) * q;
      const c = inset(W, H, m);
      const o = c[corner];
      let stems = '',
        leaves = '';
      const leaf = (x: number, y: number, ang: number, L: number) =>
        `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(ang)})'><path d='M0 0Q${f1(L * 0.5)} ${f1(-L * 0.42)} ${f1(L)} 0Q${f1(L * 0.5)} ${f1(L * 0.42)} 0 0Z'/><path d='M${f1(L * 0.15)} 0L${f1(L * 0.72)} 0' class='h'/></g>`;
      for (const e of [c[(corner + 1) % 4], c[(corner + 3) % 4]]) {
        const len = Math.hypot(e[0] - o[0], e[1] - o[1]);
        const ux = (e[0] - o[0]) / len,
          uy = (e[1] - o[1]) / len;
        const reach = len * (0.5 + r() * 0.3);
        const amp = (3.5 + r() * 2) * q,
          wave = (38 + r() * 14) * q,
          phase = r() * Math.PI * 2;
        const at = (t: number): Pt => {
          const w = amp * Math.sin((t / wave) * Math.PI * 2 + phase) * Math.min(1, t / (wave * 0.5));
          return [o[0] + ux * t - uy * w, o[1] + uy * t + ux * w];
        };
        const pts: Pt[] = [];
        for (let t = 0; t <= reach; t += 8 * q) pts.push(at(t));
        stems += `<path d='${smooth(pts)}'/>`;
        // a ponta enrola
        const tip = at(reach),
          dirA = Math.atan2(uy, ux);
        const curl = 5 * q * (r() < 0.5 ? 1 : -1);
        stems += `<path d='M${f1(tip[0])} ${f1(tip[1])}q${f1(Math.cos(dirA) * 6 * q)} ${f1(Math.sin(dirA) * 6 * q)} ${f1(Math.cos(dirA) * 5 * q - Math.sin(dirA) * curl)} ${f1(Math.sin(dirA) * 5 * q + Math.cos(dirA) * curl)}t${f1(-Math.cos(dirA) * 3 * q)} ${f1(-Math.sin(dirA) * 3 * q)}'/>`;
        let flip = r() < 0.5 ? 1 : -1;
        for (let t = 12 * q + r() * 8 * q; t < reach - 8 * q; t += (17 + r() * 6) * q) {
          const p = at(t),
            p2 = at(t + 1);
          const tan = (Math.atan2(p2[1] - p[1], p2[0] - p[0]) * 180) / Math.PI;
          // as folhas encolhem para a ponta
          const L = (17 - 7 * (t / reach) + r() * 3) * q;
          leaves += leaf(p[0], p[1], tan + flip * (48 + r() * 18), L);
          flip = -flip;
        }
      }
      // no canto, uma florzinha de cinco pétalas
      const fr = 4.2 * q;
      let flower = `<circle class='f' cx='${f1(o[0])}' cy='${f1(o[1])}' r='${f1(fr * 0.6)}'/>`;
      const turn = r() * 72;
      for (let i = 0; i < 5; i++) {
        const a = ((turn + i * 72) * Math.PI) / 180;
        flower += `<circle cx='${f1(o[0] + Math.cos(a) * fr * 1.5)}' cy='${f1(o[1] + Math.sin(a) * fr * 1.5)}' r='${f1(fr)}'/>`;
      }
      return g(stems, 1.6, 0.95) + g(leaves, 1.2, 0.95) + g(flower, 1.3, 0.95);
    }
    case 'bandeirinhas': {
      // o varal de festa junina atravessando o alto da ficha, em duas barrigas
      const q = Math.max(0.4, k);
      const y0 = (4 + r() * 3) * q;
      const mid = W * (0.4 + r() * 0.2);
      const cuts = r() < 0.5;
      const fw = (18 + r() * 4) * q,
        fh = (21 + r() * 4) * q;
      let strings = '',
        flags = '';
      let n = 0;
      for (const [xa, xb] of [
        [-4 * q, mid],
        [mid, W + 4 * q],
      ]) {
        const sag = (12 + r() * 8) * q;
        const P0: Pt = [xa, y0],
          P2: Pt = [xb, y0 + (r() - 0.5) * 3 * q],
          C: Pt = [(xa + xb) / 2, y0 + sag * 2];
        const at = (t: number): Pt => [
          (1 - t) * (1 - t) * P0[0] + 2 * (1 - t) * t * C[0] + t * t * P2[0],
          (1 - t) * (1 - t) * P0[1] + 2 * (1 - t) * t * C[1] + t * t * P2[1],
        ];
        strings += `<path d='M${f1(P0[0])} ${f1(P0[1])}Q${f1(C[0])} ${f1(C[1])} ${f1(P2[0])} ${f1(P2[1])}'/>`;
        const count = Math.max(2, Math.floor((xb - xa) / (fw * 1.35)));
        for (let i = 0; i < count; i++) {
          const t0 = (i + 0.5) / count - (fw / (xb - xa)) * 0.5,
            t1 = t0 + fw / (xb - xa);
          const a = at(t0),
            b = at(t1);
          const h = fh * (0.9 + r() * 0.2);
          const d = cuts
            ? `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}L${f1(b[0])} ${f1(b[1] + h)}L${f1((a[0] + b[0]) / 2)} ${f1((a[1] + b[1]) / 2 + h * 0.66)}L${f1(a[0])} ${f1(a[1] + h)}Z`
            : `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}L${f1((a[0] + b[0]) / 2)} ${f1((a[1] + b[1]) / 2 + h)}Z`;
          // uma pintada, outra só no contorno
          flags += `<path${n++ % 2 ? " class='f'" : ''} d='${d}'/>`;
        }
      }
      return g(strings, 1.3, 0.95) + g(flags, 1.3, 0.95);
    }
    case 'gotica': {
      // o portal de igreja gótica, em tríptico como as fachadas e os altares: quatro colunas (feixe de
      // fustes, capitel e base) e, por cima delas, um arco ogival alto no meio e um mais baixo de cada lado,
      // todos de ponta firme. O do meio tem duas arquivoltas com as aduelas marcadas, os ganchinhos de pedra
      // (crochets) por fora e a cruz na ponta; os pináculos sobem das colunas, uma rosácea fica em cima de
      // cada arco do lado e, no rodapé, corre a arcada de arquinhos
      const q = Math.max(0.4, k);
      const wob = 0.8 * k,
        seg = 30 * q;
      const line = (a: Pt, b: Pt) => `<path d='${smooth(handLine(a, b, r, wob, seg))}'/>`;
      const m = (6 + r() * 2) * q; // a beirada de fora das colunas
      const cw = (11 + r() * 3) * q; // a largura da coluna
      const ya = (17 + r() * 3) * q; // a ponta do arco do meio, com lugar para a cruz por cima
      const foot = (14 + r() * 4) * q; // a altura do rodapé
      const band = (6.5 + r() * 1.5) * q; // a espessura do arco
      const xL = m + cw / 2,
        xi = W * (0.26 + r() * 0.03); // o meio das colunas de dentro
      const hc = W / 2 - xi,
        hs = (xi - xL) / 2;
      // os arcos nascem baixo o bastante para o do meio subir pontudo (a ficha é deitada)
      const ys = clamp(ya + 1.35 * hc, H * 0.45, H * 0.7);
      const ysa = Math.max(ya + 18 * q, ys - 1.45 * hs); // a ponta dos arcos do lado
      let cols = '',
        arch = '',
        orn = '';
      /** Uma coluna: dois fustes e o filete do meio, o capitel em degraus com duas folhinhas e a base. */
      const column = (x0: number, x1: number) => {
        const top = ys + 4 * q,
          bot = H - foot - 4 * q;
        let s = line([x0, top], [x0, bot]) + line([x1, top], [x1, bot]);
        s += `<path class='h' d='M${f1((x0 + x1) / 2)} ${f1(top + 3 * q)}V${f1(bot - 3 * q)}'/>`;
        s += `<path d='M${f1(x0 - 2 * q)} ${f1(top)}H${f1(x1 + 2 * q)}L${f1(x1 + 3.5 * q)} ${f1(ys)}H${f1(x0 - 3.5 * q)}Z'/>`;
        s += `<path class='h' d='M${f1(x0 + 1.5 * q)} ${f1(top)}q${f1(1.5 * q)} ${f1(-3 * q)} ${f1(3.5 * q)} 0M${f1(x1 - 1.5 * q)} ${f1(top)}q${f1(-1.5 * q)} ${f1(-3 * q)} ${f1(-3.5 * q)} 0'/>`;
        s += `<path d='M${f1(x0 - 2 * q)} ${f1(bot)}H${f1(x1 + 2 * q)}V${f1(bot + 2.5 * q)}H${f1(x0 - 2 * q)}ZM${f1(x0 - 3.5 * q)} ${f1(bot + 2.5 * q)}H${f1(x1 + 3.5 * q)}V${f1(bot + 4.5 * q)}H${f1(x0 - 3.5 * q)}Z'/>`;
        return s;
      };
      /** Um pináculo: a torrezinha pontuda em cima do capitel, com crochets e a florzinha na ponta. */
      const pinnacle = (x0: number, x1: number, tip: number) => {
        const px = (x0 + x1) / 2,
          pb = ys - 1;
        let s = `<path d='M${f1(x0 + 1.5 * q)} ${f1(pb)}L${f1(px)} ${f1(tip)}L${f1(x1 - 1.5 * q)} ${f1(pb)}'/>`;
        for (let i = 1; i < 4; i++) {
          const t = i / 4,
            yy = pb + (tip - pb) * t,
            hw = ((x1 - x0) / 2 - 1.5 * q) * (1 - t);
          s += `<path class='h' d='M${f1(px - hw)} ${f1(yy)}q${f1(-2.4 * q)} ${f1(-0.4 * q)} ${f1(-2.6 * q)} ${f1(-2.6 * q)}M${f1(px + hw)} ${f1(yy)}q${f1(2.4 * q)} ${f1(-0.4 * q)} ${f1(2.6 * q)} ${f1(-2.6 * q)}'/>`;
        }
        return s + `<circle class='f' cx='${f1(px)}' cy='${f1(tip - 1.6 * q)}' r='${f1(1.5 * q)}'/>`;
      };
      const cwi = cw * 0.75;
      for (const right of [false, true]) {
        const x0 = right ? W - m - cw : m;
        cols += column(x0, x0 + cw);
        orn += pinnacle(x0, x0 + cw, Math.max(ya + 2 * q, ys - Math.min(ys * 0.75, 46 * q)));
        const c = right ? W - xi : xi;
        cols += column(c - cwi / 2, c + cwi / 2);
        // o de dentro sobe entre o arco do meio e o do lado, até a altura da ponta do lado
        orn += pinnacle(c - cwi / 2, c + cwi / 2, Math.max(ya + 4 * q, ysa + 4 * q));
      }
      /**
       * Meio arco ogival, do capitel (`sx`) até a ponta (`ex`, `ey`). Alto o bastante, é o arco de dois
       * centros das igrejas: um arco de círculo só, que sai do capitel em pé e encontra o outro em bico.
       * Baixo demais para isso, ganha um ombro mais fechado e uma curva mais aberta até a ponta (quatro centros).
       */
      const ogive = (sx: number, ex: number, ey: number, dir: 1 | -1): Pt[] => {
        const h = Math.abs(ex - sx),
          v = ys - ey;
        const local: Pt[] = [];
        if (v >= h) {
          const R = (h * h + v * v) / (2 * h);
          const end = Math.acos((h - R) / R);
          for (let i = 0; i <= 24; i++) {
            const th = Math.PI + ((end - Math.PI) * i) / 24;
            local.push([R + R * Math.cos(th), R * Math.sin(th)]);
          }
        } else {
          const al = (10 * Math.PI) / 180,
            be = (50 * Math.PI) / 180;
          const a11 = 1 - Math.sin(be),
            a12 = Math.sin(be) - Math.sin(al),
            a21 = Math.cos(be),
            a22 = Math.cos(al) - Math.cos(be);
          const det = a11 * a22 - a12 * a21;
          const R1 = (h * a22 - a12 * v) / det,
            R2 = (a11 * v - a21 * h) / det;
          if (R1 > 0 && R2 > 0) {
            const tb = be + Math.PI / 2,
              ta = al + Math.PI / 2;
            for (let i = 0; i <= 10; i++) {
              const th = Math.PI + ((tb - Math.PI) * i) / 10;
              local.push([R1 + R1 * Math.cos(th), R1 * Math.sin(th)]);
            }
            const c2: Pt = [R1 + (R1 - R2) * Math.cos(tb), (R1 - R2) * Math.sin(tb)];
            for (let i = 1; i <= 14; i++) {
              const th = tb + ((ta - tb) * i) / 14;
              local.push([c2[0] + R2 * Math.cos(th), c2[1] + R2 * Math.sin(th)]);
            }
          } else for (let i = 0; i <= 24; i++) local.push([h * (1 - Math.cos((i / 24) * (Math.PI / 2))), v * Math.sin((i / 24) * (Math.PI / 2))]);
        }
        const pts = local.map(([x, y]): Pt => [sx + dir * x, ys - y]);
        return resample(pts, Math.max(1, lengths(pts)[pts.length - 1] / 24)).slice(0, 25);
      };
      /** Um arco inteiro entre dois capitéis, de ponta em `ey`: as duas metades, de fora e de dentro. */
      const pointed = (a: number, b: number, ey: number, inset: number) => {
        const mid = (a + b) / 2;
        return [ogive(a + inset, mid, ey + inset, 1), ogive(b - inset, mid, ey + inset, -1)];
      };
      // o do meio: duas arquivoltas, as aduelas riscadas de uma à outra e os crochets por fora
      const outer = pointed(xi, W - xi, ya, 0),
        inner = pointed(xi, W - xi, ya, band);
      for (const pts of [...outer, ...inner]) arch += `<path d='${smooth(pts)}'/>`;
      for (const s of [0, 1])
        for (let i = 3; i < Math.min(outer[s].length, inner[s].length) - 1; i += 3)
          arch += `<path class='h' d='M${pt(outer[s][i])}L${pt(inner[s][i])}'/>`;
      for (const [pts, o] of [
        [outer[0], 1],
        [outer[1], -1],
      ] as const) {
        for (let i = 5; i < pts.length - 2; i += 3) {
          const [x, y] = pts[i],
            [x2, y2] = pts[i + 1];
          const l = Math.hypot(x2 - x, y2 - y) || 1;
          const nx = (y2 - y) / l,
            ny = -(x2 - x) / l;
          orn += `<path class='h' d='M${f1(x)} ${f1(y)}q${f1(nx * o * 4 * q + (x2 - x) / l * 1.5 * q)} ${f1(ny * o * 4 * q + (y2 - y) / l * 1.5 * q)} ${f1(nx * o * 3 * q + (x2 - x) / l * 4 * q)} ${f1(ny * o * 3 * q + (y2 - y) / l * 4 * q)}'/>`;
        }
      }
      // na ponta do meio, a cruz de pedra sobre um botão
      const ch = Math.min(ya - 2 * q, 12 * q);
      orn += `<path d='M${f1(W / 2)} ${f1(ya)}V${f1(ya - ch)}M${f1(W / 2 - ch * 0.3)} ${f1(ya - ch * 0.68)}H${f1(W / 2 + ch * 0.3)}'/>`;
      orn += `<circle class='f' cx='${f1(W / 2)}' cy='${f1(ya - 0.4 * q)}' r='${f1(1.6 * q)}'/>`;
      // os dois do lado: mais baixos, de arquivolta fina, com um botão na ponta e a rosácea por cima
      for (const right of [false, true]) {
        const a = right ? W - xi : xL,
          b = right ? W - xL : xi;
        for (const pts of [...pointed(a, b, ysa, 0), ...pointed(a, b, ysa, band * 0.6)]) arch += `<path d='${smooth(pts)}'/>`;
        const cx = (a + b) / 2;
        orn += `<circle class='f' cx='${f1(cx)}' cy='${f1(ysa - 2 * q)}' r='${f1(1.4 * q)}'/>`;
        const R = Math.min((ysa - m) * 0.36, hs * 0.72);
        if (R < 5 * q) continue;
        const ry = (m + ysa - 4 * q) / 2;
        orn += `<circle cx='${f1(cx)}' cy='${f1(ry)}' r='${f1(R)}'/><circle cx='${f1(cx)}' cy='${f1(ry)}' r='${f1(R * 0.84)}' class='h'/><circle cx='${f1(cx)}' cy='${f1(ry)}' r='${f1(R * 0.26)}'/>`;
        const spokes = R > 18 * q ? 12 : 8;
        for (let i = 0; i < spokes; i++) {
          const t = (i / spokes) * Math.PI * 2;
          orn += `<path class='h' d='M${f1(cx + Math.cos(t) * R * 0.26)} ${f1(ry + Math.sin(t) * R * 0.26)}L${f1(cx + Math.cos(t) * R * 0.84)} ${f1(ry + Math.sin(t) * R * 0.84)}'/>`;
          const u = t + Math.PI / spokes;
          orn += `<circle cx='${f1(cx + Math.cos(u) * R * 0.6)}' cy='${f1(ry + Math.sin(u) * R * 0.6)}' r='${f1(R * (spokes === 12 ? 0.13 : 0.18))}' class='h'/>`;
        }
      }
      // o rodapé: o friso de cima e de baixo e a arcada de arquinhos pontudos entre as colunas
      const fy0 = H - foot,
        fy1 = H - m * 0.6;
      let foots = line([m, fy0], [W - m, fy0]) + line([m, fy1], [W - m, fy1]);
      const pitch = (10 + r() * 2) * q;
      const x0 = m + cw + 4 * q,
        x1 = W - m - cw - 4 * q;
      const n = Math.max(2, Math.floor((x1 - x0) / pitch));
      const step = (x1 - x0) / n;
      let d = '';
      for (let j = 0; j < n; j++) {
        const a = x0 + j * step,
          b2 = a + step,
          mid = a + step / 2;
        const base = fy1 - 1 * q,
          tip = fy0 + 2.5 * q;
        // o arquinho em lanceta: as duas metades se encontram em ponta
        const spring = tip + (base - tip) * 0.5,
          hh = spring - tip;
        d += `M${f1(a)} ${f1(base)}V${f1(spring)}C${f1(a)} ${f1(spring - hh * 0.55)} ${f1(mid - step * 0.18)} ${f1(tip + hh * 0.2)} ${f1(mid)} ${f1(tip)}C${f1(mid + step * 0.18)} ${f1(tip + hh * 0.2)} ${f1(b2)} ${f1(spring - hh * 0.55)} ${f1(b2)} ${f1(spring)}`;
      }
      foots += `<path class='h' d='${d}'/>`;
      return g(cols + arch + foots, 1.3, 1.05) + g(orn, 1, 0.95);
    }
    case 'arabesco': {
      // arabescos de convite antigo: em cada canto, dois ramos saem pelas beiradas e terminam enrolados
      // num caracol, com folhinhas em gota no caminho
      const q = Math.max(0.4, k);
      const m = (8 + r() * 3) * q;
      let body = '',
        leaves = '';
      const curl = (o: Pt, ux: number, uy: number, nx: number, ny: number, L: number, R0: number) => {
        // o ramo: sai do canto rente à beirada, sobe um pouco para dentro e enrola no fim
        const pts: Pt[] = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          const bow = Math.sin(t * Math.PI) * R0 * 0.5;
          pts.push([o[0] + ux * L * t + nx * bow, o[1] + uy * L * t + ny * bow]);
        }
        const end = pts[pts.length - 1];
        // o caracol: gira para dentro da ficha, encolhendo
        const c: Pt = [end[0] + nx * R0, end[1] + ny * R0];
        const a0 = Math.atan2(end[1] - c[1], end[0] - c[0]);
        const turnDir = ux * ny - uy * nx > 0 ? -1 : 1;
        for (let i = 1; i <= 26; i++) {
          const t = i / 26;
          const a = a0 + turnDir * t * Math.PI * 2.1;
          const rr = R0 * (1 - t * 0.78);
          pts.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
        }
        body += `<path d='${smooth(pts)}'/>`;
        // no meio do ramo nasce uma volutinha para o outro lado: o S do arabesco
        const mid = pts[5];
        const c2: Pt = [mid[0] + nx * R0 * 0.55 + ux * R0 * 0.2, mid[1] + ny * R0 * 0.55 + uy * R0 * 0.2];
        const b0 = Math.atan2(mid[1] - c2[1], mid[0] - c2[0]);
        const sp: Pt[] = [mid];
        for (let i = 1; i <= 18; i++) {
          const t = i / 18,
            a = b0 - turnDir * t * Math.PI * 1.7,
            rr = R0 * 0.55 * (1 - t * 0.7);
          sp.push([c2[0] + Math.cos(a) * rr, c2[1] + Math.sin(a) * rr]);
        }
        body += `<path d='${smooth(sp)}'/>`;
        // folhinhas em gota, de um lado e do outro do ramo
        for (const t of [0.35, 0.62]) {
          const p = pts[Math.round(t * 10)];
          const side = t < 0.5 ? 1 : -1;
          const ang = (Math.atan2(uy, ux) * 180) / Math.PI + side * 40 + (side > 0 ? 180 : 0) * 0;
          const Lf = R0 * 0.9;
          leaves += `<g transform='translate(${f1(p[0])} ${f1(p[1])}) rotate(${f1(ang + (side > 0 ? -90 : 90) * (ux * ny - uy * nx > 0 ? 1 : -1) * 0.5)})'><path d='M0 0Q${f1(Lf * 0.5)} ${f1(-Lf * 0.38)} ${f1(Lf)} 0Q${f1(Lf * 0.5)} ${f1(Lf * 0.38)} 0 0Z'/></g>`;
        }
      };
      const c = inset(W, H, m);
      for (let i = 0; i < 4; i++) {
        const o = c[i];
        const next = c[(i + 1) % 4],
          prev = c[(i + 3) % 4];
        const R0 = (9 + r() * 3) * q;
        for (const e of [next, prev]) {
          const len = Math.hypot(e[0] - o[0], e[1] - o[1]);
          const ux = (e[0] - o[0]) / len,
            uy = (e[1] - o[1]) / len;
          const toward = sideOf(o, e, [W / 2, H / 2]);
          curl(o, ux, uy, -uy * toward, ux * toward, Math.min(len * 0.3, (58 + r() * 18) * q), R0);
        }
        // o botão do canto
        body += `<circle cx='${f1(o[0])}' cy='${f1(o[1])}' r='${f1(3 * q)}'/>`;
        leaves += `<circle class='f' cx='${f1(o[0])}' cy='${f1(o[1])}' r='${f1(1.3 * q)}'/>`;
      }
      return g(body, 1.3, 0.9) + g(leaves, 1, 0.85);
    }
    case 'dialogo': {
      // a caixa de diálogo de RPG antigo: borda dupla em degraus de pixel nas quinas e a setinha piscando
      const q = Math.max(0.4, k);
      const px = (3.2 + r() * 0.8) * q;
      const m = (5 + r() * 2) * q;
      const box = (mm: number, steps: number) => {
        const s = px * steps;
        const pts: Pt[] = [];
        const corner = (x: number, y: number, sx: number, sy: number) => {
          // da beirada de cima para a do lado, em degraus
          for (let i = 0; i <= steps; i++) {
            pts.push([x + sx * (s - i * px), y + sy * i * px]);
            if (i < steps) pts.push([x + sx * (s - (i + 1) * px), y + sy * i * px]);
          }
        };
        corner(mm, mm, 1, 1);
        corner(W - mm, mm, -1, 1);
        const cA = pts.length;
        void cA;
        return pts;
      };
      // desenha um retângulo de quinas em degrau, lado a lado
      const stepped = (mm: number, steps: number) => {
        const s = px * steps;
        const L = mm,
          T = mm,
          Rr = W - mm,
          B = H - mm;
        let d = `M${f1(L + s)} ${f1(T)}L${f1(Rr - s)} ${f1(T)}`;
        for (let i = 0; i < steps; i++) d += `L${f1(Rr - s + (i + 1) * px)} ${f1(T + i * px)}L${f1(Rr - s + (i + 1) * px)} ${f1(T + (i + 1) * px)}`;
        d += `L${f1(Rr)} ${f1(B - s)}`;
        for (let i = 0; i < steps; i++) d += `L${f1(Rr - i * px)} ${f1(B - s + (i + 1) * px)}L${f1(Rr - (i + 1) * px)} ${f1(B - s + (i + 1) * px)}`;
        d += `L${f1(L + s)} ${f1(B)}`;
        for (let i = 0; i < steps; i++) d += `L${f1(L + s - (i + 1) * px)} ${f1(B - i * px)}L${f1(L + s - (i + 1) * px)} ${f1(B - (i + 1) * px)}`;
        d += `L${f1(L)} ${f1(T + s)}`;
        for (let i = 0; i < steps; i++) d += `L${f1(L + i * px)} ${f1(T + s - (i + 1) * px)}L${f1(L + (i + 1) * px)} ${f1(T + s - (i + 1) * px)}`;
        return `<path d='${d}Z'/>`;
      };
      void box;
      const outer = stepped(m, 2),
        inner = stepped(m + px * 1.8, 1);
      // a setinha de "continua": um triângulo de pixels no canto de baixo à direita
      const tx = W - m - px * 6,
        ty = H - m - px * 5.2;
      let tri = '';
      for (let row = 0; row < 3; row++)
        for (let col = row; col < 5 - row; col++) tri += `<rect class='f' x='${f1(tx - px * 2.5 + col * px)}' y='${f1(ty + row * px)}' width='${f1(px * 0.92)}' height='${f1(px * 0.92)}'/>`;
      return g(outer, 1.5, 0.95) + g(inner, 1, 0.8) + g(tri, 1, 1.1);
    }
    case 'hud': {
      // a tela de jogo de tiro: as quinas da mira, a régua de cima, a barra de vida e um alvo miudinho
      const q = Math.max(0.4, k);
      const m = (7 + r() * 2) * q;
      const arm = Math.min(W, H) * (0.12 + r() * 0.05);
      let brackets = '';
      for (const [x, y] of inset(W, H, m)) {
        const sx = x < W / 2 ? 1 : -1,
          sy = y < H / 2 ? 1 : -1;
        brackets += `<path d='M${f1(x)} ${f1(y + sy * arm)}L${f1(x)} ${f1(y)}L${f1(x + sx * arm)} ${f1(y)}'/>`;
        brackets += `<path d='M${f1(x + sx * 3 * q)} ${f1(y + sy * arm * 0.55)}L${f1(x + sx * 3 * q)} ${f1(y + sy * 3 * q)}L${f1(x + sx * arm * 0.55)} ${f1(y + sy * 3 * q)}' class='h'/>`;
      }
      // a régua de rumo no meio de cima, com o risquinho do meio mais alto
      let ticks = '';
      const tw = W * 0.32,
        t0 = W / 2 - tw / 2;
      for (let i = 0; i <= 16; i++) {
        const x = t0 + (tw * i) / 16,
          h = i === 8 ? 6 * q : i % 4 === 0 ? 4 * q : 2.2 * q;
        ticks += `M${f1(x)} ${f1(m)}L${f1(x)} ${f1(m + h)}`;
      }
      ticks += `M${f1(W / 2 - 2.5 * q)} ${f1(m + 9 * q)}L${f1(W / 2)} ${f1(m + 6.5 * q)}L${f1(W / 2 + 2.5 * q)} ${f1(m + 9 * q)}`;
      // a barra de vida embaixo à esquerda: gomos, uns cheios, e o coraçãozinho
      const segs = 8,
        sw2 = 6 * q,
        sh = 5 * q;
      const bx = m + arm * 0.25 + 10 * q,
        by = H - m - sh - 6 * q;
      const full = 3 + Math.floor(r() * 5);
      let bar = '';
      for (let i = 0; i < segs; i++) bar += `<rect${i < full ? " class='f'" : ''} x='${f1(bx + i * (sw2 + 1.6 * q))}' y='${f1(by)}' width='${f1(sw2)}' height='${f1(sh)}'/>`;
      const hx = bx - 7 * q,
        hy = by + sh / 2;
      bar += `<path class='f' d='M${f1(hx)} ${f1(hy + 3 * q)}L${f1(hx - 3 * q)} ${f1(hy)}A${f1(1.5 * q)} ${f1(1.5 * q)} 0 0 1 ${f1(hx)} ${f1(hy - 1.6 * q)}A${f1(1.5 * q)} ${f1(1.5 * q)} 0 0 1 ${f1(hx + 3 * q)} ${f1(hy)}Z'/>`;
      // a mira miudinha, perto do canto de baixo à direita
      const rx = W - m - arm * 0.9,
        ry = H - m - arm * 0.75,
        rr = 6 * q;
      const reticle = `<circle cx='${f1(rx)}' cy='${f1(ry)}' r='${f1(rr)}'/><path d='M${f1(rx - rr * 1.7)} ${f1(ry)}L${f1(rx - rr * 0.5)} ${f1(ry)}M${f1(rx + rr * 0.5)} ${f1(ry)}L${f1(rx + rr * 1.7)} ${f1(ry)}M${f1(rx)} ${f1(ry - rr * 1.7)}L${f1(rx)} ${f1(ry - rr * 0.5)}M${f1(rx)} ${f1(ry + rr * 0.5)}L${f1(rx)} ${f1(ry + rr * 1.7)}'/><circle class='f' cx='${f1(rx)}' cy='${f1(ry)}' r='${f1(0.9 * q)}'/>`;
      return g(brackets, 1.6, 0.95) + g(`<path d='${ticks}'/>`, 1, 0.85) + g(bar + reticle, 1.1, 0.9);
    }
    case 'runas': {
      // uma faixa de runas correndo em volta da ficha, entre dois filetes, como na borda de um mapa antigo
      const q = Math.max(0.4, k);
      const m1 = (5 + r() * 2) * q,
        band = (11 + r() * 2) * q,
        m2 = m1 + band;
      const wob = 0.8 * k,
        seg = 34 * q;
      const rect = (mm: number) => {
        const c = inset(W, H, mm);
        let d = '';
        for (let i = 0; i < 4; i++) d += `<path d='${smooth(handLine(c[i], c[(i + 1) % 4], r, wob, seg))}'/>`;
        return d;
      };
      const gh = band * 0.66,
        gw = gh * 0.55,
        pitch = gw * 2.1;
      let glyphs = '';
      const c = inset(W, H, m1 + band / 2);
      for (let i = 0; i < 4; i++) {
        const a = c[i],
          b = c[(i + 1) % 4];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        const n = Math.floor((len - band * 1.4) / pitch);
        const start = (len - n * pitch) / 2 + pitch / 2;
        for (let j = 0; j < n; j++) {
          const t = start + j * pitch;
          const x = a[0] + ((b[0] - a[0]) / len) * t,
            y = a[1] + ((b[1] - a[1]) / len) * t;
          // de vez em quando um pontinho separando as palavras
          if (r() < 0.14) {
            glyphs += `<circle class='f' cx='${f1(x)}' cy='${f1(y)}' r='${f1(gw * 0.16)}'/>`;
            continue;
          }
          const rune = RUNES[Math.floor(r() * RUNES.length)];
          glyphs += `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(ang)}) scale(${(gw / 6).toFixed(3)} ${(gh / 10).toFixed(3)}) translate(-3 -5)'><path d='${rune}' vector-effect='non-scaling-stroke'/></g>`;
        }
      }
      // um losango em cada canto, onde as faixas se encontram
      let knots = '';
      for (const [x, y] of c) {
        const d = band * 0.36;
        knots += `<path d='M${f1(x)} ${f1(y - d)}L${f1(x + d)} ${f1(y)}L${f1(x)} ${f1(y + d)}L${f1(x - d)} ${f1(y)}Z'/><circle class='f' cx='${f1(x)}' cy='${f1(y)}' r='${f1(d * 0.3)}'/>`;
      }
      return g(rect(m1) + rect(m2), 1.2, 0.85) + g(glyphs, 1.2, 0.95) + g(knots, 1.1, 0.9);
    }
    case 'farpado': {
      // arame farpado atravessando o alto e o pé da ficha: dois fios torcidos e as farpas de tempo em tempo
      const q = Math.max(0.4, k);
      let wire = '',
        barbs = '';
      for (const top of [true, false]) {
        const y0 = top ? (6 + r() * 3) * q : H - (6 + r() * 3) * q;
        const sag = (r() - 0.3) * 5 * q * (top ? 1 : -1);
        const ph = r() * Math.PI * 2;
        const period = (11 + r() * 2) * q,
          amp = 1.5 * q;
        const yAt = (x: number) => y0 + Math.sin((x / W) * Math.PI) * sag;
        for (const off of [0, Math.PI]) {
          const pts: Pt[] = [];
          for (let x = -4; x <= W + 4; x += 2.5 * q) pts.push([x, yAt(x) + Math.sin((x / period) * Math.PI * 2 + ph + off) * amp]);
          wire += `<path d='${smooth(pts)}'/>`;
        }
        const gap = (36 + r() * 12) * q;
        for (let x = gap * (0.3 + r() * 0.5); x < W; x += gap * (0.85 + r() * 0.3)) {
          const y = yAt(x),
            L = (4.2 + r() * 1.2) * q,
            tilt = (r() - 0.5) * 0.5;
          const spikes = [0.8 + tilt, 2.35 + tilt];
          let d = '';
          for (const a of spikes) d += `M${f1(x - Math.cos(a) * L)} ${f1(y - Math.sin(a) * L)}L${f1(x + Math.cos(a) * L)} ${f1(y + Math.sin(a) * L)}`;
          // o fio da farpa enrolado em volta
          barbs += `<path d='${d}'/><ellipse cx='${f1(x)}' cy='${f1(y)}' rx='${f1(1.8 * q)}' ry='${f1(2.4 * q)}'/>`;
        }
      }
      return g(wire, 1.1, 0.9) + g(barbs, 1.2, 0.95);
    }
    case 'terco': {
      // um terço largado num canto de baixo: a volta de contas (as grandes de dez em dez), a medalhinha
      // e a cauda com a cruz
      const q = Math.max(0.4, k);
      const right = r() < 0.7;
      const cx = right ? W * (0.8 + r() * 0.05) : W * (0.2 - r() * 0.05),
        cy = H * (0.72 + r() * 0.06);
      const rx = Math.min(W * 0.2, 72 * q),
        ry = Math.min(H * 0.22, 46 * q);
      const rot = ((right ? -1 : 1) * (15 + r() * 20) * Math.PI) / 180;
      const E = (a: number): Pt => {
        const x = Math.cos(a) * rx,
          y = Math.sin(a) * ry;
        return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
      };
      // a medalha fica no ponto da volta mais para o lado de dentro da ficha, um pouco abaixo do meio dela
      let best = 0,
        bd = Infinity;
      for (let i = 0; i < 72; i++) {
        const p = E((i / 72) * Math.PI * 2),
          d = (right ? p[0] : -p[0]) - p[1] * 0.35;
        if (d < bd) {
          bd = d;
          best = (i / 72) * Math.PI * 2;
        }
      }
      let thread = '',
        beads = '';
      const loop: Pt[] = [];
      const nb = 54;
      for (let i = 0; i <= nb; i++) loop.push(E(best + (i / nb) * Math.PI * 2));
      thread += `<path d='${smooth(loop)}'/>`;
      for (let i = 1; i < nb; i++) {
        const [x, y] = loop[i];
        if (x < -6 || x > W + 6 || y < -6 || y > H + 6) continue;
        const big = i % 11 === 0;
        beads += `<circle${big ? '' : " class='f'"} cx='${f1(x)}' cy='${f1(y)}' r='${f1((big ? 3.1 : 1.9) * q)}'/>`;
      }
      // a medalha e a cauda, descendo para dentro da ficha
      const J = loop[0];
      // a cauda sai para o lado de dentro, caindo um pouco com o peso da cruz
      const dirA = (right ? Math.PI - 0.5 : 0.5) + (r() - 0.5) * 0.3;
      const ux = Math.cos(dirA),
        uy = Math.sin(dirA);
      const md = 4.2 * q;
      beads += `<path d='M${f1(J[0])} ${f1(J[1] - md)}L${f1(J[0] + md * 0.8)} ${f1(J[1])}L${f1(J[0])} ${f1(J[1] + md)}L${f1(J[0] - md * 0.8)} ${f1(J[1])}Z'/>`;
      const tail: Pt[] = [];
      for (let i = 0; i <= 6; i++) tail.push([J[0] + ux * i * 6.5 * q + Math.sin(i) * 0.6 * q, J[1] + uy * i * 6.5 * q]);
      thread += `<path d='${smooth(tail)}'/>`;
      tail.slice(1, 6).forEach(([x, y], i) => (beads += `<circle${i === 0 || i === 4 ? '' : " class='f'"} cx='${f1(x)}' cy='${f1(y)}' r='${f1((i === 0 || i === 4 ? 3.1 : 1.9) * q)}'/>`));
      const [ex, ey] = tail[6];
      const cs = 11 * q,
        ang = (dirA * 180) / Math.PI - 90;
      const cross = `<g transform='translate(${f1(ex + ux * cs * 0.9)} ${f1(ey + uy * cs * 0.9)}) rotate(${f1(ang)})'><path d='M0 ${f1(-cs)}L0 ${f1(cs * 1.2)}M${f1(-cs * 0.6)} ${f1(-cs * 0.3)}L${f1(cs * 0.6)} ${f1(-cs * 0.3)}'/><path d='M${f1(-cs * 0.12)} ${f1(-cs)}H${f1(cs * 0.12)}V${f1(cs * 1.2)}H${f1(-cs * 0.12)}Z' class='f'/></g>`;
      return g(thread, 0.8, 0.8) + g(beads, 1.1, 0.95) + g(cross, 1.5, 1);
    }
    case 'invocacao': {
      // um círculo de invocação num canto (nunca o da foto), metade para fora: dois anéis com runas
      // entre eles, a estrela no meio e as velinhas acesas nas pontas
      const q = Math.max(0.4, k);
      const corner = 1 + Math.floor(r() * 3);
      const R = Math.min(H * (0.3 + r() * 0.06), 95 * q);
      const o = inset(W, H, 0)[corner];
      const cx = o[0] + (o[0] < W / 2 ? 1 : -1) * R * 0.55,
        cy = o[1] + (o[1] < H / 2 ? 1 : -1) * R * 0.5;
      const spin = r() * Math.PI * 2;
      const pts = [5, 6, 7][Math.floor(r() * 3)];
      const skip = pts === 6 ? 2 : pts === 5 ? 2 : 3;
      let rings = `<circle cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(R)}'/><circle cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(R * 0.84)}'/><circle cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(R * 0.18)}'/>`;
      const P = (i: number, rr = R * 0.84): Pt => [cx + Math.cos(spin + (i / pts) * Math.PI * 2) * rr, cy + Math.sin(spin + (i / pts) * Math.PI * 2) * rr];
      // a estrela: cada ponta ligada à que fica `skip` adiante (o hexagrama são dois triângulos)
      let star = '';
      if (pts === 6) star = poly([P(0), P(2), P(4), P(0)]) + poly([P(1), P(3), P(5), P(1)]);
      else {
        const order: Pt[] = [];
        for (let i = 0; i <= pts; i++) order.push(P((i * skip) % pts));
        star = poly(order);
      }
      // as runas girando entre os dois anéis
      let glyphs = '';
      const n = Math.floor((Math.PI * 2 * R * 0.92) / (R * 0.16 * 1.4));
      for (let i = 0; i < n; i++) {
        const a = spin + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * R * 0.92,
          y = cy + Math.sin(a) * R * 0.92;
        const s2 = (R * 0.1) / 6;
        glyphs += `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1((a * 180) / Math.PI + 90)}) scale(${s2.toFixed(3)} ${((R * 0.12) / 10).toFixed(3)}) translate(-3 -5)'><path d='${RUNES[Math.floor(r() * RUNES.length)]}' vector-effect='non-scaling-stroke'/></g>`;
      }
      // as velinhas nas pontas, do lado de fora do anel
      let candles = '';
      for (let i = 0; i < pts; i++) {
        const [x, y] = P(i, R * 1.14);
        const w = 3.2 * q,
          h = 7 * q;
        candles += `<rect x='${f1(x - w / 2)}' y='${f1(y - h / 2)}' width='${f1(w)}' height='${f1(h)}'/><path class='f' d='M${f1(x)} ${f1(y - h / 2 - 5.5 * q)}Q${f1(x + 2 * q)} ${f1(y - h / 2 - 2 * q)} ${f1(x)} ${f1(y - h / 2 - 0.6 * q)}Q${f1(x - 2 * q)} ${f1(y - h / 2 - 2 * q)} ${f1(x)} ${f1(y - h / 2 - 5.5 * q)}Z'/>`;
      }
      return g(rings, 1.4, 0.85) + g(`<path d='${star}'/>`, 1.2, 0.85) + g(glyphs, 1, 0.9) + g(candles, 1.1, 0.95);
    }
    case 'tesouro': {
      // o mapa do tesouro: a trilha tracejada entrando por uma beirada, dando voltas, e o X marcando o
      // lugar; num canto, a rosa dos ventos
      const q = Math.max(0.4, k);
      const fromLeft = r() < 0.5;
      const pts: Pt[] = [[fromLeft ? -4 : W * (0.15 + r() * 0.3), fromLeft ? H * (0.6 + r() * 0.3) : H + 4]];
      const n = 3 + Math.floor(r() * 2);
      for (let i = 1; i <= n; i++) pts.push([W * (0.12 + (0.75 * i) / (n + 1)) + (r() - 0.5) * W * 0.1, H * (0.55 + (r() - 0.5) * 0.45)]);
      const X: Pt = [W * (0.72 + r() * 0.16), H * (0.62 + r() * 0.22)];
      pts.push(X);
      const trail = `<path d='${smooth(pts)}' style='stroke-dasharray:${f1(5 * q)} ${f1(4 * q)}'/>`;
      const xs = 7 * q;
      const mark = `<path d='M${f1(X[0] - xs)} ${f1(X[1] - xs)}L${f1(X[0] + xs)} ${f1(X[1] + xs)}M${f1(X[0] + xs)} ${f1(X[1] - xs)}L${f1(X[0] - xs)} ${f1(X[1] + xs)}'/>`;
      // a rosa dos ventos: oito pontas, as de norte, sul, leste e oeste maiores, pintadas pela metade
      const top = r() < 0.5;
      const rc: Pt = top ? [W - 26 * q, 44 * q] : [30 * q, H - 30 * q];
      const RR = 15 * q;
      let rose = `<circle cx='${f1(rc[0])}' cy='${f1(rc[1])}' r='${f1(RR * 0.62)}'/>`;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const L = i % 2 ? RR * 0.62 : RR,
          w = i % 2 ? RR * 0.14 : RR * 0.2;
        const tip: Pt = [rc[0] + Math.cos(a) * L, rc[1] + Math.sin(a) * L];
        const l: Pt = [rc[0] + Math.cos(a - Math.PI / 2) * w, rc[1] + Math.sin(a - Math.PI / 2) * w];
        const rr2: Pt = [rc[0] + Math.cos(a + Math.PI / 2) * w, rc[1] + Math.sin(a + Math.PI / 2) * w];
        rose += `<path d='${poly([l, tip, rr2, l])}'/>`;
        if (i % 2 === 0) rose += `<path class='f' d='${poly([rc, tip, rr2, rc])}'/>`;
      }
      rose += `<text class='f' x='${f1(rc[0])}' y='${f1(rc[1] - RR - 5 * q)}' text-anchor='middle' style='font:800 ${f1(8.5 * q)}px var(--f-label, sans-serif)'>N</text>`;
      return g(trail, 1.4, 0.9) + g(mark, 2.4, 1) + g(rose, 1, 0.9);
    }
    case 'olhos': {
      // olhos desenhados pelas margens, todos olhando para o meio da ficha
      const q = Math.max(0.4, k);
      const count = 6 + Math.floor(r() * 5);
      let body = '';
      const placed: Pt[] = [];
      for (let i = 0; i < count; i++) {
        const E = (8 + r() * 8) * q;
        let p: Pt = [0, 0];
        for (let t = 0; t < 12; t++) {
          const side = Math.floor(r() * 4);
          const edge = E * 1.1 + r() * 10 * q;
          p =
            side === 0
              ? [W * (0.3 + r() * 0.68), edge]
              : side === 1
                ? [W - edge, H * (0.08 + r() * 0.84)]
                : side === 2
                  ? [W * (0.04 + r() * 0.92), H - edge]
                  : [edge, H * (0.62 + r() * 0.34)];
          if (placed.every((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) > E * 3.2)) break;
        }
        placed.push(p);
        const [x, y] = p;
        const h = E * (0.5 + r() * 0.2);
        const lid = r() < 0.25; // meio fechado, desconfiado
        const look = Math.atan2(H / 2 - y, W / 2 - x);
        const pr = h * 0.55;
        const pxx = x + Math.cos(look) * E * 0.35,
          pyy = y + Math.sin(look) * h * 0.3;
        body += `<path d='M${f1(x - E)} ${f1(y)}Q${f1(x)} ${f1(y - h * 2)} ${f1(x + E)} ${f1(y)}Q${f1(x)} ${f1(y + h * 2)} ${f1(x - E)} ${f1(y)}Z'/>`;
        body += `<circle cx='${f1(pxx)}' cy='${f1(pyy)}' r='${f1(pr)}'/><circle class='f' cx='${f1(pxx)}' cy='${f1(pyy)}' r='${f1(pr * 0.5)}'/>`;
        if (lid) body += `<path d='M${f1(x - E)} ${f1(y)}Q${f1(x)} ${f1(y - h * 0.3)} ${f1(x + E)} ${f1(y)}' /><path class='f' d='M${f1(x - E)} ${f1(y)}Q${f1(x)} ${f1(y - h * 2)} ${f1(x + E)} ${f1(y)}Q${f1(x)} ${f1(y - h * 0.3)} ${f1(x - E)} ${f1(y)}Z'/>`;
        else if (r() < 0.5) {
          // os cílios
          for (let j = 1; j < 5; j++) {
            const t = j / 5;
            const bx = x - E + 2 * E * t,
              by = y - h * 2 * 2 * t * (1 - t);
            body += `<path d='M${f1(bx)} ${f1(by)}l${f1((t - 0.5) * 4 * q)} ${f1(-3.5 * q)}'/>`;
          }
        }
      }
      return g(body, 1.2, 0.9);
    }
    case 'cybertribal': {
      // a moldura neotribal: a trama correndo pelas quatro beiradas, mais larga nos lados, a lápis
      const q = Math.max(0.4, k);
      const side = Math.min(W * 0.16, H * 0.3);
      const flat = Math.min(H * 0.14, W * 0.1);
      let body = '';
      for (const right of [false, true]) body += `<g transform='translate(${f1(right ? W - side * 0.36 : side * 0.36)} 0)'>${tribalWeave(r, H, side, q * 0.8, 0.5)}</g>`;
      for (const bottom of [false, true])
        body += `<g transform='translate(0 ${f1(bottom ? H - flat * 0.34 : flat * 0.34)}) rotate(-90) scale(-1 1)'>${tribalWeave(r, W, flat, q * 0.7, 0)}</g>`;
      // o lápis bem apertado: a trama só lê se o traço for firme; sem o filtro de teia, que apagaria o fio fino
      return g(body.replace(/<path /g, "<path class='f' "), 1, 1.5);
    }
    case 'pixelart': {
      // a moldura de jogo de 8 bits: uma fileira de bloquinhos correndo pelas quatro beiradas (um ou outro
      // pintado), e nos cantos livres uns sprites de pixel a lápis: corações de vida, moeda, espada, poção, chave
      const q = Math.max(0.4, k);
      const m = (5 + r() * 2) * q;
      const c = (6.5 + r() * 1.5) * q,
        gap = 1.4 * q;
      let blocks = '';
      const run = (x0: number, y0: number, len: number, vertical: boolean) => {
        const n = Math.max(1, Math.round((len + gap) / (c + gap)));
        const step = (len - c) / Math.max(1, n - 1);
        const every = 3 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const x = vertical ? x0 : x0 + i * step,
            y = vertical ? y0 + i * step : y0;
          const jx = (r() - 0.5) * 0.5 * q,
            jy = (r() - 0.5) * 0.5 * q;
          blocks += `<rect${i % every === 0 ? " class='f'" : ''} x='${f1(x + jx)}' y='${f1(y + jy)}' width='${f1(c)}' height='${f1(c)}'/>`;
        }
      };
      run(m, m, W - 2 * m, false);
      run(m, H - m - c, W - 2 * m, false);
      const inner = H - 2 * m - 2 * (c + gap);
      if (inner > c) {
        run(m, m + c + gap, inner, true);
        run(W - m - c, m + c + gap, inner, true);
      }
      // os sprites: cada um um mapa de pixels; o contorno passa só onde o pixel cheio encosta no vazio
      const SPRITES: Record<string, string[]> = {
        coracao: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
        moeda: ['..###..', '.#...#.', '#..#..#', '#..#..#', '#..#..#', '.#...#.', '..###..'],
        espada: ['......##', '.....###', '....###.', '#..###..', '.####...', '..##....', '.#.#....', '#.......'],
        pocao: ['..###..', '...#...', '..###..', '.#####.', '#######', '#######', '.#####.'],
        chave: ['.###.....', '#...#####', '#...#.#.#', '.###.....'],
        estrela: ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
      };
      const sprite = (rows: string[], x0: number, y0: number, cell: number) => {
        let fill = '',
          edge = '';
        const on = (i: number, j: number) => j >= 0 && j < rows.length && i >= 0 && rows[j][i] === '#';
        rows.forEach((row, j) =>
          [...row].forEach((ch, i) => {
            if (ch !== '#') return;
            const x = x0 + i * cell,
              y = y0 + j * cell;
            fill += `M${f1(x)} ${f1(y)}h${f1(cell)}v${f1(cell)}h${f1(-cell)}Z`;
            if (!on(i, j - 1)) edge += `M${f1(x)} ${f1(y)}h${f1(cell)}`;
            if (!on(i, j + 1)) edge += `M${f1(x)} ${f1(y + cell)}h${f1(cell)}`;
            if (!on(i - 1, j)) edge += `M${f1(x)} ${f1(y)}v${f1(cell)}`;
            if (!on(i + 1, j)) edge += `M${f1(x + cell)} ${f1(y)}v${f1(cell)}`;
          }),
        );
        return `<path class='f' d='${fill}'/><path d='${edge}'/>`;
      };
      const cell = 2.6 * q;
      const names = Object.keys(SPRITES);
      const pick = () => names.splice(Math.floor(r() * names.length), 1)[0];
      let sprites = '';
      // em cima à direita, a vida: três corações, o último vazio
      const lives = 3;
      for (let i = 0; i < lives; i++) {
        const rows = i === lives - 1 ? SPRITES['coracao'].map((row, j) => (j === 0 || j === 5 ? row : row.replace(/^(\.*#)(#+)(#\.*)$/, (_a, b, mid, e) => b + '.'.repeat(mid.length) + e))) : SPRITES['coracao'];
        sprites += sprite(rows, W - m - c - 5 * q - (lives - i) * 8.6 * cell / 1, m + c + 5 * q, cell);
      }
      names.splice(names.indexOf('coracao'), 1);
      // embaixo, um em cada canto de dentro
      const a = SPRITES[pick()],
        b = SPRITES[pick()];
      sprites += sprite(a, m + c + 6 * q, H - m - c - 6 * q - a.length * cell, cell);
      sprites += sprite(b, W - m - c - 6 * q - b[0].length * cell, H - m - c - 6 * q - b.length * cell, cell);
      return g(blocks, 1.1, 0.9) + g(sprites, 0.9, 1);
    }
    case 'janela': {
      // a ficha virou uma janela de computador antigo: a barra de título com o ícone e os botões de
      // minimizar, maximizar e fechar, a barra de rolagem do lado, a barra de carregando embaixo e o
      // cursor (a setinha ou a ampulheta) parado em algum canto
      const q = Math.max(0.4, k);
      const wob = 0.7 * k,
        seg = 34 * q;
      const line = (a: Pt, b: Pt, cls = '') => `<path${cls ? ` class='${cls}'` : ''} d='${smooth(handLine(a, b, r, wob, seg))}'/>`;
      const m = (5 + r() * 2) * q;
      const tb = (15 + r() * 3) * q; // a altura da barra de título
      const sb = (11 + r() * 2) * q; // a largura da barra de rolagem
      const st = (12 + r() * 2) * q; // a altura da barra de baixo
      const x0 = m,
        y0 = m,
        x1 = W - m,
        y1 = H - m;
      let frame = line([x0, y0], [x1, y0]) + line([x1, y0], [x1, y1]) + line([x1, y1], [x0, y1]) + line([x0, y1], [x0, y0]);
      frame += line([x0, y0 + tb], [x1, y0 + tb]);
      // a sombra de relevo dos sistemas antigos: uma segunda linha por dentro, só embaixo e à direita
      frame += line([x0 + 2 * q, y1 - 2 * q], [x1 - 2 * q, y1 - 2 * q], 'h') + line([x1 - 2 * q, y0 + 2 * q], [x1 - 2 * q, y1 - 2 * q], 'h');
      let bits = '';
      // os botões: três quadradinhos à direita, com o traço, o quadrado e o X
      const bs = tb - 6 * q,
        by = y0 + 3 * q;
      for (let i = 0; i < 3; i++) {
        const bx = x1 - 4 * q - (3 - i) * (bs + 2 * q);
        bits += `<rect x='${f1(bx)}' y='${f1(by)}' width='${f1(bs)}' height='${f1(bs)}'/>`;
        const p = bs * 0.28;
        if (i === 0) bits += `<path d='M${f1(bx + p)} ${f1(by + bs - p)}H${f1(bx + bs - p)}'/>`;
        else if (i === 1) bits += `<path d='M${f1(bx + p)} ${f1(by + p)}H${f1(bx + bs - p)}V${f1(by + bs - p)}H${f1(bx + p)}Z'/>`;
        else bits += `<path d='M${f1(bx + p)} ${f1(by + p)}L${f1(bx + bs - p)} ${f1(by + bs - p)}M${f1(bx + bs - p)} ${f1(by + p)}L${f1(bx + p)} ${f1(by + bs - p)}'/>`;
      }
      // o ícone e o título rabiscado, depois da foto (que cobre o canto de cima à esquerda)
      const tx = W * (0.34 + r() * 0.06);
      bits += `<rect class='f' x='${f1(tx)}' y='${f1(by)}' width='${f1(bs)}' height='${f1(bs)}'/>`;
      let squig = '';
      const tl = W * (0.18 + r() * 0.08);
      for (let x = tx + bs + 4 * q, i = 0; x < tx + bs + 4 * q + tl; x += 3 * q, i++) squig += `${i ? 'L' : 'M'}${f1(x)} ${f1(by + bs / 2 + (i % 2 ? -1.4 : 1.4) * q)}`;
      bits += `<path class='h' d='${squig}'/>`;
      // a barra de rolagem: o trilho, as setinhas das pontas e o polegar
      const sx = x1 - 2 * q - sb,
        sy0 = y0 + tb,
        sy1 = y1 - st - 2 * q;
      bits += line([sx, sy0], [sx, sy1]) + line([sx, sy1], [x1 - 2 * q, sy1]);
      bits += `<path d='M${f1(sx)} ${f1(sy0 + sb)}H${f1(sx + sb)}M${f1(sx)} ${f1(sy1 - sb)}H${f1(sx + sb)}'/>`;
      bits += `<path class='f' d='M${f1(sx + sb / 2)} ${f1(sy0 + sb * 0.3)}L${f1(sx + sb * 0.72)} ${f1(sy0 + sb * 0.68)}H${f1(sx + sb * 0.28)}ZM${f1(sx + sb / 2)} ${f1(sy1 - sb * 0.3)}L${f1(sx + sb * 0.72)} ${f1(sy1 - sb * 0.68)}H${f1(sx + sb * 0.28)}Z'/>`;
      const track = sy1 - sy0 - 2 * sb;
      if (track > 12 * q) {
        const th = Math.max(10 * q, track * (0.2 + r() * 0.2)),
          ty = sy0 + sb + (track - th) * r();
        bits += `<rect x='${f1(sx + 2 * q)}' y='${f1(ty)}' width='${f1(sb - 4 * q)}' height='${f1(th)}'/><path class='h' d='M${f1(sx + 4 * q)} ${f1(ty + th / 2 - 2 * q)}h${f1(sb - 8 * q)}M${f1(sx + 4 * q)} ${f1(ty + th / 2)}h${f1(sb - 8 * q)}M${f1(sx + 4 * q)} ${f1(ty + th / 2 + 2 * q)}h${f1(sb - 8 * q)}'/>`;
      }
      // a barra de baixo: o carregando em gomos, uns cheios
      const yb = y1 - st - 2 * q;
      bits += line([x0, yb], [sx, yb], 'h');
      const segs = Math.max(6, Math.round((W * 0.3) / (7 * q)));
      const done = Math.floor(segs * (0.25 + r() * 0.6));
      const gw = 5 * q,
        gh = st - 6 * q,
        gx = x0 + 6 * q;
      bits += `<rect x='${f1(gx - 1.5 * q)}' y='${f1(yb + 1.5 * q)}' width='${f1(segs * (gw + 1.6 * q) + 1.4 * q)}' height='${f1(gh + 3 * q)}'/>`;
      for (let i = 0; i < done; i++) bits += `<rect class='f' x='${f1(gx + i * (gw + 1.6 * q))}' y='${f1(yb + 3 * q)}' width='${f1(gw)}' height='${f1(gh)}'/>`;
      // o cursor, num canto de baixo, perto da rolagem
      const cx = W * (0.62 + r() * 0.18),
        cy = H * (0.62 + r() * 0.12),
        cs = 1.15 * q;
      const arrow = (x: number, y: number) =>
        `<path class='f' d='M${f1(x)} ${f1(y)}v${f1(17 * cs)}l${f1(4 * cs)} ${f1(-3.6 * cs)}l${f1(2.8 * cs)} ${f1(6 * cs)}l${f1(2.8 * cs)} ${f1(-1.3 * cs)}l${f1(-2.8 * cs)} ${f1(-5.8 * cs)}h${f1(5.6 * cs)}Z'/><path d='M${f1(x)} ${f1(y)}v${f1(17 * cs)}l${f1(4 * cs)} ${f1(-3.6 * cs)}l${f1(2.8 * cs)} ${f1(6 * cs)}l${f1(2.8 * cs)} ${f1(-1.3 * cs)}l${f1(-2.8 * cs)} ${f1(-5.8 * cs)}h${f1(5.6 * cs)}Z'/>`;
      const hourglass = (x: number, y: number) =>
        `<path d='M${f1(x)} ${f1(y)}h${f1(12 * cs)}M${f1(x)} ${f1(y + 18 * cs)}h${f1(12 * cs)}M${f1(x + 1.5 * cs)} ${f1(y)}C${f1(x + 1.5 * cs)} ${f1(y + 6 * cs)} ${f1(x + 5 * cs)} ${f1(y + 7 * cs)} ${f1(x + 5 * cs)} ${f1(y + 9 * cs)}C${f1(x + 5 * cs)} ${f1(y + 11 * cs)} ${f1(x + 1.5 * cs)} ${f1(y + 12 * cs)} ${f1(x + 1.5 * cs)} ${f1(y + 18 * cs)}M${f1(x + 10.5 * cs)} ${f1(y)}C${f1(x + 10.5 * cs)} ${f1(y + 6 * cs)} ${f1(x + 7 * cs)} ${f1(y + 7 * cs)} ${f1(x + 7 * cs)} ${f1(y + 9 * cs)}C${f1(x + 7 * cs)} ${f1(y + 11 * cs)} ${f1(x + 10.5 * cs)} ${f1(y + 12 * cs)} ${f1(x + 10.5 * cs)} ${f1(y + 18 * cs)}'/><path class='f' d='M${f1(x + 2.6 * cs)} ${f1(y + 17 * cs)}Q${f1(x + 6 * cs)} ${f1(y + 12 * cs)} ${f1(x + 9.4 * cs)} ${f1(y + 17 * cs)}Z'/>`;
      bits += r() < 0.65 ? arrow(cx, cy) : hourglass(cx, cy);
      return g(frame, 1.3, 0.95) + g(bits, 1, 0.95);
    }
    case 'circuito': {
      // a placa de circuito: trilhas de cobre entrando pelas beiradas em feixes, dobrando a 45° e
      // terminando em ilhas de solda; um chip ou dois nos cantos, com as perninhas ligadas, e furinhos soltos
      const q = Math.max(0.4, k);
      const pitch = (5 + r() * 1.5) * q;
      let traces = '',
        pads = '';
      const pad = (x: number, y: number) => {
        pads += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(2.6 * q)}'/><circle class='f' cx='${f1(x)}' cy='${f1(y)}' r='${f1(1 * q)}'/>`;
      };
      /**
       * Um feixe de `n` trilhas paralelas saindo da beirada no ponto `at` (px ao longo dela), entrando
       * `inA` px, dobrando a 45° para um lado e correndo junto da beirada. Cada uma acaba numa ilha.
       */
      const bundle = (side: 0 | 1 | 2 | 3, at: number, n: number, dir: 1 | -1) => {
        const inA = (8 + r() * 18) * q,
          run = (14 + r() * 40) * q;
        for (let i = 0; i < n; i++) {
          // na beirada (u ao longo, v para dentro), as de fora dobram mais longe: o feixe fica paralelo
          const u0 = at + i * pitch * dir,
            v1 = inA + (n - 1 - i) * pitch * 0.42,
            u2 = u0 + dir * (v1 * 0.9),
            v2 = v1 + v1 * 0.9 * 0.6,
            u3 = u2 + dir * (run - i * pitch * 0.6);
          const map = (u: number, v: number): Pt => (side === 0 ? [u, v] : side === 1 ? [W - v, u] : side === 2 ? [u, H - v] : [v, u]);
          const pts = [map(u0, -2), map(u0, v1), map(u2, v2), map(u3, v2)];
          traces += `<path d='${poly(pts)}'/>`;
          pad(...pts[3]);
        }
      };
      // os feixes: dois ou três por beirada comprida, um ou dois nas curtas, longe das quinas
      for (const side of [0, 1, 2, 3] as const) {
        const len = side % 2 ? H : W;
        const count = (side % 2 ? 1 : 2) + (r() < 0.5 ? 1 : 0);
        for (let j = 0; j < count; j++) {
          const at = len * ((j + 0.5) / count) + (r() - 0.5) * len * 0.14;
          bundle(side, at, 2 + Math.floor(r() * 3), r() < 0.5 ? 1 : -1);
        }
      }
      // os chips: um no canto de cima à direita e, às vezes, outro embaixo à esquerda
      let chips = '';
      const chip = (cx: number, cy: number, pins: number) => {
        const pw = 3.6 * q,
          w = pins * pw + 4 * q,
          h = (13 + r() * 4) * q;
        const x = cx - w / 2,
          y = cy - h / 2;
        chips += `<rect x='${f1(x)}' y='${f1(y)}' width='${f1(w)}' height='${f1(h)}' rx='${f1(1 * q)}'/><circle class='f' cx='${f1(x + 3 * q)}' cy='${f1(y + 3 * q)}' r='${f1(1 * q)}'/>`;
        chips += `<path class='h' d='M${f1(x + w / 2 - 2 * q)} ${f1(y)}a${f1(2 * q)} ${f1(2 * q)} 0 0 0 ${f1(4 * q)} 0'/>`;
        let legs = '';
        for (let i = 0; i < pins; i++) {
          const px = x + 2 * q + pw * (i + 0.5);
          legs += `M${f1(px)} ${f1(y)}v${f1(-3.5 * q)}M${f1(px)} ${f1(y + h)}v${f1(3.5 * q)}`;
          // umas perninhas seguem numa trilha curta até um furinho
          if (r() < 0.35) {
            const up = r() < 0.5;
            const yy = up ? y - 3.5 * q : y + h + 3.5 * q,
              l = (6 + r() * 10) * q;
            traces += `<path d='M${f1(px)} ${f1(yy)}v${f1((up ? -1 : 1) * l)}l${f1((r() < 0.5 ? -1 : 1) * 4 * q)} ${f1((up ? -1 : 1) * 4 * q)}'/>`;
          }
        }
        chips += `<path d='${legs}'/>`;
      };
      chip(W * (0.78 + r() * 0.08), H * (0.2 + r() * 0.06), 6 + Math.floor(r() * 3));
      if (r() < 0.6) chip(W * (0.24 + r() * 0.1), H * (0.8 - r() * 0.06), 5 + Math.floor(r() * 3));
      // os furinhos soltos (as vias)
      for (let i = 0; i < 10; i++) {
        const x = W * (0.06 + r() * 0.88),
          y = H * (0.06 + r() * 0.88);
        if (Math.abs(x - W / 2) < W * 0.25 && Math.abs(y - H / 2) < H * 0.25) continue;
        pads += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(1.6 * q)}' class='h'/>`;
      }
      return g(traces, 1.4, 0.85) + g(pads + chips, 1, 0.95);
    }
    case 'blocos': {
      // o jogo de encaixar blocos a lápis: as paredes do poço pelos lados, a pilha de peças embaixo
      // (caídas de verdade, de cima, uma depois da outra) e uma peça caindo, com o risco do movimento
      const q = Math.max(0.4, k);
      const m = (5 + r() * 2) * q;
      const c = (10 + r() * 2) * q;
      const cols = Math.max(4, Math.floor((W - 2 * m) / c));
      const x0 = (W - cols * c) / 2;
      const bottom = H - m;
      const PIECES = [
        [[0, 0], [1, 0], [2, 0], [3, 0]],
        [[0, 0], [1, 0], [0, 1], [1, 1]],
        [[0, 0], [1, 0], [2, 0], [1, 1]],
        [[0, 0], [0, 1], [1, 1], [2, 1]],
        [[2, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [0, 1], [1, 1]],
        [[0, 0], [1, 0], [1, 1], [2, 1]],
      ];
      const rot = (p: number[][], t: number) => {
        let s = p;
        for (let i = 0; i < t; i++) s = s.map(([x, y]) => [-y, x]);
        const mx = Math.min(...s.map((v) => v[0])),
          my = Math.min(...s.map((v) => v[1]));
        return s.map(([x, y]) => [x - mx, y - my]);
      };
      // a grade, de baixo para cima: cada casa guarda o número da peça
      const maxRows = Math.max(2, Math.min(3, Math.floor((H * 0.3) / c)));
      const grid: number[][] = Array.from({ length: maxRows + 4 }, () => Array(cols).fill(-1));
      let id = 0;
      // como quem joga: de umas jogadas sorteadas, a que deixa a pilha mais baixa
      const tries = Math.round(cols * 1.3);
      for (let t = 0; t < tries; t++) {
        let best: { cells: number[][]; cx: number; cy: number; top: number } | null = null;
        for (let c2 = 0; c2 < 4; c2++) {
          const shape = rot(PIECES[Math.floor(r() * PIECES.length)], Math.floor(r() * 4));
          // na peça o y cresce para baixo; na grade, para cima, a partir da fileira de baixo da peça
          const h = Math.max(...shape.map((v) => v[1])) + 1,
            wdt = Math.max(...shape.map((v) => v[0])) + 1;
          const cells = shape.map(([x, y]) => [x, h - 1 - y]);
          const cx = Math.floor(r() * (cols - wdt + 1));
          const fits = (cy: number) => cells.every(([x, y]) => cy + y >= 0 && cy + y < grid.length && grid[cy + y][cx + x] < 0);
          // cai de cima até encostar
          let cy = grid.length - h;
          if (!fits(cy)) continue;
          while (cy > 0 && fits(cy - 1)) cy--;
          const top = cy + h;
          if (top > maxRows) continue;
          if (!best || top < best.top) best = { cells, cx, cy, top };
        }
        if (!best) continue;
        for (const [x, y] of best.cells) grid[best.cy + y][best.cx + x] = id;
        id++;
      }
      // as linhas completas sumiriam: tira uma casa de cada uma, como no jogo de verdade
      for (let y = 0; y < maxRows; y++) if (grid[y].every((v) => v >= 0)) grid[y][Math.floor(r() * cols)] = -1;
      let outline = '',
        seamsD = '',
        fill = '';
      const shaded = new Set<number>();
      for (let i = 0; i < id; i++) if (r() < 0.35) shaded.add(i);
      const X = (i: number) => x0 + i * c,
        Y = (j: number) => bottom - j * c;
      for (let j = 0; j < maxRows; j++)
        for (let i = 0; i < cols; i++) {
          const v = grid[j][i];
          if (v < 0) continue;
          const same = (a: number, b: number) => b >= 0 && b < maxRows && a >= 0 && a < cols && grid[b][a] === v;
          const x = X(i),
            y = Y(j + 1);
          const side = (ok: boolean, d: string) => (ok ? (seamsD += d) : (outline += d));
          side(same(i, j + 1), `M${f1(x)} ${f1(y)}h${f1(c)}`);
          side(same(i, j - 1), `M${f1(x)} ${f1(y + c)}h${f1(c)}`);
          side(same(i - 1, j), `M${f1(x)} ${f1(y)}v${f1(c)}`);
          side(same(i + 1, j), `M${f1(x + c)} ${f1(y)}v${f1(c)}`);
          // o brilho de cada bloquinho: um quadradinho de dentro
          if (shaded.has(v)) fill += `M${f1(x + 2.2 * q)} ${f1(y + 2.2 * q)}h${f1(c - 4.4 * q)}v${f1(c - 4.4 * q)}h${f1(-c + 4.4 * q)}Z`;
          else seamsD += `M${f1(x + c * 0.25)} ${f1(y + c * 0.62)}V${f1(y + c * 0.25)}H${f1(x + c * 0.62)}`;
        }
      // a peça caindo, no alto do lado direito, com os riscos do movimento por cima
      const shape = rot(PIECES[Math.floor(r() * PIECES.length)], Math.floor(r() * 4));
      const fx = x0 + Math.floor(cols * (0.62 + r() * 0.2)) * c,
        fy = m + (16 + r() * 10) * q;
      let falling = '';
      const fset = new Set(shape.map(([x, y]) => `${x},${y}`));
      for (const [x, y] of shape) {
        const px = fx + x * c,
          py = fy + y * c;
        const has = (a: number, b: number) => fset.has(`${a},${b}`);
        if (!has(x, y - 1)) falling += `M${f1(px)} ${f1(py)}h${f1(c)}`;
        if (!has(x, y + 1)) falling += `M${f1(px)} ${f1(py + c)}h${f1(c)}`;
        if (!has(x - 1, y)) falling += `M${f1(px)} ${f1(py)}v${f1(c)}`;
        if (!has(x + 1, y)) falling += `M${f1(px + c)} ${f1(py)}v${f1(c)}`;
      }
      const tops = shape.filter(([x, y]) => !fset.has(`${x},${y - 1}`));
      let trail = '';
      for (const [x, y] of tops) trail += `M${f1(fx + (x + 0.5) * c)} ${f1(fy + y * c - 3 * q)}v${f1(-(6 + r() * 6) * q)}`;
      // as paredes do poço: pelos lados, de cima a baixo
      const wallTop = m + 3 * q;
      const walls = `<path d='M${f1(x0 - 1.5 * q)} ${f1(wallTop)}V${f1(bottom + 1.5 * q)}H${f1(x0 + cols * c + 1.5 * q)}V${f1(wallTop)}'/>`;
      return g(walls + `<path d='${outline}'/>`, 1.3, 0.95) + g(`<path class='h' d='${seamsD}'/><path class='f' d='${fill}'/>`, 0.9, 0.9) + g(`<path d='${falling}'/><path class='h' d='${trail}' style='stroke-dasharray:${f1(2 * q)} ${f1(2.4 * q)}'/>`, 1.2, 0.95);
    }
    case 'codigo': {
      // código binário escorrendo pelas margens, a lápis: colunas de zeros e uns que caem pelos lados,
      // uma fileira correndo embaixo e o sinalzinho de código num canto
      const q = Math.max(0.4, k);
      const gh = (7 + r() * 1.5) * q,
        gw = gh * 0.55,
        lead = gh * 1.45;
      let ones = '',
        zeros = '',
        faint = '';
      const glyph = (x: number, y: number, bit: boolean, dim: boolean) => {
        // o zero é um oval de traço; o um, um pau com a bandeirinha e às vezes o pé
        const d = bit
          ? `M${f1(x + gw * 0.15)} ${f1(y + gh * 0.25)}L${f1(x + gw * 0.55)} ${f1(y)}V${f1(y + gh)}`
          : `M${f1(x + gw / 2)} ${f1(y)}C${f1(x + gw * 1.1)} ${f1(y)} ${f1(x + gw * 1.1)} ${f1(y + gh)} ${f1(x + gw / 2)} ${f1(y + gh)}C${f1(x - gw * 0.1)} ${f1(y + gh)} ${f1(x - gw * 0.1)} ${f1(y)} ${f1(x + gw / 2)} ${f1(y)}Z`;
        if (dim) faint += d;
        else if (bit) ones += d;
        else zeros += d;
      };
      const m = (6 + r() * 2) * q;
      // as colunas: duas de cada lado, cada uma começando e acabando num lugar, mais fraca no rabo
      for (const right of [false, true])
        for (let c = 0; c < 2; c++) {
          const x = right ? W - m - gw - c * (gw + 4 * q) : m + c * (gw + 4 * q);
          const start = m + r() * H * 0.3,
            end = H - m - gh - r() * H * 0.25;
          const n = Math.max(1, Math.floor((end - start) / lead));
          for (let i = 0; i <= n; i++) glyph(x, start + i * lead, r() < 0.5, i < n * 0.3);
        }
      // a fileira de baixo, entre as colunas
      const left = m + 2 * (gw + 4 * q) + 6 * q,
        right = W - m - 2 * (gw + 4 * q) - 6 * q;
      const yb = H - m - gh;
      let x = left;
      while (x < right - gw) {
        // de oito em oito, um espacinho (os bytes)
        for (let i = 0; i < 8 && x < right - gw; i++, x += gw + 2.6 * q) glyph(x, yb, r() < 0.5, false);
        x += 5 * q;
      }
      // o sinal de código em cima à direita, entre as colunas
      const cx = W - m - 2 * (gw + 4 * q) - 22 * q,
        cy = m + 8 * q,
        s = 1.1 * q;
      const tag = `<path d='M${f1(cx - 6 * s)} ${f1(cy)}l${f1(-6 * s)} ${f1(6 * s)}l${f1(6 * s)} ${f1(6 * s)}M${f1(cx + 6 * s)} ${f1(cy)}l${f1(6 * s)} ${f1(6 * s)}l${f1(-6 * s)} ${f1(6 * s)}M${f1(cx + 2.5 * s)} ${f1(cy - 1 * s)}L${f1(cx - 2.5 * s)} ${f1(cy + 13 * s)}'/>`;
      return g(`<path d='${ones}'/><path d='${zeros}'/>` + tag, 1.1, 0.95) + g(`<path d='${faint}'/>`, 1, 0.5);
    }
    case 'aula': {
      const keys =['gato', 'estrelinhas', 'velha', 'pauzinhos', 'espiral', 'coracao', 'raio', 'carinha', 'lua', 'flor', 'fantasma', 'setinha', 'caveira', 'teste', 'cogumelo', 'olho', 'nuvem', 'coroa'];
      const cell = 64 * Math.max(0.5, k);
      let body = '';
      let row = 0;
      let last = '';
      for (let y = cell * 0.45; y < H + cell * 0.3; y += cell * 0.84, row++)
        for (let x = cell * (row % 2 ? 0.9 : 0.45); x < W + cell * 0.3; x += cell) {
          if (r() < 0.15) continue;
          let key = keys[Math.floor(r() * keys.length)];
          if (key === last) key = keys[(keys.indexOf(key) + 5) % keys.length];
          last = key;
          const sz = (28 + r() * 14) * Math.max(0.45, k);
          const px = x + (r() - 0.5) * cell * 0.36,
            py = y + (r() - 0.5) * cell * 0.36;
          body += `<g transform='translate(${f1(px)} ${f1(py)}) rotate(${f1((r() - 0.5) * 50)}) scale(${(sz / 40).toFixed(3)}) translate(-20 -20)'>${DOODLE_ART[key]}</g>`;
        }
      return g(body, 1.3, 0.85);
    }
  }
}

// ===================== Estragos =====================

/**
 * Um rasgo, como os recortes da wishlist: o papel não rasga reto, ele anda aos trancos em passos
 * miúdos, e de vez em quando a fibra arranca um dentinho a mais. Segue o caminho `path` (reamostrado
 * a cada `step`); `amp` é quanto ele se afasta da linha, e os dentinhos entram no papel (`paper`, um
 * ponto qualquer do lado que fica). As pontas não saem do lugar.
 */
function rip(path: Pt[], paper: Pt, r: () => number, amp: number, step: number): Pt[] {
  const base = resample(path, step);
  const n = base.length - 1;
  const inside = sideOf(path[0], path[path.length - 1], paper);
  let walk = (r() - 0.5) * amp;
  return base.map((p, i) => {
    if (i === 0 || i === n) return p;
    const [nx, ny] = normalAt(base, i, inside);
    walk = Math.max(-amp, Math.min(amp, walk + (r() - 0.5) * amp * 0.9));
    // o dentinho: a fibra levou um pedaço a mais para o lado do papel
    const fray = r() < 0.14 ? r() * amp * 0.9 : r() * amp * 0.12;
    const d = walk + fray;
    const jt = (r() - 0.5) * step * 0.4;
    const [tx, ty] = [-ny * inside, nx * inside];
    return [p[0] + nx * d + tx * jt, p[1] + ny * d + ty * jt];
  });
}

/**
 * A faixa clara do rasgo: a cor da cartolina solta antes da fibra, então do lado do papel aparece o
 * miolo, numa faixa que engrossa e afina ao longo do rasgo (`min`–`max` px) e some às vezes. Sai
 * como um pedaço a tirar só da cor (PaperArt.core): a linha do rasgo e, de volta, a mesma linha
 * empurrada para dentro do papel.
 */
function coreBand(pts: Pt[], paper: Pt, r: () => number, min: number, max: number): string {
  const inside = sideOf(pts[0], pts[pts.length - 1], paper);
  const n = pts.length;
  // A beirada de dentro acompanha os trancos maiores do rasgo, mas ganha dentinhos próprios em vez
  // de copiar exatamente a borda de fora.
  const soft = pts.map((_, i): Pt => {
    let x = 0,
      y = 0,
      c = 0;
    for (let j = Math.max(0, i - 1); j <= Math.min(n - 1, i + 1); j++, c++) {
      x += pts[j][0];
      y += pts[j][1];
    }
    return [x / c, y / c];
  });
  let w = min + r() * (max - min);
  const inner = soft.map((p, i): Pt => {
    const [nx, ny] = normalAt(soft, i, inside, 3);
    // a largura passeia entre o fio e a faixa larga; alguns fiapos avançam mais sobre a cor
    w = Math.max(min, Math.min(max, w + (r() - 0.5) * (max - min) * 0.45));
    const jitter = r();
    const tooth = jitter > 0.84 ? ((jitter - 0.84) / 0.16) * (max - min) * 0.45 : 0;
    const d = Math.max(0, w + (jitter - 0.5) * (max - min) * 0.75 + tooth);
    return [p[0] + nx * d, p[1] + ny * d];
  });
  return `${poly(pts)}${cont([...inner].reverse())}Z`;
}

/** Um caminho com um ponto a cada `step` px, mais ou menos, das duas pontas inclusive. */
function resample(path: Pt[], step: number): Pt[] {
  const out: Pt[] = [path[0]];
  for (let s = 0; s < path.length - 1; s++) {
    const a = path[s],
      b = path[s + 1];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let i = 1; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  }
  return out;
}

/** De que lado da reta a→b fica `p`: +1 à esquerda da normal (-dy, dx), -1 à direita. */
function sideOf(a: Pt, b: Pt, p: Pt): 1 | -1 {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0 ? 1 : -1;
}

/** A normal do caminho no ponto `i`, para o lado `side`, medida em `span` pontos para cada lado (sem virar nos dentinhos). */
function normalAt(pts: Pt[], i: number, side: 1 | -1, span = 1): Pt {
  const a = pts[Math.max(0, i - span)],
    b = pts[Math.min(pts.length - 1, i + span)];
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l = Math.hypot(dx, dy) || 1;
  return [(-dy / l) * side, (dx / l) * side];
}

/** Uma curva larga de `a` até `b`: o rasgo não vai em linha reta, ele embarriga e muda de ideia. */
function sweep(a: Pt, b: Pt, r: () => number, bend: number, wave: number, n = 12): Pt[] {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len,
    ny = dx / len;
  const f = 1 + r() * 2,
    ph = r() * 6;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      env = Math.sin(Math.PI * t);
    const off = env * bend + env * Math.sin(t * Math.PI * f + ph) * wave;
    pts.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
  }
  return pts;
}

type Corner = 'tl' | 'tr' | 'br' | 'bl';

function damageArt(d: Damage | Stain, W: number, H: number, k: number, sw: number, r: () => number, uid: string, out: PaperArt): void {
  const corners: Corner[] = ['br', 'tr', 'bl', 'tl'];
  const corner = corners[Math.floor(r() * 4)];
  /** Um ponto no canto: (u, v) medidos para dentro, a partir da quina. */
  const at = (c: Corner, u: number, v: number): Pt => [c === 'tl' || c === 'bl' ? u : W - u, c === 'tl' || c === 'tr' ? v : H - v];
  // a curva para dentro do papel troca de lado conforme o canto
  const inward = (c: Corner) => (c === 'tl' || c === 'br' ? 1 : -1);
  // o passo do rasgo: miúdo como o da wishlist (uns 4,5 px na ficha completa)
  const step = 4.5 * Math.max(0.45, k);
  switch (d) {
    case 'rasgado': {
      const paper: Pt = [W / 2, H / 2];
      if (r() < 0.5) {
        // A folha pode perder uma faixa em qualquer uma das quatro bordas.
        const side = Math.floor(r() * 4);
        const length = side % 2 ? H : W;
        const edge = (u: number, v: number): Pt => {
          switch (side) {
            case 0: return [u, v];
            case 1: return [W - v, u];
            case 2: return [u, H - v];
            default: return [v, u];
          }
        };
        const a = (22 + r() * 30) * k,
          b = (22 + r() * 30) * k;
        const line = rip(sweep(edge(-4, a), edge(length + 4, b), r, (r() - 0.5) * 18 * k, 7 * k), paper, r, 5.5 * k, step);
        out.cut.push(`${poly([edge(-6, -6), ...line, edge(length + 6, -6)])}Z`);
        out.core.push(coreBand(line, paper, r, 0.6 * k, 5 * k));
      } else {
        // Ou perde uma quina inteira, escolhida entre as quatro.
        const a = (105 + r() * 60) * k,
          b = (95 + r() * 55) * k;
        const line = rip(sweep(at(corner, a, -4), at(corner, -4, b), r, (r() - 0.35) * 22 * k, 8 * k), paper, r, 5.5 * k, step);
        const Q = at(corner, -6, -6);
        out.cut.push(`M${f1(Q[0])} ${f1(Q[1])}${cont(line)}Z`);
        out.core.push(coreBand(line, paper, r, 0.6 * k, 5.5 * k));
      }
      break;
    }
    case 'rasgao': {
      // um rasgão entrando pela beirada de cima ou de baixo, abrindo em V: as duas beiradas foram
      // uma linha só antes de abrir, então seguem a mesma curva
      const fromTop = r() < 0.45;
      const x0 = W * (0.36 + r() * 0.36);
      const L = H * (0.52 + r() * 0.22);
      const w0 = (15 + r() * 10) * k;
      const edgeY = fromTop ? -4 : H + 4;
      const tip: Pt = [x0 + (r() - 0.5) * W * 0.14, fromTop ? L : H - L];
      const C = sweep([x0, edgeY], tip, r, (r() - 0.5) * 30 * k, 8 * k, 16);
      const lip = (s: -1 | 1) => C.map(([x, y], i): Pt => [x + s * (w0 / 2) * Math.pow(1 - i / (C.length - 1), 1.15), y]);
      const midY = (edgeY + tip[1]) / 2;
      const left: Pt = [x0 - 80 * k, midY],
        right: Pt = [x0 + 80 * k, midY];
      const lipL = rip(lip(-1), left, r, 4 * k, step),
        lipR = rip(lip(1), right, r, 4 * k, step);
      out.cut.push(`${poly(lipL)}${cont([...lipR].reverse())}Z`);
      out.core.push(coreBand(lipL, left, r, 0.5 * k, 4.5 * k), coreBand(lipR, right, r, 0.5 * k, 4.5 * k));
      break;
    }
    case 'remendado': {
      // rasgou de cima a baixo e foi colada de volta com fita: as duas beiradas se encaixam, com uma
      // fresta que abre e fecha, e o miolo claro aparecendo dos dois lados
      const x0 = W * (0.4 + r() * 0.24);
      const C = rip(sweep([x0, -4], [x0 + (r() - 0.5) * W * 0.16, H + 4], r, (r() - 0.5) * 24 * k, 9 * k, 14), [0, H / 2], r, 5 * k, step);
      let g = 1.6 * k;
      const gaps = C.map(() => (g = Math.max(0.3 * k, Math.min(3.6 * k, g + (r() - 0.5) * 1.3 * k))));
      const left = C.map(([x, y], i): Pt => [x - gaps[i] / 2, y]),
        right = C.map(([x, y], i): Pt => [x + gaps[i] / 2, y]);
      out.cut.push(`${poly(left)}${cont([...right].reverse())}Z`);
      out.core.push(coreBand(left, [0, H / 2], r, 0.5 * k, 4 * k), coreBand(right, [W, H / 2], r, 0.5 * k, 4 * k));
      // o durex: filme quase transparente, bordas retas, as pontas no serrilhado do cortador, um
      // brilho passando na diagonal e o fio de luz na beirada; de vez em quando uma ruguinha
      let tapes = '';
      const n = H < 200 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n + (r() - 0.5) * 0.12;
        const [cx, cy] = C[Math.min(C.length - 1, Math.max(0, Math.round(t * (C.length - 1))))];
        const len = (54 + r() * 16) * k,
          wid = (16 + r() * 3) * k;
        const ang = (r() - 0.5) * 36;
        const hw = wid / 2;
        // a ponta serrilhada, de uma beirada à outra; `skew` entorta o corte
        const teeth = Math.max(4, Math.round(wid / (1.7 * k)));
        const end = (x0: number, dir: 1 | -1, skew: number) => {
          let d = '';
          for (let j = 1; j < teeth; j++) {
            const y = -hw * dir + ((j / teeth) * wid) * dir;
            const x = x0 + skew * (y / hw) + dir * (j % 2 ? 1.1 : 0) * k * (0.7 + r() * 0.6);
            d += `L${f1(x)} ${f1(y)}`;
          }
          return d;
        };
        const sR = (r() - 0.5) * 3 * k,
          sL = (r() - 0.5) * 3 * k;
        const xr = len / 2,
          xl = -len / 2;
        const tape =
          `M${f1(xl - sL)} ${f1(-hw)}L${f1(xr - sR)} ${f1(-hw)}` +
          end(xr, 1, sR) +
          `L${f1(xr + sR)} ${f1(hw)}L${f1(xl + sL)} ${f1(hw)}` +
          end(xl, -1, sL) +
          'Z';
        let wrinkle = '';
        if (r() < 0.55) {
          const x = (r() - 0.5) * len * 0.6,
            lean = (r() - 0.5) * 4 * k;
          wrinkle = `<path d='M${f1(x)} ${f1(-hw)}Q${f1(x + lean)} 0 ${f1(x + lean * 0.4)} ${f1(hw)}' stroke='#fff' stroke-opacity='.4' stroke-width='${f1(0.8 * sw)}'/><path d='M${f1(x + 0.7 * k)} ${f1(-hw)}Q${f1(x + lean + 0.7 * k)} 0 ${f1(x + lean * 0.4 + 0.7 * k)} ${f1(hw)}' stroke='#000' stroke-opacity='.1' stroke-width='${f1(0.6 * sw)}'/>`;
        }
        tapes +=
          `<g transform='translate(${f1(cx)} ${f1(cy)}) rotate(${f1(ang)})'>` +
          `<path d='${tape}' transform='translate(${f1(0.5 * k)} ${f1(0.9 * k)})' fill='#000' fill-opacity='.06'/>` +
          `<path d='${tape}' fill='rgb(250 244 214)' fill-opacity='.2'/>` +
          `<path d='${tape}' fill='url(#${uid}-fita)'/>` +
          `<path d='${tape}' fill='none' stroke='#fff' stroke-opacity='.35' stroke-width='${f1(0.6 * sw)}' stroke-linejoin='round'/>` +
          `<path d='M${f1(xl - sL + 1.5 * k)} ${f1(-hw + 0.7 * k)}L${f1(xr - sR - 1.5 * k)} ${f1(-hw + 0.7 * k)}' stroke='#fff' stroke-opacity='.75' stroke-width='${f1(0.9 * sw)}' stroke-linecap='round'/>` +
          `<path d='M${f1(xl + sL + 1.5 * k)} ${f1(hw - 0.5 * k)}L${f1(xr + sR - 1.5 * k)} ${f1(hw - 0.5 * k)}' stroke='rgb(110 98 66)' stroke-opacity='.28' stroke-width='${f1(0.6 * sw)}' stroke-linecap='round'/>` +
          wrinkle +
          `</g>`;
      }
      out.fita += `<defs><linearGradient id='${uid}-fita' x1='0' y1='0' x2='1' y2='1'><stop offset='.12' stop-color='#fff' stop-opacity='0'/><stop offset='.3' stop-color='#fff' stop-opacity='.42'/><stop offset='.4' stop-color='#fff' stop-opacity='.08'/><stop offset='.58' stop-color='#fff' stop-opacity='.22'/><stop offset='.72' stop-color='#fff' stop-opacity='0'/></linearGradient></defs><g fill='none' stroke-linecap='round'>${tapes}</g>`;
      break;
    }
    case 'orelha': {
      const c = corners[Math.floor(Math.pow(r(), 1.6) * 4)];
      const a = (88 + r() * 36) * k,
        b = a * (0.8 + r() * 0.36);
      const P1 = at(c, a, 0),
        P2 = at(c, 0, b),
        C = at(c, 0, 0);
      const Q = reflect(C, P1, P2);
      const o = at(c, -5, -5),
        o1 = at(c, a + 1, -5),
        o2 = at(c, -5, b + 1);
      out.cut.push(`M${f1(o[0])} ${f1(o[1])}L${f1(o1[0])} ${f1(o1[1])}L${f1(P1[0])} ${f1(P1[1])}L${f1(P2[0])} ${f1(P2[1])}L${f1(o2[0])} ${f1(o2[1])}Z`);
      const tri = `M${f1(P1[0])} ${f1(P1[1])}L${f1(P2[0])} ${f1(P2[1])}L${f1(Q[0])} ${f1(Q[1])}Z`;
      const mid: Pt = [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2];
      out.frente +=
        `<defs><linearGradient id='${uid}-orelha' gradientUnits='userSpaceOnUse' x1='${f1(mid[0])}' y1='${f1(mid[1])}' x2='${f1(Q[0])}' y2='${f1(Q[1])}'><stop offset='0' stop-color='#fff' stop-opacity='.55'/><stop offset='.5' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.14'/></linearGradient></defs>` +
        `<path d='${tri}' transform='translate(${f1(2.6 * k)} ${f1(3.6 * k)})' fill='#000' fill-opacity='.38' filter='url(#papel-borra)'/>` +
        // o verso da cartolina neon é quase branco: a cor só vem na frente
        `<path d='${tri}' style='fill: color-mix(in oklab, var(--stock) 32%, #f6f2e8)'/>` +
        `<path d='${tri}' fill='url(#${uid}-orelha)'/>` +
        `<path d='M${f1(P1[0])} ${f1(P1[1])}L${f1(P2[0])} ${f1(P2[1])}' stroke='#fff' stroke-opacity='.8' stroke-width='1'/>`;
      break;
    }
    case 'dobrado': {
      // dobrada em quatro: cada quarto inclinado para um lado, e os vincos marcados
      const vx = W * (0.47 + r() * 0.06),
        hy = H * (0.45 + r() * 0.1);
      const tv = (r() - 0.5) * 6 * k,
        th = (r() - 0.5) * 6 * k;
      const gid = `${uid}-dobra`;
      out.relevo +=
        `<defs>` +
        `<linearGradient id='${gid}-l' x1='0' x2='1'><stop offset='0' stop-color='rgb(160,160,160)'/><stop offset='1' stop-color='rgb(222,222,222)'/></linearGradient>` +
        `<linearGradient id='${gid}-r' x1='0' x2='1'><stop offset='0' stop-color='rgb(44,44,44)'/><stop offset='1' stop-color='rgb(108,108,108)'/></linearGradient>` +
        `<linearGradient id='${gid}-t' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='rgb(132,132,132)'/><stop offset='1' stop-color='rgb(64,64,64)'/></linearGradient>` +
        `<linearGradient id='${gid}-b' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='rgb(206,206,206)'/><stop offset='1' stop-color='rgb(128,128,128)'/></linearGradient>` +
        `</defs>` +
        `<path d='M-2 -2H${f1(vx + tv)}L${f1(vx - tv)} ${f1(H + 2)}H-2Z' fill='url(#${gid}-l)'/>` +
        `<path d='M${f1(vx + tv)} -2H${f1(W + 2)}V${f1(H + 2)}H${f1(vx - tv)}Z' fill='url(#${gid}-r)'/>` +
        `<g opacity='.75'><path d='M-2 -2H${f1(W + 2)}V${f1(hy - th)}L-2 ${f1(hy + th)}Z' fill='url(#${gid}-t)'/><path d='M-2 ${f1(hy + th)}L${f1(W + 2)} ${f1(hy - th)}V${f1(H + 2)}H-2Z' fill='url(#${gid}-b)'/></g>`;
      const crease = (x1: number, y1: number, x2: number, y2: number, ox: number, oy: number) =>
        `<path d='M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}' stroke='#000' stroke-opacity='.45' stroke-width='${f1(1.4 * sw)}'/><path d='M${f1(x1 - ox)} ${f1(y1 - oy)}L${f1(x2 - ox)} ${f1(y2 - oy)}' stroke='#fff' stroke-opacity='.8' stroke-width='${f1(1.6 * sw)}'/>`;
      out.frente += crease(vx + tv, -2, vx - tv, H + 2, 1.5, 0) + crease(-2, hy + th, W + 2, hy - th, 0, 1.5);
      break;
    }
    case 'amassado': {
      out.relevo += crumple(W, H, k, r);
      // desamassada, ela não fica reta: a beirada entorta um pouco para dentro
      const border: Pt[] = [];
      const edge = (a: Pt, b: Pt, nx: number, ny: number) => {
        const n = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (16 * Math.max(0.4, k))));
        for (let i = 0; i < n; i++) {
          const t = i / n,
            inset = r() * 3.6 * k;
          border.push([a[0] + (b[0] - a[0]) * t + nx * inset, a[1] + (b[1] - a[1]) * t + ny * inset]);
        }
      };
      edge([0, 0], [W, 0], 0, 1);
      edge([W, 0], [W, H], -1, 0);
      edge([W, H], [0, H], 0, -1);
      edge([0, H], [0, 0], 1, 0);
      out.cut.push(`M-6 -6H${f1(W + 6)}V${f1(H + 6)}H-6Z${poly(border)}Z`);
      out.evenodd = true;
      break;
    }
    case 'furado': {
      // Um buraco principal realmente comido pelo fogo; às vezes uma perfuração menor ao lado.
      const cx = W * (0.43 + r() * 0.15),
        cy = H * (0.39 + r() * 0.2);
      burnHole(cx, cy, (54 + r() * 22) * k, k, r, out);
      if (r() < 0.55) {
        const x = W * (cx < W / 2 ? 0.8 : 0.2),
          y = H * (0.25 + r() * 0.5);
        burnHole(x, y, (19 + r() * 11) * k, k, r, out);
      }
      break;
    }
    case 'queimado': {
      // A chama come uma quina ou o pé. A mesma fibra tostada dos furos acompanha o recorte.
      let pts: Pt[];
      if (r() < 0.6) {
        const a = (130 + r() * 70) * k,
          b = (110 + r() * 60) * k;
        pts = rip(wavy(at(corner, a, 0), at(corner, 0, b), r, 18 * k, 6 * Math.max(0.4, k), 14 * k * inward(corner)), [W / 2, H / 2], r, 3.2 * k, step);
        const Q = at(corner, -5, -5);
        out.cut.push(`M${f1(Q[0])} ${f1(Q[1])}${cont(pts)}Z`);
      } else {
        const base = (34 + r() * 22) * k;
        pts = rip(wavy([W + 4, H - base], [-4, H - base * (0.7 + r() * 0.6)], r, 16 * k, 6 * Math.max(0.4, k), 0), [W / 2, 0], r, 3.2 * k, step);
        out.cut.push(`M${f1(W + 5)} ${f1(H + 5)}${cont(pts)}L-5 ${f1(H + 5)}Z`);
      }
      burnEdge(pts, [W / 2, H / 2], W, H, k, r, out);
      break;
    }
    case 'molhado': {
      // A água espalha pigmento em ilhas de borda macia, com depósitos mais escuros no meio.
      // Sem anéis: eles lembram café e ficam artificiais na cartolina colorida.
      const s = Math.min(W, H);
      const side = r() < 0.5 ? 1 : -1;
      const cx = W * (side === 1 ? 0.59 : 0.41) + (r() - 0.5) * W * 0.06;
      const cy = H * (0.51 + (r() - 0.5) * 0.08);
      const rx = s * (0.35 + r() * 0.035);
      const ry = s * (0.19 + r() * 0.025);
      const sx = cx - side * rx * 1.38;
      const sy = cy - ry * (0.77 + r() * 0.15);
      let wash =
        `<path d='${waterBlobPath(cx, cy, rx, ry, r)}' fill='rgb(70 74 78)' fill-opacity='.18'/>` +
        `<path d='${waterBlobPath(sx, sy, rx * 0.47, ry * 0.65, r)}' fill='rgb(70 74 78)' fill-opacity='.16'/>`;
      // Concentrações largas de pigmento, como as ondulações que a água deixa ao secar.
      for (let i = 0; i < 7; i++) {
        const x = cx + (r() - 0.5) * rx * 1.25;
        const y = cy + (r() - 0.5) * ry * 1.2;
        wash += `<path d='${waterBlobPath(x, y, rx * (0.28 + r() * 0.26), ry * (0.09 + r() * 0.12), r)}' fill='rgb(55 60 64)' fill-opacity='${(0.035 + r() * 0.035).toFixed(3)}'/>`;
      }
      out.fundo += `<g filter='url(#papel-agua)'>${wash}</g>`;
      // Gotas junto da ilha menor, com algumas bem miúdas mais afastadas.
      for (let i = 0; i < 45; i++) {
        const angle = r() * Math.PI * 2;
        const distance = Math.sqrt(r());
        const x = sx + Math.cos(angle) * distance * rx * 1.2;
        const y = sy + Math.sin(angle) * distance * ry * 1.15;
        const radius = s * (0.002 + Math.pow(r(), 3) * 0.019);
        out.fundo += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(radius)}' fill='rgb(65 70 74)' fill-opacity='${(0.07 + r() * 0.13).toFixed(3)}'/>`;
      }
      break;
    }
    case 'sangue': {
      const { pool, drops } = bloodPoolArt(W, H, r);
      // Uma silhueta opaca, com transparência aplicada só ao conjunto: overlap não soma tinta.
      out.clareia += `<g fill='rgb(156 17 28)' opacity='.76'><path d='${pool}' filter='url(#papel-agua)'/>${drops}</g>`;
      break;
    }
    case 'cafe': {
      const R = (46 + r() * 16) * k;
      const c = corners[Math.floor(r() * 4)];
      const [cx, cy] = at(c, Math.min(W * 0.62, R * (1.2 + r() * 1.1)), Math.min(H * 0.6, R * (1 + r() * 0.8)));
      const brown = 'rgb(104 60 22)';
      const sx = cx + (r() - 0.5) * R * 1.4,
        sy = cy + (r() - 0.5) * R * 1.2;
      let drops = '';
      for (let i = 0; i < 12; i++) {
        const a = r() * Math.PI * 2,
          dd = (22 + r() * 40) * k;
        drops += `<circle cx='${f1(sx + Math.cos(a) * dd)}' cy='${f1(sy + Math.sin(a) * dd)}' r='${f1((0.8 + r() * r() * 3.4) * k)}' fill='${brown}' fill-opacity='.45'/>`;
      }
      out.fundo +=
        `<g filter='url(#papel-mancha)'>` +
        `<circle cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(R)}' fill='rgb(130 80 36)' fill-opacity='.1'/>` +
        `<circle cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(R)}' fill='none' stroke='${brown}' stroke-opacity='.34' stroke-width='${f1(7 * sw)}' stroke-dasharray='${f1(R * 4.4)} ${f1(R * 0.35)} ${f1(R * 1.2)} ${f1(R * 0.3)}'/>` +
        // o que derramou: uma poça e os respingos
        `<path d='${blobPath(sx, sy, (13 + r() * 9) * k, r)}' fill='${brown}' fill-opacity='.34'/>` +
        drops +
        specks(cx, cy, sx, sy, R, k, brown, r) +
        `</g>`;
      break;
    }
    case 'costurado':
      sewn(W, H, k, sw, step, r, out);
      break;
    case 'colado':
      glued(W, H, k, sw, step, r, out);
      break;
    case 'picotado':
      pinked(W, H, k, r, out);
      break;
    case 'caderno':
      notebookEdge(W, H, k, r, out);
      break;
    case 'arranhado':
      catScratch(W, H, k, sw, r, out);
      break;
    case 'garras':
      beastClaws(W, H, k, sw, step, r, out);
      break;
    case 'mordido':
      bitten(W, H, k, sw, step, r, out);
      break;
    case 'tracas':
      moths(W, H, k, r, out);
      break;
    case 'mofado':
      mould(W, H, k, r, out);
      break;
    case 'pisado':
      shoePrint(W, H, k, r, uid, out);
      break;
    case 'pegadas':
      pawPrints(W, H, k, r, out);
      break;
    case 'descascado':
      tapePulled(W, H, k, sw, r, uid, out);
      break;
    case 'baleado':
      bulletHoles(W, H, k, sw, r, out);
      break;
    case 'passos':
      tinyFootsteps(W, H, k, r, out);
      break;
    case 'mao':
      bloodyHand(W, H, k, r, uid, out);
      break;
    case 'nanquim':
      inkSplat(W, H, k, r, out);
      break;
    case 'gosma':
      slime(W, H, k, r, uid, out);
      break;
    case 'lagrimas':
      tears(W, H, k, r, out);
      break;
    case 'salgadinho':
      snackFingers(W, H, k, r, out);
      break;
    case 'cybertribal':
      tribalInk(W, H, k, r, out);
      break;
    case 'glitch':
      glitchBands(W, H, k, r, out);
      break;
    case 'corrompido':
      corruptBlocks(W, H, k, r, out);
      break;
    case 'desintegrado':
      pixelDissolve(W, H, k, r, out);
      break;
  }
}

/** O tostado se espalha pelo papel em faixas irregulares; só o carvão encosta no recorte. */
function burnBand(edge: Pt[], paper: Pt, width: number, r: () => number, taper = false): string {
  const side = sideOf(edge[0], edge[edge.length - 1], paper);
  const phase = r() * Math.PI * 2;
  const outer = edge.map((p, i): Pt => {
    const [nx, ny] = normalAt(edge, i, side, 3);
    const t = i / (edge.length - 1);
    let fade = 1;
    if (taper && i < 3) fade = [0, 0.25, 0.6][i];
    if (taper && i >= edge.length - 3) fade = [0.6, 0.25, 0][i - edge.length + 3];
    const d = width * fade * (0.75 + 0.18 * Math.sin(t * 12 + phase) + r() * 0.2);
    return [p[0] + nx * d, p[1] + ny * d];
  });
  return `${poly(edge)}${cont([...outer].reverse())}Z`;
}

/** Leva a mancha além das duas bordas da ficha para ela não terminar num corte reto. */
function isCornerBurn(edge: Pt[], W: number, H: number): boolean {
  const start = edge[0], end = edge[edge.length - 1];
  return (Math.abs(start[1]) < 1 || Math.abs(start[1] - H) < 1) && (Math.abs(end[0]) < 1 || Math.abs(end[0] - W) < 1);
}

function extendedBurnEdge(edge: Pt[], W: number, H: number, extra: number): Pt[] {
  const start = edge[0], next = edge[1], end = edge[edge.length - 1], previous = edge[edge.length - 2];
  const al = Math.hypot(next[0] - start[0], next[1] - start[1]) || 1;
  const bl = Math.hypot(end[0] - previous[0], end[1] - previous[1]) || 1;
  // A quina começa numa borda horizontal e termina numa vertical. A mancha continua por essas
  // bordas, em vez de ser cortada onde a diagonal encosta nelas.
  const corner = isCornerBurn(edge, W, H);
  const before = (d: number): Pt => corner
    ? [start[0] - Math.sign(next[0] - start[0]) * d, start[1]]
    : [start[0] - ((next[0] - start[0]) / al) * d, start[1] - ((next[1] - start[1]) / al) * d];
  const after = (d: number): Pt => corner
    ? [end[0], end[1] + Math.sign(end[1] - previous[1]) * d]
    : [end[0] + ((end[0] - previous[0]) / bl) * d, end[1] + ((end[1] - previous[1]) / bl) * d];
  return [
    before(extra), before(extra * 0.62), before(extra * 0.28),
    ...edge,
    after(extra * 0.28), after(extra * 0.62), after(extra),
  ];
}

function burnEdge(edge: Pt[], paper: Pt, W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const corner = isCornerBurn(edge, W, H);
  const shade = corner ? edge : extendedBurnEdge(edge, W, H, 70 * k);
  const charcoal = corner ? edge : extendedBurnEdge(edge, W, H, 18 * k);
  const cap = corner ? 'butt' : 'round';
  out.fundo += `<path d='${burnBand(shade, paper, 31 * k, r, true)}' fill='rgb(138 108 88)' fill-opacity='.8' filter='url(#papel-tostado)'/>`;
  out.frente +=
    `<path d='${poly(charcoal)}' fill='none' stroke='rgb(89 62 48)' stroke-opacity='.76' stroke-width='${f1(25 * k)}' stroke-linecap='${cap}' stroke-linejoin='round' filter='url(#papel-fuligem-larga)'/>` +
    `<path d='${poly(charcoal)}' fill='none' stroke='rgb(38 27 22)' stroke-opacity='.9' stroke-width='${f1(11 * k)}' stroke-linecap='${cap}' stroke-linejoin='round' filter='url(#papel-fuligem-estreita)'/>` +
    `<path d='${poly(edge)}' fill='none' stroke='rgb(25 18 15)' stroke-opacity='.82' stroke-width='${f1(2.6 * k)}' stroke-linecap='${cap}' stroke-linejoin='round' filter='url(#papel-borda-queimada)'/>`;
  const side = sideOf(edge[0], edge[edge.length - 1], paper);
  for (let j = 0; j < 15; j++) {
    const i = 1 + Math.floor(r() * (edge.length - 3));
    out.frente += `<path d='${poly(edge.slice(i, i + 2 + Math.floor(r() * 3)))}' fill='none' stroke='rgb(24 22 20)' stroke-opacity='${(0.2 + r() * 0.35).toFixed(2)}' stroke-width='${f1((0.5 + r() * 1.5) * k)}' stroke-linecap='round'/>`;
  }
  let soot = `<g fill='rgb(45 35 30)'>`;
  for (let i = 0; i < 100; i++) {
    const at = 1 + Math.floor(r() * (edge.length - 2));
    const [nx, ny] = normalAt(edge, at, side, 3);
    const d = (1.5 + r() * r() * 22) * k;
    soot += `<circle cx='${f1(edge[at][0] + nx * d)}' cy='${f1(edge[at][1] + ny * d)}' r='${f1((0.22 + Math.pow(r(), 4) * 1.4) * k)}' fill-opacity='${(0.18 + r() * 0.37).toFixed(2)}'/>`;
  }
  out.frente += `${soot}</g>`;
}

function burnHole(cx: number, cy: number, R: number, k: number, r: () => number, out: PaperArt): void {
  const edge = burnRing(cx, cy, R, r);
  const small = R < 36 * k;
  const spread = small ? Math.min(15 * k, R * 0.55) : Math.min(36 * k, R * 0.6);
  const path = `${poly(edge)}Z`;
  out.cut.push(`${poly(edge)}Z`);
  out.fundo += `<path d='${path}' fill='none' stroke='rgb(138 108 88)' stroke-opacity='.82' stroke-width='${f1(spread)}' filter='url(#${small ? 'papel-tostado-pequeno' : 'papel-tostado'})'/>`;
  out.frente +=
    `<path d='${path}' fill='none' stroke='rgb(89 62 48)' stroke-opacity='.76' stroke-width='${f1((small ? 9 : 23) * k)}' stroke-linejoin='round' filter='url(#${small ? 'papel-fuligem-larga-pequena' : 'papel-fuligem-larga'})'/>` +
    `<path d='${path}' fill='none' stroke='rgb(38 27 22)' stroke-opacity='.9' stroke-width='${f1((small ? 4.5 : 10) * k)}' stroke-linejoin='round' filter='url(#${small ? 'papel-fuligem-estreita-pequena' : 'papel-fuligem-estreita'})'/>` +
    `<path d='${path}' fill='none' stroke='rgb(25 18 15)' stroke-opacity='.82' stroke-width='${f1((small ? 1.8 : 2.4) * k)}' stroke-linejoin='round' filter='url(#papel-borda-queimada)'/>`;
  for (let j = 0; j < 18; j++) {
    const i = Math.floor(r() * edge.length);
    const segment = [edge[i], edge[(i + 1) % edge.length], edge[(i + 2) % edge.length]];
    out.frente += `<path d='${poly(segment)}' fill='none' stroke='rgb(24 22 20)' stroke-opacity='${(0.2 + r() * 0.35).toFixed(2)}' stroke-width='${f1((0.5 + r() * 1.5) * k)}' stroke-linecap='round'/>`;
  }
  let soot = `<g fill='rgb(45 35 30)'>`;
  for (let i = 0; i < 130; i++) {
    const p = edge[Math.floor(r() * edge.length)];
    const dx = p[0] - cx, dy = p[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    const d = (1.5 + r() * r() * 27) * k;
    soot += `<circle cx='${f1(p[0] + (dx / len) * d)}' cy='${f1(p[1] + (dy / len) * d)}' r='${f1((0.22 + Math.pow(r(), 4) * 1.4) * k)}' fill-opacity='${(0.18 + r() * 0.37).toFixed(2)}'/>`;
  }
  out.frente += `${soot}</g>`;
}

/** Uma borda de queimado: ondas largas, sem os dentes miúdos do rasgo. */
function wavy(a: Pt, b: Pt, r: () => number, amp: number, step: number, bulge: number): Pt[] {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy);
  const nx = -dy / len,
    ny = dx / len;
  const n = Math.max(6, Math.round(len / step));
  const fa = 1 + r() * 2,
    fb = 3 + r() * 3,
    pa = r() * 6,
    pb = r() * 6;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * t);
    const off = env * (Math.sin(t * Math.PI * fa + pa) * amp + Math.sin(t * Math.PI * fb + pb) * amp * 0.45 + (r() - 0.5) * amp * 0.3) + env * bulge;
    pts.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
  }
  return pts;
}

/** Um furo desigual, com alguns bocados maiores arrancados e fibra miúda na borda. */
function burnRing(cx: number, cy: number, R: number, r: () => number): Pt[] {
  const n = 64;
  const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
  const rx = R * (0.94 + r() * 0.2), ry = R * (0.78 + r() * 0.2);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = 1 + 0.18 * Math.sin(a * 2 + ph[0]) + 0.11 * Math.sin(a * 3 + ph[1]) + 0.07 * Math.sin(a * 7 + ph[2]) + 0.035 * Math.sin(a * 17 + ph[3]) + (r() - 0.5) * 0.075;
    pts.push([cx + Math.cos(a) * rx * rad, cy + Math.sin(a) * ry * rad]);
  }
  return pts;
}

/** Uma mancha: um círculo que não é redondo. */
function blobPath(cx: number, cy: number, R: number, r: () => number): string {
  const n = 36;
  const ph = [r() * 6, r() * 6, r() * 6];
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = R * (1 + 0.12 * Math.sin(a * 2 + ph[0]) + 0.07 * Math.sin(a * 3 + ph[1]) + 0.04 * Math.sin(a * 5 + ph[2]));
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return smooth([...pts, pts[0]]) + 'Z';
}

/** Uma bolsa de sangue opaca, com o contorno, os splashes e as gotas aprovados. */
function bloodPoolArt(W: number, H: number, r: () => number): { pool: string; drops: string } {
  const s = Math.min(W, H);
  const side = r() < 0.5 ? 1 : -1;
  const cx = W * (side === 1 ? 0.54 : 0.46) + (r() - 0.5) * W * 0.05;
  const cy = H * (0.51 + (r() - 0.5) * 0.08);
  const rx = W * (0.32 + r() * 0.04);
  const ry = H * (0.3 + r() * 0.04);
  const sx = cx - side * rx * 0.86;
  const sy = cy - ry * (0.42 + r() * 0.12);
  let rim: Pt[] = [];
  let pool = waterBlobPath(cx, cy, rx, ry, r, (pts) => rim = pts);
  pool += waterBlobPath(sx, sy, rx * 0.52, ry * 0.56, r);
  let drops = '';
  const count = 7 + Math.floor(r() * 4);
  const phase = r() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const angle = phase + ((i + (r() - 0.5) * 0.65) / count) * Math.PI * 2;
    const index = (Math.round(angle / (Math.PI * 2) * rim.length) % rim.length + rim.length) % rim.length;
    const edge = rim[index];
    const distance = Math.hypot(edge[0] - cx, edge[1] - cy);
    const ux = (edge[0] - cx) / distance;
    const uy = (edge[1] - cy) / distance;
    const length = s * (0.045 + r() * 0.1);
    const width = s * (0.009 + r() * 0.014);
    const lean = (r() - 0.5) * width * 1.8;
    const point = (forward: number, lateral: number) =>
      `${f1(edge[0] + ux * forward - uy * lateral)} ${f1(edge[1] + uy * forward + ux * lateral)}`;
    // Os pés seguem a tangente da borda: a bolsa entra no splash com ombros arredondados.
    const at = (offset: number) => rim[(index + offset + rim.length) % rim.length];
    const left = at(-1), right = at(1);
    const shoulder = Math.min(length * 0.45, Math.hypot(right[0] - left[0], right[1] - left[1]) * 0.3);
    const tangent = (foot: Pt, before: Pt, after: Pt, sign: number) => {
      const dx = after[0] - before[0], dy = after[1] - before[1];
      const span = Math.hypot(dx, dy);
      return `${f1(foot[0] + sign * dx / span * shoulder)} ${f1(foot[1] + sign * dy / span * shoulder)}`;
    };
    pool += `M${f1(left[0])} ${f1(left[1])}C${tangent(left, at(-2), edge, 1)} ${point(length * 0.7, lean - width * 0.16)} ${point(length, lean)}C${point(length * 0.7, lean + width * 0.2)} ${tangent(right, edge, at(2), -1)} ${f1(right[0])} ${f1(right[1])}L${point(-width * 3, 0)}Z`;
    // Gotas alongadas continuam na direção do splash, já separadas da bolsa.
    const flight = length + s * (0.016 + r() * 0.035);
    const x = edge[0] + ux * flight - uy * lean;
    const y = edge[1] + uy * flight + ux * lean;
    const radius = s * (0.004 + r() * 0.006);
    drops += `<ellipse cx='${f1(x)}' cy='${f1(y)}' rx='${f1(radius * (1.5 + r()))}' ry='${f1(radius)}' transform='rotate(${f1(Math.atan2(uy, ux) * 180 / Math.PI)} ${f1(x)} ${f1(y)})'/>`;
  }
  // Respingos de vários tamanhos em volta da poça, sem cobrir a escrita.
  for (let i = 0; i < 32; i++) {
    const angle = r() * Math.PI * 2;
    const distance = 0.8 + r() * 0.55;
    const x = cx + Math.cos(angle) * distance * rx;
    const y = cy + Math.sin(angle) * distance * ry;
    const radius = s * (0.003 + Math.pow(r(), 3) * 0.014);
    drops += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(radius)}'/>`;
  }
  return { pool, drops };
}

/** Duas ou três bolsas menores, com transparência aplicada uma vez ao conjunto. */
function smallBloodPoolsArt(W: number, H: number, count: 2 | 3, r: () => number): string {
  const centers: Pt[] = count === 2 ? [[0.44, 0.75], [0.76, 0.3]] : [[0.5, 0.26], [0.79, 0.64], [0.29, 0.78]];
  let pools = '', drops = '';
  for (const [x, y] of centers) {
    const scale = (count === 2 ? 0.46 : 0.36) + r() * 0.04;
    const tx = W * (x + (r() - 0.5) * 0.045 - scale * 0.5);
    const ty = H * (y + (r() - 0.5) * 0.045 - scale * 0.5);
    const transform = `translate(${f1(tx)} ${f1(ty)}) scale(${scale.toFixed(3)})`;
    const art = bloodPoolArt(W, H, r);
    pools += `<path d='${art.pool}' transform='${transform}'/>`;
    drops += `<g transform='${transform}'>${art.drops}</g>`;
  }
  return `<g fill='rgb(156 17 28)' opacity='.76'><g filter='url(#papel-agua)'>${pools}</g>${drops}</g>`;
}

/** Mancha de água: lóbulos largos e pequenas reentrâncias, sem geometria de gota ou anel. */
function waterBlobPath(cx: number, cy: number, rx: number, ry: number, r: () => number, contour?: (pts: Pt[]) => void): string {
  const n = 48;
  const phase = [r() * 6, r() * 6, r() * 6, r() * 6];
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const waviness = 1 + 0.2 * Math.sin(a * 2 + phase[0]) + 0.14 * Math.sin(a * 3 + phase[1]) + 0.09 * Math.sin(a * 5 + phase[2]) + 0.045 * Math.sin(a * 9 + phase[3]);
    pts.push([cx + Math.cos(a) * rx * waviness, cy + Math.sin(a) * ry * waviness]);
  }
  contour?.(pts);
  return smooth([...pts, pts[0]]) + 'Z';
}

/**
 * O papel amassado e desamassado, como na foto: facetas grandes, cada uma virada para um lado (um
 * cinza em volta de 50%, que no soft-light clareia ou escurece a cartolina e a tinta), e os vincos
 * marcando as arestas, uma linha clara e uma escura lado a lado.
 */
function crumple(W: number, H: number, k: number, r: () => number): string {
  const step = 60 * Math.max(0.45, k);
  const cols = Math.max(2, Math.round(W / step) + 1),
    rows = Math.max(2, Math.round(H / step) + 1);
  const sx = W / (cols - 1),
    sy = H / (rows - 1);
  const P: Pt[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const jx = i === 0 || i === cols - 1 ? 0 : (r() - 0.5) * sx * 0.85;
      const jy = j === 0 || j === rows - 1 ? 0 : (r() - 0.5) * sy * 0.85;
      P.push([i * sx + jx, j * sy + jy]);
    }
  const at = (i: number, j: number) => P[j * cols + i];
  let facets = '';
  let creases = '';
  const lw = Math.max(0.6, k);
  const tri = (a: Pt, b: Pt, c: Pt) => {
    const g = Math.round(128 + (r() - 0.5) * 100);
    facets += `<path d='M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}L${f1(c[0])} ${f1(c[1])}Z' fill='rgb(${g},${g},${g})' stroke='rgb(${g},${g},${g})' stroke-width='.6'/>`;
  };
  const crease = (a: Pt, b: Pt) => {
    if (r() > 0.55) return;
    const d = `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`;
    creases += `<path d='${d}' stroke='#fff' stroke-opacity='.75' stroke-width='${f1(1.3 * lw)}'/><path d='${d}' transform='translate(${f1(1.1 * lw)} ${f1(1.1 * lw)})' stroke='#000' stroke-opacity='.6' stroke-width='${f1(1.1 * lw)}'/>`;
  };
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < cols - 1; i++) {
      const a = at(i, j),
        b = at(i + 1, j),
        c = at(i + 1, j + 1),
        d = at(i, j + 1);
      if (r() < 0.5) {
        tri(a, b, c);
        tri(a, c, d);
        crease(a, c);
      } else {
        tri(a, b, d);
        tri(b, c, d);
        crease(b, d);
      }
      crease(a, b);
      crease(a, d);
    }
  return `<g>${facets}</g><g fill='none' stroke-linecap='round'>${creases}</g><rect width='${f1(W)}' height='${f1(H)}' filter='url(#papel-relevo)' opacity='.5'/>`;
}

/** O ponto `p` espelhado na reta que passa por `a` e `b`. */
function reflect(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const fx = a[0] + t * dx,
    fy = a[1] + t * dy;
  return [2 * fx - p[0], 2 * fy - p[1]];
}

/** Os pinguinhos miúdos do café: em volta do anel e da poça, uns mais longe, todos pequenos. */
function specks(cx: number, cy: number, sx: number, sy: number, R: number, k: number, brown: string, r: () => number): string {
  let out = '';
  const n = 22 + Math.floor(r() * 12);
  for (let i = 0; i < n; i++) {
    const [ox, oy] = r() < 0.55 ? [cx, cy] : [sx, sy];
    const a = r() * Math.PI * 2,
      d = R * (0.9 + Math.pow(r(), 1.5) * 1.3);
    out += `<circle cx='${f1(ox + Math.cos(a) * d)}' cy='${f1(oy + Math.sin(a) * d)}' r='${f1((0.45 + r() * r() * 1.1) * Math.max(0.4, k))}' fill='${brown}' fill-opacity='${(0.35 + r() * 0.25).toFixed(2)}'/>`;
  }
  return out;
}

// ===================== Cybertribal =====================

/** Pontos ao longo de uma linha macia (Catmull-Rom) que passa pelos pontos de controle. */
function sampleCurve(ctrl: Pt[], n: number): Pt[] {
  const out: Pt[] = [];
  const seg = ctrl.length - 1;
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * seg,
      j = Math.min(seg - 1, Math.floor(u)),
      t = u - j;
    const p0 = ctrl[j - 1] ?? ctrl[j],
      p1 = ctrl[j],
      p2 = ctrl[j + 1],
      p3 = ctrl[j + 2] ?? p2;
    const t2 = t * t,
      t3 = t2 * t;
    out.push([
      0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
    ]);
  }
  return out;
}

/** Uma lâmina: a linha engrossada pelo perfil `w(t)` (zero nas pontas = ponta afiada), fechada e lisa. */
function blade(ctrl: Pt[], w: (t: number) => number, n = 28): string {
  const pts = sampleCurve(ctrl, n);
  const left: Pt[] = [],
    right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(n, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len,
      ny = (b[0] - a[0]) / len;
    const hw = w(i / n) / 2;
    left.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw]);
    right.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw]);
  }
  // a curva lisa dos dois lados, e as pontas em bico (sem arredondar)
  return `${smooth(left)}${smooth(right.reverse()).replace(/^M/, 'L')}Z`;
}

/** Perfil de largura: grosso na base e afiado na ponta (os espinhos). */
const toTip = (base: number) => (t: number) => base * Math.pow(1 - t, 1.5) * (1 + (0.6 * Math.max(0, 0.15 - t)) / 0.15);

/**
 * A trama cybertribal (o neotribal das tatuagens de agora): uma faixa comprida de fios finos que se
 * trançam, engrossando e afinando, cheios de espinhos miúdos, e umas células (anéis) presas entre
 * eles. Desenhada em pé, de 0 a `len` no eixo y, com a largura `wid` centrada em x = 0. O filtro
 * `papel-teia` funde o que se cruza em membranas, como na tinta de verdade.
 */
function tribalWeave(r: () => number, len: number, wid: number, q: number, lace = 1): string {
  let out = '';
  const strands = 5 + Math.floor(r() * 4);
  for (let s = 0; s < strands; s++) {
    const f = 0.5 + r() * 1.1,
      ph = r() * Math.PI * 2,
      f2 = 1.6 + r() * 1.4,
      ph2 = r() * Math.PI * 2;
    const amp = (wid / 2) * (0.45 + r() * 0.5);
    const off = (r() - 0.5) * wid * 0.35;
    const y0 = -len * (0.02 + r() * 0.08),
      y1 = len * (1.02 + r() * 0.08);
    // cada fio só percorre um trecho: uns vão de ponta a ponta, outros nascem e somem no meio
    const from = r() < 0.6 ? 0 : r() * 0.45,
      to = r() < 0.6 ? 1 : 0.55 + r() * 0.45;
    const at = (t: number): Pt => {
      const y = y0 + (y1 - y0) * t;
      return [off + amp * Math.sin(Math.PI * 2 * f * t + ph) + amp * 0.25 * Math.sin(Math.PI * 2 * f2 * t + ph2), y];
    };
    const n = 40;
    const ctrl: Pt[] = [];
    for (let i = 0; i <= 8; i++) ctrl.push(at(from + ((to - from) * i) / 8));
    const base = (1.2 + r() * 1.6) * q;
    const swell = [r() * 6, r() * 6, 5 + r() * 6];
    // traço de pincel: engorda e afina bastante pelo caminho, afiado nas pontas
    out += `<path d='${blade(ctrl, (t) => base * (0.62 + 0.9 * Math.sin(t * swell[2] + swell[0]) ** 4 + 0.9 * Math.max(0, Math.sin(t * 3 + swell[1])) ** 2) * Math.min(1, t * 7, (1 - t) * 7), n)}'/>`;
    // os espinhos: pequenos, curvos, dos dois lados, a maioria apontando para o mesmo lado do fio
    const flow = r() < 0.5 ? 1 : -1;
    const pts = sampleCurve(ctrl, n);
    const segLen = Math.hypot(pts[n][0] - pts[0][0], pts[n][1] - pts[0][1]) / n || 1;
    const every = Math.max(2, Math.round(((14 + r() * 12) * q) / segLen));
    for (let i = 2 + Math.floor(r() * every); i < n - 1; i += every) {
      const p = pts[i],
        a0 = pts[i - 1],
        a1 = pts[i + 1];
      const l = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) || 1;
      const dx = (a1[0] - a0[0]) / l,
        dy = (a1[1] - a0[1]) / l;
      const side = r() < 0.5 ? 1 : -1;
      const nx = -dy * side,
        ny = dx * side;
      const dir = r() < 0.8 ? flow : -flow;
      // a maioria miúda; de vez em quando uma garra comprida que volta em gancho
      const hook = r() < 0.15;
      const L = (hook ? 14 + r() * 12 : 4 + Math.pow(r(), 1.5) * 9) * q;
      const mid: Pt = [p[0] + nx * L * 0.55 + dx * dir * L * 0.15, p[1] + ny * L * 0.55 + dy * dir * L * 0.15];
      const tip: Pt = [p[0] + nx * L * 0.75 + dx * dir * L * 0.75, p[1] + ny * L * 0.75 + dy * dir * L * 0.75];
      const ctrl2: Pt[] = hook ? [p, mid, [p[0] + nx * L * 0.95 + dx * dir * L * 0.6, p[1] + ny * L * 0.95 + dy * dir * L * 0.6], [p[0] + nx * L * 0.6 + dx * dir * L * 1.05, p[1] + ny * L * 0.6 + dy * dir * L * 1.05]] : [p, mid, tip];
      out += `<path d='${blade(ctrl2, toTip(base * (hook ? 1.9 : 1.4 + r() * 0.6)), hook ? 18 : 10)}'/>`;
    }
  }
  // as membranas: uma lâmina de tinta entre os fios, esticada no rumo da faixa, furada de células
  // ovais de vários tamanhos (as paredes finas entre elas são o rendado)
  const patches = Math.round((1 + Math.floor(r() * 3)) * lace);
  for (let c = 0; c < patches; c++) {
    const cy = len * (0.15 + r() * 0.7),
      cx = (r() - 0.5) * wid * 0.35;
    const mw = wid * (0.22 + r() * 0.18),
      mh = len * (0.08 + r() * 0.08);
    const outline: Pt[] = [];
    const ph = [r() * 6, r() * 6];
    for (let j = 0; j < 18; j++) {
      const a = (j / 18) * Math.PI * 2;
      const w = 1 + 0.18 * Math.sin(a * 3 + ph[0]) + 0.12 * Math.sin(a * 5 + ph[1]);
      // pontas afiadas em cima e embaixo: a membrana escorre para os fios
      const pinch = 1 + 0.55 * Math.abs(Math.sin(a)) ** 8;
      outline.push([cx + Math.cos(a) * mw * 0.5 * w, cy + Math.sin(a) * mh * 0.5 * w * pinch]);
    }
    let d = `${smooth([...outline, outline[0]])}Z`;
    const holes: { x: number; y: number; rx: number; ry: number }[] = [];
    for (let t = 0; t < 40 && holes.length < 9; t++) {
      const rx = mw * (0.1 + r() * 0.17),
        ry = rx * (1.2 + r() * 0.7);
      const x = cx + (r() - 0.5) * (mw - rx * 2.4),
        y = cy + (r() - 0.5) * (mh - ry * 2.4);
      const wall = 1.1 * q;
      if (holes.every((h) => Math.hypot((h.x - x) / (h.rx + rx + wall), (h.y - y) / (h.ry + ry + wall)) > 1)) holes.push({ x, y, rx, ry });
    }
    for (const h of holes) {
      const pts: Pt[] = [];
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * Math.PI * 2;
        pts.push([h.x + Math.cos(a) * h.rx, h.y + Math.sin(a) * h.ry]);
      }
      d += `${smooth([...pts, pts[0]])}Z`;
    }
    out += `<path fill-rule='evenodd' d='${d}'/>`;
  }
  return out;
}

// ===================== As manchas da terceira leva (2026-09-30) =====================

// ----- Cybertribal -----

/**
 * Uma tatuagem neotribal de canetão: uma faixa de trama descendo por uma beirada (ou duas, uma de
 * cada lado, como um par de mangas), às vezes atravessando a ficha de viés. Tinta preta chapada; o
 * filtro de teia funde os fios onde eles se cruzam.
 */
function tribalInk(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const q = Math.max(0.4, k);
  const way = r();
  let art = '';
  if (way < 0.4) {
    // o par: uma de cada lado
    const wid = W * (0.18 + r() * 0.06);
    for (const right of [false, true]) art += `<g transform='translate(${f1(right ? W - wid * 0.42 : wid * 0.42)} 0)'>${tribalWeave(r, H, wid, q)}</g>`;
  } else if (way < 0.85) {
    const wid = W * (0.24 + r() * 0.08);
    const right = r() < 0.7;
    art = `<g transform='translate(${f1(right ? W - wid * 0.45 : wid * 0.45)} 0)'>${tribalWeave(r, H, wid, q)}</g>`;
  } else {
    // de viés, de uma quina de baixo até a de cima do outro lado
    const len = Math.hypot(W, H) * 1.05;
    const wid = Math.min(W, H) * (0.3 + r() * 0.08);
    const ang = (Math.atan2(H, W) * 180) / Math.PI - 90 + (r() < 0.5 ? 0 : 2 * (90 - (Math.atan2(H, W) * 180) / Math.PI));
    art = `<g transform='translate(${f1(W / 2)} ${f1(H / 2)}) rotate(${f1(ang)}) translate(0 ${f1(-len / 2)})'>${tribalWeave(r, len, wid, q)}</g>`;
  }
  out.clareia += `<g opacity='.92' fill='rgb(14 13 18)'><g filter='url(#papel-teia)'>${art}</g></g>`;
}

// ----- Passinhos -----

/** Um pezinho de tinta, um pé de comprimento, de bico para cima (−y): a planta e o calcanhar separados. */
const FOOT =
  `<path d='M.02 -.5C.16 -.5 .22 -.36 .21 -.2C.2 -.06 .15 .06 .11 .14L-.1 .14C-.15 .04 -.2 -.1 -.19 -.24C-.18 -.4 -.11 -.5 .02 -.5Z'/>` +
  `<ellipse cx='0' cy='.34' rx='.105' ry='.13'/>`;

/**
 * Passinhos de tinta andando sozinhos pela ficha, como num mapa encantado: um par de pés miúdos que
 * vai e vem, vira, para, segue; os passos mais antigos já quase sumidos, os últimos bem marcados.
 * Às vezes são dois andando, cada um para um lado.
 */
function tinyFootsteps(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const q = Math.max(0.45, k);
  const L = (12.5 + r() * 2.5) * q;
  const walkers = r() < 0.4 ? 2 : 1;
  let prints = '';
  for (let w = 0; w < walkers; w++) {
    // entra por uma beirada (nunca pela de cima à esquerda, atrás da foto) e vai para dentro
    const edge = Math.floor(r() * 3);
    let [x, y]: Pt = edge === 0 ? [W + L, H * (0.25 + r() * 0.6)] : edge === 1 ? [W * (0.3 + r() * 0.6), H + L] : [-L, H * (0.55 + r() * 0.35)];
    let head = Math.atan2(H * (0.35 + r() * 0.3) - y, W * (0.35 + r() * 0.35) - x);
    let turn = 0;
    const stride = L * (1.05 + r() * 0.15);
    const steps = 14 + Math.floor(r() * 12);
    const stops = r() < 0.45;
    for (let i = 0; i < steps; i++) {
      turn = turn * 0.8 + (r() - 0.5) * 0.28;
      head += turn;
      // a beirada empurra o passeio de volta para dentro
      const cx = W / 2 - x,
        cy = H / 2 - y;
      if (x < L * 2 || x > W - L * 2 || y < L * 2 || y > H - L * 2) head += Math.sign(Math.sin(Math.atan2(cy, cx) - head)) * 0.22;
      x += Math.cos(head) * stride;
      y += Math.sin(head) * stride;
      const side = i % 2 ? 1 : -1;
      const nx = -Math.sin(head),
        ny = Math.cos(head);
      const px = x + nx * side * L * 0.28,
        py = y + ny * side * L * 0.28;
      if (px < -L || px > W + L || py < -L || py > H + L) continue;
      const t = i / (steps - 1);
      const op = 0.18 + 0.72 * t * t;
      const ang = (head * 180) / Math.PI + 90 + (r() - 0.5) * 10;
      prints += `<g transform='translate(${f1(px)} ${f1(py)}) rotate(${f1(ang)}) scale(${f1(side * L)} ${f1(L)})' fill-opacity='${op.toFixed(2)}'>${FOOT}</g>`;
      // parou: o outro pé chega do lado, e os dois ficam ali
      if (stops && i === steps - 1) {
        prints += `<g transform='translate(${f1(x - nx * side * L * 0.28)} ${f1(y - ny * side * L * 0.28)}) rotate(${f1(ang + (r() - 0.5) * 12)}) scale(${f1(-side * L)} ${f1(L)})' fill-opacity='.9'>${FOOT}</g>`;
      }
    }
  }
  out.fundo += `<g filter='url(#papel-mancha)' fill='rgb(58 38 22)'>${prints}</g>`;
}

// ----- Mão de sangue -----

/** Uma falange: uma cápsula de `a` a `b`, com largura `w`. */
function capsule(a: Pt, b: Pt, w: number): string {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2),
    ny = (dx / len) * (w / 2);
  const R = f1(w / 2);
  return `<path d='M${f1(a[0] + nx)} ${f1(a[1] + ny)}L${f1(b[0] + nx)} ${f1(b[1] + ny)}A${R} ${R} 0 0 0 ${f1(b[0] - nx)} ${f1(b[1] - ny)}L${f1(a[0] - nx)} ${f1(a[1] - ny)}A${R} ${R} 0 0 0 ${f1(a[0] + nx)} ${f1(a[1] + ny)}Z'/>`;
}

/** Uma almofada da mão: um oval torto, de borda irregular, virado `rot` graus. */
function pad(c: Pt, rx: number, ry: number, rot: number, r: () => number, wob = 1): string {
  const ph = [r() * 6, r() * 6, r() * 6];
  const pts: Pt[] = [];
  const cr = Math.cos((rot * Math.PI) / 180),
    sr = Math.sin((rot * Math.PI) / 180);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const w = 1 + wob * (0.1 * Math.sin(a * 2 + ph[0]) + 0.07 * Math.sin(a * 3 + ph[1]) + 0.05 * Math.sin(a * 5 + ph[2]));
    const x = Math.cos(a) * rx * w,
      y = Math.sin(a) * ry * w;
    pts.push([c[0] + x * cr - y * sr, c[1] + x * sr + y * cr]);
  }
  return `${smooth([...pts, pts[0]])}Z`;
}

/**
 * A marca de uma mão suja de sangue, como um carimbo de pele: só marca onde a mão encostou. Dos dedos
 * ficam os gomos soltos (a ponta mais forte, a base às vezes falhando), longe da palma; a palma é um
 * punhado de almofadas (a de baixo dos dedos, partida, e as duas grandes da base) com o triângulo do
 * meio em branco; do polegar, só a pontinha afastada. A tinta é cortada pelas linhas finas da pele e
 * falha na borda. Pouco sangue, quase sem respingo. De vez em quando são duas mãos.
 */
function bloodyHand(W: number, H: number, k: number, r: () => number, uid: string, out: PaperArt): void {
  const q = Math.max(0.4, k);
  const hands = r() < 0.2 ? 2 : 1;
  let body = '',
    masks = '',
    drops = '';
  for (let h = 0; h < hands; h++) {
    // P: a largura da palma. A mão inteira tem uns 2,1 palmos de altura, da ponta do médio ao pulso
    const P = (66 + r() * 10) * q * (h ? 0.86 : 1);
    const cx = W * (h ? 0.24 + r() * 0.18 : 0.56 + r() * 0.24),
      cy = H * (0.44 + r() * 0.16);
    const up = (r() - 0.5) * 44;
    const flip = r() < 0.5 ? -1 : 1;
    const ca = Math.cos((up * Math.PI) / 180),
      sa = Math.sin((up * Math.PI) / 180);
    // (u, v) em palmos: u para o lado do polegar, v para o pulso; v = 0 é a linha dos nós dos dedos
    const T = (u: number, v: number): Pt => {
      const x = u * flip * P,
        y = (v - 0.05) * P;
      return [cx + x * ca - y * sa, cy + x * sa + y * ca];
    };
    const angOf = (deg: number) => up + flip * deg;
    let marks = '';
    // os dedos, do mindinho ao indicador: o nó (u, v), o comprimento, a abertura e a largura. O
    // mindinho nasce mais baixo e é o mais curto; o médio, o mais comprido.
    const fingers: [number, number, number, number, number][] = [
      [-0.38, 0.24, 0.76, -27, 0.17],
      [-0.13, 0.14, 0.98, -11, 0.2],
      [0.11, 0.1, 1.06, 1, 0.21],
      [0.34, 0.14, 0.94, 13, 0.2],
    ];
    const tips: { c: Pt; ang: number; rx: number; ry: number }[] = [];
    // o jeito da marca: em gomos (encostou de leve), cheia (a mão veio encharcada) ou arrastada
    // (escorregou para o lado do pulso)
    const kind = r();
    const style: 'gomos' | 'cheia' | 'arrastada' = kind < 0.4 ? 'gomos' : kind < 0.75 ? 'cheia' : 'arrastada';
    // uma faixa que afina: do ponto `a` ao `b`, larga `w0` em `a` e `w1` em `b`, com a borda tremida
    const strip = (a: Pt, b: Pt, w0: number, w1: number, capA = true): string => {
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L,
        ny = dx / L;
      const left: Pt[] = [],
        right: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10,
          w = (w0 + (w1 - w0) * t) / 2,
          j = (r() - 0.5) * w * 0.35;
        left.push([a[0] + dx * t + nx * (w + j), a[1] + dy * t + ny * (w + j)]);
        right.push([a[0] + dx * t - nx * (w - j), a[1] + dy * t - ny * (w - j)]);
      }
      // a ponta de cima redonda; a de baixo em bico, esfiapada
      const cap: Pt[] = [];
      if (capA)
        for (let i = 1; i < 6; i++) {
          const ang = Math.PI * (i / 6);
          cap.push([a[0] + (nx * Math.cos(ang) - (dx / L) * Math.sin(ang)) * (w0 / 2), a[1] + (ny * Math.cos(ang) - (dy / L) * Math.sin(ang)) * (w0 / 2)]);
        }
      const loop = [...right.reverse(), ...cap.reverse(), ...left];
      return `${smooth([...loop, loop[0]])}Z`;
    };
    for (const [u0, v0, len, tilt, wd] of fingers) {
      const t = ((tilt + (r() - 0.5) * 6) * Math.PI) / 180;
      const L = len * (0.96 + r() * 0.08);
      const at = (f: number): Pt => T(u0 + Math.sin(t) * L * f, v0 - Math.cos(t) * L * f);
      const ang = angOf(tilt);
      const tip = { c: at(0.835), ang, rx: P * wd * 0.47, ry: P * L * 0.165 };
      tips.push(tip);
      if (style === 'gomos') {
        // a ponta (a que mais marca), a do meio e a de baixo, com as dobras em branco
        marks += pad(tip.c, tip.rx, tip.ry, ang, r, 0.45);
        marks += pad(at(0.525), P * wd * 0.41, P * L * 0.105, ang, r, 0.45);
        if (r() < 0.75) marks += pad(at(0.25 + r() * 0.04), P * wd * 0.38, P * L * (0.06 + r() * 0.05), ang, r, 0.6);
      } else if (style === 'cheia') {
        // o dedo inteiro numa faixa só, da ponta redonda até a base esfiapada; às vezes a dobra do meio falha
        marks += strip(at(0.98), at(0.36 + r() * 0.1), P * wd * 0.95, P * wd * 0.7);
        if (r() < 0.5) marks += pad(at(0.2), P * wd * 0.36, P * L * 0.06, ang, r, 0.8);
      } else {
        // arrastou: uma faixa comprida que afina para baixo, passando da base do dedo
        marks += strip(at(1), at(0.05 - r() * 0.2), P * wd * 0.9, P * wd * 0.12);
      }
    }
    // a palma: as almofadas de baixo dos dedos, a do lado do mindinho e a grande da base do polegar
    const grow = style === 'cheia' ? 1.18 : 1;
    const palm = [
      pad(T(-0.25, 0.3), P * 0.21 * grow, P * 0.12 * grow, angOf(-10), r),
      pad(T(0.14, 0.26), P * 0.23 * grow, P * 0.13 * grow, angOf(5), r),
      pad(T(-0.27, 0.8), P * 0.21 * grow, P * 0.34 * grow, angOf(4), r),
      pad(T(0.2, 0.84), P * 0.27 * grow, P * 0.3 * grow, angOf(-16), r),
    ];
    if (style === 'arrastada') {
      // só pedaços da palma, cada um puxado para baixo num rastro
      for (let i = 0; i < 3; i++) {
        const c = T(-0.3 + i * 0.28 + (r() - 0.5) * 0.1, 0.35 + r() * 0.4);
        const e = T(-0.3 + i * 0.28, 1.1 + r() * 0.35);
        if (r() < 0.8) marks += strip(c, e, P * (0.2 + r() * 0.12), P * 0.05);
      }
    } else marks += palm.join('');
    // o polegar: a ponta comprida, afastada, na diagonal para cima e para fora
    const thumb = T(0.78 + r() * 0.05, 0.4 + r() * 0.06);
    if (style === 'arrastada') marks += strip(T(0.86, 0.24), T(0.62, 0.72), P * 0.2, P * 0.05);
    else marks += pad(thumb, P * 0.1, P * 0.21, angOf(-42), r, 0.5);
    // na cheia, sobra sangue: pingos escorrendo da base da palma e respingos em volta
    let holes = '';
    if (style === 'cheia') {
      // o miolo da palma que não encostou: um buraco torto no meio
      holes += pad(T(0 + (r() - 0.5) * 0.08, 0.55), P * (0.1 + r() * 0.06), P * (0.14 + r() * 0.08), angOf((r() - 0.5) * 60), r, 1.6);
      if (r() < 0.6)
        for (let i = 0; i < 2 + Math.floor(r() * 3); i++) {
          const u = -0.35 + r() * 0.7;
          const L2 = 0.15 + r() * 0.45;
          marks += strip(T(u, 1.02), T(u + (r() - 0.5) * 0.04, 1.02 + L2), P * 0.055, P * 0.045);
          const e = T(u, 1.02 + L2);
          marks += `M${f1(e[0] + P * 0.035)} ${f1(e[1])}a${f1(P * 0.035)} ${f1(P * 0.035)} 0 1 1 ${f1(-P * 0.07)} 0a${f1(P * 0.035)} ${f1(P * 0.035)} 0 1 1 ${f1(P * 0.07)} 0Z`;
        }
      for (let i = 0; i < 14; i++) {
        const d = T((r() - 0.5) * 1.3, 1.05 + r() * 0.5);
        drops += `<circle cx='${f1(d[0])}' cy='${f1(d[1])}' r='${f1((0.5 + Math.pow(r(), 2) * 2) * q)}'/>`;
      }
    }
    // a pele: poucas linhas finas cortando a tinta, em dois rumos cruzados, e a digital na ponta dos dedos
    let skin = '';
    const a1 = r() * 180;
    for (let i = 0; i < 110; i++) {
      const p = T((r() - 0.5) * 1.3, -0.95 + r() * 2.2);
      const ang = ((a1 + (r() < 0.55 ? 0 : 70) + (r() - 0.5) * 22) * Math.PI) / 180;
      const l = P * (0.06 + r() * 0.22);
      const bend = (r() - 0.5) * l * 0.3;
      const x2 = p[0] + Math.cos(ang) * l,
        y2 = p[1] + Math.sin(ang) * l;
      skin += `<path d='M${f1(p[0])} ${f1(p[1])}Q${f1((p[0] + x2) / 2 - Math.sin(ang) * bend)} ${f1((p[1] + y2) / 2 + Math.cos(ang) * bend)} ${f1(x2)} ${f1(y2)}' stroke-width='${f1((0.3 + r() * 0.35) * q)}'/>`;
    }
    for (const tp of style === 'arrastada' ? [] : tips)
      for (let i = 1; i <= 5; i++) {
        const f = i / 5.6;
        skin += `<ellipse cx='${f1(tp.c[0])}' cy='${f1(tp.c[1])}' rx='${f1(tp.rx * f)}' ry='${f1(tp.ry * f * 0.85)}' transform='rotate(${f1(tp.ang)} ${f1(tp.c[0])} ${f1(tp.c[1])})' stroke-width='${f1(0.4 * q)}'/>`;
      }
    masks +=
      `<mask id='${uid}-mao${h}' maskUnits='userSpaceOnUse' x='-50' y='-50' width='${f1(W + 100)}' height='${f1(H + 100)}'>` +
      `<g fill='#fff' filter='url(#papel-mancha)'><path d='${marks}'/></g>` +
      (holes ? `<g fill='#000' filter='url(#papel-mancha)'><path d='${holes}'/></g>` : '') +
      `<g fill='none' stroke='#000' stroke-opacity='.7' stroke-linecap='round'>${skin}</g>` +
      `</mask>`;
    body += `<rect x='-50' y='-50' width='${f1(W + 100)}' height='${f1(H + 100)}' mask='url(#${uid}-mao${h})'/>`;
    if (r() < 0.35) {
      const d = T((r() - 0.5) * 1.4, 1.3 + r() * 0.3);
      drops += `<circle cx='${f1(d[0])}' cy='${f1(d[1])}' r='${f1((0.8 + r() * 1.2) * q)}'/>`;
    }
  }
  // a tinta desigual, mais carregada aqui e ali, como sangue que secou na pele
  out.clareia += `<defs>${masks}</defs><g fill='rgb(136 22 32)' opacity='.86'><g filter='url(#papel-agua)'>${body}</g>${drops}</g>`;
}

// ----- Nanquim -----

/** Um pingo de nanquim que caiu de alto: o miolo, as pontas espirradas em volta e as gotinhas soltas. */
function inkSplat(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const q = Math.max(0.4, k);
  const R = (22 + r() * 14) * q;
  const cx = W * (0.35 + r() * 0.5),
    cy = H * (0.3 + r() * 0.5);
  let body = `<path d='${blobPath(cx, cy, R, r)}'/>`;
  const n = 9 + Math.floor(r() * 8);
  const lean = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.6;
    // espirra mais para um lado: o pingo veio de viés
    const len = R * (0.2 + Math.pow(r(), 1.8) * 1.2) * (1 + 0.6 * Math.max(0, Math.cos(a - lean)));
    const w = R * (0.08 + r() * 0.12);
    const ux = Math.cos(a),
      uy = Math.sin(a);
    const b0: Pt = [cx + ux * R * 0.8, cy + uy * R * 0.8];
    const tip: Pt = [cx + ux * (R + len), cy + uy * (R + len)];
    const tw = w * 0.35;
    body += `<path d='M${f1(b0[0] - uy * w)} ${f1(b0[1] + ux * w)}Q${f1((b0[0] + tip[0]) / 2 - uy * w * 0.35)} ${f1((b0[1] + tip[1]) / 2 + ux * w * 0.35)} ${f1(tip[0] - uy * tw)} ${f1(tip[1] + ux * tw)}L${f1(tip[0] + uy * tw)} ${f1(tip[1] - ux * tw)}Q${f1((b0[0] + tip[0]) / 2 + uy * w * 0.35)} ${f1((b0[1] + tip[1]) / 2 - ux * w * 0.35)} ${f1(b0[0] + uy * w)} ${f1(b0[1] - ux * w)}Z'/>`;
    body += `<circle cx='${f1(tip[0])}' cy='${f1(tip[1])}' r='${f1(tw * (1.3 + r() * 0.8))}'/>`;
    // uma gotinha mais adiante, no rumo da ponta
    if (r() < 0.6) {
      const d = R + len + R * (0.15 + r() * 0.6);
      body += `<circle cx='${f1(cx + ux * d)}' cy='${f1(cy + uy * d)}' r='${f1(R * (0.03 + r() * 0.07))}'/>`;
    }
  }
  // o respingo do pincel sacudido: uma fileira de pingos cada vez menores
  if (r() < 0.5) {
    const a = r() * Math.PI * 2;
    let d = R * 1.6;
    for (let i = 0; i < 9; i++) {
      d += R * (0.25 + r() * 0.3);
      body += `<circle cx='${f1(cx + Math.cos(a) * d + (r() - 0.5) * R * 0.2)}' cy='${f1(cy + Math.sin(a) * d + (r() - 0.5) * R * 0.2)}' r='${f1(R * 0.13 * (1 - i / 11) * (0.7 + r() * 0.5))}'/>`;
    }
  }
  out.clareia += `<g fill='rgb(16 18 34)' opacity='.88'><g filter='url(#papel-mancha)'>${body}</g></g>`;
}

// ----- Gosma -----

/** As gosmas: a cor e o brilho. */
const SLIME: readonly (readonly [string, string])[] = [
  ['#7fd12c', '#e9ffc9'],
  ['#ff5ca8', '#ffe0ef'],
  ['#a35cff', '#efe0ff'],
  ['#2fb8ff', '#dff4ff'],
  ['#ff9a1f', '#fff0d6'],
  ['#d8f23a', '#fbffe0'],
];
/** O sangue escorrendo: um vermelho pouco escuro, de brilho mais contido. */
const SLIME_BLOOD: readonly [string, string] = ['#a3121b', '#ff8f8f'];

/**
 * Gosma escorrendo da beirada de cima, por cima de tudo (até da foto): a faixa grudada no alto e os
 * pingos pendurados, uns compridos com a gota pesada na ponta, tudo numa massa só (os pedaços se
 * fundem como líquido), quase opaca, de uma cor só, com o brilho molhado e umas bolhas. Às vezes uns
 * pingos já caíram mais abaixo. Às vezes é sangue: vermelho pouco escuro, sem bolhas.
 */
function slime(W: number, H: number, k: number, r: () => number, uid: string, out: PaperArt): void {
  const q = Math.max(0.4, k);
  // a cor sai do mesmo sorteio de sempre (a forma não muda): numa fatia de cada cor, vira sangue
  const pick = r() * SLIME.length;
  const blood = pick - Math.floor(pick) < 1 / 7;
  const [color, shine] = blood ? SLIME_BLOOD : SLIME[Math.floor(pick)];
  const a = W * (r() * 0.35),
    b = Math.min(W + 6, a + W * (0.45 + r() * 0.5));
  const ph = [r() * 6, r() * 6];
  const band = (x: number) => (10 + 3.5 * Math.sin(x / (23 * q) + ph[0]) + 2 * Math.sin(x / (9 * q) + ph[1])) * q;
  // a faixa grudada no alto, afinando nas pontas
  const pts: Pt[] = [];
  for (let x = a; x <= b; x += 4 * q) {
    const t = Math.min(1, (x - a) / (16 * q), (b - x) / (16 * q));
    pts.push([x, -4 + (band(x) + 4) * Math.sqrt(Math.max(0, t))]);
  }
  let goo = `<path d='M${f1(a)} -6${cont(pts)}L${f1(b)} -6Z'/>`;
  let gloss = '';
  /**
   * Um fio de gosma: um tubo que desce quase da mesma grossura, engordando e afinando um pouco pelo
   * caminho, largo onde sai da massa (o filtro solda e faz o arco entre um fio e outro) e que incha
   * devagar no fim numa gota comprida, fechada em meia-volta. Devolve o contorno e a linha do brilho.
   */
  const drip = (x: number, top: number, L: number, w: number): { d: string; shine: string; tip: Pt; tw: number } => {
    const ph = r() * 6,
      wave = (7 + r() * 6) * q,
      bulge = 0.1 + r() * 0.12;
    const drop = Math.min(L * 0.4, w * (2.6 + r() * 1.2));
    const swell = 1.4 + r() * 0.25;
    const half = (y: number) => {
      const s = y - top;
      const flare = 1 + 1.6 * Math.exp(-s / (w * 0.9));
      const body = 1 + bulge * Math.sin(s / wave + ph) * Math.min(1, s / (w * 2));
      const t = clamp((s - (L - drop * 1.6)) / drop, 0, 1);
      const tail = 1 + (swell - 1) * (t * t * (3 - 2 * t));
      return (w / 2) * flare * body * tail;
    };
    const n = Math.max(10, Math.round(L / (3 * q)));
    const left: Pt[] = [],
      right: Pt[] = [];
    const lean = (r() - 0.5) * w * 0.6;
    const cx = (y: number) => x + lean * ((y - top) / L) ** 2;
    const end = top + L - half(top + L);
    for (let i = 0; i <= n; i++) {
      const y = top + ((end - top) * i) / n;
      left.push([cx(y) - half(y), y]);
      right.push([cx(y) + half(y), y]);
    }
    // o fim: meia-volta por baixo, da direita para a esquerda
    const hr = half(end);
    const capLR: Pt[] = [];
    for (let i = 7; i >= 1; i--) {
      const ang = (i / 8) * Math.PI;
      capLR.push([cx(end) + Math.cos(ang) * hr, end + Math.sin(ang) * hr * 1.08]);
    }
    const outline = [...left, ...capLR, ...right.reverse()];
    const d = `${smooth([...outline, outline[0]])}Z`;
    // o brilho: um fio fino rente à beirada da esquerda, do alto até perto da gota
    const sl: Pt[] = [];
    for (let i = 1; i < n - 1; i += 2) {
      const y = top + ((end - top) * i) / n;
      sl.push([cx(y) - half(y) * 0.45, y]);
    }
    return { d, shine: sl.length > 1 ? smooth(sl) : '', tip: [cx(end), end], tw: hr };
  };
  const n = 4 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const x = a + (b - a) * ((i + 0.25 + r() * 0.5) / n);
    const top = band(x) - 2;
    const thin = r() < 0.3;
    const w = (thin ? 4.4 + r() * 1.4 : 6 + r() * 3.4) * q;
    const L = (18 + Math.pow(r(), 1.2) * Math.min(H * 0.55, 130 * q) * (thin ? 1.1 : 1)) * q ** 0.2;
    const dr = drip(x, top, L, w);
    goo += `<path d='${dr.d}'/>`;
    if (dr.shine) gloss += `<path d='${dr.shine}'/>`;
    // o reflexo da gota: um risquinho comprido do lado de cima à esquerda
    gloss += `<ellipse cx='${f1(dr.tip[0] - dr.tw * 0.38)}' cy='${f1(dr.tip[1] - dr.tw * 0.15)}' rx='${f1(dr.tw * 0.18)}' ry='${f1(dr.tw * 0.5)}' fill='${shine}' stroke='none'/>`;
    // de vez em quando uma gotinha que já caiu, em gota também (ponta para cima)
    if (r() < 0.25) {
      const dy = dr.tip[1] + (12 + r() * 30) * q,
        rr = w * (0.45 + r() * 0.25);
      goo += `<path d='M${f1(x)} ${f1(dy - rr * 2.4)}C${f1(x + rr * 0.3)} ${f1(dy - rr * 1.2)} ${f1(x + rr)} ${f1(dy - rr * 0.6)} ${f1(x + rr)} ${f1(dy)}A${f1(rr)} ${f1(rr)} 0 0 1 ${f1(x - rr)} ${f1(dy)}C${f1(x - rr)} ${f1(dy - rr * 0.6)} ${f1(x - rr * 0.3)} ${f1(dy - rr * 1.2)} ${f1(x)} ${f1(dy - rr * 2.4)}Z'/>`;
    }
  }
  // respingos miúdos em volta da massa
  let specks = '';
  for (let i = 0; i < 5 + Math.floor(r() * 6); i++) {
    const x = a + (b - a) * r(),
      y = band(x) + (4 + r() * 30) * q;
    specks += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1((0.5 + r() * 1.2) * q)}'/>`;
  }
  // o brilho comprido da faixa, rente à beirada de baixo dela
  const lip: Pt[] = [];
  for (let x = a + 18 * q; x <= b - 18 * q; x += 6 * q) lip.push([x, band(x) * 0.55]);
  if (lip.length > 1) gloss += `<path d='${smooth(lip)}'/>`;
  // as bolhas presas na massa
  let bubbles = '';
  for (let i = 0; i < 4 + Math.floor(r() * 4); i++) {
    const x = a + (b - a) * (0.08 + r() * 0.84);
    bubbles += `<circle cx='${f1(x)}' cy='${f1(band(x) * (0.25 + r() * 0.4))}' r='${f1((0.9 + r() * 1.3) * q)}'/>`;
  }
  const blur = f1(2.6 * q);
  out.topo =
    (out.topo ?? '') +
    `<defs><filter id='${uid}-gosma' filterUnits='userSpaceOnUse' x='-20' y='-40' width='${f1(W + 40)}' height='${f1(H + 80)}'>` +
    `<feGaussianBlur in='SourceGraphic' stdDeviation='${blur}' result='b'/>` +
    `<feColorMatrix in='b' type='matrix' values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10'/>` +
    `</filter></defs>` +
    // quase opaca, por inteiro: a massa, o brilho e as bolhas numa só transparência (o sangue, mais ainda)
    `<g opacity='${blood ? '.93' : '.88'}'><g fill='${color}' filter='url(#${uid}-gosma)'>${goo}</g><g fill='${color}'>${specks}</g>` +
    `<g fill='none' stroke='${shine}' stroke-width='${f1(1.3 * q)}' stroke-linecap='round' stroke-opacity='.85'>${gloss}</g>` +
    `<g fill='none' stroke='${shine}' stroke-width='${f1(0.8 * q)}' stroke-opacity='.8'>${blood ? '' : bubbles}</g></g>`;
}

// ----- Lágrimas -----

/**
 * Pingos de choro: um punhado de gotas que secaram, cada uma de uma cor só, como a mancha de água
 * (sem beirada escura), e às vezes uma menorzinha espirrada do lado.
 */
function tears(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const q = Math.max(0.4, k);
  const cx = W * (0.3 + r() * 0.5),
    cy = H * (0.35 + r() * 0.45);
  const n = 4 + Math.floor(r() * 5);
  let body = '';
  for (let i = 0; i < n; i++) {
    const x = cx + (r() - 0.5) * W * 0.42,
      y = cy + (r() - 0.5) * H * 0.5;
    const R = (4.5 + r() * 7) * q;
    // quase redonda: a gota caiu de pé
    const sq = 0.86 + r() * 0.14;
    body += `<ellipse cx='${f1(x)}' cy='${f1(y)}' rx='${f1(R)}' ry='${f1(R * sq)}' transform='rotate(${f1(r() * 180)} ${f1(x)} ${f1(y)})'/>`;
    if (r() < 0.4) {
      const a = r() * Math.PI * 2;
      body += `<circle cx='${f1(x + Math.cos(a) * R * 1.7)}' cy='${f1(y + Math.sin(a) * R * 1.7)}' r='${f1(R * 0.3)}'/>`;
    }
  }
  // uma cor só, com a transparência no conjunto: como a mancha de água, o filtro faz a beirada macia
  out.fundo += `<g filter='url(#papel-agua)' fill='rgb(70 76 84)' opacity='.2'>${body}</g>`;
}

// ----- Dedos de salgadinho -----

/** Uma digital: a volta do dedo e as linhas da pele em laço, dentro de um oval de `w`×`h`. */
function fingerprint(w: number, h: number, r: () => number, sw: number): string {
  let d = '';
  const n = 7;
  const core = (r() - 0.5) * 0.3;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const rx = (w / 2) * t,
      ry = (h / 2) * t;
    const oy = (1 - t) * -h * 0.12;
    const ox = (1 - t) * core * w;
    // as de dentro abrem embaixo (o laço); as de fora fecham
    const gap = t < 0.55 ? 0.9 - t : 0.1 + r() * 0.15;
    const a0 = Math.PI / 2 + gap,
      a1 = Math.PI / 2 + Math.PI * 2 - gap;
    const pts: Pt[] = [];
    for (let s = 0; s <= 16; s++) {
      const a = a0 + ((a1 - a0) * s) / 16;
      pts.push([ox + Math.cos(a) * rx * (1 + (r() - 0.5) * 0.04), oy + Math.sin(a) * ry * (1 + (r() - 0.5) * 0.04)]);
    }
    d += smooth(pts);
  }
  return `<path d='${d}' fill='none' stroke-width='${f1(sw)}'/>`;
}

/**
 * Comeu salgadinho e pegou a ficha: digitais de pó laranja nas beiradas, onde os dedos seguram (os
 * dois polegares dos lados, ou nas quinas de baixo, ou um dedo só passeando), e uns farelos.
 */
function snackFingers(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const q = Math.max(0.4, k);
  const fw = (19 + r() * 4) * q,
    fh = fw * 1.32;
  const way = Math.floor(r() * 3);
  // onde cada dedo encostou e para onde ele apontava (graus; 0 é para cima)
  const spots: [number, number, number][] =
    way === 0
      ? [
          [fw * 0.25, H * (0.45 + r() * 0.3), 90],
          [W - fw * 0.25, H * (0.45 + r() * 0.3), -90],
        ]
      : way === 1
        ? [
            [fw * 0.9, H - fw * 0.5, 40],
            [W - fw * 0.9, H - fw * 0.5, -40],
            [W - fw * 2.3, H - fw * 0.2, -10],
          ]
        : Array.from({ length: 3 + Math.floor(r() * 3) }, (_, i) => [W * (0.55 + r() * 0.4), H * (0.2 + i * 0.18 + r() * 0.08), (r() - 0.5) * 80] as [number, number, number]);
  let prints = '';
  for (const [x, y, a] of spots) {
    const turn = a + (r() - 0.5) * 20;
    prints +=
      `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(turn)})'>` +
      `<ellipse rx='${f1(fw / 2)}' ry='${f1(fh / 2)}' fill-opacity='.22' stroke='none'/>` +
      fingerprint(fw, fh, r, 1.05 * q) +
      `</g>`;
  }
  let crumbs = '';
  for (let i = 0; i < 6 + Math.floor(r() * 8); i++) {
    const [sx, sy] = spots[Math.floor(r() * spots.length)];
    const x = clamp(sx + (r() - 0.5) * fw * 5, 2, W - 2),
      y = clamp(sy + (r() - 0.5) * fw * 4, 2, H - 2);
    crumbs += `<path d='${blobPath(x, y, (0.7 + r() * 1.6) * q, r)}'/>`;
  }
  out.fundo += `<g filter='url(#papel-lama)' fill='rgb(236 116 24)' stroke='rgb(214 96 16)' stroke-opacity='.85'>${prints}</g><g fill='rgb(226 110 20)' fill-opacity='.8'>${crumbs}</g>`;
}

// ===================== Os estragos de costura, cola, tesoura e bicho =====================

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pt = (q: Pt) => `${f1(q[0])} ${f1(q[1])}`;

/** O comprimento acumulado de um caminho, ponto a ponto. */
function lengths(pts: Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return out;
}

/** O ponto a `s` px do começo do caminho. */
function pointAt(pts: Pt[], cum: number[], s: number): Pt {
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1],
    b = pts[i];
  const u = clamp((s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), 0, 1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** A direção do caminho em `s`, medida `span` px para cada lado (sem virar nos dentinhos do rasgo). */
function dirAt(pts: Pt[], cum: number[], s: number, span: number): Pt {
  const a = pointAt(pts, cum, s - span),
    b = pointAt(pts, cum, s + span);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
}

/**
 * As duas beiradas de um rasgo que atravessa a ficha, com uma fresta entre elas que abre e fecha
 * (`min`–`max` px). A primeira fica do lado de `toward`.
 */
function split(C: Pt[], toward: Pt, r: () => number, min: number, max: number): [Pt[], Pt[]] {
  const s = sideOf(C[0], C[C.length - 1], toward);
  let g = (min + max) / 2;
  const a: Pt[] = [],
    b: Pt[] = [];
  C.forEach((p, i) => {
    g = clamp(g + (r() - 0.5) * (max - min) * 0.45, min, max);
    const [nx, ny] = normalAt(C, i, s, 2);
    a.push([p[0] + (nx * g) / 2, p[1] + (ny * g) / 2]);
    b.push([p[0] - (nx * g) / 2, p[1] - (ny * g) / 2]);
  });
  return [a, b];
}

/** Uma fenda ao longo do caminho, com a largura `w` em cada ponto e as beiradas ásperas (`rough` px). */
function slit(path: Pt[], w: number[], r: () => number, rough: number): { a: Pt[]; b: Pt[]; d: string } {
  const a: Pt[] = [],
    b: Pt[] = [];
  path.forEach((p, i) => {
    const [nx, ny] = normalAt(path, i, 1, 2);
    const ha = w[i] > 0 ? Math.max(0, w[i] / 2 + (r() - 0.5) * rough) : 0;
    const hb = w[i] > 0 ? Math.max(0, w[i] / 2 + (r() - 0.5) * rough) : 0;
    a.push([p[0] + nx * ha, p[1] + ny * ha]);
    b.push([p[0] - nx * hb, p[1] - ny * hb]);
  });
  return { a, b, d: `${poly(a)}${cont([...b].reverse())}Z` };
}

/** Um contorno fechado reamostrado a cada `step` px, cada ponto tremido até `amp` px. */
function roughen(pts: Pt[], step: number, amp: number, r: () => number): Pt[] {
  return resample([...pts, pts[0]], step)
    .slice(0, -1)
    .map(([x, y]): Pt => [x + (r() - 0.5) * 2 * amp, y + (r() - 0.5) * 2 * amp]);
}

// ----- Costurada -----

const THREADS = ['rgb(178 30 38)', 'rgb(30 30 36)', 'rgb(244 240 228)', 'rgb(36 62 128)', 'rgb(214 160 40)'];

/** Um fio de linha: a sombra no papel, o fio, a torção escura e o brilho. */
function threadPath(d: string, color: string, sw: number, k: number): string {
  return (
    `<path d='${d}' stroke='#000' stroke-opacity='.42' stroke-width='${f1(2.7 * sw)}' transform='translate(${f1(0.5 * k)} ${f1(1.1 * k)})' filter='url(#papel-fio)'/>` +
    `<path d='${d}' stroke='${color}' stroke-width='${f1(1.9 * sw)}'/>` +
    `<path d='${d}' stroke='#000' stroke-opacity='.2' stroke-width='${f1(1.9 * sw)}' stroke-dasharray='${f1(0.8 * sw)} ${f1(1.7 * sw)}'/>` +
    `<path d='${d}' stroke='#fff' stroke-opacity='.4' stroke-width='${f1(0.6 * sw)}' stroke-dasharray='${f1(1.2 * sw)} ${f1(1.3 * sw)}'/>`
  );
}

/**
 * Rasgou de lado a lado (em pé ou deitado) e foi costurada: a fresta abre e fecha como na Remendada,
 * e a linha passa de furo em furo, num de quatro pontos (cruz, zigue-zague, chuleado, reto), com o nó
 * no começo e a ponta solta no fim. A linha vai por cima do que está escrito e da fresta.
 */
function sewn(W: number, H: number, k: number, sw: number, step: number, r: () => number, out: PaperArt): void {
  const way = r();
  let a: Pt, b: Pt, one: Pt, other: Pt;
  if (way < 0.35) {
    // em pé
    a = [W * (0.36 + r() * 0.28), -4];
    b = [a[0] + (r() - 0.5) * W * 0.18, H + 4];
    one = [0, H / 2];
    other = [W, H / 2];
  } else if (way < 0.65) {
    // deitado
    a = [-4, H * (0.36 + r() * 0.28)];
    b = [W + 4, a[1] + (r() - 0.5) * H * 0.24];
    one = [W / 2, 0];
    other = [W / 2, H];
  } else {
    // numa quina: o canto rasgou na diagonal, de uma beirada até a vizinha, e foi costurado de volta.
    // Nunca a de cima à esquerda, que fica escondida atrás da foto.
    const [cx, cy] = ([[W, 0], [W, H], [0, H]] as const)[Math.floor(r() * 3)];
    const sx = cx ? -1 : 1,
      sy = cy ? -1 : 1;
    const u = Math.min(W * 0.45, (70 + r() * 60) * k),
      v = Math.min(H * 0.55, (60 + r() * 50) * k);
    a = [cx + sx * u, cy - sy * 4];
    b = [cx - sx * 4, cy + sy * v];
    one = [cx + sx * u * 0.25, cy + sy * v * 0.25];
    other = [W / 2, H / 2];
  }
  const C = rip(sweep(a, b, r, (r() - 0.5) * 28 * k, 9 * k, 14), one, r, 5 * k, step);
  const [A, B] = split(C, one, r, 0.4 * k, 3.4 * k);
  out.cut.push(`${poly(A)}${cont([...B].reverse())}Z`);
  out.core.push(coreBand(A, one, r, 0.5 * k, 4 * k), coreBand(B, other, r, 0.5 * k, 4 * k));

  const kk = Math.max(0.5, k);
  const cum = lengths(C),
    L = cum[cum.length - 1];
  const style = (['cruz', 'zigue', 'chuleado', 'reto'] as const)[Math.floor(r() * 4)];
  const color = THREADS[Math.floor(r() * THREADS.length)];
  const gap = (13 + r() * 4) * kk;
  const holes: Pt[] = [];
  const zig: Pt[] = [];
  let d = '';
  let j = 0;
  let lastT: Pt = [0, 1];
  for (let s = 10 * kk + r() * gap * 0.5; s < L - 10 * kk; s += gap * (0.86 + r() * 0.28), j++) {
    const p = pointAt(C, cum, s);
    const t = dirAt(C, cum, s, 9 * kk);
    const n: Pt = [-t[1], t[0]];
    lastT = t;
    const reach = (6.5 + r() * 1.6) * kk;
    // à mão: cada furo sai um tanto fora do lugar
    const hole = (side: number, along: number): Pt => {
      const rr = reach + (r() - 0.5) * 1.4 * kk,
        al = along + (r() - 0.5) * 1.2 * kk;
      return [p[0] + n[0] * rr * side + t[0] * al, p[1] + n[1] * rr * side + t[1] * al];
    };
    if (style === 'cruz') {
      const h = gap * 0.3;
      const a1 = hole(1, -h),
        a2 = hole(1, h),
        b1 = hole(-1, -h),
        b2 = hole(-1, h);
      holes.push(a1, a2, b1, b2);
      d += `M${pt(a1)}L${pt(b2)}M${pt(a2)}L${pt(b1)}`;
    } else if (style === 'zigue') {
      const q = hole(j % 2 ? 1 : -1, 0);
      holes.push(q);
      zig.push(q);
    } else if (style === 'chuleado') {
      const sl = gap * 0.32;
      const a1 = hole(1, -sl),
        b1 = hole(-1, sl);
      holes.push(a1, b1);
      d += `M${pt(a1)}L${pt(b1)}`;
    } else {
      const a1 = hole(1, 0),
        b1 = hole(-1, 0);
      holes.push(a1, b1);
      d += `M${pt(a1)}L${pt(b1)}`;
    }
  }
  if (style === 'zigue') d = poly(zig);
  if (!holes.length) return;
  const first = holes[0],
    last = holes[holes.length - 1];
  const n: Pt = [-lastT[1], lastT[0]];
  const tail = smooth([
    last,
    [last[0] + lastT[0] * 9 * kk + n[0] * 5 * kk, last[1] + lastT[1] * 9 * kk + n[1] * 5 * kk],
    [last[0] + lastT[0] * 17 * kk - n[0] * 1 * kk, last[1] + lastT[1] * 17 * kk - n[1] * 1 * kk],
    [last[0] + lastT[0] * 23 * kk + n[0] * 7 * kk, last[1] + lastT[1] * 23 * kk + n[1] * 7 * kk],
  ]);
  out.fita +=
    `<g fill='rgb(28 22 18)' fill-opacity='.72'>${holes.map((h) => `<circle cx='${f1(h[0])}' cy='${f1(h[1])}' r='${f1(1.15 * sw)}'/>`).join('')}</g>` +
    `<g fill='none' stroke-linecap='round' stroke-linejoin='round'>${threadPath(d, color, sw, k)}${threadPath(tail, color, sw, k)}</g>` +
    `<circle cx='${f1(first[0] + 0.5 * k)}' cy='${f1(first[1] + 1.1 * k)}' r='${f1(2.4 * sw)}' fill='#000' fill-opacity='.35' filter='url(#papel-fio)'/>` +
    `<circle cx='${f1(first[0])}' cy='${f1(first[1])}' r='${f1(2.2 * sw)}' fill='${color}'/>` +
    `<circle cx='${f1(first[0] - 0.6 * sw)}' cy='${f1(first[1] - 0.6 * sw)}' r='${f1(0.7 * sw)}' fill='#fff' fill-opacity='.35'/>`;
}

// ----- Colada em pedaços -----

/**
 * Rasgada em muitos pedaços e posta de volta no lugar: rasgos de beirada a beirada, só em pé e
 * deitados, que se cruzam em grade e picam a ficha em quatro a nove pedaços. As frestas abrem e fecham, cada pedaço
 * ficou um tanto fora do lugar na beirada e pega a luz de um jeito: cada rasgo clareia ou escurece
 * um pouco tudo o que fica de um lado dele, e as metades se somam num tom por pedaço.
 */
function glued(W: number, H: number, k: number, sw: number, step: number, r: () => number, out: PaperArt): void {
  const P = 2 * (W + H);
  const CORNERS: [number, Pt, Pt][] = [
    [0, [0, 0], [-1, -1]],
    [W, [W, 0], [1, -1]],
    [W + H, [W, H], [1, 1]],
    [2 * W + H, [0, H], [-1, 1]],
  ];
  const wrap = (p: number) => ((p % P) + P) % P;
  /** O ponto da beirada a `p` px do canto de cima à esquerda, em sentido horário, `o` px para fora. */
  const rimAt = (p: number, o: number): Pt => {
    const q = wrap(p);
    for (const [c, at, d] of CORNERS) if (Math.abs(q - c) < 0.01) return [at[0] + d[0] * o, at[1] + d[1] * o];
    if (q < W) return [q, -o];
    if (q < W + H) return [W + o, q - W];
    if (q < 2 * W + H) return [W - (q - W - H), H + o];
    return [-o, H - (q - 2 * W - H)];
  };
  /** A volta pela beirada de `from` até `to`, em sentido horário, passando pelas quinas. */
  const walk = (from: number, to: number): number[] => {
    const end = to > from ? to : to + P;
    return [from, ...[0, W, W + H, 2 * W + H, P, P + W, P + W + H, P + 2 * W + H].filter((c) => c > from && c < end), end];
  };
  // longe das quinas: o rasgo que termina numa quina parece um canto arrancado
  const margin = 24 * k;
  const nudge = (p: number) => {
    let q = wrap(p);
    for (const c of [0, W, W + H, 2 * W + H, P]) if (Math.abs(q - c) < margin) q = c + (q < c ? -margin : margin);
    return wrap(q);
  };
  // em grade: um ou dois rasgos em pé e um ou dois deitados, de beirada a beirada, sem diagonal
  const nv = 1 + (r() < 0.6 ? 1 : 0),
    nh = H > 120 * k && r() < 0.4 ? 2 : 1;
  const cuts: [number, number][] = [];
  for (let i = 0; i < nv; i++) {
    const x = W * ((i + 1) / (nv + 1) + ((r() - 0.5) * 0.14) / nv),
      x2 = x + (r() - 0.5) * W * 0.05;
    cuts.push([nudge(x), nudge(W + H + (W - x2))]);
  }
  for (let j = 0; j < nh; j++) {
    const y = H * ((j + 1) / (nh + 1) + ((r() - 0.5) * 0.16) / nh),
      y2 = y + (r() - 0.5) * H * 0.07;
    cuts.push([nudge(W + y), nudge(2 * W + H + (H - y2))]);
  }
  const ends: number[] = [];
  let tone = '',
    lifts = '';
  for (const [a, b] of cuts) {
    ends.push(a, b);
    const A = rimAt(a, 5),
      B = rimAt(b, 5);
    const dx = B[0] - A[0],
      dy = B[1] - A[1],
      l = Math.hypot(dx, dy) || 1;
    const one: Pt = [(A[0] + B[0]) / 2 - (dy / l) * 50, (A[1] + B[1]) / 2 + (dx / l) * 50];
    const other: Pt = [(A[0] + B[0]) / 2 + (dy / l) * 50, (A[1] + B[1]) / 2 - (dx / l) * 50];
    const C = rip(sweep(A, B, r, (r() - 0.5) * 10 * k, 4 * k, 14), one, r, 4.5 * k, step);
    const [E1, E2] = split(C, one, r, 0.5 * k, 3.4 * k);
    out.cut.push(`${poly(E1)}${cont([...E2].reverse())}Z`);
    out.core.push(coreBand(E1, one, r, 0.4 * k, 3.4 * k), coreBand(E2, other, r, 0.4 * k, 3.4 * k));
    // tudo o que fica de um lado deste rasgo: um tanto mais claro ou mais escuro
    const light = r() < 0.5;
    tone += `<path d='${poly([...C, ...walk(b, a).map((p) => rimAt(p, 8))])}Z' fill='${light ? '#fff' : '#000'}' fill-opacity='${(0.12 + r() * 0.12).toFixed(2)}'/>`;
    // a beirada de cada lado não assentou rente: uma pega luz, a outra faz sombra
    lifts += `<path d='${poly(E1)}' stroke='#fff' stroke-opacity='.55'/><path d='${poly(E2)}' stroke='#000' stroke-opacity='.45'/>`;
  }
  // cada trecho de beirada é de um pedaço, e nenhum voltou exatamente para o lugar
  ends.sort((x, y) => x - y);
  ends.forEach((e0, i) => {
    const e1 = ends[(i + 1) % ends.length];
    const inset = r() < 0.25 ? 0 : (0.6 + r() * 2.2) * k;
    if (!inset || Math.abs(e1 - e0) < 1) return;
    const w = walk(e0, e1);
    out.cut.push(`${poly([...w.map((p) => rimAt(p, 7)), ...[...w].reverse().map((p) => rimAt(p, -inset))])}Z`);
  });
  out.relevo += `<g>${tone}</g><g fill='none' stroke-width='${f1(1.1 * sw)}' stroke-linejoin='round'>${lifts}</g>`;
}

// ----- Tesoura de picote -----

/**
 * Recortada em volta com a tesoura de picotar, em zigue-zague ou em ondinha. A tesoura anda aos
 * pedaços: a cada tesourada o desenho recomeça um tanto fora do compasso, e a linha entorta um pouco.
 */
function pinked(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const wave = r() < 0.4;
  const kk = Math.max(0.5, k);
  const per = (wave ? 10 : 7) * kk,
    amp = (wave ? 2.6 : 3.2) * kk,
    base = 1.4 * kk;
  const border: Pt[] = [];
  const side = (len: number, map: (u: number, v: number) => Pt) => {
    let u = amp * 1.6,
      end = u,
      from = u,
      off = 0,
      tilt = 0,
      ph = 0,
      tip = r() < 0.5;
    while (u < len - amp * 1.6) {
      if (u >= end) {
        from = u;
        end = u + (48 + r() * 36) * kk;
        off = (r() - 0.5) * 1.6 * kk;
        tilt = (r() - 0.5) * 0.02;
        ph = r();
      }
      const drift = off + tilt * (u - from);
      if (wave) {
        border.push(map(u, base + drift + (amp * (1 - Math.cos(((u - from) / per + ph) * Math.PI * 2))) / 2));
        u += per / 6;
      } else {
        border.push(map(u, base + drift + (tip ? 0 : amp)));
        tip = !tip;
        u += (per / 2) * (0.9 + r() * 0.2);
      }
    }
  };
  side(W, (u, v) => [u, v]);
  side(H, (u, v) => [W - v, u]);
  side(W, (u, v) => [W - u, H - v]);
  side(H, (u, v) => [v, H - u]);
  out.cut.push(`M-6 -6H${f1(W + 6)}V${f1(H + 6)}H-6Z${poly(border)}Z`);
  out.evenodd = true;
}

// ----- Arrancada do caderno -----

/**
 * Arrancada do caderno de espiral: na beirada da esquerda (ou de cima) ficou o picotinho, com as
 * pontes entre os furos rasgadas e a metade de dentro de cada furo mordendo o papel; um ou outro
 * furo ficou inteiro, e uma ou outra lingueta rasgou mais fundo.
 */
function notebookEdge(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const top = r() < 0.4;
  const L = top ? W : H;
  const map = (u: number, v: number): Pt => (top ? [u, v] : [v, u]);
  const kk = Math.max(0.45, k);
  const pitch = (19 + r() * 3) * kk,
    R = (3.6 + r() * 1) * kk,
    vc = (7 + r() * 1.2) * kk;
  const count = Math.max(1, Math.floor((L - pitch * 0.6) / pitch));
  const u0 = (L - (count - 1) * pitch) / 2;
  const edge: Pt[] = [];
  const tab = (from: number, to: number) => {
    const deep = r() < 0.22 ? (1.5 + r() * 3.5) * kk : 0;
    for (let u = from; u < to; u += 2.2 * kk) edge.push([u, deep + r() * r() * 2.2 * kk]);
  };
  let u = -6;
  for (let j = 0; j < count; j++) {
    const c = u0 + j * pitch;
    if (r() < 0.16) {
      // este furo ficou inteiro
      tab(u, c + R * 1.3);
      u = c + R * 1.3;
      const ring: Pt[] = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2,
          rr = R * (0.94 + r() * 0.1);
        ring.push(map(c + Math.cos(a) * rr, vc + Math.sin(a) * rr));
      }
      out.cut.push(`${poly(ring)}Z`);
      continue;
    }
    // a ponte entre o furo e a beirada rasgou: desce torta, contorna a metade de dentro e sobe
    tab(u, c - R * 1.3);
    edge.push([c - R * (1.05 + r() * 0.25), vc * (0.35 + r() * 0.3)]);
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI - (i / 8) * Math.PI;
      edge.push([c + Math.cos(a) * R, vc + Math.sin(a) * R]);
    }
    edge.push([c + R * (1.05 + r() * 0.25), vc * (0.35 + r() * 0.3)]);
    u = c + R * 1.3;
  }
  tab(u, L + 6);
  const pts = edge.map(([a, b]) => map(a, b));
  out.cut.push(`${poly([map(-6, -6), ...pts, map(L + 6, -6)])}Z`);
  out.core.push(coreBand(pts, map(L / 2, 80 * kk), r, 0.3 * k, 1.8 * k));
}

// ----- Arranhada e Garras -----

/** A largura de uma unhada ao longo do caminho: entra rápido, afunda e vai afinando no arrasto. */
function clawProfile(t: number): number {
  return t < 0.14 ? Math.sin(((t / 0.14) * Math.PI) / 2) : Math.pow(Math.max(0, (1 - t) / 0.86), 0.6);
}

/** Um jogo de unhadas paralelas em volta de `c`, na direção `ang`, que abrem um pouco no arrasto. */
function clawSet(c: Pt, ang: number, L: number, m: number, gap: number, fan: number, bend: number, wave: number, r: () => number, step: number): Pt[][] {
  const dx = Math.cos(ang),
    dy = Math.sin(ang),
    nx = -dy,
    ny = dx;
  const out: Pt[][] = [];
  for (let j = 0; j < m; j++) {
    const off = (j - (m - 1) / 2) * gap;
    const outer = j === 0 || j === m - 1;
    const len = L * (0.82 + r() * 0.2) * (outer ? 0.86 : 1);
    const s0 = -L / 2 + (r() - 0.3) * 0.14 * L;
    const S: Pt = [c[0] + dx * s0 + nx * off, c[1] + dy * s0 + ny * off];
    const E: Pt = [S[0] + dx * len + nx * off * (fan - 1), S[1] + dy * len + ny * off * (fan - 1)];
    out.push(resample(sweep(S, E, r, bend * (0.9 + r() * 0.2), wave, 12), step));
  }
  return out;
}

/** A fibra levantada na beirada de uma unhada: a do lado da luz (do alto à esquerda) clareia, a outra escurece. */
function ridges(path: Pt[], a: Pt[], b: Pt[]): string {
  const [nx, ny] = normalAt(path, Math.floor(path.length / 2), 1, 3);
  const [lit, dark] = nx + ny < 0 ? [a, b] : [b, a];
  return `<path d='${poly(lit)}' stroke='#fff' stroke-opacity='.7'/><path d='${poly(dark)}' stroke='#000' stroke-opacity='.55'/>`;
}

/** Fiapos de fibra soltos na beirada, deitados no sentido do arrasto. */
function hairsAlong(path: Pt[], a: Pt[], b: Pt[], n: number, len: number, r: () => number): string {
  let out = '';
  for (let h = 0; h < n; h++) {
    const i = 1 + Math.floor(r() * (path.length - 2));
    const e = r() < 0.5 ? a[i] : b[i];
    const t = normalAt(path, i, 1, 2);
    const tx = t[1],
      ty = -t[0];
    const tw = (r() - 0.5) * 0.9;
    const l = len * (0.5 + r());
    out += `<path d='M${pt(e)}L${f1(e[0] + (tx + ty * tw) * l)} ${f1(e[1] + (ty - tx * tw) * l)}'/>`;
  }
  return out;
}

/**
 * O gato afiou as unhas: dois ou três jogos de três ou quatro riscos finos, que tiram a cor da
 * cartolina (e o que está escrito) e deixam o miolo claro; uma ou outra unha furou no meio do
 * arrasto. A fibra levantada faz uma linha de luz e uma de sombra dos lados.
 */
function catScratch(W: number, H: number, k: number, sw: number, r: () => number, out: PaperArt): void {
  const kk = Math.max(0.4, k);
  const sets = 2 + (r() < 0.45 ? 1 : 0);
  let ridge = '',
    hairs = '',
    graze = '';
  for (let q = 0; q < sets; q++) {
    const c: Pt = [W * (0.22 + r() * 0.56), H * (0.24 + r() * 0.52)];
    const ang = (((r() < 0.5 ? 50 : 130) + (r() - 0.5) * 50) * Math.PI) / 180;
    const L = (140 + r() * 90) * k;
    const m = 3 + (r() < 0.7 ? 1 : 0);
    const claws = clawSet(c, ang, L, m, (5.5 + r() * 2.5) * k, 1 + r() * 0.5, (r() - 0.5) * 30 * k, 1.5 * k, r, 2.5 * kk);
    const deep = Math.floor(r() * m);
    claws.forEach((path, j) => {
      const wmax = (1.2 + r() * 1) * k;
      const w = path.map((_, i) => wmax * clawProfile(i / (path.length - 1)) * (0.8 + r() * 0.4));
      const s = slit(path, w, r, 0.5 * k);
      out.core.push(s.d);
      if (j === deep || r() < 0.2) {
        const a = Math.floor(path.length * (0.1 + r() * 0.18));
        const b = Math.min(path.length - 1, a + Math.floor(path.length * (0.18 + r() * 0.22)));
        const sub = path.slice(a, b + 1);
        if (sub.length > 2) out.cut.push(slit(sub, sub.map((_, i) => w[a + i] * 0.7 * Math.sin((i / (sub.length - 1)) * Math.PI)), r, 0.3 * k).d);
      }
      const o = slit(path, w.map((v) => (v > 0.2 * k ? v + 1.6 * k : 0)), () => 0.5, 0);
      ridge += ridges(path, o.a, o.b);
      hairs += hairsAlong(path, s.a, s.b, 4, 2.4 * kk, r);
      // a unha do lado raspou sem entrar: só um fio mais claro
      if (r() < 0.4) {
        const g = path.map(([x, y], i): Pt => {
          const [nx, ny] = normalAt(path, i, 1, 2);
          return [x + nx * 3 * k, y + ny * 3 * k];
        });
        graze += `<path d='${poly(g.slice(0, Math.floor(g.length * (0.5 + r() * 0.4))))}'/>`;
      }
    });
  }
  out.relevo += `<g fill='none' stroke-width='${f1(0.9 * sw)}' stroke-linecap='round' stroke-linejoin='round'>${ridge}</g>`;
  out.clareia += `<g fill='none' stroke='#fff' stroke-opacity='.3' stroke-width='${f1(0.7 * sw)}' stroke-linecap='round'>${graze}</g>`;
  out.frente += `<g stroke='#fbf8f0' stroke-opacity='.65' stroke-width='${f1(0.5 * sw)}' stroke-linecap='round'>${hairs}</g>`;
}

/**
 * Uma patada de lobo: três ou quatro garradas largas de lado a lado, curvas como o braço que bateu.
 * Cada uma entra raspando, abre um talho que atravessa o papel e sai raspando de novo; a fibra clara
 * aparece nas beiradas, e uma ou duas linguetas de papel ficaram penduradas para dentro do talho.
 */
function beastClaws(W: number, H: number, k: number, sw: number, step: number, r: () => number, out: PaperArt): void {
  const kk = Math.max(0.4, k);
  const m = 3 + (r() < 0.45 ? 1 : 0);
  const c: Pt = [W * (0.44 + r() * 0.12), H * (0.44 + r() * 0.12)];
  const ang = (((r() < 0.5 ? 45 : 135) + (r() - 0.5) * 36) * Math.PI) / 180;
  const L = Math.hypot(W, H) * (0.62 + r() * 0.2);
  const claws = clawSet(c, ang, L, m, (22 + r() * 8) * k, 1.15 + r() * 0.2, (r() - 0.5) * 60 * k, 3 * k, r, step);
  let ridge = '',
    flaps = '',
    hairs = '',
    grime = '';
  claws.forEach((path, j) => {
    const middle = j > 0 && j < m - 1;
    const wmax = (middle ? 15 : 12) * k * (0.9 + r() * 0.25);
    const fibre = (2.5 + r() * 1.5) * k;
    const n = path.length - 1;
    const prof = path.map((_, i) => clawProfile(i / n));
    const wCut = prof.map((p) => Math.max(0, wmax * p - 1.5 * k));
    const wCore = prof.map((p, i) => wCut[i] + 2 * fibre * Math.min(1, p * 2.5) + 1.2 * k * p);
    const core = slit(path, wCore, r, 2.4 * k);
    out.core.push(core.d);
    ridge += ridges(path, core.a, core.b);
    hairs += hairsAlong(path, core.a, core.b, 10, 3.2 * kk, r);
    grime += `<path d='${smooth(path)}' stroke-width='${f1(wmax * 1.8)}'/>`;

    const a = wCut.findIndex((w) => w > k);
    const b = n - [...wCut].reverse().findIndex((w) => w > k);
    if (a < 0 || b - a < 3) return;
    const sub = path.slice(a, b + 1);
    const hole = slit(sub, wCut.slice(a, b + 1), r, 0);
    const mid = Math.floor(sub.length / 2);
    const [nx, ny] = normalAt(sub, mid, 1, 3);
    const ea = rip(hole.a, [sub[mid][0] + nx * 200, sub[mid][1] + ny * 200], r, 2.6 * k, step);
    const eb = rip(hole.b, [sub[mid][0] - nx * 200, sub[mid][1] - ny * 200], r, 2.6 * k, step);
    out.cut.push(`${poly(ea)}${cont([...eb].reverse())}Z`);

    // as linguetas: um pedaço da beirada arrastado para dentro do talho, no sentido da patada
    const count = r() < 0.6 ? 1 : 2;
    for (let f = 0; f < count; f++) {
      const onA = r() < 0.5;
      const edge = onA ? ea : eb,
        other = onA ? eb : ea;
      if (edge.length < 12) continue;
      const i = Math.floor(edge.length * (0.3 + r() * 0.4));
      const span = 2 + Math.floor(r() * 2);
      const base = edge.slice(i - span, i + span + 1);
      const B1 = base[0],
        B2 = base[base.length - 1];
      const tl = Math.hypot(B2[0] - B1[0], B2[1] - B1[1]) || 1;
      const t: Pt = [(B2[0] - B1[0]) / tl, (B2[1] - B1[1]) / tl];
      const o = other[Math.round((i / (edge.length - 1)) * (other.length - 1))];
      const gw = Math.hypot(o[0] - edge[i][0], o[1] - edge[i][1]) || 1;
      const N: Pt = [(o[0] - edge[i][0]) / gw, (o[1] - edge[i][1]) / gw];
      const reach = gw * (0.45 + r() * 0.3),
        drag = (5 + r() * 7) * k;
      const X: Pt = [edge[i][0] + N[0] * reach + t[0] * drag, edge[i][1] + N[1] * reach + t[1] * drag];
      const jit = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2 + (r() - 0.5) * 2 * k, (p[1] + q[1]) / 2 + (r() - 0.5) * 2 * k];
      const m1 = jit(B2, X),
        m2 = jit(X, B1);
      const flap = `${poly([...base, m1, X, m2])}Z`;
      const bend = `${poly([B1, B2, [B2[0] + (X[0] - B2[0]) * 0.35, B2[1] + (X[1] - B2[1]) * 0.35], [B1[0] + (X[0] - B1[0]) * 0.35, B1[1] + (X[1] - B1[1]) * 0.35]])}Z`;
      flaps +=
        `<path d='${flap}' transform='translate(${f1(1.2 * k)} ${f1(2.2 * k)})' fill='#000' fill-opacity='.35' filter='url(#papel-fio)'/>` +
        `<path d='${flap}' style='fill: color-mix(in oklab, var(--stock) 76%, #000)'/>` +
        `<path d='${bend}' fill='#fff' fill-opacity='.16'/>` +
        `<path d='M${pt(B2)}L${pt(m1)}L${pt(X)}L${pt(m2)}L${pt(B1)}' fill='none' stroke='#fbf8f0' stroke-opacity='.85' stroke-width='${f1(1.1 * sw)}' stroke-linejoin='round'/>`;
    }
  });
  out.fundo += `<g fill='none' stroke='rgb(70 55 45)' stroke-opacity='.1' stroke-linecap='round' filter='url(#papel-borra)'>${grime}</g>`;
  out.relevo += `<g fill='none' stroke-width='${f1(1.1 * sw)}' stroke-linecap='round' stroke-linejoin='round'>${ridge}</g>`;
  out.frente += `<g stroke='#fbf8f0' stroke-opacity='.7' stroke-width='${f1(0.55 * sw)}' stroke-linecap='round'>${hairs}</g>`;
  out.fita += flaps;
}

// ----- Mordida -----

/**
 * O cachorro mordeu a beirada: um arco de dentes arrancou um bocado (cada dente morde um pouco mais
 * fundo, os caninos mais ainda), às vezes duas mordidas lado a lado. Os caninos furaram um pouco além,
 * os dentes deixaram marcas afundadas, o papel vincou em volta e a baba secou numa mancha.
 */
function bitten(W: number, H: number, k: number, sw: number, step: number, r: () => number, out: PaperArt): void {
  const side = Math.floor(r() * 4);
  const len = side % 2 ? H : W;
  const frame = (u: number, v: number): Pt => {
    switch (side) {
      case 0:
        return [u, v];
      case 1:
        return [W - v, u];
      case 2:
        return [W - u, H - v];
      default:
        return [v, H - u];
    }
  };
  const bites = r() < 0.55 ? 2 : 1;
  const u0 = len * (0.28 + r() * 0.44);
  let dents = '',
    creases = '',
    drool = '';
  for (let b = 0; b < bites; b++) {
    const s = b ? 0.72 + r() * 0.15 : 1;
    const bw = (68 + r() * 26) * k * s,
      bd = (30 + r() * 14) * k * s;
    const uc = clamp(b ? u0 + (r() < 0.5 ? -1 : 1) * bw * (0.6 + r() * 0.15) : u0, bw / 2 + 8 * k, len - bw / 2 - 8 * k);
    const teeth = 6 + Math.floor(r() * 3);
    const at = (a: number, f: number): Pt => frame(uc + ((Math.cos(a) * bw) / 2) * f, Math.sin(a) * bd * f);
    const arch: Pt[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI;
      const canine = Math.exp(-Math.pow((a - 0.26 * Math.PI) / 0.12, 2)) + Math.exp(-Math.pow((a - 0.74 * Math.PI) / 0.12, 2));
      arch.push(at(a, 1 + 0.09 * Math.pow(Math.abs(Math.sin(teeth * a)), 0.7) + 0.16 * canine));
    }
    const inside = frame(uc, bd * 3);
    const edge = rip(arch, inside, r, 1.4 * k, step * 0.6);
    out.cut.push(`${poly([frame(uc + bw / 2 + 3, -6), ...edge, frame(uc - bw / 2 - 3, -6)])}Z`);
    out.core.push(coreBand(edge, inside, r, 0.5 * k, 3.2 * k));
    if (b === 0)
      for (const a of [0.26 * Math.PI, 0.74 * Math.PI]) {
        const [cx, cy] = at(a + (r() - 0.5) * 0.08, 1.4 + r() * 0.1);
        const R = (2.3 + r() * 1.1) * k;
        out.cut.push(`${poly(burnRing(cx, cy, R, r))}Z`);
        dents += `<circle cx='${f1(cx + 0.8 * k)}' cy='${f1(cy + 0.8 * k)}' r='${f1(R + 1.3 * k)}' fill='none' stroke='#000' stroke-opacity='.45' stroke-width='${f1(1.3 * sw)}'/><circle cx='${f1(cx - 0.6 * k)}' cy='${f1(cy - 0.6 * k)}' r='${f1(R + 1.6 * k)}' fill='none' stroke='#fff' stroke-opacity='.5' stroke-width='${f1(0.9 * sw)}'/>`;
      }
    for (let t = 0; t < teeth; t++) {
      const a = ((t + 0.5) / teeth) * Math.PI;
      const [x, y] = at(a, 1.22 + r() * 0.06);
      const [x2, y2] = at(a + 0.02, 1.22);
      const ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
      dents += `<ellipse cx='${f1(x)}' cy='${f1(y)}' rx='${f1(2.6 * k)}' ry='${f1(1.4 * k)}' transform='rotate(${f1(ang)} ${f1(x)} ${f1(y)})' fill='#000' fill-opacity='.3'/>`;
    }
    for (let c = 0; c < 5; c++) {
      const a = (0.1 + r() * 0.8) * Math.PI;
      const p1 = at(a, 1.12),
        p2 = at(a + (r() - 0.5) * 0.25, 1.3 + r() * 0.4);
      const d = `M${pt(p1)}L${pt(p2)}`;
      creases += `<path d='${d}' stroke='#fff' stroke-opacity='.45' stroke-width='${f1(sw)}'/><path d='${d}' transform='translate(${f1(0.8 * k)} ${f1(0.8 * k)})' stroke='#000' stroke-opacity='.3' stroke-width='${f1(0.8 * sw)}'/>`;
    }
    const [dx, dy] = frame(uc, bd * 0.8);
    const [rx, ry] = side % 2 ? [bd * 1.2, bw * 0.75] : [bw * 0.75, bd * 1.2];
    drool += `<path d='${waterBlobPath(dx, dy, rx, ry, r)}' fill='rgb(70 74 78)' fill-opacity='.13'/>`;
    for (let i = 0; i < 8; i++) {
      const [x, y] = frame(uc + (r() - 0.5) * bw * 1.3, bd * (1 + r() * 0.9));
      drool += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1((0.8 + r() * r() * 2.6) * k)}' fill='rgb(65 70 74)' fill-opacity='${(0.08 + r() * 0.12).toFixed(3)}'/>`;
    }
  }
  out.fundo += `<g filter='url(#papel-agua)'>${drool}</g>`;
  out.relevo += `<g fill='none' stroke-linecap='round'>${creases}</g>${dents}`;
}

// ----- Baleada -----

/**
 * Levou tiros: de três a seis furos redondos, numa rajada (uma fila torta atravessando a ficha) ou
 * agrupados. Cada furo atravessa limpo, com a beirada estourada em rachinhas de estrela que também
 * vazam; em volta, a cor que saltou (a fibra aparece), o anel cinza que a bala deixa, o papel estufado
 * e, nos tiros de perto, a pólvora salpicada.
 */
function bulletHoles(W: number, H: number, k: number, sw: number, r: () => number, out: PaperArt): void {
  const kk = Math.max(0.4, k);
  const n = 3 + Math.floor(r() * 4);
  const sizes = Array.from({ length: n }, () => (4.2 + r() * 2.6) * kk);
  const spots: Pt[] = [];
  // onde cai cada tiro; nunca atrás da foto (ela fica por cima e o furo sumiria), nem em cima de outro
  const place = (at: () => Pt, R: number) => {
    let p = at();
    for (let t = 0; t < 8; t++) {
      if (p[0] < W * 0.37 && p[1] < H * 0.64) p = [W * 0.74 - p[0], p[1]];
      p = [clamp(p[0], 12 * kk, W - 12 * kk), clamp(p[1], 12 * kk, H - 12 * kk)];
      if (spots.every((q, i) => Math.hypot(q[0] - p[0], q[1] - p[1]) > (R + sizes[i]) * 2.6)) break;
      p = at();
    }
    spots.push(p);
  };
  if (r() < 0.5) {
    // a rajada: uma fila meio torta, pela direita da foto ou por baixo dela
    const low = r() < 0.35;
    const a0: Pt = low ? [W * (0.1 + r() * 0.15), H * (0.72 + r() * 0.14)] : [W * (0.4 + r() * 0.1), H * (0.2 + r() * 0.6)];
    const ang = (r() - 0.5) * (low ? 0.3 : 0.9);
    const span = low ? W * (0.55 + r() * 0.25) : W * (0.38 + r() * 0.16);
    for (let i = 0; i < n; i++) {
      const t0 = i / (n - 1);
      place(() => {
        const t = t0 + (r() - 0.5) * 0.12,
          off = (r() - 0.5) * 16 * k;
        return [a0[0] + Math.cos(ang) * span * t - Math.sin(ang) * off, a0[1] + Math.sin(ang) * span * t + Math.cos(ang) * off];
      }, sizes[i]);
    }
  } else {
    // agrupados, como quem mirou num lugar só
    const c: Pt = [W * (0.47 + r() * 0.28), H * (0.3 + r() * 0.4)];
    const spread = 36 * k;
    for (let i = 0; i < n; i++) place(() => [c[0] + (r() + r() - 1) * spread * 1.5, c[1] + (r() + r() - 1) * spread], sizes[i]);
  }
  let wipe = '',
    bulge = '',
    powder = '';
  for (const [si, [cx, cy]] of spots.entries()) {
    const R = sizes[si];
    // o furo: redondo, quase liso
    const hole: Pt[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const rad = R * (1 + (r() - 0.5) * 0.18);
      hole.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
    out.cut.push(`${poly(hole)}Z`);
    // as rachinhas em estrela, fininhas, que também vazam
    const cracks = 4 + Math.floor(r() * 4);
    const turn = r() * Math.PI * 2;
    for (let i = 0; i < cracks; i++) {
      const a = turn + (i / cracks) * Math.PI * 2 + (r() - 0.5) * 0.6;
      const L = R * (0.5 + r() * 1.2),
        w = 0.14 + r() * 0.1;
      out.cut.push(`${poly([
        [cx + Math.cos(a - w) * R * 0.85, cy + Math.sin(a - w) * R * 0.85],
        [cx + Math.cos(a) * (R + L), cy + Math.sin(a) * (R + L)],
        [cx + Math.cos(a + w) * R * 0.85, cy + Math.sin(a + w) * R * 0.85],
      ])}Z`);
    }
    // a cor que saltou em volta: um anel esfiapado onde aparece a fibra
    const chip: Pt[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      chip.push([cx + Math.cos(a) * R * (1.35 + r() * 0.55), cy + Math.sin(a) * R * (1.35 + r() * 0.55)]);
    }
    out.core.push(`${poly(chip)}Z`);
    // o anel cinza da bala, colado na beirada
    wipe += `<circle cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(R * 1.12)}' stroke-width='${f1(1.3 * kk)}'/>`;
    // o papel estufado em volta: luz de um lado, sombra do outro
    const B = R * (2.2 + r() * 0.5);
    bulge += `<circle cx='${f1(cx - 0.6 * k)}' cy='${f1(cy - 0.6 * k)}' r='${f1(B)}' stroke='#fff' stroke-opacity='.45' stroke-width='${f1(1.2 * sw)}'/><circle cx='${f1(cx + 0.8 * k)}' cy='${f1(cy + 0.8 * k)}' r='${f1(B)}' stroke='#000' stroke-opacity='.3' stroke-width='${f1(0.9 * sw)}'/>`;
    // de perto: a pólvora salpicada e o bafo de fumaça
    if (r() < 0.5) {
      powder += `<circle cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(R * 3.2)}' fill-opacity='.07'/><circle cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(R * 2.2)}' fill-opacity='.07'/>`;
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2,
          d = R * (1.8 + r() * r() * 4.5);
        powder += `<circle cx='${f1(cx + Math.cos(a) * d)}' cy='${f1(cy + Math.sin(a) * d)}' r='${f1((0.3 + r() * 0.6) * kk)}' fill-opacity='${(0.15 + r() * 0.3).toFixed(2)}'/>`;
      }
    }
  }
  out.fundo += `<g fill='rgb(52 50 48)'>${powder}</g>`;
  out.relevo += `<g fill='none'>${bulge}</g>`;
  out.frente += `<g fill='none' stroke='rgb(46 44 42)' stroke-opacity='.6'>${wipe}</g>`;
}

// ----- Traças -----

/**
 * As traças roeram: duas ou três trilhas tortas, às vezes com um galho (uma costuma entrar pela
 * beirada), feitas de centenas de mordidinhas que tiraram a cor e deixaram a fibra de baixo, encardida
 * e rendada na beirada; no meio de uma trilha elas furaram de vez. Em volta, o pozinho que deixaram e
 * uns furinhos soltos.
 */
function moths(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const kk = Math.max(0.4, k);
  const patches = 2 + (r() < 0.5 ? 1 : 0);
  let grime = '',
    frass = '';
  const trail = (p: Pt, a: number, steps: number, size: number, deep: [number, number] | null) => {
    for (let i = 0; i <= steps; i++) {
      const here = 5 + Math.floor(r() * 4);
      for (let b = 0; b < here; b++) {
        const R = (1.4 + r() * 3.2) * size;
        const x = p[0] + (r() - 0.5) * 12 * size,
          y = p[1] + (r() - 0.5) * 12 * size;
        const bite = blobPath(x, y, R, r);
        out.core.push(bite);
        grime += `<path d='${bite}'/>`;
        if (deep && i >= deep[0] && i <= deep[1] && r() < 0.6) out.cut.push(blobPath(x, y, R * (0.4 + r() * 0.25), r));
      }
      for (let f = 0; f < 3; f++)
        frass += `<circle cx='${f1(p[0] + (r() - 0.5) * 36 * size)}' cy='${f1(p[1] + (r() - 0.5) * 36 * size)}' r='${f1((0.3 + r() * 0.5) * kk)}'/>`;
      a += (r() - 0.5) * 1.2;
      p = [p[0] + Math.cos(a) * 9 * size, p[1] + Math.sin(a) * 9 * size];
    }
    return { p, a };
  };
  for (let q = 0; q < patches; q++) {
    let p: Pt, a: number;
    if (q === 0 && r() < 0.65) {
      const side = Math.floor(r() * 4),
        u = 0.15 + r() * 0.7;
      p = side === 0 ? [W * u, -2] : side === 1 ? [W + 2, H * u] : side === 2 ? [W * u, H + 2] : [-2, H * u];
      a = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][side] + (r() - 0.5) * 0.9;
    } else {
      p = [W * (0.2 + r() * 0.6), H * (0.2 + r() * 0.6)];
      a = r() * Math.PI * 2;
    }
    const steps = 7 + Math.floor(r() * 8);
    const size = (0.85 + r() * 0.45) * k;
    const d0 = Math.floor(r() * steps * 0.5);
    const deep: [number, number] | null = r() < 0.8 ? [d0, d0 + Math.floor(steps * (0.2 + r() * 0.3))] : null;
    const half = Math.floor(steps / 2);
    const mid = trail(p, a, half, size, deep);
    trail(mid.p, mid.a, steps - half, size, deep && [deep[0] - half, deep[1] - half]);
    // um galho que sai do meio da trilha
    if (r() < 0.6) trail(mid.p, mid.a + (r() < 0.5 ? -1 : 1) * (0.9 + r() * 0.6), 2 + Math.floor(r() * 4), size * 0.85, null);
  }
  const pins = 4 + Math.floor(r() * 5);
  for (let i = 0; i < pins; i++) {
    const x = W * (0.08 + r() * 0.84),
      y = H * (0.08 + r() * 0.84),
      R = (0.9 + r() * 1.1) * kk;
    out.cut.push(blobPath(x, y, R, r));
    grime += `<path d='${blobPath(x, y, R + 1.2 * kk, r)}'/>`;
  }
  out.fundo += `<g fill='rgb(48 38 28)' fill-opacity='.55'>${frass}</g>`;
  // a fibra que ficou por baixo da cor não é branca de papelaria: é encardida (por cima do miolo)
  out.fita += `<g opacity='.28' fill='rgb(120 98 66)'>${grime}</g>`;
}

// ----- Mofada -----

/**
 * Esquecida no porão: a umidade entrou por uma beirada e deixou a maré amarelada, e perto dela
 * nasceram colônias de mofo de tamanhos e cores diferentes (verde, preto, azulado, oliva, uma ou outra
 * branca e felpuda), com o anel, o miolo pintado e os esporos em volta; pintinhas de ferrugem por perto.
 */
function mould(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const kk = Math.max(0.4, k);
  const side = Math.floor(r() * 4);
  const spot = (reach: number): Pt => {
    const u = 0.08 + r() * 0.84,
      v = Math.min(0.92, (Math.abs(r() + r() + r() - 1.5) / 1.5) * reach + 0.04);
    return side === 0 ? [W * u, H * v] : side === 1 ? [W * (1 - v), H * u] : side === 2 ? [W * u, H * (1 - v)] : [W * v, H * u];
  };
  const s = Math.min(W, H);
  const [tx, ty] = side === 0 ? [W / 2, -s * 0.25] : side === 1 ? [W + s * 0.25, H / 2] : side === 2 ? [W / 2, H + s * 0.25] : [-s * 0.25, H / 2];
  const [rx, ry] = side % 2 ? [s * 0.7, H * 0.75] : [W * 0.62, s * 0.7];
  const tide = waterBlobPath(tx, ty, rx, ry, r);
  // a maré tem a mesma força até a beirada: sem contorno mais escuro
  let fundo = `<path d='${tide}' fill='rgb(150 128 76)' fill-opacity='.13' filter='url(#papel-agua)'/>`;
  let light = '';
  const TONES = [
    ['rgb(74 96 58)', 'rgb(40 54 34)'],
    ['rgb(52 54 50)', 'rgb(26 28 26)'],
    ['rgb(66 94 96)', 'rgb(30 48 50)'],
    ['rgb(110 104 52)', 'rgb(62 58 28)'],
  ];
  const colonies = 5 + Math.floor(r() * 5);
  for (let c = 0; c < colonies; c++) {
    const [x, y] = spot(0.75);
    const R = (8 + Math.pow(r(), 1.6) * 36) * k;
    const white = r() < 0.25;
    const [tone, dark] = TONES[Math.floor(r() * TONES.length)];
    const dots = (n: number, from: number, to: number, fill: string, op: () => number, size: () => number) => {
      let g = '';
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2,
          d = R * (from + (to - from) * Math.pow(r(), 0.8));
        g += `<circle cx='${f1(x + Math.cos(a) * d)}' cy='${f1(y + Math.sin(a) * d)}' r='${f1(size())}' fill='${fill}' fill-opacity='${op().toFixed(2)}'/>`;
      }
      return g;
    };
    let g = `<path d='${blobPath(x, y, R * 1.7, r)}' fill='rgb(120 112 64)' fill-opacity='.13'/>`;
    if (white) {
      light +=
        `<g filter='url(#papel-mofo)'><path d='${blobPath(x, y, R, r)}' fill='#fbfbf5' fill-opacity='.55'/>` +
        dots(Math.round(12 + (R / kk) * 1.2), 0, 1.1, '#fff', () => 0.4 + r() * 0.4, () => (0.6 + r() * 1.4) * kk) +
        `</g>`;
    } else {
      g +=
        `<path d='${blobPath(x, y, R, r)}' fill='${tone}' fill-opacity='.34'/>` +
        `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(R * 0.7)}' fill='none' stroke='${tone}' stroke-opacity='.42' stroke-width='${f1(R * 0.2)}'/>` +
        dots(Math.round(14 + (R / kk) * 2.2), 0, 0.9, dark, () => 0.4 + r() * 0.45, () => (0.5 + r() * 1.4) * kk);
    }
    g += dots(12, 1, 1.9, dark, () => 0.25 + r() * 0.25, () => (0.3 + r() * 0.5) * kk);
    fundo += `<g filter='url(#papel-mofo)'>${g}</g>`;
  }
  let fox = '';
  const n = 18 + Math.floor(r() * 14);
  for (let i = 0; i < n; i++) {
    const [x, y] = spot(1);
    const R = (0.8 + Math.pow(r(), 2) * 4.5) * kk;
    fox += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(R)}' fill='rgb(160 100 48)' fill-opacity='${(0.18 + r() * 0.3).toFixed(2)}'/>`;
    if (R > 2.5 * kk) fox += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(R * 0.45)}' fill='rgb(130 74 30)' fill-opacity='.3'/>`;
  }
  out.fundo += `${fundo}<g filter='url(#papel-mancha)'>${fox}</g>`;
  out.clareia += light;
}

// ----- Pisada -----

/** O contorno de uma sola de tênis (pé direito), do bico (0) ao calcanhar (1), em comprimentos de sola. */
const SOLE: Pt[] = [
  [0.02, 0], [0.12, 0.015], [0.19, 0.05], [0.222, 0.11], [0.218, 0.2], [0.2, 0.3], [0.172, 0.4], [0.152, 0.5], [0.155, 0.6], [0.165, 0.7],
  [0.166, 0.8], [0.156, 0.9], [0.12, 0.962], [0.05, 0.996], [-0.03, 1], [-0.1, 0.985], [-0.142, 0.94], [-0.156, 0.86], [-0.15, 0.76], [-0.124, 0.665],
  [-0.092, 0.585], [-0.1, 0.5], [-0.138, 0.42], [-0.168, 0.32], [-0.182, 0.22], [-0.172, 0.12], [-0.134, 0.052], [-0.07, 0.012],
];

/**
 * Caiu no chão e levou uma pisada: a sola de um tênis, bem maior que a ficha, com a frente em cima
 * dela (o zigue-zague da frente, os sulcos de dobrar, o arco quase sem marca, os gomos do salto),
 * em terra seca que pegou mais onde o pé pesou. Uns grãos de terra soltos em volta.
 */
function shoePrint(W: number, H: number, k: number, r: () => number, uid: string, out: PaperArt): void {
  const Ls = (1.2 + r() * 0.3) * Math.max(W, H);
  const ang = r() * Math.PI * 2;
  const A: Pt = [W * (0.3 + r() * 0.4), H * (0.3 + r() * 0.4)];
  const ca = Math.cos(ang),
    sa = Math.sin(ang);
  const mirror = r() < 0.5 ? -1 : 1;
  const T = (u: number, v: number): Pt => {
    const x = u * mirror * Ls,
      y = (v - 0.27) * Ls;
    return [A[0] + x * ca - y * sa, A[1] + x * sa + y * ca];
  };
  const outline = SOLE.map(([u, v]) => T(u, v));
  const sole = `${smooth([...outline, outline[0]])}Z`;
  const lw = Ls * 0.0105;
  let tread = `<path d='${sole}' fill='rgb(110 90 64)' fill-opacity='.14' stroke='none'/><path d='${sole}' fill='none' stroke-width='${f1(Ls * 0.05)}'/>`;
  for (let v = 0.045; v < 0.5; v += 0.029) {
    if ((v > 0.19 && v < 0.225) || (v > 0.335 && v < 0.37)) continue;
    const row: Pt[] = [];
    for (let u = -0.24, i = 0; u <= 0.24; u += 0.024, i++) row.push(T(u, v + (i % 2 ? 0.01 : -0.01)));
    tread += `<path d='${poly(row)}' fill='none' stroke-width='${f1(lw)}'/>`;
  }
  for (let v = 0.52; v < 0.62; v += 0.034) tread += `<path d='${poly([T(-0.07, v), T(0.1, v)])}' fill='none' stroke-width='${f1(lw * 0.8)}' stroke-opacity='.45'/>`;
  for (let v = 0.66, row = 0; v < 0.97; v += 0.036, row++)
    for (let u = -0.2 + (row % 2) * 0.021; u < 0.2; u += 0.042) {
      const [x, y] = T(u, v);
      tread += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(Ls * 0.013)}' stroke='none'/>`;
    }
  let grit = '';
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2,
      d = Ls * (0.1 + r() * 0.35);
    grit += `<circle cx='${f1(A[0] + Math.cos(a) * d)}' cy='${f1(A[1] + Math.sin(a) * d)}' r='${f1((0.3 + r() * 0.8) * Math.max(0.4, k))}' fill-opacity='${(0.3 + r() * 0.3).toFixed(2)}'/>`;
  }
  const id = `${uid}-sola`;
  out.fundo +=
    `<defs><clipPath id='${id}'><path d='${sole}'/></clipPath></defs>` +
    `<g filter='url(#papel-poeira)' opacity='.66'><g clip-path='url(#${id})' fill='rgb(80 62 44)' stroke='rgb(80 62 44)' stroke-linejoin='round'>${tread}</g></g>` +
    `<g fill='rgb(80 62 44)'>${grit}</g>`;
}

// ----- Pegadas de gato -----

/** Uma pata de gato, uma pata de largura, com os dedos para cima (−y). */
const PAW =
  `<path d='M-.3 .05C-.3 -.12 -.12 -.14 0 -.06C.12 -.14 .3 -.12 .3 .05C.36 .2 .32 .36 .2 .4C.12 .44 .06 .36 0 .42C-.06 .36 -.12 .44 -.2 .4C-.32 .36 -.36 .2 -.3 .05Z'/>` +
  `<ellipse cx='-.38' cy='-.24' rx='.11' ry='.145' transform='rotate(-28 -.38 -.24)'/>` +
  `<ellipse cx='-.14' cy='-.43' rx='.115' ry='.15' transform='rotate(-9 -.14 -.43)'/>` +
  `<ellipse cx='.14' cy='-.43' rx='.115' ry='.15' transform='rotate(9 .14 -.43)'/>` +
  `<ellipse cx='.38' cy='-.24' rx='.11' ry='.145' transform='rotate(28 .38 -.24)'/>`;

/**
 * Um gato de pata suja de terra atravessou a ficha: pegadas alternadas numa linha, a lama acabando
 * aos poucos, cada pata um tanto virada; de vez em quando a de trás pisou quase em cima da da frente.
 */
function pawPrints(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const size = r();
  const P = (24 + size * 7) * k;
  // Às vezes o gato só cortou caminho por uma quina (nunca a de cima à esquerda, atrás da foto).
  // A escolha sai do mesmo sorteio do tamanho: as trilhas que atravessam a ficha ficam como eram.
  const corner = (size * 997) % 1 < 0.4;
  let ang: number, c: Pt, reach: number;
  if (!corner) {
    ang = r() * Math.PI * 2;
    c = [W * (0.4 + r() * 0.2), H * (0.4 + r() * 0.2)];
    reach = Math.hypot(W, H) / 2 + P;
  } else {
    const [cx, cy] = ([[W, 0], [W, H], [0, H]] as const)[Math.floor(r() * 3)];
    const sx = cx ? -1 : 1,
      sy = cy ? -1 : 1;
    const u = Math.min(W * 0.55, (80 + r() * 60) * k),
      v = Math.min(H * 0.6, (70 + r() * 50) * k);
    // de uma beirada até a vizinha, passando por dentro da quina
    const a: Pt = [cx + sx * u, cy],
      b: Pt = [cx, cy + sy * v];
    const [from, to] = r() < 0.5 ? [a, b] : [b, a];
    ang = Math.atan2(to[1] - from[1], to[0] - from[0]);
    c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    reach = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + P * 0.6;
  }
  const D: Pt = [Math.cos(ang), Math.sin(ang)],
    N: Pt = [-D[1], D[0]];
  const stride = P * (1.55 + r() * 0.3);
  const rot = (ang * 180) / Math.PI + 90;
  let prints = '';
  for (let s = -reach + r() * stride, i = 0; s < reach; s += stride * (0.92 + r() * 0.16), i++) {
    const side = i % 2 ? 1 : -1;
    const x = c[0] + D[0] * s + N[0] * side * P * 0.45,
      y = c[1] + D[1] * s + N[1] * side * P * 0.45;
    const t = (s + reach) / (2 * reach);
    const op = (0.85 - t * 0.45) * (0.85 + r() * 0.15);
    const a = rot + (r() - 0.5) * 16 + side * 4;
    const sc = P * (0.94 + r() * 0.12);
    const smear = r() < 0.22;
    if (x < -P || x > W + P || y < -P || y > H + P) continue;
    prints += `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(a)}) scale(${f1(sc)})' fill-opacity='${op.toFixed(2)}'>${PAW}</g>`;
    if (smear)
      prints += `<g transform='translate(${f1(x + D[0] * P * 0.14)} ${f1(y + D[1] * P * 0.14)}) rotate(${f1(a + 6)}) scale(${f1(sc * 0.95)})' fill-opacity='${(op * 0.45).toFixed(2)}'>${PAW}</g>`;
  }
  out.fundo += `<g filter='url(#papel-lama)' fill='rgb(92 64 40)'>${prints}</g>`;
}

// ----- Fita arrancada -----

/**
 * Estava presa na parede com fita crepe nas quinas (as de cima, ou três, ou as quatro) e, ao tirar,
 * a fita levou a cor da cartolina junto: às vezes o pedaço inteiro, às vezes só a metade de fora,
 * rasgada ao comprido. Onde a cor ficou, ficou a cola encardida e a sujeira na beirada da fita. Uma
 * ou outra fita ainda está lá, e passa da ficha para a parede.
 */
function tapePulled(W: number, H: number, k: number, sw: number, r: () => number, uid: string, out: PaperArt): void {
  const all: Corner[] = ['tl', 'tr', 'br', 'bl'];
  const n = 2 + Math.floor(r() * 3);
  const skip = Math.floor(r() * 4);
  const pair = r();
  const chosen: Corner[] = n === 2 ? (pair < 0.7 ? ['tl', 'tr'] : pair < 0.85 ? ['tl', 'br'] : ['tr', 'bl']) : n === 3 ? all.filter((_, i) => i !== skip) : all;
  const keep = n >= 3 && r() < 0.6 ? Math.floor(r() * n) : -1;
  const at = (c: Corner, u: number, v: number): Pt => [c === 'tl' || c === 'bl' ? u : W - u, c === 'tl' || c === 'tr' ? v : H - v];
  let residue = '',
    tapes = '',
    bits = '';
  chosen.forEach((c, idx) => {
    const len = (78 + r() * 22) * k,
      wid = (20 + r() * 5) * k;
    const d = (15 + r() * 8) * k;
    const [cx, cy] = at(c, d * (0.85 + r() * 0.3), d * (0.85 + r() * 0.3));
    const ang = (((c === 'tl' || c === 'br' ? -45 : 45) + (r() - 0.5) * 26) * Math.PI) / 180;
    const ux: Pt = [Math.cos(ang), Math.sin(ang)],
      vy: Pt = [-ux[1], ux[0]];
    const world = ([u, v]: Pt): Pt => [cx + ux[0] * u + vy[0] * v, cy + ux[1] * u + vy[1] * v];
    // as pontas rasgadas à mão, em zigue-zague miúdo
    const end = (u0: number, dir: 1 | -1): Pt[] => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 7; i++) pts.push([u0 + dir * (i % 2 ? 1.3 : -0.4) * k + (r() - 0.5) * 0.8 * k, -wid / 2 + (wid * i) / 7]);
      return pts;
    };
    const outline = [...end(len / 2, 1), ...end(-len / 2, -1).reverse()];
    const shape = `${poly(outline.map(world))}Z`;
    if (idx === keep) {
      let crinkles = '';
      for (let u = -len / 2 + 2 * k; u < len / 2 - 1 * k; u += (1.8 + r() * 1.2) * k) {
        const u2 = u + (r() - 0.5) * 1.6 * k;
        crinkles += `<path d='M${pt(world([u, -wid / 2 + 0.5 * k]))}L${pt(world([u2, wid / 2 - 0.5 * k]))}' stroke-opacity='${(0.1 + r() * 0.2).toFixed(2)}'/>`;
      }
      tapes +=
        `<path d='${shape}' transform='translate(${f1(0.6 * k)} ${f1(1.4 * k)})' fill='#000' fill-opacity='.22' filter='url(#papel-fio)'/>` +
        `<path d='${shape}' fill='rgb(228 213 170)' fill-opacity='.93'/>` +
        `<g stroke='rgb(150 130 88)' stroke-width='${f1(0.5 * sw)}'>${crinkles}</g>` +
        `<path d='${shape}' fill='url(#${uid}-crepe)'/>`;
      return;
    }
    const corner = at(c, 0, 0);
    const toCorner = Math.sign((corner[0] - cx) * vy[0] + (corner[1] - cy) * vy[1]) || 1;
    let region: Pt[];
    if (r() < 0.45) region = roughen(outline, 3 * k, 0.7 * k, r);
    else {
      // soltou só a metade de fora; a de dentro rasgou ao comprido, no meio da fita
      const cutV = -toCorner * wid * (0.05 + r() * 0.3);
      const ph = r() * 6;
      const tear: Pt[] = [];
      for (let u = -len / 2; u <= len / 2; u += 3 * k) tear.push([u, cutV + (r() - 0.5) * 3 * k + Math.sin(u / (9 * k) + ph) * 1.5 * k]);
      region = [...tear, [len / 2, (toCorner * wid) / 2], [-len / 2, (toCorner * wid) / 2]];
      if (r() < 0.5) {
        const [bx, by] = world([(r() - 0.5) * len * 0.3, cutV - toCorner * 2 * k]);
        const s = (2.5 + r() * 2.5) * k;
        bits += `<path d='M${f1(bx - s)} ${f1(by)}L${f1(bx + s * 0.6)} ${f1(by - s * 0.8)}L${f1(bx + s)} ${f1(by + s * 0.5)}Z'/>`;
      }
    }
    out.core.push(`${poly(region.map(world))}Z`);
    residue += `<path d='${shape}' fill='rgb(170 150 100)' fill-opacity='.14' stroke='rgb(96 84 60)' stroke-opacity='.24' stroke-width='${f1(0.9 * sw)}'/>`;
  });
  out.fundo += residue;
  if (bits) out.fita += `<g fill='rgb(228 213 170)' fill-opacity='.9'>${bits}</g>`;
  if (tapes)
    out.fita += `<defs><linearGradient id='${uid}-crepe' x1='0' y1='0' x2='1' y2='1'><stop offset='.2' stop-color='#fff' stop-opacity='0'/><stop offset='.45' stop-color='#fff' stop-opacity='.3'/><stop offset='.62' stop-color='#fff' stop-opacity='0'/></linearGradient></defs>${tapes}`;
}

// ----- Glitch -----

/** As cores do sinal quebrado: magenta, ciano, verde de fósforo, branco e preto. */
const GLITCH = ['#ff2bd6', '#00e5ff', '#39ff14', '#ffffff', '#101014', '#ffe600'];

/**
 * O sinal falhou no meio da ficha: faixas deitadas escorregaram para um lado (a beirada de onde a faixa
 * saiu fica vazia), cada uma tingida de uma cor do RGB, com a franja vermelha e ciano dos canais
 * separados, riscos de varredura e um borrão de pixels arrastados. O tingido vai por cima de tudo,
 * até da foto: é a tela que falhou, não o papel.
 */
function glitchBands(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const kk = Math.max(0.45, k);
  const n = 4 + Math.floor(r() * 4);
  let tint = '',
    fringe = '',
    smear = '';
  const bands: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const h = (3 + r() * r() * 22) * kk;
    const y = clamp(H * (0.05 + r() * 0.9), 2, H - h - 2);
    bands.push([y, h]);
    // a faixa escorregou: a beirada de onde ela saiu ficou sem papel
    const dx = (r() < 0.5 ? -1 : 1) * (4 + r() * 18) * kk;
    if (r() < 0.75) out.cut.push(dx > 0 ? `M-6 ${f1(y)}H${f1(dx)}V${f1(y + h)}H-6Z` : `M${f1(W + dx)} ${f1(y)}H${f1(W + 6)}V${f1(y + h)}H${f1(W + dx)}Z`);
    const col = GLITCH[Math.floor(r() * GLITCH.length)];
    tint += `<rect x='0' y='${f1(y)}' width='${f1(W)}' height='${f1(h)}' fill='${col}' fill-opacity='${(0.14 + r() * 0.2).toFixed(2)}'/>`;
    // os canais separados: o vermelho em cima, o ciano embaixo, um tiquinho deslocados
    const fw = Math.max(1, 1.2 * kk);
    fringe += `<rect x='${f1(Math.max(0, dx))}' y='${f1(y - fw)}' width='${f1(W)}' height='${f1(fw)}' fill='#ff1f3d' fill-opacity='.55'/><rect x='${f1(Math.min(0, dx))}' y='${f1(y + h)}' width='${f1(W)}' height='${f1(fw)}' fill='#00e5ff' fill-opacity='.55'/>`;
    // os pixels arrastados: tracinhos de cor correndo deitados dentro da faixa
    if (r() < 0.6) {
      let x = r() * W * 0.4;
      while (x < W) {
        const w = (3 + r() * 30) * kk;
        const c = GLITCH[Math.floor(r() * GLITCH.length)];
        smear += `<rect x='${f1(x)}' y='${f1(y + r() * h * 0.5)}' width='${f1(w)}' height='${f1(Math.max(1, h * (0.2 + r() * 0.5)))}' fill='${c}' fill-opacity='${(0.25 + r() * 0.35).toFixed(2)}'/>`;
        x += w + r() * 40 * kk;
      }
    }
  }
  // os riscos de varredura: linhas finas e claras atravessando a ficha
  let scan = '';
  for (let i = 0; i < 6; i++) {
    const y = r() * H;
    scan += `<rect x='${f1(r() * W * 0.3)}' y='${f1(y)}' width='${f1(W * (0.3 + r() * 0.7))}' height='${f1(Math.max(0.6, 0.8 * kk))}' fill='#fff' fill-opacity='${(0.35 + r() * 0.4).toFixed(2)}'/>`;
  }
  // um rasgo fino de verdade, de uma beirada até o meio: a imagem partiu
  if (r() < 0.6) {
    const y = H * (0.25 + r() * 0.5),
      from = r() < 0.5,
      len = W * (0.35 + r() * 0.35);
    const th = Math.max(1, 1.4 * kk);
    out.cut.push(from ? `M-6 ${f1(y)}H${f1(len)}V${f1(y + th)}H-6Z` : `M${f1(W - len)} ${f1(y)}H${f1(W + 6)}V${f1(y + th)}H${f1(W - len)}Z`);
  }
  out.topo = (out.topo ?? '') + `<g>${tint}</g><g>${smear}</g><g>${fringe}${scan}</g>`;
}

// ----- Arquivo corrompido -----

/** Os bytes que sobraram: verde e magenta de JPEG quebrado, cinzas e o resto da imagem. */
const CORRUPT = ['#00ff6a', '#ff00c8', '#7a7a7a', '#2a2a2a', '#c8c8c8', '#00b3ff', '#ffdd00', '#ff3b30', '#6b3fa0', '#1e7a4a'];

/**
 * O arquivo corrompeu: num canto a imagem sumiu em blocos (a beirada em degraus, como os quadradões do
 * JPEG estragado), em volta os blocos que sobraram vêm com cor errada e alguns escorrem em listras, e
 * por cima ficam umas linhas de zeros e uns e o código do erro. Uns blocos soltos sumiram mais longe.
 */
function corruptBlocks(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const kk = Math.max(0.45, k);
  const b = 8 * kk;
  const cols = Math.ceil(W / b),
    rows = Math.ceil(H / b);
  // o canto que sumiu: nunca o de cima à esquerda, escondido atrás da foto
  const corner = Math.floor(r() * 3);
  const cx = corner === 1 ? 0 : cols,
    cy = corner === 0 ? 0 : rows;
  const rx = cols * (0.28 + r() * 0.16),
    ry = rows * (0.38 + r() * 0.2);
  let gone = '',
    junk = '',
    smear = '';
  const lost = new Set<string>();
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      // a distância ao canto, medida em degraus (quadrados, não redonda) e tremida
      const d = Math.max(Math.abs(i + 0.5 - cx) / rx, Math.abs(j + 0.5 - cy) / ry) + (r() - 0.5) * 0.35;
      const x = i * b,
        y = j * b;
      if (d < 0.78 || (d > 1.4 && d < 2.4 && r() < 0.006)) {
        lost.add(`${i},${j}`);
        gone += `M${f1(x - (i === 0 ? 6 : 0))} ${f1(y - (j === 0 ? 6 : 0))}H${f1(x + b + (i === cols - 1 ? 6 : 0))}V${f1(y + b + (j === rows - 1 ? 6 : 0))}H${f1(x - (i === 0 ? 6 : 0))}Z`;
      } else if (d < 1.15 && r() < 0.55) {
        const c = CORRUPT[Math.floor(r() * CORRUPT.length)];
        junk += `<rect x='${f1(x)}' y='${f1(y)}' width='${f1(b)}' height='${f1(b)}' fill='${c}' fill-opacity='${(0.45 + r() * 0.45).toFixed(2)}'/>`;
        // o bloco escorreu: a mesma cor repetida em listras até a beirada do estrago
        if (r() < 0.18) {
          const dir = cx === 0 ? -1 : 1;
          const len = (2 + Math.floor(r() * 6)) * b;
          const sx = dir > 0 ? x + b : x - len;
          for (let s = 0; s < len; s += 2 * kk) smear += `<rect x='${f1(sx + s)}' y='${f1(y)}' width='${f1(kk)}' height='${f1(b)}' fill='${c}' fill-opacity='.5'/>`;
        }
      }
    }
  out.cut.push(gone);
  // o resto da imagem errada: um bloco ou outro fora do lugar, mais longe
  for (let t = 0; t < 14; t++) {
    const i = Math.floor(r() * cols),
      j = Math.floor(r() * rows);
    if (lost.has(`${i},${j}`) || (i < cols * 0.3 && j < rows * 0.5)) continue;
    junk += `<rect x='${f1(i * b)}' y='${f1(j * b)}' width='${f1(b)}' height='${f1(b)}' fill='${CORRUPT[Math.floor(r() * CORRUPT.length)]}' fill-opacity='${(0.35 + r() * 0.4).toFixed(2)}'/>`;
  }
  // os zeros e uns, junto do estrago, em fileiras de bytes
  const fs = 7 * kk;
  let text = '';
  const lines = 3 + Math.floor(r() * 3);
  const tx = corner === 1 ? Math.max(rx * b + 4 * kk, W * 0.06) : W * (0.08 + r() * 0.1);
  const ty0 = corner === 0 ? Math.min(H - lines * fs * 1.3 - 4, ry * b + 6 * kk) : Math.max(4 * kk, H - ry * b - lines * fs * 1.3 - 10 * kk);
  for (let l = 0; l < lines; l++) {
    let s = '';
    const bytes = 2 + Math.floor(r() * 3);
    for (let n = 0; n < bytes; n++) {
      for (let i = 0; i < 8; i++) s += r() < 0.5 ? '0' : '1';
      s += ' ';
    }
    text += `<text x='${f1(tx)}' y='${f1(ty0 + (l + 1) * fs * 1.3)}'>${s.trim()}</text>`;
  }
  const code = ['0xC0DE', '0xDEAD', '0x0BAD', '0xFFFF', '0x00F1'][Math.floor(r() * 5)];
  text += `<text x='${f1(tx)}' y='${f1(ty0 + (lines + 1) * fs * 1.3 + 2 * kk)}' font-weight='700'>ERRO ${code}</text>`;
  out.frente += `<g>${smear}</g><g>${junk}</g><g fill='#111' fill-opacity='.6' font-family='ui-monospace, Consolas, "Courier New", monospace' font-size='${f1(fs)}' letter-spacing='${f1(0.3 * kk)}'>${text}</g>`;
}

// ----- Desintegrando em pixels -----

/**
 * A ficha está sumindo em pixels por uma beirada (a da direita, a de baixo ou a quina entre elas): perto
 * dela quase não sobra papel, e o estrago rareia para dentro em quadradinhos. Os pedaços que soltaram
 * saem flutuando para fora, cada vez menores e mais apagados.
 */
function pixelDissolve(W: number, H: number, k: number, r: () => number, out: PaperArt): void {
  const kk = Math.max(0.45, k);
  const b = (5.5 + r() * 1.5) * kk;
  const way = Math.floor(r() * 3); // 0: direita, 1: embaixo, 2: a quina de baixo à direita
  const depth = (way === 1 ? H * 0.38 : W * 0.26) * (0.8 + r() * 0.4);
  const cols = Math.ceil(W / b),
    rows = Math.ceil(H / b);
  let gone = '',
    loose = '';
  // a distância de cada quadradinho à beirada que some
  const dist = (x: number, y: number) => (way === 0 ? W - x : way === 1 ? H - y : Math.min(W - x, H - y) * 0.75 + Math.max(0, Math.hypot(W - x, H - y) - Math.min(W - x, H - y)) * 0.25);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = i * b,
        y = j * b;
      const t = 1 - dist(x + b / 2, y + b / 2) / depth;
      if (t <= 0) continue;
      const p = Math.pow(t, 0.8) * 1.1;
      if (r() < p) {
        gone += `M${f1(x)} ${f1(y)}H${f1(x + b + (i === cols - 1 ? 6 : 0))}V${f1(y + b + (j === rows - 1 ? 6 : 0))}H${f1(x)}Z`;
        // uns soltaram agorinha: o quadradinho ainda está ali perto, levantando, com sombra
        if (r() < 0.12 * t) {
          const s = b * (0.55 + r() * 0.4);
          const ox = x + (r() - 0.3) * b * 1.5,
            oy = y - r() * b * 1.5;
          loose += `<rect x='${f1(ox + 1.2 * kk)}' y='${f1(oy + 2 * kk)}' width='${f1(s)}' height='${f1(s)}' fill='#000' fill-opacity='.22'/><rect x='${f1(ox)}' y='${f1(oy)}' width='${f1(s)}' height='${f1(s)}' style='fill: var(--stock)'/>`;
        }
      }
    }
  out.cut.push(gone);
  // os que já saíram: flutuando para fora da ficha, para longe da beirada, apagando
  const n = 14 + Math.floor(r() * 10);
  for (let i = 0; i < n; i++) {
    const far = r();
    const s = b * (0.9 - far * 0.6);
    let x: number, y: number;
    if (way === 0 || (way === 2 && r() < 0.5)) {
      x = W + 2 * kk + far * 46 * kk + r() * 6 * kk;
      y = H * (way === 2 ? 0.45 + r() * 0.55 : 0.08 + r() * 0.84) - far * 14 * kk;
    } else {
      x = W * (way === 2 ? 0.45 + r() * 0.55 : 0.06 + r() * 0.88) + far * 10 * kk;
      y = H + 2 * kk + far * 30 * kk + r() * 5 * kk - far * far * 50 * kk;
      if (y < H + 2 * kk) x = Math.max(x, W + 2 * kk + r() * 10 * kk);
    }
    const op = (1 - far * 0.75).toFixed(2);
    loose += `<g opacity='${op}'><rect x='${f1(x + 1.2 * kk)}' y='${f1(y + 2 * kk)}' width='${f1(s)}' height='${f1(s)}' fill='#000' fill-opacity='.25'/><rect x='${f1(x)}' y='${f1(y)}' width='${f1(s)}' height='${f1(s)}' style='fill: var(--stock)'/></g>`;
  }
  out.fita += loose;
}

/**
 * As variáveis de CSS do papel e da estampa (`.cartolina`, `.papel`, a faixa das fichas abertas):
 * a textura por cima, a estampa impressa no meio e a fibra por baixo (que a Lisa não tem).
 */
export function paperStyle(paper: Paper | undefined, pattern: Pattern | undefined, look?: PatternLook, seed?: number | null): Record<string, string | null> {
  const t = textureOf(paper);
  const tile = pattern ? patternTile(pattern, look, seed ?? undefined) : null;
  return {
    '--textura': t ? t.img : null,
    '--textura-tam': t ? t.size : null,
    '--textura-mistura': t ? t.blend : null,
    '--estampa': tile ? tile.url : null,
    // o lado do ladrilho muda com o espaço e o tamanho; as amostras do editor o encolhem (--estampa-zoom)
    '--estampa-lado': tile ? `${tile.side}px` : null,
    '--grao': paper === 'lisa' ? 'none' : null,
  };
}

/**
 * O papel nas cartolinas fora do comum. Nas claras (amarelo, verde, azul, branco) só a fibra suave
 * entra de reforço (`--grao-realce`; a Lisa, que não tem fibra, fica sem). Nas escuras o soft-light da
 * textura pesa demais: ela sai (`--textura-escura`) e volta fraca, em hard-light, por cima de um cinza
 * do meio (`--realce-escuro`). O perolado (que é cor, não relevo), o glitter e o reciclado ficam como
 * estão. Fora de `paperStyle` de propósito: as digitais dele estão congeladas.
 */
export function accentStyle(paper: Paper | undefined): Record<string, string | null> {
  const t = textureOf(paper);
  // a Lisa não tem fibra: nem a do reforço
  const grain = paper === 'lisa' ? 'none' : null;
  if (!t || t.blend !== 'soft-light' || paper === 'perolado') return { '--realce-escuro': null, '--textura-escura': null, '--grao-realce': grain };
  const [w, h] = t.size.split(' ').map((v) => parseFloat(v));
  // a textura vai num atributo entre aspas simples: as dela mesma são escapadas, senão a imagem quebra
  const inner = t.img.slice(5, -2).replace(/'/g, '%27');
  const wrap = (op: number) => svgUrl(w, h, `<rect width='100%' height='100%' fill='#808080'/><image href='${inner}' width='${w}' height='${h}' opacity='${op}'/>`);
  return { '--realce-escuro': wrap(0.2), '--textura-escura': 'none', '--grao-realce': grain };
}

const lightTiles = new Map<string, string>();

/**
 * A estampa da cartolina escura: o mesmo ladrilho, com a tinta branca em vez da preta (os furos do
 * motivo cheio continuam furos). No escuro o preto multiplicado some; o branco, em screen (ver
 * `--estampa-mistura` no styles.scss), clareia o papel tom sobre tom. Fora de `paperStyle` de
 * propósito: as digitais dele estão congeladas.
 */
export function lightPattern(pattern: Pattern, look?: PatternLook, seed?: number | null): string {
  const url = patternTile(pattern, look, seed ?? undefined).url;
  const hit = lightTiles.get(url);
  if (hit) return hit;
  const head = 'url("data:image/svg+xml,';
  const svg = decodeURIComponent(url.slice(head.length, -2));
  // só a tinta (.l, .s, .c) vira branca; a máscara dos furos (.m) continua preta
  const light = svg.replace(/<style>(.*?)<\/style>/, (_, css: string) =>
    `<style>${css.replace(/([^{}]+)\{([^}]*)\}/g, (rule: string, sel: string, body: string) => (sel.trim().startsWith('.m') ? rule : `${sel}{${body.replace(/#000/g, '#fff')}}`))}</style>`,
  );
  const out = `${head}${encodeURIComponent(light)}")`;
  lightTiles.set(url, out);
  return out;
}

/**
 * As variáveis do papel, da estampa e do reforço das cartolinas claras, para o `[style]` das fichas.
 * Na cartolina escura (`dark`), a estampa também sai em branco (`--estampa-clara`).
 */
export function paperVars(paper: Paper | undefined, pattern: Pattern | undefined, look?: PatternLook, seed?: number | null, dark = false): Record<string, string | null> {
  return { ...paperStyle(paper, pattern, look, seed), ...accentStyle(paper), '--estampa-clara': dark && pattern ? lightPattern(pattern, look, seed) : null };
}
