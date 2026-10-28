import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CloudAccount } from './cloud-account';
import { ProfilePeople, parsePeopleOf, photoTilt } from './profile-people';

describe('photoTilt', () => {
  it('fica entre −4 e +4 graus e é sempre o mesmo para o mesmo código', () => {
    for (const code of ['AB12CD', 'ZZZZZZ', '', 'código-com-acento']) {
      const t = photoTilt(code);
      expect(t).toBeGreaterThanOrEqual(-4);
      expect(t).toBeLessThanOrEqual(4);
      expect(photoTilt(code)).toBe(t);
    }
  });

  it('é a mesma conta de antes (h * 31, módulo 9)', () => {
    let h = 0;
    for (const c of 'K7Q2MX') h = (h * 31 + c.charCodeAt(0)) | 0;
    expect(photoTilt('K7Q2MX')).toBe((Math.abs(h) % 9) - 4);
    expect(photoTilt('')).toBe(-4);
  });
});

describe('parsePeopleOf', () => {
  const person = (over: Record<string, unknown>) => ({
    seguindo: 1,
    seguidores: 0,
    listas: { seguindo: [{ codigo: 'K7QFM2XA', nome: 'Ana', cartao: { emoji: '🦊', cor: 'laranja', fundo: null, linha: '', ...over } }], seguidores: [] },
  });

  it('o fundo por link do cartão é conferido com a mesma regra do envio (ver CARD_URL_RE)', () => {
    const fundo = (url: string) => parsePeopleOf(person({ fundo: { kind: 'link', url } }))!.listas!.seguindo[0].cartao!.fundo;
    expect(fundo('https://upload.wikimedia.org/a/Foo_%28bar%29.jpg')).toEqual({ kind: 'link', url: 'https://upload.wikimedia.org/a/Foo_%28bar%29.jpg' });
    expect(fundo('https://x.com/a.png" onerror="x')).toBeNull();
    expect(fundo('http://x.com/a.png')).toBeNull();
  });

  it('a linha e o nome cortados no limite não ficam com meio emoji', () => {
    const p = parsePeopleOf({
      seguindo: 1,
      seguidores: 0,
      listas: { seguindo: [{ codigo: 'K7QFM2XA', nome: 'n'.repeat(39) + '😀', cartao: { emoji: '🦊', cor: 'laranja', linha: 'l'.repeat(59) + '😀' } }], seguidores: [] },
    })!;
    expect(p.listas!.seguindo[0].nome).toBe('n'.repeat(39));
    expect(p.listas!.seguindo[0].cartao!.linha).toBe('l'.repeat(59));
  });
});

describe('ProfilePeople.load', () => {
  /** Cada pedido fica esperando até o teste responder (na ordem que quiser). */
  let calls: { url: string; reply: (body: unknown) => void }[];
  let people: ProfilePeople;
  const CODE = 'K7QFM2XA';
  const lists = (seguidores: string[]) => ({
    seguindo: [],
    seguidores: seguidores.map((nome, i) => ({ codigo: `ABCD${String(i).padStart(4, '0')}`, nome })),
  });
  const settle = () => new Promise((r) => setTimeout(r));

  beforeEach(() => {
    calls = [];
    const account = {
      request: (url: string) => new Promise((resolve) => calls.push({ url, reply: resolve })),
    };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: CloudAccount, useValue: account }] });
    people = TestBed.inject(ProfilePeople);
  });

  it('o pedido forçado (depois de Seguir) não reaproveita o que saiu antes', async () => {
    void people.load(CODE);
    void people.load(CODE, false, true);
    expect(calls.length).toBe(2);
    calls[1].reply({ seguindo: 0, seguidores: 1 });
    calls[0].reply({ seguindo: 0, seguidores: 0 });
    await settle();
    // o de antes, que voltou por último, não passa por cima do número novo
    expect(people.of(CODE)?.seguidores).toBe(1);
  });

  it('pedidos iguais sem forçar continuam sendo um só', () => {
    void people.load(CODE);
    void people.load(CODE);
    expect(calls.length).toBe(1);
  });

  it('as listas que saíram antes dos números novos não trazem os números velhos de volta', async () => {
    void people.load(CODE, true);
    void people.load(CODE, false, true);
    calls[1].reply({ seguindo: 0, seguidores: 2 });
    await settle();
    calls[0].reply({ seguindo: 0, seguidores: 1, listas: lists(['Bia']) });
    await settle();
    expect(people.of(CODE)?.seguidores).toBe(2);
    // as listas de antes do Seguir são velhas: a folha pede de novo ao abrir
    void people.load(CODE, true);
    expect(calls.length).toBe(3);
  });

  it('os números que voltam depois das listas não fazem a folha pedir as listas de novo', async () => {
    void people.load(CODE);
    void people.load(CODE, true);
    calls[1].reply({ seguindo: 0, seguidores: 1, listas: lists(['Bia']) });
    await settle();
    calls[0].reply({ seguindo: 0, seguidores: 1 });
    await settle();
    expect(people.of(CODE)?.listas?.seguidores.map((p) => p.nome)).toEqual(['Bia']);
    void people.load(CODE, true);
    expect(calls.length).toBe(2);
  });

  it('os números novos sem as listas não apagam as listas que já vieram', async () => {
    void people.load(CODE, true);
    calls[0].reply({ seguindo: 0, seguidores: 1, listas: lists(['Bia']) });
    await settle();
    void people.load(CODE, false, true);
    calls[1].reply({ seguindo: 0, seguidores: 2 });
    await settle();
    expect(people.of(CODE)?.seguidores).toBe(2);
    expect(people.of(CODE)?.listas?.seguidores.map((p) => p.nome)).toEqual(['Bia']);
  });
});
