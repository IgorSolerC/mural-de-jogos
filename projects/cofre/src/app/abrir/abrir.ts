import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ErroApi, type Entrada } from '../../core/api';
import { abrir, assinarComSenha, chaveDoMeio, chaveDoMeioPeloCodigo, type CofreAberto, senhaDoDesafio } from '../../core/abrir';
import { type Bytes, zerar } from '../../core/bytes';
import { abrirPelaCarencia, type Carencia, type CarenciaNova, esquecerAqui, esquecerCarencia, guardarCarencia, lerCarencia, prepararCarencia, semArmario } from '../../core/carencia';
import { ErroCofre } from '../../core/crypto';
import { descreverAparelho } from '../../core/entrar';
import { ErroPasskey } from '../../core/passkey';
import { SERVICOS } from '../servicos';

type Jeito = 'passkey' | 'codigo';

/** A mensagem de um erro ao abrir, em palavras simples. */
function mensagem(e: unknown, pelaCarencia: boolean): string {
  if (e instanceof ErroApi) {
    if (e.codigo === 'senha-errada') return pelaCarencia ? e.message.replace('A senha não confere.', 'Senha errada.') : 'Senha errada. Cada tentativa pede a passkey (ou o código) de novo.';
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

/** "às 14:32 de amanhã", "às 9:05 de hoje": até quando a carência vale. */
function ate(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${hora} de ${d.toDateString() === agora.toDateString() ? 'hoje' : 'amanhã'}`;
}

/**
 * Abrir o cofre (8.1): a senha mestra e a passkey de um aparelho (ou o código do kit no lugar dela). O
 * desafio é pedido na hora de abrir (ele vale 2 minutos), e o Argon2id roda enquanto a pessoa confirma a
 * passkey. A senha só vive no campo até abrir. Daqui também dá para congelar o cofre (8.6), e congelado
 * ele mostra só até quando.
 *
 * Com a carência do aparelho (`carencia`, 17.23), a tela pede só a senha: nem o Google, nem a passkey; dá
 * para entrar pelo Google mesmo assim, ou esquecer o aparelho. Abrindo com a passkey e a carência ligada, a
 * deste aparelho é selada junto da senha e guardada aqui se o servidor aceitar.
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
          @if (carencia(); as c) {
            <p class="nota">Este aparelho entrou com o Google e a passkey há pouco. Até {{ ateQuando() }}, só {{ c.pin ? 'o PIN' : 'a senha mestra' }} abre o cofre aqui.</p>
          } @else if (jeito() === 'passkey') {
            <p class="nota">Digite {{ ehPin() ? 'o PIN' : 'a senha mestra' }}. Depois o aparelho pede o rosto, a digital ou o PIN dele: no computador, pode ser o celular pelo QR code.</p>
          } @else {
            <p class="nota">Sem nenhum aparelho? Use o código do kit de emergência, com {{ ehPin() ? 'o PIN' : 'a senha mestra' }}.</p>
          }

          <div class="campo-bloco">
            <label class="rotulo" for="abrir-senha">{{ ehPin() ? 'PIN' : 'Senha mestra' }}</label>
            <input
              id="abrir-senha"
              [class.pin]="ehPin()"
              type="password"
              [attr.inputmode]="ehPin() ? 'numeric' : null"
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
            @if (carencia()) {
              <button type="button" class="palavra" [disabled]="ocupado()" (click)="google.emit()">Entrar com o Google e a passkey</button>
            } @else {
              <button type="button" class="palavra" [disabled]="ocupado()" (click)="trocarJeito()">
                {{ jeito() === 'passkey' ? 'Usar o código de recuperação' : 'Usar a passkey' }}
              </button>
            }
            <button type="submit" class="tinta" [disabled]="!pronto()">Abrir</button>
          </div>

          @if (carencia()) {
            <!-- o "sair" da carência: este aparelho volta a pedir o Google e a passkey -->
            <div class="freio">
              @if (confirmarEsquecer()) {
                <p class="nota" id="esquecer-pergunta">Este aparelho volta a pedir o Google e a passkey para abrir o cofre.</p>
                <span class="botoes" role="group" aria-labelledby="esquecer-pergunta">
                  <button type="button" class="tinta" [disabled]="ocupado()" (click)="esquecer()">Esquecer este aparelho</button>
                  <button type="button" class="quieto" [disabled]="ocupado()" (click)="confirmarEsquecer.set(false)">Não</button>
                </span>
              } @else {
                <button type="button" class="palavra" [disabled]="ocupado()" (click)="confirmarEsquecer.set(true)">Não é o seu aparelho? Esquecer este aparelho</button>
              }
            </div>
          } @else {
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
          }
        </form>
      }
    </article>
  `,
  styleUrl: './abrir.scss',
})
export class Abrir {
  private readonly servicos = inject(SERVICOS);
  private readonly armario = this.servicos.pagina.armario ?? semArmario;

  /** A sessão de entrada do Google (null: abrindo pela carência). */
  readonly entrada = input<Entrada | null>(null);
  /** A carência deste aparelho: abre só com a senha (17.23). */
  readonly carencia = input<Carencia | null>(null);
  /** A senha mestra é um PIN (o campo mostra o teclado de números). */
  readonly pin = input(false);
  /** Até quando o cofre está congelado (null: não está), pelo `GET /api/cofre`. */
  readonly congeladoAte = input<string | null>(null);
  readonly aberto = output<CofreAberto>();
  readonly sair = output<void>();
  /** Na carência: entrar pelo Google e pela passkey mesmo assim. */
  readonly google = output<void>();
  /** A carência acabou (o prazo, os erros, desligada) ou foi esquecida: a mensagem, ou null. */
  readonly semCarencia = output<string | null>();

  protected readonly jeito = signal<Jeito>('passkey');
  protected readonly senha = signal('');
  protected readonly codigo = signal('');
  protected readonly ocupado = signal(false);
  protected readonly etapa = signal('');
  protected readonly erro = signal<string | null>(null);
  protected readonly sessaoAcabou = signal(false);
  protected readonly confirmarCongelar = signal(false);
  protected readonly confirmarEsquecer = signal(false);
  /** O congelamento feito agora, nesta tela (o servidor devolve até quando). */
  private readonly congeladoAgora = signal<string | null>(null);
  /** Até quando, em palavras ("quinta-feira, 23 de outubro, às 15:00"); vazio se não está congelado. */
  protected readonly prazo = computed(() => {
    const iso = this.congeladoAgora() ?? this.congeladoAte();
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}, às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  });
  protected readonly ateQuando = computed(() => {
    const c = this.carencia();
    return c ? ate(c.expiraEm) : '';
  });

  protected readonly ehPin = computed(() => this.carencia()?.pin ?? this.pin());
  protected readonly contaFormatada = computed(() => {
    const codigo = this.entrada()?.codigo ?? this.carencia()?.codigo ?? '';
    return `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
  });
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
      // congelar encerra a carência de todos os aparelhos no servidor; a daqui sai junto
      esquecerAqui(this.armario);
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

  protected async esquecer(): Promise<void> {
    this.ocupado.set(true);
    try {
      await esquecerCarencia(this.servicos.api, this.armario);
    } finally {
      this.ocupado.set(false);
      this.senha.set('');
      this.semCarencia.emit(null);
    }
  }

  protected async abrirCofre(): Promise<void> {
    if (!this.pronto()) return;
    const carencia = this.carencia();
    if (carencia) return this.abrirPelaCarencia(carencia);
    const entrada = this.entrada();
    if (!entrada) return;
    const { api, rpId, autenticador, pagina } = this.servicos;
    const usuario = entrada.usuario;
    this.erro.set(null);
    this.ocupado.set(true);
    // os segredos do caminho: abrir() zera os dois quando chega lá; se algo falhar antes, o finally zera
    let kSenha: Bytes | null = null;
    let m: Bytes | null = null;
    try {
      this.etapa.set('Pedindo o desafio ao cofre…');
      const desafio = await api.desafioDeAbrir();
      let nova: CarenciaNova | null = null;
      if (this.jeito() === 'passkey') {
        this.etapa.set('Confirme no aparelho…');
        // a passkey e o Argon2id ao mesmo tempo (8.1): a pessoa confirma enquanto a chave da senha é feita
        const { assinada, kSenha: chave } = await assinarComSenha(desafio, this.senha(), rpId, autenticador);
        kSenha = chave;
        this.etapa.set('Abrindo…');
        m = await chaveDoMeio(api, assinada, usuario);
        // a carência deste aparelho, selada com M antes de M ser zerado; só com ela ligada (17.23). A que
        // estiver aqui de outra conta não vira a "anterior" desta: sai daqui e do servidor (nunca se juntam)
        const daqui = lerCarencia(this.armario);
        if (daqui && daqui.usuario !== usuario) void esquecerCarencia(api, this.armario);
        if (desafio.carencia) nova = await prepararCarencia(m, usuario, entrada.codigo, daqui?.usuario === usuario ? daqui : null);
      } else {
        this.etapa.set('Fazendo a chave da senha…');
        await new Promise<void>((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
        kSenha = await senhaDoDesafio(this.senha(), desafio);
        this.etapa.set('Abrindo com o código…');
        m = await chaveDoMeioPeloCodigo(api, this.codigo(), usuario);
      }
      const [kAqui, mAqui] = [kSenha, m];
      kSenha = null;
      m = null;
      const cofre = await abrir(api, usuario, kAqui, mAqui, this.aparelho(pagina.agente), desafio, nova?.corpo);
      if (nova && cofre.carencia) guardarCarencia(this.armario, nova.guardavel(cofre.carencia.expiraEm, desafio.pin === true));
      // desligada nos Ajustes (de outro aparelho): o que tiver sobrado aqui não vale mais
      else if (desafio.carencia === false) esquecerAqui(this.armario);
      this.senha.set('');
      this.codigo.set('');
      this.aberto.emit(cofre);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401 && e.codigo === 'sessao-invalida') {
        this.sessaoAcabou.set(true);
        this.erro.set('A entrada acabou: ela vale 5 minutos. Entre de novo.');
      } else {
        this.erro.set(mensagem(e, false));
      }
    } finally {
      zerar(kSenha, m);
      this.ocupado.set(false);
      this.etapa.set('');
    }
  }

  /** Pela carência: o token vira a entrada, G abre M, e a senha faz o resto. */
  private async abrirPelaCarencia(carencia: Carencia): Promise<void> {
    const { api, pagina } = this.servicos;
    this.erro.set(null);
    this.ocupado.set(true);
    this.etapa.set('Abrindo…');
    try {
      // deixa a tela mostrar "Abrindo…" antes de o Argon2id ocupar o navegador
      await new Promise<void>((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
      const cofre = await abrirPelaCarencia(api, carencia, this.senha(), descreverAparelho(pagina.agente), this.aparelho(pagina.agente));
      this.senha.set('');
      this.aberto.emit(cofre);
    } catch (e) {
      api.usarToken(null);
      // a carência acabou (o prazo, os 3 erros, desligada, encerrada): este aparelho a esquece e pede o Google
      const acabou = e instanceof ErroApi && (e.codigo === 'carencia-invalida' || (e.codigo === 'senha-errada' && /volta a pedir/.test(e.message)));
      if (acabou) {
        esquecerAqui(this.armario);
        this.senha.set('');
        this.semCarencia.emit(e.codigo === 'carencia-invalida' ? e.message : mensagem(e, true));
      } else {
        this.erro.set(mensagem(e, true));
      }
    } finally {
      this.ocupado.set(false);
      this.etapa.set('');
    }
  }

  private aparelho(agente: string): string {
    return /Android|iPhone|iPad|Mobile/i.test(agente) ? 'Celular' : 'PC';
  }
}
