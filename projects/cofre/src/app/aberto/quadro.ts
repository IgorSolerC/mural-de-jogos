import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import type { ItemNaLista } from '../../core/itens';
import { CORES_DA_CARTELA, type IdDaCor } from '../../../../../shared/cartela-de-icones';
import { Icone } from '../icone';
import { MonogramaSelo } from './monograma-selo';
import { dominio, nomeDoItem } from './monograma';
import type { Pasta } from './pastas';

export type CampoRapido = 'usuario' | 'senha';
export type Direcao = 'cima' | 'baixo' | 'esquerda' | 'direita';

const DIRECOES: Partial<Record<string, Direcao>> = { ArrowUp: 'cima', ArrowDown: 'baixo', ArrowLeft: 'esquerda', ArrowRight: 'direita' };
/** Quanto tempo depois de uma volta da roda a próxima ainda soma ao mesmo deslize (e não recomeça dele). */
const SEQUENCIA_MS = 260;
/** Uma linha da roda (`deltaMode` 1), em pixels, como o Chrome conta. */
const LINHA_PX = 40;

/**
 * A etiqueta vizinha de `de` na direção pedida, pelo lugar delas na tela (as pastas lado a lado, e a pasta
 * sozinha em grade, andam do mesmo jeito): para cima e para baixo, a mais perto na mesma coluna; para os
 * lados, a coluna mais perto daquele lado e, nela, a etiqueta mais perto da altura de `de`. Null: não há.
 */
export function vizinha<T>(de: DOMRect, direcao: Direcao, outras: readonly { readonly el: T; readonly r: DOMRect }[]): T | null {
  const cx = de.left + de.width / 2;
  const cy = de.top + de.height / 2;
  const medidas = outras.map((o) => ({ el: o.el, dx: o.r.left + o.r.width / 2 - cx, dy: o.r.top + o.r.height / 2 - cy }));
  const maisPerto = (lista: typeof medidas, d: (m: (typeof medidas)[number]) => number) => lista.reduce<(typeof medidas)[number] | null>((a, m) => (!a || d(m) < d(a) ? m : a), null)?.el ?? null;
  if (direcao === 'cima' || direcao === 'baixo') {
    const sinal = direcao === 'baixo' ? 1 : -1;
    return maisPerto(
      medidas.filter((m) => Math.abs(m.dx) < de.width / 2 && m.dy * sinal > 1),
      (m) => Math.abs(m.dy),
    );
  }
  const sinal = direcao === 'direita' ? 1 : -1;
  const doLado = medidas.filter((m) => m.dx * sinal > de.width / 2);
  if (!doLado.length) return null;
  const coluna = Math.min(...doLado.map((m) => Math.abs(m.dx)));
  return maisPerto(
    doLado.filter((m) => Math.abs(m.dx) < coluna + de.width / 2),
    (m) => Math.abs(m.dy),
  );
}

/**
 * O quadro das senhas (seção 17.20), como o Kanban do Murall: cada grupo é uma pasta de manilha em pé, lado a
 * lado com as outras, com a orelha no alto (o ícone, o nome e quantas tem) e as senhas numa etiqueta de
 * uma linha cada; cada pasta rola sozinha, e o quadro rola de lado quando elas não cabem (as beiradas se
 * apagam, e com mouse uma seta de papel em cada beirada traz as que estão para lá). Sem nenhum grupo, uma
 * pasta só, sem orelha, com as etiquetas em grade. User e Senha se copiam pela etiqueta, sem abrir: os
 * botões aparecem com o mouse ou o foco nela (no toque, sempre), e com o foco nela as teclas U e S copiam.
 * As setas do teclado andam pelas etiquetas, pelo lugar delas na tela. Estreito (o celular), uma pasta
 * por vez, e as orelhas de todas numa fileira em cima, que leva até a pasta.
 */
@Component({
  selector: 'cofre-quadro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icone, MonogramaSelo],
  templateUrl: './quadro.html',
  styleUrl: './quadro.scss',
  host: { '(keydown)': 'teclas($event)' },
})
export class QuadroDeSenhas {
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);

  readonly pastas = input.required<readonly Pasta[]>();
  /** Com algum grupo no cofre (sem nenhum, a pasta sozinha não tem orelha). */
  readonly comGrupos = input(false);
  /** O id da senha aberta ao lado. */
  readonly aberto = input<string | null>(null);
  /** O que acabou de ser copiado ("id:campo"). */
  readonly copiado = input<string | null>(null);
  readonly vazadas = input<ReadonlyMap<string, readonly number[]>>(new Map());
  /** As pastas rolam por dentro (o quadro inteiro está na tela); senão, a roda e o dedo rolam a página primeiro. */
  readonly rola = input(true);

  readonly abrir = output<ItemNaLista>();
  readonly copiar = output<{ readonly item: ItemNaLista; readonly campo: CampoRapido }>();

  private readonly rolo = viewChild<ElementRef<HTMLElement>>('rolo');
  /** Quantas pastas não estão inteiras à vista de cada lado (as setas e o apagado das beiradas). */
  protected readonly antes = signal(0);
  protected readonly depois = signal(0);
  /** A pasta mais à esquerda à vista (a da fileira de orelhas, no celular). */
  protected readonly atual = signal(0);
  private readonly indice = viewChild<ElementRef<HTMLElement>>('indice');
  protected readonly sozinha = computed(() => !this.comGrupos());
  /**
   * A etiqueta que o Tab encontra no quadro (as outras ficam fora do Tab, e as setas andam entre elas): a
   * última que teve o foco, ou a primeira. Só os botões de copiar dela entram no Tab.
   */
  private readonly comFoco = signal<string | null>(null);
  protected readonly daVez = computed(() => {
    const ids = this.pastas().flatMap((p) => p.itens.map((i) => i.id));
    const id = this.comFoco();
    return id && ids.includes(id) ? id : (ids[0] ?? null);
  });

  protected readonly nome = nomeDoItem;
  protected readonly dominio = dominio;

  /** O destino do deslize de lado em curso (a roda de mouse anda em degraus, e cada degrau soma ao anterior). */
  private alvoDeLado = 0;
  private ultimaRoda = 0;

  constructor() {
    afterNextRender(() => {
      const rolo = this.rolo()?.nativeElement;
      if (!rolo || typeof ResizeObserver === 'undefined') return;
      // o quadro muda de largura quando a senha abre ao lado, e as pastas, quando a busca tira umas
      const ro = new ResizeObserver(() => this.medir());
      ro.observe(rolo);
      // a busca tira e põe etiquetas e pastas
      const mo = new MutationObserver(() => this.medir());
      mo.observe(rolo, { childList: true, subtree: true });
      // a pasta que rolou por dentro: o apagado das beiradas dela (o scroll não sobe, então é na captura)
      const rolouPasta = (e: Event) => {
        const lista = e.target as HTMLElement;
        if (lista.classList?.contains('lista')) marcarCortes(lista);
      };
      rolo.addEventListener('scroll', rolouPasta, { capture: true, passive: true });
      this.destroy.onDestroy(() => {
        ro.disconnect();
        mo.disconnect();
        rolo.removeEventListener('scroll', rolouPasta, { capture: true });
      });
      this.medir();
    });
  }

  /** Quantas vezes a senha mais vazada de um item apareceu em vazamentos (0: nenhuma, ou não conferida). */
  protected vezesVazada(id: string): number {
    return Math.max(0, ...(this.vazadas().get(id) ?? []));
  }

  protected foiCopiado(i: ItemNaLista, campo: CampoRapido): boolean {
    return this.copiado() === `${i.id}:${campo}`;
  }

  /** O hex de uma cor da cartela (para a borda da orelha), ou null. */
  protected hexDa(cor: IdDaCor | ''): string | null {
    return CORES_DA_CARTELA.find((c) => c.id === cor)?.hex ?? null;
  }

  // --- o que o cofre aberto pede ao quadro

  private linhaDe(id: string): HTMLElement | null {
    return this.rolo()?.nativeElement.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`) ?? null;
  }

  /** Põe o foco na etiqueta de uma senha. */
  focar(id: string): void {
    focarETrazer(this.linhaDe(id));
  }

  /** O foco na primeira etiqueta (a de cima, na primeira pasta). */
  focarPrimeira(): void {
    focarETrazer(this.rolo()?.nativeElement.querySelector<HTMLElement>('.abre') ?? null);
  }

  /** A etiqueta que recebe o foco passa a ser a do Tab. */
  protected focou(e: FocusEvent): void {
    const id = (e.target as HTMLElement).closest<HTMLElement>('.linha')?.querySelector<HTMLElement>('.abre')?.dataset['id'];
    if (id) this.comFoco.set(id);
  }

  /** Traz a etiqueta de uma senha para a vista, depois de o quadro se ajeitar (a senha aberta ao lado o estreita). */
  mostrar(id: string): void {
    afterNextRender(
      () => {
        const linha = this.linhaDe(id)?.closest<HTMLElement>('.linha');
        if (!linha?.offsetParent) return;
        linha.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      },
      { injector: this.injector },
    );
  }

  // --- as beiradas e as setas

  /** Conta as pastas que não estão inteiras à vista de cada lado, acha a primeira à vista e marca as que rolam por dentro. */
  protected medir(): void {
    const rolo = this.rolo()?.nativeElement;
    if (!rolo) return;
    const de = rolo.scrollLeft;
    const ate = de + rolo.clientWidth;
    let antes = 0;
    let depois = 0;
    let atual = -1;
    rolo.querySelectorAll<HTMLElement>(':scope > .pasta').forEach((p, n) => {
      if (p.offsetLeft < de - 1) antes++;
      else if (p.offsetLeft + p.offsetWidth > ate + 1) depois++;
      // a primeira com mais da metade à vista
      if (atual < 0 && p.offsetLeft + p.offsetWidth / 2 >= de) atual = n;
    });
    this.antes.set(antes);
    this.depois.set(depois);
    this.marcarAtual(Math.max(0, atual));
    // primeiro lê todas as pastas, depois marca (sem ler e escrever alternado)
    const listas = [...rolo.querySelectorAll<HTMLElement>('.lista')];
    const medidas = listas.map((l) => [l.scrollTop, l.scrollHeight - l.clientHeight] as const);
    listas.forEach((l, n) => marcarCortes(l, medidas[n]));
  }

  private marcarAtual(n: number): void {
    if (n === this.atual()) return;
    this.atual.set(n);
    // a orelha dela fica à vista na fileira (rolando só a fileira, nunca a página)
    const fileira = this.indice()?.nativeElement;
    const orelha = fileira?.children[n] as HTMLElement | undefined;
    if (!fileira || !orelha) return;
    const esq = orelha.offsetLeft - 12;
    const dir = orelha.offsetLeft + orelha.offsetWidth + 12 - fileira.clientWidth;
    if (fileira.scrollLeft > esq) fileira.scrollTo({ left: esq, behavior: 'instant' });
    else if (fileira.scrollLeft < dir) fileira.scrollTo({ left: dir, behavior: 'instant' });
  }

  /** A orelha da fileira (no celular) leva o quadro até a pasta dela. */
  protected irParaPasta(n: number): void {
    const rolo = this.rolo()?.nativeElement;
    const p = rolo?.querySelectorAll<HTMLElement>(':scope > .pasta')[n];
    if (!rolo || !p) return;
    const folga = parseFloat(getComputedStyle(rolo).scrollPaddingInlineStart) || 0;
    rolo.scrollTo({ left: Math.max(0, p.offsetLeft - folga), behavior: semMovimento() ? 'instant' : 'smooth' });
  }

  /**
   * A seta da beirada traz a página seguinte de pastas: para a direita, a primeira que não estava inteira
   * à vista encosta na beirada da esquerda; para a esquerda, a última encosta na da direita.
   */
  protected virar(lado: 'antes' | 'depois'): void {
    const rolo = this.rolo()?.nativeElement;
    if (!rolo) return;
    const folga = parseFloat(getComputedStyle(rolo).scrollPaddingInlineStart) || 0;
    const pastas = [...rolo.querySelectorAll<HTMLElement>(':scope > .pasta')];
    const de = rolo.scrollLeft;
    const ate = de + rolo.clientWidth;
    let alvo: number | null = null;
    if (lado === 'depois') {
      const p = pastas.find((x) => x.offsetLeft + x.offsetWidth > ate + 1);
      if (p) alvo = p.offsetLeft - folga;
    } else {
      const p = pastas.filter((x) => x.offsetLeft < de - 1).pop();
      if (p) alvo = p.offsetLeft + p.offsetWidth - rolo.clientWidth + folga;
    }
    if (alvo !== null) rolo.scrollTo({ left: Math.max(0, alvo), behavior: semMovimento() ? 'instant' : 'smooth' });
  }

  /**
   * A roda do mouse: dentro de uma pasta que rola, rola a pasta (o navegador cuida); na orelha, rola a pasta
   * dela; no resto do quadro, com pastas para os lados, leva o quadro de lado. Com o quadro ainda saindo da
   * tela, nada disso: a página rola primeiro.
   */
  protected roda(e: WheelEvent): void {
    if (!this.rola() || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const alvo = e.target as HTMLElement;
    const rolo = this.rolo()?.nativeElement;
    if (!rolo) return;
    const lista = alvo.closest<HTMLElement>('.lista');
    if (lista && lista.scrollHeight > lista.clientHeight + 1) return;
    const dy = e.deltaMode === 1 ? e.deltaY * LINHA_PX : e.deltaMode === 2 ? e.deltaY * rolo.clientHeight : e.deltaY;
    const daOrelha = alvo.closest('.orelha')?.parentElement?.querySelector<HTMLElement>('.lista');
    if (daOrelha) {
      if (daOrelha.scrollHeight > daOrelha.clientHeight + 1) {
        e.preventDefault();
        daOrelha.scrollBy({ top: dy, behavior: 'instant' });
      }
      return;
    }
    const max = rolo.scrollWidth - rolo.clientWidth;
    if (max <= 0) return;
    e.preventDefault();
    const agora = performance.now();
    // o degrau da roda de mouse desliza; o trackpad, que manda passinhos, vai junto do dedo
    const desliza = Math.abs(dy) >= 50 && !semMovimento();
    const de = desliza && agora - this.ultimaRoda < SEQUENCIA_MS ? this.alvoDeLado : rolo.scrollLeft;
    this.ultimaRoda = agora;
    this.alvoDeLado = Math.max(0, Math.min(max, de + dy));
    rolo.scrollTo({ left: this.alvoDeLado, behavior: desliza ? 'smooth' : 'instant' });
  }

  // --- o teclado

  /** As setas andam pelas etiquetas; Home e End vão para a primeira e a última da pasta; U e S copiam o user e a senha da focada. */
  protected teclas(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const atual = (e.target as HTMLElement).closest<HTMLElement>('.abre');
    const rolo = this.rolo()?.nativeElement;
    if (!atual || !rolo) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'u' || tecla === 's') {
      const item = this.pastas()
        .flatMap((p) => p.itens)
        .find((i) => i.id === atual.dataset['id']);
      const campo: CampoRapido = tecla === 'u' ? 'usuario' : 'senha';
      if (item) {
        e.preventDefault();
        // sem o que copiar, o cofre diz ("X não tem user")
        this.copiar.emit({ item, campo });
      }
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      const daPasta = [...(atual.closest('.lista')?.querySelectorAll<HTMLElement>('.abre') ?? [])];
      const ir = e.key === 'Home' ? daPasta[0] : daPasta.at(-1);
      if (ir) {
        e.preventDefault();
        focarETrazer(ir);
      }
      return;
    }
    const direcao = DIRECOES[e.key];
    if (!direcao) return;
    e.preventDefault();
    const outras = [...rolo.querySelectorAll<HTMLElement>('.abre')].filter((b) => b !== atual).map((el) => ({ el, r: el.getBoundingClientRect() }));
    focarETrazer(vizinha(atual.getBoundingClientRect(), direcao, outras));
  }
}

/** Marca se a pasta tem mais etiquetas escondidas em cima ou embaixo (a beirada dela se apaga daquele lado). */
function marcarCortes(lista: HTMLElement, [topo, sobra]: readonly [number, number] = [lista.scrollTop, lista.scrollHeight - lista.clientHeight]): void {
  lista.classList.toggle('mais-acima', sobra > 1 && topo > 1);
  lista.classList.toggle('mais-abaixo', sobra > 1 && topo < sobra - 1);
}

/**
 * Põe o foco numa etiqueta e a traz para a vista, fora do apagado das beiradas e da seta de papel (o foco
 * sozinho não rola o que já está um pouco à vista; a etiqueta respeita o scroll-padding do quadro).
 */
function focarETrazer(el: HTMLElement | null): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  (el.closest('.linha') ?? el).scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function semMovimento(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
