// sem importar core/mural-config.ts nem core/pixel-gallery.ts: os dois chegam a core/folders.ts, que importa este
// (um ciclo de import só quebra na build de produção); o folder-looks.spec confere que as cópias batem

/**
 * O visual de uma pasta (PLANO-PASTAS-CUSTOMIZADAS.md): a cor do papel, um enfeite (os adesivos, com os que foram
 * colados) e a vista padrão do que está dentro. Mora na própria pasta (`NoteFolder.look`), só com o que foi
 * escolhido: a pasta de sempre (manilha, sem enfeite, a vista do grupo) não guarda nada.
 *
 * Funções puras, sem Angular. Quem grava é o `NoteFolders.customize` (core/note-folders.ts); quem desenha, o
 * `FolderCard` (ui/folder-card.ts), com o CSS de ui/_pasta-enfeites.scss.
 */

/** As cores de papel de pasta, na ordem da cartela. A manilha é a de sempre (não se guarda). */
export const FOLDER_COLORS = [
  { id: 'manilha', label: 'Manilha' },
  { id: 'kraft', label: 'Kraft' },
  { id: 'vermelho', label: 'Vermelho' },
  { id: 'laranja', label: 'Laranja' },
  { id: 'amarelo', label: 'Amarelo' },
  { id: 'verde', label: 'Verde' },
  { id: 'azul', label: 'Azul' },
  { id: 'lilas', label: 'Lilás' },
  { id: 'rosa', label: 'Rosa' },
  { id: 'cinza', label: 'Cinza' },
  { id: 'grafite', label: 'Grafite' },
] as const;
export type FolderColor = (typeof FOLDER_COLORS)[number]['id'];
/** A cor da pasta que não escolheu nenhuma. */
export const DEFAULT_FOLDER_COLOR: FolderColor = 'manilha';

/** Os enfeites, um por pasta, na ordem da cartela (os escolhidos no protótipo, prototipos/pastas-customizadas.html). */
export const FOLDER_DECORS = [
  { id: 'costura', label: 'Pontilhado' },
  { id: 'pesponto', label: 'Pesponto' },
  { id: 'gravado', label: 'Filete gravado' },
  { id: 'etiqueta', label: 'Etiqueta' },
  { id: 'faixas', label: 'Duas faixas' },
  { id: 'lombada', label: 'Lombada de pano' },
  { id: 'canto', label: 'Faixa no canto' },
  { id: 'cantoneiras', label: 'Cantoneiras' },
  { id: 'xadrez', label: 'Xadrez' },
  { id: 'bolinhas', label: 'Bolinhas' },
  { id: 'meia-lua', label: 'Meia-lua' },
  { id: 'picotada', label: 'Borda picotada' },
  { id: 'orelha', label: 'Canto dobrado' },
  { id: 'estrelas', label: 'Estrelinhas' },
  { id: 'adesivos', label: 'Adesivos' },
] as const;
export type FolderDecor = (typeof FOLDER_DECORS)[number]['id'];

/** Os adesivos de vinil das cartolinas (core/decor-art.ts): os fofos e os gamer. */
export const FOLDER_STICKERS = [
  { id: 'coracao', label: 'Coração' },
  { id: 'carinha', label: 'Carinha' },
  { id: 'arcoiris', label: 'Arco-íris' },
  { id: 'raio', label: 'Raio' },
  { id: 'nuvem', label: 'Nuvem' },
  { id: 'gatinho', label: 'Gatinho' },
  { id: 'controle', label: 'Controle' },
  { id: 'cogumelo', label: 'Cogumelo' },
  { id: 'fantasma', label: 'Fantasminha' },
  { id: 'estrela', label: 'Estrela' },
  { id: 'dado', label: 'Dado' },
  { id: 'cartucho', label: 'Cartucho' },
] as const;
export type FolderSticker = (typeof FOLDER_STICKERS)[number]['id'];
/** Quantos adesivos cabem numa pasta (a frente tem 128 a 160px). */
export const MAX_FOLDER_STICKERS = 3;

/** As vistas das anotações (as de `GROUP_VIEWS`, core/mural-config.ts), da Wishlist e da galeria de pixel arts. */
export const NOTE_FOLDER_VIEWS = ['completa', 'inteira', 'simples', 'lista'] as const;
export const WISH_FOLDER_VIEWS = ['recortes', 'grade'] as const;
export const PIXEL_FOLDER_VIEWS = ['mostra', 'grade'] as const;

export interface FolderLook {
  /** Sem: a manilha. */
  color?: FolderColor;
  /** Sem: nenhum. */
  decor?: FolderDecor;
  /** Só com o enfeite `adesivos`: de 1 a 3, na ordem em que foram colados, sem repetir. */
  stickers?: FolderSticker[];
  /** A vista padrão do que está dentro, uma das do grupo da pasta (`viewsOfGroup`). Sem: a do grupo. */
  view?: string;
}

const colorIds = new Set<string>(FOLDER_COLORS.map((c) => c.id));
const decorIds = new Set<string>(FOLDER_DECORS.map((d) => d.id));
const stickerIds = new Set<string>(FOLDER_STICKERS.map((s) => s.id));

/** As vistas que uma pasta do grupo pode ter (pela chave do grupo, a de `NoteFolder.group`); vazia: nenhuma. */
export function viewsOfGroup(group: string): readonly string[] {
  if (group.startsWith('desejos:')) return WISH_FOLDER_VIEWS;
  // o grupo das pastas da galeria (`PIXEL_FOLDER_GROUP`, core/pixel-gallery.ts)
  if (group === 'galeria:pixel-arts') return PIXEL_FOLDER_VIEWS;
  // as mini-pastas dos templates do texto não são cards de pasta
  if (group.startsWith('templates:')) return [];
  return NOTE_FOLDER_VIEWS;
}

/**
 * O que veio guardado (ou da nuvem, ou do mural de outra pessoa): só o que este site conhece, sem os valores de
 * sempre (a manilha), e os adesivos só com o enfeite deles. Nada escolhido: undefined (a pasta fica sem `look`).
 */
export function sanitizeFolderLook(raw: unknown, group: string): FolderLook | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: FolderLook = {};
  if (typeof r['color'] === 'string' && colorIds.has(r['color']) && r['color'] !== DEFAULT_FOLDER_COLOR) out.color = r['color'] as FolderColor;
  if (typeof r['decor'] === 'string' && decorIds.has(r['decor'])) out.decor = r['decor'] as FolderDecor;
  if (out.decor === 'adesivos') {
    const list = Array.isArray(r['stickers']) ? r['stickers'] : [];
    const stickers = [...new Set(list.filter((s): s is FolderSticker => typeof s === 'string' && stickerIds.has(s)))].slice(0, MAX_FOLDER_STICKERS);
    // os adesivos sem nenhum adesivo não enfeitam nada
    if (stickers.length) out.stickers = stickers;
    else delete out.decor;
  }
  if (typeof r['view'] === 'string' && viewsOfGroup(group).includes(r['view'])) out.view = r['view'];
  return Object.keys(out).length ? out : undefined;
}

/** O visual por inteiro, com os valores de sempre no lugar do que não foi escolhido (para desenhar e comparar). */
export function lookOf(look: FolderLook | undefined): Required<Pick<FolderLook, 'color'>> & FolderLook {
  return { ...look, color: look?.color ?? DEFAULT_FOLDER_COLOR };
}

/** Dois visuais iguais (o que não foi escolhido conta como o de sempre)? */
export function sameFolderLook(a: FolderLook | undefined, b: FolderLook | undefined): boolean {
  const x = lookOf(a);
  const y = lookOf(b);
  return x.color === y.color && x.decor === y.decor && x.view === y.view && (x.stickers ?? []).join() === (y.stickers ?? []).join();
}
