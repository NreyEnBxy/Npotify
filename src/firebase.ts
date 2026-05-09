import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Create another Firebase app instance (secondary app)
// You can use a different config object here if you have a separate backend
export const secondaryApp = initializeApp(firebaseConfig, 'secondaryApp');

export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const secondaryAuth = getAuth(secondaryApp);
export const secondaryDb = getFirestore(secondaryApp, firebaseConfig.firestoreDatabaseId);
