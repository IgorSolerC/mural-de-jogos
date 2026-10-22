import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CofreAberto } from '../../core/abrir';
import { ApiCofre, ErroApi, type Gravacao, type ItensDaApi } from '../../core/api';
import { aleatorios, paraBase64url } from '../../core/bytes';
import { cifrarManifesto, criarCofre, novaChaveDoMeio } from '../../core/crypto';
import { salvarItem } from '../../core/itens';
import { type Pagina, SERVICOS, type Servicos } from '../servicos';
import { Aberto } from './aberto';

const USUARIO = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';

/** Um servidor de itens na memória, que confere o contador como o de verdade. */
class ApiNaMemoria extends ApiCofre {
  contador = 0;
  manifesto = '';
  conflitoNaProxima = false;
  sessaoAcabou = false;
  trancou = 0;
  readonly guardados = new Map<string, { versao: number; dados: string | null; mudadoEm: string; naLixeiraDesde: string | null }>();
  private gravar(g: Gravacao, mudar: () => void): { contador: number } {
    if (this.sessaoAcabou) throw new ErroApi(401, 'sessao-invalida', 'Sua sessão acabou.');
    if (this.conflitoNaProxima || g.contadorAnterior !== this.contador) {
      this.conflitoNaProxima = false;
      throw new ErroApi(409, 'conflito', 'Outro aparelho mudou o cofre.');
    }
    mudar();
    this.manifesto = g.manifesto;
    this.contador++;
    return { contador: this.contador };
  }
  override async itens(): Promise<ItensDaApi> {
    return { contador: this.contador, manifesto: this.manifesto, itens: [...this.guardados].map(([id, i]) => ({ id, ...i })) };
  }
  override async salvarItem(id: string, dados: string, versao: number, g: Gravacao) {
    return this.gravar(g, () => this.guardados.set(id, { versao, dados, mudadoEm: '', naLixeiraDesde: null }));
  }
  override async paraALixeira(id: string, g: Gravacao) {
    return this.gravar(g, () => (this.guardados.get(id)!.naLixeiraDesde = new Date().toISOString()));
  }
  override async restaurar(id: string, g: Gravacao) {
    return this.gravar(g, () => (this.guardados.get(id)!.naLixeiraDesde = null));
  }
  override async apagarDeVez(id: string, g: Gravacao) {
    return this.gravar(g, () => this.guardados.delete(id));
  }
  override trancar(): void {
    this.trancou++;
  }
}

async function montar(recuperada = false) {
  const api = new ApiNaMemoria();
  const { chave } = await criarCofre(aleatorios(32), novaChaveDoMeio(), USUARIO);
  const manifesto = { contador: 0, itens: {}, lixeira: {}, mudadoEm: '2026-10-21T14:32:00.000Z', aparelho: 'Celular' };
  api.manifesto = paraBase64url(await cifrarManifesto(chave, USUARIO, manifesto));
  const cofre: CofreAberto = { usuario: USUARIO, chave, manifesto, contador: 0, recuperada, expiraEm: new Date(Date.now() + 3_600_000).toISOString(), paradaMaxima: 600, aparelho: 'PC' };
  // dois itens já guardados, por fora da tela (outra cópia do cofre aberto)
  const outro = { ...cofre, manifesto: { ...manifesto } };
  await salvarItem(api, outro, { titulo: 'Wi-Fi de casa', usuario: '', senha: 'pastel', url: '', descricao: '' }, null);
  await salvarItem(api, outro, { titulo: 'Banco', usuario: 'fulano', senha: 'segredo-1', url: 'banco.exemplo', descricao: 'agência 1' }, null);
  const copias: string[] = [];
  const sites: string[] = [];
  const terminou = jasmine.createSpy('terminar');
  const pagina = {
    seguro: true,
    isolado: true,
    origem: '',
    caminho: '/',
    busca: '',
    agente: 'Chrome no Windows',
    trabalhadores: undefined,
    guarda: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    limparUrl: () => undefined,
    irPara: () => undefined,
    copiar: async (t: string) => void copias.push(t),
    abrirSite: (u: string) => void sites.push(u),
  } satisfies Pagina;
  const servicos: Servicos = { api, autenticador: { criar: async () => null, pegar: async () => null }, rpId: 'cofre.teste', pagina, terminar: terminou };
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SERVICOS, useValue: servicos }] });
  const fixture = TestBed.createComponent(Aberto);
  fixture.componentRef.setInput('cofre', cofre);
  fixture.componentRef.setInput('conta', 'K7QFM2XA');
  await estabilizar(fixture);
  return { fixture, api, cofre, copias, sites, terminou, el: fixture.nativeElement as HTMLElement };
}

async function estabilizar(fixture: ComponentFixture<Aberto>): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await new Promise((ok) => setTimeout(ok, 0));
    await fixture.whenStable();
  }
}

const botao = (el: HTMLElement, texto: string | RegExp) =>
  [...el.querySelectorAll('button')].find((b) => (typeof texto === 'string' ? b.textContent!.trim() === texto : texto.test(b.textContent!))) as HTMLButtonElement;
const titulos = (el: HTMLElement) => [...el.querySelectorAll('.lista .titulo')].map((t) => t.textContent!.trim());

describe('o cofre aberto', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('mostra a última mudança e os itens em ordem; a busca filtra sem acento nem maiúscula', async () => {
    const { fixture, el } = await montar();
    expect(el.querySelector('.aviso-mudanca')!.textContent).toContain('no Celular');
    expect(titulos(el)).toEqual(['Banco', 'Wi-Fi de casa']);
    const busca = el.querySelector<HTMLInputElement>('#busca')!;
    busca.value = 'WI-FI';
    busca.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    expect(titulos(el)).toEqual(['Wi-Fi de casa']);
    busca.value = 'fulano';
    busca.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    expect(titulos(el)).toEqual(['Banco']);
  });

  it('o item: copiar limpa a área de transferência em 30 segundos; abrir o site vai com https', async () => {
    const { fixture, el, copias, sites } = await montar();
    botao(el, /Banco/).click();
    await estabilizar(fixture);
    expect(el.querySelector('h2')!.textContent).toContain('Banco');
    expect(el.textContent).not.toContain('segredo-1');
    jasmine.clock().install();
    try {
      botao(el, 'Copiar').click(); // o primeiro Copiar é o do User
      await Promise.resolve();
      expect(copias).toEqual(['fulano']);
      jasmine.clock().tick(30_000);
      expect(copias).toEqual(['fulano', '']);
    } finally {
      jasmine.clock().uninstall();
    }
    botao(el, 'Abrir o site').click();
    expect(sites).toEqual(['https://banco.exemplo/']);
    botao(el, 'Revelar').click();
    await estabilizar(fixture);
    expect(el.textContent).toContain('segredo-1');
  });

  it('nova senha, guardar, e a lixeira com a confirmação de apagar de vez', async () => {
    const { fixture, el, api } = await montar();
    botao(el, /Nova senha/).click();
    await estabilizar(fixture);
    const titulo = el.querySelector<HTMLInputElement>('#item-titulo')!;
    titulo.value = 'Streaming';
    titulo.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    botao(el, 'Salvar').click();
    await estabilizar(fixture);
    expect(api.guardados.size).toBe(3);
    expect(el.querySelector('h2')!.textContent).toContain('Streaming');
    botao(el, 'Pôr na lixeira').click();
    await estabilizar(fixture);
    expect(titulos(el)).toEqual(['Banco', 'Wi-Fi de casa']);
    botao(el, /Lixeira \(1\)/).click();
    await estabilizar(fixture);
    botao(el, 'Apagar de vez').click();
    await estabilizar(fixture);
    expect(el.textContent).toContain('Não dá para desfazer');
    expect(api.guardados.size).toBe(3);
    botao(el, 'Apagar').click();
    await estabilizar(fixture);
    expect(api.guardados.size).toBe(2);
  });

  it('um conflito com outro aparelho relê os itens e avisa', async () => {
    const { fixture, el, api } = await montar();
    botao(el, /Nova senha/).click();
    await estabilizar(fixture);
    const titulo = el.querySelector<HTMLInputElement>('#item-titulo')!;
    titulo.value = 'Novo';
    titulo.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    api.conflitoNaProxima = true;
    botao(el, 'Salvar').click();
    await estabilizar(fixture);
    expect(el.querySelector('.erro')!.textContent).toContain('Outro aparelho mudou o cofre');
    expect(api.guardados.size).toBe(2);
  });

  it('a sessão que acabou no servidor, e o botão Trancar, trancam: avisam o servidor e recarregam', async () => {
    const a = await montar();
    botao(a.el, /Trancar/).click();
    expect([a.api.trancou, a.terminou.calls.count()]).toEqual([1, 1]);
    TestBed.resetTestingModule();
    const b = await montar();
    b.api.sessaoAcabou = true;
    botao(b.el, /Wi-Fi/).click();
    await estabilizar(b.fixture);
    botao(b.el, 'Pôr na lixeira').click();
    await estabilizar(b.fixture);
    expect(b.terminou).toHaveBeenCalled();
  });

  it('aberto pelo código: avisa para gerar um código novo', async () => {
    const { el } = await montar(true);
    expect(el.querySelector('.aviso-codigo')!.textContent).toContain('código novo');
  });
});
