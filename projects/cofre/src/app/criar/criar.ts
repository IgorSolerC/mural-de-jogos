import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { ErroApi, type Entrada } from '../../core/api';
import { type AparelhoParaCriar, montarCofre } from '../../core/criar';
import { SERVICOS } from '../servicos';
import { PassoAparelhos } from './passo-aparelhos';
import { PassoKit } from './passo-kit';
import { type SenhaEscolhida, PassoSenha } from './passo-senha';

type Passo = 'senha' | 'aparelhos' | 'criando' | 'kit';

/** Para quem pode ter ficado com um cofre sem ver o kit: o código novo sai dos Ajustes. */
const SEM_KIT = 'Se o kit de emergência não apareceu, abra o cofre e gere um código novo em Ajustes › Recuperação.';

/** Um erro em que o pedido pode ter chegado à nuvem e só a resposta se perdeu. */
function respostaIncerta(e: unknown): boolean {
  return !(e instanceof ErroApi) || e.status === 0 || e.status >= 500;
}

const PASSOS: readonly { readonly id: 'senha' | 'aparelhos' | 'kit'; readonly nome: string }[] = [
  { id: 'senha', nome: 'Senha' },
  { id: 'aparelhos', nome: 'Aparelhos' },
  { id: 'kit', nome: 'Kit' },
];

/**
 * Criar o cofre (8.3), em três passos: a senha mestra, os aparelhos e o kit de emergência. A senha vem
 * primeiro porque o desafio de cada passkey vale só 2 minutos: o cofre é criado logo depois do último
 * aparelho. O kit vem depois de criado, para o código que aparece já valer.
 */
@Component({
  selector: 'cofre-criar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PassoSenha, PassoAparelhos, PassoKit],
  template: `
    <article class="ficha">
      <nav class="passos" aria-label="Passos para criar o cofre">
        <ol>
          @for (p of passos; track p.id; let i = $index) {
            <li [class.feito]="indice() > i" [class.agora]="indice() === i" [attr.aria-current]="indice() === i ? 'step' : null">
              <span class="numero" aria-hidden="true">
                @if (indice() > i) {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                } @else {
                  {{ i + 1 }}
                }
              </span>
              <span class="nome">{{ p.nome }}</span>
              @if (indice() > i) {
                <span class="visivel-so-leitor">(feito)</span>
              }
            </li>
          }
        </ol>
      </nav>
      <header class="faixa">
        <h1>Criar o cofre de senhas</h1>
        <span class="conta">Conta {{ contaFormatada() }}</span>
      </header>
      <div class="corpo">
        @if (erro()) {
          <p class="erro" role="alert">{{ erro() }}</p>
        }
        @if (sessaoAcabou()) {
          <button type="button" class="de-novo" (click)="terminar()">Entrar de novo</button>
        }
        @switch (passo()) {
          @case ('senha') {
            <cofre-passo-senha (escolhida)="senhaEscolhida($event)" />
          }
          @case ('kit') {
            <cofre-passo-kit [codigo]="codigo()!" [conta]="entrada().codigo" [criadoEm]="criadoEm()!" (terminar)="terminar()" />
          }
          @default {
            <cofre-passo-aparelhos [senha]="senha()!" [class.escondido]="passo() === 'criando'" (voltar)="passo.set('senha')" (criarCom)="criar($event)" (sessaoAcabou)="acabou()" />
            @if (passo() === 'criando') {
              <div class="criando" role="status">
                <span class="lapis" aria-hidden="true"></span>
                <p>Fazendo a chave do cofre…</p>
                <p class="pequeno">Isso leva alguns segundos de propósito: é o que deixa a senha difícil de adivinhar.</p>
              </div>
            }
          }
        }
      </div>
    </article>
  `,
  styleUrl: './criar.scss',
})
export class Criar {
  private readonly servicos = inject(SERVICOS);

  /** A sessão de entrada: de quem é o cofre (o id vai no AAD de tudo) e o código da conta. */
  readonly entrada = input.required<Entrada>();

  protected readonly passos = PASSOS;
  protected readonly passo = signal<Passo>('senha');
  protected readonly senha = signal<SenhaEscolhida | null>(null);
  protected readonly codigo = signal<string | null>(null);
  protected readonly criadoEm = signal<Date | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly sessaoAcabou = signal(false);
  private readonly aparelhos = viewChild(PassoAparelhos);

  protected readonly indice = computed(() => ({ senha: 0, aparelhos: 1, criando: 1, kit: 2 })[this.passo()]);
  protected readonly contaFormatada = computed(() => `${this.entrada().codigo.slice(0, 4)}-${this.entrada().codigo.slice(4)}`);

  protected senhaEscolhida(senha: SenhaEscolhida): void {
    this.erro.set(null);
    this.senha.set(senha);
    this.passo.set('aparelhos');
  }

  protected async criar(aparelhos: AparelhoParaCriar[]): Promise<void> {
    const senha = this.senha();
    if (!senha) return;
    this.erro.set(null);
    this.sessaoAcabou.set(false);
    this.passo.set('criando');
    // deixa a tela mostrar "Fazendo a chave do cofre…" antes de o Argon2id ocupar o navegador
    await new Promise<void>((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
    const agora = new Date();
    let codigo: string | null = null;
    try {
      const montado = await montarCofre({
        usuario: this.entrada().usuario,
        senha: senha.senha,
        aparelhos,
        aparelhoAgora: /Android|iPhone|iPad|Mobile/i.test(this.servicos.pagina.agente) ? 'Celular' : 'PC',
        agora,
        pin: senha.pin === true,
      });
      codigo = montado.codigo;
      await this.servicos.api.criarCofre(montado.corpo);
      this.mostrarKit(codigo, agora);
    } catch (e) {
      // a resposta se perdeu (sem rede, a nuvem fora do ar): o cofre pode ter sido criado assim mesmo, e o
      // código deste kit seria o único que abre o envelope de recuperação dele
      if (codigo !== null && respostaIncerta(e) && (await this.foiCriado())) {
        this.mostrarKit(codigo, agora);
        return;
      }
      if (e instanceof ErroApi && e.codigo === 'cofre-existe') {
        this.erro.set(`Esta conta já tem um cofre. Recarregue a página para abrir. ${SEM_KIT}`);
      } else if (codigo !== null && respostaIncerta(e)) {
        this.erro.set(`Não deu para saber se o cofre foi criado. Registre os aparelhos de novo; se a conta já tiver um cofre, recarregue a página para abrir. ${SEM_KIT}`);
        this.aparelhos()?.recomecar();
      } else if (e instanceof ErroApi && e.status === 401) {
        this.acabou();
        this.aparelhos()?.recomecar();
      } else {
        // Recomeça os aparelhos do zero: o servidor pode ter gastado os desafios, e o segredo do PRF de cada
        // passkey já foi zerado na montagem (tentar de novo com elas cairia no modo servidor sem ninguém ver).
        const motivo = e instanceof ErroApi ? e.message : 'Não deu para criar o cofre.';
        this.erro.set(`${motivo} Registre os aparelhos de novo. Se quiser, apague no aparelho a passkey “Cofre do Murall” que sobrou.`);
        this.aparelhos()?.recomecar();
      }
      this.passo.set('aparelhos');
    }
  }

  private mostrarKit(codigo: string, criadoEm: Date): void {
    // a senha não serve para mais nada aqui
    this.senha.set(null);
    this.codigo.set(codigo);
    this.criadoEm.set(criadoEm);
    this.passo.set('kit');
  }

  /**
   * Depois de uma resposta que se perdeu: o cofre existe? A entrada de criar é apagada junto com o cofre
   * criado, então ela recusada (401) antes da hora de vencer quer dizer que ele foi criado.
   */
  private async foiCriado(): Promise<boolean> {
    try {
      return (await this.servicos.api.estado()).existe;
    } catch (e) {
      return e instanceof ErroApi && e.status === 401 && Date.now() < Date.parse(this.entrada().expiraEm);
    }
  }

  /** A sessão de entrada acabou (20 minutos para criar): só entrando de novo. */
  protected acabou(): void {
    this.sessaoAcabou.set(true);
    this.erro.set('A entrada acabou: ela vale 20 minutos. Entre de novo para criar o cofre.');
  }

  protected terminar(): void {
    this.servicos.terminar();
  }
}
