import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { PROFILE_KEY } from '../core/profile-store';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { ProfileEditPage } from './profile-edit-page';

/** As Configurações do perfil: o link do fundo e a contagem das pastas. */

/** Uma imagem de mentira: o teste diz quando ela abre. */
class FakeImage {
  static all: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  referrerPolicy = '';
  src = '';
  constructor() {
    FakeImage.all.push(this);
  }
}

let n = 0;
function card(over: Partial<Review> & Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: `r${++n}`,
    kind: 'jogos',
    game: { name: 'Hades', coverUrl: null, source: 'manual' },
    scores: { historia: 8, diversao: 8, jogabilidade: 8, visual: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    completedAt: '2026-10-20',
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
    ...over,
  }) as Review;
}

describe('ProfileEditPage', () => {
  let realImage: typeof Image;

  beforeEach(() => {
    localStorage.removeItem(PROFILE_KEY);
    realImage = window.Image;
    FakeImage.all = [];
    (window as unknown as { Image: unknown }).Image = FakeImage;
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => null } }],
    });
  });

  afterEach(() => {
    window.Image = realImage;
    localStorage.removeItem(PROFILE_KEY);
  });

  type Page = {
    onLink(v: string): void;
    setBackground(b: unknown): void;
    background(): unknown;
    linkError(): string | null;
    walls(): { kind: string; count: number }[];
    publicCards(): unknown[];
  };
  const page = () => TestBed.createComponent(ProfileEditPage).componentInstance as unknown as Page;

  it('apagar o link enquanto a imagem abre: ela não vira o fundo depois', () => {
    const p = page();
    p.onLink('https://x.com/grande.png');
    p.onLink('');
    FakeImage.all[0].onload!();
    expect(p.background()).toEqual({ kind: 'material', material: 'cortica' });
  });

  it('um link que não serve enquanto o outro abre: o de antes não vira o fundo', () => {
    const p = page();
    p.onLink('https://x.com/grande.png');
    p.onLink('http://x.com/inseguro.png');
    FakeImage.all[0].onload!();
    expect((p.background() as { kind: string }).kind).toBe('material');
    expect(p.linkError()).toMatch(/https/);
  });

  it('um material escolhido enquanto a imagem abre fica', () => {
    const p = page();
    p.onLink('https://x.com/grande.png');
    p.setBackground({ kind: 'material', material: 'kraft' });
    FakeImage.all[0].onload!();
    expect(p.background()).toEqual({ kind: 'material', material: 'kraft' });
  });

  it('o link que abre vira o fundo', () => {
    const p = page();
    p.onLink('https://x.com/grande.png');
    FakeImage.all[0].onload!();
    expect(p.background()).toEqual({ kind: 'link', url: 'https://x.com/grande.png' });
  });

  it('as pastas contam como o perfil: sem as releituras e as anotações finalizadas', () => {
    const original = card();
    TestBed.inject(ReviewStore).reviews.set([
      original,
      card({ revisitOf: original.id }),
      card({ kind: 'anotacoes', game: { name: 'Lista', coverUrl: null, source: 'manual' }, scores: { final: 8 }, text: 'Oi', doneAt: '2026-10-21T12:00:00.000Z' }),
    ]);
    const p = page();
    // as três aparecem para quem visita; a pasta é que conta só a original
    expect(p.publicCards().length).toBe(3);
    const walls = p.walls();
    expect(walls.find((w) => w.kind === 'jogos')?.count).toBe(1);
    expect(walls.find((w) => w.kind === 'anotacoes')?.count).toBe(0);
  });
});
