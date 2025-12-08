import type { Express } from "express";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export type SupportedUploadMimeType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const SUPPORTED_MIME_TYPES: SupportedUploadMimeType[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const UPLOAD_CONTENT_TYPE_LABEL: Record<SupportedUploadMimeType, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

export function isSupportedUploadMimeType(mimeType: string): mimeType is SupportedUploadMimeType {
  return SUPPORTED_MIME_TYPES.includes(mimeType as SupportedUploadMimeType);
}

const ADDITIONAL_CONTEXT_MIME_TYPES = new Set<string>([
  "application/json",
  "application/vnd.ms-excel",
]);

export function isSupportedContextFileMimeType(mimeType: string): boolean {
  if (isSupportedUploadMimeType(mimeType)) {
    return true;
  }

  if (mimeType.startsWith("text/")) {
    return true;
  }

  return ADDITIONAL_CONTEXT_MIME_TYPES.has(mimeType);
}

export const CONTEXT_SUPPORTED_FILE_LABELS = ["PDF", "DOCX", "TXT", "CSV", "JSON"];

export async function extractTextFromUpload(file: Express.Multer.File): Promise<string> {
  if (!isSupportedUploadMimeType(file.mimetype)) {
    throw new Error(`Unsupported file type: ${file.mimetype}`);
  }

  if (file.mimetype === "application/pdf") {
    const parsed = await pdfParse(file.buffer);
    return parsed.text.trim();
  }

  const result = await mammoth.extractRawText({ buffer: file.buffer });
  return result.value.trim();
}
