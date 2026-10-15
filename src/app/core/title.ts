import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { areaOf } from './areas';
import { cap } from './kinds';
import { Mural } from './mural';

/**
 * O título da aba diz onde se está: "Anotações · Murall", "Livros · Murall",
 * "Pra depois · Séries · Murall", "Ranking · Jogos · Murall". O mural só entra nas páginas que
 * dependem dele (as Análises e os Extras); o Perfil, Amigos e os Ajustes são os mesmos em todos.
 */
@Injectable({ providedIn: 'root' })
export class MuralTitle extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly mural = inject(Mural);
  private readonly page = signal<{ title: string | undefined; url: string }>({ title: undefined, url: '/' });

  constructor() {
    super();
    effect(() => {
      const { title, url } = this.page();
      const area = areaOf(url);
      const wall = area === 'analises' || area === 'extras' ? cap(this.mural.profile().plural) : null;
      this.title.setTitle([title, wall, 'Murall'].filter(Boolean).join(' · '));
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.page.set({ title: this.buildTitle(snapshot), url: snapshot.url });
  }
}
