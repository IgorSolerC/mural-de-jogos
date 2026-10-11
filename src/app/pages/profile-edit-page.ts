import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
  PROFILE_LIMITS,
  PROFILE_MATERIALS,
  ProfileBackground,
  ProfileMaterial,
  ProfileSection,
  SECTION_DENSITIES,
  SectionDensity,
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
import { ProfileHero } from '../ui/profile-hero';
import { ProfilePicker } from '../ui/profile-picker';
import { EmojiPanel } from '../ui/reactions';
import { RichEditor } from '../ui/rich-editor';

/** Quantas fichas de uma seção aparecem antes do "Mostrar todas". */
const FOLDED_ITEMS = 6;

/**
 * As Configurações do perfil: o que quem abre o seu nome vê. À esquerda, as fichas de cartolina com
 * cada parte (Você, Fundo do quadro, Seus murais, Seções); à direita, o quadro de cima ao vivo. Como
 * os Ajustes, nada tem botão de salvar: vale na hora (e vai para a nuvem com o mural).
 */
@Component({
  selector: 'app-profile-edit-page',
  imports: [CoverSleeve, EmojiPanel, LucideAngularModule, Pin, ProfileHero, ProfilePicker, RichEditor, RouterLink],
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
  protected readonly frames: readonly { id: SectionFrame; label: string; hint: string }[] = [
    { id: 'parede', label: 'Na parede', hint: 'As fichas pregadas direto no eucatex.' },
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
