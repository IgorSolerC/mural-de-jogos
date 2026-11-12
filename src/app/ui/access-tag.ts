import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { accessSummary } from '../core/access';
import { CloudAccount } from '../core/cloud-account';
import { SharedGroupsStore } from '../core/shared-groups-store';
import { PersonPhoto } from './person-photo';

/**
 * Quem vê o grupo, sem abrir nada (PLANO-COMPARTILHAR.md, 4.3): uma etiqueta de papel na pasta do mural e do
 * Kanban, ao lado da engrenagem, com as fotos de quem está (até três) e o resumo curto ("Com Ana e Bia",
 * "De Ana · você edita"). Tocar abre a engrenagem na parte Compartilhar. Só aparece quando o grupo não é
 * só seu: o estado de sempre não ganha marca (regra do dono: estado raro não ganha ícone em lugar nobre).
 */
@Component({
  selector: 'app-access-tag',
  imports: [PersonPhoto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.vazia]': '!view()' },
  template: `
    @if (view(); as v) {
      <button type="button" class="etiqueta" aria-haspopup="dialog" [attr.aria-label]="v.line + ' Abrir Compartilhar.'" [title]="v.line" (click)="open.emit()">
        <span class="rostos" aria-hidden="true">
          @for (p of v.faces; track p.codigo) {
            <app-person-photo class="rosto" [code]="p.codigo" [name]="p.nome" [face]="p.foto" />
          }
        </span>
        <span class="texto" aria-hidden="true">{{ v.short }}</span>
        @if (v.tiny) {
          <span class="texto-curto" aria-hidden="true">{{ v.tiny }}</span>
        }
      </button>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .etiqueta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      max-width: 260px;
      padding: 4px 12px 4px 6px;
      border: 0;
      border-radius: 2px;
      background-color: #fffdf8;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      color: var(--ink);
      box-shadow:
        0 0 0 1px rgb(21 21 21 / 0.08),
        0 1px 1px rgb(0 0 0 / 0.24),
        0 3px 6px -3px rgb(0 0 0 / 0.32);
      rotate: -1deg;
      cursor: pointer;
      transition:
        rotate var(--t-physical) var(--ease-physical),
        box-shadow var(--t-physical) var(--ease-physical);
    }
    .etiqueta:hover {
      rotate: 0deg;
      box-shadow:
        0 0 0 1px rgb(21 21 21 / 0.08),
        0 2px 2px rgb(0 0 0 / 0.2),
        0 7px 12px -5px rgb(0 0 0 / 0.4);
    }
    .etiqueta:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
    .rostos {
      display: inline-flex;
      flex: none;
    }
    .rosto {
      --foto: 26px;
    }
    .rosto + .rosto {
      margin-left: -9px;
    }
    .texto {
      min-width: 0;
      overflow: hidden;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.82rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .texto-curto {
      display: none;
    }
    @media (max-width: 560px) {
      .texto {
        display: none;
      }
      /* no celular, só os rostos: o público (e o grupo sem ninguém) ainda dizem o que são */
      .texto-curto {
        display: inline;
        font-family: var(--f-label);
        font-weight: 800;
        font-size: 0.78rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .etiqueta {
        padding-right: 6px;
      }
    }
  `,
})
export class AccessTag {
  /** O grupo aberto, pelo nome que ele tem no mural. */
  readonly name = input<string | null>(null);
  readonly open = output<void>();

  private readonly groups = inject(SharedGroupsStore);
  private readonly account = inject(CloudAccount);

  protected readonly view = computed(() => {
    const g = this.groups.ofCategory(this.name());
    if (!g) return null;
    const me = this.account.account()?.codigo ?? null;
    const s = accessSummary({ me: g.papel, meCode: me, ownerName: g.dono.nome, members: g.membros, public: g.publico });
    const people = [g.dono, ...g.membros].filter((p) => p.codigo !== me);
    // o que fica escrito no celular, onde a etiqueta mostra só os rostos
    const tiny = g.publico ? 'Público' : people.length ? null : s.short;
    return { ...s, faces: people.slice(0, 3), tiny };
  });
}
