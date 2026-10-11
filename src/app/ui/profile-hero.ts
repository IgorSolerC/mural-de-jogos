import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Profile, ProfileStats } from '../core/profile';
import { STOCK_LABEL } from '../core/review';
import { RichText } from './rich-text';

/** As letras do título "Sobre mim", recortadas cada uma de um papel (sempre o mesmo jeito). */
const LETTERS = 'Sobre mim'.split('');
/** O papel, a letra e a inclinação de cada recorte, em ordem (o espaço fica sem papel). */
const CUTS = [
  { paper: 'tinta', font: 'marker', tilt: -6 },
  { paper: 'creme', font: 'label', tilt: 4 },
  { paper: 'amarelo', font: 'marker', tilt: -3 },
  { paper: 'kraft', font: 'label', tilt: 5 },
  { paper: 'vermelho', font: 'marker', tilt: -4 },
  { paper: '', font: '', tilt: 0 },
  { paper: 'creme', font: 'marker', tilt: 3 },
  { paper: 'tinta', font: 'label', tilt: -5 },
  { paper: 'azul', font: 'marker', tilt: 4 },
] as const;

/**
 * O quadro de cima do perfil: uma moldura de pinus com parafusos, o fundo escolhido dentro dela, a
 * polaroid com o emoji, a folha quadriculada "Sobre mim" (a descrição e os assuntos em fita Dymo) e
 * as fichinhas dos números. É o mesmo na prévia das Configurações e no perfil; as ações (Seguir,
 * Editar) entram por `[acoes]`. Responde à largura dele mesmo (container), não à da tela.
 */
@Component({
  selector: 'app-profile-hero',
  imports: [RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-hero.html',
  styleUrl: './profile-hero.scss',
})
export class ProfileHero {
  readonly profile = input.required<Profile>();
  readonly name = input.required<string>();
  readonly code = input<string | null>(null);
  readonly stats = input.required<ProfileStats>();
  /** "Atualizado há 3 horas" (vazio: nada). */
  readonly updated = input('');

  protected readonly cuts = LETTERS.map((ch, i) => ({ ch, ...CUTS[i] }));
  protected readonly photoLabel = computed(() => STOCK_LABEL[this.profile().photo]);
  /** O link do fundo que não abriu: no lugar dele fica a cortiça. */
  protected readonly failed = signal<string | null>(null);
  protected readonly background = computed(() => {
    const b = this.profile().background;
    return b.kind === 'link' && b.url === this.failed() ? ({ kind: 'material', material: 'cortica' } as const) : b;
  });
  protected readonly material = computed(() => {
    const b = this.background();
    return b.kind === 'material' ? b.material : b.kind;
  });
  protected readonly numbers = computed(() => {
    const s = this.stats();
    return [
      { label: 'Fichas', value: String(s.cards), note: s.cards === 1 ? 'no mural' : 'nos murais', band: 'rosa' },
      { label: 'Murais', value: String(s.walls), note: s.walls === 1 ? 'com fichas' : 'com fichas', band: 'azul' },
      { label: 'Masterpieces', value: String(s.masterpieces), note: 'as de coroa', band: 'amarelo' },
      { label: 'Desde', value: s.since ?? '—', note: 'a primeira ficha', band: 'verde', small: true },
    ];
  });
}
