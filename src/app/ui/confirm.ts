import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injectable,
  afterRenderEffect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LucideAngularModule, LucideIconData, Trash2 } from 'lucide-angular';
import { Pin } from './pin';

export interface ConfirmOptions {
  /** A pergunta, na faixa da ficha. */
  title?: string;
  /** O que acontece se a pessoa disser que sim. */
  text: string;
  /** O botão que confirma (em vermelho). */
  confirm: string;
  /** O botão que volta atrás. */
  cancel?: string;
  /** O ícone do botão que confirma; null tira. */
  icon?: LucideIconData | null;
}

export interface ChoiceOptions extends ConfirmOptions {
  /** A outra resposta possível, ao lado da principal (`choose` devolve 'secondary'). */
  secondary: string;
}

/** O que a pessoa respondeu: a principal, a outra, ou nada (Cancelar, Esc, clique fora). */
export type Choice = 'confirm' | 'secondary' | null;

interface Question extends Required<ConfirmOptions> {
  id: number;
  secondary: string | null;
  /** Perigo (apagar: ficha vermelha, botão vermelho) ou neutro (uma escolha: ficha azul, botão de tinta). */
  tone: 'perigo' | 'neutro';
  resolve: (choice: Choice) => void;
}

/**
 * O "Tem certeza?" antes de apagar alguma coisa: `ask` abre a fichinha e devolve se a pessoa
 * confirmou. Esc, o clique fora e o Cancelar valem como não.
 */
@Injectable({ providedIn: 'root' })
export class Confirm {
  readonly current = signal<Question | null>(null);
  private seq = 0;

  ask(options: ConfirmOptions): Promise<boolean> {
    // uma pergunta por vez: a que estava aberta vale como não
    this.current()?.resolve(null);
    return new Promise((resolve) =>
      this.current.set({
        title: 'Tem certeza?',
        cancel: 'Cancelar',
        icon: Trash2,
        ...options,
        secondary: null,
        tone: 'perigo',
        id: ++this.seq,
        resolve: (choice) => resolve(choice === 'confirm'),
      }),
    );
  }

  /** Uma escolha entre duas respostas, sem nada de perigoso: Cancelar, Esc e o clique fora devolvem null. */
  choose(options: ChoiceOptions): Promise<Choice> {
    this.current()?.resolve(null);
    return new Promise((resolve) =>
      this.current.set({ title: 'O que fazer?', cancel: 'Agora não', icon: null, ...options, tone: 'neutro', id: ++this.seq, resolve }),
    );
  }

  answer(ok: boolean | Choice): void {
    const q = this.current();
    if (!q) return;
    this.current.set(null);
    q.resolve(ok === true ? 'confirm' : ok === false ? null : ok);
  }
}

/** A fichinha da pergunta, pregada por cima de tudo (inclusive do editor e da leitura). */
@Component({
  selector: 'app-confirm',
  imports: [LucideAngularModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="sheet confirma"
      role="alertdialog"
      aria-labelledby="confirma-titulo"
      aria-describedby="confirma-texto"
      (close)="confirm.answer(false)"
      (pointerdown)="onPointerDown($event)"
      (click)="onBackdrop($event)"
    >
      @if (confirm.current(); as q) {
        <div class="ficha cartolina" [attr.data-cor]="q.tone === 'neutro' ? 'azul' : 'vermelho'">
          <app-pin class="pin" color="#f4f4f0" />
          <header class="head">
            <h2 id="confirma-titulo">{{ q.title }}</h2>
          </header>
          <div class="body">
            <p id="confirma-texto">{{ q.text }}</p>
          </div>
          <footer class="foot">
            <div class="actions">
              <button type="button" class="btn-quiet" data-cancelar (click)="confirm.answer(false)">{{ q.cancel }}</button>
              @if (q.secondary) {
                <button type="button" class="btn-quiet outra" (click)="confirm.answer('secondary')">{{ q.secondary }}</button>
              }
              <button type="button" class="btn-ink" [class.danger]="q.tone === 'perigo'" (click)="confirm.answer(true)">
                @if (q.icon) {
                  <lucide-icon [img]="q.icon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                }
                {{ q.confirm }}
              </button>
            </div>
          </footer>
        </div>
      }
    </dialog>
  `,
  styleUrl: './confirm.scss',
})
export class ConfirmDialog {
  protected readonly confirm = inject(Confirm);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // abre depois de desenhar a pergunta, para o foco cair no Cancelar (apagar nunca é o padrão)
    afterRenderEffect(() => {
      const q = this.confirm.current();
      const el = this.dialog().nativeElement;
      if (q && !el.open) {
        el.showModal();
        el.querySelector<HTMLElement>('[data-cancelar]')?.focus();
      } else if (!q && el.open) {
        el.close();
      }
    });
  }

  /** O clique começou fora da ficha? Arrastar de dentro para fora não fecha. */
  private downOnBackdrop = false;

  protected onPointerDown(e: PointerEvent): void {
    this.downOnBackdrop = e.target === e.currentTarget;
  }

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement && this.downOnBackdrop) this.confirm.answer(false);
  }
}
