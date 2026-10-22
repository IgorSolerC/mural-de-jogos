import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { type CamposDoItem, type ItemNaLista, LIMITES } from '../../core/itens';
import { SERVICOS } from '../servicos';
import { GeradorPainel } from './gerador-painel';

/** Quanto tempo a senha fica à mostra, e quanto tempo até a área de transferência ser limpa. */
export const REVELAR_MS = 15_000;
export const LIMPAR_COPIA_MS = 30_000;
const MOSTRAR_PARA_DIGITAR_MS = 60_000;

/** O endereço guardado, só se for http ou https (sem esquema, entende como https). */
export function urlSegura(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** A senha em grupos de 4, para ler e digitar em outro aparelho. */
export function emGrupos(senha: string): string[] {
  return [...senha].reduce<string[]>((grupos, c, i) => (i % 4 === 0 ? [...grupos, c] : [...grupos.slice(0, -1), grupos[grupos.length - 1] + c]), []);
}

/**
 * Um item do cofre (decisão 11): Título, User, Senha, URL e Descrição. Ver: copiar (a área de
 * transferência é limpa em 30 s), revelar a senha (15 s), mostrar para digitar (letras grandes, em grupos)
 * e abrir o site (aba nova, sem dizer de onde veio). Editar: os cinco campos, todos opcionais, e o gerador.
 */
@Component({
  selector: 'cofre-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeradorPainel],
  templateUrl: './item.html',
  styleUrl: './item.scss',
  host: { '(document:keydown.escape)': 'paraDigitar.set(false)' },
})
export class ItemDoCofre implements OnInit {
  private readonly servicos = inject(SERVICOS);
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  /** O item, ou null para um novo. */
  readonly alvo = input<ItemNaLista | null>(null);
  readonly ocupado = input(false);
  readonly salvar = output<CamposDoItem>();
  readonly paraALixeira = output<void>();
  readonly voltar = output<void>();
  readonly avisar = output<string>();

  protected readonly limites = LIMITES;
  protected readonly editando = signal(false);
  protected readonly revelada = signal(false);
  protected readonly paraDigitar = signal(false);
  protected readonly gerador = signal(false);
  protected readonly mostrarNoCampo = signal(false);
  protected readonly campos = signal<CamposDoItem>({ titulo: '', usuario: '', senha: '', url: '', descricao: '' });

  protected readonly item = computed(() => this.alvo()?.item ?? null);
  protected readonly site = computed(() => urlSegura(this.item()?.url ?? ''));
  protected readonly grupos = computed(() => emGrupos(this.item()?.senha ?? ''));
  protected readonly novo = computed(() => this.alvo() === null);
  protected readonly vazio = computed(() => Object.values(this.campos()).every((v) => !v.trim()));

  private readonly fecharParaDigitar = viewChild<ElementRef<HTMLButtonElement>>('fecharDigitar');

  constructor() {
    // o foco vai para a folha da senha quando ela abre (o Esc fecha, de qualquer lugar)
    effect(() => this.fecharParaDigitar()?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => {
      for (const t of this.timers) clearTimeout(t);
    });
  }

  ngOnInit(): void {
    if (this.novo()) this.editar();
  }

  private depois(ms: number, fazer: () => void): void {
    this.timers.push(setTimeout(fazer, ms));
  }

  protected editar(): void {
    const i = this.item();
    this.campos.set({ titulo: i?.titulo ?? '', usuario: i?.usuario ?? '', senha: i?.senha ?? '', url: i?.url ?? '', descricao: i?.descricao ?? '' });
    this.revelada.set(false);
    this.editando.set(true);
  }

  protected cancelar(): void {
    if (this.novo()) this.voltar.emit();
    else this.editando.set(false);
    this.gerador.set(false);
  }

  protected mudar(campo: keyof CamposDoItem, evento: Event): void {
    const valor = (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.campos.update((c) => ({ ...c, [campo]: valor }));
  }

  protected usarGerada(senha: string): void {
    this.campos.update((c) => ({ ...c, senha }));
    this.mostrarNoCampo.set(true);
    this.gerador.set(false);
  }

  protected gravar(): void {
    if (this.vazio() || this.ocupado()) return;
    this.salvar.emit(this.campos());
  }

  /** Depois de salvar, quem usa volta a mostrar o item. */
  terminouDeSalvar(): void {
    this.editando.set(false);
    this.gerador.set(false);
    this.mostrarNoCampo.set(false);
  }

  protected revelar(): void {
    this.revelada.set(true);
    this.depois(REVELAR_MS, () => this.revelada.set(false));
  }

  protected async copiar(texto: string, oQue: string): Promise<void> {
    try {
      await this.servicos.pagina.copiar(texto);
      this.avisar.emit(`${oQue} copiado. A área de transferência é limpa em 30 segundos.`);
      this.depois(LIMPAR_COPIA_MS, () => void this.servicos.pagina.copiar('').catch(() => undefined));
    } catch {
      this.avisar.emit('Não deu para copiar. Toque em Revelar e digite.');
    }
  }

  protected mostrarParaDigitar(): void {
    this.paraDigitar.set(true);
    this.depois(MOSTRAR_PARA_DIGITAR_MS, () => this.paraDigitar.set(false));
  }

  /** A data no fuso deste aparelho (o ISO guardado é UTC). */
  protected dia(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  protected abrirSite(): void {
    const url = this.site();
    if (url) this.servicos.pagina.abrirSite(url);
  }
}
