import {
  mapApiDraft,
  normalizeStoredQuestion,
  parseRawQuestions,
  questionsToRawJson,
} from './evaluation-mapper';

function apiPayload(preguntas: unknown[]) {
  return {
    ok: true,
    data: {
      schema_version: '1.0',
      titulo: 'Evaluación',
      descripcion: 'Descripción',
      preguntas,
    },
    meta: {
      modelo: 'groq-test',
      paginas_pdf: 2,
      caracteres_pdf: 800,
      num_preguntas_solicitadas: preguntas.length,
      duracion_ms: 500,
    },
  };
}

describe('mapApiDraft', () => {
  it('interpreta preguntas de opción única con ids de opción', () => {
    const draft = mapApiDraft(
      apiPayload([
        {
          id: 'preg_001',
          tipo: 'opcion_unica',
          enunciado: '¿Cuál es la capital?',
          puntuacion: 2,
          opciones: [
            { id: 'opt_a', texto: 'Lima' },
            { id: 'opt_b', texto: 'Quito' },
          ],
          respuesta_correcta: ['opt_a'],
          retroalimentacion: 'Lima es la capital.',
        },
      ]),
      1,
    );

    expect(draft.questions).toHaveLength(1);
    expect(draft.questions[0]).toMatchObject({
      id: 'preg_001',
      type: 'opcion_unica',
      prompt: '¿Cuál es la capital?',
      points: 2,
      correctOptionIds: ['opt_a'],
      correctBoolean: null,
    });
    expect(draft.questions[0].options).toEqual([
      { id: 'opt_a', text: 'Lima' },
      { id: 'opt_b', text: 'Quito' },
    ]);
    expect(draft.meta.schemaVersion).toBe('1.0');
    expect(draft.meta.model).toBe('groq-test');

    const raw = JSON.parse(draft.rawJson);
    expect(Array.isArray(raw)).toBe(true);
    expect(raw[0].tipo).toBe('opcion_unica');
    expect(raw[0].respuesta_correcta).toEqual(['opt_a']);
  });

  it('interpreta preguntas de opción múltiple con varias respuestas', () => {
    const draft = mapApiDraft(
      apiPayload([
        {
          id: 'preg_002',
          tipo: 'opcion_multiple',
          enunciado: 'Selecciona los primos.',
          puntuacion: 3,
          opciones: [
            { id: 'opt_a', texto: '2' },
            { id: 'opt_b', texto: '4' },
            { id: 'opt_c', texto: '5' },
          ],
          respuesta_correcta: ['opt_a', 'opt_c', 'opt_c'],
        },
      ]),
      1,
    );

    expect(draft.questions[0].type).toBe('opcion_multiple');
    expect(draft.questions[0].correctOptionIds).toEqual(['opt_a', 'opt_c']);
  });

  it('interpreta verdadero/falso sin exigir opciones', () => {
    const draft = mapApiDraft(
      apiPayload([
        {
          id: 'preg_003',
          tipo: 'verdadero_falso',
          enunciado: 'El agua hierve a 100 °C al nivel del mar.',
          puntuacion: 1,
          respuesta_correcta: true,
        },
      ]),
      1,
    );

    expect(draft.questions[0]).toMatchObject({
      type: 'verdadero_falso',
      options: [],
      correctOptionIds: [],
      correctBoolean: true,
    });
  });

  it('rechaza verdadero/falso con respuesta que no es booleana', () => {
    expect(() =>
      mapApiDraft(
        apiPayload([
          {
            id: 'preg_004',
            tipo: 'verdadero_falso',
            enunciado: 'Afirmación.',
            puntuacion: 1,
            respuesta_correcta: ['opt_a'],
          },
        ]),
        1,
      ),
    ).toThrow(/verdadero\/falso/);
  });

  it('rechaza tipos no soportados', () => {
    expect(() =>
      mapApiDraft(
        apiPayload([
          {
            id: 'preg_005',
            tipo: 'ensayo',
            enunciado: 'Escribe.',
            puntuacion: 1,
          },
        ]),
        1,
      ),
    ).toThrow(/tipo no soportado/);
  });

  it('rechaza opción única con más de una respuesta correcta', () => {
    expect(() =>
      mapApiDraft(
        apiPayload([
          {
            id: 'preg_006',
            tipo: 'opcion_unica',
            enunciado: 'Elige una.',
            puntuacion: 1,
            opciones: [
              { id: 'opt_a', texto: 'A' },
              { id: 'opt_b', texto: 'B' },
            ],
            respuesta_correcta: ['opt_a', 'opt_b'],
          },
        ]),
        1,
      ),
    ).toThrow(/exactamente una respuesta correcta/);
  });

  it('propaga el mensaje de error de la API', () => {
    expect(() =>
      mapApiDraft(
        { ok: false, error: { code: 'pdf_invalido', message: 'El PDF está dañado.' } },
        5,
      ),
    ).toThrow('El PDF está dañado.');
  });
});

describe('normalizeStoredQuestion', () => {
  it('convierte borradores antiguos de multiple_choice y correctOptionIndex', () => {
    const question = normalizeStoredQuestion(
      {
        id: 'q1',
        type: 'multiple_choice',
        prompt: 'Pregunta antigua',
        options: ['Uno', 'Dos', 'Tres'],
        correctOptionIndex: 1,
        explanation: 'Dos.',
      },
      0,
    );

    expect(question.type).toBe('opcion_unica');
    expect(question.options).toEqual([
      { id: 'opt_a', text: 'Uno' },
      { id: 'opt_b', text: 'Dos' },
      { id: 'opt_c', text: 'Tres' },
    ]);
    expect(question.correctOptionIds).toEqual(['opt_b']);
    expect(question.points).toBe(1);
    expect(question.correctBoolean).toBeNull();
  });

  it('conserva las respuestas nativas de los tipos nuevos', () => {
    const question = normalizeStoredQuestion(
      {
        id: 'q2',
        type: 'verdadero_falso',
        prompt: '¿Es cierto?',
        points: 4,
        correctBoolean: false,
        correctOptionIds: ['opt_a'],
        options: [{ id: 'opt_a', text: 'Sí' }],
      },
      0,
    );

    expect(question.type).toBe('verdadero_falso');
    expect(question.correctBoolean).toBe(false);
    expect(question.options).toEqual([]);
    expect(question.correctOptionIds).toEqual([]);
    expect(question.points).toBe(4);
  });
});

describe('rawJson', () => {
  it('hace round-trip de los tres tipos de pregunta', () => {
    const draft = mapApiDraft(
      apiPayload([
        {
          id: 'preg_001',
          tipo: 'opcion_unica',
          enunciado: 'Elige una.',
          puntuacion: 2,
          opciones: [
            { id: 'opt_a', texto: 'A' },
            { id: 'opt_b', texto: 'B' },
          ],
          respuesta_correcta: ['opt_b'],
          retroalimentacion: 'B es correcta.',
        },
        {
          id: 'preg_002',
          tipo: 'opcion_multiple',
          enunciado: 'Elige varias.',
          puntuacion: 3,
          opciones: [
            { id: 'opt_a', texto: 'A' },
            { id: 'opt_b', texto: 'B' },
            { id: 'opt_c', texto: 'C' },
          ],
          respuesta_correcta: ['opt_a', 'opt_c'],
        },
        {
          id: 'preg_003',
          tipo: 'verdadero_falso',
          enunciado: '¿Es cierto?',
          puntuacion: 1,
          respuesta_correcta: false,
        },
      ]),
      3,
    );

    const rawJson = questionsToRawJson(draft.questions);
    const parsed = parseRawQuestions(rawJson);

    expect(parsed).toEqual(draft.questions);
    expect(JSON.parse(rawJson)).toHaveLength(3);
  });

  it('serializa verdadero/falso sin opciones', () => {
    const rawJson = questionsToRawJson([
      {
        id: 'preg_003',
        type: 'verdadero_falso',
        prompt: '¿Es cierto?',
        points: 1,
        explanation: '',
        options: [],
        correctOptionIds: [],
        correctBoolean: true,
      },
    ]);
    const raw = JSON.parse(rawJson);

    expect(raw[0].tipo).toBe('verdadero_falso');
    expect(raw[0].respuesta_correcta).toBe(true);
    expect(raw[0].opciones).toBeUndefined();
  });

  it('rechaza preguntas sin enunciado al guardar', () => {
    expect(() =>
      questionsToRawJson([
        {
          id: 'q1',
          type: 'opcion_unica',
          prompt: '   ',
          points: 1,
          explanation: '',
          options: [
            { id: 'opt_a', text: 'A' },
            { id: 'opt_b', text: 'B' },
          ],
          correctOptionIds: ['opt_a'],
          correctBoolean: null,
        },
      ]),
    ).toThrow(/no tiene enunciado/);
  });

  it('rechaza opción única sin respuesta correcta', () => {
    expect(() =>
      questionsToRawJson([
        {
          id: 'q1',
          type: 'opcion_unica',
          prompt: 'Elige.',
          points: 1,
          explanation: '',
          options: [
            { id: 'opt_a', text: 'A' },
            { id: 'opt_b', text: 'B' },
          ],
          correctOptionIds: [],
          correctBoolean: null,
        },
      ]),
    ).toThrow(/no indica una respuesta correcta/);
  });

  it('rechaza verdadero/falso sin respuesta booleana', () => {
    expect(() =>
      questionsToRawJson([
        {
          id: 'q1',
          type: 'verdadero_falso',
          prompt: '¿Es cierto?',
          points: 1,
          explanation: '',
          options: [],
          correctOptionIds: [],
          correctBoolean: null,
        },
      ]),
    ).toThrow(/verdadero\/falso no tiene respuesta correcta/);
  });

  it('rechaza una evaluación sin preguntas', () => {
    expect(() => questionsToRawJson([])).toThrow(/al menos una pregunta/);
  });

  it('rechaza rawJson que no es JSON válido', () => {
    expect(() => parseRawQuestions('{no es json')).toThrow(/JSON válido/);
  });
});
