import { Router, Request, Response } from "express"; // <-- Añadido Request y Response aquí
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  streamText,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { z } from "zod";
import { getConfiguredModel, getFallbackProviderOptions } from "../utils/aiModelUtils";

const router = Router();

router.post("/api/chat/stream", async (req: Request, res: Response) => {
  // Vercel pipeUIMessageStreamToResponse ya maneja las cabeceras SSE (Server-Sent Events)
  pipeUIMessageStreamToResponse({
    response: res,
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: "start" });

        // 1. ARRANCAMOS EL HEARTBEAT / PROGRESS ANIMATION
        // Mandamos un chunk de estado (Thinking steps) cada 3.5 segundos
        const thikingSteps = [
          "🧠 Analizando el contexto...",
          "🔍 Consultando herramientas...",
          "📚 Validando la base de datos...",
          "⚙️ Evaluando rutas alternativas...",
          "✨ Preparando la respuesta...",
        ];
        writer.write({ type: "data-custom", data: { status: "Pensando..." } });
        let stepIdx = 0;

        const heartbeat = setInterval(() => {
          const statusText =
            stepIdx < thikingSteps.length
              ? thikingSteps[stepIdx++]
              : "⏳ Procesando datos complejos...";

          writer.write({
            type: "data-custom",
            data: { status: statusText },
          });
        }, 3500);

        try {
          const result = streamText({
            model: getConfiguredModel(),
            providerOptions: getFallbackProviderOptions(),
            maxRetries: 5,
            stopWhen: stepCountIs(5),
            messages: req.body.messages
              ? await convertToModelMessages(req.body.messages)
              : [{ role: "user", content: "Dime hola." }],
            tools: {
              sumar: {
                title: "sumar",
                description:
                  "Suma dos números. Usar esta herramienta SOLO cuando el usuario pida sumar dos números.",
                inputSchema: z.object({
                  a: z.number().describe("El primer número"),
                  b: z.number().describe("El segundo número"),
                }),
                execute: async ({ a, b }) => {
                  console.log(`[Tool: sumar] Ejecutando suma de ${a} y ${b}`);
                  return { result: a + b };
                },
                outputSchema: z.object({
                  result: z.number().describe("El resultado de la suma"),
                }),
              },
            },
            onError: (error) => {
              console.error("Error en streamText:", error);
              writer.write({ type: "error", errorText: "Fallo en RAG" });
            },
          });

          // 3. Empieza el stream real del LLM
          await writer.merge(result.toUIMessageStream({ sendStart: false }));
        } catch (error) {
          console.error("Error crítico:", error);
          // 4. CORRECCIÓN AQUÍ: Cambiamos 'error' por 'errorText'
          writer.write({ type: "error", errorText: "Fallo en RAG" });
        } finally {
          // 5. CRÍTICO: Limpiamos el marcapasos cuando el LLM termina
          // Si no, destruyes la RAM de tu servidor con el setInterval
          console.log("Limpiando heartbeat");
          clearInterval(heartbeat);
        }
      },
    }),
  });
});

export default router;
