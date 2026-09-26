import { firebaseAdmin } from "./firebaseAdmin";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET;
const CONTEXT_PREFIX = "contexts";
const CHAT_ATTACHMENT_PREFIX = "chat-attachments";

function getBucket() {
  return firebaseAdmin.storage().bucket(BUCKET);
}

function validateOwnership(filePath: string, userId: string | undefined, ownerIndex: number) {
  if (!userId) {
    return;
  }
  const segments = filePath.split("/");
  if (segments.length <= ownerIndex) {
    return;
  }
  const fileUserId = segments[ownerIndex];
  if (fileUserId !== userId) {
    throw new Error("User does not have permission to delete this resource");
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadContextFileToFirebaseStorage(
  fileBuffer: Buffer,
  userId: string,
  contextId: string,
  originalFileName: string,
  contentType: string,
): Promise<{ storagePath: string }> {
  try {
    const bucket = getBucket();
    const sanitizedFileName = sanitizeFileName(originalFileName || "file");
    const storagePath = `${CONTEXT_PREFIX}/${userId}/${contextId}/${uuidv4()}-${sanitizedFileName}`;
    const file = bucket.file(storagePath);

    // Repomix output (.xml historically, .md now) should render inline in the
    // browser, not download — some browsers download unknown/markdown subtypes.
    // Force text/plain so previews always work.
    const finalContentType =
      originalFileName.endsWith(".xml") || originalFileName.endsWith(".md")
        ? "text/plain"
        : contentType;

    await file.save(fileBuffer, {
      metadata: {
        contentType: finalContentType,
        cacheControl: "private, max-age=0",
      },
    });

    // Private: the app opens it through a signed URL (see privateStorage.ts).
    logger.info(`Context file uploaded to ${storagePath}`);
    return { storagePath };
  } catch (error) {
    logger.error("Error uploading context file to Firebase Storage:", error);
    throw new Error("Failed to upload context file to Firebase Storage");
  }
}

export async function uploadChatAttachmentToFirebaseStorage(
  fileBuffer: Buffer,
  userId: string,
  threadId: string,
  originalFileName: string,
  contentType: string,
): Promise<{ storagePath: string }> {
  try {
    const bucket = getBucket();
    const sanitizedFileName = sanitizeFileName(originalFileName || "file");
    const storagePath = `${CHAT_ATTACHMENT_PREFIX}/${userId}/${threadId}/${uuidv4()}-${sanitizedFileName}`;
    const file = bucket.file(storagePath);
    await file.save(fileBuffer, {
      metadata: {
        contentType,
        cacheControl: "private, max-age=3600",
      },
    });
    // Private: see chatAttachments.ts for how it's shown and sent to the model.
    logger.info(`Chat attachment uploaded to ${storagePath}`);
    return { storagePath };
  } catch (error) {
    logger.error("Error uploading chat attachment to Firebase Storage:", error);
    throw new Error("Failed to upload chat attachment to Firebase Storage");
  }
}

export async function deleteContextFileFromFirebaseStorage(
  storagePath: string,
  userId?: string,
): Promise<void> {
  try {
    const bucket = getBucket();
    validateOwnership(storagePath, userId, 1);
    await bucket.file(storagePath).delete();
    logger.info(`Context file deleted successfully: ${storagePath}`);
  } catch (error) {
    logger.error("Error deleting context file from Firebase Storage:", error);
    throw new Error("Failed to delete context file from Firebase Storage");
  }
}

export async function getContextFileContentFromFirebaseStorage(
  storagePath: string,
  userId?: string,
): Promise<Buffer> {
  try {
    const bucket = getBucket();
    validateOwnership(storagePath, userId, 1);
    const [fileBuffer] = await bucket.file(storagePath).download();
    return fileBuffer;
  } catch (error) {
    logger.error("Error downloading context file from Firebase Storage:", error);
    throw new Error("Failed to download context file from Firebase Storage");
  }
}
