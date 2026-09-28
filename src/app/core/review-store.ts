import { Injectable, computed, effect, signal } from '@angular/core';
import { KINDS } from './kinds';
import { Bonus, Draft, Kind, Review, STOCKS, Stock, isCatalogBonus, sanitizeDraft, sanitizeReview } from './review';

const KEY = 'mural-de-jogos:resenhas:v1';
const DRAFTS_KEY = 'mural-de-jogos:pendentes:v1';
/** Quando cada resenha e cada pendente foi apagado: sem isso, juntar um backup antigo traria tudo de volta. */
const DELETED_KEY = 'mural-de-jogos:apagadas:v1';

/** id → quando foi apagado (ISO). */
export interface Deleted {
  reviews: Record<string, string>;
  drafts: Record<string, string>;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  /** Pendentes (só nome e capa) que entraram na fila. */
  drafts: number;
  /** Resenhas daqui que o backup diz que foram apagadas depois da última mudança nelas. */
  removed: number;
}

@Injectable({ providedIn: 'root' })
export class ReviewStore {
  readonly reviews = signal<Review[]>(this.read());
  /** Mensagem quando o navegador recusa salvar (cota cheia, modo privado…). */
  readonly saveError = signal<string | null>(null);
  readonly count = computed(() => this.reviews().length);
  /** Guardados para resenhar depois, o mais recente primeiro (de todos os murais: ver `Mural`). */
  readonly drafts = signal<Draft[]>(this.readDrafts());
  readonly draftCount = computed(() => this.drafts().length);
  private readonly deleted = signal<Deleted>(this.readDeleted());
  /**
   * Os bônus que a pessoa escreveu, tirados das próprias fichas de cada mural: o mais usado primeiro.
   * Não há lista para cuidar; um bônus que nenhuma ficha usa mais some sozinho.
   */
  readonly customBonuses = computed<Record<Kind, Bonus[]>>(() => {
    const seen = Object.fromEntries(KINDS.map((k) => [k, new Map<string, { bonus: Bonus; n: number }>()])) as Record<
      Kind,
      Map<string, { bonus: Bonus; n: number }>
    >;
    for (const r of this.reviews()) {
      for (const b of r.bonuses) {
        if (isCatalogBonus(r.kind, b.id)) continue;
        const hit = seen[r.kind].get(b.id);
        if (hit) hit.n++;
        else seen[r.kind].set(b.id, { bonus: b, n: 1 });
      }
    }
    const sorted = (m: Map<string, { bonus: Bonus; n: number }>) =>
      [...m.values()].sort((a, b) => b.n - a.n || a.bonus.label.localeCompare(b.bonus.label, 'pt-BR')).map((x) => x.bonus);
    return Object.fromEntries(KINDS.map((k) => [k, sorted(seen[k])])) as Record<Kind, Bonus[]>;
  });

  private skipNextWrite = false;
  private skipNextDraftWrite = false;
  private skipNextDeletedWrite = false;

  constructor() {
    effect(() => {
      const list = this.reviews();
      if (this.skipNextWrite) {
        this.skipNextWrite = false;
        return;
      }
      this.write(KEY, list);
    });
    effect(() => {
      const list = this.drafts();
      if (this.skipNextDraftWrite) {
        this.skipNextDraftWrite = false;
        return;
      }
      this.write(DRAFTS_KEY, list);
    });
    effect(() => {
      const d = this.deleted();
      if (this.skipNextDeletedWrite) {
        this.skipNextDeletedWrite = false;
        return;
      }
      this.write(DELETED_KEY, d);
    });

    // Outra aba mexeu no mural: acompanha sem sobrescrever.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === KEY) {
          this.skipNextWrite = true;
          this.reviews.set(this.read());
        } else if (e.key === DRAFTS_KEY) {
          this.skipNextDraftWrite = true;
          this.drafts.set(this.readDrafts());
        } else if (e.key === DELETED_KEY) {
          this.skipNextDeletedWrite = true;
          this.deleted.set(this.readDeleted());
        }
      });
    }
  }

  /** A cor com que a ficha nova nasce: sorteada, só não repete a da última pregada no mural. A pessoa troca no editor. */
  nextStock(kind: Kind): Stock {
    const latest = this.reviews().filter((r) => r.kind === kind).reduce<Review | null>(
      (acc, r) => (!acc || Date.parse(r.createdAt) > Date.parse(acc.createdAt) ? r : acc),
      null,
    );
    const pool = STOCKS.filter((s) => s !== latest?.stock);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  get(id: string): Review | undefined {
    return this.reviews().find((r) => r.id === id);
  }

  add(review: Review): void {
    const withStock = review.stock ? review : { ...review, stock: this.nextStock(review.kind) };
    this.reviews.update((list) => [withStock, ...list]);
  }

  update(review: Review): void {
    this.reviews.update((list) => list.map((r) => (r.id === review.id ? review : r)));
  }

  remove(id: string): Review | undefined {
    const found = this.get(id);
    if (found) {
      this.reviews.update((list) => list.filter((r) => r.id !== id));
      this.mark('reviews', id);
    }
    return found;
  }

  restore(review: Review): void {
    if (this.get(review.id)) return;
    this.reviews.update((list) => [review, ...list]);
    this.unmark('reviews', review.id);
  }

  getDraft(id: string): Draft | undefined {
    return this.drafts().find((d) => d.id === id);
  }

  /** Cria ou atualiza um pendente. */
  saveDraft(draft: Draft): void {
    this.drafts.update((list) =>
      list.some((d) => d.id === draft.id) ? list.map((d) => (d.id === draft.id ? draft : d)) : [draft, ...list],
    );
  }

  /**
   * Tira o pendente da fila. `forget: false` é o pendente que virou resenha (o mesmo id segue vivo
   * no mural): esse não fica marcado como apagado.
   */
  removeDraft(id: string, forget = true): Draft | undefined {
    const found = this.getDraft(id);
    if (found) {
      this.drafts.update((list) => list.filter((d) => d.id !== id));
      if (forget) this.mark('drafts', id);
    }
    return found;
  }

  restoreDraft(draft: Draft): void {
    if (this.getDraft(draft.id)) return;
    this.drafts.update((list) => [draft, ...list]);
    this.unmark('drafts', draft.id);
  }

  /** O backup sai em gzip (.json.gz); sem CompressionStream no navegador, sai o JSON puro. */
  async exportBackup(): Promise<{ blob: Blob; ext: string }> {
    const payload = {
      app: 'meu-mural',
      // 2: cada ficha e cada pendente diz o seu mural; os backups 1 são todos de jogos
      version: 2,
      exportedAt: new Date().toISOString(),
      reviews: this.reviews(),
      drafts: this.drafts(),
      deleted: this.deleted(),
    };
    const json = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    if (typeof CompressionStream === 'undefined') return { blob: json, ext: 'json' };
    const gz = await new Response(json.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    return { blob: new Blob([gz], { type: 'application/gzip' }), ext: 'json.gz' };
  }

  /** Lê o arquivo do backup, gzip ou JSON puro (os backups antigos), e devolve o texto do JSON. */
  async readBackup(file: Blob): Promise<string> {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (head[0] !== 0x1f || head[1] !== 0x8b) return file.text();
    try {
      return await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } catch {
      throw new Error('Esse arquivo compactado está corrompido. Escolha o backup baixado pelo Meu Mural.');
    }
  }

  /** Lança Error com mensagem pronta para o usuário quando o arquivo não serve. */
  importJson(text: string, mode: 'merge' | 'replace'): ImportResult {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Esse arquivo não é um JSON válido. Escolha o backup baixado pelo Meu Mural.');
    }
    const rawList = Array.isArray(data) ? data : (data as any)?.reviews;
    if (!Array.isArray(rawList)) {
      throw new Error('Não achei resenhas nesse arquivo. Escolha o backup baixado pelo Meu Mural.');
    }
    // Backups antigos não têm pendentes: nesse caso a fila atual fica como está.
    const rawDrafts = Array.isArray((data as any)?.drafts) ? ((data as any).drafts as unknown[]) : null;
    const incomingDrafts = (rawDrafts ?? []).map(sanitizeDraft).filter((d): d is Draft => d !== null);
    const incoming: Review[] = [];
    let skipped = 0;
    for (const raw of rawList) {
      const r = sanitizeReview(raw);
      if (r) incoming.push(r);
      else skipped++;
    }
    const theirs = sanitizeDeleted((data as any)?.deleted);

    if (mode === 'replace') {
      this.reviews.set(withStocks(incoming));
      if (rawDrafts) this.drafts.set(incomingDrafts);
      this.deleted.set(theirs);
      return { added: incoming.length, updated: 0, skipped, drafts: incomingDrafts.length, removed: 0 };
    }

    // O que foi apagado depois da última mudança na ficha continua apagado, dos dois lados.
    const ours = this.deleted();
    const gone = (when: string | undefined, updatedAt: string) => !!when && Date.parse(when) >= Date.parse(updatedAt);

    let added = 0;
    let updated = 0;
    let removed = 0;
    const byId = new Map(this.reviews().map((r) => [r.id, r]));
    for (const [id, when] of Object.entries(theirs.reviews)) {
      const current = byId.get(id);
      if (current && gone(when, current.updatedAt)) {
        byId.delete(id);
        removed++;
      }
    }
    for (const r of incoming) {
      const current = byId.get(r.id);
      if (gone(ours.reviews[r.id], r.updatedAt) || gone(theirs.reviews[r.id], r.updatedAt)) {
        skipped++;
      } else if (!current) {
        byId.set(r.id, r);
        added++;
      } else if (Date.parse(r.updatedAt) > Date.parse(current.updatedAt)) {
        byId.set(r.id, r);
        updated++;
      } else {
        skipped++;
      }
    }
    this.reviews.set(withStocks([...byId.values()]));

    // Pendente que já virou resenha (mesmo id), ou que foi tirado da fila, não volta para a fila.
    const kept = this.drafts().filter((d) => !gone(theirs.drafts[d.id], d.updatedAt));
    const known = new Set([...byId.keys(), ...kept.map((d) => d.id)]);
    const newDrafts = incomingDrafts.filter(
      (d) => !known.has(d.id) && !gone(ours.drafts[d.id], d.updatedAt) && !gone(theirs.drafts[d.id], d.updatedAt),
    );
    if (newDrafts.length || kept.length !== this.drafts().length) this.drafts.set([...newDrafts, ...kept]);
    this.deleted.set(mergeDeleted(ours, theirs));
    return { added, updated, skipped, drafts: newDrafts.length, removed };
  }

  private mark(kind: keyof Deleted, id: string): void {
    const when = new Date().toISOString();
    this.deleted.update((d) => ({ ...d, [kind]: { ...d[kind], [id]: when } }));
  }

  private unmark(kind: keyof Deleted, id: string): void {
    if (!(id in this.deleted()[kind])) return;
    this.deleted.update((d) => {
      const next = { ...d[kind] };
      delete next[id];
      return { ...d, [kind]: next };
    });
  }

  private read(): Review[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return withStocks(parsed.map(sanitizeReview).filter((r): r is Review => r !== null));
    } catch {
      return [];
    }
  }

  private readDrafts(): Draft[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.map(sanitizeDraft).filter((d): d is Draft => d !== null) : [];
    } catch {
      return [];
    }
  }

  private readDeleted(): Deleted {
    try {
      return sanitizeDeleted(JSON.parse(localStorage.getItem(DELETED_KEY) ?? 'null'));
    } catch {
      return { reviews: {}, drafts: {} };
    }
  }

  private write(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      this.saveError.set(null);
    } catch {
      this.saveError.set(
        'O navegador não deixou salvar. Baixe um backup agora para não perder essa resenha.',
      );
    }
  }
}

function sanitizeDeleted(raw: unknown): Deleted {
  const pick = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!v || typeof v !== 'object') return out;
    for (const [id, when] of Object.entries(v as Record<string, unknown>)) {
      if (/^[\w-]{4,64}$/.test(id) && typeof when === 'string' && !Number.isNaN(Date.parse(when))) out[id] = when;
    }
    return out;
  };
  const d = (raw ?? {}) as Record<string, unknown>;
  return { reviews: pick(d['reviews']), drafts: pick(d['drafts']) };
}

/** O apagamento mais recente de cada id, dos dois lados. */
function mergeDeleted(a: Deleted, b: Deleted): Deleted {
  const join = (x: Record<string, string>, y: Record<string, string>) => {
    const out = { ...x };
    for (const [id, when] of Object.entries(y)) if (!out[id] || Date.parse(when) > Date.parse(out[id])) out[id] = when;
    return out;
  };
  return { reviews: join(a.reviews, b.reviews), drafts: join(a.drafts, b.drafts) };
}

/** Fichas antigas ou importadas sem cor ganham a próxima do rodízio, na ordem em que foram criadas. */
function withStocks(list: Review[]): Review[] {
  if (list.every((r) => r.stock)) return list;
  const byDate = [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const assigned = new Map<string, Stock>();
  let prev = -1;
  for (const r of byDate) {
    const i = r.stock ? STOCKS.indexOf(r.stock) : (prev + 1) % STOCKS.length;
    assigned.set(r.id, STOCKS[i]);
    prev = i;
  }
  return list.map((r) => (r.stock ? r : { ...r, stock: assigned.get(r.id) }));
}
