import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Check, LucideAngularModule, MessageCircleMore, UserPlus } from 'lucide-angular';
import { Follow, Person, agoLabel, fullWhen } from '../core/follow';
import { CardNotice, Notice, noticeSpoken, noticeVerb, noticeWhere, peopleNames } from '../core/notices';
import { reactionOf } from '../core/reaction-kinds';
import { ReviewStore } from '../core/review-store';
import { Busy } from './busy';
import { PersonFace, PersonPhoto } from './person-photo';

/**
 * Os avisos de Amigos, um por linha, direto na folha: a foto de quem foi (com um remendo dizendo o
 * quê: a reação, o balão de fala, o "seguiu"), a frase e há quanto tempo. A linha inteira abre a
 * minha ficha (nos comentários, quando o aviso é de comentário); o nome abre o perfil da pessoa. Quem
 * começou a seguir traz o "Seguir de volta" ali mesmo. Serve ao quadro ao lado do Feed e à aba Avisos.
 */
@Component({
  selector: 'app-notice-list',
  imports: [Busy, LucideAngularModule, PersonPhoto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notice-list.html',
  styleUrl: './notice-list.scss',
})
export class NoticeList {
  readonly notices = input.required<readonly Notice[]>();
  /** As fotos de perfil que já vieram, pelo código. */
  readonly faces = input<ReadonlyMap<string, PersonFace>>(new Map());
  /** As chaves dos avisos que chegaram depois da última vez que a página foi aberta. */
  readonly fresh = input<ReadonlySet<string>>(new Set());
  /** O código de quem está sendo seguido de volta agora (o botão espera). */
  readonly following = input<string | null>(null);
  /** Outro pedido em andamento na página: os botões esperam. */
  readonly waiting = input(false);

  readonly profile = output<Person>();
  /** Abrir a minha ficha que recebeu a reação ou o comentário. */
  readonly card = output<CardNotice>();
  readonly followBack = output<Person>();

  private readonly follow = inject(Follow);
  private readonly store = inject(ReviewStore);

  protected readonly CommentIcon = MessageCircleMore;
  protected readonly FollowIcon = UserPlus;
  protected readonly CheckIcon = Check;
  protected readonly names = peopleNames;
  protected readonly verb = noticeVerb;
  protected readonly where = noticeWhere;
  protected readonly spoken = noticeSpoken;

  /** A minha ficha do aviso ainda está no mural? (Sem ela, o título é só texto.) */
  protected has(n: CardNotice): boolean {
    return !!this.store.get(n.item.ref);
  }

  /** As reações do aviso (até duas) para o remendo da foto. */
  protected emojis(n: Extract<Notice, { tipo: 'reagiu' }>): string[] {
    return n.reactions.slice(0, 2).map((r) => reactionOf(r).emoji);
  }

  /** Eu já sigo quem começou a me seguir? Sem a lista ainda, vale o que o próprio aviso diz. */
  protected mutual(n: Extract<Notice, { tipo: 'seguiu' }>): boolean {
    return this.follow.isFollowing(n.item.pessoa.codigo) ?? n.item.euSigo;
  }

  /** O que o leitor de tela diz da linha que abre a ficha. */
  protected openLabel(n: CardNotice): string {
    return n.tipo === 'comentou' ? `Ver os comentários de ${n.item.titulo}` : `Ver a ficha ${n.item.titulo}`;
  }

  protected ago(n: Notice): string {
    return agoLabel(n.item.em);
  }

  protected full(n: Notice): string {
    return fullWhen(n.item.em);
  }
}
