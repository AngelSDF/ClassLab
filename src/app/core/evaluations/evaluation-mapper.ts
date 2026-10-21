import {
  EvaluationGenerationMeta,
  EvaluationOption,
  EvaluationQuestion,
  GeneratedDraft,
  QuestionType,
} from './evaluation-record';

const OPTION_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeId(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function fallbackOptionId(index: number): string {
  return `opt_${OPTION_LETTERS[index] ?? index}`;
}

function normalizePoints(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
}

function mapOptions(value: unknown, questionNumber: number): EvaluationOption[] {
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

function mapCorrectOptionIds(
  value: unknown,
  options: EvaluationOption[],
  questionNumber: number,
  type: 'opcion_unica' | 'opcion_multiple',
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`La pregunta ${questionNumber} no tiene respuesta correcta.`);
  }

  const optionIds = new Set(options.map((option) => option.id));
  const rawIds = value.filter((id): id is string => typeof id === 'string');
  if (rawIds.length !== value.length) {
    throw new Error(`La pregunta ${questionNumber} tiene una respuesta correcta inválida.`);
  }
  if (rawIds.some((id) => !optionIds.has(id))) {
    throw new Error(
      `La pregunta ${questionNumber} tiene una respuesta correcta que no corresponde a sus opciones.`,
    );
  }

  const uniqueIds = [...new Set(rawIds)];
  if (uniqueIds.length === 0) {
    throw new Error(`La pregunta ${questionNumber} no indica una respuesta correcta.`);
  }
  if (type === 'opcion_unica' && uniqueIds.length !== 1) {
    throw new Error(`La pregunta ${questionNumber} debe tener exactamente una respuesta correcta.`);
  }

  return uniqueIds;
}

export function mapApiQuestion(raw: unknown, index: number): EvaluationQuestion {
  const questionNumber = index + 1;
  const item = asRecord(raw);
  if (!item) {
    throw new Error(`La pregunta ${questionNumber} no tiene un formato válido.`);
  }

  const type = item['tipo'];
  if (type !== 'opcion_unica' && type !== 'opcion_multiple' && type !== 'verdadero_falso') {
    throw new Error(`La pregunta ${questionNumber} tiene un tipo no soportado.`);
  }

  const prompt = typeof item['enunciado'] === 'string' ? item['enunciado'].trim() : '';
  if (!prompt) {
    throw new Error(`La pregunta ${questionNumber} no tiene enunciado.`);
  }

  const id = normalizeId(item['id'], `q${questionNumber}`);
  const points = normalizePoints(item['puntuacion']);
  const explanation =
    typeof item['retroalimentacion'] === 'string' ? item['retroalimentacion'].trim() : '';

  if (type === 'verdadero_falso') {
    const correctBoolean = item['respuesta_correcta'];
    if (typeof correctBoolean !== 'boolean') {
      throw new Error(
        `La pregunta ${questionNumber} de verdadero/falso no tiene una respuesta booleana.`,
      );
    }
    return {
      id,
      type,
      prompt,
      points,
      explanation,
      options: [],
      correctOptionIds: [],
      correctBoolean,
    };
  }

  const options = mapOptions(item['opciones'], questionNumber);
  const correctOptionIds = mapCorrectOptionIds(
    item['respuesta_correcta'],
    options,
    questionNumber,
    type,
  );

  return {
    id,
    type,
    prompt,
    points,
    explanation,
    options,
    correctOptionIds,
    correctBoolean: null,
  };
}

export function mapApiDraft(payload: unknown, requested: number): GeneratedDraft {
  const body = asRecord(payload);
  if (!body) {
    throw new Error('La API devolvió una respuesta con un formato inesperado.');
  }

  if (body['ok'] === false) {
    const error = asRecord(body['error']);
    const message =
      typeof error?.['message'] === 'string' ? error['message'] : 'La API rechazó la solicitud.';
    throw new Error(message);
  }

  const data = asRecord(body['data']);
  if (body['ok'] !== true || !data) {
    throw new Error('La API devolvió una respuesta con un formato inesperado.');
  }

  const rawQuestions = data['preguntas'];
  if (!Array.isArray(rawQuestions)) {
    throw new Error('La API no devolvió una lista de preguntas.');
  }

  const questions = rawQuestions.map((item, index) => mapApiQuestion(item, index));
  if (questions.length === 0) {
    throw new Error('La API no devolvió preguntas.');
  }

  const meta = asRecord(body['meta']);
  const generationMeta: EvaluationGenerationMeta = {
    model: typeof meta?.['modelo'] === 'string' ? meta['modelo'] : '',
    pdfPages: typeof meta?.['paginas_pdf'] === 'number' ? meta['paginas_pdf'] : 0,
    pdfCharacters: typeof meta?.['caracteres_pdf'] === 'number' ? meta['caracteres_pdf'] : 0,
    requestedQuestions:
      typeof meta?.['num_preguntas_solicitadas'] === 'number'
        ? meta['num_preguntas_solicitadas']
        : requested,
    durationMs: typeof meta?.['duracion_ms'] === 'number' ? meta['duracion_ms'] : 0,
    schemaVersion: typeof data['schema_version'] === 'string' ? data['schema_version'] : '',
  };

  return {
    questions,
    meta: generationMeta,
    rawJson: JSON.stringify(rawQuestions, null, 2),
  };
}

/**
 * Interpreta el texto guardado en `rawJson` (arreglo de preguntas de la API).
 */
export function parseRawQuestions(rawJson: string): EvaluationQuestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('El contenido guardado de la evaluación no es un JSON válido.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('El contenido guardado de la evaluación no es una lista de preguntas.');
  }
  if (parsed.length === 0) {
    throw new Error('La evaluación guardada no contiene preguntas.');
  }

  return parsed.map((item, index) => mapApiQuestion(item, index));
}

/**
 * Serializa las preguntas editadas con la misma forma que usa la API.
 * Lanza un error con el primer problema de validación encontrado.
 */
export function questionsToRawJson(questions: EvaluationQuestion[]): string {
  if (questions.length === 0) {
    throw new Error('La evaluación debe tener al menos una pregunta.');
  }

  const apiQuestions = questions.map((question, index) => questionToApiShape(question, index));
  return JSON.stringify(apiQuestions, null, 2);
}

function questionToApiShape(question: EvaluationQuestion, index: number): Record<string, unknown> {
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

  const explanation = question.explanation.trim();
  if (explanation) {
    base['retroalimentacion'] = explanation;
  }

  if (question.type === 'verdadero_falso') {
    if (typeof question.correctBoolean !== 'boolean') {
      throw new Error(
        `La pregunta ${questionNumber} de verdadero/falso no tiene respuesta correcta.`,
      );
    }
    base['respuesta_correcta'] = question.correctBoolean;
    return base;
  }

  if (question.options.length < 2) {
    throw new Error(`La pregunta ${questionNumber} debe tener al menos dos opciones.`);
  }

  const optionIds = new Set<string>();
  const options = question.options.map((option, optionIndex) => {
    const text = option.text.trim();
    if (!text) {
      throw new Error(`La pregunta ${questionNumber} tiene una opción sin texto.`);
    }
    if (optionIds.has(option.id)) {
      throw new Error(`La pregunta ${questionNumber} tiene ids de opción duplicados.`);
    }
    optionIds.add(option.id);
    return { id: option.id, texto: text };
  });

  const correctOptionIds = [...new Set(question.correctOptionIds)];
  if (correctOptionIds.length === 0) {
    throw new Error(`La pregunta ${questionNumber} no indica una respuesta correcta.`);
  }
  if (correctOptionIds.some((id) => !optionIds.has(id))) {
    throw new Error(
      `La pregunta ${questionNumber} tiene una respuesta correcta que no corresponde a sus opciones.`,
    );
  }
  if (question.type === 'opcion_unica' && correctOptionIds.length !== 1) {
    throw new Error(`La pregunta ${questionNumber} debe tener exactamente una respuesta correcta.`);
  }

  base['opciones'] = options;
  base['respuesta_correcta'] = correctOptionIds;
  return base;
}

/**
 * Normaliza preguntas ya guardadas (incluidos borradores anteriores con
 * `type: 'multiple_choice'` y `correctOptionIndex`).
 */
export function normalizeStoredQuestion(raw: unknown, index: number): EvaluationQuestion {
  const item = asRecord(raw) ?? {};
  const type: QuestionType =
    item['type'] === 'opcion_multiple' || item['type'] === 'verdadero_falso'
      ? item['type']
      : 'opcion_unica';

  const prompt = typeof item['prompt'] === 'string' ? item['prompt'] : '';
  const id = normalizeId(item['id'], `q${index + 1}`);
  const points = normalizePoints(item['points']);
  const explanation = typeof item['explanation'] === 'string' ? item['explanation'] : '';

  if (type === 'verdadero_falso') {
    return {
      id,
      type,
      prompt,
      points,
      explanation,
      options: [],
      correctOptionIds: [],
      correctBoolean: typeof item['correctBoolean'] === 'boolean' ? item['correctBoolean'] : null,
    };
  }

  const rawOptions = Array.isArray(item['options']) ? item['options'] : [];
  const options: EvaluationOption[] = rawOptions.map((option, optionIndex) => {
    if (typeof option === 'string') {
      return { id: fallbackOptionId(optionIndex), text: option };
    }
    const record = asRecord(option);
    return {
      id: normalizeId(record?.['id'], fallbackOptionId(optionIndex)),
      text: typeof record?.['text'] === 'string' ? record['text'] : '',
    };
  });

  let correctOptionIds: string[] = [];
  if (Array.isArray(item['correctOptionIds'])) {
    correctOptionIds = item['correctOptionIds'].filter(
      (value): value is string => typeof value === 'string',
    );
  } else if (typeof item['correctOptionIndex'] === 'number') {
    const option = options[item['correctOptionIndex']];
    if (option) correctOptionIds = [option.id];
  }

  return {
    id,
    type,
    prompt,
    points,
    explanation,
    options,
    correctOptionIds,
    correctBoolean: null,
  };
}
