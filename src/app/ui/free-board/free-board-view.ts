import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FbNode, FreeBoard } from '../../core/free-board';
import { ContextMenu, MenuSections } from '../context-menu';
import { Camera, Point, Rect, contains, fitRect, framesOf, readingOrder, toWorld, viewRect, zoomAt } from '../../core/free-board-geometry';
import { NoteLinks } from '../../core/note-links';
import { ICON, IconModule } from '../icons';
import { BoardEditor } from './board-editor';
import { BoardEditing } from './board-editing';
import { CameraRig, RigHost } from './camera-rig';
import { FreeBoardEditOverlay, SelectionAction } from './edit-overlay';
import { FreeBoardOwner } from './owner-tools';
import { FreeBoardTools, RulerAsk } from './tool-ruler';
import { drawFar, farDensity } from './far-layer';
import { FreeBoardPiece } from './free-board-piece';
import { NEAR_PX, Scene, SceneFrame, needsRecount } from './scene';
import { FreeBoardThumbs } from './thumbs';

/** Abaixo deste zoom, o título da moldura fica pequeno demais no Dymo dela: o canvas desenha um do tamanho da tela. */
export const LABELS_ON_CANVAS_BELOW = 0.5;

/** Quanto as setas do teclado andam (px da tela); com Shift, cinco vezes isso. */
const KEY_STEP = 80;

/** Quanto tempo parado até as camadas serem repintadas nítidas na escala nova (além dos 150 ms do gesto). */
const SHARP_MS = 250;

/** O rótulo de uma seta: a fita-crepe no meio da curva, um pouco torta. */
interface EdgeLabel {
  id: string;
  label: string;
  lx: number;
  ly: number;
  tilt: number;
}

/**
 * O Quadro livre na tela (PLANO-QUADRO-LIVRE.md, seção 9): a parede de eucatex sem fim, com as peças perto da
 * tela montadas no nível de detalhe certo, as de longe num canvas e as setas a giz. A peça de ver: recebe o
 * quadro e devolve a câmera quando ela para e, no editar, o quadro mudado; não escreve nada (a página do dono
 * guarda a câmera e as mudanças, e dá o que só ela faz por `owner`). A visita monta esta mesma peça, sem editar.
 *
 * Por cima da parede, três camadas no mundo, de baixo para cima: as molduras (no DOM), o canvas (as peças de
 * longe e as setas a giz, na área da última conta) e o resto (as peças e as fitas dos rótulos, no DOM). As três recebem
 * a mesma transformação, uma vez por quadro de animação, fora do Angular (camera-rig.ts), e nada mais muda no
 * quadro de animação: nem estilo herdado (uma variável CSS no visor refazia o estilo das 300 peças a cada
 * quadro), nem desenho no canvas. O Angular só monta e desmonta peças, e o canvas só é redesenhado, quando a
 * câmera anda um quarto de tela ou o zoom muda 15% (scene.ts).
 */
@Component({
  selector: 'app-free-board',
  imports: [ContextMenu, FreeBoardEditOverlay, FreeBoardPiece, FreeBoardTools, IconModule],
  providers: [FreeBoardThumbs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './free-board-view.scss',
  template: `
    <div
      #visor
      class="visor"
      tabindex="0"
      role="region"
      aria-roledescription="quadro livre"
      [attr.aria-label]="'Quadro ' + board().nome"
      aria-describedby="fb-como"
      [class.rotulos-na-tela]="labelsOnCanvas()"
      [class.editando]="editing()"
      [attr.data-ferramenta]="editing() ? editor.tool() : null"
      (keydown)="key($event)"
    >
      <div #parede class="parede" aria-hidden="true"></div>
      <div #back class="mundo">
        @for (p of frames(); track p.node.i) {
          <app-free-board-piece [node]="p.node" [info]="p.info" [level]="p.level" [count]="countOf(p.node.i)" [links]="links()" />
        }
      </div>
      <div #farLayer class="mundo" aria-hidden="true"><canvas #far class="longe"></canvas></div>
      <div #front class="mundo">
        @for (p of pieces(); track p.node.i) {
          <app-free-board-piece [node]="p.node" [info]="p.info" [level]="p.level" [thumb]="thumbOf(p.info.image, p.level)" [links]="links()" />
        }
        <!-- o rótulo da seta é fita colada por cima de tudo: nunca some debaixo de uma foto -->
        @for (e of labels(); track e.id) {
          <span class="fita" aria-hidden="true" [style.left.px]="e.lx" [style.top.px]="e.ly" [style.rotate.deg]="e.tilt">{{ e.label }}</span>
        }
      </div>
      <!-- a camada da edição: o anel da seleção, as alças, as bolinhas, a caixa, o escrever no lugar, a etiqueta -->
      <div #over class="mundo sobre">
        @if (editing()) {
          <app-free-board-edit-overlay
            [editor]="editor"
            [nodes]="scene().nodes"
            [edgeD]="edgeOn()?.d ?? null"
            [edgeMid]="edgeOn()?.mid ?? null"
            [edgeText]="edgeOn()?.txt ?? ''"
            [lookLabel]="lookLabel()"
            (act)="selectionAct($event)"
          />
        }
      </div>
      @if (empty()) {
        @if (editing()) {
          <p class="vazio">Arraste imagens para cá, ou escolha uma ferramenta embaixo.</p>
        } @else {
          <p class="vazio">Este quadro está vazio.</p>
        }
      }
      <p id="fb-como" class="sr-only">Arraste para andar, role para dar zoom. Tab passa pelas peças; as setas do teclado andam; + e − dão zoom; 0 mostra tudo.</p>
    </div>
    <span #fim tabindex="-1" class="sr-only">Fim do quadro</span>
    @if (editing()) {
      <app-free-board-tools class="ferramentas" [editor]="editor" (ask)="rulerAsk($event)" />
    }
    @if (helpOpen()) {
      <div class="atalhos" role="dialog" aria-modal="false" aria-labelledby="fb-atalhos-titulo" (keydown.escape)="helpOpen.set(false)">
        <h2 id="fb-atalhos-titulo">Atalhos do quadro</h2>
        <dl>
          @for (a of shortcuts; track a[0]) {
            <div><dt>{{ a[0] }}</dt><dd>{{ a[1] }}</dd></div>
          }
        </dl>
        <button type="button" class="btn-quiet" (click)="helpOpen.set(false)">Fechar</button>
      </div>
    }
    <app-context-menu #menu [caption]="menuCaption()" [sections]="menuSections()" />
    <div class="regua" role="toolbar" aria-label="Zoom do quadro">
      <button type="button" class="tecla" (click)="zoomStep(1 / 1.25)" aria-label="Afastar" title="Afastar (−)">
        <lucide-icon [img]="Icons.menos" [size]="18" aria-hidden="true" />
      </button>
      <button type="button" class="tecla zoom" (click)="actualSize()" [attr.aria-label]="'Zoom ' + zoomText() + ', voltar a 100%'" title="Voltar a 100% (1)">
        {{ zoomText() }}
      </button>
      <button type="button" class="tecla" (click)="zoomStep(1.25)" aria-label="Aproximar" title="Aproximar (+)">
        <lucide-icon [img]="Icons.mais" [size]="18" aria-hidden="true" />
      </button>
      <button type="button" class="tecla tudo" (click)="fitAll()" title="Ver tudo (0)">Ver tudo</button>
    </div>
  `,
})
export class FreeBoardView implements RigHost {
  readonly board = input.required<FreeBoard>();
  /** Onde a câmera estava neste aparelho; sem ela, "Ver tudo" (decisão D7). */
  readonly camera = input<Camera | null>(null);
  readonly links = input<NoteLinks | null>(null);
  /** O editar (rodada 4): a página do dono liga; a visita nunca. */
  readonly editing = input(false);
  /** O que só o dono faz (escolher uma anotação, guardar imagens, a folha do widget); sem isto, o quadro só se vê. */
  readonly owner = input<FreeBoardOwner | null>(null);
  /** Recebe o foco ao abrir (o quadro em tela cheia). */
  readonly autofocus = input(false);
  /** A câmera parou (para a página guardar, só neste aparelho). */
  readonly cameraChange = output<Camera>();
  /** O quadro mudou no editar: o novo e o de antes (a página guarda; ver FreeBoardStore.save). */
  readonly changed = output<{ board: FreeBoard; from: FreeBoard }>();
  /** Pediu para ligar ou desligar o editar (o E, o menu, o Esc sem nada selecionado). */
  readonly editToggle = output<boolean>();
  /** Um aviso curto (o quadro cheio): sobe para quem mostra os avisos do site. */
  readonly notice = output<string>();

  protected readonly Icons = { mais: ICON.adicionar, menos: ICON.tirar };

  private readonly visor = viewChild.required<ElementRef<HTMLElement>>('visor');
  private readonly back = viewChild.required<ElementRef<HTMLElement>>('back');
  private readonly front = viewChild.required<ElementRef<HTMLElement>>('front');
  private readonly far = viewChild.required<ElementRef<HTMLCanvasElement>>('far');
  private readonly farLayer = viewChild.required<ElementRef<HTMLElement>>('farLayer');
  private readonly wall = viewChild.required<ElementRef<HTMLElement>>('parede');
  private readonly end = viewChild.required<ElementRef<HTMLElement>>('fim');
  private readonly over = viewChild.required<ElementRef<HTMLElement>>('over');
  private readonly menu = viewChild.required<ContextMenu>('menu');
  private readonly thumbs = inject(FreeBoardThumbs);
  private readonly injector = inject(Injector);

  /** O quadro como está (o que chegou, com as mudanças do editar por cima até a página devolver o guardado). */
  readonly current = linkedSignal(() => this.board());
  /** A edição: a ferramenta, a seleção, o arrasto no meio e o desfazer. */
  readonly editor = new BoardEditor({
    board: () => this.current(),
    zoom: () => this.rig?.camera.z ?? 1,
    commit: (next, before) => {
      this.current.set(next);
      this.changed.emit({ board: next, from: before });
    },
    say: (text) => this.notice.emit(text),
    dropArrow: (from, side, at, screen) => this.edits.dropArrow(from, side, at, screen),
  });
  private readonly edits = new BoardEditing({
    editor: this.editor,
    editing: () => this.editing(),
    owner: () => this.owner(),
    board: () => this.current(),
    camera: () => this.rig?.camera ?? { x: 0, y: 0, z: 1 },
    visor: () => this.visor().nativeElement,
    middle: () => toWorld(this.rig?.camera ?? { x: 0, y: 0, z: 1 }, { x: this.dims.w / 2, y: this.dims.h / 2 }),
    menu: (key, caption, sections, x, y, by) => this.openMenu(key, caption, sections, x, y, by),
    say: (text) => this.notice.emit(text),
    toggleEdit: (on) => this.editToggle.emit(on),
    showHelp: () => this.helpOpen.set(true),
    fitAll: () => this.fitAll(),
    goTo: (p) => this.goTo(p),
  });
  protected readonly scene = computed(() => new Scene(this.editor.preview() ?? this.current()));
  protected readonly menuCaption = signal('');
  protected readonly menuSections = signal<MenuSections>([]);
  protected readonly helpOpen = signal(false);
  /** A seta selecionada (ou ganhando o rótulo): o caminho dela, o meio e o rótulo de agora. */
  protected readonly edgeOn = computed(() => {
    const w = this.editor.writing();
    const id = w?.kind === 'seta' ? w.id : this.editor.selectedEdge();
    const e = id ? this.current().e.find((x) => x.i === id) : null;
    const path = e ? this.scene().pathOf(e) : null;
    return e && path ? { d: path.d, mid: path.mid, txt: e.txt ?? '' } : null;
  });
  protected readonly lookLabel = computed(() => {
    const sel = this.editor.selected();
    if (sel.size !== 1) return null;
    return this.edits.lookLabel(this.scene().nodes.get([...sel][0]));
  });
  protected readonly shortcuts: readonly [string, string][] = [
    ['V M T', 'Selecionar, Moldura, Texto'],
    ['N I W', 'Anotação, Imagem, Widget'],
    ['Arrastar no fundo', 'A caixa de seleção (Alt: o que ela encosta)'],
    ['Ctrl, espaço ou o botão do meio + arrastar', 'Andar'],
    ['Shift ou Ctrl + clique', 'Somar ou tirar da seleção'],
    ['Ctrl+A', 'Selecionar tudo'],
    ['Delete', 'Apagar'],
    ['Ctrl+C, X, V, D', 'Copiar, recortar, colar, duplicar'],
    ['Ctrl+Z, Ctrl+Shift+Z', 'Desfazer, refazer'],
    ['Ctrl+G, Ctrl+Shift+G', 'Juntar, separar'],
    ['] e [', 'Trazer para frente, mandar para trás'],
    ['Setas', 'Andar a seleção um furo (Shift: 1 px)'],
    ['Alt arrastando', 'Sem encaixar nos furos'],
    ['Duplo clique', 'Escrever, renomear, editar; no fundo, um bilhete'],
    ['+ − 0 1', 'Zoom, Ver tudo, 100%'],
    ['Esc', 'Tirar a seleção; sem nada, sair do editar'],
  ];
  /** O que está montado agora (a última conta da cena). */
  private readonly view = signal<SceneFrame | null>(null);
  /** O zoom da última conta (as setas e a porcentagem mudam por ele, não a cada quadro). */
  private readonly z = signal(1);

  protected readonly frames = computed(() => this.view()?.frames ?? []);
  protected readonly pieces = computed(() => this.view()?.pieces ?? []);
  protected readonly empty = computed(() => this.scene().nodes.size === 0);
  protected readonly labelsOnCanvas = computed(() => this.z() < LABELS_ON_CANVAS_BELOW);
  protected readonly zoomText = computed(() => `${Math.round(this.z() * 100)}%`);
  /** Quantas peças cada moldura tem dentro (as de dentro das de dentro também), para o nome falado. */
  private readonly counts = computed(() => {
    const owner = framesOf([...this.scene().nodes.values()]);
    const out = new Map<string, number>();
    for (const start of owner.keys()) {
      let o = owner.get(start);
      while (o) {
        out.set(o, (out.get(o) ?? 0) + 1);
        o = owner.get(o);
      }
    }
    return out;
  });

  protected readonly labels = computed<EdgeLabel[]>(() =>
    (this.view()?.edges ?? []).flatMap(({ edge, path }) => {
      if (!edge.txt) return [];
      // a fita atravessa a seta, um pouco torta, nunca de cabeça para baixo
      const along = (Math.atan2(path.to.y - path.from.y, path.to.x - path.from.x) * 180) / Math.PI;
      const tilt = Math.max(-8, Math.min(8, ((((along + 90) % 180) + 180) % 180 - 90) * 0.12)) + (edge.i.charCodeAt(0) % 2 ? 2 : -2);
      return [{ id: edge.i, label: edge.txt, lx: path.mid.x, ly: path.mid.y, tilt }];
    }),
  );

  private rig: CameraRig | null = null;
  private dims = { w: 0, h: 0 };
  private dpr = 1;
  private moving = false;
  private sharpTimer: ReturnType<typeof setTimeout> | undefined;
  /** O passo dos furos já posto na parede (só muda com o zoom). */
  private wallStep = 0;
  /** A câmera de agora (a do último quadro de animação), para a camada de longe. */
  private live: Camera | null = null;
  /** A peça com o foco do teclado, na ordem de leitura. */
  private focusAt = -1;

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.visor().nativeElement;
      const start = untracked(this.camera);
      this.rig = new CameraRig(this, start ?? { x: 0, y: 0, z: 1 });
      const off = this.rig.attach(el);
      const offEdit = this.edits.attach(el);
      const ro = new ResizeObserver(() => this.resize(!start));
      ro.observe(el);
      this.resize(!start);
      // o quadro aberto é a tela inteira: o teclado já anda nele (as setas, o zoom, o E do editar)
      if (this.autofocus()) el.focus({ preventScroll: true });
      destroy.onDestroy(() => {
        clearTimeout(this.sharpTimer);
        off();
        offEdit();
        ro.disconnect();
      });
    });
    // o quadro mudou (outra aba, a rodada de editar): a cena é outra, a conta vale de novo
    effect(() => {
      this.scene();
      untracked(() => this.live && this.recount(this.live));
    });
    // saindo do editar: sem seleção, sem gesto no meio, a ferramenta de volta
    effect(() => {
      if (this.editing()) return;
      untracked(() => {
        this.editor.cancel();
        this.editor.clearSelection();
        this.editor.writing.set(null);
        this.editor.tool.set('selecionar');
      });
    });
    // uma miniatura ficou pronta: a camada de longe a desenha
    effect(() => {
      this.thumbs.version();
      untracked(() => this.paintFar());
    });
  }

  // ===== o que o motor da câmera chama =====

  size(): { w: number; h: number } {
    return this.dims;
  }

  shouldPan(e: PointerEvent): boolean {
    return this.edits.shouldPan(e);
  }

  apply(camera: Camera, moving: boolean): void {
    if (moving) {
      clearTimeout(this.sharpTimer);
      if (!this.moving) this.setMoving(true);
    }
    this.live = camera;
    const t = `translate(${-camera.x * camera.z}px, ${-camera.y * camera.z}px) scale(${camera.z})`;
    for (const layer of this.layers()) layer.style.transform = t;
    // a camada da edição: o tamanho de tela das alças e da etiqueta (a variável só nela, ninguém mais herda)
    this.over().nativeElement.style.setProperty('--iz', `${1 / camera.z}`);
    this.paintWall(camera);
    if (needsRecount(this.view()?.camera ?? null, camera, this.dims.w, this.dims.h)) this.recount(camera);
  }

  private layers(): HTMLElement[] {
    return [this.back().nativeElement, this.farLayer().nativeElement, this.front().nativeElement, this.over().nativeElement];
  }

  settle(camera: Camera): void {
    this.recount(camera);
    this.cameraChange.emit(camera);
    // nítido de novo (o navegador repinta tudo na escala nova) só depois de um tempo parado: girando a roda
    // devagar, cada dente parava o gesto, e cada parada repintava o quadro inteiro
    clearTimeout(this.sharpTimer);
    this.sharpTimer = setTimeout(() => this.setMoving(false), SHARP_MS);
  }

  // ===== os botões e o teclado =====

  /** "Ver tudo": a câmera desliza até mostrar o quadro inteiro (até 100%). */
  fitAll(): void {
    this.rig?.flyTo(fitRect(this.scene().bounds, this.dims.w, this.dims.h));
  }

  /** O zoom de 100%, mantendo o meio da tela no lugar. */
  actualSize(): void {
    if (!this.rig) return;
    this.rig.flyTo(zoomAt(this.rig.camera, { x: this.dims.w / 2, y: this.dims.h / 2 }, 1));
  }

  zoomStep(factor: number): void {
    if (!this.rig) return;
    const cam = this.rig.camera;
    this.rig.flyTo(zoomAt(cam, { x: this.dims.w / 2, y: this.dims.h / 2 }, cam.z * factor));
  }

  protected key(e: KeyboardEvent): void {
    if (!this.rig) return;
    const target = e.target as HTMLElement;
    // dentro de um campo do widget (a tarefa do texto), as teclas são dele
    if (target.closest('input, textarea, select, [contenteditable="true"], app-context-menu')) return;
    if (e.key === 'Escape' && this.helpOpen()) {
      e.preventDefault();
      this.helpOpen.set(false);
      return;
    }
    if (this.edits.key(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onBoard = target === this.visor().nativeElement || target.tagName === 'APP-FREE-BOARD-PIECE';
    const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    switch (e.key) {
      case 'Tab':
        return this.tab(e);
      case 'ArrowLeft':
        return this.keyed(e, () => this.rig!.panBy(-step, 0));
      case 'ArrowRight':
        return this.keyed(e, () => this.rig!.panBy(step, 0));
      case 'ArrowUp':
        return this.keyed(e, () => this.rig!.panBy(0, -step));
      case 'ArrowDown':
        return this.keyed(e, () => this.rig!.panBy(0, step));
      case '+':
      case '=':
        return this.keyed(e, () => this.zoomStep(1.25));
      case '-':
      case '_':
        return this.keyed(e, () => this.zoomStep(1 / 1.25));
      case '0':
        return this.keyed(e, () => this.fitAll());
      case '1':
        return this.keyed(e, () => this.actualSize());
      case 'Enter':
      case ' ':
        // na peça com o foco: usa o que ela tem (abre a nota, amplia a foto, toca o som)
        if (onBoard && target !== this.visor().nativeElement) {
          e.preventDefault();
          const inner = target.querySelector<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])');
          (inner ?? target).click();
        }
        return;
    }
  }

  private keyed(e: KeyboardEvent, run: () => void): void {
    e.preventDefault();
    run();
  }

  /**
   * O Tab anda pelas peças na ordem de leitura (seção 4.9): a câmera vai até a peça (montada antes de receber
   * o foco). Depois da última, o foco sai do quadro; antes da primeira, volta para o quadro.
   */
  private tab(e: KeyboardEvent): void {
    const order = readingOrder(this.current());
    if (!order.length) return;
    const visor = this.visor().nativeElement;
    const from = document.activeElement;
    const at = from === visor ? -1 : from?.tagName === 'APP-FREE-BOARD-PIECE' ? order.findIndex((n) => n.i === (from as HTMLElement).dataset['peca']) : this.focusAt;
    const next = e.shiftKey ? at - 1 : at + 1;
    if (e.shiftKey && from === visor) return;
    e.preventDefault();
    if (next < 0) {
      this.focusAt = -1;
      return visor.focus({ preventScroll: true });
    }
    if (next >= order.length) {
      this.focusAt = -1;
      return this.end().nativeElement.focus({ preventScroll: true });
    }
    this.focusAt = next;
    this.showPiece(order[next]);
  }

  /** Leva a câmera até a peça (se ela não está inteira na tela, ou está pequena demais) e põe o foco nela. */
  private showPiece(node: FbNode): void {
    if (!this.rig) return;
    let cam = this.rig.camera;
    const margin = 40 / cam.z;
    const view = viewRect(cam, this.dims.w, this.dims.h);
    const inner: Rect = { x: view.x + margin, y: view.y + margin, w: view.w - 2 * margin, h: view.h - 2 * margin };
    const tooSmall = Math.sqrt(node.w * node.h) * cam.z < NEAR_PX;
    if (tooSmall || !contains(inner, node)) {
      const z = tooSmall ? Math.min(1, Math.max(cam.z, (NEAR_PX * 1.6) / Math.sqrt(node.w * node.h))) : cam.z;
      const fit = Math.min(z, (this.dims.w * 0.8) / node.w, (this.dims.h * 0.8) / node.h);
      cam = { x: node.x + node.w / 2 - this.dims.w / 2 / fit, y: node.y + node.h / 2 - this.dims.h / 2 / fit, z: fit };
      // a peça é montada já na câmera nova (a câmera pula: o foco não espera a viagem)
      this.rig.set(cam);
      this.recount(cam);
    }
    const focus = (tries: number) => {
      const el = this.front().nativeElement.querySelector<HTMLElement>(`[data-peca="${node.i}"]`) ?? this.back().nativeElement.querySelector<HTMLElement>(`[data-peca="${node.i}"]`);
      if (el) el.focus({ preventScroll: true });
      else if (tries) requestAnimationFrame(() => focus(tries - 1));
    };
    afterNextRender(() => focus(10), { injector: this.injector });
  }

  // ===== o editar =====

  protected rulerAsk(what: RulerAsk): void {
    void this.edits.ask(what);
  }

  protected selectionAct(a: SelectionAction): void {
    const r = this.visor().nativeElement.querySelector('.acoes')?.getBoundingClientRect();
    this.edits.act(a, { x: r?.left ?? 0, y: (r?.bottom ?? 0) + 4 });
  }

  private openMenu(key: string, caption: string, sections: MenuSections, x: number, y: number, by: 'mouse' | 'toque' | 'teclado'): void {
    this.menuCaption.set(caption);
    this.menuSections.set(sections);
    // o menu desenha as opções novas antes de abrir (ele mede o tamanho para não sair da tela)
    afterNextRender(() => this.menu().show({ key: `${key}:${Date.now()}`, x, y, by, back: this.visor().nativeElement }), { injector: this.injector });
  }

  /** "Ir até aqui": o ponto no meio da tela, no zoom de agora (perto, se estava longe). */
  private goTo(p: Point): void {
    if (!this.rig) return;
    const z = Math.max(this.rig.camera.z, 0.6);
    this.rig.flyTo({ x: p.x - this.dims.w / 2 / z, y: p.y - this.dims.h / 2 / z, z });
  }

  // ===== desenhar =====

  protected countOf(id: string): number {
    return this.counts().get(id) ?? 0;
  }

  /** A miniatura da imagem para a peça do meio (pedida aqui, se ainda não tem). */
  protected thumbOf(image: string | null, level: 'perto' | 'meio'): string | null {
    if (!image || level !== 'meio') return null;
    this.thumbs.version();
    const t = this.thumbs.get(image);
    if (!t) untracked(() => this.thumbs.want(image));
    return t?.url ?? null;
  }

  private resize(fit: boolean): void {
    const el = this.visor().nativeElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    const first = !this.dims.w;
    this.dims = { w, h };
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!this.rig) return;
    if (first && fit) this.rig.set(fitRect(this.scene().bounds, w, h));
    else this.apply(this.rig.camera, false);
    this.recount(this.rig.camera);
  }

  /** A conta da cena: o que fica montado e o que vai para o canvas. */
  private recount(camera: Camera): void {
    if (!this.dims.w) return;
    const frame = this.scene().frame(camera, this.dims.w, this.dims.h);
    // as imagens do meio e de longe pedem a miniatura
    for (const p of frame.far) if (p.info.image) this.thumbs.want(p.info.image);
    this.view.set(frame);
    this.z.set(camera.z);
    this.paintFar();
  }

  /**
   * O eucatex: a camada da parede é um furo maior que a tela e só desliza (transform, sem pintar) até um furo
   * para cada lado; o tamanho dos furos muda só quando o zoom muda, e afastando muito eles somem (sem moiré).
   */
  private paintWall(c: Camera): void {
    const el = this.wall().nativeElement;
    const step = 26 * c.z;
    if (step !== this.wallStep) {
      this.wallStep = step;
      el.style.setProperty('--furo', `${step}px`);
      el.style.setProperty('--fz', `${c.z}`);
      el.style.setProperty('--furo-a', `${Math.min(1, Math.max(0, (step - 8) / 8))}`);
    }
    const mod = (v: number) => ((v % step) + step) % step;
    el.style.transform = `translate(${mod(-c.x * c.z) - step}px, ${mod(-c.y * c.z) - step}px)`;
  }

  /** Redesenha a camada de longe na área da última conta (o canvas mora no mundo e anda com a câmera). */
  private paintFar(): void {
    const v = this.view();
    const canvas = this.far().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || !v) return;
    const { area, camera } = v;
    const labels = camera.z < LABELS_ON_CANVAS_BELOW ? [...v.frames.map((p) => p.node), ...v.far.filter((p) => p.info.kind === 'moldura').map((p) => p.node)] : [];
    const blank = !v.far.length && !v.edges.length && !labels.length;
    const k = blank ? 1e-4 : farDensity(area, camera.z, this.dpr);
    const w = Math.max(1, Math.round(area.w * k));
    const h = Math.max(1, Math.round(area.h * k));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const style = canvas.style;
    style.left = `${area.x}px`;
    style.top = `${area.y}px`;
    style.width = `${area.w}px`;
    style.height = `${area.h}px`;
    drawFar(ctx, { area, k, z: camera.z, far: v.far, edges: v.edges, labels, thumb: (id) => this.thumbs.get(id)?.bitmap ?? null });
  }

  /** No meio do gesto: as camadas viram textura (rápido), sem hover nem toque nas peças; parou, nítido de novo. */
  private setMoving(on: boolean): void {
    this.moving = on;
    const visor = this.visor().nativeElement;
    visor.toggleAttribute('data-movendo', on);
    for (const layer of this.layers()) layer.style.willChange = on ? 'transform' : '';
  }
}
