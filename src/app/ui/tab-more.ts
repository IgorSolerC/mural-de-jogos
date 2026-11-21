import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild, viewChildren } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { CategoryLook, categoryColorHex } from '../core/category-looks';
import { LABEL_MAX, cleanNewCategory } from '../core/note-labels';
import { fold } from '../core/text';
import { CategoryLabel } from './category-label';
import { ICON, IconModule } from './icons';

/** Quantas listas do "Mais" já nasceram (o id de cada uma). */
let lists = 0;

/** A chave da linha "Novo grupo" entre as das opções (nenhuma aba começa com espaço). */
const NEW_KEY = ' novo';

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
  /**
   * O que o número quer dizer, para o leitor de tela ("3 para hoje", nos Estudos); sem o campo, "N
   * anotações". Vazio: nada além do nome.
   */
  say?: string;
  /** Sem o número à mostra (o grupo dos Estudos ainda sem baralho, onde um 0 não diria nada). */
  quiet?: boolean;
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
 *
 * Com `create`, o remendo fecha com a linha "Novo grupo" (PLANO-NOVO-GRUPO.md, D5): a lápis, como o "Sem grupo" (não
 * é um grupo), depois de um risco de costura. Tocada, vira o campo do nome ali mesmo: Enter (ou o tique) cria, Esc
 * volta para a linha; o nome de um grupo que já existe avisa embaixo, e o Enter abre esse grupo. Quem usa cria (a
 * peça só diz o nome, `created`): na visita não há linha.
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
      (pointerdown)="onPress()"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
    >
      <ng-content />
    </button>
    <!-- a lista fica montada (escondida pelo popover): abrir é só mostrar, medir e pôr o foco -->
    <div #cardapio [id]="listId" class="cardapio" popover="auto" (toggle)="onToggle($event)" (keydown)="onListKey($event)">
      @if (caption(); as c) {
        <!-- o leitor de tela já ouve a pergunta no nome da lista -->
        <p class="legenda" aria-hidden="true">{{ c }}</p>
      }
      @if (all().length) {
        <div class="lista" role="listbox" [attr.aria-label]="label()">
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
      }
      @if (create(); as c) {
        <!-- o grupo novo: a linha a lápis, que vira o campo do nome -->
        <div class="novo" [class.so]="!all().length">
          @if (naming()) {
            <form class="campo-novo" (submit)="$event.preventDefault(); finish()">
              <input
                #nome
                class="nome-novo"
                type="text"
                autocomplete="off"
                enterkeyhint="done"
                placeholder="Nome do grupo"
                [maxLength]="nameMax"
                [attr.aria-label]="c + ': o nome'"
                [attr.aria-describedby]="takenAs() ? listId + '-ja' : null"
                [value]="draft()"
                (input)="onDraft($any($event.target).value)"
              />
              <button type="submit" class="ok" [disabled]="!typed()" [attr.aria-label]="okLabel()" [title]="okLabel()">
                <lucide-icon [img]="CheckIcon" [size]="18" aria-hidden="true" />
              </button>
            </form>
            <p class="ja" [id]="listId + '-ja'" aria-live="polite">
              @if (takenAs(); as t) {
                Já existe o grupo {{ t }}: o Enter abre ele.
              }
            </p>
          } @else {
            <button type="button" class="opcao criar" [attr.data-k]="NEW" [attr.tabindex]="focusKey() === NEW ? 0 : -1" (click)="startNaming()">
              <lucide-icon class="mais-ico" [img]="PlusIcon" [size]="17" aria-hidden="true" />
              <span class="nome-lapis">{{ c }}</span>
            </button>
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
        [attr.aria-label]="x.say !== undefined ? x.label + (x.say ? ', ' + x.say : '') : x.label + ', ' + x.n + (x.n === 1 ? ' anotação' : ' anotações')"
        [attr.tabindex]="x.key === focusKey() ? 0 : -1"
        [attr.title]="x.label"
        [attr.data-k]="x.key"
        [style.--cat-cor]="colorOf(x)"
        (click)="pick(x.key)"
      >
        @if (x.plain) {
          <span class="nome-lapis">{{ x.label }}</span>
        } @else {
          <app-cat-label class="rotulo" [label]="x.label" [look]="x.look" [glyph]="x.glyph ?? null" [iconSize]="17" [tint]="!!colorOf(x)" />
        }
        @if (!x.quiet) {
          <span class="n" aria-hidden="true">{{ x.n }}</span>
        }
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
  /** A pergunta no alto do remendo, quando a lista escolhe algo em vez de abrir uma aba ("Em qual grupo?"). */
  readonly caption = input<string | null>(null);
  readonly chosen = output<string>();
  /** A linha de criar no fim do remendo ("Novo grupo"); null: sem ela (a visita, os remendos que só escolhem). */
  readonly create = input<string | null>(null);
  /** O grupo que já atende pelo nome escrito (o nome dele), para avisar antes de criar; null: nenhum. */
  readonly taken = input<(name: string) => string | null>(() => null);
  /** O nome escrito na linha de criar (limpo, sem o "#" da frente): quem usa cria o grupo, ou abre o que já existe. */
  readonly created = output<string>();

  protected readonly CheckIcon = ICON.pronto;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly NEW = NEW_KEY;
  protected readonly nameMax = LABEL_MAX;
  /** A linha de criar virou o campo do nome. */
  protected readonly naming = signal(false);
  protected readonly draft = signal('');
  /** O nome escrito, limpo como o de todo grupo novo. */
  protected readonly typed = computed(() => cleanNewCategory(this.draft()));
  protected readonly takenAs = computed(() => (this.typed() ? this.taken()(this.typed()) : null));
  protected readonly okLabel = computed(() => (this.takenAs() ? `Abrir ${this.takenAs()}` : 'Criar o grupo'));
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('nome');
  protected readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('gatilho');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('cardapio');
  private readonly options = viewChildren<ElementRef<HTMLButtonElement>>('opcao');

  protected readonly all = computed(() => [...this.groups(), ...this.autos()]);
  /** As chaves por onde as setas andam: as opções e, no fim, a linha de criar. */
  private readonly stops = computed(() => [...this.all().map((x) => x.key), ...(this.create() ? [NEW_KEY] : [])]);
  /** O nome da aba aberta, se ela é uma das do "Mais" (o leitor de tela ouve na orelha). */
  protected readonly activeLabel = computed(() => this.all().find((x) => x.key === this.active())?.label ?? null);
  /** A opção que recebe o foco ao entrar na lista: a aberta, ou a primeira. */
  protected readonly focusKey = signal<string | null>(null);
  /**
   * A lista estava aberta quando o dedo ou o mouse desceu na orelha: o toque fora do popover já a
   * fechou (no pointerdown), e o clique não pode abrir de novo.
   */
  private wasOpen = false;
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

  /**
   * Num método: no molde, um "wasOpen = open()" devolveria false com a lista fechada, e o Angular
   * cancelaria o aperto, o que fazia a primeira opção mostrar o anel do teclado a quem abriu com o mouse.
   */
  protected onPress(): void {
    this.wasOpen = this.open();
  }

  protected toggle(): void {
    const was = this.wasOpen;
    this.wasOpen = false;
    if (this.open()) this.close(true);
    else if (!was) this.show();
  }

  /**
   * Abre embaixo (ou em cima) da orelha, com o foco na aberta (ou na última, pela seta para cima). Também de
   * fora: o "Treinar" do menu do botão direito de um baralho abre o remendo do Treinar.
   */
  show(focusLast = false): void {
    const stops = this.stops();
    if (!stops.length) return;
    const start = focusLast ? stops.at(-1)! : (this.all().find((x) => x.key === this.active())?.key ?? stops[0]);
    const el = this.panel().nativeElement;
    this.naming.set(false);
    this.focusKey.set(start);
    this.open.set(true);
    if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) el.showPopover();
    this.place();
    this.listen();
    this.focusOn(start);
  }

  /** A linha de criar vira o campo do nome, com o foco nele. */
  protected startNaming(): void {
    this.draft.set('');
    this.naming.set(true);
    afterNextRender(
      () => {
        this.nameField()?.nativeElement.focus({ preventScroll: true });
        // o campo e o aviso cabem embaixo (ou em cima) da orelha
        if (this.open()) this.place();
      },
      { injector: this.injector },
    );
  }

  /** O nome mudou: o aviso do que já existe pode ter aparecido (ou saído), e o remendo se mede de novo. */
  protected onDraft(value: string): void {
    this.draft.set(value);
    afterNextRender(() => this.open() && this.place(), { injector: this.injector });
  }

  /** O campo volta a ser a linha, com o foco nela (o Esc). */
  private stopNaming(): void {
    this.naming.set(false);
    afterNextRender(() => this.focusOn(NEW_KEY), { injector: this.injector });
  }

  /** O nome escrito vai para quem usa (que cria o grupo, ou abre o que já existe), e o remendo fecha. */
  protected finish(): void {
    const name = this.typed();
    if (!name) return;
    this.close(true);
    this.created.emit(name);
  }

  /** A orelha inteira (o host, seja a aba ou o botão de tinta), onde o remendo se apoia. */
  private tabRect(): DOMRect {
    return this.host.nativeElement.getBoundingClientRect();
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
    this.naming.set(false);
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
    this.naming.set(false);
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
    // uma letra no remendo é dele (a busca pelo nome, ou o nome do grupo novo): não chega aos atalhos do site,
    // como o N de "Nova anotação", nem quando nenhum nome começa com ela
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
    if (this.naming()) {
      if (e.key === 'Escape') {
        // escrevendo o nome: o Esc desiste dele, e o remendo fica aberto, na linha de criar
        e.preventDefault();
        this.stopNaming();
        return;
      }
      // no campo, as letras, as setas, o Home e o End são do campo, e o Tab vai do campo ao tique e volta;
      // o Tab que sai do tique fecha, como nas opções
      if (e.key !== 'Tab' || e.target instanceof HTMLInputElement !== e.shiftKey) return;
    }
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
    const keys = this.stops();
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
        const j = (Math.min(at, list.length - 1) + i) % list.length;
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
    const el = key === NEW_KEY ? this.panel().nativeElement.querySelector<HTMLElement>('.criar') : this.options().find((o) => o.nativeElement.dataset['k'] === key)?.nativeElement;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }
}
