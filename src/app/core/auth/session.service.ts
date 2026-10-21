import { computed, Injectable, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  User,
  getAdditionalUserInfo,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { firebaseAuth, firebaseFirestore } from '../shared/firebase';
import { Gender, RegistrationData, UserRecord, UserRole } from './user-record';

export type AccountState =
  'unconfigured' | 'loading' | 'signedOut' | 'anonymous' | 'needsOnboarding' | 'ready' | 'error';

export interface ProfilePrefill {
  firstName: string;
  lastName: string;
  email: string;
  photoURL: string | null;
}

const ACTIVE_ROLE_KEY = 'classlab.active-role';
const GUEST_NAME_KEY = 'classlab.guest-name';

const GENDERS: Gender[] = ['female', 'male', 'other', 'prefer_not_to_say'];
const MAX_AGE = 120;
const MAX_PHONE = 40;

function normalizeAge(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_AGE ? parsed : null;
}

function normalizeGender(value: Gender | null | undefined): Gender | null {
  return value && GENDERS.includes(value) ? value : null;
}

function normalizePhone(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed.slice(0, MAX_PHONE) : null;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly auth = firebaseAuth;
  private readonly firestore = firebaseFirestore;
  private unsubscribeUser?: () => void;
  private currentUserId?: string;
  private currentResolution?: Promise<void>;
  private resolveInitialAuth!: () => void;
  private readonly initialAuthResolved = new Promise<void>(
    (resolve) => (this.resolveInitialAuth = resolve),
  );

  /** Hint transitorio con given_name/family_name de Google */
  private googleNameHint: { firstName: string; lastName: string } | null = null;

  readonly user = signal<User | null>(null);
  readonly userRecord = signal<UserRecord | null>(null);
  readonly accountState = signal<AccountState>(this.auth ? 'loading' : 'unconfigured');
  readonly error = signal<string | null>(null);
  readonly activeRole = signal<UserRole>('student');

  /** Datos sugeridos para prellenar el onboarding */
  readonly profilePrefill = signal<ProfilePrefill | null>(null);

  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAnonymous = computed(() => this.user()?.isAnonymous ?? false);
  readonly isConfigured = computed(() => Boolean(this.auth && this.firestore));
  readonly availableRoles = computed(() => this.userRecord()?.roles ?? []);
  readonly displayName = computed(() => {
    const record = this.userRecord();
    if (record) {
      const full = `${record.firstName} ${record.lastName}`.trim();
      if (full) return full;
    }
    const u = this.user();
    if (u?.isAnonymous) return this.guestName() ?? 'Invitado';
    return u?.displayName ?? null;
  });

  constructor() {
    if (!this.auth) {
      this.resolveInitialAuth();
      return;
    }
    onAuthStateChanged(this.auth, async (user) => {
      try {
        await this.handleAuthChange(user);
      } catch {
        this.error.set('No pudimos resolver tu sesión.');
        this.accountState.set('error');
      } finally {
        this.resolveInitialAuth();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Acciones públicas
  // --------------------------------------------------------------------------

  async signInWithGoogle(): Promise<void> {
    if (!this.auth || !this.firestore) throw new Error('Firebase aún no está configurado.');
    this.error.set(null);

    const credential = await signInWithPopup(this.auth, new GoogleAuthProvider());
    const info = getAdditionalUserInfo(credential);
    const profile = (info?.profile ?? {}) as { given_name?: string; family_name?: string };

    this.googleNameHint = {
      firstName: (profile.given_name ?? '').trim(),
      lastName: (profile.family_name ?? '').trim(),
    };

    // Dedupe con la resolución que disparará onAuthStateChanged.
    await this.resolveUserRecord(credential.user);
  }

  async startGuestSession(name: string): Promise<void> {
    if (!this.auth) throw new Error('Firebase aún no está configurado.');
    this.error.set(null);

    const trimmed = name.trim();
    if (!trimmed) throw new Error('Ingresa tu nombre.');
    if (this.user() && !this.user()?.isAnonymous) {
      throw new Error('Ya hay una sesión iniciada. Cierra sesión para entrar como invitado.');
    }

    sessionStorage.setItem(GUEST_NAME_KEY, trimmed);

    // Una sesión anónima ya activa conserva su UID y sus intentos.
    if (this.user()?.isAnonymous) {
      await this.waitForAccountState();
      return;
    }

    try {
      const credential = await signInAnonymously(this.auth);
      if (this.accountState() !== 'anonymous') {
        this.user.set(credential.user);
        this.accountState.set('anonymous');
      }
      await this.waitForAccountState();
    } catch (err) {
      sessionStorage.removeItem(GUEST_NAME_KEY);
      throw err;
    }
  }

  describeAuthError(err: unknown): string {
    const code = (err as { code?: string } | null)?.code;
    switch (code) {
      case 'auth/operation-not-allowed':
        return 'El acceso como invitado no está habilitado. Activa el proveedor Anonymous en Firebase Authentication.';
      case 'auth/network-request-failed':
        return 'No pudimos conectar con Firebase. Revisa tu conexión e inténtalo otra vez.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos. Espera un momento e inténtalo otra vez.';
      case 'auth/api-key-not-valid':
        return 'La configuración pública de Firebase no es válida.';
      default:
        return err instanceof Error ? err.message : 'No fue posible iniciar la sesión de invitado.';
    }
  }

  async completeRegistration(data: RegistrationData): Promise<void> {
    const user = this.user();
    if (!user || user.isAnonymous || !this.firestore) {
      throw new Error('Debes iniciar sesión con Google para completar tu perfil.');
    }

    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) {
      throw new Error('Ingresa nombres y apellidos de hasta 80 caracteres.');
    }

    const now = serverTimestamp();
    const record = {
      firstName,
      lastName,
      email: user.email ?? '',
      photoURL: user.photoURL ?? null,
      phoneNumber: normalizePhone(data.phoneNumber) ?? user.phoneNumber ?? null,
      age: normalizeAge(data.age),
      gender: normalizeGender(data.gender),
      locale: data.locale ?? navigator.language ?? null,
      providerId: user.providerData[0]?.providerId ?? null,
      roles: ['student'] as UserRole[],
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    // merge:true evita pisar roles/createdAt si ya existía (condición de carrera con onSnapshot)
    await setDoc(doc(this.firestore, 'users', user.uid), record, { merge: true });
    // onSnapshot actualizará userRecord / accountState a 'ready'.
  }

  async updateProfile(patch: Partial<RegistrationData>): Promise<void> {
    const user = this.user();
    if (!user || user.isAnonymous || !this.firestore) {
      throw new Error('Debes iniciar sesión para actualizar tu perfil.');
    }
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.firstName !== undefined) updates['firstName'] = patch.firstName.trim();
    if (patch.lastName !== undefined) updates['lastName'] = patch.lastName.trim();
    if (patch.age !== undefined) updates['age'] = normalizeAge(patch.age);
    if (patch.gender !== undefined) updates['gender'] = normalizeGender(patch.gender);
    if (patch.phoneNumber !== undefined) updates['phoneNumber'] = normalizePhone(patch.phoneNumber);
    await updateDoc(doc(this.firestore, 'users', user.uid), updates);
  }

  async waitForAccountState(): Promise<AccountState> {
    await this.initialAuthResolved;
    await this.currentResolution;
    return this.accountState();
  }

  guestName(): string | null {
    return sessionStorage.getItem(GUEST_NAME_KEY);
  }

  setActiveRole(role: UserRole): void {
    if (!this.availableRoles().includes(role)) return;
    if (this.activeRole() === role) return;
    localStorage.setItem(ACTIVE_ROLE_KEY, role);
    this.activeRole.set(role);
  }
  /**
   * Cancela el onboarding. En este punto aún no se creó ningún documento del
   * usuario, por lo que cerrar sesión es suficiente para volver a 'signedOut'.
   */
  async cancelRegistration(): Promise<void> {
    await this.signOut();
  }

  async signOut(): Promise<void> {
    this.unsubscribeUser?.();
    this.unsubscribeUser = undefined;
    this.currentUserId = undefined;
    this.currentResolution = undefined;
    this.googleNameHint = null;

    if (this.auth) await signOut(this.auth);

    sessionStorage.removeItem(GUEST_NAME_KEY);
    localStorage.removeItem(ACTIVE_ROLE_KEY);
    this.user.set(null);
    this.userRecord.set(null);
    this.profilePrefill.set(null);
    this.activeRole.set('student');
    this.accountState.set('signedOut');
  }

  // --------------------------------------------------------------------------
  // Interno
  // --------------------------------------------------------------------------

  private async handleAuthChange(user: User | null): Promise<void> {
    this.user.set(user);

    // Si ya hay una resolución en curso para este mismo usuario (p. ej.
    // iniciada por signInWithGoogle), reutilizarla en vez de desuscribirla:
    // anularla dejaría la promesa original colgada y sin navegación.
    const inFlight =
      !!user && !user.isAnonymous && this.currentUserId === user.uid && !!this.currentResolution;

    if (!inFlight) {
      this.userRecord.set(null);
      this.profilePrefill.set(null);
      this.unsubscribeUser?.();
      this.unsubscribeUser = undefined;
      this.currentUserId = undefined;
      this.currentResolution = undefined;
    }

    if (!user) {
      this.accountState.set('signedOut');
      return;
    }
    if (user.isAnonymous) {
      this.accountState.set('anonymous');
      return;
    }
    await this.resolveUserRecord(user);

    // Sesión existente: registrar el último acceso. Fuera del callback de
    // onSnapshot para no re-disparar la resolución en bucle.
    if (this.currentUserId === user.uid && this.accountState() === 'ready') {
      await this.touchLastLogin(user.uid);
    }
  }

  private async touchLastLogin(uid: string): Promise<void> {
    if (!this.firestore) return;
    try {
      await updateDoc(doc(this.firestore, 'users', uid), { lastLoginAt: serverTimestamp() });
    } catch {
      // Un fallo aquí no debe bloquear el inicio de sesión.
    }
  }

  private resolveUserRecord(user: User): Promise<void> {
    if (!this.firestore) return Promise.resolve();
    if (this.currentUserId === user.uid && this.currentResolution) {
      return this.currentResolution;
    }

    this.accountState.set('loading');
    this.currentUserId = user.uid;

    this.currentResolution = new Promise<void>((resolve) => {
      this.unsubscribeUser = onSnapshot(
        doc(this.firestore!, 'users', user.uid),
        (snapshot) => {
          if (this.currentUserId !== user.uid) return;

          if (snapshot.exists()) {
            const record = snapshot.data() as UserRecord;
            this.userRecord.set(record);
            this.profilePrefill.set(null);
            this.accountState.set('ready');
            this.syncActiveRole(record);
          } else {
            this.userRecord.set(null);
            this.profilePrefill.set(this.buildPrefill(user));
            this.accountState.set('needsOnboarding');
          }
          resolve();
        },
        (err) => {
          if (this.currentUserId !== user.uid) return;
          this.error.set(this.describeFirestoreError(err));
          this.accountState.set('error');
          resolve();
        },
      );
    });

    return this.currentResolution;
  }

  private describeFirestoreError(err: unknown): string {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'permission-denied') {
      return 'No se pudo leer tu perfil: las reglas de Firestore lo bloquean. Verifica que estén desplegadas.';
    }
    return 'No pudimos consultar tu perfil. Revisa tu conexión e inténtalo otra vez.';
  }

  private buildPrefill(user: User): ProfilePrefill {
    const hint = this.googleNameHint;
    this.googleNameHint = null;

    const email = user.email ?? '';
    const photoURL = user.photoURL ?? null;

    if (hint && (hint.firstName || hint.lastName)) {
      return { firstName: hint.firstName, lastName: hint.lastName, email, photoURL };
    }

    // Fallback: partir displayName de Google ("Nombre Apellido1 Apellido2")
    const display = (user.displayName ?? '').trim();
    if (!display) return { firstName: '', lastName: '', email, photoURL };

    const [first, ...rest] = display.split(/\s+/);
    return { firstName: first ?? '', lastName: rest.join(' '), email, photoURL };
  }

  private syncActiveRole(userRecord: UserRecord): void {
    const savedRole = localStorage.getItem(ACTIVE_ROLE_KEY) as UserRole | null;
    this.activeRole.set(
      savedRole && userRecord.roles.includes(savedRole)
        ? savedRole
        : (userRecord.roles[0] ?? 'student'),
    );
  }
}
