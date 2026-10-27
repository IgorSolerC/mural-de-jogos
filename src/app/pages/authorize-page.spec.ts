import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ApiKeyInput, ApiKeys, ConnectorRequest } from '../core/api-keys';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { KanbanStore } from '../core/kanban-store';
import { AuthorizePage, IN_FRAME, hostOf } from './authorize-page';

/**
 * A página Autorizar (PLANO-API.md, 11.2): o pedido de um conector com o endereço de volta em destaque,
 * as escolhas começando com o que ele pediu, Permitir e Não permitir voltando ao aplicativo, e os
 * bilhetes (entrar, venceu, indisponível). Nada vai para o armazenamento do navegador.
 */
describe('a página Autorizar (AuthorizePage)', () => {
  const CLAUDE: ConnectorRequest = {
    id: 'op_AAAAAAAAAAAAAAAA',
    cliente: 'Claude',
    retorno: 'https://claude.ai/api/mcp/auth_callback',
    dominio: 'claude.ai',
    conhecido: 'Claude',
    local: false,
    escopos: ['notas:ler', 'notas:criar'],
    expiraEm: '2026-10-27T12:10:00.000Z',
  };
  let permitted: ApiKeyInput[];
  let refused: string[];
  let left: { para: string; permitiu: boolean }[];

  async function open(opts: { pedido?: ConnectorRequest | 'venceu'; signedIn?: boolean; disponivel?: boolean; query?: string | null; framed?: boolean } = {}) {
    permitted = [];
    refused = [];
    left = [];
    const pedido = opts.pedido ?? CLAUDE;
    const signedIn = signal(opts.signedIn ?? true);
    const keys = {
      connectorRequest: async () => {
        if (pedido === 'venceu') throw new CloudError('venceu', 'pedido-nao-encontrado', 404);
        return { disponivel: opts.disponivel ?? true, pedido };
      },
      permit: async (_id: string, input: ApiKeyInput) => {
        permitted.push(input);
        return { para: `${CLAUDE.retorno}?code=abc&state=xyz`, chave: {} };
      },
      refuse: async (id: string) => {
        refused.push(id);
        return { para: `${CLAUDE.retorno}?error=access_denied` };
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: IN_FRAME, useValue: opts.framed ?? false },
        { provide: ApiKeys, useValue: keys },
        { provide: CloudAccount, useValue: { signedIn, account: () => ({ nome: 'Igor', codigo: 'EEEE-0000' }), signIn: async () => signedIn.set(true) } },
        { provide: KanbanStore, useValue: { categories: signal([{ key: 'trabalho', label: 'Trabalho', notes: 3 }]) } },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: 'https://api.teste', googleClientId: 'x' }), notice: () => null } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(opts.query === null ? {} : { pedido: opts.query ?? CLAUDE.id }) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(AuthorizePage);
    // a volta ao aplicativo não sai da página do teste
    spyOn(fixture.componentInstance as unknown as { leave: (p: string, ok: boolean) => void }, 'leave').and.callFake((para: string, permitiu: boolean) =>
      left.push({ para, permitiu }),
    );
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      for (let i = 0; i < 3; i++) {
        fixture.detectChanges();
        await fixture.whenStable();
        await new Promise((r) => setTimeout(r, 0));
      }
      fixture.detectChanges();
    };
    await settle();
    const button = (text: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === text);
    const box = (name: string) =>
      [...el.querySelectorAll<HTMLLabelElement>('label.caixa')].find((l) => l.querySelector('.caixa-nome')!.textContent!.trim() === name)!.querySelector('input')!;
    return { fixture, el, settle, button, box, signedIn };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('mostra quem pediu e, em destaque, para onde volta, com o selo do endereço conhecido', async () => {
    const { el } = await open();
    expect(el.querySelector('h1')!.textContent).toContain('Claude quer acesso ao seu Murall');
    expect(el.querySelector('.dominio')!.textContent!.trim()).toBe('claude.ai');
    expect(el.querySelector('.selo')!.textContent).toContain('Conhecido');
    expect(el.querySelector('.destino')!.classList).not.toContain('estranho');
    expect(el.querySelector('.conta')!.textContent).toContain('Igor');
  });

  it('o endereço desconhecido vira o bilhete amarelo, sem selo; o do computador diz que é um programa daqui', async () => {
    const strange = await open({ pedido: { ...CLAUDE, retorno: 'https://outro.exemplo/cb', dominio: 'outro.exemplo', conhecido: null } });
    expect(strange.el.querySelector('.destino')!.classList).toContain('estranho');
    expect(strange.el.querySelector('.selo')).toBeNull();
    expect(strange.el.querySelector('.destino-diz')!.textContent).toContain('não conhece este endereço');
    TestBed.resetTestingModule();
    const local = await open({ pedido: { ...CLAUDE, retorno: 'http://localhost:33418/callback', dominio: 'localhost', conhecido: null, local: true } });
    expect(local.el.querySelector('.dominio')!.textContent!.trim()).toBe('localhost:33418');
    expect(local.el.querySelector('.destino')!.classList).not.toContain('estranho');
    expect(local.el.querySelector('.destino-diz')!.textContent).toContain('neste computador');
  });

  it('as escolhas começam com o que o aplicativo pediu e o nome dele; Permitir manda o escolhido e volta', async () => {
    const { el, box, settle } = await open();
    expect(el.querySelector<HTMLInputElement>('#chave-nome')!.value).toBe('Claude');
    expect(box('Ler anotações').checked).toBeTrue();
    expect(box('Cadastrar notas').checked).toBeTrue();
    expect(box('Alterar notas').checked).toBeFalse();
    box('Alterar notas').click();
    el.querySelector<HTMLFormElement>('form')!.requestSubmit();
    await settle();
    expect(permitted).toEqual([{ nome: 'Claude', escopos: ['notas:ler', 'notas:criar', 'notas:editar'], grupos: null, aprovacao: 'mudancas', validade: 90 }]);
    expect(left).toEqual([{ para: `${CLAUDE.retorno}?code=abc&state=xyz`, permitiu: true }]);
  });

  it('sem nenhuma permissão, não manda; Não permitir volta com o não', async () => {
    const { button, box, el, settle } = await open();
    box('Ler anotações').click();
    box('Cadastrar notas').click();
    el.querySelector<HTMLFormElement>('form')!.requestSubmit();
    await settle();
    expect(permitted).toEqual([]);
    expect(el.querySelector('.falta')!.textContent).toContain('pelo menos uma permissão');
    button('Não permitir')!.click();
    await settle();
    expect(refused).toEqual([CLAUDE.id]);
    expect(left[0]!.permitiu).toBeFalse();
  });

  it('sem conta: pede para entrar e abre o pedido depois de entrar', async () => {
    const { el, signedIn, settle } = await open({ signedIn: false });
    expect(el.querySelector('h1')!.textContent).toContain('Entre para continuar');
    expect(el.querySelector('app-google-button')).not.toBeNull();
    signedIn.set(true);
    await settle();
    expect(el.querySelector('.dominio')!.textContent!.trim()).toBe('claude.ai');
  });

  it('os bilhetes: pedido vencido, conta sem a API, endereço sem pedido', async () => {
    expect((await open({ pedido: 'venceu' })).el.querySelector('h1')!.textContent).toContain('Este pedido venceu');
    TestBed.resetTestingModule();
    expect((await open({ disponivel: false })).el.querySelector('h1')!.textContent).toContain('Ainda não para esta conta');
    TestBed.resetTestingModule();
    expect((await open({ query: null })).el.querySelector('h1')!.textContent).toContain('Nenhum pedido aqui');
  });

  it('dentro de um iframe, não deixa permitir (outro site poderia clicar por você)', async () => {
    const { el } = await open({ framed: true });
    expect(el.querySelector('h1')!.textContent).toContain('Abra numa aba própria');
    expect(el.querySelector('form')).toBeNull();
  });

  it('o endereço mostrado é o domínio, com a porta só quando tem', () => {
    expect(hostOf('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai');
    expect(hostOf('http://127.0.0.1:5000/cb')).toBe('127.0.0.1:5000');
    expect(hostOf('nada')).toBe('');
  });

  it('nada vai para o armazenamento do navegador', async () => {
    const before = { local: localStorage.length, session: sessionStorage.length };
    const { el, settle } = await open();
    el.querySelector<HTMLFormElement>('form')!.requestSubmit();
    await settle();
    expect({ local: localStorage.length, session: sessionStorage.length }).toEqual(before);
  });
});
