import type { FolderTree, NoteFolder } from './folders';
import { plural } from './text';

/**
 * Pastas e fichas marcadas juntas (PLANO-MARCAR-PASTAS.md): o que vale igual nas Anotações, na galeria de pixel
 * arts e na Wishlist, sem saber de nenhuma delas. As fichas são as anotações, as obras ou os recortes, pelo id.
 */

/** O que está marcado: as pastas e as fichas, pelos ids. */
export interface Marked {
  folders: readonly string[];
  items: readonly string[];
}

/**
 * Só o que está em cima (D5): a pasta marcada leva o que está dentro dela, então o que também está marcado e
 * mora dentro de outra pasta marcada (uma ficha, uma pasta) sai da lista: mover, arrastar e juntar não o tiram
 * de lá. `folderOf`: a pasta de verdade de uma ficha (null: solta).
 */
export function markedTops(tree: Pick<FolderTree, 'below'> & { live(id: string): unknown }, marked: Marked, folderOf: (item: string) => string | null): { folders: string[]; items: string[] } {
  const live = marked.folders.filter((id) => !!tree.live(id));
  // dentro de outra marcada: a pasta que está em `below` de outra (ela mesma não conta)
  const inside = (id: string) => live.some((other) => other !== id && tree.below(other).has(id));
  const folders = [...new Set(live.filter((id) => !inside(id)))];
  const covered = new Set(folders.flatMap((id) => [...tree.below(id)]));
  const items = [...new Set(marked.items.filter((id) => !covered.has(folderOf(id) ?? '')))];
  return { folders, items };
}

/** O que muda pastas e fichas onde elas moram (`NoteFolders`, `WishFolders`, `PixelFolders`). */
export interface MarkMoves {
  place(ids: readonly string[], folder: string | null): { moved: number; undo: () => void };
  move(id: string, parent: string | null): (() => void) | null;
}

/** Como ficou mover as marcadas: quantas pastas e fichas foram, quantas ficaram (outro grupo, já estavam lá…), e o Desfazer de tudo. */
export interface MarksMoved {
  folders: number;
  items: number;
  /** As que não foram: de outro grupo, a pasta que não cabe ali (o teto de níveis), a que já estava lá. */
  stayed: number;
  undo: () => void;
}

/**
 * Leva as marcadas (já só as de cima, ver `markedTops`) para a pasta `to` (null: a raiz), com um Desfazer só. As
 * pastas primeiro: a que não pode ir (ela mesma, uma de dentro dela, outro grupo, o teto de níveis) fica onde
 * está; depois as fichas (as que já estão lá ficam).
 */
export function moveMarked(a: MarkMoves, tops: Marked, to: string | null): MarksMoved {
  const undos: (() => void)[] = [];
  let folders = 0;
  for (const id of tops.folders) {
    const undo = id === to ? null : a.move(id, to);
    if (!undo) continue;
    folders++;
    undos.push(undo);
  }
  const placed = tops.items.length ? a.place(tops.items, to) : { moved: 0, undo: () => undefined };
  undos.push(placed.undo);
  return {
    folders,
    items: placed.moved,
    stayed: tops.folders.length + tops.items.length - folders - placed.moved,
    // na ordem contrária: as fichas voltam antes de as pastas voltarem
    undo: () => [...undos].reverse().forEach((u) => u()),
  };
}

/** "2 pastas e 3 anotações", "1 pasta", "4 recortes": o que está marcado, em palavras. */
export function marksLabel(folders: number, items: number, units: readonly [string, string]): string {
  return [folders ? plural(folders, 'pasta', 'pastas') : '', items ? plural(items, ...units) : ''].filter(Boolean).join(' e ');
}

/**
 * Soltou as marcadas sobre outra ficha (D6): a pasta nova nasce com as fichas (`gather`, de quem chama: cada parede
 * cria no lugar dela) e as pastas marcadas entram nela, com um Desfazer só. `folders`: quantas pastas entraram.
 */
export function joinMarked(
  gather: (ids: readonly string[]) => { folder: NoteFolder; undo: () => void } | null,
  moves: MarkMoves,
  ids: readonly string[],
  folders: readonly string[],
): { folder: NoteFolder; folders: number; undo: () => void } | null {
  const made = gather(ids);
  if (!made) return null;
  const moved = moveMarked(moves, { folders, items: [] }, made.folder.id);
  return {
    folder: made.folder,
    folders: moved.folders,
    undo: () => {
      moved.undo();
      made.undo();
    },
  };
}

/**
 * O bilhete de mover as marcadas: "2 pastas e 3 recortes guardados em Ação." / "1 pasta foi para a Wishlist.", e o
 * que ficou ("1 ficou onde estava: de outro grupo, ou já estava lá."). `moved` false: nada mudou (sem Desfazer).
 * `masc`: as fichas são masculinas (os recortes).
 */
export function movedText(done: MarksMoved, units: readonly [string, string], where: string, into: boolean, masc = false): { text: string; moved: boolean } {
  const total = done.folders + done.items;
  const stayed = done.stayed === 1 ? '1 ficou onde estava' : `${done.stayed} ficaram onde estavam`;
  if (!total) return { text: done.stayed ? `Nada mudou: ${stayed} (de outro grupo, ou já estava lá).` : 'Nada mudou: já estava tudo lá.', moved: false };
  const g = done.items && masc ? 'o' : 'a';
  const verb = into ? `guardad${g}${total === 1 ? '' : 's'} em ${where}` : `${total === 1 ? 'foi' : 'foram'} para ${where}`;
  return { text: `${marksLabel(done.folders, done.items, units)} ${verb}.${done.stayed ? ` ${stayed}: de outro grupo, ou já estava lá.` : ''}`, moved: true };
}

/**
 * A pergunta de apagar com pastas marcadas (D10), igual nas três paredes: as pastas saem com tudo o que está
 * dentro, ou só se desfazem (o que está nelas sobe) e só as fichas marcadas soltas saem. `inside`: quantas fichas
 * estão dentro das pastas; `tops`: as marcadas soltas; `extra`: o que mais a pergunta precisa dizer (as
 * compartilhadas, nas Anotações); `masc`: as fichas são masculinas (os recortes).
 */
export function foldersRemovalAsk(
  nf: number,
  inside: number,
  tops: number,
  units: readonly [string, string],
  extra: readonly string[] = [],
  masc = false,
  forAll = false,
): { title: string; text: string; confirm: string; secondary: string; tone: 'perigo' } {
  const [one, many] = units;
  const a = masc ? 'o' : 'a';
  const marked = masc ? 'marcado' : 'marcada';
  const what = nf === 1 ? 'A pasta marcada sai' : `As ${nf} pastas marcadas saem`;
  const alsoTops = tops ? `, e ${tops === 1 ? `${a} ${one} ${marked} também` : `${a}s ${tops} ${many} ${marked}s também`}` : '';
  const onlyTops = tops ? `, e só ${tops === 1 ? `${a} ${one} ${marked} sai` : `${a}s ${tops} ${many} ${marked}s saem`}` : '';
  const parts = [
    `${what} com tudo o que está dentro${inside ? ` (${plural(inside, one, many)})` : ''}${alsoTops}.`,
    ...extra,
    `Só desfazer ${nf === 1 ? 'a pasta' : 'as pastas'}: o que está ${nf === 1 ? 'nela' : 'nelas'} sobe para onde ${nf === 1 ? 'ela estava' : 'elas estavam'}${onlyTops}.`,
  ];
  return {
    // (o título conta o que foi marcado: as de dentro estão no texto, senão "2 pastas e 7" parece nove marcadas)
    title: forAll ? 'Apagar para todos?' : `Apagar ${plural(nf, 'pasta', 'pastas')}${inside ? ' com o que está dentro' : ''}${tops ? ` e ${plural(tops, one, many)}` : ''}?`,
    text: parts.join(' '),
    confirm: 'Apagar tudo',
    secondary: nf === 1 ? 'Só desfazer a pasta' : 'Só desfazer as pastas',
    // (apagar é a ficha vermelha de sempre, mesmo com a outra saída)
    tone: 'perigo',
  };
}
