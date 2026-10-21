import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClassesService } from '../../core/classes/classes.service';
import { ClassModality } from '../../core/classes/class-record';

@Component({
  selector: 'app-class-form-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="narrow-page">
      <a class="back-link" routerLink="/classes">← Volver a mis clases</a>

      <article class="card">
        <p class="eyebrow">NUEVA CLASE</p>
        <h1>Crear clase</h1>

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label>
            <span>Nombre de la clase</span>
            <input type="text" formControlName="name" maxlength="80" autocomplete="off" />
            @if (form.controls.name.touched && form.controls.name.invalid) {
              <small class="error">Ingresa un nombre de hasta 80 caracteres.</small>
            }
          </label>

          <label class="checkbox">
            <input type="checkbox" formControlName="unlimited" />
            <span>Sin límite de vacantes</span>
          </label>

          <label>
            <span>Vacantes</span>
            <input type="number" formControlName="capacity" min="1" max="500" inputmode="numeric" />
            @if (form.controls.unlimited.value) {
              <small>Se ignora mientras "Sin límite" esté activo.</small>
            } @else if (form.controls.capacity.touched && form.controls.capacity.invalid) {
              <small class="error">Ingresa un número entre 1 y 500.</small>
            }
          </label>

          <label>
            <span>Modalidad de incorporación</span>
            <select formControlName="modality">
              <option value="auto">Automática</option>
              <option value="approval">Con aprobación del docente</option>
            </select>
          </label>

          @if (error()) {
            <p class="error">{{ error() }}</p>
          }

          <button class="primary-button" type="submit" [disabled]="working()">
            {{ working() ? 'Creando…' : 'Crear clase' }}
          </button>
        </form>
      </article>
    </section>
  `,
})
export class ClassFormPageComponent {
  private readonly classes = inject(ClassesService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    capacity: [30, [Validators.required, Validators.min(1), Validators.max(500)]],
    unlimited: [false],
    modality: ['auto' as ClassModality, [Validators.required]],
  });

  constructor() {
    this.form.controls.unlimited.valueChanges.subscribe((unlimited) => {
      if (unlimited) {
        this.form.controls.capacity.disable();
      } else {
        this.form.controls.capacity.enable();
      }
    });
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    try {
      this.working.set(true);
      this.error.set(null);
      const created = await this.classes.createClass(this.form.getRawValue());
      await this.router.navigate(['/classes', created.id]);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos crear la clase.');
    } finally {
      this.working.set(false);
    }
  }
}
