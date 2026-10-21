import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';

@Component({
  selector: 'app-access-page',
  imports: [RouterLink],
  template: `
    <section class="auth-layout">
      <div>
        <p class="eyebrow">EVALUACIÓN FORMATIVA</p>
        <h1>Aprende de cada respuesta.</h1>
        <p class="lead">
          ClassLab conecta el material de tu clase con evaluaciones y retroalimentación útil.
        </p>
      </div>

      <article class="card auth-card">
        <h2>Bienvenido a ClassLab</h2>
        <p>Ingresa con tu cuenta educativa. Las cuentas nuevas comienzan como estudiantes.</p>

        @if (!session.isConfigured()) {
          <p class="notice">
            Firebase no está configurado todavía. Consulta el README para conectarlo.
          </p>
        }

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }

        <button
          class="primary-button"
          type="button"
          [disabled]="working() || !session.isConfigured()"
          (click)="signIn()"
        >
          {{ working() ? 'Conectando…' : 'Continuar con Google' }}
        </button>

        <div class="separator">
          <span>o</span>
        </div>

        <a class="secondary-button" routerLink="/guest"> Tengo un código de evaluación </a>

        <small>¿Necesitas ser docente? Solicita el rol al administrador.</small>
      </article>
    </section>
  `,
})
export class AccessPageComponent {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async signIn(): Promise<void> {
    try {
      this.working.set(true);
      this.error.set(null);
      await this.session.signInWithGoogle();
      const state = this.session.accountState();
      if (state === 'error') {
        this.error.set(this.session.error() ?? 'No pudimos cargar tu perfil.');
        return;
      }
      await this.router.navigateByUrl(state === 'needsOnboarding' ? '/onboarding' : '/home');
    } catch (e) {
      console.error(e);
      this.error.set('No pudimos iniciar sesión con Google. Revisa Firebase e inténtalo otra vez.');
    } finally {
      this.working.set(false);
    }
  }
}
