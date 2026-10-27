import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import {
  APROVACAO_PADRAO,
  APROVACOES,
  AREAS_DA_API,
  ATALHOS,
  ESCOPOS,
  NOME_DA_CHAVE_MAX,
  VALIDADE_PADRAO,
  VALIDADES,
  type Aprovacao,
  type AreaDaApi,
  type Atalho,
  dobra,
  textoLimpo,
} from '../../../contrato/api-v1/escopos';
import { ApiKeyInfo, ApiKeys, dayLabel, validityLabel } from '../core/api-keys';
import { Cloud } from '../core/cloud-config';
import { CloudError } from '../core/cloud-account';
import { DAY_MS } from '../core/dates';
import { KanbanStore } from '../core/kanban-store';
import { BackdropClose } from './backdrop-close';
import { Busy } from './busy';
import { Confirm } from './confirm';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';

/** Quanto tempo o "Copiado" fica no botão. */
const COPIED_MS = 2200;

/**
 * A folha de uma chave de API (Ajustes › Acessos; PLANO-API.md, 5 e 14): criar (nome, o que ela pode,
 * em que grupos, quando espera você e a validade) ou mudar uma que existe (tudo menos a validade). Ao
 * criar, a folha vira o segredo: aparece uma vez, com Copiar e o teste no terminal, e fechar sem ter
 * copiado pergunta antes. O segredo vive só nesta folha: nada dele vai para o armazenamento do navegador.
 */
@Component({
  selector: 'app-api-key-sheet',
  imports: [BackdropClose, Busy, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="sheet folha-chave"
      aria-labelledby="chave-titulo"
      (close)="closed.emit()"
      (cancel)="$event.preventDefault(); requestClose()"
      (backdropClose)="requestClose()"
    >
      <div class="ficha cartolina" style="--stock: var(--stock-azul)" data-cor="azul">
        <app-pin class="pin" color="#f4f4f0" />
        <header class="head">
          <div class="titulos">
            <h2 id="chave-titulo">{{ secret() ? 'Chave criada' : editing() ? 'Mudar a chave' : 'Nova chave' }}</h2>
            @if (secret()) {
              <p class="sub-mao">“{{ name() }}”</p>
            } @else if (editing(); as k) {
              <p class="sub">{{ validity(k) }}</p>
            }
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="requestClose()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        @if (secret(); as s) {
          <!-- o segredo: uma vez, e só nesta folha -->
          <div class="body">
            <p class="aviso" role="note">
              <lucide-icon class="aviso-icone" [img]="WarnIcon" [size]="19" aria-hidden="true" />
              <span><strong>Copie agora.</strong> Depois de fechar, nem o Murall mostra esta chave de novo: a nuvem guarda só uma impressão dela.</span>
            </p>
            <div class="linha-segredo">
              <label class="campo segredo">
                <span class="sr-only">A chave</span>
                <input #secretField type="text" readonly spellcheck="false" autocomplete="off" [value]="s" (focus)="selectAll($event)" (click)="selectAll($event)" />
              </label>
              <button type="button" class="btn-ink copiar" (click)="copy(s, 'chave')">
                <lucide-icon [img]="copied() === 'chave' ? CopiedIcon : CopyIcon" [size]="19" aria-hidden="true" />
                {{ copied() === 'chave' ? 'Copiada' : 'Copiar a chave' }}
              </button>
            </div>

            <section class="parte" aria-labelledby="chave-teste">
              <h3 class="parte-titulo" id="chave-teste">Para testar no terminal</h3>
              <div class="codigo">
                <pre><code>{{ snippet() }}</code></pre>
                <button type="button" class="papel copiar-codigo" (click)="copy(snippet(), 'teste')">
                  <lucide-icon [img]="copied() === 'teste' ? CopiedIcon : CopyIcon" [size]="17" aria-hidden="true" />
                  {{ copied() === 'teste' ? 'Copiado' : 'Copiar' }}
                </button>
              </div>
              <p class="parte-desc">A resposta diz de quem é a conta e o que a chave pode fazer.</p>
            </section>

            <div class="explica-lista">
              <p class="explica">
                <lucide-icon class="explica-icone" [img]="SafeIcon" [size]="18" aria-hidden="true" />
                <span>Guarde num gerenciador de senhas ou numa variável de ambiente (MURALL_TOKEN). Não cole a chave no texto de uma conversa: o que você escreve para uma AI fica guardado com ela.</span>
              </p>
              <p class="explica">
                <lucide-icon class="explica-icone" [img]="SoonIcon" [size]="18" aria-hidden="true" />
                <span>Por enquanto, a chave só diz de quem é a conta. Ler e mexer nas anotações, nos gastos e no calendário chega aos poucos, e cada parte respeita o que você marcou aqui.</span>
              </p>
            </div>
            <p class="sr-only" aria-live="polite">{{ said() }}</p>
          </div>

          <footer class="foot">
            <div class="actions">
              <button type="button" class="btn-ink" (click)="requestClose()">Pronto</button>
            </div>
          </footer>
        } @else {
          <form class="body" id="chave-form" (submit)="$event.preventDefault(); save()" novalidate>
            <div class="parte">
              <label class="parte-titulo" for="chave-nome">Nome</label>
              <p class="parte-desc" id="chave-nome-desc">Para você reconhecer na lista: quem usa e para quê.</p>
              <div class="campo" [class.erro]="nameMissing()">
                <input
                  id="chave-nome"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="Claude, os gastos"
                  aria-describedby="chave-nome-desc"
                  [attr.aria-invalid]="nameMissing() ? 'true' : null"
                  [maxLength]="nameMax"
                  [value]="name()"
                  (input)="name.set($any($event.target).value)"
                />
              </div>
            </div>

            <fieldset class="parte">
              <legend class="parte-titulo">O que ela pode</legend>
              <div class="atalhos" role="group" aria-label="Atalhos">
                @for (a of presets; track a.id) {
                  <button type="button" class="atalho" [attr.aria-pressed]="isPreset(a)" (click)="applyPreset(a)">{{ a.nome }}</button>
                }
              </div>
              <div class="areas">
                @for (area of areas; track area.id) {
                  <div class="area" role="group" [attr.aria-labelledby]="'area-' + area.id">
                    <p class="area-nome" [id]="'area-' + area.id">{{ area.nome }}</p>
                    @for (e of scopesOf(area.id); track e.id) {
                      <label class="caixa" [class.cuidado]="e.cuidado">
                        <input type="checkbox" [checked]="scopes().has(e.id)" [attr.aria-describedby]="'inclui-' + e.id" (change)="toggle(e.id, $any($event.target).checked)" />
                        <span class="caixa-nome">{{ e.nome }}</span>
                        <span class="caixa-inclui" [id]="'inclui-' + e.id">{{ e.inclui }}</span>
                      </label>
                    }
                  </div>
                }
              </div>
              @if (scopesMissing()) {
                <p class="falta" role="alert">Marque pelo menos uma permissão.</p>
              }
            </fieldset>

            @if (touchesNotes()) {
              <fieldset class="parte">
                <legend class="parte-titulo">Em que grupos das Anotações</legend>
                <p class="parte-desc">Vale para as anotações e para os quadros do Kanban.</p>
                <div class="segmentos dois">
                  <label class="segmento">
                    <input type="radio" name="chave-grupos" [checked]="!someGroups()" (change)="someGroups.set(false)" />
                    <span class="seg-nome">Todos os grupos</span>
                  </label>
                  <label class="segmento">
                    <input type="radio" name="chave-grupos" [checked]="someGroups()" (change)="someGroups.set(true)" />
                    <span class="seg-nome">Só alguns</span>
                  </label>
                </div>
                @if (someGroups()) {
                  @if (groupOptions().length) {
                    <div class="grupos" role="group" aria-label="Os grupos">
                      @for (g of groupOptions(); track g) {
                        <label class="caixa curta">
                          <input type="checkbox" [checked]="hasGroup(g)" (change)="toggleGroup(g, $any($event.target).checked)" />
                          <span class="caixa-nome">{{ g }}</span>
                        </label>
                      }
                    </div>
                  } @else {
                    <p class="parte-desc">Você ainda não tem anotações com grupo. Sem nenhum marcado, a chave não alcança nenhuma anotação.</p>
                  }
                  @if (!groups().length && groupOptions().length) {
                    <p class="falta" role="alert">Marque pelo menos um grupo, ou volte para Todos os grupos.</p>
                  }
                }
              </fieldset>
            }

            <fieldset class="parte">
              <legend class="parte-titulo">Quando ela espera você</legend>
              <div class="segmentos">
                @for (a of approvals; track a.id) {
                  <label class="segmento">
                    <input type="radio" name="chave-aprovacao" [checked]="approval() === a.id" (change)="approval.set(a.id)" />
                    <span class="seg-nome">{{ a.nome }}</span>
                  </label>
                }
              </div>
              <p class="parte-desc">{{ approvalHint() }}</p>
            </fieldset>

            @if (!editing()) {
              <fieldset class="parte">
                <legend class="parte-titulo">Validade</legend>
                <div class="segmentos quatro">
                  @for (d of validities; track d) {
                    <label class="segmento">
                      <input type="radio" name="chave-validade" [checked]="days() === d" (change)="days.set(d)" />
                      <span class="seg-num">{{ d === 365 ? 1 : d }}</span>
                      <span class="seg-sub">{{ d === 365 ? 'ano' : 'dias' }}</span>
                    </label>
                  }
                </div>
                <p class="parte-desc">Vale até {{ until() }}. Depois, ela para sozinha; para continuar, crie outra.</p>
              </fieldset>
            }

            @if (error(); as m) {
              <p class="msg-erro" role="alert">{{ m }}</p>
            }
          </form>

          <footer class="foot">
            <div class="actions">
              <button type="button" class="btn-quiet" (click)="requestClose()">Cancelar</button>
              <button type="submit" form="chave-form" class="btn-ink" [disabled]="busy()" [appBusy]="busy()">
                {{ busy() ? (editing() ? 'Salvando…' : 'Criando…') : editing() ? 'Salvar' : 'Criar a chave' }}
              </button>
            </div>
          </footer>
        }
      </div>
    </dialog>
  `,
  styleUrl: './api-key-sheet.scss',
})
export class ApiKeySheet {
  /** A chave a mudar; sem ela, a folha cria uma nova. */
  readonly editing = input<ApiKeyInfo | null>(null);
  readonly closed = output<void>();

  private readonly keys = inject(ApiKeys);
  private readonly kanban = inject(KanbanStore);
  private readonly cloud = inject(Cloud);
  private readonly confirm = inject(Confirm);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly secretField = viewChild<ElementRef<HTMLInputElement>>('secretField');

  protected readonly CloseIcon = ICON.fechar;
  protected readonly CopyIcon = ICON.copiar;
  protected readonly CopiedIcon = ICON.copiado;
  protected readonly WarnIcon = ICON.cuidado;
  protected readonly SafeIcon = ICON.privada;
  protected readonly SoonIcon = ICON.ampulheta;

  protected readonly presets = ATALHOS;
  protected readonly areas = AREAS_DA_API;
  protected readonly approvals = APROVACOES;
  protected readonly validities = VALIDADES;
  protected readonly nameMax = NOME_DA_CHAVE_MAX;

  protected readonly name = signal('');
  protected readonly scopes = signal<ReadonlySet<string>>(new Set());
  protected readonly someGroups = signal(false);
  protected readonly groups = signal<readonly string[]>([]);
  protected readonly approval = signal<Aprovacao>(APROVACAO_PADRAO);
  protected readonly days = signal<number>(VALIDADE_PADRAO);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Tentou salvar: só então o que falta aparece. */
  private readonly tried = signal(false);

  /** O segredo da chave recém-criada (some com a folha). */
  protected readonly secret = signal<string | null>(null);
  protected readonly copied = signal<'chave' | 'teste' | null>(null);
  private copiedOnce = false;
  protected readonly said = signal('');
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly nameMissing = computed(() => this.tried() && !textoLimpo(this.name(), NOME_DA_CHAVE_MAX));
  protected readonly scopesMissing = computed(() => this.tried() && this.scopes().size === 0);
  /** A chave mexe nas Anotações ou no Kanban: os grupos importam. */
  protected readonly touchesNotes = computed(() => [...this.scopes()].some((s) => s.startsWith('notas:') || s.startsWith('kanban:')));
  /** Os grupos das anotações (os do Kanban), com os que a chave já tinha e sumiram no fim. */
  protected readonly groupOptions = computed(() => {
    const labels = this.kanban.categories().map((c) => c.label);
    const known = new Set(labels.map(dobra));
    return [...labels, ...this.groups().filter((g) => !known.has(dobra(g)))];
  });
  protected readonly approvalHint = computed(() => APROVACOES.find((a) => a.id === this.approval())!.explica);
  protected readonly until = computed(() => dayLabel(new Date(Date.now() + this.days() * DAY_MS).toISOString()));
  protected readonly snippet = computed(() => {
    const api = this.cloud.config()?.api ?? 'https://mural-api.igorsoler.workers.dev';
    return `export MURALL_TOKEN='${this.secret() ?? ''}'\ncurl -H "Authorization: Bearer $MURALL_TOKEN" ${api}/ext/v1/eu`;
  });
  protected readonly validity = validityLabel;

  constructor() {
    afterNextRender(() => {
      const k = this.editing();
      if (k) {
        this.name.set(k.nome);
        this.scopes.set(new Set(k.escopos));
        this.someGroups.set(!!k.grupos?.length);
        this.groups.set(k.grupos ?? []);
        this.approval.set(k.aprovacao);
      }
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLInputElement>('#chave-nome')?.focus();
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  protected scopesOf(area: AreaDaApi) {
    return ESCOPOS.filter((e) => e.area === area);
  }

  protected toggle(id: string, on: boolean): void {
    this.scopes.update((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected isPreset(a: Atalho): boolean {
    const s = this.scopes();
    return s.size === a.escopos.length && a.escopos.every((id) => s.has(id));
  }

  protected applyPreset(a: Atalho): void {
    this.scopes.set(new Set(a.escopos));
  }

  protected hasGroup(g: string): boolean {
    return this.groups().some((x) => dobra(x) === dobra(g));
  }

  protected toggleGroup(g: string, on: boolean): void {
    this.groups.update((list) => (on ? [...list.filter((x) => dobra(x) !== dobra(g)), g] : list.filter((x) => dobra(x) !== dobra(g))));
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    this.tried.set(true);
    this.error.set(null);
    const nome = textoLimpo(this.name(), NOME_DA_CHAVE_MAX);
    const missingGroups = this.touchesNotes() && this.someGroups() && !this.groups().length && this.groupOptions().length > 0;
    if (!nome || !this.scopes().size || missingGroups) {
      this.focusFirstProblem();
      return;
    }
    const input = {
      nome,
      escopos: ESCOPOS.filter((e) => this.scopes().has(e.id)).map((e) => e.id),
      grupos: this.touchesNotes() && this.someGroups() && this.groups().length ? [...this.groups()] : null,
      aprovacao: this.approval(),
    };
    this.busy.set(true);
    try {
      const k = this.editing();
      if (k) {
        await this.keys.update(k.id, input);
        this.dialog().nativeElement.close();
        return;
      }
      const res = await this.keys.create({ ...input, validade: this.days() });
      this.name.set(res.chave.nome);
      this.secret.set(res.segredo);
      // o foco vai para o Copiar, o que a pessoa precisa fazer agora (depois de a folha virar o segredo)
      afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>('.copiar')?.focus(), { injector: this.injector });
    } catch (e) {
      this.error.set(e instanceof CloudError ? e.message : 'Não deu para salvar a chave agora. Tente de novo.');
    } finally {
      this.busy.set(false);
    }
  }

  private focusFirstProblem(): void {
    queueMicrotask(() => {
      const el = this.dialog().nativeElement;
      (el.querySelector<HTMLElement>('[aria-invalid="true"]') ?? el.querySelector<HTMLElement>('.falta'))?.scrollIntoView({ block: 'center' });
      el.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }

  protected selectAll(e: Event): void {
    (e.target as HTMLInputElement).select();
  }

  protected async copy(text: string, what: 'chave' | 'teste'): Promise<void> {
    this.said.set('');
    try {
      await navigator.clipboard.writeText(text);
      this.copiedOnce = true;
      this.copied.set(what);
      this.said.set(what === 'chave' ? 'Chave copiada' : 'Teste copiado');
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(null), COPIED_MS);
    } catch {
      // sem a área de transferência, o segredo fica selecionado no campo para copiar à mão
      this.secretField()?.nativeElement.focus();
      this.secretField()?.nativeElement.select();
      this.said.set('Não deu para copiar: a chave está selecionada no campo.');
    }
  }

  /** Fechar: com o segredo à mostra e nada copiado, pergunta antes (ele não volta). */
  async requestClose(): Promise<void> {
    const el = this.dialog().nativeElement;
    if (this.secret() && !this.copiedOnce) {
      const sure = await this.confirm.ask({
        title: 'Fechar sem copiar?',
        text: 'A chave não aparece de novo. Se fechar agora sem copiar, ela fica sem uso: apague na lista e crie outra.',
        confirm: 'Fechar mesmo assim',
        cancel: 'Voltar e copiar',
        icon: null,
        tone: 'neutro',
      });
      if (!sure) return;
    }
    // o segredo sai da memória junto com a folha
    this.secret.set(null);
    if (el.open) el.close();
  }
}
