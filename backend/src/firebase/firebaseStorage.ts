import { firebaseAdmin } from "./firebaseAdmin";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET;
const CONTEXT_PREFIX = "contexts";

function getBucket() {
  return firebaseAdmin.storage().bucket(BUCKET);
}

function extractBase64Data(base64Image: string): string {
  if (base64Image.includes(";base64,")) {
    return base64Image.split(";base64,")[1];
  }
  if (base64Image.startsWith("data:")) {
    return base64Image.substring(base64Image.indexOf(",") + 1);
  }
  return base64Image;
}

function extractStoragePath(resourceUrl: string): string {
  const urlObj = new URL(resourceUrl);
  return urlObj.pathname.split("/").slice(2).join("/");
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
): Promise<{ storagePath: string; publicUrl: string }> {
  try {
    const bucket = getBucket();
    const sanitizedFileName = sanitizeFileName(originalFileName || "file");
    const storagePath = `${CONTEXT_PREFIX}/${userId}/${contextId}/${uuidv4()}-${sanitizedFileName}`;
    const file = bucket.file(storagePath);

    await file.save(fileBuffer, {
      metadata: {
        contentType,
        cacheControl: "private, max-age=0",
      },
    });

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    logger.info(`Context file uploaded successfully to ${publicUrl}`);
    return { storagePath, publicUrl };
  } catch (error) {
    logger.error("Error uploading context file to Firebase Storage:", error);
    throw new Error("Failed to upload context file to Firebase Storage");
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

export async function uploadImageToFirebaseStorage(
  base64Image: string,
  contentId: string,
  userId: string,
): Promise<string> {
  try {
    const bucket = getBucket();
    const imageBuffer = Buffer.from(extractBase64Data(base64Image), "base64");
    const filename = `content-images/${userId}/${contentId}/${uuidv4()}.png`;
    const file = bucket.file(filename);

    await file.save(imageBuffer, {
      metadata: {
        contentType: "image/png",
        cacheControl: "public, max-age=31536000",
      },
    });

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    logger.info(`Image uploaded successfully to ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    logger.error("Error uploading image to Firebase Storage:", error);
    throw new Error("Failed to upload image to Firebase Storage");
  }
}

export async function deleteImageFromFirebaseStorage(
  imageUrl: string,
  userId?: string,
): Promise<void> {
  try {
    const bucket = getBucket();
    const filePath = extractStoragePath(imageUrl);
    validateOwnership(filePath, userId, 1);
    await bucket.file(filePath).delete();
    logger.info(`Image deleted successfully: ${imageUrl}`);
  } catch (error) {
    logger.error("Error deleting image from Firebase Storage:", error);
    throw new Error("Failed to delete image from Firebase Storage");
  }
}

export async function uploadCompanyLogoToFirebaseStorage(
  base64Image: string,
  companyId: string,
  userId: string,
): Promise<string> {
  try {
    const bucket = getBucket();
    const imageBuffer = Buffer.from(extractBase64Data(base64Image), "base64");
    const filename = `company-logos/${userId}/${companyId}/${uuidv4()}.png`;
    const file = bucket.file(filename);

    await file.save(imageBuffer, {
      metadata: {
        contentType: "image/png",
        cacheControl: "public, max-age=31536000",
      },
    });

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    logger.info(`Company logo uploaded successfully to ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    logger.error("Error uploading company logo to Firebase Storage:", error);
    throw new Error("Failed to upload company logo to Firebase Storage");
  }
}

export async function deleteCompanyLogoFromFirebaseStorage(
  logoUrl: string,
  userId?: string,
): Promise<void> {
  try {
    const bucket = getBucket();
    const filePath = extractStoragePath(logoUrl);
    validateOwnership(filePath, userId, 1);
    await bucket.file(filePath).delete();
    logger.info(`Company logo deleted successfully: ${logoUrl}`);
  } catch (error) {
    logger.error("Error deleting company logo from Firebase Storage:", error);
    throw new Error("Failed to delete company logo from Firebase Storage");
  }
}

export async function uploadVideoToFirebaseStorage(
  videoBuffer: Buffer,
  userId: string,
  contentType: string = "video/mp4",
): Promise<string> {
  try {
    const bucket = getBucket();
    const fileExtension = contentType.split("/")[1] || "mp4";
    const filename = `shorts-videos/${userId}/${uuidv4()}.${fileExtension}`;
    const file = bucket.file(filename);

    await file.save(videoBuffer, {
      metadata: {
        contentType,
        cacheControl: "public, max-age=31536000",
      },
    });

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    logger.info(`Video uploaded successfully to ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    logger.error("Error uploading video to Firebase Storage:", error);
    throw new Error("Failed to upload video to Firebase Storage");
  }
}

export async function deleteVideoFromFirebaseStorage(
  videoUrl: string,
  userId?: string,
): Promise<void> {
  try {
    const bucket = getBucket();
    const filePath = extractStoragePath(videoUrl);
    validateOwnership(filePath, userId, 1);
    await bucket.file(filePath).delete();
    logger.info(`Video deleted successfully: ${videoUrl}`);
  } catch (error) {
    logger.error("Error deleting video from Firebase Storage:", error);
    throw new Error("Failed to delete video from Firebase Storage");
  }
}

export async function uploadAudioBufferToFirebaseStorage(
  audioBuffer: Buffer,
  userId: string,
  format: string = "mp3",
  contentType?: string,
): Promise<string> {
  try {
    const bucket = getBucket();
    const fileExtension = format || "mp3";
    const filename = `audio/${userId}/${uuidv4()}.${fileExtension}`;
    const file = bucket.file(filename);

    await file.save(audioBuffer, {
      metadata: {
        contentType: contentType ?? `audio/${fileExtension}`,
        cacheControl: "public, max-age=31536000",
      },
    });

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    logger.info(`Audio uploaded successfully to ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    logger.error("Error uploading audio to Firebase Storage:", error);
    throw new Error("Failed to upload audio to Firebase Storage");
  }
}

export function detectVideoFormat(buffer: Buffer): string {
  const header = buffer.subarray(0, 12).toString("hex");

  if (header.startsWith("000000")) {
    return "mp4";
  }
  if (header.includes("464c56")) {
    return "flv";
  }
  if (header.includes("415649")) {
    return "avi";
  }
  if (header.includes("1a45dfa3")) {
    return "webm";
  }

  return "mp4";
}
