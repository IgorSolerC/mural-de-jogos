import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GluedMedia } from './glued-media';

describe('a foto colada na anotação', () => {
  it('trocar o link começa de novo: o "não abriu" do link de antes não fica', async () => {
    TestBed.configureTestingModule({ imports: [GluedMedia], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(GluedMedia);
    fixture.componentRef.setInput('kind', 'imagem');
    // digitando o link: um pedaço dele já passa por link e não abre
    fixture.componentRef.setInput('args', ['https://i.im']);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector('img')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(el.querySelector('.falha-nome')?.textContent).toBe('A imagem não abriu');
    fixture.componentRef.setInput('args', ['https://i.imgur.com/foto.jpg']);
    await fixture.whenStable();
    expect(el.querySelector('.falha')).toBeNull();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://i.imgur.com/foto.jpg');
  });
});
