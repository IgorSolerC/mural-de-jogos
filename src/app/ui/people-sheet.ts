import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Check, LucideAngularModule, Plus, X } from 'lucide-angular';
import { CloudAccount } from '../core/cloud-account';
import { Follow } from '../core/follow';
import { ListedPerson, PeopleTab, ProfilePeople, initialStock, orderPeople } from '../core/profile-people';
import { Stock } from '../core/review';
import { BackdropClose } from './backdrop-close';
import { Busy } from './busy';
import { MiniPolaroid } from './mini-polaroid';
import { Toasts } from './toast';
import { plural } from '../core/text';
import { failedText, FollowToasts } from './follow-toasts';

/** O que vai no canto do mini-mural: seguir (com conta), já segue, ou é você. */
type Relation = 'voce' | 'segue' | 'seguir' | null;

/**
 * Seguindo e Seguidores de alguém, numa ficha por cima do perfil: cada pessoa num mini-mural, como o
 * quadro de cima do perfil dela em miniatura (a moldura de pinus, o fundo que ela escolheu, a polaroid
 * com a foto e o nome, e um bilhete com a linha dela e quantas fichas tem), com o Seguir ali mesmo. O
 * mini-mural inteiro abre o perfil da pessoa.
 */
@Component({
  selector: 'app-people-sheet',
  imports: [BackdropClose, Busy, LucideAngularModule, MiniPolaroid, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet gente" aria-labelledby="gente-titulo" (close)="opened.set(false)" (backdropClose)="close()">
      @if (opened()) {
        <div class="ficha">
          <header class="head cartolina" [attr.data-cor]="stock()" [style.--stock]="'var(--stock-' + stock() + ')'">
            <div class="head-texto">
              <h2 id="gente-titulo">{{ own() ? 'Você' : name() }}</h2>
              <div class="abas" role="tablist" aria-label="Listas" (keydown)="arrows($event)">
                @for (t of tabs; track t) {
                  <button
                    type="button"
                    role="tab"
                    class="aba"
                    [id]="'gente-aba-' + t"
                    [attr.aria-selected]="tab() === t"
                    [attr.aria-controls]="'gente-painel'"
                    [attr.tabindex]="tab() === t ? 0 : -1"
                    (click)="tab.set(t)"
                  >
                    <b>{{ counts()[t] }}</b> {{ tabWord(t) }}
                  </button>
                }
              </div>
            </div>
            <button type="button" class="icon-btn" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
          </header>

          <div class="body" id="gente-painel" role="tabpanel" [attr.aria-labelledby]="'gente-aba-' + tab()">
            @if (list(); as l) {
              @if (l.length) {
                <ul class="murais">
                  @for (p of l; track p.codigo; let i = $index) {
                    <li class="mini-mural" [style.--i]="i">
                      <div class="mm-fundo" [attr.data-fundo]="material(p)">
                        @if (p.cartao?.fundo?.kind === 'cartolina') {
                          <!-- a cartolina atrás, não em volta: a escura não muda a polaroid nem o bilhete -->
                          <span
                            class="mm-cartolina cartolina"
                            [attr.data-cor]="$any(p.cartao!.fundo).stock"
                            [style.--stock]="'var(--stock-' + $any(p.cartao!.fundo).stock + ')'"
                            aria-hidden="true"
                          ></span>
                        }
                        @if (p.cartao?.fundo?.kind === 'link' && broken() !== $any(p.cartao!.fundo).url) {
                          <img class="mm-foto-fundo" [src]="$any(p.cartao!.fundo).url" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" (error)="broken.set($any(p.cartao!.fundo).url)" />
                          <span class="mm-plastico" aria-hidden="true"></span>
                        }
                        <a class="mm-link" [routerLink]="['/perfil', p.codigo]" (click)="close()" [attr.aria-label]="'Ver o perfil de ' + p.nome">
                          <app-mini-polaroid class="mm-polaroid" [stock]="photoStock(p)" [emoji]="p.cartao?.emoji" [caption]="p.nome" />
                        </a>
                        <div class="mm-lado">
                          @if (p.cartao?.linha || p.cartao?.fichas || followsMe(p)) {
                            <p class="bilhete">
                              <span class="bilhete-fita" aria-hidden="true"></span>
                              @if (p.cartao?.linha) {
                                <span class="b-linha">{{ p.cartao!.linha }}</span>
                              }
                              @if (p.cartao?.fichas) {
                                <span class="b-numeros">{{ cardsLabel(p) }}</span>
                              }
                              @if (followsMe(p)) {
                                <span class="b-segue">segue você</span>
                              }
                            </p>
                          }
                          @switch (relation(p)) {
                            @case ('seguir') {
                              <button
                                type="button"
                                class="btn-ink mm-seguir"
                                [disabled]="busy(p.codigo)"
                                [appBusy]="busy(p.codigo)"
                                [attr.aria-label]="(followsMe(p) ? 'Seguir de volta ' : 'Seguir ') + p.nome"
                                (click)="followPerson(p)"
                              >
                                <lucide-icon [img]="PlusIcon" [size]="17" [strokeWidth]="3" aria-hidden="true" />
                                {{ busy(p.codigo) ? 'Seguindo…' : followsMe(p) ? 'Seguir de volta' : 'Seguir' }}
                              </button>
                            }
                            @case ('segue') {
                              <span class="dymo">
                                <lucide-icon [img]="CheckIcon" [size]="14" [strokeWidth]="3.2" aria-hidden="true" />
                                Você segue
                              </span>
                            }
                            @case ('voce') {
                              <span class="dymo">É você</span>
                            }
                          }
                        </div>
                      </div>
                    </li>
                  }
                </ul>
              } @else {
                <p class="vazio">{{ emptyText() }}</p>
              }
            } @else if (hiddenLists()) {
              <p class="vazio">{{ name() }} mostra só os números.</p>
            } @else {
              <p class="vazio esperando" role="status"><span class="carregando" aria-hidden="true"></span>Buscando na nuvem…</p>
            }
          </div>
        </div>
      }
    </dialog>
  `,
  styleUrl: './people-sheet.scss',
})
export class PeopleSheet {
  private readonly people = inject(ProfilePeople);
  private readonly follow = inject(Follow);
  private readonly account = inject(CloudAccount);
  private readonly toasts = inject(Toasts);
  private readonly followToasts = inject(FollowToasts);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** De quem são as listas. */
  readonly code = input.required<string>();
  readonly name = input.required<string>();
  /** A cartolina da polaroid da pessoa: a faixa de cima da ficha. */
  readonly stock = input<Stock>('amarelo');
  readonly own = input(false);

  protected readonly CloseIcon = X;
  protected readonly PlusIcon = Plus;
  protected readonly CheckIcon = Check;
  protected readonly tabs: readonly PeopleTab[] = ['seguindo', 'seguidores'];

  protected readonly opened = signal(false);
  protected readonly tab = signal<PeopleTab>('seguindo');
  /** O fundo por link que não abriu: no lugar dele fica a cortiça. */
  protected readonly broken = signal<string | null>(null);
  private readonly busyCodes = signal<ReadonlySet<string>>(new Set());
  /** Quem eu seguia quando a lista chegou: seguir alguém daqui não faz o mini-mural pular de lugar. */
  private readonly orderBase = signal<ReadonlySet<string> | null>(null);

  private readonly data = computed(() => this.people.of(this.code()));
  protected readonly counts = computed(() => ({ seguindo: this.data()?.seguindo ?? 0, seguidores: this.data()?.seguidores ?? 0 }));
  protected readonly hiddenLists = computed(() => !this.own() && this.data()?.listasVisiveis === false);
  protected readonly list = computed<readonly ListedPerson[] | null>(() => {
    const lists = this.data()?.listas;
    if (!lists) return null;
    const list = lists[this.tab()];
    return this.own() ? list : orderPeople(list, this.orderBase(), this.account.account()?.codigo ?? null);
  });
  protected readonly emptyText = computed(() => {
    const who = this.own() ? 'Você' : this.name();
    return this.tab() === 'seguindo'
      ? `${who} ainda não segue ninguém.`
      : this.own()
        ? 'Ninguém segue você ainda. Mande o link do seu perfil para os amigos.'
        : `Ninguém segue ${this.name()} ainda.`;
  });

  /** Abre na lista escolhida e pede as listas (a que já veio aparece na hora). */
  async open(tab: PeopleTab): Promise<void> {
    this.tab.set(tab);
    this.orderBase.set(this.follow.people() ? this.follow.followingCodes() : null);
    this.opened.set(true);
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
    await this.people.load(this.code(), true);
    // a ordem fica com quem eu seguia agora (se a lista de quem eu sigo chegou só depois)
    if (!untracked(this.orderBase) && this.follow.people()) this.orderBase.set(this.follow.followingCodes());
  }

  close(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) dialog.close();
    this.opened.set(false);
  }

  protected tabWord(t: PeopleTab): string {
    return t === 'seguindo' ? 'seguindo' : this.counts().seguidores === 1 ? 'seguidor' : 'seguidores';
  }

  /** As setas trocam de aba (o padrão das abas). */
  protected arrows(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: PeopleTab = this.tab() === 'seguindo' ? 'seguidores' : 'seguindo';
    this.tab.set(next);
    document.getElementById('gente-aba-' + next)?.focus();
  }

  protected material(p: ListedPerson): string {
    const f = p.cartao?.fundo;
    if (!f || (f.kind === 'link' && f.url === this.broken())) return 'cortica';
    return f.kind === 'material' ? f.material : f.kind;
  }

  protected photoStock(p: ListedPerson): Stock {
    return p.cartao?.cor ?? initialStock(p.codigo);
  }

  protected cardsLabel(p: ListedPerson): string {
    const n = p.cartao?.fichas ?? 0;
    const walls = p.cartao?.murais ?? 0;
    return plural(n, 'ficha', 'fichas') + (walls > 1 ? ` · ${walls} murais` : '');
  }

  protected followsMe(p: ListedPerson): boolean {
    return !!this.follow.people()?.seguidores.some((f) => f.codigo === p.codigo);
  }

  protected relation(p: ListedPerson): Relation {
    if (!this.follow.available()) return null;
    if (p.codigo === this.account.account()?.codigo) return 'voce';
    const state = this.follow.isFollowing(p.codigo);
    return state === null ? null : state ? 'segue' : 'seguir';
  }

  protected busy(code: string): boolean {
    return this.busyCodes().has(code);
  }

  protected async followPerson(p: ListedPerson): Promise<void> {
    if (this.busy(p.codigo)) return;
    this.busyCodes.update((s) => new Set(s).add(p.codigo));
    try {
      await this.followToasts.start(p.codigo, p.nome, true);
    } catch (err) {
      this.toasts.show(failedText(err));
    } finally {
      this.busyCodes.update((s) => {
        const next = new Set(s);
        next.delete(p.codigo);
        return next;
      });
    }
  }
}
