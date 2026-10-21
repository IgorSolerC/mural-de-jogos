import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from './icons';
import { CategoryLook, categoryColorHex, lookKey, tagColorHex } from '../core/category-looks';
import { Cloud } from '../core/cloud-config';
import { KanbanStore } from '../core/kanban-store';
import { LabelEditResult, LabelEdits } from '../core/label-edits';
import { CategoryPrefs, GroupView, arrangedKeys, kanbanOnly, moveKey, prefsOf, savedSubjects, tagHiddenByDefault } from '../core/mural-config';
import type { Audience } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { LABEL_MAX, SubjectEntry, cleanCategory, cleanSubject, cleanTag, subjectLibrary } from '../core/note-labels';
import { Settings } from '../core/settings';
import { BackdropClose } from './backdrop-close';
import { CategoryLabel } from './category-label';
import { CategoryStyle } from './category-style';
import { Confirm } from './confirm';
import { NoteTag } from './note-tag';
import { Pin } from './pin';
import { TagColors } from './tag-colors';
import { nameCollator, plural } from '../core/text';
import { tabStep } from './focus';

/**
 * As partes da folha, uma por vez, como as partes dos Ajustes. Para crescer, uma entrada aqui e o
 * bloco dela no template: o índice e o teclado já dão conta. A última, Quadro, só aparece quando a
 * folha abre pela engrenagem do Kanban (ver `board`).
 */
const SECTIONS = [
  { id: 'padroes', label: 'Padrões', hint: 'Como nasce cada anotação', icon: ICON.ajustar },
  { id: 'categorias', label: 'Grupos', hint: 'Nome, ordem, cor e padrões', icon: ICON.etiquetas },
  { id: 'assuntos', label: 'Assuntos', hint: 'Por grupo: criar e renomear', icon: ICON.assunto },
  { id: 'tags', label: 'Tags', hint: 'Por grupo: nome e cor', icon: ICON.etiqueta },
  { id: 'quadro', label: 'Quadro', hint: 'O quadro deste grupo', icon: ICON.colunas },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

/** A parte aberta da última vez (enquanto o site está aberto). */
let lastSection: SectionId = 'padroes';

const AUDIENCES: readonly { value: Audience; label: string; icon: LucideIconData; desc: string }[] = [
  { value: 'privada', label: 'Privada', icon: ICON.privada, desc: 'Fica só com você, e ninguém é avisado.' },
  { value: 'visivel', label: 'Disponível', icon: ICON.publica, desc: 'No seu mural e no seu perfil, sem aparecer no Feed.' },
  { value: 'publicar', label: 'Publicar', icon: ICON.megafone, desc: 'No seu mural e no Feed de quem segue você.' },
];
const AUDIENCE_LABEL: Record<Audience, string> = { privada: 'Privada', visivel: 'Disponível', publicar: 'Publicar' };

/** As visualizações que um grupo pode escolher para abrir, com os desenhos dos botões da régua do mural. */
const VIEWS: readonly { value: GroupView; label: string; icon: LucideIconData }[] = [
  { value: 'completa', label: 'Comuns', icon: ICON.completas },
  { value: 'inteira', label: 'Inteiras', icon: ICON.painel },
  { value: 'simples', label: 'Simples', icon: ICON.simples },
  { value: 'capas', label: 'Capa e nome', icon: ICON.grade },
  { value: 'lista', label: 'Lista', icon: ICON.lista },
];
/** Como o resumo da linha do grupo diz a visualização ("Abre em lista"). */
const VIEW_SAID: Record<GroupView, string> = { completa: 'fichas comuns', inteira: 'fichas inteiras', simples: 'fichas simples', capas: 'capa e nome', lista: 'lista' };

/** Uma categoria ou uma tag das anotações, na lista da folha. */
interface CategoryRow {
  key: string;
  /** A grafia mais usada. */
  label: string;
  /** Quantas anotações (finalizadas também). */
  n: number;
}


/** Conta os nomes (sem acento nem caixa), com a grafia mais usada de cada um, do mais usado ao menos. */
function tally(names: Iterable<string>): CategoryRow[] {
  const seen = new Map<string, { n: number; spellings: Map<string, number> }>();
  for (const raw of names) {
    const c = raw.trim();
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
  return rows.sort((a, b) => b.n - a.n || nameCollator.compare(a.label, b.label));
}

/** As tags de uma categoria, na parte Tags: cada categoria com as suas. */
interface TagGroup {
  /** A chave da categoria ("" para as anotações sem categoria). */
  key: string;
  /** O nome à mostra ("Sem categoria" para as sem). */
  label: string;
  /** A categoria como vai para as cores e o renomear ("" para as sem). */
  category: string;
  tags: CategoryRow[];
}

/** Os assuntos de um grupo, na parte Assuntos: cada grupo com os seus (também os ainda sem nenhum). */
interface SubjectGroup {
  /** A chave do grupo ("" para as anotações sem grupo). */
  key: string;
  label: string;
  /** O grupo como vai para o renomear e a lista dos criados ("" para as sem grupo). */
  category: string;
  subjects: SubjectEntry[];
}

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
 * Padrões: como nasce toda anotação (a privacidade) e as perguntas antes de salvar.
 * Categorias: a ordem das abas e, em cada uma, o ícone e a cor e o que ela muda em cima do mural.
 * Tags: as tags de cada categoria, com a cor de cada uma ali (a mesma no mural e no quadro do Kanban
 * daquela categoria).
 * Nas duas, renomear e apagar (em toda anotação que usa; ver core/label-edits.ts), apagar com a
 * pergunta antes.
 * Quadro: só pela engrenagem do Kanban, que abre esta mesma folha com o quadro dela; recomeçar o
 * quadro (a página recomeça, com o Desfazer).
 * Tudo vale na hora e fica guardado (ver core/mural-config.ts). Chega num pedaço à parte, só quando
 * a engrenagem é tocada.
 */
@Component({
  selector: 'app-mural-config',
  imports: [BackdropClose, CategoryLabel, CategoryStyle, IconModule, NoteTag, Pin, TagColors],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mural-config.html',
  styleUrl: './mural-config.scss',
})
export class MuralConfig {
  /** O quadro do Kanban de onde a folha abriu (o id): com ele, a parte Quadro. */
  readonly board = input<string | null>(null);
  /** A folha fechou. */
  readonly closed = output<void>();
  /** Recomeçar o quadro: a página recomeça (com o Desfazer) depois da pergunta. */
  readonly resetting = output<string>();

  protected readonly settings = inject(Settings);
  private readonly store = inject(ReviewStore);
  /** Sem a nuvem, ninguém vê o mural: a privacidade só passa a valer quando a pessoa entrar. */
  protected readonly cloud = inject(Cloud);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly list = viewChild<ElementRef<HTMLOListElement>>('lista');
  private readonly injector = inject(Injector);
  private readonly edits = inject(LabelEdits);
  private readonly confirm = inject(Confirm);
  private readonly kanban = inject(KanbanStore);

  protected readonly CloseIcon = ICON.fechar;
  protected readonly GripIcon = ICON.arrastar;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly ResetIcon = ICON.recomecar;
  protected readonly ShownIcon = ICON.ver;
  protected readonly HiddenIcon = ICON.esconder;
  protected readonly RenameIcon = ICON.editar;
  protected readonly DeleteIcon = ICON.apagar;
  protected readonly OkIcon = ICON.pronto;
  protected readonly AddIcon = ICON.adicionar;
  protected readonly labelMax = LABEL_MAX;
  protected readonly ResetBoardIcon = ICON.recomecar;
  /** As partes à mostra: o Quadro só pelo Kanban. */
  protected readonly sections = computed(() => SECTIONS.filter((s) => s.id !== 'quadro' || !!this.board()));
  protected readonly audiences = AUDIENCES;
  protected readonly audienceLabel = AUDIENCE_LABEL;
  protected readonly views = VIEWS;

  /** A parte aberta da última vez, menos o Quadro pela engrenagem do mural (lá ele não existe). */
  protected readonly section = signal<SectionId>(lastSection === 'quadro' && !this.board() ? 'padroes' : lastSection);

  /** O quadro do Kanban de onde a folha abriu (ou nada, pela engrenagem do mural). */
  protected readonly quadro = computed(() => {
    const id = this.board();
    return id ? (this.kanban.get(id) ?? null) : null;
  });
  /** O nome do grupo do quadro, como no mural. */
  protected readonly quadroGrupo = computed(() => {
    const b = this.quadro();
    return b ? (this.kanban.labelOf(b) ?? b.category) : '';
  });
  /** Quantas anotações estão no quadro de verdade. */
  protected readonly quadroNotas = computed(() => {
    const b = this.quadro();
    return b ? this.kanban.live(b).length : 0;
  });
  /** As anotações do quadro aberto ficam só no Kanban (a escolha do grupo dele)? */
  protected readonly quadroSoKanban = computed(() => !!this.quadro() && kanbanOnly(this.config(), this.quadroGrupo()));
  protected setQuadroSoKanban(on: boolean): void {
    const label = this.quadroGrupo();
    if (label) this.settings.setCategoryPrefs(label, { kanbanOnly: on ? undefined : false });
  }
  protected readonly config = this.settings.notesConfig;
  /** A ordem montada à mão está valendo. */
  protected readonly manual = computed(() => this.config().orderBy === 'minha');

  /** As categorias das anotações: pela quantidade, ou na ordem montada (as novas no fim). */
  protected readonly categories = computed<CategoryRow[]>(() => {
    const rows = tally(this.store.notes().flatMap((r) => (r.category ? [r.category] : [])));
    if (!this.manual()) return rows;
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return arrangedKeys(this.config().order, rows.map((r) => r.key)).map((k) => byKey.get(k)!);
  });

  /**
   * As tags de cada categoria, na ordem das categorias (a das abas), e as das anotações sem categoria
   * por último; em cada uma, da mais usada para a menos (finalizadas também). A mesma tag aparece em
   * cada categoria em que é usada, com a cor dela ali.
   */
  protected readonly tagGroups = computed<TagGroup[]>(() => {
    const notes = this.store.notes();
    const groups: TagGroup[] = [];
    for (const c of this.categories()) {
      const tags = tally(notes.filter((r) => !!r.category && lookKey(r.category) === c.key).flatMap((r) => r.tags ?? []));
      if (tags.length) groups.push({ key: c.key, label: c.label, category: c.label, tags });
    }
    const loose = tally(notes.filter((r) => !r.category?.trim()).flatMap((r) => r.tags ?? []));
    if (loose.length) groups.push({ key: '', label: 'Sem grupo', category: '', tags: loose });
    return groups;
  });

  /**
   * Os assuntos de cada grupo, na ordem dos grupos (a das abas), e os das anotações sem grupo por
   * último (só quando há algum): os criados aqui primeiro, depois os usados (ver `subjectLibrary`).
   */
  protected readonly subjectGroups = computed<SubjectGroup[]>(() => {
    const notes = this.store.notes();
    const cfg = this.config();
    const groups: SubjectGroup[] = this.categories().map((c) => ({ key: c.key, label: c.label, category: c.label, subjects: subjectLibrary(notes, savedSubjects(cfg, c.label), c.label) }));
    const loose = subjectLibrary(notes, savedSubjects(cfg, ''), null);
    if (loose.length) groups.push({ key: '', label: 'Sem grupo', category: '', subjects: loose });
    return groups;
  });

  /** Os assuntos do grupo, numa linha para o painel dele em Grupos ("História, Geografia e Matemática"). */
  protected subjectsLine(row: CategoryRow): string {
    const names = this.subjectGroups().find((g) => g.key === row.key)?.subjects.map((s) => s.label) ?? [];
    if (!names.length) return 'Nenhum ainda.';
    const shown = names.slice(0, 5);
    const rest = names.length - shown.length;
    const list = rest ? `${shown.join(', ')} e mais ${rest}` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} e ${shown.at(-1)}` : shown[0];
    return `${list}.`;
  }

  /** O assunto sendo renomeado (o grupo e a chave), com o campo no lugar dele. */
  protected readonly renamingSubject = signal<string | null>(null);

  /** A categoria aberta (uma por vez, como o acordeão do perfil). */
  protected readonly open = signal<string | null>(null);
  protected readonly drag = signal<Drag | null>(null);
  /** O que o leitor de tela ouve depois de mover uma categoria. */
  protected readonly said = signal('');
  /** O recado depois de renomear ou apagar (à mostra, no alto da parte): o que mudou e onde. */
  protected readonly notice = signal('');
  /** A tag sendo renomeada (a chave), com o campo no lugar dela. */
  protected readonly renamingTag = signal<string | null>(null);

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
    if (id !== this.section()) this.notice.set('');
    this.section.set(id);
    lastSection = id;
  }

  /** ←/→ (e ↑/↓), Home e End andam pelas partes, como numa lista de abas. */
  protected onIndexKey(e: KeyboardEvent): void {
    const sections = this.sections();
    const next = tabStep(e.key, sections.findIndex((s) => s.id === this.section()), sections.length);
    if (next < 0) return;
    e.preventDefault();
    this.pick(sections[next].id);
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>('.parte[aria-selected="true"]')?.focus(), { injector: this.injector });
  }

  // ===== quadro =====

  protected async resetBoard(): Promise<void> {
    const b = this.quadro();
    if (!b) return;
    const n = this.quadroNotas();
    const yes = await this.confirm.ask({
      title: `Recomeçar o quadro de ${this.quadroGrupo()}?`,
      text: n
        ? `As colunas voltam a ser A fazer, Fazendo e Feito, e as anotações saem do quadro. ${n === 1 ? 'Ela fica' : `As ${n} ficam`} no mural, sem nada apagado.`
        : 'As colunas voltam a ser A fazer, Fazendo e Feito. Nenhuma anotação muda.',
      confirm: 'Recomeçar',
      cancel: 'Deixar',
      icon: ICON.recomecar,
    });
    if (!yes) return;
    this.close();
    this.resetting.emit(b.id);
  }

  // ===== padrões =====

  protected setAudience(a: Audience): void {
    this.settings.setNotesConfig({ audience: a });
  }

  protected audienceDesc(a: Audience): string {
    return AUDIENCES.find((o) => o.value === a)!.desc;
  }

  // ===== renomear e apagar =====

  /** "em 3 anotações". */
  private told(r: LabelEditResult): string {
    return `em ${plural(r.changed, 'anotação', 'anotações')}.`;
  }

  private uses(n: number): string {
    return plural(n, 'anotação usa', 'anotações usam');
  }

  protected async renameCategory(e: Event, row: CategoryRow, field: HTMLInputElement): Promise<void> {
    e.preventDefault();
    const name = cleanCategory(field.value);
    if (!name || name === row.label) {
      field.value = row.label;
      return;
    }
    const other = this.edits.existingCategory(name, row.label);
    if (other) {
      const sure = await this.confirm.ask({
        title: `Juntar com ${other}?`,
        text: `Já existe o grupo ${other}. As anotações de ${row.label} passam para ele, e ficam a cor, os padrões e o quadro do Kanban de ${other}.`,
        confirm: `Juntar com ${other}`,
        tone: 'neutro',
        icon: null,
      });
      if (!sure) {
        field.value = row.label;
        return;
      }
    }
    const r = this.edits.renameCategory(row.label, other ?? name);
    this.open.set(lookKey(other ?? name));
    this.notice.set(other ? `${row.label} entrou em ${other} ${this.told(r)}` : `${row.label} virou ${name} ${this.told(r)}`);
  }

  protected async deleteCategory(row: CategoryRow): Promise<void> {
    const sure = await this.confirm.ask({
      title: `Apagar o grupo ${row.label}?`,
      text: `${this.uses(row.n)} este grupo. Elas continuam no mural, sem grupo; o ícone, a cor, os padrões e o quadro do Kanban dele vão embora.`,
      confirm: 'Apagar o grupo',
      icon: this.DeleteIcon,
    });
    if (!sure) return;
    this.open.set(null);
    const r = this.edits.renameCategory(row.label, null);
    this.notice.set(`${row.label} foi apagado ${this.told(r)}`);
  }

  /** O id de uma tag na folha: a categoria e a tag (a mesma tag aparece em cada categoria). */
  protected tagId(group: TagGroup, row: CategoryRow): string {
    return `${group.key}|${row.key}`;
  }

  protected startTagRename(group: TagGroup, row: CategoryRow): void {
    const id = this.tagId(group, row);
    this.renamingTag.set(id);
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLInputElement>(`[data-tag-campo="${CSS.escape(id)}"]`)?.select(), { injector: this.injector });
  }

  /** Fecha o campo da tag e devolve o foco ao lápis dela. */
  protected stopTagRename(id: string): void {
    this.renamingTag.set(null);
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>(`[data-tag-lapis="${CSS.escape(id)}"]`)?.focus(), { injector: this.injector });
  }

  /** "Em Trabalho, " ou "Nas anotações sem categoria, ": onde a tag mudou. */
  private where(group: TagGroup): string {
    return group.category ? `Em ${group.label}, ` : 'Nas anotações sem grupo, ';
  }

  protected async renameTag(e: Event, group: TagGroup, row: CategoryRow, field: HTMLInputElement): Promise<void> {
    e.preventDefault();
    const name = cleanTag(field.value);
    if (!name || name === row.label) {
      this.stopTagRename(this.tagId(group, row));
      return;
    }
    const other = this.edits.existingTag(name, row.label, group.category);
    if (other) {
      const sure = await this.confirm.ask({
        title: `Juntar com ${other}?`,
        text: `${group.category ? `${group.label} já tem a tag ${other}` : `As anotações sem grupo já têm a tag ${other}`}. As anotações com ${row.label} passam a ter ${other}, com a cor dela.`,
        confirm: `Juntar com ${other}`,
        tone: 'neutro',
        icon: null,
      });
      if (!sure) return;
    }
    const r = this.edits.renameTag(row.label, group.category, other ?? name);
    this.stopTagRename(`${group.key}|${lookKey(other ?? name)}`);
    this.notice.set(`${this.where(group)}${row.label} ${other ? `entrou em ${other}` : `virou ${name}`} ${this.told(r)}`);
  }

  protected async deleteTag(group: TagGroup, row: CategoryRow): Promise<void> {
    const sure = await this.confirm.ask({
      title: group.category ? `Apagar a tag ${row.label} de ${group.label}?` : `Apagar a tag ${row.label}?`,
      text: `${this.uses(row.n)} esta tag${group.category ? ` em ${group.label}` : ' sem grupo'}. Ela sai delas, e a cor dela ali vai embora; nos outros grupos, ela continua.`,
      confirm: 'Apagar a tag',
      icon: this.DeleteIcon,
    });
    if (!sure) return;
    this.renamingTag.set(null);
    const r = this.edits.renameTag(row.label, group.category, null);
    this.notice.set(`${this.where(group)}${row.label} foi apagada ${this.told(r)}`);
  }

  // ===== assuntos =====

  /** De Grupos para Assuntos, já no grupo e com o foco no "Novo assunto" dele. */
  protected openSubjects(row: CategoryRow): void {
    this.pick('assuntos');
    afterNextRender(
      () => {
        const field = this.dialog().nativeElement.querySelector<HTMLInputElement>(`[data-novo-assunto="${CSS.escape(row.key)}"]`);
        field?.scrollIntoView({ block: 'center' });
        field?.focus();
      },
      { injector: this.injector },
    );
  }

  protected subjectId(group: SubjectGroup, s: SubjectEntry): string {
    return `${group.key}|${lookKey(s.label)}`;
  }

  /** "em 3 anotações", ou "ainda em nenhuma anotação". */
  protected subjectUses(s: SubjectEntry): string {
    return s.n ? plural(s.n, 'anotação', 'anotações') : 'Ainda em nenhuma';
  }

  /** Um assunto novo para o grupo: fica à mão no editor e no filtro, mesmo antes de alguma anotação usar. */
  protected addSubject(e: Event, group: SubjectGroup, field: HTMLInputElement): void {
    e.preventDefault();
    const name = cleanSubject(field.value);
    if (!name) return;
    const twin = group.subjects.find((s) => lookKey(s.label) === lookKey(name));
    field.value = '';
    if (twin) {
      this.notice.set(group.category ? `${group.label} já tem o assunto ${twin.label}.` : `As anotações sem grupo já têm o assunto ${twin.label}.`);
      return;
    }
    this.settings.setSavedSubjects(group.category, [...savedSubjects(this.config(), group.category), name]);
    this.notice.set(group.category ? `${name} entrou nos assuntos de ${group.label}.` : `${name} entrou nos assuntos das anotações sem grupo.`);
  }

  protected startSubjectRename(group: SubjectGroup, s: SubjectEntry): void {
    const id = this.subjectId(group, s);
    this.renamingSubject.set(id);
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLInputElement>(`[data-assunto-campo="${CSS.escape(id)}"]`)?.select(), { injector: this.injector });
  }

  /** Fecha o campo do assunto e devolve o foco ao lápis dele. */
  protected stopSubjectRename(id: string): void {
    this.renamingSubject.set(null);
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>(`[data-assunto-lapis="${CSS.escape(id)}"]`)?.focus(), { injector: this.injector });
  }

  protected async renameSubject(e: Event, group: SubjectGroup, s: SubjectEntry, field: HTMLInputElement): Promise<void> {
    e.preventDefault();
    const name = cleanSubject(field.value);
    if (!name || name === s.label) {
      this.stopSubjectRename(this.subjectId(group, s));
      return;
    }
    const other = this.edits.existingSubject(name, s.label, group.category);
    if (other) {
      const sure = await this.confirm.ask({
        title: `Juntar com ${other}?`,
        text: `${group.category ? `${group.label} já tem o assunto ${other}` : `As anotações sem grupo já têm o assunto ${other}`}. As anotações de ${s.label} passam para ${other}.`,
        confirm: `Juntar com ${other}`,
        tone: 'neutro',
        icon: null,
      });
      if (!sure) return;
    }
    const r = this.edits.renameSubject(s.label, group.category, other ?? name);
    this.stopSubjectRename(`${group.key}|${lookKey(other ?? name)}`);
    const where = group.category ? `Em ${group.label}, ` : 'Nas anotações sem grupo, ';
    this.notice.set(`${where}${s.label} ${other ? `entrou em ${other}` : `virou ${name}`}${s.n ? ` ${this.told(r)}` : '.'}`);
  }

  protected async deleteSubject(group: SubjectGroup, s: SubjectEntry): Promise<void> {
    if (s.n) {
      const sure = await this.confirm.ask({
        title: group.category ? `Apagar o assunto ${s.label} de ${group.label}?` : `Apagar o assunto ${s.label}?`,
        text: `${this.uses(s.n)} este assunto. Elas continuam no mural, no mesmo grupo, sem assunto.`,
        confirm: 'Apagar o assunto',
        icon: this.DeleteIcon,
      });
      if (!sure) return;
    }
    this.renamingSubject.set(null);
    const r = this.edits.renameSubject(s.label, group.category, null);
    const where = group.category ? `Em ${group.label}, ` : 'Nas anotações sem grupo, ';
    this.notice.set(`${where}${s.label} foi apagado${s.n ? ` ${this.told(r)}` : '.'}`);
  }

  /** O ícone e a cor do grupo pela chave (na orelha da parte Assuntos). */
  protected groupLookOf(key: string): CategoryLook {
    return this.settings.categoryLooks()[key] ?? {};
  }

  protected groupColorOf(key: string): string | null {
    return categoryColorHex(this.groupLookOf(key).color);
  }

  // ===== tags =====

  /** O ícone e a cor da categoria do grupo, na orelha (como na parte Categorias). */
  protected groupLook(group: TagGroup): CategoryLook {
    return this.settings.categoryLooks()[group.key] ?? {};
  }

  protected groupColor(group: TagGroup): string | null {
    return categoryColorHex(this.groupLook(group).color);
  }

  protected tagColorOf(group: TagGroup, row: CategoryRow): string | null {
    return tagColorHex(this.settings.categoryLooks(), row.label, group.category);
  }

  /** O filtro padrão da tag na categoria: Excluído (cada visita começa sem as anotações dela). */
  protected tagHidden(group: TagGroup, row: CategoryRow): boolean {
    return tagHiddenByDefault(this.settings.notesConfig(), row.label, group.category);
  }

  protected setTagHidden(group: TagGroup, row: CategoryRow, hidden: boolean): void {
    if (this.tagHidden(group, row) === hidden) return;
    this.settings.setTagHidden(row.label, group.category, hidden);
    const where = group.category ? ` em ${group.label}` : ' nas sem grupo';
    this.notice.set(hidden ? `As anotações com ${row.label}${where} começam escondidas no filtro do mural e do Kanban.` : `${row.label}${where} volta a aparecer no filtro.`);
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

  /** O que a categoria muda, numa linha curta ("Nasce Disponível · Avisa sem tag"); vazio: segue o mural. */
  protected summaryOf(row: CategoryRow): string {
    const p = this.prefsOf(row);
    const parts: string[] = [];
    if (p.audience) parts.push(`Nasce ${AUDIENCE_LABEL[p.audience]}`);
    if (p.askTag !== undefined) parts.push(p.askTag ? 'Avisa sem tag' : 'Sem aviso de tag');
    if (p.view) parts.push(`Abre em ${VIEW_SAID[p.view]}`);
    if (p.kanbanOnly === false) parts.push('Kanban no mural também');
    return parts.join(' · ');
  }

  /** Escondida: a aba dela fica sempre no "Mais" (o mural continua mostrando as anotações em Tudo). */
  protected isHidden(row: CategoryRow): boolean {
    return !!this.prefsOf(row).hidden;
  }

  protected toggleHidden(row: CategoryRow): void {
    const hide = !this.isHidden(row);
    this.settings.setCategoryPrefs(row.label, { hidden: hide || undefined });
    this.said.set(hide ? `${row.label} escondida: a aba fica no Mais.` : `${row.label} de volta às abas.`);
  }

  protected toggle(row: CategoryRow): void {
    this.open.update((k) => (k === row.key ? null : row.key));
  }

  protected setPrefs(row: CategoryRow, patch: CategoryPrefs): void {
    this.settings.setCategoryPrefs(row.label, patch);
  }

  protected resetPrefs(row: CategoryRow): void {
    this.settings.setCategoryPrefs(row.label, { audience: undefined, askTag: undefined, kanbanOnly: undefined });
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
