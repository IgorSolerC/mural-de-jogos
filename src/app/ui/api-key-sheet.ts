import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { ApiKeyInfo, ApiKeys, validityLabel } from '../core/api-keys';
import { Cloud } from '../core/cloud-config';
import { CloudError } from '../core/cloud-account';
import { ApiKeyChoices } from './api-key-choices';
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
  imports: [ApiKeyChoices, BackdropClose, Busy, IconModule, Pin],
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
                <span>Hoje a chave lê e escreve nas anotações e nos gastos; o que ela escreve entra quando o Murall está aberto em algum aparelho seu. O calendário e o Kanban chegam aos poucos, e cada parte respeita o que você marcou aqui.</span>
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
            <app-api-key-choices #choices [withValidity]="!editing()" />

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
  private readonly cloud = inject(Cloud);
  private readonly confirm = inject(Confirm);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly secretField = viewChild<ElementRef<HTMLInputElement>>('secretField');
  private readonly choices = viewChild(ApiKeyChoices);

  protected readonly CloseIcon = ICON.fechar;
  protected readonly CopyIcon = ICON.copiar;
  protected readonly CopiedIcon = ICON.copiado;
  protected readonly WarnIcon = ICON.cuidado;
  protected readonly SafeIcon = ICON.privada;
  protected readonly SoonIcon = ICON.ampulheta;

  /** O nome da chave criada, escrito à mão embaixo do título do segredo. */
  protected readonly name = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** O segredo da chave recém-criada (some com a folha). */
  protected readonly secret = signal<string | null>(null);
  protected readonly copied = signal<'chave' | 'teste' | null>(null);
  private copiedOnce = false;
  protected readonly said = signal('');
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly snippet = computed(() => {
    const api = this.cloud.config()?.api ?? 'https://mural-api.igorsoler.workers.dev';
    return `export MURALL_TOKEN='${this.secret() ?? ''}'\ncurl -H "Authorization: Bearer $MURALL_TOKEN" ${api}/ext/v1/eu`;
  });
  protected readonly validity = validityLabel;

  constructor() {
    afterNextRender(() => {
      const k = this.editing();
      if (k) this.choices()?.start(k);
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLInputElement>('#chave-nome')?.focus();
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    const input = this.choices()?.read();
    if (!input) return;
    this.busy.set(true);
    try {
      const k = this.editing();
      if (k) {
        await this.keys.update(k.id, input);
        this.dialog().nativeElement.close();
        return;
      }
      const res = await this.keys.create(input);
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
