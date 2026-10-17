import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { LucideAngularModule, RefreshCw, Trash2, UserPlus } from 'lucide-angular';
import { CloudError } from '../core/cloud-account';
import { COMMENT_MAX, Comment, CommentTarget, Comments, QuoteRequest, commentWhen, spokenComments, withQuote } from '../core/comments';
import { Follow } from '../core/follow';
import { initialStock } from '../core/profile-people';
import { ReactionId } from '../core/reaction-kinds';
import { spokenReactions, tally } from '../core/reactions';
import { Stock } from '../core/review';
import { Busy } from './busy';
import { Confirm } from './confirm';
import { ReactionPicker } from './reactions';
import { RichEditor } from './rich-editor';
import { RichText } from './rich-text';
import { Toasts } from './toast';

/**
 * A folha de comentários de uma ficha, presa ao lado da leitura (ver ReviewReader): a conversa, do
 * comentário mais antigo para o mais novo, e o campo de escrever no pé.
 *
 * Para não poluir: cada comentário vai direto no papel, separado do vizinho por um tracejado; o que dá
 * para fazer com ele fica no pé (reagir, quem reagiu, apagar), em tinta fraca até o mouse chegar. O
 * campo é uma linha só até a pessoa tocar nele; aí vira a folha das resenhas, com as mesmas marcas e
 * `COMMENT_MAX` caracteres.
 */
@Component({
  selector: 'app-comments-panel',
  imports: [Busy, LucideAngularModule, ReactionPicker, RichEditor, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comments-panel.html',
  styleUrl: './comments-panel.scss',
})
export class CommentsPanel {
  readonly target = input.required<CommentTarget>();
  /** O nome de quem escreveu a ficha, para dizer quem precisa ser seguido. */
  readonly ownerName = input.required<string>();
  /** A ficha é sua: você apaga qualquer comentário dela. */
  readonly own = input(false);
  /** Na ficha privada, quem vê os comentários (null: quem vê o mural). */
  readonly audience = input<string | null>(null);
  /** Um trecho da ficha que a pessoa mandou citar. */
  readonly quote = input<QuoteRequest | null>(null);
  /** Tocaram em algo que sai daqui (o perfil de alguém, Ajustes): a leitura fecha. */
  readonly leave = output<string[]>();

  private readonly comments = inject(Comments);
  private readonly follow = inject(Follow);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);
  private readonly rola = viewChild<ElementRef<HTMLElement>>('rola');
  private readonly editor = viewChild(RichEditor);

  protected readonly max = COMMENT_MAX;
  protected readonly EraseIcon = Trash2;
  protected readonly RetryIcon = RefreshCw;
  protected readonly FollowIcon = UserPlus;
  protected readonly when = commentWhen;

  protected readonly me = this.comments.myCode;
  protected readonly thread = computed(() => this.comments.thread(this.target().code, this.target().ref));
  protected readonly failed = computed(() => this.comments.hasFailed(this.target().code, this.target().ref));
  protected readonly count = computed(() => this.thread()?.comentarios.length ?? 0);
  protected readonly spoken = computed(() => spokenComments(this.count()));

  /** O comentário em andamento (guardado por ficha no serviço, enquanto o site está aberto). */
  protected readonly text = signal('');
  /** O campo aberto, com a régua; fechado, é uma linha só. */
  protected readonly writing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly following = signal(false);
  /** O comentário cujas reações estão abertas (quem reagiu com o quê). */
  protected readonly whoOpen = signal<string | null>(null);

  protected readonly sendable = computed(() => !!this.text().trim() && this.text().length <= COMMENT_MAX && !this.busy());
  /** Por que não dá para comentar aqui (null: dá, ou ainda não se sabe). */
  protected readonly door = computed<'conta' | 'seguir' | 'seguidos' | null>(() => {
    if (!this.me()) return 'conta';
    const t = this.thread();
    if (!t || t.pode) return null;
    return t.quem === 'seguidos' ? 'seguidos' : 'seguir';
  });

  constructor() {
    // outra ficha (ou a primeira): a conversa dela, o rascunho que ficou, o campo fechado
    const key = computed(() => `${this.target().code}/${this.target().ref}`);
    effect(() => {
      key();
      untracked(() => {
        const t = this.target();
        void this.comments.loadThread(t).then(() => this.toEnd());
        this.text.set(this.comments.draftOf(t));
        this.writing.set(false);
        this.error.set(null);
        this.whoOpen.set(null);
      });
    });
    // o rascunho acompanha o que é escrito
    effect(() => {
      const text = this.text();
      untracked(() => this.comments.setDraft(this.target(), text));
    });
    // "Citar" na ficha: a citação entra no fim do rascunho, e o campo abre para escrever embaixo dela
    effect(() => {
      const q = this.quote();
      if (q) untracked(() => this.cite(q.text));
    });
  }

  /** Abre o campo, com o foco nele. */
  protected write(): void {
    this.writing.set(true);
    setTimeout(() => this.editor()?.focus());
  }

  /** Fecha o campo (o que foi escrito fica guardado para a próxima vez). */
  protected fold(): void {
    this.writing.set(false);
    this.error.set(null);
  }

  private cite(selection: string): void {
    if (this.door()) return;
    const next = withQuote(this.text(), selection);
    if (next === null) {
      this.toasts.show('A citação não cabe: o comentário já está no limite.');
      return;
    }
    this.text.set(next);
    this.writing.set(true);
    // o cursor vai para o fim, embaixo da citação
    setTimeout(() => {
      this.editor()?.focus();
      const area = document.activeElement;
      if (area instanceof HTMLTextAreaElement) area.setSelectionRange(area.value.length, area.value.length);
    });
  }

  protected async send(): Promise<void> {
    if (!this.sendable()) return;
    this.busy.set(true);
    this.error.set(null);
    const target = this.target();
    try {
      await this.comments.post(target, this.text());
      this.text.set('');
      this.writing.set(false);
      this.toEnd();
    } catch (err) {
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para comentar agora. Tente de novo.');
      // a regra pode ter mudado com a folha aberta (deixou de seguir, a pessoa trocou a escolha)
      if (err instanceof CloudError && err.status === 403) void this.comments.loadThread(target, true);
    } finally {
      this.busy.set(false);
    }
  }

  protected retry(): void {
    void this.comments.loadThread(this.target(), true);
  }

  /** "Seguir" no pé da folha: segue o dono e confere de novo se já dá para comentar. */
  protected async followOwner(): Promise<void> {
    if (this.following()) return;
    this.following.set(true);
    this.error.set(null);
    try {
      await this.follow.follow(this.target().code);
      await this.comments.loadThread(this.target(), true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não deu para seguir agora. Tente de novo.');
    } finally {
      this.following.set(false);
    }
  }

  protected mineOn(k: Comment): ReactionId | null {
    return this.comments.mineOn(k);
  }

  protected react(k: Comment, reaction: ReactionId | null): void {
    void this.comments.react(this.target(), k.id, reaction);
  }

  /** As reações mais dadas de um comentário (até três) para o remendo dele. */
  protected top(k: Comment) {
    return tally(k.reacoes).slice(0, 3);
  }

  protected reactionsSpoken(k: Comment): string {
    return spokenReactions(k.reacoes);
  }

  /** Quem reagiu, por reação: "❤️ Ana e Caio" (cada nome leva ao perfil da pessoa). */
  protected whoReacted(k: Comment): { emoji: string; label: string; people: { codigo: string; nome: string; spoken: string }[] }[] {
    const me = this.me();
    return tally(k.reacoes).map((t) => ({
      emoji: t.kind.emoji,
      label: t.kind.label,
      people: k.reacoes
        .filter((r) => r.reacao === t.kind.id)
        .map((r) => (r.codigo === me ? { codigo: r.codigo, nome: 'Você', spoken: 'Você: ver o seu perfil' } : { codigo: r.codigo, nome: r.nome, spoken: `Ver o perfil de ${r.nome}` })),
    }));
  }

  /** Quem apaga: quem escreveu, ou o dono da ficha. */
  protected canErase(k: Comment): boolean {
    return !!this.me() && (this.own() || k.autor.codigo === this.me());
  }

  protected async erase(k: Comment): Promise<void> {
    const mine = k.autor.codigo === this.me();
    const ok = await this.confirm.ask({
      title: 'Apagar o comentário?',
      text: mine ? 'O seu comentário sai da ficha, com as reações que recebeu. Não dá para desfazer.' : `O comentário de ${k.autor.nome} sai da sua ficha. Não dá para desfazer.`,
      confirm: 'Apagar',
    });
    if (ok) void this.comments.remove(this.target(), k.id);
  }

  protected stockOf(k: Comment): Stock {
    return k.autor.foto?.cor ?? initialStock(k.autor.codigo);
  }

  protected initial(name: string): string {
    return (name.trim()[0] ?? '?').toLocaleUpperCase('pt-BR');
  }

  /** Meio torta, cada foto do seu jeito (o mesmo sempre, pelo código da pessoa). */
  protected tilt(code: string): number {
    let h = 0;
    for (const c of code) h = (h * 31 + c.charCodeAt(0)) | 0;
    return (Math.abs(h) % 9) - 4;
  }

  /** O fim da conversa à mostra: é onde o comentário novo entra. */
  private toEnd(): void {
    setTimeout(() => {
      const el = this.rola()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
