import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CofreAberto } from '../../core/abrir';
import { ApiCofre, ErroApi, type Gravacao, type ItensDaApi } from '../../core/api';
import { aleatorios, paraBase64url } from '../../core/bytes';
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

async function montar(recuperada = false, mais: readonly CamposDoItem[] = []) {
  const api = new ApiNaMemoria();
  const { chave } = await criarCofre(aleatorios(32), novaChaveDoMeio(), USUARIO);
  const manifesto = { contador: 0, itens: {}, lixeira: {}, mudadoEm: '2026-10-21T14:32:00.000Z', aparelho: 'Celular' };
  api.manifesto = paraBase64url(await cifrarManifesto(chave, USUARIO, manifesto));
  const cofre: CofreAberto = { usuario: USUARIO, chave, manifesto, contador: 0, recuperada, expiraEm: new Date(Date.now() + 3_600_000).toISOString(), paradaMaxima: 600, aparelho: 'PC' };
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

describe('as pastas do cofre (os grupos)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const vazio = { usuario: '', senha: 'x', url: '', descricao: '' };
  const comGrupos = [
    { ...vazio, titulo: 'Cartão', grupo: 'Bancos' },
    { ...vazio, titulo: 'Alarme', grupo: 'Casa' },
    { ...vazio, titulo: 'Repositório', grupo: 'trabalho' },
  ];
  const orelhas = (el: HTMLElement) => [...el.querySelectorAll('.orelha .orelha-nome')].map((o) => o.textContent!.trim());
  const orelha = (el: HTMLElement, nome: string) => [...el.querySelectorAll<HTMLButtonElement>('.orelha')].find((o) => o.querySelector('.orelha-nome')!.textContent!.trim() === nome)!;
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

  it('a orelha fecha e abre a pasta; a busca acha dentro das fechadas, também pelo nome do grupo', async () => {
    const { fixture, el } = await montar(false, comGrupos);
    orelha(el, 'Casa').click();
    await estabilizar(fixture);
    expect(orelha(el, 'Casa').getAttribute('aria-expanded')).toBe('false');
    expect(titulos(el)).not.toContain('Alarme');
    const busca = el.querySelector<HTMLInputElement>('#busca')!;
    busca.value = 'casa';
    busca.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    // "casa" acha o Alarme pelo grupo (com a pasta fechada) e o Wi-Fi de casa pelo título
    expect(titulos(el)).toEqual(['Alarme', 'Wi-Fi de casa']);
    expect(orelha(el, 'Casa').getAttribute('aria-disabled')).toBe('true');
    busca.value = '';
    busca.dispatchEvent(new Event('input'));
    await estabilizar(fixture);
    expect(titulos(el)).not.toContain('Alarme');
    orelha(el, 'Casa').click();
    await estabilizar(fixture);
    expect(titulos(el)).toContain('Alarme');
  });

  it('editar: o grupo se escolhe com um toque nos que existem, e a senha vai para a pasta dele, que abre', async () => {
    const { fixture, el, api, cofre } = await montar(false, comGrupos);
    orelha(el, 'Casa').click();
    await estabilizar(fixture);
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
    expect(orelha(el, 'Casa').getAttribute('aria-expanded')).toBe('true');
    expect(naPasta(el, 'Casa')).toEqual(['Alarme', 'Banco']);
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
      expect(cartela().length).toBe(51);
      expect(cartela()[0]!.getAttribute('aria-pressed')).toBe('true');
      const cores = () => [...el.querySelectorAll<HTMLButtonElement>('#item-cartela .selo')];
      expect(cores().map((b) => b.getAttribute('aria-label'))).toEqual(['Pelo nome', 'Amarelo', 'Azul', 'Verde', 'Rosa', 'Laranja', 'Lilás']);
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
