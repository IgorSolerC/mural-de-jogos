import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CloudAccount } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { Follow, parseFeed } from '../core/follow';
import { groupNotices, noticeSpoken, noticeVerb } from '../core/notices';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SharedGroup, parseGroup } from '../core/shared-groups';
import { SharedGroupsStore } from '../core/shared-groups-store';
import { SharedStore } from '../core/shared-store';
import { AccessTag } from './access-tag';
import { Confirm } from './confirm';
import { GroupShare } from './group-share';

/**
 * A parte Compartilhar da engrenagem (ui/group-share.ts), a etiqueta Quem vê da pasta (ui/access-tag.ts) e o
 * aviso do grupo em Amigos (PLANO-COMPARTILHAR.md, rodada 3).
 */

const ANA = { codigo: 'AAAA-1111', nome: 'Ana' };
const BIA = { codigo: 'BBBB-2222', nome: 'Bia' };
const EU = { codigo: 'EEEE-0000', nome: 'Igor' };

const group = (papel: SharedGroup['papel'], membros: { codigo: string; nome: string; papel: string }[] = []): SharedGroup =>
  parseGroup({
    id: 'gTrabalho001',
    dono: papel === 'dono' ? EU : ANA,
    papel,
    rev: 1,
    versao: 1,
    dados: { nome: 'Trabalho' },
    publico: false,
    notas: 4,
    membros: membros.map((m) => ({ ...m, desde: '' })),
    atualizadoEm: '',
  })!;

const note = (id: string, priv: boolean): Review =>
  sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: id, coverUrl: null, source: 'manual' },
    text: '',
    category: 'Trabalho',
    completedAt: '2026-11-11',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    ...(priv ? { private: true } : {}),
  })!;

@Component({ imports: [AccessTag], template: `<app-access-tag [name]="name()" (open)="opened = opened + 1" />` })
class TagHost {
  readonly name = signal<string | null>('Trabalho');
  opened = 0;
}

describe('compartilhar um grupo: a parte da engrenagem e a etiqueta da pasta', () => {
  let current: ReturnType<typeof signal<SharedGroup | undefined>>;
  let asked: { title?: string; text: string }[];
  let calls: string[];

  function setup(g: SharedGroup | undefined, answer = true) {
    current = signal(g);
    asked = [];
    calls = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ReviewStore, useValue: { notes: () => [note('n-um0001', true), note('n-dois01', true), note('n-tres01', false)] } },
        {
          provide: SharedGroupsStore,
          useValue: {
            ofCategory: (c: string | null) => (c === 'Trabalho' ? current() : undefined),
            moving: signal(null),
            error: signal(null),
            share: async (name: string, people: { codigo: string; papel: string }[]) => void calls.push(`share:${name}:${people[0]!.codigo}:${people[0]!.papel}`),
            setRole: async (id: string, codigo: string, papel: string) => void calls.push(`papel:${id}:${codigo}:${papel}`),
            removeMember: async (id: string, codigo: string) => void calls.push(`tirar:${id}:${codigo}`),
            leave: async (id: string) => void calls.push(`sair:${id}`),
            stop: async (id: string) => void calls.push(`parar:${id}`),
          },
        },
        { provide: SharedStore, useValue: { inGroupOf: () => [{ criadoPor: EU }, { criadoPor: EU }, { criadoPor: ANA }] } },
        { provide: CloudAccount, useValue: { signedIn: () => true, account: () => ({ id: 'u-eu', ...EU }) } },
        { provide: Cloud, useValue: { config: () => ({ api: 'x' }) } },
        { provide: Follow, useValue: { available: () => false, people: () => null, loadPeople: async () => null } },
        { provide: Confirm, useValue: { ask: async (q: { title?: string; text: string }) => (asked.push(q), answer) } },
        { provide: Router, useValue: { navigate: async () => true } },
      ],
    });
  }

  afterEach(() => TestBed.resetTestingModule());

  async function render() {
    const f = TestBed.createComponent(GroupShare);
    f.componentRef.setInput('name', 'Trabalho');
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  const typeCode = async (f: Awaited<ReturnType<typeof render>>['f'], code: string) => {
    const input = (f.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type=text]')!;
    input.value = code;
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await f.whenStable();
    f.detectChanges();
  };

  it('o grupo ainda só seu: a frase, o que vai junto, e chamar a primeira pessoa avisa das privadas (P1) e compartilha', async () => {
    setup(undefined);
    const { f, el } = await render();
    expect(el.querySelector('[data-resumo]')?.textContent?.trim()).toBe('Só você vê.');
    expect(el.textContent).toContain('O mural do grupo (3 anotações), o Kanban e os quadros livres dele.');
    expect(el.querySelector('.pe')).toBeNull();
    await typeCode(f, 'bbbb2222');
    expect(asked[0]!.text).toBe('Há 2 anotações privadas neste grupo. BBBB-2222 vai poder vê-las, como as outras do grupo.');
    expect(calls).toEqual(['share:Trabalho:BBBB-2222:editor']);
  });

  it('desistindo no aviso das privadas, ninguém é chamado', async () => {
    setup(undefined, false);
    const { f } = await render();
    await typeCode(f, 'bbbb2222');
    expect(asked).toHaveSize(1);
    expect(calls).toEqual([]);
  });

  it('o dono: quem está, chamar mais gente sem o aviso de novo, e parar de compartilhar dizendo quem perde o acesso', async () => {
    setup(group('dono', [{ ...ANA, papel: 'editor' }]));
    const { f, el } = await render();
    expect(el.querySelector('[data-resumo]')?.textContent?.trim()).toBe('Você e Ana veem. Ana também edita. Ninguém mais vê.');
    expect(el.textContent).toContain('O mural do grupo (3 anotações)');
    await typeCode(f, 'bbbb2222');
    expect(asked).toEqual([]);
    expect(calls).toEqual(['papel:gTrabalho001:BBBB-2222:editor']);
    el.querySelector<HTMLButtonElement>('.pe .perigo')!.click();
    await f.whenStable();
    expect(asked[0]!.text).toContain('Ana deixa de ver o grupo.');
    expect(calls.at(-1)).toBe('parar:gTrabalho001');
  });

  it('quem não é o dono: a frase de quem é, sem chamar ninguém (editor), e sair conta o que a pessoa escreveu (P4)', async () => {
    setup(group('editor', [{ ...EU, papel: 'editor' }, { ...BIA, papel: 'leitor' }]));
    const { f, el } = await render();
    expect(el.querySelector('[data-resumo]')?.textContent?.trim()).toBe('É de Ana. Você pode editar. Também está: Bia. Ninguém mais vê.');
    expect(el.querySelector('input[type=text]')).toBeNull();
    el.querySelector<HTMLButtonElement>('.pe .perigo')!.click();
    await f.whenStable();
    expect(asked[0]!.text).toContain('Você escreveu 2 anotações neste grupo. Elas ficam no grupo, com Ana, e saem do seu mural.');
    expect(calls).toEqual(['sair:gTrabalho001']);
  });

  it('a etiqueta da pasta: só no grupo que não é só seu, com as fotos e o resumo; tocar abre o Compartilhar', async () => {
    setup(undefined);
    const f = TestBed.createComponent(TagHost);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('.etiqueta')).toBeNull();
    current.set(group('leitor', [{ ...EU, papel: 'leitor' }, { ...BIA, papel: 'editor' }]));
    f.detectChanges();
    const tag = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.etiqueta')!;
    expect(tag.querySelector('.texto')!.textContent!.trim()).toBe('De Ana · você só lê');
    expect(tag.querySelectorAll('app-person-photo').length).toBe(2);
    expect(tag.getAttribute('aria-label')).toContain('É de Ana. Você só lê.');
    tag.click();
    expect(f.componentInstance.opened).toBe(1);
  });

  it('o aviso em Amigos: "compartilhou um grupo com você", com o papel', () => {
    const items = parseFeed([{ tipo: 'compartilhou-grupo', em: '2026-11-11T10:00:00.000Z', pessoa: ANA, ref: 'gTrabalho001', titulo: 'Trabalho', mural: 'anotacoes', papel: 'gestor' }]);
    const [n] = groupNotices(items);
    expect(n!.tipo).toBe('compartilhou');
    expect(noticeVerb(n!)).toBe('compartilhou um grupo com você:');
    expect(noticeSpoken(n!)).toBe('Ana compartilhou com você o grupo Trabalho. Você é gestor');
  });
});
