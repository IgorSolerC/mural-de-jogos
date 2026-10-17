import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoteTag } from './note-tag';

/** A tag é papel claro (com cor) ou pardo (sem cor): a tinta dela não muda com a cartolina por baixo. */

@Component({
  imports: [NoteTag],
  template: `
    <div style="--ink: rgb(243 236 224 / 0.8); color: var(--ink)">
      <app-note-tag label="urgente" color="#2d8bd6" />
      <app-note-tag label="casa" />
    </div>
  `,
})
class NaCartolinaEscura {}

describe('NoteTag', () => {
  it('na cartolina escura, a tag com cor e a sem cor continuam em tinta escura', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(NaCartolinaEscura);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const [comCor, semCor] = [...fixture.nativeElement.querySelectorAll('app-note-tag')] as HTMLElement[];
    expect(comCor.classList).toContain('cor');
    expect(getComputedStyle(comCor).color).toBe('rgb(21, 21, 21)');
    expect(getComputedStyle(semCor).color).toBe('rgb(58, 42, 20)');
    fixture.nativeElement.remove();
  });
});
