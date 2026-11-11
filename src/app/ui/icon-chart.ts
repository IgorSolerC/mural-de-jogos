import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import { GAVETAS_DE_ICONES, procurarIcones } from '../../../shared/cartela-de-icones';
import type { IconChoice } from '../core/icon-choices';
import { fold } from '../core/text';
import { BackdropClose } from './backdrop-close';
import { roveRadios } from './focus';
import { ICON, ICON_CHOICE, ICON_CHOICE_LABEL, IconModule } from './icons';
import { Pin } from './pin';

let nextId = 0;

/**
 * A escolha de um ícone da cartela (shared/cartela-de-icones.ts), a mesma em todo lugar que escolhe um:
 * o grupo das anotações, a coluna do Kanban, o baralho, o lembrete. Na folha, só uma linha: o escolhido
 * (o adesivo de tinta, ou o recorte vazio), o nome dele e "Trocar". O "Trocar" abre a cartela inteira
 * numa ficha por cima (os 110 desenhos à vista, separados por assunto, com a busca no alto, que acha
 * pelo nome e pelo que o desenho quer dizer). Tocar num desenho escolhe e fecha. Com `none`, o pé da
 * ficha oferece tirar o ícone ("Sem ícone"). Ela só escolhe (`pick`): quem usa guarda.
 */
@Component({
  selector: 'app-icon-chart',
  imports: [BackdropClose, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="linha">
      <span class="previa" [class.vazio]="!value()" aria-hidden="true">
        @if (value(); as v) {
          <lucide-icon [img]="iconOf[v]" [size]="19" />
        }
      </span>
      <div class="linha-texto">
        <p class="linha-nome" [id]="uid + '-nome'">{{ value() ? labelOf[value()!] : (none() ?? 'Sem ícone') }}</p>
        @if (hint()) {
          <p class="linha-desc">{{ hint() }}</p>
        }
      </div>
      <button
        #trigger
        type="button"
        class="papel"
        aria-haspopup="dialog"
        [attr.aria-label]="(value() ? 'Trocar o ícone: ' + labelOf[value()!] : 'Escolher um ícone')"
        (click)="openChart()"
      >
        <lucide-icon [img]="StickerIcon" [size]="16" aria-hidden="true" />
        {{ value() ? 'Trocar' : 'Escolher' }}
      </button>
    </div>

    @if (open()) {
      <dialog
        #dialog
        class="sheet cartela-de-icones"
        [attr.aria-labelledby]="uid + '-titulo'"
        (close)="closed()"
        (backdropClose)="close()"
        (keydown.escape)="$event.stopPropagation()"
      >
        <div class="ficha cartolina" style="--stock: var(--stock-branco)" data-cor="branco">
          <app-pin class="pin" />
          <header class="head">
            <div class="titulos">
              <h2 [id]="uid + '-titulo'">{{ heading() }}</h2>
              <p class="sub">{{ value() ? 'Agora: ' + labelOf[value()!] : (none() ?? 'Sem ícone') }}</p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar sem trocar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
            </button>
          </header>
          <div class="busca-linha">
            <label class="busca">
              <lucide-icon class="lupa" [img]="SearchIcon" [size]="18" aria-hidden="true" />
              <span class="sr-only">Procurar ícone</span>
              <input
                type="search"
                autocomplete="off"
                enterkeyhint="search"
                placeholder="Procurar: casa, dinheiro, jogo…"
                [value]="query()"
                (input)="query.set($any($event.target).value)"
                (keydown.escape)="clear($event)"
                (keydown.enter)="$event.preventDefault(); pickFirst()"
              />
            </label>
          </div>
          <div class="body">
            @for (g of sections(); track g.id) {
              <section class="gaveta" [attr.aria-labelledby]="uid + '-' + g.id">
                <h3 class="gaveta-nome" [id]="uid + '-' + g.id">{{ g.label }}</h3>
                <div class="grade" role="radiogroup" [attr.aria-labelledby]="uid + '-' + g.id" (keydown)="rove($event)">
                  @for (i of g.icones; track i) {
                    <button type="button" role="radio" class="op" [attr.aria-checked]="value() === i" [attr.aria-label]="labelOf[i]" [title]="labelOf[i]" (click)="choose(i)">
                      <lucide-icon [img]="iconOf[i]" [size]="19" aria-hidden="true" />
                    </button>
                  }
                </div>
              </section>
            } @empty {
              <p class="nada">Nenhum ícone com “{{ query().trim() }}”.</p>
            }
          </div>
          @if (none()) {
            <footer class="foot">
              <button type="button" class="papel sem" [attr.aria-pressed]="!value()" (click)="choose(null)">
                <span class="risco" aria-hidden="true"></span>
                {{ none() }}
              </button>
            </footer>
          }
        </div>
      </dialog>
    }
  `,
  styleUrl: './icon-chart.scss',
})
export class IconChart {
  /** O ícone escolhido (null: nenhum, ou o de sempre de quem usa). */
  readonly value = input<IconChoice | null | undefined>(null);
  /** O nome da opção vazia ("Sem ícone"); sem ele, a cartela não oferece tirar o ícone. */
  readonly none = input<string | null>(null);
  /** Uma linha embaixo do nome: onde o ícone aparece. */
  readonly hint = input('');
  /** O título da ficha da cartela ("Ícone da coluna Fazendo"). */
  readonly heading = input('Escolher o ícone');
  /** O desenho tocado (null: a opção vazia). */
  readonly pick = output<IconChoice | null>();

  protected readonly uid = `icones-${++nextId}`;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly StickerIcon = ICON.adesivo;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly labelOf = ICON_CHOICE_LABEL;
  protected readonly rove = roveRadios;

  protected readonly open = signal(false);
  protected readonly query = signal('');
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  /** As gavetas da cartela, todas à vista; procurando, só o que bate em cada uma (e as vazias saem). */
  protected readonly sections = computed(() => {
    if (!this.query().trim()) return GAVETAS_DE_ICONES;
    const hits = new Set<string>(procurarIcones(this.query(), fold));
    return GAVETAS_DE_ICONES.map((g) => ({ ...g, icones: g.icones.filter((i) => hits.has(i)) })).filter((g) => g.icones.length);
  });

  /** O "Trocar": a ficha entra na página e, desenhada, vai para a camada de cima. */
  protected openChart(): void {
    this.open.set(true);
    afterNextRender({ write: () => this.show() }, { injector: this.injector });
  }

  /** Mostra a ficha e põe o foco no escolhido (no meio da vista), ou no primeiro desenho. */
  private show(): void {
    const el = this.dialog()?.nativeElement;
    if (!el || el.open) return;
    el.showModal();
    const at = el.querySelector<HTMLElement>('.op[aria-checked="true"]') ?? el.querySelector<HTMLElement>('.op');
    at?.focus({ preventScroll: true });
    at?.scrollIntoView({ block: 'center' });
  }

  protected choose(icon: IconChoice | null): void {
    this.pick.emit(icon);
    this.close();
  }

  /** Enter na busca: o primeiro que bate. */
  protected pickFirst(): void {
    // o mais perto do escrito (pelo nome, depois pelo sentido), não o primeiro da primeira gaveta
    const first = procurarIcones(this.query(), fold)[0];
    if (first) this.choose(first);
  }

  close(): void {
    const el = this.dialog()?.nativeElement;
    if (el?.open) el.close();
    // o evento "close" do <dialog> só chega numa tarefa depois: a ficha sai já
    this.closed();
  }

  /** Fechou (o X, o Esc, o fundo, ou a escolha): a busca volta vazia e o foco volta ao "Trocar". Uma vez só. */
  protected closed(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.query.set('');
    this.trigger().nativeElement.focus();
  }

  /** Esc com algo escrito limpa a busca (e não fecha a ficha); vazia, o Esc fecha. */
  protected clear(e: Event): void {
    if (!this.query()) return;
    e.preventDefault();
    e.stopPropagation();
    this.query.set('');
  }
}
