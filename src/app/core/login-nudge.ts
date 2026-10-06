import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CloudAccount } from './cloud-account';
import { Cloud } from './cloud-config';
import { ReviewStore } from './review-store';

/**
 * O convite para entrar com o Google, na faixa de avisos: para quem tem um mural só neste navegador
 * (e a nuvem ligada). Aparece no máximo uma vez a cada 2 dias: ao aparecer, a próxima vez já fica
 * para dali a 2 dias; fechar também. Enquanto a página estiver aberta, ele fica até ser fechado.
 */
export const NUDGE_EVERY_MS = 2 * 24 * 60 * 60_000;
const KEY = 'meu-mural:lembrete-conta';

/** Já pode aparecer? (`next`: a hora guardada, ou null se nunca apareceu.) */
export function nudgeDue(next: string | null, now: number): boolean {
  if (!next) return true;
  const t = Date.parse(next);
  return !Number.isFinite(t) || now >= t;
}

function readNext(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeNext(at: number): void {
  try {
    localStorage.setItem(KEY, new Date(at).toISOString());
  } catch {
    /* sem armazenamento: aparece a cada abertura, o que ainda é melhor que nunca */
  }
}

@Injectable({ providedIn: 'root' })
export class LoginNudge {
  private readonly cloud = inject(Cloud);
  private readonly account = inject(CloudAccount);
  private readonly store = inject(ReviewStore);

  /** Pode aparecer nesta abertura (decidido uma vez, ao abrir). */
  private readonly dueNow = signal(nudgeDue(readNext(), Date.now()));
  private readonly closed = signal(false);

  /** A nuvem ligada, ninguém logado e um mural que valha guardar. */
  private readonly wanted = computed(() => !!this.cloud.config() && !this.account.signedIn() && this.store.hasContent());

  readonly visible = computed(() => this.dueNow() && !this.closed() && this.wanted());

  constructor() {
    // apareceu: a próxima vez fica para daqui a 2 dias, feche ou não
    effect(() => {
      if (!this.visible()) return;
      untracked(() => writeNext(Date.now() + NUDGE_EVERY_MS));
    });
  }

  close(): void {
    this.closed.set(true);
    writeNext(Date.now() + NUDGE_EVERY_MS);
  }
}
