import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { BookmarkCheck, BookmarkPlus, Eye, LucideAngularModule, MessageCircleMore, RefreshCw } from 'lucide-angular';
import { Comments, spokenComments } from '../core/comments';
import { FeedItem, agoLabel, fullWhen } from '../core/follow';
import { Kind, profileOf } from '../core/kinds';
import { ReactionTarget, Reactions } from '../core/reactions';
import { Review, formatScore, isNote, shownFinal } from '../core/review';
import { PersonFace, PersonPhoto } from './person-photo';
import { ReactionBubble, ReactionPicker } from './reactions';
import { ReviewCard } from './review-card';

/** Uma resenha que chegou: a ficha do amigo (quando o mural dele já está aqui) e a minha da mesma obra. */
export interface FeedPostData {
  key: string;
  item: Extract<FeedItem, { tipo: 'resenha' }>;
  theirs: Review | null;
  mine: Review | null;
  /** "Evitar spoilers": a nota e o texto ficam em segredo até eu avaliar (ou revelar). */
  secret: boolean;
  /** A ficha do amigo como alvo das reações e dos comentários. */
  target: ReactionTarget;
  /** ficha: a ficha está aqui; buscando: o mural ainda vem; saiu: o mural veio e ela não está; erro: não veio. */
  estado: 'ficha' | 'buscando' | 'saiu' | 'erro';
}

/** O que a pessoa avaliou, com o artigo: "um jogo", "uma série". */
const A_WORK: Record<Kind, string> = {
  jogos: 'um jogo',
  livros: 'um livro',
  filmes: 'um filme',
  series: 'uma série',
  animes: 'um anime',
  anotacoes: 'uma anotação',
};

/**
 * Um post do Feed de Amigos, como numa rede social: em cima quem pregou e há quanto tempo (a giz, na
 * parede), no meio a ficha de verdade do amigo, na largura do mural, e embaixo o que dá para fazer
 * com ela: reagir e comentar à esquerda (com as reações dos outros e quantos comentários há: no Feed
 * a ficha vem sem os remendos da quina, para cada número aparecer uma vez só); na ponta, a diferença
 * para a minha nota (o bilhete na caneta azul do amigo) ou, se eu ainda não avaliei, o "Quero jogar".
 */
@Component({
  selector: 'app-feed-post',
  imports: [LucideAngularModule, PersonPhoto, ReactionBubble, ReactionPicker, ReviewCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feed-post.html',
  styleUrl: './feed-post.scss',
})
export class FeedPost {
  readonly post = input.required<FeedPostData>();
  /** Chegou depois da última vez que a página foi aberta. */
  readonly fresh = input(false);
  /** A foto do perfil de quem pregou, se já veio. */
  readonly face = input<PersonFace | null | undefined>(null);
  /** A obra já está na minha wishlist. */
  readonly wished = input(false);

  /** Tocaram no nome: o perfil da pessoa. */
  readonly profile = output<void>();
  /** Abrir a ficha (com `comments`, já na folha de comentários). */
  readonly opened = output<{ comments: boolean }>();
  readonly revealed = output<void>();
  readonly wish = output<void>();
  readonly retry = output<void>();

  private readonly reactions = inject(Reactions);
  private readonly comments = inject(Comments);

  protected readonly CommentIcon = MessageCircleMore;
  protected readonly RevealIcon = Eye;
  protected readonly WishIcon = BookmarkPlus;
  protected readonly WishedIcon = BookmarkCheck;
  protected readonly RetryIcon = RefreshCw;
  protected readonly formatScore = formatScore;

  protected readonly who = computed(() => this.post().item.pessoa);
  protected readonly titleId = computed(() => `post-${this.post().key.replace(/[^\w-]/g, '-')}`);
  protected readonly note = computed(() => this.post().item.mural === 'anotacoes');
  /** A anotação tem categoria: a orelha dela sai por cima da ficha (ver `.aba-cat` em ui/review-card). */
  protected readonly ear = computed(() => {
    const theirs = this.post().theirs;
    return !!theirs && isNote(theirs) && !!theirs.category;
  });
  /** Reagir e comentar: só nas fichas de quem eu sigo (ver `Reactions.canReact`). */
  protected readonly canReact = computed(() => this.reactions.canReact(this.who().codigo));
  /** Alguém além de mim reagiu: o remendo com as reações aparece (a minha já está no botão). */
  protected readonly othersReacted = computed(() => {
    const { code, ref } = this.post().target;
    const me = this.reactions.myCode();
    return this.reactions.of(code, ref).some((r) => r.codigo !== me);
  });
  protected readonly commentCount = computed(() => this.comments.countOf(this.post().target.code, this.post().target.ref));
  protected readonly commentSpoken = computed(() => (this.commentCount() ? `${spokenComments(this.commentCount())}. Abrir` : 'Comentar'));

  /** "avaliou um jogo", "escreveu uma rejogada" (releitura, reassistida), "publicou uma anotação". */
  protected readonly verb = computed(() => {
    const { item, theirs } = this.post();
    if (this.note() || (theirs && isNote(theirs))) return 'publicou uma anotação';
    if (theirs?.revisitOf) return `escreveu uma ${profileOf(theirs.kind).revisit.one}`;
    return `avaliou ${A_WORK[item.mural]}`;
  });

  /** A nota do amigo menos a minha, como aparecem (Arredondado e Inteiros mudam a conta); null sem a minha. */
  protected readonly delta = computed(() => {
    const { theirs, mine } = this.post();
    return theirs && mine ? Math.round((shownFinal(theirs) - shownFinal(mine)) * 10) / 10 : null;
  });
  /** "+1,4", "−0,8". */
  protected readonly signed = computed(() => {
    const d = this.delta() ?? 0;
    return `${d > 0 ? '+' : '−'}${formatScore(Math.abs(d))}`;
  });
  /** "Quero jogar" (ler, ver). */
  protected readonly wantLabel = computed(() => `Quero ${profileOf(this.post().item.mural).verb}`);

  /** "há 2 h": conta de novo a cada vez que a tela é desenhada. */
  protected ago(): string {
    return agoLabel(this.post().item.em);
  }

  protected full(): string {
    return fullWhen(this.post().item.em);
  }
}
