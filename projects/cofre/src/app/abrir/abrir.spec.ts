import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CofreAberto } from '../../core/abrir';
import { type Abertura, ApiCofre, type ChaveDoAparelho, type CorpoDaCarencia, type DesafioDeAbrir, type Entrada, type EntradaPelaCarencia, ErroApi } from '../../core/api';
import { type Carencia, guardarCarencia, lerCarencia, prepararCarencia } from '../../core/carencia';
import type { Guarda } from '../../core/entrar';
import { paraBase64url } from '../../core/bytes';
import { chaveDaSenha, cifrarManifesto, criarCofre, KDF_PADRAO, novaChaveDoMeio, novoId, novoSal, selarEnvelope } from '../../core/crypto';
import type { Autenticador } from '../../core/passkey';
import { type Pagina, SERVICOS, type Servicos } from '../servicos';
import { Abrir } from './abrir';

const USUARIO = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';
const ENTRADA: Entrada = { token: 'a'.repeat(43), expiraEm: '', usuario: USUARIO, codigo: 'K7QFM2XA' };
const SENHA = 'cavalo-ponte-relogio-nuvem-pipoca-trevo';
const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);

/** Um cofre de verdade (cripto real) servido por uma API de mentira: o envelope do celular com PRF. */
async function cofreDeTeste() {
  const sal = novoSal();
  const kSenha = await chaveDaSenha(SENHA, sal, KDF_PADRAO);
  const m = novaChaveDoMeio();
  const { v, chave } = await criarCofre(kSenha, m, USUARIO);
  const prf = seq(32, 100);
  const envelopeId = novoId();
  const envelope = await selarEnvelope(prf, USUARIO, envelopeId, m);
  const manifesto = await cifrarManifesto(chave, USUARIO, { contador: 0, itens: {}, lixeira: {}, mudadoEm: '2026-10-21T14:32:00.000Z', aparelho: 'Celular' });
  return { sal, v, prf, envelopeId, envelope, manifesto, m: m.slice() };
}

/** Um armário de mentira (o localStorage do aparelho). */
function armario(): Guarda & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>();
  return { mapa, getItem: (c) => mapa.get(c) ?? null, setItem: (c, v) => void mapa.set(c, v), removeItem: (c) => void mapa.delete(c) };
}

class ApiDeAbrir extends ApiCofre {
  senhaErrada = false;
  congelou = 0;
  /** A carência dos aparelhos, como o desafio diz (undefined: a API de antes, que não diz). */
  carenciaLigada: boolean | undefined = undefined;
  /** As carências que vieram junto da prova da senha. */
  carenciasRecebidas: (CorpoDaCarencia | undefined)[] = [];
  /** Pela carência: o envelope que o servidor devolve, ou o erro dele. */
  entradaPelaCarencia: EntradaPelaCarencia | ErroApi | null = null;
  esquecidas: string[] = [];
  constructor(private readonly c: Awaited<ReturnType<typeof cofreDeTeste>>) {
    super();
  }
  override async desafioDeAbrir(): Promise<DesafioDeAbrir> {
    return {
      desafio: 'd1',
      publicKey: { challenge: paraBase64url(seq(32, 1)), rpId: 'cofre.teste', allowCredentials: [{ type: 'public-key', id: paraBase64url(seq(16, 9)) }] },
      versao: 1,
      kdf: KDF_PADRAO,
      sal: paraBase64url(this.c.sal),
      aparelhos: [],
      mudadoEm: '',
      ...(this.carenciaLigada === undefined ? {} : { carencia: this.carenciaLigada }),
    };
  }
  override async entrarPelaCarencia(): Promise<EntradaPelaCarencia> {
    const r = this.entradaPelaCarencia;
    if (!r || r instanceof ErroApi) throw r ?? new Error('sem entrada');
    return r;
  }
  override async esquecerCarencia(token: string): Promise<{ esquecida: true }> {
    this.esquecidas.push(token);
    return { esquecida: true };
  }
  override async chave(): Promise<ChaveDoAparelho> {
    return { envelope: { id: this.c.envelopeId, dados: paraBase64url(this.c.envelope) }, tipo: 'prf' };
  }
  override async congelar(): Promise<{ readonly congeladoAte: string }> {
    this.congelou++;
    return { congeladoAte: '2026-10-23T18:00:00.000Z' };
  }
  override async abrir(_kAuth: string, carencia?: CorpoDaCarencia): Promise<Abertura> {
    this.carenciasRecebidas.push(carencia);
    if (this.senhaErrada) throw new ErroApi(401, 'senha-errada', 'Senha errada.');
    return {
      token: 'b'.repeat(43),
      expiraEm: '',
      paradaMaxima: 600,
      v: paraBase64url(this.c.v),
      manifesto: paraBase64url(this.c.manifesto),
      contador: 0,
      recuperada: false,
      carencia: carencia ? { id: carencia.id, expiraEm: '2999-10-30T12:00:00.000Z' } : null,
    };
  }
}

function autenticador(prf: Uint8Array): Autenticador {
  return {
    criar: async () => null,
    pegar: async () =>
      ({
        type: 'public-key',
        rawId: seq(16, 9).buffer,
        response: { clientDataJSON: seq(4, 1).buffer, authenticatorData: seq(4, 2).buffer, signature: seq(4, 3).buffer, userHandle: null },
        getClientExtensionResults: () => ({ prf: { results: { first: prf.slice().buffer } } }),
      }) as unknown as Credential,
  };
}

async function montar(senhaErrada = false, congeladoAte: string | null = null, opcoes: { armario?: Guarda; carenciaLigada?: boolean; carencia?: (c: Awaited<ReturnType<typeof cofreDeTeste>>) => Promise<Carencia> } = {}) {
  const c = await cofreDeTeste();
  const api = new ApiDeAbrir(c);
  api.senhaErrada = senhaErrada;
  api.carenciaLigada = opcoes.carenciaLigada;
  const pagina = { agente: 'Chrome no Windows', armario: opcoes.armario } as Pagina;
  const servicos: Servicos = { api, autenticador: autenticador(c.prf), rpId: 'cofre.teste', pagina, terminar: () => undefined };
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SERVICOS, useValue: servicos }] });
  const fixture = TestBed.createComponent(Abrir);
  const carencia = opcoes.carencia ? await opcoes.carencia(c) : null;
  if (carencia) fixture.componentRef.setInput('carencia', carencia);
  else fixture.componentRef.setInput('entrada', ENTRADA);
  fixture.componentRef.setInput('congeladoAte', congeladoAte);
  const saidas: number[] = [];
  fixture.componentInstance.sair.subscribe(() => saidas.push(1));
  const abertos: CofreAberto[] = [];
  fixture.componentInstance.aberto.subscribe((x) => abertos.push(x));
  const semCarencia: (string | null)[] = [];
  fixture.componentInstance.semCarencia.subscribe((x) => semCarencia.push(x));
  const google: number[] = [];
  fixture.componentInstance.google.subscribe(() => google.push(1));
  await fixture.whenStable();
  return { fixture, abertos, saidas, semCarencia, google, api, c, el: fixture.nativeElement as HTMLElement };
}

async function ate(fixture: ComponentFixture<Abrir>, condicao: () => boolean): Promise<void> {
  const fim = Date.now() + 15000;
  while (!condicao()) {
    if (Date.now() > fim) throw new Error('não chegou lá');
    await new Promise((ok) => setTimeout(ok, 20));
    await fixture.whenStable();
  }
}

function digitar(el: HTMLElement, seletor: string, valor: string): void {
  const input = el.querySelector<HTMLInputElement>(seletor)!;
  input.value = valor;
  input.dispatchEvent(new Event('input'));
}

const botao = (el: HTMLElement, texto: string) => [...el.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto) as HTMLButtonElement;

describe('a tela de abrir', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('com a senha e a passkey (PRF), abre e entrega o cofre aberto, e o campo da senha fica vazio', async () => {
    const { fixture, abertos, el } = await montar();
    expect(botao(el, 'Abrir').disabled).toBe(true);
    digitar(el, '#abrir-senha', SENHA);
    await fixture.whenStable();
    botao(el, 'Abrir').click();
    await ate(fixture, () => abertos.length === 1);
    expect(abertos[0]!.manifesto.aparelho).toBe('Celular');
    expect(abertos[0]!.aparelho).toBe('PC');
    expect(el.querySelector<HTMLInputElement>('#abrir-senha')!.value).toBe('');
  });

  it('a senha errada: diz que cada tentativa pede a passkey de novo', async () => {
    const { fixture, abertos, el } = await montar(true);
    digitar(el, '#abrir-senha', 'outra');
    await fixture.whenStable();
    botao(el, 'Abrir').click();
    await ate(fixture, () => !!el.querySelector('.erro'));
    expect(el.querySelector('.erro')!.textContent).toContain('Senha errada');
    expect(abertos).toEqual([]);
  });

  it('pelo código: o campo do código aparece e só deixa abrir com os 28 caracteres', async () => {
    const { fixture, el } = await montar();
    botao(el, 'Usar o código de recuperação').click();
    await fixture.whenStable();
    digitar(el, '#abrir-senha', SENHA);
    digitar(el, '#abrir-codigo', 'ABCD-EFGH');
    await fixture.whenStable();
    expect(botao(el, 'Abrir').disabled).toBe(true);
    digitar(el, '#abrir-codigo', 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345');
    await fixture.whenStable();
    expect(botao(el, 'Abrir').disabled).toBe(false);
    expect(botao(el, 'Usar a passkey')).toBeTruthy();
  });

  describe('a carência do aparelho (17.23)', () => {
    /** A carência guardada no aparelho, com M selada como o servidor guardou; a API devolve o envelope dela. */
    const comCarencia =
      (a: Guarda, pin = false) =>
      async (c: Awaited<ReturnType<typeof cofreDeTeste>>): Promise<Carencia> => {
        const nova = await prepararCarencia(c.m, USUARIO, 'K7QFM2XA', null);
        const guardada = nova.guardavel('2999-10-30T12:00:00.000Z', pin);
        guardarCarencia(a, guardada);
        cofreDaCarencia.set(guardada.id, nova.corpo.envelope);
        return guardada;
      };
    const cofreDaCarencia = new Map<string, string>();
    const entradaDe = (carencia: Carencia, c: Awaited<ReturnType<typeof cofreDeTeste>>): EntradaPelaCarencia => ({
      token: 'e'.repeat(43),
      expiraEm: '',
      usuario: USUARIO,
      codigo: 'K7QFM2XA',
      envelope: { id: carencia.id, dados: cofreDaCarencia.get(carencia.id)! },
      versao: 1,
      kdf: KDF_PADRAO,
      sal: paraBase64url(c.sal),
      mudadoEm: '',
      pin: carencia.pin,
    });

    it('abrindo com a passkey e a carência ligada, a deste aparelho vai junto da senha e fica guardada', async () => {
      const a = armario();
      const { fixture, abertos, api, el } = await montar(false, null, { armario: a, carenciaLigada: true });
      digitar(el, '#abrir-senha', SENHA);
      await fixture.whenStable();
      botao(el, 'Abrir').click();
      await ate(fixture, () => abertos.length === 1);
      const enviada = api.carenciasRecebidas[0]!;
      expect(enviada.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(lerCarencia(a)).toEqual(jasmine.objectContaining({ id: enviada.id, token: enviada.token, usuario: USUARIO, codigo: 'K7QFM2XA', pin: false }));
    });

    it('a carência de outra conta guardada aqui não vira a anterior desta: sai daqui e do servidor', async () => {
      const a = armario();
      const outra: Carencia = { id: '7c1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b79', token: 'O'.repeat(43), chave: 'A'.repeat(43), usuario: '1b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', codigo: 'ABCD1234', expiraEm: '2999-10-30T12:00:00.000Z', pin: false };
      guardarCarencia(a, outra);
      const { fixture, abertos, api, el } = await montar(false, null, { armario: a, carenciaLigada: true });
      digitar(el, '#abrir-senha', SENHA);
      await fixture.whenStable();
      botao(el, 'Abrir').click();
      await ate(fixture, () => abertos.length === 1);
      expect(api.esquecidas).toEqual([outra.token]);
      expect(api.carenciasRecebidas[0]!.anterior).toBeUndefined();
      expect(lerCarencia(a)!.usuario).toBe(USUARIO);
    });

    it('desligada (ou a API de antes), nada vai e nada fica; o que sobrou aqui sai', async () => {
      const a = armario();
      a.mapa.set('cofre:carencia', 'sobra');
      const { fixture, abertos, api, el } = await montar(false, null, { armario: a, carenciaLigada: false });
      digitar(el, '#abrir-senha', SENHA);
      await fixture.whenStable();
      botao(el, 'Abrir').click();
      await ate(fixture, () => abertos.length === 1);
      expect(api.carenciasRecebidas).toEqual([undefined]);
      expect(a.mapa.size).toBe(0);
    });

    it('com a carência, só a senha: sem passkey, sem código, sem congelar; abre e entrega o cofre', async () => {
      const a = armario();
      const { fixture, abertos, api, c, el } = await montar(false, null, { armario: a, carencia: comCarencia(a) });
      expect(el.textContent).toContain('só a senha mestra abre o cofre aqui');
      expect(botao(el, 'Usar o código de recuperação')).toBeUndefined();
      expect(botao(el, 'Suspeita de algo? Congelar o cofre')).toBeUndefined();
      api.entradaPelaCarencia = entradaDe(lerCarencia(a)!, c);
      digitar(el, '#abrir-senha', SENHA);
      await fixture.whenStable();
      botao(el, 'Abrir').click();
      await ate(fixture, () => abertos.length === 1);
      expect(api.carenciasRecebidas).toEqual([undefined]);
      expect(abertos[0]!.manifesto.aparelho).toBe('Celular');
    });

    it('com o PIN, o campo pede o teclado de números', async () => {
      const a = armario();
      const { el } = await montar(false, null, { armario: a, carencia: comCarencia(a, true) });
      expect(el.querySelector('label[for=abrir-senha]')!.textContent).toBe('PIN');
      expect(el.querySelector('#abrir-senha')!.getAttribute('inputmode')).toBe('numeric');
    });

    it('a carência que acabou no servidor sai daqui, e a tela volta para a porta com o porquê', async () => {
      const a = armario();
      const { fixture, api, semCarencia, el } = await montar(false, null, { armario: a, carencia: comCarencia(a) });
      api.entradaPelaCarencia = new ErroApi(401, 'carencia-invalida', 'A carência deste aparelho acabou. Entre com o Google e a passkey.');
      digitar(el, '#abrir-senha', SENHA);
      await fixture.whenStable();
      botao(el, 'Abrir').click();
      await ate(fixture, () => semCarencia.length === 1);
      expect(semCarencia[0]).toContain('A carência deste aparelho acabou');
      expect(a.mapa.size).toBe(0);
    });

    it('o 3º erro pela carência: a tela avisa e a esquece; os de antes só dizem senha errada', async () => {
      const a = armario();
      const { fixture, api, semCarencia, el } = await montar(false, null, { armario: a, carencia: comCarencia(a) });
      api.entradaPelaCarencia = new ErroApi(401, 'senha-errada', 'A senha não confere.');
      digitar(el, '#abrir-senha', 'outra');
      await fixture.whenStable();
      botao(el, 'Abrir').click();
      await ate(fixture, () => !!el.querySelector('.erro'));
      expect(el.querySelector('.erro')!.textContent).toBe('Senha errada.');
      expect(a.mapa.size).toBe(1);
      api.entradaPelaCarencia = new ErroApi(401, 'senha-errada', 'A senha não confere. Este aparelho volta a pedir o Google e a passkey.');
      botao(el, 'Abrir').click();
      await ate(fixture, () => semCarencia.length === 1);
      expect(semCarencia[0]).toBe('Senha errada. Este aparelho volta a pedir o Google e a passkey.');
      expect(a.mapa.size).toBe(0);
    });

    it('esquecer este aparelho pede confirmação e tira a carência daqui e do servidor', async () => {
      const a = armario();
      const { fixture, api, semCarencia, google, el } = await montar(false, null, { armario: a, carencia: comCarencia(a) });
      const token = lerCarencia(a)!.token;
      botao(el, 'Entrar com o Google e a passkey').click();
      expect(google.length).toBe(1);
      botao(el, 'Não é o seu aparelho? Esquecer este aparelho').click();
      await fixture.whenStable();
      expect(el.querySelector('.freio')!.textContent).toContain('volta a pedir o Google e a passkey');
      botao(el, 'Esquecer este aparelho').click();
      await ate(fixture, () => semCarencia.length === 1);
      expect(semCarencia).toEqual([null]);
      expect(api.esquecidas).toEqual([token]);
      expect(a.mapa.size).toBe(0);
    });
  });

  it('congelado: mostra até quando, sem campo de senha, e só o Sair', async () => {
    const { el, saidas } = await montar(false, '2026-10-23T18:00:00.000Z');
    expect(el.querySelector('.carimbo')!.textContent).toContain('Congelado');
    expect(el.querySelector('.ate')!.textContent).toContain('23 de outubro');
    expect(el.querySelector('#abrir-senha')).toBeNull();
    expect(el.querySelector('.ficha')!.classList).toContain('gelo');
    botao(el, 'Sair').click();
    expect(saidas.length).toBe(1);
  });

  it('congelar pede confirmação; confirmado, o servidor congela e a tela mostra até quando', async () => {
    const { fixture, el, api } = await montar();
    botao(el, 'Suspeita de algo? Congelar o cofre').click();
    await fixture.whenStable();
    expect(el.querySelector('.freio')!.textContent).toContain('Não dá para desfazer');
    botao(el, 'Não').click();
    await fixture.whenStable();
    expect(api.congelou).toBe(0);
    digitar(el, '#abrir-senha', SENHA);
    botao(el, 'Suspeita de algo? Congelar o cofre').click();
    await fixture.whenStable();
    botao(el, 'Congelar por 24 horas').click();
    await ate(fixture, () => !!el.querySelector('.carimbo'));
    expect(api.congelou).toBe(1);
    expect(el.querySelector('.ate')!.textContent).toContain('23 de outubro');
    expect(el.querySelector('#abrir-senha')).toBeNull();
  });
});
