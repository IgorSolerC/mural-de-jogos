import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Cloud } from '../core/cloud-config';
import { LocalData } from '../core/local-data';
import { Settings } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { Toasts } from '../ui/toast';
import { ACCOUNT_KEY, SESSION_KEY } from '../core/cloud-account';
import { SettingsPage } from './settings-page';

/**
 * Os Ajustes, desenhados de verdade: as seis partes no índice, o endereço que abre cada uma (com o
 * "perfil" de antes indo para a Conta), os interruptores e o teclado do índice. Sem a nuvem.
 */

class MemoryData {
  private readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {
    /* sem outras abas */
  }
  takeForeign(): null {
    return null;
  }
}

describe('Ajustes (SettingsPage)', () => {
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function open(aba: string | null) {
    query = new BehaviorSubject(convertToParamMap(aba ? { aba } : {}));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => null, notice: () => null } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: query.value }, queryParamMap: query } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  const tabs = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const opened = (el: HTMLElement) => el.querySelector('[role="tab"][aria-selected="true"]')?.id;

  it('mostra as seis partes, cada uma com o que tem dentro, e abre na Conta', async () => {
    const { el } = await open(null);
    expect(tabs(el).map((t) => t.querySelector('.etiqueta-nome')?.textContent?.trim())).toEqual(['Conta', 'Mural', 'Amigos', 'Backup', 'Busca', 'Desempenho']);
    expect(tabs(el).every((t) => !!t.querySelector('.etiqueta-dica')?.textContent?.trim())).toBeTrue();
    expect(opened(el)).toBe('aba-conta');
    expect(el.querySelector('h2')?.textContent).toContain('Conta');
  });

  it('o endereço antigo (aba=perfil) abre a Conta; aba=backup abre o Backup', async () => {
    expect(opened((await open('perfil')).el)).toBe('aba-conta');
    TestBed.resetTestingModule();
    const { el } = await open('backup');
    expect(opened(el)).toBe('aba-backup');
    expect(el.querySelector('h2')?.textContent).toContain('Backup');
  });

  it('os interruptores do Mural ligam e desligam na hora', async () => {
    const { fixture, el } = await open('mural');
    const settings = TestBed.inject(Settings);
    const labels = el.querySelector<HTMLButtonElement>('[role="switch"][aria-labelledby="t-etiquetas"]')!;
    expect(labels.getAttribute('aria-checked')).toBe('true');
    labels.click();
    fixture.detectChanges();
    expect(settings.groupLabels()).toBeFalse();
    expect(labels.getAttribute('aria-checked')).toBe('false');
    const spoilers = el.querySelector<HTMLButtonElement>('[role="switch"][aria-labelledby="t-spoilers"]')!;
    spoilers.click();
    expect(settings.noSpoilers()).toBeTrue();
  });

  it('Desempenho: abre no Equilíbrio; cada predefinição liga e desliga as escolhas e marca a página', async () => {
    const { fixture, el } = await open('desempenho');
    const settings = TestBed.inject(Settings);
    const root = document.documentElement.classList;
    const preset = (id: string) => el.querySelector<HTMLInputElement>(`input[name="qualidade"][value="${id}"]`)!;
    const toggle = (id: string) => el.querySelector<HTMLButtonElement>(`[role="switch"][aria-labelledby="t-${id}"]`)!;
    const on = () => ['camadas', 'sombra', 'lapis', 'paradas', 'poucas'].filter((id) => toggle(id).getAttribute('aria-checked') === 'true');
    const pick = async (id: string) => {
      preset(id).checked = true;
      preset(id).dispatchEvent(new Event('change'));
      fixture.detectChanges();
      await fixture.whenStable();
    };

    expect(el.querySelector('h2')?.textContent).toContain('Desempenho');
    expect(preset('equilibrio').checked).toBeTrue();
    expect(on()).toEqual(['camadas']);
    expect(root.contains('camadas')).toBeTrue();

    await pick('desempenho');
    expect(settings.performancePreset()).toBe('desempenho');
    expect(on()).toEqual(['camadas', 'sombra', 'lapis', 'paradas', 'poucas']);
    expect(['camadas', 'sem-sombra', 'lapis-liso', 'fichas-paradas'].every((c) => root.contains(c))).toBeTrue();
    expect(JSON.parse(localStorage.getItem('mural-de-jogos:config:v1')!)).toEqual(
      jasmine.objectContaining({ cardLayers: true, noCutShadows: true, plainPencil: true, stillCards: true, fewCards: true }),
    );
    expect(settings.atDefaults()).toBeFalse();

    await pick('qualidade');
    expect(on()).toEqual([]);
    expect(['camadas', 'sem-sombra', 'lapis-liso', 'fichas-paradas'].some((c) => root.contains(c))).toBeFalse();

    // uma escolha mexida à mão: nenhuma das três fica marcada, e a página diz que é uma mistura
    toggle('lapis').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(settings.plainPencil()).toBeTrue();
    expect(settings.performancePreset()).toBeNull();
    expect(['desempenho', 'equilibrio', 'qualidade'].some((id) => preset(id).checked)).toBeFalse();
    expect(el.querySelector('#d-qualidade')?.textContent).toContain('Do seu jeito');
    expect(root.contains('lapis-liso')).toBeTrue();

    settings.resetPreferences();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(settings.performancePreset()).toBe('equilibrio');
    expect(preset('equilibrio').checked).toBeTrue();
    expect(root.contains('lapis-liso')).toBeFalse();
  });

  it('a nota se escolhe pelo exemplo', async () => {
    const { el } = await open('mural');
    const settings = TestBed.inject(Settings);
    const options = [...el.querySelectorAll<HTMLLabelElement>('.segmento')];
    expect(options.map((o) => o.querySelector('.seg-num')?.textContent?.trim())).toEqual(['8,4', '8,5', '8']);
    options[2].querySelector('input')!.click();
    expect(settings.scoreDisplay()).toBe('inteiro');
    settings.scoreDisplay.set('livre');
  });

  it('nada de caixa de contorno de tinta: o seletor é a cartela de recortes, o interruptor desligado é o recorte da trilha', async () => {
    const { el } = await open('mural');
    const options = [...el.querySelectorAll<HTMLLabelElement>('.segmento')];
    const chosen = options.find((o) => o.querySelector('input')!.checked)!;
    const other = options.find((o) => o !== chosen)!;
    // o recorte tracejado ainda na cartela; o escolhido é o adesivo de tinta colado, torto
    expect(getComputedStyle(other).outlineStyle).toBe('dashed');
    expect(getComputedStyle(other).boxShadow).toBe('none');
    expect(getComputedStyle(chosen).backgroundColor).toBe('rgb(21, 21, 21)');
    expect(getComputedStyle(chosen).rotate).not.toBe('none');
    // a tira do seletor não tem mais fundo nem contorno
    expect(getComputedStyle(el.querySelector('.segmentos')!).boxShadow).toBe('none');
    const off = el.querySelector<HTMLElement>('.interruptor[aria-checked="false"]')!;
    expect(getComputedStyle(off).boxShadow).not.toContain('inset');
    expect(getComputedStyle(off, '::after').borderTopStyle).toBe('dashed');
  });

  it('os campos são a tira de papel colada, sem o contorno de tinta em volta', async () => {
    const { el } = await open('busca');
    for (const campo of el.querySelectorAll<HTMLElement>('.campo')) {
      expect(getComputedStyle(campo).boxShadow).not.toContain('inset');
    }
    expect(el.querySelectorAll('.campo').length).toBeGreaterThan(0);
  });

  it('as setas andam pelo índice, de pé ou deitado', async () => {
    const { fixture, el } = await open(null);
    const list = el.querySelector('[role="tablist"]')!;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(opened(el)).toBe('aba-mural');
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(opened(el)).toBe('aba-amigos');
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    fixture.detectChanges();
    expect(opened(el)).toBe('aba-desempenho');
  });

  it('sem a nuvem, a Busca diz de onde vem cada mural e deixa as chaves à mão', async () => {
    const { el } = await open('busca');
    const rows = [...el.querySelectorAll('.fontes > div')].map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('Wikipedia');
    expect(rows[1]).toContain('Open Library');
    // as músicas vêm do iTunes, que não pede chave
    expect(rows.find((r) => r?.startsWith('Músicas'))).toContain('iTunes');
    expect(el.querySelector('.creditos')?.textContent).toContain('iTunes');
    expect(el.querySelector<HTMLDetailsElement>('details.chaves')?.open).toBeTrue();
    expect(el.querySelector('#tmdb-key')).not.toBeNull();
    expect(el.querySelector('#rawg-key')).not.toBeNull();
    // a escolha Wikipedia/RAWG saiu: a busca usa a RAWG sempre que há chave
    expect(el.querySelector('input[name="fonte"]')).toBeNull();
  });
});

describe('Ajustes: prévias e Voltar ao padrão', () => {
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function open(aba: string | null) {
    query = new BehaviorSubject(convertToParamMap(aba ? { aba } : {}));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => null, notice: () => null } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: query.value }, queryParamMap: query } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('passar o mouse num ajuste mostra o que ele muda, ao vivo', async () => {
    const { fixture, el } = await open('mural');
    const side = () => el.querySelector('.previa-lado');
    expect(side()?.textContent).toContain('Passe o mouse');
    const row = el.querySelector('[role="switch"][aria-labelledby="t-etiquetas"]')!.closest('.linha')!;
    row.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(side()?.querySelectorAll('.p-fita').length).toBe(2);
    (row.querySelector('[role="switch"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(side()?.querySelectorAll('.p-fita').length).toBe(0);
    expect(side()?.textContent).toContain('As fichas correm juntas');
  });

  it('a prévia das notas mostra o 8,4 como ele aparece', async () => {
    const { fixture, el } = await open('mural');
    const settings = TestBed.inject(Settings);
    el.querySelector('fieldset.linha')!.dispatchEvent(new FocusEvent('focusin'));
    fixture.detectChanges();
    expect(el.querySelector('.previa-lado strong')?.textContent).toBe('8,4');
    settings.scoreDisplay.set('metade');
    fixture.detectChanges();
    expect(el.querySelector('.previa-lado strong')?.textContent).toBe('8,5');
    settings.scoreDisplay.set('livre');
  });

  it('Voltar ao padrão: pergunta, volta as escolhas de Mural e Amigos e deixa o nome e as chaves', async () => {
    const { fixture, el } = await open('mural');
    const settings = TestBed.inject(Settings);
    const confirm = TestBed.inject(Confirm);
    const button = () => el.querySelector<HTMLButtonElement>('.padrao')!;
    expect(button().disabled).toBeTrue();
    settings.groupLabels.set(false);
    settings.noSpoilers.set(true);
    settings.friendKinds.set('separado');
    settings.mailCount.set(false);
    settings.scoreDisplay.set('inteiro');
    settings.ownerName.set('Igor');
    settings.setKey('rawg', 'minha');
    fixture.detectChanges();
    expect(button().disabled).toBeFalse();

    const ask = spyOn(confirm, 'ask').and.resolveTo(false);
    button().click();
    await fixture.whenStable();
    expect(settings.groupLabels()).toBeFalse();

    ask.and.resolveTo(true);
    button().click();
    await fixture.whenStable();
    expect(ask.calls.mostRecent().args[0].text).toContain('não mudam');
    expect(settings.atDefaults()).toBeTrue();
    expect(settings.groupLabels()).toBeTrue();
    expect(settings.noSpoilers()).toBeFalse();
    expect(settings.friendKinds()).toBe('misturado');
    expect(settings.mailCount()).toBeTrue();
    expect(settings.scoreDisplay()).toBe('livre');
    expect(settings.ownerName()).toBe('Igor');
    expect(settings.rawgKey()).toBe('minha');
    fixture.detectChanges();
    expect(button().disabled).toBeTrue();
  });
});

describe('Ajustes: trocar o código', () => {
  const API = 'https://api.teste';
  let calls: { url: string; method: string; body: unknown }[];
  /** O que a nuvem responde ao PUT do código escolhido. */
  let answer: () => Response;

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  async function open() {
    localStorage.setItem(SESSION_KEY, 'A'.repeat(43));
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
    calls = [];
    spyOn(window, 'fetch').and.callFake(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url).replace(API, '');
      const method = init?.method ?? 'GET';
      calls.push({ url: path, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
      if (path === '/v1/eu' && method === 'GET') return json({ codigo: 'K7QF-M2XA', nome: 'Igor' });
      if (path === '/v1/eu/codigo' && method === 'PUT') return answer();
      return json({ erro: 'nao-achei', mensagem: 'Não achei.' }, 404);
    });
    const query = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: API, googleClientId: 'x.apps.googleusercontent.com' }), notice: () => null } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: query.value }, queryParamMap: query } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    };
    await settle();
    const input = () => el.querySelector<HTMLInputElement>('#codigo-novo')!;
    const use = () => el.querySelector<HTMLButtonElement>('.codigo-troca button[type="submit"]')!;
    const note = () => el.querySelector<HTMLElement>('#codigo-novo-msg')!;
    const type = async (value: string) => {
      input().value = value;
      input().dispatchEvent(new Event('input'));
      await settle();
    };
    /** Aperta "Usar este" e responde à pergunta. */
    const submit = async (sure: boolean) => {
      use().click();
      await settle();
      TestBed.inject(Confirm).current()?.resolve(sure ? 'confirm' : null);
      await settle();
      await settle();
    };
    const chosen = () => calls.filter((c) => c.url === '/v1/eu/codigo' && c.method === 'PUT');
    return { el, input, use, note, type, submit, chosen, shown: () => el.querySelector('.codigo-valor')?.textContent };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('o botão só solta com um código possível, e a linha de baixo diz o que falta ou como vai ficar', async () => {
    const { use, note, type } = await open();
    expect(use().disabled).toBeTrue();
    expect(note().textContent).toBe('');

    await type('abcd-12');
    expect(use().disabled).toBeTrue();
    expect(note().textContent).toBe('');

    await type('abcd-1234');
    expect(use().disabled).toBeFalse();
    expect(note().textContent).toBe('');

    await type('solo-1234');
    expect(use().disabled).toBeFalse();
    expect(note().textContent).toBe('Vai ficar S010-1234: O vira 0, I e L viram 1.');
    expect(note().classList.contains('erro')).toBeFalse();

    await type('abcu-1234');
    expect(use().disabled).toBeTrue();
    expect(note().textContent).toBe('A letra U não entra no código.');
    expect(note().getAttribute('role')).toBe('alert');

    await type('abçd-1234');
    expect(note().textContent).toBe('Só letras sem acento e números.');

    await type('abcd-12345');
    expect(use().disabled).toBeTrue();
    expect(note().textContent).toBe('São 8 letras e números.');

    await type('k7qf m2xa');
    expect(use().disabled).toBeTrue();
    expect(note().textContent).toBe('Esse já é o seu código.');
  });

  it('código livre: pergunta, troca e mostra o novo', async () => {
    const { input, type, submit, chosen, shown } = await open();
    answer = () => json({ codigo: 'ABCD-1234' });
    await type('abcd 1234');

    await submit(false);
    expect(chosen().length).withContext('sem o sim, nada vai para a nuvem').toBe(0);
    expect(shown()).toBe('K7QF-M2XA');

    await submit(true);
    expect(chosen().map((c) => c.body)).toEqual([{ codigo: 'ABCD-1234' }]);
    expect(shown()).toBe('ABCD-1234');
    expect(input().value).toBe('');
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!).codigo).toBe('ABCD-1234');
  });

  it('código que já é de outra pessoa: avisa embaixo do campo e o código não muda', async () => {
    const { el, input, note, type, submit, shown } = await open();
    answer = () => json({ erro: 'codigo-em-uso', mensagem: 'Esse código já é de outra pessoa. Escolha outro.' }, 409);
    await type('abcd-1234');
    await submit(true);

    expect(note().textContent).toBe('ABCD-1234 já é de outra pessoa. Escolha outro.');
    expect(note().getAttribute('role')).toBe('alert');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(shown()).toBe('K7QF-M2XA');
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!).codigo).toBe('K7QF-M2XA');
    expect(input().value).withContext('o que a pessoa escreveu continua lá, para ela mexer').toBe('abcd-1234');
    expect(el.querySelector('.msg.erro')).withContext('o aviso é do campo, não da conta').toBeNull();

    // mexeu no campo: o aviso sai
    await type('abcd-1235');
    expect(note().textContent).toBe('');
    expect(input().hasAttribute('aria-invalid')).toBeFalse();
  });
});

describe('Ajustes: apagar a conta com cofre de senhas', () => {
  const API = 'https://api.teste';
  const AT = '2026-10-30T15:00:00.000Z';
  let calls: { url: string; method: string }[];
  /** A conta está marcada para sair na nuvem. */
  let marked: string | null;

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  async function open(start: string | null) {
    marked = start;
    localStorage.setItem(SESSION_KEY, 'A'.repeat(43));
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'K7QF-M2XA', nome: 'Igor', cofre: true, ...(start ? { apagarEm: start } : {}) }));
    calls = [];
    spyOn(window, 'fetch').and.callFake(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url).replace(API, '');
      const method = init?.method ?? 'GET';
      calls.push({ url: path, method });
      if (path === '/v1/eu' && method === 'GET') return json({ codigo: 'K7QF-M2XA', nome: 'Igor', cofre: true, ...(marked ? { apagarEm: marked } : {}) });
      if (path === '/v1/eu' && method === 'DELETE') return json({ ok: true, apagarEm: (marked ??= AT) }, 202);
      if (path === '/v1/eu/cancelar-apagar' && method === 'POST') {
        marked = null;
        return json({ ok: true });
      }
      return json({ erro: 'nao-achei', mensagem: 'Não achei.' }, 404);
    });
    const query = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: API, googleClientId: 'x.apps.googleusercontent.com' }), notice: () => null } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: query.value }, queryParamMap: query } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    };
    await settle();
    const row = () => [...el.querySelectorAll<HTMLElement>('.grupo.cuidado .linha')].find((l) => l.textContent!.includes('Apagar a conta'))!;
    const button = (text: string) => [...row().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim().endsWith(text));
    return { el, row, button, settle };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('a pergunta avisa da espera e do cofre; com o sim, a conta fica marcada e a sessão continua', async () => {
    const { row, button, settle } = await open(null);
    expect(button('Não apagar')).toBeUndefined();
    button('Apagar')!.click();
    await settle();
    const confirm = TestBed.inject(Confirm);
    expect(confirm.current()?.text).toContain('a conta só sai daqui a 7 dias');
    confirm.current()?.resolve('confirm');
    await settle();
    await settle();
    expect(calls.filter((c) => c.method === 'DELETE').length).toBe(1);
    expect(TestBed.inject(Toasts).current()?.text).toBe('A conta sai em 30 de outubro, com o cofre de senhas. Até lá, dá para cancelar.');
    expect(localStorage.getItem(SESSION_KEY)).withContext('a sessão fica').not.toBeNull();
    expect(row().textContent).toContain('Marcada para sair em 30 de outubro');
    expect(button('Apagar já')).toBeDefined();
  });

  it('marcada: "Não apagar" desmarca; "Apagar já" com o cofre ainda lá diz para apagar o cofre antes', async () => {
    const { row, button, settle } = await open(AT);
    expect(row().textContent).toContain('Marcada para sair em 30 de outubro');
    button('Apagar já')!.click();
    await settle();
    TestBed.inject(Confirm).current()?.resolve('confirm');
    await settle();
    await settle();
    expect(TestBed.inject(Toasts).current()?.text).toContain('O cofre de senhas ainda existe');
    button('Não apagar')!.click();
    await settle();
    await settle();
    expect(calls.some((c) => c.url === '/v1/eu/cancelar-apagar' && c.method === 'POST')).toBeTrue();
    expect(row().textContent).not.toContain('Marcada para sair');
    expect(button('Não apagar')).toBeUndefined();
  });
});

describe('Ajustes: Acessos (as chaves de API)', () => {
  const API = 'https://api.teste';
  const KEY = {
    id: 'ch_AAAAAAAAAAAAAAAA',
    nome: 'Claude, os gastos',
    origem: 'manual',
    escopos: ['gastos:ler', 'gastos:lancar'],
    grupos: null,
    aprovacao: 'mudancas',
    criadaEm: '2026-10-27T12:00:00.000Z',
    expiraEm: '2999-01-25T12:00:00.000Z',
    usadaEm: null,
  };
  let calls: { url: string; method: string }[];
  let keys: (typeof KEY)[];

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  async function open(api: boolean, aba = 'acessos', late = false) {
    localStorage.setItem(SESSION_KEY, 'A'.repeat(43));
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'G11T-G00D', nome: 'Igor', ...(api ? { api: true } : {}) }));
    calls = [];
    keys = [KEY, { ...KEY, id: 'ch_BBBBBBBBBBBBBBBB', nome: 'Velha', expiraEm: '2020-01-01T00:00:00.000Z' }];
    spyOn(window, 'fetch').and.callFake(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url).replace(API, '');
      const method = init?.method ?? 'GET';
      calls.push({ url: path, method });
      if (path === '/v1/eu' && method === 'GET') return json({ codigo: 'G11T-G00D', nome: 'Igor', ...(api ? { api: true } : {}) });
      if (path === '/v1/eu/chaves' && method === 'GET') return json({ disponivel: api, chaves: keys });
      if (path.startsWith('/v1/eu/chaves/') && method === 'DELETE') {
        keys = keys.filter((k) => !path.endsWith(k.id));
        return json({ ok: true });
      }
      if (path === '/v1/eu/chaves' && method === 'DELETE') return json({ ok: true, apagadas: keys.length });
      return json({ erro: 'nao-achei', mensagem: 'Não achei.' }, 404);
    });
    const query = new BehaviorSubject(convertToParamMap({ aba }));
    let arrive = () => {};
    const config = signal<{ api: string; googleClientId: string } | null>(late ? null : { api: API, googleClientId: 'x.apps.googleusercontent.com' });
    const cloud = { ready: late ? new Promise<void>((r) => (arrive = r)) : Promise.resolve(), config, notice: () => null };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: Cloud, useValue: cloud },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: query.value }, queryParamMap: query } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    };
    await settle();
    // o cloud.json chegando depois de a página abrir (a primeira visita, a rede lenta)
    if (late) {
      config.set({ api: API, googleClientId: 'x.apps.googleusercontent.com' });
      arrive();
    }
    await settle();
    await settle();
    const tabs = () => [...el.querySelectorAll('[role=tab]')].map((t) => t.querySelector('.etiqueta-nome')!.textContent!.trim());
    const button = (text: string, root: ParentNode = el) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === text);
    return { el, settle, tabs, button };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());
  });

  it('sem a API liberada, a parte não aparece e o endereço dela abre a Conta', async () => {
    const { el, tabs } = await open(false);
    expect(tabs()).not.toContain('Acessos');
    expect(el.querySelector('h2')!.textContent).toBe('Conta');
    expect(calls.some((c) => c.url === '/v1/eu/chaves')).toBeFalse();
  });

  it('o endereço da parte vale mesmo com o cloud.json chegando depois', async () => {
    const { el } = await open(true, 'acessos', true);
    expect(el.querySelector('h2')!.textContent).toBe('Acessos');
  });

  it('liberada: a etiqueta depois de Backup e a lista das chaves, com o resumo em palavras', async () => {
    const { el, tabs } = await open(true);
    expect(tabs()).toEqual(['Conta', 'Mural', 'Amigos', 'Backup', 'Acessos', 'Busca', 'Desempenho']);
    expect(el.querySelector('h2')!.textContent).toBe('Acessos');
    const rows = [...el.querySelectorAll<HTMLElement>('li.chave')];
    expect(rows.length).toBe(2);
    expect(rows[0]!.querySelector('.chave-pode')!.textContent).toBe('Gastos: ver e lançar');
    expect(rows[0]!.textContent).toContain('Nunca usada');
    expect(rows[0]!.textContent).toContain('Espera você aprovar o que muda ou apaga');
    // a vencida: carimbo, sem o Mudar
    expect(rows[1]!.classList).toContain('vencida');
    expect(rows[1]!.textContent).toContain('venceu');
    expect(rows[1]!.querySelector('[aria-label="Mudar a chave Velha"]')).toBeNull();
    expect(el.textContent).toContain('Cortar todos os acessos');
  });

  it('apagar pergunta antes e tira da lista', async () => {
    const { el, settle } = await open(true);
    el.querySelector<HTMLButtonElement>('[aria-label="Apagar a chave Claude, os gastos"]')!.click();
    await settle();
    const confirm = TestBed.inject(Confirm);
    expect(confirm.current()?.title).toBe('Apagar a chave?');
    confirm.answer(true);
    await settle();
    await settle();
    expect(calls).toContain({ url: `/v1/eu/chaves/${KEY.id}`, method: 'DELETE' });
    expect(el.querySelectorAll('li.chave').length).toBe(1);
    expect(TestBed.inject(Toasts).current()?.text).toBe('A chave “Claude, os gastos” foi apagada.');
  });

  it('"Nova chave" abre a folha', async () => {
    const { el, settle, button } = await open(true);
    button('Nova chave')!.click();
    await settle();
    await settle();
    const dialog = el.querySelector<HTMLDialogElement>('dialog.folha-chave');
    expect(dialog?.open).toBeTrue();
    expect(dialog!.querySelector('h2')!.textContent).toBe('Nova chave');
  });

  it('"Sair de todos" pergunta com a caixa de cortar as chaves já marcada (as que valem)', async () => {
    const { settle, button } = await open(true, 'conta');
    button('Sair de todos')!.click();
    await settle();
    await settle();
    const confirm = TestBed.inject(Confirm);
    expect(confirm.current()?.title).toBe('Sair de todos os aparelhos?');
    expect(confirm.current()?.check).toBe('Cortar também a chave de API (o acesso das AIs)');
    expect(confirm.checked()).toBeTrue();
    confirm.answer(false);
    await settle();
    expect(calls.some((c) => c.url === '/v1/auth/sair-de-todos')).toBeFalse();
  });
});
