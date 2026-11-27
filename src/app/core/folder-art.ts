import { FOIL, GAMER, PUFFY, mix, star } from './decor-art';
import { FolderColor, FolderLook, FolderSticker, lookOf } from './folder-looks';
import { f1, hash } from './paper';

/**
 * O que o enfeite de uma pasta desenha em SVG (PLANO-PASTAS-CUSTOMIZADAS.md, 3): as estrelinhas laminadas, a
 * costura da meia-lua e os adesivos de vinil. O resto dos enfeites é CSS (ui/_pasta-enfeites.scss). Os desenhos
 * são os das cartolinas (core/decor-art.ts: o laminado `FOIL`, a estrela, os adesivos `PUFFY` e `GAMER`), sem
 * mudar nada neles; só a posição é da pasta, fixa e torta pelo id dela (a mesma em todo aparelho).
 *
 * Devolve texto SVG montado só com os valores do catálogo (nunca com o que a pessoa escreveu).
 */

/** O laminado das estrelas que combina com cada papel (o dourado só onde ele orna; aprovado no protótipo). */
const STAR_FOIL: Record<FolderColor, number> = {
  manilha: 2,
  kraft: 0,
  vermelho: 0,
  laranja: 3,
  amarelo: 3,
  verde: 0,
  azul: 0,
  lilas: 1,
  rosa: 1,
  cinza: 2,
  grafite: 0,
};

/** Os adesivos pelo id (os fofos e os gamer das cartolinas). */
const STICKER_ART: Record<FolderSticker, { sil: string; art: string }> = {
  coracao: PUFFY[0],
  carinha: PUFFY[1],
  arcoiris: PUFFY[2],
  raio: PUFFY[3],
  nuvem: PUFFY[4],
  gatinho: PUFFY[5],
  controle: GAMER[0],
  cogumelo: GAMER[1],
  fantasma: GAMER[2],
  estrela: GAMER[3],
  dado: GAMER[4],
  cartucho: GAMER[5],
};

/** Onde cada adesivo vai, pela quantidade: o 1º no canto de cima, meio para fora da boca; os outros descendo. */
const STICKER_SLOTS: readonly (readonly { top: number; right: number; size: number }[])[] = [
  [],
  [{ top: -9, right: 8, size: 30 }],
  [
    { top: -7, right: 18, size: 30 },
    { top: 9, right: 3, size: 22 },
  ],
  [
    { top: -8, right: 30, size: 26 },
    { top: -4, right: 4, size: 24 },
    { top: 16, right: 6, size: 20 },
  ],
];

/** As três estrelinhas, no canto de cima à direita: cada ponta com uma faceta na luz e outra na sombra. */
function starsSvg(color: FolderColor, uid: string): string {
  // (uma cor fora do catálogo, que não passou pelo saneamento: o laminado da manilha)
  const [hi, mid, lo] = FOIL[STAR_FOIL[color] ?? STAR_FOIL.manilha];
  const light = (-135 * Math.PI) / 180;
  let shadow = '';
  let body = '';
  for (const [x, y, R, rot, shine] of [
    [20, 9.5, 8.2, 12, true],
    [8.5, 18, 5.8, -18, false],
    [21, 28, 6.4, 30, true],
  ] as const) {
    const at = (deg: number, rr: number): [number, number] => [x + Math.cos((deg * Math.PI) / 180) * rr, y + Math.sin((deg * Math.PI) / 180) * rr];
    const ri = R * 0.46;
    const outline = star(x, y, R, ri, rot);
    let facets = '';
    for (let j = 0; j < 5; j++) {
      const tip = rot - 90 + j * 72;
      const T = at(tip, R);
      for (const [side, P] of [
        [-1, at(tip - 36, ri)],
        [1, at(tip + 36, ri)],
      ] as const) {
        const face = ((tip + side * 54) * Math.PI) / 180;
        const lit = (Math.cos(face - light) + 1) / 2;
        const col = lit > 0.5 ? mix(mid, hi, (lit - 0.5) * 2) : mix(lo, mid, lit * 2);
        facets += `<path d='M${f1(x)} ${f1(y)}L${f1(P[0])} ${f1(P[1])}L${f1(T[0])} ${f1(T[1])}Z' fill='${col}'/>`;
      }
    }
    shadow += `<path d='${outline}' transform='translate(0.6 1.1)'/>`;
    body +=
      `<path d='${outline}' fill='${mid}' stroke='${mid}' stroke-width='1' stroke-linejoin='round'/>` +
      facets +
      `<path d='${outline}' fill='url(#${uid}-folha)' stroke='${lo}' stroke-opacity='.5' stroke-width='.35' stroke-linejoin='round'/>`;
    if (shine) {
      const [gx, gy] = at(rot - 90 - 72, R * 0.62);
      const g = R * 0.28;
      body += `<path d='M${f1(gx)} ${f1(gy - g)}Q${f1(gx)} ${f1(gy)} ${f1(gx + g)} ${f1(gy)}Q${f1(gx)} ${f1(gy)} ${f1(gx)} ${f1(gy + g)}Q${f1(gx)} ${f1(gy)} ${f1(gx - g)} ${f1(gy)}Q${f1(gx)} ${f1(gy)} ${f1(gx)} ${f1(gy - g)}Z' fill='#fff' fill-opacity='.9'/>`;
    }
  }
  return (
    `<svg class='estrelas' viewBox='0 0 30 40'><defs>` +
    `<linearGradient id='${uid}-folha' x1='0' y1='0' x2='1' y2='1'><stop offset='.2' stop-color='#fff' stop-opacity='0'/><stop offset='.42' stop-color='#fff' stop-opacity='.28'/><stop offset='.55' stop-color='#fff' stop-opacity='0'/></linearGradient>` +
    `<filter id='${uid}-sombra' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='.7'/></filter></defs>` +
    `<g fill='#000' opacity='.35' filter='url(#${uid}-sombra)'>${shadow}</g>${body}</svg>`
  );
}

/** Os adesivos colados, cada um com a sombra, a borda branca do corte, o desenho e o brilho do vinil. */
function stickersSvg(stickers: readonly FolderSticker[], seed: string): string {
  // (só os do catálogo: o que não passou pelo saneamento não derruba a pasta)
  const known = stickers.filter((s) => s in STICKER_ART).slice(0, 3);
  const slots = STICKER_SLOTS[known.length];
  return known
    .map((id, i) => {
      const { sil, art } = STICKER_ART[id];
      const { top, right, size } = slots[i];
      // torto do seu jeito, o mesmo em todo aparelho
      const rot = (hash(`${seed}:${i}`) % 25) - 12;
      return (
        `<svg class='adesivo' viewBox='0 0 40 40' style='top:${top}px;right:${right}px;width:${size}px;height:${size}px;rotate:${rot}deg'>` +
        `<g transform='translate(0.7 1.4)'><g fill='#000' stroke='#000' stroke-width='5' stroke-linejoin='round' opacity='.22'>${sil}</g></g>` +
        `<g fill='#fff' stroke='#fff' stroke-width='5' stroke-linejoin='round'>${sil}</g>${art}` +
        `<ellipse cx='14' cy='12' rx='5' ry='2.6' transform='rotate(-30 14 12)' fill='#fff' fill-opacity='.45'/></svg>`
      );
    })
    .join('');
}

/** A costura que acompanha o recorte da meia-lua (a cor é a `--sutil` da pasta, pelo CSS). */
const HALF_MOON = `<svg class='meia-lua' viewBox='0 0 38 20'><path d='M1.5 0 A17.5 17.5 0 0 0 36.5 0' fill='none' stroke='var(--sutil)' stroke-width='1.4' stroke-dasharray='4 3'/></svg>`;

/**
 * O SVG do enfeite da pasta, ou '' para o que é só CSS. `id` (o da pasta) dá o torto dos adesivos; `uid`, os ids
 * dos gradientes, únicos na página (a mesma pasta pode estar duas vezes: na parede e na folha de customizar).
 */
export function folderDecorSvg(look: FolderLook | undefined, id: string, uid = id): string {
  const l = lookOf(look);
  if (l.decor === 'estrelas') return starsSvg(l.color, `pasta-${uid}`);
  if (l.decor === 'meia-lua') return HALF_MOON;
  if (l.decor === 'adesivos') return stickersSvg(l.stickers ?? [], id);
  return '';
}
