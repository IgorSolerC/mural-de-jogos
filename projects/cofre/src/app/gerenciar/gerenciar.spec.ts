import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CofreAberto } from '../../core/abrir';
import { type AparelhoDaApi, ApiCofre, type CarenciaDaApi, type Confirmacao, type DesafioDeConfirmar, type DesafioDeRegistro, type EventoDaApi, type SessaoDaApi } from '../../core/api';
import { aleatorios, paraBase64url } from '../../core/bytes';
import { type Carencia, guardarCarencia, lerCarencia } from '../../core/carencia';
import type { Guarda } from '../../core/entrar';
import { chaveDaSenha, criarCofre, KDF_PADRAO, novaChaveDoMeio, novoSal } from '../../core/crypto';
import { sortearFrase } from '../../core/sorteio';
import type { Autenticador } from '../../core/passkey';
import { type Pagina, SERVICOS, type Servicos } from '../servicos';
import { Gerenciar } from './gerenciar';

const USUARIO = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';
const SENHA = sortearFrase();
const CARENCIA_DAQUI = '7c1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b70';

/** Um armário de mentira (o localStorage), com a carência deste aparelho guardada. */
function armarioComCarencia(): Guarda & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>();
  const armario = { mapa, getItem: (c: string) => mapa.get(c) ?? null, setItem: (c: string, v: string) => void mapa.set(c, v), removeItem: (c: string) => void mapa.delete(c) };
  const carencia: Carencia = { id: CARENCIA_DAQUI, token: 'T'.repeat(43), chave: paraBase64url(aleatorios(32)), usuario: USUARIO, codigo: 'K7QFM2XA', expiraEm: '2999-10-22T08:00:00.000Z', pin: false };
  guardarCarencia(armario, carencia);
  return armario;
}

class ApiDeGerenciar extends ApiCofre {
  lista: AparelhoDaApi[] = [
    { id: 'a1', apelido: 'Celular', prf: true, criadoEm: '2026-10-20T10:00:00.000Z', usadoEm: null },
    { id: 'a2', apelido: 'PC', prf: true, criadoEm: '2026-10-20T10:00:00.000Z', usadoEm: null },
  ];
  pedidos: string[] = [];
  postos: { apelido: string; prf: boolean }[] = [];
  /** As confirmações que foram com cada pedido: "senha" (a prova da senha mestra) ou "passkey". */
  confirmacoes: string[] = [];
  desafios = 0;
  private anotar(c: Confirmacao): void {
    this.confirmacoes.push('kAuth' in c ? `senha ${c.kAuth.length}` : `passkey ${c.desafio}`);
  }
  override async desafioDeConfirmar(): Promise<DesafioDeConfirmar> {
    this.desafios++;
    return {
      desafio: `d${this.desafios}`,
      publicKey: { challenge: paraBase64url(aleatorios(32)), rpId: 'cofre.teste', allowCredentials: this.lista.map((a) => ({ type: 'public-key' as const, id: paraBase64url(aleatorios(16)) })) },
    };
  }
  override async aparelhos() {
    return { aparelhos: this.lista };
  }
  override async sessoes(): Promise<{ sessoes: readonly SessaoDaApi[] }> {
    return { sessoes: [{ tipo: 'cofre', criadaEm: '2026-10-21T10:00:00.000Z', usadaEm: '2026-10-21T10:00:00.000Z', aparelho: 'Chrome no Windows', atual: true }] };
  }
  override async eventos(): Promise<{ eventos: readonly EventoDaApi[] }> {
    return { eventos: [{ tipo: 'erro-senha', em: '2026-10-21T09:00:00.000Z', aparelho: 'Safari no iPhone', pais: 'BR' }] };
  }
  override async tirarAparelho(id: string, confirmar: Confirmacao) {
    this.anotar(confirmar);
    this.pedidos.push(`tirar ${id}`);
    this.lista = this.lista.filter((a) => a.id !== id);
    return { tirado: true as const };
  }
  corposDaSenha: object[] = [];
  override async trocarSenha(corpo: object, confirmar: Confirmacao) {
    this.anotar(confirmar);
    this.corposDaSenha.push(corpo);
    this.pedidos.push('senha');
    return { trocada: true as const };
  }
  override async novoCodigo(_corpo: object, confirmar: Confirmacao) {
    this.anotar(confirmar);
    this.pedidos.push('codigo');
    return { trocado: true as const };
  }
  override async trancarTodos() {
    this.pedidos.push('trancar-todos');
    return { trancados: true as const };
  }
  override async apagarCofre(confirmacao: string, confirmar: Confirmacao) {
    this.anotar(confirmar);
    this.pedidos.push(`apagar ${confirmacao}`);
    return { apagado: true as const };
  }
  override async desafioDeRegistro(): Promise<DesafioDeRegistro> {
    return {
      desafio: 'd',
      publicKey: { challenge: paraBase64url(aleatorios(32)), rp: { id: 'cofre.teste', name: 'x' }, user: { id: paraBase64url(aleatorios(16)), name: 'x', displayName: 'x' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }] },
    };
  }
  ligada = true;
  carenciasDaConta: CarenciaDaApi[] = [
    { id: CARENCIA_DAQUI, aparelho: 'Chrome no Windows', criadaEm: '2026-10-21T08:00:00.000Z', expiraEm: '2999-10-22T08:00:00.000Z', usadaEm: null },
    { id: '7c1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b71', aparelho: 'Safari no iPhone', criadaEm: '2026-10-21T07:00:00.000Z', expiraEm: '2999-10-22T07:00:00.000Z', usadaEm: '2026-10-21T09:00:00.000Z' },
  ];
  override async carencias() {
    return { ligada: this.ligada, carencias: this.ligada ? this.carenciasDaConta : [] };
  }
  override async ligarCarencia(ligada: boolean, confirmar?: Confirmacao) {
    if (confirmar) this.anotar(confirmar);
    this.pedidos.push(`carencia ${ligada}`);
    this.ligada = ligada;
    if (!ligada) this.carenciasDaConta = [];
    return { ligada };
  }
  override async encerrarCarencia(id: string) {
    this.pedidos.push(`encerrar ${id}`);
    this.carenciasDaConta = this.carenciasDaConta.filter((c) => c.id !== id);
    return { encerrada: true as const };
  }
  override async porAparelho(aparelho: unknown, confirmar: Confirmacao) {
    this.anotar(confirmar);
    const a = aparelho as { apelido: string; prf: boolean };
    this.postos.push({ apelido: a.apelido, prf: a.prf });
    return { id: 'novo', apelido: a.apelido, prf: a.prf };
  }
}

/** Uma passkey sem PRF (o aparelho novo vai pedir o modo servidor). */
const semPrf: Autenticador = {
  criar: async () =>
    ({
      type: 'public-key',
      rawId: aleatorios(16).buffer,
      response: { clientDataJSON: aleatorios(8).buffer, attestationObject: aleatorios(8).buffer, getTransports: () => ['internal'] },
      getClientExtensionResults: () => ({ prf: { enabled: false } }),
    }) as unknown as Credential,
  pegar: async () => null,
};

/** Uma assinatura de passkey com a verificação do usuário (o servidor de mentira não confere). */
const assinada = (): Credential =>
  ({
    type: 'public-key',
    rawId: aleatorios(16).buffer,
    response: { clientDataJSON: aleatorios(32).buffer, authenticatorData: aleatorios(37).buffer, signature: aleatorios(64).buffer },
    getClientExtensionResults: () => ({}),
  }) as unknown as Credential;

async function montar(opcoes: { recuperada?: boolean; autenticador?: Autenticador; armario?: Guarda; modoServidor?: boolean } = {}) {
  const sal = novoSal();
  const m = novaChaveDoMeio();
  const { chave, v } = await criarCofre(await chaveDaSenha(SENHA, sal, KDF_PADRAO), m, USUARIO);
  const cofre: CofreAberto = {
    usuario: USUARIO,
    chave,
    manifesto: { contador: 0, itens: {}, lixeira: {}, mudadoEm: '2026-10-21T10:00:00.000Z', aparelho: 'PC' },
    contador: 0,
    recuperada: opcoes.recuperada ?? false,
    expiraEm: '',
    paradaMaxima: 600,
    aparelho: 'PC',
    segredos: { m, v, sal, kdf: { ...KDF_PADRAO } },
  };
  const api = new ApiDeGerenciar();
  if (opcoes.modoServidor) api.lista = api.lista.map((a, i) => (i === 1 ? { ...a, prf: false } : a));
  const servicos: Servicos = { api, autenticador: opcoes.autenticador ?? semPrf, rpId: 'cofre.teste', pagina: { agente: 'Chrome no Windows', armario: opcoes.armario } as Pagina, terminar: () => undefined };
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SERVICOS, useValue: servicos }] });
  const fixture = TestBed.createComponent(Gerenciar);
  fixture.componentRef.setInput('cofre', cofre);
  fixture.componentRef.setInput('conta', 'K7QFM2XA');
  const terminou = jasmine.createSpy('terminar');
  const avisos: string[] = [];
  fixture.componentInstance.terminar.subscribe(terminou);
  fixture.componentInstance.avisar.subscribe((t) => avisos.push(t));
  await estabilizar(fixture);
  return { fixture, api, terminou, avisos, el: fixture.nativeElement as HTMLElement };
}

async function estabilizar(fixture: ComponentFixture<Gerenciar>, vezes = 6): Promise<void> {
  for (let i = 0; i < vezes; i++) {
    await new Promise((ok) => setTimeout(ok, 0));
    await fixture.whenStable();
  }
}

async function ate(fixture: ComponentFixture<Gerenciar>, cond: () => boolean): Promise<void> {
  const fim = Date.now() + 15000;
  while (!cond()) {
    if (Date.now() > fim) throw new Error('não chegou');
    await new Promise((ok) => setTimeout(ok, 30));
    await fixture.whenStable();
  }
}

const botao = (el: HTMLElement, texto: string) => [...el.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto) as HTMLButtonElement;
/** Abre uma parte dos Ajustes pelo índice. */
async function parte(fixture: ComponentFixture<Gerenciar>, nome: string): Promise<void> {
  const el = fixture.nativeElement as HTMLElement;
  [...el.querySelectorAll<HTMLElement>('[role=tab]')].find((t) => t.querySelector('.parte-nome')!.textContent!.trim() === nome)!.click();
  await estabilizar(fixture);
}
function digitar(el: HTMLElement, seletor: string, valor: string): void {
  const i = el.querySelector<HTMLInputElement>(seletor)!;
  i.value = valor;
  i.dispatchEvent(new Event('input'));
}

/** Na confirmação aberta: "Usar a senha mestra" (se a passkey veio primeiro), a senha e Confirmar. */
async function confirmarComSenha(fixture: ComponentFixture<Gerenciar>, senha: string): Promise<void> {
  const el = fixture.nativeElement as HTMLElement;
  await ate(fixture, () => !!el.querySelector('#g-confirmar-senha') || !!botao(el, 'Usar a senha mestra'));
  if (!el.querySelector('#g-confirmar-senha')) {
    botao(el, 'Usar a senha mestra').click();
    await estabilizar(fixture);
  }
  digitar(el, '#g-confirmar-senha', senha);
  await estabilizar(fixture);
  botao(el, 'Confirmar').click();
}

describe('gerenciar o cofre', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('mostra os aparelhos, as sessões e o histórico em palavras, uma parte por vez', async () => {
    const { fixture, el } = await montar();
    expect(el.querySelector('[role=tab][aria-selected=true]')!.textContent).toContain('Aparelhos');
    expect([...el.querySelectorAll('.aparelho .nome')].map((n) => n.textContent)).toEqual(['Celular', 'PC']);
    await parte(fixture, 'Abertos agora');
    expect(el.querySelector('.aparelho')).toBeNull();
    expect(el.textContent).toContain('Chrome no Windows');
    expect(el.textContent).toContain('Cofre aberto desde');
    await parte(fixture, 'Histórico');
    expect(el.querySelector('.historico .alerta')!.textContent).toContain('Senha errada');
  });

  it('o índice anda com as setas, Home e End, como uma lista de abas', async () => {
    const { fixture, el } = await montar();
    const indice = el.querySelector<HTMLElement>('[role=tablist]')!;
    const aberta = () => el.querySelector('[role=tab][aria-selected=true] .parte-nome')!.textContent!.trim();
    indice.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await estabilizar(fixture);
    expect(aberta()).toBe('Senha mestra');
    expect(el.querySelector('#g-atual')).not.toBeNull();
    indice.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await estabilizar(fixture);
    expect(aberta()).toBe('Cuidado');
    indice.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await estabilizar(fixture);
    expect(aberta()).toBe('Aparelhos');
    expect(document.activeElement).toBe(el.querySelector('[role=tab][aria-selected=true]'));
  });

  it('as senhas vazadas: conferir pede a quem usa, e cada vazada abre o item', async () => {
    const { fixture, el } = await montar();
    const pedidos: string[] = [];
    fixture.componentInstance.conferir.subscribe(() => pedidos.push('conferir'));
    fixture.componentInstance.abrirItem.subscribe((id) => pedidos.push(`abrir ${id}`));
    fixture.componentRef.setInput('senhas', 3);
    await parte(fixture, 'Senhas vazadas');
    expect(el.textContent).toContain('3 senhas guardadas');
    botao(el, 'Conferir senhas vazadas').click();
    fixture.componentRef.setInput('conferidoEm', new Date());
    fixture.componentRef.setInput('vazadas', [{ id: 'i1', nome: 'Banco', vezes: 42 }]);
    await estabilizar(fixture);
    expect(el.textContent).toContain('42 vezes');
    botao(el, 'Abrir').click();
    expect(pedidos).toEqual(['conferir', 'abrir i1']);
    fixture.componentRef.setInput('vazadas', []);
    await estabilizar(fixture);
    expect(el.querySelector('.tudo-certo')!.textContent).toContain('Nenhuma senha apareceu');
  });

  it('tirar pede confirmação; o último aparelho não tem o botão', async () => {
    const { fixture, api, el } = await montar();
    botao(el, 'Tirar').click();
    await estabilizar(fixture);
    expect(el.textContent).toContain('Tirar Celular do cofre?');
    expect(api.pedidos).toEqual([]);
    botao(el, 'Tirar').click();
    // a passkey é pedida antes (aqui o aparelho não devolve nada), e nada vai ao servidor
    await ate(fixture, () => !!el.querySelector('.confirmar-de-novo .aviso'));
    expect(el.querySelector('.confirmar-de-novo')!.textContent).toContain('Para tirar Celular do cofre');
    expect(api.pedidos).toEqual([]);
    expect(botao(el, 'Tentar a passkey de novo')).toBeDefined();
    // a senha errada é conferida aqui, sem ir ao servidor
    await confirmarComSenha(fixture, 'errada');
    await ate(fixture, () => !!el.querySelector('.confirmar-de-novo .aviso')?.textContent?.includes('Não é a senha mestra'));
    expect(api.pedidos).toEqual([]);
    await confirmarComSenha(fixture, SENHA);
    await ate(fixture, () => api.pedidos.length === 1);
    expect(api.pedidos).toEqual(['tirar a1']);
    // a prova da senha (32 bytes em base64url) foi junto
    expect(api.confirmacoes).toEqual(['senha 43']);
    await estabilizar(fixture);
    expect(el.querySelector('.confirmar-de-novo')).toBeNull();
    expect(botao(el, 'Tirar')).toBeUndefined();
    expect(el.textContent).toContain('Só um aparelho');
  });

  it('trocar a senha: a atual errada não troca; a certa, com a nova forte, troca', async () => {
    const { fixture, api, avisos, el } = await montar();
    await parte(fixture, 'Senha mestra');
    digitar(el, '#g-atual', 'errada');
    botao(el, 'Sortear frase').click();
    await estabilizar(fixture);
    const nova = el.querySelector<HTMLInputElement>('#g-nova')!.value;
    digitar(el, '#g-confirmacao', nova);
    await estabilizar(fixture);
    botao(el, 'Trocar a senha').click();
    await ate(fixture, () => !!el.querySelector('.erro'));
    expect(el.querySelector('.erro')!.textContent).toContain('A senha atual não confere');
    expect(api.pedidos).toEqual([]);
    digitar(el, '#g-atual', SENHA);
    await estabilizar(fixture);
    botao(el, 'Trocar a senha').click();
    await ate(fixture, () => api.pedidos.includes('senha'));
    await ate(fixture, () => avisos.includes('Senha mestra trocada.'));
    // a senha atual, que já foi digitada, é a confirmação de agora: nenhum toque a mais
    expect(api.confirmacoes).toEqual(['senha 43']);
    expect(api.desafios).toBe(0);
  });

  it('um código novo mostra o kit, e terminar volta', async () => {
    const { fixture, api, el } = await montar();
    await parte(fixture, 'Recuperação');
    botao(el, 'Gerar um código novo').click();
    await estabilizar(fixture);
    botao(el, 'Gerar').click();
    await confirmarComSenha(fixture, SENHA);
    await ate(fixture, () => !!el.querySelector('.kit-codigo'));
    expect(api.pedidos).toEqual(['codigo']);
    expect(el.querySelector('h2')!.textContent).toContain('O código novo');
    el.querySelector<HTMLInputElement>('.guardei input')!.click();
    await estabilizar(fixture);
    botao(el, 'Terminar').click();
    await estabilizar(fixture);
    expect(el.querySelector('[role=tablist]')).not.toBeNull();
  });

  it('um aparelho sem PRF só entra no modo servidor com uma senha que sirva', async () => {
    const { fixture, api, el } = await montar();
    botao(el, 'Pôr um aparelho').click();
    await confirmarComSenha(fixture, SENHA);
    await ate(fixture, () => !!el.querySelector('#g-senha-servidor'));
    digitar(el, '#g-senha-servidor', 'senha123');
    await estabilizar(fixture);
    botao(el, 'Pôr no modo servidor').click();
    await estabilizar(fixture);
    expect(el.querySelector('.erro')!.textContent).toContain('frase sorteada');
    expect(api.postos).toEqual([]);
    // uma senha forte que não é a do cofre não serve: a conferida abre V com ela
    digitar(el, '#g-senha-servidor', sortearFrase());
    await estabilizar(fixture);
    botao(el, 'Pôr no modo servidor').click();
    await ate(fixture, () => !!el.querySelector('.erro')?.textContent?.includes('não é a senha mestra'));
    expect(api.postos).toEqual([]);
    digitar(el, '#g-senha-servidor', SENHA);
    await estabilizar(fixture);
    botao(el, 'Pôr no modo servidor').click();
    await ate(fixture, () => api.postos.length === 1);
    expect(api.postos).toEqual([{ apelido: 'PC', prf: false }]);
    // a senha do modo servidor é a confirmação que foi junto
    expect(api.confirmacoes).toEqual(['senha 43']);
  });

  it('trancar todos e apagar (só com APAGAR) terminam a sessão', async () => {
    const a = await montar();
    await parte(a.fixture, 'Abertos agora');
    botao(a.el, 'Trancar todos').click();
    await estabilizar(a.fixture);
    botao(a.el, 'Trancar todos').click();
    await estabilizar(a.fixture);
    expect(a.api.pedidos).toEqual(['trancar-todos']);
    expect(a.terminou).toHaveBeenCalled();
    TestBed.resetTestingModule();
    const b = await montar();
    await parte(b.fixture, 'Cuidado');
    expect(botao(b.el, 'Apagar o cofre').disabled).toBe(true);
    digitar(b.el, '#g-apagar-palavra', 'apagar');
    await estabilizar(b.fixture);
    expect(botao(b.el, 'Apagar o cofre').disabled).toBe(true);
    digitar(b.el, '#g-apagar-palavra', 'APAGAR');
    await estabilizar(b.fixture);
    botao(b.el, 'Apagar o cofre').click();
    await estabilizar(b.fixture);
    expect(b.api.pedidos).toEqual([]);
    // Cancelar fecha a confirmação sem apagar
    await ate(b.fixture, () => !!botao(b.el, 'Cancelar'));
    botao(b.el, 'Cancelar').click();
    await estabilizar(b.fixture);
    expect(b.el.querySelector('.confirmar-de-novo')).toBeNull();
    botao(b.el, 'Apagar o cofre').click();
    await confirmarComSenha(b.fixture, SENHA);
    await ate(b.fixture, () => b.api.pedidos.length === 1);
    expect(b.api.pedidos).toEqual(['apagar APAGAR']);
    expect(b.terminou).toHaveBeenCalled();
  });

  it('pela passkey: a assinatura sobre o desafio do servidor vai junto do pedido', async () => {
    let pedidas = 0;
    const comPasskey: Autenticador = { ...semPrf, pegar: async () => (pedidas++, assinada()) };
    const { fixture, api, el } = await montar({ autenticador: comPasskey });
    await parte(fixture, 'Recuperação');
    botao(el, 'Gerar um código novo').click();
    await estabilizar(fixture);
    botao(el, 'Gerar').click();
    await ate(fixture, () => !!el.querySelector('.kit-codigo'));
    expect(pedidas).toBe(1);
    expect(api.confirmacoes).toEqual(['passkey d1']);
  });

  it('aberto pelo código de recuperação, a confirmação começa pela senha mestra (o aparelho pode não ter passkey)', async () => {
    let pedidas = 0;
    const { fixture, api, el } = await montar({ recuperada: true, autenticador: { ...semPrf, pegar: async () => (pedidas++, null) } });
    await parte(fixture, 'Recuperação');
    botao(el, 'Gerar um código novo').click();
    await estabilizar(fixture);
    botao(el, 'Gerar').click();
    await estabilizar(fixture);
    expect(el.querySelector('#g-confirmar-senha')).not.toBeNull();
    expect(el.querySelector('.confirmar-de-novo')!.textContent).toContain('código de recuperação');
    expect(pedidas).toBe(0);
    expect(botao(el, 'Usar a passkey')).toBeDefined();
    await confirmarComSenha(fixture, SENHA);
    await ate(fixture, () => !!el.querySelector('.kit-codigo'));
    expect(api.confirmacoes).toEqual(['senha 43']);
  });

  it('a senha nova pode ser um PIN: só algarismos, o aviso antes, e o servidor fica sabendo que é PIN', async () => {
    const { fixture, api, avisos, el } = await montar();
    await parte(fixture, 'Senha mestra');
    digitar(el, '#g-atual', SENHA);
    botao(el, 'PIN').click();
    await estabilizar(fixture);
    const nova = el.querySelector<HTMLInputElement>('#g-nova')!;
    expect(nova.getAttribute('inputmode')).toBe('numeric');
    expect(botao(el, 'Sortear frase')).toBeUndefined();
    digitar(el, '#g-nova', '58a2-9 3');
    await estabilizar(fixture);
    expect(nova.value).toBe('58293');
    digitar(el, '#g-confirmacao', '58293');
    await estabilizar(fixture);
    expect(el.querySelector('.leitura')!.textContent).toContain('Não é tão segura');
    botao(el, 'Usar o PIN').click();
    await estabilizar(fixture);
    // o aviso no lugar do botão; nada foi ainda ao servidor
    expect(el.querySelector('cofre-aviso-senha-fraca')!.textContent).toContain('Um PIN não é tão seguro');
    expect(api.pedidos).toEqual([]);
    botao(el, 'Escolher outra').click();
    await estabilizar(fixture);
    expect(el.querySelector('cofre-aviso-senha-fraca')).toBeNull();
    botao(el, 'Usar o PIN').click();
    await estabilizar(fixture);
    el.querySelector('cofre-aviso-senha-fraca')!.querySelector<HTMLButtonElement>('.tinta')!.click();
    await ate(fixture, () => avisos.includes('PIN posto no lugar da senha mestra.'));
    expect(api.corposDaSenha.map((c) => (c as { pin: boolean }).pin)).toEqual([true]);
  });

  it('o PIN fácil demais (1234) e o curto não servem nem com o aviso', async () => {
    const { fixture, el } = await montar();
    await parte(fixture, 'Senha mestra');
    digitar(el, '#g-atual', SENHA);
    botao(el, 'PIN').click();
    await estabilizar(fixture);
    for (const [pin, palavra] of [['1234', 'Fácil demais'], ['1990', 'Fácil demais'], ['583', 'Curta demais']]) {
      digitar(el, '#g-nova', pin!);
      digitar(el, '#g-confirmacao', pin!);
      await estabilizar(fixture);
      expect(el.querySelector('.leitura')!.textContent).withContext(pin!).toContain(palavra!);
      expect(botao(el, 'Usar o PIN').disabled).withContext(pin!).toBe(true);
    }
  });

  it('com um aparelho no modo servidor, o PIN não serve', async () => {
    const { fixture, el } = await montar({ modoServidor: true });
    await parte(fixture, 'Senha mestra');
    digitar(el, '#g-atual', SENHA);
    botao(el, 'PIN').click();
    await estabilizar(fixture);
    digitar(el, '#g-nova', '58293');
    digitar(el, '#g-confirmacao', '58293');
    await estabilizar(fixture);
    expect(el.textContent).toContain('um PIN não serve');
    expect(botao(el, 'Usar o PIN').disabled).toBe(true);
  });

  it('a carência: a lista com este aparelho marcado; encerrar a daqui a tira do aparelho também', async () => {
    const armario = armarioComCarencia();
    const { fixture, api, el } = await montar({ armario });
    await parte(fixture, 'Carência');
    expect(el.querySelector<HTMLElement>('[role=switch]')!.getAttribute('aria-checked')).toBe('true');
    const linhas = [...el.querySelectorAll('.linha')].filter((l) => l.textContent!.includes('Até '));
    expect(linhas.map((l) => l.querySelector('.linha-titulo')!.textContent!.trim())).toEqual(['Chrome no Windows Este', 'Safari no iPhone']);
    linhas[1]!.querySelector<HTMLButtonElement>('button')!.click();
    await ate(fixture, () => api.pedidos.includes('encerrar 7c1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b71'));
    expect(lerCarencia(armario)).not.toBeNull();
    botao(el, 'Encerrar').click();
    await ate(fixture, () => api.pedidos.includes(`encerrar ${CARENCIA_DAQUI}`));
    expect(lerCarencia(armario)).toBeNull();
  });

  it('desligar a carência vale na hora; ligar pede a confirmação de agora', async () => {
    const armario = armarioComCarencia();
    const { fixture, api, el } = await montar({ armario });
    await parte(fixture, 'Carência');
    el.querySelector<HTMLButtonElement>('[role=switch]')!.click();
    await ate(fixture, () => api.pedidos.includes('carencia false'));
    await estabilizar(fixture);
    expect(lerCarencia(armario)).toBeNull();
    expect(el.querySelector<HTMLElement>('[role=switch]')!.getAttribute('aria-checked')).toBe('false');
    expect(el.textContent).toContain('Desligada');
    el.querySelector<HTMLButtonElement>('[role=switch]')!.click();
    await estabilizar(fixture);
    expect(el.querySelector('.confirmar-de-novo')!.textContent).toContain('ligar a carência');
    await confirmarComSenha(fixture, SENHA);
    await ate(fixture, () => api.pedidos.includes('carencia true'));
    expect(api.confirmacoes).toEqual(['senha 43']);
  });

  it('apagar o cofre tira a carência deste aparelho', async () => {
    const armario = armarioComCarencia();
    const { fixture, api, el } = await montar({ armario });
    await parte(fixture, 'Cuidado');
    digitar(el, '#g-apagar-palavra', 'APAGAR');
    await estabilizar(fixture);
    botao(el, 'Apagar o cofre').click();
    await confirmarComSenha(fixture, SENHA);
    await ate(fixture, () => api.pedidos.includes('apagar APAGAR'));
    expect(lerCarencia(armario)).toBeNull();
  });

  it('trancar todos tira a carência deste aparelho', async () => {
    const armario = armarioComCarencia();
    const { fixture, api, el } = await montar({ armario });
    await parte(fixture, 'Abertos agora');
    botao(el, 'Trancar todos').click();
    await estabilizar(fixture);
    [...el.querySelectorAll<HTMLButtonElement>('.confirma button')].find((b) => b.textContent!.includes('Trancar todos'))!.click();
    await ate(fixture, () => api.pedidos.includes('trancar-todos'));
    expect(lerCarencia(armario)).toBeNull();
  });

  it('trocar de parte fecha a confirmação aberta', async () => {
    const { fixture, el } = await montar({ recuperada: true });
    botao(el, 'Tirar').click();
    await estabilizar(fixture);
    botao(el, 'Tirar').click();
    await estabilizar(fixture);
    expect(el.querySelector('.confirmar-de-novo')).not.toBeNull();
    await parte(fixture, 'Recuperação');
    await parte(fixture, 'Aparelhos');
    expect(el.querySelector('.confirmar-de-novo')).toBeNull();
  });

  it('desistir enquanto a passkey confirma (outra parte dos Ajustes): a confirmação que volta depois não tira o aparelho', async () => {
    let soltar: (c: Credential) => void = () => undefined;
    let pedidas = 0;
    const devagar: Autenticador = { ...semPrf, pegar: () => (pedidas++, new Promise<Credential>((ok) => (soltar = ok))) };
    const { fixture, api, el } = await montar({ autenticador: devagar });
    botao(el, 'Tirar').click();
    await estabilizar(fixture);
    botao(el, 'Tirar').click();
    await ate(fixture, () => pedidas === 1);
    // a pessoa vai para outra parte enquanto o aparelho ainda pede a digital
    await parte(fixture, 'Recuperação');
    soltar(assinada());
    await estabilizar(fixture, 10);
    expect(api.pedidos).toEqual([]);
    expect(api.lista.length).toBe(2);
  });
});
