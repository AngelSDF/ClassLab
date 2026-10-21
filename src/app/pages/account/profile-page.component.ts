import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SessionService } from '../../core/auth/session.service';
import { Gender, UserRole } from '../../core/auth/user-record';

const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Estudiante',
  teacher: 'Docente',
  admin: 'Administrador',
};

const GENDER_LABELS: Record<Gender, string> = {
  female: 'Femenino',
  male: 'Masculino',
  other: 'Otro',
  prefer_not_to_say: 'Prefiero no decirlo',
};

const FALLBACK_PHOTO = 'https://placehold.co/96x96/e0e7ff/1e3a8a?text=CL';

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule],
  template: `
    <section class="narrow-page">
      <p class="eyebrow">PERFIL</p>
      <h1>Tu cuenta</h1>

      @switch (session.accountState()) {
        @case ('loading') {
          <p class="status">Cargando tu perfil…</p>
        }
        @case ('error') {
          <p class="status status--error">{{ session.error() }}</p>
        }
        @default {
          <article class="card profile-card">
            <img [src]="photoUrl()" alt="Foto de perfil" />

            <div>
              <h2>{{ displayName() }}</h2>
              <p>{{ email() }}</p>
            </div>
          </article>

          @if (notice()) {
            <p class="notice">{{ notice() }}</p>
          }

          @if (!editing()) {
            <article class="card">
              <div class="card-heading">
                <h2>Datos personales</h2>
                <button type="button" class="secondary-button" (click)="startEdit()">Editar</button>
              </div>

              <dl class="profile-details">
                <div>
                  <dt>Nombres</dt>
                  <dd>{{ record()?.firstName || '—' }}</dd>
                </div>
                <div>
                  <dt>Apellidos</dt>
                  <dd>{{ record()?.lastName || '—' }}</dd>
                </div>
                <div>
                  <dt>Correo</dt>
                  <dd>{{ record()?.email || '—' }}</dd>
                </div>
                <div>
                  <dt>Edad</dt>
                  <dd>{{ record()?.age ?? '—' }}</dd>
                </div>
                <div>
                  <dt>Género</dt>
                  <dd>{{ genderLabel() }}</dd>
                </div>
                <div>
                  <dt>Teléfono</dt>
                  <dd>{{ record()?.phoneNumber || '—' }}</dd>
                </div>
                <div>
                  <dt>Idioma</dt>
                  <dd>{{ record()?.locale || '—' }}</dd>
                </div>
              </dl>
            </article>
          } @else {
            <article class="card">
              <h2>Editar datos</h2>

              <form [formGroup]="form" (ngSubmit)="save()" novalidate>
                <label>
                  <span>Nombres</span>
                  <input
                    type="text"
                    formControlName="firstName"
                    autocomplete="given-name"
                    maxlength="80"
                  />
                  @if (form.controls.firstName.touched && form.controls.firstName.invalid) {
                    <small class="error">Ingresa tu nombre (máx. 80 caracteres).</small>
                  }
                </label>

                <label>
                  <span>Apellidos</span>
                  <input
                    type="text"
                    formControlName="lastName"
                    autocomplete="family-name"
                    maxlength="80"
                  />
                  @if (form.controls.lastName.touched && form.controls.lastName.invalid) {
                    <small class="error">Ingresa tus apellidos (máx. 80 caracteres).</small>
                  }
                </label>

                <label>
                  <span>Edad</span>
                  <input
                    type="number"
                    formControlName="age"
                    min="1"
                    max="120"
                    inputmode="numeric"
                    autocomplete="off"
                  />
                  @if (form.controls.age.touched && form.controls.age.invalid) {
                    <small class="error">Ingresa una edad entre 1 y 120.</small>
                  }
                </label>

                <label>
                  <span>Género</span>
                  <select formControlName="gender">
                    <option value="prefer_not_to_say">Prefiero no decirlo</option>
                    <option value="female">Femenino</option>
                    <option value="male">Masculino</option>
                    <option value="other">Otro</option>
                  </select>
                </label>

                <label>
                  <span>Teléfono</span>
                  <input type="tel" formControlName="phone" autocomplete="tel" maxlength="40" />
                  @if (form.controls.phone.touched && form.controls.phone.invalid) {
                    <small class="error">Ingresa un teléfono de hasta 40 caracteres.</small>
                  }
                </label>

                <label>
                  <span>Correo</span>
                  <input type="email" [value]="email()" disabled />
                </label>

                @if (error()) {
                  <p class="error">{{ error() }}</p>
                }

                <div class="form-actions">
                  <button
                    type="button"
                    class="secondary-button"
                    [disabled]="working()"
                    (click)="cancel()"
                  >
                    Cancelar
                  </button>
                  <button type="submit" class="primary-button" [disabled]="working()">
                    {{ working() ? 'Guardando…' : 'Guardar' }}
                  </button>
                </div>

                <small>Tu correo proviene de Google y no puede editarse aquí.</small>
              </form>
            </article>
          }

          <article class="card">
            <h2>Roles autorizados</h2>
            <p>El administrador concede los roles.</p>

            @if (roles().length === 0) {
              <p>Aún no tienes roles asignados.</p>
            } @else {
              <div class="role-options">
                @for (role of roles(); track role) {
                  <button
                    type="button"
                    [class.selected]="session.activeRole() === role"
                    (click)="selectRole(role)"
                  >
                    {{ roleLabel(role) }}
                  </button>
                }
              </div>
            }
          </article>
        }
      }
    </section>
  `,
})
export class ProfilePageComponent {
  protected readonly session = inject(SessionService);
  private readonly fb = inject(FormBuilder);

  protected readonly editing = signal(false);
  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly record = computed(() => this.session.userRecord());

  protected readonly photoUrl = computed(
    () => this.session.userRecord()?.photoURL ?? FALLBACK_PHOTO,
  );

  protected readonly displayName = computed(() => {
    const record = this.session.userRecord();
    if (!record) return 'Usuario';
    const full = `${record.firstName} ${record.lastName}`.trim();
    return full || 'Usuario';
  });

  protected readonly email = computed(() => this.session.userRecord()?.email ?? '');

  protected readonly genderLabel = computed(() => {
    const gender = this.session.userRecord()?.gender ?? null;
    return gender ? GENDER_LABELS[gender] : '—';
  });

  protected readonly roles = computed(() => this.session.availableRoles());

  protected readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(80)]],
    age: [null as number | null, [Validators.min(1), Validators.max(120)]],
    gender: [null as Gender | null],
    phone: ['', [Validators.maxLength(40)]],
  });

  protected startEdit(): void {
    const record = this.session.userRecord();
    if (!record) return;
    this.error.set(null);
    this.notice.set(null);
    this.form.reset({
      firstName: record.firstName,
      lastName: record.lastName,
      age: record.age,
      gender: record.gender,
      phone: record.phoneNumber ?? '',
    });
    this.editing.set(true);
  }

  protected cancel(): void {
    if (this.working()) return;
    this.editing.set(false);
    this.error.set(null);
    this.form.reset();
  }

  protected async save(): Promise<void> {
    if (this.working()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    try {
      this.working.set(true);
      this.error.set(null);
      this.notice.set(null);
      await this.session.updateProfile({
        firstName: value.firstName,
        lastName: value.lastName,
        age: value.age,
        gender: value.gender,
        phoneNumber: value.phone,
      });
      this.editing.set(false);
      this.notice.set('Tus datos se guardaron correctamente.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos guardar tus datos.');
    } finally {
      this.working.set(false);
    }
  }

  protected roleLabel(role: UserRole): string {
    return ROLE_LABELS[role] ?? role;
  }

  protected selectRole(role: UserRole): void {
    this.session.setActiveRole(role);
  }
}
