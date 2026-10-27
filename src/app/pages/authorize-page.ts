import { ChangeDetectionStrategy, Component, DestroyRef, InjectionToken, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiKeys, ConnectorRequest } from '../core/api-keys';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { ApiKeyChoices } from '../ui/api-key-choices';
import { Busy } from '../ui/busy';
import { GoogleButton } from '../ui/google-button';
import { ICON, IconModule } from '../ui/icons';
import { Pin } from '../ui/pin';

type State =
  | { kind: 'abrindo' }
  /** Dentro de um iframe: a página não se deixa usar ali (outro site poderia clicar por você). */
  | { kind: 'quadro' }
  | { kind: 'sem-pedido' }
  | { kind: 'entrar' }
  | { kind: 'indisponivel' }
  | { kind: 'venceu' }
  | { kind: 'erro'; message: string }
  | { kind: 'pedido'; pedido: ConnectorRequest }
  /** Respondeu: o navegador está indo de volta ao aplicativo. */
  | { kind: 'voltando'; para: string; permitiu: boolean; host: string };

/** A página está dentro de um iframe? (Os testes rodam num, e trocam isto.) */
export const IN_FRAME = new InjectionToken<boolean>('IN_FRAME', { providedIn: 'root', factory: () => window.top !== window.self });

/** O endereço como a página mostra: o domínio, com a porta no próprio computador ("localhost:33418"). */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * A página Autorizar (`#/autorizar?pedido=…`; PLANO-API.md, 11.2): um aplicativo (o claude.ai, o Claude
 * Code, o ChatGPT) pediu acesso ao Murall pelo OAuth, e a pessoa decide aqui o que ele pode, com as
 * mesmas escolhas de uma chave (ui/api-key-choices). O nome do aplicativo é o que ele diz de si; o que
 * vale é o endereço para onde a resposta volta, em destaque. Permitir cria a chave do conector (aparece
 * em Ajustes › Acessos) e devolve o navegador ao aplicativo. Nada daqui fica no navegador.
 */
@Component({
  selector: 'app-authorize-page',
  imports: [ApiKeyChoices, Busy, GoogleButton, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    @switch (s.kind) {
      @case ('abrindo') {
        <p class="giz" role="status"><span class="carregando" aria-hidden="true"></span>Abrindo o pedido…</p>
      }
      @case ('pedido') {
        @let p = s.pedido;
        <article class="ficha cartolina" style="--stock: var(--stock-azul)" data-cor="azul" aria-labelledby="autorizar-titulo">
          <app-pin class="pin" color="#f4f4f0" />
          <header class="head">
            <div class="titulos">
              <h1 id="autorizar-titulo"><span class="quem">{{ p.cliente }}</span> quer acesso ao seu Murall</h1>
              <p class="sub-mao">Escolha o que ele pode. Dá para mudar ou cortar depois, em Ajustes › Acessos.</p>
            </div>
          </header>

          <form class="body" id="autorizar-form" (submit)="$event.preventDefault(); permit()" novalidate>
            <!-- para onde a resposta volta: é isto que diz quem pediu (o nome, qualquer um escreve) -->
            <section class="destino" [class.estranho]="!p.conhecido && !p.local" aria-labelledby="destino-titulo">
              <lucide-icon class="destino-icone" [img]="p.local ? LocalIcon : WebIcon" [size]="26" aria-hidden="true" />
              <div class="destino-texto">
                <h2 class="destino-titulo" id="destino-titulo">Depois, você volta para</h2>
                <p class="dominio">{{ host(p.retorno) }}</p>
                <p class="destino-diz">
                  @if (p.local) {
                    Um programa neste computador, como o Claude Code no terminal.
                  } @else if (p.conhecido) {
                    O endereço do {{ p.conhecido }}.
                  } @else {
                    O Murall não conhece este endereço. Só permita se foi você quem começou a conexão agora,
                    neste aplicativo: o nome “{{ p.cliente }}” é o que ele diz de si.
                  }
                </p>
              </div>
              @if (p.conhecido) {
                <span class="selo">
                  <lucide-icon [img]="KnownIcon" [size]="15" aria-hidden="true" />
                  Conhecido
                </span>
              }
            </section>

            <app-api-key-choices [connector]="true" />

            @if (error(); as m) {
              <p class="msg-erro" role="alert">{{ m }}</p>
            }
          </form>

          <footer class="foot">
            @if (account.account(); as a) {
              <p class="conta">Na conta de <strong>{{ a.nome }}</strong></p>
            }
            <div class="actions">
              <button type="button" class="btn-quiet" [disabled]="busy() !== null" [appBusy]="busy() === 'recusar'" (click)="refuse()">Não permitir</button>
              <button type="submit" form="autorizar-form" class="btn-ink" [disabled]="busy() !== null" [appBusy]="busy() === 'permitir'">
                {{ busy() === 'permitir' ? 'Permitindo…' : 'Permitir' }}
              </button>
            </div>
          </footer>
        </article>
      }
      @default {
        <article class="bilhete" [attr.role]="s.kind === 'voltando' ? 'status' : null">
          <h1>{{ noteTitle() }}</h1>
          <p>{{ noteText() }}</p>
          @if (s.kind === 'entrar') {
            @if (cloud.config(); as cfg) {
              <app-google-button class="google" [clientId]="cfg.googleClientId" (credential)="signIn($event)" />
            }
          }
          <div class="acoes">
            @switch (s.kind) {
              @case ('erro') {
                <button type="button" class="btn-ink" (click)="load()">Tentar de novo</button>
              }
              @case ('voltando') {
                <a class="btn-quiet" [href]="s.para">Voltar agora</a>
              }
              @case ('quadro') {
                <a class="btn-ink" [href]="here" target="_blank" rel="noopener">Abrir numa aba</a>
              }
              @default {
                <a class="btn-quiet" href="./">Ir para o Murall</a>
              }
            }
          </div>
        </article>
      }
    }
  `,
  styleUrls: ['../ui/api-key-sheet.scss', './authorize-page.scss'],
})
export class AuthorizePage {
  private readonly route = inject(ActivatedRoute);
  private readonly keys = inject(ApiKeys);
  protected readonly account = inject(CloudAccount);
  protected readonly cloud = inject(Cloud);
  private readonly choices = viewChild(ApiKeyChoices);
  private readonly framed = inject(IN_FRAME);

  protected readonly WebIcon = ICON.mundo;
  protected readonly LocalIcon = ICON.computador;
  protected readonly KnownIcon = ICON.concluido;

  protected readonly state = signal<State>({ kind: 'abrindo' });
  protected readonly busy = signal<'permitir' | 'recusar' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly host = hostOf;
  protected readonly here = location.href;
  private alive = true;
  /** O pedido que já preencheu as escolhas (o que o aplicativo pediu vem marcado uma vez só). */
  private started: string | null = null;

  protected readonly noteTitle = computed(() => {
    const s = this.state();
    switch (s.kind) {
      case 'quadro':
        return 'Abra numa aba própria';
      case 'sem-pedido':
        return 'Nenhum pedido aqui';
      case 'entrar':
        return 'Entre para continuar';
      case 'indisponivel':
        return 'Ainda não para esta conta';
      case 'venceu':
        return 'Este pedido venceu';
      case 'voltando':
        return s.permitiu ? 'Pronto, permitido' : 'Não permitido';
      default:
        return 'Não deu para abrir o pedido';
    }
  });

  protected readonly noteText = computed(() => {
    const s = this.state();
    switch (s.kind) {
      case 'quadro':
        return 'Por segurança, o Murall não deixa permitir acesso de dentro de outra página.';
      case 'sem-pedido':
        return 'Esta página abre quando um aplicativo, como o Claude, pede para se conectar ao seu Murall.';
      case 'entrar':
        return 'Um aplicativo pediu acesso a um Murall. Entre na conta que ele vai usar; depois, você escolhe o que ele pode.';
      case 'indisponivel':
        return 'A API do Murall ainda não está aberta para a sua conta. Nada foi permitido.';
      case 'venceu':
        return 'O pedido vale 10 minutos e só uma resposta. Volte ao aplicativo e conecte de novo.';
      case 'voltando':
        return `Voltando para ${s.host}…`;
      case 'erro':
        return s.message;
      default:
        return '';
    }
  });

  constructor() {
    void this.load();
    // entrou pelo botão do Google: o pedido abre sozinho
    effect(() => {
      if (this.account.signedIn() && untracked(this.state).kind === 'entrar') void untracked(() => this.load());
    });
    // as escolhas começam com o que o aplicativo pediu, e o nome dele
    effect(() => {
      const choices = this.choices();
      const s = this.state();
      if (!choices || s.kind !== 'pedido' || this.started === s.pedido.id) return;
      this.started = s.pedido.id;
      untracked(() => choices.start({ nome: s.pedido.cliente, escopos: s.pedido.escopos }));
    });
    inject(DestroyRef).onDestroy(() => (this.alive = false));
  }

  async load(): Promise<void> {
    if (this.framed) return this.state.set({ kind: 'quadro' });
    this.state.set({ kind: 'abrindo' });
    await this.cloud.ready;
    const id = this.route.snapshot.queryParamMap.get('pedido');
    if (!id || !this.cloud.config()) return this.set({ kind: 'sem-pedido' });
    if (!this.account.signedIn()) return this.set({ kind: 'entrar' });
    try {
      const res = await this.keys.connectorRequest(id);
      this.set(res.disponivel ? { kind: 'pedido', pedido: res.pedido } : { kind: 'indisponivel' });
    } catch (e) {
      if (!(e instanceof CloudError)) return this.set({ kind: 'erro', message: 'Sem conexão com a nuvem agora. Confira a internet e tente de novo.' });
      if (e.code === 'pedido-nao-encontrado') return this.set({ kind: 'venceu' });
      // a sessão que a nuvem recusou já saiu deste navegador: entrar de novo
      if (e.status === 401) return this.set({ kind: 'entrar' });
      this.set({ kind: 'erro', message: e.message });
    }
  }

  private set(state: State): void {
    if (this.alive) this.state.set(state);
  }

  protected async signIn(credential: string): Promise<void> {
    try {
      await this.account.signIn(credential);
    } catch (e) {
      this.set({ kind: 'erro', message: e instanceof CloudError ? e.message : 'Não deu para entrar agora. Tente de novo.' });
    }
  }

  protected async permit(): Promise<void> {
    const s = this.state();
    if (s.kind !== 'pedido' || this.busy()) return;
    this.error.set(null);
    const input = this.choices()?.read();
    if (!input) return;
    this.busy.set('permitir');
    try {
      const res = await this.keys.permit(s.pedido.id, input);
      this.leave(res.para, true);
    } catch (e) {
      this.fail(e, 'Não deu para permitir agora. Tente de novo.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async refuse(): Promise<void> {
    const s = this.state();
    if (s.kind !== 'pedido' || this.busy()) return;
    this.error.set(null);
    this.busy.set('recusar');
    try {
      const res = await this.keys.refuse(s.pedido.id);
      this.leave(res.para, false);
    } catch (e) {
      this.fail(e, 'Não deu para responder agora. Tente de novo.');
    } finally {
      this.busy.set(null);
    }
  }

  private fail(e: unknown, fallback: string): void {
    if (e instanceof CloudError && e.code === 'pedido-nao-encontrado') return this.set({ kind: 'venceu' });
    this.error.set(e instanceof CloudError ? e.message : fallback);
  }

  /** Volta ao aplicativo, com a resposta no endereço (o código, ou o "não"). */
  protected leave(para: string, permitiu: boolean): void {
    this.set({ kind: 'voltando', para, permitiu, host: hostOf(para) });
    location.assign(para);
  }
}
