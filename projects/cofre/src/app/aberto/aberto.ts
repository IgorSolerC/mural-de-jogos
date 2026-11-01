import { DOCUMENT } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, input, OnInit, signal, viewChild } from '@angular/core';
import { ErroApi } from '../../core/api';
import type { CofreAberto } from '../../core/abrir';
import { lerCarencia, semArmario } from '../../core/carencia';
import { ErroCofre } from '../../core/crypto';
import {
  apagarDeVez,
  avisoDeVazada,
  type CamposDoItem,
  entradasDo,
  ErroConflito,
  type ItemNaLista,
  lerItens,
  limparLapides,
  mudarGrupo,
  mudarVazamentos,
  nomeDaEntrada,
  paraALixeira,
  restaurar,
  SEM_JEITO,
  salvarItem,
  type Vazamento,
  vezesVazada,
} from '../../core/itens';
import { conferirSenhas, RITMO_DA_ABERTURA, RITMO_PEDIDO } from '../../core/vazadas';
import { AreaDeTransferencia, avisoDaCopia } from '../area-de-transferencia';
import { Icone } from '../icone';
import { SERVICOS } from '../servicos';
import { type Calada, Gerenciar, type MarcaDeVazada, type MudancaDeGrupo } from '../gerenciar/gerenciar';
import { ItemDoCofre } from './item';
import { Lixeira } from './lixeira';
import { nomeDoItem } from './monograma';
import { contarPorGrupo, emPastas, gruposDoCofre, jeitosDosGrupos, simples } from './pastas';
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
  /** Conferindo as senhas na base de vazamentos (pedido pela pessoa, ou o da abertura, em segundo plano). */
  protected readonly conferindo = signal(false);
  protected readonly conferidoEm = signal<Date | null>(null);
  /** "Conferir os vazamentos ao abrir o cofre" (17.24), como o servidor disse ao abrir e os Ajustes mudaram. */
  protected readonly conferirAoAbrir = signal(false);
  protected readonly mudandoConferirAoAbrir = signal(false);
  /** Todas as gravações, uma depois da outra: a marca de vazada feita em segundo plano não cruza com o Salvar. */
  private fila: Promise<unknown> = Promise.resolve();
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
  protected readonly gruposComConta = computed(() => {
    const conta = contarPorGrupo(this.noCofre());
    return this.grupos().map((nome) => ({ nome, senhas: conta.get(simples(nome)) ?? 0, jeito: this.jeitos().get(simples(nome)) ?? SEM_JEITO }));
  });
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
  /** As senhas marcadas como vazadas que avisam, uma linha por item (o mais vazado primeiro), para os Ajustes. */
  protected readonly listaDeVazadas = computed(() =>
    this.noCofre()
      .filter((i) => vezesVazada(i.item) > 0)
      .map((i) => ({ id: i.id, nome: nomeDoItem(i.item!), vezes: vezesVazada(i.item), senhas: entradasDo(i.item!).filter((e) => avisoDeVazada(e)).length }))
      .sort((a, b) => b.vezes - a.vezes),
  );
  /** As que a pessoa pediu para não avisar mais, para os Ajustes (dá para voltar a avisar). */
  protected readonly listaDeCaladas = computed<Calada[]>(() =>
    this.noCofre().flatMap((i) => {
      const entradas = entradasDo(i.item!);
      const comTitulos = entradas.length > 1 || entradas.some((e) => !!e.rotulo);
      // uma linha por senha (duas entradas com a mesma senha têm a mesma marca, e voltam a avisar juntas)
      const porResumo = new Map<string, { nomes: string[]; vezes: number }>();
      entradas.forEach((e, n) => {
        if (!e.vazada?.calada) return;
        const linha = porResumo.get(e.vazada.resumo) ?? { nomes: [], vezes: e.vazada.vezes };
        linha.nomes.push(nomeDaEntrada(e, n));
        porResumo.set(e.vazada.resumo, linha);
      });
      return [...porResumo].map(([resumo, { nomes, vezes }]) => ({ id: i.id, nome: comTitulos ? `${nomeDoItem(i.item!)} · ${nomes.join(' e ')}` : nomeDoItem(i.item!), resumo, vezes }));
    }),
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
    this.conferirAoAbrir.set(cofre.vazamentos === true);
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
    // ligado nos Ajustes: confere todas as senhas uma vez, logo depois de abrir, em segundo plano (17.24)
    if (this.conferirAoAbrir() && !this.erro() && this.noCofre().length) void this.conferirVazadas(true);
  }

  /** Põe a gravação na fila: ela só começa quando a anterior termina (deu certo ou não). */
  private naFila<T>(fazer: () => Promise<T>): Promise<T> {
    const vez = this.fila.then(fazer, fazer);
    this.fila = vez.catch(() => undefined);
    return vez;
  }

  private falhou(e: unknown): void {
    if (e instanceof ErroConflito) {
      this.erro.set(e.message);
      // na fila, para não trocar o manifesto no meio de uma gravação (a da conferência em segundo plano)
      void this.naFila(() => this.recarregar());
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
    // qual item: o aberto agora (o de antes é lido na vez da fila, já com o que a conferência marcou)
    const id = this.criando() ? null : this.aberto();
    try {
      // a marca de vazada vai junto da senha que não mudou e sai da trocada (core/itens.ts, pelo resumo)
      const salvo = await this.naFila(() => {
        const antes = id ? this.noCofre().find((i) => i.id === id) : null;
        // o item sumiu enquanto esperava a vez (outro aparelho o pôs na lixeira): não vira um item novo
        if (antes === undefined) throw new ErroConflito();
        return salvarItem(this.servicos.api, this.cofre(), campos, antes);
      });
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
      // como está na vez da fila: a conferência pode ter marcado (e subido a versão) enquanto esperava
      const movido = await paraALixeira(this.servicos.api, this.cofre(), this.itens().find((i) => i.id === alvo.id) ?? alvo);
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
      await this.naFila(fazer);
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
      // na vez da fila, cada senha como está agora (a conferência pode ter marcado alguma enquanto esperava)
      await this.naFila(() =>
        mudarGrupo(this.servicos.api, this.cofre(), alvos.map((a) => this.itens().find((i) => i.id === a.id) ?? a), destino, jeitoNovo, (salvo) => {
          this.itens.update((lista) => lista.map((i) => (i.id === salvo.id ? salvo : i)));
          this.mudandoGrupo.update((m) => (m ? { ...m, feitas: m.feitas + 1 } : m));
        }),
      );
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

  /**
   * Confere as senhas na base de vazamentos (só o começo de cada hash sai, seção 10) e marca, dentro de cada
   * item, as que apareceram (17.24): a marca fica até a senha mudar ou a pessoa tirar o aviso. `daAbertura`:
   * a conferência que "Conferir os vazamentos ao abrir o cofre" faz sozinha, em segundo plano e devagar; ela
   * só fala se achar uma senha nova vazada (sem rede, fica quieta).
   */
  protected async conferirVazadas(daAbertura = false): Promise<void> {
    if (this.conferindo()) return;
    // todas as senhas de todas as entradas (as que pedem a passkey também: só o começo do hash sai)
    const senhas = this.noCofre().flatMap((i) => entradasDo(i.item!).flatMap((e) => (e.senha ? [{ id: i.id, senha: e.senha, marcada: !!e.vazada }] : [])));
    if (!senhas.length) {
      if (!daAbertura) this.avisar('Nenhuma senha guardada para conferir.');
      return;
    }
    this.conferindo.set(true);
    try {
      const conferidas = await conferirSenhas(
        senhas.map((s) => s.senha),
        this.servicos.pagina.buscarFora,
        daAbertura ? RITMO_DA_ABERTURA : RITMO_PEDIDO,
      );
      // trancado no meio do caminho: as senhas já saíram da memória, nada a marcar
      if (!this.itens().length) return;
      if (conferidas.some((c) => c.vezes === null)) {
        if (!daAbertura) this.avisar('Não deu para conferir agora (sem internet ou a base fora do ar).');
        return;
      }
      const achadas = new Map(conferidas.filter((c) => c.vezes! > 0).map((c) => [c.resumo, c.vezes!] as const));
      // só os itens com uma senha achada que ainda não tem marca são gravados de novo
      const aMarcar = new Set(senhas.filter((s, k) => !s.marcada && conferidas[k]!.vezes! > 0).map((s) => s.id));
      const { novas, falharam } = await this.marcarVazadas(aMarcar, achadas, new Date().toISOString(), daAbertura);
      this.conferidoEm.set(new Date());
      // as que avisam agora (a que a pessoa pediu para não avisar não entra na conta)
      const quantas = this.listaDeVazadas().reduce((soma, v) => soma + v.senhas, 0);
      if (daAbertura) {
        if (novas) this.avisar(`${novas} ${novas === 1 ? 'senha apareceu' : 'senhas apareceram'} em vazamentos desde a última vez. Procure a etiqueta Vazada.`);
      } else if (falharam) {
        this.avisar(`Não deu para guardar o aviso em ${falharam === 1 ? '1 senha' : `${falharam} senhas`}. Confira de novo daqui a pouco.`);
      } else {
        this.avisar(quantas ? `${quantas} ${quantas === 1 ? 'senha apareceu' : 'senhas apareceram'} em vazamentos. Troque.` : 'Nenhuma senha apareceu em vazamentos.');
      }
    } finally {
      this.conferindo.set(false);
    }
  }

  /**
   * Marca, item por item (cada um na vez da fila, como está naquela hora), as entradas cuja senha está em
   * `achadas` (resumo → vezes). A marca que já existe fica como está, calada ou não; a que tinha saído pelo
   * "Tirar o aviso" volta. Devolve quantas entradas ganharam a marca e quantos itens não deu para gravar. Um
   * conflito com outro aparelho relê tudo e tenta o item de novo, uma vez; um item que não dá para gravar
   * (grande demais para o servidor com a marca) fica sem, e os outros seguem; a sessão que acabou tranca;
   * outro erro da API para (a conferência da abertura, quieta; a pedida, com o erro).
   */
  private async marcarVazadas(ids: ReadonlySet<string>, achadas: ReadonlyMap<string, number>, em: string, daAbertura: boolean): Promise<{ novas: number; falharam: number }> {
    let novas = 0;
    let falharam = 0;
    const marcar = (e: { readonly vazada?: Vazamento }, resumo: string): Vazamento | undefined => {
      if (e.vazada) return e.vazada;
      const vezes = achadas.get(resumo);
      return vezes ? { resumo, vezes, em } : undefined;
    };
    for (const id of ids) {
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        try {
          const salvo = await this.naFila(async () => {
            const atual = this.noCofre().find((i) => i.id === id);
            return atual ? mudarVazamentos(this.servicos.api, this.cofre(), atual, marcar) : null;
          });
          if (salvo) {
            this.itens.update((lista) => lista.map((i) => (i.id === salvo.id ? salvo : i)));
            // as que ganharam a marca agora (contadas depois de gravar: a tentativa que deu conflito não conta)
            novas += entradasDo(salvo.item!).filter((e) => e.vazada?.em === em).length;
          }
          break;
        } catch (e) {
          if (e instanceof ErroConflito && tentativa === 0) {
            await this.naFila(() => this.recarregar());
            continue;
          }
          if (e instanceof ErroCofre && e.motivo === 'grande') {
            falharam++;
            break;
          }
          if ((e instanceof ErroApi && e.status === 401) || !daAbertura) this.falhou(e);
          return { novas, falharam: falharam + 1 };
        }
      }
    }
    return { novas, falharam };
  }

  /**
   * Muda a marca de vazada de uma senha (pelo resumo dela) num item: "Tirar o aviso" (sai, e uma conferência
   * nova que ache põe de volta), "Não avisar mais desta senha" (fica calada até a senha mudar) e "Voltar a
   * avisar".
   */
  protected async mudarAviso({ id, resumo, como }: MarcaDeVazada): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.erro.set(null);
    try {
      const salvo = await this.naFila(async () => {
        const atual = this.noCofre().find((i) => i.id === id);
        return atual
          ? mudarVazamentos(this.servicos.api, this.cofre(), atual, (e, r) => {
              if (r !== resumo || !e.vazada) return e.vazada;
              if (como === 'tirar') return undefined;
              const { calada: _, ...semCalar } = e.vazada;
              return como === 'calar' ? { ...semCalar, calada: true } : semCalar;
            })
          : null;
      });
      // nada mudou (dois toques, ou a senha já foi para a lixeira ou trocada): nada a dizer
      if (!salvo) return;
      this.itens.update((lista) => lista.map((i) => (i.id === salvo.id ? salvo : i)));
      this.avisar(
        como === 'tirar'
          ? 'Aviso tirado. Ele volta se uma conferência achar esta senha de novo.'
          : como === 'calar'
            ? 'Não vamos mais avisar desta senha. Trocada, os avisos voltam a valer.'
            : 'O aviso desta senha voltou.',
      );
    } catch (e) {
      this.falhou(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  /** "Conferir os vazamentos ao abrir o cofre": vale na hora, no servidor (17.24). */
  protected async mudarConferirAoAbrir(ligada: boolean): Promise<void> {
    if (this.mudandoConferirAoAbrir()) return;
    this.mudandoConferirAoAbrir.set(true);
    try {
      const r = await this.servicos.api.ligarVazamentos(ligada);
      this.conferirAoAbrir.set(r.ligada);
      this.avisar(r.ligada ? 'Ligado. A cada vez que o cofre abrir, as senhas são conferidas em segundo plano.' : 'Desligado. As senhas só são conferidas quando você pedir.');
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) this.trancar('parado');
      else this.avisar(e instanceof ErroApi ? e.message : 'Não deu para mudar agora. Tente de novo.');
    } finally {
      this.mudandoConferirAoAbrir.set(false);
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
    // as senhas decifradas também saem já: se a recarga não acontecer (a página indo para o cache de
    // voltar/avançar, onde o navegador ignora a recarga pedida na saída), a memória não guarda nada
    this.itens.set([]);
    this.aberto.set(null);
    this.criando.set(false);
    this.busca.set('');
    this.pendente.set(null);
    // com a carência guardada, o trancar não pede ao navegador para apagar o armazenamento (17.23)
    this.servicos.api.trancar(lerCarencia(this.servicos.pagina.armario ?? semArmario) !== null);
    this.servicos.terminar();
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }
}
