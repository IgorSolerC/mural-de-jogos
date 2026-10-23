import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, input, output, signal, untracked, viewChild } from '@angular/core';
import { CORES_DA_CARTELA, type IdDoIcone } from '../../../../../shared/cartela-de-icones';
import { type CamposDoItem, type ItemNaLista, type JeitoDoGrupo, LIMITES, nomeDoGrupo, SEM_JEITO } from '../../core/itens';
import { Cartela } from '../cartela';
import { AreaDeTransferencia, avisoDaCopia } from '../area-de-transferencia';
import { Icone } from '../icone';
import { SERVICOS } from '../servicos';
import { GeradorPainel } from './gerador-painel';
import { dominio, letraDoMonograma, nomeDoItem, urlSegura } from './monograma';
import { MonogramaSelo } from './monograma-selo';
import { simples } from './pastas';
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
 * (a área de transferência é limpa 30 s depois, com o cofre na frente), revelar a senha (15 s, com a linha que encolhe), mostrar
 * para digitar (letras grandes, em grupos) e abrir o site (aba nova, sem dizer de onde veio). Editar no
 * mesmo lugar: os cinco campos, o ícone e o grupo, todos opcionais, e o gerador.
 */
@Component({
  selector: 'cofre-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Cartela, GeradorPainel, Icone, MonogramaSelo],
  templateUrl: './item.html',
  styleUrl: './item.scss',
  host: { '(document:keydown.escape)': 'esc()' },
})
export class ItemDoCofre {
  private readonly servicos = inject(SERVICOS);
  private readonly area = inject(AreaDeTransferencia);
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private readonly injector = inject(Injector);

  /** O item, ou null para um novo. */
  readonly alvo = input<ItemNaLista | null>(null);
  readonly ocupado = input(false);
  /** Quantas vezes a senha apareceu em vazamentos (0: nenhuma, ou ainda não conferida). */
  readonly vazada = input(0);
  /** Os grupos que já existem no cofre, para escolher com um toque. */
  readonly grupos = input<readonly string[]>([]);
  /** O ícone e a cor de cada grupo (pela chave): a senha posta num grupo leva o jeito dele. */
  readonly jeitos = input<ReadonlyMap<string, JeitoDoGrupo>>(new Map());
  readonly salvar = output<CamposDoItem>();
  readonly paraALixeira = output<void>();
  readonly voltar = output<void>();
  readonly avisar = output<string>();

  protected readonly limites = LIMITES;
  protected readonly simples = simples;
  protected readonly editando = signal(false);
  protected readonly revelada = signal(false);
  protected readonly paraDigitar = signal(false);
  protected readonly gerador = signal(false);
  protected readonly mostrarNoCampo = signal(false);
  /** O que acabou de ser copiado ("usuario", "senha", "anterior-2"…), para o botão dizer que deu certo. */
  protected readonly copiado = signal<string | null>(null);
  protected readonly campos = signal<Pick<Required<CamposDoItem>, 'titulo' | 'usuario' | 'senha' | 'url' | 'descricao' | 'grupo' | 'icone'>>({
    titulo: '',
    usuario: '',
    senha: '',
    url: '',
    descricao: '',
    grupo: '',
    icone: '',
  });
  /** A cartela de ícones aberta, na edição. */
  protected readonly escolhendoIcone = signal(false);

  protected readonly item = computed(() => this.alvo()?.item ?? null);
  protected readonly site = computed(() => urlSegura(this.item()?.url ?? ''));
  protected readonly dominio = computed(() => dominio(this.item()?.url ?? ''));
  protected readonly nome = computed(() => (this.item() ? nomeDoItem(this.item()!) : ''));
  /** O nome enquanto se escreve (o monograma acompanha). */
  protected readonly nomeEditando = computed(() => nomeDoItem(this.campos()) === 'Sem título' ? '' : nomeDoItem(this.campos()));
  protected readonly trechos = computed(() => emTrechos(this.item()?.senha ?? ''));
  protected readonly gruposEmTrechos = computed(() => emGrupos(this.item()?.senha ?? '').map(emTrechos));
  protected readonly novo = computed(() => this.alvo() === null);
  /** Sem nada além do grupo, não há o que guardar. */
  protected readonly vazio = computed(() => {
    const { grupo: _grupo, icone: _icone, ...escritos } = this.campos();
    return Object.values(escritos).every((v) => !v.trim());
  });
  /** O grupo escrito, se já for um dos que existem (o adesivo dele fica marcado). */
  protected readonly grupoEscolhido = computed(() => simples(nomeDoGrupo(this.campos().grupo)));
  /** A letra que o selo mostra sem ícone (para a primeira escolha da cartela). */
  protected readonly letraEditando = computed(() => letraDoMonograma(this.nomeEditando() || '?'));
  private readonly idDoAlvo = computed(() => this.alvo()?.id ?? null);
  private timerRevelar: ReturnType<typeof setTimeout> | null = null;
  private timerCopiado: ReturnType<typeof setTimeout> | null = null;

  private readonly fecharParaDigitar = viewChild<ElementRef<HTMLButtonElement>>('fecharDigitar');
  private readonly primeiroCampo = viewChild<ElementRef<HTMLInputElement>>('primeiroCampo');
  private readonly selo = viewChild<ElementRef<HTMLButtonElement>>('selo');

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

  /** O Esc fecha o que estiver por cima: a senha grande, ou a cartela de ícones (o foco volta ao selo). */
  protected esc(): void {
    this.paraDigitar.set(false);
    if (this.escolhendoIcone()) this.fecharCartela();
  }

  private fecharCartela(): void {
    this.escolhendoIcone.set(false);
    afterNextRender(() => this.selo()?.nativeElement.focus(), { injector: this.injector });
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
    this.campos.set({ titulo: i?.titulo ?? '', usuario: i?.usuario ?? '', senha: i?.senha ?? '', url: i?.url ?? '', descricao: i?.descricao ?? '', grupo: i?.grupo ?? '', icone: i?.icone ?? '' });
    this.escolhendoIcone.set(false);
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

  /** Um toque num grupo que existe põe a senha nele; no que já está escolhido, tira. */
  protected escolherGrupo(grupo: string): void {
    this.campos.update((c) => ({ ...c, grupo: this.grupoEscolhido() === simples(grupo) ? '' : grupo }));
  }

  protected escolherIcone(icone: IdDoIcone | ''): void {
    this.campos.update((c) => ({ ...c, icone }));
    this.fecharCartela();
  }

  /** O jeito de um grupo que existe (para os adesivos e a orelha do grupo na cabeça). */
  protected jeitoDe(grupo: string): JeitoDoGrupo {
    return this.jeitos().get(simples(grupo)) ?? SEM_JEITO;
  }

  /** O hex da cor de um grupo, ou null. */
  protected corDe(grupo: string): string | null {
    const cor = this.jeitoDe(grupo).cor;
    return CORES_DA_CARTELA.find((c) => c.id === cor)?.hex ?? null;
  }

  protected usarGerada(senha: string): void {
    this.campos.update((c) => ({ ...c, senha }));
    this.mostrarNoCampo.set(true);
    this.gerador.set(false);
  }

  protected gravar(): void {
    if (this.vazio() || this.ocupado()) return;
    // escrito de outro jeito ("bancos"), fica com o nome do grupo que já existe ("Bancos")
    const grupo = nomeDoGrupo(this.campos().grupo);
    const existente = this.grupos().find((g) => simples(g) === simples(grupo));
    const nome = existente ?? grupo;
    const jeito = this.jeitoDe(nome);
    this.salvar.emit({ ...this.campos(), grupo: nome, grupoIcone: jeito.icone, grupoCor: jeito.cor });
  }

  /** Depois de salvar, quem usa volta a mostrar o item. */
  terminouDeSalvar(): void {
    this.editando.set(false);
    this.escolhendoIcone.set(false);
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
      this.avisar.emit(avisoDaCopia(oQue, this.servicos.pagina.agente));
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
