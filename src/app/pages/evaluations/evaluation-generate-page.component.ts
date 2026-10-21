import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClassesService } from '../../core/classes/classes.service';
import { EvaluationsService } from '../../core/evaluations/evaluations.service';
import { PdfFileRecord, PdfStoreService } from '../../core/evaluations/pdf-store.service';
import { SessionService } from '../../core/auth/session.service';

@Component({
  selector: 'app-evaluation-generate-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="narrow-page">
      <a class="back-link" [routerLink]="['/classes', classId]">← Volver a la clase</a>

      @if (loading()) {
        <p class="notice">Cargando…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else {
        <article class="card">
          <p class="eyebrow">GENERAR EVALUACIÓN</p>
          <h1>Generar evaluación</h1>
          <p class="lead">
            Clase: <strong>{{ className() }}</strong>
          </p>

          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <label>
              <span>Material (PDF)</span>
              <input
                type="file"
                accept="application/pdf"
                multiple
                [disabled]="working()"
                (change)="onFilesSelected($event)"
              />
              <small
                >Los PDFs se guardan en este navegador y se envían a la API local (FastAPI +
                Groq).</small
              >
            </label>

            @if (pdfs().length > 0) {
              <div>
                <p class="eyebrow">PDFS CARGADOS</p>
                <ul class="member-list">
                  @for (pdf of pdfs(); track pdf.id) {
                    <li>
                      <label class="checkbox">
                        <input
                          type="checkbox"
                          [checked]="isSelected(pdf.id)"
                          (change)="toggleSelection(pdf.id)"
                        />
                        <span>{{ pdf.name }}</span>
                      </label>
                      <span class="actions">
                        <small>{{ formatSize(pdf.size) }}</small>
                        <button
                          type="button"
                          class="secondary-button"
                          [disabled]="working()"
                          (click)="removePdf(pdf)"
                        >
                          Quitar
                        </button>
                      </span>
                    </li>
                  }
                </ul>
                <small>{{ selectedFiles().length }} PDF(s) seleccionado(s)</small>
                <small>Solo se procesará el primer PDF seleccionado.</small>
              </div>
            } @else {
              <p class="notice">Aún no has cargado ningún PDF.</p>
            }

            <label>
              <span>Título de la evaluación</span>
              <input
                type="text"
                formControlName="title"
                maxlength="120"
                autocomplete="off"
                placeholder="Unidad 1 · Repaso"
              />
              @if (form.controls.title.touched && form.controls.title.invalid) {
                <small class="error">Ingresa un título de hasta 120 caracteres.</small>
              }
            </label>

            <label>
              <span>Número de preguntas</span>
              <input
                type="number"
                formControlName="questionCount"
                min="5"
                max="30"
                inputmode="numeric"
              />
              @if (form.controls.questionCount.touched && form.controls.questionCount.invalid) {
                <small class="error">Ingresa un número entre 5 y 30.</small>
              }
            </label>

            @if (actionError()) {
              <p class="error">{{ actionError() }}</p>
            }

            <button class="primary-button" type="submit" [disabled]="!canGenerate">
              {{ working() ? 'Generando…' : 'Generar borrador' }}
            </button>
          </form>
        </article>
      }
    </section>
  `,
})
export class EvaluationGeneratePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly classes = inject(ClassesService);
  private readonly session = inject(SessionService);
  private readonly evaluations = inject(EvaluationsService);
  private readonly pdfStore = inject(PdfStoreService);
  private readonly fb = inject(FormBuilder);

  protected readonly classId = this.route.snapshot.paramMap.get('classId') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly className = signal('');
  protected readonly pdfs = signal<PdfFileRecord[]>([]);
  protected readonly selectedIds = signal<Set<string>>(new Set());
  protected readonly working = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    questionCount: [10, [Validators.required, Validators.min(5), Validators.max(30)]],
  });

  protected readonly selectedFiles = computed(() => {
    const ids = this.selectedIds();
    return this.pdfs().filter((pdf) => ids.has(pdf.id));
  });

  protected get canGenerate(): boolean {
    return this.form.valid && this.selectedFiles().length > 0 && !this.working();
  }

  async ngOnInit(): Promise<void> {
    try {
      const record = await this.classes.getClass(this.classId);
      if (!record) {
        this.error.set('No encontramos esta clase.');
        return;
      }
      if (record.ownerTeacherId !== this.session.user()?.uid) {
        this.error.set('Solo el docente propietario puede generar evaluaciones.');
        return;
      }
      this.className.set(record.name);
      this.pdfs.set(await this.pdfStore.list(this.classId));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No pudimos cargar la clase.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    this.actionError.set(null);
    const addedIds: string[] = [];
    try {
      for (const file of files) {
        if (!this.isPdf(file)) {
          this.actionError.set(`"${file.name}" no es un PDF.`);
          continue;
        }
        const record = await this.pdfStore.add(this.classId, file);
        addedIds.push(record.id);
      }

      if (addedIds.length > 0) {
        this.pdfs.set(await this.pdfStore.list(this.classId));
        this.selectedIds.update((ids) => {
          const next = new Set(ids);
          for (const id of addedIds) next.add(id);
          return next;
        });
      }
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos guardar el PDF.');
    } finally {
      input.value = '';
    }
  }

  protected isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  protected toggleSelection(id: string): void {
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected async removePdf(pdf: PdfFileRecord): Promise<void> {
    this.actionError.set(null);
    try {
      await this.pdfStore.remove(pdf.id);
      this.selectedIds.update((ids) => {
        const next = new Set(ids);
        next.delete(pdf.id);
        return next;
      });
      this.pdfs.update((list) => list.filter((item) => item.id !== pdf.id));
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos quitar el PDF.');
    }
  }

  protected async submit(): Promise<void> {
    this.actionError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const files = this.selectedFiles();
    if (files.length === 0) {
      this.actionError.set('Selecciona al menos un PDF.');
      return;
    }

    try {
      this.working.set(true);
      const { title, questionCount } = this.form.getRawValue();
      const draft = await this.evaluations.generateDraft({
        questionCount,
        files,
      });
      const evaluationId = await this.evaluations.createEvaluation(
        this.classId,
        title,
        files,
        draft.questions,
        draft.meta,
        draft.rawJson,
      );
      await this.router.navigate(['/classes', this.classId, 'evaluations', evaluationId, 'edit']);
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'No pudimos generar la evaluación.');
    } finally {
      this.working.set(false);
    }
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kilobytes = bytes / 1024;
    if (kilobytes < 1024) return `${kilobytes.toFixed(0)} KB`;
    return `${(kilobytes / 1024).toFixed(1)} MB`;
  }

  private isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }
}
