import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { DiffRow, FieldChange, SiteRequest, ApiRequests, fieldChanges, requestWords, textDiff, undoable } from '../core/api-requests';
import { CloudError } from '../core/cloud-account';
import { commentWhen } from '../core/comments';
import { localDay } from '../core/dates';
import { agoLabel } from '../core/follow';
import { plural } from '../core/text';
import { BackdropClose } from './backdrop-close';
import { Busy } from './busy';
import { Confirm } from './confirm';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';

/** O que a folha mostra: os pedidos que esperam você, ou o histórico de uma chave. */
export type RequestsSheetMode = { kind: 'esperando' } | { kind: 'historico'; key: { id: string; nome: string } };

/** Um pedido que espera, pronto para a folha: a frase, quando, e o que muda. */
interface WaitingView {
  r: SiteRequest;
  words: string;
  when: string;
  fields: FieldChange[];
  diff: DiffRow[];
  gone: boolean;
}

/** Um pedido resolvido, no histórico. */
interface DoneView {
  r: SiteRequest;
  words: string;
  when: string;
  stamp: string | null;
  why: string | null;
  canUndo: boolean;
  today: boolean;
}

const STAMPS: Record<string, string> = {
  recusado: 'recusado',
  falhou: 'não entrou',
  conflito: 'conflito',
  desfeito: 'desfeito',
  expirado: 'expirou',
};

const OP_ICONS: Record<string, keyof typeof ICON> = {
  'nota.criar': 'novaNota',
  'nota.editar': 'editar',
  'nota.acrescentar': 'escrever',
  'nota.tarefas': 'tarefas',
  'nota.finalizar': 'feito',
  'nota.reabrir': 'recomecar',
  'nota.fixar': 'fixar',
  'nota.desafixar': 'desafixar',
  'nota.apagar': 'apagar',
  'gasto.lancar': 'moedas',
  'gasto.editar': 'editar',
  'gasto.apagar': 'apagar',
  'envelope.criar': 'etiqueta',
  'envelope.editar': 'etiqueta',
  'pessoa.criar': 'pessoa',
  'pessoa.editar': 'pessoa',
};

/**
 * Os pedidos da API das AIs, na tela (Ajustes › Acessos; PLANO-API.md, 9.4, 9.5 e 14): os que esperam
 * você aprovar, cada um em palavras e com o que muda na nota (o antes riscado, o depois marcado), com
 * Aprovar, Recusar e "Aprovar os N" por chave; ou o histórico de uma chave, com Desfazer e "Desfazer
 * tudo de hoje".
 */
@Component({
  selector: 'app-api-requests-sheet',
  imports: [BackdropClose, Busy, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet folha-pedidos" aria-labelledby="pedidos-titulo" (close)="closed.emit()" (backdropClose)="close()">
      <div class="ficha cartolina" style="--stock: var(--stock-azul)" data-cor="azul">
        <app-pin class="pin" color="#f4f4f0" />
        <header class="head">
          <div class="titulos">
            @if (history(); as key) {
              <h2 id="pedidos-titulo" tabindex="-1">Histórico</h2>
              <p class="sub-mao">“{{ key.nome }}”</p>
            } @else {
              <h2 id="pedidos-titulo" tabindex="-1">Pedidos esperando</h2>
              <p class="sub">{{ waitingSub() }}</p>
            }
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          @if (error(); as e) {
            <p class="msg-erro" role="alert">{{ e }}</p>
          }

          @if (history()) {
            <!-- ===== O histórico de uma chave ===== -->
            @if (done(); as list) {
              @if (list.length) {
                <ol class="feitos" aria-labelledby="pedidos-titulo">
                  @for (d of list; track d.r.id) {
                    <li class="feito" [class.apagado]="!!d.stamp">
                      <p class="quando">{{ d.when }}</p>
                      <div class="feito-texto">
                        <p class="frase">
                          <lucide-icon class="frase-icone" [img]="iconOf(d.r.op)" [size]="17" aria-hidden="true" />
                          <span>{{ d.words }}</span>
                          @if (d.stamp; as s) {
                            <span class="carimbo" [class.neutro]="s === 'desfeito' || s === 'expirou'">{{ s }}</span>
                          }
                        </p>
                        @if (d.why; as w) {
                          <p class="porque">{{ w }}</p>
                        }
                      </div>
                      @if (d.canUndo) {
                        <button
                          type="button"
                          class="papel desfazer"
                          [attr.aria-label]="'Desfazer: ' + d.words"
                          [disabled]="!!busy()"
                          [appBusy]="busy() === d.r.id"
                          (click)="undo(d)"
                        >
                          <lucide-icon [img]="UndoIcon" [size]="17" aria-hidden="true" />
                          {{ busy() === d.r.id ? 'Desfazendo…' : 'Desfazer' }}
                        </button>
                      }
                    </li>
                  }
                </ol>
              } @else {
                <p class="vazio">Nenhum pedido desta chave ainda. O que ela fizer aparece aqui, com Desfazer.</p>
              }
            } @else if (!error()) {
              <p class="carregando-linha" role="status"><span class="carregando" aria-hidden="true"></span>Trazendo o histórico…</p>
            }
          } @else {
            <!-- ===== Os que esperam você ===== -->
            @for (g of waiting(); track g.id) {
              <section class="chave-grupo" [attr.aria-labelledby]="'pg-' + g.id">
                <div class="grupo-cabeca">
                  <h3 class="parte-titulo" [id]="'pg-' + g.id">{{ g.nome }}</h3>
                  @if (g.items.length > 1) {
                    <button type="button" class="papel" [disabled]="!!busy()" [appBusy]="busy() === g.id" (click)="approveAll(g.id, g.items)">
                      <lucide-icon [img]="OkIcon" [size]="17" aria-hidden="true" />
                      {{ busy() === g.id ? 'Aprovando…' : 'Aprovar os ' + g.items.length }}
                    </button>
                  }
                </div>
                <ol class="pedidos">
                  @for (w of g.items; track w.r.id) {
                    <li class="pedido">
                      <p class="frase">
                        <lucide-icon class="frase-icone" [img]="iconOf(w.r.op)" [size]="18" aria-hidden="true" />
                        <span>{{ w.words }}</span>
                      </p>
                      <p class="pedido-meta">Pediu {{ w.when }}</p>

                      @if (w.gone) {
                        <p class="porque">{{ goneWords(w.r.op) }} não existe mais: aprovado, o pedido não vai entrar.</p>
                      }
                      @if (w.r.op === 'nota.apagar' && !w.gone) {
                        <p class="porque">Ela sai do mural e fica guardada em Ajustes › Backup por 30 dias.</p>
                      }
                      @if (w.r.op === 'gasto.apagar' && !w.gone) {
                        <p class="porque">Ele sai dos Gastos; o Desfazer do histórico põe de volta.</p>
                      }
                      @if (w.fields.length) {
                        <dl class="campos">
                          @for (f of w.fields; track f.label) {
                            <div class="campo-mudou">
                              <dt>{{ f.label }}</dt>
                              <dd>
                                @if (f.before !== null) {
                                  <del>{{ f.before }}</del>
                                  <lucide-icon class="seta" [img]="ArrowIcon" [size]="15" aria-hidden="true" />
                                  <span class="sr-only">passa a ser</span>
                                }
                                <ins>{{ f.after }}</ins>
                              </dd>
                            </div>
                          }
                        </dl>
                      }
                      @if (w.diff.length) {
                        <div class="diff" role="group" [attr.aria-label]="'O texto de ' + titleOf(w.r)">
                          @for (row of w.diff; track $index) {
                            @switch (row.kind) {
                              @case ('add') {
                                <p class="d-linha entra"><span class="sr-only">Entra: </span><ins>{{ row.text }}</ins></p>
                              }
                              @case ('del') {
                                <p class="d-linha sai"><span class="sr-only">Sai: </span><del>{{ row.text }}</del></p>
                              }
                              @case ('gap') {
                                <p class="d-linha pulo">{{ row.text }}</p>
                              }
                              @default {
                                <p class="d-linha">{{ row.text }}</p>
                              }
                            }
                          }
                        </div>
                      }

                      <div class="pedido-acoes">
                        <button type="button" class="papel perigo" [disabled]="!!busy()" [appBusy]="busy() === 'r' + w.r.id" (click)="refuse(w.r)">
                          {{ busy() === 'r' + w.r.id ? 'Recusando…' : 'Recusar' }}
                        </button>
                        <button type="button" class="papel forte" [disabled]="!!busy()" [appBusy]="busy() === 'a' + w.r.id" (click)="approve(w.r)">
                          {{ busy() === 'a' + w.r.id ? 'Aprovando…' : 'Aprovar' }}
                        </button>
                      </div>
                    </li>
                  }
                </ol>
              </section>
            } @empty {
              <p class="vazio">Nada esperando você. Quando uma chave que pede aprovação quiser mudar alguma coisa, o pedido aparece aqui.</p>
            }
          }
        </div>

        <footer class="foot">
          <div class="actions">
            @if (todayUndoable().length > 1) {
              <button type="button" class="papel tudo-hoje" [disabled]="!!busy()" [appBusy]="busy() === 'hoje'" (click)="undoToday()">
                <lucide-icon [img]="UndoIcon" [size]="17" aria-hidden="true" />
                {{ busy() === 'hoje' ? 'Desfazendo…' : 'Desfazer tudo de hoje' }}
              </button>
            }
            <button type="button" class="btn-ink" (click)="close()">Pronto</button>
          </div>
        </footer>
      </div>
    </dialog>
  `,
  styleUrl: './api-requests-sheet.scss',
})
export class ApiRequestsSheet {
  readonly mode = input.required<RequestsSheetMode>();
  readonly closed = output<void>();

  private readonly requests = inject(ApiRequests);
  private readonly confirm = inject(Confirm);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly CloseIcon = ICON.fechar;
  protected readonly UndoIcon = ICON.desfazer;
  protected readonly OkIcon = ICON.pronto;
  protected readonly ArrowIcon = ICON.ir;

  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  /** O histórico da chave (null: ainda vindo). */
  private readonly resolved = signal<SiteRequest[] | null>(null);

  protected readonly history = computed(() => {
    const m = this.mode();
    return m.kind === 'historico' ? m.key : null;
  });

  /** Os que esperam aprovação, por chave, na ordem em que chegaram. */
  protected readonly waiting = computed(() => {
    const now = new Date();
    const groups = new Map<string, { id: string; nome: string; items: WaitingView[] }>();
    for (const r of this.requests.open()) {
      if (r.estado !== 'aguardando-aprovacao') continue;
      const { before, after } = this.requests.preview(r);
      const g = groups.get(r.chave.id) ?? { id: r.chave.id, nome: r.chave.nome, items: [] };
      groups.set(r.chave.id, g);
      g.items.push({
        r,
        words: requestWords(r.op, r.dados, this.requests.titleOf(r)),
        when: agoLabel(r.criado_em, now),
        fields: after ? fieldChanges(before, after) : [],
        diff: after && (before?.texto ?? '') !== after.texto ? textDiff(before?.texto ?? '', after.texto) : [],
        gone: r.op.startsWith('nota.') ? r.op !== 'nota.criar' && !before : this.requests.spendingGone(r),
      });
    }
    return [...groups.values()];
  });

  protected readonly waitingSub = computed(() => {
    const groups = this.waiting();
    const n = groups.reduce((s, g) => s + g.items.length, 0);
    if (!n) return 'Nenhum agora';
    return groups.length === 1 ? `${plural(n, 'pedido', 'pedidos')} de ${groups[0]!.nome}` : `${plural(n, 'pedido', 'pedidos')} de ${groups.length} chaves`;
  });

  protected readonly done = computed<DoneView[] | null>(() => {
    const list = this.resolved();
    if (!list) return null;
    const now = new Date();
    const today = localDay(now);
    return list.map((r) => {
      // o que entrou (ou entrou e foi desfeito) no passado; o que não entrou, como foi pedido
      const said = requestWords(r.op, r.dados, this.requests.titleOf(r), r.estado === 'aplicado' || r.estado === 'desfeito');
      const res = r.resultado as { erro?: string } | null | undefined;
      return {
        r,
        words: said.charAt(0).toUpperCase() + said.slice(1),
        when: commentWhen(r.resolvido_em ?? r.criado_em, now),
        stamp: STAMPS[r.estado] ?? null,
        why: (r.estado === 'falhou' || r.estado === 'conflito') && res?.erro ? res.erro : null,
        canUndo: undoable(r),
        today: localDay(new Date(r.resolvido_em ?? r.criado_em)) === today,
      };
    });
  });

  protected readonly todayUndoable = computed(() => (this.done() ?? []).filter((d) => d.canUndo && d.today));

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      // o foco começa no título (é de ler): nem o X com o anel, nem um Aprovar a um Enter de distância
      el.querySelector<HTMLElement>('#pedidos-titulo')?.focus();
      void this.load();
    });
  }

  private async load(): Promise<void> {
    const key = this.history();
    this.error.set(null);
    if (!key) {
      if ((await this.requests.refresh()) === null) this.error.set('Não deu para trazer os pedidos agora. Confira a internet e abra de novo.');
      return;
    }
    try {
      this.resolved.set(await this.requests.history(key.id));
    } catch (e) {
      this.error.set(e instanceof CloudError ? e.message : 'Não deu para trazer o histórico agora.');
    }
  }

  protected iconOf(op: string) {
    return ICON[OP_ICONS[op] ?? 'editar'];
  }

  /** "A nota", "O lançamento", "O envelope", "A pessoa": o que sumiu. */
  protected goneWords(op: string): string {
    return op.startsWith('gasto.') ? 'O lançamento' : op.startsWith('envelope.') ? 'O envelope' : op.startsWith('pessoa.') ? 'A pessoa' : 'A nota';
  }

  protected titleOf(r: SiteRequest): string {
    return this.requests.titleOf(r);
  }

  /** Faz uma coisa com o botão ocupado; o erro aparece no alto da folha. */
  private async run(id: string, fn: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(id);
    this.error.set(null);
    try {
      await fn();
    } catch (e) {
      this.error.set(e instanceof CloudError ? e.message : 'Não deu certo agora. Tente de novo.');
    } finally {
      this.busy.set(null);
    }
  }

  protected approve(r: SiteRequest): Promise<void> {
    return this.run('a' + r.id, () => this.requests.approve(r.id));
  }

  protected refuse(r: SiteRequest): Promise<void> {
    return this.run('r' + r.id, () => this.requests.refuse(r.id));
  }

  protected approveAll(id: string, items: readonly WaitingView[]): Promise<void> {
    return this.run(id, async () => {
      for (const w of items) await this.requests.approve(w.r.id);
    });
  }

  protected undo(d: DoneView): Promise<void> {
    return this.run(d.r.id, async () => {
      await this.requests.undo(d.r);
      this.resolved.update((l) => l?.map((r) => (r.id === d.r.id ? { ...r, estado: 'desfeito' as const } : r)) ?? l);
    });
  }

  /** Todos os de hoje, do mais novo para o mais velho (cada um volta para a nota de antes dele). */
  protected async undoToday(): Promise<void> {
    const list = this.todayUndoable();
    const sure = await this.confirm.ask({
      title: `Desfazer os ${list.length} pedidos de hoje?`,
      text: 'Cada nota volta a ser como era antes do pedido. O que mudou nelas depois fica guardado em Ajustes › Backup.',
      confirm: 'Desfazer tudo',
      cancel: 'Voltar',
      icon: null,
      tone: 'neutro',
    });
    if (!sure) return;
    await this.run('hoje', async () => {
      for (const d of list) {
        await this.requests.undo(d.r);
        this.resolved.update((l) => l?.map((r) => (r.id === d.r.id ? { ...r, estado: 'desfeito' as const } : r)) ?? l);
      }
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }
}
