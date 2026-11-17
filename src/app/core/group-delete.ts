import { lookKey, tagKeyPrefix } from './category-looks';
import { FolderTree, withFolder } from './folders';
import { NotesConfig } from './mural-config';
import { LABEL_MAX } from './note-labels';
import { Review, isNote } from './review';

/**
 * Apagar um grupo das anotações escolhendo para onde vai o que está nele (PLANO-APAGAR-GRUPO.md): a parte
 * pura. Quem faz é `LabelEdits.deleteCategory`; quem pergunta é a folha `ui/group-delete-sheet.ts`.
 */

/** O destino do que está no grupo apagado. */
export type GroupFate =
  /** Tudo vai embora: as anotações, as pastas, o quadro, os baralhos e os quadros livres. */
  | { kind: 'apagar' }
  /** Tudo vai para o grupo `to`; as soltas na raiz e as pastas de cima entram em `folder` (null: a raiz de `to`). */
  | { kind: 'levar'; to: string; folder: string | null }
  /** As anotações ficam sem grupo, dentro da pasta "Grupo deletado: nome" (D4). */
  | { kind: 'soltar' };

/** O que aconteceu, para o bilhete. */
export interface GroupDeleteResult {
  /** Deu certo (false: nada mudou, e `error` diz por quê). */
  ok: boolean;
  error?: string;
  /** As anotações que mudaram de lugar (levar, soltar). */
  moved: number;
  /** As anotações que saíram (apagar): as suas e as compartilhadas que saíram da nuvem. */
  removed: number;
  /** A primeira compartilhada que a nuvem não tirou (ela ficou). */
  failed?: string | null;
  /** A pasta criada para elas (soltar): o nome. */
  folder?: string;
}

/** O começo do nome da pasta das anotações de um grupo apagado que ficaram sem grupo (o nome que o dono deu). */
export const DELETED_GROUP_FOLDER = 'Grupo deletado: ';

/**
 * O nome da pasta das anotações que ficaram sem grupo: "Grupo deletado: Trabalho". Uma pasta tem no máximo
 * `LABEL_MAX` letras; o nome que não cabe acaba em reticências ("Grupo deletado: Estudo de Japo…").
 */
export function deletedGroupFolderName(group: string): string {
  const full = `${DELETED_GROUP_FOLDER}${group.replace(/\s+/g, ' ').trim()}`;
  // contado como o nome da pasta conta (`cleanFolderName`, em unidades do texto), sem partir um emoji no meio
  if (full.length <= LABEL_MAX) return full;
  let out = '';
  for (const ch of full) {
    if (out.length + ch.length > LABEL_MAX - 1) break;
    out += ch;
  }
  return `${out.trimEnd()}…`;
}

/**
 * As anotações do grupo `from` (a chave) indo para o grupo `to` (null: sem grupo), com data nova. As que estavam
 * soltas na raiz (pela árvore de antes da mudança: a lápide de cima conta como a raiz) entram em `rootFolder`;
 * as outras ficam na pasta delas (a pasta vai junto com o grupo). A pasta guardada é sempre a viva.
 */
export function notesLeavingGroup(notes: readonly Review[], tree: FolderTree, from: string, to: string | null, rootFolder: string | null, at: string): Review[] {
  const out: Review[] = [];
  for (const r of notes) {
    if (!isNote(r) || !r.category || lookKey(r.category) !== from) continue;
    const { category: _c, ...rest } = r;
    const moved = { ...rest, ...(to ? { category: to } : {}), updatedAt: at } as Review;
    out.push(withFolder(moved, tree.of(r) ?? rootFolder));
  }
  return out;
}

/**
 * As configurações sem o que é só do grupo `from` (a chave): o lugar na ordem e os padrões, que não passam para
 * nenhum outro (o grupo para onde as anotações vão fica com os dele). Com `all` (apagar com tudo), saem também as
 * tags escondidas dele e os assuntos guardados; sem, eles seguem as anotações (`configMoved`).
 */
export function configWithoutGroup(cfg: NotesConfig, from: string, all: boolean): NotesConfig {
  const { [from]: _p, ...categories } = cfg.categories;
  const out: NotesConfig = { ...cfg, order: cfg.order.filter((k) => k !== from), categories };
  if (!all) return out;
  const prefix = tagKeyPrefix(from);
  // (a chave de uma tag nunca começa com "#": o que começa é de outro grupo, "a" e "a#b")
  const hiddenTags = cfg.hiddenTags.filter((k) => !k.startsWith(prefix) || k.slice(prefix.length).startsWith('#'));
  const { [from]: _s, ...subjects } = cfg.subjects;
  return { ...out, hiddenTags, subjects };
}
