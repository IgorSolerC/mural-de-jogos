import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { NotaV1 } from '../../../contrato/api-v1/notas';
import { ApiRequests, SiteRequest } from '../core/api-requests';
import { ApiRequestsSheet, RequestsSheetMode } from './api-requests-sheet';
import { Confirm } from './confirm';

/**
 * A folha dos pedidos da API (Ajustes › Acessos): os que esperam, em palavras e com o que muda, com
 * Aprovar, Recusar e Aprovar os N; e o histórico de uma chave, com Desfazer e Desfazer tudo de hoje.
 */
describe('a folha dos pedidos da API (ApiRequestsSheet)', () => {
  const NOW = new Date().toISOString();
  const nota: NotaV1 = {
    id: 'r1', titulo: 'Reunião', texto: 'Pauta\n- [ ] Ligar', grupo: 'Trabalho', assunto: null, tags: [], data: null, finalizada_em: null, fixada: false,
    visibilidade: 'privada', capa: null, tarefas: { feitas: 0, total: 1 }, kanban: null, criada_em: NOW, versao: NOW,
  };
  const req = (id: string, op: string, extra: Partial<SiteRequest> = {}): SiteRequest =>
    ({ id, op, alvo: 'r1', dados: {}, estado: 'aguardando-aprovacao', criado_em: NOW, expira_em: NOW, resolvido_em: null, chave: { id: 'k1', nome: 'Claude' }, ...extra }) as SiteRequest;

  let calls: string[];
  let history: SiteRequest[];
  let askAnswer: boolean;

  async function open(mode: RequestsSheetMode, waiting: SiteRequest[] = []) {
    calls = [];
    askAnswer = true;
    const fake = {
      open: signal(waiting),
      refresh: async () => waiting,
      history: async () => history,
      titleOf: () => 'Reunião',
      preview: (r: SiteRequest) =>
        r.op === 'nota.editar' ? { before: nota, after: { ...nota, titulo: 'Reunião geral', texto: 'Pauta\n- [x] Ligar' } } : { before: nota, after: null },
      approve: async (id: string) => void calls.push(`aprovar ${id}`),
      refuse: async (id: string) => void calls.push(`recusar ${id}`),
      undo: async (t: { id: string }) => void calls.push(`desfazer ${t.id}`),
    };
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ApiRequests, useValue: fake }, { provide: Confirm, useValue: { ask: async () => askAnswer } }],
    });
    const fixture = TestBed.createComponent(ApiRequestsSheet);
    fixture.componentRef.setInput('mode', mode);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
    };
    await settle();
    const button = (text: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent!.trim() === text);
    return { el, settle, button };
  }

  afterEach(() => {
    document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());
  });

  it('os que esperam: em palavras, com o título de antes riscado, o texto que muda, e o foco no título da folha', async () => {
    const t = await open({ kind: 'esperando' }, [req('pd_a', 'nota.editar', { dados: { versao: NOW, titulo: 'Reunião geral', texto: 'x' } }), req('pd_b', 'nota.apagar')]);
    expect(t.el.querySelector('h2')!.textContent).toBe('Pedidos esperando');
    expect(document.activeElement?.id).toBe('pedidos-titulo');
    expect(t.el.querySelector('.sub')!.textContent).toBe('2 pedidos de Claude');
    const frases = [...t.el.querySelectorAll('.pedido .frase')].map((f) => f.textContent!.trim());
    expect(frases).toEqual(['Mudar o título e o texto de “Reunião”', 'Apagar “Reunião”']);
    expect(t.el.querySelector('.campo-mudou del')!.textContent).toBe('Reunião');
    expect(t.el.querySelector('.campo-mudou ins')!.textContent).toBe('Reunião geral');
    expect([...t.el.querySelectorAll('.diff .sai, .diff .entra')].map((l) => l.textContent!.trim())).toEqual(['Sai: - [ ] Ligar', 'Entra: - [x] Ligar']);
    expect(t.el.textContent).toContain('fica guardada em Ajustes › Backup por 30 dias');
  });

  it('aprovar, recusar e aprovar todos da chave', async () => {
    const t = await open({ kind: 'esperando' }, [req('pd_a', 'nota.editar'), req('pd_b', 'nota.apagar')]);
    t.button('Recusar')[1]!.click();
    await t.settle();
    t.button('Aprovar')[0]!.click();
    await t.settle();
    t.button('Aprovar os 2')[0]!.click();
    await t.settle();
    expect(calls).toEqual(['recusar pd_b', 'aprovar pd_a', 'aprovar pd_a', 'aprovar pd_b']);
  });

  it('nada esperando: diz isso', async () => {
    const t = await open({ kind: 'esperando' });
    expect(t.el.querySelector('.vazio')!.textContent).toContain('Nada esperando você.');
  });

  it('o histórico: o que entrou no passado, o que não entrou como foi pedido, com o carimbo; Desfazer só no que dá', async () => {
    history = [
      req('pd_a', 'nota.criar', { estado: 'aplicado', dados: { titulo: 'Reunião' }, resolvido_em: NOW }),
      req('pd_b', 'nota.editar', { estado: 'conflito', dados: { versao: NOW, texto: 'x' }, resolvido_em: NOW, resultado: { erro: 'A nota mudou.' } }),
      req('pd_c', 'nota.fixar', { estado: 'aplicado', resolvido_em: NOW, antes: null }),
    ];
    const t = await open({ kind: 'historico', key: { id: 'k1', nome: 'Claude' } });
    expect(t.el.querySelector('h2')!.textContent).toBe('Histórico');
    const rows = [...t.el.querySelectorAll('.feito')];
    expect(rows.map((r) => r.querySelector('.frase span')!.textContent!.trim())).toEqual(['Criou a nota “Reunião”', 'Mudar o texto de “Reunião”', 'Fixou “Reunião” no topo']);
    expect(rows[1]!.querySelector('.carimbo')!.textContent).toBe('conflito');
    expect(rows[1]!.querySelector('.porque')!.textContent).toBe('A nota mudou.');
    expect(rows.map((r) => !!r.querySelector('.desfazer'))).toEqual([true, false, false]);
    t.button('Desfazer')[0]!.click();
    await t.settle();
    expect(calls).toEqual(['desfazer pd_a']);
    expect(rows[0]!.isConnected ? t.el.querySelector('.feito .carimbo')!.textContent : '').toBe('desfeito');
  });

  it('desfazer tudo de hoje pergunta e desfaz do mais novo para o mais velho', async () => {
    history = [
      req('pd_a', 'nota.criar', { estado: 'aplicado', dados: { titulo: 'A' }, resolvido_em: NOW }),
      req('pd_b', 'nota.acrescentar', { estado: 'aplicado', resolvido_em: NOW, antes: { id: 'r1' } }),
    ];
    const t = await open({ kind: 'historico', key: { id: 'k1', nome: 'Claude' } });
    askAnswer = false;
    t.button('Desfazer tudo de hoje')[0]!.click();
    await t.settle();
    expect(calls).toEqual([]);
    askAnswer = true;
    t.button('Desfazer tudo de hoje')[0]!.click();
    await t.settle();
    expect(calls).toEqual(['desfazer pd_a', 'desfazer pd_b']);
  });
});
