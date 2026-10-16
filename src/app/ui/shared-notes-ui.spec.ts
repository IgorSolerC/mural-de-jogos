import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CloudAccount } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { FeedItem, Follow, People, parseFeed, visibleFeed } from '../core/follow';
import { Notice, SharedNotice, groupNotices, noticeSpoken } from '../core/notices';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SharedEntry, SharedStore } from '../core/shared-store';
import { ConflictSheet, differences, textPieces } from './conflict-sheet';
import { Confirm } from './confirm';
import { NoticeList } from './notice-list';
import { ShareSheet } from './share-sheet';

/**
 * As telas das anotações compartilhadas: o aviso em Amigos ("Ana compartilhou uma nota com você"), a
 * folha Compartilhar (quem gere chama e muda papéis; quem não gere só vê e sai) e a do conflito.
 */

const ANA = { codigo: 'AAAA-1111', nome: 'Ana' };
const BIA = { codigo: 'BBBB-2222', nome: 'Bia' };
const CRIS = { codigo: 'CCCC-3333', nome: 'Cris' };

function note(text = 'arroz\nfeijão', extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: 'nota-1',
    kind: 'anotacoes',
    game: { name: 'Lista do mercado', coverUrl: null, source: 'manual' },
    text,
    completedAt: '2026-10-16',
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:00:00.000Z',
    stock: 'amarelo',
    private: true,
    ...extra,
  })!;
}

function entry(papel: SharedEntry['papel'], extra: Partial<SharedEntry> = {}): SharedEntry {
  const view = note();
  return {
    id: 'nota-1',
    dono: { ...ANA, foto: null },
    papel,
    membros: [
      { ...BIA, foto: null, papel: 'editor', desde: '' },
      { ...CRIS, foto: null, papel: 'leitor', desde: '' },
    ],
    rev: 3,
    versao: 5,
    base: view,
    local: null,
    outra: null,
    resolver: false,
    conflito: null,
    atualizadoEm: view.updatedAt,
    atualizadoPor: { ...ANA, foto: null },
    pessoal: {},
    view,
    ...extra,
  };
}

describe('anotações compartilhadas: o aviso em Amigos', () => {
  const shared: FeedItem = {
    tipo: 'compartilhou',
    em: new Date(Date.now() - 5 * 60_000).toISOString(),
    pessoa: ANA,
    ref: 'nota-1',
    titulo: 'Lista do mercado',
    mural: 'anotacoes',
    silenciado: false,
    papel: 'editor',
    euSigo: true,
  };

  it('o correio lê o aviso da nuvem (o papel desconhecido vira leitor) e ele aparece em qualquer mural', () => {
    const [item] = parseFeed([{ tipo: 'compartilhou', em: shared.em, pessoa: ANA, ref: 'nota-1', titulo: 'Lista', papel: 'dono' }]);
    expect(item).toEqual(jasmine.objectContaining({ tipo: 'compartilhou', papel: 'leitor', mural: 'anotacoes' }));
    expect(visibleFeed([item], 'separado', 'jogos')).toEqual([item]);
    expect(parseFeed([{ tipo: 'compartilhou', em: shared.em, pessoa: ANA, ref: 'x' }])).toEqual([]);
  });

  it('um aviso por anotação, nunca junto com outros', () => {
    const list = groupNotices([shared, { ...shared, ref: 'nota-2', pessoa: BIA }]);
    expect(list.map((n) => n.tipo)).toEqual(['compartilhou', 'compartilhou']);
    expect(noticeSpoken(list[0])).toBe('Ana compartilhou com você a anotação Lista do mercado. Você é editor');
  });

  @Component({
    imports: [NoticeList],
    template: `<app-notice-list [notices]="notices()" [leaving]="leaving()" (sharedNote)="opened.push($event)" (leave)="left.push($event)" />`,
  })
  class Host {
    readonly notices = signal<Notice[]>(groupNotices([shared]));
    readonly leaving = signal<string | null>(null);
    readonly opened: SharedNotice[] = [];
    readonly left: SharedNotice[] = [];
  }

  it('"Ana compartilhou uma nota com você": a linha abre a anotação, e "Sair" pede para sair', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Follow, useValue: { isFollowing: () => null } },
        { provide: ReviewStore, useValue: { get: (id: string) => (id === 'nota-1' ? { id } : undefined) } },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const text = el.querySelector('.texto')!.cloneNode(true) as HTMLElement;
    text.querySelector('.sr-only')?.remove();
    expect(text.textContent?.replace(/\s+/g, ' ').trim()).toBe('Ana compartilhou uma nota com você: Lista do mercado');
    expect(el.querySelector('.meta')?.textContent).toContain('como editor');
    el.querySelector<HTMLButtonElement>('.abre')!.click();
    expect(fixture.componentInstance.opened.length).toBe(1);
    el.querySelector<HTMLButtonElement>('.sair')!.click();
    expect(fixture.componentInstance.left[0].item.ref).toBe('nota-1');
    fixture.componentInstance.leaving.set('nota-1');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('.sair')?.textContent?.trim()).toBe('Saindo…');
    TestBed.resetTestingModule();
  });
});

describe('anotações compartilhadas: a folha Compartilhar', () => {
  let current: ReturnType<typeof signal<SharedEntry | null>>;
  let calls: string[];

  function render(role: SharedEntry['papel'] | null, me = ANA) {
    current = signal<SharedEntry | null>(role ? entry(role) : null);
    calls = [];
    const people: People = {
      seguindo: [
        { ...BIA, desde: '', silenciado: false, rev: null, meSegue: true },
        { codigo: 'DDDD-4444', nome: 'Davi', desde: '', silenciado: false, rev: null, meSegue: false },
      ],
      seguidores: [{ codigo: 'EEEE-5555', nome: 'Eva', desde: '', euSigo: false }],
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ReviewStore, useValue: { get: () => note(), update: (r: Review) => calls.push(`update:${r.private ? 'privada' : 'publica'}`) } },
        {
          provide: SharedStore,
          useValue: {
            get: () => current() ?? undefined,
            share: async (_r: Review, p: { codigo: string; papel: string }[]) => void calls.push(`share:${p[0].codigo}:${p[0].papel}`),
            setRole: async (_id: string, codigo: string, papel: string) => void calls.push(`papel:${codigo}:${papel}`),
            removeMember: async (_id: string, codigo: string) => void calls.push(`tirar:${codigo}`),
            leave: async () => void calls.push('sair'),
          },
        },
        { provide: CloudAccount, useValue: { signedIn: () => true, account: () => ({ ...me, id: 'eu' }) } },
        { provide: Cloud, useValue: { config: () => ({ api: 'x' }) } },
        { provide: Follow, useValue: { available: () => true, people: () => people, loadPeople: async () => people } },
        { provide: Confirm, useValue: { ask: async () => true } },
        { provide: Router, useValue: { navigate: async () => true } },
      ],
    });
    const fixture = TestBed.createComponent(ShareSheet);
    fixture.componentRef.setInput('noteId', 'nota-1');
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  const settle = async (f: ReturnType<typeof render>) => {
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
  };

  it('a anotação ainda só sua: sugere quem você segue e quem segue você; chamar compartilha com o papel escolhido', async () => {
    const f = render(null);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('.sugestao .nome')].map((n) => n.textContent)).toEqual(['Bia', 'Davi', 'Eva']);
    expect(el.querySelector('.pessoas')?.textContent).toContain('(você)');
    const input = el.querySelector<HTMLInputElement>('input[type=text]')!;
    input.value = 'da';
    input.dispatchEvent(new Event('input'));
    await settle(f);
    expect([...el.querySelectorAll('.sugestao .nome')].map((n) => n.textContent)).toEqual(['Davi']);
    const select = el.querySelector<HTMLSelectElement>('.chamar-linha select')!;
    select.value = 'leitor';
    select.dispatchEvent(new Event('change'));
    await settle(f);
    el.querySelector<HTMLButtonElement>('.sugestao')!.click();
    await settle(f);
    expect(calls).toEqual(['share:DDDD-4444:leitor']);
  });

  it('um código escrito à mão também serve (Enter chama)', async () => {
    const f = render(null);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input[type=text]')!;
    input.value = 'zzzz zzzz';
    input.dispatchEvent(new Event('input'));
    await settle(f);
    expect(el.querySelector('.sugestao .rel')?.textContent).toBe('Pelo código');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(f);
    expect(calls).toEqual(['share:ZZZZ-ZZZZ:editor']);
  });

  it('o dono troca o papel e tira pelo menu da linha; o dono aparece primeiro, com a etiqueta', async () => {
    const f = render('dono');
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('.pessoa .nome')].map((n) => n.textContent?.trim())).toEqual(['Ana (você)', 'Bia', 'Cris']);
    expect(el.querySelector('.papel-fixo.dono')?.textContent?.trim()).toBe('Dono');
    const [bia, cris] = [...el.querySelectorAll<HTMLSelectElement>('.pessoa select')];
    bia.value = 'gestor';
    bia.dispatchEvent(new Event('change'));
    await settle(f);
    cris.value = 'tirar';
    cris.dispatchEvent(new Event('change'));
    await settle(f);
    await settle(f);
    expect(calls).toEqual(['papel:BBBB-2222:gestor', 'tirar:CCCC-3333']);
    // quem visita: a privada fica com quem está; trocar para pública grava a anotação
    el.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].dispatchEvent(new Event('change'));
    expect(calls.at(-1)).toBe('update:publica');
  });

  it('a editora não chama ninguém nem muda papéis: vê quem está e pode sair', async () => {
    const f = render('editor', BIA);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('input[type=text]')).toBeNull();
    expect(el.querySelector('.pessoa select')).toBeNull();
    expect(el.querySelectorAll('input[type=radio]').length).toBe(0);
    expect([...el.querySelectorAll('.papel-fixo')].map((p) => p.textContent?.trim())).toEqual(['Dono', 'Editor', 'Leitor']);
    el.querySelector<HTMLButtonElement>('.foot .perigo')!.click();
    await settle(f);
    expect(calls).toEqual(['sair']);
  });

  it('o gestor chama gente e muda os outros, mas o dono continua com a etiqueta (ninguém mexe nele)', async () => {
    const f = render('gestor', CRIS);
    current.set({ ...current()!, membros: [{ ...BIA, foto: null, papel: 'editor', desde: '' }, { ...CRIS, foto: null, papel: 'gestor', desde: '' }] });
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('input[type=text]')).not.toBeNull();
    expect(el.querySelectorAll('.pessoa select').length).toBe(1); // só a Bia: nem o dono, nem você
    expect(el.querySelector('.papel-fixo.dono')).not.toBeNull();
  });
});

describe('anotações compartilhadas: a folha do conflito', () => {
  it('o texto em pedaços: o diferente marcado, o igual recolhido longe dele', () => {
    const base = Array.from({ length: 12 }, (_, i) => `linha ${i}`);
    const a = [...base];
    a[6] = 'de Ana';
    const b = [...base];
    b[6] = 'de Bia';
    const [pa, pb] = textPieces(a.join('\n'), b.join('\n'));
    expect(pa).toEqual([{ kind: 'gap', n: 4 }, { kind: 'same', text: 'linha 4\nlinha 5' }, { kind: 'diff', text: 'de Ana' }, { kind: 'same', text: 'linha 7\nlinha 8' }, { kind: 'gap', n: 3 }]);
    expect(pb.find((p) => p.kind === 'diff')).toEqual({ kind: 'diff', text: 'de Bia' });
  });

  it('o que difere, nas palavras da tela', () => {
    expect(differences(note('a'), note('b', { game: { name: 'Outro' }, stock: 'azul' }))).toEqual(['titulo', 'texto', 'aparencia']);
    expect(differences(note(), note())).toEqual([]);
  });

  it('mostra as duas versões com quem fez cada uma; "Manter esta" escolhe', async () => {
    const chosen: Review[] = [];
    const conflito = { a: note('O gato branco.'), b: note('O gato cinza.'), autorA: { ...ANA, foto: null }, autorB: { ...BIA, foto: null }, em: new Date().toISOString() };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SharedStore, useValue: { get: () => entry('dono', { conflito }), resolve: (_id: string, r: Review) => chosen.push(r) } },
        { provide: CloudAccount, useValue: { account: () => ({ ...ANA }) } },
      ],
    });
    const f = TestBed.createComponent(ConflictSheet);
    f.componentRef.setInput('noteId', 'nota-1');
    f.detectChanges();
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toBe('Conflito de sincronização');
    expect(el.querySelector('.qual')?.textContent).toBe('Deseja manter qual versão?');
    expect(el.querySelector('.quem-mexeu')?.textContent).toContain('Você e Bia mudaram o texto ao mesmo tempo');
    expect([...el.querySelectorAll('.versao-nome')].map((h) => h.textContent)).toEqual(['A sua versão', 'A versão de Bia']);
    expect([...el.querySelectorAll('.difere mark')].map((m) => m.textContent)).toEqual(['O gato branco.', 'O gato cinza.']);
    el.querySelectorAll<HTMLButtonElement>('.manter')[1].click();
    expect(chosen[0].text).toBe('O gato cinza.');
    TestBed.resetTestingModule();
  });
});
