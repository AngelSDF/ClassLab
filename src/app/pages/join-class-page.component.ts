import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClassesService } from '../core/classes.service';

@Component({
  selector: 'app-join-class-page',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="narrow-page">
      <a routerLink="/classes">← Volver a mis clases</a>

      <article class="card">
        <p class="eyebrow">INGRESAR A CLASE</p>
        <h1>Ingresar con código</h1>
        <p class="lead">Pídele el código de acceso a tu docente.</p>

        <form (ngSubmit)="submit()">
          <label>
            <span>Código de la clase</span>
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
            {{ working() ? 'Ingresando…' : 'Ingresar' }}
          </button>
        </form>
      </article>
    </section>
  `,
})
export class JoinClassPageComponent {
  private readonly classes = inject(ClassesService);
  private readonly router = inject(Router);

  protected code = '';

  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!this.code.trim()) {
      this.error.set('Ingresa el código de la clase.');
      return;
    }
    try {
      this.working.set(true);
      this.error.set(null);
      this.notice.set(null);

      const result = await this.classes.joinClass(this.code);
      if (result.status === 'pending') {
        this.notice.set('Tu solicitud fue enviada. Espera la aprobación del docente.');
        return;
      }
      await this.router.navigate(['/classes', result.classRecord.id]);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos ingresar a la clase.');
    } finally {
      this.working.set(false);
    }
  }
}
