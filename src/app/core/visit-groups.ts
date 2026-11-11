import { Injectable, inject, signal } from '@angular/core';
import { CloudAccount } from './cloud-account';
import { CategoryLook } from './category-looks';
import { KanbanBoard, sanitizeBoard } from './kanban';
import { Review, isNote, sanitizeReview } from './review';
import { GroupDoc, parseGroupDoc } from './shared-groups';

/**
 * Os grupos públicos de quem você visita (PLANO-COMPARTILHAR.md, 4.6): servidos pela nuvem, e não pelo mural
 * público que o aparelho do dono monta, para a edição de qualquer pessoa do grupo aparecer sem esperar o site
 * do dono abrir. Guardados só na memória da página (como o mural do colega e os quadros dele). A visita monta
 * com eles as mesmas peças do dono: as anotações vão para o mural da visita, no grupo delas, e o quadro do
 * Kanban vai para a peça do quadro.
 */

/** De quanto em quanto tempo a visita confere de novo os grupos públicos. */
export const REFRESH_MS = 120_000;
/** O máximo de páginas de anotações de um grupo (200 cada). */
const MAX_PAGES = 10;

export interface VisitGroup {
  id: string;
  nome: string;
  look: CategoryLook;
  /** O quadro do Kanban do grupo (null: ninguém mexeu nele). */
  board: KanbanBoard | null;
  /** A versão que a nuvem deu (o grupo e as anotações dele): a volta só baixa o que mudou. */
  versao: string;
  notes: Review[];
}

@Injectable({ providedIn: 'root' })
export class VisitGroups {
  private readonly account = inject(CloudAccount);
  readonly code = signal<string | null>(null);
  readonly groups = signal<readonly VisitGroup[]>([]);
  private loaded: string | null = null;
  private loadedAt = 0;

  /** As anotações de todos os grupos públicos, cada uma no grupo dela. */
  notes(): Review[] {
    return this.groups().flatMap((g) => g.notes);
  }

  /** O desenho e a cor de cada grupo público, para as abas e as orelhas da visita. */
  looks(): Record<string, CategoryLook> {
    return Object.fromEntries(this.groups().map((g) => [g.nome, g.look]));
  }

  /** Traz os grupos públicos do código (de novo quando ele muda, passados `REFRESH_MS`, ou com `force`). */
  async load(code: string | null | undefined, force = false): Promise<void> {
    if (!code) {
      this.code.set(null);
      this.groups.set([]);
      this.loaded = null;
      return;
    }
    if (this.loaded === code && !force && Date.now() - this.loadedAt < REFRESH_MS) return;
    if (this.loaded !== code) this.groups.set([]);
    this.loaded = code;
    this.loadedAt = Date.now();
    this.code.set(code);
    try {
      const res = await this.account.requestRaw(`/v1/murais/${encodeURIComponent(code)}/grupos`);
      const list = (((await res.json().catch(() => null)) as { grupos?: { id?: unknown }[] } | null)?.grupos ?? []).filter(
        (g): g is { id: string } => typeof g?.id === 'string',
      );
      const before = new Map(this.groups().map((g) => [g.id, g]));
      const out: VisitGroup[] = [];
      for (const { id } of list) {
        const g = await this.fetch(code, id, before.get(id));
        if (g) out.push(g);
      }
      if (this.loaded === code) this.groups.set(out);
    } catch {
      // sem nuvem, o código que não existe mais: fica o que já estava
      if (this.loaded === code) this.loadedAt = 0;
    }
  }

  /** Um grupo público, com todas as páginas de anotações; o de antes, se nada mudou (204). */
  private async fetch(code: string, id: string, had: VisitGroup | undefined): Promise<VisitGroup | null> {
    const base = `/v1/murais/${encodeURIComponent(code)}/grupos/${encodeURIComponent(id)}`;
    try {
      const first = await this.account.requestRaw(had ? `${base}?versao=${encodeURIComponent(had.versao)}` : base);
      if (first.status === 204 && had) return had;
      let page = (await first.json()) as { grupo?: { versao?: unknown; dados?: unknown }; notas?: unknown[]; depois?: unknown };
      const doc: GroupDoc | null = parseGroupDoc(page.grupo?.dados);
      if (!doc) return null;
      const versao = typeof page.grupo?.versao === 'string' ? page.grupo.versao : '';
      const raw: unknown[] = [...(page.notas ?? [])];
      for (let i = 0; i < MAX_PAGES && typeof page.depois === 'string'; i++) {
        page = (await (await this.account.requestRaw(`${base}?depois=${encodeURIComponent(page.depois as string)}`)).json()) as typeof page;
        raw.push(...(page.notas ?? []));
      }
      const notes = raw
        .map((r) => sanitizeReview(r))
        .filter((r): r is Review => !!r && isNote(r))
        // no grupo dele, com o nome que o dono deu (a pasta é de cada um: fica de fora)
        .map(({ folder: _f, subject: _s, ...r }) => ({ ...r, category: doc.nome }) as Review);
      const a = doc.aparencia;
      const look = { ...(a?.icone ? { icon: a.icone } : {}), ...(a?.cor ? { color: a.cor } : {}) } as CategoryLook;
      const board = doc['kanban'] ? sanitizeBoard({ ...(doc['kanban'] as Record<string, unknown>), category: doc.nome }) : null;
      return { id, nome: doc.nome, look, board, versao, notes };
    } catch {
      return had ?? null;
    }
  }
}
