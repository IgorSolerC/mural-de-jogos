import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, input, output, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { fold } from '../core/text';
import { ICON, IconModule } from './icons';

/** Quantos menus já nasceram (o id de cada um). */
let menus = 0;
/** O menu aberto agora (abrir outro fecha este: dois remendos nunca ficam juntos na tela). */
let openMenu: ContextMenu | null = null;

/** Quanto o dedo segura parado até o menu abrir (o mesmo do toque longo do celular). */
export const HOLD_MS = 500;
/** Quanto o dedo pode andar segurando, antes de virar rolagem. */
const HOLD_SLOP = 10;
/** A classe do remendo: quem precisa saber se um clique foi nele (as marcadas, o dedo que sobe). */
export const MENU_CLASS = 'menu-contexto';

/** Uma opção do menu. */
export interface MenuItem {
  id: string;
  label: string;
  icon: LucideIconData;
  run: () => void;
  /** Apagar, sair: por último, depois da costura, na tinta vermelha. */
  danger?: boolean;
  /** Abre uma folha (Compartilhar, Editar, Ajustes). */
  dialog?: boolean;
  /** O atalho que faz o mesmo, impresso miúdo na ponta (como a pessoa lê: "Ctrl+C"). */
  keys?: string;
  /** O mesmo atalho para o leitor de tela ("Control+C"). */
  ariaKeys?: string;
  /** Uma frase a mais, para quem para o mouse em cima. */
  hint?: string;
  /** Um número impresso miúdo na ponta, como a contagem do Mais ("Estudar · 5"), com o que ele diz por extenso. */
  count?: { n: number; say: string };
  /**
   * Uma cor (o valor do CSS): a opção vira uma amostra dessa cor, e a leva em que todas são amostras vira uma
   * paleta, em grade, com o nome no toque do mouse e no leitor de tela (o "Cor" do Quadro livre).
   */
  swatch?: string;
  /** A escolhida agora (a amostra ganha o tique). */
  on?: boolean;
}

/** As levas de opções, separadas pela costura (as vazias não aparecem). */
export type MenuSections = readonly (readonly MenuItem[])[];

/** Quem abriu: o mouse (no ponteiro), o teclado (o foco vai para a primeira opção) ou o dedo (em cima dele). */
export type MenuBy = 'mouse' | 'teclado' | 'toque';

/** Onde o menu abre e para onde o foco volta. */
export interface MenuAt {
  /** O que se clicou (o id da anotação, do baralho, da coluna): o mesmo de novo não reabre. */
  key: string;
  /** O ponto da tela: o ponteiro, o dedo, ou o canto do que se clicou (pelo teclado). */
  x: number;
  y: number;
  /** O botão do que se clicou: o foco volta para ele ao fechar. */
  back: HTMLElement | null;
  by?: MenuBy;
}

/**
 * O menu do botão direito do site: o remendo de feltro costurado do "Mais" das abas (ui/tab-more.ts),
 * que nasceu do "Citar" da leitura e do painel de emojis das reações, com o nome do que se clicou no alto
 * e as ações em levas separadas pela costura; o apagar vai sozinho no fim, em vermelho. Quem usa diz só
 * o nome e as opções (que valem para aquilo e para quem vê); o `ContextMenuTrigger` da página abre.
 *
 * Fica na camada de cima da página (o popover do navegador: nada o corta), ao lado do ponteiro, sem sair
 * da tela (aberto pelo dedo, em cima dele); o Esc, o toque fora, rolar a página (tirando do lugar o que se
 * clicou) ou mudar o tamanho dela fecham. É um menu de verdade: as setas andam (parando nas pontas, como
 * no Mais), Home e End vão às pontas, uma letra pula para a próxima opção com ela, Enter ou espaço
 * escolhe, Tab e Esc fecham; o foco volta para o que se clicou.
 */
@Component({
  selector: 'app-context-menu',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- fica montado (escondido pelo popover): abrir é só mostrar, medir e pôr o foco. O popover é
         "manual": o "auto" fecharia no dedo que sobe do toque longo que acabou de abri-lo -->
    <div
      #cardapio
      [id]="menuId"
      class="menu-contexto"
      popover="manual"
      role="menu"
      tabindex="-1"
      [attr.aria-labelledby]="menuId + '-nome'"
      (toggle)="onToggle($event)"
      (keydown)="onKey($event)"
      (contextmenu)="$event.preventDefault()"
    >
      @if (at()) {
        <p class="legenda" [id]="menuId + '-nome'"><span class="sr-only">Ações de </span>{{ caption() }}</p>
        @for (leva of levas(); track $index) {
          @let paleta = isPalette(leva);
          <div role="group" class="leva" [class.costurada]="!$first" [class.paleta]="paleta">
            @for (x of leva; track x.id) {
              @if (paleta) {
                <!-- uma amostra: o retalho da cor, com o tique na escolhida; o nome no title e no leitor de tela -->
                <button
                  #opcao
                  type="button"
                  role="menuitemradio"
                  class="escolha amostra"
                  [class.on]="x.on"
                  [attr.data-k]="x.id"
                  [attr.aria-checked]="x.on ? 'true' : 'false'"
                  [attr.aria-label]="x.label"
                  [attr.title]="x.hint ?? x.label"
                  [style.--amostra]="x.swatch"
                  tabindex="-1"
                  (click)="choose(x)"
                >
                  @if (x.on) {
                    <lucide-icon class="tique" [img]="CheckIcon" [size]="16" aria-hidden="true" />
                  }
                </button>
              } @else {
              <button
                #opcao
                type="button"
                role="menuitem"
                class="escolha"
                [class.perigo]="x.danger"
                [attr.data-k]="x.id"
                [attr.aria-haspopup]="x.dialog ? 'dialog' : null"
                [attr.aria-keyshortcuts]="x.ariaKeys ?? null"
                [attr.title]="x.hint ?? null"
                tabindex="-1"
                (click)="choose(x)"
              >
                <lucide-icon class="ico" [img]="x.icon" [size]="18" aria-hidden="true" />
                <span class="nome">{{ x.label }}</span>
                @if (x.on) {
                  <lucide-icon class="atalho marcada" [img]="CheckIcon" [size]="16" aria-hidden="true" /><span class="sr-only">(o de agora)</span>
                } @else if (x.keys) {
                  <kbd class="atalho" aria-hidden="true">{{ x.keys }}</kbd>
                } @else if (x.count; as c) {
                  <span class="atalho"><span class="sr-only">, </span>{{ c.n }}<span class="sr-only"> {{ c.say }}</span></span>
                }
              </button>
              }
            }
          </div>
        }
      }
    </div>
  `,
  styleUrl: './context-menu.scss',
})
export class ContextMenu {
  /** O nome do que se clicou, impresso miúdo no alto. */
  readonly caption = input('');
  /** As opções, em levas. */
  readonly sections = input<MenuSections>([]);
  /** Fechou (escolhendo ou não): quem usa esquece o que estava aberto. */
  readonly closed = output<void>();

  /** O que se clicou (e onde o menu abriu). */
  protected readonly at = signal<MenuAt | null>(null);
  protected readonly levas = computed(() => this.sections().filter((l) => l.length));
  protected readonly CheckIcon = ICON.pronto;
  protected readonly menuId = `menu-contexto-${++menus}`;
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('cardapio');
  private readonly options = viewChildren<ElementRef<HTMLButtonElement>>('opcao');

  /** Onde o que se clicou estava quando o menu abriu (a rolagem que não o tira do lugar não fecha). */
  private anchor: { x: number; y: number } | null = null;
  /** O tamanho da janela quando o menu abriu (o aviso de "mudou o tamanho" sem mudar não fecha). */
  private viewport = { w: 0, h: 0 };
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Rolou a página ou mudou o tamanho: o menu fecha (o que se clicou saiu do lugar onde ele abriu). A
   * rolagem que não mexe nele (a de outra coluna, a que um passo anterior ainda termina) não conta.
   */
  private readonly away = (e: Event) => {
    if (e.type === 'resize') {
      // o tamanho de verdade, um tico depois (a janela que pisca de tamanho e volta não fecha)
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        if (innerWidth !== this.viewport.w || innerHeight !== this.viewport.h) this.close(false);
      }, 120);
      return;
    }
    if (e.type === 'scroll') {
      if (e.target instanceof Node && this.panel().nativeElement.contains(e.target)) return;
      const back = this.at()?.back;
      const was = this.anchor;
      if (back?.isConnected && was) {
        const r = back.getBoundingClientRect();
        if (Math.abs(r.left - was.x) < 2 && Math.abs(r.top - was.y) < 2) return;
      }
    }
    this.close(false);
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.unlisten();
      if (openMenu === this) openMenu = null;
    });
    // aberto: mede e põe no lugar, depois de desenhar as opções
    afterRenderEffect(() => {
      const a = this.at();
      if (!a) return;
      untracked(() => this.place(a));
    });
  }

  /** A leva em que todas as opções são cores: a paleta. */
  protected isPalette(leva: readonly MenuItem[]): boolean {
    return leva.every((x) => !!x.swatch);
  }

  /** O menu está aberto para isto. */
  isOpenFor(key: string): boolean {
    return this.at()?.key === key;
  }

  /** Abre no ponto dado (outro aberto, daqui ou de outro menu, fecha antes). */
  show(at: MenuAt): void {
    const el = this.panel().nativeElement;
    if (typeof el.showPopover !== 'function') return;
    if (openMenu && openMenu !== this) openMenu.close(false);
    openMenu = this;
    this.at.set(at);
    const r = at.back?.getBoundingClientRect();
    this.anchor = r ? { x: r.left, y: r.top } : null;
    this.viewport = { w: innerWidth, h: innerHeight };
    if (!el.matches(':popover-open')) el.showPopover();
    this.listen();
  }

  /** Fecha; `focus`: o foco volta para o que se clicou (o Esc, o Tab, a escolha). */
  close(focus: boolean): void {
    const a = this.at();
    if (!a) return;
    const el = this.panel().nativeElement;
    const inside = el.contains(document.activeElement);
    this.forget();
    if (typeof el.hidePopover === 'function' && el.matches(':popover-open')) el.hidePopover();
    if (focus || inside) this.focusBack(a.back);
  }

  private forget(): void {
    this.at.set(null);
    this.unlisten();
    if (openMenu === this) openMenu = null;
    this.closed.emit();
  }

  /**
   * O ponto vira o canto de cima e à esquerda do menu; sem lugar à direita ou embaixo, ele vira para o
   * outro lado do ponto, e nunca sai da tela (o comprido demais rola por dentro).
   */
  private place(a: MenuAt): void {
    const el = this.panel().nativeElement;
    if (!el.matches(':popover-open')) return;
    const margin = 8;
    el.style.maxHeight = `${Math.max(120, innerHeight - margin * 2)}px`;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // do lado do ponto que tem lugar (`gap` longe dele); sem lugar nem de um lado nem do outro, encostado
    // na beirada. O dedo: em cima dele primeiro (o polegar cobriria o menu embaixo), centrado nele
    const side = (at: number, size: number, room: number, gap: number, before = false): number => {
      const after = at + gap + size <= room - margin ? at + gap : null;
      const ahead = at - gap - size >= margin ? at - gap - size : null;
      return (before ? (ahead ?? after) : (after ?? ahead)) ?? Math.max(margin, room - margin - size);
    };
    const touch = a.by === 'toque';
    const left = touch ? Math.max(margin, Math.min(a.x - w / 2, innerWidth - margin - w)) : side(a.x, w, innerWidth, 2);
    const top = touch ? side(a.y, h, innerHeight, 24, true) : side(a.y, h, innerHeight, 2);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    // o feltro brota do canto (no dedo, da beirada) que está do lado do ponto
    const up = top < a.y;
    el.style.transformOrigin = `${touch ? 'center' : left < a.x ? 'right' : 'left'} ${up ? 'bottom' : 'top'}`;
    el.classList.toggle('em-cima', up);
    if (a.by === 'teclado') this.focusAt(0);
    else el.focus({ preventScroll: true });
  }

  /** O aperto fora do menu fecha (o foco fica onde a pessoa apertou). */
  private readonly outside = (e: PointerEvent) => {
    if (!(e.target instanceof Node) || !this.panel().nativeElement.contains(e.target)) this.close(false);
  };

  private listen(): void {
    document.addEventListener('pointerdown', this.outside, true);
    addEventListener('resize', this.away);
    addEventListener('scroll', this.away, { capture: true, passive: true });
  }

  private unlisten(): void {
    clearTimeout(this.resizeTimer);
    document.removeEventListener('pointerdown', this.outside, true);
    removeEventListener('resize', this.away);
    removeEventListener('scroll', this.away, { capture: true });
  }

  /**
   * O popover fechou por fora daqui (a página que o tirou da tela): o menu some, e o foco que estava
   * nele (ou que caiu no nada com ele) volta para o que se clicou.
   */
  protected onToggle(e: Event): void {
    if ((e as ToggleEvent).newState !== 'closed') return;
    const a = this.at();
    if (!a) return;
    this.forget();
    const now = document.activeElement;
    if (!now || now === document.body || this.panel().nativeElement.contains(now)) this.focusBack(a.back);
  }

  /** Escolheu: o menu fecha com o foco de volta no que se clicou, e a ação roda (a folha que abrir leva o foco). */
  protected choose(x: MenuItem): void {
    this.close(true);
    x.run();
  }

  protected onKey(e: KeyboardEvent): void {
    // o teclado aberto o menu é dele: os atalhos da página (as letras do Calendário, o Esc das marcadas e da
    // carta crescida) não andam por baixo
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Tab') {
      // fecha aqui, com o foco de volta no que se clicou (o fechar do popover deixaria o foco no nada)
      e.preventDefault();
      this.close(true);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const list = this.options().map((o) => o.nativeElement);
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    // como no Mais das abas: as setas param nas pontas
    if (e.key === 'ArrowDown') next = at < 0 ? 0 : Math.min(list.length - 1, at + 1);
    else if (e.key === 'ArrowUp') next = at < 0 ? list.length - 1 : Math.max(0, at - 1);
    // na paleta, as setas dos lados andam entre as amostras
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && list[at]?.classList.contains('amostra')) next = Math.max(0, Math.min(list.length - 1, at + (e.key === 'ArrowRight' ? 1 : -1)));
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // a letra: a próxima opção que começa com ela (sem ligar para acento nem caixa)
      const k = fold(e.key);
      for (let i = 1; i <= list.length; i++) {
        const j = (Math.max(at, -1) + i + list.length) % list.length;
        if (fold((list[j].getAttribute('aria-label') ?? list[j].textContent)?.trim() ?? '').startsWith(k)) {
          next = j;
          break;
        }
      }
    }
    if (next === null) return;
    e.preventDefault();
    this.focusAt(next);
  }

  private focusAt(i: number): void {
    const el = this.options()[i]?.nativeElement;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }

  private focusBack(back: HTMLElement | null): void {
    if (back?.isConnected) back.focus({ preventScroll: true });
  }
}

/** O navegador sabe pôr o menu na camada de cima (sem isso, fica o menu do navegador). */
export const popoverSupported = (): boolean => typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

/** Onde o menu abre: cada página diz quais são as coisas dela que têm menu. */
export interface ContextMenuTriggerConfig {
  /** A página: só o que está dentro dela abre o menu. */
  host: HTMLElement;
  /** O que tem menu (a caixa de cada um). */
  targets: string;
  /** O que se clicou, pela caixa (null: essa não tem menu agora). */
  keyOf: (box: HTMLElement) => string | null;
  /** O que fica de fora, mesmo dentro de uma caixa (outro menu cuida dele, ou o do navegador). */
  ignore?: string;
  /** Se o menu abre agora. */
  on?: () => boolean;
  /**
   * O dedo segurado abre o menu. Falso onde segurar já é arrastar (o Kanban): lá a página abre o menu
   * quando o dedo segura e solta sem mexer (`openAt`). Uma função decide caixa a caixa, na hora (a parede
   * das anotações, onde segurar arrasta só nas abas de grupo do seu Murall).
   */
  hold: boolean | ((box: HTMLElement) => boolean);
  /** Abre o menu do que se clicou, no ponto. */
  open: (key: string, box: HTMLElement, x: number, y: number, by: MenuBy) => void;
  /** O menu já está aberto para isto (o contextmenu que vem atrás da tecla de menu não reabre). */
  isOpenFor: (key: string) => boolean;
}

/**
 * Quem abre um menu do botão direito (ver ContextMenu): o botão direito do mouse, o dedo segurado (onde
 * segurar não é arrastar), Shift+F10 ou a tecla de menu com o foco no que tem menu. O menu do navegador
 * continua num link de dentro (abrir numa aba, copiar o endereço), num trecho selecionado (copiar o
 * trecho) e no navegador sem popover. Criado no construtor da página (precisa do contexto de injeção);
 * numa página com mais de um, o primeiro que atende o botão direito fica com ele.
 */
export class ContextMenuTrigger {
  /** O dedo segurando (o relógio do toque longo), com a caixa que ele aperta. */
  private hold: { box: HTMLElement; key: string; x: number; y: number; pointer: number; timer: ReturnType<typeof setTimeout> } | null = null;
  /** O toque longo acabou de abrir o menu: o clique de quando o dedo sobe não vale. */
  private swallowUntil = 0;
  /** O último aperto na página foi de dedo (e o clique dele ainda não veio). */
  private touching = false;
  /** Enquanto o dedo segura: andou (é rolar), subiu ou a página rolou, o relógio para. */
  private readonly move = (e: PointerEvent) => this.onMove(e);
  private readonly stop = () => this.stopHold();

  constructor(private readonly cfg: ContextMenuTriggerConfig) {
    if (typeof document === 'undefined' || !popoverSupported()) return;
    const host = cfg.host;
    const menu = (e: MouseEvent) => this.onMenu(e);
    const key = (e: KeyboardEvent) => this.onKey(e);
    const down = (e: PointerEvent) => this.onDown(e);
    const click = (e: MouseEvent) => this.onClick(e);
    host.addEventListener('contextmenu', menu);
    host.addEventListener('keydown', key);
    host.addEventListener('pointerdown', down);
    host.addEventListener('click', click, true);
    inject(DestroyRef).onDestroy(() => {
      this.stopHold();
      host.removeEventListener('contextmenu', menu);
      host.removeEventListener('keydown', key);
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('click', click, true);
    });
  }

  /** A caixa debaixo do alvo, com o que ela é, se o menu vale ali. */
  private boxAt(target: EventTarget | null): { box: HTMLElement; key: string } | null {
    if (this.cfg.on && !this.cfg.on()) return null;
    const t = target instanceof Element ? target : null;
    if (!t || (this.cfg.ignore && t.closest(this.cfg.ignore))) return null;
    const box = t.closest<HTMLElement>(this.cfg.targets);
    if (!box || !this.cfg.host.contains(box)) return null;
    const key = this.cfg.keyOf(box);
    return key ? { box, key } : null;
  }

  /** Um link de dentro da caixa (não a própria caixa, quando ela é o link) fica com o do navegador. */
  private innerLink(t: Element, box: HTMLElement): boolean {
    const a = t.closest('a[href]');
    return !!a && a !== box && box.contains(a);
  }

  /**
   * Abre o menu de `key` no ponto, aberto pelo dedo (o Kanban, quando o dedo segura e solta sem
   * arrastar). `box`: a caixa que o dedo apertou (ordenando por tag, a mesma anotação aparece duas vezes).
   */
  openAt(key: string, x: number, y: number, box?: HTMLElement): void {
    const at = box?.isConnected ? box : Array.from(this.cfg.host.querySelectorAll<HTMLElement>(this.cfg.targets)).find((b) => this.cfg.keyOf(b) === key);
    if (!at || (this.cfg.on && !this.cfg.on()) || this.cfg.keyOf(at) !== key) return;
    this.open(at, key, x, y, 'toque');
  }

  private open(box: HTMLElement, key: string, x: number, y: number, by: MenuBy): void {
    // o toque longo pode ter começado a selecionar o texto
    const sel = getSelection();
    if (sel && !sel.isCollapsed && box.contains(sel.anchorNode)) sel.removeAllRanges();
    this.cfg.open(key, box, x, y, by);
  }

  private onMenu(e: MouseEvent): void {
    // outro menu da página já atendeu (a anotação dentro da coluna do Kanban)
    if (e.defaultPrevented) return;
    const hit = this.boxAt(e.target);
    if (!hit) return;
    const t = e.target as Element;
    // um link de dentro e um trecho selecionado ficam com o menu do navegador (segurando o dedo, a palavra
    // que o próprio toque longo selecionou não conta: o menu abre e tira a seleção)
    const sel = getSelection();
    const held = this.touching && this.holds(hit.box);
    if (this.innerLink(t, hit.box) || (!held && sel && !sel.isCollapsed && hit.box.contains(sel.anchorNode))) return;
    e.preventDefault();
    // aberto pelo teclado agora mesmo (o navegador ainda manda o contextmenu da tecla), ou pelo dedo
    if (this.cfg.isOpenFor(hit.key)) return;
    // segurar o dedo: o Android manda o contextmenu; onde segurar é arrastar (o Kanban), a página decide
    if (this.touching) {
      if (this.holds(hit.box)) this.fireHold();
      return;
    }
    // sem posição (o contextmenu da tecla de menu, em alguns navegadores): o canto da caixa
    if (!e.clientX && !e.clientY) {
      const r = hit.box.getBoundingClientRect();
      this.open(hit.box, hit.key, r.left + 16, r.top + 16, 'teclado');
      return;
    }
    this.open(hit.box, hit.key, e.clientX, e.clientY, 'mouse');
  }

  private onKey(e: KeyboardEvent): void {
    if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
    this.touching = false;
    const hit = this.boxAt(e.target);
    if (!hit) return;
    // num campo (o texto de uma tarefa), a tecla é do campo
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    const r = hit.box.getBoundingClientRect();
    this.open(hit.box, hit.key, r.left + 16, r.top + 16, 'teclado');
  }

  private onDown(e: PointerEvent): void {
    this.stopHold();
    // um aperto novo (num botão do menu, por exemplo) já não é o dedo que subiu do toque longo
    this.swallowUntil = 0;
    this.touching = e.pointerType === 'touch';
    if (!this.touching || !this.cfg.hold || !e.isPrimary) return;
    const hit = this.boxAt(e.target);
    const t = e.target as Element;
    if (!hit || !this.holds(hit.box) || this.innerLink(t, hit.box) || t.closest('input, textarea, select')) return;
    this.hold = { box: hit.box, key: hit.key, x: e.clientX, y: e.clientY, pointer: e.pointerId, timer: setTimeout(() => this.fireHold(), HOLD_MS) };
    addEventListener('pointermove', this.move, { passive: true });
    addEventListener('pointerup', this.stop);
    addEventListener('pointercancel', this.stop);
    addEventListener('scroll', this.stop, { capture: true, passive: true });
  }

  private onMove(e: PointerEvent): void {
    const h = this.hold;
    // o dedo andou: é rolar a tela, não segurar
    if (h && e.pointerId === h.pointer && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP) this.stopHold();
  }

  private fireHold(): void {
    const h = this.hold;
    this.stopHold();
    if (!h) return;
    this.swallowUntil = performance.now() + 900;
    this.openAt(h.key, h.x, h.y, h.box);
  }

  private stopHold(): void {
    if (!this.hold) return;
    clearTimeout(this.hold.timer);
    this.hold = null;
    removeEventListener('pointermove', this.move);
    removeEventListener('pointerup', this.stop);
    removeEventListener('pointercancel', this.stop);
    removeEventListener('scroll', this.stop, { capture: true });
  }

  /** O dedo segurado nesta caixa abre o menu (ver `hold`). */
  private holds(box: HTMLElement): boolean {
    const h = this.cfg.hold;
    return typeof h === 'function' ? h(box) : h;
  }

  /** O dedo subiu depois do toque longo: esse clique não abre nada (o toque no menu, sim). */
  private onClick(e: MouseEvent): void {
    this.touching = false;
    if (performance.now() > this.swallowUntil || (e.target instanceof Element && e.target.closest(`.${MENU_CLASS}`))) return;
    this.swallowUntil = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}
