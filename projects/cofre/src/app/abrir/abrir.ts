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
 * passkey. A senha só vive no campo até abrir. Daqui também dá para congelar o cofre (8.6), e congelado
 * ele mostra só até quando.
 */
@Component({
  selector: 'cofre-abrir',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ficha" [class.gelo]="prazo()">
      <header class="faixa">
        <h1>Cofre de senhas</h1>
        <span class="conta">Conta {{ contaFormatada() }}</span>
      </header>
      @if (prazo()) {
        <div class="corpo" role="status">
          <h2 class="carimbo">Congelado</h2>
          <p class="ate">Até {{ prazo() }}</p>
          <p class="nota">Ninguém abre o cofre até lá: nem com a senha, nem com a passkey, nem com o código do kit. Não dá para tirar o congelamento antes.</p>
          <p class="nota">Foi você? É só esperar. Se não foi, alguém entrou na sua conta do Google: troque a senha do Google agora.</p>
          <div class="pe">
            <button type="button" class="tinta" (click)="sair.emit()">Sair</button>
          </div>
        </div>
      } @else {
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
            <button type="button" class="palavra" [disabled]="ocupado()" (click)="trocarJeito()">
              {{ jeito() === 'passkey' ? 'Usar o código de recuperação' : 'Usar a passkey' }}
            </button>
            <button type="submit" class="tinta" [disabled]="!pronto()">Abrir</button>
          </div>

          <!-- o freio de emergência (8.6): para quando a pessoa suspeita de algo e está sem os aparelhos -->
          <div class="freio">
            @if (confirmarCongelar()) {
              <p class="nota" id="freio-pergunta">
                Por 24 horas ninguém abre o cofre, nem você, e os aparelhos com ele aberto agora são trancados. Não dá para desfazer antes do prazo.
              </p>
              <span class="botoes" role="group" aria-labelledby="freio-pergunta">
                <button type="button" class="tinta" [disabled]="ocupado()" (click)="congelar()">Congelar por 24 horas</button>
                <button type="button" class="quieto" [disabled]="ocupado()" (click)="confirmarCongelar.set(false)">Não</button>
              </span>
            } @else {
              <button type="button" class="palavra" [disabled]="ocupado() || sessaoAcabou()" (click)="confirmarCongelar.set(true)">Suspeita de algo? Congelar o cofre</button>
            }
          </div>
        </form>
      }
    </article>
  `,
  styleUrl: './abrir.scss',
})
export class Abrir {
  private readonly servicos = inject(SERVICOS);

  readonly entrada = input.required<Entrada>();
  /** Até quando o cofre está congelado (null: não está), pelo `GET /api/cofre`. */
  readonly congeladoAte = input<string | null>(null);
  readonly aberto = output<CofreAberto>();
  readonly sair = output<void>();

  protected readonly jeito = signal<Jeito>('passkey');
  protected readonly senha = signal('');
  protected readonly codigo = signal('');
  protected readonly ocupado = signal(false);
  protected readonly etapa = signal('');
  protected readonly erro = signal<string | null>(null);
  protected readonly sessaoAcabou = signal(false);
  protected readonly confirmarCongelar = signal(false);
  /** O congelamento feito agora, nesta tela (o servidor devolve até quando). */
  private readonly congeladoAgora = signal<string | null>(null);
  /** Até quando, em palavras ("quinta-feira, 23 de outubro, às 15:00"); vazio se não está congelado. */
  protected readonly prazo = computed(() => {
    const iso = this.congeladoAgora() ?? this.congeladoAte();
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}, às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  });

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

  protected async congelar(): Promise<void> {
    this.erro.set(null);
    this.ocupado.set(true);
    try {
      const { congeladoAte } = await this.servicos.api.congelar();
      this.senha.set('');
      this.codigo.set('');
      this.congeladoAgora.set(congeladoAte);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401 && e.codigo === 'sessao-invalida') {
        this.sessaoAcabou.set(true);
        this.erro.set('A entrada acabou: ela vale 5 minutos. Entre de novo para congelar.');
      } else {
        this.erro.set(e instanceof ErroApi ? e.message : 'Não deu para congelar. Tente de novo.');
      }
    } finally {
      this.ocupado.set(false);
      this.confirmarCongelar.set(false);
    }
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
