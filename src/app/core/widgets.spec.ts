import { hasFormatting, parseRich, plainText } from './rich-text';
import { Frame, httpsUrl, parseVideo, parseWhen, parseWidgetLine, readCountdown, readMedia, remaining, splitArgs, targetOf, widgetDef, widgetLine, writeWhen } from './widgets';

describe('widgets das anotações', () => {
  it('a linha de um widget: o nome (com acento, maiúscula ou outro nome) e os parâmetros', () => {
    expect(parseWidgetLine('{{contador: 19/11/2026 18:00 | GTA VI}}')).toEqual({ name: 'contador', args: ['19/11/2026 18:00', 'GTA VI'] });
    expect(parseWidgetLine('  {{ Contagem :25/12}}  ')).toEqual({ name: 'contador', args: ['25/12'] });
    expect(parseWidgetLine('{{contador}}')).toEqual({ name: 'contador', args: [] });
    // um nome que o site não conhece, ou a marca no meio do texto, fica como texto
    expect(parseWidgetLine('{{relogio: 10:00}}')).toBeNull();
    expect(parseWidgetLine('faltam {{contador: 19/11/2026}} dias')).toBeNull();
    expect(parseWidgetLine('{contador: 19/11/2026}')).toBeNull();
  });

  it('o "|" escapado fica no parâmetro, e a marca escrita de volta o escapa', () => {
    expect(splitArgs(' a \\| b | c ')).toEqual(['a | b', 'c']);
    expect(widgetLine('contador', ['19/11/2026', 'Tom | Jerry'])).toBe('{{contador: 19/11/2026 | Tom \\| Jerry}}');
    expect(widgetLine('contador', ['19/11/2026', ''])).toBe('{{contador: 19/11/2026}}');
    expect(widgetLine('contador', ['19/11/2026', 'fim }} aqui\nsegunda'])).toBe('{{contador: 19/11/2026 | fim } } aqui segunda}}');
    expect(parseWidgetLine(widgetLine('contador', ['19/11/2026', 'Tom | Jerry']))!.args).toEqual(['19/11/2026', 'Tom | Jerry']);
  });

  it('no texto, o widget é um bloco só dele; para o que lê palavras, fica o título', () => {
    const text = 'Viagem\n{{contador: 19/11/2026 | Embarque}}\n- [ ] mala';
    expect(parseRich(text).map((b) => b.kind)).toEqual(['p', 'widget', 'check']);
    expect(parseRich(text)[1]).toEqual({ kind: 'widget', name: 'contador', args: ['19/11/2026', 'Embarque'] });
    expect(hasFormatting('{{contador: 19/11/2026}}')).toBeTrue();
    expect(plainText(text)).toBe('Viagem\nEmbarque\nmala');
  });

  describe('a data do contador', () => {
    it('os jeitos de escrever', () => {
      expect(parseWhen('19/11/2026 18:00')).toEqual({ year: 2026, month: 11, day: 19, hour: 18, minute: 0, timed: true });
      expect(parseWhen('19/11/2026')).toEqual({ year: 2026, month: 11, day: 19, hour: 0, minute: 0, timed: false });
      expect(parseWhen('19/11/26 às 18h30')).toEqual({ year: 2026, month: 11, day: 19, hour: 18, minute: 30, timed: true });
      expect(parseWhen('2026-11-19T07:05')).toEqual({ year: 2026, month: 11, day: 19, hour: 7, minute: 5, timed: true });
      expect(parseWhen('25/12')).toEqual({ year: null, month: 12, day: 25, hour: 0, minute: 0, timed: false });
      expect(parseWhen('29/02')).not.toBeNull();
    });

    it('o que não é data (ou não existe) não vale', () => {
      for (const bad of ['31/02/2026', '29/02/2027', '19/13/2026', '19/11/2026 25:00', '19/11/2026 18', 'amanhã', '19/11/20261', '']) {
        expect(parseWhen(bad)).withContext(bad).toBeNull();
      }
    });

    it('escrita de volta do jeito daqui', () => {
      expect(writeWhen(parseWhen('2026-11-19T07:05')!)).toBe('19/11/2026 07:05');
      expect(writeWhen(parseWhen('5/1')!)).toBe('05/01');
    });

    it('os parâmetros em qualquer ordem: a data é a data, o outro é o título', () => {
      expect(readCountdown(['GTA VI', '19/11/2026']).title).toBe('GTA VI');
      expect(readCountdown(['GTA VI', '19/11/2026']).when?.day).toBe(19);
      expect(readCountdown(['GTA VI']).when).toBeNull();
    });
  });

  describe('quanto falta', () => {
    const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s).getTime();

    it('dias, horas, minutos e segundos; passado, quanto passou', () => {
      expect(remaining(at(2026, 11, 19, 18), at(2026, 11, 8, 10, 36, 48))).toEqual({ past: false, days: 11, hours: 7, minutes: 23, seconds: 12 });
      expect(remaining(at(2026, 11, 19), at(2026, 11, 22, 1))).toEqual({ past: true, days: 3, hours: 1, minutes: 0, seconds: 0 });
      // meio segundo antes ainda falta 1 segundo
      expect(remaining(1000, 500)).toEqual({ past: false, days: 0, hours: 0, minutes: 0, seconds: 1 });
    });

    it('o de todo ano: o próximo; no dia, continua "chegou" até o fim dele, e então vira o ano', () => {
      const xmas = parseWhen('25/12')!;
      expect(targetOf(xmas, at(2026, 10, 9))).toBe(at(2026, 12, 25));
      expect(targetOf(xmas, at(2026, 12, 25, 15))).toBe(at(2026, 12, 25));
      expect(targetOf(xmas, at(2026, 12, 26, 0, 0, 1))).toBe(at(2027, 12, 25));
      // o 29/02 pula os anos sem ele
      expect(targetOf(parseWhen('29/02')!, at(2026, 10, 9))).toBe(at(2028, 2, 29));
    });

    it('com ano, a data é ela mesma', () => {
      expect(targetOf(parseWhen('19/11/2026 18:00')!, at(2030, 1, 1))).toBe(at(2026, 11, 19, 18));
    });
  });

  describe('o formulário do contador', () => {
    const def = widgetDef('contador')!;

    it('os campos viram a marca, e a marca volta para os campos', () => {
      expect(def.write({ title: ' GTA VI ', date: '2026-11-19', time: '18:00', yearly: '' })).toEqual(['19/11/2026 18:00', 'GTA VI']);
      expect(def.write({ date: '2026-12-25', yearly: '1' })).toEqual(['25/12']);
      expect(def.write({ title: 'sem dia', date: '' })).toBeNull();
      expect(def.read(['19/11/2026 18:00', 'GTA VI'])).toEqual({ title: 'GTA VI', date: '2026-11-19', time: '18:00', yearly: '' });
      expect(def.read(['GTA VI'])).toEqual({ title: 'GTA VI', date: '', time: '', yearly: '' });
      expect(def.read(['25/12'])['yearly']).toBe('1');
    });
  });

  describe('a imagem e o vídeo', () => {
    it('os parâmetros em qualquer ordem: o link, a moldura e a legenda', () => {
      expect(readMedia(['https://x.com/a.jpg', 'Praia', 'polaroide'])).toEqual({ url: 'https://x.com/a.jpg', frame: 'polaroid', caption: 'Praia' });
      expect(readMedia(['Recorte', 'https://x.com/a.jpg'])).toEqual({ url: 'https://x.com/a.jpg', frame: 'recorte', caption: '' });
      expect(readMedia(['só legenda'])).toEqual({ url: '', frame: 'foto', caption: 'só legenda' });
      expect(parseWidgetLine('{{Foto: https://x.com/a.jpg | Praia}}')).toEqual({ name: 'imagem', args: ['https://x.com/a.jpg', 'Praia'] });
      expect(plainText('{{imagem: https://x.com/a.jpg | Praia}}')).toBe('Praia');
    });

    it('só https', () => {
      expect(httpsUrl('https://x.com/a.jpg')).toBe('https://x.com/a.jpg');
      for (const bad of ['http://x.com/a.jpg', 'javascript:alert(1)', 'https://', 'https://semponto/a.jpg', 'x.com/a.jpg', 'https://x.com/a b.jpg']) {
        expect(httpsUrl(bad)).withContext(bad).toBeNull();
      }
    });

    it('os vídeos que tocam: YouTube (com o tempo), Vimeo e arquivo', () => {
      expect(parseVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ', start: 90 });
      expect(parseVideo('https://youtu.be/dQw4w9WgXcQ?t=42')).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ', start: 42 });
      expect(parseVideo('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ', start: 0 });
      expect(parseVideo('https://vimeo.com/76979871')).toEqual({ kind: 'vimeo', id: '76979871', hash: null });
      expect(parseVideo('https://vimeo.com/76979871/abc123def0')).toEqual({ kind: 'vimeo', id: '76979871', hash: 'abc123def0' });
      expect(parseVideo('https://player.vimeo.com/video/76979871')).toEqual({ kind: 'vimeo', id: '76979871', hash: null });
      expect(parseVideo('https://site.com/clip.MP4?x=1')).toEqual({ kind: 'file', url: 'https://site.com/clip.MP4?x=1' });
      for (const bad of ['https://www.youtube.com/watch?v=curto', 'https://youtube.com/@canal', 'https://vimeo.com/canal', 'https://site.com/pagina', 'http://youtu.be/dQw4w9WgXcQ']) {
        expect(parseVideo(bad)).withContext(bad).toBeNull();
      }
    });

    it('o formulário: o link conferido, a moldura só quando não é a de sempre', () => {
      const img = widgetDef('imagem')!;
      expect(img.write({ url: 'https://x.com/a.jpg', caption: ' Praia ', frame: 'polaroid' })).toEqual(['https://x.com/a.jpg', 'Praia', 'polaroid']);
      expect(img.write({ url: 'https://x.com/a.jpg', frame: 'foto' })).toEqual(['https://x.com/a.jpg']);
      expect(img.write({ url: 'http://x.com/a.jpg' })).toBeNull();
      // a legenda que é o nome de uma moldura volta como legenda, e a moldura escolhida também
      for (const [caption, frame] of [['Recorte', 'polaroid'], ['Foto', 'foto'], ['Polaroide', 'recorte']]) {
        expect(readMedia(img.write({ url: 'https://x.com/a.jpg', caption, frame })!)).withContext(caption).toEqual({ url: 'https://x.com/a.jpg', frame: frame as Frame, caption });
      }
      // só as palavras da lista são moldura
      expect(readMedia(['https://x.com/a.jpg', 'Constructor'])).toEqual({ url: 'https://x.com/a.jpg', frame: 'foto', caption: 'Constructor' });
      expect(img.problem!({ url: 'http://x.com/a.jpg' })).toContain('https://');
      expect(img.read(['https://x.com/a.jpg', 'recorte'])).toEqual({ url: 'https://x.com/a.jpg', caption: '', frame: 'recorte' });
      const vid = widgetDef('vídeo')!;
      expect(vid.write({ url: 'https://site.com/pagina' })).toBeNull();
      expect(vid.problem!({ url: 'https://site.com/pagina' })).toContain('YouTube');
      expect(vid.problem!({ url: '' })).toBeNull();
      expect(widgetLine('video', vid.write({ url: 'https://youtu.be/dQw4w9WgXcQ', caption: 'Clipe' })!)).toBe('{{video: https://youtu.be/dQw4w9WgXcQ | Clipe}}');
    });
  });
});
