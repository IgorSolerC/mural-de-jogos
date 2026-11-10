import { Injectable, inject, signal } from '@angular/core';
import { readBackupFile } from './backup-file';
import { CloudAccount } from './cloud-account';
import { FreeBoard, sanitizeFreeBoard, sortBoards } from './free-board';

/**
 * Os quadros públicos de quem você visita (PLANO-QUADRO-LIVRE.md, 4.8): a lista e cada quadro, pelo código do
 * mural, guardados só na memória da página (como o mural do colega). A visita monta com eles as mesmas peças do
 * dono (ui/visit-boards.ts).
 */
@Injectable({ providedIn: 'root' })
export class VisitBoards {
  private readonly account = inject(CloudAccount);
  /** O código de quem os quadros são (o de agora). */
  readonly code = signal<string | null>(null);
  readonly boards = signal<readonly FreeBoard[]>([]);
  /** Lendo a lista (a seção ainda não sabe se há quadros). */
  readonly loading = signal(false);
  private loaded: string | null = null;

  /** Traz os quadros públicos do código (de novo só se o código mudou, ou `force`). */
  async load(code: string | null | undefined, force = false): Promise<void> {
    if (!code) {
      this.code.set(null);
      this.boards.set([]);
      return;
    }
    if (this.loaded === code && !force) return;
    this.loaded = code;
    this.code.set(code);
    this.loading.set(true);
    try {
      const res = await this.account.requestRaw(`/v1/murais/${encodeURIComponent(code)}/quadros`);
      const list = ((await res.json().catch(() => null)) as { quadros?: { id: string }[] } | null)?.quadros ?? [];
      const out: FreeBoard[] = [];
      for (let k = 0; k < list.length; k += 4) {
        const batch = await Promise.all(list.slice(k, k + 4).map((q) => this.fetch(code, q.id)));
        out.push(...batch.filter((b): b is FreeBoard => !!b));
      }
      if (this.loaded === code) this.boards.set(sortBoards(out));
    } catch {
      // sem nuvem, o mural de um arquivo, o código que não existe mais: sem quadros
      if (this.loaded === code) this.boards.set([]);
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
