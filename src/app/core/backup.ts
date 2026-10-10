import { Injectable, computed, inject, signal } from '@angular/core';
import { localDay } from './review';
import { ReviewStore } from './review-store';
import { CloudSync } from './cloud-sync';
import { Settings } from './settings';

const KEY = 'mural-de-jogos:backup:v1';
const DAY = 86_400_000;
/** Depois de quantos dias sem backup, com coisa nova no mural, o bilhete aparece. */
export const BACKUP_EVERY_DAYS = 30;
/** Sincronizado com a nuvem há menos que isso, o bilhete do backup não aparece. */
const CLOUD_FRESH_DAYS = 7;
/** "Depois" cala o bilhete por uma semana. */
const SNOOZE_DAYS = 7;
/** Quem nunca baixou um backup ouve falar dele a partir de tantas fichas. */
const FIRST_AT = 5;

interface Stored {
  lastAt: string | null;
  snoozeUntil: string | null;
}

function read(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const iso = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
    return { lastAt: iso(raw.lastAt), snoozeUntil: iso(raw.snoozeUntil) };
  } catch {
    return { lastAt: null, snoozeUntil: null };
  }
}

/**
 * O nome do arquivo: "meu-mural-de-igor-2026-10-05.json.gz", ou "meu-mural-2026-10-05.json.gz" sem
 * nome. O Comparar tira o nome daqui quando o arquivo é de antes do campo (ver `nameFromFile`).
 */
export function backupFileName(ownerName: string, day: string, ext: string): string {
  const slug = ownerName
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|.,;'`~!@#$%^&()[\]{}=+]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return `meu-mural-${slug ? `de-${slug}-` : ''}${day}.${ext}`;
}

/**
 * Cuidar para as resenhas não sumirem: sem conta, elas moram só neste navegador. Baixa o backup,
 * lembra de baixar de novo quando faz tempo (menos com o mural em dia na nuvem), e pede ao navegador
 * para não apagar os dados sozinho.
 */
@Injectable({ providedIn: 'root' })
export class Backup {
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(Settings);
  private readonly state = signal<Stored>(read());

  private readonly sync = inject(CloudSync);

  readonly lastAt = computed(() => this.state().lastAt);
  /**
   * O mural está guardado na nuvem (sincronizou nos últimos 7 dias): aí o backup é só uma cópia a
   * mais, e o bilhete não insiste.
   */
  readonly inCloud = computed(() => {
    const at = this.sync.lastSyncAt();
    return this.sync.active() && at !== null && Date.now() - at < CLOUD_FRESH_DAYS * DAY;
  });
  /** O navegador prometeu não apagar os dados (null: ainda não se sabe). */
  readonly persisted = signal<boolean | null>(null);

  /**
   * O bilhete do backup: null se está tudo em dia; senão, há quantos dias foi o último (0 = nunca).
   * Só aparece se há coisa mudada depois do último backup.
   */
  readonly due = computed<number | null>(() => {
    if (this.inCloud()) return null;
    const { lastAt, snoozeUntil } = this.state();
    const now = Date.now();
    if (snoozeUntil && Date.parse(snoozeUntil) > now) return null;
    const reviews = this.store.reviews();
    if (!lastAt) return reviews.length >= FIRST_AT ? 0 : null;
    const days = Math.floor((now - Date.parse(lastAt)) / DAY);
    if (days < BACKUP_EVERY_DAYS) return null;
    // qualquer mudança conta: resenha, pendente, desejo, ou algo apagado
    return this.store.lastChangeAt() > Date.parse(lastAt) ? days : null;
  });

  constructor() {
    void navigator.storage?.persisted?.().then((p) => this.persisted.set(p), () => undefined);
  }

  async download(): Promise<void> {
    const { blob, ext } = await this.store.exportBackup(this.settings.ownerName());
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // o dia daqui, não o de Greenwich: depois das 21h o nome já sairia com a data de amanhã
    a.download = backupFileName(this.settings.ownerName(), localDay(new Date()), ext);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.save({ lastAt: new Date().toISOString(), snoozeUntil: null });
  }

  snooze(): void {
    this.save({ ...this.state(), snoozeUntil: new Date(Date.now() + SNOOZE_DAYS * DAY).toISOString() });
  }

  /**
   * Pede para o navegador não apagar o mural quando faltar espaço (o Safari apaga o que um site
   * guarda se ele passa uma semana sem ser aberto). Chamado ao pregar uma ficha: o Firefox pergunta,
   * e a pergunta faz sentido nessa hora.
   */
  async protect(): Promise<void> {
    if (this.persisted() !== false || !navigator.storage?.persist) return;
    this.persisted.set(await navigator.storage.persist());
  }

  private save(next: Stored): void {
    this.state.set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }
}
