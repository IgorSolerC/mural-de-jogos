import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, input, output, signal, viewChild } from '@angular/core';
import { FB_FRAME_TITLE_MAX, FB_LABEL_MAX, FbNode, FbSide, FB_SIDES } from '../../core/free-board';
import { anchor, boundsOf, intersects, nearestSide } from '../../core/free-board-geometry';
import { ICON, IconModule } from '../icons';
import { BoardEditor, Writing } from './board-editor';
import { ALL_HANDLES } from './edit-ops';

/** A etiqueta da seleção na tela: o vão até a seleção (o `bottom` de `.acoes`), o topo do quadro e a folga dos lados. */
const TAG_GAP = 38;
const TAG_TOP = 64;
const TAG_SIDE = 8;

/** O que a etiqueta da seleção pede (a peça do quadro faz). */
export type SelectionAction = 'escrever' | 'cor' | 'jeito' | 'letra' | 'rotulo' | 'cadeado' | 'frente' | 'tras' | 'duplicar' | 'apagar';

/**
 * A camada da edição do Quadro livre (PLANO-QUADRO-LIVRE.md, 4.4 e seção 11): no mundo, por cima das peças, o
 * anel amarelo do que está selecionado, as alças de tamanho, as bolinhas de giz de onde saem as setas, a caixa
 * de seleção tracejada, a moldura sendo desenhada, a seta sendo puxada, o campo de escrever no lugar (o título da
 * moldura, o rótulo da seta; o texto do card tem a folha dele, text-sheet.ts) e a etiqueta de tinta com o que fazer
 * com a seleção.
 *
 * Os pedaços que se puxam (as alças, as bolinhas) só têm a marca (`data-alca`, `data-bolinha`): quem pega o
 * ponteiro é a peça do quadro. O tamanho deles é de tela: a camada tem a `--iz` (1 / zoom), posta a cada quadro
 * de animação só nela (ninguém mais herda).
 */
@Component({
  selector: 'app-free-board-edit-overlay',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './edit-overlay.scss',
  template: `
    @for (n of selectedNodes(); track n.i) {
      <div class="anel" [class.moldura]="n.t === 'm'" [style.left.px]="n.x" [style.top.px]="n.y" [style.width.px]="n.w" [style.height.px]="n.h"></div>
    }
    @if (edgeD(); as d) {
      <svg class="seta-escolhida" width="1" height="1" aria-hidden="true"><path [attr.d]="d" /></svg>
    }
    @if (single(); as s) {
      @for (h of s.handles; track h) {
        <span class="alca" [attr.data-alca]="s.node.i + ':' + h" [attr.data-pos]="h" [style.left.px]="handleX(s.node, h)" [style.top.px]="handleY(s.node, h)"></span>
      }
    }
    @if (endsOf(); as e) {
      <!-- as pontas da seta escolhida: puxar uma leva a ponta para outro lado, ou para outra peça -->
      <span class="ponta" [attr.data-ponta]="e.id + ':a'" [style.left.px]="e.from.x" [style.top.px]="e.from.y" title="Puxe para mudar de onde a seta sai"></span>
      <span class="ponta" [attr.data-ponta]="e.id + ':b'" [style.left.px]="e.to.x" [style.top.px]="e.to.y" title="Puxe para mudar onde a seta chega"></span>
    }
    @if (dotsOf(); as d) {
      @for (p of d.points; track p.side) {
        <span class="bolinha" [attr.data-bolinha]="d.id + ':' + p.side" [attr.data-lado]="p.side" [style.left.px]="p.x" [style.top.px]="p.y" title="Puxe para ligar com uma seta"></span>
      }
    }
    @if (editor().box(); as b) {
      <div class="caixa" [style.left.px]="b.x" [style.top.px]="b.y" [style.width.px]="b.w" [style.height.px]="b.h"></div>
    }
    @if (editor().drawing(); as r) {
      <div class="desenhando" [style.left.px]="r.x" [style.top.px]="r.y" [style.width.px]="r.w" [style.height.px]="r.h"></div>
    }
    @if (linkTargetNode(); as t) {
      <!-- a peça onde a seta vai chegar, se soltar agora: o anel tracejado em volta dela -->
      <div class="alvo" [style.left.px]="t.x" [style.top.px]="t.y" [style.width.px]="t.w" [style.height.px]="t.h"></div>
    }
    @if (linkLine(); as l) {
      <svg class="puxando" width="1" height="1" aria-hidden="true"><path [attr.d]="l" /></svg>
    }
    @if (writingBox(); as w) {
      <!-- o título da moldura e o rótulo da seta, escritos no lugar (o texto do card tem a folha dele, ao lado do quadro) -->
      <input
        #campo
        class="escrever"
        [class.titulo]="w.kind === 'moldura'"
        [class.rotulo]="w.kind === 'seta'"
        [attr.data-escrevendo]="w.id"
        [attr.aria-label]="w.kind === 'moldura' ? 'O título da moldura' : 'O rótulo da seta'"
        [placeholder]="w.kind === 'moldura' ? 'Sem título' : 'Rótulo'"
        [maxLength]="w.kind === 'moldura' ? titleMax : labelMax"
        [style.left.px]="w.x"
        [style.top.px]="w.y"
        [style.width.px]="w.w"
        [value]="w.text"
        (keydown)="keys($event, w.writing)"
        (input)="typed(w.writing, $event)"
        (blur)="done(w.writing, $event)"
      />
    }
    @if (tag(); as t) {
      <!-- a etiqueta da seleção: a peça única dos botões dos cards (ui/_etiqueta-acoes.scss), à vista enquanto há
           seleção (não com a mão em cima), num tamanho de tela -->
      <div class="etiqueta-ancora" [style.left.px]="t.x" [style.top.px]="t.y">
        <div #acoes class="acoes" [class.embaixo]="t.below" [style.translate]="nudge().dx + 'px ' + nudge().dy + 'px'" role="toolbar" aria-label="O que fazer com a seleção">
          @if (t.write) {
            <!-- escrever o card (o mesmo do duplo clique e do Enter): o primeiro, à vista -->
            <button type="button" class="botao escrita" aria-label="Escrever" title="Escrever (Enter ou duplo clique)" (pointerdown)="$event.stopPropagation()" (click)="act.emit('escrever')">
              <lucide-icon [img]="Icons.escrever" [size]="16" aria-hidden="true" />
            </button>
          }
          @if (t.color) {
            <button type="button" class="botao cor" aria-label="Cor" title="Cor" (pointerdown)="$event.stopPropagation()" (click)="act.emit('cor')">
              <lucide-icon [img]="Icons.cor" [size]="16" aria-hidden="true" />
            </button>
          }
          @if (t.look) {
            <button type="button" class="botao jeito" [attr.aria-label]="t.look" [title]="t.look" (pointerdown)="$event.stopPropagation()" (click)="act.emit('jeito')">
              <lucide-icon [img]="Icons.jeito" [size]="16" aria-hidden="true" />
            </button>
          }
          @if (t.font) {
            <button type="button" class="botao letra" aria-label="Tamanho da letra" title="Tamanho da letra (Ctrl+Shift+&gt; e Ctrl+Shift+&lt;)" (pointerdown)="$event.stopPropagation()" (click)="act.emit('letra')">
              <lucide-icon [img]="Icons.letra" [size]="16" aria-hidden="true" />
            </button>
          }
          @if (t.label) {
            <button type="button" class="botao rotulo" aria-label="Rótulo" title="Rótulo" (pointerdown)="$event.stopPropagation()" (click)="act.emit('rotulo')">
              <lucide-icon [img]="Icons.rotulo" [size]="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="botao cadeado"
              [attr.aria-pressed]="edgeLocked()"
              aria-label="Prender nos lados"
              [title]="edgeLocked() ? 'Presa nos lados (tocar solta: ela volta a se ajeitar sozinha)' : 'Prender nos lados de agora'"
              (pointerdown)="$event.stopPropagation()"
              (click)="act.emit('cadeado')"
            >
              <lucide-icon [img]="edgeLocked() ? Icons.presa : Icons.solta" [size]="16" aria-hidden="true" />
            </button>
          }
          @if (t.stack) {
            <button type="button" class="botao frente" aria-label="Trazer para frente" title="Trazer para frente (])" (pointerdown)="$event.stopPropagation()" (click)="act.emit('frente')">
              <lucide-icon [img]="Icons.frente" [size]="16" aria-hidden="true" />
            </button>
            <button type="button" class="botao tras" aria-label="Mandar para trás" title="Mandar para trás ([)" (pointerdown)="$event.stopPropagation()" (click)="act.emit('tras')">
              <lucide-icon [img]="Icons.tras" [size]="16" aria-hidden="true" />
            </button>
            <button type="button" class="botao duplicar" aria-label="Duplicar" title="Duplicar (Ctrl+D)" (pointerdown)="$event.stopPropagation()" (click)="act.emit('duplicar')">
              <lucide-icon [img]="Icons.duplicar" [size]="16" aria-hidden="true" />
            </button>
          }
          <button type="button" class="botao apagar" aria-label="Apagar" title="Apagar (Delete)" (pointerdown)="$event.stopPropagation()" (click)="act.emit('apagar')">
            <lucide-icon [img]="Icons.apagar" [size]="16" aria-hidden="true" />
          </button>
        </div>
      </div>
    }
  `,
})
export class FreeBoardEditOverlay {
  readonly editor = input.required<BoardEditor>();
  /** As peças como aparecem (com o arrasto no meio). */
  readonly nodes = input.required<ReadonlyMap<string, FbNode>>();
  /** O caminho da seta selecionada (o mesmo do giz), ou null. */
  readonly edgeD = input<string | null>(null);
  /** O meio da seta que está ganhando o rótulo. */
  readonly edgeMid = input<{ x: number; y: number } | null>(null);
  /** O rótulo de agora da seta selecionada. */
  readonly edgeText = input('');
  /** As pontas da seta selecionada (onde ela sai e onde chega). */
  readonly edgeEnds = input<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  /** A seta selecionada está presa nos lados (o cadeado)? */
  readonly edgeLocked = input(false);
  /** O nome do "Jeito da peça" da seleção (null: ela não tem). */
  readonly lookLabel = input<string | null>(null);
  readonly act = output<SelectionAction>();
  /** A câmera parada (a última conta): mudou, a etiqueta é medida de novo na tela. */
  readonly camera = input<unknown>(null);
  private readonly acoes = viewChild<ElementRef<HTMLElement>>('acoes');
  /**
   * A etiqueta dentro do quadro (no celular, a seleção na direita a jogava para fora da tela, e em cima ela cobria o
   * topo do quadro): `dx` a empurra para dentro dos lados; `flip` a leva para baixo da seleção quando em cima ela
   * ficaria sob o topo e embaixo ela cabe; sem lugar nos dois (a seleção maior que a tela), `dy` a desce até ficar à vista.
 * Medido depois de desenhar, em px da tela.
   */
  protected readonly nudge = signal({ dx: 0, dy: 0, flip: false });

  protected readonly Icons = { escrever: ICON.editar, cor: ICON.paleta, jeito: ICON.moldura, letra: ICON.tamanhoDaLetra, rotulo: ICON.etiqueta, presa: ICON.setaPresa, solta: ICON.setaSolta, frente: ICON.frente, tras: ICON.tras, duplicar: ICON.copiar, apagar: ICON.apagar };
  protected readonly titleMax = FB_FRAME_TITLE_MAX;
  protected readonly labelMax = FB_LABEL_MAX;

  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  protected readonly selectedNodes = computed(() => {
    const nodes = this.nodes();
    return [...this.editor().selected()].map((id) => nodes.get(id)).filter((n): n is FbNode => !!n);
  });

  /** Uma peça só selecionada (e nada sendo escrito): as alças de tamanho dela, nos cantos e no meio dos lados. */
  protected readonly single = computed(() => {
    const sel = this.selectedNodes();
    if (sel.length !== 1 || this.editor().writing()) return null;
    return { node: sel[0], handles: ALL_HANDLES };
  });

  /** As pontas da seta selecionada, para puxar (não no meio de um gesto nem escrevendo o rótulo). */
  protected readonly endsOf = computed(() => {
    const ed = this.editor();
    const id = ed.selectedEdge();
    const ends = this.edgeEnds();
    if (!id || !ends || ed.writing() || ed.preview() || ed.linking()) return null;
    return { id, ...ends };
  });

  /** As bolinhas de seta na peça debaixo do mouse (ou na selecionada sozinha), nos meios dos lados. */
  protected readonly dotsOf = computed(() => {
    const ed = this.editor();
    if (ed.writing() || ed.preview() || ed.box()) return null;
    const id = ed.linking()?.from ?? ed.hover() ?? (this.selectedNodes().length === 1 ? this.selectedNodes()[0].i : null);
    const n = id ? this.nodes().get(id) : null;
    if (!n) return null;
    return { id: n.i, points: FB_SIDES.map((side: FbSide) => ({ side, ...anchor(n, side) })) };
  });

  /** A peça onde a seta puxada chega se soltar agora (ela ganha o anel). */
  protected readonly linkTargetNode = computed(() => {
    const t = this.editor().linking()?.target;
    return t ? (this.nodes().get(t) ?? null) : null;
  });

  /** A seta sendo puxada: de onde sai até o ponteiro, ou até o lado da peça onde ela vai chegar. */
  protected readonly linkLine = computed(() => {
    const l = this.editor().linking();
    const from = l ? this.nodes().get(l.from) : null;
    if (!l || !from || l.curve) return null;
    const a = anchor(from, l.side);
    const t = this.linkTargetNode();
    const b = t ? anchor(t, nearestSide(t, l.to)) : l.to;
    return `M${a.x} ${a.y} L${b.x} ${b.y}`;
  });

  /** O campo de escrever no lugar (o título da moldura, o rótulo da seta), onde ele fica no mundo. */
  protected readonly writingBox = computed(() => {
    const w = this.editor().writing();
    if (!w) return null;
    if (w.kind === 'seta') {
      const m = this.edgeMid();
      if (!m) return null;
      return { kind: 'seta' as const, id: w.id, writing: w, x: m.x - 120, y: m.y - 18, w: 240, text: this.edgeText() };
    }
    const n = this.nodes().get(w.id);
    if (!n) return null;
    if (w.kind !== 'moldura') return null;
    return { kind: 'moldura' as const, id: w.id, writing: w, x: n.x + 26, y: n.y + 18, w: Math.max(160, Math.min(n.w - 52, 520)), text: n.t === 'm' ? (n.nome ?? '') : '' };
  });

  /** A etiqueta da seleção: em cima à esquerda da seleção, com os botões que valem para ela. */
  protected readonly tag = computed(() => {
    const ed = this.editor();
    if (ed.writing() || ed.preview() || ed.box() || ed.linking()) return null;
    const sel = this.selectedNodes();
    if (sel.length) {
      const box = boundsOf(sel)!;
      const colorable = sel.some((n) => n.t !== 'w');
      // em cima da seleção, a etiqueta cobriria o título de uma moldura (a fita Dymo do canto): vai para baixo
      const z = ed.zoom();
      const over = { x: box.x, y: box.y - 96 / z, w: 340 / z, h: 96 / z };
      const ids = new Set(sel.map((n) => n.i));
      const below = [...this.nodes().values()].some(
        (n) => n.t === 'm' && !ids.has(n.i) && !!n.nome && intersects(over, { x: n.x + 26, y: n.y + 22, w: Math.min(n.w - 52, 28 + n.nome.length * 16), h: 30 }),
      );
      const down = below || this.nudge().flip;
      return {
        x: box.x,
        y: down ? box.y + box.h : box.y,
        h: box.h,
        below: down,
        color: colorable,
        look: sel.length === 1 ? this.lookLabel() : null,
        write: sel.length === 1 && sel[0].t === 'x',
        font: sel.every((n) => n.t === 'x'),
        label: false,
        stack: true,
      };
    }
    const m = ed.selectedEdge() ? this.edgeMid() : null;
    if (m) return { x: m.x, y: m.y - 24, h: 0, below: false, color: true, look: null, write: false, font: false, label: true, stack: false };
    return null;
  });

  constructor() {
    // o campo de escrever recebe o foco quando aparece, com o texto todo selecionado
    afterRenderEffect(() => {
      const el = this.campo()?.nativeElement;
      if (!el || el === document.activeElement) return;
      el.focus({ preventScroll: true });
      el.select();
    });
    afterRenderEffect(() => {
      this.camera();
      const t = this.tag();
      const el = this.acoes()?.nativeElement;
      const visor = el?.closest<HTMLElement>('.visor');
      if (!t || !el || !visor || !el.parentElement) return;
      const v = visor.getBoundingClientRect();
      const at = el.parentElement.getBoundingClientRect();
      const z = this.editor().zoom();
      // o alto da seleção na tela (a âncora fica no pé dela quando a etiqueta está embaixo)
      const top = t.below ? at.top - t.h * z : at.top;
      // em cima não cabe (o topo do quadro): desce, se embaixo cabe; a seleção mais alta que a tela fica com ela em cima
      const bottom = top + t.h * z;
      const flip = t.stack && top - TAG_GAP - el.offsetHeight < v.top + TAG_TOP && bottom + TAG_GAP + el.offsetHeight <= v.bottom - TAG_SIDE;
      const left = at.left;
      const dx = Math.round(Math.max(v.left + TAG_SIDE - left, Math.min(0, v.right - TAG_SIDE - (left + el.offsetWidth))));
      // nem em cima nem embaixo (a seleção maior que a tela): em cima, descida até ficar à vista sob o topo
      const dy = t.stack && !flip && !t.below ? Math.round(Math.max(0, v.top + TAG_TOP - (top - TAG_GAP - el.offsetHeight))) : 0;
      const was = this.nudge();
      if (was.dx !== dx || was.dy !== dy || was.flip !== flip) this.nudge.set({ dx, dy, flip });
    });
  }

  protected handleX(n: FbNode, h: string): number {
    return h.includes('w') ? n.x : h.includes('e') ? n.x + n.w : n.x + n.w / 2;
  }

  protected handleY(n: FbNode, h: string): number {
    return h.includes('n') ? n.y : h.includes('s') ? n.y + n.h : n.y + n.h / 2;
  }

  /** Enter guarda o título e o rótulo, e clicar fora também. O Esc desiste do que foi escrito, como em todo campo. */
  protected keys(e: KeyboardEvent, w: Writing): void {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.editor().cancelWriting(w);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.finish(w, (e.target as HTMLInputElement).value);
    }
  }

  /** Cada letra: o editor sabe o que está no campo (o clique fora guarda isto). */
  protected typed(w: Writing, e: Event): void {
    this.editor().draft = { writing: w, text: (e.target as HTMLInputElement).value };
  }

  protected done(w: Writing, e: FocusEvent): void {
    this.finish(w, (e.target as HTMLInputElement).value);
  }

  private finish(w: Writing, text: string): void {
    const now = this.editor().writing();
    if (!now || now.id !== w.id || now.kind !== w.kind) return;
    this.editor().write(w, text);
  }
}
