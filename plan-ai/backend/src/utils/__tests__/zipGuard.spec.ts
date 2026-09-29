import { describe, expect, it } from "vitest";
import * as xlsx from "xlsx";
import { assertZipWithinLimits, ZipTooLargeError } from "../zipGuard";
import { extractTextFromBuffer } from "../documentTextExtractor";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A one-entry zip whose central directory claims `claimedSize` unpacked bytes. */
const zipClaiming = (claimedSize: number): Buffer => {
  const name = Buffer.from("xl/workbook.xml");
  const data = Buffer.from("tiny");

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(claimedSize, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(claimedSize, 24);
  central.writeUInt16LE(name.length, 28);

  const centralOffset = local.length + name.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, name, data, central, name, eocd]);
};

describe("assertZipWithinLimits", () => {
  it("refuses an archive that says it unpacks to 400 MB", () => {
    expect(() => assertZipWithinLimits(zipClaiming(400 * 1024 * 1024))).toThrow(ZipTooLargeError);
  });

  it("accepts a small archive", () => {
    expect(() => assertZipWithinLimits(zipClaiming(1024))).not.toThrow();
  });

  it("refuses something that is not a zip", () => {
    expect(() => assertZipWithinLimits(Buffer.from("not a zip at all"))).toThrow(ZipTooLargeError);
  });
});

describe("spreadsheet extraction", () => {
  it("reads a real XLSX with the upgraded parser", async () => {
    const sheet = xlsx.utils.aoa_to_sheet([
      ["Item", "Cost"],
      ["Servers", 1200],
    ]);
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, sheet, "Budget");
    const buffer = xlsx.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const text = await extractTextFromBuffer(buffer, XLSX_MIME);

    expect(text).toContain("Sheet: Budget");
    expect(text).toContain("Servers");
    expect(text).toContain("1200");
  });

  it("refuses a zip bomb before the parser sees it", async () => {
    await expect(extractTextFromBuffer(zipClaiming(400 * 1024 * 1024), XLSX_MIME)).rejects.toThrow(
      ZipTooLargeError,
    );
  });
});
