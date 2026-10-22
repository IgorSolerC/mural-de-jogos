import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CofreAberto } from '../core/abrir';
import { type Entrada, ErroApi } from '../core/api';
import { descreverAparelho, lerVolta, MENSAGENS_DO_LOGIN, urlDoLogin } from '../core/entrar';
import { Abrir } from './abrir/abrir';
import { Aberto } from './aberto/aberto';
import { demonstracao } from './ambiente';
import { Criar } from './criar/criar';
import { type Porta, PortaDoCofre } from './porta/porta';
import { type SemServiceWorker, tirarServiceWorkers } from './sem-service-worker';
import { SERVICOS } from './servicos';

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
  imports: [Criar, PortaDoCofre, Abrir, Aberto],
  template: `
    <main class="fluxo">
      @if (entrada(); as entrada) {
        @switch (tela()) {
          @case ('criar') {
            <cofre-criar [entrada]="entrada" />
          }
          @case ('abrir') {
            <cofre-abrir [entrada]="entrada" (aberto)="cofre.set($event); tela.set('aberto')" (sair)="sair()" />
          }
          @case ('aberto') {
            <cofre-aberto [cofre]="cofre()!" [conta]="entrada.codigo" />
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
    :host {
      display: block;
      min-height: 100dvh;
      padding: 32px 16px 64px;
    }
    .fluxo {
      width: 100%;
    }
  `,
})
export class Cofre {
  private readonly servicos = inject(SERVICOS);

  protected readonly tela = signal<'porta' | 'criar' | 'abrir' | 'aberto'>('porta');
  protected readonly cofre = signal<CofreAberto | null>(null);
  protected readonly porta = signal<Porta>('carregando');
  protected readonly entrada = signal<Entrada | null>(null);
  protected readonly erro = signal<string | null>(null);
  private readonly semServiceWorker = signal<SemServiceWorker>({ tirados: 0, controlada: false });
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
    if (!this.pagina.seguro) return 'Este endereço não é seguro (https). Não use o cofre assim.';
    if (!this.pagina.isolado) return 'A página não está isolada das outras, como devia. Não use o cofre agora.';
    const sw = this.semServiceWorker();
    if (sw.tirados || sw.controlada) return 'Havia um service worker neste endereço, e ele foi tirado. Isso não devia acontecer: recarregue a página antes de entrar.';
    return null;
  });

  constructor() {
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
        this.tela.set('abrir');
      } else {
        this.entrada.set(demo.entrada);
        this.tela.set('criar');
      }
      return;
    }
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
