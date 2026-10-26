import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { todayISO } from './dates';
import { newId } from './review';
import {
  Entry,
  ME,
  SpendingCategory,
  SpendingPerson,
  SpendingState,
  drawCategoryColor,
  mergeSpending,
  monthLabel,
  monthOfDay,
  rowsIn,
  sanitizeSpending,
  shiftMonth,
  Flow,
  PERSON_NAME_MAX,
} from './spending';
import { onOtherTab, writeJson } from './storage';

/** Os gastos deste navegador (vão embora com "Apagar o save", como os lembretes do Calendário). */
export const SPENDING_KEY = 'meu-mural:gastos:v1';

function read(): SpendingState {
  try {
    return sanitizeSpending(JSON.parse(localStorage.getItem(SPENDING_KEY) ?? 'null'));
  } catch {
    return sanitizeSpending(null);
  }
}

/** Agora, mas sempre depois de `prev` (duas mudanças no mesmo milissegundo continuam em ordem). */
function stampAfter(prev: string | undefined): string {
  const now = Date.now();
  const before = prev ? Date.parse(prev) : NaN;
  return new Date(Number.isFinite(before) && before >= now ? before + 1 : now).toISOString();
}

/**
 * O livro-caixa dos Gastos (ver core/spending.ts): guardado neste navegador e, com conta, no mural privado
 * da nuvem (`gastos`, juntado lançamento a lançamento, ver core/cloud-sync.ts). Nunca no mural público.
 */
@Injectable({ providedIn: 'root' })
export class SpendingStore {
  readonly state = signal<SpendingState>(read());
  readonly entries = computed(() => this.state().entries);
  readonly categories = computed(() => this.state().categories);
  /** As pessoas dos gastos: você primeiro, as outras pelo nome. */
  readonly people = computed(() => {
    const [me, ...rest] = [...this.state().people].sort((a, b) => (a.id === ME ? -1 : b.id === ME ? 1 : a.name.localeCompare(b.name, 'pt-BR')));
    return me ? [me, ...rest] : rest;
  });
  /** Quando o livro mudou aqui (para a sincronização enviar). */
  readonly changedAt = signal(0);

  /** O mês aberto na página ('AAAA-MM'); a página o põe no endereço. */
  readonly month = signal(monthOfDay(todayISO()));
  /** O topo pediu um lançamento novo (a página põe o foco na linha de lançar). */
  readonly compose = signal(0);

  /** A contagem da barra da página: quantos lançamentos o mês aberto tem. */
  readonly barSummary = computed(() => {
    const n = rowsIn(this.entries(), this.month()).length;
    if (!n) return null;
    const label = monthLabel(this.month()).split(' de ')[0];
    return { n, long: `${n === 1 ? 'lançamento' : 'lançamentos'} em ${label}`, short: `em ${label.slice(0, 3)}` };
  });

  constructor() {
    effect(() => writeJson(SPENDING_KEY, this.state()));
    // outra aba mexeu no livro: esta acompanha, sem gravar o de antes por cima
    inject(DestroyRef).onDestroy(onOtherTab(SPENDING_KEY, () => this.state.set(read())));
  }

  ask(): void {
    this.compose.update((n) => n + 1);
  }

  get(id: string): Entry | undefined {
    return this.entries().find((e) => e.id === id);
  }

  category(id: string): SpendingCategory | undefined {
    return this.categories().find((c) => c.id === id);
  }

  person(id: string): SpendingPerson | undefined {
    return this.state().people.find((p) => p.id === id);
  }

  /** Uma pessoa nova (ou a que já tem esse nome, sem criar outra). */
  addPerson(name: string): SpendingPerson {
    const clean = name.trim().replace(/\s+/g, ' ').slice(0, PERSON_NAME_MAX);
    const same = this.state().people.find((p) => p.name.localeCompare(clean, 'pt-BR', { sensitivity: 'base' }) === 0);
    if (same) return same;
    const p: SpendingPerson = { id: newId(), name: clean, at: new Date().toISOString() };
    this.savePerson(p);
    return p;
  }

  savePerson(p: SpendingPerson): void {
    const st = this.state();
    const i = st.people.findIndex((x) => x.id === p.id);
    const next = { ...p, at: stampAfter(i >= 0 ? st.people[i].at : undefined) };
    const people = i >= 0 ? st.people.map((x, j) => (j === i ? next : x)) : [...st.people, next];
    const removed = { ...st.removed };
    delete removed[p.id];
    this.set({ ...st, people, removed });
  }

  /** Apaga a pessoa: ela sai dos gastos dela (o que fica sem ninguém volta a ser só seu). Você fica sempre. */
  removePerson(id: string): void {
    const st = this.state();
    if (id === ME || !st.people.some((p) => p.id === id)) return;
    const entries = st.entries.map((e) => {
      if (!e.people?.includes(id)) return e;
      const next = { ...e, people: e.people.filter((p) => p !== id), at: stampAfter(e.at) };
      if (!next.people.length) delete (next as Partial<Entry>).people;
      return next;
    });
    this.set({ ...st, entries, people: st.people.filter((p) => p.id !== id), removed: { ...st.removed, [id]: new Date().toISOString() } });
  }

  /** Um lançamento em branco, num dia do mês aberto (hoje, se hoje é dele; senão o primeiro dia). */
  blank(flow: Flow = 'saida'): Entry {
    const now = new Date().toISOString();
    const today = todayISO();
    const date = monthOfDay(today) === this.month() ? today : `${this.month()}-01`;
    return { id: newId(), title: '', amount: 0, flow, category: flow === 'saida' ? 'outros' : 'outras-entradas', ...(flow === 'saida' ? { pay: 'avista' as const } : {}), date, createdAt: now, at: now };
  }

  /** Guarda o lançamento (novo, ou no lugar do de mesmo id), mais novo que antes. */
  save(e: Entry): void {
    const st = this.state();
    const i = st.entries.findIndex((x) => x.id === e.id);
    const next = { ...e, at: stampAfter(i >= 0 ? st.entries[i].at : undefined) };
    const entries = i >= 0 ? st.entries.map((x, j) => (j === i ? next : x)) : [...st.entries, next];
    const removed = { ...st.removed };
    delete removed[e.id];
    this.set({ ...st, entries, removed });
  }

  remove(id: string): Entry | undefined {
    const st = this.state();
    const gone = st.entries.find((e) => e.id === id);
    if (!gone) return undefined;
    this.set({ ...st, entries: st.entries.filter((e) => e.id !== id), removed: { ...st.removed, [id]: new Date().toISOString() } });
    return gone;
  }

  /** Desfazer: o lançamento volta como era, mais novo que a mudança desfeita. */
  restore(e: Entry): void {
    this.save(e);
  }

  /** Um fixo sem este mês ("só neste mês não"). */
  skipMonth(id: string, month: string): void {
    const e = this.get(id);
    if (!e?.monthly) return;
    this.save({ ...e, skip: [...new Set([...(e.skip ?? []), month])].sort() });
  }

  /** Um fixo que acaba antes deste mês (o mês de antes é o último). Se nem começou, sai inteiro. */
  stopBefore(id: string, month: string): void {
    const e = this.get(id);
    if (!e?.monthly) return;
    if (month <= monthOfDay(e.date)) this.remove(id);
    else this.save({ ...e, until: shiftMonth(month, -1) });
  }

  /** Uma categoria nova (ou o nome de uma que já existe na mesma direção, sem criar outra). */
  addCategory(name: string, flow: Flow): SpendingCategory {
    const clean = name.trim().replace(/\s+/g, ' ');
    const same = this.categories().find((c) => c.flow === flow && c.name.localeCompare(clean, 'pt-BR', { sensitivity: 'base' }) === 0);
    if (same) return same;
    const c: SpendingCategory = { id: newId(), name: clean, flow, color: drawCategoryColor(this.categories(), flow), at: new Date().toISOString() };
    this.saveCategory(c);
    return c;
  }

  saveCategory(c: SpendingCategory): void {
    const st = this.state();
    const i = st.categories.findIndex((x) => x.id === c.id);
    const next = { ...c, at: stampAfter(i >= 0 ? st.categories[i].at : undefined) };
    const categories = i >= 0 ? st.categories.map((x, j) => (j === i ? next : x)) : [...st.categories, next];
    const removed = { ...st.removed };
    delete removed[c.id];
    this.set({ ...st, categories, removed });
  }

  /** Apaga a categoria; os lançamentos dela passam para "Outros" da mesma direção. */
  removeCategory(id: string): void {
    const st = this.state();
    const gone = st.categories.find((c) => c.id === id);
    // os "Outros" de cada direção recebem os lançamentos das apagadas: ficam sempre
    if (!gone || id === 'outros' || id === 'outras-entradas') return;
    const fallback = gone.flow === 'saida' ? 'outros' : 'outras-entradas';
    const at = new Date().toISOString();
    const entries = st.entries.map((e) => (e.category === id ? { ...e, category: fallback, at: stampAfter(e.at) } : e));
    this.set({ ...st, entries, categories: st.categories.filter((c) => c.id !== id), removed: { ...st.removed, [id]: at } });
  }

  /** O livro que veio de outro aparelho, juntado ao daqui. */
  merge(remote: SpendingState): void {
    const next = mergeSpending(this.state(), remote);
    if (JSON.stringify(next) !== JSON.stringify(this.state())) this.state.set(next);
  }

  private set(state: SpendingState): void {
    // guardados na ordem de criação, a mesma da junção (as impressões dos aparelhos batem)
    this.state.set(sanitizeSpending(state));
    this.changedAt.set(Date.now());
  }
}
