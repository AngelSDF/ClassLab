import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from './core/auth/session.service';
import { ThemeService } from './core/shared/theme.service';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(SessionService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  protected readonly canShowNavigation = computed(
    () => this.session.isAuthenticated() && !this.session.isAnonymous(),
  );

  protected get themeLabel(): string {
    return this.theme.theme() === 'dark' ? 'Modo claro' : 'Modo oscuro';
  }

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigateByUrl('/access');
  }
}
