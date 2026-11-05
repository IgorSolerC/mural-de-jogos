import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SEM_CONTAGEM, SERVICOS } from '../../../contrato/uso-apis/servicos';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { ApiUsagePage, checkedOn } from './api-usage-page';

describe('a página Uso das APIs', () => {
  function setup(request: () => Promise<unknown>) {
    const refresh = jasmine.createSpy('refresh').and.resolveTo();
    TestBed.configureTestingModule({
      imports: [ApiUsagePage],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: CloudAccount, useValue: { request: jasmine.createSpy('request').and.callFake(request), refresh } }],
    });
    const fixture = TestBed.createComponent(ApiUsagePage);
    const host: HTMLElement = fixture.nativeElement;
    const sentence = () => host.querySelector('.frase')?.textContent?.trim();
    return { fixture, host, sentence, refresh, account: TestBed.inject(CloudAccount) as unknown as { request: jasmine.Spy } };
  }

  const answer = { geradoEm: '2026-11-05T15:00:00.000Z', contandoDesde: null, linhas: [], falhas: [] };

  it('confere com a nuvem ao abrir, e diz o que está fazendo', async () => {
    let release!: (v: unknown) => void;
    const t = setup(() => new Promise((resolve) => (release = resolve)));
    t.fixture.detectChanges();
    expect(t.sentence()).toBe('Conferindo…');
    expect(t.account.request).toHaveBeenCalledOnceWith('/v1/admin/uso');
    release(answer);
    await new Promise((r) => setTimeout(r));
    await t.fixture.whenStable();
    expect(t.sentence()).toContain('A contagem ainda não começou.');
    expect(t.host.querySelector('.frase')?.getAttribute('role')).toBe('status');
  });

  it('com a contagem andando, diz desde quando', async () => {
    const t = setup(async () => ({ ...answer, contandoDesde: '2026-11-05' }));
    await t.fixture.whenStable();
    expect(t.sentence()).toContain('A contagem começou em 05/nov/2026');
  });

  it('todo serviço do catálogo aparece com o limite, na sua seção, e o que não se conta também', async () => {
    const t = setup(async () => answer);
    await t.fixture.whenStable();
    const groups = [...t.host.querySelectorAll('.razao tbody')];
    expect(groups.map((g) => g.querySelector('.grupo-nome')?.textContent)).toEqual(['Pelo Worker', 'Pelo navegador', 'Pela Cloudflare']);
    const names = [...t.host.querySelectorAll('.razao th[scope="row"] .nome')].map((n) => n.textContent);
    expect(names).toEqual([...SERVICOS.filter((s) => s.medidoEm === 'worker'), ...SERVICOS.filter((s) => s.medidoEm === 'navegador'), ...SERVICOS.filter((s) => s.medidoEm === 'cloudflare')].map((s) => s.nome));
    for (const s of SERVICOS) expect(t.host.querySelector('.razao')?.textContent).toContain(s.limite.texto);
    expect(t.host.querySelectorAll('.manilha dt').length).toBe(SEM_CONTAGEM.length);
    expect(t.host.querySelector('.manilha summary')?.textContent).toContain(`(${SEM_CONTAGEM.length})`);
  });

  it('a tabela tem nome para o leitor de tela, e cada link diz de qual serviço é', async () => {
    const t = setup(async () => answer);
    await t.fixture.whenStable();
    expect(t.host.querySelector('.razao caption')?.textContent).toContain('serviços');
    const labels = [...t.host.querySelectorAll('.razao a')].map((a) => a.getAttribute('aria-label'));
    expect(labels).toContain('Abrir o painel de RAWG');
    expect(labels).toContain('Fonte do limite de RAWG, conferida em 05/nov/2026');
    for (const a of t.host.querySelectorAll('.razao a')) {
      expect(a.getAttribute('rel')).toBe('noreferrer');
      expect(a.getAttribute('href')).toMatch(/^https:\/\//);
    }
  });

  it('sem resposta: diz, deixa tentar de novo, e o catálogo continua na tela', async () => {
    let fail = true;
    const t = setup(async () => {
      if (fail) throw new CloudError('Sem conexão', 'sem-rede', 0);
      return answer;
    });
    await t.fixture.whenStable();
    expect(t.sentence()).toBe('Não deu para buscar os números agora.');
    expect(t.host.querySelector('.razao')).not.toBeNull();
    fail = false;
    t.host.querySelector<HTMLButtonElement>('.frase + button')!.click();
    await t.fixture.whenStable();
    expect(t.sentence()).toContain('A contagem ainda não começou.');
    expect(t.host.querySelector('.frase + button')).toBeNull();
  });

  it('a nuvem disse que não é mais admin: atualiza a conta e volta para Extras', async () => {
    const t = setup(async () => {
      throw new CloudError('Só a conta de admin vê isto.', 'so-admin', 403);
    });
    const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    await t.fixture.whenStable();
    await new Promise((r) => setTimeout(r));
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
    await t.fixture.whenStable();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('a data de conferência, sem fuso', () => {
    expect(checkedOn('2026-11-05')).toBe('05/nov/2026');
    expect(checkedOn('2027-01-31')).toBe('31/jan/2027');
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
