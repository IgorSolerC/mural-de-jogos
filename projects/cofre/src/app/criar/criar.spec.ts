import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiCofre, type CofreCriado, type DesafioDeRegistro, type Entrada, ErroApi } from '../../core/api';
import { aleatorios, paraBase64url } from '../../core/bytes';
import type { CorpoDeCriar } from '../../core/criar';
import type { Autenticador } from '../../core/passkey';
import { type Pagina, SERVICOS, type Servicos } from '../servicos';
import { Criar } from './criar';

const ENTRADA: Entrada = { token: 'a'.repeat(43), expiraEm: '2026-10-21T15:05:00.000Z', usuario: '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', codigo: 'K7QFM2XA' };

/** A API de mentira: anota o corpo do criar e responde o que o teste mandar. */
class ApiDeTeste extends ApiCofre {
  corpos: CorpoDeCriar[] = [];
  falha: ErroApi | null = null;
  override async desafioDeRegistro(): Promise<DesafioDeRegistro> {
    if (this.falha?.status === 401) throw this.falha;
    return {
      desafio: crypto.randomUUID(),
      publicKey: {
        challenge: paraBase64url(aleatorios(32)),
        rp: { id: 'cofre.teste', name: 'Murall Cofre' },
        user: { id: paraBase64url(aleatorios(16)), name: 'Cofre do Murall (K7QF-M2XA)', displayName: 'Cofre do Murall (K7QF-M2XA)' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      },
    };
  }
  override async criarCofre(corpo: unknown): Promise<CofreCriado> {
    if (this.falha) throw this.falha;
    this.corpos.push(corpo as CorpoDeCriar);
    return { criado: true, aparelhos: [] };
  }
}

/** Passkeys de mentira: `prf` diz, a cada registro, se o aparelho dá o segredo do PRF. */
function autenticador(prf: boolean[]): Autenticador {
  let n = 0;
  return {
    criar: async () => {
      const comPrf = prf[n++] ?? false;
      return {
        type: 'public-key',
        rawId: aleatorios(32).buffer,
        response: { clientDataJSON: aleatorios(8).buffer, attestationObject: aleatorios(8).buffer, getTransports: () => ['internal'] },
        getClientExtensionResults: () => ({ prf: comPrf ? { enabled: true, results: { first: aleatorios(32).buffer } } : { enabled: false } }),
      } as unknown as Credential;
    },
    pegar: async () => null,
  };
}

async function montar(prf: boolean[]) {
  const api = new ApiDeTeste();
  const terminou = jasmine.createSpy('terminar');
  const pagina: Pagina = {
    seguro: true,
    isolado: true,
    origem: 'https://cofre.teste',
    caminho: '/',
    busca: '',
    agente: 'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0',
    trabalhadores: undefined,
    guarda: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    limparUrl: () => undefined,
    irPara: () => undefined,
  };
  const servicos: Servicos = { api, autenticador: autenticador(prf), rpId: 'cofre.teste', pagina, terminar: terminou };
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SERVICOS, useValue: servicos }] });
  const fixture = TestBed.createComponent(Criar);
  fixture.componentRef.setInput('entrada', ENTRADA);
  await fixture.whenStable();
  return { fixture, api, terminou, el: fixture.nativeElement as HTMLElement };
}

/** Espera o Angular e as promessas (o Argon2id de verdade leva um tempo). */
async function ate(fixture: ComponentFixture<Criar>, condicao: () => boolean, ms = 15000): Promise<void> {
  const fim = Date.now() + ms;
  while (!condicao()) {
    if (Date.now() > fim) throw new Error('a tela não chegou lá');
    await new Promise((ok) => setTimeout(ok, 20));
    await fixture.whenStable();
  }
}

function botao(el: HTMLElement, texto: string | RegExp): HTMLButtonElement {
  const achado = [...el.querySelectorAll('button')].find((b) => (typeof texto === 'string' ? b.textContent!.trim() === texto : texto.test(b.textContent!)));
  if (!achado) throw new Error(`sem o botão ${texto}`);
  return achado;
}

function digitar(input: HTMLInputElement, valor: string): void {
  input.value = valor;
  input.dispatchEvent(new Event('input'));
}

async function usarFraseSorteada(fixture: ComponentFixture<Criar>, el: HTMLElement): Promise<string> {
  const frase = el.querySelector('.frase')!.textContent!.replace(/\s+/g, '');
  digitar(el.querySelector<HTMLInputElement>('#senha-frase')!, frase);
  await fixture.whenStable();
  botao(el, 'Continuar').click();
  await fixture.whenStable();
  return frase;
}

describe('as telas de criar o cofre', () => {
  afterEach(() => document.body.classList.remove('imprimir-kit'));

  it('do começo ao fim: a frase sorteada, um aparelho com PRF e o kit com o código', async () => {
    const { fixture, api, terminou, el } = await montar([true]);
    expect(el.querySelector('[aria-current="step"]')!.textContent).toContain('Senha');
    expect(botao(el, 'Continuar').disabled).toBe(true);
    const frase = await usarFraseSorteada(fixture, el);
    expect(frase.split('-').length).toBe(6);

    expect(el.querySelector('[aria-current="step"]')!.textContent).toContain('Aparelhos');
    expect(botao(el, 'Criar o cofre').disabled).toBe(true);
    botao(el, /primeiro aparelho/).click();
    await ate(fixture, () => !!el.querySelector('.etiqueta'));
    expect(el.querySelector('.etiqueta')!.textContent).toContain('Com PRF');
    expect(el.textContent).toContain('Dá para criar com um aparelho só');

    botao(el, 'Criar o cofre').click();
    await ate(fixture, () => !!el.querySelector('.kit-codigo'));
    const corpo = api.corpos[0]!;
    expect(corpo.aparelhos.length).toBe(1);
    expect(corpo.aparelhos[0]!.prf).toBe(true);
    expect(corpo.aparelhos[0]!.apelido).toBe('PC');
    const grupos = [...el.querySelectorAll('.kit-codigo span')].map((s) => s.textContent);
    expect(grupos.length).toBe(7);
    expect(el.querySelector('.kit-meta')!.textContent).toContain('K7QF-M2XA');
    // só o kit pode ir para a impressora, e só enquanto ele está na tela
    expect(document.body.classList.contains('imprimir-kit')).toBe(true);

    const terminar = botao(el, 'Terminar');
    expect(terminar.disabled).toBe(true);
    el.querySelector<HTMLInputElement>('.guardei input')!.click();
    await fixture.whenStable();
    terminar.click();
    expect(terminou).toHaveBeenCalled();
    fixture.destroy();
    expect(document.body.classList.contains('imprimir-kit')).toBe(false);
  });

  it('com um aparelho no modo servidor, uma senha só "boa" não cria: pede a frase ou uma mais forte', async () => {
    const { fixture, api, el } = await montar([false]);
    botao(el, 'Escrever a minha').click();
    await fixture.whenStable();
    digitar(el.querySelector<HTMLInputElement>('#senha-propria')!, 'Xk9#mQ2$vL7!pR4@');
    digitar(el.querySelector<HTMLInputElement>('#senha-confirmacao')!, 'Xk9#mQ2$vL7!pR4@');
    await fixture.whenStable();
    expect(el.textContent).toContain('vamos pedir uma de pelo menos 78 bits');
    botao(el, 'Continuar').click();
    await fixture.whenStable();

    botao(el, /primeiro aparelho/).click();
    await ate(fixture, () => !!el.querySelector('.etiqueta'));
    expect(el.querySelector('.etiqueta')!.textContent).toContain('Modo servidor');
    expect(el.textContent).toContain('a senha mestra precisa ser a frase sorteada ou ter pelo menos 78 bits');
    expect(botao(el, 'Criar o cofre').disabled).toBe(true);
    botao(el, /Trocar a senha/).click();
    await fixture.whenStable();
    expect(el.querySelector('#senha-frase')).not.toBeNull();
    expect(api.corpos).toEqual([]);
  });

  it('uma senha fraca não segue, e as duas têm de ser iguais', async () => {
    const { fixture, el } = await montar([true]);
    botao(el, 'Escrever a minha').click();
    await fixture.whenStable();
    digitar(el.querySelector<HTMLInputElement>('#senha-propria')!, 'senha123');
    digitar(el.querySelector<HTMLInputElement>('#senha-confirmacao')!, 'senha123');
    await fixture.whenStable();
    expect(el.querySelector('.leitura')!.textContent).toContain('Fraca');
    expect(botao(el, 'Continuar').disabled).toBe(true);
    digitar(el.querySelector<HTMLInputElement>('#senha-propria')!, 'gato-azul-pedra-chuva-livro-mesa-porta');
    await fixture.whenStable();
    expect(el.textContent).toContain('As duas não são iguais');
    expect(botao(el, 'Continuar').disabled).toBe(true);
  });

  it('se a API recusar, os aparelhos recomeçam do zero (o segredo do PRF já foi zerado)', async () => {
    const { fixture, api, el } = await montar([true, true]);
    await usarFraseSorteada(fixture, el);
    botao(el, /primeiro aparelho/).click();
    await ate(fixture, () => el.querySelectorAll('.etiqueta').length === 1);
    api.falha = new ErroApi(400, 'desafio-invalido', 'O desafio venceu.');
    botao(el, 'Criar o cofre').click();
    await ate(fixture, () => !!el.querySelector('.erro'));
    expect(el.querySelector('.erro')!.textContent).toContain('O desafio venceu. Registre os aparelhos de novo.');
    expect(el.querySelectorAll('.aparelho').length).toBe(0);
    expect(botao(el, /primeiro aparelho/)).toBeTruthy();
  });

  it('a entrada que acaba no meio (20 minutos): pede para entrar de novo', async () => {
    const { fixture, api, terminou, el } = await montar([true]);
    await usarFraseSorteada(fixture, el);
    api.falha = new ErroApi(401, 'sessao-invalida', 'Sua sessão acabou. Entre de novo.');
    botao(el, /primeiro aparelho/).click();
    await ate(fixture, () => !!el.querySelector('.erro'));
    expect(el.querySelector('.erro')!.textContent).toContain('A entrada acabou');
    botao(el, 'Entrar de novo').click();
    expect(terminou).toHaveBeenCalled();
  });

  it('a frase sorteada: sortear outra limpa o que foi digitado', async () => {
    const { fixture, el } = await montar([true]);
    const antes = el.querySelector('.frase')!.textContent;
    digitar(el.querySelector<HTMLInputElement>('#senha-frase')!, 'qualquer-coisa');
    await fixture.whenStable();
    expect(el.textContent).toContain('Ainda não é igual');
    botao(el, /Sortear outra/).click();
    await fixture.whenStable();
    expect(el.querySelector('.frase')!.textContent).not.toBe(antes);
    expect(el.querySelector<HTMLInputElement>('#senha-frase')!.value).toBe('');
  });
});
