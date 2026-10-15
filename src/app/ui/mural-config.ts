import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, output, signal, viewChild } from '@angular/core';
import { ChevronDown, Copy, Dices, Eye, GripVertical, LockKeyhole, LucideAngularModule, Megaphone, SlidersHorizontal, Tags, Undo2, X } from 'lucide-angular';
import { CategoryLook, categoryColorHex, lookKey } from '../core/category-looks';
import { Cloud } from '../core/cloud-config';
import { CategoryPrefs, SubColor, arrangedKeys, moveKey, prefsOf } from '../core/mural-config';
import type { Audience } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { BackdropClose } from './backdrop-close';
import { CategoryLabel } from './category-label';
import { CategoryStyle } from './category-style';
import { Pin } from './pin';

/**
 * As partes da folha, uma por vez, como as partes dos Ajustes. Para crescer, uma entrada aqui e o
 * bloco dela no template: o índice e o teclado já dão conta.
 */
const SECTIONS = [
  { id: 'padroes', label: 'Padrões', hint: 'Como nasce cada anotação', icon: SlidersHorizontal },
  { id: 'categorias', label: 'Categorias', hint: 'Ordem, cor e padrões de cada uma', icon: Tags },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

/** A parte aberta da última vez (enquanto o site está aberto). */
let lastSection: SectionId = 'padroes';

const AUDIENCES: readonly { value: Audience; label: string; icon: typeof Eye; desc: string }[] = [
  { value: 'privada', label: 'Privada', icon: LockKeyhole, desc: 'Fica só com você, e ninguém é avisado.' },
  { value: 'visivel', label: 'Disponível', icon: Eye, desc: 'No seu mural e no seu perfil, sem aparecer no Feed.' },
  { value: 'publicar', label: 'Publicar', icon: Megaphone, desc: 'No seu mural e no Feed de quem segue você.' },
];
const AUDIENCE_LABEL: Record<Audience, string> = { privada: 'Privada', visivel: 'Disponível', publicar: 'Publicar' };

const SUB_COLORS: readonly { value: SubColor; label: string; icon: typeof Eye; desc: string }[] = [
  { value: 'sorteada', label: 'Cor sorteada', icon: Dices, desc: 'A sub-nota nasce numa cartolina sorteada.' },
  { value: 'mae', label: 'Cor da mãe', icon: Copy, desc: 'A sub-nota nasce na mesma cartolina da anotação de onde veio.' },
];
const SUB_LABEL: Record<SubColor, string> = { sorteada: 'Cor sorteada', mae: 'Cor da mãe' };

/** Uma categoria das anotações, na lista da folha. */
interface CategoryRow {
  key: string;
  /** A grafia mais usada. */
  label: string;
  /** Quantas anotações (finalizadas também). */
  n: number;
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** O arrastar de uma categoria pela alça: onde ela estava, onde vai cair e quanto andou. */
interface Drag {
  key: string;
  from: number;
  to: number;
  dy: number;
  /** O alto da linha arrastada mais o vão: o quanto as outras abrem caminho. */
  step: number;
}

/**
 * As configurações do mural de anotações: a engrenagem da pasta abre esta folha (ver WallToolbar).
 * Padrões: como nasce toda anotação (privacidade, cor da sub-nota) e as perguntas antes de salvar.
 * Categorias: a ordem das abas e, em cada uma, o ícone e a cor e o que ela muda em cima do mural.
 * Tudo vale na hora e fica guardado (ver core/mural-config.ts). Chega num pedaço à parte, só quando
 * a engrenagem é tocada.
 */
@Component({
  selector: 'app-mural-config',
  imports: [BackdropClose, CategoryLabel, CategoryStyle, LucideAngularModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mural-config.html',
  styleUrl: './mural-config.scss',
})
export class MuralConfig {
  /** A folha fechou. */
  readonly closed = output<void>();

  protected readonly settings = inject(Settings);
  private readonly store = inject(ReviewStore);
  /** Sem a nuvem, ninguém vê o mural: a privacidade só passa a valer quando a pessoa entrar. */
  protected readonly cloud = inject(Cloud);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly list = viewChild<ElementRef<HTMLOListElement>>('lista');
  private readonly injector = inject(Injector);

  protected readonly CloseIcon = X;
  protected readonly GripIcon = GripVertical;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly ResetIcon = Undo2;
  protected readonly sections = SECTIONS;
  protected readonly audiences = AUDIENCES;
  protected readonly audienceLabel = AUDIENCE_LABEL;
  protected readonly subColors = SUB_COLORS;
  protected readonly subLabel = SUB_LABEL;

  protected readonly section = signal<SectionId>(lastSection);
  protected readonly config = this.settings.notesConfig;
  /** A ordem montada à mão está valendo. */
  protected readonly manual = computed(() => this.config().orderBy === 'minha');

  /** As categorias das anotações: pela quantidade, ou na ordem montada (as novas no fim). */
  protected readonly categories = computed<CategoryRow[]>(() => {
    const seen = new Map<string, { n: number; spellings: Map<string, number> }>();
    for (const r of this.store.notes()) {
      const c = r.category?.trim();
      if (!c) continue;
      const key = lookKey(c);
      let b = seen.get(key);
      if (!b) seen.set(key, (b = { n: 0, spellings: new Map() }));
      b.n++;
      b.spellings.set(c, (b.spellings.get(c) ?? 0) + 1);
    }
    const rows = [...seen].map(([key, b]) => ({
      key,
      label: [...b.spellings.entries()].reduce((best, e) => (e[1] > best[1] ? e : best))[0],
      n: b.n,
    }));
    rows.sort((a, b) => b.n - a.n || collator.compare(a.label, b.label));
    if (!this.manual()) return rows;
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return arrangedKeys(this.config().order, rows.map((r) => r.key)).map((k) => byKey.get(k)!);
  });

  /** A categoria aberta (uma por vez, como o acordeão do perfil). */
  protected readonly open = signal<string | null>(null);
  protected readonly drag = signal<Drag | null>(null);
  /** O que o leitor de tela ouve depois de mover uma categoria. */
  protected readonly said = signal('');

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('.parte[aria-selected="true"]')?.focus();
    });
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
    else this.closed.emit();
  }

  // ===== as partes =====

  protected pick(id: SectionId): void {
    this.section.set(id);
    lastSection = id;
  }

  /** ←/→ (e ↑/↓), Home e End andam pelas partes, como numa lista de abas. */
  protected onIndexKey(e: KeyboardEvent): void {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = SECTIONS.findIndex((s) => s.id === this.section());
    const n = SECTIONS.length;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + n) % n;
    this.pick(SECTIONS[next].id);
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>('.parte[aria-selected="true"]')?.focus(), { injector: this.injector });
  }

  // ===== padrões =====

  protected setAudience(a: Audience): void {
    this.settings.setNotesConfig({ audience: a });
  }

  protected setSubColor(c: SubColor): void {
    this.settings.setNotesConfig({ subColor: c });
  }

  protected audienceDesc(a: Audience): string {
    return AUDIENCES.find((o) => o.value === a)!.desc;
  }

  protected subDesc(c: SubColor): string {
    return SUB_COLORS.find((o) => o.value === c)!.desc;
  }

  // ===== categorias =====

  protected lookOf(row: CategoryRow): CategoryLook {
    return this.settings.categoryLooks()[row.key] ?? {};
  }

  protected colorOf(row: CategoryRow): string | null {
    return categoryColorHex(this.lookOf(row).color);
  }

  protected prefsOf(row: CategoryRow): CategoryPrefs {
    return prefsOf(this.config(), row.label);
  }

  /** O que a categoria muda, numa linha curta ("Nasce Disponível · Cor da mãe"); vazio: segue o mural. */
  protected summaryOf(row: CategoryRow): string {
    const p = this.prefsOf(row);
    const parts: string[] = [];
    if (p.audience) parts.push(`Nasce ${AUDIENCE_LABEL[p.audience]}`);
    if (p.subColor) parts.push(`Sub-nota: ${SUB_LABEL[p.subColor].toLowerCase()}`);
    if (p.askTag !== undefined) parts.push(p.askTag ? 'Avisa sem tag' : 'Sem aviso de tag');
    return parts.join(' · ');
  }

  protected toggle(row: CategoryRow): void {
    this.open.update((k) => (k === row.key ? null : row.key));
  }

  protected setPrefs(row: CategoryRow, patch: CategoryPrefs): void {
    this.settings.setCategoryPrefs(row.label, patch);
  }

  protected resetPrefs(row: CategoryRow): void {
    this.settings.setCategoryPrefs(row.label, { audience: undefined, subColor: undefined, askTag: undefined });
  }

  /** Pela quantidade ou na ordem montada; a montada começa da ordem de agora e nunca se perde. */
  protected setOrderBy(manual: boolean): void {
    if (manual === this.manual()) return;
    const keys = this.categories().map((r) => r.key);
    this.settings.setNotesConfig(manual ? { orderBy: 'minha', order: arrangedKeys(this.config().order, keys) } : { orderBy: 'quantidade' });
  }

  private move(row: CategoryRow, to: number): void {
    const keys = this.categories().map((r) => r.key);
    const order = moveKey(keys, row.key, to);
    this.settings.setNotesConfig({ orderBy: 'minha', order });
    this.said.set(`${row.label}: ${order.indexOf(row.key) + 1}ª de ${order.length}.`);
  }

  /** ↑/↓ na alça sobem e descem a categoria; Home e End levam para o começo e o fim. */
  protected onHandleKey(e: KeyboardEvent, row: CategoryRow, i: number): void {
    const n = this.categories().length;
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (to === null) return;
    e.preventDefault();
    if (to < 0 || to >= n || to === i) return;
    this.move(row, to);
    // a alça continua com o foco, agora no lugar novo
    afterNextRender(() => this.list()?.nativeElement.querySelector<HTMLElement>(`[data-alca="${CSS.escape(row.key)}"]`)?.focus(), { injector: this.injector });
  }

  /** O deslocamento de cada linha enquanto uma é arrastada: ela segue o dedo, as outras abrem caminho. */
  protected shiftOf(i: number, key: string): number {
    const d = this.drag();
    if (!d) return 0;
    if (key === d.key) return d.dy;
    if (d.from < d.to && i > d.from && i <= d.to) return -d.step;
    if (d.from > d.to && i >= d.to && i < d.from) return d.step;
    return 0;
  }

  /** Arrastar pela alça (mouse, caneta ou dedo). */
  protected startDrag(e: PointerEvent, row: CategoryRow, from: number): void {
    if (e.button !== 0) return;
    const list = this.list()?.nativeElement;
    if (!list) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    // arrastando, nenhuma fica aberta: as linhas têm todas o mesmo jeito. Se a aberta estava acima,
    // a linha sobe ao fechar: o quanto ela subiu entra na conta, e ela continua debaixo do dedo
    const downY = e.clientY;
    const topAtDown = (handle.closest('li') as HTMLElement).getBoundingClientRect().top;
    this.open.set(null);
    // a parte rola sozinha quando o dedo chega perto da beirada (lista comprida)
    const scroller = list.closest<HTMLElement>('.conteudo');
    // medido no primeiro movimento, quando a aberta já fechou
    let start: { y: number; scroll: number; mids: number[]; step: number } | null = null;
    let lastY = downY;
    let edge = 0;
    let frame = 0;
    const measure = () => {
      const rects = [...list.querySelectorAll<HTMLElement>(':scope > li')].map((el) => el.getBoundingClientRect());
      const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0;
      const moved = rects[from].top - topAtDown;
      start = { y: downY + moved, scroll: scroller?.scrollTop ?? 0, mids: rects.map((r) => r.top + r.height / 2), step: rects[from].height + gap };
    };
    const update = () => {
      if (!start) return;
      // o quanto andou, contando o que a parte rolou: a linha segue o dedo mesmo rolando
      const dy = lastY - start.y + ((scroller?.scrollTop ?? 0) - start.scroll);
      const center = start.mids[from] + dy;
      let to = from;
      for (let j = 0; j < start.mids.length; j++) {
        if (j < from && center < start.mids[j]) {
          to = j;
          break;
        }
        if (j > from && center > start.mids[j]) to = j;
      }
      this.drag.set({ key: row.key, from, to, dy, step: start.step });
    };
    const roll = () => {
      frame = 0;
      if (!edge || !scroller) return;
      scroller.scrollTop += edge;
      update();
      frame = requestAnimationFrame(roll);
    };
    const onMove = (ev: PointerEvent) => {
      if (!start) measure();
      lastY = ev.clientY;
      update();
      const box = scroller?.getBoundingClientRect();
      edge = !box ? 0 : ev.clientY < box.top + 48 ? -8 : ev.clientY > box.bottom - 48 ? 8 : 0;
      if (edge && !frame) frame = requestAnimationFrame(roll);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      edge = 0;
      if (frame) cancelAnimationFrame(frame);
      const d = this.drag();
      this.drag.set(null);
      if (d && d.to !== d.from) this.move(row, d.to);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }
}
