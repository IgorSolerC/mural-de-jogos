import { hasFormatting, hasTouchableWidget, parseRich, plainText } from './rich-text';
import { CARD_LOOKS, Frame, WIDGETS, cardLookSized, hideCardTitles, WIDGET_LINES, WIDGET_SIZES, cardRefsIn, hostOf, httpsUrl, parseAudio, parseVideo, readAudio, readCardRef, parseWhen, parseWidgetLine, readCountdown, readMedia, fieldsFor, remaining, splitArgs, targetOf, widgetCopy, widgetDef, widgetLine, writeWhen } from './widgets';

describe('widgets das anotações', () => {
  it('a linha de um widget: o nome (com acento, maiúscula ou outro nome) e os parâmetros', () => {
    expect(parseWidgetLine('{{contador: 19/11/2026 18:00 | GTA VI}}')).toEqual({ name: 'contador', args: ['19/11/2026 18:00', 'GTA VI'], size: 'medio' });
    expect(parseWidgetLine('  {{ Contagem :25/12}}  ')).toEqual({ name: 'contador', args: ['25/12'], size: 'medio' });
    expect(parseWidgetLine('{{contador}}')).toEqual({ name: 'contador', args: [], size: 'medio' });
    // a linha longa que não fecha não trava (o fim era procurado de novo a cada letra)
    const t = performance.now();
    expect(parseWidgetLine('{{contador:' + ' '.repeat(60_000) + 'x')).toBeNull();
    expect(performance.now() - t).toBeLessThan(400);
    expect(parseWidgetLine('{{contador: 25/12 | Natal   }}  ')).toEqual({ name: 'contador', args: ['25/12', 'Natal'], size: 'medio' });
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

    it('o que se repete, em palavras', () => {
      const every = (raw: string) => {
        const w = parseWhen(raw);
        return w && { every: w.every, day: w.day, weekday: w.weekday, hour: w.hour, minute: w.minute, timed: w.timed };
      };
      // todo dia: só a hora
      expect(every('todo dia 18:00')).toEqual({ every: 'dia', day: 0, weekday: undefined, hour: 18, minute: 0, timed: true });
      expect(every('Todos os dias às 7h30')).toEqual({ every: 'dia', day: 0, weekday: undefined, hour: 7, minute: 30, timed: true });
      expect(every('diariamente 7h')?.every).toBe('dia');
      expect(every('todo dia 18h')?.every).toBe('dia');
      // toda semana: o dia da semana (0 é domingo) e a hora
      expect(every('toda sexta 18:00')).toEqual({ every: 'semana', day: 0, weekday: 5, hour: 18, minute: 0, timed: true });
      expect(every('todas as segundas-feiras, às 9h')).toEqual({ every: 'semana', day: 0, weekday: 1, hour: 9, minute: 0, timed: true });
      expect(every('todo sábado')).toEqual({ every: 'semana', day: 0, weekday: 6, hour: 0, minute: 0, timed: false });
      expect(every('toda terça-feira 20:15')?.weekday).toBe(2);
      // todo mês: o dia do mês ("todo dia 18" é o dia 18; "todo dia 18h", a hora)
      expect(every('todo dia 5')).toEqual({ every: 'mes', day: 5, weekday: undefined, hour: 0, minute: 0, timed: false });
      expect(every('todo dia 18 10:00')).toEqual({ every: 'mes', day: 18, weekday: undefined, hour: 10, minute: 0, timed: true });
      expect(every('todo mês, dia 31 às 8h')).toEqual({ every: 'mes', day: 31, weekday: undefined, hour: 8, minute: 0, timed: true });
      // nada disso: um título que começa com "todo", o todo dia sem hora, um dia que não existe
      for (const bad of ['Todo mundo', 'todo dia', 'todo dia 32', 'todo dia 0', 'toda sexta 25:00', 'toda semana']) {
        expect(parseWhen(bad)).withContext(bad).toBeNull();
      }
      expect(readCountdown(['Todo mundo junto', 'toda sexta 18h'])).toEqual({ when: parseWhen('toda sexta 18h'), title: 'Todo mundo junto', look: 'calendario' });
    });

    it('o que se repete, escrito de volta', () => {
      expect(writeWhen(parseWhen('todos os dias às 7h')!)).toBe('todo dia 07:00');
      expect(writeWhen(parseWhen('todas as segundas-feiras, às 9h')!)).toBe('toda segunda 09:00');
      expect(writeWhen(parseWhen('todo domingo')!)).toBe('todo domingo');
      expect(writeWhen(parseWhen('todo mês, dia 5 às 18h')!)).toBe('todo dia 5 18:00');
      // e lido de novo, a mesma coisa
      for (const raw of ['todo dia 07:00', 'toda segunda 09:00', 'todo sábado 10:30', 'todo dia 5 18:00', 'todo dia 5']) {
        expect(writeWhen(parseWhen(raw)!)).withContext(raw).toBe(raw);
      }
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
      // o jeito em qualquer lugar, com os nomes de cada um; sem ele, o calendário
      expect(readCountdown(['Post-it', '19/11/2026', 'GTA VI'])).toEqual({ when: parseWhen('19/11/2026'), title: 'GTA VI', look: 'riscado' });
      expect(readCountdown(['19/11/2026', 'GTA VI', 'Placar']).look).toBe('placar');
      expect(readCountdown(['19/11/2026', 'Digital']).look).toBe('neon');
      expect(readCountdown(['19/11/2026', 'neon', 'Neon'])).toEqual({ when: parseWhen('19/11/2026'), title: 'Neon', look: 'neon' });
      expect(readCountdown(['19/11/2026', 'constructor']).look).toBe('calendario');
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

    it('o de todo dia: a próxima vez da hora; chegou, fica "agora" por uma hora e conta para amanhã', () => {
      const pill = parseWhen('todo dia 08:00')!;
      // 17/10/2026 é um sábado
      expect(targetOf(pill, at(2026, 10, 17, 7))).toBe(at(2026, 10, 17, 8));
      expect(targetOf(pill, at(2026, 10, 17, 8, 40))).toBe(at(2026, 10, 17, 8));
      expect(targetOf(pill, at(2026, 10, 17, 9, 0, 1))).toBe(at(2026, 10, 18, 8));
      expect(targetOf(pill, at(2026, 10, 17, 23))).toBe(at(2026, 10, 18, 8));
    });

    it('o de toda semana: o próximo dia da semana; no dia, "é hoje" até o fim dele', () => {
      const friday = parseWhen('toda sexta 18:00')!;
      expect(targetOf(friday, at(2026, 10, 17, 12))).toBe(at(2026, 10, 23, 18));
      expect(targetOf(friday, at(2026, 10, 23, 9))).toBe(at(2026, 10, 23, 18));
      expect(targetOf(friday, at(2026, 10, 23, 22))).toBe(at(2026, 10, 23, 18));
      expect(targetOf(friday, at(2026, 10, 24, 0, 0, 1))).toBe(at(2026, 10, 30, 18));
      expect(targetOf(parseWhen('todo sábado')!, at(2026, 10, 17, 12))).toBe(at(2026, 10, 17));
    });

    it('o de todo mês: o próximo dia do mês; num mês sem ele, o último dia', () => {
      const rent = parseWhen('todo dia 5 10:00')!;
      expect(targetOf(rent, at(2026, 10, 17))).toBe(at(2026, 11, 5, 10));
      expect(targetOf(rent, at(2026, 11, 5, 15))).toBe(at(2026, 11, 5, 10));
      expect(targetOf(rent, at(2026, 11, 6))).toBe(at(2026, 12, 5, 10));
      const last = parseWhen('todo dia 31')!;
      expect(targetOf(last, at(2026, 11, 2))).toBe(at(2026, 11, 30));
      expect(targetOf(last, at(2026, 12, 1))).toBe(at(2026, 12, 31));
      // dezembro → janeiro do ano que vem
      expect(targetOf(rent, at(2026, 12, 20))).toBe(at(2027, 1, 5, 10));
    });

    it('a cópia diz "é agora" no de todo dia e "é hoje" nos outros que se repetem', () => {
      expect(widgetCopy('contador', ['todo dia 08:00', 'Remédio'], { now: at(2026, 10, 17, 8, 10) })).toBe('{contador: é agora | Remédio}');
      expect(widgetCopy('contador', ['toda sexta 18:00'], { now: at(2026, 10, 23, 19) })).toBe('{contador: é hoje}');
      expect(widgetCopy('contador', ['toda sexta 18:00'], { now: at(2026, 10, 23, 15) })).toBe('{contador: 3h faltantes}');
    });
  });

  describe('o formulário do contador', () => {
    const def = widgetDef('contador')!;

    it('os campos viram a marca, e a marca volta para os campos', () => {
      expect(def.write({ title: ' GTA VI ', date: '2026-11-19', time: '18:00', repeat: '' })).toEqual(['19/11/2026 18:00', 'GTA VI']);
      expect(def.write({ date: '2026-12-25', repeat: 'ano' })).toEqual(['25/12']);
      expect(def.write({ title: 'sem dia', date: '' })).toBeNull();
      expect(def.read(['19/11/2026 18:00', 'GTA VI'])).toEqual({ title: 'GTA VI', repeat: '', date: '2026-11-19', weekday: '', monthDay: '', time: '18:00', look: 'calendario' });
      expect(def.read(['GTA VI'])).toEqual({ title: 'GTA VI', repeat: '', date: '', weekday: '', monthDay: '', time: '', look: 'calendario' });
      expect(def.read(['25/12'])['repeat']).toBe('ano');
    });

    it('Repete: todo dia pede só a hora; toda semana, o dia da semana; todo mês, o dia do mês', () => {
      const shown = (v: Record<string, string>) => fieldsFor(def, v).map((f) => f.key);
      expect(shown({})).toEqual(['title', 'repeat', 'date', 'time', 'look']);
      expect(shown({ repeat: 'ano' })).toEqual(['title', 'repeat', 'date', 'time', 'look']);
      expect(shown({ repeat: 'dia' })).toEqual(['title', 'repeat', 'time', 'look']);
      expect(shown({ repeat: 'semana' })).toEqual(['title', 'repeat', 'weekday', 'time', 'look']);
      expect(shown({ repeat: 'mes' })).toEqual(['title', 'repeat', 'monthDay', 'time', 'look']);
      // a hora do de todo dia é obrigatória; a dos outros, não
      expect(fieldsFor(def, { repeat: 'dia' }).find((f) => f.key === 'time')!.required).toBeTrue();
      expect(fieldsFor(def, { repeat: 'semana' }).find((f) => f.key === 'time')!.required).toBeUndefined();

      expect(def.write({ repeat: 'dia', time: '07:30', title: 'Remédio' })).toEqual(['todo dia 07:30', 'Remédio']);
      expect(def.write({ repeat: 'dia', time: '' })).toBeNull();
      // sem escolher, a semana começa na segunda (o primeiro botão)
      expect(def.write({ repeat: 'semana', time: '18:00' })).toEqual(['toda segunda 18:00']);
      expect(def.write({ repeat: 'semana', weekday: '0' })).toEqual(['todo domingo']);
      expect(def.write({ repeat: 'mes', monthDay: '5', time: '10:00', date: '2026-11-19' })).toEqual(['todo dia 5 10:00']);
      expect(def.write({ repeat: 'mes', monthDay: '32' })).toBeNull();
      expect(def.problem!({ repeat: 'mes', monthDay: '32' })).toBe('O dia do mês vai de 1 a 31.');
      expect(def.problem!({ repeat: 'mes', monthDay: '12' })).toBeNull();

      expect(def.read(['todo dia 07:30', 'Remédio'])).toEqual({ title: 'Remédio', repeat: 'dia', date: '', weekday: '', monthDay: '', time: '07:30', look: 'calendario' });
      expect(def.read(['toda sexta 18:00'])).toEqual({ title: '', repeat: 'semana', date: '', weekday: '5', monthDay: '', time: '18:00', look: 'calendario' });
      expect(def.read(['todo dia 5'])).toEqual({ title: '', repeat: 'mes', date: '', weekday: '', monthDay: '5', time: '', look: 'calendario' });
      // o dia da semana: de segunda a domingo
      expect(def.fields.find((f) => f.key === 'weekday')!.options!.map((o) => o.label)).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
    });

    it('o jeito: o calendário não se escreve; os outros vão depois da data, e um título que é nome de jeito vai depois dele', () => {
      expect(def.fields.find((f) => f.key === 'look')!.options!.map((o) => o.label)).toEqual(['Calendário', 'Neon', 'Placar', 'Riscado']);
      expect(def.write({ date: '2026-11-19', title: 'GTA VI', look: 'calendario' })).toEqual(['19/11/2026', 'GTA VI']);
      expect(def.write({ date: '2026-11-19', title: 'GTA VI', look: 'neon' })).toEqual(['19/11/2026', 'neon', 'GTA VI']);
      expect(def.write({ repeat: 'dia', time: '07:00', look: 'placar' })).toEqual(['todo dia 07:00', 'placar']);
      expect(def.write({ date: '2026-11-19', title: 'Neon' })).toEqual(['19/11/2026', 'calendario', 'Neon']);
      expect(def.read(['19/11/2026', 'neon', 'GTA VI'])['look']).toBe('neon');
      expect(def.read(['19/11/2026', 'calendario', 'Neon'])).toEqual(jasmine.objectContaining({ look: 'calendario', title: 'Neon' }));
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

    it('a imagem do aparelho (murall://imagem/ID): vale como o link, com a legenda e a moldura; o vídeo não aceita', () => {
      const img = widgetDef('imagem')!;
      const url = 'murall://imagem/' + 'A'.repeat(22);
      expect(img.write({ url, caption: 'Praia', frame: 'polaroid' })).toEqual([url, 'Praia', 'polaroid']);
      expect(img.problem!({ url })).toBeNull();
      expect(img.found!({ url })).toBe('Imagem guardada no Murall');
      expect(img.fields.find((f) => f.key === 'url')?.upload).toBeTrue();
      expect(parseWidgetLine(widgetLine('imagem', [url, 'Praia']))).toEqual({ name: 'imagem', args: [url, 'Praia'], size: 'medio' });
      expect(plainText(`{{imagem: ${url} | Praia}}`)).toBe('Praia');
      // um id quebrado não vale
      expect(img.write({ url: 'murall://imagem/curto' })).toBeNull();
      expect(widgetDef('video')!.write({ url })).toBeNull();
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

describe('a nota colada (o widget Nota)', () => {
  it('o id ("#r…") e o título em qualquer ordem; só o título vale para a escrita à mão', () => {
    expect(readCardRef(['#rabc123', 'Hollow Knight'])).toEqual({ id: 'rabc123', title: 'Hollow Knight', hidden: false, look: 'ficha', fold: 'aberta' });
    expect(readCardRef(['Hollow Knight', '#rabc123'])).toEqual({ id: 'rabc123', title: 'Hollow Knight', hidden: false, look: 'ficha', fold: 'aberta' });
    expect(readCardRef(['Comprar um console'])).toEqual({ id: '', title: 'Comprar um console', hidden: false, look: 'ficha', fold: 'aberta' });
    // um título que parece id, depois do id, é título
    expect(readCardRef(['#rabc123', '#1'])).toEqual({ id: 'rabc123', title: '#1', hidden: false, look: 'ficha', fold: 'aberta' });
    // "#" com espaço não é id
    expect(readCardRef(['# um título'])).toEqual({ id: '', title: '# um título', hidden: false, look: 'ficha', fold: 'aberta' });
    // o cadeado (a ficha privada, no texto de quem visita) não é o título
    expect(readCardRef(['#rabc123', '🔒'])).toEqual({ id: 'rabc123', title: '', hidden: true, look: 'ficha', fold: 'aberta' });
    expect(widgetDef('nota')!.plain(['#rabc123', '🔒'])).toBe('');
  });

  it('os outros nomes, o tamanho e a marca escrita de volta', () => {
    expect(parseWidgetLine('{{Ficha: #rabc123 | Celeste | pequeno}}')).toEqual({ name: 'nota', args: ['#rabc123', 'Celeste'], size: 'pequeno' });
    const def = widgetDef('nota')!;
    expect(def.label).toBe('Nota');
    expect(def.write({ id: 'rabc123', title: ' Hollow | Knight ' })).toEqual(['#rabc123', 'Hollow | Knight']);
    expect(widgetLine('nota', def.write({ id: 'rabc123', title: 'Hollow | Knight' })!, 'grande')).toBe('{{nota: #rabc123 | Hollow \\| Knight | grande}}');
    expect(def.write({ id: '', title: 'Comprar um console' })).toEqual(['Comprar um console']);
    expect(def.write({ id: 'com espaço' })).toBeNull();
    expect(def.write({})).toBeNull();
    // um título que é palavra de tamanho não vira o tamanho
    const line = widgetLine('nota', def.write({ id: 'rabc123', title: 'Grande' })!, 'medio');
    expect(parseWidgetLine(line)).toEqual({ name: 'nota', args: ['#rabc123', 'Grande'], size: 'medio' });
    // lida de volta, para o painel de trocar
    expect(def.read(['#rabc123', 'Celeste'])).toEqual({ id: 'rabc123', title: 'Celeste', look: 'ficha', fold: 'aberta' });
  });

  it('o jeito: ficha (o de sempre, não se escreve), capa, tira e texto inteiro', () => {
    const def = widgetDef('nota')!;
    expect(CARD_LOOKS.map((l) => l.value)).toEqual(['ficha', 'capa', 'tira', 'inteira']);
    expect(def.fields.find((f) => f.key === 'look')?.display).toBe('tiles');
    expect(def.write({ id: 'rabc123', title: 'Celeste', look: 'ficha' })).toEqual(['#rabc123', 'Celeste']);
    expect(def.write({ id: 'rabc123', title: 'Celeste', look: 'inteira' })).toEqual(['#rabc123', 'Celeste', 'inteira']);
    expect(def.write({ id: 'rabc123', look: 'tira' })).toEqual(['#rabc123', 'tira']);
    expect(def.write({ id: '', title: 'Compras', look: 'capa' })).toEqual(['Compras', 'capa']);
    // lido em qualquer ordem, com ou sem acento e caixa
    expect(readCardRef(['Capa', '#rabc123', 'Celeste'])).toEqual({ id: 'rabc123', title: 'Celeste', hidden: false, look: 'capa', fold: 'aberta' });
    expect(def.read(['#rabc123', 'Celeste', 'INTEIRA'])).toEqual({ id: 'rabc123', title: 'Celeste', look: 'inteira', fold: 'aberta' });
    // um título que é palavra de jeito volta como título: o jeito vai antes, escrito
    for (const look of ['ficha', 'tira'] as const) {
      const args = def.write({ id: 'rabc123', title: 'Capa', look })!;
      expect(readCardRef(args)).withContext(look).toEqual({ id: 'rabc123', title: 'Capa', hidden: false, look, fold: 'aberta' });
    }
    // o tamanho continua à parte do jeito
    expect(parseWidgetLine('{{nota: #rabc123 | Celeste | capa | grande}}')).toEqual({ name: 'nota', args: ['#rabc123', 'Celeste', 'capa'], size: 'grande' });
  });

  it('o texto inteiro começa aberto (não se escreve) ou fechado; a escolha só aparece nele', () => {
    const def = widgetDef('nota')!;
    const field = def.fields.find((f) => f.key === 'fold')!;
    expect(field.display).toBe('segments');
    expect(field.options!.map((o) => o.value)).toEqual(['aberta', 'fechada']);
    expect(fieldsFor(def, { id: 'r1', look: 'inteira' }).map((f) => f.key)).toContain('fold');
    expect(fieldsFor(def, { id: 'r1', look: 'tira' }).map((f) => f.key)).not.toContain('fold');
    expect(def.write({ id: 'rabc123', title: 'Celeste', look: 'inteira', fold: 'fechada' })).toEqual(['#rabc123', 'Celeste', 'inteira', 'fechada']);
    expect(def.write({ id: 'rabc123', title: 'Celeste', look: 'inteira', fold: 'aberta' })).toEqual(['#rabc123', 'Celeste', 'inteira']);
    // fora do texto inteiro, o fechado não se escreve
    expect(def.write({ id: 'rabc123', title: 'Celeste', look: 'tira', fold: 'fechada' })).toEqual(['#rabc123', 'Celeste', 'tira']);
    expect(readCardRef(['#rabc123', 'fechada', 'Celeste', 'inteira'])).toEqual({ id: 'rabc123', title: 'Celeste', hidden: false, look: 'inteira', fold: 'fechada' });
    // um título que é palavra de "começa" volta como título
    const args = def.write({ id: 'rabc123', title: 'Fechada', look: 'ficha' })!;
    expect(readCardRef(args)).toEqual({ id: 'rabc123', title: 'Fechada', hidden: false, look: 'ficha', fold: 'aberta' });
    // a privada escondida de quem visita fica fechada
    expect(hideCardTitles('{{nota: #rabc123 | Diário | inteira | fechada}}', new Set(['rabc123']))).toBe('{{nota: #rabc123 | 🔒 | inteira | fechada}}');
  });

  it('a tira e o texto inteiro têm a altura do que mostram: a folha diz isso no lugar do tamanho', () => {
    const def = widgetDef('nota')!;
    expect(def.fixedSize!({ id: 'r1', look: 'ficha' })).toBeNull();
    expect(def.fixedSize!({ id: 'r1', look: 'capa' })).toBeNull();
    expect(def.fixedSize!({ id: 'r1', look: 'tira' })).toContain('duas linhas');
    expect(def.fixedSize!({ id: 'r1', look: 'inteira' })).toContain('altura do texto');
    expect(cardLookSized('ficha')).toBeTrue();
    expect(cardLookSized('inteira')).toBeFalse();
    // os outros widgets têm sempre o tamanho
    expect(WIDGETS.filter((w) => w.fixedSize).map((w) => w.name)).toEqual(['nota']);
  });

  it('a privada, no texto de quem visita, perde o título mas fica com o jeito e o tamanho', () => {
    expect(hideCardTitles('{{nota: #rabc123 | Diário | tira}}', new Set(['rabc123']))).toBe('{{nota: #rabc123 | 🔒 | tira}}');
    expect(hideCardTitles('{{nota: #rabc123 | Diário | grande}}', new Set(['rabc123']))).toBe('{{nota: #rabc123 | 🔒 | grande}}');
    expect(readCardRef(['#rabc123', '🔒', 'inteira'])).toEqual({ id: 'rabc123', title: '', hidden: true, look: 'inteira', fold: 'aberta' });
  });

  it('a privada perde o título também embaixo de um item (o recuo fica) e com um "\r" sozinho separando as linhas', () => {
    const hidden = new Set(['rabc123']);
    // embaixo do item, recuada: continua no item, como no texto do dono
    expect(hideCardTitles('- [ ] Ler\n    {{nota: #rabc123 | Diário}}\n- Outro', hidden)).toBe('- [ ] Ler\n    {{nota: #rabc123 | 🔒}}\n- Outro');
    // a leitura conta o "\r" sozinho (de um texto de fora) como quebra de linha: o título não pode passar
    expect(hideCardTitles('Antes\r{{nota: #rabc123 | Diário}}\r\nDepois', hidden)).toBe('Antes\r{{nota: #rabc123 | 🔒}}\r\nDepois');
    // quem diz o que está fora pode ser uma função (o envio do mural esconde tudo o que não está à mostra)
    expect(hideCardTitles('{{nota: #routra | Outra}}', (id) => id !== 'rabc123')).toBe('{{nota: #routra | 🔒}}');
    expect(hideCardTitles('{{nota: #rabc123 | Diário}}', (id) => id !== 'rabc123')).toBe('{{nota: #rabc123 | Diário}}');
  });

  it('o texto dela é o título (a busca, a contagem de palavras); as do texto, na ordem', () => {
    expect(plainText('antes\n{{nota: #rabc123 | Celeste}}')).toBe('antes\nCeleste');
    expect(cardRefsIn('a\n{{nota: #r1 | Um}}\n- {{nota: #r2}}\r\n{{ficha: Dois}}\n{{contador: 25/12}}')).toEqual([
      { id: 'r1', title: 'Um' },
      { id: '', title: 'Dois' },
    ]);
    expect(cardRefsIn('sem nada')).toEqual([]);
  });

  it('hasTouchableWidget: todo widget tem o que tocar na ficha, menos a tabela', () => {
    for (const w of ['{{contador: 25/12 | neon | pequeno}}', '{{imagem: https://a.com/b.png}}', '{{video: https://youtu.be/dQw4w9WgXcQ}}', '{{audio: https://youtu.be/dQw4w9WgXcQ}}', '{{nota: #r1 | Um}}'])
      expect(hasTouchableWidget(`antes\r\n${w}\nfim`)).withContext(w).toBeTrue();
    expect(hasTouchableWidget('{{tabela: listrada}}\n| a |\n| - |\n| 1 |')).toBeFalse();
    expect(hasTouchableWidget('texto com {{contador: 25/12}} no meio')).toBeFalse();
    // dentro de um bloco de código, é texto
    expect(hasTouchableWidget('```\n{{contador: 25/12}}\n```')).toBeFalse();
    expect(hasTouchableWidget('{{nao-existe: x}}')).toBeFalse();
    expect(hasTouchableWidget('só texto')).toBeFalse();
  });

  it('hostOf: o site do link, sem o www; vazio se não for link', () => {
    expect(hostOf('https://www.youtube.com/watch?v=x')).toBe('youtube.com');
    expect(hostOf('https://soundcloud.com/a/b')).toBe('soundcloud.com');
    expect(hostOf('não é link')).toBe('');
  });
});

describe('a cópia de cada widget, como texto', () => {
  it('todo widget sai como "{nome: …}", com o nome dele, e um nome que não existe não sai', () => {
    const ctx = { now: Date.now() };
    for (const w of WIDGETS) {
      const out = widgetCopy(w.name, [], ctx);
      expect(out === `{${w.name}}` || out.startsWith(`{${w.name}: `)).withContext(out).toBeTrue();
    }
    expect(widgetCopy('foto', ['https://x.com/a.jpg'], ctx)).toBe('{imagem: https://x.com/a.jpg}');
    expect(widgetCopy('nada', ['x'], ctx)).toBe('');
  });

  it('a cópia fica numa linha só', () => {
    expect(widgetCopy('imagem', ['https://x.com/a.jpg', 'Uma\nlegenda'], { now: 0 })).toBe('{imagem: https://x.com/a.jpg | Uma legenda}');
  });

  describe('a folha do widget', () => {
    it('todo widget diz a dica do índice, o nome do que mostra, e os jeitos vão para a Aparência como miniaturas', () => {
      for (const def of WIDGETS) {
        expect(def.hint).withContext(def.name).toBeTruthy();
        expect(def.what).withContext(def.name).toBeTruthy();
        // o que é obrigatório diz o que falta
        for (const f of def.fields.filter((f) => f.required)) expect(f.missing).withContext(def.name + '.' + f.key).toMatch(/^Falta /);
      }
      const tiles = (name: string) => widgetDef(name)!.fields.filter((f) => f.display === 'tiles').map((f) => f.key);
      expect(tiles('contador')).toEqual(['look']);
      expect(tiles('imagem')).toEqual(['frame']);
      expect(tiles('video')).toEqual(['frame']);
      expect(tiles('audio')).toEqual(['look']);
      expect(tiles('nota')).toEqual(['look']);
      expect(tiles('tabela')).toEqual(['look']);
      // o repete, o dia e a hora do contador numa linha só
      const quando = widgetDef('contador')!.fields.filter((f) => f.row === 'quando').map((f) => f.key);
      expect(quando).toEqual(['repeat', 'date', 'monthDay', 'time', 'time']);
    });

    it('o link que serve é confirmado: de onde ele vem e que toca ali mesmo', () => {
      expect(widgetDef('imagem')!.found!({ url: 'https://www.exemplo.com/a.jpg' })).toBe('Imagem de exemplo.com');
      expect(widgetDef('imagem')!.found!({ url: 'http://exemplo.com/a.jpg' })).toBeNull();
      expect(widgetDef('video')!.found!({ url: 'https://youtu.be/dQw4w9WgXcQ' })).toBe('Vídeo do YouTube, toca aqui mesmo');
      expect(widgetDef('video')!.found!({ url: 'https://vimeo.com/76979871' })).toBe('Vídeo do Vimeo, toca aqui mesmo');
      expect(widgetDef('video')!.found!({ url: 'https://site.com/clip.webm' })).toBe('Vídeo de um arquivo .webm, toca aqui mesmo');
      expect(widgetDef('audio')!.found!({ url: 'https://site.com/a.MP3' })).toBe('Som de um arquivo .mp3, toca aqui mesmo');
      expect(widgetDef('audio')!.found!({ url: 'https://site.com/pagina' })).toBeNull();
      expect(widgetDef('audio')!.found!({})).toBeNull();
    });
  });
});
