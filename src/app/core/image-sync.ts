import { Injectable, inject, signal } from '@angular/core';
import { CloudAccount, CloudError } from './cloud-account';
import { ImageStore } from './image-store';
import { Cloud } from './cloud-config';

/** Por que as imagens pararam de subir, para a folha da imagem e o Sair dizerem. */
export interface ImageSendProblem {
  code: string;
  message: string;
}

/** O porquê curto, para caber numa frase ("…ainda não subiu para a nuvem (sem conexão)"). */
export function shortReason(problem: ImageSendProblem | null): string | null {
  if (!problem) return null;
  const known: Record<string, string> = {
    'sem-rede': 'sem conexão',
    'imagens-hoje': 'chegou ao limite de imagens do dia',
    'cota-imagens': 'o espaço de imagens da sua conta acabou',
    'imagens-cheio': 'a nuvem está sem lugar para imagens',
    'cota-diaria': 'a nuvem chegou ao limite de hoje',
  };
  return known[problem.code] ?? 'a nuvem não aceitou agora';
}

/** Quanto tempo a fila espera depois de um "não" que não passa logo (o limite do dia, a cota, a nuvem cheia). */
const WAIT_AFTER: Record<string, number> = {
  'imagens-hoje': 60 * 60_000,
  'cota-imagens': 60 * 60_000,
  'imagens-cheio': 6 * 60 * 60_000,
  'cota-diaria': 60 * 60_000,
  'imagens-indisponiveis': 15 * 60_000,
};
/** O que a nuvem nunca vai aceitar para aquela imagem (mandar de novo não adianta). */
const NEVER = new Set(['imagem-grande', 'imagem-tipo', 'imagem-vazia', 'imagem-id-em-uso', 'imagem-diferente']);
/** Depois de não achar uma imagem na nuvem, quanto esperar para perguntar de novo. */
const MISSING_RETRY_MS = 60_000;
/** Quantas imagens descem ao mesmo tempo (um aparelho novo abrindo um mural cheio não dispara cem pedidos). */
const PARALLEL = 4;

/**
 * As imagens coladas e a nuvem (PLANO-IMAGENS.md, rodada 3): a fila que manda as que só estão aqui
 * (`PUT /v1/imagens/:id`, uma por vez) e a descida da que falta neste aparelho (`GET`, até quatro ao
 * mesmo tempo). Quem decide quando mandar é a sincronização (core/cloud-sync.ts): só com a conta dona
 * do mural deste navegador.
 *
 * O plano grátis é poupado: cada imagem sobe uma vez; cada aparelho baixa cada imagem uma vez (fica no
 * IndexedDB); a que falta na nuvem só é pedida de novo depois de um minuto; e um "não" que não passa
 * logo (o limite do dia, a cota da conta, a nuvem cheia) para a fila por um tempo, em vez de insistir a
 * cada sincronização.
 */
@Injectable({ providedIn: 'root' })
export class ImageSync {
  private readonly account = inject(CloudAccount);
  private readonly images = inject(ImageStore);
  private readonly cloud = inject(Cloud);

  /** O último "não" da nuvem para a fila (null: subindo, ou nada a subir). */
  readonly problem = signal<ImageSendProblem | null>(null);
  /** Sobe a cada rodada da sincronização: quem não achou uma imagem procura de novo (passado o minuto). */
  readonly round = signal(0);

  private sending: Promise<void> | null = null;
  private waitUntil = 0;
  private readonly missing = new Map<string, number>();
  private readonly loading = new Map<string, Promise<string | null>>();
  private active = 0;
  private readonly queue: (() => void)[] = [];

  /** Manda as que só estão aqui, uma por vez; para no primeiro "não" que não é só daquela imagem. */
  send(now = Date.now()): Promise<void> {
    if (this.sending) return this.sending;
    if (now < this.waitUntil || !this.account.signedIn()) return Promise.resolve();
    this.sending = this.sendAll().finally(() => (this.sending = null));
    return this.sending;
  }

  private async sendAll(): Promise<void> {
    for (const image of await this.images.pending()) {
      try {
        await this.account.requestRaw(`/v1/imagens/${image.id}`, { method: 'PUT', body: image.blob, headers: { 'Content-Type': image.tipo } });
        await this.images.mark(image.id, 'na-nuvem');
        this.problem.set(null);
      } catch (error) {
        if (!(error instanceof CloudError)) throw error;
        if (NEVER.has(error.code)) {
          await this.images.mark(image.id, 'recusada');
          continue;
        }
        this.problem.set({ code: error.code, message: error.message });
        this.waitUntil = Date.now() + (WAIT_AFTER[error.code] ?? 0);
        return;
      }
    }
  }

  /**
   * A nuvem disse que o mural usa estas imagens e ela não as tem (apagadas por estarem soltas enquanto um
   * aparelho que as usava ficou fora): as que estão aqui, suas, voltam para a fila e sobem de novo.
   */
  async lost(ids: readonly string[]): Promise<number> {
    let again = 0;
    for (const id of ids) {
      const image = await this.images.get(id);
      if (!image || image.alheia || image.estado !== 'na-nuvem') continue;
      await this.images.mark(id, 'local');
      again++;
    }
    return again;
  }

  /** Começa a próxima rodada: a fila pode tentar de novo depois de esperar (a pessoa pediu, ou apagou uma). */
  retry(): void {
    this.waitUntil = 0;
  }

  /**
   * O endereço da imagem que não está neste aparelho, baixada da nuvem com a sessão (e guardada aqui),
   * ou null: fora da conta, a nuvem não tem (ou não é sua), ou pediu há menos de um minuto.
   */
  fetch(id: string, now = Date.now()): Promise<string | null> {
    if (!this.account.signedIn()) return Promise.resolve(null);
    const known = this.loading.get(id);
    if (known) return known;
    const missed = this.missing.get(id);
    if (missed !== undefined && now - missed < MISSING_RETRY_MS) return Promise.resolve(null);
    const job = this.slot(() => this.download(id)).finally(() => this.loading.delete(id));
    this.loading.set(id, job);
    return job;
  }

  private async download(id: string): Promise<string | null> {
    try {
      const res = await this.account.requestRaw(`/v1/imagens/${id}`);
      const blob = await res.blob();
      const { width, height } = await sizeOf(blob);
      // de outra pessoa (a nuvem diz): fica para mostrar, mas não é mural seu
      await this.images.fromCloud(id, blob, width, height, res.headers.get('Imagem-Sua') === '0');
      this.missing.delete(id);
      return this.images.url(id);
    } catch {
      this.missing.set(id, Date.now());
      return null;
    }
  }

  /** Até `PARALLEL` descidas ao mesmo tempo; as outras esperam a vez. */
  private async slot<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= PARALLEL) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await job();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }

  /**
   * O endereço da imagem para quem visita sem conta: um `<img>` comum direto na nuvem, sem sessão e sem
   * guardar nada (o navegador guarda 7 dias); a nuvem só entrega a que está à mostra. Null sem nuvem.
   */
  publicUrl(id: string): string | null {
    const api = this.cloud.config()?.api;
    return api ? `${api}/v1/imagens/${id}` : null;
  }

  /** A sincronização terminou uma rodada: as que faltavam são procuradas de novo. */
  synced(): void {
    this.round.update((n) => n + 1);
  }
}

/** A largura e a altura de uma imagem (para a folha dizer o tamanho); 0 se o navegador não abrir. */
async function sizeOf(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}
