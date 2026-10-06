import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ArrowRight, LucideAngularModule } from 'lucide-angular';
import { SideBySide } from '../core/side-by-side';
import { WallView } from '../core/wall-view';
import { Toasts } from './toast';

/**
 * A tira de marcação: enquanto você marca fichas, uma tira de papel presa no pé da tela
 * conta quantas vão e leva para o lado a lado.
 */
@Component({
  selector: 'app-pick-tray',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tira" aria-label="Marcando fichas pra ver lado a lado">
      <span class="tape tape-a" aria-hidden="true"></span>
      <span class="tape tape-b" aria-hidden="true"></span>
      <p class="conta" aria-live="polite">
        @if (side.count(); as n) {
          <strong>{{ n }}</strong> {{ n === 1 ? 'marcada' : 'marcadas' }}
        } @else {
          Toque nas fichas que vão pro lado a lado
        }
      </p>
      <div class="acoes">
        @if (rest().length && view.isFiltered()) {
          <button type="button" class="btn-quiet" (click)="markVisible()">
            Marcar {{ rest().length === 1 ? 'a visível' : 'as ' + rest().length + ' visíveis' }}
          </button>
        }
        @if (side.count()) {
          <button type="button" class="btn-quiet" (click)="clear()">Limpar</button>
        }
        <button type="button" class="btn-quiet" (click)="side.picking.set(false)" aria-keyshortcuts="Escape">Pronto</button>
        <button type="button" class="btn-ink ver" [disabled]="!side.count()" (click)="open()">
          Ver lado a lado
          <lucide-icon [img]="GoIcon" [size]="20" [strokeWidth]="2.8" aria-hidden="true" />
        </button>
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
      width: min(820px, calc(100vw - 24px));
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
    .acoes {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      margin-left: auto;
    }
    .ver {
      margin-left: 6px;
    }
    .ver:disabled {
      opacity: 0.4;
      transform: none;
    }
    @keyframes rise {
      from {
        translate: 0 30px;
        opacity: 0;
      }
    }
    /* celular: a conta e os botões discretos em cima; o botão de ver ocupa a largura toda */
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
      .ver {
        flex: 1 1 100%;
        margin: 4px 0 0;
        order: 5;
      }
    }
  `,
})
export class PickTray {
  protected readonly side = inject(SideBySide);
  protected readonly view = inject(WallView);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);

  protected readonly GoIcon = ArrowRight;

  /** Fichas que a busca ou o filtro mostram e que ainda não foram marcadas. */
  protected readonly rest = computed(() => this.view.visible().filter((r) => !this.side.order().has(r.id)));

  constructor() {
    // o bilhete de aviso sobe para não ficar atrás da tira
    document.body.classList.add('has-tray');
    inject(DestroyRef).onDestroy(() => document.body.classList.remove('has-tray'));
  }

  protected markVisible(): void {
    this.side.add(this.rest().map((r) => r.id));
  }

  protected clear(): void {
    const before = this.side.clear();
    this.toasts.show('Seleção limpa', { label: 'Desfazer', run: () => this.side.restore(before) });
  }

  protected open(): void {
    this.side.picking.set(false);
    void this.router.navigateByUrl('/lado-a-lado');
  }
}
