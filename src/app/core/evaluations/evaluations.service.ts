import { Injectable, inject } from '@angular/core';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { firebaseFirestore } from '../shared/firebase';
import {
  mapApiDraft,
  normalizeStoredQuestion,
  parseRawQuestions,
  questionsToRawJson,
} from './evaluation-mapper';
import {
  EvaluationGenerationMeta,
  EvaluationQuestion,
  EvaluationRecord,
  EvaluationSourceFile,
  EvaluationSummary,
  GeneratedDraft,
} from './evaluation-record';
import { SessionService } from '../auth/session.service';
import { PdfFileRecord } from './pdf-store.service';

const MAX_TITLE = 120;
const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 30;
const REQUEST_TIMEOUT_MS = 90_000;

export interface GenerateDraftInput {
  questionCount: number;
  files: PdfFileRecord[];
}

function describeError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'permission-denied') {
    return 'Las reglas de Firestore bloquearon la operación. Verifica que estén desplegadas.';
  }
  return err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
}

function timestampMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

@Injectable({ providedIn: 'root' })
export class EvaluationsService {
  private readonly firestore = firebaseFirestore;
  private readonly session = inject(SessionService);

  /**
   * Envía el primer PDF seleccionado a la API local (FastAPI + Groq) y
   * devuelve las preguntas interpretadas, los metadatos y el JSON original.
   */
  async generateDraft(input: GenerateDraftInput): Promise<GeneratedDraft> {
    const count = Math.trunc(Number(input.questionCount));
    if (!Number.isFinite(count) || count < MIN_QUESTIONS || count > MAX_QUESTIONS) {
      throw new Error(
        `El número de preguntas debe estar entre ${MIN_QUESTIONS} y ${MAX_QUESTIONS}.`,
      );
    }

    const file = input.files[0];
    if (!file) {
      throw new Error('Selecciona al menos un PDF.');
    }

    const baseUrl = environment.apiBaseUrl.replace(/\/+$/, '');
    const form = new FormData();
    form.append('archivo', file.blob, file.name);
    form.append('num_preguntas', String(count));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/v1/cuestionario`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') {
        throw new Error('La API tardó demasiado en responder. Inténtalo de nuevo.');
      }
      throw new Error(
        `No pudimos conectar con la API local en ${baseUrl}. ` +
          'Verifica que esté corriendo y que CORS permita este origen.',
      );
    } finally {
      clearTimeout(timeout);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('La API devolvió una respuesta que no es JSON.');
    }

    const draft = mapApiDraft(payload, count);
    if (!response.ok) {
      throw new Error(`La API respondió con un error (HTTP ${response.status}).`);
    }
    return draft;
  }

  async createEvaluation(
    classId: string,
    title: string,
    files: PdfFileRecord[],
    questions: EvaluationQuestion[],
    generationMeta: EvaluationGenerationMeta,
    rawJson: string,
  ): Promise<string> {
    const firestore = this.requireFirestore();
    const user = this.session.user();
    if (!user || user.isAnonymous) {
      throw new Error('Debes iniciar sesión con Google para crear evaluaciones.');
    }

    const trimmed = title.trim();
    if (!trimmed || trimmed.length > MAX_TITLE) {
      throw new Error(`El título debe tener entre 1 y ${MAX_TITLE} caracteres.`);
    }
    if (questions.length < 1 || questions.length > MAX_QUESTIONS) {
      throw new Error(`El número de preguntas debe estar entre 1 y ${MAX_QUESTIONS}.`);
    }
    if (!rawJson.trim()) {
      throw new Error('No se recibió el contenido generado de la evaluación.');
    }

    const sourceFiles: EvaluationSourceFile[] = files.map((file) => ({
      name: file.name,
      size: file.size,
    }));

    try {
      const evaluationRef = doc(collection(firestore, 'classes', classId, 'evaluations'));
      const now = serverTimestamp();
      await setDoc(evaluationRef, {
        title: trimmed,
        status: 'draft',
        sourceFiles,
        rawJson,
        generationMeta,
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      });
      return evaluationRef.id;
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async getEvaluation(classId: string, evaluationId: string): Promise<EvaluationRecord | null> {
    const firestore = this.requireFirestore();
    const snapshot = await getDoc(doc(firestore, 'classes', classId, 'evaluations', evaluationId));
    if (!snapshot.exists()) return null;

    const {
      questions: legacyQuestions,
      rawJson: rawJsonValue,
      ...rest
    } = snapshot.data() as Omit<EvaluationRecord, 'id' | 'questions' | 'rawJson'> & {
      questions?: unknown;
      rawJson?: unknown;
    };

    const rawJson = typeof rawJsonValue === 'string' ? rawJsonValue : '';
    let questions: EvaluationQuestion[];

    if (rawJson.trim()) {
      try {
        questions = parseRawQuestions(rawJson);
      } catch (err) {
        if (!Array.isArray(legacyQuestions)) throw err;
        questions = legacyQuestions.map((question, index) =>
          normalizeStoredQuestion(question, index),
        );
      }
    } else if (Array.isArray(legacyQuestions)) {
      questions = legacyQuestions.map((question, index) =>
        normalizeStoredQuestion(question, index),
      );
    } else {
      questions = [];
    }

    return {
      ...rest,
      id: snapshot.id,
      rawJson,
      questions,
    };
  }

  async listEvaluations(classId: string): Promise<EvaluationSummary[]> {
    const firestore = this.requireFirestore();
    const snapshot = await getDocs(collection(firestore, 'classes', classId, 'evaluations'));

    return snapshot.docs
      .map((item) => {
        const data = item.data() as Record<string, unknown>;
        const rawJson = typeof data['rawJson'] === 'string' ? data['rawJson'] : '';

        let questionCount = 0;
        if (rawJson.trim()) {
          try {
            questionCount = parseRawQuestions(rawJson).length;
          } catch {
            questionCount = 0;
          }
        }
        if (questionCount === 0 && Array.isArray(data['questions'])) {
          questionCount = data['questions'].length;
        }

        return {
          id: item.id,
          title: typeof data['title'] === 'string' ? data['title'] : 'Sin título',
          questionCount,
          createdAt: data['createdAt'] as EvaluationSummary['createdAt'],
        };
      })
      .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
  }

  async updateEvaluation(
    classId: string,
    evaluationId: string,
    questions: EvaluationQuestion[],
  ): Promise<string> {
    const firestore = this.requireFirestore();
    const rawJson = questionsToRawJson(questions);

    try {
      await updateDoc(doc(firestore, 'classes', classId, 'evaluations', evaluationId), {
        rawJson,
        updatedAt: serverTimestamp(),
        questions: deleteField(),
      });
      return rawJson;
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async deleteEvaluation(classId: string, evaluationId: string): Promise<void> {
    const firestore = this.requireFirestore();
    try {
      await deleteDoc(doc(firestore, 'classes', classId, 'evaluations', evaluationId));
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  private requireFirestore() {
    if (!this.firestore) throw new Error('Firebase aún no está configurado.');
    return this.firestore;
  }
}
