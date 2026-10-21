import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { ErroApi, type Entrada } from '../../core/api';
import { type AparelhoParaCriar, montarCofre } from '../../core/criar';
import { SERVICOS } from '../servicos';
import { PassoAparelhos } from './passo-aparelhos';
import { PassoKit } from './passo-kit';
import { type SenhaEscolhida, PassoSenha } from './passo-senha';

type Passo = 'senha' | 'aparelhos' | 'criando' | 'kit';

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
    <nav class="passos" aria-label="Passos para criar o cofre">
      <ol>
        @for (p of passos; track p.id; let i = $index) {
          <li [class.feito]="indice() > i" [class.agora]="indice() === i" [attr.aria-current]="indice() === i ? 'step' : null">
            <span class="numero" aria-hidden="true">{{ i + 1 }}</span>
            {{ p.nome }}
          </li>
        }
      </ol>
    </nav>

    <article class="ficha">
      <span class="tachinha" aria-hidden="true"></span>
      <header class="faixa">
        <h1>Criar o cofre de senhas</h1>
        <span class="conta">Conta {{ contaFormatada() }}</span>
      </header>
      <div class="corpo">
        @if (erro()) {
          <p class="erro" role="alert">{{ erro() }}</p>
        }
        @switch (passo()) {
          @case ('senha') {
            <cofre-passo-senha (escolhida)="senhaEscolhida($event)" />
          }
          @case ('kit') {
            <cofre-passo-kit [codigo]="codigo()!" [conta]="entrada().codigo" [criadoEm]="criadoEm()!" (terminar)="terminar()" />
          }
          @default {
            <cofre-passo-aparelhos [senha]="senha()!" [class.escondido]="passo() === 'criando'" (voltar)="passo.set('senha')" (criarCom)="criar($event)" />
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
    this.passo.set('criando');
    try {
      const agora = new Date();
      const { corpo, codigo } = await montarCofre({
        usuario: this.entrada().usuario,
        senha: senha.senha,
        aparelhos,
        aparelhoAgora: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'Celular' : 'PC',
        agora,
      });
      await this.servicos.api.criarCofre(corpo);
      // a senha não serve para mais nada aqui
      this.senha.set(null);
      this.codigo.set(codigo);
      this.criadoEm.set(agora);
      this.passo.set('kit');
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'cofre-existe') {
        this.erro.set('Esta conta já tem um cofre. Recarregue a página para abrir.');
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

  protected terminar(): void {
    this.servicos.terminar();
  }
}
