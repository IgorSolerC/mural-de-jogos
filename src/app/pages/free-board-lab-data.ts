import { signal } from '@angular/core';
import { FbEdge, FbNode, FreeBoard, sanitizeFreeBoard } from '../core/free-board';
import { HOLE, snap } from '../core/free-board-geometry';
import { StoredImage } from '../core/image-store';

/**
 * Os quadros do laboratório do Quadro livre (PLANO-QUADRO-LIVRE.md, rodada 2): uma mansão montada à mão, como
 * o quadro de jogo de puzzle que motivou o pedido, e um quadro gerado de 2.000 peças para medir o motor. As
 * imagens são cômodos desenhados aqui mesmo, num canvas, e ficam só na memória da página: nada entra no banco
 * de imagens de quem abre o laboratório.
 */

// ===== as imagens =====

/** Um id de imagem (22 letras) do laboratório: "labimg0007…". */
export const labImageId = (k: number) => `labimg${String(k).padStart(4, '0')}`.padEnd(22, 'x');

const ROOMS = [
  'Quarto de hóspedes',
  'Biblioteca',
  'Escritório',
  'Estufa',
  'Sala de música',
  'Cofre',
  'Capela',
  'Cozinha',
  'Adega',
  'Sótão',
  'Galeria',
  'Observatório',
  'Salão',
  'Despensa',
  'Ateliê',
  'Lavanderia',
  'Sala de jantar',
  'Torre',
];

/** As alas da casa, cada uma de uma cor de piso. */
const WINGS = ['#6d4f9c', '#2f7a46', '#2a5f9a', '#a3443a', '#a8812a', '#5d5a55'];

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Um cômodo visto de cima: o piso da ala, as paredes, as portas, uns móveis e o nome numa tira. */
function drawRoom(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number, k: number): void {
  const r = rng(k * 97 + 13);
  const wing = WINGS[k % WINGS.length];
  ctx.fillStyle = '#1d1a18';
  ctx.fillRect(0, 0, w, h);
  // o piso: tábuas ou ladrilhos
  ctx.fillStyle = wing;
  ctx.fillRect(18, 18, w - 36, h - 36);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  if (k % 2) {
    for (let y = 18; y < h - 18; y += 22) {
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(w - 18, y);
      ctx.stroke();
    }
  } else {
    for (let x = 18; x < w - 18; x += 36)
      for (let y = 18; y < h - 18; y += 36) if (((x + y) / 36) % 2 < 1) ctx.fillRect(x, y, 36, 36);
  }
  // as portas: falhas na parede
  ctx.fillStyle = '#d8cfbd';
  const doors = 1 + Math.floor(r() * 3);
  for (let d = 0; d < doors; d++) {
    const side = Math.floor(r() * 4);
    const along = 0.3 + r() * 0.4;
    if (side < 2) ctx.fillRect(w * along - 24, side ? h - 18 : 0, 48, 18);
    else ctx.fillRect(side === 2 ? 0 : w - 18, h * along - 24, 18, 48);
  }
  // os móveis
  for (let m = 0; m < 3; m++) {
    ctx.fillStyle = `rgba(${200 + r() * 55}, ${180 + r() * 60}, ${150 + r() * 60}, 0.85)`;
    const fw = 40 + r() * 90;
    const fh = 30 + r() * 60;
    ctx.fillRect(40 + r() * (w - 80 - fw), 40 + r() * (h - 120 - fh), fw, fh);
  }
  // o nome
  ctx.fillStyle = 'rgba(16,14,12,0.82)';
  ctx.fillRect(0, h - 64, w, 46);
  ctx.fillStyle = '#f3efe6';
  ctx.font = '800 26px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(ROOMS[k % ROOMS.length].toUpperCase(), 28, h - 41);
}

/**
 * O banco de imagens do laboratório: as mesmas `get`, `url` e `version` do `ImageStore`, com os cômodos
 * desenhados na memória. A página o dá no lugar do de verdade (`providers`), e a foto colada e as miniaturas o
 * usam sem saber.
 */
export class LabImages {
  readonly version = signal(0);
  readonly count = signal(0);
  private readonly images = new Map<string, StoredImage>();
  private readonly urls = new Map<string, string>();

  /** Desenha `n` cômodos (uns ms cada). */
  async draw(n: number): Promise<string[]> {
    const ids = Array.from({ length: n }, (_, k) => labImageId(k));
    // todas ao mesmo tempo: num navegador que segura o codificador (o painel do app), uma a uma levava um minuto
    await Promise.all(
      ids.map(async (id, k) => {
        if (this.images.has(id)) return;
        const w = 480;
        const h = 360;
        const canvas = new OffscreenCanvas(w, h);
        drawRoom(canvas.getContext('2d')!, w, h, k);
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
        this.images.set(id, { id, blob, tipo: 'image/jpeg', largura: w, altura: h, bytes: blob.size, hash: id, criada: new Date(0).toISOString(), estado: 'local' });
      }),
    );
    this.version.update((v) => v + 1);
    return ids;
  }

  async get(id: string): Promise<StoredImage | null> {
    return this.images.get(id) ?? null;
  }

  async url(id: string): Promise<string | null> {
    const known = this.urls.get(id);
    if (known) return known;
    const image = this.images.get(id);
    if (!image) return null;
    const url = URL.createObjectURL(image.blob);
    this.urls.set(id, url);
    return url;
  }

  destroy(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

// ===== os quadros =====

const image = (i: string, x: number, y: number, id: string, frame = 'foto', w = 260): FbNode => ({
  i,
  t: 'w',
  x,
  y,
  w,
  h: Math.round((w * 3) / 4),
  src: `{{imagem: murall://imagem/${id} | ${frame}}}`,
});
const note = (i: string, x: number, y: number, txt: string, w = 182, h = 104, c?: FbNode['c']): FbNode => ({ i, t: 'x', x, y, w, h, txt, ...(c ? { c } : {}) });
const frame = (i: string, x: number, y: number, w: number, h: number, nome: string, c: FbNode['c']): FbNode => ({ i, t: 'm', x, y, w, h, nome, c });

/** Uma anotação de verdade para o widget Nota (o id e o título), se quem abre tiver alguma. */
export interface LabNote {
  id: string;
  title: string;
}

/** A mansão: três molduras, os cômodos, bilhetes, setas com rótulo, um contador, uma tabela e uma anotação. */
export function mansionBoard(images: readonly string[], notes: readonly LabNote[]): FreeBoard {
  const img = (k: number) => images[k % images.length];
  const n: FbNode[] = [
    frame('roxo', 0, 0, 1144, 806, 'Roxo (Quartos)', 'lilas'),
    frame('luga', 1248, 0, 1066, 962, 'Lugares para interagir', 'verde'),
    frame('anjo', 0, 910, 1144, 572, 'Anjos do proletariado', 'vermelho'),
    image('q1', 52, 104, img(0)),
    image('q2', 416, 104, img(6), 'polaroid'),
    image('q3', 780, 104, img(12)),
    image('q4', 52, 390, img(18)),
    image('q5', 416, 416, img(24), 'recorte'),
    note('nq', 806, 416, 'Dormir aqui devolve **passos**?', 234, 130),
    image('l1', 1300, 104, img(1)),
    image('l2', 1664, 104, img(2), 'polaroid'),
    image('l3', 1300, 416, img(5)),
    image('l4', 1690, 676, img(9), 'adesivo', 234),
    note('ls', 2028, 130, 'Senha?', 156, 78, 'amarelo'),
    note('le', 2028, 416, 'Ler email no escritório', 208, 104),
    note('lc', 1326, 754, 'Cofre: 4 dígitos.\n- tentar a data do quadro\n- tentar o ano da capela', 312, 156),
    image('a1', 52, 1014, img(3)),
    image('a2', 416, 1014, img(4)),
    { i: 'ct', t: 'w', x: 780, y: 1014, w: 312, h: 156, src: '{{contador: 24/12/2026 | Fim do inverno | placar}}' },
    note('an', 780, 1222, 'Quem assina as cartas?', 208, 104, 'rosa'),
    note('solto', 2418, 52, 'Ideias soltas:\n1. o relógio da torre para às 3h\n2. a estufa só abre com sol', 338, 182),
    {
      i: 'tb',
      t: 'w',
      x: 2418,
      y: 312,
      w: 416,
      h: 182,
      src: '| Cômodo | Chave | Achei? |\n| --- | --- | --- |\n| Cofre | Senha | não |\n| Adega | Chave de ferro | sim |\n| Torre | Lupa | não |',
    },
  ];
  if (notes[0]) n.push({ i: 'nt', t: 'w', x: 2418, y: 572, w: 364, h: 182, src: `{{nota: #${notes[0].id} | ${notes[0].title}}}` });
  const e: FbEdge[] = [
    { i: 'e1', a: 'l3', b: 'le', txt: 'Preciso da senha para usar ler o email' },
    { i: 'e2', a: 'q3', b: 'l1', txt: 'Precisa da lupa' },
    { i: 'e3', a: 'le', b: 'ls' },
    { i: 'e4', a: 'a2', b: 'ct', c: 'amarelo' },
    { i: 'e5', a: 'q5', b: 'nq', p: '<>' },
    { i: 'e6', a: 'lc', b: 'l3', p: '-' },
  ];
  return sanitizeFreeBoard({ v: 1, id: 'labmansaoxxxxxxxxxxxxx', nome: 'Mansão', grupo: 'Jogos', em: '2026-11-09T12:00:00.000Z', n, e })!;
}

/**
 * O quadro grande (seção 9.8): 40 molduras numa grade, cada uma com imagens, bilhetes, contadores e notas, e
 * 1.500 setas (correntes dentro de cada moldura e algumas entre molduras). Sempre o mesmo (semente fixa).
 */
export function bigBoard(images: readonly string[], total = 2000, edges = 1500): FreeBoard {
  const r = rng(2026);
  const frames = 40;
  const per = Math.floor((total - frames) / frames);
  const n: FbNode[] = [];
  const e: FbEdge[] = [];
  const colors = ['lilas', 'verde', 'azul', 'vermelho', 'amarelo', 'laranja', 'rosa', 'cinza'] as const;
  const inside: string[][] = [];
  const fw = HOLE * 72;
  const fh = HOLE * 56;
  for (let f = 0; f < frames; f++) {
    const fx = (f % 8) * (fw + HOLE * 8);
    const fy = Math.floor(f / 8) * (fh + HOLE * 8);
    n.push(frame(`f${f}`, fx, fy, fw, fh, `Ala ${f + 1}`, colors[f % colors.length]));
    const ids: string[] = [];
    for (let k = 0; k < per; k++) {
      const col = k % 7;
      const row = Math.floor(k / 7);
      const x = snap(fx + HOLE * 2 + col * HOLE * 10 + r() * HOLE);
      const y = snap(fy + HOLE * 4 + row * HOLE * 7 + r() * HOLE);
      const id = `p${f}x${k}`;
      const kind = k % 4;
      if (kind === 0) n.push(image(id, x, y, images[Math.floor(r() * images.length)], k % 8 ? 'foto' : 'polaroid', 208));
      else if (kind === 3 && k % 8 === 3) n.push({ i: id, t: 'w', x, y, w: 234, h: 130, src: `{{contador: ${1 + (k % 28)}/12/2026 | Prazo ${k}}}` });
      else n.push(note(id, x, y, `Pista ${f + 1}.${k}: ${['olhar atrás do quadro', 'senha?', 'falar com o jardineiro', 'a chave abre a adega', 'ler o diário'][k % 5]}`, 208, 104, k % 6 === 1 ? colors[k % colors.length] : undefined));
      ids.push(id);
    }
    inside.push(ids);
  }
  // as setas: correntes dentro de cada moldura, e umas entre molduras vizinhas
  let k = 0;
  while (e.length < edges) {
    const f = k % frames;
    const ids = inside[f];
    const a = ids[Math.floor(r() * ids.length)];
    const sameFrame = r() < 0.9;
    const other = sameFrame ? ids : inside[(f + 1) % frames];
    const b = other[Math.floor(r() * other.length)];
    if (a !== b) e.push({ i: `e${k}`, a, b, ...(k % 9 === 0 ? { txt: 'precisa disto' } : {}) });
    k++;
  }
  return sanitizeFreeBoard({ v: 1, id: 'labgrandexxxxxxxxxxxxx', nome: `${total} peças`, grupo: 'Jogos', em: '2026-11-09T12:00:00.000Z', n, e })!;
}
