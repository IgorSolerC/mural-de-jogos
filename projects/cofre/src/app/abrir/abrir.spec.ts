import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CofreAberto } from '../../core/abrir';
import { type Abertura, ApiCofre, type ChaveDoAparelho, type DesafioDeAbrir, type Entrada, ErroApi } from '../../core/api';
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
  return { sal, v, prf, envelopeId, envelope, manifesto };
}

class ApiDeAbrir extends ApiCofre {
  senhaErrada = false;
  congelou = 0;
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
    };
  }
  override async chave(): Promise<ChaveDoAparelho> {
    return { envelope: { id: this.c.envelopeId, dados: paraBase64url(this.c.envelope) }, tipo: 'prf' };
  }
  override async congelar(): Promise<{ readonly congeladoAte: string }> {
    this.congelou++;
    return { congeladoAte: '2026-10-23T18:00:00.000Z' };
  }
  override async abrir(): Promise<Abertura> {
    if (this.senhaErrada) throw new ErroApi(401, 'senha-errada', 'Senha errada.');
    return { token: 'b'.repeat(43), expiraEm: '', paradaMaxima: 600, v: paraBase64url(this.c.v), manifesto: paraBase64url(this.c.manifesto), contador: 0, recuperada: false };
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

async function montar(senhaErrada = false, congeladoAte: string | null = null) {
  const c = await cofreDeTeste();
  const api = new ApiDeAbrir(c);
  api.senhaErrada = senhaErrada;
  const pagina = { agente: 'Chrome no Windows' } as Pagina;
  const servicos: Servicos = { api, autenticador: autenticador(c.prf), rpId: 'cofre.teste', pagina, terminar: () => undefined };
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SERVICOS, useValue: servicos }] });
  const fixture = TestBed.createComponent(Abrir);
  fixture.componentRef.setInput('entrada', ENTRADA);
  fixture.componentRef.setInput('congeladoAte', congeladoAte);
  const saidas: number[] = [];
  fixture.componentInstance.sair.subscribe(() => saidas.push(1));
  const abertos: CofreAberto[] = [];
  fixture.componentInstance.aberto.subscribe((x) => abertos.push(x));
  await fixture.whenStable();
  return { fixture, abertos, saidas, api, el: fixture.nativeElement as HTMLElement };
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
