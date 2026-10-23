import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, input, output, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CORES_DA_CARTELA, type IdDoIcone } from '../../../../../shared/cartela-de-icones';
import type { CofreAberto } from '../../core/abrir';
import { confirmarComPasskey, confirmarComSenha, podeConfirmarComPasskey, podeConfirmarComSenha } from '../../core/confirmar';
import { ErroCofre } from '../../core/crypto';
import {
  type CamposDoItem,
  comEntradas,
  ENTRADA_VAZIA,
  type Entrada,
  entradasDo,
  entradaVazia,
  type ItemNaLista,
  type JeitoDoGrupo,
  LIMITES,
  MAX_ENTRADAS,
  nomeDaEntrada,
  nomeDoGrupo,
  SEM_JEITO,
  temProtegida,
} from '../../core/itens';
import { ErroPasskey } from '../../core/passkey';
import { Cartela } from '../cartela';
import { AreaDeTransferencia, avisoDaCopia } from '../area-de-transferencia';
import { Icone } from '../icone';
import { SERVICOS } from '../servicos';
import { GeradorPainel } from './gerador-painel';
import type { CorDoSelo } from '../../core/selo';
import { corDoMonograma, dominio, letraDoMonograma, nomeDoItem, urlSegura } from './monograma';
import { MonogramaSelo } from './monograma-selo';
import { simples } from './pastas';
import { emTrechos } from './trechos';

export { urlSegura } from './monograma';
export { emTrechos, type Trecho } from './trechos';

/** Quanto tempo a senha fica à mostra. */
export const REVELAR_MS = 15_000;
/** Quanto tempo as senhas que pedem a passkey ficam destravadas (parado na leitura; editando, não conta). */
export const DESTRAVADA_MS = 120_000;
const MOSTRAR_PARA_DIGITAR_MS = 60_000;
/** Quanto tempo o botão de copiar fica dizendo "copiado". */
const COPIADO_MS = 1800;

/** A senha em grupos de 4, para ler e digitar em outro aparelho. */
export function emGrupos(senha: string): string[] {
  return [...senha].reduce<string[]>((grupos, c, i) => (i % 4 === 0 ? [...grupos, c] : [...grupos.slice(0, -1), grupos[grupos.length - 1] + c]), []);
}

/** Onde a confirmação apareceu: numa entrada, nas senhas de antes ou no Editar. */
type OndeConfirma = number | 'historico' | 'editar';

/**
 * Um item do cofre (decisão 11): Título, as entradas (User e Senha, uma ou mais, com nome), URL e
 * Descrição, à direita da lista. Ver: copiar (a área de transferência é limpa 30 s depois, com o cofre na
 * frente), revelar a senha (15 s, com a linha que encolhe), mostrar para digitar (letras grandes, em
 * grupos) e abrir o site (aba nova, sem dizer de onde veio). A senha de uma entrada protegida só aparece
 * depois da passkey de novo (ou da senha mestra): destrava o item por 2 minutos (17.18). Editar no mesmo
 * lugar: os campos, as entradas, o ícone e o grupo, todos opcionais, e o gerador.
 */
@Component({
  selector: 'cofre-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Cartela, GeradorPainel, Icone, MonogramaSelo, NgTemplateOutlet],
  templateUrl: './item.html',
  styleUrl: './item.scss',
  host: { '(document:keydown.escape)': 'esc()' },
})
export class ItemDoCofre {
  private readonly servicos = inject(SERVICOS);
  private readonly area = inject(AreaDeTransferencia);
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** O item, ou null para um novo. */
  readonly alvo = input<ItemNaLista | null>(null);
  /** O cofre aberto: as passkeys e a senha mestra, para destravar as senhas protegidas. */
  readonly cofre = input<Pick<CofreAberto, 'passkeys' | 'segredos' | 'usuario'> | null>(null);
  readonly ocupado = input(false);
  /** Quantas vezes a senha de cada entrada apareceu em vazamentos (0: nenhuma, ou ainda não conferida). */
  readonly vazadas = input<readonly number[]>([]);
  /** Os grupos que já existem no cofre, para escolher com um toque. */
  readonly grupos = input<readonly string[]>([]);
  /** O ícone e a cor de cada grupo (pela chave): a senha posta num grupo leva o jeito dele. */
  readonly jeitos = input<ReadonlyMap<string, JeitoDoGrupo>>(new Map());
  readonly salvar = output<CamposDoItem>();
  readonly paraALixeira = output<void>();
  readonly voltar = output<void>();
  readonly avisar = output<string>();

  protected readonly limites = LIMITES;
  protected readonly maxEntradas = MAX_ENTRADAS;
  protected readonly simples = simples;
  protected readonly nomeDaEntrada = nomeDaEntrada;
  protected readonly editando = signal(false);
  /** A entrada com a senha à mostra (uma por vez). */
  protected readonly revelada = signal<number | null>(null);
  /** A entrada com a senha na folha grande. */
  protected readonly paraDigitar = signal<number | null>(null);
  /** A entrada com o gerador aberto, na edição. */
  protected readonly gerador = signal<number | null>(null);
  /** As entradas com a senha à mostra no campo, na edição. */
  protected readonly mostrarNoCampo = signal<ReadonlySet<number>>(new Set());
  /** O que acabou de ser copiado ("usuario-0", "senha-1", "anterior-2"…), para o botão dizer que deu certo. */
  protected readonly copiado = signal<string | null>(null);
  protected readonly campos = signal<Pick<Required<CamposDoItem>, 'titulo' | 'url' | 'descricao' | 'grupo' | 'icone' | 'cor'>>({
    titulo: '',
    url: '',
    descricao: '',
    grupo: '',
    icone: '',
    cor: '',
  });
  /** As entradas sendo editadas (pelo menos uma). */
  protected readonly entradasEditando = signal<readonly Entrada[]>([ENTRADA_VAZIA]);
  /** A cartela de ícones aberta, na edição. */
  protected readonly escolhendoIcone = signal(false);

  /** As senhas que pedem a passkey estão destravadas (até sair do item ou passar o tempo). */
  protected readonly destravado = signal(false);
  /** Onde a confirmação está aberta (o bilhete com o erro, a senha mestra), ou null. */
  protected readonly confirmandoEm = signal<OndeConfirma | null>(null);
  /** Esperando o aparelho ou o Argon2id. */
  protected readonly conferindo = signal(false);
  protected readonly erroConfirmar = signal<string | null>(null);
  /** O campo da senha mestra à mostra (sem a passkey à mão). */
  protected readonly comSenhaMestra = signal(false);
  protected readonly senhaMestra = signal('');

  protected readonly item = computed(() => this.alvo()?.item ?? null);
  protected readonly entradas = computed(() => {
    const i = this.item();
    return i ? entradasDo(i) : [];
  });
  /** Com nome ou mais de uma, cada entrada ganha o título dela; sem, é o item de sempre. */
  protected readonly comTitulos = computed(() => this.entradas().length > 1 || this.entradas().some((e) => !!e.rotulo));
  protected readonly comTitulosEditando = computed(() => this.entradasEditando().length > 1 || this.entradasEditando().some((e) => !!e.rotulo.trim()));
  protected readonly site = computed(() => urlSegura(this.item()?.url ?? ''));
  protected readonly dominio = computed(() => dominio(this.item()?.url ?? ''));
  protected readonly nome = computed(() => (this.item() ? nomeDoItem(this.item()!) : ''));
  /** O nome enquanto se escreve (o monograma acompanha). */
  protected readonly nomeEditando = computed(() => {
    const nome = nomeDoItem(this.campos());
    return nome === 'Sem título' ? '' : nome;
  });
  protected readonly novo = computed(() => this.alvo() === null);
  /** Sem nada além do grupo e do jeito, não há o que guardar. */
  protected readonly vazio = computed(() => {
    const { titulo, url, descricao } = this.campos();
    return [titulo, url, descricao].every((v) => !v.trim()) && this.entradasEditando().every(entradaVazia);
  });
  /** O grupo escrito, se já for um dos que existem (o adesivo dele fica marcado). */
  protected readonly grupoEscolhido = computed(() => simples(nomeDoGrupo(this.campos().grupo)));
  /** A letra que o selo mostra sem ícone (para a primeira escolha da cartela). */
  protected readonly letraEditando = computed(() => letraDoMonograma(this.nomeEditando() || '?'));
  /** A cor que o selo teria pelo nome (a primeira escolha da cartela). */
  protected readonly corDoNome = computed(() => corDoMonograma(this.nomeEditando() || '?'));
  /** Alguma senha deste item pede a passkey. */
  protected readonly protegido = computed(() => !!this.item() && temProtegida(this.item()!));
  protected readonly comPasskey = computed(() => !!this.cofre() && podeConfirmarComPasskey(this.cofre()!));
  protected readonly comSenha = computed(() => !!this.cofre() && podeConfirmarComSenha(this.cofre()!));
  private readonly idDoAlvo = computed(() => this.alvo()?.id ?? null);
  private timerRevelar: ReturnType<typeof setTimeout> | null = null;
  private timerCopiado: ReturnType<typeof setTimeout> | null = null;
  private timerDestravado: ReturnType<typeof setTimeout> | null = null;

  private readonly fecharParaDigitar = viewChild<ElementRef<HTMLButtonElement>>('fecharDigitar');
  private readonly primeiroCampo = viewChild<ElementRef<HTMLInputElement>>('primeiroCampo');
  private readonly selo = viewChild<ElementRef<HTMLButtonElement>>('selo');
  private readonly campoSenhaMestra = viewChild<ElementRef<HTMLInputElement>>('campoSenhaMestra');

  constructor() {
    // o foco vai para a folha da senha quando ela abre (o Esc fecha, de qualquer lugar)
    effect(() => this.fecharParaDigitar()?.nativeElement.focus());
    effect(() => this.campoSenhaMestra()?.nativeElement.focus());
    // trocar de item (na lista ao lado) começa do zero: nada revelado, nada sendo editado, tudo travado
    effect(() => {
      this.idDoAlvo();
      untracked(() => {
        this.revelada.set(null);
        this.paraDigitar.set(null);
        this.gerador.set(null);
        this.mostrarNoCampo.set(new Set());
        this.copiado.set(null);
        this.travar();
        if (this.novo()) this.editar();
        else this.editando.set(false);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      for (const t of [...this.timers, this.timerRevelar, this.timerCopiado, this.timerDestravado]) if (t) clearTimeout(t);
    });
  }

  /** O Esc fecha o que estiver por cima: a senha grande, a confirmação, ou a cartela de ícones (o foco volta ao selo). */
  protected esc(): void {
    this.paraDigitar.set(null);
    if (this.confirmandoEm() !== null && !this.conferindo()) this.fecharConfirmacao();
    if (this.escolhendoIcone()) this.fecharCartela();
  }

  protected fecharCartela(): void {
    this.escolhendoIcone.set(false);
    afterNextRender(() => this.selo()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Editando, com a senha grande na tela ou confirmando: o Esc é de quem está aberto aqui. */
  ocupadoComAlgo(): boolean {
    return this.editando() || this.paraDigitar() !== null || this.confirmandoEm() !== null;
  }

  private depois(ms: number, fazer: () => void): void {
    this.timers.push(setTimeout(fazer, ms));
  }

  // ---------------------------------------------------------------------------------------------
  // Destravar as senhas que pedem a passkey
  // ---------------------------------------------------------------------------------------------

  /** A senha desta entrada está travada (pede a passkey e o item ainda não foi destravado). */
  protected travada(e: { readonly protegida?: boolean }): boolean {
    return e.protegida === true && !this.destravado();
  }

  /** Trava de novo: esconde o que era protegido e fecha a confirmação. */
  protected travar(): void {
    if (this.timerDestravado) clearTimeout(this.timerDestravado);
    this.timerDestravado = null;
    this.destravado.set(false);
    const entradas = this.entradas();
    const revelada = this.revelada();
    if (revelada !== null && entradas[revelada]?.protegida) this.revelada.set(null);
    const digitando = this.paraDigitar();
    if (digitando !== null && entradas[digitando]?.protegida) this.paraDigitar.set(null);
    this.fecharConfirmacao();
  }

  /** Conta os 2 minutos de novo (editando, não conta: a edição não trava no meio). */
  private contarDestravado(): void {
    if (this.timerDestravado) clearTimeout(this.timerDestravado);
    this.timerDestravado = setTimeout(() => {
      if (this.editando()) return;
      this.travar();
    }, DESTRAVADA_MS);
  }

  protected fecharConfirmacao(): void {
    this.confirmandoEm.set(null);
    this.erroConfirmar.set(null);
    this.comSenhaMestra.set(false);
    this.senhaMestra.set('');
  }

  /**
   * Pede a passkey de novo (ou abre o campo da senha mestra, quando o cofre foi aberto sem passkey neste
   * aparelho). Dando certo, destrava o item e faz o que a pessoa pediu.
   */
  protected async destravar(onde: OndeConfirma): Promise<void> {
    if (this.conferindo()) return;
    this.confirmandoEm.set(onde);
    this.erroConfirmar.set(null);
    if (!this.comPasskey()) {
      this.comSenhaMestra.set(true);
      return;
    }
    this.comSenhaMestra.set(false);
    this.conferindo.set(true);
    try {
      await confirmarComPasskey(this.cofre()!, this.servicos.rpId, this.servicos.autenticador);
      this.destravou(onde);
    } catch (e) {
      this.erroConfirmar.set(e instanceof ErroPasskey && e.motivo === 'cancelada' ? 'A passkey não foi confirmada.' : e instanceof ErroPasskey ? e.message : 'Não deu para confirmar. Tente de novo.');
    } finally {
      this.conferindo.set(false);
    }
  }

  protected usarSenhaMestra(): void {
    this.erroConfirmar.set(null);
    this.comSenhaMestra.set(true);
  }

  protected async confirmarSenhaMestra(): Promise<void> {
    const onde = this.confirmandoEm();
    if (onde === null || this.conferindo() || !this.senhaMestra()) return;
    this.conferindo.set(true);
    this.erroConfirmar.set(null);
    // o Argon2id trava a página um pouco: o "Conferindo…" aparece antes
    await new Promise<void>((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
    try {
      await confirmarComSenha(this.cofre()!, this.senhaMestra());
      this.destravou(onde);
    } catch (e) {
      this.erroConfirmar.set(e instanceof ErroCofre && e.motivo === 'abrir' ? 'Não é a senha mestra deste cofre.' : 'Não deu para conferir. Tente de novo.');
      this.senhaMestra.set('');
    } finally {
      this.conferindo.set(false);
    }
  }

  private destravou(onde: OndeConfirma): void {
    this.fecharConfirmacao();
    this.destravado.set(true);
    this.contarDestravado();
    if (onde === 'editar') {
      this.editar();
      return;
    }
    // o botão Destravar sumiu: o foco vai para o que apareceu no lugar dele (o olho, ou o Copiar das de antes)
    const alvo = onde === 'historico' ? '.historico li .papel' : `[data-senha="${onde}"] .olho`;
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(alvo)?.focus(), { injector: this.injector });
  }

  // ---------------------------------------------------------------------------------------------
  // Editar
  // ---------------------------------------------------------------------------------------------

  /** Editar mostra as senhas no campo: com alguma protegida, pede a passkey antes. */
  protected pedirParaEditar(): void {
    if (this.protegido() && !this.destravado()) void this.destravar('editar');
    else this.editar();
  }

  protected editar(): void {
    const i = this.item();
    this.campos.set({ titulo: i?.titulo ?? '', url: i?.url ?? '', descricao: i?.descricao ?? '', grupo: i?.grupo ?? '', icone: i?.icone ?? '', cor: i?.cor ?? '' });
    this.entradasEditando.set(i ? entradasDo(i) : [ENTRADA_VAZIA]);
    this.mostrarNoCampo.set(new Set());
    this.gerador.set(null);
    this.escolhendoIcone.set(false);
    this.revelada.set(null);
    this.fecharConfirmacao();
    this.editando.set(true);
    setTimeout(() => this.primeiroCampo()?.nativeElement.focus());
  }

  protected cancelar(): void {
    if (this.novo()) this.voltar.emit();
    else this.paraALeitura();
  }

  /** Volta da edição para a leitura; destravado, os 2 minutos começam de novo. */
  private paraALeitura(): void {
    this.editando.set(false);
    this.gerador.set(null);
    this.mostrarNoCampo.set(new Set());
    if (this.destravado()) this.contarDestravado();
  }

  protected mudar(campo: 'titulo' | 'url' | 'descricao' | 'grupo', evento: Event): void {
    const valor = (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.campos.update((c) => ({ ...c, [campo]: valor }));
  }

  protected mudarEntrada(n: number, campo: 'rotulo' | 'usuario' | 'senha', evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.entradasEditando.update((lista) => lista.map((e, i) => (i === n ? { ...e, [campo]: valor } : e)));
  }

  protected alternarProtegida(n: number): void {
    this.entradasEditando.update((lista) => lista.map((e, i) => (i === n ? { ...e, protegida: !e.protegida } : e)));
  }

  protected maisUmaEntrada(): void {
    if (this.entradasEditando().length >= MAX_ENTRADAS) return;
    this.entradasEditando.update((lista) => [...lista, ENTRADA_VAZIA]);
    const n = this.entradasEditando().length - 1;
    // o foco vai para o nome da entrada nova
    afterNextRender(() => document.getElementById(`item-rotulo-${n}`)?.focus(), { injector: this.injector });
  }

  protected tirarEntrada(n: number): void {
    this.entradasEditando.update((lista) => (lista.length > 1 ? lista.filter((_, i) => i !== n) : [ENTRADA_VAZIA]));
    // o que estava aberto por índice deixa de apontar para a entrada certa
    this.gerador.set(null);
    this.mostrarNoCampo.set(new Set());
    afterNextRender(() => document.getElementById(`item-rotulo-${Math.max(0, n - 1)}`)?.focus() ?? document.getElementById('item-mais-entrada')?.focus(), { injector: this.injector });
  }

  protected alternarMostrarNoCampo(n: number): void {
    this.mostrarNoCampo.update((s) => {
      const novo = new Set(s);
      if (!novo.delete(n)) novo.add(n);
      return novo;
    });
  }

  /** Um toque num grupo que existe põe a senha nele; no que já está escolhido, tira. */
  protected escolherGrupo(grupo: string): void {
    this.campos.update((c) => ({ ...c, grupo: this.grupoEscolhido() === simples(grupo) ? '' : grupo }));
  }

  protected escolherIcone(icone: IdDoIcone | ''): void {
    this.campos.update((c) => ({ ...c, icone }));
  }

  protected escolherCor(cor: CorDoSelo | ''): void {
    this.campos.update((c) => ({ ...c, cor }));
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

  protected usarGerada(n: number, senha: string): void {
    this.entradasEditando.update((lista) => lista.map((e, i) => (i === n ? { ...e, senha } : e)));
    this.mostrarNoCampo.update((s) => new Set(s).add(n));
    this.gerador.set(null);
  }

  protected gravar(): void {
    if (this.vazio() || this.ocupado()) return;
    // escrito de outro jeito ("bancos"), fica com o nome do grupo que já existe ("Bancos")
    const grupo = nomeDoGrupo(this.campos().grupo);
    const existente = this.grupos().find((g) => simples(g) === simples(grupo));
    const nome = existente ?? grupo;
    const jeito = this.jeitoDe(nome);
    // as entradas em branco saem (marcar "pede a passkey" sozinho não guarda nada)
    const entradas = this.entradasEditando().filter((e) => !entradaVazia(e));
    this.salvar.emit({ ...this.campos(), ...comEntradas(entradas), grupo: nome, grupoIcone: jeito.icone, grupoCor: jeito.cor });
  }

  /** Depois de salvar, quem usa volta a mostrar o item. */
  terminouDeSalvar(): void {
    this.escolhendoIcone.set(false);
    this.paraALeitura();
  }

  // ---------------------------------------------------------------------------------------------
  // Ver
  // ---------------------------------------------------------------------------------------------

  protected trechos(senha: string) {
    return emTrechos(senha);
  }

  protected alternarRevelar(n: number): void {
    if (this.timerRevelar) clearTimeout(this.timerRevelar);
    if (this.revelada() === n) {
      this.revelada.set(null);
      return;
    }
    this.revelada.set(n);
    this.timerRevelar = setTimeout(() => this.revelada.set(null), REVELAR_MS);
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

  /** O que o bilhete da cópia diz ("Senha", ou "Senha de Conta do trabalho" com várias entradas). */
  protected oQue(campo: 'User' | 'Senha', n: number): string {
    const e = this.entradas()[n];
    return this.comTitulos() && e ? `${campo} de ${nomeDaEntrada(e, n)}` : campo;
  }

  protected mostrarParaDigitar(n: number): void {
    this.paraDigitar.set(n);
    this.depois(MOSTRAR_PARA_DIGITAR_MS, () => {
      if (this.paraDigitar() === n) this.paraDigitar.set(null);
    });
  }

  protected gruposEmTrechos(senha: string) {
    return emGrupos(senha).map(emTrechos);
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
