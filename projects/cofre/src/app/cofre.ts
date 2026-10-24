import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CofreAberto } from '../core/abrir';
import { type Entrada, ErroApi } from '../core/api';
import { descreverAparelho, lerVolta, MENSAGENS_DO_LOGIN, urlDoLogin } from '../core/entrar';
import { Abrir } from './abrir/abrir';
import { AreaDeTransferencia } from './area-de-transferencia';
import { Aberto } from './aberto/aberto';
import { demonstracao } from './ambiente';
import { Criar } from './criar/criar';
import { type Porta, PortaDoCofre } from './porta/porta';
import { type SemServiceWorker, tirarServiceWorkers } from './sem-service-worker';
import { SERVICOS } from './servicos';
import { Topo } from './topo/topo';
import { VigiaDoDom } from './vigia-do-dom';

/**
 * A raiz do cofre: decide o que aparece. Primeiro a porta (seção 8.1): entrar com o Google, que volta em
 * `/entrar` com o código; a URL é limpa antes de qualquer outra coisa (o código não fica no histórico).
 * Com a sessão de entrada, a API diz se a conta já tem cofre: sem cofre, as telas de criar; com cofre,
 * a de abrir, e depois o cofre aberto.
 *
 * A página só deixa entrar com as proteções da hospedagem valendo (seção 7): o endereço seguro, o
 * isolamento de origem (COOP e COEP do Worker) e nenhum service worker. Sem elas, nem troca o código.
 */
@Component({
  selector: 'cofre-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Criar, PortaDoCofre, Abrir, Aberto, Topo],
  template: `
    <cofre-topo />
    <main class="fluxo">
      @if (estranho()) {
        <p class="vigia" role="alert">
          Algo de fora mexeu nesta página ({{ estranho() }}), o que costuma ser uma extensão do navegador. Tranque o cofre e use um perfil do navegador sem extensões.
        </p>
      }
      @if (entrada(); as entrada) {
        <!-- cada tela num pedaço à parte, baixado só quando aparece (o bundle inicial fica só com a porta) -->
        @switch (tela()) {
          @case ('criar') {
            @defer (on immediate) {
              <cofre-criar [entrada]="entrada" />
            } @loading {
              <p class="carregando">Abrindo…</p>
            }
          }
          @case ('abrir') {
            @defer (on immediate) {
              <cofre-abrir [entrada]="entrada" [congeladoAte]="congeladoAte()" (aberto)="cofre.set($event); tela.set('aberto')" (sair)="sair()" />
            } @loading {
              <p class="carregando">Abrindo…</p>
            }
          }
          @case ('aberto') {
            @defer (on immediate) {
              <cofre-aberto [cofre]="cofre()!" [conta]="entrada.codigo" />
            } @loading {
              <p class="carregando">Abrindo…</p>
            }
          }
          @default {
            <cofre-porta [porta]="porta()" [conta]="entrada.codigo" [erro]="erro()" [bloqueio]="bloqueio()" [provas]="provas()" />
          }
        }
      } @else {
        <cofre-porta [porta]="porta()" [erro]="erro()" [bloqueio]="bloqueio()" [provas]="provas()" (entrar)="entrar()" />
      }
    </main>
  `,
  styles: `
    /* a mesma folga de página do Murall (src/app/app.scss e --gutter em src/styles.scss) */
    :host {
      display: block;
      min-height: 100dvh;
      max-width: 1480px;
      margin: 0 auto;
      padding: 28px clamp(16px, 4vw, 48px) 64px;
    }
    @media (max-width: 720px) {
      :host {
        padding-top: 22px;
      }
    }
    /* com o quadro das senhas, a mesa cabe na tela e embaixo dela fica só a folga dela (--mesa-pe, aberto.scss) */
    :host:has(.na-mesa) {
      padding-bottom: 20px;
    }
    .fluxo {
      width: 100%;
    }
    .vigia {
      width: min(100%, 720px);
      margin: 0 auto 18px;
      padding: 12px 16px;
      border-radius: 2px;
      background: #fff;
      box-shadow:
        inset 0 0 0 3px var(--vermelho),
        var(--sombra-ficha);
      color: var(--erro);
      font: 600 1rem/1.4 var(--f-texto);
    }
    .carregando {
      margin: 40px auto;
      text-align: center;
      color: var(--giz-2);
      font: 400 1.2rem/1.3 var(--f-mao);
    }
  `,
})
export class Cofre {
  private readonly servicos = inject(SERVICOS);

  protected readonly tela = signal<'porta' | 'criar' | 'abrir' | 'aberto'>('porta');
  protected readonly cofre = signal<CofreAberto | null>(null);
  protected readonly porta = signal<Porta>('carregando');
  protected readonly entrada = signal<Entrada | null>(null);
  /** Até quando o cofre está congelado (8.6), pelo `GET /api/cofre`. */
  protected readonly congeladoAte = signal<string | null>(null);
  protected readonly erro = signal<string | null>(null);
  private readonly semServiceWorker = signal<SemServiceWorker>({ tirados: 0, controlada: false });
  /** O que a vigia do DOM viu de estranho na página (null: nada). */
  protected readonly estranho = signal<string | null>(null);
  private clientId = '';

  private readonly pagina = this.servicos.pagina;

  protected readonly provas = computed(() => {
    const sw = this.semServiceWorker();
    return [
      { nome: 'Endereço seguro (https)', ok: this.pagina.seguro },
      { nome: 'Isolado das outras páginas', ok: this.pagina.isolado },
      { nome: 'Sem service worker', ok: !sw.tirados && !sw.controlada },
    ];
  });

  protected readonly bloqueio = computed(() => {
    // um navegador controlado por um programa pode ler tudo; só o teste de ponta a ponta, no localhost, roda assim
    if (this.pagina.automatizado && !this.pagina.origem.startsWith('http://localhost:')) return 'Este navegador está sendo controlado por um programa. O cofre não abre assim.';
    if (!this.pagina.seguro) return 'Este endereço não é seguro (https). Não use o cofre assim.';
    if (!this.pagina.isolado) return 'A página não está isolada das outras, como devia. Não use o cofre agora.';
    const sw = this.semServiceWorker();
    if (sw.tirados || sw.controlada) return 'Havia um service worker neste endereço, e ele foi tirado. Isso não devia acontecer: recarregue a página antes de entrar.';
    return null;
  });

  constructor() {
    // já na porta: termina a limpeza da área de transferência que o cofre trancado deixou por fazer
    inject(AreaDeTransferencia);
    void this.comecar();
  }

  private async comecar(): Promise<void> {
    const demo = demonstracao();
    // a volta do Google: tira o código da URL antes de qualquer outra coisa
    const voltou = this.pagina.caminho === '/entrar';
    const busca = this.pagina.busca;
    if (voltou) this.pagina.limparUrl();
    if (demo) {
      if (demo.porta) {
        this.porta.set(demo.porta);
        this.clientId = 'demo';
      } else if (demo.aberto) {
        this.entrada.set(demo.entrada);
        this.cofre.set(await demo.aberto());
        this.tela.set('aberto');
      } else if (demo.abrir) {
        this.entrada.set(demo.entrada);
        this.congeladoAte.set(demo.congeladoAte ?? null);
        this.tela.set('abrir');
      } else {
        this.entrada.set(demo.entrada);
        this.tela.set('criar');
      }
      return;
    }
    new VigiaDoDom(document, (oQue) => this.estranho.set(oQue)).comecar();
    this.semServiceWorker.set(await tirarServiceWorkers(this.pagina.trabalhadores));
    if (voltou && (await this.voltarDoGoogle(busca))) return;
    await this.lerStatus();
  }

  /** Troca o código do Google pela sessão de entrada; true se entrou. */
  private async voltarDoGoogle(busca: string): Promise<boolean> {
    const volta = lerVolta(busca, this.pagina.guarda);
    if (!volta.ok) {
      this.erro.set(MENSAGENS_DO_LOGIN[volta.motivo]);
      return false;
    }
    const bloqueio = this.bloqueio();
    if (bloqueio) {
      this.erro.set(bloqueio);
      return false;
    }
    this.porta.set('entrando');
    try {
      const entrada = await this.servicos.api.entrar(volta.codigo, volta.verificador, descreverAparelho(this.pagina.agente));
      const estado = await this.servicos.api.estado();
      this.entrada.set(entrada);
      this.congeladoAte.set(estado.congeladoAte);
      this.tela.set(estado.existe ? 'abrir' : 'criar');
      return true;
    } catch (e) {
      this.servicos.api.usarToken(null);
      this.erro.set(e instanceof ErroApi ? e.message : 'Não deu para entrar. Tente de novo.');
      return false;
    }
  }

  private async lerStatus(): Promise<void> {
    try {
      const status = await this.servicos.api.status();
      this.clientId = status.googleClientId;
      this.porta.set(this.clientId && status.modo !== 'desligado' ? 'entrar' : 'construcao');
    } catch (e) {
      this.porta.set('construcao');
      this.erro.set(e instanceof ErroApi ? e.message : 'O cofre não respondeu. Tente de novo daqui a pouco.');
    }
  }

  protected async entrar(): Promise<void> {
    if (this.bloqueio() || !this.clientId) return;
    this.pagina.irPara(await urlDoLogin(this.clientId, this.pagina.origem, this.pagina.guarda));
  }

  protected sair(): void {
    this.servicos.terminar();
  }
}
