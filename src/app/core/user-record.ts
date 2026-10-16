import { FieldValue, Timestamp } from 'firebase/firestore';

export type UserRole = 'student' | 'teacher' | 'admin';

export type Gender = 'female' | 'male' | 'other' | 'prefer_not_to_say';

export interface RegistrationData {
  firstName: string;
  lastName: string;
  age?: number | null;
  gender?: Gender | null;
  phoneNumber?: string | null;
  locale?: string | null;
}

export interface UserRecord {
  firstName: string;
  lastName: string;
  email: string;
  photoURL: string | null;
  phoneNumber: string | null;
  age: number | null;
  gender: Gender | null;
  locale: string | null;
  providerId: string | null;
  roles: UserRole[];
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  lastLoginAt: Timestamp | FieldValue;
}