import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { IconModule } from './icons';

/** Uma ação da tira sobre as marcadas: a principal é o botão de tinta; as outras, discretas. */
export interface TrayAction {
  id: string;
  label: string;
  icon?: LucideIconData;
  /** O botão de tinta, no fim (só uma). */
  primary?: boolean;
  disabled?: boolean;
  /** O que o leitor de tela e a dica dizem, quando o rótulo não basta. */
  hint?: string;
  run: () => void;
}

/**
 * A tira das marcadas (PLANO-SELECAO.md, 1): enquanto você marca fichas (no mural, no Kanban, nos
 * Flashcards), uma tira de papel presa com fita no pé da tela conta quantas vão e diz o que dá para fazer
 * com elas. Cada página dá as ações; a tira só mostra. Limpar desmarca e continua marcando; Pronto sai.
 */
@Component({
  selector: 'app-selection-tray',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tira" [attr.aria-label]="label()">
      <span class="tape tape-a" aria-hidden="true"></span>
      <span class="tape tape-b" aria-hidden="true"></span>
      <p class="conta" aria-live="polite">
        @if (count(); as n) {
          <strong>{{ n }}</strong> {{ n === 1 ? words()[0] : words()[1] }}
          @if (hidden(); as h) {
            <span class="fora">{{ h === 1 ? '1 fora da vista' : h + ' fora da vista' }}</span>
          }
        } @else {
          {{ hint() }}
        }
      </p>
      <div class="acoes">
        @for (a of quiet(); track a.id) {
          <button type="button" class="btn-quiet" [attr.data-acao]="a.id" [disabled]="a.disabled" [attr.title]="a.hint ?? null" (click)="a.run()">
            @if (a.icon) {
              <lucide-icon [img]="a.icon" [size]="16" aria-hidden="true" />
            }
            {{ a.label }}
          </button>
        }
        @if (count()) {
          <button type="button" class="btn-quiet" data-acao="limpar" (click)="clear.emit()">Limpar</button>
        }
        <button type="button" class="btn-quiet" data-acao="pronto" (click)="done.emit()" aria-keyshortcuts="Escape">Pronto</button>
        <!-- sem nada marcado, a principal não tem o que fazer: a frase diz como marcar -->
        @if (count() && main(); as a) {
          <button type="button" class="btn-ink principal" [attr.data-acao]="a.id" [disabled]="a.disabled" [attr.title]="a.hint ?? null" (click)="a.run()">
            {{ a.label }}
            @if (a.icon) {
              <lucide-icon [img]="a.icon" [size]="20" aria-hidden="true" />
            }
          </button>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      position: fixed;
      left: 50%;
      bottom: calc(14px + env(safe-area-inset-bottom));
      translate: -50% 0;
      z-index: 40;
      width: min(880px, calc(100vw - 24px));
    }
    .tira {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 18px;
      padding: 10px 12px 10px 20px;
      border-radius: 2px;
      background: var(--paper);
      color: var(--ink);
      color-scheme: light;
      --focus: var(--ink);
      rotate: -0.4deg;
      box-shadow: var(--shadow-lift);
      animation: rise var(--t-physical) var(--ease-physical);
    }
    .tape {
      position: absolute;
      top: -9px;
      width: 54px;
      height: 20px;
      background: rgb(222 205 160 / 0.86);
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3));
    }
    .tape-a {
      left: -14px;
      rotate: -24deg;
    }
    .tape-b {
      right: -14px;
      rotate: 26deg;
    }
    .conta {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1.02rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-variant-numeric: tabular-nums;
    }
    .conta strong {
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.45rem;
      letter-spacing: 0;
      color: var(--red-deep);
    }
    /* as marcadas que a busca ou o filtro esconde agora: continuam marcadas, e a tira diz */
    .fora {
      margin-left: 8px;
      font-family: var(--f-hand);
      font-weight: 400;
      font-size: 1.05rem;
      letter-spacing: 0;
      text-transform: none;
      color: rgb(21 21 21 / 0.72);
    }
    .acoes {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      margin-left: auto;
    }
    .btn-quiet {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .principal {
      margin-left: 6px;
    }
    .principal:disabled {
      opacity: 0.4;
      transform: none;
    }
    @keyframes rise {
      from {
        translate: 0 30px;
        opacity: 0;
      }
    }
    /* celular: a conta e os botões discretos em cima; o principal ocupa a largura toda */
    @media (max-width: 560px) {
      :host {
        width: calc(100vw - 20px);
        bottom: calc(10px + env(safe-area-inset-bottom));
      }
      .tira {
        padding: 10px 12px 12px 14px;
        gap: 6px 10px;
      }
      /* a tira quase encosta na borda: as fitas entram um pouco para não sair da tela */
      .tape-a {
        left: -4px;
      }
      .tape-b {
        right: -4px;
      }
      .acoes {
        flex: 1 1 100%;
        justify-content: flex-start;
        gap: 4px;
      }
      .btn-quiet {
        padding-inline: 8px;
      }
      .principal {
        flex: 1 1 100%;
        justify-content: center;
        margin: 4px 0 0;
        order: 5;
      }
    }
  `,
})
export class SelectionTray {
  /** Quantas estão marcadas, e quantas delas a busca ou o filtro esconde agora. */
  readonly count = input.required<number>();
  readonly hidden = input(0);
  /** O que a tira diz sem nada marcado ("Toque nas fichas que vão pro lado a lado"). */
  readonly hint = input('Toque nas fichas para marcar');
  /** O nome da tira, para o leitor de tela. */
  readonly label = input('Marcadas');
  /** "marcada" e "marcadas" (nos Flashcards, "marcado" e "marcados"). */
  readonly words = input<readonly [string, string]>(['marcada', 'marcadas']);
  readonly actions = input<readonly TrayAction[]>([]);
  /** Limpar: desmarca tudo, continuando a marcar. */
  readonly clear = output<void>();
  /** Pronto: sai do modo de marcar. */
  readonly done = output<void>();

  protected quiet(): readonly TrayAction[] {
    return this.actions().filter((a) => !a.primary);
  }

  protected main(): TrayAction | undefined {
    return this.actions().find((a) => a.primary);
  }

  constructor() {
    // o bilhete de aviso sobe para não ficar atrás da tira
    document.body.classList.add('has-tray');
    inject(DestroyRef).onDestroy(() => document.body.classList.remove('has-tray'));
  }
}
