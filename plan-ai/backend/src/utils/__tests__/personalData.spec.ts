import { describe, expect, it } from "vitest";
import { detectPersonalData, maskPersonalData } from "../personalData";

const found = (text: string) =>
  detectPersonalData(text).map((s) => `${s.type}:${text.slice(s.start, s.end)}`);

describe("detectPersonalData", () => {
  it("finds email addresses and leaves the full stop of the sentence out", () => {
    expect(found("Escríbeme a marta.lopez+ventas@empresa-x.com. Gracias.")).toEqual([
      "EMAIL:marta.lopez+ventas@empresa-x.com",
    ]);
  });

  it("finds phone numbers with and without country prefix", () => {
    expect(found("Mi móvil es el 612 345 678 y el fijo 93 hmm 934567890.")).toEqual([
      "PHONE:612 345 678",
      "PHONE:934567890",
    ]);
    expect(found("Call me on +971 50 123 4567 or 0034 612-34-56-78")).toEqual([
      "PHONE:+971 50 123 4567",
      "PHONE:0034 612-34-56-78",
    ]);
    expect(found("My number is 050 123 4567")).toEqual(["PHONE:050 123 4567"]);
  });

  it("does not take amounts, years or dates for phone numbers", () => {
    expect(found("Facturamos 650.000 euros en 2025, unos 12 345 678 en total.")).toEqual([]);
    expect(found("El presupuesto es de 900 000 000 000 de dólares.")).toEqual([]);
    expect(found("Reunión el 12/10/2026 a las 10:30, sala 4.")).toEqual([]);
    expect(found("Pedido 20260612345 recibido.")).toEqual([]);
  });

  it("finds an IBAN only when its check digits are right", () => {
    expect(found("Transferencia a ES91 2100 0418 4502 0005 1332, por favor")).toEqual([
      "IBAN:ES91 2100 0418 4502 0005 1332",
    ]);
    expect(found("iban GB82WEST12345698765432")).toEqual(["IBAN:GB82WEST12345698765432"]);
    expect(found("Código ES91 2100 0418 4502 0005 1333")).toEqual([]);
  });

  it("finds a card number only when it passes the Luhn check", () => {
    expect(found("La tarjeta es 4111 1111 1111 1111, caduca en mayo")).toEqual([
      "CARD:4111 1111 1111 1111",
    ]);
    expect(found("Referencia 4111 1111 1111 1112")).toEqual([]);
  });

  it("finds Spanish DNI and NIE with a valid letter, and Emirates ID", () => {
    expect(found("Mi DNI es 12345678Z y el NIE X1234567L.")).toEqual([
      "NATIONAL_ID:12345678Z",
      "NATIONAL_ID:X1234567L",
    ]);
    expect(found("DNI 12345678A")).toEqual([]);
    expect(found("Emirates ID 784-1990-1234567-1")).toEqual(["NATIONAL_ID:784-1990-1234567-1"]);
  });

  it("returns the spans in order and without overlaps", () => {
    const text = "IBAN ES91 2100 0418 4502 0005 1332, tel 612345678, mail a@b.es";
    const spans = detectPersonalData(text);
    expect(spans.map((s) => s.type)).toEqual(["IBAN", "PHONE", "EMAIL"]);
    for (let i = 1; i < spans.length; i++)
      expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
  });

  it("finds nothing in ordinary meeting talk", () => {
    expect(
      found(
        "Vale, pues lo dejamos para el jueves 15 y que Marta mande el contrato. Quedan 3 tareas del sprint 42 y la versión 2.10.4.",
      ),
    ).toEqual([]);
    expect(found("")).toEqual([]);
  });
});

describe("maskPersonalData", () => {
  it("replaces each piece with a label and keeps the rest", () => {
    expect(maskPersonalData("Llama al 612 345 678 o escribe a ana@x.com, DNI 12345678Z.")).toBe(
      "Llama al [phone] o escribe a [email], DNI [id number].",
    );
  });

  it("returns the same text when there is nothing to hide", () => {
    const text = "Nada que ocultar aquí.";
    expect(maskPersonalData(text)).toBe(text);
  });
});
