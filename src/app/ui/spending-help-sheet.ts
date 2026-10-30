import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, output, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { BackdropClose } from './backdrop-close';
import { Pin } from './pin';

/** Um jeito de escrever: a linha como se escreve (o que está entre colchetes é a marca, a marca-texto) e o que ela faz. */
export interface HelpLine {
  line: string;
  note: string;
}

/**
 * Os jeitos de escrever na linha de anotar, em partes. Cada linha é lida de verdade por `readQuick`
 * (core/spending-quick.ts) no spec, que confere o que a nota diz: mudou a leitura, a ajuda tem de mudar junto.
 */
export const HELP: readonly { title: string; items: readonly HelpLine[] }[] = [
  {
    title: 'Gasto e valor',
    items: [
      {
        line: 'ifood [44,90]',
        note: 'O nome e o valor, e Enter. O valor é o último número da linha (R$ 44,90 e 1.250 também valem). Entra no dia de hoje; com outro mês aberto, no mesmo dia dele.',
      },
      {
        line: 'salário [+4559]',
        note: 'Com + na frente, é uma entrada; recebi, ganhei e entrou também. Sem nada, é um gasto, ou o mesmo da última vez com esse nome.',
      },
    ],
  },
  {
    title: 'Parcelas e contas fixas',
    items: [
      { line: 'violão [10x] 139,90', note: 'Dez parcelas de 139,90, a primeira neste mês. Em 10x de 139,90 e x10 também valem.' },
      { line: 'violão [7/10] 139,90', note: 'Um carnê que já vinha: esta é a 7ª de 10, e as seis de antes ficam nos meses de trás.' },
      { line: 'aluguel 1800 [todo mês]', note: 'Repete todo mês. Fixo e mensal também valem.' },
    ],
  },
  {
    title: 'Quando e como pagou',
    items: [
      { line: 'uber 23 [ontem]', note: 'O dia: hoje, ontem, anteontem, dia 5, dia 5/10 ou 05/10/2026.' },
      {
        line: 'mercado 230 [pix]',
        note: 'Pix; débito, crédito, dinheiro e à vista contam como à vista. Sem nada, o pagamento da última vez com esse nome. Numa entrada, o pix fica no nome.',
      },
    ],
  },
  {
    title: 'Categoria e Precisava?',
    items: [
      {
        line: 'uber 23 [#transporte]',
        note: 'A categoria, com # (o começo basta: #transp). Sem ela, vale uma palavra do nome que já é categoria (mercado), a da última vez com esse nome, ou Outros.',
      },
      { line: 'cinema 38 [#luxo]', note: 'Se precisava: #luxo, #conforto ou #indispensável (#supérfluo e #essencial também).' },
    ],
  },
  {
    title: 'Com quem foi',
    items: [
      {
        line: 'jantar 600 [@bruna] [@biel]',
        note: 'Cada um conta a sua parte, e você está sempre (para tirar, na folhinha). O começo do nome basta (@bru); quem é novo entra ao lançar; nome com espaço vai com _ (@ana_paula).',
      },
    ],
  },
  {
    title: 'Tudo junto',
    items: [{ line: 'jantar 600 [@bruna] [pix] [ontem] [#luxo]', note: 'A ordem não importa: o que não é marca vira o nome.' }],
  },
];

/** A linha em pedaços: os entre colchetes são as marcas. */
export function helpParts(line: string): { text: string; mark: boolean }[] {
  return line
    .split(/(\[[^\]]+\])/)
    .filter(Boolean)
    .map((p) => (p.startsWith('[') ? { text: p.slice(1, -1), mark: true } : { text: p, mark: false }));
}

/** A linha como ela é escrita, sem os colchetes. */
export function helpText(line: string): string {
  return line.replace(/[[\]]/g, '');
}

/**
 * Como anotar: a ajuda da linha de anotar dos Gastos (o ? do topo, ao lado do Filtrar). Cada jeito é a
 * linha escrita numa tirinha de papel, com a marca que faz a diferença passada a marca-texto, e ao lado o
 * que ela faz. Só leitura: escrever é na própria linha.
 */
@Component({
  selector: 'app-spending-help-sheet',
  imports: [BackdropClose, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet como-anotar" aria-labelledby="gh-titulo" aria-describedby="gh-sobre" (close)="closed.emit()" (backdropClose)="close()">
      <div class="ficha cartolina" style="--stock: var(--stock-amarelo)" data-cor="amarelo">
        <app-pin class="pin" color="#f4f4f0" />
        <header class="head">
          <div class="titulos">
            <h2 id="gh-titulo">Como anotar</h2>
            <p class="sub">Escreva como se fala · em qualquer ordem</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          <p class="sobre" id="gh-sobre">
            Antes do Enter, a folhinha embaixo da linha mostra o que ela entendeu, e tudo se troca ali. Enquanto o nome é escrito, os gastos de antes aparecem para escolher.
          </p>
          @for (sec of help; track sec.title; let i = $index) {
            <section class="grupo" [attr.aria-labelledby]="'gh-' + i">
              <h3 class="grupo-titulo" [id]="'gh-' + i">{{ sec.title }}</h3>
              <ul class="jeitos">
                @for (h of sec.items; track h.line) {
                  <li class="jeito">
                    <p class="escrito">
                      @for (p of parts(h.line); track $index) {
                        @if (p.mark) {
                          <mark>{{ p.text }}</mark>
                        } @else {
                          <span>{{ p.text }}</span>
                        }
                      }
                    </p>
                    <p class="faz">{{ h.note }}</p>
                  </li>
                }
              </ul>
            </section>
          }
        </div>

        <footer class="foot">
          <button type="button" class="btn-ink" (click)="close()">Pronto</button>
        </footer>
      </div>
    </dialog>
  `,
  styleUrl: './spending-help-sheet.scss',
})
export class SpendingHelpSheet {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly help = HELP;
  protected readonly parts = helpParts;

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }
}
