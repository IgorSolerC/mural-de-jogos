import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from './icons';
import { NoteLinks, resolveNote } from '../core/note-links';
import { cap, profileOf } from '../core/kinds';
import { Review, isNote } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { DAY_MS } from '../core/dates';
import { WIDGETS, WIDGET_SIZES, WidgetDef, WidgetField, WidgetSize, WidgetValues, fieldsFor, widgetDef, widgetLines } from '../core/widgets';
import { BackdropClose } from './backdrop-close';
import { CardPicker } from './card-picker';
import { CoverSleeve } from './cover-sleeve';
import { NoteWidget } from './note-widget';
import { Pin } from './pin';
import { RichText } from './rich-text';
import { TableGrid } from './table-grid';
import { WIDGET_ICONS } from './widget-icons';
import { ImageProblem, imageFileOf, localImageId, localImageUrl, sizeLabel } from '../core/images';
import { ImageStore, StoredImage } from '../core/image-store';
import { ImageSync, shortReason } from '../core/image-sync';
import { CloudAccount } from '../core/cloud-account';


/** O que a folha devolve ao editor: o widget pronto para virar a linha do texto. */
export interface WidgetDone {
  name: string;
  args: string[];
  size: WidgetSize;
  /** O widget que mora em várias linhas (a tabela): as de baixo da marca (ver `WidgetDef.body`). */
  body?: string[];
}

/** Uma linha de campos da folha: um campo sozinho, ou os de mesmo `row` lado a lado. */
interface FieldRow {
  key: string;
  fields: WidgetField[];
}

/**
 * A folha do widget: onde se põe um widget novo no texto ou se mexe num que já está lá. É a ficha de
 * fichário das Configurações do mural: no índice de manilha, à esquerda, os widgets (trocar de um
 * para outro leva o link e o nome junto); à direita, o que ele mostra (o link, o título, quando) e a
 * Aparência (o jeito em miniaturas desenhadas, a escolhida presa com a tachinha, e o tamanho). Ao
 * lado, ou no alto quando falta largura, o palco: o widget de verdade, andando, na ficha do mural
 * (a cartolina da anotação, pregada na parede) ou aberto (a folha pautada da leitura).
 *
 * Só monta a escolha: quem escreve a linha no texto é o editor (`done`, `removed`).
 */
@Component({
  selector: 'app-widget-sheet',
  imports: [BackdropClose, CardPicker, CoverSleeve, IconModule, NgTemplateOutlet, NoteWidget, Pin, RichText, TableGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './widget-sheet.html',
  styleUrl: './widget-sheet.scss',
})
export class WidgetSheet {
  /** O widget com que a folha abre e os valores dos campos (os de um que já está no texto). */
  readonly start = input.required<{ name: string; values: WidgetValues }>();
  /** Mexendo num widget que já está no texto (troca a linha dele; dá para tirar). */
  readonly swap = input(false);
  /** O texto aparece na ficha do mural (a anotação): o palco mostra "Na ficha" e "Aberta". */
  readonly onCard = input(true);
  /** A cartolina da anotação, para a prévia na ficha. */
  readonly stock = input<string | null>(null);
  readonly links = input<NoteLinks | null>(null);
  /** As anotações onde a Nota escrita à mão (só o título) procura a ficha. */
  readonly notes = input<readonly Review[] | null>(null);
  /** A ficha que está sendo escrita (não se cola nela mesma). */
  readonly selfId = input<string | null>(null);

  readonly done = output<WidgetDone>();
  readonly removed = output<void>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly injector = inject(Injector);
  private readonly store = inject(ReviewStore);

  protected readonly sizes = WIDGET_SIZES;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly RemoveIcon = ICON.apagar;
  protected readonly OkIcon = ICON.pronto;
  protected readonly WarnIcon = ICON.aviso;
  protected readonly LinkIcon = ICON.link;
  protected readonly CardIcon = ICON.anotacoes;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly UploadIcon = ICON.enviar;
  protected readonly ids = 'wf-' + ++uid;

  /** O desenho de cada tamanho: a peça na ficha, da altura das linhas dele (3, 5, 7, 10), larga como um vídeo. */
  protected readonly sizeArt: Record<WidgetSize, { w: number; h: number }> = {
    mini: { w: 7, h: 4 },
    pequeno: { w: 12, h: 6.5 },
    medio: { w: 17, h: 9.5 },
    grande: { w: 25, h: 13.5 },
  };
  protected readonly views = [
    { value: 'ficha', label: 'Na ficha' },
    { value: 'aberta', label: 'Aberta' },
  ] as const;

  protected readonly name = signal('contador');
  protected readonly values = signal<WidgetValues>({ size: 'medio' });
  /** Onde o palco mostra o widget: na ficha do mural ou aberto (a leitura). */
  protected readonly view = signal<'ficha' | 'aberta'>('ficha');
  /** Tentou pôr sem o que falta: a folha diz o quê, e o campo fica marcado. */
  protected readonly tried = signal(false);
  protected readonly cardPickerOpen = signal(false);

  protected readonly def = computed<WidgetDef>(() => widgetDef(this.name()) ?? WIDGETS[0]);
  /** O jeito escolhido não tem tamanho (a tira e o texto inteiro da nota): o que a folha diz no lugar dele. */
  protected readonly fixedSize = computed(() => this.def().fixedSize?.(this.values()) ?? null);
  /** O tamanho; sem tamanho, o de sempre (que não se escreve no texto). */
  protected readonly size = computed<WidgetSize>(() => (this.fixedSize() || this.def().unsized ? 'medio' : (this.values()['size'] as WidgetSize | undefined) || 'medio'));
  protected readonly sizeHint = computed(() => WIDGET_SIZES.find((o) => o.value === this.size())?.hint ?? '');
  protected readonly cardView = computed(() => this.onCard() && this.view() === 'ficha');

  /** Os campos de agora: os do que ele mostra (em linhas) e os da Aparência (as miniaturas). */
  protected readonly shown = computed(() => fieldsFor(this.def(), this.values()));
  protected readonly rows = computed<FieldRow[]>(() => {
    const out: FieldRow[] = [];
    for (const f of this.shown()) {
      if (f.display === 'tiles' || f.display === 'segments') continue;
      const last = out.at(-1);
      if (f.row && last?.key === f.row) last.fields.push(f);
      else out.push({ key: f.row ?? f.key, fields: [f] });
    }
    return out;
  });
  protected readonly looks = computed(() => this.shown().filter((f) => f.display === 'tiles'));
  /** As escolhas da Aparência em recortes, como o tamanho (como o texto inteiro da Nota começa). */
  protected readonly segs = computed(() => this.shown().filter((f) => f.display === 'segments'));
  /** As dicas dos campos de uma linha, juntas embaixo dela (a do dia do mês; a da hora, só sem a hora). */
  protected hintsOf(row: FieldRow): string {
    return row.fields
      .filter((f) => f.hint && !(f.kind === 'time' && !f.required && this.values()[f.key]))
      .map((f) => f.hint)
      .join(' ');
  }

  /** Os parâmetros do widget; null, falta o que ele precisa. */
  protected readonly args = computed(() => this.def().write(this.values()));
  /**
   * O contador sem o dia, no palco: um exemplo com o que já foi escolhido (o título, o jeito, o
   * tamanho) e um dia daqui a 61 dias, para escolher o jeito vendo ele andar.
   */
  protected readonly sample = computed(() => {
    if (this.name() !== 'contador' || this.args()) return null;
    const v = this.values();
    const at = new Date(Date.now() + 61 * DAY_MS);
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
    return this.def().write({ ...v, date, time: v['time'] || '08:00', monthDay: '5', title: v['title'] || 'Exemplo' });
  });
  /** O widget de várias linhas (a tabela), no palco: o texto dele inteiro, desenhado como na leitura. */
  protected readonly blockText = computed(() => {
    const def = this.def();
    const args = this.args();
    if (!def.body || !args) return null;
    return widgetLines(def.name, args, 'medio', def.body(this.values())).join('\n');
  });
  protected readonly problem = computed(() => this.def().problem?.(this.values()) ?? null);
  protected readonly found = computed(() => (this.problem() ? null : (this.def().found?.(this.values()) ?? null)));
  /** O primeiro campo que falta (para levar o foco a ele e dizer no pé da folha). */
  protected readonly missing = computed<WidgetField | null>(() => {
    if (this.args()) return null;
    const fields = this.shown();
    return fields.find((f) => f.required && !this.values()[f.key]?.trim()) ?? fields.find((f) => f.required) ?? null;
  });
  protected readonly missingText = computed(() => {
    const f = this.missing();
    return f ? (f.missing ?? `Falta: ${f.label.toLowerCase()}`) : '';
  });

  /** A ficha que a Nota cola: pelo id; escrita à mão, a anotação do título. */
  protected readonly chosenCard = computed<Review | null>(() => {
    if (this.name() !== 'nota') return null;
    const v = this.values();
    if (v['id']) return this.store.get(v['id']) ?? null;
    return v['title'] ? resolveNote(this.notes() ?? this.store.notes(), v['title']) : null;
  });

  private cardJustPicked = false;

  // ===== a imagem do aparelho (o campo com `upload`: ver core/images.ts) =====

  private readonly images = inject(ImageStore);
  private readonly imageSync = inject(ImageSync);
  private readonly account = inject(CloudAccount);
  /** Uma imagem escolhida (ou colada no campo) sendo encolhida e guardada. */
  protected readonly savingImage = signal(false);
  protected readonly imageError = signal<string | null>(null);
  /**
   * A guardada que o campo tem agora: a fotinho (quando chega), o tamanho e onde ela está (na nuvem, ou
   * só neste aparelho e por quê); null se é um link.
   */
  protected readonly localImage = signal<{ src: string | null; meta: string; where: string } | null>(null);

  /** Abre a escolha de arquivo do aparelho (no celular, a galeria e a câmera). */
  protected chooseFile(): void {
    this.dialog().nativeElement.querySelector<HTMLInputElement>('.escolher-arquivo')?.click();
  }

  protected fromDevice(key: string, e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    // a mesma foto escolhida de novo também avisa
    input.value = '';
    if (file) void this.saveImage(key, file);
  }

  /** Colou uma imagem no campo do link (sem texto junto): ela vira a imagem do aparelho. */
  protected pasteImage(key: string, e: ClipboardEvent): void {
    if (e.clipboardData?.getData('text/plain')?.trim()) return;
    const file = imageFileOf(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    void this.saveImage(key, file);
  }

  /** Volta para o link: o campo esvazia e ganha o foco. */
  protected useLink(key: string): void {
    this.set(key, '');
    this.imageError.set(null);
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>(`input[data-campo="${key}"]`)?.focus(), { injector: this.injector });
  }

  private async saveImage(key: string, file: Blob): Promise<void> {
    this.savingImage.set(true);
    this.imageError.set(null);
    try {
      const image = await this.images.add(file);
      this.set(key, localImageUrl(image.id));
    } catch (error) {
      this.imageError.set(error instanceof ImageProblem ? error.message : 'A imagem não entrou. Tente de novo.');
    } finally {
      this.savingImage.set(false);
    }
  }

  constructor() {
    // a guardada do campo: a fotinho e o tamanho, do IndexedDB
    effect((onCleanup) => {
      const field = this.shown().find((f) => f.upload);
      const id = field ? localImageId(this.values()[field.key] ?? '') : null;
      this.images.version();
      const problem = this.imageSync.problem();
      this.account.signedIn();
      if (!id) return this.localImage.set(null);
      // a parte da guardada aparece já (sem piscar o campo do link), e a fotinho chega depois; a que
      // está em outro aparelho desce da nuvem
      this.localImage.update((v) => v ?? { src: null, meta: '', where: '' });
      let alive = true;
      onCleanup(() => (alive = false));
      void (async () => {
        const src = (await this.images.url(id)) ?? (await this.imageSync.fetch(id));
        const image = await this.images.get(id);
        if (alive) this.localImage.set({ src, meta: image ? `${image.largura} × ${image.altura} px · ${sizeLabel(image.bytes)}` : 'Ainda não chegou a este aparelho', where: whereOf(image, problem, this.account.signedIn()) });
      })();
    });
    afterNextRender(() => {
      const s = this.start();
      this.name.set(widgetDef(s.name)?.name ?? WIDGETS[0].name);
      this.values.set({ size: 'medio', ...s.values });
      const el = this.dialog().nativeElement;
      el.showModal();
      // a Nota nova já abre a lista: escolher a ficha é a primeira coisa a fazer
      if (this.name() === 'nota' && !this.swap() && !this.chosenCard()) this.cardPickerOpen.set(true);
      else afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>('[data-campo]')?.focus(), { injector: this.injector });
    });
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
    else this.closed.emit();
  }

  // ===== os campos =====

  protected iconOf(name: string): LucideIconData {
    return WIDGET_ICONS[name] ?? ICON.widgets;
  }

  protected set(key: string, value: string): void {
    this.values.update((v) => ({ ...v, [key]: value }));
  }

  protected valueOf(f: WidgetField): string {
    return this.values()[f.key] || (f.options?.[0]?.value ?? '');
  }

  /** O nome da escolha de agora ("Uma vez", "Polaroide"). */
  protected labelOf(f: WidgetField): string {
    const v = this.valueOf(f);
    return f.options?.find((o) => o.value === v)?.label ?? '';
  }

  protected readonly isNoteCard = isNote;

  /** O campo que falta e já se tentou pôr: a linha dele fica na tinta de erro. */
  protected isMissing(f: WidgetField): boolean {
    return this.tried() && this.missing()?.key === f.key;
  }

  /** Os dias da semana: as setas trocam, como num grupo de rádios. */
  protected onDaysKey(e: KeyboardEvent, f: WidgetField): void {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const options = f.options ?? [];
    if (!step || !options.length) return;
    e.preventDefault();
    const at = Math.max(0, options.findIndex((o) => o.value === this.valueOf(f)));
    this.set(f.key, options[(at + step + options.length) % options.length].value);
    const group = (e.currentTarget as HTMLElement).parentElement;
    afterNextRender(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(), { injector: this.injector });
  }

  // ===== a Nota: qual ficha =====

  protected pickCard(card: Review): void {
    this.values.update((v) => ({ ...v, id: card.id, title: card.game.name }));
    this.cardJustPicked = true;
  }

  /** A lista fechou: o foco vai para o botão de pôr, se escolheu uma; senão, de volta para a ficha. */
  protected cardPickerOpened(open: boolean): void {
    this.cardPickerOpen.set(open);
    if (open) return;
    const picked = this.cardJustPicked;
    this.cardJustPicked = false;
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>(picked ? '.pe .ok' : '[data-campo="id"]')?.focus(), { injector: this.injector });
  }

  /** "Anotação · Pessoal", "Jogo"… o mural da ficha escolhida. */
  protected kindOf(r: Review): string {
    return isNote(r) ? `Anotação${r.category ? ' · ' + r.category : ''}` : cap(profileOf(r.kind).singular);
  }

  // ===== o pé =====

  /** Pôr (ou salvar): sem o que ele precisa, o foco vai para o primeiro campo que falta. */
  protected put(): void {
    const args = this.args();
    if (!args) {
      this.tried.set(true);
      const f = this.missing();
      if (f?.kind === 'card') this.cardPickerOpen.set(true);
      else this.dialog().nativeElement.querySelector<HTMLElement>(`[data-campo="${f?.key ?? ''}"]`)?.focus();
      return;
    }
    const body = this.def().body?.(this.values());
    this.done.emit({ name: this.name(), args, size: this.size(), ...(body ? { body } : {}) });
    this.close();
  }

  protected remove(): void {
    this.removed.emit();
    this.close();
  }
}

let uid = 0;

/** Onde a imagem guardada está, numa frase curta (vazia: ela não está neste aparelho). */
function whereOf(image: StoredImage | null, problem: { code: string; message: string } | null, signedIn: boolean): string {
  if (!image) return '';
  if (image.estado === 'na-nuvem') return 'Guardada na nuvem';
  if (image.estado === 'recusada') return 'Só neste aparelho: a nuvem não aceitou esta imagem';
  if (!signedIn) return 'Só neste aparelho (fora da conta)';
  const why = shortReason(problem);
  return why ? `Só neste aparelho por enquanto (${why})` : 'Subindo para a nuvem…';
}
