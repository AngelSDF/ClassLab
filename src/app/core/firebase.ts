import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';

const app = environment.firebase ? initializeApp(environment.firebase) : null;
export const firebaseAuth = app ? getAuth(app) : null;
export const firebaseFirestore = app ? getFirestore(app) : null;
