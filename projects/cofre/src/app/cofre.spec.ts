import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiCofre, type Entrada, type EstadoDoCofre, ErroApi, type StatusDaApi } from '../core/api';
import { type Guarda, urlDoLogin } from '../core/entrar';
import { Cofre } from './cofre';
import { type Pagina, SERVICOS, type Servicos } from './servicos';

const ENTRADA: Entrada = { token: 'a'.repeat(43), expiraEm: '2026-10-21T15:20:00.000Z', usuario: '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', codigo: 'K7QFM2XA' };

class ApiDeTeste extends ApiCofre {
  status_: StatusDaApi = { versao: 1, modo: 'ligado', googleClientId: 'cofre.apps.googleusercontent.com' };
  existe = false;
  falhaAoEntrar: ErroApi | null = null;
  entradas: [string, string, string][] = [];
  ordem: string[] = [];
  override async status(): Promise<StatusDaApi> {
    return this.status_;
  }
  override async entrar(codigo: string, verificador: string, aparelho: string): Promise<Entrada> {
    this.ordem.push('entrar');
    if (this.falhaAoEntrar) throw this.falhaAoEntrar;
    this.entradas.push([codigo, verificador, aparelho]);
    return ENTRADA;
  }
  override async estado(): Promise<EstadoDoCofre> {
    return { existe: this.existe, congeladoAte: null, aparelhos: this.existe ? 1 : 0 };
  }
}

function guarda(): Guarda & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return { dados, getItem: (c) => dados.get(c) ?? null, setItem: (c, v) => void dados.set(c, v), removeItem: (c) => void dados.delete(c) };
}

async function montar(mudar: Partial<Pagina> = {}, ajustarApi: (api: ApiDeTeste) => void = () => undefined) {
  const api = new ApiDeTeste();
  ajustarApi(api);
  const idas: string[] = [];
  const pagina: Pagina = {
    seguro: true,
    isolado: true,
    origem: 'https://cofre.teste',
    caminho: '/',
    busca: '',
    agente: 'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36',
    trabalhadores: { controller: null, getRegistrations: async () => [] },
    guarda: guarda(),
    limparUrl: () => void api.ordem.push('limparUrl'),
    irPara: (url) => void idas.push(url),
    copiar: async () => undefined,
    abrirSite: () => undefined,
    ...mudar,
  };
  const servicos: Servicos = { api, autenticador: { criar: async () => null, pegar: async () => null }, rpId: 'cofre.teste', pagina, terminar: () => undefined };
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SERVICOS, useValue: servicos }] });
  const fixture = TestBed.createComponent(Cofre);
  await estabilizar(fixture);
  return { fixture, api, idas, pagina, el: fixture.nativeElement as HTMLElement };
}

async function estabilizar(fixture: ComponentFixture<Cofre>): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((ok) => setTimeout(ok, 0));
    await fixture.whenStable();
  }
}

const botao = (el: HTMLElement, texto: string) => [...el.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto) as HTMLButtonElement | undefined;

describe('a porta do cofre', () => {
  it('sem o cliente do Google, o cofre está em construção', async () => {
    const { el } = await montar({}, (api) => (api.status_ = { versao: 1, modo: 'ligado', googleClientId: '' }));
    expect(el.querySelector('h2')!.textContent).toContain('Em construção');
    expect(botao(el, 'Entrar com o Google')).toBeUndefined();
  });

  it('entrar leva ao Google com o cliente do cofre e guarda o state e o verificador', async () => {
    const { fixture, el, idas, pagina } = await montar();
    expect(el.querySelector('h2')!.textContent).toContain('Entrar');
    botao(el, 'Entrar com o Google')!.click();
    await estabilizar(fixture);
    const url = new URL(idas[0]!);
    expect(url.host).toBe('accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('cofre.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://cofre.teste/entrar');
    expect((pagina.guarda as ReturnType<typeof guarda>).dados.has('cofre:login')).toBe(true);
  });

  it('sem isolamento, sem https ou com service worker, não deixa entrar', async () => {
    for (const [mudar, motivo] of [
      [{ isolado: false }, 'não está isolada'],
      [{ seguro: false }, 'não é seguro'],
      [{ trabalhadores: { controller: {}, getRegistrations: async () => [] } }, 'service worker'],
      [{ trabalhadores: { controller: null, getRegistrations: async () => [{ unregister: async () => true }] } }, 'service worker'],
      [{ automatizado: true }, 'controlado por um programa'],
    ] as [Partial<Pagina>, string][]) {
      TestBed.resetTestingModule();
      const { fixture, el, idas } = await montar(mudar);
      expect(el.querySelector('.erro')!.textContent).withContext(motivo).toContain(motivo);
      const entrar = botao(el, 'Entrar com o Google')!;
      expect(entrar.disabled).toBe(true);
      entrar.click();
      await estabilizar(fixture);
      expect(idas).toEqual([]);
    }
  });

  it('a volta do Google: limpa a URL primeiro, troca o código e, sem cofre, abre as telas de criar', async () => {
    const g = guarda();
    const state = new URL(await urlDoLogin('c', 'https://cofre.teste', g)).searchParams.get('state');
    const { verificador } = JSON.parse(g.dados.get('cofre:login')!);
    const { el, api } = await montar({ caminho: '/entrar', busca: `?state=${state}&code=codigo-do-google`, guarda: g });
    expect(api.ordem).toEqual(['limparUrl', 'entrar']);
    expect(api.entradas).toEqual([['codigo-do-google', verificador, 'Chrome no Windows']]);
    expect(el.querySelector('cofre-criar')).not.toBeNull();
    expect(el.textContent).toContain('Conta K7QF-M2XA');
    expect(g.dados.size).toBe(0);
  });

  it('a volta do Google com cofre já criado: a tela de abrir', async () => {
    const g = guarda();
    const state = new URL(await urlDoLogin('c', 'https://cofre.teste', g)).searchParams.get('state');
    const { el } = await montar({ caminho: '/entrar', busca: `?state=${state}&code=x`, guarda: g }, (api) => (api.existe = true));
    expect(el.querySelector('cofre-abrir')).not.toBeNull();
    expect(el.querySelector('h2')!.textContent).toContain('Abrir o cofre');
    expect(el.querySelector('cofre-criar')).toBeNull();
  });

  it('a volta com outro state não troca o código e diz por quê', async () => {
    const g = guarda();
    await urlDoLogin('c', 'https://cofre.teste', g);
    const { el, api } = await montar({ caminho: '/entrar', busca: '?state=forjado&code=x', guarda: g });
    expect(api.ordem).toEqual(['limparUrl']);
    expect(el.querySelector('.erro')!.textContent).toContain('não começou aqui');
    expect(botao(el, 'Entrar com o Google')).toBeDefined();
  });

  it('a volta numa página sem isolamento não troca o código', async () => {
    const g = guarda();
    const state = new URL(await urlDoLogin('c', 'https://cofre.teste', g)).searchParams.get('state');
    const { api } = await montar({ caminho: '/entrar', busca: `?state=${state}&code=x`, guarda: g, isolado: false });
    expect(api.ordem).toEqual(['limparUrl']);
  });

  it('a conta sem Murall ou fora da lista: a mensagem da API na porta', async () => {
    const g = guarda();
    const state = new URL(await urlDoLogin('c', 'https://cofre.teste', g)).searchParams.get('state');
    const { el } = await montar(
      { caminho: '/entrar', busca: `?state=${state}&code=x`, guarda: g },
      (api) => (api.falhaAoEntrar = new ErroApi(403, 'cofre-fechado', 'O cofre de senhas ainda não está aberto para a sua conta.')),
    );
    expect(el.querySelector('.erro')!.textContent).toContain('ainda não está aberto para a sua conta');
    expect(botao(el, 'Entrar com o Google')).toBeDefined();
  });
});
