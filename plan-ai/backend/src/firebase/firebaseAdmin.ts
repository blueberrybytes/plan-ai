import admin from "firebase-admin";
import { getFirebaseAccountKey } from "../firebaseAccount";
import { Role } from "@prisma/client";

admin.initializeApp({
  credential: admin.credential.cert(getFirebaseAccountKey()),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

export const firebaseAdmin = admin;

export async function createFirebaseUser(params: CreateFirebaseUserParams): Promise<string> {
  try {
    const { email, password, displayName } = params;

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || `${email.split("@")[0]}`,
    });

    console.log(`Successfully created Firebase user with email: ${email}`);
    return userRecord.uid;
  } catch (error: unknown) {
    const firebaseError = error as FirebaseAuthError;
    console.error(
      `Error creating Firebase user with email ${params.email}:`,
      firebaseError.message,
    );
    throw error;
  }
}

interface CreateFirebaseUserParams {
  email: string;
  password: string;
  displayName?: string;
}

interface FirebaseAuthError extends Error {
  code?: string;
  message: string;
}

export async function setUserRole(uid: string, role: Role): Promise<void> {
  try {
    await admin.auth().setCustomUserClaims(uid, { role });
  } catch (error) {
    console.error("Error setting user role:", error);
    throw error;
  }
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  try {
    // Send password reset email
    await admin.auth().generatePasswordResetLink(email);
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw error;
  }
}

export async function deleteFirebaseUser(email: string): Promise<void> {
  try {
    // First, get the user by email
    const userRecord = await admin.auth().getUserByEmail(email);

    // Then delete the user
    await admin.auth().deleteUser(userRecord.uid);

    console.log(`Successfully deleted user with email: ${email}`);
  } catch (error: unknown) {
    const firebaseError = error as FirebaseAuthError;
    if (firebaseError.code === "auth/user-not-found") {
      console.log(`User with email ${email} not found in Firebase Auth`);
      return; // Don't throw error if user doesn't exist in Firebase
    }
    console.error(`Error deleting Firebase user with email ${email}:`, firebaseError.message);
    throw error;
  }
}
