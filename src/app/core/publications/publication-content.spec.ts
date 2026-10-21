import { EvaluationQuestion } from '../evaluations/evaluation-record';
import { parseStudentRawQuestions, studentQuestionsToRawJson } from './publication-content';

const questions: EvaluationQuestion[] = [
  {
    id: 'q1',
    type: 'opcion_unica',
    prompt: 'Pregunta uno',
    points: 5,
    explanation: 'Explicación privada',
    options: [
      { id: 'opt_a', text: 'A' },
      { id: 'opt_b', text: 'B' },
    ],
    correctOptionIds: ['opt_a'],
    correctBoolean: null,
  },
  {
    id: 'q2',
    type: 'verdadero_falso',
    prompt: 'Pregunta dos',
    points: 2,
    explanation: 'Otra explicación',
    options: [],
    correctOptionIds: [],
    correctBoolean: false,
  },
];

describe('publication-content', () => {
  it('serializa preguntas sin respuestas ni explicaciones', () => {
    const raw = studentQuestionsToRawJson(questions);
    expect(raw).not.toContain('respuesta_correcta');
    expect(raw).not.toContain('retroalimentacion');
    expect(raw).not.toContain('Explicación privada');
  });

  it('interpreta el contenido público de la publicación', () => {
    const parsed = parseStudentRawQuestions(studentQuestionsToRawJson(questions));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      id: 'q1',
      type: 'opcion_unica',
      prompt: 'Pregunta uno',
      points: 5,
      options: [
        { id: 'opt_a', text: 'A' },
        { id: 'opt_b', text: 'B' },
      ],
    });
    expect(parsed[1].options).toEqual([]);
  });

  it('rechaza contenido sin preguntas', () => {
    expect(() => parseStudentRawQuestions('[]')).toThrow('no contiene preguntas');
  });
});
