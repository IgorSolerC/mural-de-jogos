import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import type { ItemNaLista } from '../../core/itens';
import { Icone } from '../icone';
import { nomeDoItem } from './monograma';
import { MonogramaSelo } from './monograma-selo';

const DIA_MS = 86_400_000;

/** Quantos dias faltam para um item da lixeira ser apagado sozinho (30 depois de ir para lá). */
export function diasNaLixeira(i: ItemNaLista, agora = Date.now()): number {
  const desde = Date.parse(i.naLixeiraDesde ?? '');
  return Number.isNaN(desde) ? 30 : Math.max(0, 30 - Math.floor((agora - desde) / DIA_MS));
}

/**
 * A lixeira (seção 16.5), na ficha inteira: cada item com quantos dias faltam, Voltar e Apagar de vez
 * (com a pergunta antes, porque não tem volta).
 */
@Component({
  selector: 'cofre-lixeira',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone, MonogramaSelo],
  template: `
    <button type="button" class="palavra voltar" (click)="voltar.emit()">
      <cofre-icone nome="voltar" />
      Voltar às senhas
    </button>
    <h2>Lixeira</h2>
    <p class="nota">Cada item fica aqui por 30 dias e depois é apagado sozinho.</p>
    @if (!itens().length) {
      <p class="nota">A lixeira está vazia.</p>
    }
    <ul class="lista" aria-label="Itens na lixeira">
      @for (i of itens(); track i.id) {
        @let dias = diasNaLixeira(i);
        <li class="na-lixeira">
          <cofre-monograma [nome]="nome(i.item!)" />
          <span class="textos">
            <span class="titulo">{{ nome(i.item!) }}</span>
            <span class="dias">Some em {{ dias }} {{ dias === 1 ? 'dia' : 'dias' }}</span>
          </span>
          <span class="botoes">
            @if (confirmar() === i.id) {
              <span class="pergunta">Apagar de vez? Não dá para desfazer.</span>
              <button type="button" class="papel perigo" [disabled]="ocupado()" (click)="apagar.emit(i)">Apagar</button>
              <button type="button" class="papel" [disabled]="ocupado()" (click)="confirmar.set(null)">Não</button>
            } @else {
              <button type="button" class="papel" [disabled]="ocupado()" (click)="restaurar.emit(i)">
                <cofre-icone nome="desfazer" />
                Voltar
              </button>
              <button type="button" class="papel perigo" [disabled]="ocupado()" (click)="confirmar.set(i.id)">Apagar de vez</button>
            }
          </span>
        </li>
      }
    </ul>
  `,
  styleUrl: './lixeira.scss',
})
export class Lixeira {
  readonly itens = input.required<readonly ItemNaLista[]>();
  readonly ocupado = input(false);
  readonly voltar = output<void>();
  readonly restaurar = output<ItemNaLista>();
  readonly apagar = output<ItemNaLista>();

  /** O item esperando a confirmação de apagar de vez. */
  protected readonly confirmar = signal<string | null>(null);
  protected readonly nome = nomeDoItem;
  protected readonly diasNaLixeira = diasNaLixeira;

  /** Depois de apagar, a pergunta some. */
  apagou(): void {
    this.confirmar.set(null);
  }
}
