import { Injectable, computed, effect, signal } from '@angular/core';
import { CalendarState, Reminder, drawColor, mergeCalendar, remindersOn, sanitizeCalendar, skipDay, toggleDone } from './calendar';
import { todayISO } from './dates';
import { newId } from './review';
import { writeJson } from './storage';

/** Os lembretes deste navegador (vão embora com "Apagar o save", como os quadros do Kanban). */
export const CALENDAR_KEY = 'meu-mural:calendario:v1';

function read(): CalendarState {
  try {
    return sanitizeCalendar(JSON.parse(localStorage.getItem(CALENDAR_KEY) ?? 'null'));
  } catch {
    return { reminders: [], removed: {} };
  }
}

/** O pedido de um lembrete novo (o botão do topo, o N, um dia da folha), com o dia em que ele nasce. */
export interface ComposeRequest {
  day: string | null;
  /** Para dois pedidos iguais seguidos serem dois pedidos. */
  n: number;
}

/**
 * Os lembretes do Calendário (ver core/calendar.ts): guardados neste navegador e, com conta, no mural
 * privado da nuvem (`calendario`, juntado lembrete a lembrete, ver core/cloud-sync.ts). Nunca no mural
 * público: o calendário é só seu, mesmo com as anotações anexadas públicas.
 */
@Injectable({ providedIn: 'root' })
export class CalendarStore {
  readonly state = signal<CalendarState>(read());
  readonly reminders = computed(() => this.state().reminders);
  /** Quando os lembretes mudaram aqui (para a sincronização enviar). */
  readonly changedAt = signal(0);

  /** O topo pediu um lembrete novo (a página do Calendário abre a folha). */
  readonly compose = signal<ComposeRequest | null>(null);
  /**
   * "Escrever uma nota nova" de dentro da folha do lembrete: a anotação salva em seguida é anexada a
   * ele (`claimNote`). O número é o da folha que pediu; fechar o editor sem salvar esquece.
   */
  readonly pendingNote = signal<number | null>(null);
  /** A anotação escrita a pedido da folha `token`, para ela anexar. */
  readonly createdNote = signal<{ token: number; id: string } | null>(null);
  private nextToken = 1;

  /** O dia de hoje, que vira à meia-noite enquanto o site está aberto (ver `tick`). */
  readonly today = signal(todayISO());
  /** Quantos lembretes hoje tem (a contagem da barra da página). */
  readonly todayCount = computed(() => remindersOn(this.reminders(), this.today()).length);

  constructor() {
    effect(() => writeJson(CALENDAR_KEY, this.state()));
  }

  /** Confere se o dia virou (a página chama de vez em quando e quando a aba volta). */
  tick(): void {
    const now = todayISO();
    if (now !== this.today()) this.today.set(now);
  }

  get(id: string): Reminder | undefined {
    return this.reminders().find((r) => r.id === id);
  }

  ask(day: string | null = null): void {
    this.compose.set({ day, n: (this.compose()?.n ?? 0) + 1 });
  }

  /** Um lembrete em branco para a folha: no dia pedido, sem horário, com uma cor sorteada. */
  blank(day: string): Reminder {
    const now = new Date().toISOString();
    return { id: newId(), title: '', date: day, color: drawColor(this.reminders()), notes: [], done: [], skip: [], createdAt: now, at: now };
  }

  /** Guarda o lembrete (novo, ou no lugar do de mesmo id), mais novo que antes. */
  save(r: Reminder): void {
    const at = new Date().toISOString();
    const next = { ...r, at };
    const st = this.state();
    const i = st.reminders.findIndex((x) => x.id === r.id);
    const reminders = i >= 0 ? st.reminders.map((x, j) => (j === i ? next : x)) : [...st.reminders, next];
    const removed = { ...st.removed };
    delete removed[r.id];
    this.set({ reminders, removed });
  }

  remove(id: string): void {
    const st = this.state();
    if (!st.reminders.some((r) => r.id === id)) return;
    this.set({ reminders: st.reminders.filter((r) => r.id !== id), removed: { ...st.removed, [id]: new Date().toISOString() } });
  }

  /** Desfazer: o lembrete volta como era, mais novo que a mudança desfeita. */
  restore(r: Reminder): void {
    this.save(r);
  }

  toggleDone(id: string, day: string): void {
    this.change(id, (r, at) => toggleDone(r, day, at));
  }

  /** "Apagar só neste dia", num lembrete que se repete. */
  skipDay(id: string, day: string): void {
    this.change(id, (r, at) => skipDay(r, day, at));
  }

  /** Tira uma anotação do lembrete (a anotação continua no mural). */
  detach(id: string, note: string): void {
    this.change(id, (r, at) => ({ ...r, notes: r.notes.filter((n) => n !== note), at }));
  }

  /** Os lembretes que vieram de outro aparelho, juntados aos daqui. */
  merge(remote: CalendarState): void {
    const next = mergeCalendar(this.state(), remote);
    if (JSON.stringify(next) !== JSON.stringify(this.state())) this.state.set(next);
  }

  /** A folha de um lembrete vai pedir uma anotação nova: o número que vai identificar a resposta. */
  askNote(): number {
    const token = this.nextToken++;
    this.pendingNote.set(token);
    return token;
  }

  /** A anotação acabou de ser salva: se a folha de um lembrete pediu, ela é anexada lá. Devolve se foi. */
  claimNote(id: string): boolean {
    const token = this.pendingNote();
    if (token === null) return false;
    this.pendingNote.set(null);
    this.createdNote.set({ token, id });
    return true;
  }

  private change(id: string, fn: (r: Reminder, at: string) => Reminder): void {
    const st = this.state();
    const at = new Date().toISOString();
    let changed = false;
    const reminders = st.reminders.map((r) => {
      if (r.id !== id) return r;
      changed = true;
      return fn(r, at);
    });
    if (changed) this.set({ ...st, reminders });
  }

  private set(state: CalendarState): void {
    // guardados na ordem de criação, a mesma da junção (as impressões dos aparelhos batem)
    const reminders = [...state.reminders].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    this.state.set({ ...state, reminders });
    this.changedAt.set(Date.now());
  }
}
