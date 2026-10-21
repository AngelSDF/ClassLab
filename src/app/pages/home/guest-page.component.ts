import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { PublicationsService } from '../../core/publications/publications.service';

@Component({
  selector: 'app-guest-page',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="narrow-page">
      <a class="back-link" routerLink="/access">← Volver</a>

      <article class="card">
        <p class="eyebrow">ACCESO INVITADO</p>
        <h1>Ingresa a tu evaluación</h1>

        <form (ngSubmit)="continue()">
          <label>
            Tu nombre
            <input name="name" [(ngModel)]="name" required maxlength="80" />
          </label>

          <label>
            Código de evaluación
            <input name="code" [(ngModel)]="code" required maxlength="32" />
          </label>

          @if (error()) {
            <p class="error">{{ error() }}</p>
          }

          <button class="primary-button" [disabled]="working() || !session.isConfigured()">
            {{ working() ? 'Validando…' : 'Continuar' }}
          </button>
        </form>

        @if (!session.isConfigured()) {
          <p class="notice">Completa Firebase antes de probar este acceso.</p>
        }
      </article>
    </section>
  `,
})
export class GuestPageComponent {
  protected readonly session = inject(SessionService);
  private readonly publications = inject(PublicationsService);
  private readonly router = inject(Router);

  protected name = '';
  protected code = '';

  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async continue(): Promise<void> {
    if (!this.name.trim() || !this.code.trim()) {
      this.error.set('Completa tu nombre y el código.');
      return;
    }

    try {
      this.working.set(true);
      this.error.set(null);

      await this.session.startGuestSession(this.name);
      const { classId, publicationId } = await this.publications.resolveByCode(this.code);
      await this.router.navigate(['/classes', classId, 'publications', publicationId, 'take']);
    } catch (e) {
      this.error.set(this.session.describeAuthError(e));
    } finally {
      this.working.set(false);
    }
  }
}
