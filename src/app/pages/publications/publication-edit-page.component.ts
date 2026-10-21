import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClassesService } from '../../core/classes/classes.service';
import { EvaluationQuestion } from '../../core/evaluations/evaluation-record';
import { PublicationRecord } from '../../core/publications/publication-record';
import {
  DEFAULT_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  validateDurationMinutes,
} from '../../core/publications/publication-time-limit';
import { PublicationsService } from '../../core/publications/publications.service';
import { SessionService } from '../../core/auth/session.service';
import { QuestionCardComponent } from '../evaluations/question-card.component';

function cloneQuestions(questions: EvaluationQuestion[]): EvaluationQuestion[] {
  return questions.map((question) => ({
    ...question,
    options: question.options.map((option) => ({ ...option })),
    correctOptionIds: [...question.correctOptionIds],
  }));
}

@Component({
  selector: 'app-publication-edit-page',
  imports: [FormsModule, RouterLink, QuestionCardComponent],
  template: `
    <section class="narrow-page">
      <a class="back-link" [routerLink]="['/classes', classId]">← Volver a la clase</a>

      @if (loading()) {
        <p class="notice">Cargando la publicación…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (publication(); as record) {
        <div class="page-heading">
          <div>
            <p class="eyebrow">PUBLICACIÓN</p>
            @if (editing()) {
              <label>
                <span>Título</span>
                <input
                  type="text"
                  [ngModel]="title()"
                  (ngModelChange)="title.set($event)"
                  [ngModelOptions]="{ standalone: true }"
                />
              </label>
            } @else {
              <h1>{{ record.title }}</h1>
            }
            <p class="lead">
              Clase: <strong>{{ className() }}</strong> · {{ questions().length }} pregunta(s)
            </p>
          </div>
          <div class="actions">
            @if (editing()) {
              <button
                type="button"
                class="secondary-button"
                [disabled]="saving()"
                (click)="cancelEditing()"
              >
                Cancelar
              </button>
              <button type="button" class="primary-button" [disabled]="saving()" (click)="save()">
                {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
              </button>
            } @else {
              <button
                type="button"
                class="secondary-button"
                [disabled]="attemptsBlockEditing()"
                (click)="startEditing()"
              >
                Editar
              </button>
            }
          </div>
        </div>

        <p>
          Ventana: <strong>{{ formatWindow(record) }}</strong> · {{ record.maxAttempts }} intento(s)
          · Duración:
          <strong>
            {{ record.durationMinutes === null ? 'sin límite' : record.durationMinutes + ' min' }}
          </strong>
        </p>
        <p>
          Invitados:
          <strong>
            {{
              record.guestAccess
                ? record.guestCount + ' / ' + record.guestCapacity + ' vacante(s) usada(s)'
                : 'deshabilitado'
            }}
          </strong>
        </p>

        @if (editing()) {
          <label class="checkbox-row">
            <input
              type="checkbox"
              [ngModel]="durationEnabled()"
              (ngModelChange)="durationEnabled.set($event)"
              [ngModelOptions]="{ standalone: true }"
            />
            <span>Limitar el tiempo del examen</span>
          </label>

          @if (durationEnabled()) {
            <label>
              <span>Duración (minutos)</span>
              <input
                type="number"
                min="1"
                [max]="maxDurationMinutes"
                step="1"
                inputmode="numeric"
                [ngModel]="durationMinutes()"
                (ngModelChange)="durationMinutes.set(+$event)"
                [ngModelOptions]="{ standalone: true }"
              />
              <small>
                El contador inicia cuando el estudiante o invitado abre la evaluación. Sin límite,
                al salir se envía el intento.
              </small>
            </label>
          }

          <label class="checkbox-row">
            <input
              type="checkbox"
              [ngModel]="guestAccess()"
              (ngModelChange)="guestAccess.set($event)"
              [ngModelOptions]="{ standalone: true }"
            />
            <span>Permitir acceso como invitado sin cuenta</span>
          </label>

          @if (guestAccess()) {
            <label>
              <span>Vacantes para invitados</span>
              <input
                type="number"
                min="1"
                max="500"
                step="1"
                inputmode="numeric"
                [ngModel]="guestCapacity()"
                (ngModelChange)="guestCapacity.set(+$event)"
                [ngModelOptions]="{ standalone: true }"
              />
              <small>
                Obligatorio. Cada invitado ocupa una vacante al iniciar su primer intento.
              </small>
            </label>
          }
        }

        @if (record.accessCode) {
          <p>
            Código de acceso: <strong class="access-code">{{ record.accessCode }}</strong>
          </p>
        }
        @if (attemptsBlockEditing()) {
          <p class="notice">
            Esta publicación ya tiene intentos. Para proteger el historial, no se puede editar.
          </p>
        }
        <p>
          Copia independiente de la evaluación original. Los cambios aquí no alteran el borrador.
        </p>

        @if (record.generationMeta; as meta) {
          <p>
            Generado con <strong>{{ meta.model || 'modelo desconocido' }}</strong> ·
            {{ meta.pdfPages }} página(s) · {{ meta.pdfCharacters }} caracteres ·
            {{ meta.durationMs }} ms
          </p>
        }

        @if (actionError()) {
          <p class="error">{{ actionError() }}</p>
        }
        @if (actionNotice()) {
          <p class="notice">{{ actionNotice() }}</p>
        }

        <article class="card">
          <button
            type="button"
            class="disclosure"
            [attr.aria-expanded]="questionsOpen()"
            (click)="toggleQuestions()"
          >
            <span>
              {{ questionsOpen() ? 'Ocultar preguntas' : 'Desplegar preguntas' }}
              ({{ questions().length }})
            </span>
            <span class="chevron">{{ questionsOpen() ? '▾' : '▸' }}</span>
          </button>
        </article>

        @if (questionsOpen()) {
          @for (question of questions(); track question.id; let index = $index) {
            <app-question-card
              [question]="question"
              [index]="index"
              [editing]="editing()"
              [disabled]="saving()"
              (remove)="removeQuestion(index)"
            />
          }

          @if (editing()) {
            <div class="actions">
              <button
                type="button"
                class="secondary-button"
                [disabled]="saving()"
                (click)="addQuestion()"
              >
                Agregar pregunta
              </button>
            </div>
          }
        }
      }
    </section>
  `,
})
export class PublicationEditPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly classes = inject(ClassesService);
  private readonly session = inject(SessionService);
  private readonly publications = inject(PublicationsService);

  protected readonly classId = this.route.snapshot.paramMap.get('classId') ?? '';
  private readonly publicationId = this.route.snapshot.paramMap.get('publicationId') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly className = signal('');
  protected readonly publication = signal<PublicationRecord | null>(null);
  protected readonly title = signal('');
  protected readonly guestAccess = signal(false);
  protected readonly guestCapacity = signal(0);
  protected readonly durationEnabled = signal(false);
  protected readonly durationMinutes = signal(DEFAULT_DURATION_MINUTES);
  protected readonly maxDurationMinutes = MAX_DURATION_MINUTES;
  protected readonly questions = signal<EvaluationQuestion[]>([]);
  protected readonly editing = signal(false);
  protected readonly questionsOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly attemptsBlockEditing = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionNotice = signal<string | null>(null);

  private savedTitle = '';
  private savedQuestions: EvaluationQuestion[] = [];
  private savedGuestAccess = false;
  private savedGuestCapacity = 0;
  private savedDurationEnabled = false;
  private savedDurationMinutes = DEFAULT_DURATION_MINUTES;

  async ngOnInit(): Promise<void> {
    try {
      const record = await this.classes.getClass(this.classId);
      if (!record) {
        this.error.set('No encontramos esta clase.');
        return;
      }
      if (record.ownerTeacherId !== this.session.user()?.uid) {
        this.error.set('Solo el docente propietario puede editar esta publicación.');
        return;
      }
      this.className.set(record.name);

      const loaded = await this.publications.getPublicationForEdit(
        this.classId,
        this.publicationId,
      );
      if (!loaded) {
        this.error.set('No encontramos esta publicación.');
        return;
      }

      const { publication, questions } = loaded;
      this.publication.set(publication);
      this.title.set(publication.title);
      this.guestAccess.set(publication.guestAccess);
      this.guestCapacity.set(publication.guestCapacity);
      this.durationEnabled.set(publication.durationMinutes !== null);
      this.durationMinutes.set(publication.durationMinutes ?? DEFAULT_DURATION_MINUTES);
      this.questions.set(cloneQuestions(questions));
      this.savedTitle = publication.title;
      this.savedQuestions = cloneQuestions(questions);
      this.savedGuestAccess = publication.guestAccess;
      this.savedGuestCapacity = publication.guestCapacity;
      this.savedDurationEnabled = publication.durationMinutes !== null;
      this.savedDurationMinutes = publication.durationMinutes ?? DEFAULT_DURATION_MINUTES;

      try {
        this.attemptsBlockEditing.set(
          await this.publications.hasAttempts(this.classId, this.publicationId),
        );
      } catch {
        this.attemptsBlockEditing.set(false);
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos cargar la publicación.');
    } finally {
      this.loading.set(false);
    }
  }

  protected formatWindow(record: PublicationRecord): string {
    if (!record.openAt || !record.closeAt) return 'sin ventana horaria';
    const start = record.openAt.toDate();
    const end = record.closeAt.toDate();
    const date = start.toLocaleDateString('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const startTime = start.toLocaleTimeString('es', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTime = end.toLocaleTimeString('es', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${date} · ${startTime}–${endTime}`;
  }

  protected startEditing(): void {
    if (this.attemptsBlockEditing()) {
      this.actionNotice.set(null);
      this.actionError.set('Esta publicación ya tiene intentos y no se puede editar.');
      return;
    }
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.savedTitle = this.title();
    this.savedQuestions = cloneQuestions(this.questions());
    this.savedGuestAccess = this.guestAccess();
    this.savedGuestCapacity = this.guestCapacity();
    this.savedDurationEnabled = this.durationEnabled();
    this.savedDurationMinutes = this.durationMinutes();
    this.questionsOpen.set(true);
    this.editing.set(true);
  }

  protected toggleQuestions(): void {
    this.questionsOpen.update((open) => !open);
  }

  protected cancelEditing(): void {
    this.title.set(this.savedTitle);
    this.questions.set(cloneQuestions(this.savedQuestions));
    this.guestAccess.set(this.savedGuestAccess);
    this.guestCapacity.set(this.savedGuestCapacity);
    this.durationEnabled.set(this.savedDurationEnabled);
    this.durationMinutes.set(this.savedDurationMinutes);
    this.editing.set(false);
    this.actionError.set(null);
    this.actionNotice.set(null);
  }

  protected removeQuestion(index: number): void {
    this.questions.update((list) => list.filter((_, current) => current !== index));
  }

  protected addQuestion(): void {
    this.questions.update((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        type: 'opcion_unica',
        prompt: '',
        points: 1,
        explanation: '',
        options: [
          { id: 'opt_a', text: '' },
          { id: 'opt_b', text: '' },
          { id: 'opt_c', text: '' },
          { id: 'opt_d', text: '' },
        ],
        correctOptionIds: [],
        correctBoolean: null,
      },
    ]);
  }

  protected async save(): Promise<void> {
    this.actionError.set(null);
    this.actionNotice.set(null);

    const guestCapacity = Math.trunc(Number(this.guestCapacity()));
    if (
      this.guestAccess() &&
      (!Number.isFinite(guestCapacity) || guestCapacity < 1 || guestCapacity > 500)
    ) {
      this.actionError.set('Indica entre 1 y 500 vacantes para invitados.');
      return;
    }

    let durationMinutes: number | null;
    try {
      durationMinutes = this.durationEnabled()
        ? validateDurationMinutes(this.durationMinutes())
        : null;
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'La duración no es válida.');
      return;
    }

    this.saving.set(true);
    try {
      const rawJson = await this.publications.updatePublication(this.classId, this.publicationId, {
        title: this.title(),
        questions: this.questions(),
        durationMinutes,
        guestAccess: this.guestAccess(),
        guestCapacity: this.guestAccess() ? guestCapacity : 0,
      });
      const record = this.publication();
      if (record) {
        this.publication.set({
          ...record,
          title: this.title().trim(),
          rawJson,
          rawJsonSafe: true,
          durationMinutes,
          guestAccess: this.guestAccess(),
          guestCapacity: this.guestAccess() ? guestCapacity : 0,
        });
      }
      this.title.set(this.title().trim());
      this.guestCapacity.set(this.guestAccess() ? guestCapacity : 0);
      this.durationMinutes.set(durationMinutes ?? DEFAULT_DURATION_MINUTES);
      this.savedTitle = this.title();
      this.savedQuestions = cloneQuestions(this.questions());
      this.savedGuestAccess = this.guestAccess();
      this.savedGuestCapacity = this.guestCapacity();
      this.savedDurationEnabled = this.durationEnabled();
      this.savedDurationMinutes = this.durationMinutes();
      this.editing.set(false);
      this.actionNotice.set('Cambios guardados.');
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos guardar los cambios.');
    } finally {
      this.saving.set(false);
    }
  }
}
