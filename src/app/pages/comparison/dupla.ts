import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideIconData } from 'lucide-angular';
import { Colleague } from '../../core/colleague-store';
import { Kind } from '../../core/kinds';
import { Busy } from '../../ui/busy';
import { ICON, IconModule } from '../../ui/icons';
import { PersonFace, PersonPhoto } from '../../ui/person-photo';

/** Uma pessoa para comparar: um amigo (alguém que eu sigo ou que me segue) ou alguém aberto pelo código. */
export interface PickPerson {
  codigo: string;
  nome: string;
  face: PersonFace | null;
  /** "Vocês se seguem", "Você segue", "Segue você", "Aberto pelo código": a dica do botão. */
  relacao: string;
}

/** Uma orelha: um mural com algo para comparar. */
export interface DuplaWall {
  kind: Kind;
  label: string;
  icon: LucideIconData;
  common: number;
  on: boolean;
}

/**
 * O alto do Comparar: a ficha da visita ao mural de alguém (ver _ficha-dona.scss), agora com duas
 * fotos, a sua e a da pessoa. Em cima, uma orelha por mural com algo para comparar (com quantas obras
 * vocês têm em comum); no papel, "Você e Marina", a linha dela, quanto há em comum e o que dá para
 * fazer (o mural dela, o perfil, as notas em segredo). Embaixo de um risco de lápis, com quem
 * comparar: todos os amigos, cada um com a foto do perfil, e o campo do código para qualquer outra
 * pessoa. Sem ninguém escolhido, a ficha é só a sua foto e a escolha.
 */
@Component({
  selector: 'app-dupla',
  imports: [Busy, IconModule, PersonPhoto, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dupla.html',
  styleUrl: './dupla.scss',
})
export class Dupla {
  readonly colleague = input<Colleague | null>(null);
  /** Você: o código, o nome e a foto do seu perfil. */
  readonly me = input.required<{ codigo: string; nome: string; face: PersonFace }>();
  readonly walls = input<readonly DuplaWall[]>([]);
  /** "12 jogos em comum". */
  readonly summary = input('');
  /** Quantas notas da pessoa estão em segredo ("Evitar spoilers"), e se estão à mostra agora. */
  readonly secrets = input(0);
  readonly revealed = input(false);
  /** Os amigos e quem foi aberto pelo código; null enquanto a lista de amigos não chegou. */
  readonly people = input<readonly PickPerson[] | null>(null);
  /** O código de quem está sendo aberto agora (o mural vem da nuvem). */
  readonly opening = input<string | null>(null);
  readonly error = input('');
  /** O erro é do código digitado: o campo fica com a tinta de erro. */
  readonly codeError = input(false);

  readonly wall = output<Kind>();
  readonly reveal = output<void>();
  readonly pick = output<string>();
  readonly code = output<string>();

  protected readonly WallIcon = ICON.simples;
  protected readonly ProfileIcon = ICON.pessoa;
  protected readonly RevealIcon = ICON.ver;
  protected readonly HideIcon = ICON.esconder;
  protected readonly OpenIcon = ICON.ir;

  protected readonly selectedCode = computed(() => this.colleague()?.codigo ?? null);
  /** O código digitado: some quando a pessoa chega (a escolha muda). */
  protected readonly typed = linkedSignal({ source: this.selectedCode, computation: () => '' });
  /** A foto dela (sem perfil: a inicial numa cartolina). */
  protected readonly face = computed<PersonFace | null>(() => {
    const p = this.colleague()?.profile;
    return p ? { emoji: p.emoji, cor: p.photo } : null;
  });
  protected readonly tagline = computed(() => this.colleague()?.profile?.tagline.trim() ?? '');

  protected submitCode(e: Event): void {
    e.preventDefault();
    const value = this.typed().trim();
    if (value && !this.opening()) this.code.emit(value);
  }

  protected choose(p: PickPerson): void {
    if (this.opening() || p.codigo === this.selectedCode()) return;
    this.pick.emit(p.codigo);
  }
}
