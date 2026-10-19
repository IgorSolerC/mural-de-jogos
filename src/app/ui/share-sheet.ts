import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ICON, IconModule } from './icons';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { normalizeCode } from '../core/cloud-murals';
import { Follow } from '../core/follow';
import { Review, Stock, audienceFields, fold } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { MEMBER_ROLES, MemberRole, ROLE_HINT, ROLE_LABEL, SharedRole, canManage } from '../core/shared-notes';
import { SharedStore } from '../core/shared-store';
import { BackdropClose } from './backdrop-close';
import { Busy } from './busy';
import { Confirm } from './confirm';
import { PersonPhoto } from './person-photo';
import { Pin } from './pin';

/** Uma pessoa que dá para chamar: quem você segue ou quem segue você. */
interface Suggestion {
  codigo: string;
  nome: string;
  /** "Vocês se seguem", "Você segue", "Segue você". */
  rel: string;
}

/** Uma linha de "Quem está na anotação". */
interface Row {
  codigo: string;
  nome: string;
  papel: SharedRole;
  foto: { emoji: string; cor: Stock } | null;
  voce: boolean;
}

/**
 * Compartilhar uma anotação, como no Google Docs: chamar alguém (pelo nome de quem você segue, ou pelo
 * código) com um papel (Gestor, Editor ou Leitor), trocar o papel de quem está, tirar alguém, decidir
 * se quem visita os murais vê, e sair (quem não é o dono). Quem não gere a anotação só vê quem está
 * nela. Cada mudança vale na hora (não há "Enviar"): a pessoa chamada recebe o aviso em Amigos.
 *
 * Chega num pedaço à parte, só quando é aberta (ver a leitura).
 */
@Component({
  selector: 'app-share-sheet',
  imports: [BackdropClose, Busy, IconModule, PersonPhoto, Pin],
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
  private readonly follow = inject(Follow);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('campo');

  protected readonly CloseIcon = ICON.fechar;
  protected readonly AddIcon = ICON.seguir;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly OwnerIcon = ICON.coroa;
  protected readonly PrivateIcon = ICON.privada;
  protected readonly PublicIcon = ICON.publica;
  protected readonly LeaveIcon = ICON.sair;
  protected readonly roles = MEMBER_ROLES;
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly roleHint = ROLE_HINT;

  protected readonly note = computed(() => this.store.get(this.noteId()) ?? null);
  protected readonly entry = computed(() => this.shared.get(this.noteId()) ?? null);
  /** O papel de quem abriu: dono da própria anotação que ainda não foi compartilhada. */
  protected readonly myRole = computed<SharedRole>(() => this.entry()?.papel ?? 'dono');
  protected readonly manages = computed(() => canManage(this.myRole()));
  protected readonly signedIn = computed(() => this.account.signedIn() && !!this.cloud.config());
  private readonly me = computed(() => this.account.account()?.codigo ?? '');

  /** Quem está: o dono primeiro, depois as pessoas na ordem em que entraram. */
  protected readonly rows = computed<Row[]>(() => {
    const e = this.entry();
    const me = this.me();
    if (!e) return me ? [{ codigo: me, nome: this.account.account()?.nome ?? 'Você', papel: 'dono', foto: null, voce: true }] : [];
    return [
      { ...e.dono, papel: 'dono' as const, voce: e.dono.codigo === me },
      ...e.membros.map((m) => ({ codigo: m.codigo, nome: m.nome, papel: m.papel, foto: m.foto, voce: m.codigo === me })),
    ];
  });
  protected readonly others = computed(() => this.rows().filter((r) => !r.voce).length);

  /** O que está escrito no campo de chamar alguém, e o papel com que a pessoa entra. */
  protected readonly query = signal('');
  protected readonly newRole = signal<MemberRole>('editor');
  /** O pedido em andamento (a pessoa, ou 'sair', 'publico'), para o botão esperar. */
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  /** O que o leitor de tela ouve depois de uma mudança. */
  protected readonly said = signal('');

  /** Quem você segue e quem segue você, menos quem já está: os mais parecidos com o que foi escrito. */
  protected readonly suggestions = computed<Suggestion[]>(() => {
    const people = this.follow.people();
    if (!people) return [];
    const inside = new Set(this.rows().map((r) => r.codigo));
    const map = new Map<string, Suggestion>();
    for (const p of people.seguindo) map.set(p.codigo, { codigo: p.codigo, nome: p.nome, rel: p.meSegue ? 'Vocês se seguem' : 'Você segue' });
    for (const p of people.seguidores) if (!map.has(p.codigo)) map.set(p.codigo, { codigo: p.codigo, nome: p.nome, rel: 'Segue você' });
    const q = fold(this.query().trim());
    const code = normalizeCode(this.query());
    return [...map.values()]
      .filter((s) => !inside.has(s.codigo) && (!q || fold(s.nome).includes(q) || s.codigo === code || fold(s.codigo).includes(q)))
      .sort((a, b) => Number(!fold(a.nome).startsWith(q)) - Number(!fold(b.nome).startsWith(q)) || a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 5);
  });
  /** O código escrito à mão, de alguém que não está nas sugestões. */
  protected readonly typedCode = computed(() => {
    const code = normalizeCode(this.query());
    if (!code || this.rows().some((r) => r.codigo === code)) return null;
    return this.suggestions().some((s) => s.codigo === code) ? null : code;
  });

  /** Quem visita os murais vê a anotação? */
  protected readonly isPrivate = computed(() => !!this.note()?.private);

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      (this.field()?.nativeElement ?? el.querySelector<HTMLElement>('.fecha'))?.focus();
    });
    if (this.follow.available() && !this.follow.people()) void this.follow.loadPeople().catch(() => undefined);
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected setQuery(v: string): void {
    this.query.set(v);
    this.error.set(null);
  }

  /** Enter no campo: a primeira sugestão, ou o código escrito. */
  protected onEnter(e: Event): void {
    e.preventDefault();
    const code = this.suggestions()[0]?.codigo ?? this.typedCode();
    if (code) void this.add(code, this.suggestions()[0]?.nome ?? code);
    else if (this.query().trim()) this.error.set('Não achei ninguém com esse nome entre quem você segue. Escreva o código da pessoa (como ABCD-1234).');
  }

  /** Chama a pessoa com o papel escolhido (compartilha a anotação, se ainda não estava). */
  protected async add(codigo: string, nome: string): Promise<void> {
    const note = this.note();
    if (!note || this.busy()) return;
    if (codigo === this.me()) {
      this.error.set('Esse código é o seu.');
      return;
    }
    this.busy.set(codigo);
    this.error.set(null);
    const papel = this.newRole();
    try {
      if (this.entry()) await this.shared.setRole(note.id, codigo, papel);
      else await this.shared.share(note, [{ codigo, papel }]);
      this.query.set('');
      this.said.set(`${nome} agora está na anotação como ${ROLE_LABEL[papel].toLowerCase()}.`);
      this.field()?.nativeElement.focus();
    } catch (err) {
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para compartilhar agora. Tente de novo.');
    } finally {
      this.busy.set(null);
    }
  }

  /** Troca o papel de alguém, ou tira a pessoa (a opção "Tirar" do mesmo menu). */
  protected async change(row: Row, value: string): Promise<void> {
    const note = this.note();
    if (!note || this.busy()) return;
    if (value === 'tirar') {
      const sure = await this.confirm.ask({
        title: `Tirar ${row.nome}?`,
        text: `A anotação sai do mural de ${row.nome}. Dá para chamar de novo depois.`,
        confirm: 'Tirar da anotação',
      });
      if (!sure) {
        this.resetSelect(row);
        return;
      }
    }
    this.busy.set(row.codigo);
    this.error.set(null);
    try {
      if (value === 'tirar') {
        await this.shared.removeMember(note.id, row.codigo);
        this.said.set(`${row.nome} saiu da anotação.`);
      } else {
        await this.shared.setRole(note.id, row.codigo, value as MemberRole);
        this.said.set(`${row.nome} agora é ${ROLE_LABEL[value as MemberRole].toLowerCase()}.`);
      }
    } catch (err) {
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para mudar agora. Tente de novo.');
      this.resetSelect(row);
    } finally {
      this.busy.set(null);
    }
  }

  /** O menu volta para o papel de agora (a pessoa desistiu, ou a nuvem recusou). */
  private resetSelect(row: Row): void {
    const el = this.dialog().nativeElement.querySelector<HTMLSelectElement>(`select[data-codigo="${row.codigo}"]`);
    if (el) el.value = row.papel;
  }

  /** Privada (só quem está nela) ou pública (aparece também no mural de quem está, para quem visita). */
  protected setPrivate(priv: boolean): void {
    const note = this.note();
    if (!note || !this.manages() || priv === this.isPrivate()) return;
    const now = new Date().toISOString();
    const { private: _p, quiet: _q, publishedAt: _w, ...rest } = note;
    this.store.update({ ...rest, ...audienceFields(priv ? 'privada' : 'visivel', note, now), updatedAt: now } as Review);
    this.said.set(priv ? 'Agora a anotação é privada.' : 'Agora a anotação é pública.');
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
