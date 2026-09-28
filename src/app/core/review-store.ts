import { Injectable, computed, effect, signal } from '@angular/core';
import { Bonus, Draft, Review, STOCKS, Stock, isCatalogBonus, sanitizeDraft, sanitizeReview } from './review';

const KEY = 'mural-de-jogos:resenhas:v1';
const DRAFTS_KEY = 'mural-de-jogos:pendentes:v1';

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  /** Pendentes (só nome e capa) que entraram na fila. */
  drafts: number;
}

@Injectable({ providedIn: 'root' })
export class ReviewStore {
  readonly reviews = signal<Review[]>(this.read());
  /** Mensagem quando o navegador recusa salvar (cota cheia, modo privado…). */
  readonly saveError = signal<string | null>(null);
  readonly count = computed(() => this.reviews().length);
  /** Jogos guardados para resenhar depois, o mais recente primeiro. */
  readonly drafts = signal<Draft[]>(this.readDrafts());
  readonly draftCount = computed(() => this.drafts().length);
  /**
   * Os bônus que a pessoa escreveu, tirados das próprias fichas: o mais usado primeiro. Não há lista
   * para cuidar; um bônus que nenhuma ficha usa mais some sozinho.
   */
  readonly customBonuses = computed<Bonus[]>(() => {
    const seen = new Map<string, { bonus: Bonus; n: number }>();
    for (const r of this.reviews()) {
      for (const b of r.bonuses) {
        if (isCatalogBonus(b.id)) continue;
        const hit = seen.get(b.id);
        if (hit) hit.n++;
        else seen.set(b.id, { bonus: b, n: 1 });
      }
    }
    return [...seen.values()]
      .sort((a, b) => b.n - a.n || a.bonus.label.localeCompare(b.bonus.label, 'pt-BR'))
      .map((x) => x.bonus);
  });

  private skipNextWrite = false;
  private skipNextDraftWrite = false;

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

    // Outra aba mexeu no mural: acompanha sem sobrescrever.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === KEY) {
          this.skipNextWrite = true;
          this.reviews.set(this.read());
        } else if (e.key === DRAFTS_KEY) {
          this.skipNextDraftWrite = true;
          this.drafts.set(this.readDrafts());
        }
      });
    }
  }

  /** A próxima cartolina do rodízio, depois da ficha mais recente. */
  /** A cor com que a ficha nova nasce: sorteada, só não repete a da última pregada. A pessoa troca no editor. */
  nextStock(): Stock {
    const latest = this.reviews().reduce<Review | null>(
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
    const withStock = review.stock ? review : { ...review, stock: this.nextStock() };
    this.reviews.update((list) => [withStock, ...list]);
  }

  update(review: Review): void {
    this.reviews.update((list) => list.map((r) => (r.id === review.id ? review : r)));
  }

  remove(id: string): Review | undefined {
    const found = this.get(id);
    if (found) this.reviews.update((list) => list.filter((r) => r.id !== id));
    return found;
  }

  restore(review: Review): void {
    if (this.get(review.id)) return;
    this.reviews.update((list) => [review, ...list]);
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

  removeDraft(id: string): Draft | undefined {
    const found = this.getDraft(id);
    if (found) this.drafts.update((list) => list.filter((d) => d.id !== id));
    return found;
  }

  restoreDraft(draft: Draft): void {
    if (this.getDraft(draft.id)) return;
    this.drafts.update((list) => [draft, ...list]);
  }

  /** O backup sai em gzip (.json.gz); sem CompressionStream no navegador, sai o JSON puro. */
  async exportBackup(): Promise<{ blob: Blob; ext: string }> {
    const payload = {
      app: 'mural-de-jogos',
      version: 1,
      exportedAt: new Date().toISOString(),
      reviews: this.reviews(),
      drafts: this.drafts(),
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
      throw new Error('Esse arquivo compactado está corrompido. Escolha o backup baixado pelo Mural de Jogos.');
    }
  }

  /** Lança Error com mensagem pronta para o usuário quando o arquivo não serve. */
  importJson(text: string, mode: 'merge' | 'replace'): ImportResult {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Esse arquivo não é um JSON válido. Escolha o backup baixado pelo Mural de Jogos.');
    }
    const rawList = Array.isArray(data) ? data : (data as any)?.reviews;
    if (!Array.isArray(rawList)) {
      throw new Error('Não achei resenhas nesse arquivo. Escolha o backup baixado pelo Mural de Jogos.');
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

    if (mode === 'replace') {
      this.reviews.set(withStocks(incoming));
      if (rawDrafts) this.drafts.set(incomingDrafts);
      return { added: incoming.length, updated: 0, skipped, drafts: incomingDrafts.length };
    }

    let added = 0;
    let updated = 0;
    const byId = new Map(this.reviews().map((r) => [r.id, r]));
    for (const r of incoming) {
      const current = byId.get(r.id);
      if (!current) {
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

    // Pendente que já virou resenha (mesmo id) não volta para a fila.
    const known = new Set([...byId.keys(), ...this.drafts().map((d) => d.id)]);
    const newDrafts = incomingDrafts.filter((d) => !known.has(d.id));
    if (newDrafts.length) this.drafts.update((list) => [...newDrafts, ...list]);
    return { added, updated, skipped, drafts: newDrafts.length };
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

  private write(key: string, list: unknown[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      this.saveError.set(null);
    } catch {
      this.saveError.set(
        'O navegador não deixou salvar. Baixe um backup agora para não perder essa resenha.',
      );
    }
  }
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
