import {
  ApplicationRef,
  ComponentRef,
  DestroyRef,
  Directive,
  ElementRef,
  EnvironmentInjector,
  Injectable,
  OnDestroy,
  createComponent,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { Review, ScoreKey } from '../core/review';
import { ReviewCard } from '../ui/review-card';

/** O que todas as fichas do mural recebem igual; o resto é a própria resenha. */
export interface WallCardProps {
  landingId: string | null;
  highlight: ScoreKey | null;
  compact: boolean;
  capas: boolean;
  /** As fichas inteiras: o texto todo, encaixadas em colagem. */
  full: boolean;
  dayOnly: boolean;
  picking: boolean;
  /** A ordem das fichas marcadas para o lado a lado (id → 1, 2, 3…). */
  picked: ReadonlyMap<string, number>;
  /** Sem spoilers: notas, veredito, bônus e texto escondidos. */
  masked: boolean;
  /** Quantas vezes cada obra jogada mais de uma vez está no mural (id da original → vezes). */
  times: ReadonlyMap<string, number>;
  /** O meu código na nuvem, para as fichas mostrarem as reações que receberam (null: sem conta). */
  reactCode: string | null;
  /** As tarefas das anotações se marcam na ficha (o seu mural). */
  checkable: boolean;
}

const NO_PROPS: WallCardProps = {
  landingId: null,
  highlight: null,
  compact: false,
  capas: false,
  full: false,
  dayOnly: false,
  picking: false,
  picked: new Map(),
  masked: false,
  times: new Map(),
  reactCode: null,
  checkable: false,
};

/**
 * As fichas do mural, uma por resenha, vivas enquanto o mural estiver aberto. Reordenar ou trocar o
 * agrupamento só muda a ficha de seção (o mesmo elemento vai para outro lugar da parede): o papel já
 * desenhado, a capa já carregada e as medidas continuam lá. Antes, cada troca de ordem jogava fora
 * todas as fichas e montava tudo de novo, o que travava o mural por um bom tempo.
 */
@Injectable()
export class WallCardPool implements OnDestroy {
  private readonly appRef = inject(ApplicationRef);
  private readonly env = inject(EnvironmentInjector);
  private readonly cards = new Map<string, ComponentRef<ReviewCard>>();
  private wanted = new Set<string>();
  private sweep: ReturnType<typeof setTimeout> | undefined;
  private preload: ReturnType<typeof setTimeout> | undefined;

  /** Lido pelas seções a cada desenho: o que vale para todas as fichas. */
  props: () => WallCardProps = () => NO_PROPS;
  onOpen: (id: string) => void = () => {};
  onToggle: (id: string) => void = () => {};

  /** Põe as fichas da seção dentro dela, na ordem, criando só as que ainda não existem. */
  place(host: HTMLElement, reviews: readonly Review[], p: WallCardProps): void {
    let i = 0;
    for (const r of reviews) {
      const ref = this.cards.get(r.id) ?? this.create(r, host, p);
      this.apply(ref, r, p);
      const el = ref.location.nativeElement as HTMLElement;
      const at = host.children[i] ?? null;
      if (at !== el) host.insertBefore(el, at);
      i++;
    }
    // as que sobraram saíram desta seção: outra seção as pega, ou elas saíram do mural (ver keepOnly)
    while (host.children.length > i) host.lastElementChild!.remove();
    this.preloadCovers();
  }

  /**
   * As capas das fichas longe da tela vêm aos poucos, com o mural parado: a capa preguiçosa só
   * carregava quando a ficha chegava perto, e reordenar trazia fichas de longe com a capa vazia
   * aparecendo no meio do caminho.
   */
  private preloadCovers(): void {
    if (this.preload) return;
    const step = () => {
      const lazy = Array.from(document.querySelectorAll<HTMLImageElement>('app-wall-page [data-ficha] img[loading="lazy"]'));
      for (const img of lazy.slice(0, 2)) img.loading = 'eager';
      this.preload = lazy.length > 2 ? setTimeout(step, 250) : undefined;
    };
    this.preload = setTimeout(step, 2000);
  }

  /**
   * As fichas que saíram do mural (filtro, apagada) vão embora de vez, como antes. Só um instante
   * depois: a view transition faz a troca às escondidas e volta atrás para medir (ver
   * ViewTransitions.run), e a ficha que sai e volta na mesma hora não precisa ser montada de novo.
   */
  keepOnly(reviews: readonly Review[]): void {
    this.wanted = new Set(reviews.map((r) => r.id));
    if (this.sweep || [...this.cards.keys()].every((id) => this.wanted.has(id))) return;
    this.sweep = setTimeout(() => {
      this.sweep = undefined;
      for (const [id, ref] of this.cards) if (!this.wanted.has(id)) this.drop(id, ref);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.sweep);
    clearTimeout(this.preload);
    for (const [id, ref] of this.cards) this.drop(id, ref);
  }

  private create(r: Review, host: HTMLElement, p: WallCardProps): ComponentRef<ReviewCard> {
    const ref = createComponent(ReviewCard, { environmentInjector: this.env });
    const el = ref.location.nativeElement as HTMLElement;
    // a ficha recebe o mesmo atributo de escopo que o template do mural daria a ela, para os estilos
    // do mural (largura da ficha, coluna no celular) valerem igual
    for (const attr of Array.from(host.attributes)) if (attr.name.startsWith('_ngcontent-')) el.setAttribute(attr.name, '');
    el.setAttribute('data-ficha', r.id);
    ref.instance.opened.subscribe((id) => this.onOpen(id));
    ref.instance.toggled.subscribe((id) => this.onToggle(id));
    this.cards.set(r.id, ref);
    this.apply(ref, r, p);
    this.appRef.attachView(ref.hostView);
    // desenha já, no mesmo quadro em que a seção aparece
    ref.changeDetectorRef.detectChanges();
    return ref;
  }

  private apply(ref: ComponentRef<ReviewCard>, r: Review, p: WallCardProps): void {
    // setInput não faz nada quando o valor não mudou
    ref.setInput('review', r);
    ref.setInput('landing', p.landingId === r.id);
    ref.setInput('highlight', p.highlight);
    ref.setInput('compact', p.compact);
    ref.setInput('capas', p.capas);
    ref.setInput('full', p.full);
    ref.setInput('dayOnly', p.dayOnly);
    ref.setInput('picking', p.picking);
    ref.setInput('pickedAt', p.picked.get(r.id) ?? null);
    ref.setInput('masked', p.masked);
    ref.setInput('times', p.times.get(r.id) ?? 1);
    ref.setInput('reactCode', p.reactCode);
    ref.setInput('checkable', p.checkable);
  }

  private drop(id: string, ref: ComponentRef<ReviewCard>): void {
    this.cards.delete(id);
    const el = ref.location.nativeElement as HTMLElement;
    this.appRef.detachView(ref.hostView);
    ref.destroy();
    el.remove();
  }
}

/** A altura de uma linha da grade da colagem: cada ficha ocupa quantas couberem na altura dela. */
const MOSAIC_ROW = 4;

/** Um número de 0 a 1 tirado do id, sempre o mesmo para a mesma ficha. */
function wobble(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Na colagem (as fichas inteiras), cada ficha ocupa na grade as linhas da altura dela, mais o vão de
 * baixo: a ficha seguinte cai embaixo da mais curta, sem buraco na parede. O vão e o desvio para o
 * lado variam um pouco de ficha para ficha (sempre os mesmos para a mesma ficha), como pregadas à mão.
 */
function fitMosaic(el: HTMLElement): void {
  const id = el.dataset['ficha'] ?? '';
  const gap = 34 + Math.round(wobble(id, 1) * 26);
  const top = parseFloat(getComputedStyle(el).marginTop) || 0;
  el.style.setProperty('--linhas', String(Math.ceil((el.offsetHeight + top + gap) / MOSAIC_ROW)));
  el.style.setProperty('--desvio', `${Math.round((wobble(id, 2) - 0.5) * 16)}px`);
}

/** As fichas de uma seção do mural (ver WallCardPool). */
@Directive({ selector: '[appFichas]' })
export class WallCards {
  readonly reviews = input.required<readonly Review[]>({ alias: 'appFichas' });
  /** As fichas inteiras, em colagem: mede cada ficha para ela ocupar as linhas da altura dela. */
  readonly mosaic = input(false, { alias: 'appFichasMosaico' });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const pool = inject(WallCardPool);
    // a ficha muda de altura sozinha (a capa chegando, as fontes, uma tarefa marcada): mede de novo
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => entries.forEach((e) => fitMosaic(e.target as HTMLElement)));
    inject(DestroyRef).onDestroy(() => ro?.disconnect());
    effect(() => {
      const reviews = this.reviews();
      const props = pool.props();
      const mosaic = this.mosaic();
      untracked(() => {
        pool.place(host, reviews, props);
        ro?.disconnect();
        if (!mosaic) return;
        for (const el of Array.from(host.children) as HTMLElement[]) {
          fitMosaic(el);
          ro?.observe(el);
        }
      });
    });
  }
}
