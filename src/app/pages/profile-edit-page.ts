import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from '../ui/icons';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { KINDS, Kind, cap, countOf, profileOf } from '../core/kinds';
import {
  PAGE_BACKGROUNDS,
  PROFILE_FRAMES,
  PROFILE_LIMITS,
  PROFILE_MATERIALS,
  FrameStyle,
  PageBackground,
  ProfileBackground,
  ProfileMaterial,
  ProfileSection,
  SECTION_DENSITIES,
  SectionDensity,
  SectionFill,
  SectionFrame,
  WALLS_LOOKS,
  WallsLook,
  cleanImageUrl,
  newSection,
  profileStats,
  sanitizeTopics,
  updatedLabel,
} from '../core/profile';
import { ProfileStore } from '../core/profile-store';
import { LIGHT_STOCKS, DARK_STOCKS, Review, STOCK_LABEL, Stock, isDone, isNote, shownToOthers } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { KanbanStore } from '../core/kanban-store';
import { OWNER_NAME_MAX, Settings } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { CoverSleeve } from '../ui/cover-sleeve';
import { KIND_ICON } from '../ui/kind-switcher';
import { Pin } from '../ui/pin';
import { FramePicker } from '../ui/frame-picker';
import { PageWall } from '../ui/page-wall';
import { ProfileHero } from '../ui/profile-hero';
import { ProfileSectionView } from '../ui/profile-section';
import { ProfileWalls } from '../ui/profile-walls';
import { ProfilePicker } from '../ui/profile-picker';
import { EmojiPanel } from '../ui/emoji-panel';
import { RichEditor } from '../ui/rich-editor';
import { plural } from '../core/text';
import { focusAfterRender } from '../ui/focus';

/** Quantas fichas de uma seção aparecem antes do "Mostrar todas". */
const FOLDED_ITEMS = 6;

/** A partir dessa largura, a prévia fica presa à direita; antes, ela entra na ficha que está sendo mexida. */
const SIDE_PREVIEW = '(min-width: 1180px)';

/** As fichas da página, uma por parte do perfil: só uma fica aberta de cada vez. */
type Part = 'voce' | 'fundo' | 'pagina' | 'murais' | 'secoes';

/** A parte do perfil sendo mexida agora (a que a prévia mostra): uma ficha, ou uma seção pelo id. */
type Editing = Part | { section: string };

/**
 * As Configurações do perfil: o que quem abre o seu nome vê. À esquerda, as fichas com cada parte
 * (Você, Moldura e fundo, Parede, Seus murais, Seções), fechadas, cada uma com o que tem dentro e um
 * resumo do que está escolhido; abrir uma fecha a outra, e o mesmo vale para as seções. À direita, ao
 * vivo, a parte aberta como os outros vão ver (o quadro de cima, as pastas ou a seção), em cima da
 * parede escolhida. Na tela estreita, a prévia entra no pé da ficha aberta. Como os Ajustes, nada tem
 * botão de salvar: vale na hora (e vai para a nuvem com o mural).
 */
@Component({
  selector: 'app-profile-edit-page',
  imports: [CoverSleeve, EmojiPanel, IconModule, FramePicker, NgTemplateOutlet, PageWall, Pin, ProfileHero, ProfilePicker, ProfileSectionView, ProfileWalls, RichEditor, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-edit-page.html',
  styleUrl: './profile-edit-page.scss',
})
export class ProfileEditPage {
  protected readonly profiles = inject(ProfileStore);
  protected readonly settings = inject(Settings);
  protected readonly account = inject(CloudAccount);
  protected readonly cloud = inject(Cloud);
  private readonly store = inject(ReviewStore);
  private readonly kanban = inject(KanbanStore);
  private readonly confirm = inject(Confirm);

  protected readonly limits = PROFILE_LIMITS;
  protected readonly nameMax = OWNER_NAME_MAX;
  protected readonly materials = PROFILE_MATERIALS;
  protected readonly lightStocks = LIGHT_STOCKS;
  protected readonly darkStocks = DARK_STOCKS;
  protected readonly stockLabels = STOCK_LABEL;
  protected readonly densities = SECTION_DENSITIES;
  protected readonly wallsLooks = WALLS_LOOKS;
  protected readonly pages = PAGE_BACKGROUNDS;
  protected readonly frames: readonly { id: SectionFrame; label: string; hint: string }[] = [
    { id: 'parede', label: 'Na parede', hint: 'As fichas pregadas direto na parede.' },
    { id: 'quadro', label: 'Num quadro', hint: 'Dentro de um quadro de cortiça com moldura.' },
  ];

  protected readonly BackIcon = ICON.voltar;
  protected readonly UpIcon = ICON.acima;
  protected readonly DownIcon = ICON.abaixo;
  protected readonly ShowIcon = ICON.ver;
  protected readonly HideIcon = ICON.esconder;
  protected readonly BrokenIcon = ICON.semImagem;
  protected readonly PickIcon = ICON.tarefas;
  protected readonly LockIcon = ICON.privada;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly EmojiIcon = ICON.reagir;
  protected readonly TrashIcon = ICON.apagar;
  protected readonly XIcon = ICON.fechar;
  protected readonly WallsIcon = ICON.simples;
  protected readonly ChevronIcon = ICON.abrir;

  protected readonly profile = this.profiles.profile;

  /** Todas as suas fichas e anotações. */
  protected readonly cards = computed(() => this.store.reviews());
  private readonly byId = computed(() => new Map(this.cards().map((r) => [r.id, r])));
  /** As anotações só no Kanban: fora do mural, fora do perfil (ver `shownToOthers`). */
  protected readonly boardOnly = this.kanban.boardOnly;
  /** O que quem visita vê: as públicas (a anotação nasce privada), fora as só no Kanban. */
  protected readonly publicCards = computed(() => this.cards().filter((r) => shownToOthers(r, this.boardOnly())));

  /** O nome no quadro: o "Seu nome", o da conta, ou um provisório. */
  protected readonly name = computed(() => this.settings.ownerName().trim() || this.account.account()?.nome || 'Seu nome');
  protected readonly stats = computed(() => profileStats(this.publicCards()));
  protected readonly updated = computed(() => updatedLabel(this.publicCards()));
  /** Com a nuvem e uma conta, os outros veem o perfil; sem isso, ele fica só aqui. */
  protected readonly shared = computed(() => !!this.cloud.config() && this.account.signedIn());

  // ===== As fichas: uma aberta de cada vez =====
  /** A ficha aberta (null: todas fechadas, só o índice). */
  protected readonly open = signal<Part | null>(null);
  /** A seção aberta dentro da ficha das Seções. */
  protected readonly openSection = signal<string | null>(null);

  /** O nome, o ícone, o que tem dentro e o resumo do que está escolhido em cada ficha. */
  protected readonly parts = computed(() => ({
    voce: this.partOf('voce'),
    fundo: this.partOf('fundo'),
    pagina: this.partOf('pagina'),
    murais: this.partOf('murais'),
    secoes: this.partOf('secoes'),
  }));

  private partOf(id: Part): { id: Part; title: string; icon: LucideIconData; hint: string; bits: string[] } {
    const p = this.profile();
    switch (id) {
      case 'voce':
        return {
          id,
          title: 'Você',
          icon: ICON.pessoa,
          hint: 'A foto, o nome, a linha embaixo dele, o “Sobre mim” e os assuntos.',
          bits: [`${p.emoji} ${this.name()}`, `Foto: ${STOCK_LABEL[p.photo].toLowerCase()}`, ...(p.topics.length ? [plural(p.topics.length, 'assunto', 'assuntos')] : [])],
        };
      case 'fundo':
        return {
          id,
          title: 'Moldura e fundo',
          icon: ICON.moldura,
          hint: 'A moldura do quadro de cima e o que fica atrás da sua foto, dentro dela.',
          bits: [PROFILE_FRAMES.find((f) => f.id === p.frameStyle)?.label ?? '', backgroundLabel(p.background)],
        };
      case 'pagina':
        return {
          id,
          title: 'Parede da página',
          icon: ICON.parede,
          hint: 'A parede do seu site inteiro, e a que fica atrás do seu perfil quando alguém abre o seu nome.',
          bits: [PAGE_BACKGROUNDS.find((w) => w.id === p.page)?.label ?? ''],
        };
      case 'murais': {
        const walls = this.walls().filter((w) => w.count);
        const hidden = walls.filter((w) => w.hidden).length;
        return {
          id,
          title: 'Seus murais',
          icon: ICON.pasta,
          hint: 'Quais murais viram uma pasta no perfil, como as pastas aparecem, e uma linha sobre o que tem em cada uma.',
          bits: walls.length
            ? [
                plural(walls.length - hidden, 'pasta à mostra', 'pastas à mostra'),
                ...(hidden ? [plural(hidden, 'escondida', 'escondidas')] : []),
                WALLS_LOOKS.find((l) => l.id === p.wallsLook)?.label ?? '',
              ]
            : ['Nenhuma ficha à mostra ainda'],
        };
      }
      case 'secoes':
        return {
          id,
          title: 'Seções',
          icon: ICON.listaComFotos,
          hint: 'Fichas de qualquer mural juntas com um nome seu, cada seção do seu jeito.',
          bits: p.sections.length ? p.sections.map((s) => (s.title.trim() ? `“${s.title.trim()}”` : 'Sem nome')) : ['Nenhuma seção'],
        };
    }
  }

  /** O resumo de uma seção fechada: quantas fichas aparecem e como ela é mostrada. */
  protected sectionBits(s: ProfileSection): string[] {
    return [
      plural(this.visibleCount(s), 'ficha à mostra', 'fichas à mostra'),
      SECTION_DENSITIES.find((d) => d.id === s.density)?.label ?? '',
      s.frame === 'quadro' ? 'Num quadro' : 'Na parede',
    ];
  }

  private readonly injector = inject(Injector);

  /** Abre a ficha (fechando a que estava aberta) ou fecha a aberta. */
  protected toggle(id: Part, event: Event): void {
    this.keepInPlace(event, () => {
      this.open.update((o) => (o === id ? null : id));
      this.emojiOpen.set(false);
    });
  }

  /** O mesmo, para as seções dentro da ficha das Seções. */
  protected toggleSection(id: string, event: Event): void {
    this.keepInPlace(event, () => this.openSection.update((o) => (o === id ? null : id)));
  }

  /**
   * Abrir uma ficha fecha a de cima, e o que foi tocado subiria junto: a página rola o mesmo tanto,
   * e o toque fica no mesmo lugar da tela.
   */
  private keepInPlace(event: Event, change: () => void): void {
    const target = event.currentTarget instanceof Element ? event.currentTarget : null;
    const before = target?.getBoundingClientRect().top;
    change();
    if (!target || before === undefined) return;
    afterNextRender({ write: () => window.scrollBy(0, target.getBoundingClientRect().top - before) }, { injector: this.injector });
  }

  // ===== A prévia: a parte aberta =====
  /** A parte que a prévia mostra: a ficha aberta, ou a seção aberta (null: o topo). */
  protected readonly editing = computed<Editing | null>(() => {
    const o = this.open();
    if (o !== 'secoes') return o;
    const s = this.openSection();
    return s && this.profile().sections.some((x) => x.id === s) ? { section: s } : 'secoes';
  });
  /** Tela larga: a prévia presa à direita. */
  protected readonly wide = signal(matchMedia(SIDE_PREVIEW).matches);
  private readonly previewBox = viewChild<ElementRef<HTMLElement>>('previewBox');

  constructor() {
    const query = matchMedia(SIDE_PREVIEW);
    const onChange = (e: MediaQueryListEvent) => this.wide.set(e.matches);
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
    // outra parte na prévia: ela volta para o começo
    effect(() => {
      this.preview();
      this.previewBox()?.nativeElement.scrollTo({ top: 0 });
    });
  }

  /** O que a prévia mostra, e o que está escrito em cima dela. */
  protected readonly preview = computed(() => {
    const e = this.editing();
    if (e && typeof e === 'object') {
      const section = this.profile().sections.find((s) => s.id === e.section);
      if (section) {
        return { kind: 'secao', section, cards: this.publicOf(section), label: section.title ? `Assim fica a seção “${section.title}”` : 'Assim fica esta seção' } as const;
      }
      return { kind: 'topo', label: 'Assim fica o topo do seu perfil' } as const;
    }
    if (e === 'secoes' && this.profile().sections.length) {
      const sections = this.profile().sections.map((section) => ({ section, cards: this.publicOf(section) }));
      return { kind: 'secoes', sections, label: 'Assim ficam as suas seções' } as const;
    }
    if (e === 'murais') return { kind: 'murais', label: 'Assim ficam as pastas dos seus murais' } as const;
    if (e === 'pagina') return { kind: 'pagina', label: 'Assim fica a página, com a parede atrás' } as const;
    return { kind: 'topo', label: 'Assim fica o topo do seu perfil' } as const;
  });

  /** As fichas da seção que quem visita vê. */
  private publicOf(section: ProfileSection): Review[] {
    return section.items.map((id) => this.byId().get(id)).filter((r): r is Review => !!r && shownToOthers(r, this.boardOnly()));
  }

  /** A prévia vai no pé desta ficha (só na tela estreita). */
  protected inlineAt(part: Editing): boolean {
    if (this.wide()) return false;
    const e = this.editing();
    return typeof part === 'object' ? !!e && typeof e === 'object' && e.section === part.section : e === part;
  }

  // ===== Você =====
  protected readonly emojiOpen = signal(false);
  protected readonly topicDraft = signal('');
  protected readonly topicsFull = computed(() => this.profile().topics.length >= PROFILE_LIMITS.topics);

  protected setEmoji(emoji: string): void {
    this.profiles.update((p) => ({ ...p, emoji }));
    this.closeEmoji();
  }

  /** Fecha o painel dos emojis (Esc ou um emoji escolhido) e o foco volta para a polaroid que o abriu. */
  protected closeEmoji(): void {
    this.emojiOpen.set(false);
    focusAfterRender(this.injector, () => document.querySelector<HTMLElement>('.foto-btn'));
  }

  protected setPhoto(photo: Stock): void {
    this.profiles.update((p) => ({ ...p, photo }));
  }

  protected setTagline(tagline: string): void {
    this.profiles.update((p) => ({ ...p, tagline }));
  }

  protected setAbout(about: string): void {
    if (about === this.profile().about) return;
    this.profiles.update((p) => ({ ...p, about }));
  }

  /** Enter ou vírgula pregam o assunto digitado; Backspace no campo vazio tira o último. */
  protected onTopicKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.addTopic();
    } else if (e.key === 'Backspace' && !this.topicDraft()) {
      const last = this.profile().topics.at(-1);
      if (last) this.removeTopic(last);
    }
  }

  protected addTopic(): void {
    const topic = this.topicDraft().trim();
    if (!topic || this.topicsFull()) return;
    this.profiles.update((p) => ({ ...p, topics: sanitizeTopics([...p.topics, topic]) }));
    this.topicDraft.set('');
  }

  protected removeTopic(topic: string): void {
    this.profiles.update((p) => ({ ...p, topics: p.topics.filter((t) => t !== topic) }));
  }

  // ===== Fundo =====
  protected readonly background = computed(() => this.profile().background);
  /** O link digitado no campo (vale assim que for um https). */
  protected readonly linkDraft = signal(this.profile().background.kind === 'link' ? (this.profile().background as { url: string }).url : '');
  protected readonly linkError = signal<string | null>(null);
  private linkTry = 0;

  protected isMaterial(id: ProfileMaterial): boolean {
    const b = this.background();
    return b.kind === 'material' && b.material === id;
  }

  protected isStockBackground(s: Stock): boolean {
    const b = this.background();
    return b.kind === 'cartolina' && b.stock === s;
  }

  protected setBackground(background: ProfileBackground): void {
    this.profiles.update((p) => ({ ...p, background }));
    if (background.kind !== 'link') {
      this.linkError.set(null);
      // a imagem de um link que ainda estava abrindo não vira o fundo por cima do escolhido agora
      this.linkTry++;
    }
  }

  /** O link: só vale https; antes de virar o fundo, a imagem precisa abrir. */
  protected onLink(value: string): void {
    this.linkDraft.set(value);
    // o link de antes, se ainda estiver abrindo, não vale mais (o campo vazio ou o link que não serve)
    this.linkTry++;
    const text = value.trim();
    if (!text) {
      this.linkError.set(null);
      if (this.background().kind === 'link') this.setBackground({ kind: 'material', material: 'cortica' });
      return;
    }
    const url = cleanImageUrl(text);
    if (!url) {
      this.linkError.set(/^http:\/\//i.test(text) ? 'Esse link é http. Só servem links https://.' : 'Cole o link de uma imagem, começando com https://.');
      return;
    }
    this.linkError.set(null);
    const attempt = ++this.linkTry;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => attempt === this.linkTry && this.setBackground({ kind: 'link', url });
    img.onerror = () => attempt === this.linkTry && this.linkError.set('Essa imagem não abriu. Confira o link (ele precisa levar direto à imagem).');
    img.src = url;
  }

  // ===== As molduras =====
  protected setHeroFrame(frameStyle: FrameStyle): void {
    this.profiles.update((p) => ({ ...p, frameStyle }));
  }

  protected setSectionFrame(id: string, frameStyle: FrameStyle): void {
    this.patchSection(id, (s) => ({ ...s, frameStyle }));
  }

  // ===== A parede atrás da página =====
  protected setPage(page: PageBackground): void {
    this.profiles.update((p) => ({ ...p, page }));
  }

  // ===== Murais =====
  /** Os murais com as fichas públicas de cada um (os sem nenhuma não aparecem para ninguém). */
  protected readonly walls = computed(() =>
    KINDS.map((kind) => {
      // as que a pasta conta (ver ProfileWalls): uma ficha por obra, sem as anotações finalizadas
      const count = this.publicCards().filter((r) => r.kind === kind && !r.revisitOf && !isDone(r)).length;
      const wall = this.profile().walls[kind] ?? {};
      return {
        kind,
        icon: KIND_ICON[kind],
        title: `Mural de ${profileOf(kind).plural}`,
        count,
        countText: count ? `${countOf(profileOf(kind), count)} à mostra` : 'Nada à mostra',
        hidden: wall.hidden === true,
        text: wall.text ?? '',
      };
    }),
  );

  protected setWallsLook(wallsLook: WallsLook): void {
    this.profiles.update((p) => ({ ...p, wallsLook }));
  }

  protected wallsLookHint(id: WallsLook): string {
    return WALLS_LOOKS.find((l) => l.id === id)?.hint ?? '';
  }

  protected setWallHidden(kind: Kind, hidden: boolean): void {
    this.profiles.update((p) => ({ ...p, walls: { ...p.walls, [kind]: { ...p.walls[kind], hidden: hidden || undefined } } }));
  }

  protected setWallText(kind: Kind, text: string): void {
    this.profiles.update((p) => ({ ...p, walls: { ...p.walls, [kind]: { ...p.walls[kind], text } } }));
  }

  // ===== Seções =====
  protected readonly sectionsFull = computed(() => this.profile().sections.length >= PROFILE_LIMITS.sections);
  /** A seção com a folha de escolher fichas aberta. */
  protected readonly picking = signal<string | null>(null);
  protected readonly pickingSection = computed(() => this.profile().sections.find((s) => s.id === this.picking()) ?? null);
  /** As seções com a lista de fichas aberta inteira. */
  protected readonly unfolded = signal<ReadonlySet<string>>(new Set());
  protected readonly folded = FOLDED_ITEMS;

  private patchSection(id: string, change: (s: ProfileSection) => ProfileSection): void {
    this.profiles.update((p) => ({ ...p, sections: p.sections.map((s) => (s.id === id ? change(s) : s)) }));
  }

  protected setTitle(id: string, title: string): void {
    this.patchSection(id, (s) => ({ ...s, title }));
  }

  protected setNote(id: string, note: string): void {
    this.patchSection(id, (s) => ({ ...s, note }));
  }

  protected setDensity(id: string, density: SectionDensity): void {
    this.patchSection(id, (s) => ({ ...s, density }));
  }

  protected setFrame(id: string, frame: SectionFrame): void {
    this.patchSection(id, (s) => ({ ...s, frame }));
  }

  protected setFill(id: string, fill: SectionFill): void {
    this.patchSection(id, (s) => ({ ...s, fill }));
  }

  protected isFill(s: ProfileSection, fill: SectionFill): boolean {
    return s.fill.kind === 'material' ? fill.kind === 'material' && fill.material === s.fill.material : fill.kind === 'cartolina' && fill.stock === s.fill.stock;
  }

  protected setItems(id: string, items: string[]): void {
    this.patchSection(id, (s) => ({ ...s, items }));
  }

  protected addSection(): void {
    if (this.sectionsFull()) return;
    const section = newSection();
    this.profiles.update((p) => ({ ...p, sections: [...p.sections, section] }));
    // a seção nova abre (fechando a outra), e o foco vai para o nome, que é o primeiro que ela precisa
    this.openSection.set(section.id);
    setTimeout(() => document.getElementById('secao-titulo-' + section.id)?.focus());
  }

  protected moveSection(id: string, by: -1 | 1): void {
    this.profiles.update((p) => ({ ...p, sections: moved(p.sections, p.sections.findIndex((s) => s.id === id), by) }));
  }

  protected async removeSection(section: ProfileSection): Promise<void> {
    if (section.items.length || section.title) {
      const ok = await this.confirm.ask({
        title: 'Tirar a seção?',
        text: `A seção “${section.title || 'sem nome'}” sai do perfil${section.items.length ? ` com a escolha das ${section.items.length} fichas` : ''}. As fichas continuam no seu mural.`,
        confirm: 'Tirar a seção',
      });
      if (!ok) return;
    }
    this.profiles.update((p) => ({ ...p, sections: p.sections.filter((s) => s.id !== section.id) }));
  }

  protected moveItem(section: ProfileSection, index: number, by: -1 | 1): void {
    this.setItems(section.id, moved(section.items, index, by));
  }

  protected removeItem(section: ProfileSection, id: string): void {
    this.setItems(
      section.id,
      section.items.filter((x) => x !== id),
    );
  }

  protected unfold(id: string): void {
    this.unfolded.update((s) => new Set(s).add(id));
  }

  /** A ficha de um id (null: apagada do mural) e como ela fica para quem visita. */
  protected itemOf(id: string): { card: Review | null; hidden: boolean; kind: string } {
    const card = this.byId().get(id) ?? null;
    return { card, hidden: !card || !shownToOthers(card, this.boardOnly()), kind: card ? cap(profileOf(card.kind).singular) : '' };
  }

  protected densityHint(id: SectionDensity): string {
    return SECTION_DENSITIES.find((d) => d.id === id)?.hint ?? '';
  }

  protected visibleCount(section: ProfileSection): number {
    return section.items.filter((id) => !this.itemOf(id).hidden).length;
  }

  protected readonly isNote = isNote;
}

/** O fundo do quadro de cima, em palavras (o resumo da ficha fechada). */
function backgroundLabel(b: ProfileBackground): string {
  if (b.kind === 'link') return 'Uma imagem sua';
  if (b.kind === 'cartolina') return `Cartolina: ${STOCK_LABEL[b.stock].toLowerCase()}`;
  return PROFILE_MATERIALS.find((m) => m.id === b.material)?.label ?? '';
}

/** A lista com o item de `index` trocado de lugar com o vizinho (`by`: −1 sobe, 1 desce). */
function moved<T>(list: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (index < 0 || to < 0 || to >= list.length) return [...list];
  const out = [...list];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}
