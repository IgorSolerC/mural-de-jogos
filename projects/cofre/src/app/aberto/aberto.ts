import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, OnInit, signal, viewChild } from '@angular/core';
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
import { MonogramaSelo } from './monograma-selo';
import { dominio, nomeDoItem } from './monograma';
import { CORES_DA_CARTELA, type IdDaCor } from '../../../../../shared/cartela-de-icones';
import { emPastas, gruposDoCofre, jeitosDosGrupos, type Pasta, simples } from './pastas';
import { type MotivoDeTrancar, Trancador } from './trancador';

type Vista = 'senhas' | 'lixeira' | 'ajustes';
type Campo = 'usuario' | 'senha';
/** Quanto tempo o botão de copiar fica dizendo "copiado". */
const COPIADO_MS = 1800;

/** O dia e a hora de um ISO, em palavras curtas ("21/10 às 14:32"). */
function quando(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * O cofre aberto (seções 8.1 a 8.2 e 10). Como nos gerenciadores de senha conhecidos: a lista à
 * esquerda, com o User e a Senha de cada item a um clique (sem abrir), e o item escolhido à direita,
 * onde também se edita; numa tela estreita, um de cada vez. Com algum grupo, a lista vira pastas, uma
 * por grupo, que fecham (seção 17.16; quais estão fechadas fica só na memória, como tudo no cofre). Os Ajustes e a lixeira ocupam a ficha
 * inteira. Os itens são conferidos contra o manifesto ao ler (nada aparece se não baterem); um
 * conflito com outro aparelho relê tudo. Trancar avisa o servidor (`sendBeacon`) e recarrega a página,
 * que joga fora a memória.
 */
@Component({
  selector: 'cofre-aberto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemDoCofre, Gerenciar, Icone, Lixeira, MonogramaSelo],
  templateUrl: './aberto.html',
  styleUrl: './aberto.scss',
  host: { '[class.borrado]': 'borrado()', '(document:keydown)': 'atalho($event)' },
})
export class Aberto implements OnInit {
  private readonly servicos = inject(SERVICOS);
  private readonly area = inject(AreaDeTransferencia);
  private readonly documento = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
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
  /** A última mudança no cofre, na faixa (a tela de abrir não guarda nada, então é aqui que se confere). */
  protected readonly ultimaMudanca = signal('');
  protected readonly borrado = signal(false);
  /** O que acabou de ser copiado da lista ("id:campo"), para o botão dizer que deu certo. */
  protected readonly copiado = signal<string | null>(null);
  /** Quantas vezes a senha de cada entrada de cada item apareceu em vazamentos (só depois de "Conferir senhas vazadas"). */
  protected readonly vazadas = signal<ReadonlyMap<string, readonly number[]>>(new Map());
  protected readonly conferindo = signal(false);
  protected readonly conferidoEm = signal<Date | null>(null);
  private readonly item = viewChild(ItemDoCofre);
  private readonly ajustes = viewChild(Gerenciar);
  private readonly lixeiraEl = viewChild(Lixeira);
  private readonly campoBusca = viewChild<ElementRef<HTMLInputElement>>('campoBusca');
  private readonly listaEl = viewChild<ElementRef<HTMLElement>>('lista');

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
  /** As achadas em pastas; sem nenhum grupo, uma pasta só, sem orelha (a lista de sempre). */
  protected readonly pastas = computed(() => emPastas(this.achados(), this.grupos(), this.jeitos()));
  /** As chaves das pastas fechadas (só nesta aba, enquanto o cofre está aberto). */
  protected readonly fechadas = signal<ReadonlySet<string>>(new Set());
  /** A pasta que acabou de ser aberta pela orelha (só ela anima). */
  protected readonly recemAberta = signal<string | null>(null);
  protected readonly buscando = computed(() => !!this.busca().trim());
  protected readonly selecionado = computed(() => this.noCofre().find((i) => i.id === this.aberto()) ?? null);
  /** A parte da direita tem algo (numa tela estreita, ela toma o lugar da lista). */
  protected readonly comDetalhe = computed(() => this.criando() || !!this.selecionado());
  protected readonly listaDeVazadas = computed(() =>
    this.noCofre()
      .filter((i) => this.vezesVazada(i.id) > 0)
      .map((i) => ({ id: i.id, nome: nomeDoItem(i.item!), vezes: this.vezesVazada(i.id) })),
  );

  protected readonly nome = nomeDoItem;
  protected readonly dominio = dominio;

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
    setTimeout(() => {
      if (this.bilhete() === texto) this.bilhete.set(null);
    }, 6000);
  }

  // --- a lista

  /** A pasta mostra as senhas: aberta, ou com uma busca (a busca acha dentro das fechadas também). */
  protected pastaAberta(p: Pasta): boolean {
    return this.buscando() || !this.fechadas().has(p.chave);
  }

  protected alternarPasta(p: Pasta): void {
    if (this.buscando()) return;
    const abrindo = this.fechadas().has(p.chave);
    this.recemAberta.set(abrindo ? p.chave : null);
    this.fechadas.update((f) => {
      const nova = new Set(f);
      if (!nova.delete(p.chave)) nova.add(p.chave);
      return nova;
    });
  }

  /** Abre a pasta de uma senha (ao abrir pelas vazadas, ou depois de guardar num grupo fechado). */
  private mostrarNaPasta(id: string): void {
    const grupo = this.noCofre().find((i) => i.id === id)?.item?.grupo;
    if (grupo === undefined) return;
    const chave = simples(grupo);
    if (this.fechadas().has(chave)) this.fechadas.update((f) => new Set([...f].filter((c) => c !== chave)));
  }

  protected abrirItem(i: ItemNaLista | string): void {
    const id = typeof i === 'string' ? i : i.id;
    this.aberto.set(id);
    this.mostrarNaPasta(id);
    this.criando.set(false);
    this.erro.set(null);
    this.vista.set('senhas');
  }

  protected novo(): void {
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
    if (id) setTimeout(() => this.listaEl()?.nativeElement.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus());
  }

  protected irPara(vista: Vista): void {
    this.erro.set(null);
    this.vista.set(vista);
  }

  /** Quantas vezes a senha mais vazada de um item apareceu em vazamentos (0: nenhuma, ou não conferida). */
  protected vezesVazada(id: string): number {
    return Math.max(0, ...(this.vazadas().get(id) ?? []));
  }

  /**
   * Copia o User ou a Senha (da primeira entrada) direto da lista, sem abrir o item. A senha que pede a
   * passkey não sai daqui: abre o item, onde ela se destrava.
   */
  protected async copiarRapido(i: ItemNaLista, campo: Campo): Promise<void> {
    if (campo === 'senha' && i.item!.protegida) {
      this.abrirItem(i);
      return;
    }
    const texto = campo === 'usuario' ? i.item!.usuario : i.item!.senha;
    if (!texto) return;
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

  protected foiCopiado(i: ItemNaLista, campo: Campo): boolean {
    return this.copiado() === `${i.id}:${campo}`;
  }

  /** As setas andam pela lista; "/" vai para a busca (fora de um campo); Esc fecha o item. */
  protected atalho(e: KeyboardEvent): void {
    if (this.vista() !== 'senhas' || e.ctrlKey || e.metaKey || e.altKey) return;
    const alvo = e.target as HTMLElement | null;
    const escrevendo = !!alvo?.closest('input, textarea, select, [contenteditable]');
    if (e.key === '/' && !escrevendo) {
      e.preventDefault();
      this.campoBusca()?.nativeElement.focus();
      return;
    }
    if (e.key === 'Escape' && this.comDetalhe() && !this.item()?.ocupadoComAlgo() && !alvo?.closest('dialog, .para-digitar')) {
      this.fecharDetalhe();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const lista = this.listaEl()?.nativeElement;
    const naLista = !!alvo && !!lista?.contains(alvo);
    const naBusca = alvo === this.campoBusca()?.nativeElement;
    if (!lista || (!naLista && !naBusca)) return;
    const linhas = [...lista.querySelectorAll<HTMLElement>('.abre')];
    if (!linhas.length) return;
    e.preventDefault();
    const atual = linhas.findIndex((l) => l === alvo?.closest('li')?.querySelector('.abre'));
    const proxima = naBusca ? (e.key === 'ArrowDown' ? 0 : linhas.length - 1) : Math.min(linhas.length - 1, Math.max(0, atual + (e.key === 'ArrowDown' ? 1 : -1)));
    linhas[proxima]!.focus();
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
      this.mostrarNaPasta(salvo.id);
      this.item()?.terminouDeSalvar();
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
      // a pasta continua aberta ou fechada com o nome novo
      if (this.fechadas().has(simples(de))) this.fechadas.update((f) => new Set([...f].filter((c) => c !== simples(de))));
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

  /** O hex de uma cor da cartela (para a borda da orelha), ou null. */
  protected hexDa(cor: IdDaCor | ''): string | null {
    return CORES_DA_CARTELA.find((c) => c.id === cor)?.hex ?? null;
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }
}
