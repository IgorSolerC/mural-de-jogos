import { ApplicationRef, DOCUMENT, DestroyRef, Directive, ElementRef, HostAttributeToken, Injectable, OnInit, booleanAttribute, inject, input } from '@angular/core';
import { modKey } from './key-label';

/** O atalho de salvar, como está escrito no teclado de quem usa (como o `COPY_KEY` das marcas). */
export const SAVE_KEY = modKey('S');
/** O mesmo atalho para o leitor de tela: o Ctrl+S vale também no Mac, junto do ⌘S. */
const SAVE_ARIA = 'Control+S Meta+S';

/**
 * A folha que é só uma extensão da de baixo (a tela cheia do editor de texto): o Ctrl+S dentro dela fecha ela e
 * salva a folha onde ela mora, como se a pessoa tivesse saído da tela cheia e tocado no Salvar.
 */
export const SAVE_THROUGH = 'data-salva-a-de-baixo';

/**
 * É o Ctrl+S (ou o ⌘S): sem Alt (o AltGr do Windows é Ctrl+Alt) nem Shift. A tecla do S (`code`) vale só quando
 * ela não escreve uma letra latina (o teclado russo); no Dvorak e no Colemak, ela é o O e o R, e o atalho é deles.
 */
export function isSaveKey(e: KeyboardEvent): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
  const key = (e.key ?? '').toLowerCase();
  return key === 's' || (e.code === 'KeyS' && !/^[a-z]$/.test(key));
}

/** A folha (o `<dialog>` aberto) onde mora o elemento, ou null se ele está na página. */
const layerOf = (el: Element | null): HTMLDialogElement | null => el?.closest<HTMLDialogElement>('dialog[open]') ?? null;

/** O botão não salva agora: desabilitado ou esperando a nuvem. */
const idle = (b: HTMLButtonElement): boolean => b.disabled || b.getAttribute('aria-disabled') === 'true' || b.getAttribute('aria-busy') === 'true';

/**
 * O Salvar de cada tela, por um caminho só (pedido do dono: "Ctrl + S para salvar notas em edição"). Cada botão de
 * salvar se inscreve aqui pela diretiva `appSaveKey`, e um só ouvinte no documento escolhe, a cada Ctrl+S, o da folha
 * que está na frente: a do foco (o modal de cima é o único que recebe o foco; o Chrome foca a própria folha num
 * clique fora dos campos), com as de baixo de fora, então duas folhas abertas nunca salvam juntas. Na página, sem
 * folha, só vale o Salvar do formulário (ou da folha solta, `role="dialog"`) onde está o foco: os Gastos têm o
 * Lançar e a linha aberta ao mesmo tempo. Sem foco nenhum (o Safari e o Firefox do Mac não focam o botão tocado; o
 * clique num canto vazio), vale onde foi o último toque ou foco, se a folha dele continua aberta e por cima.
 *
 * O atalho toca no próprio botão (`click`): as mesmas validações, as mesmas perguntas, o mesmo fechar ou não.
 * Com o foco num campo que só avisa no `change` (o número, a data), o campo perde o foco antes, como no clique de
 * verdade, a tela se atualiza, e ele volta a ter o foco depois, se nada o levou e a folha continua. Desabilitado ou
 * esperando a nuvem (`aria-busy`), já com o que o campo avisou, não faz nada. Com qualquer folha aberta, o Ctrl+S
 * nunca abre o "Salvar página" do navegador.
 */
@Injectable({ providedIn: 'root' })
export class SaveKeys {
  private readonly doc = inject(DOCUMENT);
  private readonly app = inject(ApplicationRef);
  /** Os botões inscritos, na ordem em que chegaram (o último ganha um empate). */
  private readonly buttons = new Set<SaveKey>();
  private listening = false;
  private stop = (): void => undefined;
  /** O último lugar tocado ou focado: a folha da frente quando o foco cai no body. */
  private lastAt: Element | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  add(b: SaveKey): void {
    this.buttons.add(b);
    if (this.listening) return;
    this.listening = true;
    // na captura: um campo que cala o keydown (stopPropagation) não tira o atalho da folha
    const key = (e: KeyboardEvent) => this.onKey(e);
    const seen = (e: Event) => (this.lastAt = e.target instanceof Element ? e.target : null);
    this.doc.addEventListener('keydown', key, true);
    this.doc.addEventListener('pointerdown', seen, true);
    this.doc.addEventListener('focusin', seen, true);
    this.stop = () => {
      this.doc.removeEventListener('keydown', key, true);
      this.doc.removeEventListener('pointerdown', seen, true);
      this.doc.removeEventListener('focusin', seen, true);
    };
  }

  remove(b: SaveKey): void {
    this.buttons.delete(b);
  }

  /** O botão que o Ctrl+S tocaria agora, com as folhas de passagem que fecham antes; null se não há nenhum. */
  target(from: Element | null): { button: HTMLButtonElement; through: HTMLDialogElement[] } | null {
    const real = (el: Element | null) => (el && el.isConnected && el !== this.doc.body && el !== this.doc.documentElement ? el : null);
    // sem foco: o último toque ou foco, se a folha dele é a da frente (uma folha aberta depois tira o foco para ela)
    const at = real(from) ?? real(this.lastAt);
    let layer = layerOf(at);
    const through: HTMLDialogElement[] = [];
    while (layer?.hasAttribute(SAVE_THROUGH)) {
      through.push(layer);
      layer = layerOf(layer.parentElement);
    }
    // o foco na página com uma folha por cima (não deveria acontecer): nada
    if (!layer && [...this.doc.querySelectorAll('dialog:modal')].some((m) => !through.includes(m as HTMLDialogElement))) return null;
    const here = [...this.buttons]
      .filter((b) => b.appSaveKey())
      .map((b) => b.el)
      // o da folha fechada (a de cima, guardada no molde da de baixo) não é da de baixo
      .filter((b) => b.isConnected && b.closest('dialog') === layer && b.getClientRects().length > 0);
    const scoped = here.filter((b) => !!at && !!scopeOf(b)?.contains(at));
    // na folha, o do formulário do foco, senão o último; na página, só o do formulário do foco
    const button = scoped.at(-1) ?? (layer ? here.at(-1) : undefined);
    return button ? { button, through } : null;
  }

  private onKey(e: KeyboardEvent): void {
    if (!isSaveKey(e) || e.isComposing || e.defaultPrevented) return;
    const found = this.target(e.target instanceof Element ? e.target : this.doc.activeElement);
    if (!found && !this.doc.querySelector('dialog:modal')) return;
    e.preventDefault();
    // segurar o S não salva de novo a cada repetição
    if (!found || e.repeat) return;
    const { button, through } = found;
    const last = through.at(-1);
    if (!last) return this.press(button);
    // o Salvar apagado não tira ninguém da tela cheia
    if (idle(button)) return;
    // a tela cheia fecha antes; o editor devolve o foco à folha pequena depois do close (numa tarefa, às vezes
    // noutra): o toque vem depois disso, para a validação levar ao que falta, como no botão
    last.addEventListener('close', () => setTimeout(() => this.press(button)), { once: true });
    for (const d of through) d.close();
  }

  private press(button: HTMLButtonElement): void {
    if (!button.isConnected) return;
    const field = this.doc.activeElement;
    const commits = field instanceof HTMLInputElement || field instanceof HTMLSelectElement;
    if (commits) {
      field.blur();
      // o que o campo avisou chega ao botão (o "Aplicar" que acende, o Salvar que apaga) antes de olhar para ele
      this.app.tick();
    }
    if (!idle(button)) button.click();
    // o campo volta a ter o foco se a folha continua e nada o levou (a validação leva para o que falta)
    const now = this.doc.activeElement;
    if (commits && field.isConnected && (!now || now === this.doc.body || now === layerOf(field)) && layerOf(field) === layerOf(button)) field.focus({ preventScroll: true });
  }
}

/** Onde o botão salva: o formulário dele, ou a folha (o `<dialog>` ou o `role="dialog"`) onde ele mora. */
function scopeOf(b: HTMLButtonElement): Element | null {
  return b.form ?? b.closest('dialog, [role="dialog"]');
}

/** O texto que se vê no botão, sem o que é só desenho (o ícone, a tecla ↵ do Lançar). */
function shownText(el: Element): string {
  let s = '';
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) s += n.textContent ?? '';
    else if (n instanceof Element && n.getAttribute('aria-hidden') !== 'true' && !n.classList.contains('sr-only')) s += shownText(n);
  }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * O botão Salvar de uma tela, que passa a valer também pelo Ctrl+S (ver `SaveKeys`). `[appSaveKey]="false"` tira o
 * atalho (o botão da folha do widget só salva quando mexe num que já existe). A dica do botão ganha o atalho, no
 * padrão das outras ("Negrito (Ctrl+B)"): a que quem usa escreveu (fixa ou ligada, `[title]`) fica como está, e ela
 * mesma diz o atalho; sem dica, ela é o próprio nome do botão, lido na hora do mouse em cima (o nome muda:
 * "Salvar" e "Pregar").
 */
@Directive({
  selector: 'button[appSaveKey]',
  host: { '[attr.aria-keyshortcuts]': 'appSaveKey() ? keys : fixedKeys' },
})
export class SaveKey implements OnInit {
  readonly el = inject<ElementRef<HTMLButtonElement>>(ElementRef).nativeElement;
  readonly appSaveKey = input(true, { transform: booleanAttribute });
  private readonly saves = inject(SaveKeys);
  /** Os atalhos escritos no molde, se houver: os dele continuam, com o Ctrl+S junto. */
  protected readonly fixedKeys = inject(new HostAttributeToken('aria-keyshortcuts'), { optional: true });
  protected readonly keys = this.fixedKeys ? `${this.fixedKeys} ${SAVE_ARIA}` : SAVE_ARIA;
  /** A última dica que esta diretiva escreveu (outra, no botão, é de quem usa). */
  private mine: string | null = null;

  constructor() {
    // fora do Angular: passar o mouse não pede um desenho da tela inteira, só põe a dica
    const hint = () => this.hint();
    this.el.addEventListener('pointerenter', hint);
    this.el.addEventListener('focus', hint);
    inject(DestroyRef).onDestroy(() => {
      this.saves.remove(this);
      this.el.removeEventListener('pointerenter', hint);
      this.el.removeEventListener('focus', hint);
    });
  }

  ngOnInit(): void {
    this.saves.add(this);
  }

  private hint(): void {
    const now = this.el.getAttribute('title');
    if (now && now !== this.mine) return;
    // apagado ("Nada mudou ainda", "Salvando…"), o atalho não faz nada: a dica não o promete
    const name = this.appSaveKey() && !idle(this.el) ? shownText(this.el) : '';
    this.mine = name ? `${name} (${SAVE_KEY})` : null;
    if (this.mine) this.el.title = this.mine;
    else this.el.removeAttribute('title');
  }
}
