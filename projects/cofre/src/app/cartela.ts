import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CARTELA_DE_ICONES, CORES_DA_CARTELA, type IdDaCor, type IdDoIcone } from '../../../../shared/cartela-de-icones';
import { CORES_DO_SELO, type CorDoSelo } from '../core/selo';
import { Icone, type NomeDoIcone } from './icone';

/**
 * A cartela de ícones (e, para os grupos, de cores) do cofre: a mesma do Murall, dos grupos das anotações
 * e das colunas do Kanban (shared/cartela-de-icones.ts). A primeira escolha é a de sempre (a letra da
 * senha, a pasta do grupo); o escolhido fica no marca-texto, e a cor é a orelha em miniatura com a borda
 * colorida por dentro, como nas Configurações do mural. Para uma senha, as cores são as do selo: as
 * cartolinas em quadradinhos, com a que sai do nome primeiro.
 */
@Component({
  selector: 'cofre-cartela',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone],
  template: `
    <p class="sub" [id]="id() + '-icones'">Ícone</p>
    <div class="ops" role="group" [attr.aria-labelledby]="id() + '-icones'">
      <button type="button" class="op icone de-sempre" [attr.aria-pressed]="!icone()" [attr.aria-label]="deSempre()" [title]="deSempre()" (click)="escolherIcone.emit('')">
        @if (letra(); as l) {
          <span class="letra" aria-hidden="true">{{ l }}</span>
        } @else {
          <cofre-icone [nome]="iconeDeSempre()" />
        }
      </button>
      @for (i of icones; track i.id) {
        <button type="button" class="op icone" [attr.aria-pressed]="icone() === i.id" [attr.aria-label]="i.label" [title]="i.label" (click)="escolherIcone.emit(i.id)">
          <cofre-icone [cartela]="i.id" />
        </button>
      }
    </div>
    @if (corDoNome(); as doNome) {
      <p class="sub" [id]="id() + '-selo'">Cor do quadradinho</p>
      <div class="ops" role="group" [attr.aria-labelledby]="id() + '-selo'">
        <button type="button" class="op selo pelo-nome" [attr.data-cor]="doNome" [attr.aria-pressed]="!corDoSelo()" aria-label="Pelo nome" title="Pelo nome: a cor sorteada pelo nome da senha" (click)="escolherCorDoSelo.emit('')"></button>
        @for (c of coresDoSelo; track c.id) {
          <button type="button" class="op selo" [attr.data-cor]="c.id" [attr.aria-pressed]="corDoSelo() === c.id" [attr.aria-label]="c.label" [title]="c.label" (click)="escolherCorDoSelo.emit(c.id)"></button>
        }
      </div>
    }
    @if (comCores()) {
      <p class="sub" [id]="id() + '-cores'">Cor da orelha</p>
      <div class="ops" role="group" [attr.aria-labelledby]="id() + '-cores'">
        <button type="button" class="op cor sem-cor" [attr.aria-pressed]="!cor()" aria-label="Sem cor" title="Sem cor: o manilha liso" (click)="escolherCor.emit('')"></button>
        @for (c of cores; track c.id) {
          <button type="button" class="op cor" [style.--c]="c.hex" [attr.aria-pressed]="cor() === c.id" [attr.aria-label]="c.label" [title]="c.label" (click)="escolherCor.emit(c.id)"></button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 8px;
    }
    .sub {
      margin: 2px 0 0;
      font: 800 0.8rem/1.1 var(--f-rotulo);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--tinta-2);
    }
    .ops {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .op {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--tinta);
      cursor: pointer;
      transition:
        background-color 160ms var(--curva-ui),
        rotate 380ms var(--curva);
    }
    .op:hover:not([aria-pressed='true']) {
      background: rgb(21 21 21 / 0.07);
    }
    .op:focus-visible {
      outline: 3px solid var(--tinta);
      outline-offset: 0;
    }
    cofre-icone {
      width: 20px;
      height: 20px;
    }
    .letra {
      font: 400 1.2rem/1 var(--f-marker);
    }
    /* o escolhido: um adesivo amarelo colado um pouco torto */
    .icone[aria-pressed='true'] {
      background: var(--hi);
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.22),
        0 3px 6px -3px rgb(0 0 0 / 0.32);
      rotate: -3deg;
    }
    /* a cor: a orelha em miniatura, a borda colorida por dentro do papel */
    .cor::before {
      content: '';
      width: 26px;
      height: 18px;
      border: 3px solid var(--c);
      border-bottom: 0;
      border-radius: 6px 6px 0 0;
      background: var(--papel-ficha);
      box-shadow:
        0 0 0 2.5px var(--papel-ficha),
        0 0 0 3.5px rgb(21 21 21 / 0.18);
    }
    .sem-cor::before {
      border: 1.5px dashed rgb(21 21 21 / 0.45);
      background: var(--pasta);
    }
    .cor[aria-pressed='true'],
    .selo[aria-pressed='true'] {
      background: rgb(255 218 66 / 0.55);
    }
    /* a cor do selo: o quadradinho de cartolina, como o da senha; a do nome com o contorno tracejado */
    .selo::before {
      content: '';
      width: 22px;
      height: 22px;
      border-radius: 2px;
      background-color: var(--c, var(--amarelo));
      background-image: var(--grao);
      background-blend-mode: multiply;
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.28);
      rotate: -3deg;
    }
    .selo[data-cor='azul'] { --c: var(--azul); }
    .selo[data-cor='verde'] { --c: var(--verde-cartolina); }
    .selo[data-cor='rosa'] { --c: var(--rosa); }
    .selo[data-cor='laranja'] { --c: var(--laranja); }
    .selo[data-cor='lilas'] { --c: var(--lilas); }
    .selo[data-cor='vermelho'] { --c: var(--vermelho-cartolina); }
    .selo[data-cor='cinza'] { --c: var(--cinza-cartolina); }
    .selo[data-cor='preto'] { --c: var(--preto-cartolina); }
    .pelo-nome::before {
      box-shadow: none;
      outline: 1.5px dashed rgb(21 21 21 / 0.55);
      outline-offset: 2px;
    }
    @media (pointer: coarse) {
      .op {
        width: 44px;
        height: 44px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .icone[aria-pressed='true'] {
        rotate: 0deg;
      }
    }
  `,
})
export class Cartela {
  /** Para ligar os rótulos aos grupos de botões (dois na mesma tela não se confundem). */
  readonly id = input.required<string>();
  readonly icone = input<IdDoIcone | ''>('');
  /** O nome da primeira escolha, a de sempre ("A letra do nome", "A pasta"). */
  readonly deSempre = input.required<string>();
  /** A primeira escolha mostra esta letra (a da senha); sem ela, este ícone. */
  readonly letra = input<string | null>(null);
  readonly iconeDeSempre = input<NomeDoIcone>('pasta');
  readonly comCores = input(false);
  readonly cor = input<IdDaCor | ''>('');
  readonly escolherIcone = output<IdDoIcone | ''>();
  readonly escolherCor = output<IdDaCor | ''>();
  /** Para uma senha: a cor que sai do nome (liga as cores do selo) e a escolhida. */
  readonly corDoNome = input<CorDoSelo | null>(null);
  readonly corDoSelo = input<CorDoSelo | ''>('');
  readonly escolherCorDoSelo = output<CorDoSelo | ''>();

  protected readonly icones = CARTELA_DE_ICONES;
  protected readonly cores = CORES_DA_CARTELA;
  protected readonly coresDoSelo = CORES_DO_SELO;
}
