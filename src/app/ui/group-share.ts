import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { accessSummary } from '../core/access';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { lookKey } from '../core/category-looks';
import { isNote, withAudience } from '../core/review';
import { muralLink } from '../core/cloud-murals';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { MemberRole, canManage } from '../core/shared-notes';
import { SharedGroupsStore } from '../core/shared-groups-store';
import { SharedStore } from '../core/shared-store';
import { KanbanStore } from '../core/kanban-store';
import { AccessPanel, AccessRow, AccessTarget } from './access-panel';
import { Busy } from './busy';
import { Confirm } from './confirm';
import { ICON, IconModule } from './icons';

/**
 * Compartilhar um grupo (PLANO-COMPARTILHAR.md, 4.2): a parte Compartilhar da engrenagem monta isto para o
 * grupo aberto. A peça Quem vê (a frase, chamar alguém, quem está) com o que é só do grupo: o que vai junto
 * (o mural do grupo, o Kanban e os quadros livres), as anotações indo para a nuvem, e o pé (parar de
 * compartilhar, para o dono; sair, para os outros), cada um com o aviso do plano (4.4.3, 4.4.6, 4.4.7).
 */
@Component({
  selector: 'app-group-share',
  imports: [AccessPanel, Busy, IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!signedIn()) {
      <p class="sem-conta">Para dividir o grupo {{ name() }} com alguém, entre na sua conta. Ele continua só seu até lá.</p>
      <button type="button" class="papel" (click)="goSignIn()">Entrar em Ajustes › Conta</button>
    } @else {
      <app-access-panel [target]="target">
        <!-- quem mais vê: ninguém, ou qualquer pessoa (o mural do grupo, o Kanban e os quadros livres, só lendo) -->
        <section class="grupo" aria-labelledby="publico-titulo">
          <h3 class="grupo-titulo" id="publico-titulo">Quem mais vê</h3>
          @if (manages()) {
            <div class="segmentos" role="radiogroup" aria-labelledby="publico-titulo">
              <label class="segmento">
                <input type="radio" name="grupo-publico" value="nao" [checked]="!isPublic()" [disabled]="!!busy()" (change)="setPublic(false)" />
                <lucide-icon class="seg-icone" [img]="PrivateIcon" [size]="18" aria-hidden="true" />
                <span class="seg-nome">Só quem está</span>
              </label>
              <label class="segmento">
                <input type="radio" name="grupo-publico" value="sim" [checked]="isPublic()" [disabled]="!!busy()" (change)="setPublic(true)" />
                <lucide-icon class="seg-icone" [img]="PublicIcon" [size]="18" aria-hidden="true" />
                <span class="seg-nome">Público</span>
              </label>
            </div>
          }
          <p class="visita-desc">
            @if (isPublic()) {
              Qualquer pessoa lê o mural do grupo, o Kanban e os quadros livres, pelo seu mural e pelo link; só quem está aqui edita. Nada vai para o Feed.
            } @else {
              Ninguém mais: quem visita o seu mural não vê nem o nome do grupo.
            }
          </p>
          @if (isPublic() && link(); as l) {
            <button type="button" class="papel copiar" (click)="copyLink(l)">
              <lucide-icon [img]="LinkIcon" [size]="17" aria-hidden="true" />
              {{ copied() ? 'Link copiado' : 'Copiar o link' }}
            </button>
          }
        </section>
        <section class="grupo" aria-labelledby="junto-titulo">
          <h3 class="grupo-titulo" id="junto-titulo">O que vai junto</h3>
          <p class="visita-desc">{{ together() }}</p>
          @if (moving(); as m) {
            <p class="indo" role="status">Levando {{ m === 1 ? 'uma anotação' : m + ' anotações' }} para o grupo…</p>
          }
          @if (adoptError(); as e) {
            <p class="erro" role="alert">{{ e }}</p>
          }
        </section>
        @if (error(); as e) {
          <p class="erro" role="alert">{{ e }}</p>
        }
        @if (group(); as g) {
          <div class="pe">
            @if (g.papel === 'dono') {
              <button type="button" class="papel perigo" [disabled]="!!busy()" [appBusy]="busy() === 'parar'" (click)="stop()">
                <lucide-icon [img]="StopIcon" [size]="17" aria-hidden="true" />
                Parar de compartilhar
              </button>
            } @else {
              <button type="button" class="papel perigo" [disabled]="!!busy()" [appBusy]="busy() === 'sair'" (click)="leave()">
                <lucide-icon [img]="LeaveIcon" [size]="17" aria-hidden="true" />
                Sair do grupo
              </button>
            }
          </div>
        }
      </app-access-panel>
    }
  `,
  styleUrl: './group-share.scss',
})
export class GroupShare {
  /** O grupo, pelo nome que ele tem no mural. */
  readonly name = input.required<string>();

  protected readonly groups = inject(SharedGroupsStore);
  private readonly shared = inject(SharedStore);
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(Settings);
  private readonly account = inject(CloudAccount);
  private readonly cloud = inject(Cloud);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly kanban = inject(KanbanStore);
  private readonly host = inject(ElementRef);

  protected readonly StopIcon = ICON.privada;
  protected readonly PrivateIcon = ICON.privada;
  protected readonly PublicIcon = ICON.publica;
  protected readonly LinkIcon = ICON.link;
  protected readonly LeaveIcon = ICON.sair;

  protected readonly signedIn = computed(() => this.account.signedIn() && !!this.cloud.config());
  /** O grupo compartilhado (undefined: ainda só seu). */
  protected readonly group = computed(() => this.groups.ofCategory(this.name()));
  private readonly me = computed(() => this.account.account()?.codigo ?? '');
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Quem gere o grupo (o dono de um grupo ainda só seu também). */
  protected readonly manages = computed(() => canManage(this.group()?.papel ?? 'dono'));
  protected readonly isPublic = computed(() => !!this.group()?.publico);
  protected readonly copied = signal(false);
  /** O link que abre o grupo público (o ?mural= de sempre, com o grupo). */
  protected readonly link = computed(() => {
    const g = this.group();
    return g ? `${muralLink(g.dono.codigo)}&grupo=${encodeURIComponent(g.dados.nome)}` : null;
  });

  /** As anotações do grupo no seu mural. */
  private readonly notes = computed(() => {
    const key = lookKey(this.name());
    return this.store.notes().filter((n) => isNote(n) && !!n.category && lookKey(n.category) === key);
  });
  /** Quantas são privadas (o aviso de chamar a primeira pessoa, 4.4.3). */
  private readonly privates = computed(() => this.notes().filter((n) => n.private).length);
  protected readonly moving = computed(() => {
    const m = this.groups.moving();
    const g = this.group();
    return m && g && m.grupo === g.id ? m.faltam : null;
  });
  /** O erro de levar as anotações para este grupo. */
  protected readonly adoptError = computed(() => {
    const e = this.groups.error();
    return e && e.grupo === this.group()?.id ? e.mensagem : null;
  });
  protected readonly together = computed(() => {
    // as do mural de quem olha (as do grupo e as que ainda vão para ele): a conta da nuvem só muda com a versão do grupo
    const n = this.notes().length;
    const notes = n === 0 ? 'ainda sem anotações' : n === 1 ? 'uma anotação' : `${n} anotações`;
    return `O mural do grupo (${notes}), o Kanban e os quadros livres dele. Fixar, a vista e a ordem continuam de cada um.`;
  });

  protected readonly target: AccessTarget = {
    noun: 'grupo',
    rows: computed<AccessRow[]>(() => {
      const g = this.group();
      const me = this.me();
      if (!g) return me ? [{ codigo: me, nome: this.account.account()?.nome ?? 'Você', papel: 'dono', foto: null, voce: true }] : [];
      return [
        { ...g.dono, papel: 'dono' as const, voce: g.dono.codigo === me },
        ...g.membros.map((m) => ({ codigo: m.codigo, nome: m.nome, papel: m.papel, foto: m.foto, voce: m.codigo === me })),
      ];
    }),
    myRole: computed(() => this.group()?.papel ?? 'dono'),
    summary: computed(() => {
      const g = this.group();
      return accessSummary({
        me: g?.papel ?? 'dono',
        meCode: this.me() || null,
        ownerName: g?.dono.nome ?? '',
        members: g?.membros ?? [],
        public: g?.publico ?? false,
      });
    }),
    emptyHint: computed(() =>
      this.group()
        ? null
        : 'Por enquanto, só você. Quem você chamar vê o grupo no próprio mural, com as anotações, o Kanban e os quadros livres, e recebe um aviso em Amigos.',
    ),
    beforeAdd: async (nome: string) => {
      // a primeira pessoa num grupo com privadas: elas passam a ser vistas (resposta P1 do dono)
      const g = this.group();
      const priv = this.privates();
      if ((g && g.membros.length) || !priv) return true;
      return this.confirm.ask({
        title: `Chamar ${nome} para o grupo?`,
        text:
          priv === 1
            ? `Há uma anotação privada neste grupo. ${nome} vai poder vê-la, como as outras do grupo.`
            : `Há ${priv} anotações privadas neste grupo. ${nome} vai poder vê-las, como as outras do grupo.`,
        confirm: 'Chamar mesmo assim',
      });
    },
    add: async (codigo: string, papel: MemberRole) => {
      const g = this.group();
      if (g) {
        await this.groups.setRole(g.id, codigo, papel);
        return;
      }
      const look = this.settings.categoryLook(this.name());
      // o quadro do Kanban do grupo vai junto (PLANO-COMPARTILHAR.md, rodada 4)
      const board = this.kanban.boardFor(this.name());
      await this.groups.share(this.name(), [{ codigo, papel }], { ...(look.icon ? { icone: look.icon } : {}), ...(look.color ? { cor: look.color } : {}) }, board);
    },
    setRole: (codigo: string, papel: MemberRole) => this.groups.setRole(this.group()!.id, codigo, papel),
    remove: (codigo: string) => this.groups.removeMember(this.group()!.id, codigo),
  };

  /**
   * Público ou só de quem está (4.4.1 e 4.4.5 do plano). Tornando público, as privadas do grupo viram
   * Disponíveis (públicas, fora do Feed): o aviso diz quantas, com as palavras do pedido. Voltando a ser só de
   * quem está, a pergunta é se elas voltam a ser privadas também.
   */
  protected async setPublic(on: boolean): Promise<void> {
    if (on === this.isPublic() || !this.manages()) return;
    const notes = this.notes();
    if (on) {
      const priv = this.privates();
      if (priv) {
        const sure = await this.confirm.ask({
          title: `Tornar público o grupo ${this.name()}?`,
          text:
            priv === 1
              ? 'Há uma anotação privada neste grupo (no mural e no Kanban). Torná-lo público irá deixá-la pública, sem ir para o Feed. Tem certeza que quer fazer isso?'
              : `Há ${priv} anotações privadas neste grupo (no mural e no Kanban). Torná-lo público irá deixá-las públicas, sem ir para o Feed. Tem certeza que quer fazer isso?`,
          confirm: 'Tornar público',
          tone: 'neutro',
        });
        if (!sure) return this.resetRadios();
      }
      await this.run('publico', async () => {
        // o grupo ainda só seu nasce na nuvem já público (duas gravações seguidas a nuvem recusa)
        const g = this.group();
        if (g) await this.groups.setPublic(g.id, true);
        else await this.shareAlone();
        // as privadas viram Disponíveis (públicas, fora do Feed), como o pedido diz
        const now = new Date().toISOString();
        for (const n of notes.filter((x) => x.private)) this.store.update(withAudience(n, 'visivel', now));
      });
      return;
    }
    const open = notes.filter((n) => !n.private).length;
    const answer = open
      ? await this.confirm.choose({
          title: `${this.name()} só para quem está?`,
          text: `${open === 1 ? 'A anotação do grupo continua pública' : `As ${open} anotações do grupo continuam públicas`} (Disponíveis): quem visita ainda vê no seu mural. Quer torná-las privadas também?`,
          confirm: 'Tornar privadas',
          secondary: 'Deixar como estão',
        })
      : 'secondary';
    if (answer === null) return this.resetRadios();
    await this.run('publico', async () => {
      await this.groups.setPublic(this.group()!.id, false);
      if (answer !== 'confirm') return;
      const now = new Date().toISOString();
      for (const n of notes.filter((x) => !x.private)) this.store.update(withAudience(n, 'privada', now));
    });
  }

  /** Um grupo ainda só seu, tornado público: ele vai para a nuvem sem ninguém (o público é servido de lá). */
  private shareAlone() {
    const look = this.settings.categoryLook(this.name());
    return this.groups.share(this.name(), [], { ...(look.icon ? { icone: look.icon } : {}), ...(look.color ? { cor: look.color } : {}) }, this.kanban.boardFor(this.name()), true);
  }

  /** Desistiu no aviso: os recortes voltam a dizer como o grupo está. */
  private resetRadios(): void {
    const el = this.host.nativeElement as HTMLElement;
    for (const r of el.querySelectorAll<HTMLInputElement>('input[name="grupo-publico"]')) r.checked = (r.value === 'sim') === this.isPublic();
  }

  protected async copyLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2_400);
    } catch {
      this.error.set('Não deu para copiar. O link: ' + link);
    }
  }

  /** Para de compartilhar (o dono): as pessoas deixam de ver, e tudo fica com você (4.4.6). */
  protected async stop(): Promise<void> {
    const g = this.group();
    if (!g || g.papel !== 'dono') return;
    const names = g.membros.map((m) => m.nome);
    const who = names.length <= 1 ? (names[0] ?? 'Ninguém') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
    const sure = await this.confirm.ask({
      title: `Parar de compartilhar ${this.name()}?`,
      text: `${who} ${names.length > 1 ? 'deixam' : 'deixa'} de ver o grupo. Tudo o que está nele, até o que ${names.length > 1 ? 'eles escreveram' : 'foi escrito por outra pessoa'}, fica no grupo, só com você.`,
      confirm: 'Parar de compartilhar',
    });
    if (!sure) return;
    await this.run('parar', async () => {
      // o quadro do Kanban, como ficou no grupo, fica sendo o seu
      const board = await this.groups.stop(g.id);
      if (board) this.kanban.keep(board);
    });
  }

  /** Sai do grupo (quem não é o dono): o que a pessoa escreveu fica nele (4.4.7, resposta P4). */
  protected async leave(): Promise<void> {
    const g = this.group();
    if (!g || g.papel === 'dono') return;
    const mine = this.shared.inGroupOf(g.id).filter((e) => e.criadoPor?.codigo === this.me()).length;
    const wrote =
      mine === 0 ? '' : mine === 1 ? 'Você escreveu uma anotação neste grupo. Ela fica no grupo, ' : `Você escreveu ${mine} anotações neste grupo. Elas ficam no grupo, `;
    const sure = await this.confirm.ask({
      title: `Sair do grupo ${this.name()}?`,
      text: `${wrote}${wrote ? `com ${g.dono.nome}, e saem do seu mural.` : `O grupo sai do seu mural e continua com ${g.dono.nome}.`} Para voltar, alguém precisa chamar você de novo.`,
      confirm: 'Sair do grupo',
    });
    if (!sure) return;
    await this.run('sair', () => this.groups.leave(g.id));
  }

  private async run(what: string, fn: () => Promise<void>): Promise<void> {
    this.busy.set(what);
    this.error.set(null);
    try {
      await fn();
    } catch (err) {
      this.error.set(err instanceof CloudError ? err.message : 'Não deu agora. Tente de novo.');
    } finally {
      this.busy.set(null);
    }
  }

  protected goSignIn(): void {
    void this.router.navigate(['/ajustes'], { queryParams: { aba: 'conta' } });
  }
}
