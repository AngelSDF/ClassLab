import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { Gender } from '../../core/auth/user-record';

@Component({
  selector: 'app-onboarding-page',
  imports: [ReactiveFormsModule],
  template: `
    <section class="auth-layout">
      <div>
        <p class="eyebrow">UN ÚLTIMO PASO</p>
        <h1>Confirma tus datos.</h1>
        <p class="lead">Los tomamos de tu cuenta de Google. Edítalos si hace falta y guarda.</p>
      </div>

      <article class="card auth-card">
        @if (photoURL(); as photo) {
          <img class="avatar" [src]="photo" alt="Foto de perfil" width="64" height="64" />
        }

        <h2>Tu perfil</h2>

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
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
              <option [ngValue]="null">Prefiero no decirlo</option>
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
            <button type="button" class="secondary-button" [disabled]="busy()" (click)="cancel()">
              {{ cancelling() ? 'Cancelando…' : 'Cancelar' }}
            </button>

            <button type="submit" class="primary-button" [disabled]="busy()">
              {{ working() ? 'Guardando…' : 'Guardar y continuar' }}
            </button>
          </div>
        </form>

        <small>Tu correo proviene de Google y no puede editarse aquí.</small>
      </article>
    </section>
  `,
  styles: [
    `
      .form-actions {
        display: flex;
        gap: 0.75rem;
        margin-top: 1rem;
      }
      .form-actions > button {
        flex: 1 1 0;
        min-width: 0;
      }
      .secondary-button {
        padding: 0.75rem 1rem;
        border: 1px solid var(--border-strong);
        border-radius: 0.5rem;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
        transition:
          background-color 120ms ease,
          border-color 120ms ease;
      }
      .secondary-button:hover:not(:disabled) {
        background: var(--surface-muted);
        border-color: var(--accent);
      }
      .form-actions > button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
    `,
  ],
})
export class OnboardingPageComponent {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly working = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly busy = computed(() => this.working() || this.cancelling());

  protected readonly photoURL = computed(() => this.session.profilePrefill()?.photoURL ?? null);
  protected readonly email = computed(
    () => this.session.profilePrefill()?.email ?? this.session.user()?.email ?? '',
  );

  protected readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(80)]],
    age: [null as number | null, [Validators.min(1), Validators.max(120)]],
    gender: [null as Gender | null],
    phone: ['', [Validators.maxLength(40)]],
  });

  constructor() {
    const prefill = this.session.profilePrefill();
    if (prefill) {
      this.form.patchValue(
        { firstName: prefill.firstName, lastName: prefill.lastName },
        { emitEvent: false },
      );
    }
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    try {
      this.working.set(true);
      this.error.set(null);
      await this.session.completeRegistration(this.form.getRawValue());
      await this.router.navigateByUrl('/home');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos guardar tu perfil.');
    } finally {
      this.working.set(false);
    }
  }

  /**
   * Cancela el onboarding. En `needsOnboarding` aún no existe doc del usuario,
   * así que cerrar sesión basta; el guard redirigirá al salir del estado.
   */
  protected async cancel(): Promise<void> {
    if (this.busy()) return;

    const confirmed = confirm(
      'Si cancelas ahora, deberás iniciar sesión con Google otra vez para completar tu perfil. ¿Continuar?',
    );
    if (!confirmed) return;

    try {
      this.cancelling.set(true);
      this.error.set(null);
      await this.session.signOut();
      await this.router.navigateByUrl('/access');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos cancelar la operación.');
    } finally {
      this.cancelling.set(false);
    }
  }
}
