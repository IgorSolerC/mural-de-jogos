import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Check, LucideAngularModule, MessageCircleMore, Reply, UserPlus, UsersRound } from 'lucide-angular';
import { CloudAccount } from '../core/cloud-account';
import { Follow, Person, agoLabel, fullWhen } from '../core/follow';
import { CardNotice, Notice, SharedNotice, noticeSpoken, noticeVerb, noticeWhere } from '../core/notices';
import { ROLE_LABEL } from '../core/shared-notes';
import { reactionOf } from '../core/reaction-kinds';
import { ReviewStore } from '../core/review-store';
import { Busy } from './busy';
import { PersonFace, PersonPhoto } from './person-photo';

/**
 * Os avisos de Amigos, um por linha, direto na folha: a foto de quem foi (com um remendo dizendo o
 * quê: a reação, o balão de fala, o "seguiu"), a frase e há quanto tempo. A linha inteira abre a
 * ficha (nos comentários, quando o aviso é de comentário ou de resposta); a foto e o nome de cada pessoa abrem o
 * perfil dela. Quem começou a seguir traz o "Seguir de volta" ali mesmo. Serve ao quadro ao lado do
 * Feed e à aba Avisos.
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
  /** A anotação compartilhada de que a pessoa está saindo agora (o botão espera). */
  readonly leaving = input<string | null>(null);
  /** Abrir a anotação que compartilharam com você. */
  readonly sharedNote = output<SharedNotice>();
  /** Sair da anotação que compartilharam com você. */
  readonly leave = output<SharedNotice>();

  private readonly follow = inject(Follow);
  private readonly store = inject(ReviewStore);
  private readonly account = inject(CloudAccount);
  /** O meu código (a resposta na minha ficha abre do meu mural). */
  private readonly me = () => this.account.account()?.codigo ?? null;

  protected readonly CommentIcon = MessageCircleMore;
  protected readonly ReplyIcon = Reply;
  protected readonly FollowIcon = UserPlus;
  protected readonly SharedIcon = UsersRound;
  protected readonly CheckIcon = Check;
  protected readonly verb = noticeVerb;
  protected readonly where = noticeWhere;
  protected readonly spoken = noticeSpoken;

  /**
   * A ficha do aviso ainda está à mão? A minha, no mural (sem ela, o título é só texto); a de outra
   * pessoa (uma resposta lá) vem do mural dela ao tocar.
   */
  protected has(n: CardNotice): boolean {
    if (n.tipo === 'respondeu' && n.item.dono !== this.me()) return true;
    return !!this.store.get(n.item.ref);
  }

  /** A anotação compartilhada já chegou ao seu mural? (Logo depois do aviso, pode ainda estar a caminho.) */
  protected hasShared(n: SharedNotice): boolean {
    return !!this.store.get(n.item.ref);
  }

  /** "editor", "leitor", "gestor". */
  protected roleOf(n: SharedNotice): string {
    return ROLE_LABEL[n.item.papel].toLowerCase();
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
    if (n.tipo === 'respondeu') return `Ver a resposta em ${n.item.titulo}`;
    return n.tipo === 'comentou' ? `Ver os comentários de ${n.item.titulo}` : `Ver a ficha ${n.item.titulo}`;
  }

  protected ago(n: Notice): string {
    return agoLabel(n.item.em);
  }

  protected full(n: Notice): string {
    return fullWhen(n.item.em);
  }
}
