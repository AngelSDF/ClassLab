import { FirebaseOptions } from 'firebase/app';

export const environment: {
  production: boolean;
  firebase: FirebaseOptions | null;
  apiBaseUrl: string;
} = {
  production: false,
  firebase: {
    apiKey: 'TU_API_KEY',
    authDomain: 'tu-proyecto.firebaseapp.com',
    projectId: 'tu-proyecto',
    messagingSenderId: 'TU_SENDER_ID',
    appId: 'TU_APP_ID',
  },
  apiBaseUrl: 'http://localhost:8000',
};
