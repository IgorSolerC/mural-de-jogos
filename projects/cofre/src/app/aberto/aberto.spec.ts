import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CofreAberto } from '../../core/abrir';
import { ApiCofre, ErroApi, type Gravacao, type ItensDaApi } from '../../core/api';
import { aleatorios, deBase64url, paraBase64url } from '../../core/bytes';
import { cifrarManifesto, criarCofre, novaChaveDoMeio } from '../../core/crypto';
import { type CamposDoItem, lerItens, salvarItem } from '../../core/itens';
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

/** A passkey do cofre nos testes, e a assinatura que ela devolve (o byte 32 do authenticatorData são os flags). */
const PASSKEY = 'cGFzc2tleS1kby10ZXN0ZQ';
function assinada(flags = 0x05): Credential {
  const dados = new Uint8Array(37);
  dados[32] = flags;
  return { type: 'public-key', rawId: deBase64url(PASSKEY)!.buffer, response: { authenticatorData: dados.buffer }, getClientExtensionResults: () => ({}) } as unknown as Credential;
}

async function montar(recuperada = false, mais: readonly CamposDoItem[] = [], extra: Partial<CofreAberto> = {}) {
  const api = new ApiNaMemoria();
  const { chave } = await criarCofre(aleatorios(32), novaChaveDoMeio(), USUARIO);
  const manifesto = { contador: 0, itens: {}, lixeira: {}, mudadoEm: '2026-10-21T14:32:00.000Z', aparelho: 'Celular' };
  api.manifesto = paraBase64url(await cifrarManifesto(chave, USUARIO, manifesto));
  const cofre: CofreAberto = { usuario: USUARIO, chave, manifesto, contador: 0, recuperada, expiraEm: new Date(Date.now() + 3_600_000).toISOString(), paradaMaxima: 600, aparelho: 'PC', ...extra };
  // dois itens já guardados, por fora da tela (outra cópia do cofre aberto)
  const outro = { ...cofre, manifesto: { ...manifesto } };
  await salvarItem(api, outro, { titulo: 'Wi-Fi de casa', usuario: '', senha: 'pastel', url: '', descricao: '' }, null);
  await salvarItem(api, outro, { titulo: 'Banco', usuario: 'fulano', senha: 'segredo-1', url: 'banco.exemplo', descricao: 'agência 1' }, null);
  for (const campos of mais) await salvarItem(api, outro, campos, null);
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
  // a passkey de mentira: devolve `passkey.proxima` (uma assinatura, um erro do navegador ou nada) e conta os pedidos
  const passkey: { proxima: Credential | Error | null; pedidos: number } = { proxima: assinada(), pedidos: 0 };
  const pegar = async () => {
    passkey.pedidos++;
    if (passkey.proxima instanceof Error) throw passkey.proxima;
    return passkey.proxima;
  };
  const servicos: Servicos = { api, autenticador: { criar: async () => null, pegar }, rpId: 'cofre.teste', pagina, terminar: terminou };
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SERVICOS, useValue: servicos }] });
  const fixture = TestBed.createComponent(Aberto);
  fixture.componentRef.setInput('cofre', cofre);
  fixture.componentRef.setInput('conta', 'K7QFM2XA');
  await estabilizar(fixture);
  return { fixture, api, cofre, copias, sites, terminou, pedidosFora, passkey, el: fixture.nativeElement as HTMLElement };
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

  it('trancar joga fora as senhas decifradas na hora, sem esperar a recarga (que o cache de voltar/avançar ignora)', async () => {
    const { fixture, el } = await montar();
    botao(el, /Banco/).click();
    await estabilizar(fixture);
    el.querySelector<HTMLButtonElement>('[aria-label="Revelar a senha"]')!.click();
    await estabilizar(fixture);
    expect(el.textContent).toContain('segredo-1');
    botao(el, /Trancar/).click();
    await estabilizar(fixture);
    expect(titulos(el)).toEqual([]);
    expect(el.textContent).not.toContain('segredo-1');
    expect(el.textContent).not.toContain('fulano');
  });

  it('depois de conferir as vazadas, trocar a senha tira o "Vazada" do item; mudar só o título, não', async () => {
    const { fixture, el } = await montar();
    botao(el, 'Ajustes').click();
    await estabilizar(fixture);
    [...el.querySelectorAll<HTMLElement>('[role=tab]')].find((t) => t.textContent!.includes('Senhas vazadas'))!.click();
    await estabilizar(fixture);
    botao(el, 'Conferir senhas vazadas').click();
    for (let i = 0; i < 20 && !el.textContent!.includes('42 vezes'); i++) await estabilizar(fixture);
    botao(el, 'Abrir').click();
    await estabilizar(fixture);
    const editar = async (seletor: string, valor: string) => {
      botao(el, 'Editar').click();
      await estabilizar(fixture);
      const campo = el.querySelector<HTMLInputElement>(seletor)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
      await estabilizar(fixture);
      botao(el, 'Salvar').click();
      await estabilizar(fixture);
    };
    await editar('#item-titulo', 'Banco do bairro');
    expect(el.querySelector('.vazada')!.textContent).toContain('42 vezes');
    expect(el.querySelector('.selo-vazada')).not.toBeNull();
    await editar('#item-senha', 'outra-bem-nova');
    expect(el.querySelector('.vazada')).toBeNull();
    expect(el.querySelector('.selo-vazada')).toBeNull();
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
    // estreita: as etiquetas numa coluna só
    el.style.setProperty('--largura', '420px');
    await estabilizar(fixture);
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

describe('as pastas do cofre (os grupos)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const vazio = { usuario: '', senha: 'x', url: '', descricao: '' };
  const comGrupos = [
    { ...vazio, titulo: 'Cartão', grupo: 'Bancos' },
    { ...vazio, titulo: 'Alarme', grupo: 'Casa' },
    { ...vazio, titulo: 'Repositório', grupo: 'trabalho' },
  ];
  const orelhas = (el: HTMLElement) => [...el.querySelectorAll('.orelha .orelha-nome')].map((o) => o.textContent!.trim());
  const orelha = (el: HTMLElement, nome: string) => [...el.querySelectorAll<HTMLElement>('.orelha')].find((o) => o.querySelector('.orelha-nome')!.textContent!.trim() === nome)!;
  const naPasta = (el: HTMLElement, nome: string) => [...orelha(el, nome).closest('.pasta')!.querySelectorAll('.titulo')].map((t) => t.textContent!.trim());
  const escolhas = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('.grupos-existentes button')];
  const abrir = (el: HTMLElement, titulo: string) => [...el.querySelectorAll<HTMLButtonElement>('.abre')].find((b) => b.querySelector('.titulo')!.textContent!.trim() === titulo)!.click();

  it('sem nenhum grupo, a lista de sempre, sem orelhas', async () => {
    const { el } = await montar();
    expect(el.querySelector('.orelha')).toBeNull();
    expect(el.querySelector('.pastas.com-grupos')).toBeNull();
    expect(el.querySelector('.contagem')!.textContent).not.toContain('grupo');
  });

  it('com grupos, uma pasta por grupo em ordem alfabética, as sem grupo por último, cada uma com quantas tem', async () => {
    const { el } = await montar(false, comGrupos);
    expect(orelhas(el)).toEqual(['Bancos', 'Casa', 'trabalho', 'Sem grupo']);
    expect(el.querySelector('.contagem')!.textContent!.replace(/\s+/g, ' ')).toContain('5 senhas em 3 grupos');
    expect(naPasta(el, 'Sem grupo')).toEqual(['Banco', 'Wi-Fi de casa']);
    expect(orelha(el, 'Sem grupo').textContent).toContain('2 senhas');
    expect(orelha(el, 'Casa').textContent).toContain('1 senha');
  });

  it('o quadro: as pastas lado a lado; a busca tira as que ficam sem nada e acha também pelo nome do grupo', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '1200px');
    await estabilizar(fixture);
    const caixas = [...el.querySelectorAll('.pasta')].map((p) => p.getBoundingClientRect());
    expect(caixas.length).toBe(4);
    // na mesma altura, uma depois da outra
    expect(new Set(caixas.map((c) => Math.round(c.top))).size).toBe(1);
    caixas.slice(1).forEach((c, n) => expect(c.left).toBeGreaterThan(caixas[n]!.right));
    const busca = el.querySelector<HTMLInputElement>('#busca')!;
    busca.value = 'casa';
    busca.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    // "casa" acha o Alarme pelo grupo e o Wi-Fi de casa pelo título
    expect(titulos(el)).toEqual(['Alarme', 'Wi-Fi de casa']);
    expect(orelhas(el)).toEqual(['Casa', 'Sem grupo']);
    expect(el.querySelector('.contagem')!.textContent!.replace(/\s+/g, ' ')).toContain('2 senhas com “casa”');
    // nada achado: o recado no meio e o Limpar a busca, sem a contagem
    busca.value = 'zzz';
    busca.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    expect(el.querySelector('cofre-quadro')).toBeNull();
    expect(el.querySelector('.contagem')).toBeNull();
    expect(el.querySelector('.sem-achados')!.textContent).toContain('zzz');
    botao(el, 'Limpar a busca').click();
    await estabilizar(fixture);
    expect(orelhas(el).length).toBe(4);
    expect(document.activeElement).toBe(busca);
  });

  it('a mesa cabe na tela: começa onde a página mede e acaba antes do pé dela', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    await estabilizar(fixture);
    const mesa = el.querySelector<HTMLElement>('.mesa')!;
    const topo = parseFloat(mesa.style.getPropertyValue('--mesa-topo'));
    expect(topo).toBeCloseTo(mesa.getBoundingClientRect().top + scrollY, 0);
    expect(mesa.getBoundingClientRect().height).toBeLessThanOrEqual(innerHeight);
    expect(el.classList).toContain('na-mesa');
    botao(el, 'Ajustes').click();
    await estabilizar(fixture);
    expect(el.classList).not.toContain('na-mesa');
  });

  it('Enter na busca abre a primeira achada, e o foco fica na busca', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '1200px');
    await estabilizar(fixture);
    const busca = el.querySelector<HTMLInputElement>('#busca')!;
    busca.focus();
    busca.value = 'a';
    busca.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    busca.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await estabilizar(fixture);
    // a primeira pasta com "a" é a de Bancos (Cartão)
    expect(el.querySelector('cofre-item h2')!.textContent).toContain('Cartão');
    expect(el.querySelector('.linha.aberta .titulo')!.textContent).toContain('Cartão');
    expect(document.activeElement).toBe(busca);
  });

  it('as setas andam pelo quadro pelo lugar das etiquetas: para os lados, a pasta vizinha', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '1200px');
    await estabilizar(fixture);
    const tecla = (key: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const focada = () => document.activeElement!.querySelector('.titulo')?.textContent!.trim();
    el.querySelector<HTMLInputElement>('#busca')!.focus();
    tecla('ArrowDown');
    expect(focada()).toBe('Cartão');
    tecla('ArrowRight');
    expect(focada()).toBe('Alarme');
    tecla('ArrowRight');
    expect(focada()).toBe('Repositório');
    tecla('ArrowRight');
    expect(focada()).toBe('Banco');
    tecla('ArrowDown');
    expect(focada()).toBe('Wi-Fi de casa');
    tecla('ArrowDown');
    expect(focada()).toBe('Wi-Fi de casa');
    tecla('Home');
    expect(focada()).toBe('Banco');
    tecla('ArrowLeft');
    expect(focada()).toBe('Repositório');
  });

  it('o meio da etiqueta abre: os botões de copiar escondidos por cima do fim dela não pegam o clique', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '1200px');
    await estabilizar(fixture);
    const linha = [...el.querySelectorAll<HTMLElement>('.linha')].find((l) => l.textContent!.includes('Banco'))!;
    linha.scrollIntoView({ block: 'center' });
    const r = linha.getBoundingClientRect();
    if (matchMedia('(hover: hover)').matches) {
      // com mouse, os botões só aparecem com o mouse ou o foco na etiqueta
      expect(getComputedStyle(linha.querySelector('.rapidos')!).opacity).toBe('0');
      expect(getComputedStyle(linha.querySelector('.rapido')!).pointerEvents).toBe('none');
    }
    for (const x of [r.left + r.width * 0.5, r.left + r.width * 0.62]) {
      const tocado = document.elementFromPoint(x, r.top + r.height / 2) as HTMLElement;
      expect(tocado.closest('.abre')).withContext(`x = ${Math.round(x - r.left)}`).not.toBeNull();
    }
    // com o foco do teclado na etiqueta, eles aparecem
    linha.querySelector<HTMLElement>('.abre')!.focus();
    await estabilizar(fixture);
    expect(getComputedStyle(linha.querySelector('.rapidos')!).opacity).toBe('1');
  });

  it('larga: a senha abre numa folha ao lado do quadro, com o X que fecha e devolve o foco à etiqueta', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '1200px');
    await estabilizar(fixture);
    abrir(el, 'Alarme');
    await estabilizar(fixture);
    const quadro = el.querySelector('.lado-lista')!.getBoundingClientRect();
    const folha = el.querySelector('.lado-item')!.getBoundingClientRect();
    expect(folha.left).toBeGreaterThanOrEqual(quadro.right - 1);
    expect(getComputedStyle(el.querySelector('.voltar')!).display).toBe('none');
    // a aberta não mostra os botões de copiar (a folha tem o Copiar), mesmo com o foco nela
    const aberta = el.querySelector<HTMLElement>('.linha.aberta')!;
    aberta.querySelector<HTMLElement>('.abre')!.focus();
    await estabilizar(fixture);
    const rapidos = getComputedStyle(aberta.querySelector('.rapidos')!);
    expect(matchMedia('(hover: hover)').matches ? rapidos.opacity : rapidos.visibility).toBe(matchMedia('(hover: hover)').matches ? '0' : 'hidden');
    const fechar = el.querySelector<HTMLButtonElement>('[aria-label="Fechar a senha"]')!;
    expect(getComputedStyle(fechar).display).not.toBe('none');
    fechar.click();
    await estabilizar(fixture);
    await new Promise((ok) => setTimeout(ok, 10));
    expect(el.querySelector('cofre-item')).toBeNull();
    expect(document.activeElement!.textContent).toContain('Alarme');
  });

  it('com a edição mudada e não salva, abrir outra senha, uma nova ou os Ajustes pergunta antes', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '1200px');
    await estabilizar(fixture);
    abrir(el, 'Alarme');
    await estabilizar(fixture);
    botao(el, 'Editar').click();
    await estabilizar(fixture);
    // sem mudar nada, trocar não pergunta
    abrir(el, 'Cartão');
    await estabilizar(fixture);
    expect(el.querySelector('cofre-item h2')!.textContent).toContain('Cartão');
    botao(el, 'Editar').click();
    await estabilizar(fixture);
    const titulo = el.querySelector<HTMLInputElement>('#item-titulo')!;
    titulo.value = 'Cartão novo';
    titulo.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    abrir(el, 'Alarme');
    await estabilizar(fixture);
    await new Promise((ok) => setTimeout(ok, 10));
    expect(el.querySelector('.aviso-edicao')!.textContent).toContain('Você mudou Cartão');
    expect(document.activeElement!.textContent!.trim()).toBe('Continuar editando');
    expect(el.querySelector<HTMLInputElement>('#item-titulo')!.value).toBe('Cartão novo');
    botao(el, 'Continuar editando').click();
    await estabilizar(fixture);
    expect(el.querySelector('.aviso-edicao')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('#item-titulo')!.value).toBe('Cartão novo');
    // a nova e os Ajustes também esperam
    botao(el, /Nova senha/).click();
    await estabilizar(fixture);
    expect(el.querySelector('.aviso-edicao')).not.toBeNull();
    botao(el, 'Continuar editando').click();
    await estabilizar(fixture);
    botao(el, 'Ajustes').click();
    await estabilizar(fixture);
    expect(el.querySelector('cofre-gerenciar')).toBeNull();
    expect(el.querySelector('.aviso-edicao')).not.toBeNull();
    // descartar faz o que esperava (aqui, os Ajustes), sem guardar nada
    botao(el, 'Descartar as mudanças').click();
    await estabilizar(fixture);
    expect(el.querySelector('cofre-gerenciar')).not.toBeNull();
    botao(el, /Voltar às senhas/).click();
    await estabilizar(fixture);
    expect(titulos(el)).toContain('Cartão');
    expect(titulos(el)).not.toContain('Cartão novo');
  });

  it('com o foco numa etiqueta, U copia o user e S a senha', async () => {
    const { fixture, el, copias } = await montar();
    const linha = [...el.querySelectorAll<HTMLElement>('.abre')].find((b) => b.textContent!.includes('Banco'))!;
    linha.focus();
    linha.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }));
    await estabilizar(fixture);
    linha.dispatchEvent(new KeyboardEvent('keydown', { key: 'U', bubbles: true, cancelable: true }));
    await estabilizar(fixture);
    expect(copias).toEqual(['segredo-1', 'fulano']);
    // o Wi-Fi não tem user: o U não faz nada
    const wifi = [...el.querySelectorAll<HTMLElement>('.abre')].find((b) => b.textContent!.includes('Wi-Fi'))!;
    wifi.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true, cancelable: true }));
    await estabilizar(fixture);
    expect(copias.length).toBe(2);
  });

  it('estreito: as orelhas de todas as pastas numa fileira, a da pasta à vista marcada, e o toque leva até a pasta', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '380px');
    await estabilizar(fixture);
    const fileira = el.querySelector<HTMLElement>('.indice')!;
    expect(getComputedStyle(fileira).display).toBe('flex');
    const orelhasDaFileira = () => [...fileira.querySelectorAll<HTMLButtonElement>('.indice-orelha')];
    expect(orelhasDaFileira().map((o) => o.querySelector('.indice-nome')!.textContent!.trim())).toEqual(['Bancos', 'Casa', 'trabalho', 'Sem grupo']);
    expect(orelhasDaFileira()[0]!.getAttribute('aria-current')).toBe('true');
    const rolo = el.querySelector<HTMLElement>('.pastas')!;
    rolo.style.scrollBehavior = 'auto';
    orelhasDaFileira()[2]!.click();
    await new Promise((ok) => setTimeout(ok, 700));
    rolo.dispatchEvent(new Event('scroll'));
    await estabilizar(fixture);
    const pasta = el.querySelectorAll<HTMLElement>('.pasta')[2]!;
    expect(Math.abs(rolo.scrollLeft - (pasta.offsetLeft - 12))).toBeLessThan(3);
    expect(orelhasDaFileira()[2]!.getAttribute('aria-current')).toBe('true');
  });

  it('estreito: nada se apaga por cima das senhas (nem a beirada do lado, nem a da pasta que rola); na larga, apaga', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    const mascaras = () => {
      el.querySelector('.moldura')!.classList.add('apaga-inicio', 'apaga-fim');
      const lista = el.querySelector('.lista')!;
      lista.classList.add('mais-acima', 'mais-abaixo');
      const comMascara = (e: Element) => getComputedStyle(e).maskImage !== 'none';
      const r = [comMascara(el.querySelector('.pastas')!), comMascara(lista)];
      lista.classList.remove('mais-acima');
      return [...r, comMascara(lista)];
    };
    el.style.setProperty('--largura', '380px');
    await estabilizar(fixture);
    expect(mascaras()).toEqual([false, false, false]);
    el.style.setProperty('--largura', '1200px');
    await estabilizar(fixture);
    expect(mascaras()).toEqual([true, true, true]);
  });

  it('larga: sem a fileira de orelhas (as orelhas de cada pasta já estão à vista)', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '1200px');
    await estabilizar(fixture);
    expect(getComputedStyle(el.querySelector('.indice')!).display).toBe('none');
  });

  it('o Tab entra no quadro por uma etiqueta só (a última com o foco), e só os botões de copiar dela entram no Tab', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    const naVez = () => [...el.querySelectorAll<HTMLElement>('.abre')].filter((b) => b.tabIndex === 0).map((b) => b.querySelector('.titulo')!.textContent!.trim());
    expect(naVez()).toEqual(['Cartão']);
    const alarme = [...el.querySelectorAll<HTMLElement>('.abre')].find((b) => b.textContent!.includes('Alarme'))!;
    alarme.focus();
    await estabilizar(fixture);
    expect(naVez()).toEqual(['Alarme']);
    const noTab = [...el.querySelectorAll<HTMLButtonElement>('.rapido')].filter((b) => b.tabIndex === 0).map((b) => b.getAttribute('aria-label'));
    expect(noTab).toEqual(['Copiar a senha de Alarme']);
  });

  it('o leitor de tela ouve a cópia (de novo, se repetir) e o que a busca achou, por regiões que ficam na página', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    const status = el.querySelector<HTMLElement>('p[role=status]')!;
    const copiar = () => el.querySelector<HTMLButtonElement>('[aria-label="Copiar a senha de Banco"]')!.click();
    copiar();
    await new Promise((ok) => setTimeout(ok, 100));
    await estabilizar(fixture);
    expect(status.textContent).toContain('Senha de Banco copiada');
    copiar();
    await estabilizar(fixture);
    expect(status.textContent!.trim()).toBe('');
    await new Promise((ok) => setTimeout(ok, 100));
    await estabilizar(fixture);
    expect(status.textContent).toContain('Senha de Banco copiada');
    // o bilhete à vista não é lido duas vezes
    expect(el.querySelector('.bilhete')!.getAttribute('aria-hidden')).toBe('true');
    const busca = el.querySelector<HTMLInputElement>('#busca')!;
    busca.value = 'zzz';
    busca.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    expect(el.querySelector('p[aria-live=polite]')!.textContent).toContain('Nada com “zzz”');
  });

  it('o U numa senha sem user diz que ela não tem', async () => {
    const { fixture, el } = await montar();
    const wifi = [...el.querySelectorAll<HTMLElement>('.abre')].find((b) => b.textContent!.includes('Wi-Fi'))!;
    wifi.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true, cancelable: true }));
    await estabilizar(fixture);
    expect(el.querySelector('.bilhete')!.textContent).toContain('Wi-Fi de casa não tem user.');
  });

  it('estreita: abrir pelo teclado põe o foco no Voltar à lista (o quadro, com o foco, sumiu)', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '600px');
    await estabilizar(fixture);
    const alarme = [...el.querySelectorAll<HTMLElement>('.abre')].find((b) => b.textContent!.includes('Alarme'))!;
    alarme.focus();
    alarme.click();
    await estabilizar(fixture);
    expect(document.activeElement!.classList).toContain('voltar');
  });

  it('com a busca escrita, o Esc só limpa a busca e não fecha a senha aberta', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '1200px');
    await estabilizar(fixture);
    abrir(el, 'Alarme');
    await estabilizar(fixture);
    const busca = el.querySelector<HTMLInputElement>('#busca')!;
    busca.focus();
    busca.value = 'al';
    busca.dispatchEvent(new Event('input'));
    busca.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await estabilizar(fixture);
    expect(el.querySelector('cofre-item')).not.toBeNull();
  });

  it('depois de salvar, o bilhete da mudança não salva sai', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '1200px');
    await estabilizar(fixture);
    abrir(el, 'Alarme');
    await estabilizar(fixture);
    botao(el, 'Editar').click();
    await estabilizar(fixture);
    const titulo = el.querySelector<HTMLInputElement>('#item-titulo')!;
    titulo.value = 'Alarme da casa';
    titulo.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    abrir(el, 'Cartão');
    await estabilizar(fixture);
    expect(el.querySelector('.aviso-edicao')).not.toBeNull();
    botao(el, 'Salvar').click();
    await estabilizar(fixture);
    expect(el.querySelector('.aviso-edicao')).toBeNull();
    expect(titulos(el)).toContain('Alarme da casa');
  });

  it('estreita: a senha toma o lugar do quadro, com o Voltar à lista', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    el.style.setProperty('--largura', '600px');
    await estabilizar(fixture);
    abrir(el, 'Alarme');
    await estabilizar(fixture);
    expect(getComputedStyle(el.querySelector('.lado-lista')!).display).toBe('none');
    expect(getComputedStyle(el.querySelector('[aria-label="Fechar a senha"]')!).display).toBe('none');
    botao(el, /Voltar à lista/).click();
    await estabilizar(fixture);
    expect(el.querySelector('cofre-quadro')).not.toBeNull();
  });

  it('editar: o grupo se escolhe com um toque nos que existem, e a senha vai para a pasta dele, aberta', async () => {
    const { fixture, el, api, cofre } = await montar(false, comGrupos);
    abrir(el, 'Banco');
    await estabilizar(fixture);
    botao(el, 'Editar').click();
    await estabilizar(fixture);
    expect(escolhas(el).map((b) => b.textContent!.trim())).toEqual(['Bancos', 'Casa', 'trabalho']);
    escolhas(el)[1]!.click();
    await estabilizar(fixture);
    expect(el.querySelector<HTMLInputElement>('#item-grupo')!.value).toBe('Casa');
    expect(escolhas(el)[1]!.getAttribute('aria-pressed')).toBe('true');
    botao(el, 'Salvar').click();
    await estabilizar(fixture);
    expect(naPasta(el, 'Casa')).toEqual(['Alarme', 'Banco']);
    expect(orelha(el, 'Casa').closest('.pasta')!.querySelector('.linha.aberta .titulo')!.textContent).toContain('Banco');
    expect(el.querySelector('.grupo-do-item')!.textContent).toContain('Casa');
    // o grupo vai dentro do cifrado
    const lidos = await lerItens(api, { ...cofre, manifesto: { ...cofre.manifesto } });
    expect(lidos.find((i) => i.item?.titulo === 'Banco')!.item!.grupo).toBe('Casa');
  });

  it('o mesmo grupo escrito de outro jeito cai na mesma pasta; tocar no escolhido tira o grupo', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    botao(el, /Nova senha/).click();
    await estabilizar(fixture);
    const titulo = el.querySelector<HTMLInputElement>('#item-titulo')!;
    titulo.value = 'Pix';
    titulo.dispatchEvent(new Event('input'));
    const grupo = el.querySelector<HTMLInputElement>('#item-grupo')!;
    grupo.value = '  bancos ';
    grupo.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    const bancos = () => escolhas(el).find((b) => b.textContent!.includes('Bancos'))!;
    expect(bancos().getAttribute('aria-pressed')).toBe('true');
    botao(el, 'Salvar').click();
    await estabilizar(fixture);
    expect(orelhas(el)).toEqual(['Bancos', 'Casa', 'trabalho', 'Sem grupo']);
    expect(naPasta(el, 'Bancos')).toEqual(['Cartão', 'Pix']);
    botao(el, 'Editar').click();
    await estabilizar(fixture);
    bancos().click();
    await estabilizar(fixture);
    expect(el.querySelector<HTMLInputElement>('#item-grupo')!.value).toBe('');
  });

  it('só o grupo, sem mais nada, não é uma senha para guardar', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    botao(el, /Nova senha/).click();
    await estabilizar(fixture);
    escolhas(el)[0]!.click();
    await estabilizar(fixture);
    expect(botao(el, 'Salvar').disabled).toBe(true);
  });

  describe('nos Ajustes, a parte Grupos', () => {
    async function naParte(mais = comGrupos) {
      const m = await montar(false, mais);
      botao(m.el, 'Ajustes').click();
      await estabilizar(m.fixture);
      [...m.el.querySelectorAll<HTMLElement>('[role=tab]')].find((t) => t.textContent!.includes('Grupos'))!.click();
      await estabilizar(m.fixture);
      return m;
    }
    const linhaDe = (el: HTMLElement, nome: string) => [...el.querySelectorAll<HTMLElement>('.linha')].find((l) => l.querySelector('.nome-do-grupo')?.textContent!.trim() === nome)!;
    const escrever = (el: HTMLElement, texto: string) => {
      const campo = el.querySelector<HTMLInputElement>('#g-grupo-nome')!;
      campo.value = texto;
      campo.dispatchEvent(new Event('input'));
    };
    const doGrupo = async (api: ApiNaMemoria, cofre: CofreAberto, titulo: string) =>
      (await lerItens(api, { ...cofre, manifesto: { ...cofre.manifesto } })).find((i) => i.item?.titulo === titulo)!.item!.grupo;
    const doisNaCasa = [...comGrupos, { ...vazio, titulo: 'Portão', grupo: 'Casa' }];

    it('lista os grupos com quantas senhas cada um tem', async () => {
      const { el } = await naParte(doisNaCasa);
      expect([...el.querySelectorAll('.nome-do-grupo')].map((n) => n.textContent!.trim())).toEqual(['Bancos', 'Casa', 'trabalho']);
      expect(linhaDe(el, 'Casa').textContent).toContain('2 senhas');
    });

    it('renomear muda o nome em todas as senhas do grupo, e a pasta fica com o nome novo', async () => {
      const { fixture, el, api, cofre } = await naParte(doisNaCasa);
      botao(linhaDe(el, 'Casa'), /Renomear/).click();
      await estabilizar(fixture);
      escrever(el, 'Minha casa');
      await estabilizar(fixture);
      const gravar = el.querySelector<HTMLButtonElement>('form.linha button[type=submit]')!;
      expect(gravar.textContent!.trim()).toBe('Renomear');
      gravar.click();
      await estabilizar(fixture);
      expect(await doGrupo(api, cofre, 'Alarme')).toBe('Minha casa');
      expect(await doGrupo(api, cofre, 'Portão')).toBe('Minha casa');
      expect(el.querySelector('.bilhete')!.textContent).toContain('Casa agora se chama Minha casa');
      expect([...el.querySelectorAll('.nome-do-grupo')].map((n) => n.textContent!.trim())).toEqual(['Bancos', 'Minha casa', 'trabalho']);
    });

    it('renomear para um grupo que existe junta os dois', async () => {
      const { fixture, el, api, cofre } = await naParte();
      botao(linhaDe(el, 'trabalho'), /Renomear/).click();
      await estabilizar(fixture);
      escrever(el, 'bancos');
      await estabilizar(fixture);
      expect(el.textContent).toContain('Já existe o grupo Bancos');
      botao(el, 'Juntar').click();
      await estabilizar(fixture);
      expect(await doGrupo(api, cofre, 'Repositório')).toBe('Bancos');
      expect(linhaDe(el, 'Bancos').textContent).toContain('2 senhas');
      expect(el.querySelector('.bilhete')!.textContent).toContain('trabalho juntado com Bancos');
    });

    it('apagar pergunta antes e só tira o grupo: as senhas continuam no cofre', async () => {
      const { fixture, el, api, cofre } = await naParte(doisNaCasa);
      botao(linhaDe(el, 'Casa'), /Apagar/).click();
      await estabilizar(fixture);
      expect(el.textContent).toContain('Tirar Casa das 2 senhas?');
      expect(await doGrupo(api, cofre, 'Alarme')).toBe('Casa');
      botao(el, 'Apagar o grupo').click();
      await estabilizar(fixture);
      expect(await doGrupo(api, cofre, 'Alarme')).toBe('');
      expect(await doGrupo(api, cofre, 'Portão')).toBe('');
      expect(api.guardados.size).toBe(6);
      expect([...el.querySelectorAll('.nome-do-grupo')].map((n) => n.textContent!.trim())).toEqual(['Bancos', 'trabalho']);
    });

    it('sem grupos, diz como criar um', async () => {
      const { el } = await naParte([]);
      expect(el.textContent).toContain('Nenhum grupo ainda');
    });
  });

  describe('os ícones (a cartela do site)', () => {
    const doItem = async (api: ApiNaMemoria, cofre: CofreAberto, titulo: string) =>
      (await lerItens(api, { ...cofre, manifesto: { ...cofre.manifesto } })).find((i) => i.item?.titulo === titulo)!.item!;

    it('a senha ganha um ícone da cartela e uma cor, que ficam no selo; a letra e a cor do nome voltam pelas primeiras escolhas', async () => {
      const { fixture, el, api, cofre } = await montar(false, comGrupos);
      abrir(el, 'Alarme');
      await estabilizar(fixture);
      botao(el, 'Editar').click();
      await estabilizar(fixture);
      botao(el, /Escolher ícone e cor/).click();
      await estabilizar(fixture);
      const cartela = () => [...el.querySelectorAll<HTMLButtonElement>('#item-cartela .icone')];
      expect(cartela().length).toBe(111);
      expect(cartela()[0]!.getAttribute('aria-pressed')).toBe('true');
      const cores = () => [...el.querySelectorAll<HTMLButtonElement>('#item-cartela .selo')];
      expect(cores().map((b) => b.getAttribute('aria-label'))).toEqual(['Pelo nome', 'Amarelo', 'Azul', 'Verde', 'Rosa', 'Laranja', 'Lilás', 'Vermelho', 'Cinza', 'Preto']);
      expect(cores()[0]!.getAttribute('aria-pressed')).toBe('true');
      cartela().find((b) => b.title === 'Sino')!.click();
      cores().find((b) => b.title === 'Lilás')!.click();
      await estabilizar(fixture);
      // escolher não fecha: são duas escolhas; o selo da edição já mostra as duas
      expect(el.querySelector('.selo-botao cofre-monograma')!.getAttribute('data-cor')).toBe('lilas');
      botao(el, /Pronto/).click();
      await estabilizar(fixture);
      expect(el.querySelector('#item-cartela')).toBeNull();
      // o foco volta ao selo, de onde a cartela abriu
      expect(document.activeElement).toBe(el.querySelector('.selo-botao'));
      botao(el, 'Salvar').click();
      await estabilizar(fixture);
      expect([(await doItem(api, cofre, 'Alarme')).icone, (await doItem(api, cofre, 'Alarme')).cor]).toEqual(['sino', 'lilas']);
      const linha = [...el.querySelectorAll('.linha')].find((l) => l.textContent!.includes('Alarme'))!;
      expect(linha.querySelector('cofre-monograma cofre-icone')).not.toBeNull();
      expect(linha.querySelector('cofre-monograma')!.getAttribute('data-cor')).toBe('lilas');
      botao(el, 'Editar').click();
      await estabilizar(fixture);
      botao(el, /Trocar o ícone e a cor/).click();
      await estabilizar(fixture);
      cartela()[0]!.click();
      cores()[0]!.click();
      await estabilizar(fixture);
      botao(el, 'Salvar').click();
      await estabilizar(fixture);
      expect([(await doItem(api, cofre, 'Alarme')).icone, (await doItem(api, cofre, 'Alarme')).cor]).toEqual(['', '']);
    });

    it('nos Ajustes, o ícone e a cor do grupo vão para todas as senhas dele, e a orelha da pasta os mostra', async () => {
      const { fixture, el, api, cofre } = await montar(false, [...comGrupos, { ...vazio, titulo: 'Portão', grupo: 'Casa' }]);
      botao(el, 'Ajustes').click();
      await estabilizar(fixture);
      [...el.querySelectorAll<HTMLElement>('[role=tab]')].find((t) => t.textContent!.includes('Grupos'))!.click();
      await estabilizar(fixture);
      const linhaCasa = [...el.querySelectorAll<HTMLElement>('.linha')].find((l) => l.querySelector('.nome-do-grupo')?.textContent!.trim() === 'Casa')!;
      botao(linhaCasa, /Ícone e cor/).click();
      await estabilizar(fixture);
      // o Esc fecha a cartela do grupo e devolve o foco ao botão dela
      el.querySelector('.vestir')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await estabilizar(fixture);
      expect(el.querySelector('.vestir')).toBeNull();
      expect(document.activeElement).toBe(linhaCasa.querySelector('[data-vestir]'));
      botao(linhaCasa, /Ícone e cor/).click();
      await estabilizar(fixture);
      el.querySelector<HTMLButtonElement>('.vestir button[title="Prédio"]')!.click();
      el.querySelector<HTMLButtonElement>('.vestir button[title="Azul"]')!.click();
      await estabilizar(fixture);
      botao(el.querySelector('.vestir')!, 'Salvar').click();
      await estabilizar(fixture);
      for (const titulo of ['Alarme', 'Portão']) {
        const item = await doItem(api, cofre, titulo);
        expect([item.grupoIcone, item.grupoCor]).withContext(titulo).toEqual(['predio', 'azul']);
      }
      expect(el.querySelector('.bilhete')!.textContent).toContain('Casa está com o ícone e a cor novos');
      botao(el, /Voltar às senhas/).click();
      await estabilizar(fixture);
      const pasta = orelha(el, 'Casa').closest<HTMLElement>('.pasta')!;
      expect(pasta.classList).toContain('com-cor');
      expect(pasta.style.getPropertyValue('--cor-do-grupo')).toBe('#2d8bd6');
      expect(orelha(el, 'Casa').querySelector('cofre-icone.icone-do-grupo')).not.toBeNull();
    });

    it('a senha posta num grupo leva o jeito dele; juntar dois grupos fica com o jeito do que recebe', async () => {
      const vestidos = [
        { ...vazio, titulo: 'Cartão', grupo: 'Bancos', grupoIcone: 'moedas' as const, grupoCor: 'verde' as const },
        { ...vazio, titulo: 'Alarme', grupo: 'Casa', grupoIcone: 'predio' as const, grupoCor: 'azul' as const },
      ];
      const { fixture, el, api, cofre } = await montar(false, vestidos);
      abrir(el, 'Banco');
      await estabilizar(fixture);
      botao(el, 'Editar').click();
      await estabilizar(fixture);
      escolhas(el).find((b) => b.textContent!.includes('Bancos'))!.click();
      await estabilizar(fixture);
      botao(el, 'Salvar').click();
      await estabilizar(fixture);
      const banco = await doItem(api, cofre, 'Banco');
      expect([banco.grupo, banco.grupoIcone, banco.grupoCor]).toEqual(['Bancos', 'moedas', 'verde']);
      botao(el, 'Ajustes').click();
      await estabilizar(fixture);
      [...el.querySelectorAll<HTMLElement>('[role=tab]')].find((t) => t.textContent!.includes('Grupos'))!.click();
      await estabilizar(fixture);
      const linhaCasa = [...el.querySelectorAll<HTMLElement>('.linha')].find((l) => l.querySelector('.nome-do-grupo')?.textContent!.trim() === 'Casa')!;
      botao(linhaCasa, /Renomear/).click();
      await estabilizar(fixture);
      const campo = el.querySelector<HTMLInputElement>('#g-grupo-nome')!;
      campo.value = 'Bancos';
      campo.dispatchEvent(new Event('input'));
      await estabilizar(fixture);
      botao(el, 'Juntar').click();
      await estabilizar(fixture);
      const alarme = await doItem(api, cofre, 'Alarme');
      expect([alarme.grupo, alarme.grupoIcone, alarme.grupoCor]).toEqual(['Bancos', 'moedas', 'verde']);
    });
  });
});

describe('várias senhas num item, e as que pedem a passkey de novo', () => {
  afterEach(() => TestBed.resetTestingModule());

  const facebook: CamposDoItem = {
    titulo: 'Facebook',
    rotulo: 'Conta pessoal',
    usuario: 'eu@email.com',
    senha: 'pessoal-1',
    outras: [
      { rotulo: 'Página da loja', usuario: 'loja@email.com', senha: 'loja-2', protegida: false },
      { rotulo: 'Códigos de recuperação', usuario: '', senha: 'codigo-3', protegida: true },
    ],
    url: '',
    descricao: '',
  };
  const comPasskey = { passkeys: [{ id: PASSKEY }] };
  const abrir = async (fixture: ComponentFixture<Aberto>, el: HTMLElement, nome: RegExp) => {
    botao(el, nome).click();
    await estabilizar(fixture);
  };
  const nomes = (el: HTMLElement) => [...el.querySelectorAll('.entrada-nome')].map((h) => h.textContent!.trim());
  const escrever = (el: HTMLElement, seletor: string, valor: string) => {
    const campo = el.querySelector<HTMLInputElement>(seletor)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
  };

  it('cada entrada com o nome dela; copiar a de baixo copia a dela; a lista diz quantas mais e a busca acha as outras', async () => {
    const { fixture, el, copias } = await montar(false, [facebook], comPasskey);
    expect(el.querySelector('.mais-senhas')!.textContent).toContain('+2');
    await abrir(fixture, el, /Facebook/);
    expect(nomes(el)).toEqual(['Conta pessoal', 'Página da loja', 'Códigos de recuperação']);
    const loja = el.querySelectorAll('.entrada')[1]!;
    [...loja.querySelectorAll('button')].filter((b) => b.textContent!.trim() === 'Copiar')[1]!.click();
    await estabilizar(fixture);
    expect(copias).toEqual(['loja-2']);
    expect(el.querySelector('.bilhete')!.textContent).toContain('Senha de Página da loja copiada');
    // um item de uma senha só continua sem títulos
    await abrir(fixture, el, /Banco/);
    expect(nomes(el)).toEqual([]);
    const busca = el.querySelector<HTMLInputElement>('#busca')!;
    for (const q of ['loja@', 'recuperacao']) {
      busca.value = q;
      busca.dispatchEvent(new Event('input'));
      await estabilizar(fixture);
      expect(titulos(el)).withContext(q).toEqual(['Facebook']);
    }
  });

  it('a protegida fica travada até a passkey; destravada, aparece e copia; trava de novo pelo botão e ao trocar de item', async () => {
    const { fixture, el, copias, passkey } = await montar(false, [facebook], comPasskey);
    await abrir(fixture, el, /Facebook/);
    const codigos = () => el.querySelectorAll('.entrada')[2]!;
    expect(codigos().querySelector('.carimbo')!.textContent).toContain('Pede a passkey');
    expect(codigos().querySelector('[aria-label="Revelar a senha"]')).toBeNull();
    // cancelou: diz, e oferece tentar de novo (sem a senha mestra: este cofre não tem os segredos)
    passkey.proxima = new DOMException('não', 'NotAllowedError');
    botao(el, /Destravar/).click();
    await estabilizar(fixture);
    expect(el.querySelector('.erro-confirmar')!.textContent).toContain('não foi confirmada');
    expect(botao(el, /Usar a senha mestra/)).toBeUndefined();
    // a passkey sem a pessoa conferida (sem UV) também não destrava
    passkey.proxima = assinada(0x01);
    botao(el, /Tentar a passkey de novo/).click();
    await estabilizar(fixture);
    expect(codigos().querySelector('.carimbo')).not.toBeNull();
    passkey.proxima = assinada();
    botao(el, /Tentar a passkey de novo/).click();
    await estabilizar(fixture);
    expect(passkey.pedidos).toBe(3);
    expect(codigos().querySelector('.carimbo')).toBeNull();
    expect(document.activeElement).toBe(codigos().querySelector('.olho'));
    [...codigos().querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Copiar')!.click();
    await estabilizar(fixture);
    expect(copias).toEqual(['codigo-3']);
    botao(el, /Travar de novo/).click();
    await estabilizar(fixture);
    expect(codigos().querySelector('.carimbo')).not.toBeNull();
    // destrava, troca de item e volta: travada de novo
    botao(el, /Destravar/).click();
    await estabilizar(fixture);
    await abrir(fixture, el, /Banco/);
    await abrir(fixture, el, /Facebook/);
    expect(codigos().querySelector('.carimbo')).not.toBeNull();
    expect(el.textContent).not.toContain('codigo-3');
  });

  it('destravada, trava sozinha depois de 2 minutos', async () => {
    const { fixture, el } = await montar(false, [facebook], comPasskey);
    await abrir(fixture, el, /Facebook/);
    jasmine.clock().install();
    try {
      botao(el, /Destravar/).click();
      for (let i = 0; i < 6; i++) await Promise.resolve();
      fixture.detectChanges();
      expect(el.querySelector('.carimbo')).toBeNull();
      jasmine.clock().tick(120_000);
      fixture.detectChanges();
      expect(el.querySelector('.carimbo')).not.toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('sem passkey neste aparelho, a senha mestra destrava; errada, diz', async () => {
    const segredos = { m: aleatorios(32), v: aleatorios(60), sal: aleatorios(16), kdf: { m: 65536, t: 3, p: 1 } };
    const { fixture, el } = await montar(false, [facebook], { segredos });
    await abrir(fixture, el, /Facebook/);
    botao(el, /Destravar/).click();
    await estabilizar(fixture);
    expect(document.activeElement).toBe(el.querySelector('#item-senha-mestra'));
    expect(el.textContent).toContain('aberto sem passkey neste aparelho');
    escrever(el, '#item-senha-mestra', 'chute');
    await estabilizar(fixture);
    el.querySelector<HTMLFormElement>('.senha-mestra')!.dispatchEvent(new Event('submit', { cancelable: true }));
    for (let i = 0; i < 40 && !el.querySelector('.erro-confirmar'); i++) await estabilizar(fixture);
    expect(el.querySelector('.erro-confirmar')!.textContent).toContain('Não é a senha mestra');
    // "Agora não" fecha o bilhete
    botao(el, 'Agora não').click();
    await estabilizar(fixture);
    expect(el.querySelector('.confirmar')).toBeNull();
  });

  it('a passkey pedida numa senha e confirmada depois de abrir outra não destrava a outra', async () => {
    const outra: CamposDoItem = { titulo: 'Cofrinho', usuario: 'eu', senha: 'cofrinho-9', url: '', descricao: '', protegida: true };
    const { fixture, el, passkey } = await montar(false, [facebook, outra], comPasskey);
    let soltar: (c: Credential) => void = () => undefined;
    passkey.proxima = new Promise<Credential>((ok) => (soltar = ok)) as unknown as Credential;
    await abrir(fixture, el, /Facebook/);
    botao(el, /Destravar/).click();
    await estabilizar(fixture);
    expect(passkey.pedidos).toBe(1);
    // enquanto o aparelho pede a digital, a pessoa abre outra senha protegida no quadro
    await abrir(fixture, el, /Cofrinho/);
    soltar(assinada());
    await estabilizar(fixture);
    expect(el.querySelector('h2')!.textContent).toContain('Cofrinho');
    expect(el.querySelector('.carimbo')).not.toBeNull();
    expect(el.querySelector('[aria-label="Revelar a senha"]')).toBeNull();
    expect(el.querySelector('.erro-confirmar')).toBeNull();
  });

  it('a senha protegida da primeira entrada não se copia pela lista: o botão abre o item', async () => {
    const { fixture, el, copias } = await montar(false, [{ titulo: 'Cofre do banco', usuario: 'eu', senha: 'forte-9', url: '', descricao: '', protegida: true }], comPasskey);
    const senha = el.querySelector<HTMLButtonElement>('[aria-label="A senha de Cofre do banco pede a passkey: abrir"]')!;
    senha.click();
    await estabilizar(fixture);
    expect(copias).toEqual([]);
    expect(el.querySelector('h2')!.textContent).toContain('Cofre do banco');
    expect(el.querySelector('.carimbo')).not.toBeNull();
  });

  it('Editar pede a passkey antes; a edição põe outra senha com nome, protege e tira, e o salvo guarda tudo', async () => {
    const { fixture, el, api, cofre, passkey } = await montar(false, [facebook], comPasskey);
    await abrir(fixture, el, /Facebook/);
    botao(el, 'Editar').click();
    await estabilizar(fixture);
    expect(passkey.pedidos).toBe(1);
    expect(el.querySelector<HTMLInputElement>('#item-senha-2')!.value).toBe('codigo-3');
    // tira a da loja e põe uma pergunta de segurança, protegida
    el.querySelector<HTMLButtonElement>('[aria-label="Tirar Página da loja"]')!.click();
    await estabilizar(fixture);
    botao(el, /Outra senha neste item/).click();
    await estabilizar(fixture);
    expect(document.activeElement).toBe(el.querySelector('#item-rotulo-2'));
    escrever(el, '#item-rotulo-2', 'Nome do primeiro pet');
    escrever(el, '#item-senha-2', 'Rex');
    await estabilizar(fixture);
    el.querySelectorAll<HTMLButtonElement>('[role=switch]')[2]!.click();
    await estabilizar(fixture);
    botao(el, 'Salvar').click();
    await estabilizar(fixture);
    const salvo = (await lerItens(api, { ...cofre, manifesto: { ...cofre.manifesto } })).find((i) => i.item?.titulo === 'Facebook')!.item!;
    expect(salvo.outras).toEqual([
      { rotulo: 'Códigos de recuperação', usuario: '', senha: 'codigo-3', protegida: true },
      { rotulo: 'Nome do primeiro pet', usuario: '', senha: 'Rex', protegida: true },
    ]);
    expect([salvo.rotulo, salvo.usuario, salvo.senha, salvo.protegida]).toEqual(['Conta pessoal', 'eu@email.com', 'pessoal-1', false]);
    // depois de salvar, continua destravado (os 2 minutos contam de novo)
    expect(nomes(el)).toEqual(['Conta pessoal', 'Códigos de recuperação', 'Nome do primeiro pet']);
    expect(el.querySelector('.carimbo')).toBeNull();
  });

  it('uma senha nova sem nada além de "pede a passkey" não guarda; com uma só entrada, sem campo de nome', async () => {
    const { fixture, el } = await montar(false, [], comPasskey);
    botao(el, /Nova senha/).click();
    await estabilizar(fixture);
    expect(el.querySelector('#item-rotulo-0')).toBeNull();
    el.querySelector<HTMLButtonElement>('[role=switch]')!.click();
    await estabilizar(fixture);
    expect(botao(el, 'Salvar').disabled).toBeTrue();
  });

  it('conferir as vazadas olha todas as entradas, e o aviso fica na entrada que vazou', async () => {
    const vazouNaReserva: CamposDoItem = { titulo: 'Jogo', usuario: 'eu', senha: 'nova', url: '', descricao: '', outras: [{ rotulo: 'Reserva', usuario: '', senha: 'segredo-1', protegida: false }] };
    const { fixture, el } = await montar(false, [vazouNaReserva], comPasskey);
    botao(el, 'Ajustes').click();
    await estabilizar(fixture);
    [...el.querySelectorAll<HTMLElement>('[role=tab]')].find((t) => t.textContent!.includes('Senhas vazadas'))!.click();
    await estabilizar(fixture);
    botao(el, 'Conferir senhas vazadas').click();
    for (let i = 0; i < 20 && !el.textContent!.includes('42 vezes'); i++) await estabilizar(fixture);
    expect(el.querySelector('.bilhete')!.textContent).toContain('2 senhas apareceram em vazamentos');
    botao(el, 'Voltar às senhas').click();
    await estabilizar(fixture);
    await abrir(fixture, el, /Jogo/);
    const vazadas = [...el.querySelectorAll('.vazada')];
    expect(vazadas.length).toBe(1);
    expect(vazadas[0]!.closest('.entrada')!.querySelector('.entrada-nome')!.textContent).toContain('Reserva');
  });
});
