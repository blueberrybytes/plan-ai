/**
 * Generates every artifact Berry sends a prospect, straight to disk.
 *
 * Purpose: the Telegram pipeline had never been executed end to end — unit
 * tests cover logic, not whether a `.docx` actually opens on a phone or whether
 * a mockup is legible at thumbnail size. This exercises the real builders
 * (`DocumentGenerator`, `buildSalesDeck`, `renderMockup`, `renderMermaidToPng`)
 * with no Telegram token, no database and no LLM key, so the output can be
 * checked before the bot ever goes live.
 *
 * The only thing it does NOT cover is the network hop to Telegram itself.
 *
 *   yarn preview:berry [outputDir]
 */
import fs from "fs";
import path from "path";
import { DocumentGenerator } from "../utils/documentGenerator";
import { buildSalesDeck, DEFAULT_DECK_THEME } from "../utils/salesDeck";
import { extractBullets, extractSummary } from "../utils/docOutline";
import {
  extractMermaidBlocks,
  renderMermaidToPng,
  stripMermaidBlocks,
} from "../utils/mermaidRender";
import { MOCKUP_PALETTES, renderMockup, type MockupSpec } from "../utils/mockupRender";

/** Stands in for a real generated proposal, including hostile characters. */
const SAMPLE_DOC = `# Propuesta — Comandas para restaurante

El restaurante pierde comandas entre sala y cocina, con errores frecuentes en
hora punta y sin trazabilidad de los tiempos de servicio ⚙️.

## Alcance propuesto

- App de sala para tomar la comanda desde el móvil
- Pantalla de cocina en tiempo real con avisos
- Informes de tiempos por servicio y por mesa
- Integración con el TPV existente

## Arquitectura

\`\`\`mermaid
graph TD
    A["Camarero (móvil)"] --> B["API de comandas"]
    B --> C["Pantalla de cocina"]
    B --> D["Informes de operación"]
    C --> E["Confirmación al camarero"]
\`\`\`

## Fases

1. Prototipo funcional — 2 semanas
2. Piloto en un local — 3 semanas
3. Despliegue — a definir según resultados
`;

const SAMPLE_SPEC: MockupSpec = {
  appName: "TapaGo 🍽️",
  screenTitle: "Comandas",
  primaryAction: "Nueva comanda",
  rows: [
    { label: "Mesa 4 · 2 entrantes", meta: "Pendiente · 3 min" },
    { label: "Mesa 7 · Menú del día", meta: "En cocina · 8 min" },
    { label: "Barra · Café y tostada", meta: "Servido · 12 min" },
    { label: "Terraza 2 · Paella x2", meta: "En cocina · 21 min" },
  ],
  stats: ["Abiertas", "En cocina", "Servidas"],
};

const write = (dir: string, name: string, data: Buffer): void => {
  fs.writeFileSync(path.join(dir, name), data);
  console.log(`  ✓ ${name.padEnd(28)} ${(data.length / 1024).toFixed(1)} KB`);
};

void (async () => {
  const outDir = process.argv[2] || path.join(process.cwd(), "berry-preview");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\nGenerando artefactos en ${outDir}\n`);
  const body = stripMermaidBlocks(SAMPLE_DOC);
  let failures = 0;

  // 1. Diagram — the piece that was silently shipping without any text.
  const [diagram] = extractMermaidBlocks(SAMPLE_DOC);
  let diagramPng: Buffer | null = null;
  if (diagram) {
    diagramPng = await renderMermaidToPng(diagram);
    if (diagramPng) write(outDir, "1-arquitectura.png", diagramPng);
    else {
      console.log("  ✗ diagrama: falló el renderizado (¿mermaid.ink caído?)");
      failures += 1;
    }
  }

  // 2. Mockups — note the sample spec carries U+FE0F on purpose.
  for (const palette of MOCKUP_PALETTES) {
    const png = await renderMockup(SAMPLE_SPEC, palette);
    if (png) write(outDir, `2-mockup-${palette.name.toLowerCase()}.png`, png);
    else {
      console.log(`  ✗ mockup ${palette.name}: falló el rasterizado`);
      failures += 1;
    }
  }

  // 3. Document.
  write(outDir, "3-propuesta.docx", await DocumentGenerator.generateDocx(body));

  // 4. Deck.
  write(
    outDir,
    "4-propuesta.pptx",
    await buildSalesDeck({
      title: "Comandas para restaurante",
      summary: extractSummary(body),
      scope: extractBullets(body),
      diagramPng,
      theme: DEFAULT_DECK_THEME,
    }),
  );

  console.log(
    `\n${failures ? `⚠️  ${failures} artefacto(s) fallaron` : "Todo generado."} ` +
      `Ábrelos y míralos en el móvil antes de dar el bot por bueno.\n`,
  );
  process.exit(failures ? 1 : 0);
})();
