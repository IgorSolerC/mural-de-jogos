/**
 * Os desenhos do papel da ficha: as estampas de papelaria (um ladrilho que se repete), os rabiscos
 * que tomam a ficha inteira e os estragos. Tudo sai em SVG, em px da ficha, a partir do id: a mesma
 * ficha rasga sempre igual. Nada do que a pessoa escreve entra aqui, só desenhos nossos e números.
 */
import { DEFAULT_LOOK, DEFAULT_SCRIBBLE_INK, Damage, Paper, Pattern, PatternLook, SCRIBBLE_INK, Scribble, f1, hash, rng, svgUrl, textureOf } from './paper';

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

/**
 * Um motivo de estampa, num quadro de 40×40. `sil` é o corpo; `det` são os detalhes (olhos, nariz):
 * na versão de contorno saem em tinta, na versão cheia viram furos; `extra` sai sempre em traço
 * (bigodes, pernas, o anel do planeta). `c` é o miudinho que vai entre um e outro (a patinha), 20×20.
 */
interface Motif {
  sil: string;
  det?: string;
  extra?: string;
  c: string;
}

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
  const outline = `<g class='l'>${m.sil}${m.det ?? ''}${m.extra ?? ''}</g>`;
  // os furos do motivo cheio: o papel aparece nos olhos, no nariz, na boca
  const holes = m.det ? `<g class='m'>${m.det}</g>` : '';
  const filled = `<g mask='url(#furos)'><g class='s'>${m.sil}</g></g><g class='l'>${m.extra ?? ''}</g>`;
  let body = '';
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const big = (i + j) % 2 === 0;
      const cx = wrap((i + 1) * cell + px + (r() - 0.5) * 2 * mess * 0.3 * cell),
        cy = wrap((j + 1) * cell + py + (r() - 0.5) * 2 * mess * 0.3 * cell);
      const rot = (r() - 0.5) * 2 * mess * 48;
      const s = 0.95 * z * (1 + (r() - 0.5) * 2 * mess * 0.28);
      const ref = big ? (i % 2 ? '#s' : '#o') : '#c';
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
  const svg =
    `<style>.l *{fill:none;stroke:#000;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}.l .f,.l .f *{fill:#000;stroke:none}.s *{fill:#000}.m *{fill:none;stroke:#000;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}.m .f{fill:#000;stroke:none}.c *{fill:none;stroke:#000;stroke-width:2.2;stroke-linecap:round}.c .f,.c .f *{fill:#000;stroke:none}</style>` +
    `<defs><mask id='furos' maskUnits='userSpaceOnUse' x='-10' y='-10' width='60' height='60'><rect x='-10' y='-10' width='60' height='60' fill='#fff'/>${holes}</mask>` +
    `<g id='o'>${outline}</g><g id='s'>${filled}</g><g id='c' class='c'>${m.c}</g></defs>` +
    `<g opacity='${TINTA}'>${body}</g>`;
  const tile = { url: svgUrl(side, side, svg), side };
  tiles.set(key, tile);
  return tile;
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
  /** O que clareia o papel (a água que desbotou), atrás do que está escrito. */
  clareia: string;
  /** Relevo do papel (amassado, dobras): cinza em soft-light por cima de tudo, a tinta entorta junto. */
  relevo: string;
  /** Por cima do que está escrito: a orelha, o queimado. Recortado junto com o papel. */
  frente: string;
  /** A fita do remendo: colada por cima do rasgo, atravessa a fresta sem ser recortada. */
  fita: string;
}

export interface ArtInput {
  id: string;
  W: number;
  H: number;
  scribble?: Scribble;
  damage?: Damage;
  /** O sorteio do estrago (Review.damageSeed); sem ele, o estrago sai só do id. */
  seed?: number;
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
    case 'espirais': {
      let body = '';
      const n = 3;
      for (let j = 0; j < n; j++) {
        const cx = W * ((j + 0.5) / n + (r() - 0.5) * 0.14),
          cy = H * (0.3 + r() * 0.42);
        const R = Math.min(W / 2.4, H * (0.32 + r() * 0.2)),
          turns = 5 + Math.floor(r() * 3);
        const pts: Pt[] = [];
        const N = turns * 28;
        const dir = r() < 0.5 ? 1 : -1;
        for (let i = 0; i <= N; i++) {
          const t = i / N,
            ang = dir * t * turns * Math.PI * 2;
          const rad = R * t * (1 + 0.06 * Math.sin(i * 0.9));
          pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.86]);
        }
        body += `<path d='${smooth(pts)}'/>`;
      }
      return g(body, 1.4, 0.9);
    }
    case 'molinhas': {
      let body = '';
      const n = 4;
      for (let j = 0; j < n; j++) {
        const y0 = H * ((j + 0.5) / n) + (r() - 0.5) * H * 0.06;
        const slope = (r() - 0.5) * 0.14;
        const R = (8 + r() * 5) * Math.max(0.4, k),
          adv = (5 + r() * 2.5) * Math.max(0.4, k);
        const pts: Pt[] = [];
        const loops = Math.ceil((W + 20) / adv);
        for (let i = 0; i <= loops * 10; i++) {
          const t = i / 10,
            ang = t * Math.PI * 2;
          const x = -10 + t * adv - R * 0.55 * Math.sin(ang);
          pts.push([x, y0 + (x - W / 2) * slope - R * Math.cos(ang) + Math.sin(t * 0.3) * 2 * k]);
        }
        body += `<path d='${poly(pts)}'/>`;
      }
      return g(body, 1.3, 0.9);
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
    case 'aula': {
      const keys = ['gato', 'estrelinhas', 'velha', 'pauzinhos', 'espiral', 'coracao', 'raio', 'carinha', 'lua', 'flor', 'fantasma', 'setinha', 'caveira', 'teste', 'cogumelo', 'olho', 'nuvem', 'coroa'];
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

function damageArt(d: Damage, W: number, H: number, k: number, sw: number, r: () => number, uid: string, out: PaperArt): void {
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
      let tapes = '';
      const n = H < 200 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n + (r() - 0.5) * 0.12;
        const [cx, cy] = C[Math.min(C.length - 1, Math.max(0, Math.round(t * (C.length - 1))))];
        const len = (52 + r() * 16) * k,
          wid = (17 + r() * 3) * k;
        const ang = (r() - 0.5) * 40;
        const z = (v: number) => f1(v + (r() - 0.5) * 2.2 * k);
        const endR = `L${z(len / 2 + 1.5 * k)} ${f1(-wid / 4)}L${z(len / 2 - 1 * k)} 0L${z(len / 2 + 1.5 * k)} ${f1(wid / 4)}`;
        const endL = `L${z(-len / 2 - 1.5 * k)} ${f1(wid / 4)}L${z(-len / 2 + 1 * k)} 0L${z(-len / 2 - 1.5 * k)} ${f1(-wid / 4)}`;
        const tape = `M${f1(-len / 2)} ${f1(-wid / 2)}L${f1(len / 2)} ${f1(-wid / 2)}${endR}L${f1(len / 2)} ${f1(wid / 2)}L${f1(-len / 2)} ${f1(wid / 2)}${endL}Z`;
        tapes += `<g transform='translate(${f1(cx)} ${f1(cy)}) rotate(${f1(ang)})'><path d='${tape}' fill='rgb(240 232 204)' fill-opacity='.52' stroke='rgb(120 105 70)' stroke-opacity='.3' stroke-width='.8'/><path d='${tape}' fill='url(#${uid}-fita)'/><path d='M${f1(-len / 2)} ${f1(-wid / 2 + 1.4 * k)}H${f1(len / 2)}' stroke='#fff' stroke-opacity='.55' stroke-width='${f1(1.4 * sw)}'/></g>`;
      }
      out.fita += `<defs><linearGradient id='${uid}-fita' x1='0' y1='0' x2='1' y2='1'><stop offset='.2' stop-color='#fff' stop-opacity='0'/><stop offset='.45' stop-color='#fff' stop-opacity='.4'/><stop offset='.62' stop-color='#fff' stop-opacity='0'/></linearGradient></defs>${tapes}`;
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

/** Mancha de água: lóbulos largos e pequenas reentrâncias, sem geometria de gota ou anel. */
function waterBlobPath(cx: number, cy: number, rx: number, ry: number, r: () => number): string {
  const n = 48;
  const phase = [r() * 6, r() * 6, r() * 6, r() * 6];
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const waviness = 1 + 0.2 * Math.sin(a * 2 + phase[0]) + 0.14 * Math.sin(a * 3 + phase[1]) + 0.09 * Math.sin(a * 5 + phase[2]) + 0.045 * Math.sin(a * 9 + phase[3]);
    pts.push([cx + Math.cos(a) * rx * waviness, cy + Math.sin(a) * ry * waviness]);
  }
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
 * Rasgada em muitos pedaços e posta de volta no lugar: três ou quatro rasgos de beirada a beirada,
 * que se cruzam e picam a ficha em seis a onze pedaços. As frestas abrem e fecham, cada pedaço
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
  const tears = 3 + (r() < 0.5 ? 1 : 0);
  const ends: number[] = [];
  let tone = '',
    lifts = '';
  for (let t = 0; t < tears; t++) {
    // a outra ponta cai do outro lado da volta, para o rasgo atravessar a ficha
    const a = nudge(r() * P);
    const b = nudge(a + P * (0.33 + r() * 0.34));
    ends.push(a, b);
    const A = rimAt(a, 5),
      B = rimAt(b, 5);
    const dx = B[0] - A[0],
      dy = B[1] - A[1],
      l = Math.hypot(dx, dy) || 1;
    const one: Pt = [(A[0] + B[0]) / 2 - (dy / l) * 50, (A[1] + B[1]) / 2 + (dx / l) * 50];
    const other: Pt = [(A[0] + B[0]) / 2 + (dy / l) * 50, (A[1] + B[1]) / 2 - (dx / l) * 50];
    const C = rip(sweep(A, B, r, (r() - 0.5) * 30 * k, 8 * k, 14), one, r, 4.5 * k, step);
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
  const P = (24 + r() * 7) * k;
  const ang = r() * Math.PI * 2;
  const D: Pt = [Math.cos(ang), Math.sin(ang)],
    N: Pt = [-D[1], D[0]];
  const c: Pt = [W * (0.4 + r() * 0.2), H * (0.4 + r() * 0.2)];
  const reach = Math.hypot(W, H) / 2 + P;
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
