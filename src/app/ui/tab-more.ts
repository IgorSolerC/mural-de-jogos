import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output, signal, viewChild, viewChildren } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { CategoryLook, categoryColorHex } from '../core/category-looks';
import { fold } from '../core/text';
import { CategoryLabel } from './category-label';
import { ICON, IconModule } from './icons';

/** Quantas listas do "Mais" já nasceram (o id de cada uma). */
let lists = 0;

/** Uma aba no "Mais": um grupo (com o desenho e a cor dele) ou uma das abas que o mural gera. */
export interface TabMoreItem {
  key: string;
  label: string;
  n: number;
  look: CategoryLook;
  /** O desenho no lugar do do grupo (as abas que o mural gera, o artista nas músicas). */
  glyph?: LucideIconData | null;
  /** "Sem grupo": o nome a lápis, sem desenho (não é um grupo). */
  plain?: boolean;
}

/**
 * O "Mais" das abas do mural: a própria orelha (o que ela mostra vem de quem usa, projetado) abre um
 * remendo de feltro costurado, como o "Citar" da leitura e o painel de emojis das reações, com os
 * grupos que não couberam em pé (cada um com o desenho na cor dele e quantas anotações tem) e, depois
 * de uma costura, as abas que o mural gera (Tudo, Fixadas, Compartilhadas) que não estão em pé.
 *
 * Fica na camada de cima da página (o popover do navegador: nada o corta, e o Esc e o toque fora o
 * fecham), embaixo da orelha, ou em cima dela quando falta lugar embaixo; rolando a página, ele
 * acompanha a orelha, e fecha só quando ela sai da tela. É uma lista de escolha: as setas andam, Home
 * e End vão às pontas, Enter ou espaço escolhe, uma letra pula para o próximo nome com ela; o foco
 * sempre volta para a orelha.
 */
@Component({
  selector: 'app-tab-more',
  imports: [CategoryLabel, IconModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.aberto]': 'open()' },
  template: `
    <button
      #gatilho
      type="button"
      class="gatilho"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? listId : null"
      [attr.aria-label]="label() + (activeLabel() ? ': ' + activeLabel() : '')"
      (pointerdown)="wasOpen = open()"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
    >
      <ng-content />
    </button>
    <!-- a lista fica montada (escondida pelo popover): abrir é só mostrar, medir e pôr o foco -->
    <div #cardapio [id]="listId" class="cardapio" popover="auto" role="listbox" [attr.aria-label]="label()" (toggle)="onToggle($event)" (keydown)="onListKey($event)">
      @if (groups().length) {
        <div role="group" class="leva" [attr.aria-label]="groupsLabel()">
          @for (x of groups(); track x.key) {
            <ng-container *ngTemplateOutlet="item; context: { $implicit: x }" />
          }
        </div>
      }
      @if (autos().length) {
        <div role="group" class="leva" [attr.aria-labelledby]="listId + '-costura'">
          <p class="costura" [class.so]="!groups().length" [id]="listId + '-costura'">Gerados automaticamente</p>
          @for (x of autos(); track x.key) {
            <ng-container *ngTemplateOutlet="item; context: { $implicit: x }" />
          }
        </div>
      }
    </div>
    <ng-template #item let-x>
      <button
        #opcao
        type="button"
        role="option"
        class="opcao"
        [class.ligada]="x.key === active()"
        [attr.aria-selected]="x.key === active()"
        [attr.aria-label]="x.label + ', ' + x.n + (x.n === 1 ? ' anotação' : ' anotações')"
        [attr.tabindex]="x.key === focusKey() ? 0 : -1"
        [attr.data-k]="x.key"
        [style.--cat-cor]="colorOf(x)"
        (click)="pick(x.key)"
      >
        @if (x.plain) {
          <span class="nome-lapis">{{ x.label }}</span>
        } @else {
          <app-cat-label class="rotulo" [label]="x.label" [look]="x.look" [glyph]="x.glyph ?? null" [iconSize]="17" [tint]="!!colorOf(x)" />
        }
        <span class="n" aria-hidden="true">{{ x.n }}</span>
        @if (x.key === active()) {
          <lucide-icon class="tique" [img]="CheckIcon" [size]="16" aria-hidden="true" />
        }
      </button>
    </ng-template>
  `,
  styleUrl: './tab-more.scss',
})
export class TabMore {
  /** Os grupos que não couberam em pé, na ordem das abas. */
  readonly groups = input.required<readonly TabMoreItem[]>();
  /** As abas que o mural gera e que não estão em pé (o olho desligado nas configurações). */
  readonly autos = input<readonly TabMoreItem[]>([]);
  /** A aba aberta. */
  readonly active = input.required<string>();
  /** "Mais abas" (ou "Mais artistas"): o nome da lista para o leitor de tela. */
  readonly label = input('Mais abas');
  /** O nome da leva dos grupos, para o leitor de tela ("Grupos", "Artistas"). */
  readonly groupsLabel = input('Grupos');
  readonly chosen = output<string>();

  protected readonly CheckIcon = ICON.pronto;
  protected readonly open = signal(false);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('gatilho');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('cardapio');
  private readonly options = viewChildren<ElementRef<HTMLButtonElement>>('opcao');

  private readonly all = computed(() => [...this.groups(), ...this.autos()]);
  /** O nome da aba aberta, se ela é uma das do "Mais" (o leitor de tela ouve na orelha). */
  protected readonly activeLabel = computed(() => this.all().find((x) => x.key === this.active())?.label ?? null);
  /** A opção que recebe o foco ao entrar na lista: a aberta, ou a primeira. */
  protected readonly focusKey = signal<string | null>(null);
  /**
   * A lista estava aberta quando o dedo ou o mouse desceu na orelha: o toque fora do popover já a
   * fechou (no pointerdown), e o clique não pode abrir de novo.
   */
  protected wasOpen = false;
  /** O id da lista (aria-controls), um por "Mais" da página. */
  protected readonly listId = `mais-lista-${++lists}`;

  /** Rolou a página ou mudou o tamanho: o remendo acompanha a orelha (no quadro seguinte), e fecha se ela saiu da tela. */
  private frame = 0;
  private readonly follow = (e: Event) => {
    // rolar a própria lista não conta
    if (e.type === 'scroll' && e.target instanceof Node && this.panel().nativeElement.contains(e.target)) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (!this.open()) return;
      const r = this.tabRect();
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) this.close(false);
      else this.place();
    });
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unlisten());
  }

  protected colorOf(x: TabMoreItem): string | null {
    return categoryColorHex(x.look.color);
  }

  protected toggle(): void {
    const was = this.wasOpen;
    this.wasOpen = false;
    if (this.open()) this.close(true);
    else if (!was) this.show();
  }

  /** Abre embaixo (ou em cima) da orelha, com o foco na aberta (ou na última, pela seta para cima). */
  private show(focusLast = false): void {
    const list = this.all();
    if (!list.length) return;
    const start = focusLast ? list.at(-1)! : (list.find((x) => x.key === this.active()) ?? list[0]);
    const el = this.panel().nativeElement;
    this.focusKey.set(start.key);
    this.open.set(true);
    if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) el.showPopover();
    this.place();
    this.listen();
    this.focusOn(start.key);
  }

  /** A orelha inteira (o host), onde o remendo se apoia. */
  private tabRect(): DOMRect {
    const t = this.trigger().nativeElement;
    return (t.closest('.aba') ?? t).getBoundingClientRect();
  }

  private place(): void {
    const el = this.panel().nativeElement;
    const r = this.tabRect();
    const margin = 8;
    const w = el.offsetWidth;
    let left = r.left;
    if (left + w > innerWidth - margin) left = Math.max(margin, r.right - w);
    el.style.left = `${Math.round(left)}px`;
    // embaixo da orelha; sem lugar embaixo (a orelha perto do pé da tela, no celular), em cima dela
    const below = Math.max(0, innerHeight - r.bottom - 6 - margin);
    const above = Math.max(0, r.top - 6 - margin);
    const tall = el.scrollHeight;
    const up = below < Math.min(tall, 260) && above > below;
    // o lugar de verdade (nunca passa da tela: passando, o foco rolaria a página)
    const room = Math.round(up ? above : below);
    el.style.maxHeight = `${room}px`;
    el.style.top = `${Math.round(up ? r.top - 6 - Math.min(tall, room) : r.bottom + 6)}px`;
    el.classList.toggle('em-cima', up);
  }

  private listen(): void {
    addEventListener('resize', this.follow);
    addEventListener('scroll', this.follow, { capture: true, passive: true });
  }

  private unlisten(): void {
    cancelAnimationFrame(this.frame);
    removeEventListener('resize', this.follow);
    removeEventListener('scroll', this.follow, { capture: true });
  }

  /** Fecha; `focus`: o foco volta para a orelha (o Esc, a escolha, o Tab). */
  private close(focus: boolean): void {
    const el = this.panel().nativeElement;
    if (typeof el.hidePopover === 'function' && el.matches(':popover-open')) el.hidePopover();
    this.open.set(false);
    this.unlisten();
    if (focus) this.trigger().nativeElement.focus();
  }

  /**
   * O popover fechou sozinho (o toque fora, o Esc do navegador, outro popover): a lista some. O foco que
   * estava nela (ou que caiu no nada com ela) volta para a orelha; o toque fora fica onde a pessoa tocou.
   */
  protected onToggle(e: Event): void {
    if ((e as ToggleEvent).newState !== 'closed' || !this.open()) return;
    this.open.set(false);
    this.unlisten();
    const now = document.activeElement;
    if (!now || now === document.body || this.panel().nativeElement.contains(now)) this.trigger().nativeElement.focus();
  }

  protected pick(key: string): void {
    this.close(true);
    if (key !== this.active()) this.chosen.emit(key);
  }

  protected onTriggerKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.open()) this.show(e.key === 'ArrowUp');
    }
  }

  protected onListKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      // fecha aqui, com o foco de volta na orelha (o fechar do popover deixaria o foco no nada)
      e.preventDefault();
      this.close(true);
      return;
    }
    if (e.key === 'Tab') {
      // sair da lista pelo Tab fecha, e o foco segue da orelha
      e.preventDefault();
      this.close(true);
      return;
    }
    // os atalhos (Ctrl+C, Alt+letra) não são letras da busca
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const list = this.all();
    const keys = list.map((x) => x.key);
    const at = keys.indexOf(this.focusKey() ?? '');
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = Math.min(keys.length - 1, at + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, at - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = keys.length - 1;
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // a letra: o próximo nome que começa com ela (sem ligar para acento nem caixa)
      const k = fold(e.key);
      for (let i = 1; i <= list.length; i++) {
        const j = (at + i) % list.length;
        if (fold(list[j].label).startsWith(k)) {
          next = j;
          break;
        }
      }
    }
    if (next === null) return;
    e.preventDefault();
    this.focusOn(keys[next]);
  }

  private focusOn(key: string): void {
    this.focusKey.set(key);
    const el = this.options().find((o) => o.nativeElement.dataset['k'] === key)?.nativeElement;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }
}
