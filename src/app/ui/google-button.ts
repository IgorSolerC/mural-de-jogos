import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/**
 * O botão "Fazer login com o Google" (Google Identity Services). O script do Google só é carregado
 * quando este botão aparece, nunca na abertura do mural. Ele devolve o `credential` (o ID token),
 * que a nossa API confere.
 */
interface GoogleIdApi {
  initialize(options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

const SCRIPT = 'https://accounts.google.com/gsi/client';
let loading: Promise<GoogleIdApi> | null = null;
let initializedFor: string | null = null;
/** O botão na tela agora (o Google tem um callback só por página). */
let listener: ((credential: string) => void) | null = null;

function loadGoogle(): Promise<GoogleIdApi> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    const fail = () => {
      loading = null;
      script.remove();
      reject(new Error('sem o script do Google'));
    };
    const timer = setTimeout(fail, 15_000);
    script.onload = () => {
      clearTimeout(timer);
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else fail();
    };
    script.onerror = () => {
      clearTimeout(timer);
      fail();
    };
    document.head.appendChild(script);
  });
  return loading;
}

@Component({
  selector: 'app-google-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #slot class="slot" [class.pronto]="state() === 'pronto'"></div>
    @switch (state()) {
      @case ('carregando') {
        <p class="aviso" role="status"><span class="carregando" aria-hidden="true"></span>Carregando o login do Google…</p>
      }
      @case ('erro') {
        <p class="aviso erro" role="alert">
          Não consegui carregar o login do Google. Confira a internet, ou se um bloqueador está barrando
          accounts.google.com.
        </p>
        <button type="button" class="btn-quiet" (click)="render()">Tentar de novo</button>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .slot {
      min-height: 0;
    }
    .slot.pronto {
      min-height: 44px;
    }
    .aviso {
      font-size: 0.92rem;
      line-height: 1.4;
      color: var(--ink-2);
    }
    .aviso.erro {
      color: #6b0000;
      font-weight: 600;
    }
    .btn-quiet {
      margin-top: 6px;
      margin-left: -12px;
    }
  `,
})
export class GoogleButton {
  readonly clientId = input.required<string>();
  /** O ID token do Google, depois que a pessoa escolhe a conta. */
  readonly credential = output<string>();
  protected readonly state = signal<'carregando' | 'pronto' | 'erro'>('carregando');
  private readonly slot = viewChild.required<ElementRef<HTMLElement>>('slot');
  private readonly mine = (credential: string) => this.credential.emit(credential);

  constructor() {
    afterNextRender(() => void this.render());
    inject(DestroyRef).onDestroy(() => {
      if (listener === this.mine) listener = null;
    });
  }

  protected async render(): Promise<void> {
    this.state.set('carregando');
    try {
      const api = await loadGoogle();
      listener = this.mine;
      if (initializedFor !== this.clientId()) {
        api.initialize({
          client_id: this.clientId(),
          callback: (response) => {
            if (response.credential) listener?.(response.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        initializedFor = this.clientId();
      }
      const el = this.slot().nativeElement;
      el.replaceChildren();
      api.renderButton(el, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        locale: 'pt-BR',
        width: Math.max(200, Math.min(320, Math.floor(el.clientWidth || 320))),
      });
      this.state.set('pronto');
    } catch {
      this.state.set('erro');
    }
  }
}
