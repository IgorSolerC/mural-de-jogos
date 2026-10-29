import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { avaliarSenha, BITS_MINIMOS_MODO_SERVIDOR, PIN, soAlgarismos } from '../../core/forca';
import { sortearFrase } from '../../core/sorteio';
import { AvisoSenhaFraca } from './aviso-senha-fraca';
import { ReguaForca } from './regua-forca';

/** A senha que a pessoa escolheu, e a frase sorteada (que só vale como sorteada se for igual). */
export interface SenhaEscolhida {
  readonly senha: string;
  readonly sugerida: string | null;
  /** É um PIN (só algarismos): a tela de abrir mostra o teclado de números. */
  readonly pin?: boolean;
  /** Fraca, e a pessoa aceitou o aviso de que não é tão segura (17.23). */
  readonly aceitouAviso?: boolean;
}

type Jeito = 'frase' | 'propria' | 'pin';

/**
 * O passo da senha mestra (8.3, passo 3): a frase de 6 palavras sorteada aqui, que a pessoa copia no
 * papel e digita de volta, uma senha dela, que passa pela régua de força, ou um PIN. Abaixo do mínimo (o
 * PIN, uma senha curta), a senha só segue depois do aviso de que não é tão segura (17.23). A senha só vive
 * nesta tela até seguir; nada é guardado.
 */
@Component({
  selector: 'cofre-passo-senha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReguaForca, NgTemplateOutlet, AvisoSenhaFraca],
  template: `
    <h2>A senha mestra</h2>
    <p class="nota">
      É a única senha que você vai precisar decorar. Ela nunca sai deste aparelho, e ninguém consegue recuperá-la: nem o Murall. Esqueceu, o cofre não abre mais.
    </p>

    <div class="jeitos" role="radiogroup" aria-label="Que senha usar">
      <button type="button" role="radio" [attr.aria-checked]="jeito() === 'frase'" (click)="escolher('frase')">Frase sorteada</button>
      <button type="button" role="radio" [attr.aria-checked]="jeito() === 'propria'" (click)="escolher('propria')">Escrever a minha</button>
      <button type="button" role="radio" [attr.aria-checked]="jeito() === 'pin'" (click)="escolher('pin')">Um PIN</button>
    </div>

    @if (jeito() === 'frase') {
      <div class="frase-bloco">
        <span class="rotulo" id="frase-rotulo">Copie num papel e guarde até decorar</span>
        <p class="frase" aria-labelledby="frase-rotulo" translate="no">
          @for (palavra of palavras(); track $index; let ultima = $last) {
            <span class="palavra"
              >{{ palavra }}@if (!ultima) {<span class="hifen">-</span>}</span
            >
          }
        </p>
        <button type="button" class="quieto" (click)="sortear()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          Sortear outra
        </button>
      </div>
      <div class="campo-bloco">
        <label class="rotulo" for="senha-frase">Digite a frase, com os hífens</label>
        <span class="com-olho">
          <input
            id="senha-frase"
            [type]="mostrar() ? 'text' : 'password'"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            translate="no"
            [value]="digitada()"
            (input)="digitada.set(valor($event))"
          />
          <ng-container *ngTemplateOutlet="olho" />
        </span>
      </div>
      @if (digitada() && !frasesIguais()) {
        <p class="aviso">Ainda não é igual à frase de cima.</p>
      }
    } @else {
      @if (jeito() === 'pin') {
        <p class="nota pequena">Só algarismos, de 4 a 16. Na tela de abrir, o celular mostra o teclado de números.</p>
      }
      <div class="campo-bloco">
        <label class="rotulo" for="senha-propria">{{ jeito() === 'pin' ? 'Seu PIN' : 'Sua senha mestra' }}</label>
        <span class="com-olho">
          <input
            id="senha-propria"
            [class.pin]="jeito() === 'pin'"
            [type]="mostrar() ? 'text' : 'password'"
            [attr.inputmode]="jeito() === 'pin' ? 'numeric' : null"
            [attr.maxlength]="jeito() === 'pin' ? 16 : null"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            translate="no"
            [value]="propria()"
            (input)="propria.set(digitado($event))"
          />
          <ng-container *ngTemplateOutlet="olho" />
        </span>
      </div>
      <cofre-regua-forca [avaliacao]="avaliacao()" />
      @if (avaliacao().situacao === 'boa' && avaliacao().bits < minimoServidor) {
        <p class="nota pequena">Serve. Mas se algum aparelho ficar sem PRF, vamos pedir uma de pelo menos {{ minimoServidor }} bits.</p>
      }
      <div class="campo-bloco">
        <label class="rotulo" for="senha-confirmacao">Digite de novo</label>
        <input
          id="senha-confirmacao"
          [class.pin]="jeito() === 'pin'"
          [type]="mostrar() ? 'text' : 'password'"
          [attr.inputmode]="jeito() === 'pin' ? 'numeric' : null"
          [attr.maxlength]="jeito() === 'pin' ? 16 : null"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          translate="no"
          [value]="confirmacao()"
          (input)="confirmacao.set(digitado($event))"
        />
      </div>
      @if (confirmacao() && confirmacao() !== propria()) {
        <p class="aviso">{{ jeito() === 'pin' ? 'Os dois não são iguais.' : 'As duas não são iguais.' }}</p>
      }
    }

    <ng-template #olho>
      <button type="button" class="olho" [attr.aria-pressed]="mostrar()" [attr.aria-label]="mostrar() ? 'Esconder a senha' : 'Mostrar a senha'" (click)="mostrar.set(!mostrar())">
        @if (mostrar()) {
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.6 3.4M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 5.4-1.6" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        } @else {
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        }
      </button>
    </ng-template>

    @if (avisando()) {
      <cofre-aviso-senha-fraca [pin]="jeito() === 'pin'" (usar)="aceitar()" (voltar)="avisando.set(false)" />
    } @else {
      <div class="pe">
        <button type="button" class="tinta" [disabled]="!pronta()" (click)="seguir()">Continuar</button>
      </div>
    }
  `,
  styleUrl: './passo-senha.scss',
})
export class PassoSenha {
  readonly escolhida = output<SenhaEscolhida>();

  protected readonly minimoServidor = BITS_MINIMOS_MODO_SERVIDOR;
  protected readonly jeito = signal<Jeito>('frase');
  protected readonly frase = signal(sortearFrase());
  protected readonly palavras = computed(() => this.frase().split('-'));
  protected readonly digitada = signal('');
  protected readonly propria = signal('');
  protected readonly confirmacao = signal('');
  protected readonly mostrar = signal(false);
  /** O aviso de que a senha não é tão segura, aberto no lugar do Continuar. */
  protected readonly avisando = signal(false);

  protected readonly frasesIguais = computed(() => this.digitada().trim() === this.frase());
  protected readonly avaliacao = computed(() => avaliarSenha(this.propria()));
  protected readonly pronta = computed(() => {
    if (this.jeito() === 'frase') return this.frasesIguais();
    const a = this.avaliacao();
    const formato = this.jeito() !== 'pin' || PIN.test(this.propria());
    return formato && (a.situacao === 'boa' || a.comAviso) && this.confirmacao() === this.propria();
  });

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  /** O que foi digitado; no PIN, só os algarismos (o resto sai do campo na hora). */
  protected digitado(evento: Event): string {
    const campo = evento.target as HTMLInputElement;
    if (this.jeito() !== 'pin') return campo.value;
    const limpo = soAlgarismos(campo.value);
    if (limpo !== campo.value) campo.value = limpo;
    return limpo;
  }

  protected escolher(jeito: Jeito): void {
    if (jeito === this.jeito()) return;
    // a senha escrita num jeito não passa para o outro (um PIN não é a senha de antes sem as letras)
    if (jeito === 'pin' || this.jeito() === 'pin') {
      this.propria.set('');
      this.confirmacao.set('');
    }
    this.avisando.set(false);
    this.jeito.set(jeito);
  }

  protected sortear(): void {
    this.frase.set(sortearFrase());
    this.digitada.set('');
  }

  protected seguir(): void {
    if (!this.pronta()) return;
    if (this.jeito() === 'frase') this.escolhida.emit({ senha: this.frase(), sugerida: this.frase() });
    else if (this.avaliacao().situacao === 'fraca') this.avisando.set(true);
    else this.escolhida.emit({ senha: this.propria(), sugerida: null, pin: this.jeito() === 'pin' });
  }

  /** Aceitou o aviso: segue com a senha fraca (o PIN, a curta). */
  protected aceitar(): void {
    if (!this.pronta() || this.jeito() === 'frase') return;
    this.avisando.set(false);
    this.escolhida.emit({ senha: this.propria(), sugerida: null, pin: this.jeito() === 'pin', aceitouAviso: true });
  }
}
