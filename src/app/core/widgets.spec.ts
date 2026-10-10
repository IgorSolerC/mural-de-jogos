import { hasFormatting, parseRich, plainText } from './rich-text';
import { Frame, WIDGET_LINES, WIDGET_SIZES, httpsUrl, parseAudio, parseVideo, readAudio, parseWhen, parseWidgetLine, readCountdown, readMedia, remaining, splitArgs, targetOf, widgetDef, widgetLine, writeWhen } from './widgets';

describe('widgets das anotações', () => {
  it('a linha de um widget: o nome (com acento, maiúscula ou outro nome) e os parâmetros', () => {
    expect(parseWidgetLine('{{contador: 19/11/2026 18:00 | GTA VI}}')).toEqual({ name: 'contador', args: ['19/11/2026 18:00', 'GTA VI'], size: 'medio' });
    expect(parseWidgetLine('  {{ Contagem :25/12}}  ')).toEqual({ name: 'contador', args: ['25/12'], size: 'medio' });
    expect(parseWidgetLine('{{contador}}')).toEqual({ name: 'contador', args: [], size: 'medio' });
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

  it('o tamanho: a primeira palavra de tamanho, em qualquer lugar, sai dos parâmetros; o médio não se escreve', () => {
    expect(parseWidgetLine('{{contador: 19/11/2026 | GTA VI | grande}}')).toEqual({ name: 'contador', args: ['19/11/2026', 'GTA VI'], size: 'grande' });
    expect(parseWidgetLine('{{imagem: Pequena | https://x.com/a.jpg}}')).toEqual({ name: 'imagem', args: ['https://x.com/a.jpg'], size: 'pequeno' });
    expect(parseWidgetLine('{{audio: https://x.com/a.mp3 | Médio}}')).toEqual({ name: 'audio', args: ['https://x.com/a.mp3'], size: 'medio' });
    expect(widgetLine('contador', ['19/11/2026', 'GTA VI'], 'grande')).toBe('{{contador: 19/11/2026 | GTA VI | grande}}');
    expect(widgetLine('contador', ['19/11/2026', 'GTA VI'], 'medio')).toBe('{{contador: 19/11/2026 | GTA VI}}');
    expect(widgetLine('contador', [], 'pequeno')).toBe('{{contador: pequeno}}');
    // um título que é uma palavra de tamanho: o tamanho vai antes dele, até o médio
    const big = widgetLine('contador', ['19/11/2026', 'Grande'], 'medio');
    expect(big).toBe('{{contador: 19/11/2026 | medio | Grande}}');
    expect(parseWidgetLine(big)).toEqual({ name: 'contador', args: ['19/11/2026', 'Grande'], size: 'medio' });
    expect(parseWidgetLine(widgetLine('imagem', ['https://x.com/a.jpg', 'Pequeno'], 'grande'))).toEqual({ name: 'imagem', args: ['https://x.com/a.jpg', 'Pequeno'], size: 'grande' });
    // o tamanho não é título nem legenda para o que lê palavras
    expect(plainText('{{contador: 19/11/2026 | Embarque | grande}}')).toBe('Embarque');
    expect(parseRich('{{video: https://youtu.be/dQw4w9WgXcQ | pequeno}}')[0]).toEqual({ kind: 'widget', name: 'video', args: ['https://youtu.be/dQw4w9WgXcQ'], size: 'pequeno' });
  });

  it('quatro tamanhos, o mini o menor; cada um, uma altura em linhas que cresce de um para o outro', () => {
    expect(WIDGET_SIZES.map((s) => s.value)).toEqual(['mini', 'pequeno', 'medio', 'grande']);
    for (const w of ['mini', 'Mínimo', 'minúscula']) expect(parseWidgetLine(`{{imagem: https://x.com/a.jpg | ${w}}}`)!.size).withContext(w).toBe('mini');
    expect(widgetLine('audio', ['https://x.com/a.mp3'], 'mini')).toBe('{{audio: https://x.com/a.mp3 | mini}}');
    const lines = WIDGET_SIZES.map((s) => WIDGET_LINES[s.value]);
    expect(lines.every((n, i) => i === 0 || n > lines[i - 1])).toBeTrue();
  });

  it('no texto, o widget é um bloco só dele; para o que lê palavras, fica o título', () => {
    const text = 'Viagem\n{{contador: 19/11/2026 | Embarque}}\n- [ ] mala';
    expect(parseRich(text).map((b) => b.kind)).toEqual(['p', 'widget', 'check']);
    expect(parseRich(text)[1]).toEqual({ kind: 'widget', name: 'contador', args: ['19/11/2026', 'Embarque'], size: 'medio' });
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
      expect(parseWidgetLine('{{Foto: https://x.com/a.jpg | Praia}}')).toEqual({ name: 'imagem', args: ['https://x.com/a.jpg', 'Praia'], size: 'medio' });
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
  describe('o áudio', () => {
    it('os sons que tocam: arquivo de som ou de vídeo, YouTube e Vimeo', () => {
      expect(parseAudio('https://site.com/musica.MP3?dl=1')).toEqual({ kind: 'file', url: 'https://site.com/musica.MP3?dl=1' });
      expect(parseAudio('https://site.com/clip.mp4')).toEqual({ kind: 'file', url: 'https://site.com/clip.mp4' });
      expect(parseAudio('https://youtu.be/dQw4w9WgXcQ?t=42')).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ', start: 42 });
      expect(parseAudio('https://vimeo.com/76979871')).toEqual({ kind: 'vimeo', id: '76979871', hash: null });
      for (const bad of ['http://site.com/a.mp3', 'https://site.com/pagina', 'https://open.spotify.com/track/abc']) {
        expect(parseAudio(bad)).withContext(bad).toBeNull();
      }
    });

    it('os parâmetros em qualquer ordem; o jeito só quando não é a fita', () => {
      expect(parseWidgetLine('{{Música: vinil | https://youtu.be/dQw4w9WgXcQ | Never Gonna}}')).toEqual({ name: 'audio', args: ['vinil', 'https://youtu.be/dQw4w9WgXcQ', 'Never Gonna'], size: 'medio' });
      expect(readAudio(['vinil', 'https://x.com/a.mp3', 'Lado B'])).toEqual({ url: 'https://x.com/a.mp3', look: 'vinil', title: 'Lado B' });
      expect(readAudio(['https://x.com/a.mp3'])).toEqual({ url: 'https://x.com/a.mp3', look: 'fita', title: '' });
      const au = widgetDef('som')!;
      expect(au.write({ url: 'https://x.com/a.mp3', title: ' Lado B ', look: 'fita' })).toEqual(['https://x.com/a.mp3', 'Lado B']);
      expect(au.write({ url: 'https://x.com/a.mp3', look: 'simples' })).toEqual(['https://x.com/a.mp3', 'simples']);
      expect(au.write({ url: 'https://site.com/pagina' })).toBeNull();
      // o nome que é uma das palavras volta como nome
      expect(readAudio(au.write({ url: 'https://x.com/a.mp3', title: 'Disco', look: 'fita' })!)).toEqual({ url: 'https://x.com/a.mp3', look: 'fita', title: 'Disco' });
      expect(au.problem!({ url: 'https://site.com/pagina' })).toContain('YouTube');
      expect(au.problem!({ url: 'http://x.com/a.mp3' })).toContain('https://');
      expect(plainText('{{audio: https://x.com/a.mp3 | Lado B}}')).toBe('Lado B');
    });
  });
});
