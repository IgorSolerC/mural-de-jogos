import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ICON, IconModule } from './icons';
import { CloudSync } from '../core/cloud-sync';
import { fichaLink, hasLink } from '../core/ficha-link';
import { KanbanStore } from '../core/kanban-store';
import { Review, isNote } from '../core/review';
import { SharedStore } from '../core/shared-store';
import { readText, writeText } from '../core/storage';
import { BackdropClose } from './backdrop-close';
import { Pin } from './pin';

/** Quanto tempo o "Copiado" fica no botão. */
const COPIED_MS = 2200;

/** Como o último link começava neste aparelho (`nao`: fechada); o próximo começa igual. */
export const LINK_START_KEY = 'meu-mural:link-aberta:v1';

/**
 * O link da ficha (o "Link da anotação" do Mais da leitura): o endereço que abre só ela, maximizada,
 * para quem não usa o Murall (ver pages/ficha-page.ts), com Copiar, Abrir e, onde o aparelho deixa,
 * Enviar. O link começa com a ficha aberta ou fechada (como no mural), à escolha. Toda ficha que não é privada tem link; a privada diz por que não tem, e quem está sem conta,
 * onde entrar. Chega num pedaço à parte, só quando é aberta (ver a leitura).
 */
@Component({
  selector: 'app-link-sheet',
  imports: [BackdropClose, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet folha-link" aria-labelledby="link-titulo" aria-describedby="link-nome" (close)="closed.emit()" (backdropClose)="close()">
      @let r = review();
      <div class="ficha cartolina" [style.--stock]="'var(--stock-' + (r.stock ?? 'amarelo') + ')'" [attr.data-cor]="r.stock ?? 'amarelo'">
        <app-pin class="pin" color="#2f6bff" />
        <header class="head">
          <div class="titulos">
            <h2 id="link-titulo">{{ note() ? 'Link da anotação' : 'Link da ficha' }}</h2>
            <p class="sub" id="link-nome">“{{ r.game.name }}”</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          @if (!linked()) {
            <!-- a privada não tem link: só quem escreveu vê -->
            <p class="explica">
              <lucide-icon class="explica-icone" [img]="PrivateIcon" [size]="18" aria-hidden="true" />
              <span>{{ note() ? 'Esta anotação é privada' : 'Esta ficha é privada' }}: só você vê, e ela não tem link. Para ter um, deixe-a pública em {{ shared() ? 'Compartilhar' : 'Editar' }}.</span>
            </p>
          } @else if (url(); as link) {
            <div class="linha-link">
              <label class="campo">
                <span class="sr-only">O link</span>
                <input #campo type="text" readonly spellcheck="false" [value]="link" (focus)="selectAll($event)" (click)="selectAll($event)" />
              </label>
              <button type="button" class="btn-ink copiar" (click)="copy(link)">
                <lucide-icon [img]="copied() ? CopiedIcon : CopyIcon" [size]="19" aria-hidden="true" />
                {{ copied() ? 'Copiado' : 'Copiar o link' }}
              </button>
            </div>
            <p class="sr-only" aria-live="polite">{{ said() }}</p>

            <!-- como quem abrir o link encontra a ficha: aberta para ler, ou fechada como no mural -->
            <fieldset class="comeco">
              <legend class="comeco-titulo">Quem abrir o link encontra {{ note() ? 'a anotação' : 'a ficha' }}</legend>
              <div class="segmentos dois">
                <label class="segmento">
                  <input type="radio" name="link-comeco" [checked]="startOpen()" (change)="setStart(true)" />
                  <lucide-icon class="seg-icone" [img]="OpenStartIcon" [size]="18" aria-hidden="true" />
                  <span class="seg-nome">Aberta</span>
                  <span class="seg-sub">Pronta para ler</span>
                </label>
                <label class="segmento">
                  <input type="radio" name="link-comeco" [checked]="!startOpen()" (change)="setStart(false)" />
                  <lucide-icon class="seg-icone" [img]="ClosedStartIcon" [size]="18" aria-hidden="true" />
                  <span class="seg-nome">Fechada</span>
                  <span class="seg-sub">Como no mural</span>
                </label>
              </div>
            </fieldset>

            <div class="explica-lista">
              <p class="explica">
                <lucide-icon class="explica-icone" [img]="PublicIcon" [size]="18" aria-hidden="true" />
                <span>Quem abrir vê só {{ note() ? 'esta anotação' : 'esta ficha' }}, sem precisar de conta. Com conta, também reage e comenta.</span>
              </p>
              @if (boardOnly()) {
                <p class="explica">
                  <lucide-icon class="explica-icone" [img]="BoardIcon" [size]="18" aria-hidden="true" />
                  <span>Ela continua só no Kanban: fora do seu mural, só quem tiver o link chega nela.</span>
                </p>
              }
              @if (pending()) {
                <p class="explica">
                  <lucide-icon class="explica-icone" [img]="CloudIcon" [size]="18" aria-hidden="true" />
                  <span>A última mudança ainda está indo para a nuvem: quem abrir agora pode ver a de antes por uns instantes.</span>
                </p>
              }
            </div>
          } @else {
            <!-- sem conta, a ficha não está na nuvem: não há o que o link abra -->
            <div class="sem-conta">
              <p>O link abre a ficha guardada na sua conta. Entre com o Google para ter um: {{ note() ? 'a anotação' : 'a ficha' }} continua só neste navegador até lá.</p>
              <button type="button" class="papel forte" (click)="goSignIn()">Entrar em Ajustes › Conta</button>
            </div>
          }
        </div>

        <footer class="foot">
          @if (linked() && url(); as link) {
            <div class="mais-acoes">
              <a class="papel" [href]="link" target="_blank" rel="noopener">
                <lucide-icon [img]="OpenIcon" [size]="17" aria-hidden="true" />
                Abrir
              </a>
              @if (canSend) {
                <button type="button" class="papel" (click)="send(link)">
                  <lucide-icon [img]="SendIcon" [size]="17" aria-hidden="true" />
                  Enviar
                </button>
              }
            </div>
          }
          <div class="actions">
            <button type="button" [class]="linked() && url() ? 'btn-quiet' : 'btn-ink'" (click)="close()">Pronto</button>
          </div>
        </footer>
      </div>
    </dialog>
  `,
  styleUrl: './link-sheet.scss',
})
export class LinkSheet {
  readonly review = input.required<Review>();
  /** O código de quem o link mostra (o dono da ficha); null sem conta. */
  readonly code = input<string | null>(null);
  readonly closed = output<void>();
  /** Foi para outra página (Ajustes › Conta): quem abriu a folha fecha a leitura também. */
  readonly left = output<void>();

  private readonly sync = inject(CloudSync);
  private readonly kanban = inject(KanbanStore);
  private readonly sharedStore = inject(SharedStore);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('campo');

  protected readonly CloseIcon = ICON.fechar;
  protected readonly CopyIcon = ICON.copiar;
  protected readonly CopiedIcon = ICON.copiado;
  protected readonly OpenIcon = ICON.abrirFora;
  protected readonly SendIcon = ICON.compartilhar;
  protected readonly PrivateIcon = ICON.privada;
  protected readonly PublicIcon = ICON.publica;
  protected readonly BoardIcon = ICON.colunas;
  protected readonly CloudIcon = ICON.nuvem;
  protected readonly OpenStartIcon = ICON.aumentar;
  protected readonly ClosedStartIcon = ICON.diminuir;

  protected readonly note = computed(() => isNote(this.review()));
  protected readonly linked = computed(() => hasLink(this.review()));
  protected readonly shared = computed(() => !!this.sharedStore.get(this.review().id));
  /** O link começa com a ficha aberta (o de sempre) ou fechada; a escolha fica para o próximo. */
  protected readonly startOpen = signal(readText(LINK_START_KEY) !== 'nao');
  protected readonly url = computed(() => {
    const code = this.code();
    return code ? fichaLink(code, this.review().id, undefined, this.startOpen()) : null;
  });
  /** A anotação está só no Kanban: o link é o único jeito de os outros chegarem nela. */
  protected readonly boardOnly = computed(() => this.note() && this.kanban.boardOnly().has(this.review().id));
  /** A ficha mudou depois do último envio (a nuvem ainda tem a de antes). */
  protected readonly pending = computed(() => {
    const at = this.sync.lastSyncAt();
    return this.sync.status() !== 'fora' && !this.shared() && (at === null || Date.parse(this.review().updatedAt) > at);
  });
  /** O aparelho sabe mandar o link para outro app (o celular, quase sempre). */
  protected readonly canSend = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  protected readonly copied = signal(false);
  protected readonly said = signal('');
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      (el.querySelector<HTMLElement>('.copiar') ?? el.querySelector<HTMLElement>('.fecha'))?.focus();
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected setStart(open: boolean): void {
    this.startOpen.set(open);
    writeText(LINK_START_KEY, open ? 'sim' : 'nao');
    // o link mudou: o "Copiado" era do outro
    this.copied.set(false);
  }

  protected selectAll(e: Event): void {
    (e.target as HTMLInputElement).select();
  }

  /** Copia; sem a área de transferência (o navegador não deixou), o link fica selecionado no campo. */
  protected async copy(link: string): Promise<void> {
    // o aviso para o leitor de tela muda a cada vez, senão a segunda cópia não é dita
    this.said.set('');
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
      this.said.set('Link copiado');
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), COPIED_MS);
    } catch {
      // o Chrome só pinta a seleção no campo com o foco
      this.field()?.nativeElement.focus();
      this.field()?.nativeElement.select();
      this.said.set('Não deu para copiar: o link está selecionado no campo.');
    }
  }

  protected async send(link: string): Promise<void> {
    try {
      await navigator.share({ title: this.review().game.name, url: link });
    } catch {
      /* desistiu de enviar */
    }
  }

  protected goSignIn(): void {
    this.close();
    // a leitura é um diálogo modal: aberta, ela cobriria a página da conta
    this.left.emit();
    void this.router.navigate(['/ajustes'], { queryParams: { aba: 'conta' } });
  }
}
