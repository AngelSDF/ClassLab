import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClassesService } from '../core/classes.service';
import { SessionService } from '../core/session.service';
import { ClassModality, ClassRecord } from '../core/class-record';

@Component({
  selector: 'app-class-edit-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="narrow-page">
      <a [routerLink]="['/classes', classId]">← Volver a la clase</a>

      @if (loading()) {
        <p class="notice">Cargando la clase…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (classRecord(); as record) {
        <article class="card">
          <p class="eyebrow">EDITAR CLASE</p>
          <h1>{{ record.name }}</h1>

          @if (notice()) {
            <p class="notice">{{ notice() }}</p>
          }

          <form [formGroup]="form" (ngSubmit)="save()" novalidate>
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
              <input
                type="number"
                formControlName="capacity"
                min="1"
                max="500"
                inputmode="numeric"
              />
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

            @if (actionError()) {
              <p class="error">{{ actionError() }}</p>
            }

            <button class="primary-button" type="submit" [disabled]="working()">
              {{ working() ? 'Guardando…' : 'Guardar cambios' }}
            </button>
          </form>
        </article>

        <article class="card">
          <h2>Acceso</h2>
          <p>
            Código actual: <strong>{{ record.accessCode }}</strong>
          </p>
          <p>
            Incorporaciones:
            {{ record.joinOpen ? 'abiertas' : 'cerradas' }}
          </p>

          <div class="actions">
            <button
              type="button"
              class="secondary-button"
              [disabled]="working()"
              (click)="toggleJoin()"
            >
              {{ record.joinOpen ? 'Cerrar incorporaciones' : 'Abrir incorporaciones' }}
            </button>
            <button
              type="button"
              class="secondary-button"
              [disabled]="working()"
              (click)="regenerate()"
            >
              Regenerar código
            </button>
          </div>
        </article>
      }
    </section>
  `,
})
export class ClassEditPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly classes = inject(ClassesService);
  private readonly session = inject(SessionService);
  private readonly fb = inject(FormBuilder);

  protected readonly classId = this.route.snapshot.paramMap.get('classId') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly working = signal(false);
  protected readonly classRecord = signal<ClassRecord | null>(null);

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

  async ngOnInit(): Promise<void> {
    try {
      const record = await this.classes.getClass(this.classId);
      if (!record) {
        this.error.set('No encontramos esta clase.');
        return;
      }
      if (record.ownerTeacherId !== this.session.user()?.uid) {
        this.error.set('Solo el docente propietario puede editar esta clase.');
        return;
      }
      this.classRecord.set(record);
      this.form.patchValue({
        name: record.name,
        capacity: record.capacity,
        unlimited: record.unlimited,
        modality: record.modality,
      });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos cargar la clase.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await this.run(async () => {
      await this.classes.updateClassSettings(this.classId, this.form.getRawValue());
      this.notice.set('Cambios guardados.');
    });
  }

  protected async toggleJoin(): Promise<void> {
    const record = this.classRecord();
    if (!record) return;
    await this.run(async () => {
      await this.classes.setJoinOpen(this.classId, !record.joinOpen);
      this.notice.set(record.joinOpen ? 'Incorporaciones cerradas.' : 'Incorporaciones abiertas.');
    });
  }

  protected async regenerate(): Promise<void> {
    await this.run(async () => {
      const code = await this.classes.regenerateAccessCode(this.classId);
      this.notice.set(`Nuevo código: ${code}`);
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.actionError.set(null);
    this.notice.set(null);
    this.working.set(true);
    try {
      await action();
      const refreshed = await this.classes.getClass(this.classId);
      if (refreshed) this.classRecord.set(refreshed);
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos completar la acción.');
    } finally {
      this.working.set(false);
    }
  }
}
