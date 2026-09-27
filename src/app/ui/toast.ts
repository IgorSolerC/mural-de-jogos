import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';

export interface ToastMsg {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

@Injectable({ providedIn: 'root' })
export class Toasts {
  readonly current = signal<ToastMsg | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;

  show(text: string, action?: ToastMsg['action'], ms = 5200): void {
    clearTimeout(this.timer);
    this.current.set({ id: ++this.seq, text, action });
    this.timer = setTimeout(() => this.current.set(null), ms);
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.current.set(null);
  }
}

/** Aviso em papel de cupom saindo do balcão. */
@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="live" role="status" aria-live="polite">
      @if (toasts.current(); as t) {
        <div class="cupom" [attr.data-id]="t.id">
          <p>{{ t.text }}</p>
          @if (t.action; as a) {
            <button type="button" (click)="a.run(); toasts.dismiss()">{{ a.label }}</button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .live {
      position: fixed;
      left: 50%;
      bottom: calc(18px + env(safe-area-inset-bottom));
      translate: -50% 0;
      z-index: 50;
      width: max-content;
      max-width: calc(100vw - 32px);
    }
    /* com a comanda de marcação no pé da tela, o cupom sai por cima dela */
    :host-context(body.has-tray) .live {
      bottom: calc(96px + env(safe-area-inset-bottom));
    }
    @media (max-width: 560px) {
      :host-context(body.has-tray) .live {
        bottom: calc(150px + env(safe-area-inset-bottom));
      }
    }
    .cupom {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 14px 16px 18px;
      background: var(--paper);
      color: var(--ink);
      /* serrilhado do rolo de cupom na borda de baixo */
      -webkit-mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100%;
      mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100%;
      filter: drop-shadow(0 8px 12px rgb(0 0 0 / 0.5));
      animation: print var(--t-physical) var(--ease-physical);
    }
    p {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1.05rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    button {
      min-height: 36px;
      padding: 6px 12px;
      border: 0;
      border-radius: 3px;
      background: var(--ink);
      color: var(--hi);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    @keyframes print {
      from {
        clip-path: inset(0 0 100% 0);
        translate: 0 -8px;
      }
    }
  `,
})
export class Toast {
  protected readonly toasts = inject(Toasts);
}
