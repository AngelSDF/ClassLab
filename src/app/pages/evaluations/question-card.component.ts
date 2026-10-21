import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EvaluationQuestion } from '../../core/evaluations/evaluation-record';

@Component({
  selector: 'app-question-card',
  imports: [FormsModule],
  template: `
    <article class="card">
      <div class="card-heading">
        <div>
          <h2>Pregunta {{ index + 1 }}</h2>
          <p class="eyebrow">{{ typeLabel() }} · {{ question.points }} punto(s)</p>
        </div>
        @if (editing) {
          <button
            type="button"
            class="secondary-button"
            [disabled]="disabled"
            (click)="remove.emit()"
          >
            Quitar
          </button>
        }
      </div>

      @if (editing) {
        <label>
          <span>Enunciado</span>
          <input
            type="text"
            [ngModel]="question.prompt"
            (ngModelChange)="question.prompt = $event"
            [ngModelOptions]="{ standalone: true }"
            [disabled]="disabled"
          />
        </label>
      } @else {
        <p class="question-prompt">{{ question.prompt }}</p>
      }

      @if (question.type === 'verdadero_falso') {
        @if (editing) {
          <fieldset>
            <legend>Respuesta correcta</legend>
            <label class="checkbox" [class.correct-option]="question.correctBoolean === true">
              <input
                type="radio"
                [name]="'correct-' + question.id"
                [checked]="question.correctBoolean === true"
                (change)="setTrueFalse(true)"
                [disabled]="disabled"
              />
              <span>Verdadero</span>
            </label>
            <label class="checkbox" [class.correct-option]="question.correctBoolean === false">
              <input
                type="radio"
                [name]="'correct-' + question.id"
                [checked]="question.correctBoolean === false"
                (change)="setTrueFalse(false)"
                [disabled]="disabled"
              />
              <span>Falso</span>
            </label>
          </fieldset>
        } @else {
          <div class="option-row" [class.correct-option]="question.correctBoolean === true">
            <span>Verdadero</span>
            @if (question.correctBoolean === true) {
              <span class="correct-badge">Correcta</span>
            }
          </div>
          <div class="option-row" [class.correct-option]="question.correctBoolean === false">
            <span>Falso</span>
            @if (question.correctBoolean === false) {
              <span class="correct-badge">Correcta</span>
            }
          </div>
        }
      } @else {
        @if (editing) {
          <fieldset>
            <legend>
              {{
                question.type === 'opcion_multiple'
                  ? 'Opciones (marca las correctas)'
                  : 'Opciones (marca la correcta)'
              }}
            </legend>
            @for (option of question.options; track option.id) {
              <label class="checkbox" [class.correct-option]="isCorrect(option.id)">
                @if (question.type === 'opcion_multiple') {
                  <input
                    type="checkbox"
                    [checked]="isCorrect(option.id)"
                    (change)="toggleCorrect(option.id, $event)"
                    [disabled]="disabled"
                  />
                } @else {
                  <input
                    type="radio"
                    [name]="'correct-' + question.id"
                    [checked]="isCorrect(option.id)"
                    (change)="setSingleCorrect(option.id)"
                    [disabled]="disabled"
                  />
                }
                <input
                  type="text"
                  [ngModel]="option.text"
                  (ngModelChange)="option.text = $event"
                  [ngModelOptions]="{ standalone: true }"
                  [disabled]="disabled"
                />
              </label>
            }
          </fieldset>
        } @else {
          <div>
            @for (option of question.options; track option.id) {
              <div class="option-row" [class.correct-option]="isCorrect(option.id)">
                <span>{{ option.text }}</span>
                @if (isCorrect(option.id)) {
                  <span class="correct-badge">Correcta</span>
                }
              </div>
            }
          </div>
        }
      }

      @if (editing) {
        <label>
          <span>Explicación (opcional)</span>
          <input
            type="text"
            [ngModel]="question.explanation"
            (ngModelChange)="question.explanation = $event"
            [ngModelOptions]="{ standalone: true }"
            [disabled]="disabled"
          />
        </label>
      } @else if (question.explanation) {
        <p class="question-explanation">
          <small>{{ question.explanation }}</small>
        </p>
      }
    </article>
  `,
})
export class QuestionCardComponent {
  @Input({ required: true }) question!: EvaluationQuestion;
  @Input() index = 0;
  @Input() editing = false;
  @Input() disabled = false;
  @Output() readonly remove = new EventEmitter<void>();

  protected typeLabel(): string {
    switch (this.question.type) {
      case 'opcion_unica':
        return 'Opción única';
      case 'opcion_multiple':
        return 'Opción múltiple';
      case 'verdadero_falso':
        return 'Verdadero / Falso';
      default:
        return 'Tipo desconocido';
    }
  }

  protected isCorrect(optionId: string): boolean {
    return this.question.correctOptionIds.includes(optionId);
  }

  protected setSingleCorrect(optionId: string): void {
    this.question.correctOptionIds = [optionId];
  }

  protected toggleCorrect(optionId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const ids = new Set(this.question.correctOptionIds);
    if (checked) {
      ids.add(optionId);
    } else {
      ids.delete(optionId);
    }
    this.question.correctOptionIds = [...ids];
  }

  protected setTrueFalse(value: boolean): void {
    this.question.correctBoolean = value;
  }
}
