import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { accessSummary } from '../core/access';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { FreeBoardStore } from '../core/free-board-store';
import { FreeBoardSync } from '../core/free-board-sync';
import { MemberRole, SharedMember, SharedPerson, SharedRole, isMemberRole, parsePerson } from '../core/shared-notes';
import { SharedGroupsStore } from '../core/shared-groups-store';
import { ReviewStore } from '../core/review-store';
import { isNote } from '../core/review';
import { lookKey } from '../core/category-looks';
import { AccessPanel, AccessRow, AccessTarget } from './access-panel';
import { BackdropClose } from './backdrop-close';
import { Busy } from './busy';
import { Confirm } from './confirm';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';

/**
 * Compartilhar um quadro do Quadro livre (PLANO-COMPARTILHAR.md, rodada 6), com a mesma peça Quem vê da anotação e
 * do grupo. O quadro de um grupo compartilhado vai com o grupo (resposta P2): quem está nele é quem está no grupo, e
 * mudar aqui muda o grupo (a folha diz isso). O quadro solto tem as pessoas dele. Sair, para quem não é o dono.
 */
@Component({
  selector: 'app-board-share',
  imports: [AccessPanel, BackdropClose, Busy, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet compartilhar" aria-labelledby="quadro-compartilhar-titulo" (close)="closed.emit()" (backdropClose)="close()">
      <div class="ficha cartolina" style="--stock: var(--stock-azul)" data-cor="azul">
        <app-pin class="pin" color="#2f6bff" />
        <header class="head">
          <div class="titulos">
            <h2 id="quadro-compartilhar-titulo">Compartilhar</h2>
            <p class="sub">“{{ board()?.nome ?? 'Quadro' }}”</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>
        <div class="body">
          @if (!signedIn()) {
            <p class="vazio">Para dividir este quadro com alguém, entre na sua conta.</p>
          } @else if (!inCloud()) {
            <p class="vazio">O quadro ainda está subindo para a nuvem. Daqui a pouco dá para chamar alguém.</p>
          } @else {
            <app-access-panel [target]="target">
              @if (group(); as g) {
                <p class="visita-desc">Este quadro vai com o grupo <strong>{{ groupName() }}</strong>: quem está no grupo está nele, e quem você chamar aqui entra no grupo inteiro.</p>
              }
              @if (error(); as e) {
                <p class="erro" role="alert">{{ e }}</p>
              }
            </app-access-panel>
          }
        </div>
        <footer class="foot">
          @if (myRole() !== 'dono' && !group()) {
            <button type="button" class="papel perigo" [disabled]="!!busy()" [appBusy]="busy() === 'sair'" (click)="leave()">
              <lucide-icon [img]="LeaveIcon" [size]="17" aria-hidden="true" />
              Sair do quadro
            </button>
          }
          <div class="actions">
            <button type="button" class="btn-ink" (click)="close()">Pronto</button>
          </div>
        </footer>
      </div>
    </dialog>
  `,
  styleUrl: './share-sheet.scss',
})
export class BoardShare {
  readonly boardId = input.required<string>();
  readonly closed = output<void>();
  /** Saiu do quadro: ele sai da lista (quem abriu fecha o quadro). */
  readonly left = output<void>();

  private readonly store = inject(FreeBoardStore);
  private readonly sync = inject(FreeBoardSync);
  private readonly groups = inject(SharedGroupsStore);
  private readonly account = inject(CloudAccount);
  private readonly confirm = inject(Confirm);
  private readonly reviews = inject(ReviewStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly CloseIcon = ICON.fechar;
  protected readonly LeaveIcon = ICON.sair;

  protected readonly board = computed(() => this.store.get(this.boardId()));
  protected readonly signedIn = computed(() => this.account.signedIn());
  protected readonly inCloud = computed(() => (this.store.record(this.boardId())?.rev ?? 0) > 0 || this.sync.shared().has(this.boardId()));
  private readonly me = computed(() => this.account.account()?.codigo ?? '');
  /** O grupo compartilhado do quadro (o do seu grupo, ou o que a nuvem disse do quadro de outra pessoa). */
  protected readonly group = computed(() => {
    const info = this.sync.shared().get(this.boardId());
    if (info) return info.grupo ? this.groups.get(info.grupo) : undefined;
    const b = this.board();
    return b ? this.groups.ofCategory(b.grupo) : undefined;
  });
  protected readonly groupName = computed(() => {
    const g = this.group();
    return g ? (this.groups.names().get(g.id) ?? g.dados.nome) : '';
  });
  /** As pessoas do quadro solto, como a nuvem disse (null: ainda vindo). */
  private readonly loaded = signal<{ papel: SharedRole; dono: SharedPerson; membros: SharedMember[] } | null>(null);
  protected readonly myRole = computed<SharedRole>(() => this.group()?.papel ?? this.loaded()?.papel ?? this.sync.roleOf(this.boardId()));
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly target: AccessTarget = {
    noun: 'quadro',
    rows: computed<AccessRow[]>(() => {
      const me = this.me();
      const g = this.group();
      const owner = g ? g.dono : this.loaded()?.dono;
      const members = g ? g.membros : (this.loaded()?.membros ?? []);
      if (!owner) return me ? [{ codigo: me, nome: this.account.account()?.nome ?? 'Você', papel: 'dono', foto: null, voce: true }] : [];
      return [{ ...owner, papel: 'dono' as const, voce: owner.codigo === me }, ...members.map((m) => ({ codigo: m.codigo, nome: m.nome, papel: m.papel, foto: m.foto, voce: m.codigo === me }))];
    }),
    myRole: this.myRole,
    summary: computed(() => {
      const g = this.group();
      const b = this.board();
      const l = this.loaded();
      return accessSummary({
        me: this.myRole(),
        meCode: this.me() || null,
        ownerName: (g?.dono ?? l?.dono)?.nome ?? '',
        members: g?.membros ?? l?.membros ?? [],
        public: !!b?.publico || !!g?.publico,
      });
    }),
    emptyHint: computed(() => (this.group() || this.loaded()?.membros.length ? null : 'Por enquanto, só você. Quem você chamar vê o quadro no próprio Quadro livre.')),
    add: (codigo: string, papel: MemberRole) => this.setRole(codigo, papel),
    // num quadro de grupo, quem entra entra no grupo inteiro: as privadas dele também (o aviso do grupo, P1)
    beforeAdd: async (nome: string) => {
      const g = this.group();
      if (!g) return true;
      const key = lookKey(this.groupName());
      const priv = this.reviews.notes().filter((n) => isNote(n) && n.private && !!n.category && lookKey(n.category) === key).length;
      return this.confirm.ask({
        title: `Chamar ${nome} para o grupo?`,
        text: `Este quadro vai com o grupo ${this.groupName()}: ${nome} entra no grupo inteiro e vê as anotações dele${priv ? `, inclusive ${priv === 1 ? 'a privada' : `as ${priv} privadas`}` : ''}.`,
        confirm: 'Chamar mesmo assim',
        tone: 'neutro',
      });
    },
    setRole: (codigo: string, papel: MemberRole) => this.setRole(codigo, papel),
    remove: async (codigo: string) => {
      const g = this.group();
      if (g) return this.groups.removeMember(g.id, codigo);
      const res = await this.account.request<{ membros?: unknown[] }>(`/v1/eu/quadros/${this.boardId()}/membros/${encodeURIComponent(codigo)}`, { method: 'DELETE' });
      this.takeMembers(res?.membros);
    },
  };

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
    void this.load();
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  /** As pessoas do quadro solto (o de um grupo usa as do grupo, já aqui). */
  private async load(): Promise<void> {
    if (!this.account.signedIn() || !this.inCloud()) return;
    try {
      const res = await this.account.request<{ papel?: unknown; dono?: unknown; membros?: unknown[] }>(`/v1/eu/quadros/${this.boardId()}/membros`);
      const dono = parsePerson(res?.dono);
      const papel = (['dono', 'gestor', 'editor', 'leitor'] as const).find((r) => r === res?.papel);
      if (dono && papel) this.loaded.set({ papel, dono, membros: membersOf(res?.membros) });
    } catch (err) {
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para trazer quem está no quadro agora.');
    }
  }

  private async setRole(codigo: string, papel: MemberRole): Promise<void> {
    const g = this.group();
    if (g) return this.groups.setRole(g.id, codigo, papel);
    const res = await this.account.request<{ membros?: unknown[] }>(`/v1/eu/quadros/${this.boardId()}/membros/${encodeURIComponent(codigo)}`, {
      method: 'PUT',
      body: { papel },
    });
    this.takeMembers(res?.membros);
  }

  private takeMembers(raw: unknown[] | undefined): void {
    const l = this.loaded();
    if (l && raw) this.loaded.set({ ...l, membros: membersOf(raw) });
  }

  /** Sai do quadro solto de outra pessoa: ele sai do seu Quadro livre. */
  protected async leave(): Promise<void> {
    const b = this.board();
    if (!b) return;
    const sure = await this.confirm.ask({
      title: 'Sair deste quadro?',
      text: `“${b.nome}” sai do seu Quadro livre. Ele continua com quem o fez; para voltar, alguém precisa chamar você de novo.`,
      confirm: 'Sair do quadro',
    });
    if (!sure) return;
    this.busy.set('sair');
    try {
      await this.account.request(`/v1/eu/quadros/${this.boardId()}/membros/eu`, { method: 'DELETE' });
      await this.store.dropRecord(this.boardId());
      this.left.emit();
      this.close();
    } catch (err) {
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para sair agora. Tente de novo.');
    } finally {
      this.busy.set(null);
    }
  }
}

function membersOf(raw: unknown[] | undefined): SharedMember[] {
  const out: SharedMember[] = [];
  for (const item of raw ?? []) {
    const p = parsePerson(item);
    const papel = (item as { papel?: unknown } | null)?.papel;
    if (p && isMemberRole(papel)) out.push({ ...p, papel, desde: String((item as { desde?: unknown }).desde ?? '') });
  }
  return out;
}
