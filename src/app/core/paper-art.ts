/**
 * Os desenhos do papel da ficha: as estampas de papelaria (um ladrilho que se repete), os rabiscos
 * que tomam a ficha inteira e os estragos. Tudo sai em SVG, em px da ficha, a partir do id: a mesma
 * ficha rasga sempre igual. Nada do que a pessoa escreve entra aqui, só desenhos nossos e números.
 */
import { Damage, Paper, Pattern, Scribble, f1, hash, rng, svgUrl, textureOf } from './paper';

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

const tiles = new Map<string, string>();

/**
 * O ladrilho de uma estampa, como cartolina temática de papelaria: o motivo em contorno e o motivo
 * cheio se alternando, com o miudinho entre eles, impresso tom sobre tom (preto a 17%, multiplicado:
 * a cor da cartolina escurece, não acinzenta). Em fileiras desencontradas, 128px de lado.
 */
export function patternTile(p: Pattern, size = 128): string {
  const key = `${p}:${size}`;
  const hit = tiles.get(key);
  if (hit) return hit;
  const m = MOTIFS[p];
  const place = (x: number, y: number, rot: number, s: number, body: string) =>
    `<g transform='translate(${x} ${y}) rotate(${rot}) scale(${s}) translate(-20 -20)'>${body}</g>`;
  const placeC = (x: number, y: number, rot: number) => `<g transform='translate(${x} ${y}) rotate(${rot}) scale(.95) translate(-10 -10)'>${m.c}</g>`;
  const outline = `<g class='l'>${m.sil}${m.det ?? ''}${m.extra ?? ''}</g>`;
  // os furos do motivo cheio: o papel aparece nos olhos, no nariz, na boca
  const holes = m.det ? `<g class='m'>${m.det}</g>` : '';
  const filled = `<g mask='url(#furos)'><g class='s'>${m.sil}</g></g><g class='l'>${m.extra ?? ''}</g>`;
  const s = size / 128;
  const body =
    `<style>.l *{fill:none;stroke:#000;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}.l .f,.l .f *{fill:#000;stroke:none}.s *{fill:#000}.m *{fill:none;stroke:#000;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}.m .f{fill:#000;stroke:none}.c *{fill:none;stroke:#000;stroke-width:2.2;stroke-linecap:round}.c .f,.c .f *{fill:#000;stroke:none}</style>` +
    `<defs><mask id='furos' maskUnits='userSpaceOnUse' x='-10' y='-10' width='60' height='60'><rect x='-10' y='-10' width='60' height='60' fill='#fff'/>${holes}</mask></defs>` +
    `<g opacity='.19' transform='scale(${s})'>` +
    place(32, 32, -8, 0.95, outline) +
    place(96, 96, 7, 0.95, filled) +
    `<g class='c'>${placeC(96, 30, 14)}${placeC(32, 94, -16)}</g>` +
    `</g>`;
  const url = svgUrl(size, size, body);
  tiles.set(key, url);
  return url;
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
  if (input.scribble) out.fundo += scribbleArt(input.scribble, W, H, k, sw, rng(hash(`${input.id}:rabisco:${input.scribble}`)), input.plain);
  if (input.damage) damageArt(input.damage, W, H, k, sw, rng(hash(`${input.id}:estrago:${input.damage}${input.seed ? `:${input.seed}` : ''}`)), input.uid, out);
  return out;
}

/**
 * A máscara do papel: opaca onde há papel, transparente nos pedaços que foram embora. A máscara de
 * CSS lê a transparência, não o preto; por isso o recorte é feito dentro do SVG, com um <mask>.
 */
export function cutMask(art: PaperArt, W: number, H: number, layer: 'cor' | 'miolo' = 'cor'): string | null {
  if (!art.cut.length) return null;
  const w = f1(W),
    h = f1(H);
  // cada pedaço num <path> próprio: juntos eles somam, sem o fill-rule de um furar o outro
  const paths = [...art.cut, ...(layer === 'cor' ? art.core : [])];
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><mask id='m' maskUnits='userSpaceOnUse' x='-20' y='-20' width='${f1(W + 40)}' height='${f1(H + 40)}'><rect x='-20' y='-20' width='${f1(W + 40)}' height='${f1(H + 40)}' fill='#fff'/><g fill='#000' fill-rule='${art.evenodd ? 'evenodd' : 'nonzero'}'>${paths.map((d) => `<path d='${d}'/>`).join('')}</g></mask><rect x='-20' y='-20' width='${f1(W + 40)}' height='${f1(H + 40)}' fill='#fff' mask='url(#m)'/></svg>`,
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

function scribbleArt(s: Scribble, W: number, H: number, k: number, sw: number, r: () => number, plain?: boolean): string {
  const g = (body: string, width = 1.5, op = 1) =>
    `<g class='rabisco' style='stroke-width:${f1(width * sw)}px;opacity:${Math.round(op * GRAFITE * 100) / 100}'${plain ? '' : " filter='url(#papel-lapis)'"}>${body}</g>`;
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
  // a cor não solta no mesmo desenho do rasgo: a beirada de dentro parte do rasgo alisado e tem os
  // próprios fiapos, então a faixa não vira um contorno do dente de fora (como a foto na wishlist)
  const soft = pts.map((_, i): Pt => {
    let x = 0,
      y = 0,
      c = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++, c++) {
      x += pts[j][0];
      y += pts[j][1];
    }
    return [x / c, y / c];
  });
  let w = min + r() * (max - min);
  const inner = soft.map((p, i): Pt => {
    const [nx, ny] = normalAt(soft, i, inside, 3);
    // a largura passeia devagar entre o fio e a faixa larga; em cima dela, o fiapo miúdo da fibra
    w = Math.max(min, Math.min(max, w + (r() - 0.5) * (max - min) * 0.34));
    const d = w + (r() - 0.35) * (max - min) * 0.3;
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
    case 'arrancado': {
      // o pé arrancado do bloco: rasgado de ponta a ponta, mais fundo de um lado que do outro
      const yl = H - (22 + r() * 30) * k,
        yr = H - (22 + r() * 30) * k;
      const line = rip(sweep([-4, yl], [W + 4, yr], r, (r() - 0.5) * 18 * k, 7 * k), [W / 2, 0], r, 5.5 * k, step);
      out.cut.push(`M-6 ${f1(H + 6)}L-6 ${f1(yl)}${cont(line)}L${f1(W + 6)} ${f1(yr)}L${f1(W + 6)} ${f1(H + 6)}Z`);
      out.core.push(coreBand(line, [W / 2, 0], r, 0.6 * k, 5 * k));
      break;
    }
    case 'canto': {
      const a = (105 + r() * 60) * k,
        b = (95 + r() * 55) * k;
      const line = rip(sweep(at(corner, a, -4), at(corner, -4, b), r, (r() - 0.35) * 22 * k, 8 * k), [W / 2, H / 2], r, 5.5 * k, step);
      const Q = at(corner, -6, -6);
      out.cut.push(`M${f1(Q[0])} ${f1(Q[1])}${cont(line)}Z`);
      out.core.push(coreBand(line, [W / 2, H / 2], r, 0.6 * k, 5.5 * k));
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
      // furos de queimadura (brasa de cigarro, faísca): grandes, redondos por fora e comidos por dentro,
      // com a borda preta, o marrom do chamuscado e um fio de brasa
      const n = 2 + Math.floor(r() * 3);
      const holes: { x: number; y: number; R: number }[] = [];
      for (let tries = 0; holes.length < n && tries < 60; tries++) {
        const R = (18 + r() * 26) * k * (holes.length ? 0.8 + r() * 0.4 : 1.25);
        const x = W * (0.1 + r() * 0.8),
          y = H * (0.12 + r() * 0.76);
        if (holes.some((h) => Math.hypot(h.x - x, h.y - y) < (h.R + R) * 1.9)) continue;
        holes.push({ x, y, R });
      }
      for (const h of holes) {
        const ring = burnRing(h.x, h.y, h.R, r);
        out.cut.push(ring);
        out.frente +=
          `<path d='${ring}' fill='none' stroke='rgb(120 72 24)' stroke-opacity='.3' stroke-width='${f1(h.R * 1.5)}' filter='url(#papel-fumaca)'/>` +
          `<path d='${ring}' fill='none' stroke='rgb(58 30 10)' stroke-opacity='.7' stroke-width='${f1(h.R * 0.62)}' filter='url(#papel-fumaca)'/>` +
          `<path d='${ring}' fill='none' stroke='rgb(26 14 6)' stroke-opacity='.92' stroke-width='${f1(Math.max(6, h.R * 0.28))}' filter='url(#papel-borra)'/>` +
          `<path d='${ring}' fill='none' stroke='#0d0704' stroke-width='${f1(3.6 * sw)}' stroke-linejoin='round'/>` +
          `<path d='${ring}' fill='none' stroke='rgb(255 128 36)' stroke-opacity='.75' stroke-width='${f1(1.2 * sw)}' filter='url(#papel-brasa)'/>`;
      }
      break;
    }
    case 'queimado': {
      // chamuscada: a beirada comida pelo fogo, preta, marrom, e um fio de brasa
      let pts: Pt[];
      if (r() < 0.6) {
        const a = (130 + r() * 70) * k,
          b = (110 + r() * 60) * k;
        pts = wavy(at(corner, a, 0), at(corner, 0, b), r, 9 * k, 5 * Math.max(0.4, k), 14 * k * inward(corner));
        const Q = at(corner, -5, -5);
        out.cut.push(`M${f1(Q[0])} ${f1(Q[1])}${cont(pts)}Z`);
      } else {
        const base = (34 + r() * 22) * k;
        pts = wavy([W + 4, H - base], [-4, H - base * (0.7 + r() * 0.6)], r, 11 * k, 5 * Math.max(0.4, k), 0);
        out.cut.push(`M${f1(W + 5)} ${f1(H + 5)}${cont(pts)}L-5 ${f1(H + 5)}Z`);
      }
      const d = poly(pts);
      out.frente +=
        `<path d='${d}' fill='none' stroke='rgb(120 72 24)' stroke-opacity='.22' stroke-width='${f1(110 * k)}' filter='url(#papel-fumaca)'/>` +
        `<path d='${d}' fill='none' stroke='rgb(58 30 10)' stroke-opacity='.6' stroke-width='${f1(46 * k)}' filter='url(#papel-fumaca)'/>` +
        `<path d='${d}' fill='none' stroke='rgb(26 14 6)' stroke-opacity='.9' stroke-width='${f1(20 * k)}' filter='url(#papel-borra)'/>` +
        `<path d='${d}' fill='none' stroke='#0d0704' stroke-width='${f1(4.5 * sw)}' stroke-linejoin='round'/>` +
        `<path d='${d}' fill='none' stroke='rgb(255 128 36)' stroke-opacity='.8' stroke-width='${f1(1.3 * sw)}' filter='url(#papel-brasa)'/>`;
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
        `<circle cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(R)}' fill='none' stroke='${brown}' stroke-opacity='.62' stroke-width='${f1(3.2 * sw)}' stroke-dasharray='${f1(R * 4.4)} ${f1(R * 0.35)} ${f1(R * 1.2)} ${f1(R * 0.3)}'/>` +
        `<circle cx='${f1(cx + 4 * k)}' cy='${f1(cy + 3 * k)}' r='${f1(R * 0.965)}' fill='none' stroke='${brown}' stroke-opacity='.3' stroke-width='${f1(1.6 * sw)}' stroke-dasharray='${f1(R * 2.2)} ${f1(R * 1.8)}'/>` +
        // o que derramou: uma poça e os respingos
        `<path d='${blobPath(sx, sy, (13 + r() * 9) * k, r)}' fill='${brown}' fill-opacity='.34' stroke='${brown}' stroke-opacity='.5' stroke-width='${f1(1.4 * sw)}'/>` +
        drops +
        `</g>`;
      break;
    }
  }
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

/** A beirada de um furo de queimadura: redonda de longe, comida em dentinhos de perto. */
function burnRing(cx: number, cy: number, R: number, r: () => number): string {
  const n = 44;
  const ph = [r() * 6, r() * 6, r() * 6];
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = R * (1 + 0.16 * Math.sin(a * 2 + ph[0]) + 0.09 * Math.sin(a * 3 + ph[1]) + 0.06 * Math.sin(a * 7 + ph[2]) + (r() - 0.5) * 0.1);
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return `${poly(pts)}Z`;
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

/**
 * As variáveis de CSS do papel e da estampa (`.cartolina`, `.papel`, a faixa das fichas abertas):
 * a textura por cima, a estampa impressa no meio e a fibra por baixo (que a Lisa não tem).
 */
export function paperStyle(paper: Paper | undefined, pattern: Pattern | undefined): Record<string, string | null> {
  const t = textureOf(paper);
  return {
    '--textura': t ? t.img : null,
    '--textura-tam': t ? t.size : null,
    '--textura-mistura': t ? t.blend : null,
    '--estampa': pattern ? patternTile(pattern) : null,
    '--grao': paper === 'lisa' ? 'none' : null,
  };
}
