import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ErroApi, type Entrada } from '../../core/api';
import { abrir, assinar, chaveDoMeio, chaveDoMeioPeloCodigo, type CofreAberto, senhaDoDesafio } from '../../core/abrir';
import { ErroCofre } from '../../core/crypto';
import { ErroPasskey } from '../../core/passkey';
import { SERVICOS } from '../servicos';

type Jeito = 'passkey' | 'codigo';

/** A mensagem de um erro ao abrir, em palavras simples. */
function mensagem(e: unknown): string {
  if (e instanceof ErroApi) {
    if (e.codigo === 'senha-errada') return 'Senha errada. Cada tentativa pede a passkey (ou o código) de novo.';
    return e.message;
  }
  if (e instanceof ErroPasskey) return e.message;
  if (e instanceof ErroCofre) {
    if (e.motivo === 'formato' && /código/.test(e.message)) return 'O código não confere. Confira se copiou todos os 28 caracteres do kit.';
    if (e.motivo === 'abrir') return 'O cofre não abriu com o que veio do servidor. Não use o cofre agora e avise quem cuida dele.';
    if (e.motivo === 'kdf-fraco' || e.motivo === 'kdf-invalido' || e.motivo === 'versao') return 'O servidor mandou uma configuração do cofre que este aparelho recusa. Não use o cofre agora.';
  }
  return 'Não deu para abrir. Tente de novo.';
}

/**
 * Abrir o cofre (8.1): a senha mestra e a passkey de um aparelho (ou o código do kit no lugar dela). O
 * desafio é pedido na hora de abrir (ele vale 2 minutos), e o Argon2id roda enquanto a pessoa confirma a
 * passkey. A senha só vive no campo até abrir.
 */
@Component({
  selector: 'cofre-abrir',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ficha">
      <header class="faixa">
        <h1>Cofre de senhas</h1>
        <span class="conta">Conta {{ contaFormatada() }}</span>
      </header>
      <form class="corpo" (submit)="$event.preventDefault(); abrirCofre()">
        <h2>Abrir o cofre</h2>
        @if (jeito() === 'passkey') {
          <p class="nota">Digite a senha mestra. Depois o aparelho pede o rosto, a digital ou o PIN: no computador, pode ser o celular pelo QR code.</p>
        } @else {
          <p class="nota">Sem nenhum aparelho? Use o código do kit de emergência, com a senha mestra.</p>
        }

        <div class="campo-bloco">
          <label class="rotulo" for="abrir-senha">Senha mestra</label>
          <input
            id="abrir-senha"
            type="password"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            translate="no"
            [value]="senha()"
            (input)="senha.set(valor($event))"
            [disabled]="ocupado()"
          />
        </div>

        @if (jeito() === 'codigo') {
          <div class="campo-bloco">
            <label class="rotulo" for="abrir-codigo">Código de recuperação</label>
            <input
              id="abrir-codigo"
              class="codigo"
              autocomplete="off"
              autocapitalize="characters"
              autocorrect="off"
              spellcheck="false"
              translate="no"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              [value]="codigo()"
              (input)="codigo.set(valor($event))"
              [disabled]="ocupado()"
            />
          </div>
        }

        <div aria-live="polite">
          @if (erro()) {
            <p class="erro" role="alert">{{ erro() }}</p>
          }
          @if (ocupado()) {
            <p class="nota pequena">{{ etapa() }}</p>
          }
        </div>
        @if (sessaoAcabou()) {
          <button type="button" class="tinta" (click)="sair.emit()">Entrar de novo</button>
        }

        <div class="pe">
          <button type="button" class="quieto" [disabled]="ocupado()" (click)="trocarJeito()">
            {{ jeito() === 'passkey' ? 'Usar o código de recuperação' : 'Usar a passkey' }}
          </button>
          <button type="submit" class="tinta" [disabled]="!pronto()">Abrir</button>
        </div>
      </form>
    </article>
  `,
  styleUrl: './abrir.scss',
})
export class Abrir {
  private readonly servicos = inject(SERVICOS);

  readonly entrada = input.required<Entrada>();
  readonly aberto = output<CofreAberto>();
  readonly sair = output<void>();

  protected readonly jeito = signal<Jeito>('passkey');
  protected readonly senha = signal('');
  protected readonly codigo = signal('');
  protected readonly ocupado = signal(false);
  protected readonly etapa = signal('');
  protected readonly erro = signal<string | null>(null);
  protected readonly sessaoAcabou = signal(false);

  protected readonly contaFormatada = computed(() => `${this.entrada().codigo.slice(0, 4)}-${this.entrada().codigo.slice(4)}`);
  protected readonly pronto = computed(() => !this.ocupado() && !this.sessaoAcabou() && this.senha().length > 0 && (this.jeito() === 'passkey' || this.codigo().trim().length >= 28));

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected trocarJeito(): void {
    this.jeito.set(this.jeito() === 'passkey' ? 'codigo' : 'passkey');
    this.codigo.set('');
    this.erro.set(null);
  }

  protected async abrirCofre(): Promise<void> {
    if (!this.pronto()) return;
    const { api, rpId, autenticador, pagina } = this.servicos;
    const usuario = this.entrada().usuario;
    this.erro.set(null);
    this.ocupado.set(true);
    try {
      this.etapa.set('Pedindo o desafio ao cofre…');
      const desafio = await api.desafioDeAbrir();
      let kSenha;
      let m;
      if (this.jeito() === 'passkey') {
        this.etapa.set('Confirme no aparelho…');
        // a passkey e o Argon2id ao mesmo tempo (8.1): a pessoa confirma enquanto a chave da senha é feita
        const [assinada, chave] = await Promise.all([assinar(desafio, rpId, autenticador), senhaDoDesafio(this.senha(), desafio)]);
        kSenha = chave;
        this.etapa.set('Abrindo…');
        m = await chaveDoMeio(api, assinada, usuario);
      } else {
        this.etapa.set('Fazendo a chave da senha…');
        await new Promise<void>((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
        kSenha = await senhaDoDesafio(this.senha(), desafio);
        this.etapa.set('Abrindo com o código…');
        m = await chaveDoMeioPeloCodigo(api, this.codigo(), usuario);
      }
      const aparelho = /Android|iPhone|iPad|Mobile/i.test(pagina.agente) ? 'Celular' : 'PC';
      const cofre = await abrir(api, usuario, kSenha, m, aparelho, desafio);
      this.senha.set('');
      this.codigo.set('');
      this.aberto.emit(cofre);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401 && e.codigo === 'sessao-invalida') {
        this.sessaoAcabou.set(true);
        this.erro.set('A entrada acabou: ela vale 5 minutos. Entre de novo.');
      } else {
        this.erro.set(mensagem(e));
      }
    } finally {
      this.ocupado.set(false);
      this.etapa.set('');
    }
  }
}
