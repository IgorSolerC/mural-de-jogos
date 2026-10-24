import { DOCUMENT } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, input, OnInit, signal, viewChild } from '@angular/core';
import { ErroApi } from '../../core/api';
import type { CofreAberto } from '../../core/abrir';
import { ErroCofre } from '../../core/crypto';
import { apagarDeVez, type CamposDoItem, entradasDo, ErroConflito, type ItemNaLista, lerItens, limparLapides, mudarGrupo, paraALixeira, restaurar, SEM_JEITO, salvarItem } from '../../core/itens';
import { conferirVazadas } from '../../core/vazadas';
import { AreaDeTransferencia, avisoDaCopia } from '../area-de-transferencia';
import { Icone } from '../icone';
import { SERVICOS } from '../servicos';
import { Gerenciar, type MudancaDeGrupo } from '../gerenciar/gerenciar';
import { ItemDoCofre } from './item';
import { Lixeira } from './lixeira';
import { nomeDoItem } from './monograma';
import { emPastas, gruposDoCofre, jeitosDosGrupos, simples } from './pastas';
import { type CampoRapido, QuadroDeSenhas } from './quadro';
import { type MotivoDeTrancar, Trancador } from './trancador';

type Vista = 'senhas' | 'lixeira' | 'ajustes';
/** Quanto tempo o botão de copiar fica dizendo "copiado". */
const COPIADO_MS = 1800;

/** O dia e a hora de um ISO, em palavras curtas ("21/10 às 14:32"). */
function quando(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * O cofre aberto (seções 8.1 a 8.2 e 10). As senhas num quadro como o Kanban do Murall (seção 17.20): uma
 * pasta por grupo, lado a lado, cada uma rolando sozinha, com o User e a Senha de cada item a um clique
 * (sem abrir); a mesa cabe na tela, e a página não sobe e desce. A senha escolhida abre numa folha à
 * direita do quadro, onde também se edita; numa tela estreita, no lugar dele. Os Ajustes e a lixeira
 * ocupam a ficha inteira. Os itens são conferidos contra o manifesto ao ler (nada aparece se não baterem); um
 * conflito com outro aparelho relê tudo. Trancar avisa o servidor (`sendBeacon`) e recarrega a página,
 * que joga fora a memória.
 */
@Component({
  selector: 'cofre-aberto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemDoCofre, Gerenciar, Icone, Lixeira, QuadroDeSenhas],
  templateUrl: './aberto.html',
  styleUrl: './aberto.scss',
  host: { '[class.borrado]': 'borrado()', '[class.na-mesa]': "vista() === 'senhas'", '(document:keydown)': 'atalho($event)' },
})
export class Aberto implements OnInit {
  private readonly servicos = inject(SERVICOS);
  private readonly area = inject(AreaDeTransferencia);
  private readonly documento = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private trancador: Trancador | null = null;
  private timerCopiado: ReturnType<typeof setTimeout> | null = null;

  readonly cofre = input.required<CofreAberto>();
  /** O código da conta do Murall (para a faixa). */
  readonly conta = input.required<string>();

  protected readonly vista = signal<Vista>('senhas');
  protected readonly itens = signal<readonly ItemNaLista[]>([]);
  /** O id do item aberto à direita (null: nenhum). */
  protected readonly aberto = signal<string | null>(null);
  /** Uma senha nova sendo escrita à direita. */
  protected readonly criando = signal(false);
  protected readonly busca = signal('');
  protected readonly carregando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly bilhete = signal<string | null>(null);
  /** O que o leitor de tela anuncia (uma região que fica sempre na página: a que nasce já com texto pode não ser lida). */
  protected readonly anuncio = signal('');
  private timerBilhete: ReturnType<typeof setTimeout> | null = null;
  /** A última mudança no cofre, na faixa (a tela de abrir não guarda nada, então é aqui que se confere). */
  protected readonly ultimaMudanca = signal('');
  protected readonly borrado = signal(false);
  /** O que acabou de ser copiado da lista ("id:campo"), para o botão dizer que deu certo. */
  protected readonly copiado = signal<string | null>(null);
  /** Quantas vezes a senha de cada entrada de cada item apareceu em vazamentos (só depois de "Conferir senhas vazadas"). */
  protected readonly vazadas = signal<ReadonlyMap<string, readonly number[]>>(new Map());
  protected readonly conferindo = signal(false);
  protected readonly conferidoEm = signal<Date | null>(null);
  protected readonly item = viewChild(ItemDoCofre);
  private readonly ajustes = viewChild(Gerenciar);
  private readonly lixeiraEl = viewChild(Lixeira);
  private readonly campoBusca = viewChild<ElementRef<HTMLInputElement>>('campoBusca');
  private readonly quadro = viewChild(QuadroDeSenhas);
  private readonly mesa = viewChild<ElementRef<HTMLElement>>('mesa');
  /** A mesa inteira está na tela: as pastas rolam por dentro (antes disso, a página rola até ela). */
  protected readonly inteira = signal(true);
  /** O que ficou esperando porque a senha aberta tem mudança não salva (o bilhete pergunta antes). */
  protected readonly pendente = signal<{ readonly nome: string; readonly fazer: () => void } | null>(null);
  private readonly continuar = viewChild<ElementRef<HTMLButtonElement>>('continuar');

  protected readonly contaFormatada = computed(() => `${this.conta().slice(0, 4)}-${this.conta().slice(4)}`);
  protected readonly noCofre = computed(() => this.itens().filter((i) => !i.naLixeira && i.item));
  protected readonly naLixeira = computed(() => this.itens().filter((i) => i.naLixeira && i.item));
  protected readonly achados = computed(() => {
    const q = simples(this.busca().trim());
    // as outras entradas também: o nome delas e o user ("a conta do trabalho do Facebook")
    return this.noCofre().filter((i) => !q || [i.item!.titulo, i.item!.url, i.item!.grupo, ...entradasDo(i.item!).flatMap((e) => [e.rotulo, e.usuario])].some((c) => simples(c).includes(q)));
  });
  /** Os grupos de todas as senhas (as pastas e as sugestões ao editar). */
  protected readonly grupos = computed(() => gruposDoCofre(this.noCofre()));
  /** O ícone e a cor de cada grupo (pela chave). */
  protected readonly jeitos = computed(() => jeitosDosGrupos(this.noCofre()));
  /** Os grupos com quantas senhas cada um tem (os Ajustes renomeiam e apagam). */
  protected readonly gruposComConta = computed(() =>
    this.grupos().map((nome) => ({
      nome,
      senhas: this.noCofre().filter((i) => simples(i.item!.grupo) === simples(nome)).length,
      jeito: this.jeitos().get(simples(nome)) ?? SEM_JEITO,
    })),
  );
  /** Quantas já mudaram, enquanto um grupo é renomeado ou apagado. */
  protected readonly mudandoGrupo = signal<{ readonly feitas: number; readonly total: number } | null>(null);
  /** As achadas em pastas; sem nenhum grupo, uma pasta só, sem orelha. */
  protected readonly pastas = computed(() => emPastas(this.achados(), this.grupos(), this.jeitos()));
  protected readonly buscando = computed(() => !!this.busca().trim());
  /** O que a busca achou, para o leitor de tela (a contagem e o "Nada com" na tela não são regiões vivas). */
  protected readonly resumoDaBusca = computed(() => {
    const q = this.busca().trim();
    if (!q || this.carregando() || !this.noCofre().length) return '';
    const n = this.achados().length;
    return n ? `${n} ${n === 1 ? 'senha' : 'senhas'} com “${q}”` : `Nada com “${q}”`;
  });
  protected readonly selecionado = computed(() => this.noCofre().find((i) => i.id === this.aberto()) ?? null);
  /** A parte da direita tem algo (numa tela estreita, ela toma o lugar da lista). */
  protected readonly comDetalhe = computed(() => this.criando() || !!this.selecionado());
  protected readonly listaDeVazadas = computed(() =>
    this.noCofre()
      .filter((i) => this.vezesVazada(i.id) > 0)
      .map((i) => ({ id: i.id, nome: nomeDoItem(i.item!), vezes: this.vezesVazada(i.id) })),
  );

  constructor() {
    // a mesa cabe na tela: a altura dela é a da tela menos o que vem em cima (o topo, a faixa, os avisos),
    // medido aqui; e as pastas só rolam por dentro com ela inteira à vista
    effect((aoLimpar) => {
      const mesa = this.mesa()?.nativeElement;
      const janela = this.documento.defaultView;
      if (!mesa || !janela) return;
      const medir = () => mesa.style.setProperty('--mesa-topo', `${Math.round(mesa.getBoundingClientRect().top + janela.scrollY)}px`);
      medir();
      janela.addEventListener('resize', medir);
      const ficha = mesa.closest('.ficha');
      // o topo, a faixa, os avisos, e o aviso da vigia, que aparece em cima da ficha (via a página inteira)
      const acima = [this.documento.querySelector('cofre-topo'), ficha?.querySelector('.faixa'), ficha?.querySelector('.avisos'), this.documento.querySelector('main')].filter((e) => !!e);
      const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
      for (const e of acima) ro?.observe(e);
      const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([e]) => this.inteira.set(!!e && e.intersectionRatio >= 0.98), { threshold: [0, 0.5, 0.98, 1] });
      io?.observe(mesa);
      aoLimpar(() => {
        janela.removeEventListener('resize', medir);
        ro?.disconnect();
        io?.disconnect();
      });
    });
  }

  async ngOnInit(): Promise<void> {
    const cofre = this.cofre();
    const m = cofre.manifesto;
    this.ultimaMudanca.set(`Mudado em ${quando(m.mudadoEm)}, no ${m.aparelho || 'aparelho sem nome'}`);
    this.trancador = new Trancador(Date.parse(cofre.expiraEm) || Date.now() + 8 * 3_600_000, (motivo) => this.trancar(motivo), this.documento);
    this.trancador.comecar();
    const janela = this.documento.defaultView;
    if (janela) {
      // a tela some quando a janela perde o foco (seção 10), para ninguém ler por cima do ombro
      const borrar = () => this.borrado.set(true);
      const voltar = () => this.borrado.set(false);
      janela.addEventListener('blur', borrar);
      janela.addEventListener('focus', voltar);
      this.destroy.onDestroy(() => {
        janela.removeEventListener('blur', borrar);
        janela.removeEventListener('focus', voltar);
      });
    }
    this.destroy.onDestroy(() => {
      this.trancador?.parar();
      if (this.timerCopiado) clearTimeout(this.timerCopiado);
      if (this.timerBilhete) clearTimeout(this.timerBilhete);
    });
    await this.recarregar();
  }

  private falhou(e: unknown): void {
    if (e instanceof ErroConflito) {
      this.erro.set(e.message);
      void this.recarregar();
    } else if (e instanceof ErroApi && e.status === 401) {
      this.trancar('parado');
    } else if (e instanceof ErroCofre && e.motivo === 'grande') {
      this.erro.set('Esta senha ficou grande demais para o cofre (até 16 kB). Encurte a descrição ou tire uma das senhas do item.');
    } else if (e instanceof ErroCofre) {
      this.erro.set('O que veio do servidor não confere com o cofre. Nada foi mostrado. Tranque e avise quem cuida do cofre.');
      this.itens.set([]);
    } else {
      this.erro.set(e instanceof ErroApi ? e.message : 'Algo deu errado. Tente de novo.');
    }
  }

  protected async recarregar(): Promise<void> {
    const { api } = this.servicos;
    this.carregando.set(true);
    try {
      const lista = await lerItens(api, this.cofre());
      this.itens.set(await limparLapides(api, this.cofre(), lista));
    } catch (e) {
      this.falhou(e);
    } finally {
      this.carregando.set(false);
    }
  }

  protected avisar(texto: string): void {
    this.bilhete.set(texto);
    // o mesmo texto de novo (copiar a mesma senha duas vezes) também é lido: a região esvazia e volta
    this.anuncio.set('');
    setTimeout(() => this.anuncio.set(texto), 60);
    if (this.timerBilhete) clearTimeout(this.timerBilhete);
    this.timerBilhete = setTimeout(() => this.bilhete.set(null), 6000);
  }

  // --- o quadro

  /**
   * Com a senha aberta sendo editada e alguma mudança não salva, o que tiraria a edição da tela (abrir
   * outra senha no quadro ao lado, uma nova, os Ajustes, a lixeira) espera: o bilhete no alto da folha
   * pergunta se continua editando ou joga fora. O Trancar não espera (é a saída de segurança).
   */
  private semPerderAEdicao(fazer: () => void): void {
    if (!this.item()?.alterado()) {
      this.pendente.set(null);
      fazer();
      return;
    }
    const alvo = this.selecionado()?.item;
    this.pendente.set({ nome: alvo ? nomeDoItem(alvo) : 'a senha nova', fazer });
    setTimeout(() => this.continuar()?.nativeElement.focus());
  }

  protected continuarEditando(): void {
    this.pendente.set(null);
    // o foco volta para a edição (o botão que tinha o foco sumiu com o bilhete)
    setTimeout(() => this.item()?.focarEdicao());
  }

  protected descartarEdicao(): void {
    const p = this.pendente();
    this.pendente.set(null);
    p?.fazer();
  }

  protected abrirItem(i: ItemNaLista | string): void {
    const id = typeof i === 'string' ? i : i.id;
    if (id === this.aberto() && !this.criando()) return;
    this.semPerderAEdicao(() => this.mostrarItem(id));
  }

  private mostrarItem(id: string): void {
    this.aberto.set(id);
    this.criando.set(false);
    this.erro.set(null);
    this.vista.set('senhas');
    // a folha abre ao lado e estreita o quadro: a etiqueta aberta continua à vista
    this.quadro()?.mostrar(id);
    this.focoNaFolhaSeOQuadroSumiu();
  }

  /**
   * Estreita, a folha toma o lugar do quadro, e o que tinha o foco (a etiqueta, a busca) some com ele: o
   * foco vai para o "Voltar à lista" da folha. Larga, o foco fica onde estava (para andar pelo quadro).
   */
  private focoNaFolhaSeOQuadroSumiu(): void {
    afterNextRender(
      () => {
        const lista = this.host.nativeElement.querySelector<HTMLElement>('.lado-lista');
        if (lista && getComputedStyle(lista).display !== 'none') return;
        const ativo = this.documento.activeElement;
        if (ativo && ativo !== this.documento.body && this.host.nativeElement.querySelector('.lado-item')?.contains(ativo)) return;
        this.host.nativeElement.querySelector<HTMLElement>('.lado-item .voltar')?.focus();
      },
      { injector: this.injector },
    );
  }

  /** Enter na busca abre a primeira achada (a de cima, na primeira pasta); o foco fica na busca. */
  protected abrirPrimeira(e: Event): void {
    const primeira = this.pastas()[0]?.itens[0];
    if (!primeira) return;
    e.preventDefault();
    this.abrirItem(primeira);
  }

  protected limparBusca(): void {
    this.busca.set('');
    this.campoBusca()?.nativeElement.focus();
  }

  protected novo(): void {
    this.semPerderAEdicao(() => this.comecarNovo());
  }

  private comecarNovo(): void {
    this.aberto.set(null);
    this.criando.set(true);
    this.erro.set(null);
    this.vista.set('senhas');
  }

  /** Fecha o que está à direita (numa tela estreita, volta para a lista) e devolve o foco à linha. */
  protected fecharDetalhe(): void {
    const id = this.aberto();
    this.aberto.set(null);
    this.criando.set(false);
    if (id) setTimeout(() => this.quadro()?.focar(id));
  }

  protected irPara(vista: Vista): void {
    this.semPerderAEdicao(() => {
      this.erro.set(null);
      this.vista.set(vista);
    });
  }

  /** Quantas vezes a senha mais vazada de um item apareceu em vazamentos (0: nenhuma, ou não conferida). */
  protected vezesVazada(id: string): number {
    return Math.max(0, ...(this.vazadas().get(id) ?? []));
  }

  /**
   * Copia o User ou a Senha (da primeira entrada) direto da lista, sem abrir o item. A senha que pede a
   * passkey não sai daqui: abre o item, onde ela se destrava.
   */
  protected async copiarRapido(i: ItemNaLista, campo: CampoRapido): Promise<void> {
    if (campo === 'senha' && i.item!.protegida) {
      this.abrirItem(i);
      return;
    }
    const texto = campo === 'usuario' ? i.item!.usuario : i.item!.senha;
    if (!texto) {
      this.avisar(`${nomeDoItem(i.item!)} não tem ${campo === 'usuario' ? 'user' : 'senha'}.`);
      return;
    }
    try {
      await this.area.copiar(texto);
      this.copiado.set(`${i.id}:${campo}`);
      if (this.timerCopiado) clearTimeout(this.timerCopiado);
      this.timerCopiado = setTimeout(() => this.copiado.set(null), COPIADO_MS);
      this.avisar(avisoDaCopia(`${campo === 'usuario' ? 'User' : 'Senha'} de ${nomeDoItem(i.item!)}`, this.servicos.pagina.agente));
    } catch {
      this.avisar('Não deu para copiar. Abra o item e use Revelar.');
    }
  }

  /** "/" vai para a busca (fora de um campo); da busca, a seta para baixo entra no quadro (lá dentro, as setas são dele); Esc fecha o item. */
  protected atalho(e: KeyboardEvent): void {
    if (this.vista() !== 'senhas' || e.ctrlKey || e.metaKey || e.altKey) return;
    const alvo = e.target as HTMLElement | null;
    const escrevendo = !!alvo?.closest('input, textarea, select, [contenteditable]');
    if (e.key === '/' && !escrevendo) {
      e.preventDefault();
      this.campoBusca()?.nativeElement.focus();
      return;
    }
    // na busca com texto, o Esc só limpa a busca (o navegador faz isso)
    const naBuscaComTexto = alvo === this.campoBusca()?.nativeElement && !!this.campoBusca()?.nativeElement.value;
    if (e.key === 'Escape' && !naBuscaComTexto && this.comDetalhe() && !this.item()?.ocupadoComAlgo() && !alvo?.closest('dialog, .para-digitar')) {
      this.fecharDetalhe();
      return;
    }
    if (e.key === 'ArrowDown' && alvo === this.campoBusca()?.nativeElement && this.quadro()) {
      e.preventDefault();
      this.quadro()!.focarPrimeira();
    }
  }

  // --- guardar e mover

  protected async salvar(campos: CamposDoItem): Promise<void> {
    this.ocupado.set(true);
    this.erro.set(null);
    try {
      const salvo = await salvarItem(this.servicos.api, this.cofre(), campos, this.criando() ? null : this.selecionado());
      this.itens.update((lista) => [...lista.filter((i) => i.id !== salvo.id), salvo]);
      this.criando.set(false);
      this.aberto.set(salvo.id);
      this.quadro()?.mostrar(salvo.id);
      this.item()?.terminouDeSalvar();
      this.pendente.set(null);
      this.avisar('Guardado.');
    } catch (e) {
      this.falhou(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async lixeira(alvo: ItemNaLista): Promise<void> {
    await this.mover(async () => {
      const movido = await paraALixeira(this.servicos.api, this.cofre(), alvo);
      this.itens.update((lista) => lista.map((i) => (i.id === alvo.id ? movido : i)));
      this.aberto.set(null);
      this.avisar('Na lixeira. Fica lá por 30 dias.');
    });
  }

  protected async voltarDaLixeira(alvo: ItemNaLista): Promise<void> {
    await this.mover(async () => {
      const voltou = await restaurar(this.servicos.api, this.cofre(), alvo);
      this.itens.update((lista) => lista.map((i) => (i.id === alvo.id ? voltou : i)));
      this.avisar('De volta ao cofre.');
    });
  }

  protected async apagar(alvo: ItemNaLista): Promise<void> {
    await this.mover(async () => {
      await apagarDeVez(this.servicos.api, this.cofre(), alvo);
      this.lixeiraEl()?.apagou();
      this.itens.update((lista) => lista.filter((i) => i.id !== alvo.id));
      this.avisar('Apagado de vez.');
    });
  }

  private async mover(fazer: () => Promise<void>): Promise<void> {
    this.ocupado.set(true);
    this.erro.set(null);
    try {
      await fazer();
    } catch (e) {
      this.falhou(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  /**
   * Renomeia um grupo (ou junta com outro, se o nome novo já existe), troca o ícone e a cor dele, ou o
   * apaga, gravando cada senha dele. Juntando, as senhas ficam com o jeito do outro grupo.
   * Um conflito no meio relê tudo: as que já mudaram ficam mudadas, e fazer de novo termina o resto.
   */
  protected async mudarOGrupo({ de, para, jeito }: MudancaDeGrupo): Promise<void> {
    const alvos = this.noCofre().filter((i) => simples(i.item!.grupo) === simples(de));
    const outro = para ? this.grupos().find((g) => simples(g) === simples(para) && simples(g) !== simples(de)) : undefined;
    const destino = outro ?? para;
    const jeitoNovo = !destino ? SEM_JEITO : outro ? (this.jeitos().get(simples(outro)) ?? SEM_JEITO) : (jeito ?? this.jeitos().get(simples(de)) ?? SEM_JEITO);
    const soOJeito = !!jeito && destino === de;
    this.ocupado.set(true);
    this.erro.set(null);
    this.mudandoGrupo.set({ feitas: 0, total: alvos.length });
    try {
      await mudarGrupo(this.servicos.api, this.cofre(), alvos, destino, jeitoNovo, (salvo) => {
        this.itens.update((lista) => lista.map((i) => (i.id === salvo.id ? salvo : i)));
        this.mudandoGrupo.update((m) => (m ? { ...m, feitas: m.feitas + 1 } : m));
      });
      const quantas = alvos.length === 1 ? 'a senha' : `as ${alvos.length} senhas`;
      this.avisar(
        soOJeito ? `${de} está com o ícone e a cor novos.` : !destino ? `Grupo ${de} apagado: ${quantas} ficaram sem grupo.` : outro ? `${de} juntado com ${destino}.` : `${de} agora se chama ${destino}.`,
      );
    } catch (e) {
      this.falhou(e);
    } finally {
      this.ocupado.set(false);
      this.mudandoGrupo.set(null);
      this.ajustes()?.terminouGrupo();
    }
  }

  /** Confere as senhas na base de vazamentos (só o começo de cada hash sai, seção 10). */
  protected async conferirVazadas(): Promise<void> {
    // todas as senhas de todas as entradas (as que pedem a passkey também: só o começo do hash sai)
    const senhas = this.noCofre().flatMap((i) => entradasDo(i.item!).map((e, n) => ({ id: i.id, n, senha: e.senha })));
    const comSenha = senhas.filter((s) => s.senha);
    if (!comSenha.length) {
      this.avisar('Nenhuma senha guardada para conferir.');
      return;
    }
    this.conferindo.set(true);
    try {
      const vezes = await conferirVazadas(
        comSenha.map((s) => s.senha),
        this.servicos.pagina.buscarFora,
      );
      if (vezes.some((v) => v === null)) {
        this.avisar('Não deu para conferir agora (sem internet ou a base fora do ar).');
        return;
      }
      const mapa = new Map<string, number[]>();
      comSenha.forEach((s, k) => {
        const lista = mapa.get(s.id) ?? [];
        lista[s.n] = vezes[k]!;
        mapa.set(s.id, lista);
      });
      for (const lista of mapa.values()) for (let n = 0; n < lista.length; n++) lista[n] ??= 0;
      this.vazadas.set(mapa);
      this.conferidoEm.set(new Date());
      const quantas = vezes.filter((v) => v! > 0).length;
      this.avisar(quantas ? `${quantas} ${quantas === 1 ? 'senha apareceu' : 'senhas apareceram'} em vazamentos. Troque.` : 'Nenhuma senha apareceu em vazamentos.');
    } finally {
      this.conferindo.set(false);
    }
  }

  protected trancar(_motivo: MotivoDeTrancar = 'parado'): void {
    this.trancador?.parar();
    // M e V não servem mais (a página recarrega em seguida, mas não custa zerar já)
    const segredos = this.cofre().segredos;
    if (segredos) {
      segredos.m.fill(0);
      segredos.v.fill(0);
    }
    this.servicos.api.trancar();
    this.servicos.terminar();
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }
}
