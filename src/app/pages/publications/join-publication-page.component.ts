import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClassesService } from '../../core/classes/classes.service';
import { PublicationsService } from '../../core/publications/publications.service';

@Component({
  selector: 'app-join-publication-page',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="narrow-page">
      <a class="back-link" routerLink="/classes">← Volver a mis clases</a>

      <article class="card">
        <p class="eyebrow">INGRESAR A EVALUACIÓN</p>
        <h1>Ingresar con código</h1>
        <p class="lead">Pídele el código de la publicación a tu docente.</p>

        <form (ngSubmit)="submit()">
          <label>
            <span>Código de la publicación</span>
            <input
              name="code"
              [(ngModel)]="code"
              required
              maxlength="6"
              autocapitalize="characters"
              autocomplete="off"
              placeholder="ABC123"
            />
          </label>

          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
          @if (notice()) {
            <p class="notice">{{ notice() }}</p>
          }

          <button class="primary-button" [disabled]="working()">
            {{ working() ? 'Buscando…' : 'Ingresar' }}
          </button>
        </form>

        <p>
          ¿Todavía no perteneces a la clase?
          <a class="text-link" routerLink="/classes/join">Ingresa primero con el código de clase</a
          >.
        </p>
      </article>
    </section>
  `,
})
export class JoinPublicationPageComponent {
  private readonly publications = inject(PublicationsService);
  private readonly classes = inject(ClassesService);
  private readonly router = inject(Router);

  protected code = '';

  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!this.code.trim()) {
      this.error.set('Ingresa el código de la publicación.');
      return;
    }
    try {
      this.working.set(true);
      this.error.set(null);
      this.notice.set(null);

      const { classId, publicationId } = await this.publications.resolveByCode(this.code);
      const membership = await this.classes.getMyMembership(classId);
      if (!membership || membership.status !== 'active') {
        this.error.set(
          'No eres miembro activo de esta clase. Primero ingresa con el código de la clase.',
        );
        return;
      }

      await this.router.navigate(['/classes', classId, 'publications', publicationId, 'take']);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos ingresar a la publicación.');
    } finally {
      this.working.set(false);
    }
  }
}
