import { Timestamp } from 'firebase/firestore';
import { EvaluationQuestion, QuestionType } from '../evaluations/evaluation-record';

export interface StudentOption {
  id: string;
  text: string;
}

export interface StudentQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  options: StudentOption[];
}

export interface StudentPublicationContent {
  classId: string;
  publicationId: string;
  title: string;
  maxAttempts: number;
  durationMinutes: number | null;
  openAt: Timestamp | null;
  closeAt: Timestamp | null;
  guestAccess: boolean;
  guestCapacity: number;
  guestCount: number;
  questions: StudentQuestion[];
}

const OPTION_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeId(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizePoints(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
}

function fallbackOptionId(index: number): string {
  return `opt_${OPTION_LETTERS[index] ?? index}`;
}

function mapStudentOptions(value: unknown, questionNumber: number): StudentOption[] {
  if (!Array.isArray(value)) {
    throw new Error(`La pregunta ${questionNumber} no tiene opciones.`);
  }

  const options = value.map((item, index) => {
    const option = asRecord(item);
    const text = typeof option?.['texto'] === 'string' ? option['texto'].trim() : '';
    if (!text) {
      throw new Error(`La pregunta ${questionNumber} tiene una opción sin texto.`);
    }
    return {
      id: normalizeId(option?.['id'], fallbackOptionId(index)),
      text,
    };
  });

  if (options.length < 2) {
    throw new Error(`La pregunta ${questionNumber} debe tener al menos dos opciones.`);
  }

  const ids = new Set<string>();
  for (const option of options) {
    if (ids.has(option.id)) {
      throw new Error(`La pregunta ${questionNumber} tiene ids de opción duplicados.`);
    }
    ids.add(option.id);
  }

  return options;
}

export function studentQuestionsToRawJson(questions: EvaluationQuestion[]): string {
  if (questions.length === 0) {
    throw new Error('La publicación debe tener al menos una pregunta.');
  }

  const apiQuestions = questions.map((question, index) => {
    const questionNumber = index + 1;
    const prompt = question.prompt.trim();
    if (!prompt) {
      throw new Error(`La pregunta ${questionNumber} no tiene enunciado.`);
    }
    if (!Number.isFinite(question.points) || question.points <= 0) {
      throw new Error(`La pregunta ${questionNumber} debe tener una puntuación mayor que cero.`);
    }

    const base: Record<string, unknown> = {
      id: question.id,
      tipo: question.type,
      enunciado: prompt,
      puntuacion: Math.trunc(question.points),
    };

    if (question.type !== 'verdadero_falso') {
      if (question.options.length < 2) {
        throw new Error(`La pregunta ${questionNumber} debe tener al menos dos opciones.`);
      }
      base['opciones'] = question.options.map((option) => {
        const text = option.text.trim();
        if (!text) {
          throw new Error(`La pregunta ${questionNumber} tiene una opción sin texto.`);
        }
        return { id: option.id, texto: text };
      });
    }

    return base;
  });

  return JSON.stringify(apiQuestions, null, 2);
}

export function parseStudentRawQuestions(rawJson: string): StudentQuestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('El contenido de la publicación no es un JSON válido.');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('La publicación no contiene preguntas.');
  }

  return parsed.map((item, index) => {
    const questionNumber = index + 1;
    const record = asRecord(item);
    if (!record) {
      throw new Error(`La pregunta ${questionNumber} no tiene un formato válido.`);
    }

    const type = record['tipo'];
    if (type !== 'opcion_unica' && type !== 'opcion_multiple' && type !== 'verdadero_falso') {
      throw new Error(`La pregunta ${questionNumber} tiene un tipo no soportado.`);
    }

    const prompt = typeof record['enunciado'] === 'string' ? record['enunciado'].trim() : '';
    if (!prompt) {
      throw new Error(`La pregunta ${questionNumber} no tiene enunciado.`);
    }

    const id = normalizeId(record['id'], `q${questionNumber}`);
    const points = normalizePoints(record['puntuacion']);

    if (type === 'verdadero_falso') {
      return { id, type, prompt, points, options: [] };
    }

    return {
      id,
      type,
      prompt,
      points,
      options: mapStudentOptions(record['opciones'], questionNumber),
    };
  });
}
