import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Reminder } from './calendar';
import { CalendarStore } from './calendar-store';
import { notesAsText } from './note-copy';
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { ReminderLinks, reminderLinkInfo, reminderLinkTitle, reminderOptions } from './reminder-links';
import { whenItMatters } from './calendar';
import { htmlDe } from '../ui/visual-editor/copiar';
import { schema } from '../ui/visual-editor/schema';
import { docToText, textToDoc } from './rich-doc';
import { copyText, hasFormatting, hasInteractive, linkAt, parseInline, parseRich, plainText, reminderLink, reminderLinkId } from './rich-text';
import { sanitizeReview } from './review';
import { matchesQuery } from './wall-filter';

/** O link para um lembrete do Calendário no texto das anotações: "[texto](murall://lembrete/ID)". */

const T0 = '2026-10-10T10:00:00.000Z';
const HOJE = '2026-11-01'; // um domingo

function reminder(id: string, title: string, date: string, extra: Partial<Reminder> = {}): Reminder {
  return { id, title, date, color: 'amarelo', notes: [], skip: [], createdAt: T0, at: T0, ...extra };
}

describe('o link de lembrete no markdown (core/rich-text.ts)', () => {
  it('o endereço murall://lembrete/ID vira o link, com o texto escrito; o id volta pelo endereço', () => {
    const spans = parseInline('- [ ] Ir para a [reunião da empresa](murall://lembrete/rk2x9abc) amanhã'.slice(6));
    const link = spans.find((s) => s.href);
    expect(link).toEqual({ text: 'reunião da empresa', href: 'murall://lembrete/rk2x9abc' });
    expect(reminderLinkId(link!.href)).toBe('rk2x9abc');
    expect(reminderLink('rk2x9abc')).toBe('murall://lembrete/rk2x9abc');
    expect(reminderLinkId('https://murall.igorsc.com.br')).toBeNull();
    expect(reminderLinkId(undefined)).toBeNull();
  });

  it('só o jeito "[texto](…)" com um id de verdade é link; o resto fica como foi escrito', () => {
    for (const t of ['murall://lembrete/abc', '<murall://lembrete/abc>', '[x](murall://lembrete/)', '[x](murall://lembrete/a b)', '[x](murall://lembrete/abc/def)', '[x](murall://outra/abc)', '`[x](murall://lembrete/abc)`', '\\[x](murall://lembrete/abc)'])
      expect(parseInline(t).some((s) => s.href)).withContext(t).toBeFalse();
    // com negrito por fora, numa tarefa, num card
    expect(parseInline('**[x](murall://lembrete/abc)**')).toEqual([{ text: 'x', bold: true, href: 'murall://lembrete/abc' }]);
    const b = parseRich('- [ ] ir à [festa](murall://lembrete/r1)')[0];
    expect(b.kind === 'check' && b.items[0].spans.at(-1)).toEqual({ text: 'festa', href: 'murall://lembrete/r1' });
  });

  it('é formatação e é tocável (a ficha sabe que tem link)', () => {
    expect(hasFormatting('ver [a festa](murall://lembrete/r1)')).toBeTrue();
    expect(hasInteractive('ver [a festa](murall://lembrete/r1)')).toBeTrue();
  });

  it('o link é achado onde o cursor cai (o clique no Markdown abre o painel dele)', () => {
    const line = 'ir à [festa](murall://lembrete/r1) hoje';
    expect(linkAt(line, 7)).toEqual({ kind: 'url', start: 5, end: 34, text: 'festa', href: 'murall://lembrete/r1' });
  });

  it('o texto sem marcas é só o texto; a cópia leva a data, quando o lembrete está no Calendário', () => {
    const text = '- [ ] Ir para a [reunião](murall://lembrete/r1)\n- [ ] [Ração](murall://lembrete/sumido)';
    expect(plainText(text)).toBe('Ir para a reunião\nRação');
    const ctx = { now: 0, reminderDate: (id: string) => (id === 'r1' ? '02/11/2026, 9h' : null) };
    expect(copyText(text, ctx)).toBe('Ir para a reunião (02/11/2026, 9h)\nRação');
    // sem quem diga a data, só o texto
    expect(copyText(text, { now: 0 })).toBe('Ir para a reunião\nRação');
    expect(notesAsText([{ game: { name: 'Para amanhã' } as never, text }], ctx)).toBe('TÍTULO: Para amanhã\nDESCRIÇÃO: Ir para a reunião (02/11/2026, 9h)\nRação');
  });

  it('o Visual lê e escreve o link sem mudar um byte (o tradutor)', () => {
    for (const t of [
      '- [ ] Ir para a [reunião da empresa](murall://lembrete/rk2x9abc)',
      '**[Ração](murall://lembrete/r-1_b)** e [site](https://x.com)',
      '| Quando | O quê |\n| --- | --- |\n| amanhã | [reunião](murall://lembrete/r1) |',
    ]) {
      const doc = textToDoc(t);
      expect(doc.linhas.some((l) => l.kind === 'cru')).withContext(t).toBeFalse();
      expect(docToText(doc).texto).withContext(t).toBe(t);
    }
  });

  it('no Visual: o desenho do link de lembrete é lido de volta como o link (pelo id); a cópia em HTML leva a data', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>ir à <span class="elo lembrete" data-lembrete="rk2x9abc">reunião</span></p>';
    const doc = PMDOMParser.fromSchema(schema).parse(div);
    let href = '';
    doc.descendants((n) => {
      const m = n.marks.find((x) => x.type.name === 'link');
      if (m) href = m.attrs['href'];
    });
    expect(href).toBe('murall://lembrete/rk2x9abc');
    const t = 'Ir à [reunião](murall://lembrete/rk2x9abc) e ao [site](https://x.com)';
    const html = htmlDe(textToDoc(t).linhas, t, { now: 0, reminderDate: (id) => (id === 'rk2x9abc' ? '02/11/2026, 9h' : null) });
    expect(html).toContain('reunião (02/11/2026, 9h)');
    // (o markdown inteiro vai no atributo, para colar de volta no Murall; no que se vê, nenhum endereço murall:)
    expect(html).not.toContain('href="murall');
    expect(html).toContain('href="https://x.com"');
  });

  it('a busca do mural acha o texto do link, nunca o endereço escondido', () => {
    const r = sanitizeReview({ kind: 'anotacoes', game: { name: 'Para amanhã' }, text: 'Ir para a [reunião](murall://lembrete/r1)', createdAt: T0, updatedAt: T0 })!;
    expect(matchesQuery(r, 'reuniao')).toBeTrue();
    expect(matchesQuery(r, 'lembrete')).toBeFalse();
    expect(matchesQuery(r, 'murall')).toBeFalse();
  });
});

describe('o que o link mostra do lembrete (core/reminder-links.ts)', () => {
  it('o dia que importa, perto de quem lê, e o dia inteiro para a cópia', () => {
    expect(reminderLinkInfo(reminder('r1', 'Reunião', '2026-11-02', { time: '09:00' }), HOJE, '12:00')).toEqual({ title: 'Reunião', when: 'Amanhã, 9h', date: '02/11/2026, 9h', past: false, day: '2026-11-02' });
    // o de hoje, que já foi: passou
    expect(reminderLinkInfo(reminder('r2', 'Remédio', HOJE, { time: '08:30' }), HOJE, '12:00')).toEqual({ title: 'Remédio', when: 'Hoje, 8h30', date: '01/11/2026, 8h30', past: true, day: HOJE });
    // o que repete: a próxima vez
    expect(reminderLinkInfo(reminder('r3', 'Feira', '2026-10-02', { repeat: 'semana' }), HOJE, '12:00').day).toBe('2026-11-06');
    // o que não volta mais: o último dia, já passado
    const velho = reminderLinkInfo(reminder('r4', 'Prova', '2026-09-15'), HOJE, '12:00');
    expect(velho).toEqual({ title: 'Prova', when: 'ter, 15 de set.', date: '15/09/2026', past: true, day: '2026-09-15' });
  });

  it('o ícone do lembrete vai junto, para o link e o seletor o desenharem', () => {
    const bolo = reminder('r5', 'Bolo', '2026-11-02', { icon: 'bolo' });
    expect(reminderLinkInfo(bolo, HOJE, '12:00').icon).toBe('bolo');
    expect('icon' in reminderLinkInfo(reminder('r6', 'Aula', '2026-11-02'), HOJE, '12:00')).toBeFalse();
    expect(reminderOptions([bolo], '', HOJE, '12:00')[0].icon).toBe('bolo');
  });

  it('o que não volta mais abre no último dia em que ele acontece (não no fim da repetição, nem num dia tirado)', () => {
    // toda segunda, até uma quarta
    expect(whenItMatters(reminder('s', 'Aula', '2026-09-07', { repeat: 'semana', until: '2026-09-23' }), HOJE)).toEqual({ day: '2026-09-21', past: true });
    expect(whenItMatters(reminder('t', 'Aula', '2026-09-07', { repeat: 'semana', until: '2026-09-21', skip: ['2026-09-21'] }), HOJE).day).toBe('2026-09-14');
    // o de vários dias: o último dia dele
    expect(whenItMatters(reminder('v', 'Viagem', '2026-10-10', { end: '2026-10-12' }), HOJE).day).toBe('2026-10-12');
  });

  it('a dica do link: o nome, quando, e se já passou', () => {
    expect(reminderLinkTitle({ title: 'Reunião', when: 'Amanhã, 9h', date: '', past: false, day: '' })).toBe('Lembrete: Reunião · Amanhã, 9h');
    expect(reminderLinkTitle({ title: 'Prova', when: 'ter, 15 de set.', date: '', past: true, day: '' })).toBe('Lembrete: Prova · ter, 15 de set. (já passou)');
  });

  it('o seletor: a busca sem acento, os que começam com ela antes, os próximos antes dos que passaram', () => {
    const list = [
      reminder('a', 'Prova de inglês', '2026-09-15'),
      reminder('b', 'Reunião da empresa', '2026-11-03', { time: '14:00' }),
      reminder('c', 'Pagar a reunião do condomínio', '2026-11-02'),
      reminder('d', 'Feira', '2026-10-02', { repeat: 'semana' }),
    ];
    expect(reminderOptions(list, '', HOJE, '12:00').map((o) => o.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(reminderOptions(list, 'reuniao', HOJE, '12:00').map((o) => o.id)).toEqual(['b', 'c']);
    const [b] = reminderOptions(list, 'Reunião da', HOJE, '12:00');
    expect(b.meta).toBe('ter, 3 de nov., 14h');
    const [d] = reminderOptions(list, 'feira', HOJE, '12:00');
    expect(d.meta).toContain('sex, 6 de nov.');
    expect(d.meta).toContain('·');
    expect(reminderOptions(list, 'prova', HOJE, '12:00')[0].meta).toBe('ter, 15 de set. · já passou');
    expect(reminderOptions(list, '', HOJE, '12:00', 2).length).toBe(2);
  });

  describe('ReminderLinks', () => {
    let links: ReminderLinks;
    let router: Router;
    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
      const calendar = TestBed.inject(CalendarStore);
      calendar.today.set(HOJE);
      calendar.time.set('12:00');
      calendar.state.set({ removed: {}, reminders: [reminder('rk2x9abc', 'Reunião da empresa', '2026-11-02', { time: '09:00' })] });
      links = TestBed.inject(ReminderLinks);
      router = TestBed.inject(Router);
    });
    afterEach(() => localStorage.clear());

    it('acha o lembrete pelo id (o que não está no Calendário é null) e a data da cópia', () => {
      expect(links.info('rk2x9abc')?.when).toBe('Amanhã, 9h');
      expect(links.info('sumido')).toBeNull();
      expect(links.dateOf('rk2x9abc')).toBe('02/11/2026, 9h');
      expect(links.dateOf('sumido')).toBeNull();
      expect(links.any()).toBeTrue();
      expect(links.options('reu').map((o) => o.id)).toEqual(['rk2x9abc']);
    });

    it('abre o Calendário no dia dele, na vista do dia, com ele no endereço (o que não existe não abre)', () => {
      const nav = spyOn(router, 'navigate').and.resolveTo(true);
      expect(links.open('rk2x9abc')).toBeTrue();
      expect(nav).toHaveBeenCalledWith(['/anotacoes/calendario'], { queryParams: { vista: 'dia', dia: '2026-11-02', lembrete: 'rk2x9abc' } });
      nav.calls.reset();
      expect(links.open('sumido')).toBeFalse();
      expect(nav).not.toHaveBeenCalled();
    });
  });
});
