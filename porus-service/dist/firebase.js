"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLLECTION_NAME = void 0;
exports.getDb = getDb;
const admin = __importStar(require("firebase-admin"));
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
let firestoreInstance = null;
function getDb() {
    if (!firestoreInstance) {
        try {
            if (admin.apps.length === 0) {
                // Try to use service account key from environment variable first
                if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
                    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
                    admin.initializeApp({
                        credential: admin.credential.cert(serviceAccount),
                        projectId: firebaseConfig.projectId,
                    });
                }
                else {
                    // Fallback to application default credentials
                    admin.initializeApp({
                        credential: admin.credential.applicationDefault(),
                        projectId: firebaseConfig.projectId,
                    });
                }
            }
            firestoreInstance = admin.firestore();
        }
        catch (error) {
            console.warn("Firebase initialization failed, using mock database:", error.message);
            // Return a mock Firestore instance for development
            firestoreInstance = createMockFirestore();
        }
    }
    return firestoreInstance;
}
// Mock Firestore implementation for development
function createMockFirestore() {
    const mockData = {};
    return {
        collection: (name) => ({
            doc: (id) => ({
                get: async () => ({
                    exists: !!mockData[id],
                    data: () => mockData[id],
                }),
                set: async (data) => {
                    mockData[id] = data;
                    return Promise.resolve();
                },
                delete: async () => {
                    delete mockData[id];
                    return Promise.resolve();
                },
            }),
            get: async () => ({
                forEach: (callback) => {
                    Object.entries(mockData).forEach(([id, data]) => {
                        callback({
                            id,
                            data: () => data,
                        });
                    });
                },
            }),
        }),
    };
}
exports.COLLECTION_NAME = process.env.FIREBASE_COLLECTION || "protected-websites";
