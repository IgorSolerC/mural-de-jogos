import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { CloudAccount } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { Desk } from '../core/desk';
import { FichaLinks, LinkedCard } from '../core/ficha-link';
import { Reactions } from '../core/reactions';
import { Review, sanitizeReview } from '../core/review';
import { FichaPage } from './ficha-page';

/**
 * A página do link: espera a ficha, abre a leitura sem o fechar (com conta, com as reações e os
 * comentários) na parede de quem escreveu, ou diz o que deu errado. Ao sair, a leitura fecha.
 */

const hades = sanitizeReview({
  id: 'rjogo0001',
  kind: 'jogos',
  game: { name: 'Hades', coverUrl: null, source: 'manual' },
  scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 9 },
  status: 'finalizado',
  difficulty: 'nenhuma',
  verdict: null,
  completedAt: '2026-10-20',
  createdAt: '2026-10-20T12:00:00.000Z',
  updatedAt: '2026-10-20T12:00:00.000Z',
}) as Review;

describe('A página do link (FichaPage)', () => {
  let found: LinkedCard;
  let myCode: string | null;
  let desk: jasmine.SpyObj<Pick<Desk, 'openLoose' | 'closeReader'>>;
  let links: { fetch: jasmine.Spy; wall: ReturnType<typeof signal<string | null>> };

  const settle = async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r));
  };

  function create() {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ codigo: 'ABCD-1234', id: 'rjogo0001' }) } } },
        { provide: FichaLinks, useValue: links },
        { provide: Desk, useValue: desk },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        { provide: CloudAccount, useValue: { signedIn: signal(myCode !== null) } },
        { provide: Reactions, useValue: { myCode: signal(myCode) } },
      ],
    });
    const fixture = TestBed.createComponent(FichaPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    myCode = null;
    desk = jasmine.createSpyObj('Desk', ['openLoose', 'closeReader']);
    links = { fetch: jasmine.createSpy('fetch').and.callFake(async () => found), wall: signal<string | null>(null) };
  });

  it('abre a ficha sem conta, na parede de quem escreveu, com o nome na aba', async () => {
    found = { kind: 'ok', card: hades, code: 'ABCD-1234', mural: { cards: [hades], ownerName: 'Igor', profile: { page: 'lousa' } as never } };
    const fixture = create();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Abrindo a ficha');
    await settle();
    expect(links.fetch).toHaveBeenCalledWith('ABCD-1234', 'rjogo0001');
    expect(desk.openLoose).toHaveBeenCalledWith(hades, 'Igor', [hades], 'ABCD-1234', false);
    expect(links.wall()).toBe('lousa');
    expect(TestBed.inject(Title).getTitle()).toBe('Hades · Murall');
    fixture.destroy();
    expect(desk.closeReader).toHaveBeenCalled();
    expect(links.wall()).toBeNull();
  });

  it('com conta, abre com as reações e os comentários; a ficha é sua: "Você"', async () => {
    myCode = 'ABCD-1234';
    found = { kind: 'ok', card: hades, code: 'ABCD-1234', mural: { cards: [hades], ownerName: 'Igor', profile: null } };
    create();
    await settle();
    expect(desk.openLoose).toHaveBeenCalledWith(hades, 'Você', [hades], 'ABCD-1234', true);
  });

  it('o que deu errado vira um bilhete, com o caminho para o Murall (e o "Tentar de novo" quando a nuvem falhou)', async () => {
    found = { kind: 'sem-ficha' };
    const fixture = create();
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toBe('Esta ficha não está à mostra');
    expect(el.querySelector('a[href="./"]')?.textContent).toContain('Conhecer o Murall');
    expect(desk.openLoose).not.toHaveBeenCalled();

    expect(el.querySelector('.btn-ink')).toBeNull();
  });

  it('a nuvem fora do ar: o porquê e o "Tentar de novo"', async () => {
    found = { kind: 'erro', message: 'Sem conexão com a nuvem agora.' };
    const fixture = create();
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toBe('Não deu para abrir a ficha agora');
    expect(el.querySelector('p')?.textContent).toBe('Sem conexão com a nuvem agora.');
    found = { kind: 'ok', card: hades, code: 'ABCD-1234', mural: { cards: [hades], ownerName: 'Igor', profile: null } };
    el.querySelector<HTMLButtonElement>('.btn-ink')!.click();
    await settle();
    expect(links.fetch).toHaveBeenCalledTimes(2);
  });
});
