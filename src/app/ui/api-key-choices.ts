import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import {
  APROVACAO_PADRAO,
  APROVACOES,
  AREAS_DA_API,
  ATALHOS,
  ESCOPOS,
  NOME_DA_CHAVE_MAX,
  VALIDADE_PADRAO,
  VALIDADES,
  type Aprovacao,
  type AreaDaApi,
  type Atalho,
  dobra,
  textoLimpo,
} from '../../../contrato/api-v1/escopos';
import { ApiKeyInput, dayLabel } from '../core/api-keys';
import { DAY_MS } from '../core/dates';
import { KanbanStore } from '../core/kanban-store';

/** O que a escolha começa marcando (uma chave que existe, ou o que um conector pediu). */
export interface KeyChoiceStart {
  nome: string;
  escopos: readonly string[];
  grupos?: readonly string[] | null;
  aprovacao?: Aprovacao;
}

/**
 * As escolhas de um acesso (PLANO-API.md, 5 e 11.2): o nome, o que ele pode (os atalhos e as caixinhas
 * por área), em que grupos das Anotações, quando ele espera você e a validade. Uma peça só, usada pela
 * folha da chave (Ajustes › Acessos) e pela página Autorizar (um conector pelo OAuth); quem usa põe o
 * `<form>` em volta e lê o resultado com `read()`. Os estilos são os da folha da chave.
 */
@Component({
  selector: 'app-api-key-choices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="parte">
      <label class="parte-titulo" for="chave-nome">Nome</label>
      <p class="parte-desc" id="chave-nome-desc">Para você reconhecer na lista: quem usa e para quê.</p>
      <div class="campo" [class.erro]="nameMissing()">
        <input
          id="chave-nome"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="Claude, os gastos"
          aria-describedby="chave-nome-desc"
          [attr.aria-invalid]="nameMissing() ? 'true' : null"
          [maxLength]="nameMax"
          [value]="name()"
          (input)="name.set($any($event.target).value)"
        />
      </div>
    </div>

    <fieldset class="parte">
      <legend class="parte-titulo">{{ connector() ? 'O que ele pode' : 'O que ela pode' }}</legend>
      <div class="atalhos" role="group" aria-label="Atalhos">
        @for (a of presets; track a.id) {
          <button type="button" class="atalho" [attr.aria-pressed]="isPreset(a)" (click)="applyPreset(a)">{{ a.nome }}</button>
        }
      </div>
      <div class="areas">
        @for (area of areas; track area.id) {
          <div class="area" role="group" [attr.aria-labelledby]="'area-' + area.id">
            <p class="area-nome" [id]="'area-' + area.id">{{ area.nome }}</p>
            @for (e of scopesOf(area.id); track e.id) {
              <label class="caixa" [class.cuidado]="e.cuidado">
                <input type="checkbox" [checked]="scopes().has(e.id)" [attr.aria-describedby]="'inclui-' + e.id" (change)="toggle(e.id, $any($event.target).checked)" />
                <span class="caixa-nome">{{ e.nome }}</span>
                <span class="caixa-inclui" [id]="'inclui-' + e.id">{{ e.inclui }}</span>
              </label>
            }
          </div>
        }
      </div>
      @if (scopesMissing()) {
        <p class="falta" role="alert">Marque pelo menos uma permissão.</p>
      }
    </fieldset>

    @if (touchesNotes()) {
      <fieldset class="parte">
        <legend class="parte-titulo">Em que grupos das Anotações</legend>
        <p class="parte-desc">Vale para as anotações e para os quadros do Kanban.</p>
        <div class="segmentos dois">
          <label class="segmento">
            <input type="radio" name="chave-grupos" [checked]="!someGroups()" (change)="someGroups.set(false)" />
            <span class="seg-nome">Todos os grupos</span>
          </label>
          <label class="segmento">
            <input type="radio" name="chave-grupos" [checked]="someGroups()" (change)="someGroups.set(true)" />
            <span class="seg-nome">Só alguns</span>
          </label>
        </div>
        @if (someGroups()) {
          @if (groupOptions().length) {
            <div class="grupos" role="group" aria-label="Os grupos">
              @for (g of groupOptions(); track g) {
                <label class="caixa curta">
                  <input type="checkbox" [checked]="hasGroup(g)" (change)="toggleGroup(g, $any($event.target).checked)" />
                  <span class="caixa-nome">{{ g }}</span>
                </label>
              }
            </div>
          } @else {
            <p class="parte-desc">Você ainda não tem anotações com grupo. Sem nenhum marcado, {{ connector() ? 'o conector' : 'a chave' }} não alcança nenhuma anotação.</p>
          }
          @if (!groups().length && groupOptions().length) {
            <p class="falta" role="alert">Marque pelo menos um grupo, ou volte para Todos os grupos.</p>
          }
        }
      </fieldset>
    }

    <fieldset class="parte">
      <legend class="parte-titulo">{{ connector() ? 'Quando ele espera você' : 'Quando ela espera você' }}</legend>
      <div class="segmentos">
        @for (a of approvals; track a.id) {
          <label class="segmento">
            <input type="radio" name="chave-aprovacao" [checked]="approval() === a.id" (change)="approval.set(a.id)" />
            <span class="seg-nome">{{ a.nome }}</span>
          </label>
        }
      </div>
      <p class="parte-desc">{{ approvalHint() }}</p>
    </fieldset>

    @if (withValidity()) {
      <fieldset class="parte">
        <legend class="parte-titulo">Validade</legend>
        <div class="segmentos quatro">
          @for (d of validities; track d) {
            <label class="segmento">
              <input type="radio" name="chave-validade" [checked]="days() === d" (change)="days.set(d)" />
              <span class="seg-num">{{ d === 365 ? 1 : d }}</span>
              <span class="seg-sub">{{ d === 365 ? 'ano' : 'dias' }}</span>
            </label>
          }
        </div>
        <p class="parte-desc">
          Vale até {{ until() }}.
          {{ connector() ? 'Depois, ele para sozinho; para continuar, conecte de novo.' : 'Depois, ela para sozinha; para continuar, crie outra.' }}
        </p>
      </fieldset>
    }
  `,
  styleUrl: './api-key-sheet.scss',
})
export class ApiKeyChoices {
  /** É um conector (OAuth): as frases falam "ele" em vez de "ela" (a chave). */
  readonly connector = input(false);
  /** Escolher a validade (ao criar; uma chave que existe não muda a validade). */
  readonly withValidity = input(true);

  private readonly kanban = inject(KanbanStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly presets = ATALHOS;
  protected readonly areas = AREAS_DA_API;
  protected readonly approvals = APROVACOES;
  protected readonly validities = VALIDADES;
  protected readonly nameMax = NOME_DA_CHAVE_MAX;

  readonly name = signal('');
  protected readonly scopes = signal<ReadonlySet<string>>(new Set());
  protected readonly someGroups = signal(false);
  protected readonly groups = signal<readonly string[]>([]);
  protected readonly approval = signal<Aprovacao>(APROVACAO_PADRAO);
  protected readonly days = signal<number>(VALIDADE_PADRAO);
  /** Tentou salvar: só então o que falta aparece. */
  private readonly tried = signal(false);

  protected readonly nameMissing = computed(() => this.tried() && !textoLimpo(this.name(), NOME_DA_CHAVE_MAX));
  protected readonly scopesMissing = computed(() => this.tried() && this.scopes().size === 0);
  /** O acesso mexe nas Anotações ou no Kanban: os grupos importam. */
  protected readonly touchesNotes = computed(() => [...this.scopes()].some((s) => s.startsWith('notas:') || s.startsWith('kanban:')));
  /** Os grupos das anotações (os do Kanban), com os que o acesso já tinha e sumiram no fim. */
  protected readonly groupOptions = computed(() => {
    const labels = this.kanban.categories().map((c) => c.label);
    const known = new Set(labels.map(dobra));
    return [...labels, ...this.groups().filter((g) => !known.has(dobra(g)))];
  });
  protected readonly approvalHint = computed(() => APROVACOES.find((a) => a.id === this.approval())!.explica);
  protected readonly until = computed(() => dayLabel(new Date(Date.now() + this.days() * DAY_MS).toISOString()));

  /** Começa com isto marcado. */
  start(s: KeyChoiceStart): void {
    this.name.set(s.nome);
    this.scopes.set(new Set(s.escopos));
    this.someGroups.set(!!s.grupos?.length);
    this.groups.set(s.grupos ?? []);
    if (s.aprovacao) this.approval.set(s.aprovacao);
  }

  /** O que foi escolhido, ou null (e o que falta aparece, com o foco no primeiro problema). */
  read(): ApiKeyInput | null {
    this.tried.set(true);
    const nome = textoLimpo(this.name(), NOME_DA_CHAVE_MAX);
    const missingGroups = this.touchesNotes() && this.someGroups() && !this.groups().length && this.groupOptions().length > 0;
    if (!nome || !this.scopes().size || missingGroups) {
      this.focusFirstProblem();
      return null;
    }
    return {
      nome,
      escopos: ESCOPOS.filter((e) => this.scopes().has(e.id)).map((e) => e.id),
      grupos: this.touchesNotes() && this.someGroups() && this.groups().length ? [...this.groups()] : null,
      aprovacao: this.approval(),
      ...(this.withValidity() ? { validade: this.days() } : {}),
    };
  }

  protected scopesOf(area: AreaDaApi) {
    return ESCOPOS.filter((e) => e.area === area);
  }

  protected toggle(id: string, on: boolean): void {
    this.scopes.update((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected isPreset(a: Atalho): boolean {
    const s = this.scopes();
    return s.size === a.escopos.length && a.escopos.every((id) => s.has(id));
  }

  protected applyPreset(a: Atalho): void {
    this.scopes.set(new Set(a.escopos));
  }

  protected hasGroup(g: string): boolean {
    return this.groups().some((x) => dobra(x) === dobra(g));
  }

  protected toggleGroup(g: string, on: boolean): void {
    this.groups.update((list) => (on ? [...list.filter((x) => dobra(x) !== dobra(g)), g] : list.filter((x) => dobra(x) !== dobra(g))));
  }

  private focusFirstProblem(): void {
    queueMicrotask(() => {
      const el = this.host.nativeElement;
      (el.querySelector<HTMLElement>('[aria-invalid="true"]') ?? el.querySelector<HTMLElement>('.falta'))?.scrollIntoView({ block: 'center' });
      el.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }
}
