import { FieldValue, Timestamp } from 'firebase/firestore';

export type ClassModality = 'auto' | 'approval';

export type ClassMemberRole = 'student' | 'teacher';

export type ClassMemberStatus = 'active' | 'pending';

export type ClassStatus = 'active' | 'archived';

export interface ClassRecord {
  id: string;
  name: string;
  ownerTeacherId: string;
  capacity: number;
  unlimited: boolean;
  modality: ClassModality;
  accessCode: string;
  joinOpen: boolean;
  memberCount: number;
  status: ClassStatus;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface ClassMember {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  roleInClass: ClassMemberRole;
  isOwner: boolean;
  status: ClassMemberStatus;
  joinedAt: Timestamp | FieldValue;
}

export interface NewClassData {
  name: string;
  capacity: number;
  unlimited: boolean;
  modality: ClassModality;
}

export interface UpdateClassData {
  name: string;
  capacity: number;
  unlimited: boolean;
  modality: ClassModality;
}
