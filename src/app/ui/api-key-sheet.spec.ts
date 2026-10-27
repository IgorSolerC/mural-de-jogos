import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SEGREDO_RE, montarSegredo } from '../../../contrato/api-v1/segredo';
import { ApiKeyInfo, ApiKeyInput, ApiKeys } from '../core/api-keys';
import { Cloud } from '../core/cloud-config';
import { CloudError } from '../core/cloud-account';
import { nextClose } from '../testing/dialog-close.spec';
import { KanbanStore } from '../core/kanban-store';
import { ApiKeySheet } from './api-key-sheet';
import { Confirm } from './confirm';

/**
 * A folha da chave de API (Ajustes › Acessos): criar com os atalhos, os grupos e a validade; o segredo
 * uma vez, com Copiar e o teste; fechar sem copiar pergunta; mudar uma chave; e o segredo nunca vai
 * para o armazenamento do navegador.
 */
describe('a folha da chave de API (ApiKeySheet)', () => {
  const SECRET = montarSegredo('Q3N0abcdefghijklmnopqrstuvwxyz-_0123456789Z');
  const KEY: ApiKeyInfo = {
    id: 'ch_AAAAAAAAAAAAAAAA',
    nome: 'Claude, os gastos',
    origem: 'manual',
    escopos: ['gastos:ler', 'gastos:lancar'],
    grupos: null,
    aprovacao: 'mudancas',
    criadaEm: '2026-10-27T12:00:00.000Z',
    expiraEm: '2027-01-25T12:00:00.000Z',
    usadaEm: null,
  };
  let created: ApiKeyInput[];
  let updated: { id: string; input: unknown }[];
  let failNext: string | null;

  async function open(editing: ApiKeyInfo | null = null) {
    created = [];
    updated = [];
    failNext = null;
    const keys = {
      create: async (input: ApiKeyInput) => {
        if (failNext) throw new CloudError(failNext, 'chaves-demais', 409);
        created.push(input);
        return { chave: { ...KEY, nome: input.nome, escopos: input.escopos }, segredo: SECRET };
      },
      update: async (id: string, input: unknown) => {
        updated.push({ id, input });
        return KEY;
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ApiKeys, useValue: keys },
        { provide: KanbanStore, useValue: { categories: signal([{ key: 'trabalho', label: 'Trabalho', notes: 3 }, { key: 'estudos', label: 'Estudos', notes: 1 }]) } },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: 'https://api.teste', googleClientId: 'x' }), notice: () => null } },
      ],
    });
    const fixture = TestBed.createComponent(ApiKeySheet);
    fixture.componentRef.setInput('editing', editing);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
    };
    await settle();
    const button = (text: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === text);
    const box = (name: string) =>
      [...el.querySelectorAll<HTMLLabelElement>('label.caixa')].find((l) => l.querySelector('.caixa-nome')!.textContent!.trim() === name)!.querySelector('input')!;
    const typeName = (v: string) => {
      const input = el.querySelector<HTMLInputElement>('#chave-nome')!;
      input.value = v;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      el.querySelector<HTMLFormElement>('form')!.requestSubmit();
      await settle();
    };
    return { fixture, el, settle, button, box, typeName, submit, closed: () => closed };
  }

  afterEach(() => {
    document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());
  });

  it('abre com o nome em foco, nada marcado, a aprovação padrão e 90 dias', async () => {
    const { el } = await open();
    expect(el.querySelector('h2')!.textContent).toBe('Nova chave');
    expect(el.querySelector('dialog')!.open).toBeTrue();
    expect(document.activeElement?.id).toBe('chave-nome');
    expect(el.querySelectorAll('label.caixa input:checked').length).toBe(0);
    const checked = (name: string) => el.querySelector<HTMLInputElement>(`input[name=${name}]:checked`)!.closest('label')!;
    expect(checked('chave-aprovacao').textContent!.trim()).toBe('Antes de mudar ou apagar');
    expect(checked('chave-validade').querySelector('.seg-num')!.textContent).toBe('90');
    // sem nada das anotações marcado, os grupos não aparecem
    expect(el.textContent).not.toContain('Em que grupos das Anotações');
  });

  it('sem nome nem permissão, diz o que falta e não cria', async () => {
    const t = await open();
    await t.submit();
    expect(created).toEqual([]);
    expect(t.el.querySelector('#chave-nome')!.getAttribute('aria-invalid')).toBe('true');
    expect(t.el.textContent).toContain('Marque pelo menos uma permissão.');
  });

  it('o atalho marca as caixas e fica colado enquanto bate; os grupos aparecem com as anotações', async () => {
    const t = await open();
    t.button('Assistente das anotações')!.click();
    await t.settle();
    expect(t.button('Assistente das anotações')!.getAttribute('aria-pressed')).toBe('true');
    expect(t.box('Cadastrar notas').checked).toBeTrue();
    expect(t.box('Alterar calendário').checked).toBeTrue();
    expect(t.box('Apagar notas').checked).toBeFalse();
    expect(t.el.textContent).toContain('Em que grupos das Anotações');
    t.box('Apagar notas').click();
    await t.settle();
    expect(t.button('Assistente das anotações')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('cria com o que foi escolhido e mostra o segredo uma vez, sem guardar no navegador', async () => {
    const before = { local: localStorage.length, session: sessionStorage.length };
    const t = await open();
    t.typeName('  Claude,   os gastos ');
    t.button('Lançar gastos')!.click();
    await t.settle();
    t.box('Ler anotações').click();
    await t.settle();
    // só alguns grupos: Trabalho
    [...t.el.querySelectorAll<HTMLInputElement>('input[name=chave-grupos]')][1]!.click();
    await t.settle();
    t.box('Trabalho').click();
    [...t.el.querySelectorAll<HTMLInputElement>('input[name=chave-aprovacao]')].find((i) => i.closest('label')!.textContent!.includes('Antes de tudo'))!.click();
    [...t.el.querySelectorAll<HTMLInputElement>('input[name=chave-validade]')][0]!.click();
    await t.settle();
    expect(t.el.textContent).toContain('Vale até');
    await t.submit();
    await t.settle();
    expect(created).toEqual([
      { nome: 'Claude, os gastos', escopos: ['notas:ler', 'gastos:ler', 'gastos:lancar'], grupos: ['Trabalho'], aprovacao: 'tudo', validade: 7 },
    ]);
    expect(t.el.querySelector('h2')!.textContent).toBe('Chave criada');
    const field = t.el.querySelector<HTMLInputElement>('.campo.segredo input')!;
    expect(field.value).toBe(SECRET);
    expect(field.value).toMatch(SEGREDO_RE);
    expect(field.readOnly).toBeTrue();
    expect(t.el.querySelector('pre')!.textContent).toBe(`export MURALL_TOKEN='${SECRET}'\ncurl -H "Authorization: Bearer $MURALL_TOKEN" https://api.teste/ext/v1/eu`);
    expect(document.activeElement?.classList.contains('copiar')).withContext('o foco vai para o Copiar').toBeTrue();
    // nada do segredo no armazenamento do navegador (regra do CLAUDE.md: sair limpa tudo)
    expect({ local: localStorage.length, session: sessionStorage.length }).toEqual(before);
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) expect(store.getItem(store.key(i)!) ?? '').not.toContain(SECRET.slice(7, 30));
    }
  });

  it('copiar a chave e o teste; depois de copiar, fecha sem perguntar e o segredo some', async () => {
    const copied: string[] = [];
    spyOn(navigator.clipboard, 'writeText').and.callFake(async (v: string) => void copied.push(v));
    const t = await open();
    t.typeName('Teste');
    t.box('Ver os gastos').click();
    await t.submit();
    await t.settle();
    t.el.querySelector<HTMLButtonElement>('.copiar')!.click();
    await t.settle();
    expect(copied).toEqual([SECRET]);
    expect(t.el.querySelector('.copiar')!.textContent).toContain('Copiada');
    t.el.querySelector<HTMLButtonElement>('.copiar-codigo')!.click();
    await t.settle();
    expect(copied[1]).toContain('curl');
    const shut = nextClose(t.el.querySelector('dialog')!);
    t.button('Pronto')!.click();
    await shut;
    await t.settle();
    expect(TestBed.inject(Confirm).current()).toBeNull();
    expect(t.el.querySelector('dialog')!.open).toBeFalse();
    expect(t.closed()).toBe(1);
    expect(t.el.textContent).not.toContain(SECRET);
  });

  it('fechar sem copiar pergunta; "Voltar e copiar" deixa a folha aberta', async () => {
    const t = await open();
    t.typeName('Teste');
    t.box('Ver os gastos').click();
    await t.submit();
    await t.settle();
    t.button('Pronto')!.click();
    await t.settle();
    const confirm = TestBed.inject(Confirm);
    expect(confirm.current()?.title).toBe('Fechar sem copiar?');
    confirm.answer(false);
    await t.settle();
    expect(t.el.querySelector('dialog')!.open).toBeTrue();
    // o Esc também passa pela pergunta
    t.el.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await t.settle();
    expect(confirm.current()?.title).toBe('Fechar sem copiar?');
    confirm.answer(true);
    await t.settle();
    expect(t.el.querySelector('dialog')!.open).toBeFalse();
  });

  it('o erro da nuvem aparece na folha, que continua aberta', async () => {
    const t = await open();
    failNext = 'Já são 20 chaves nesta conta. Apague uma que não usa mais.';
    t.typeName('Mais uma');
    t.box('Ver os gastos').click();
    await t.submit();
    await t.settle();
    expect(t.el.querySelector('.msg-erro')!.textContent).toContain('Já são 20 chaves');
    expect(t.el.querySelector('h2')!.textContent).toBe('Nova chave');
  });

  it('mudar: vem preenchida, sem a validade, e salva sem segredo', async () => {
    const t = await open({ ...KEY, escopos: ['notas:ler'], grupos: ['Estudos', 'Sumido'], aprovacao: 'nunca' });
    expect(t.el.querySelector('h2')!.textContent).toBe('Mudar a chave');
    expect(t.el.querySelector('.sub')!.textContent).toContain('Vale até');
    expect(t.el.querySelector<HTMLInputElement>('#chave-nome')!.value).toBe('Claude, os gastos');
    expect(t.box('Ler anotações').checked).toBeTrue();
    expect(t.el.textContent).not.toContain('Validade');
    // o grupo que sumiu das anotações continua na lista, marcado
    expect(t.box('Sumido').checked).toBeTrue();
    expect(t.box('Estudos').checked).toBeTrue();
    expect(t.box('Trabalho').checked).toBeFalse();
    t.box('Sumido').click();
    await t.settle();
    t.button('Salvar')!.click();
    await t.settle();
    expect(updated).toEqual([{ id: KEY.id, input: { nome: 'Claude, os gastos', escopos: ['notas:ler'], grupos: ['Estudos'], aprovacao: 'nunca' } }]);
    expect(t.el.querySelector('dialog')!.open).toBeFalse();
  });
});
