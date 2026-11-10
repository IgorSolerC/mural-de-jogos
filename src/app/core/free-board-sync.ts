import { DestroyRef, Injectable, effect, inject, untracked } from '@angular/core';
import { gzip, readBackupFile } from './backup-file';
import { CloudAccount, CloudError } from './cloud-account';
import { FreeBoard, boardSources, sanitizeFreeBoard } from './free-board';
import { BoardRecord, FreeBoardStore } from './free-board-store';
import { localImageIds } from './images';
import { readText, writeText } from './storage';

/** Quanto tempo depois da última mudança o quadro sobe (seção 7.4 do plano). */
export const PUSH_AFTER_MS = 4_000;
/** Depois de uma falha (sem rede, a cota do dia, devagar), quando tenta de novo. */
const RETRY_MS = 60_000;
/** Quantas vezes junta e tenta de novo depois de um 409. */
const MAX_TRIES = 3;
/** O último `Quadros-Versao` que este aparelho conferiu (sai na limpeza do Sair: começa com `meu-mural:`). */
export const BOARDS_VERSION_KEY = 'meu-mural:quadros-versao';

interface RemoteItem {
  id: string;
  rev: number;
  apagado?: string;
}

/**
 * Os quadros do Quadro livre na nuvem (PLANO-QUADRO-LIVRE.md, seção 7), um por um, fora do mural: mexer num
 * quadro manda só ele, 4 s depois da última mudança (e ao esconder a aba, com `keepalive`). Quem gravou no meio
 * dá 409: o site baixa o de agora, junta em três vias e manda de novo. A lápide de um quadro apagado aqui sobe
 * como DELETE.
 *
 * Saber que algum quadro mudou em outro aparelho não custa pedido: o GET do mural, que o site já faz, traz o
 * `Quadros-Versao`, e só quando ele muda a lista dos quadros é pedida (`noteVersion`, chamado de CloudSync).
 */
@Injectable({ providedIn: 'root' })
export class FreeBoardSync {
  private readonly account = inject(CloudAccount);
  private readonly store = inject(FreeBoardStore);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private again = false;
  private pullWanted: string | null = null;

  constructor() {
    // uma mudança daqui: o envio espera 4 s parado
    effect(() => {
      this.store.version();
      if (!this.account.signedIn()) return;
      untracked(() => this.schedule(PUSH_AFTER_MS));
    });
    const hide = () => {
      if (document.visibilityState === 'hidden') void this.flush(true);
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', hide);
    inject(DestroyRef, { optional: true })?.onDestroy(() => {
      clearTimeout(this.timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', hide);
    });
  }

  /** O `Quadros-Versao` do GET do mural: mudou desde a última conferência, a lista dos quadros é pedida. */
  noteVersion(raw: string | null): void {
    if (raw === null || !/^\d{1,16}$/.test(raw)) return;
    if (raw === readText(BOARDS_VERSION_KEY)) return;
    this.pullWanted = raw;
    this.schedule(0);
  }

  /** Manda agora o que está por mandar (o Pronto, fechar o quadro, esconder a aba). */
  flush(keepalive = false): Promise<void> {
    clearTimeout(this.timer);
    return this.run(keepalive);
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(false), ms);
  }

  /** Uma rodada por vez: a lista (se o contador mudou) e os envios. */
  private run(keepalive: boolean): Promise<void> {
    if (!this.account.signedIn()) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        if (this.pullWanted !== null) await this.pull();
        await this.push(keepalive);
      } catch (e) {
        // sem rede, a cota do dia, a nuvem fora: tudo continua neste aparelho e tenta de novo depois
        if (!(e instanceof CloudError) || e.status !== 401) this.schedule(RETRY_MS);
      } finally {
        this.running = null;
        if (this.again) {
          this.again = false;
          this.schedule(PUSH_AFTER_MS);
        }
      }
    })();
    return this.running;
  }

  // ===== baixar =====

  private async pull(): Promise<void> {
    const wanted = this.pullWanted;
    const res = await this.account.requestRaw('/v1/eu/quadros');
    const versao = res.headers.get('Quadros-Versao') ?? wanted;
    const body = (await res.json().catch(() => null)) as { quadros?: RemoteItem[] } | null;
    const remote = new Map((body?.quadros ?? []).filter((q) => typeof q?.id === 'string' && Number.isSafeInteger(q.rev)).map((q) => [q.id, q]));
    for (const rec of await this.store.all()) {
      const r = remote.get(rec.id);
      if (!r) {
        // a nuvem não tem mais (a lápide saiu depois de 30 dias): o que ainda está aqui sobe de novo, como novo
        if (rec.rev > 0) await (rec.quadro ? this.store.resetRev(rec.id) : this.store.dropRecord(rec.id));
        continue;
      }
      if (r.apagado) {
        // apagado em outro aparelho: sem mudança aqui, sai; mexido aqui, vira uma cópia (mexida vence apagada)
        if (rec.quadro && rec.sujo) await this.store.keepCopy(rec.id);
        else await this.store.dropRecord(rec.id);
        continue;
      }
      if (r.rev > rec.rev) await this.fetchInto(rec.id, r.rev, rec);
    }
    // os que existem na nuvem e não aqui (o primeiro login deste aparelho, um quadro novo de outro)
    const here = new Set((await this.store.all()).map((r) => r.id));
    const missing = [...remote.values()].filter((r) => !r.apagado && !here.has(r.id));
    for (let k = 0; k < missing.length; k += 4) {
      await Promise.all(missing.slice(k, k + 4).map((r) => this.fetchInto(r.id, r.rev, null)));
    }
    if (versao !== null) writeText(BOARDS_VERSION_KEY, versao);
    if (this.pullWanted === wanted) this.pullWanted = null;
  }

  /** Baixa o quadro e o junta com o daqui (o 410 é o apagado no meio: a próxima lista resolve). */
  private async fetchInto(id: string, rev: number, rec: BoardRecord | null): Promise<void> {
    let res: Response;
    try {
      res = await this.account.requestRaw(`/v1/eu/quadros/${id}${rec?.rev ? `?rev=${rec.rev}` : ''}`);
    } catch (e) {
      if (e instanceof CloudError && (e.status === 404 || e.status === 410)) return;
      throw e;
    }
    if (res.status === 204) return;
    const board = await readBoard(res);
    const at = Number(res.headers.get('Quadro-Rev')) || rev;
    if (board) await this.store.applyRemote(id, board, at);
  }

  // ===== enviar =====

  private async push(keepalive: boolean): Promise<void> {
    for (const rec of await this.store.dirty()) {
      if (!rec.quadro) {
        await this.account.requestRaw(`/v1/eu/quadros/${rec.id}`, { method: 'DELETE', keepalive });
        await this.store.dropRecord(rec.id);
        continue;
      }
      await this.send(rec, keepalive, 0);
    }
  }

  private async send(rec: BoardRecord, keepalive: boolean, tries: number): Promise<void> {
    const board = rec.quadro!;
    const body = await gzip(JSON.stringify(board));
    const images = localImageIds(boardSources(board));
    try {
      const res = await this.account.requestRaw(`/v1/eu/quadros/${rec.id}`, {
        method: 'PUT',
        // `keepalive` aceita até 64 KB: o quadro maior vai na próxima rodada
        keepalive: keepalive && body.size < 60_000,
        headers: {
          'Content-Type': 'application/gzip',
          'Quadro-Rev-Base': String(rec.rev),
          // público: quem visita o mural vê o quadro e as imagens dele (rodada 6)
          'Quadro-Publico': board.publico ? '1' : '0',
          ...(images.length ? { 'Quadro-Imagens': images.join(',') } : {}),
        },
        body,
      });
      const out = (await res.json().catch(() => null)) as { rev?: number } | null;
      if (typeof out?.rev === 'number') await this.store.markSynced(rec.id, out.rev, board);
    } catch (e) {
      if (!(e instanceof CloudError) || e.status !== 409 || tries >= MAX_TRIES) throw e;
      const conflict = e.body as { rev?: number; apagado?: string } | null;
      if (conflict?.apagado) {
        await this.store.keepCopy(rec.id);
        return;
      }
      // outro aparelho gravou antes: baixa o de agora, junta e manda de novo
      if (typeof conflict?.rev === 'number' && conflict.rev > 0) await this.fetchInto(rec.id, conflict.rev, { ...rec, rev: 0 });
      else await this.store.resetRev(rec.id);
      const next = (await this.store.dirty()).find((r) => r.id === rec.id);
      if (next?.quadro) await this.send(next, keepalive, tries + 1);
    }
  }
}

/** O quadro que veio da nuvem (gzip), ou null se não abre. */
async function readBoard(res: Response): Promise<FreeBoard | null> {
  try {
    return sanitizeFreeBoard(JSON.parse(await readBackupFile(await res.blob())));
  } catch {
    return null;
  }
}
