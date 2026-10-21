import { Timestamp } from 'firebase/firestore';

export type AttemptStatus = 'in_progress' | 'submitted';

export interface AttemptAnswer {
  questionId: string;
  optionIds: string[];
  boolean: boolean | null;
}

export interface AttemptRecord {
  attemptNumber: number;
  status: AttemptStatus;
  answers: AttemptAnswer[];
  startedAt: Timestamp;
  submittedAt: Timestamp | null;
}

export interface ResultRecord {
  id: string;
  publicationId: string;
  studentId: string;
  studentName: string;
  publicationTitle: string;
  hasSubmitted: boolean;
  attempts: AttemptRecord[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type StartAttemptResult =
  | {
      kind: 'started';
      attempt: AttemptRecord;
      result: ResultRecord | null;
      previousAttemptSubmitted?: boolean;
    }
  | { kind: 'resumed'; attempt: AttemptRecord; result: ResultRecord }
  | {
      kind: 'auto_submitted';
      attempt: AttemptRecord;
      result: ResultRecord;
      reason: 'time_expired' | 'previous_attempt';
    }
  | {
      kind: 'blocked';
      reason: 'not_open' | 'closed' | 'no_attempts' | 'guests_disabled' | 'guest_full';
      result: ResultRecord | null;
    };
