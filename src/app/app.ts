import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from './core/session.service';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(SessionService);
  protected readonly canShowNavigation = computed(
    () => this.session.isAuthenticated() && !this.session.isAnonymous(),
  );

  protected async signOut(): Promise<void> {
    await this.session.signOut();
  }
}
