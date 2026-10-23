import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, input, OnInit, output, signal, viewChild } from '@angular/core';
import type { CofreAberto } from '../../core/abrir';
import { type AparelhoDaApi, ErroApi, type EventoDaApi, type SessaoDaApi } from '../../core/api';
import { ErroCofre } from '../../core/crypto';
import { avaliarSenha, serveParaModoServidor } from '../../core/forca';
import { novoCodigo, porAparelho, trocarSenha } from '../../core/gerenciar';
import { LIMITES, nomeDoGrupo } from '../../core/itens';
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
  { id: 'grupos', nome: 'Grupos', dica: 'Renomear e apagar', icone: 'pasta' },
  { id: 'historico', nome: 'Histórico', dica: 'Os últimos 90 dias', icone: 'historico' },
  { id: 'cuidado', nome: 'Cuidado', dica: 'Apagar o cofre', icone: 'perigo' },
];

/** Um grupo das senhas (uma pasta da lista), com quantas senhas tem. */
export interface GrupoDoCofre {
  readonly nome: string;
  readonly senhas: number;
}

/** Renomear um grupo (`para` é o nome novo) ou apagá-lo (`para` vazio): quem usa grava as senhas. */
export interface MudancaDeGrupo {
  readonly de: string;
  readonly para: string;
}

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
 * cofre (só escrevendo APAGAR).
 */
@Component({
  selector: 'cofre-gerenciar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PassoKit, ReguaForca, Icone],
  templateUrl: './gerenciar.html',
  styleUrl: './gerenciar.scss',
})
export class Gerenciar implements OnInit {
  private readonly servicos = inject(SERVICOS);
  private readonly injector = inject(Injector);

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

  /** Quem usa acabou de renomear ou apagar (deu certo ou não): as perguntas fecham. */
  terminouGrupo(): void {
    this.renomeando.set(null);
    this.confirmarApagarGrupo.set(null);
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
    this.parte.set(parte);
    this.erro.set(null);
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

  protected async registrar(): Promise<void> {
    await this.fazer(async () => {
      const desafio = await this.servicos.api.desafioDeRegistro();
      const passkey = await registrarPasskey(desafio, this.servicos.rpId, this.servicos.autenticador);
      if (passkey.prf) await this.gravarAparelho(passkey);
      else this.pendente.set(passkey);
    });
  }

  /** Um aparelho sem PRF entra no modo servidor só se a senha de hoje servir para isso (seção 5). */
  protected async usarModoServidor(): Promise<void> {
    const passkey = this.pendente();
    if (!passkey) return;
    if (!serveParaModoServidor(this.senhaDoModoServidor())) {
      this.erro.set('No modo servidor, a senha mestra precisa ser a frase sorteada (ou ter pelo menos 78 bits). Troque a senha antes de pôr este aparelho.');
      return;
    }
    await this.fazer(() => this.gravarAparelho(passkey));
  }

  private async gravarAparelho(passkey: PasskeyRegistrada): Promise<void> {
    await porAparelho(this.servicos.api, this.cofre(), { passkey, apelido: this.apelido().trim() || 'Aparelho' });
    this.pendente.set(null);
    this.senhaDoModoServidor.set('');
    this.avisar.emit('Aparelho posto no cofre.');
    await this.recarregar();
  }

  protected cancelarPendente(): void {
    this.pendente.set(null);
    this.senhaDoModoServidor.set('');
  }

  protected async tirar(a: AparelhoDaApi): Promise<void> {
    await this.fazer(async () => {
      await this.servicos.api.tirarAparelho(a.id);
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

  protected async gerarCodigo(): Promise<void> {
    await this.fazer(async () => {
      this.codigo.set(await novoCodigo(this.servicos.api, this.cofre()));
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

  protected async apagar(): Promise<void> {
    if (this.palavraApagar() !== 'APAGAR') return;
    await this.fazer(async () => {
      await this.servicos.api.apagarCofre('APAGAR');
      this.terminar.emit();
    });
  }
}
