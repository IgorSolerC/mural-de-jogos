import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { CloudError } from '../core/cloud-account';
import { Comments, spokenComments } from '../core/comments';
import { Review, isNote, isPrivate } from '../core/review';
import { SharedStore } from '../core/shared-store';
import { BackdropClose } from './backdrop-close';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';

/**
 * As configurações de uma ficha sua (o "Configurações" do Mais da leitura): o que vale só para ela,
 * fora do texto e da aparência. Por ora, aceitar ou não comentários: fechados, ninguém escreve,
 * responde nem reage (nem você), e os de antes ficam guardados, só você os vê (ver `Comments.setClosed`
 * e api/src/routes/comments.ts). Muda na hora, na nuvem. Chega num pedaço à parte, só quando é aberta.
 */
@Component({
  selector: 'app-card-config',
  imports: [BackdropClose, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet folha-config" aria-labelledby="config-ficha-titulo" aria-describedby="config-ficha-nome" (close)="closed.emit()" (backdropClose)="close()">
      @let r = review();
      <div class="ficha cartolina" [style.--stock]="'var(--stock-' + (r.stock ?? 'amarelo') + ')'" [attr.data-cor]="r.stock ?? 'amarelo'">
        <app-pin class="pin" />
        <header class="head">
          <div class="titulos">
            <h2 id="config-ficha-titulo">{{ note() ? 'Configurações da anotação' : 'Configurações da ficha' }}</h2>
            <p class="sub" id="config-ficha-nome">“{{ r.game.name }}”</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          <div class="grupo" role="group" aria-labelledby="config-ficha-g-comentarios">
            <h3 class="grupo-titulo" id="config-ficha-g-comentarios">Comentários</h3>
            <div class="linha">
              <div>
                <p class="linha-titulo" id="config-ficha-t-comentarios">Aceitar comentários</p>
                <p class="linha-desc" id="config-ficha-d-comentarios">Quem pode comentar escreve, responde e reage aos comentários aqui. Desligado, ninguém escreve, nem você.</p>
              </div>
              <button
                type="button"
                role="switch"
                class="interruptor"
                aria-labelledby="config-ficha-t-comentarios"
                aria-describedby="config-ficha-d-comentarios"
                [attr.aria-checked]="open()"
                [attr.aria-busy]="busy()"
                (click)="toggle()"
              >
                <span class="bolinha"></span>
              </button>
            </div>
            <!-- o que vale agora, à mão: quem escreve, ou o que acontece com os de antes -->
            <p class="explica" aria-live="polite">
              <lucide-icon class="explica-icone" [img]="open() ? OpenIcon : ClosedIcon" [size]="18" aria-hidden="true" />
              <span>{{ state() }}</span>
            </p>
            @if (error(); as e) {
              <p class="erro" role="alert">{{ e }}</p>
            }
          </div>
        </div>

        <footer class="foot">
          <div class="actions">
            <button type="button" class="btn-ink" (click)="close()">Pronto</button>
          </div>
        </footer>
      </div>
    </dialog>
  `,
  styleUrl: './card-config.scss',
})
export class CardConfig {
  readonly review = input.required<Review>();
  readonly closed = output<void>();

  private readonly comments = inject(Comments);
  private readonly shared = inject(SharedStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly CloseIcon = ICON.fechar;
  protected readonly OpenIcon = ICON.comentar;
  protected readonly ClosedIcon = ICON.privada;

  protected readonly note = computed(() => isNote(this.review()));
  private readonly code = this.comments.myCode;
  /** Os comentários estão abertos (a contagem do seu mural diz; enquanto não chega, abertos). */
  protected readonly open = computed(() => {
    const code = this.code();
    return !code || !this.comments.closedOf(code, this.review().id);
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** A frase do estado de agora: quem escreve, ou o que acontece com os comentários de antes. */
  protected readonly state = computed(() => {
    const code = this.code();
    const n = code ? this.comments.countOf(code, this.review().id) : 0;
    if (this.open()) {
      // a privada: só quem vê comenta
      if (isPrivate(this.review())) {
        const people = this.shared.get(this.review().id)?.membros.length ? ' e quem está nela' : '';
        return `${this.note() ? 'Esta anotação é privada' : 'Esta ficha é privada'}: só você${people} ${people ? 'comentam' : 'comenta'} aqui.`;
      }
      const who = this.comments.from() === 'seguidos' ? 'Quem você segue' : 'Quem segue você';
      return `${who} comenta aqui, e você também. Quem pode comentar muda em Ajustes › Amigos.`;
    }
    if (!n) return 'Fechados: ninguém escreve aqui. Ligue de novo quando quiser.';
    return `Fechados: ${n === 1 ? 'o comentário de antes fica guardado' : `os ${spokenComments(n)} de antes ficam guardados`}, só você vê, e ${n === 1 ? 'volta' : 'voltam'} para todos se você ligar de novo.`;
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('.interruptor')?.focus();
    });
    // a contagem do seu mural traz quais estão fechadas (e quem pode comentar, para a frase)
    const code = this.code();
    // (de novo, sempre: o outro aparelho pode ter fechado ou aberto depois da última vez)
    if (code) void this.comments.loadCounts(code, true);
    if (!this.comments.from()) void this.comments.loadFrom();
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected async toggle(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.comments.setClosed(this.review().id, this.open());
    } catch (err) {
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para mudar agora. Confira a internet e tente de novo.');
    } finally {
      this.busy.set(false);
    }
  }
}
