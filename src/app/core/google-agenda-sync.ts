import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Reminder } from './calendar';
import { CalendarStore } from './calendar-store';
import { CloudAccount, CloudError } from './cloud-account';
import { GEvent, deviceTimeZone, eventIdFor, fromEvent, isMuralEvent, reminderIdFor, toEvent } from './google-agenda';
import { ReviewStore } from './review-store';
import { readJson, removeKey, writeJson } from './storage';

/** O que este aparelho guarda da ligação: de que conta, o ponto da última leitura e os apagados que já saíram de lá. */
const DEVICE_KEY = 'meu-mural:agenda-google:v1';
/** A resposta do Google que chegou sem a janela do site aberta (ver public/google.js). */
export const RETURN_KEY = 'meu-mural:google-retorno';
/** Quantas mudanças vão de uma vez (o mesmo limite da API). */
const BATCH = 25;
/** De quanto em quanto tempo o Calendário aberto confere o Google. */
const EVERY_MS = 10 * 60_000;
/** Depois de uma mudança no Murall, quanto espera antes de mandar (junta as que vêm em seguida). */
const AFTER_CHANGE_MS = 3_000;

interface DeviceState {
  conta: string;
  sync?: string;
  feitos?: string[];
  em?: string;
}

export type AgendaStatus = 'fora' | 'indisponivel' | 'desligada' | 'ligando' | 'ligada';

/** O que ficou só no Google na última leitura (o Murall não sabe mostrar), para a folha dizer. */
export interface Skipped {
  repeticao: number;
  excecao: number;
}

interface StatusReply {
  disponivel: boolean;
  conectada: boolean;
  desde: string | null;
}

interface Op {
  acao: 'criar' | 'mudar' | 'apagar';
  id: string;
  evento?: unknown;
  /** Do lembrete (não vai para a API): qual e o `at` que foi. */
  reminder?: string;
  sent?: string;
}

/**
 * O Google Agenda ligado ao Calendário, nos dois sentidos, na agenda principal da pessoa (ver
 * core/google-agenda.ts para a conversão e api/src/routes/agenda.ts para a API).
 *
 * - Ligar: a API dá o endereço do Google, que abre numa janela; o Google volta para `google.html`, que
 *   entrega o código para esta página; a API troca pela permissão e guarda (cifrada).
 * - Sincronizar: primeiro lê o que mudou no Google (desde a última leitura deste aparelho) e aplica no
 *   Murall, a mudança mais nova vencendo; depois manda o que mudou no Murall (lembretes com `google.at`
 *   diferente do `at`, e os apagados). Os lembretes que vieram de outro aparelho pela nuvem já chegam
 *   ligados; o mesmo lembrete mandado por dois aparelhos bate no mesmo evento (o id sai do lembrete).
 * - Com o Calendário aberto: ao abrir, um pouco depois de cada mudança, de 10 em 10 minutos e ao voltar
 *   para a aba.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAgenda {
  private readonly account = inject(CloudAccount);
  private readonly calendar = inject(CalendarStore);
  private readonly store = inject(ReviewStore);

  readonly status = signal<AgendaStatus>('fora');
  readonly since = signal<string | null>(null);
  readonly syncing = signal(false);
  readonly lastSync = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly skipped = signal<Skipped>({ repeticao: 0, excecao: 0 });
  /** A ligação deste aparelho, se for da conta aberta. */
  private device: DeviceState | null = null;
  private running: Promise<void> | null = null;
  /** As respostas do Google já entregues (pelo `state`). */
  private readonly handled = new Set<string>();
  private again = false;

  /** O que o Murall tem para mandar ao Google (lembretes mudados e apagados). */
  readonly pending = computed(() => {
    const st = this.calendar.state();
    const done = new Set(this.doneDeletes());
    const changed = st.reminders.filter((r) => !r.google?.lock && r.google?.at !== r.at).length;
    const deletes = Object.keys(st.googleTrash ?? {}).filter((id) => !done.has(id)).length;
    return changed + deletes;
  });
  private readonly doneDeletes = signal<string[]>([]);

  constructor() {
    // a resposta do Google numa janela: o google.html entrega aqui
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin) return;
        const d = e.data as { tipo?: string; codigo?: string; estado?: string; erro?: string } | null;
        if (d?.tipo === 'murall-google') void this.finish(d);
      });
      // a janela do Google pode ter perdido o `opener`: a resposta chega pelo localStorage
      window.addEventListener('storage', (e) => {
        if (e.key !== RETURN_KEY || !e.newValue) return;
        const d = readJson<{ codigo?: string; estado?: string; erro?: string }>(RETURN_KEY);
        if (d) void this.finish(d);
      });
    }
    // trocou de conta (ou saiu): a ligação deste aparelho era da outra
    effect(() => {
      const conta = this.account.account()?.id ?? null;
      untracked(() => void this.refresh(conta));
    });
  }

  /** Confere com a API se o Google Agenda está ligado (e termina uma volta do Google que ficou esperando). */
  async refresh(conta = this.account.account()?.id ?? null): Promise<void> {
    if (!conta || !this.account.signedIn()) {
      this.status.set('fora');
      this.device = null;
      return;
    }
    const saved = readJson<DeviceState>(DEVICE_KEY);
    this.device = saved?.conta === conta ? saved : { conta };
    this.doneDeletes.set(this.device.feitos ?? []);
    this.lastSync.set(this.device.em ?? null);
    try {
      const r = await this.account.request<StatusReply>('/v1/agenda');
      this.since.set(r.desde);
      this.status.set(!r.disponivel && !r.conectada ? 'indisponivel' : r.conectada ? 'ligada' : 'desligada');
    } catch {
      this.status.set('indisponivel');
      return;
    }
    const back = readJson<{ codigo?: string; estado?: string; erro?: string }>(RETURN_KEY);
    if (back) await this.finish(back);
  }

  /**
   * Ligar: a janela abre já no clique (senão o navegador bloqueia) e vai para o Google quando a API
   * responde. Sem janela (bloqueada), a página inteira vai e volta.
   */
  async connect(): Promise<void> {
    if (this.status() === 'ligando') return;
    this.error.set(null);
    const win = window.open('', 'murall-google', 'popup,width=520,height=680');
    this.status.set('ligando');
    try {
      const retorno = new URL('google.html', document.baseURI).href;
      const { url } = await this.account.request<{ url: string }>('/v1/agenda/conectar', { method: 'POST', body: { retorno } });
      if (win) win.location.href = url;
      else location.href = url;
    } catch (err) {
      win?.close();
      this.status.set('desligada');
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para abrir o Google agora. Tente de novo.');
    }
  }

  /** O Google voltou: entrega o código à API e, ligado, sincroniza. */
  private async finish(d: { codigo?: string; estado?: string; erro?: string }): Promise<void> {
    // a mesma resposta chega pela mensagem e pelo localStorage: vale uma vez
    const key = d.estado || d.erro || '';
    if (this.handled.has(key)) return;
    this.handled.add(key);
    removeKey(RETURN_KEY);
    if (d.erro || !d.codigo || !d.estado) {
      this.status.set('desligada');
      this.error.set(d.erro === 'access_denied' ? 'A permissão não foi dada no Google.' : 'O Google não completou a ligação. Tente de novo.');
      return;
    }
    this.status.set('ligando');
    try {
      const r = await this.account.request<{ desde: string }>('/v1/agenda/retorno', { method: 'POST', body: { codigo: d.codigo, estado: d.estado } });
      this.since.set(r.desde);
      this.status.set('ligada');
      this.error.set(null);
      // uma ligação nova lê tudo de novo
      this.saveDevice({ sync: undefined });
      await this.sync();
    } catch (err) {
      this.status.set('desligada');
      this.error.set(err instanceof CloudError ? err.message : 'O Google não completou a ligação. Tente de novo.');
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.account.request('/v1/agenda', { method: 'DELETE' });
    } catch (err) {
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para desligar agora. Tente de novo.');
      return;
    }
    removeKey(DEVICE_KEY);
    const conta = this.account.account()?.id;
    this.device = conta ? { conta } : null;
    this.doneDeletes.set([]);
    this.lastSync.set(null);
    this.status.set('desligada');
  }

  /** Lê o que mudou no Google, aplica, e manda o que mudou no Murall. Uma rodada por vez. */
  sync(): Promise<void> {
    if (this.status() !== 'ligada') return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      this.syncing.set(true);
      try {
        do {
          this.again = false;
          await this.pull();
          await this.push();
        } while (this.again);
        const em = new Date().toISOString();
        this.saveDevice({ em });
        this.lastSync.set(em);
        this.error.set(null);
      } catch (err) {
        if (err instanceof CloudError && err.code === 'agenda-desligada') {
          this.status.set('desligada');
          this.error.set('O Google Agenda foi desligado (a permissão saiu ou venceu). Ligue de novo.');
        } else this.error.set(err instanceof CloudError ? err.message : 'Não deu para falar com o Google agora.');
      } finally {
        this.syncing.set(false);
        this.running = null;
      }
    })();
    return this.running;
  }

  /** Com o Calendário aberto: sincroniza agora, depois das mudanças, de tempos em tempos e ao voltar para a aba. */
  use(destroy = inject(DestroyRef)): void {
    void this.sync();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watch = effect(() => {
      const n = this.pending();
      const on = this.status() === 'ligada';
      untracked(() => {
        clearTimeout(timer);
        if (on && n > 0) timer = setTimeout(() => void this.sync(), AFTER_CHANGE_MS);
      });
    });
    const every = setInterval(() => document.visibilityState === 'visible' && void this.sync(), EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && void this.sync();
    document.addEventListener('visibilitychange', onVisible);
    destroy.onDestroy(() => {
      watch.destroy();
      clearTimeout(timer);
      clearInterval(every);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  private async pull(): Promise<void> {
    let sync = this.device?.sync;
    let page: string | undefined;
    const skipped: Skipped = { repeticao: 0, excecao: 0 };
    let full = !sync;
    for (let round = 0; round < 50; round++) {
      const q = new URLSearchParams();
      if (sync) q.set('sync', sync);
      if (page) q.set('pagina', page);
      let reply: { eventos: GEvent[]; sync: string | null; pagina?: string };
      try {
        const query = q.toString();
        reply = await this.account.request('/v1/agenda/eventos' + (query ? `?${query}` : ''));
      } catch (err) {
        // o Google esqueceu o ponto: lê tudo de novo
        if (err instanceof CloudError && err.code === 'agenda-refazer' && sync) {
          sync = undefined;
          page = undefined;
          full = true;
          skipped.repeticao = skipped.excecao = 0;
          this.saveDevice({ sync: undefined });
          continue;
        }
        throw err;
      }
      this.apply(reply.eventos, skipped);
      if (reply.pagina) {
        page = reply.pagina;
        continue;
      }
      if (reply.sync) this.saveDevice({ sync: reply.sync });
      break;
    }
    // o que ficou de fora: a conta da leitura do zero; numa leitura só de mudanças, soma ao que já havia
    this.skipped.update((s) => (full ? skipped : { repeticao: s.repeticao + skipped.repeticao, excecao: s.excecao + skipped.excecao }));
  }

  /** Aplica o que veio do Google: a mudança mais nova vence; o que só o Murall tem (as anotações) fica. */
  private apply(events: readonly GEvent[], skipped: Skipped): void {
    if (!events.length) return;
    const reminders = this.calendar.reminders();
    const byEvent = new Map(reminders.filter((r) => r.google).map((r) => [r.google!.id, r]));
    const byId = new Map(reminders.map((r) => [r.id, r]));
    const today = this.calendar.today();
    const upserts = new Map<string, Reminder>();
    const removes: { id: string; at: string }[] = [];
    const current = (id: string) => upserts.get(id) ?? byId.get(id);
    for (const ev of events) {
      const known = byEvent.get(ev.id) ?? byId.get(reminderIdFor(ev.id));
      const existing = known && current(known.id);
      const pendingHere = !!existing && !existing.google?.lock && existing.google?.at !== existing.at;
      const result = fromEvent(ev, existing, today);
      switch (result.kind) {
        case 'upsert': {
          if (existing?.google?.etag && existing.google.etag === ev.etag) break;
          // mudado aqui depois da mudança de lá: o daqui vai para o Google
          if (pendingHere && existing!.at > result.reminder.at) break;
          upserts.set(result.reminder.id, result.reminder);
          break;
        }
        case 'remove': {
          if (!existing) break;
          const at = ev.updated && Number.isFinite(Date.parse(ev.updated)) ? new Date(ev.updated).toISOString() : new Date().toISOString();
          if (pendingHere && existing.at > at) break;
          upserts.delete(existing.id);
          removes.push({ id: existing.id, at: at > existing.at ? at : new Date().toISOString() });
          break;
        }
        case 'skipDay': {
          const master = byEvent.get(result.masterEventId);
          const m = master && current(master.id);
          if (!m || m.skip.includes(result.day)) break;
          const at = new Date().toISOString();
          upserts.set(m.id, { ...m, skip: [...m.skip, result.day].sort(), at, google: { ...m.google!, at } });
          break;
        }
        case 'ignore':
          if (result.reason === 'repeticao') skipped.repeticao++;
          if (result.reason === 'excecao') skipped.excecao++;
          break;
      }
    }
    this.calendar.applyGoogle([...upserts.values()], removes);
  }

  private async push(): Promise<void> {
    const st = this.calendar.state();
    const tz = deviceTimeZone();
    const done = new Set(this.doneDeletes());
    const ops: Op[] = [];
    for (const r of st.reminders) {
      if (r.google?.lock || (r.google && r.google.at === r.at)) continue;
      const id = r.google?.id ?? eventIdFor(r.id);
      const names = isMuralEvent(id) ? r.notes.map((n) => this.store.get(n)?.game.name).filter((x): x is string => !!x) : [];
      ops.push({ acao: r.google ? 'mudar' : 'criar', id, evento: toEvent(r, tz, names), reminder: r.id, sent: r.at });
    }
    for (const id of Object.keys(st.googleTrash ?? {})) if (!done.has(id)) ops.push({ acao: 'apagar', id });
    for (let i = 0; i < ops.length; i += BATCH) {
      const batch = ops.slice(i, i + BATCH);
      const { resultados } = await this.account.request<{ resultados: { id: string; ok: boolean; etag?: string | null; htmlLink?: string | null; erro?: string }[] }>(
        '/v1/agenda/enviar',
        { method: 'POST', body: { ops: batch.map(({ acao, id, evento }) => ({ acao, id, ...(evento ? { evento } : {}) })) } },
      );
      const byId = new Map(resultados.map((x) => [x.id, x]));
      const deleted: string[] = [];
      for (const op of batch) {
        const res = byId.get(op.id);
        if (!res?.ok) continue;
        if (op.acao === 'apagar') deleted.push(op.id);
        else this.calendar.linkGoogle(op.reminder!, { id: op.id, ...(res.etag ? { etag: res.etag } : {}), ...(res.htmlLink ? { link: res.htmlLink } : {}) }, op.sent!);
      }
      if (deleted.length) {
        const feitos = [...new Set([...this.doneDeletes(), ...deleted])];
        this.doneDeletes.set(feitos);
        this.saveDevice({ feitos });
      }
      if (resultados.some((x) => !x.ok && x.erro === 'limite')) throw new CloudError('O Google pediu um tempo: o resto vai daqui a pouco.', 'limite', 429);
    }
  }

  private saveDevice(patch: Partial<DeviceState>): void {
    if (!this.device) return;
    this.device = { ...this.device, ...patch };
    if (!this.device.sync) delete this.device.sync;
    writeJson(DEVICE_KEY, this.device);
  }
}
