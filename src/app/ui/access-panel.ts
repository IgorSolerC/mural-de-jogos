import { ChangeDetectionStrategy, Component, ElementRef, Signal, computed, inject, input, signal, viewChild } from '@angular/core';
import { AccessSummary } from '../core/access';
import { CloudError } from '../core/cloud-account';
import { normalizeCode } from '../core/cloud-murals';
import { Follow } from '../core/follow';
import { Stock, fold } from '../core/review';
import { MEMBER_ROLES, MemberRole, ROLE_HINT, ROLE_LABEL, SharedRole, canManage } from '../core/shared-notes';
import { Busy } from './busy';
import { Confirm } from './confirm';
import { ICON, IconModule } from './icons';
import { PersonPhoto } from './person-photo';

/** Uma linha de "Quem está": o dono primeiro, depois as pessoas na ordem em que entraram. */
export interface AccessRow {
  codigo: string;
  nome: string;
  papel: SharedRole;
  foto: { emoji: string; cor: Stock } | null;
  voce: boolean;
  /** Está pelo grupo (o nome dele), não pela anotação: o papel muda no grupo, não aqui (3.4). */
  via?: string;
}

/**
 * O que a peça Quem vê mostra e muda: uma anotação (a folha Compartilhar) ou um grupo (a parte Compartilhar
 * da engrenagem). Cada mudança vale na hora; um método que falha lança `CloudError` com a mensagem pronta.
 */
export interface AccessTarget {
  /** A palavra da coisa, para as frases: "anotação", "grupo". */
  noun: 'anotação' | 'grupo';
  rows: Signal<AccessRow[]>;
  myRole: Signal<SharedRole>;
  summary: Signal<AccessSummary | null>;
  /** Chamar alguém com um papel (compartilha, se ainda não estava). */
  add(codigo: string, papel: MemberRole): Promise<void>;
  setRole(codigo: string, papel: MemberRole): Promise<void>;
  remove(codigo: string): Promise<void>;
  /** Pergunta antes de chamar alguém (as privadas do grupo, 4.4.3 do plano); false: a pessoa desistiu. */
  beforeAdd?(nome: string): Promise<boolean>;
  /** A frase de quando ainda não há ninguém ("Por enquanto, só você…"); null: há gente. */
  emptyHint?: Signal<string | null>;
}

/** Uma pessoa que dá para chamar: quem você segue ou quem segue você. */
interface Suggestion {
  codigo: string;
  nome: string;
  /** "Vocês se seguem", "Você segue", "Segue você". */
  rel: string;
}

/**
 * Quem vê (PLANO-COMPARTILHAR.md, 4.1): a peça única da anotação e do grupo, como no Google Docs. No topo, a
 * frase que responde "quem vê isto?" (core/access.ts); depois chamar alguém (o nome de quem você segue, ou o
 * código) com um papel, e quem está, com o menu de papel (e Tirar) para quem gere. O que é de cada coisa (o
 * "Quem mais vê" da anotação, o público do grupo) entra por baixo, projetado.
 */
@Component({
  selector: 'app-access-panel',
  imports: [Busy, IconModule, PersonPhoto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './access-panel.html',
  styleUrl: './access-panel.scss',
})
export class AccessPanel {
  readonly target = input.required<AccessTarget>();

  private readonly follow = inject(Follow);
  private readonly confirm = inject(Confirm);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('campo');

  protected readonly AddIcon = ICON.seguir;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly OwnerIcon = ICON.coroa;
  protected readonly roles = MEMBER_ROLES;
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly roleHint = ROLE_HINT;

  protected readonly rows = computed(() => this.target().rows());
  protected readonly manages = computed(() => canManage(this.target().myRole()));
  protected readonly summary = computed(() => this.target().summary());
  protected readonly noun = computed(() => this.target().noun);
  /** "na anotação", "no grupo". */
  protected readonly inIt = computed(() => (this.noun() === 'grupo' ? 'no grupo' : 'na anotação'));

  protected readonly query = signal('');
  protected readonly newRole = signal<MemberRole>('editor');
  /** O pedido em andamento (o código da pessoa), para o botão esperar. */
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
  private readonly me = computed(() => this.rows().find((r) => r.voce)?.codigo ?? '');

  constructor() {
    if (this.follow.available() && !this.follow.people()) void this.follow.loadPeople().catch(() => undefined);
  }

  /** O campo de chamar alguém (a folha põe o foco nele ao abrir). */
  focusField(): boolean {
    const el = this.field()?.nativeElement;
    el?.focus();
    return !!el;
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

  /** Chama a pessoa com o papel escolhido. */
  protected async add(codigo: string, nome: string): Promise<void> {
    if (this.busy()) return;
    if (codigo === this.me()) {
      this.error.set('Esse código é o seu.');
      return;
    }
    const t = this.target();
    if (t.beforeAdd && !(await t.beforeAdd(nome))) return;
    this.busy.set(codigo);
    this.error.set(null);
    const papel = this.newRole();
    try {
      await t.add(codigo, papel);
      this.query.set('');
      this.said.set(`${nome} agora está ${this.inIt()} como ${ROLE_LABEL[papel].toLowerCase()}.`);
      this.field()?.nativeElement.focus();
    } catch (err) {
      this.error.set(err instanceof CloudError ? err.message : 'Não deu para compartilhar agora. Tente de novo.');
    } finally {
      this.busy.set(null);
    }
  }

  /** Troca o papel de alguém, ou tira a pessoa (a opção "Tirar" do mesmo menu). */
  protected async change(row: AccessRow, value: string): Promise<void> {
    if (this.busy()) return;
    const t = this.target();
    if (value === 'tirar') {
      const what = t.noun === 'grupo' ? 'O grupo e tudo o que está nele saem' : 'A anotação sai';
      const sure = await this.confirm.ask({
        title: `Tirar ${row.nome}?`,
        text: `${what} do mural de ${row.nome}. Dá para chamar de novo depois.`,
        confirm: t.noun === 'grupo' ? 'Tirar do grupo' : 'Tirar da anotação',
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
        await t.remove(row.codigo);
        this.said.set(`${row.nome} saiu ${t.noun === 'grupo' ? 'do grupo' : 'da anotação'}.`);
      } else {
        await t.setRole(row.codigo, value as MemberRole);
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
  private resetSelect(row: AccessRow): void {
    const el = (this.host.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(`select[data-codigo="${row.codigo}"]`);
    if (el) el.value = row.papel;
  }
}
