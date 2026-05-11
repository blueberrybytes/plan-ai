/* eslint-disable @typescript-eslint/no-explicit-any */
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import * as xlsx from "xlsx";
import officeparser from "officeparser";
import WordExtractor from "word-extractor";

export type SupportedUploadMimeType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "application/vnd.ms-excel"
  | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  | "application/vnd.ms-powerpoint"
  | "application/msword";

const SUPPORTED_MIME_TYPES: SupportedUploadMimeType[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/msword",
];

export const UPLOAD_CONTENT_TYPE_LABEL: Record<SupportedUploadMimeType, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/msword": "DOC",
};

export function isSupportedUploadMimeType(mimeType: string): mimeType is SupportedUploadMimeType {
  return SUPPORTED_MIME_TYPES.includes(mimeType as SupportedUploadMimeType);
}

const ADDITIONAL_CONTEXT_MIME_TYPES = new Set<string>(["application/json"]);

export function isSupportedContextFileMimeType(mimeType: string): boolean {
  if (isSupportedUploadMimeType(mimeType)) {
    return true;
  }

  if (mimeType.startsWith("text/")) {
    return true;
  }

  return ADDITIONAL_CONTEXT_MIME_TYPES.has(mimeType);
}

export const CONTEXT_SUPPORTED_FILE_LABELS = [
  "PDF",
  "DOC",
  "DOCX",
  "TXT",
  "CSV",
  "JSON",
  "XLSX",
  "PPTX",
  "PPT",
];

function extractTextFromExcel(buffer: Buffer): string {
  const workbook = xlsx.read(buffer, { type: "buffer", cellFormula: true });
  let extractedText = "";

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    extractedText += `\n--- Sheet: ${sheetName} ---\n`;

    const range = xlsx.utils.decode_range(sheet["!ref"] || "A1:A1");
    for (let row = range.s.r; row <= range.e.r; row++) {
      const rowData: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = xlsx.utils.encode_cell({ r: row, c: col });
        const cell = sheet[cellAddress];

        if (cell && cell.v !== undefined) {
          const value = cell.w || cell.v;
          const formula = cell.f ? ` (Formula: =${cell.f})` : "";
          rowData.push(`${cellAddress} = ${value}${formula}`);
        }
      }
      if (rowData.length > 0) {
        extractedText += rowData.join(" | ") + "\n";
      }
    }
  }

  return extractedText.trim();
}

export async function extractTextFromUpload(file: Express.Multer.File): Promise<string> {
  if (isSupportedContextFileMimeType(file.mimetype)) {
    if (
      file.mimetype.startsWith("text/") ||
      file.mimetype === "application/json" ||
      file.mimetype === "application/xml"
    ) {
      return file.buffer.toString("utf-8").trim();
    }
  }

  if (!isSupportedUploadMimeType(file.mimetype)) {
    throw new Error(`Unsupported file type: ${file.mimetype}`);
  }

  if (file.mimetype === "application/pdf") {
    const parsed = await pdfParse(file.buffer);
    return parsed.text.trim();
  }

  if (
    file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimetype === "application/vnd.ms-excel"
  ) {
    return extractTextFromExcel(file.buffer);
  }

  if (
    file.mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.mimetype === "application/vnd.ms-powerpoint"
  ) {
    try {
      const parsedText = await officeparser.parseOffice(file.buffer);
      return parsedText?.toText() || "";
    } catch (e: any) {
      console.error("Failed to parse PPTX using officeparser", e);
      throw new Error(`Failed to parse presentation document: ${e.message}`);
    }
  }

  if (file.mimetype === "application/msword") {
    try {
      const extractor = new WordExtractor();
      const extracted = await extractor.extract(file.buffer);
      return extracted.getBody().trim();
    } catch (e: any) {
      console.error("Failed to parse legacy DOC using word-extractor", e);
      throw new Error(`Failed to parse legacy Word document: ${e.message}`);
    }
  }

  const result = await mammoth.extractRawText({ buffer: file.buffer });
  return result.value.trim();
}
