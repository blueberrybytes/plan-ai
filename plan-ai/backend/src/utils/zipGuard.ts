/**
 * DOCX, XLSX and PPTX files are zip archives that the parsers unpack in
 * memory. A few kilobytes can unpack to gigabytes (a "zip bomb") and take the
 * API down, since workers share its process. Before parsing, this reads the
 * archive's central directory and refuses files that declare too much data or
 * too many entries. It is a cheap check on what the file says about itself,
 * a first line of defence rather than a sandbox.
 */

export const MAX_UNZIPPED_BYTES = 300 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 20_000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const ZIP64_MARKER = 0xffffffff;

export class ZipTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipTooLargeError";
  }
}

/** Throws ZipTooLargeError when the archive would unpack beyond the limits. */
export function assertZipWithinLimits(buffer: Buffer): void {
  // The end-of-central-directory record is in the last 22 bytes plus an
  // optional comment of up to 64 KB.
  const searchStart = Math.max(0, buffer.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= searchStart; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipTooLargeError("The file is not a valid Office document.");

  const entries = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entries > MAX_ZIP_ENTRIES) throw new ZipTooLargeError("The document has too many parts.");

  let offset = directoryOffset;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_HEADER_SIGNATURE) {
      throw new ZipTooLargeError("The file is not a valid Office document.");
    }
    const uncompressed = buffer.readUInt32LE(offset + 24);
    // Zip64 sizes are not read here; no normal Office file needs them.
    if (uncompressed === ZIP64_MARKER) throw new ZipTooLargeError("The document is too large.");
    total += uncompressed;
    if (total > MAX_UNZIPPED_BYTES)
      throw new ZipTooLargeError("The document is too large to read.");
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    offset += 46 + nameLength + extraLength + commentLength;
  }
}
