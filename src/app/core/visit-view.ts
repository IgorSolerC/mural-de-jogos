import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { ColleagueStore } from './colleague-store';
import { Review } from './review';
import { SpoilerShield } from './spoiler-shield';
import { WallMotion } from './wall-motion';
import { VISIT_KEY, WallState } from './wall-view';

const NONE: ReadonlySet<string> = new Set();

/**
 * A vista do mural de outra pessoa (a aberta em Comparar, em Amigos ou pelo link): a mesma busca,
 * filtros, abas, ordens e tipos de ficha do seu mural, sobre as fichas dela. A ordem e o tipo de
 * ficha de quem visita ficam guardados (separados dos do seu mural); a aba, as seções fechadas e as
 * finalizadas à mostra são de cada visita, e voltam ao começo ao trocar de pessoa ou de mural.
 *
 * As notas do que você ainda não resenhou ficam em segredo com "Evitar spoilers de outros murais"
 * (ver core/spoiler-shield.ts). "Mostrar notas" e "Revelar a nota" valem para a pessoa aberta e só
 * enquanto a página estiver aberta: nada fica guardado.
 */
@Injectable()
export class VisitView extends WallState {
  private readonly colleagues = inject(ColleagueStore);
  private readonly shield = inject(SpoilerShield);
  private readonly motion = inject(WallMotion);

  readonly colleague = this.colleagues.selected;
  readonly owner = computed(() => this.colleague()?.name ?? 'Colega');
  readonly categoryLooks = computed(() => this.colleague()?.categoryLooks ?? {});
  /** O código na nuvem da pessoa (as fichas mostram as reações); null num backup. */
  readonly code = computed(() => this.colleague()?.codigo ?? null);
  readonly wall = computed<Review[]>(() => (this.colleague()?.reviews ?? []).filter((r) => r.kind === this.mural.kind()));

  /** "Mostrar notas": de quem (o id da pessoa), para outra pessoa abrir seguindo Ajustes de novo. */
  private readonly revealedFor = signal<string | null>(null);
  override readonly revealed = computed(() => !!this.colleague() && this.revealedFor() === this.colleague()!.id);
  /** As reveladas uma a uma ("Revelar a nota" na leitura), da mesma pessoa. */
  private readonly single = signal<{ of: string | null; ids: ReadonlySet<string> }>({ of: null, ids: NONE });
  readonly singles = computed<ReadonlySet<string>>(() => {
    const s = this.single();
    return !!this.colleague() && s.of === this.colleague()!.id ? s.ids : NONE;
  });
  /** As fichas sobre o que eu ainda não resenhei, com "Evitar spoilers de outros murais". */
  private readonly unseen = computed(() => this.shield.hiddenIn(this.wall()));
  /** As fichas em segredo agora. */
  readonly hidden = computed<ReadonlySet<string>>(() => {
    if (this.revealed()) return NONE;
    const singles = this.singles();
    return singles.size ? new Set([...this.unseen()].filter((id) => !singles.has(id))) : this.unseen();
  });
  readonly guarding = computed(() => this.hidden().size > 0);
  /** O botão aparece enquanto houver o que esconder (e para esconder de novo). */
  override readonly canReveal = computed(() => this.revealed() || this.hidden().size > 0);

  constructor() {
    super({ key: VISIT_KEY, whole: false });
    // outra pessoa, ou outro mural no cartaz: a busca, os filtros, a aba e as seções eram do outro
    effect(() => {
      this.colleague()?.id;
      this.mural.kind();
      untracked(() => this.reset());
    });
  }

  /** "Mostrar notas" / "Esconder notas": esconder esconde também as reveladas uma a uma. */
  override toggleReveal(): void {
    const id = this.colleague()?.id ?? null;
    // com as notas à mostra a ordem por nota volta, e as fichas andam para o lugar
    this.motion.run(() => {
      this.revealedFor.set(this.revealed() ? null : id);
      this.single.set({ of: null, ids: NONE });
    });
  }

  /** "Revelar a nota" (ou "Esconder a nota") na leitura: as vezes daquela obra seguem no mural. */
  revealOne(e: { ids: string[]; revealed: boolean }): void {
    const ids = new Set(this.singles());
    for (const id of e.ids) e.revealed ? ids.add(id) : ids.delete(id);
    this.motion.run(() => this.single.set({ of: this.colleague()?.id ?? null, ids }));
  }

  /** A ficha abre em segredo na leitura? (A revelada uma a uma abre à mostra, com "Esconder a nota".) */
  isSecret(id: string): boolean {
    return !this.revealed() && this.unseen().has(id);
  }
}
