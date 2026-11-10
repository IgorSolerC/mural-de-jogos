import { Injectable, inject, signal } from '@angular/core';
import { readBackupFile } from './backup-file';
import { CloudAccount } from './cloud-account';
import { FreeBoard, sanitizeFreeBoard, sortBoards } from './free-board';

/**
 * Os quadros públicos de quem você visita (PLANO-QUADRO-LIVRE.md, 4.8): a lista e cada quadro, pelo código do
 * mural, guardados só na memória da página (como o mural do colega). A visita monta com eles as mesmas peças do
 * dono (ui/visit-boards.ts).
 */
/** De quanto em quanto tempo a seção confere de novo a lista ao aparecer. */
export const REFRESH_MS = 120_000;

@Injectable({ providedIn: 'root' })
export class VisitBoards {
  private readonly account = inject(CloudAccount);
  /** O código de quem os quadros são (o de agora). */
  readonly code = signal<string | null>(null);
  readonly boards = signal<readonly FreeBoard[]>([]);
  /** Lendo a lista (a seção ainda não sabe se há quadros). */
  readonly loading = signal(false);
  /** A lista não veio (sem rede, a nuvem fora) e não há nenhum quadro de antes para mostrar. */
  readonly failed = signal(false);
  private loaded: string | null = null;
  private loadedAt = 0;
  /** Os quadros já trazidos deste código, com a versão: a volta só baixa os que mudaram. */
  private cache = new Map<string, { rev: number; board: FreeBoard }>();

  /**
   * Traz os quadros públicos do código: de novo quando o código muda, quando a seção aparece passados
   * `REFRESH_MS` (o quadro que a pessoa acabou de tornar público aparece) ou com `force`. Só os quadros
   * novos ou mudados são baixados (a miniatura da lista é desenhada com os dados de cada um).
   */
  async load(code: string | null | undefined, force = false): Promise<void> {
    if (!code) {
      this.code.set(null);
      this.boards.set([]);
      this.loaded = null;
      this.cache.clear();
      return;
    }
    if (this.loaded === code && !force && Date.now() - this.loadedAt < REFRESH_MS) return;
    if (this.loaded !== code) {
      this.cache.clear();
      this.boards.set([]);
    }
    this.loaded = code;
    this.loadedAt = Date.now();
    this.code.set(code);
    this.loading.set(!this.boards().length);
    try {
      const res = await this.account.requestRaw(`/v1/murais/${encodeURIComponent(code)}/quadros`);
      const list = (((await res.json().catch(() => null)) as { quadros?: { id: string; rev?: number }[] } | null)?.quadros ?? []).filter((q) => typeof q?.id === 'string');
      const out: FreeBoard[] = [];
      const next = new Map<string, { rev: number; board: FreeBoard }>();
      const kept = list.filter((q) => {
        const had = this.cache.get(q.id);
        if (!had || had.rev !== q.rev) return true;
        out.push(had.board);
        next.set(q.id, had);
        return false;
      });
      for (let k = 0; k < kept.length; k += 4) {
        const batch = await Promise.all(kept.slice(k, k + 4).map(async (q) => ({ q, board: await this.fetch(code, q.id) })));
        for (const { q, board } of batch) {
          if (!board) continue;
          out.push(board);
          next.set(q.id, { rev: q.rev ?? 0, board });
        }
      }
      if (this.loaded !== code) return;
      this.failed.set(false);
      this.cache = next;
      this.boards.set(sortBoards(out));
    } catch {
      // sem nuvem, o mural de um arquivo, o código que não existe mais: fica o que já estava (nada, na primeira)
      if (this.loaded === code) {
        this.loadedAt = 0;
        this.failed.set(!this.boards().length);
      }
    } finally {
      if (this.loaded === code) this.loading.set(false);
    }
  }

  private async fetch(code: string, id: string): Promise<FreeBoard | null> {
    try {
      const res = await this.account.requestRaw(`/v1/murais/${encodeURIComponent(code)}/quadros/${id}`);
      return sanitizeFreeBoard(JSON.parse(await readBackupFile(await res.blob())));
    } catch {
      return null;
    }
  }
}
