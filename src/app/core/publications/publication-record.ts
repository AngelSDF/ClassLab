import { Timestamp } from 'firebase/firestore';
import {
  EvaluationGenerationMeta,
  EvaluationQuestion,
  EvaluationSourceFile,
} from '../evaluations/evaluation-record';

export interface PublicationRecord {
  id: string;
  evaluationId: string;
  title: string;
  accessCode: string;
  sourceFiles: EvaluationSourceFile[];
  rawJson: string;
  generationMeta?: EvaluationGenerationMeta;
  openAt: Timestamp | null;
  closeAt: Timestamp | null;
  maxAttempts: number;
  durationMinutes: number | null;
  rawJsonSafe: boolean;
  guestAccess: boolean;
  guestCapacity: number;
  guestCount: number;
  attemptCount: number;
  hasAttempts: boolean;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PublicationSummary {
  id: string;
  evaluationId: string;
  title: string;
  accessCode: string;
  questionCount: number;
  maxAttempts: number;
  durationMinutes: number | null;
  rawJsonSafe: boolean;
  guestAccess: boolean;
  guestCapacity: number;
  guestCount: number;
  attemptCount: number;
  hasAttempts: boolean;
  openAt: Timestamp | null;
  closeAt: Timestamp | null;
  createdAt: Timestamp | null;
}

export interface CreatePublicationInput {
  openAt: Timestamp | null;
  closeAt: Timestamp | null;
  maxAttempts: number;
  durationMinutes: number | null;
  guestAccess: boolean;
  guestCapacity: number;
}

export interface UpdatePublicationInput {
  title: string;
  questions: EvaluationQuestion[];
  durationMinutes: number | null;
  guestAccess: boolean;
  guestCapacity: number;
}
