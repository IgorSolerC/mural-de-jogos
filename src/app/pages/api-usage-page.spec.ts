import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SEM_CONTAGEM, SERVICOS } from '../../../contrato/uso-apis/servicos';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { ApiUsagePage } from './api-usage-page';

const NOW = '2026-11-20T22:40:00.000Z';
const minutesAgo = (n: number) => new Date(Date.parse(NOW) - n * 60_000).toISOString();

const answer = {
  geradoEm: NOW,
  contandoDesde: '2026-11-05',
  linhas: [
    ['2026-11-20', 'rawg', 'busca', 'worker', 'prazo', 3, 24000, 8000, minutesAgo(3)],
    ['2026-11-20', 'tmdb', 'busca', 'worker', 'ok', 2, 800, 500, minutesAgo(10)],
    ['2026-11-18', 'tmdb', 'busca', 'worker', 'ok', 8, 3200, 500, '2026-11-18T10:00:00.000Z'],
  ],
  falhas: [{ em: minutesAgo(3), servico: 'rawg', operacao: 'busca', medidoEm: 'worker', desfecho: 'prazo', status: null, repeticoes: 3 }],
  proprias: { dia: '2026-11-20', linhasGravadas: 900, cotaLinhas: 60000, imagens: { imagens: 25, bytes: 524288, cota: 419430400 } },
  agenda: { contasLigadas: 1 },
};

const nothing = { ...answer, contandoDesde: null, linhas: [], falhas: [] };

describe('a página Uso das APIs', () => {
  function setup(request: () => Promise<unknown>) {
    const refresh = jasmine.createSpy('refresh').and.resolveTo();
    TestBed.configureTestingModule({
      imports: [ApiUsagePage],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: CloudAccount, useValue: { request: jasmine.createSpy('request').and.callFake(request), refresh } }],
    });
    const fixture = TestBed.createComponent(ApiUsagePage);
    const host: HTMLElement = fixture.nativeElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
    };
    const text = (sel: string) => host.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim();
    const rowOf = (name: string) => [...host.querySelectorAll('.razao tbody tr')].find((r) => r.querySelector('.nome')?.textContent === name) as HTMLTableRowElement;
    const cells = (name: string) => [...rowOf(name).querySelectorAll('td')].map((c) => c.textContent?.trim());
    return { fixture, host, settle, text, rowOf, cells, sentence: () => text('.frase'), refresh, account: TestBed.inject(CloudAccount) as unknown as { request: jasmine.Spy } };
  }

  it('confere com a nuvem ao abrir: o lugar das coisas, sem número de mentira', async () => {
    let release!: (v: unknown) => void;
    const t = setup(() => new Promise((resolve) => (release = resolve)));
    t.fixture.detectChanges();
    expect(t.sentence()).toBe('Conferindo…');
    expect(t.account.request).toHaveBeenCalledOnceWith('/v1/admin/uso');
    expect(t.host.querySelectorAll('.esqueleto').length).toBeGreaterThan(0);
    expect(t.host.querySelector('.razao')).toBeNull();
    expect(t.host.querySelector('.topo .botao')).toBeNull();
    release(answer);
    await t.settle();
    expect(t.host.querySelector('.esqueleto')).toBeNull();
    expect(t.host.querySelector('.frase')?.getAttribute('role')).toBe('status');
  });

  it('a frase responde, com a queda em cima e os outros embaixo', async () => {
    const t = setup(async () => answer);
    await t.settle();
    expect(t.sentence()).toBe('A RAWG está fora do ar desde 19:37: as buscas de jogos estão indo para a Wikipedia. O resto está respondendo.');
    const worker = [...t.host.querySelectorAll('.razao tbody')][0]!;
    const names = [...worker.querySelectorAll('.nome')].map((n) => n.textContent);
    expect(names.slice(0, 2)).toEqual(['RAWG', 'TMDB']);
  });

  it('a linha traz os números, e o estado em palavra, nunca só na cor', async () => {
    const t = setup(async () => answer);
    await t.settle();
    expect(t.rowOf('RAWG').querySelector('.estado')?.textContent).toBe('Fora do ar');
    expect(t.rowOf('TMDB').querySelector('.estado')?.textContent).toBe('Respondendo');
    // Hoje, 7 dias, 30 dias, Falhas, Tempo, Última
    expect(t.cells('TMDB')).toEqual(['2', '10', '10', '0%', '400 ms', 'há 10 min']);
    expect(t.cells('RAWG')).toEqual(['3', '3', '3', '100%', '—', 'há 3 min']);
  });

  it('sem uso, um traço, e não um zero que parece bom', async () => {
    const t = setup(async () => answer);
    await t.settle();
    expect(t.rowOf('Google Agenda').querySelector('.estado')?.textContent).toBe('Sem uso');
    expect(t.cells('Google Agenda')).toEqual(['0', '0', '0', '—', '—', '—']);
  });

  it('o que ainda não conta diz isso, nas duas seções, sem número nenhum', async () => {
    const t = setup(async () => answer);
    await t.settle();
    expect(t.rowOf('Wikipedia').querySelector('.estado')?.textContent).toBe('Ainda não conta');
    expect(t.cells('Wikipedia')).toEqual(['—', '—', '—', '—', '—', '—']);
    expect(t.rowOf('Cloudflare').querySelector('.estado')?.textContent).toBe('Ainda não conta');
    expect(t.text('.razao')).toContain('Esta conta ainda não começou.');
  });

  it('a régua diz quanto falta, em número e para o leitor de tela', async () => {
    const t = setup(async () => answer);
    await t.settle();
    const rulers = [...t.host.querySelectorAll('app-cota')];
    expect(rulers.map((r) => r.querySelector('.nome')?.textContent)).toEqual(['RAWG', 'Google Agenda', 'Linhas gravadas pelo Murall', 'Imagens guardadas']);
    expect(rulers[0]!.querySelector('.falta')?.textContent).toBe('faltam 19.997');
    expect(rulers[0]!.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('RAWG: 3 de 20.000, faltam 19.997, menos de 1%.');
    // o primeiro mês: o que veio antes não está na conta
    expect(rulers[0]!.textContent).toContain('Contando desde 05/nov/2026');
    expect(t.text('.prateleiras')).toContain('Este mês');
    expect(t.text('.prateleiras')).toContain('Hoje · a conta vira às 21h');
  });

  it('a cota acabando ganha a palavra e a fita da cor certa', async () => {
    const t = setup(async () => ({ ...answer, falhas: [], linhas: [['2026-11-20', 'rawg', 'busca', 'worker', 'ok', 19000, 1000, 100, minutesAgo(1)]] }));
    await t.settle();
    const rawg = t.host.querySelector('app-cota')!;
    expect(rawg.querySelector('.aviso')?.textContent).toBe('Quase no fim');
    expect(rawg.querySelector('.regua')?.getAttribute('data-nivel')).toBe('quase');
    expect(rawg.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('quase no fim');
    expect(t.rowOf('RAWG').querySelector('.estado')?.textContent).toBe('Quase no fim');
  });

  it('o detalhe abre e fecha pelo botão da linha, com o limite e de onde ele veio', async () => {
    const t = setup(async () => answer);
    await t.settle();
    const button = t.rowOf('RAWG').querySelector('button')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(t.host.querySelector('.detalhe')).toBeNull();
    button.click();
    await t.settle();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const detail = t.host.querySelector('.detalhe')!;
    expect(detail.id).toBe(button.getAttribute('aria-controls')!);
    expect(detail.textContent).toContain('20 mil pedidos por mês');
    expect(detail.textContent).toContain('Busca e capas de jogos');
    const labels = [...detail.querySelectorAll('a')].map((a) => a.getAttribute('aria-label'));
    expect(labels).toEqual(['Fonte do limite de RAWG, conferida em 05/nov/2026', 'Abrir o painel de RAWG']);
    for (const a of detail.querySelectorAll('a')) {
      expect(a.getAttribute('rel')).toBe('noreferrer');
      expect(a.getAttribute('href')).toMatch(/^https:\/\//);
    }
    // só um aberto de cada vez
    t.rowOf('TMDB').querySelector('button')!.click();
    await t.settle();
    expect(t.host.querySelectorAll('.detalhe').length).toBe(1);
    t.rowOf('TMDB').querySelector('button')!.click();
    await t.settle();
    expect(t.host.querySelector('.detalhe')).toBeNull();
  });

  it('todo limite do catálogo está ao alcance, e o que não se conta também', async () => {
    const t = setup(async () => nothing);
    await t.settle();
    for (const s of SERVICOS) {
      t.rowOf(s.nome).querySelector('button')!.click();
      await t.settle();
      expect(t.host.querySelector('.detalhe')?.textContent).withContext(s.id).toContain(s.limite.texto);
    }
    expect(t.host.querySelectorAll('.manilha dt').length).toBe(SEM_CONTAGEM.length);
    expect(t.text('.manilha summary')).toContain(`(${SEM_CONTAGEM.length})`);
  });

  it('a tabela tem nome e cabeçalhos para o leitor de tela', async () => {
    const t = setup(async () => answer);
    await t.settle();
    expect(t.host.querySelector('.razao caption')?.textContent).toContain('serviço');
    expect(t.host.querySelector('.razao thead th')?.getAttribute('scope')).toBe('col');
    expect(t.rowOf('RAWG').querySelector('th')?.getAttribute('scope')).toBe('row');
  });

  it('sem nada contado ainda, a tela não quebra e diz isso', async () => {
    const t = setup(async () => nothing);
    await t.settle();
    expect(t.sentence()).toContain('A contagem ainda não começou.');
    expect(t.host.querySelector('.razao')).not.toBeNull();
    expect(t.cells('RAWG')).toEqual(['0', '0', '0', '—', '—', '—']);
  });

  it('Atualizar busca de novo, sem apagar o que está na tela enquanto isso', async () => {
    let release!: (v: unknown) => void;
    let calls = 0;
    const t = setup(() => {
      calls++;
      return calls === 1 ? Promise.resolve(answer) : new Promise((resolve) => (release = resolve));
    });
    await t.settle();
    expect(t.text('.intro')).toBe('Atualizado às 19:40.');
    const button = t.host.querySelector<HTMLButtonElement>('.topo .botao')!;
    button.click();
    await t.settle();
    expect(calls).toBe(2);
    expect(t.text('.intro')).toBe('Atualizando…');
    expect(button.disabled).toBeTrue();
    expect(t.host.querySelector('.razao')).not.toBeNull();
    release({ ...answer, geradoEm: '2026-11-20T22:50:00.000Z' });
    await t.settle();
    expect(t.text('.intro')).toBe('Atualizado às 19:50.');
    expect(button.disabled).toBeFalse();
  });

  it('o erro ao atualizar não tira os números: diz de quando eles são', async () => {
    let calls = 0;
    const t = setup(async () => {
      if (++calls === 2) throw new CloudError('Sem conexão', 'sem-rede', 0);
      return answer;
    });
    await t.settle();
    t.host.querySelector<HTMLButtonElement>('.topo .botao')!.click();
    await t.settle();
    expect(t.text('.intro')).toBe('Não deu para atualizar. Os números são das 19:40.');
    expect(t.host.querySelector('.razao')).not.toBeNull();
    expect(t.sentence()).toContain('A RAWG está fora do ar');
  });

  it('sem resposta na primeira vez: diz, deixa tentar de novo, e sem cartolina vazia', async () => {
    let fail = true;
    const t = setup(async () => {
      if (fail) throw new CloudError('Sem conexão', 'sem-rede', 0);
      return answer;
    });
    await t.settle();
    expect(t.sentence()).toBe('Não deu para buscar os números agora.');
    expect(t.host.querySelector('.cotas')).toBeNull();
    expect(t.host.querySelector('.esqueleto')).toBeNull();
    expect(t.text('.sem-numeros')).toContain('assim que a nuvem responder');
    expect(t.host.querySelector('.manilha')).not.toBeNull();
    fail = false;
    t.host.querySelector<HTMLButtonElement>('.frase + button')!.click();
    await t.settle();
    expect(t.host.querySelector('.razao')).not.toBeNull();
    expect(t.host.querySelector('.frase + button')).toBeNull();
  });

  it('a nuvem disse que não é mais admin: atualiza a conta e volta para Extras', async () => {
    const t = setup(async () => {
      throw new CloudError('Só a conta de admin vê isto.', 'so-admin', 403);
    });
    const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    await t.settle();
    expect(t.refresh).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledOnceWith('/extras');
  });

  it('quem já saiu da página não é levado para lugar nenhum', async () => {
    let refuse!: (e: unknown) => void;
    const t = setup(() => new Promise((_, reject) => (refuse = reject)));
    const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    t.fixture.destroy();
    refuse(new CloudError('Só a conta de admin vê isto.', 'so-admin', 403));
    await new Promise((r) => setTimeout(r));
    expect(go).not.toHaveBeenCalled();
  });

  it('nada do que ela mostra fica no navegador', async () => {
    localStorage.clear();
    sessionStorage.clear();
    const t = setup(async () => answer);
    await t.settle();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe('o catálogo das APIs', () => {
  it('cada id aparece uma vez, e só uma cota global diz o total', () => {
    expect(new Set(SERVICOS.map((s) => s.id)).size).toBe(SERVICOS.length);
    const quotas = SERVICOS.filter((s) => s.limite.cota);
    expect(quotas.map((s) => s.id)).toEqual(['rawg', 'google-agenda']);
    for (const s of quotas) expect(s.limite.tipo).toBe('cota-global');
  });

  it('todo limite com fonte diz quando foi conferido', () => {
    for (const s of SERVICOS) {
      expect(!!s.limite.fonte).withContext(s.id).toBe(!!s.limite.conferidoEm);
      if (s.limite.conferidoEm) expect(s.limite.conferidoEm).withContext(s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('quem limita por pessoa nunca promete um total', () => {
    for (const s of SERVICOS.filter((x) => x.limite.tipo === 'por-pessoa')) {
      expect(s.limite.cota).withContext(s.id).toBeUndefined();
      expect(s.limite.texto).withContext(s.id).toContain('Não há um total para acabar.');
    }
  });

  it('a chave própria não gasta a cota do site', () => {
    const own = SERVICOS.find((s) => s.id === 'chave-propria')!;
    expect(own.limite.tipo).toBe('da-pessoa');
    expect(own.limite.cota).toBeUndefined();
  });
});
