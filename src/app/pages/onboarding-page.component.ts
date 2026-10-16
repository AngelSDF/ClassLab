import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../core/session.service';
import { Gender } from '../core/user-record';

@Component({
  selector: 'app-onboarding-page',
  imports: [ReactiveFormsModule],
  template: `
    <section class="auth-layout">
      <div>
        <p class="eyebrow">UN ÚLTIMO PASO</p>
        <h1>Confirma tus datos.</h1>
        <p class="lead">
          Los tomamos de tu cuenta de Google. Edítalos si hace falta y guarda.
        </p>
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
              <option [ngValue]="null">Prefiero no indicar</option>
              <option value="female">Femenino</option>
              <option value="male">Masculino</option>
              <option value="other">Otro</option>
              <option value="prefer_not_to_say">Prefiero no decirlo</option>
            </select>
          </label>

          <label>
            <span>Teléfono</span>
            <input
              type="tel"
              formControlName="phone"
              autocomplete="tel"
              maxlength="40"
            />
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

          <button class="primary-button" type="submit" [disabled]="working()">
            {{ working() ? 'Guardando…' : 'Guardar y continuar' }}
          </button>
        </form>

        <small>Tu correo proviene de Google y no puede editarse aquí.</small>
      </article>
    </section>
  `,
})
export class OnboardingPageComponent {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);

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
    // El guard ya esperó a que accountState sea 'needsOnboarding',
    // por lo que el prefill está listo. Lo aplicamos de forma síncrona.
    const prefill = this.session.profilePrefill();
    if (prefill) {
      this.form.patchValue(
        { firstName: prefill.firstName, lastName: prefill.lastName },
        { emitEvent: false },
      );
    }
  }

  protected async submit(): Promise<void> {
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
}