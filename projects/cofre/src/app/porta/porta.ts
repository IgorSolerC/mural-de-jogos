import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** O que a porta mostra. */
export type Porta =
  /** Esperando a API dizer se o cofre está de pé. */
  | 'carregando'
  /** O cofre ainda não abriu para ninguém (sem o cliente do Google, ou desligado). */
  | 'construcao'
  /** Pronto para entrar com o Google. */
  | 'entrar'
  /** Voltou do Google: trocando o código pela sessão de entrada. */
  | 'entrando';

/**
 * A porta do cofre: a ficha que aparece antes de criar ou abrir. Diz se as proteções da página estão
 * valendo (a página só deixa entrar com o endereço seguro, isolada das outras e sem service worker) e
 * leva para o Google. Só mostra; quem decide e faz é a raiz (`cofre.ts`). Depois de entrar, a raiz troca a
 * porta pelas telas de criar ou de abrir.
 */
@Component({
  selector: 'cofre-porta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ficha">
      <header class="faixa">
        <h1>Cofre de senhas</h1>
        @if (conta()) {
          <span class="conta">Conta {{ contaFormatada() }}</span>
        }
      </header>
      <div class="corpo" [attr.aria-busy]="porta() === 'carregando' || porta() === 'entrando'">
        @switch (porta()) {
          @case ('carregando') {
            <p class="nota">Abrindo o cofre…</p>
          }
          @case ('entrando') {
            <p class="nota" role="status">Entrando com o Google…</p>
          }
          @case ('construcao') {
            <h2>Em construção</h2>
            <p class="nota">O cofre ainda não abriu. Por enquanto, nada é guardado aqui.</p>
          }
          @case ('entrar') {
            <h2>Entrar</h2>
            <p class="nota">
              O cofre abre com três coisas: a sua conta do Google, a senha mestra e a passkey de um aparelho seu. Primeiro, o Google: é a mesma conta do Murall.
            </p>
          }
        }

        @if (erro()) {
          <p class="erro" role="alert">{{ erro() }}</p>
        }
        @if (bloqueio() && porta() === 'entrar') {
          <p class="erro" role="alert">{{ bloqueio() }}</p>
        }

        @if (porta() === 'entrar') {
          <div class="pe">
            <a class="voltar" href="https://murall.igorsc.com.br/#/anotacoes" rel="noreferrer">Voltar ao Murall</a>
            <button type="button" class="tinta" [disabled]="!!bloqueio()" (click)="entrar.emit()">Entrar com o Google</button>
          </div>
        }

        @if (porta() === 'construcao' || porta() === 'entrar') {
          <ul class="provas" aria-label="Proteções desta página">
            @for (prova of provas(); track prova.nome) {
              <li [class.ok]="prova.ok">
                <span class="marca" aria-hidden="true">
                  @if (prova.ok) {
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  } @else {
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  }
                </span>
                {{ prova.nome }}
                <span class="visivel-so-leitor">: {{ prova.ok ? 'sim' : 'não' }}</span>
              </li>
            }
          </ul>
        }
        @if (porta() === 'construcao') {
          <a class="voltar" href="https://murall.igorsc.com.br/#/anotacoes" rel="noreferrer">Voltar ao Murall</a>
        }
      </div>
    </article>
  `,
  styleUrl: './porta.scss',
})
export class PortaDoCofre {
  readonly porta = input.required<Porta>();
  /** O código da conta do Murall, depois de entrar. */
  readonly conta = input<string | null>(null);
  readonly erro = input<string | null>(null);
  /** O motivo de não deixar entrar (uma proteção da página que não está valendo). */
  readonly bloqueio = input<string | null>(null);
  readonly provas = input.required<readonly { readonly nome: string; readonly ok: boolean }[]>();
  readonly entrar = output<void>();

  protected readonly contaFormatada = computed(() => {
    const c = this.conta() ?? '';
    return `${c.slice(0, 4)}-${c.slice(4)}`;
  });
}
