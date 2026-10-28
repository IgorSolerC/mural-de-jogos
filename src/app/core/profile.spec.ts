import { CARD_URL_RE, PROFILE_LIMITS, cardBackground, cardImageUrl, defaultProfile, profileStats, publicProfile, sanitizeProfile, sanitizeTopics, updatedLabel } from './profile';

describe('perfil', () => {
  it('sem perfil guardado, começa com o emoji, a cortiça e "Em destaque"', () => {
    const p = defaultProfile();
    expect(p.background).toEqual({ kind: 'material', material: 'cortica' });
    expect(p.sections.map((s) => s.title)).toEqual(['Em destaque']);
  });

  it('o saneamento só aceita valores conhecidos e corta nos limites', () => {
    const p = sanitizeProfile({
      emoji: 'texto',
      photo: 'roxo-neon',
      tagline: 'x'.repeat(200),
      about: 'Oi\r\naqui',
      topics: ['Terror', 'terror', '', 42, ...Array.from({ length: 20 }, (_, i) => `assunto ${i}`)],
      background: { kind: 'link', url: 'http://inseguro.com/a.png' },
      walls: { jogos: { hidden: true, text: 'Atmosfera' }, inventado: { hidden: true } },
      sections: [
        { id: 'a1', title: 'Coração', density: 'mosaico', frame: 'quadro', items: ['r1', 'r1', 'r 2', 'r3'] },
        { id: 'a1', title: 'Repetida' },
        { title: 'Sem id' },
      ],
    })!;
    expect(p.emoji).toBe('🙂');
    expect(p.photo).toBe('amarelo');
    expect(p.tagline.length).toBe(PROFILE_LIMITS.tagline);
    expect(p.about).toBe('Oi\naqui');
    expect(p.topics[0]).toBe('Terror');
    expect(p.topics.length).toBe(PROFILE_LIMITS.topics);
    // um link que não é https não vira fundo
    expect(p.background).toEqual({ kind: 'material', material: 'cortica' });
    expect(p.walls).toEqual({ jogos: { hidden: true, text: 'Atmosfera' } });
    expect(p.sections).toEqual([{ id: 'a1', title: 'Coração', note: '', density: 'completa', frame: 'quadro', fill: { kind: 'material', material: 'cortica' }, frameStyle: 'pinus', items: ['r1', 'r3'] }]);
    expect(p.frameStyle).toBe('pinus');
    expect(p.page).toBe('eucatex');
  });

  it('aceita o fundo de cartolina e o link https', () => {
    expect(sanitizeProfile({ background: { kind: 'cartolina', stock: 'azul-escuro' } })!.background).toEqual({ kind: 'cartolina', stock: 'azul-escuro' });
    expect(sanitizeProfile({ background: { kind: 'link', url: 'https://ex.com/f.jpg' } })!.background).toEqual({ kind: 'link', url: 'https://ex.com/f.jpg' });
  });

  it('a parede da página e o fundo do quadro de cada seção', () => {
    const p = sanitizeProfile({
      page: 'planta',
      sections: [
        { id: 's1', fill: { kind: 'cartolina', stock: 'verde-escuro' } },
        { id: 's2', fill: { kind: 'material', material: 'papelao' } },
        { id: 's3', fill: { kind: 'link', url: 'https://ex.com/f.jpg' } },
      ],
    })!;
    expect(p.page).toBe('planta');
    expect(p.sections.map((s) => s.fill)).toEqual([
      { kind: 'cartolina', stock: 'verde-escuro' },
      { kind: 'material', material: 'papelao' },
      // o quadro da seção não leva imagem por link
      { kind: 'material', material: 'cortica' },
    ]);
    expect(sanitizeProfile({ page: 'neon' })!.page).toBe('eucatex');
  });

  it('as molduras: do quadro de cima e de cada seção, só as conhecidas', () => {
    const p = sanitizeProfile({ frameStyle: 'neon', sections: [{ id: 's1', frameStyle: 'dourada' }, { id: 's2', frameStyle: 'plástico' }] })!;
    expect(p.frameStyle).toBe('neon');
    expect(p.sections.map((s) => s.frameStyle)).toEqual(['dourada', 'pinus']);
  });

  it('o jeito das pastas dos murais: as pastas de sempre, ou o arquivo', () => {
    expect(defaultProfile().wallsLook).toBe('pastas');
    expect(sanitizeProfile({})!.wallsLook).toBe('pastas');
    expect(sanitizeProfile({ wallsLook: 'arquivo' })!.wallsLook).toBe('arquivo');
    expect(sanitizeProfile({ wallsLook: 'gaveta' })!.wallsLook).toBe('pastas');
  });

  it('não é perfil: null', () => {
    expect(sanitizeProfile(null)).toBeNull();
    expect(sanitizeProfile([])).toBeNull();
    expect(sanitizeProfile('perfil')).toBeNull();
  });

  it('os assuntos não repetem (sem ligar para caixa)', () => {
    expect(sanitizeTopics(['Poesia', 'POESIA', '  poesia  ', 'Stop-motion'])).toEqual(['Poesia', 'Stop-motion']);
  });

  it('o perfil público só leva as fichas que os outros veem', () => {
    const p = { ...defaultProfile(), sections: [{ ...defaultProfile().sections[0], items: ['a', 'b', 'c'] }] };
    expect(publicProfile(p, new Set(['c', 'a'])).sections[0].items).toEqual(['a', 'c']);
  });

  it('a pasta escondida vai para o público sem o texto dela', () => {
    const p = { ...defaultProfile(), walls: { filmes: { hidden: true as const, text: 'Só os de terror' }, jogos: { text: 'Os que zerei' } } };
    const out = publicProfile(p, new Set());
    expect(out.walls).toEqual({ filmes: { hidden: true }, jogos: { text: 'Os que zerei' } });
    // o perfil daqui continua com o texto (ele volta se a pasta voltar)
    expect(p.walls.filmes.text).toBe('Só os de terror');
  });

  it('o corte no limite não deixa meio emoji no fim', () => {
    const p = sanitizeProfile({
      tagline: 'x'.repeat(PROFILE_LIMITS.tagline - 1) + '😀',
      topics: ['y'.repeat(PROFILE_LIMITS.topic - 1) + '🎮'],
      about: 'z'.repeat(PROFILE_LIMITS.about - 1) + '🌙',
    })!;
    expect(p.tagline).toBe('x'.repeat(PROFILE_LIMITS.tagline - 1));
    expect(p.topics).toEqual(['y'.repeat(PROFILE_LIMITS.topic - 1)]);
    expect(p.about).toBe('z'.repeat(PROFILE_LIMITS.about - 1));
    for (const t of [p.tagline, p.topics[0], p.about]) expect(/[\uD800-\uDBFF]$/.test(t)).toBeFalse();
    // o emoji inteiro que cabe fica
    expect(sanitizeProfile({ tagline: 'x'.repeat(PROFILE_LIMITS.tagline - 2) + '😀' })!.tagline).toBe('x'.repeat(PROFILE_LIMITS.tagline - 2) + '😀');
  });

  it('sem controles nem os que viram o sentido da escrita; os emojis de família e as bandeiras ficam', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    const england = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
    const p = sanitizeProfile({
      tagline: 'Curadora‮ · SP\u0007',
      about: 'Linha um\n\tdois⁦ três\u0000',
      sections: [{ id: 's1', title: 'Coração‭', note: '⁧nota', items: [] }],
      walls: { jogos: { text: 'Zerados‮' } },
      topics: [`${family} Família`, `${england} Inglaterra`],
    })!;
    expect(p.tagline).toBe('Curadora · SP');
    expect(p.about).toBe('Linha um\n\tdois três');
    expect(p.sections[0].title).toBe('Coração');
    expect(p.sections[0].note).toBe('nota');
    expect(p.walls.jogos?.text).toBe('Zerados');
    expect(p.topics).toEqual([`${family} Família`, `${england} Inglaterra`]);
  });

  it('o link do fundo vai no cartão do jeito que a nuvem aceita', () => {
    // a imagem da Wikipédia, com parênteses: o mesmo endereço, com %
    expect(cardImageUrl('https://upload.wikimedia.org/a/Foo_(bar).jpg')).toBe('https://upload.wikimedia.org/a/Foo_%28bar%29.jpg');
    expect(cardImageUrl("https://x.com/it's a.png")).toBe('https://x.com/it%27s%20a.png');
    expect(cardImageUrl('https://i.imgur.com/fundo.png')).toBe('https://i.imgur.com/fundo.png');
    for (const url of ['https://upload.wikimedia.org/a/Foo_(bar).jpg', "https://x.com/it's a.png", 'https://x.com/a.png" onerror="x']) {
      expect(CARD_URL_RE.test(cardImageUrl(url)!)).withContext(url).toBeTrue();
    }
    expect(cardBackground({ kind: 'link', url: 'https://x.com/(a).png' })).toEqual({ kind: 'link', url: 'https://x.com/%28a%29.png' });
    // longo demais depois do %: a cortiça, em vez de a nuvem recusar o cartão inteiro
    expect(cardBackground({ kind: 'link', url: 'https://x.com/' + '('.repeat(300) })).toEqual({ kind: 'material', material: 'cortica' });
    expect(cardBackground({ kind: 'cartolina', stock: 'azul' })).toEqual({ kind: 'cartolina', stock: 'azul' });
  });

  it('os números do quadro', () => {
    const s = profileStats([
      { kind: 'jogos', verdict: 'masterpiece', createdAt: '2024-03-10T12:00:00.000Z' },
      { kind: 'jogos', verdict: 'meh', createdAt: '2025-01-01T12:00:00.000Z' },
      { kind: 'livros', verdict: null, createdAt: '2024-05-01T12:00:00.000Z' },
    ]);
    expect(s.cards).toBe(3);
    expect(s.walls).toBe(2);
    expect(s.masterpieces).toBe(1);
    expect(s.since).toContain('2024');
    expect(profileStats([]).since).toBeNull();
  });

  it('quando o mural mudou', () => {
    const now = Date.parse('2026-10-10T12:00:00.000Z');
    const at = (ms: number) => [{ updatedAt: new Date(now - ms).toISOString() }];
    expect(updatedLabel([], now)).toBe('');
    expect(updatedLabel(at(30_000), now)).toBe('Mural atualizado agora');
    expect(updatedLabel(at(15 * 60_000), now)).toBe('Mural atualizado há 15 min');
    expect(updatedLabel(at(3 * 3_600_000), now)).toBe('Mural atualizado há 3 horas');
    expect(updatedLabel(at(30 * 3_600_000), now)).toBe('Mural atualizado ontem');
    expect(updatedLabel(at(5 * 86_400_000), now)).toBe('Mural atualizado há 5 dias');
  });
});
