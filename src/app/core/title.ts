import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { Mural } from './mural';

/**
 * O título da aba acompanha o mural aberto: "Meu mural de livros", "Ranking · Meu mural de séries".
 * Ajustes vale para todos os murais: "Ajustes · Meu Mural".
 */
@Injectable({ providedIn: 'root' })
export class MuralTitle extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly mural = inject(Mural);
  private readonly page = signal<string | undefined>(undefined);

  constructor() {
    super();
    effect(() => {
      const page = this.page();
      const own = `Meu mural de ${this.mural.profile().plural}`;
      if (page === 'Ajustes') this.title.setTitle('Ajustes · Meu Mural');
      else this.title.setTitle(page ? `${page} · ${own}` : own);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.page.set(this.buildTitle(snapshot));
  }
}
