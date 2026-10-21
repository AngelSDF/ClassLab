import { Injectable, inject, signal } from '@angular/core';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { firebaseFirestore } from '../shared/firebase';
import { CODE_ATTEMPTS, CODE_LENGTH, generateAccessCode } from '../shared/access-code';
import { SessionService } from '../auth/session.service';
import {
  ClassMember,
  ClassMemberStatus,
  ClassRecord,
  NewClassData,
  UpdateClassData,
} from './class-record';

const MAX_CAPACITY = 500;

class CodeCollisionError extends Error {}

function describeError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'permission-denied') {
    return 'Las reglas de Firestore bloquearon la operación. Verifica que estén desplegadas.';
  }
  return err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
}

@Injectable({ providedIn: 'root' })
export class ClassesService {
  private readonly firestore = firebaseFirestore;
  private readonly session = inject(SessionService);

  readonly myClasses = signal<ClassRecord[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async createClass(data: NewClassData): Promise<ClassRecord> {
    const firestore = this.requireFirestore();
    const user = this.session.user();
    const profile = this.session.userRecord();
    if (!user || user.isAnonymous || !profile) {
      throw new Error('Debes iniciar sesión con Google para crear una clase.');
    }

    const name = data.name.trim();
    if (!name || name.length > 80) {
      throw new Error('El nombre de la clase debe tener entre 1 y 80 caracteres.');
    }
    const capacity = Math.trunc(Number(data.capacity));
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
      throw new Error(`Las vacantes deben estar entre 1 y ${MAX_CAPACITY}.`);
    }
    if (data.modality !== 'auto' && data.modality !== 'approval') {
      throw new Error('Modalidad de incorporación inválida.');
    }
    const unlimited = data.unlimited === true;

    const classRef = doc(collection(firestore, 'classes'));
    const memberRef = doc(firestore, 'classes', classRef.id, 'members', user.uid);

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const code = generateAccessCode();
      const codeRef = doc(firestore, 'classCodes', code);
      try {
        await runTransaction(firestore, async (transaction) => {
          const existing = await transaction.get(codeRef);
          if (existing.exists()) throw new CodeCollisionError();

          const now = serverTimestamp();
          transaction.set(classRef, {
            name,
            ownerTeacherId: user.uid,
            capacity,
            unlimited,
            modality: data.modality,
            accessCode: code,
            joinOpen: true,
            memberCount: 1,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          });
          transaction.set(codeRef, { classId: classRef.id });
          transaction.set(memberRef, {
            uid: user.uid,
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            roleInClass: 'teacher',
            isOwner: true,
            status: 'active',
            joinedAt: now,
          });
        });

        const created = await this.getClass(classRef.id);
        if (!created) throw new Error('No pudimos leer la clase creada.');
        return created;
      } catch (err) {
        if (err instanceof CodeCollisionError) continue;
        throw new Error(describeError(err));
      }
    }

    throw new Error('No pudimos generar un código único. Inténtalo de nuevo.');
  }

  async loadMyClasses(): Promise<void> {
    const firestore = this.requireFirestore();
    const user = this.session.user();
    this.error.set(null);

    if (!user || user.isAnonymous) {
      this.myClasses.set([]);
      return;
    }

    this.loading.set(true);
    try {
      const memberships = await getDocs(
        query(collectionGroup(firestore, 'members'), where('uid', '==', user.uid)),
      );

      const classIds = memberships.docs
        .filter((snapshot) => (snapshot.data() as ClassMember).status === 'active')
        .map((snapshot) => snapshot.ref.parent.parent?.id)
        .filter((id): id is string => Boolean(id));

      const classes = await Promise.all(classIds.map((id) => this.getClass(id)));
      const resolved = classes.filter((item): item is ClassRecord => item !== null);
      resolved.sort((a, b) => a.name.localeCompare(b.name));
      this.myClasses.set(resolved);
    } catch (err) {
      this.error.set(describeError(err));
      this.myClasses.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async getClass(classId: string): Promise<ClassRecord | null> {
    const firestore = this.requireFirestore();
    const snapshot = await getDoc(doc(firestore, 'classes', classId));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<ClassRecord, 'id'>) };
  }

  async listMembers(classId: string): Promise<ClassMember[]> {
    const firestore = this.requireFirestore();
    const snapshot = await getDocs(collection(firestore, 'classes', classId, 'members'));
    const members = snapshot.docs.map((item) => item.data() as ClassMember);
    members.sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
    return members;
  }

  async getMyMembership(classId: string): Promise<ClassMember | null> {
    const firestore = this.requireFirestore();
    const user = this.session.user();
    if (!user) return null;
    const snapshot = await getDoc(doc(firestore, 'classes', classId, 'members', user.uid));
    return snapshot.exists() ? (snapshot.data() as ClassMember) : null;
  }

  async resolveClassByCode(code: string): Promise<ClassRecord> {
    const firestore = this.requireFirestore();
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== CODE_LENGTH) {
      throw new Error(`El código debe tener ${CODE_LENGTH} caracteres.`);
    }
    const codeSnapshot = await getDoc(doc(firestore, 'classCodes', normalized));
    if (!codeSnapshot.exists()) {
      throw new Error('No encontramos una clase con ese código.');
    }
    const classId = (codeSnapshot.data() as { classId: string }).classId;
    const record = await this.getClass(classId);
    if (!record) throw new Error('La clase ya no existe.');
    return record;
  }

  async joinClass(code: string): Promise<{ classRecord: ClassRecord; status: ClassMemberStatus }> {
    const firestore = this.requireFirestore();
    const user = this.session.user();
    const profile = this.session.userRecord();
    if (!user || user.isAnonymous || !profile) {
      throw new Error('Debes iniciar sesión con Google para ingresar a una clase.');
    }

    const classRecord = await this.resolveClassByCode(code);
    const memberRef = doc(firestore, 'classes', classRecord.id, 'members', user.uid);

    const existing = await getDoc(memberRef);
    if (existing.exists()) {
      const member = existing.data() as ClassMember;
      if (member.status === 'active') {
        return { classRecord, status: 'active' };
      }
      throw new Error('Tu solicitud ya está pendiente de aprobación.');
    }

    const newMember = (status: ClassMemberStatus) => ({
      uid: user.uid,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      roleInClass: 'student' as const,
      isOwner: false,
      status,
      joinedAt: serverTimestamp(),
    });

    if (classRecord.modality === 'approval') {
      await setDoc(memberRef, newMember('pending'));
      return { classRecord, status: 'pending' };
    }

    const classRef = doc(firestore, 'classes', classRecord.id);
    await runTransaction(firestore, async (transaction) => {
      const current = await transaction.get(classRef);
      if (!current.exists()) throw new Error('La clase ya no existe.');
      const data = current.data() as Omit<ClassRecord, 'id'>;
      if (!data.joinOpen) throw new Error('Las incorporaciones están cerradas.');
      if (!data.unlimited && data.memberCount >= data.capacity) {
        throw new Error('La clase no tiene vacantes disponibles.');
      }
      const memberSnapshot = await transaction.get(memberRef);
      if (memberSnapshot.exists()) throw new Error('Ya haces parte de esta clase.');

      transaction.set(memberRef, newMember('active'));
      transaction.update(classRef, {
        memberCount: data.memberCount + 1,
        updatedAt: serverTimestamp(),
      });
    });

    return { classRecord, status: 'active' };
  }

  async acceptMember(classId: string, uid: string): Promise<void> {
    const firestore = this.requireFirestore();
    const classRef = doc(firestore, 'classes', classId);
    const memberRef = doc(firestore, 'classes', classId, 'members', uid);

    try {
      await runTransaction(firestore, async (transaction) => {
        const classSnapshot = await transaction.get(classRef);
        if (!classSnapshot.exists()) throw new Error('La clase ya no existe.');
        const data = classSnapshot.data() as Omit<ClassRecord, 'id'>;
        if (!data.unlimited && data.memberCount >= data.capacity) {
          throw new Error('No hay vacantes disponibles para aceptar esta solicitud.');
        }

        const memberSnapshot = await transaction.get(memberRef);
        if (!memberSnapshot.exists()) throw new Error('La solicitud ya no existe.');
        if ((memberSnapshot.data() as ClassMember).status !== 'pending') {
          throw new Error('La solicitud ya fue procesada.');
        }

        transaction.update(memberRef, { status: 'active' });
        transaction.update(classRef, {
          memberCount: data.memberCount + 1,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async rejectMember(classId: string, uid: string): Promise<void> {
    const firestore = this.requireFirestore();
    try {
      await deleteDoc(doc(firestore, 'classes', classId, 'members', uid));
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async leaveClass(classId: string): Promise<void> {
    const firestore = this.requireFirestore();
    const user = this.session.user();
    if (!user || user.isAnonymous) {
      throw new Error('Debes iniciar sesión para salir de una clase.');
    }

    const classRef = doc(firestore, 'classes', classId);
    const memberRef = doc(firestore, 'classes', classId, 'members', user.uid);

    try {
      const membership = await getDoc(memberRef);
      if (!membership.exists()) return;
      const member = membership.data() as ClassMember;
      if (member.isOwner) {
        throw new Error('El docente propietario no puede salir de su propia clase.');
      }

      if (member.status !== 'active') {
        await deleteDoc(memberRef);
        return;
      }

      await runTransaction(firestore, async (transaction) => {
        const classSnapshot = await transaction.get(classRef);
        const current = await transaction.get(memberRef);
        if (!current.exists()) return;

        transaction.delete(memberRef);
        if (classSnapshot.exists()) {
          const data = classSnapshot.data() as Omit<ClassRecord, 'id'>;
          transaction.update(classRef, {
            memberCount: Math.max(0, data.memberCount - 1),
            updatedAt: serverTimestamp(),
          });
        }
      });
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async updateClassSettings(classId: string, data: UpdateClassData): Promise<void> {
    const firestore = this.requireFirestore();
    const name = data.name.trim();
    if (!name || name.length > 80) {
      throw new Error('El nombre de la clase debe tener entre 1 y 80 caracteres.');
    }
    const capacity = Math.trunc(Number(data.capacity));
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
      throw new Error(`Las vacantes deben estar entre 1 y ${MAX_CAPACITY}.`);
    }
    if (data.modality !== 'auto' && data.modality !== 'approval') {
      throw new Error('Modalidad de incorporación inválida.');
    }

    const current = await this.getClass(classId);
    if (!current) throw new Error('La clase ya no existe.');

    try {
      await updateDoc(doc(firestore, 'classes', classId), {
        name,
        capacity,
        unlimited: data.unlimited === true,
        modality: data.modality,
        updatedAt: serverTimestamp(),
      });

      if (current.modality === 'approval' && data.modality === 'auto') {
        await this.rejectAllPending(classId);
      }
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async setJoinOpen(classId: string, joinOpen: boolean): Promise<void> {
    const firestore = this.requireFirestore();
    try {
      await updateDoc(doc(firestore, 'classes', classId), {
        joinOpen,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      throw new Error(describeError(err));
    }
  }

  async regenerateAccessCode(classId: string): Promise<string> {
    const firestore = this.requireFirestore();
    const current = await this.getClass(classId);
    if (!current) throw new Error('La clase ya no existe.');

    const classRef = doc(firestore, 'classes', classId);
    const oldCodeRef = doc(firestore, 'classCodes', current.accessCode);

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const code = generateAccessCode();
      const newCodeRef = doc(firestore, 'classCodes', code);
      try {
        await runTransaction(firestore, async (transaction) => {
          const existing = await transaction.get(newCodeRef);
          if (existing.exists()) throw new CodeCollisionError();

          transaction.update(classRef, { accessCode: code, updatedAt: serverTimestamp() });
          transaction.set(newCodeRef, { classId });
          transaction.delete(oldCodeRef);
        });
        return code;
      } catch (err) {
        if (err instanceof CodeCollisionError) continue;
        throw new Error(describeError(err));
      }
    }

    throw new Error('No pudimos generar un código único. Inténtalo de nuevo.');
  }

  private async rejectAllPending(classId: string): Promise<void> {
    const firestore = this.requireFirestore();
    const snapshot = await getDocs(
      query(collection(firestore, 'classes', classId, 'members'), where('status', '==', 'pending')),
    );
    await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
  }

  private requireFirestore() {
    if (!this.firestore) throw new Error('Firebase aún no está configurado.');
    return this.firestore;
  }
}
