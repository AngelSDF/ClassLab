import { FieldValue, Timestamp } from 'firebase/firestore';

export type QuestionType = 'opcion_unica' | 'opcion_multiple' | 'verdadero_falso';

export interface EvaluationOption {
  id: string;
  text: string;
}

export interface EvaluationQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  explanation: string;
  options: EvaluationOption[];
  correctOptionIds: string[];
  correctBoolean: boolean | null;
}

export interface EvaluationSourceFile {
  name: string;
  size: number;
}

export interface EvaluationGenerationMeta {
  model: string;
  pdfPages: number;
  pdfCharacters: number;
  requestedQuestions: number;
  durationMs: number;
  schemaVersion: string;
}

export interface EvaluationRecord {
  id: string;
  title: string;
  status: 'draft';
  sourceFiles: EvaluationSourceFile[];
  rawJson: string;
  questions: EvaluationQuestion[];
  generationMeta?: EvaluationGenerationMeta;
  createdBy: string;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface EvaluationSummary {
  id: string;
  title: string;
  questionCount: number;
  createdAt: Timestamp | FieldValue;
}

export interface GeneratedDraft {
  questions: EvaluationQuestion[];
  meta: EvaluationGenerationMeta;
  rawJson: string;
}
