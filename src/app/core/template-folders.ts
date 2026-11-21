import { Injectable, computed, inject } from '@angular/core';
import { lookKey } from './category-looks';
import { FolderTree, NoteFolder } from './folders';
import { NoteFolders } from './note-folders';
import { NoteTemplate, TEMPLATE_FOLDER_GROUP, sortedTemplates, withTemplateFolder } from './note-templates';
import { Settings } from './settings';

/** Uma mini-pasta com os templates dela (de A a Z), como o seletor mostra. */
export interface TemplateShelf {
  folder: NoteFolder;
  templates: NoteTemplate[];
}

/**
 * As mini-pastas dos templates do texto: as pastas das anotações (core/note-folders.ts), na mesma lista das
 * configurações (`NotesConfig.folders`), no grupo `TEMPLATE_FOLDER_GROUP`, como as da galeria de pixel arts
 * (core/pixel-folders.ts). Um nível só (todas na raiz do grupo): é para juntar os parecidos, não para arquivar.
 *
 * O template guarda só o id da pasta, e a regra é a da leitura: a pasta desfeita vira lápide e o template fica
 * solto sem ser regravado (o Desfazer a traz de volta com eles dentro). Renomear e desfazer são os de
 * `NoteFolders`; aqui fica o que mexe nos templates: guardar numa pasta e contar.
 */
@Injectable({ providedIn: 'root' })
export class TemplateFolders {
  private readonly folders = inject(NoteFolders);
  private readonly settings = inject(Settings);

  readonly group = lookKey(TEMPLATE_FOLDER_GROUP);
  readonly tree = computed<FolderTree>(() => this.folders.tree());

  /** As mini-pastas vivas, de A a Z. */
  readonly list = computed<readonly NoteFolder[]>(() => this.tree().kids(this.group, null));

  /** A pasta de verdade do template (null: solto). A de dentro de outra (de um site que deixasse) vale pela de cima. */
  of(t: Pick<NoteTemplate, 'folder'>): string | null {
    const tree = this.tree();
    return tree.path(tree.resolve(t.folder, this.group))[0]?.id ?? null;
  }

  /** As pastas com os templates de cada uma, e os soltos (todos de A a Z). */
  readonly shelves = computed<{ shelves: TemplateShelf[]; loose: NoteTemplate[] }>(() => {
    const by = new Map<string, NoteTemplate[]>();
    const loose: NoteTemplate[] = [];
    for (const t of sortedTemplates(this.settings.notesConfig().templates)) {
      const at = this.of(t);
      if (at) by.set(at, [...(by.get(at) ?? []), t]);
      else loose.push(t);
    }
    return { shelves: this.list().map((folder) => ({ folder, templates: by.get(folder.id) ?? [] })), loose };
  });

  /** Quantos templates cada pasta tem (para a escolha da pasta). */
  readonly counts = computed<ReadonlyMap<string, number>>(() => new Map(this.shelves().shelves.map((s) => [s.folder.id, s.templates.length])));

  /**
   * Guarda os templates na pasta (null: soltos); os que já estão lá ficam. Devolve quantos mudaram e como
   * desfazer (cada um volta para a pasta de antes, se ninguém o mudou de pasta no meio).
   */
  place(ids: readonly string[], folder: string | null): { moved: number; undo: () => void } {
    const target = folder ? this.tree().live(folder) : undefined;
    const none = { moved: 0, undo: () => undefined };
    if (folder && (!target || target.group !== this.group)) return none;
    const to = target?.id ?? null;
    const back = new Map<string, string | null>();
    for (const t of this.settings.notesConfig().templates) if (ids.includes(t.id) && this.of(t) !== to) back.set(t.id, t.folder ?? null);
    if (!back.size) return none;
    this.write((t) => (back.has(t.id) ? withTemplateFolder(t, to) : t));
    const undo = () => this.write((t) => (back.has(t.id) && (t.folder ?? null) === to ? withTemplateFolder(t, back.get(t.id)!) : t));
    return { moved: back.size, undo };
  }

  /** Uma mini-pasta nova ("Nova pasta", sem repetir as outras). Null: sem lugar. */
  create(name: string): NoteFolder | null {
    return this.folders.createIn(this.group, null, name);
  }

  rename(id: string, name: string): () => void {
    return this.folders.rename(id, name);
  }

  /** Desfaz a pasta: os templates de dentro ficam soltos (nenhum é apagado nem regravado). Devolve como desfazer. */
  dissolve(id: string): () => void {
    return this.folders.dissolve(id);
  }

  /** Muda os templates de uma vez só (uma gravação, uma data nova). */
  private write(change: (t: NoteTemplate) => NoteTemplate): void {
    const now = this.settings.notesConfig().templates;
    const next = now.map(change);
    if (next.some((t, i) => t !== now[i])) this.settings.setNotesConfig({ templates: next });
  }
}
