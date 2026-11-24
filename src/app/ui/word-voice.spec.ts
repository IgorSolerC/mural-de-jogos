import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { dictionaryWords } from '../core/dictionary/words';
import { SPEECH, UTTERANCE, Voz } from '../core/voz';
import { FakeSpeech, GOOGLE_JA, GOOGLE_PT, fakeUtterance } from '../testing/fala-falsa';
import { WordVoice } from './word-voice';

/** Ouvir a palavra do Dicionário Japonês (PLANO-DICIONARIO.md, 5.2). */
describe('Ouvir a palavra do dicionário', () => {
  let fake: FakeSpeech;
  let fixture: ComponentFixture<WordVoice>;
  const word = (text: string) => dictionaryWords().words.find((w) => w.text === text)!;

  function open(text: string): HTMLElement {
    fixture = TestBed.createComponent(WordVoice);
    fixture.componentRef.setInput('word', word(text));
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  beforeEach(() => {
    fake = new FakeSpeech();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: SPEECH, useValue: fake }, { provide: UTTERANCE, useValue: fakeUtterance }] });
  });
  afterEach(() => TestBed.inject(Voz).stop());

  it('diz a leitura em kana na voz japonesa, acende enquanto diz e tocar de novo cala', () => {
    fake.setVoices([GOOGLE_PT, GOOGLE_JA]);
    const el = open('食べる');
    const button = el.querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('aria-label')).toBe('Ouvir 食べる');
    button.click();
    fake.begin();
    fixture.detectChanges();
    const said = fake.spoken[fake.spoken.length - 1];
    expect(said.text).toBe('たべる');
    expect(said.voice).toBe(GOOGLE_JA);
    expect(button.classList).toContain('ligado');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    fixture.detectChanges();
    expect(TestBed.inject(Voz).playing()).toBeFalse();
    expect(button.classList).not.toContain('ligado');
  });

  it('acaba sozinho: apaga quando a voz termina', () => {
    fake.setVoices([GOOGLE_JA]);
    const el = open('食べる');
    el.querySelector<HTMLButtonElement>('button')!.click();
    fake.begin();
    fake.end();
    fixture.detectChanges();
    expect(el.querySelector('button')!.classList).not.toContain('ligado');
  });

  it('sem voz japonesa no navegador, o botão não aparece', () => {
    fake.setVoices([GOOGLE_PT]);
    expect(open('食べる').querySelector('button')).toBeNull();
    fake.setVoices([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    fake.setVoices([GOOGLE_JA]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
  });
});
