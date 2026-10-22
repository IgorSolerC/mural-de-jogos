import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { bitsGerados, gerarCaracteres, gerarFrase, PALAVRAS_MAXIMAS, PALAVRAS_MINIMAS, TAMANHO_MAXIMO, TAMANHO_MINIMO, type Tipo } from '../../core/gerador';

const NOMES: Record<Tipo, string> = { minusculas: 'abc', maiusculas: 'ABC', numeros: '123', simbolos: '#$%' };

/**
 * O gerador (seção 10): uma frase de palavras ou caracteres sorteados, sem viés, com quantos bits dá.
 * "Usar esta" põe a senha no campo do item; nada é guardado em outro lugar.
 */
@Component({
  selector: 'cofre-gerador-painel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="painel" role="group" aria-label="Gerar uma senha">
      <div class="jeitos" role="radiogroup" aria-label="Que tipo de senha">
        <button type="button" role="radio" [attr.aria-checked]="jeito() === 'caracteres'" (click)="trocar('caracteres')">Caracteres</button>
        <button type="button" role="radio" [attr.aria-checked]="jeito() === 'frase'" (click)="trocar('frase')">Frase</button>
      </div>

      @if (jeito() === 'caracteres') {
        <label class="linha">
          <span class="rotulo">Tamanho</span>
          <input type="range" [min]="minimo" [max]="maximo" [value]="tamanho()" (input)="tamanho.set(numero($event)); gerar()" />
          <span class="numero">{{ tamanho() }}</span>
        </label>
        <div class="tipos" role="group" aria-label="Que caracteres usar">
          @for (t of todos; track t) {
            <label class="tipo">
              <input type="checkbox" [checked]="tipos().includes(t)" [disabled]="tipos().length === 1 && tipos().includes(t)" (change)="alternar(t)" />
              <span>{{ nomes[t] }}</span>
            </label>
          }
        </div>
      } @else {
        <label class="linha">
          <span class="rotulo">Palavras</span>
          <input type="range" [min]="palavrasMin" [max]="palavrasMax" [value]="palavras()" (input)="palavras.set(numero($event)); gerar()" />
          <span class="numero">{{ palavras() }}</span>
        </label>
      }

      <p class="gerada" translate="no">{{ senha() }}</p>
      <p class="bits">Cerca de {{ bits() }} bits</p>
      <div class="acoes">
        <button type="button" class="quieto" (click)="gerar()">Outra</button>
        <button type="button" class="tinta" (click)="usar.emit(senha())">Usar esta</button>
      </div>
    </div>
  `,
  styleUrl: './gerador-painel.scss',
})
export class GeradorPainel {
  readonly usar = output<string>();

  protected readonly todos: readonly Tipo[] = ['minusculas', 'maiusculas', 'numeros', 'simbolos'];
  protected readonly nomes = NOMES;
  protected readonly minimo = TAMANHO_MINIMO;
  protected readonly maximo = TAMANHO_MAXIMO;
  protected readonly palavrasMin = PALAVRAS_MINIMAS;
  protected readonly palavrasMax = PALAVRAS_MAXIMAS;

  protected readonly jeito = signal<'caracteres' | 'frase'>('caracteres');
  protected readonly tamanho = signal(20);
  protected readonly palavras = signal(6);
  protected readonly tipos = signal<readonly Tipo[]>(['minusculas', 'maiusculas', 'numeros', 'simbolos']);
  protected readonly senha = signal('');
  protected readonly bits = computed(() => (this.jeito() === 'frase' ? bitsGerados({ frase: this.palavras() }) : bitsGerados({ tamanho: this.tamanho(), tipos: this.tipos() })));

  constructor() {
    this.gerar();
  }

  protected numero(evento: Event): number {
    return Number((evento.target as HTMLInputElement).value);
  }

  protected trocar(jeito: 'caracteres' | 'frase'): void {
    this.jeito.set(jeito);
    this.gerar();
  }

  protected alternar(tipo: Tipo): void {
    const agora = this.tipos();
    if (agora.includes(tipo)) {
      if (agora.length > 1) this.tipos.set(agora.filter((t) => t !== tipo));
    } else {
      this.tipos.set([...agora, tipo]);
    }
    this.gerar();
  }

  protected gerar(): void {
    this.senha.set(this.jeito() === 'frase' ? gerarFrase(this.palavras()) : gerarCaracteres({ tamanho: this.tamanho(), tipos: this.tipos() }));
  }
}
