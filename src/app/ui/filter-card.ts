import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { readJson, writeJson } from '../core/storage';
import { ICON, IconModule } from './icons';
import { TagChip, TagChips } from './tag-chips';

/** Um assunto do filtro: o valor que escolhe, o nome, em quantas anotações está e se está escolhido. */
export interface SubjectOption {
  value: string;
  label: string;
  n: number;
  on: boolean;
}

/**
 * O que fica fora do mural até a pessoa pedir (as finalizadas, as que estão só no Kanban): um
 * interruptor na linha "Mostrar também", com quantas são e como o resumo diz que estão à mostra.
 */
export interface FilterShow {
  key: string;
  label: string;
  n: number;
  on: boolean;
  /** No resumo da ficha fechada, ligado: "com as finalizadas". */
  summary: string;
}

/** A ficha fica aberta ou fechada, no aparelho, de uma visita para a outra (a mesma no mural e no Kanban). */
const OPEN_KEY = 'meu-mural:filtros-abertos:v1';

let nextId = 0;

/**
 * A ficha dos filtros, na pasta do mural de anotações e na do Kanban: a mesma ficha creme das partes do
 * perfil, guardada na pasta. Fechada, uma linha só: "Filtros" a pincel e, a lápis, o que está ligado
 * ("História · Grupo ou Resumo"), com o "Mostrando 3 de 26" e o Limpar quando filtra; um toque em
 * qualquer lugar dela abre. Aberta, o fio vermelho e as linhas das Configurações: o assunto (os
 * recortes da cartela, o escolhido o adesivo de tinta; um por vez), as tags (as etiquetas kraft) e o
 * "Mostrar também" (os interruptores do que fica fora do mural). Sem nada para filtrar, ela não aparece.
 */
@Component({
  selector: 'app-filter-card',
  imports: [IconModule, TagChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.vazio]': 'empty()',
    '[class.aberta]': 'open()',
    '[class.filtrando]': 'filtering()',
  },
  templateUrl: './filter-card.html',
  styleUrl: './filter-card.scss',
})
export class FilterCard {
  /** Os assuntos, já na ordem (de A a Z, "Sem assunto" no fim). */
  readonly subjects = input<readonly SubjectOption[]>([]);
  /** As tags, já na ordem (as mais usadas primeiro), com as escondidas. */
  readonly tags = input<readonly TagChip[]>([]);
  /** O que fica fora do mural e volta com um interruptor (só no mural de anotações). */
  readonly shows = input<readonly FilterShow[]>([]);
  /** Quantas estão à mostra e de quantas: o "Mostrando 3 de 26". */
  readonly shown = input(0);
  readonly total = input(0);
  /** A busca ou algum filtro está ligado (o "Mostrando" e o Limpar aparecem). */
  readonly filtering = input(false);
  /** Quantas, nas outras abas, a busca acharia ("+4 em outras abas"). */
  readonly elsewhere = input(0);
  /** O resumo sem nada ligado: "Todas as anotações", "Todo o quadro". */
  readonly everything = input('Todas as anotações');

  readonly subjectChosen = output<string | null>();
  readonly tagToggled = output<string>();
  readonly tagExcluded = output<string>();
  readonly showToggled = output<string>();
  readonly cleared = output<void>();
  readonly searchedAll = output<void>();

  protected readonly id = `filtros-${nextId++}`;
  protected readonly FilterIcon = ICON.filtrar;
  protected readonly ChevronIcon = ICON.abrir;

  protected readonly open = signal(readJson<boolean>(OPEN_KEY) === true);

  /** O assunto separa alguma coisa: dois ou mais (o "Sem assunto" conta), ou um escolhido. */
  protected readonly subjectRow = computed(() => {
    const s = this.subjects();
    return s.length > 1 || s.some((x) => x.on);
  });
  protected readonly chosen = computed(() => this.subjects().find((s) => s.on) ?? null);

  protected readonly empty = computed(() => !this.subjectRow() && !this.tags().length && !this.shows().length);

  /** O resumo a lápis: o assunto, as tags ligadas, as escondidas e o que voltou ao mural. */
  protected readonly bits = computed(() => {
    const bits: string[] = [];
    const s = this.chosen();
    if (s) bits.push(s.label);
    const on = this.tags().filter((t) => t.on && !t.out);
    if (on.length) bits.push(on.map((t) => t.label).join(' ou '));
    for (const t of this.tags()) if (t.out) bits.push(`sem ${t.label}`);
    for (const x of this.shows()) if (x.on) bits.push(x.summary);
    return bits.length ? bits : [this.everything()];
  });

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    writeJson(OPEN_KEY, next);
  }
}
