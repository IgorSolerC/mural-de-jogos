import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ErroApi } from '../../core/api';
import { APARELHOS_NA_CRIACAO, type AparelhoParaCriar } from '../../core/criar';
import { zerar } from '../../core/bytes';
import { ErroCofre } from '../../core/crypto';
import { avaliarSenha, BITS_MINIMOS_MODO_SERVIDOR } from '../../core/forca';
import { ErroPasskey, type PasskeyRegistrada, pedirSegredoPrf, registrarPasskey } from '../../core/passkey';
import { SERVICOS } from '../servicos';
import type { SenhaEscolhida } from './passo-senha';

/** Um aparelho registrado nesta tela. */
interface Aparelho {
  readonly id: string;
  readonly passkey: PasskeyRegistrada;
  /** Para o desenho: o celular ou o computador (o nome a pessoa muda à vontade). */
  readonly celular: boolean;
  apelido: string;
  /** Para um aparelho que diz ter PRF mas não deu o segredo: a pessoa escolheu o modo servidor. */
  aceitouServidor: boolean;
}

type Estado = 'prf' | 'servidor' | 'pendente';

/** O aparelho saiu da lista: o segredo do PRF dele não serve para mais nada (ele abre o envelope daquela passkey). */
function esquecerPrf(a: Aparelho): void {
  zerar(a.passkey.prf);
  a.passkey.prf = null;
}

/** É o celular? Pelo QR code, sim; senão, é o aparelho onde a página está. */
function ehCelular(passkey: PasskeyRegistrada, agente: string): boolean {
  return passkey.credencial.transports.includes('hybrid') || /Android|iPhone|iPad|Mobile/i.test(agente);
}

function mensagem(e: unknown): string {
  if (e instanceof ErroPasskey || e instanceof ErroApi) return e.message;
  if (e instanceof ErroCofre) return 'O cofre recusou a resposta do servidor. Recarregue a página e tente de novo.';
  return 'Algo deu errado. Tente de novo.';
}

/**
 * O passo dos aparelhos (8.3, passo 2): registra a passkey do celular e, se quiser, a do PC, e mostra
 * para cada um se ficou com PRF ou no modo servidor. Com algum no modo servidor, a senha precisa ser a
 * de uma frase sorteada (seção 5). O cofre é criado logo depois, porque o desafio de cada passkey vale
 * só 2 minutos.
 */
@Component({
  selector: 'cofre-passo-aparelhos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Os aparelhos</h2>
    <p class="nota">
      A passkey é a chave que fica no aparelho: o celular, aberto com o rosto ou a digital, e, se quiser, este computador. No computador, o navegador mostra um QR code para usar o celular.
    </p>

    @if (aparelhos().length) {
      <ul class="lista" aria-label="Aparelhos registrados">
        @for (a of aparelhos(); track a.id) {
          <li class="aparelho">
            <span class="icone" aria-hidden="true">
              @if (a.celular) {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18h2" /></svg>
              } @else {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4.5" width="16" height="11" rx="1.5" /><path d="M2 19.5h20" /></svg>
              }
            </span>
            <input class="nome" maxlength="40" autocomplete="off" spellcheck="false" aria-label="Nome do aparelho" [value]="a.apelido" (input)="renomear(a, $event)" />
            @switch (estado(a)) {
              @case ('prf') {
                <span class="etiqueta prf">Com PRF</span>
                <p class="explica">A chave fica só neste aparelho.</p>
              }
              @case ('servidor') {
                <span class="etiqueta servidor">Modo servidor</span>
                <p class="explica">Sem PRF: o servidor guarda a parte deste aparelho, cifrada. Funciona, mas protege menos.</p>
              }
              @case ('pendente') {
                <span class="etiqueta servidor">Falta confirmar</span>
                <p class="explica">Este aparelho tem PRF, mas a confirmação não veio.</p>
                <span class="escolha">
                  <button type="button" class="quieto" [disabled]="ocupado()" (click)="confirmarPrf(a)">Confirmar de novo</button>
                  <button type="button" class="quieto" [disabled]="ocupado()" (click)="usarServidor(a)">Usar no modo servidor</button>
                </span>
              }
            }
            <button type="button" class="tirar" [attr.aria-label]="'Tirar ' + a.apelido" [disabled]="ocupado()" (click)="tirar(a)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </li>
        }
      </ul>
    }

    @if (aparelhos().length < maximo) {
      <button type="button" class="registrar" [disabled]="ocupado()" (click)="registrar()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        {{ ocupado() ? 'Esperando o aparelho…' : aparelhos().length ? 'Registrar outro aparelho' : 'Registrar o primeiro aparelho' }}
      </button>
    }

    <div class="avisos" aria-live="polite">
      @if (erro()) {
        <p class="aviso">{{ erro() }}</p>
      }
      @if (aparelhos().length === 1) {
        <p class="nota pequena">Dá para criar com um aparelho só. Aí o código de recuperação, que vem a seguir, é o único jeito de abrir o cofre se você perder esse aparelho.</p>
      }
      @if (aparelhos().length && !senhaServe()) {
        <p class="aviso">Com um aparelho no modo servidor, a senha mestra precisa ser a frase sorteada ou ter pelo menos {{ minimoServidor }} bits.</p>
      }
      @if (aparelhos().length) {
        <p class="nota pequena">Crie o cofre logo: cada aparelho registrado vale por 2 minutos.</p>
      }
    </div>

    <div class="pe">
      <button type="button" class="palavra" [disabled]="ocupado()" (click)="voltar.emit()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        {{ senhaServe() ? 'Voltar para a senha' : 'Trocar a senha' }}
      </button>
      <button type="button" class="tinta" [disabled]="!pronto()" (click)="criar()">Criar o cofre</button>
    </div>
  `,
  styleUrl: './passo-aparelhos.scss',
})
export class PassoAparelhos {
  private readonly servicos = inject(SERVICOS);

  readonly senha = input.required<SenhaEscolhida>();
  readonly voltar = output<void>();
  readonly criarCom = output<AparelhoParaCriar[]>();
  /** A sessão de entrada acabou: quem cuida é a ficha (pede para entrar de novo). */
  readonly sessaoAcabou = output<void>();

  protected readonly maximo = APARELHOS_NA_CRIACAO;
  protected readonly minimoServidor = BITS_MINIMOS_MODO_SERVIDOR;
  protected readonly aparelhos = signal<readonly Aparelho[]>([]);
  protected readonly ocupado = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly modoServidor = computed(() => this.aparelhos().some((a) => a.passkey.prf === null));
  protected readonly senhaServe = computed(() => {
    const { senha, sugerida } = this.senha();
    return avaliarSenha(senha, { sugerida, modoServidor: this.modoServidor() }).situacao !== 'fraca';
  });
  protected readonly pronto = computed(
    () =>
      !this.ocupado() &&
      this.aparelhos().length >= 1 &&
      this.aparelhos().every((a) => a.apelido.trim() && this.estado(a) !== 'pendente') &&
      this.senhaServe(),
  );

  protected estado(a: Aparelho): Estado {
    if (a.passkey.prf) return 'prf';
    return a.passkey.prfLigado && !a.aceitouServidor ? 'pendente' : 'servidor';
  }

  private atualizar(): void {
    this.aparelhos.update((lista) => [...lista]);
  }

  protected renomear(a: Aparelho, evento: Event): void {
    a.apelido = (evento.target as HTMLInputElement).value;
    this.atualizar();
  }

  protected async registrar(): Promise<void> {
    this.erro.set(null);
    this.ocupado.set(true);
    try {
      const desafio = await this.servicos.api.desafioDeRegistro();
      const passkey = await registrarPasskey(desafio, this.servicos.rpId, this.servicos.autenticador);
      const celular = ehCelular(passkey, this.servicos.pagina.agente);
      this.aparelhos.update((lista) => [...lista, { id: passkey.credencial.id, passkey, celular, apelido: celular ? 'Celular' : 'PC', aceitouServidor: false }]);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) this.sessaoAcabou.emit();
      else this.erro.set(mensagem(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async confirmarPrf(a: Aparelho): Promise<void> {
    this.erro.set(null);
    this.ocupado.set(true);
    try {
      const segredo = await pedirSegredoPrf(a.passkey, this.servicos.rpId, this.servicos.autenticador);
      if (segredo) a.passkey.prf = segredo;
      else this.erro.set('O aparelho confirmou, mas não deu a chave do PRF. Use o modo servidor ou tire este aparelho.');
      this.atualizar();
    } catch (e) {
      this.erro.set(mensagem(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected usarServidor(a: Aparelho): void {
    a.aceitouServidor = true;
    this.atualizar();
  }

  /** Tira todos os aparelhos (depois de um erro ao criar, eles não servem mais), zerando o segredo do PRF de cada um. */
  recomecar(): void {
    for (const a of this.aparelhos()) esquecerPrf(a);
    this.aparelhos.set([]);
  }

  protected tirar(a: Aparelho): void {
    esquecerPrf(a);
    this.aparelhos.update((lista) => lista.filter((x) => x !== a));
  }

  protected criar(): void {
    if (!this.pronto()) return;
    this.criarCom.emit(this.aparelhos().map((a) => ({ passkey: a.passkey, apelido: a.apelido.trim() })));
  }
}
