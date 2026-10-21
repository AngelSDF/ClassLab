import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClassesService } from '../../core/classes/classes.service';
import { EvaluationQuestion, EvaluationRecord } from '../../core/evaluations/evaluation-record';
import { EvaluationsService } from '../../core/evaluations/evaluations.service';
import { SessionService } from '../../core/auth/session.service';
import { QuestionCardComponent } from './question-card.component';

function cloneQuestions(questions: EvaluationQuestion[]): EvaluationQuestion[] {
  return questions.map((question) => ({
    ...question,
    options: question.options.map((option) => ({ ...option })),
    correctOptionIds: [...question.correctOptionIds],
  }));
}

@Component({
  selector: 'app-evaluation-edit-page',
  imports: [RouterLink, QuestionCardComponent],
  template: `
    <section class="narrow-page">
      <a class="back-link" [routerLink]="['/classes', classId]">← Volver a la clase</a>

      @if (loading()) {
        <p class="notice">Cargando la evaluación…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (evaluation(); as record) {
        <div class="page-heading">
          <div>
            <p class="eyebrow">BORRADOR DE EVALUACIÓN</p>
            <h1>{{ record.title }}</h1>
            <p class="lead">
              Clase: <strong>{{ className() }}</strong> · {{ questions().length }} pregunta(s)
            </p>
          </div>
          <div class="actions">
            @if (editing()) {
              <button
                type="button"
                class="secondary-button"
                [disabled]="saving() || deleting()"
                (click)="cancelEditing()"
              >
                Cancelar
              </button>
              <button
                type="button"
                class="primary-button"
                [disabled]="saving() || deleting()"
                (click)="save()"
              >
                {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
              </button>
            } @else {
              <button
                type="button"
                class="secondary-button"
                [disabled]="deleting()"
                (click)="startEditing()"
              >
                Editar
              </button>
            }
            <button
              type="button"
              class="primary-button"
              [disabled]="saving() || deleting()"
              (click)="goToPublication()"
            >
              Publicación
            </button>
          </div>
        </div>

        @if (record.sourceFiles.length > 0) {
          <p>
            Material:
            @for (file of record.sourceFiles; track file.name; let last = $last) {
              {{ file.name }}{{ last ? '' : ', ' }}
            }
          </p>
        }

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

        @for (question of questions(); track question.id; let index = $index) {
          <app-question-card
            [question]="question"
            [index]="index"
            [editing]="editing()"
            [disabled]="saving() || deleting()"
            (remove)="removeQuestion(index)"
          />
        }

        <div class="actions">
          @if (editing()) {
            <button
              type="button"
              class="secondary-button"
              [disabled]="saving() || deleting()"
              (click)="addQuestion()"
            >
              Agregar pregunta
            </button>
          }
          <button
            type="button"
            class="secondary-button"
            [disabled]="saving() || deleting()"
            (click)="remove()"
          >
            {{ deleting() ? 'Eliminando…' : 'Eliminar evaluación' }}
          </button>
        </div>
      }
    </section>
  `,
})
export class EvaluationEditPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly classes = inject(ClassesService);
  private readonly session = inject(SessionService);
  private readonly evaluations = inject(EvaluationsService);

  protected readonly classId = this.route.snapshot.paramMap.get('classId') ?? '';
  private readonly evaluationId = this.route.snapshot.paramMap.get('evaluationId') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly className = signal('');
  protected readonly evaluation = signal<EvaluationRecord | null>(null);
  protected readonly questions = signal<EvaluationQuestion[]>([]);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionNotice = signal<string | null>(null);

  private savedQuestions: EvaluationQuestion[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const record = await this.classes.getClass(this.classId);
      if (!record) {
        this.error.set('No encontramos esta clase.');
        return;
      }
      if (record.ownerTeacherId !== this.session.user()?.uid) {
        this.error.set('Solo el docente propietario puede editar esta evaluación.');
        return;
      }
      this.className.set(record.name);

      const evaluation = await this.evaluations.getEvaluation(this.classId, this.evaluationId);
      if (!evaluation) {
        this.error.set('No encontramos esta evaluación.');
        return;
      }

      this.evaluation.set(evaluation);
      this.questions.set(cloneQuestions(evaluation.questions));
      this.savedQuestions = cloneQuestions(evaluation.questions);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos cargar la evaluación.');
    } finally {
      this.loading.set(false);
    }
  }

  protected startEditing(): void {
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.savedQuestions = cloneQuestions(this.questions());
    this.editing.set(true);
  }

  protected cancelEditing(): void {
    this.questions.set(cloneQuestions(this.savedQuestions));
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
    this.saving.set(true);
    try {
      const rawJson = await this.evaluations.updateEvaluation(
        this.classId,
        this.evaluationId,
        this.questions(),
      );
      const record = this.evaluation();
      if (record) {
        this.evaluation.set({ ...record, rawJson, questions: this.questions() });
      }
      this.savedQuestions = cloneQuestions(this.questions());
      this.editing.set(false);
      this.actionNotice.set('Cambios guardados.');
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos guardar los cambios.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async goToPublication(): Promise<void> {
    if (this.editing()) {
      this.actionNotice.set(null);
      this.actionError.set('Guarda los cambios antes de publicar.');
      return;
    }

    this.actionError.set(null);
    await this.router.navigate(['/classes', this.classId, 'publications', 'new'], {
      queryParams: { evaluationId: this.evaluationId },
    });
  }

  protected async remove(): Promise<void> {
    if (!window.confirm('¿Eliminar esta evaluación? Esta acción no se puede deshacer.')) {
      return;
    }

    this.actionError.set(null);
    this.actionNotice.set(null);
    this.deleting.set(true);
    try {
      await this.evaluations.deleteEvaluation(this.classId, this.evaluationId);
      await this.router.navigate(['/classes', this.classId]);
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos eliminar la evaluación.');
      this.deleting.set(false);
    }
  }
}
