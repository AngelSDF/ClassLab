import { Injectable, inject } from '@angular/core';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import {
  CODE_ATTEMPTS,
  CODE_LENGTH,
  generateAccessCode,
  normalizeAccessCode,
} from '../shared/access-code';
import { firebaseFirestore } from '../shared/firebase';
import {
  EvaluationGenerationMeta,
  EvaluationQuestion,
  EvaluationRecord,
  EvaluationSourceFile,
} from '../evaluations/evaluation-record';
import { parseRawQuestions, questionsToRawJson } from '../evaluations/evaluation-mapper';
import {
  StudentPublicationContent,
  parseStudentRawQuestions,
  studentQuestionsToRawJson,
} from './publication-content';
import { readDurationMinutes, validateDurationMinutes } from './publication-time-limit';
import {
  CreatePublicationInput,
  PublicationRecord,
  PublicationSummary,
  UpdatePublicationInput,
} from './publication-record';
import { SessionService } from '../auth/session.service';

const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 100;
const MAX_TITLE = 120;
const MIN_GUEST_CAPACITY = 1;
const MAX_GUEST_CAPACITY = 500;

class CodeCollisionError extends Error {}

function describeError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'permission-denied') {
    return 'Las reglas de Firestore bloquearon la operaciÃ³n. Verifica que estÃ©n desplegadas.';
  }
  return err instanceof Error ? err.message : 'OcurriÃ³ un error inesperado.';
}

function normalizeGenerationMeta(
  meta: EvaluationGenerationMeta | undefined,
): EvaluationGenerationMeta {
  return {
    model: meta?.model ?? '',
    pdfPages: meta?.pdfPages ?? 0,
    pdfCharacters: meta?.pdfCharacters ?? 0,
    requestedQuestions: meta?.requestedQuestions ?? 0,
    durationMs: meta?.durationMs ?? 0,
    schemaVersion: meta?.schemaVersion ?? '',
  };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function asTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function mapSourceFiles(value: unknown): EvaluationSourceFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const file = item as { name?: unknown; size?: unknown };
    if (typeof file.name !== 'string' || typeof file.size !== 'number') return [];
    return [{ name: file.name, size: file.size }];
  });
}

function mapGenerationMeta(value: unknown): EvaluationGenerationMeta | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const meta = value as Record<string, unknown>;
  return {
    model: asString(meta['model']),
    pdfPages: asNumber(meta['pdfPages']),
    pdfCharacters: asNumber(meta['pdfCharacters']),
    requestedQuestions: asNumber(meta['requestedQuestions']),
    durationMs: asNumber(meta['durationMs']),
    schemaVersion: asString(meta['schemaVersion']),
  };
}

function normalizeDuration(value: number | null): number | null {
  return value === null ? null : validateDurationMinutes(value);
}

function normalizeGuestPolicy(
  guestAccess: boolean,
  guestCapacity: number,
): { guestAccess: boolean; guestCapacity: number } {
  if (!guestAccess) return { guestAccess: false, guestCapacity: 0 };

  const capacity = Math.trunc(Number(guestCapacity));
  if (
    !Number.isFinite(capacity) ||
    capacity < MIN_GUEST_CAPACITY ||
    capacity > MAX_GUEST_CAPACITY
  ) {
    throw new Error(
      `Las vacantes para invitados deben estar entre ${MIN_GUEST_CAPACITY} y ${MAX_GUEST_CAPACITY}.`,
    );
  }
  return { guestAccess: true, guestCapacity: capacity };
}

function countQuestions(rawJson: string): number {
  try {
    return parseRawQuestions(rawJson).length;
  } catch {
    return 0;
  }
}

function mapSummary(id: string, data: Record<string, unknown>): PublicationSummary {
  const attemptCount = asNumber(data['attemptCount']);
  return {
    id,
    evaluationId: asString(data['evaluationId']),
    title: asString(data['title'], 'Sin tÃ­tulo'),
    accessCode: asString(data['accessCode']),
    questionCount: countQuestions(asString(data['rawJson'])),
    maxAttempts: asNumber(data['maxAttempts'], 1),
    durationMinutes: readDurationMinutes(data['durationMinutes']),
    rawJsonSafe: data['rawJsonSafe'] === true,
    guestAccess: data['guestAccess'] === true,
    guestCapacity: asNumber(data['guestCapacity']),
    guestCount: asNumber(data['guestCount']),
    attemptCount,
    hasAttempts: attemptCount > 0,
    openAt: asTimestamp(data['openAt']),
    closeAt: asTimestamp(data['closeAt']),
    createdAt: asTimestamp(data['createdAt']),
  };
}

function mapRecord(id: string, data: Record<string, unknown>): PublicationRecord {
  const attemptCount = asNumber(data['attemptCount']);
  return {
    id,
    evaluationId: asString(data['evaluationId']),
    title: asString(data['title'], 'Sin tÃ­tulo'),
    accessCode: asString(data['accessCode']),
    sourceFiles: mapSourceFiles(data['sourceFiles']),
    rawJson: asString(data['rawJson']),
    generationMeta: mapGenerationMeta(data['generationMeta']),
    openAt: asTimestamp(data['openAt']),
    closeAt: asTimestamp(data['closeAt']),
    maxAttempts: asNumber(data['maxAttempts'], 1),
    durationMinutes: readDurationMinutes(data['durationMinutes']),
    rawJsonSafe: data['rawJsonSafe'] === true,
    guestAccess: data['guestAccess'] === true,
    guestCapacity: asNumber(data['guestCapacity']),
    guestCount: asNumber(data['guestCount']),
    attemptCount,
    hasAttempts: attemptCount > 0,
    createdBy: asString(data['createdBy']),
    createdAt: asTimestamp(data['createdAt']),
    updatedAt: asTimestamp(data['updatedAt']),
  };
}

@Injectable({ providedIn: 'root' })
export class PublicationsService {
  private readonly firestore = firebaseFirestore;
  private readonly session = inject(SessionService);

  async createPublication(
    classId: string,
    evaluation: EvaluationRecord,
    input: CreatePublicationInput,
  ): Promise<{ id: string; accessCode: string }> {
    const firestore = this.requireFirestore();
    const user = this.session.user();
    if (!user || user.isAnonymous) {
      throw new Error('Debes iniciar sesiÃ³n con Google para publicar evaluaciones.');
    }

    const maxAttempts = Math.trunc(Number(input.maxAttempts));
    if (!Number.isFinite(maxAttempts) || maxAttempts < MIN_ATTEMPTS || maxAttempts > MAX_ATTEMPTS) {
      throw new Error(`El nÃºmero de intentos debe estar entre ${MIN_ATTEMPTS} y ${MAX_ATTEMPTS}.`);
    }

    const title = evaluation.title.trim();
    if (title.length < 1 || title.length > MAX_TITLE) {
      throw new Error(`El tÃ­tulo debe tener entre 1 y ${MAX_TITLE} caracteres.`);
    }

    const durationMinutes = normalizeDuration(input.durationMinutes);
    const guestPolicy = normalizeGuestPolicy(input.guestAccess, input.guestCapacity);

    const rawJson = evaluation.rawJson.trim()
      ? evaluation.rawJson
      : questionsToRawJson(evaluation.questions);
    if (!rawJson.trim()) {
      throw new Error('La evaluaciÃ³n no tiene preguntas para publicar.');
    }

    let publicRawJson: string;
    try {
      publicRawJson = studentQuestionsToRawJson(parseRawQuestions(rawJson));
    } catch (err) {
      throw new Error(
        err instanceof Error
          ? err.message
          : 'La evaluaciÃ³n no tiene preguntas vÃ¡lidas para publicar.',
      );
    }

    const publicationRef = doc(collection(firestore, 'classes', classId, 'publications'));
    const feedbackRef = doc(
      firestore,
      'classes',
      classId,
      'publications',
      publicationRef.id,
      'content',
      'feedback',
    );

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const accessCode = generateAccessCode();
      const codeRef = doc(firestore, 'publicationCodes', accessCode);
      try {
        await runTransaction(firestore, async (transaction) => {
          const existing = await transaction.get(codeRef);
          if (existing.exists()) throw new CodeCollisionError();

          const now = serverTimestamp();
          transaction.set(publicationRef, {
            evaluationId: evaluation.id,
            title,
            accessCode,
            sourceFiles: evaluation.sourceFiles.map((file) => ({
              name: file.name,
              size: file.size,
            })),
            rawJson: publicRawJson,
            rawJsonSafe: true,
            generationMeta: normalizeGenerationMeta(evaluation.generationMeta),
            openAt: input.openAt,
            closeAt: input.closeAt,
            maxAttempts,
            durationMinutes,
            guestAccess: guestPolicy.guestAccess,
            guestCapacity: guestPolicy.guestCapacity,
            guestCount: 0,
            attemptCount: 0,
            createdBy: user.uid,
            createdAt: now,
            updatedAt: now,
          });

          const content = {
            classId,
            publicationId: publicationRef.id,
            title,
            maxAttempts,
            durationMinutes,
            openAt: input.openAt,
            closeAt: input.closeAt,
            createdBy: user.uid,
            createdAt: now,
            updatedAt: now,
          };
          transaction.set(feedbackRef, { ...content, rawJson });
          transaction.set(codeRef, { classId, publicationId: publicationRef.id });
        });
        return { id: publicationRef.id, accessCode };
      } catch (err) {
        if (err instanceof CodeCollisionError) continue;
        throw new Error(describeError(err));
      }
    }

    throw new Error('No pudimos generar un cÃ³digo Ãºnico. IntÃ©ntalo de nuevo.');
  }

  async listPublications(classId: string): Promise<PublicationSummary[]> {
    const firestore = this.requireFirestore();
    try {
      const snapshot = await getDocs(
        query(
          collection(firestore, 'classes', classId, 'publications'),
          orderBy('createdAt', 'desc'),
        ),
      );
      return snapshot.docs.map((item) => mapSummary(item.id, item.data()));
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async listStudentPublications(classId: string): Promise<PublicationSummary[]> {
    const firestore = this.requireFirestore();
    try {
      const snapshot = await getDocs(
        query(
          collection(firestore, 'classes', classId, 'publications'),
          where('rawJsonSafe', '==', true),
        ),
      );
      return snapshot.docs
        .map((item) => mapSummary(item.id, item.data()))
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async getPublication(classId: string, publicationId: string): Promise<PublicationRecord | null> {
    const firestore = this.requireFirestore();
    try {
      const snapshot = await getDoc(
        doc(firestore, 'classes', classId, 'publications', publicationId),
      );
      return snapshot.exists() ? mapRecord(snapshot.id, snapshot.data()) : null;
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async getPublicationForEdit(
    classId: string,
    publicationId: string,
  ): Promise<{ publication: PublicationRecord; questions: EvaluationQuestion[] } | null> {
    const firestore = this.requireFirestore();
    try {
      const publication = await this.getPublication(classId, publicationId);
      if (!publication) return null;

      const snapshot = await getDoc(
        doc(firestore, 'classes', classId, 'publications', publicationId, 'content', 'feedback'),
      );
      if (!snapshot.exists()) {
        throw new Error('El contenido original de la publicación no está disponible.');
      }

      return {
        publication,
        questions: parseRawQuestions(asString(snapshot.data()['rawJson'])),
      };
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async getStudentContent(
    classId: string,
    publicationId: string,
  ): Promise<StudentPublicationContent> {
    const firestore = this.requireFirestore();
    try {
      const snapshot = await getDoc(
        doc(firestore, 'classes', classId, 'publications', publicationId),
      );
      if (!snapshot.exists()) throw new Error('La publicaciÃ³n no estÃ¡ disponible.');

      const data = snapshot.data();
      if (data['rawJsonSafe'] !== true) {
        throw new Error('La publicaciÃ³n no estÃ¡ disponible para responder.');
      }

      return {
        classId,
        publicationId,
        title: asString(data['title'], 'EvaluaciÃ³n'),
        maxAttempts: asNumber(data['maxAttempts'], 1),
        durationMinutes: readDurationMinutes(data['durationMinutes']),
        openAt: asTimestamp(data['openAt']),
        closeAt: asTimestamp(data['closeAt']),
        guestAccess: data['guestAccess'] === true,
        guestCapacity: asNumber(data['guestCapacity']),
        guestCount: asNumber(data['guestCount']),
        questions: parseStudentRawQuestions(asString(data['rawJson'])),
      };
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async getFeedbackQuestions(
    classId: string,
    publicationId: string,
  ): Promise<EvaluationQuestion[]> {
    const firestore = this.requireFirestore();
    try {
      const snapshot = await getDoc(
        doc(firestore, 'classes', classId, 'publications', publicationId, 'content', 'feedback'),
      );
      if (!snapshot.exists()) throw new Error('La retroalimentaciÃ³n no estÃ¡ disponible.');
      return parseRawQuestions(asString(snapshot.data()['rawJson']));
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async resolveByCode(code: string): Promise<{ classId: string; publicationId: string }> {
    const firestore = this.requireFirestore();
    const normalized = normalizeAccessCode(code);
    if (normalized.length !== CODE_LENGTH) {
      throw new Error(`El cÃ³digo debe tener ${CODE_LENGTH} caracteres.`);
    }

    try {
      const snapshot = await getDoc(doc(firestore, 'publicationCodes', normalized));
      if (!snapshot.exists()) {
        throw new Error('No encontramos una publicaciÃ³n con ese cÃ³digo.');
      }
      const data = snapshot.data();
      const classId = asString(data['classId']);
      const publicationId = asString(data['publicationId']);
      if (!classId || !publicationId) {
        throw new Error('El cÃ³digo de publicaciÃ³n no es vÃ¡lido.');
      }
      return { classId, publicationId };
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async hasAttempts(classId: string, publicationId: string): Promise<boolean> {
    const firestore = this.requireFirestore();
    try {
      const publication = await getDoc(
        doc(firestore, 'classes', classId, 'publications', publicationId),
      );
      if (publication.exists() && asNumber(publication.data()['attemptCount']) > 0) return true;

      const results = await getDocs(
        query(
          collection(firestore, 'classes', classId, 'publications', publicationId, 'results'),
          limit(1),
        ),
      );
      return !results.empty;
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async updatePublication(
    classId: string,
    publicationId: string,
    input: UpdatePublicationInput,
  ): Promise<string> {
    const firestore = this.requireFirestore();
    const title = input.title.trim();
    if (title.length < 1 || title.length > MAX_TITLE) {
      throw new Error(`El tÃ­tulo debe tener entre 1 y ${MAX_TITLE} caracteres.`);
    }

    if (await this.hasAttempts(classId, publicationId)) {
      throw new Error('No puedes editar una publicación que ya tiene intentos.');
    }

    const durationMinutes = normalizeDuration(input.durationMinutes);
    const guestPolicy = normalizeGuestPolicy(input.guestAccess, input.guestCapacity);
    const rawJson = questionsToRawJson(input.questions);
    let publicRawJson: string;
    try {
      publicRawJson = studentQuestionsToRawJson(parseRawQuestions(rawJson));
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : 'Las preguntas de la publicaciÃ³n no son vÃ¡lidas.',
      );
    }

    const publicationRef = doc(firestore, 'classes', classId, 'publications', publicationId);
    const feedbackRef = doc(
      firestore,
      'classes',
      classId,
      'publications',
      publicationId,
      'content',
      'feedback',
    );

    try {
      await runTransaction(firestore, async (transaction) => {
        const current = await transaction.get(publicationRef);
        if (!current.exists()) throw new Error('No encontramos la publicaciÃ³n.');
        if (asNumber(current.data()['attemptCount']) > 0) {
          throw new Error('No puedes editar una publicación que ya tiene intentos.');
        }

        const now = serverTimestamp();
        const maxAttempts = asNumber(current.data()['maxAttempts'], 1);
        const openAt = asTimestamp(current.data()['openAt']);
        const closeAt = asTimestamp(current.data()['closeAt']);

        transaction.update(publicationRef, {
          title,
          rawJson: publicRawJson,
          rawJsonSafe: true,
          durationMinutes,
          guestAccess: guestPolicy.guestAccess,
          guestCapacity: guestPolicy.guestCapacity,
          updatedAt: now,
        });

        const feedbackSnapshot = await transaction.get(feedbackRef);
        if (feedbackSnapshot.exists()) {
          transaction.update(feedbackRef, {
            title,
            rawJson,
            durationMinutes,
            updatedAt: now,
          });
        } else {
          transaction.set(feedbackRef, {
            classId,
            publicationId,
            title,
            maxAttempts,
            durationMinutes,
            openAt,
            closeAt,
            rawJson,
            createdBy: current.data()['createdBy'],
            createdAt: now,
            updatedAt: now,
          });
        }
      });
      return publicRawJson;
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  private requireFirestore() {
    if (!this.firestore) throw new Error('Firebase aÃºn no estÃ¡ configurado.');
    return this.firestore;
  }
}
