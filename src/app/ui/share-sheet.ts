import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ICON, IconModule } from './icons';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { Review, audienceFields } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { accessSummary } from '../core/access';
import { MemberRole, SharedRole, canManage } from '../core/shared-notes';
import { SharedStore } from '../core/shared-store';
import { SharedGroupsStore } from '../core/shared-groups-store';
import { AccessPanel, AccessRow, AccessTarget } from './access-panel';
import { BackdropClose } from './backdrop-close';
import { Busy } from './busy';
import { Confirm } from './confirm';
import { Pin } from './pin';

/**
 * Compartilhar uma anotação, como no Google Docs: a peça Quem vê (ui/access-panel.ts: a frase, chamar
 * alguém com um papel, quem está), o que é só da anotação (quem mais vê: Só quem está ou Público) e sair
 * (quem não é o dono). Cada mudança vale na hora (não há "Enviar"): a pessoa chamada recebe o aviso em
 * Amigos.
 *
 * Chega num pedaço à parte, só quando é aberta (ver a leitura).
 */
@Component({
  selector: 'app-share-sheet',
  imports: [AccessPanel, BackdropClose, Busy, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './share-sheet.html',
  styleUrl: './share-sheet.scss',
})
export class ShareSheet {
  /** A anotação (o id dela no mural). */
  readonly noteId = input.required<string>();
  readonly closed = output<void>();
  /** Saiu da anotação: ela sumiu do mural (quem abriu fecha a leitura). */
  readonly left = output<void>();

  private readonly store = inject(ReviewStore);
  protected readonly shared = inject(SharedStore);
  private readonly account = inject(CloudAccount);
  protected readonly cloud = inject(Cloud);
  private readonly confirm = inject(Confirm);
  private readonly groups = inject(SharedGroupsStore);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly panel = viewChild(AccessPanel);

  protected readonly CloseIcon = ICON.fechar;
  protected readonly PrivateIcon = ICON.privada;
  protected readonly PublicIcon = ICON.publica;
  protected readonly LeaveIcon = ICON.sair;

  protected readonly note = computed(() => this.store.get(this.noteId()) ?? null);
  protected readonly entry = computed(() => this.shared.get(this.noteId()) ?? null);
  /** O papel de quem abriu: dono da própria anotação que ainda não foi compartilhada. */
  protected readonly myRole = computed<SharedRole>(() => this.entry()?.papel ?? 'dono');
  protected readonly manages = computed(() => canManage(this.myRole()));
  protected readonly signedIn = computed(() => this.account.signedIn() && !!this.cloud.config());
  private readonly me = computed(() => this.account.account()?.codigo ?? '');
  /**
   * Dá para sair só desta anotação: a solta, ou a do grupo em que você foi chamado nela mesma. Quem está só pelo
   * grupo não sai de uma anotação dele (ela voltaria pelo grupo): sai do grupo, pela engrenagem do mural.
   */
  protected readonly canLeave = computed(() => {
    const e = this.entry();
    return !!e && (!e.grupo || e.membros.some((m) => m.codigo === this.me()));
  });
  /** O pedido em andamento ('sair'), para o botão esperar. */
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly said = signal('');

  /** Quem vê os murais vê a anotação? */
  protected readonly isPrivate = computed(() => !!this.note()?.private);

  /** O que a peça Quem vê mostra e muda: esta anotação. */
  protected readonly target: AccessTarget = {
    noun: 'anotação',
    rows: computed<AccessRow[]>(() => {
      const e = this.entry();
      const me = this.me();
      if (!e) return me ? [{ codigo: me, nome: this.account.account()?.nome ?? 'Você', papel: 'dono', foto: null, voce: true }] : [];
      // as pessoas do grupo dela também veem: na faixa "Pelo grupo", sem o menu (o papel muda no grupo)
      const g = e.grupo ? this.groups.get(e.grupo) : undefined;
      const groupName = e.grupo ? (this.groups.names().get(e.grupo) ?? undefined) : undefined;
      const own = new Set([e.dono.codigo, ...e.membros.map((m) => m.codigo)]);
      return [
        { ...e.dono, papel: 'dono' as const, voce: e.dono.codigo === me },
        ...e.membros.map((m) => ({ codigo: m.codigo, nome: m.nome, papel: m.papel, foto: m.foto, voce: m.codigo === me })),
        ...(g?.membros ?? []).filter((m) => !own.has(m.codigo)).map((m) => ({ codigo: m.codigo, nome: m.nome, papel: m.papel, foto: m.foto, voce: m.codigo === me, via: groupName })),
      ];
    }),
    myRole: this.myRole,
    summary: computed(() => {
      const n = this.note();
      if (!n) return null;
      const e = this.entry();
      if (e) return accessSummary(this.groups.accessOf(e, this.me() || null, n));
      return accessSummary({ me: 'dono', meCode: this.me() || null, ownerName: '', members: [], public: !n.private, feed: !n.private && !n.quiet });
    }),
    add: async (codigo: string, papel: MemberRole) => {
      const note = this.note();
      if (!note) return;
      if (this.entry()) await this.shared.setRole(note.id, codigo, papel);
      else await this.shared.share(note, [{ codigo, papel }]);
    },
    setRole: (codigo: string, papel: MemberRole) => this.shared.setRole(this.noteId(), codigo, papel),
    remove: (codigo: string) => this.shared.removeMember(this.noteId(), codigo),
    emptyHint: computed(() =>
      this.entry() ? null : 'Por enquanto, só você. Quem você chamar vê a anotação no próprio mural e recebe um aviso em Amigos.',
    ),
  };

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      if (!this.panel()?.focusField()) el.querySelector<HTMLElement>('.fecha')?.focus();
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  /** Privada (só quem está nela) ou pública (aparece também no mural de quem está, para quem visita). */
  protected setPrivate(priv: boolean): void {
    const note = this.note();
    if (!note || !this.manages() || priv === this.isPrivate()) return;
    const now = new Date().toISOString();
    const { private: _p, quiet: _q, publishedAt: _w, ...rest } = note;
    this.store.update({ ...rest, ...audienceFields(priv ? 'privada' : 'visivel', note, now), updatedAt: now } as Review);
    this.said.set(priv ? 'Agora só quem está na anotação vê.' : 'Agora a anotação é pública.');
  }

  /** Sai da anotação (quem não é o dono): ela some do seu mural. */
  protected async leave(): Promise<void> {
    const e = this.entry();
    if (!e || e.papel === 'dono') return;
    const sure = await this.confirm.ask({
      title: 'Sair desta anotação?',
      text: `“${e.view.game.name}” sai do seu mural. Ela continua com ${e.dono.nome} e com quem mais está nela; para voltar, alguém precisa chamar você de novo.`,
      confirm: 'Sair da anotação',
    });
    if (!sure) return;
    this.busy.set('sair');
    try {
      await this.shared.leave(e.id);
      this.left.emit();
      this.close();
    } catch (err) {
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para sair agora. Tente de novo.');
    } finally {
      this.busy.set(null);
    }
  }

  protected goSignIn(): void {
    this.close();
    void this.router.navigate(['/ajustes'], { queryParams: { aba: 'conta' } });
  }
}
