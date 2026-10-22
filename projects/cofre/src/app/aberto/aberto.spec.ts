import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CofreAberto } from '../../core/abrir';
import { ApiCofre, ErroApi, type Gravacao, type ItensDaApi } from '../../core/api';
import { aleatorios, paraBase64url } from '../../core/bytes';
import { cifrarManifesto, criarCofre, novaChaveDoMeio } from '../../core/crypto';
import { salvarItem } from '../../core/itens';
import { sha1 } from '../../core/vazadas';
import { CHAVE_DA_LIMPEZA } from '../area-de-transferencia';
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
  const pedidosFora: string[] = [];
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
    // a base de vazamentos de mentira: só "segredo-1" (a senha do Banco) aparece, 42 vezes
    buscarFora: (async (url: RequestInfo | URL) => {
      const h = await sha1('segredo-1');
      pedidosFora.push(String(url));
      return new Response(String(url).endsWith(h.slice(0, 5)) ? `${h.slice(5)}:42\n` : '', { status: 200 });
    }) as typeof fetch,
  } satisfies Pagina;
  const servicos: Servicos = { api, autenticador: { criar: async () => null, pegar: async () => null }, rpId: 'cofre.teste', pagina, terminar: terminou };
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SERVICOS, useValue: servicos }] });
  const fixture = TestBed.createComponent(Aberto);
  fixture.componentRef.setInput('cofre', cofre);
  fixture.componentRef.setInput('conta', 'K7QFM2XA');
  await estabilizar(fixture);
  return { fixture, api, cofre, copias, sites, terminou, pedidosFora, el: fixture.nativeElement as HTMLElement };
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
  afterEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.removeItem(CHAVE_DA_LIMPEZA);
  });

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
    el.querySelector<HTMLButtonElement>('[aria-label="Revelar a senha"]')!.click();
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

  it('conferir senhas vazadas (nos Ajustes): só o começo do hash sai; a vazada abre, com o selo na lista e o aviso no item', async () => {
    const { fixture, el, pedidosFora } = await montar();
    expect(el.querySelector('.selo-vazada')).toBeNull();
    botao(el, 'Ajustes').click();
    await estabilizar(fixture);
    [...el.querySelectorAll<HTMLElement>('[role=tab]')].find((t) => t.textContent!.includes('Senhas vazadas'))!.click();
    await estabilizar(fixture);
    botao(el, 'Conferir senhas vazadas').click();
    for (let i = 0; i < 20 && !el.textContent!.includes('42 vezes'); i++) await estabilizar(fixture);
    expect(pedidosFora.every((u) => /\/range\/[0-9A-F]{5}$/.test(u))).toBe(true);
    expect(el.querySelector('.bilhete')!.textContent).toContain('1 senha apareceu em vazamentos');
    botao(el, 'Abrir').click();
    await estabilizar(fixture);
    expect(el.querySelector('.selo-vazada')!.closest('.linha')!.textContent).toContain('Banco');
    expect(el.querySelector('h2')!.textContent).toContain('Banco');
    expect(el.querySelector('.vazada')!.textContent).toContain('42 vezes');
  });

  it('copia o user e a senha direto da lista, sem abrir o item, e limpa em 30 segundos', async () => {
    const { fixture, el, copias } = await montar();
    jasmine.clock().install();
    try {
      el.querySelector<HTMLButtonElement>('[aria-label="Copiar a senha de Banco"]')!.click();
      await Promise.resolve();
      await Promise.resolve();
      expect(copias).toEqual(['segredo-1']);
      el.querySelector<HTMLButtonElement>('[aria-label="Copiar o user de Banco"]')!.click();
      await Promise.resolve();
      await Promise.resolve();
      expect(copias).toEqual(['segredo-1', 'fulano']);
      jasmine.clock().tick(30_000);
      expect(copias).toEqual(['segredo-1', 'fulano', '']);
    } finally {
      jasmine.clock().uninstall();
    }
    await estabilizar(fixture);
    // nada abriu, e a senha não apareceu na tela
    expect(el.querySelector('cofre-item')).toBeNull();
    expect(el.textContent).not.toContain('segredo-1');
    // o Wi-Fi não tem user: só o botão da senha
    expect(el.querySelector('[aria-label="Copiar o user de Wi-Fi de casa"]')).toBeNull();
    expect(el.querySelector('[aria-label="Copiar a senha de Wi-Fi de casa"]')).not.toBeNull();
  });

  it('o botão de copiar diz que deu certo, e volta sozinho', async () => {
    const { fixture, el } = await montar();
    const senha = () => el.querySelector<HTMLButtonElement>('[aria-label="Copiar a senha de Banco"]')!;
    senha().click();
    await estabilizar(fixture);
    expect(senha().classList).toContain('feito');
    // o bilhete diz o que é verdade: só limpa com o cofre na frente, e o Win+V do Windows guarda uma cópia
    expect(el.querySelector('.bilhete')!.textContent).toContain('Senha de Banco copiada. Sai do Ctrl+V depois de 30 s, quando o cofre estiver na frente. O histórico do Win+V guarda uma cópia.');
    await new Promise((ok) => setTimeout(ok, 1900));
    await estabilizar(fixture);
    expect(senha().classList).not.toContain('feito');
  });

  it('"/" vai para a busca, as setas andam pela lista e o Esc fecha o item aberto', async () => {
    const { fixture, el } = await montar();
    const tecla = (alvo: EventTarget, key: string) => alvo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    tecla(document.body, '/');
    expect(document.activeElement).toBe(el.querySelector('#busca'));
    tecla(document.activeElement!, 'ArrowDown');
    expect(document.activeElement!.textContent).toContain('Banco');
    tecla(document.activeElement!, 'ArrowDown');
    expect(document.activeElement!.textContent).toContain('Wi-Fi');
    (document.activeElement as HTMLElement).click();
    await estabilizar(fixture);
    expect(el.querySelector('h2')!.textContent).toContain('Wi-Fi');
    tecla(document.body, 'Escape');
    await estabilizar(fixture);
    expect(el.querySelector('cofre-item')).toBeNull();
  });

  it('trocar de item na lista esconde de novo a senha revelada', async () => {
    const { fixture, el } = await montar();
    botao(el, /Banco/).click();
    await estabilizar(fixture);
    el.querySelector<HTMLButtonElement>('[aria-label="Revelar a senha"]')!.click();
    await estabilizar(fixture);
    expect(el.textContent).toContain('segredo-1');
    botao(el, /Wi-Fi/).click();
    await estabilizar(fixture);
    expect(el.querySelector('h2')!.textContent).toContain('Wi-Fi');
    expect(el.textContent).not.toContain('pastel');
    expect(el.querySelector('[aria-label="Revelar a senha"]')).not.toBeNull();
  });

  it('aberto pelo código: avisa para gerar um código novo', async () => {
    const { el } = await montar(true);
    expect(el.querySelector('.aviso-codigo')!.textContent).toContain('código novo');
  });
});
