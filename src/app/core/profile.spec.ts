import { PROFILE_LIMITS, defaultProfile, profileStats, publicProfile, sanitizeProfile, sanitizeTopics, updatedLabel } from './profile';

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
    expect(p.sections).toEqual([{ id: 'a1', title: 'Coração', note: '', density: 'completa', frame: 'quadro', items: ['r1', 'r3'] }]);
  });

  it('aceita o fundo de cartolina e o link https', () => {
    expect(sanitizeProfile({ background: { kind: 'cartolina', stock: 'azul-escuro' } })!.background).toEqual({ kind: 'cartolina', stock: 'azul-escuro' });
    expect(sanitizeProfile({ background: { kind: 'link', url: 'https://ex.com/f.jpg' } })!.background).toEqual({ kind: 'link', url: 'https://ex.com/f.jpg' });
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
