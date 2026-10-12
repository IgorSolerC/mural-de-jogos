import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  EyeOff,
  ImageOff,
  LayoutGrid,
  ListChecks,
  LockKeyhole,
  LucideAngularModule,
  Plus,
  SmilePlus,
  Trash2,
  X,
} from 'lucide-angular';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { KINDS, Kind, cap, countOf, profileOf } from '../core/kinds';
import {
  PAGE_BACKGROUNDS,
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
  cleanImageUrl,
  newSection,
  profileStats,
  sanitizeTopics,
  updatedLabel,
} from '../core/profile';
import { ProfileStore } from '../core/profile-store';
import { LIGHT_STOCKS, DARK_STOCKS, Review, STOCK_LABEL, Stock, isNote, isPrivate } from '../core/review';
import { ReviewStore } from '../core/review-store';
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

/** Quantas fichas de uma seção aparecem antes do "Mostrar todas". */
const FOLDED_ITEMS = 6;

/** A partir dessa largura, a prévia fica presa à direita; antes, ela entra na ficha que está sendo mexida. */
const SIDE_PREVIEW = '(min-width: 1180px)';

/** A parte do perfil sendo mexida agora (a que a prévia mostra): uma ficha, ou uma seção pelo id. */
type Editing = 'voce' | 'fundo' | 'pagina' | 'murais' | { section: string };

/**
 * As Configurações do perfil: o que quem abre o seu nome vê. À esquerda, as fichas com cada parte
 * (Você, Moldura e fundo, Parede, Seus murais, Seções); à direita, ao vivo, a parte que está sendo
 * mexida, como os outros vão ver (o quadro de cima, as pastas ou a seção), em cima da parede
 * escolhida. Na tela estreita, a prévia entra no pé da ficha mexida. Como os Ajustes, nada tem botão
 * de salvar: vale na hora (e vai para a nuvem com o mural).
 */
@Component({
  selector: 'app-profile-edit-page',
  imports: [CoverSleeve, EmojiPanel, LucideAngularModule, FramePicker, NgTemplateOutlet, PageWall, Pin, ProfileHero, ProfilePicker, ProfileSectionView, ProfileWalls, RichEditor, RouterLink],
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
  private readonly confirm = inject(Confirm);

  protected readonly limits = PROFILE_LIMITS;
  protected readonly nameMax = OWNER_NAME_MAX;
  protected readonly materials = PROFILE_MATERIALS;
  protected readonly lightStocks = LIGHT_STOCKS;
  protected readonly darkStocks = DARK_STOCKS;
  protected readonly stockLabels = STOCK_LABEL;
  protected readonly densities = SECTION_DENSITIES;
  protected readonly pages = PAGE_BACKGROUNDS;
  protected readonly frames: readonly { id: SectionFrame; label: string; hint: string }[] = [
    { id: 'parede', label: 'Na parede', hint: 'As fichas pregadas direto na parede.' },
    { id: 'quadro', label: 'Num quadro', hint: 'Dentro de um quadro de cortiça com moldura.' },
  ];

  protected readonly BackIcon = ArrowLeft;
  protected readonly UpIcon = ArrowUp;
  protected readonly DownIcon = ArrowDown;
  protected readonly ShowIcon = Eye;
  protected readonly HideIcon = EyeOff;
  protected readonly BrokenIcon = ImageOff;
  protected readonly PickIcon = ListChecks;
  protected readonly LockIcon = LockKeyhole;
  protected readonly PlusIcon = Plus;
  protected readonly EmojiIcon = SmilePlus;
  protected readonly TrashIcon = Trash2;
  protected readonly XIcon = X;
  protected readonly WallsIcon = LayoutGrid;

  protected readonly profile = this.profiles.profile;

  /** Todas as suas fichas e anotações. */
  protected readonly cards = computed(() => this.store.reviews());
  private readonly byId = computed(() => new Map(this.cards().map((r) => [r.id, r])));
  /** O que quem visita vê: as públicas (a anotação nasce privada). */
  protected readonly publicCards = computed(() => this.cards().filter((r) => !isPrivate(r)));

  /** O nome no quadro: o "Seu nome", o da conta, ou um provisório. */
  protected readonly name = computed(() => this.settings.ownerName().trim() || this.account.account()?.nome || 'Seu nome');
  protected readonly stats = computed(() => profileStats(this.publicCards()));
  protected readonly updated = computed(() => updatedLabel(this.publicCards()));
  /** Com a nuvem e uma conta, os outros veem o perfil; sem isso, ele fica só aqui. */
  protected readonly shared = computed(() => !!this.cloud.config() && this.account.signedIn());

  // ===== A prévia: a parte sendo mexida =====
  protected readonly editing = signal<Editing>('voce');
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
    if (typeof e === 'object') {
      const section = this.profile().sections.find((s) => s.id === e.section);
      if (section) {
        const cards = section.items.map((id) => this.byId().get(id)).filter((r): r is Review => !!r && !isPrivate(r));
        return { kind: 'secao', section, cards, label: section.title ? `Assim fica a seção “${section.title}”` : 'Assim fica esta seção' } as const;
      }
      return { kind: 'topo', label: 'Assim fica o topo do seu perfil' } as const;
    }
    if (e === 'murais') return { kind: 'murais', label: 'Assim ficam as pastas dos seus murais' } as const;
    if (e === 'pagina') return { kind: 'pagina', label: 'Assim fica a página, com a parede atrás' } as const;
    return { kind: 'topo', label: 'Assim fica o topo do seu perfil' } as const;
  });

  /** A prévia vai no pé desta ficha (só na tela estreita). */
  protected inlineAt(part: Editing): boolean {
    if (this.wide()) return false;
    const e = this.editing();
    return typeof part === 'object' ? typeof e === 'object' && e.section === part.section : e === part;
  }

  protected isEditingSection(id: string): boolean {
    const e = this.editing();
    return typeof e === 'object' && e.section === id;
  }

  private readonly injector = inject(Injector);

  /**
   * A parte tocada (ou com o foco) vai para a prévia. Na tela estreita, a prévia sai do pé de uma
   * ficha e entra no de outra: o que foi tocado fica parado no mesmo lugar da tela.
   */
  protected edit(part: Editing, event: Event): void {
    const e = this.editing();
    const same = typeof part === 'object' ? typeof e === 'object' && e.section === part.section : e === part;
    if (same) return;
    const target = event.target instanceof Element ? event.target : null;
    const before = target?.getBoundingClientRect().top;
    this.editing.set(part);
    if (this.wide() || !target || before === undefined) return;
    afterNextRender({ write: () => window.scrollBy(0, target.getBoundingClientRect().top - before) }, { injector: this.injector });
  }

  // ===== Você =====
  protected readonly emojiOpen = signal(false);
  protected readonly topicDraft = signal('');
  protected readonly topicsFull = computed(() => this.profile().topics.length >= PROFILE_LIMITS.topics);

  protected setEmoji(emoji: string): void {
    this.profiles.update((p) => ({ ...p, emoji }));
    this.emojiOpen.set(false);
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
    if (background.kind !== 'link') this.linkError.set(null);
  }

  /** O link: só vale https; antes de virar o fundo, a imagem precisa abrir. */
  protected onLink(value: string): void {
    this.linkDraft.set(value);
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
      const count = this.publicCards().filter((r) => r.kind === kind).length;
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
    // o foco vai para o nome da seção nova, que é o primeiro que ela precisa
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
    return { card, hidden: !card || isPrivate(card), kind: card ? cap(profileOf(card.kind).singular) : '' };
  }

  protected densityHint(id: SectionDensity): string {
    return SECTION_DENSITIES.find((d) => d.id === id)?.hint ?? '';
  }

  protected visibleCount(section: ProfileSection): number {
    return section.items.filter((id) => !this.itemOf(id).hidden).length;
  }

  protected readonly isNote = isNote;
}

/** A lista com o item de `index` trocado de lugar com o vizinho (`by`: −1 sobe, 1 desce). */
function moved<T>(list: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (index < 0 || to < 0 || to >= list.length) return [...list];
  const out = [...list];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}
