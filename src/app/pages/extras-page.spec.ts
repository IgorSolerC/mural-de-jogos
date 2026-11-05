import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CloudAccount, CloudAccountInfo } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { ExtrasPage } from './extras-page';

describe('a página de Extras', () => {
  async function open(options: { cloud?: boolean; signedIn?: boolean; account?: Partial<CloudAccountInfo> | null }) {
    const account = signal(options.account === undefined ? null : options.account);
    TestBed.configureTestingModule({
      imports: [ExtrasPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: Cloud, useValue: { config: signal(options.cloud === false ? null : { api: 'https://api.teste' }) } },
        { provide: CloudAccount, useValue: { account, signedIn: () => options.signedIn !== false && account() !== null } },
      ],
    });
    const fixture = TestBed.createComponent(ExtrasPage);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    return {
      account,
      fixture,
      host,
      shelves: () => [...host.querySelectorAll('h2')].map((h) => h.textContent?.trim()),
      cards: () => [...host.querySelectorAll('h3')].map((h) => h.textContent?.trim()),
    };
  }

  const ALL = ['Ranking', 'Comparar', 'Estatísticas', 'Mata-mata', 'Maior ou menor', 'Muraldle'];

  it('quem não entrou vê só Números e Jogos', async () => {
    const t = await open({ signedIn: false });
    expect(t.shelves()).toEqual(['Números', 'Jogos']);
    expect(t.cards()).toEqual(ALL);
    expect(t.host.querySelector('[href*="uso-das-apis"]')).toBeNull();
  });

  it('outra conta vê a mesma página, sem nada a mais', async () => {
    const t = await open({ account: { codigo: 'K7QF-M2XA', nome: 'Ana' } });
    expect(t.shelves()).toEqual(['Números', 'Jogos']);
    expect(t.cards()).toEqual(ALL);
  });

  it('com a nuvem desligada, nem a conta de admin vê a prateleira', async () => {
    const t = await open({ cloud: false, account: { codigo: 'G11T-G00D', nome: 'Igor', admin: true } });
    expect(t.shelves()).toEqual(['Números', 'Jogos']);
  });

  it('a conta de admin ganha a prateleira Outros, por último, com a ficha do Uso das APIs', async () => {
    const t = await open({ account: { codigo: 'G11T-G00D', nome: 'Igor', admin: true } });
    expect(t.shelves()).toEqual(['Números', 'Jogos', 'Outros']);
    expect(t.cards()).toEqual([...ALL, 'Uso das APIs']);
    expect(t.host.querySelector('a[href="/extras/uso-das-apis"]')).not.toBeNull();
  });

  it('a bandeira que chega depois (a conferida da conta) faz a prateleira aparecer sem recarregar', async () => {
    const t = await open({ account: { codigo: 'G11T-G00D', nome: 'Igor' } });
    expect(t.shelves()).not.toContain('Outros');
    t.account.set({ codigo: 'G11T-G00D', nome: 'Igor', admin: true });
    await t.fixture.whenStable();
    expect(t.shelves()).toContain('Outros');
  });
});
