import type { Relevance, Wish } from '../core/review';

/**
 * Os dados de mentira do laboratório da Wishlist (`/laboratorio/wishlist`): 30 jogos com capa da Steam,
 * quatro pastas (uma dentro da outra), tags com cor e lembretes. Ficam só na memória da página.
 */
export interface LabWish extends Wish {
  tags: string[];
  folder: string | null;
  note?: string;
}

export interface LabFolder {
  id: string;
  name: string;
  parent: string | null;
}

export interface LabTag {
  name: string;
  color: string | null;
}

export const LAB_TAGS: readonly LabTag[] = [
  { name: 'co-op', color: '#c8473b' },
  { name: 'curto', color: '#3c8a5a' },
  { name: 'história', color: '#4f5bc4' },
  { name: 'game pass', color: '#2f8f3a' },
  { name: 'terror', color: '#7a3a8c' },
  { name: 'presente', color: null },
  { name: 'indicação', color: null },
];

export const LAB_FOLDERS: readonly LabFolder[] = [
  { id: 'f-coop', name: 'Co-op com a Bia', parent: null },
  { id: 'f-indie', name: 'Indies curtinhos', parent: null },
  { id: 'f-rogue', name: 'Roguelikes', parent: 'f-indie' },
  { id: 'f-promo', name: 'Esperar promoção', parent: null },
];

const steam = (id: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;

type Row = [id: string, name: string, steamId: number, year: string, rel: Relevance, folder: string | null, tags: string[], note?: string];

const ROWS: Row[] = [
  ['wk7Hq2', 'Hollow Knight: Silksong', 1030300, '2025', 'must', null, ['história'], 'Saiu! Jogar antes dos spoilers'],
  ['pX3n9a', 'Outer Wilds', 753640, '2020', 'must', null, ['história', 'indicação'], 'Indicação do Rafa: ir sem ler nada'],
  ['Lm4c0T', 'Disco Elysium', 632470, '2019', 'comum', null, ['história']],
  ['q9Zr1b', 'Celeste', 504230, '2018', 'comum', null, ['curto']],
  ['Ff2vYk', 'Sekiro: Shadows Die Twice', 814380, '2019', 'later', null, []],
  ['Ab8sQe', 'Persona 5 Royal', 1687950, '2022', 'comum', null, ['história', 'game pass']],
  ['Hn6tUw', 'Pentiment', 1205520, '2022', 'comum', null, ['história', 'game pass']],
  ['Rt1oXa', 'Sea of Stars', 1244090, '2023', 'later', null, ['game pass']],
  ['Cz5mPp', 'Hi-Fi Rush', 1817230, '2023', 'comum', null, ['curto']],
  ['Ye3kLs', 'Subnautica', 264710, '2018', 'comum', null, ['terror']],
  ['Ux7aNd', 'Portal 2', 620, '2011', 'must', null, ['co-op', 'curto']],
  ['Gb0eRj', 'Cult of the Lamb', 1313140, '2022', 'comum', null, []],
  ['Wq2hMv', 'Death Stranding', 1850570, '2022', 'later', null, ['história'], 'Quando tiver férias'],
  ['Ko9pZc', 'Signalis', 1262350, '2022', 'comum', null, ['terror', 'curto']],
  ['Tj4fBn', 'It Takes Two', 1426210, '2021', 'must', 'f-coop', ['co-op'], 'Presente da Bia, jogar juntos'],
  ['Pd6wEa', 'Lethal Company', 1966720, '2023', 'comum', 'f-coop', ['co-op', 'terror']],
  ['Ns1lCx', 'Stardew Valley', 413150, '2016', 'comum', 'f-coop', ['co-op']],
  ['Vh8rTe', 'Terraria', 105600, '2011', 'later', 'f-coop', ['co-op']],
  ['Me5yGo', 'Cuphead', 268910, '2017', 'comum', 'f-coop', ['co-op', 'curto']],
  ['Bs3qWi', 'Inscryption', 1092790, '2021', 'must', 'f-indie', ['curto', 'terror']],
  ['Jc7dKu', 'Return of the Obra Dinn', 653530, '2018', 'comum', 'f-indie', ['curto', 'indicação']],
  ['Xo2gHy', 'Tunic', 553420, '2022', 'comum', 'f-indie', ['curto', 'game pass']],
  ['Ea9vSt', 'Animal Well', 813230, '2024', 'comum', 'f-indie', ['curto']],
  ['Iz4nFr', 'Dredge', 1562430, '2023', 'later', 'f-indie', ['curto', 'terror']],
  ['Ql6bAp', 'Hades', 1145360, '2020', 'must', 'f-rogue', []],
  ['Dw0cJm', 'Dead Cells', 588650, '2018', 'comum', 'f-rogue', []],
  ['Sy8tVb', 'Slay the Spire', 646570, '2019', 'comum', 'f-rogue', ['presente']],
  ['Oa1xNq', 'Balatro', 2379780, '2024', 'comum', 'f-rogue', ['curto']],
  ['Zf5iEw', 'Baldur’s Gate 3', 1086940, '2023', 'must', 'f-promo', ['história', 'co-op'], 'Esperar sair por menos de R$ 150'],
  ['Ug3oYd', 'Elden Ring', 1245620, '2022', 'comum', 'f-promo', []],
  ['Ri7kMh', 'Cyberpunk 2077', 1091500, '2020', 'later', 'f-promo', ['história']],
  ['Lp2uCs', 'Lies of P', 1627720, '2023', 'comum', 'f-promo', ['presente']],
];

/** Os desejos, do mais novo para o mais velho (um por dia, para a ordem por data fazer sentido). */
export function labWishes(): LabWish[] {
  const day = 86_400_000;
  const now = Date.parse('2026-11-12T12:00:00Z');
  return ROWS.map(([id, name, steamId, year, rel, folder, tags, note], i) => {
    const at = new Date(now - i * day * 3).toISOString();
    return {
      id,
      kind: 'jogos',
      game: { name, coverUrl: steam(steamId), source: 'manual', year },
      ...(rel === 'comum' ? {} : { relevance: rel }),
      createdAt: at,
      updatedAt: at,
      tags,
      folder,
      ...(note ? { note } : {}),
    } as LabWish;
  });
}
