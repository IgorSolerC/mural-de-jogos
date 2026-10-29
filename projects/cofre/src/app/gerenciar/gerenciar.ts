import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, input, OnInit, output, signal, viewChild } from '@angular/core';
import type { CofreAberto } from '../../core/abrir';
import { type AparelhoDaApi, type Confirmacao, ErroApi, type EventoDaApi, type SessaoDaApi } from '../../core/api';
import { ErroCofre } from '../../core/crypto';
import { avaliarSenha, serveParaModoServidor } from '../../core/forca';
import { confirmacaoPelaPasskey, confirmacaoPelaSenha } from '../../core/confirmar';
import { novoCodigo, porAparelho, trocarSenha } from '../../core/gerenciar';
import { hexDaCor, type IdDaCor, type IdDoIcone } from '../../../../../shared/cartela-de-icones';
import { type JeitoDoGrupo, LIMITES, nomeDoGrupo } from '../../core/itens';
import { Cartela } from '../cartela';
import { simples } from '../aberto/pastas';
import { ErroPasskey, type PasskeyRegistrada, registrarPasskey } from '../../core/passkey';
import { sortearFrase } from '../../core/sorteio';
import { PassoKit } from '../criar/passo-kit';
import { ReguaForca } from '../criar/regua-forca';
import { Icone, type NomeDoIcone } from '../icone';
import { SERVICOS } from '../servicos';

const EVENTOS: Record<string, string> = {
  'cofre-criado': 'Cofre criado',
  aberto: 'Cofre aberto',
  'passkey-usada': 'Passkey usada',
  'erro-senha': 'Senha errada',
  'codigo-usado': 'Código de recuperação usado',
  'codigo-trocado': 'Código de recuperação novo',
  'senha-trocada': 'Senha mestra trocada',
  'aparelho-posto': 'Aparelho posto',
  'aparelho-tirado': 'Aparelho tirado',
  'todos-trancados': 'Todos os aparelhos trancados',
  'cofre-congelado': 'Cofre congelado por 24 horas',
};

const MAXIMO_DE_APARELHOS = 10;

export type ParteDosAjustes = 'aparelhos' | 'senha' | 'recuperacao' | 'sessoes' | 'vazadas' | 'grupos' | 'historico' | 'cuidado';

/** As partes dos Ajustes, na ordem do índice (como as Configurações do mural: uma lista e um bloco no template). */
export const PARTES: readonly { readonly id: ParteDosAjustes; readonly nome: string; readonly dica: string; readonly icone: NomeDoIcone }[] = [
  { id: 'aparelhos', nome: 'Aparelhos', dica: 'As passkeys que abrem', icone: 'celular' },
  { id: 'senha', nome: 'Senha mestra', dica: 'Trocar a senha', icone: 'chave' },
  { id: 'recuperacao', nome: 'Recuperação', dica: 'O código de emergência', icone: 'boia' },
  { id: 'sessoes', nome: 'Abertos agora', dica: 'Onde o cofre está aberto', icone: 'tela' },
  { id: 'vazadas', nome: 'Senhas vazadas', dica: 'Conferir na base pública', icone: 'escudo' },
  { id: 'grupos', nome: 'Grupos', dica: 'Nome, ícone e cor', icone: 'pasta' },
  { id: 'historico', nome: 'Histórico', dica: 'Os últimos 90 dias', icone: 'historico' },
  { id: 'cuidado', nome: 'Cuidado', dica: 'Apagar o cofre', icone: 'perigo' },
];

/** Um grupo das senhas (uma pasta da lista), com quantas senhas tem e o ícone e a cor dele. */
export interface GrupoDoCofre {
  readonly nome: string;
  readonly senhas: number;
  readonly jeito: JeitoDoGrupo;
}

/**
 * Renomear um grupo (`para` é o nome novo), apagá-lo (`para` vazio) ou trocar o ícone e a cor (`para`
 * igual a `de`, com o `jeito`): quem usa grava as senhas.
 */
export interface MudancaDeGrupo {
  readonly de: string;
  readonly para: string;
  readonly jeito?: JeitoDoGrupo;
}

/**
 * O que espera a confirmação de agora (a passkey de novo ou a senha mestra): o servidor só faz com ela
 * (PLANO-COFRE.md, 17.21). Trocar a senha não entra: a senha atual, que ela já pede, confirma.
 */
type PedidoConfirmado = { readonly acao: 'por' } | { readonly acao: 'tirar'; readonly aparelho: AparelhoDaApi } | { readonly acao: 'codigo' } | { readonly acao: 'apagar' };

/** Uma senha que apareceu em vazamentos, para a lista dos Ajustes. */
export interface Vazada {
  readonly id: string;
  readonly nome: string;
  readonly vezes: number;
}

function mensagem(e: unknown): string {
  if (e instanceof ErroApi || e instanceof ErroPasskey) return e.message;
  if (e instanceof ErroCofre && e.motivo === 'abrir') return 'A senha atual não confere.';
  return 'Algo deu errado. Tente de novo.';
}

/**
 * Os Ajustes do cofre aberto (seção 8.5), montados como as Configurações do mural: o índice de etiquetas
 * na faixa de manilha e uma parte aberta por vez. Os aparelhos (pôr, com PRF ou no modo servidor, e
 * tirar, nunca o último), a senha mestra, o código de recuperação, os aparelhos abertos (e trancar
 * todos), as senhas vazadas, os grupos (renomear e apagar de uma vez), o histórico de 90 dias e apagar o
 * cofre (só escrevendo APAGAR). Pôr e tirar aparelho, o código novo e apagar pedem antes a passkey de novo
 * (ou a senha mestra), que vai junto ao servidor.
 */
@Component({
  selector: 'cofre-gerenciar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Cartela, PassoKit, ReguaForca, Icone, NgTemplateOutlet],
  templateUrl: './gerenciar.html',
  styleUrl: './gerenciar.scss',
})
export class Gerenciar implements OnInit {
  private readonly servicos = inject(SERVICOS);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly cofre = input.required<CofreAberto>();
  readonly conta = input.required<string>();
  /** As senhas que apareceram em vazamentos na última conferência. */
  readonly vazadas = input<readonly Vazada[]>([]);
  readonly conferindo = input(false);
  /** Quando as senhas foram conferidas (null: ainda não, desde que o cofre abriu). */
  readonly conferidoEm = input<Date | null>(null);
  /** Quantas senhas há no cofre. */
  readonly senhas = input(0);
  /** Os grupos das senhas, em ordem. */
  readonly grupos = input<readonly GrupoDoCofre[]>([]);
  /** Quantas senhas já mudaram de grupo, enquanto um grupo é renomeado ou apagado. */
  readonly mudandoGrupo = input<{ readonly feitas: number; readonly total: number } | null>(null);
  readonly mudarGrupo = output<MudancaDeGrupo>();
  readonly avisar = output<string>();
  readonly conferir = output<void>();
  readonly abrirItem = output<string>();
  /** Trancar todos e apagar o cofre acabam com esta sessão: quem usa recarrega a página. */
  readonly terminar = output<void>();

  protected readonly maximo = MAXIMO_DE_APARELHOS;
  protected readonly partes = PARTES;
  protected readonly parte = signal<ParteDosAjustes>('aparelhos');
  private readonly indice = viewChild<ElementRef<HTMLElement>>('indice');
  private readonly campoDoGrupo = viewChild<ElementRef<HTMLInputElement>>('campoDoGrupo');
  protected readonly ocupado = signal(false);
  protected readonly erro = signal<string | null>(null);

  // confirmar de novo (a passkey ou a senha mestra), antes do que o servidor só faz com ela
  protected readonly pedindo = signal<PedidoConfirmado | null>(null);
  protected readonly confirmando = signal(false);
  protected readonly comSenhaMestra = signal(false);
  protected readonly senhaMestra = signal('');
  protected readonly erroConfirmar = signal<string | null>(null);
  private readonly campoConfirmar = viewChild<ElementRef<HTMLInputElement>>('campoConfirmar');
  /** Aberto pelo código de recuperação, o aparelho pode não ter passkey nenhuma: começa pela senha. */
  protected readonly comecaPelaSenha = computed(() => this.cofre().recuperada || !this.aparelhos().length);
  protected readonly motivoDaConfirmacao = computed(() => {
    const p = this.pedindo();
    if (!p) return '';
    const para = { por: 'pôr um aparelho', tirar: `tirar ${p.acao === 'tirar' ? p.aparelho.apelido : ''} do cofre`, codigo: 'gerar o código novo', apagar: 'apagar o cofre' }[p.acao];
    return this.cofre().recuperada
      ? `Para ${para}, digite a senha mestra (você abriu o cofre com o código de recuperação).`
      : `Para ${para}, use a passkey de um aparelho do cofre (a digital, o rosto ou o PIN) ou a senha mestra.`;
  });

  // aparelhos
  protected readonly aparelhos = signal<readonly AparelhoDaApi[]>([]);
  protected readonly apelido = signal('');
  protected readonly pendente = signal<PasskeyRegistrada | null>(null);
  protected readonly senhaDoModoServidor = signal('');
  protected readonly confirmarTirar = signal<string | null>(null);
  protected readonly modoServidor = computed(() => this.aparelhos().some((a) => !a.prf));

  // senha
  protected readonly senhaAtual = signal('');
  protected readonly senhaNova = signal('');
  protected readonly senhaConfirmacao = signal('');
  protected readonly sugerida = signal<string | null>(null);
  protected readonly avaliacao = computed(() => avaliarSenha(this.senhaNova(), { sugerida: this.sugerida(), modoServidor: this.modoServidor() }));
  protected readonly senhaPronta = computed(
    () => !this.ocupado() && !!this.senhaAtual() && this.avaliacao().situacao !== 'fraca' && this.senhaConfirmacao() === this.senhaNova(),
  );

  // código
  protected readonly confirmarCodigo = signal(false);
  protected readonly codigo = signal<string | null>(null);
  protected readonly agora = new Date();

  // sessões, histórico, apagar
  protected readonly sessoes = signal<readonly SessaoDaApi[]>([]);
  protected readonly eventos = signal<readonly EventoDaApi[]>([]);
  protected readonly confirmarTrancarTodos = signal(false);
  protected readonly palavraApagar = signal('');

  // grupos
  protected readonly limiteDoGrupo = LIMITES.grupo;
  /** O grupo sendo renomeado (o nome de agora) e o nome escrito. */
  protected readonly renomeando = signal<string | null>(null);
  protected readonly nomeNovo = signal('');
  protected readonly confirmarApagarGrupo = signal<string | null>(null);
  /** O grupo com a cartela de ícone e cor aberta, e o que já foi escolhido nela (vale ao salvar). */
  protected readonly vestindo = signal<string | null>(null);
  protected readonly jeitoNovo = signal<JeitoDoGrupo>({ icone: '', cor: '' });
  /** O grupo que já existe com o nome escrito (renomear para ele junta os dois). */
  protected readonly juntaCom = computed(() => {
    const de = this.renomeando();
    const para = simples(nomeDoGrupo(this.nomeNovo()));
    return de === null || !para || para === simples(de) ? null : (this.grupos().find((g) => simples(g.nome) === para) ?? null);
  });
  protected readonly nomeNovoPronto = computed(() => {
    const de = this.renomeando();
    const para = nomeDoGrupo(this.nomeNovo());
    return !!de && !!para && para !== de && !this.mudandoGrupo();
  });

  async ngOnInit(): Promise<void> {
    this.apelido.set(/Android|iPhone|iPad|Mobile/i.test(this.servicos.pagina.agente) ? 'Celular' : 'PC');
    await this.recarregar();
  }

  protected renomearGrupo(nome: string): void {
    this.confirmarApagarGrupo.set(null);
    this.vestindo.set(null);
    this.renomeando.set(nome);
    this.nomeNovo.set(nome);
    afterNextRender(() => this.campoDoGrupo()?.nativeElement.select(), { injector: this.injector });
  }

  protected gravarNomeDoGrupo(): void {
    const de = this.renomeando();
    if (!de || !this.nomeNovoPronto()) return;
    this.mudarGrupo.emit({ de, para: this.juntaCom()?.nome ?? nomeDoGrupo(this.nomeNovo()) });
  }

  protected apagarGrupo(nome: string): void {
    if (this.mudandoGrupo()) return;
    this.mudarGrupo.emit({ de: nome, para: '' });
  }

  protected vestirGrupo(g: GrupoDoCofre): void {
    this.renomeando.set(null);
    this.confirmarApagarGrupo.set(null);
    this.jeitoNovo.set(g.jeito);
    this.vestindo.set(g.nome);
  }

  protected escolherIconeDoGrupo(icone: IdDoIcone | ''): void {
    this.jeitoNovo.update((j) => ({ ...j, icone }));
  }

  protected escolherCorDoGrupo(cor: IdDaCor | ''): void {
    this.jeitoNovo.update((j) => ({ ...j, cor }));
  }

  /** Fecha a cartela do grupo e devolve o foco ao "Ícone e cor" da linha dele. */
  protected fecharVestir(): void {
    const nome = this.vestindo();
    if (nome === null) return;
    this.vestindo.set(null);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-vestir="${CSS.escape(nome)}"]`)?.focus(), { injector: this.injector });
  }

  protected gravarJeito(g: GrupoDoCofre): void {
    const jeito = this.jeitoNovo();
    if (this.mudandoGrupo()) return;
    if (jeito.icone === g.jeito.icone && jeito.cor === g.jeito.cor) {
      this.fecharVestir();
      return;
    }
    this.mudarGrupo.emit({ de: g.nome, para: g.nome, jeito });
  }

  /** O hex de uma cor da cartela, ou null. */
  protected hexDa(cor: IdDaCor | ''): string | null {
    return hexDaCor(cor);
  }

  /** Quem usa acabou de mudar um grupo (deu certo ou não): as perguntas fecham. */
  terminouGrupo(): void {
    this.renomeando.set(null);
    this.confirmarApagarGrupo.set(null);
    this.fecharVestir();
  }

  protected async recarregar(): Promise<void> {
    const { api } = this.servicos;
    try {
      const [a, s, e] = await Promise.all([api.aparelhos(), api.sessoes(), api.eventos()]);
      this.aparelhos.set(a.aparelhos);
      this.sessoes.set(s.sessoes);
      this.eventos.set(e.eventos);
    } catch (e) {
      this.falhou(e);
    }
  }

  private falhou(e: unknown): void {
    if (e instanceof ErroApi && e.status === 401) this.terminar.emit();
    else this.erro.set(mensagem(e));
  }

  private async fazer(acao: () => Promise<void>): Promise<void> {
    this.erro.set(null);
    this.ocupado.set(true);
    try {
      await acao();
    } catch (e) {
      this.falhou(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected quando(iso: string | null): string {
    if (!iso) return 'nunca';
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  protected hora(d: Date): string {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  protected escolher(parte: ParteDosAjustes): void {
    this.cancelarConfirmacao();
    this.parte.set(parte);
    this.erro.set(null);
  }

  // --- confirmar de novo

  /** O aparelho que espera a confirmação para sair (o id), ou null. */
  protected tirando(): string | null {
    const p = this.pedindo();
    return p?.acao === 'tirar' ? p.aparelho.id : null;
  }

  /** Abre a confirmação de `pedido`: a passkey já pede (o aparelho abre a janela dele), ou o campo da senha. */
  protected pedirConfirmacao(pedido: PedidoConfirmado): void {
    if (this.ocupado() || this.confirmando()) return;
    this.erro.set(null);
    this.erroConfirmar.set(null);
    this.senhaMestra.set('');
    this.pedindo.set(pedido);
    if (this.comecaPelaSenha()) this.usarSenhaMestra();
    else void this.pelaPasskey();
  }

  protected async pelaPasskey(): Promise<void> {
    const pedido = this.pedindo();
    if (!pedido || this.confirmando()) return;
    this.comSenhaMestra.set(false);
    this.erroConfirmar.set(null);
    this.confirmando.set(true);
    let confirmacao: Confirmacao;
    try {
      confirmacao = await confirmacaoPelaPasskey(this.servicos.api, this.servicos.rpId, this.servicos.autenticador);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) this.terminar.emit();
      else if (this.pedindo() === pedido) this.erroConfirmar.set(e instanceof ErroPasskey && e.motivo === 'cancelada' ? 'A passkey não foi confirmada.' : e instanceof ErroPasskey || e instanceof ErroApi ? e.message : 'Não deu para confirmar. Tente de novo.');
      return;
    } finally {
      this.confirmando.set(false);
    }
    await this.executarSeAinda(pedido, confirmacao);
  }

  protected usarSenhaMestra(): void {
    this.erroConfirmar.set(null);
    this.comSenhaMestra.set(true);
    afterNextRender(() => this.campoConfirmar()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async confirmarComASenha(): Promise<void> {
    const pedido = this.pedindo();
    if (!pedido || this.confirmando() || !this.senhaMestra()) return;
    this.confirmando.set(true);
    this.erroConfirmar.set(null);
    // o Argon2id trava a página um pouco: o "Conferindo…" aparece antes
    await new Promise<void>((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
    let confirmacao: Confirmacao;
    try {
      confirmacao = await confirmacaoPelaSenha(this.cofre(), this.senhaMestra());
    } catch (e) {
      if (this.pedindo() !== pedido) return;
      this.erroConfirmar.set(e instanceof ErroCofre && e.motivo === 'abrir' ? 'Não é a senha mestra deste cofre.' : 'Não deu para conferir. Tente de novo.');
      this.senhaMestra.set('');
      return;
    } finally {
      this.confirmando.set(false);
    }
    await this.executarSeAinda(pedido, confirmacao);
  }

  protected cancelarConfirmacao(): void {
    this.pedindo.set(null);
    this.comSenhaMestra.set(false);
    this.senhaMestra.set('');
    this.erroConfirmar.set(null);
  }

  /**
   * Enquanto a passkey ou o Argon2id trabalham, a pessoa pode desistir (Cancelar, outra parte dos
   * Ajustes): a confirmação que volta depois disso não faz nada (tirar um aparelho, trocar o código).
   */
  private async executarSeAinda(pedido: PedidoConfirmado, confirmacao: Confirmacao): Promise<void> {
    if (this.pedindo() !== pedido) return;
    await this.executar(pedido, confirmacao);
  }

  /** Confirmado: a confirmação fecha e o pedido vai, com ela, ao servidor. */
  private async executar(pedido: PedidoConfirmado, confirmacao: Confirmacao): Promise<void> {
    this.cancelarConfirmacao();
    switch (pedido.acao) {
      case 'por':
        return this.registrarCom(confirmacao);
      case 'tirar':
        return this.tirarCom(pedido.aparelho, confirmacao);
      case 'codigo':
        return this.gerarCodigoCom(confirmacao);
      case 'apagar':
        return this.apagarCom(confirmacao);
    }
  }

  /** O índice é uma lista de abas: as setas andam, Home e End vão às pontas (a aberta leva o foco). */
  protected teclaNoIndice(e: KeyboardEvent): void {
    const n = PARTES.length;
    const agora = PARTES.findIndex((p) => p.id === this.parte());
    const passos: Record<string, number> = { ArrowDown: agora + 1, ArrowRight: agora + 1, ArrowUp: agora - 1, ArrowLeft: agora - 1, Home: 0, End: n - 1 };
    const proxima = passos[e.key];
    if (proxima === undefined) return;
    e.preventDefault();
    this.escolher(PARTES[(proxima + n) % n]!.id);
    afterNextRender(() => this.indice()?.nativeElement.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(), { injector: this.injector });
  }

  protected nomeDoEvento(tipo: string): string {
    return EVENTOS[tipo] ?? tipo;
  }

  // --- aparelhos

  protected registrar(): void {
    this.pedirConfirmacao({ acao: 'por' });
  }

  /** Confirmado antes (o desafio de confirmar vale 5 minutos, o de registrar só 2): agora a passkey nova. */
  private async registrarCom(confirmacao: Confirmacao): Promise<void> {
    await this.fazer(async () => {
      const desafio = await this.servicos.api.desafioDeRegistro();
      const passkey = await registrarPasskey(desafio, this.servicos.rpId, this.servicos.autenticador);
      if (passkey.prf) await this.gravarAparelho(passkey, confirmacao);
      // sem PRF, a senha mestra digitada para o modo servidor é a que confirma
      else this.pendente.set(passkey);
    });
  }

  /**
   * Um aparelho sem PRF entra no modo servidor só se a senha de hoje servir para isso (seção 5). A senha
   * digitada é conferida abrindo V: sem isso, qualquer senha forte digitada ali passava, mesmo com a do
   * cofre fraca.
   */
  protected async usarModoServidor(): Promise<void> {
    const passkey = this.pendente();
    if (!passkey) return;
    const senha = this.senhaDoModoServidor();
    if (!serveParaModoServidor(senha)) {
      this.erro.set('No modo servidor, a senha mestra precisa ser a frase sorteada (ou ter pelo menos 78 bits). Troque a senha antes de pôr este aparelho.');
      return;
    }
    await this.fazer(async () => {
      let confirmacao: Confirmacao;
      try {
        confirmacao = await confirmacaoPelaSenha(this.cofre(), senha);
      } catch (e) {
        if (!(e instanceof ErroCofre && e.motivo === 'abrir')) throw e;
        this.erro.set('Esta não é a senha mestra do cofre.');
        return;
      }
      await this.gravarAparelho(passkey, confirmacao);
    });
  }

  private async gravarAparelho(passkey: PasskeyRegistrada, confirmacao: Confirmacao): Promise<void> {
    await porAparelho(this.servicos.api, this.cofre(), { passkey, apelido: this.apelido().trim() || 'Aparelho' }, confirmacao);
    this.pendente.set(null);
    this.senhaDoModoServidor.set('');
    this.avisar.emit('Aparelho posto no cofre.');
    await this.recarregar();
  }

  protected cancelarPendente(): void {
    this.pendente.set(null);
    this.senhaDoModoServidor.set('');
  }

  protected tirar(a: AparelhoDaApi): void {
    this.pedirConfirmacao({ acao: 'tirar', aparelho: a });
  }

  private async tirarCom(a: AparelhoDaApi, confirmacao: Confirmacao): Promise<void> {
    await this.fazer(async () => {
      await this.servicos.api.tirarAparelho(a.id, confirmacao);
      this.confirmarTirar.set(null);
      this.avisar.emit(`${a.apelido} saiu do cofre. A passkey continua no aparelho; pode apagá-la lá.`);
      await this.recarregar();
    });
  }

  // --- senha

  protected sortear(): void {
    const frase = sortearFrase();
    this.sugerida.set(frase);
    this.senhaNova.set(frase);
    this.senhaConfirmacao.set('');
  }

  protected async trocar(): Promise<void> {
    if (!this.senhaPronta()) return;
    await this.fazer(async () => {
      await trocarSenha(this.servicos.api, this.cofre(), this.senhaAtual(), this.senhaNova());
      this.senhaAtual.set('');
      this.senhaNova.set('');
      this.senhaConfirmacao.set('');
      this.sugerida.set(null);
      this.avisar.emit('Senha mestra trocada.');
      await this.recarregar();
    });
  }

  // --- código

  protected gerarCodigo(): void {
    this.pedirConfirmacao({ acao: 'codigo' });
  }

  private async gerarCodigoCom(confirmacao: Confirmacao): Promise<void> {
    await this.fazer(async () => {
      this.codigo.set(await novoCodigo(this.servicos.api, this.cofre(), confirmacao));
      this.confirmarCodigo.set(false);
      await this.recarregar();
    });
  }

  // --- sessões e apagar

  protected async trancarTodos(): Promise<void> {
    await this.fazer(async () => {
      await this.servicos.api.trancarTodos();
      this.terminar.emit();
    });
  }

  protected apagar(): void {
    if (this.palavraApagar() !== 'APAGAR') return;
    this.pedirConfirmacao({ acao: 'apagar' });
  }

  private async apagarCom(confirmacao: Confirmacao): Promise<void> {
    if (this.palavraApagar() !== 'APAGAR') return;
    await this.fazer(async () => {
      await this.servicos.api.apagarCofre('APAGAR', confirmacao);
      this.terminar.emit();
    });
  }
}
