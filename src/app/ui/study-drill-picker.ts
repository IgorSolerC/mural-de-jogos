import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { fold, nameCollator } from '../core/text';
import { BackdropClose } from './backdrop-close';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';

/** Um flashcard na lista do "Escolher quais": a frente, o que dizer embaixo e a cor da cartolina. */
export interface DrillChoice {
  note: string;
  title: string;
  /** O subtítulo da frente, quando tem. */
  subtitle?: string;
  /** O nível, e o baralho quando o treino junta vários. */
  meta: string;
  stock: string;
  /** O ícone do baralho, na cartolina pequena. */
  icon: LucideIconData | null;
}

/**
 * O "Escolher quais" do Treinar: a lista de todos os flashcards do baralho (ou do grupo, ou de tudo), para
 * marcar com quais treinar. É a mesma folha do "Escolher fichas" do perfil (profile-picker.scss): a busca em
 * cima, uma linha por flashcard com a marca redonda, e no pé quantos foram marcados. "Treinar" abre a mesa com
 * eles; nada da escolha fica guardado.
 */
@Component({
  selector: 'app-study-drill-picker',
  imports: [BackdropClose, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- as teclas ficam aqui: a página por baixo não ouve o Esc nem o que se digita -->
    <dialog #dialog class="sheet escolher" aria-labelledby="treino-titulo" (close)="closed.emit()" (backdropClose)="close()" (keydown)="$event.stopPropagation()">
      <div class="ficha cartolina" data-cor="amarelo">
        <app-pin class="pin" />
        <header class="head">
          <div>
            <h2 id="treino-titulo">Escolher os flashcards</h2>
            <p class="para">Para treinar em {{ place() }}. O treino não conta no progresso.</p>
          </div>
          <button type="button" class="icon-btn" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="ferramentas">
          <div class="linha-busca">
            <label class="busca">
              <lucide-icon [img]="SearchIcon" [size]="18" aria-hidden="true" />
              <span class="sr-only">Procurar pelo nome</span>
              <input #search type="search" autocomplete="off" placeholder="Procurar pelo nome" [value]="query()" (input)="query.set($any($event.target).value)" />
            </label>
            @if (shown().length) {
              <!-- marcar ou desmarcar de uma vez o que a busca mostra -->
              <button type="button" class="btn-quiet todos" (click)="toggleShown()">
                {{ allShown() ? 'Desmarcar' : 'Marcar' }} {{ shown().length === cards().length ? 'todos' : 'estes ' + shown().length }}
              </button>
            }
          </div>
        </div>

        <div class="body">
          <ul class="lista" aria-label="Flashcards">
            @for (c of shown(); track c.note) {
              @let on = picked().has(c.note);
              <li>
                <label class="item" [class.on]="on">
                  <input type="checkbox" [checked]="on" (change)="toggle(c.note)" />
                  <span class="capa folhinha" [style.--stock]="'var(--stock-' + c.stock + ')'" [attr.data-cor]="c.stock" aria-hidden="true">
                    @if (c.icon) {
                      <lucide-icon [img]="c.icon" [size]="18" aria-hidden="true" />
                    }
                  </span>
                  <span class="texto">
                    <span class="nome">
                      {{ c.title }}
                      @if (c.subtitle) {
                        <span class="sub"> · {{ c.subtitle }}</span>
                      }
                    </span>
                    <span class="meta">{{ c.meta }}</span>
                  </span>
                  <span class="marca" aria-hidden="true">
                    <lucide-icon [img]="CheckIcon" [size]="16" aria-hidden="true" />
                  </span>
                </label>
              </li>
            } @empty {
              <li class="nada">Nenhum flashcard com “{{ query().trim() }}”.</li>
            }
          </ul>
        </div>

        <footer class="foot">
          <p class="conta" aria-live="polite">{{ picked().size }} {{ picked().size === 1 ? 'escolhido' : 'escolhidos' }}</p>
          <div class="actions">
            <button type="button" class="btn-quiet" (click)="close()">Cancelar</button>
            <button type="button" class="btn-ink" [disabled]="!picked().size" (click)="start()">
              <lucide-icon [img]="TrainIcon" [size]="18" aria-hidden="true" />
              Treinar
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  `,
  styleUrls: ['./profile-picker.scss', './card-picker.scss', './study-drill-picker.scss'],
})
export class StudyDrillPicker {
  /** Todos os flashcards do que se treina. */
  readonly cards = input.required<readonly DrillChoice[]>();
  /** O baralho, o grupo ou "todos os baralhos", na frase do alto. */
  readonly place = input.required<string>();
  /** Os escolhidos, quando a pessoa aperta Treinar. */
  readonly chosen = output<string[]>();
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly CheckIcon = ICON.pronto;
  protected readonly TrainIcon = ICON.alvo;
  protected readonly query = signal('');
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');

  /** De A a Z pela frente, filtrados pela busca (sem acento e sem caixa, no nome e no que vem embaixo). */
  protected readonly shown = computed(() => {
    const q = fold(this.query().trim());
    const list = q ? this.cards().filter((c) => fold(`${c.title} ${c.subtitle ?? ''} ${c.meta}`).includes(q)) : [...this.cards()];
    return list.sort((a, b) => nameCollator.compare(a.title, b.title));
  });
  protected readonly allShown = computed(() => {
    const on = this.picked();
    return this.shown().every((c) => on.has(c.note));
  });

  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      this.search().nativeElement.focus();
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected toggle(note: string): void {
    this.picked.update((s) => {
      const next = new Set(s);
      if (!next.delete(note)) next.add(note);
      return next;
    });
  }

  protected toggleShown(): void {
    const all = this.allShown();
    const notes = this.shown().map((c) => c.note);
    this.picked.update((s) => {
      const next = new Set(s);
      for (const n of notes) {
        if (all) next.delete(n);
        else next.add(n);
      }
      return next;
    });
  }

  protected start(): void {
    const on = this.picked();
    if (!on.size) return;
    // na ordem da lista (o treino embaralha de qualquer jeito)
    this.chosen.emit(this.cards().filter((c) => on.has(c.note)).map((c) => c.note));
    this.close();
  }
}
