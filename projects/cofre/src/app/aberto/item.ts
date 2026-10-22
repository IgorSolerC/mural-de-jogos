import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { type CamposDoItem, type ItemNaLista, LIMITES } from '../../core/itens';
import { AreaDeTransferencia } from '../area-de-transferencia';
import { Icone } from '../icone';
import { SERVICOS } from '../servicos';
import { GeradorPainel } from './gerador-painel';
import { dominio, nomeDoItem, urlSegura } from './monograma';
import { MonogramaSelo } from './monograma-selo';
import { emTrechos } from './trechos';

export { urlSegura } from './monograma';
export { emTrechos, type Trecho } from './trechos';

/** Quanto tempo a senha fica à mostra. */
export const REVELAR_MS = 15_000;
const MOSTRAR_PARA_DIGITAR_MS = 60_000;
/** Quanto tempo o botão de copiar fica dizendo "copiado". */
const COPIADO_MS = 1800;

/** A senha em grupos de 4, para ler e digitar em outro aparelho. */
export function emGrupos(senha: string): string[] {
  return [...senha].reduce<string[]>((grupos, c, i) => (i % 4 === 0 ? [...grupos, c] : [...grupos.slice(0, -1), grupos[grupos.length - 1] + c]), []);
}

/**
 * Um item do cofre (decisão 11): Título, User, Senha, URL e Descrição, à direita da lista. Ver: copiar
 * (a área de transferência é limpa em 30 s), revelar a senha (15 s, com a linha que encolhe), mostrar
 * para digitar (letras grandes, em grupos) e abrir o site (aba nova, sem dizer de onde veio). Editar no
 * mesmo lugar: os cinco campos, todos opcionais, e o gerador.
 */
@Component({
  selector: 'cofre-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeradorPainel, Icone, MonogramaSelo],
  templateUrl: './item.html',
  styleUrl: './item.scss',
  host: { '(document:keydown.escape)': 'paraDigitar.set(false)' },
})
export class ItemDoCofre {
  private readonly servicos = inject(SERVICOS);
  private readonly area = inject(AreaDeTransferencia);
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  /** O item, ou null para um novo. */
  readonly alvo = input<ItemNaLista | null>(null);
  readonly ocupado = input(false);
  /** Quantas vezes a senha apareceu em vazamentos (0: nenhuma, ou ainda não conferida). */
  readonly vazada = input(0);
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
  /** O que acabou de ser copiado ("usuario", "senha", "anterior-2"…), para o botão dizer que deu certo. */
  protected readonly copiado = signal<string | null>(null);
  protected readonly campos = signal<CamposDoItem>({ titulo: '', usuario: '', senha: '', url: '', descricao: '' });

  protected readonly item = computed(() => this.alvo()?.item ?? null);
  protected readonly site = computed(() => urlSegura(this.item()?.url ?? ''));
  protected readonly dominio = computed(() => dominio(this.item()?.url ?? ''));
  protected readonly nome = computed(() => (this.item() ? nomeDoItem(this.item()!) : ''));
  /** O nome enquanto se escreve (o monograma acompanha). */
  protected readonly nomeEditando = computed(() => nomeDoItem(this.campos()) === 'Sem título' ? '' : nomeDoItem(this.campos()));
  protected readonly trechos = computed(() => emTrechos(this.item()?.senha ?? ''));
  protected readonly gruposEmTrechos = computed(() => emGrupos(this.item()?.senha ?? '').map(emTrechos));
  protected readonly novo = computed(() => this.alvo() === null);
  protected readonly vazio = computed(() => Object.values(this.campos()).every((v) => !v.trim()));
  private readonly idDoAlvo = computed(() => this.alvo()?.id ?? null);
  private timerRevelar: ReturnType<typeof setTimeout> | null = null;
  private timerCopiado: ReturnType<typeof setTimeout> | null = null;

  private readonly fecharParaDigitar = viewChild<ElementRef<HTMLButtonElement>>('fecharDigitar');
  private readonly primeiroCampo = viewChild<ElementRef<HTMLInputElement>>('primeiroCampo');

  constructor() {
    // o foco vai para a folha da senha quando ela abre (o Esc fecha, de qualquer lugar)
    effect(() => this.fecharParaDigitar()?.nativeElement.focus());
    // trocar de item (na lista ao lado) começa do zero: nada revelado, nada sendo editado
    effect(() => {
      this.idDoAlvo();
      untracked(() => {
        this.revelada.set(false);
        this.paraDigitar.set(false);
        this.gerador.set(false);
        this.mostrarNoCampo.set(false);
        this.copiado.set(null);
        if (this.novo()) this.editar();
        else this.editando.set(false);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      for (const t of [...this.timers, this.timerRevelar, this.timerCopiado]) if (t) clearTimeout(t);
    });
  }

  /** Editando ou com a senha grande na tela: o Esc é de quem está aberto aqui. */
  ocupadoComAlgo(): boolean {
    return this.editando() || this.paraDigitar();
  }

  private depois(ms: number, fazer: () => void): void {
    this.timers.push(setTimeout(fazer, ms));
  }

  protected editar(): void {
    const i = this.item();
    this.campos.set({ titulo: i?.titulo ?? '', usuario: i?.usuario ?? '', senha: i?.senha ?? '', url: i?.url ?? '', descricao: i?.descricao ?? '' });
    this.revelada.set(false);
    this.editando.set(true);
    setTimeout(() => this.primeiroCampo()?.nativeElement.focus());
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

  protected alternarRevelar(): void {
    if (this.timerRevelar) clearTimeout(this.timerRevelar);
    if (this.revelada()) {
      this.revelada.set(false);
      return;
    }
    this.revelada.set(true);
    this.timerRevelar = setTimeout(() => this.revelada.set(false), REVELAR_MS);
  }

  protected async copiar(texto: string, oQue: string, marca: string): Promise<void> {
    try {
      await this.area.copiar(texto);
      this.copiado.set(marca);
      if (this.timerCopiado) clearTimeout(this.timerCopiado);
      this.timerCopiado = setTimeout(() => this.copiado.set(null), COPIADO_MS);
      this.avisar.emit(`${oQue} copiado. A área de transferência é limpa em 30 segundos.`);
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
