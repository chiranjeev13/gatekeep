import * as admin from "firebase-admin";

/**
 * Initializes Firebase Admin SDK using provided config.
 * Uses the user-provided client credentials.
 */
const firebaseConfig = {
  apiKey: "AIzaSyCm3ffEctAcR-Kz2mpEtMsE_rNSDRlwwQU",
  authDomain: "internship-6214d.firebaseapp.com",
  projectId: "internship-6214d",
  storageBucket: "internship-6214d.firebasestorage.app",
  messagingSenderId: "7597607861",
  appId: "1:7597607861:web:e46f41168aa883d49867fc",
  measurementId: "G-HLJ51Z9TCP",
};

let firestoreInstance: admin.firestore.Firestore | null = null;

export function getDb() {
  if (!firestoreInstance) {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: firebaseConfig.projectId,
      });
    }
    firestoreInstance = admin.firestore();
  }
  return firestoreInstance;
}

export const COLLECTION_NAME =
  process.env.FIREBASE_COLLECTION || "protected-websites";
