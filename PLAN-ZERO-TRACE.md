# Plan Zero Trace

Origen: el análisis de las dos fotos del 6 de octubre de 2026. Lista lo que le falta a Plan AI para encajar con Zero Trace, más huecos de producto y de calidad del RAG.

Rama de trabajo: `feat/live-translation`.

Cada punto del análisis se comprueba en el código antes de tocar nada. Lo que no esté comprobado se marca como "sin comprobar".

## Estado

| Fase | Qué | Estado |
| --- | --- | --- |
| 0 | Aislamiento entre workspaces en Qdrant | Hecho el 6 de octubre, sin commit |
| 0b | Segunda capa: `workspaceId` en los puntos de Qdrant | Pendiente |
| 1 | Reuniones y proyectos confidenciales | Pendiente, hay decisiones abiertas |
| 2 | Retención de transcripciones, embeddings y chats | Pendiente, hay decisiones abiertas |
| 3 | Auditoría de lectura y exportación | Pendiente |
| 4 | Detección y marcado de datos personales | Pendiente |
| 5 | Modelo por función y por sensibilidad | Pendiente |
| 6 | Desplegar sin Google | Pendiente, es la más grande |
| 7 | Producto y calidad del RAG | Pendiente |

## Fase 0. Aislamiento en Qdrant (hecho)

Comprobado en el código: el fallo era real.

Todos los workspaces comparten la colección `context_files` y los puntos se filtran solo por `contextId`. `mergeProjectAndContextIds` traducía un `projectId` a su `contextId` sin mirar el workspace, y aceptaba tal cual los `contextIds` que mandara el cliente. Lo usaban la herramienta MCP `semantic_search`, la generación de documentos, los diagramas y las presentaciones. Con un token MCP de un workspace propio y el `projectId` de otro cliente se podían leer hasta 20 fragmentos por consulta. Además `queryContexts` usaba la clave de embeddings del workspace del primer `contextId`, así que la consulta se le cobraba al otro cliente.

Arreglo, en dos sitios:

1. En la entrada. `resolveProjectIdsToContextIds` y `mergeProjectAndContextIds` (`services/projectContextResolver.ts`) piden el workspace como parámetro obligatorio y filtran por él.
2. En la capa de vectores. `queryContexts`, `getFullContextPayloads` y `getRepomixContextPayloads` (`vector/contextFileVectorService.ts`) piden el workspace y descartan los `contextIds` que no son suyos antes de ir a Qdrant. Esto cubre también las listas de `contextIds` ya guardadas en chats, documentos, presentaciones y reuniones, que pudieron entrar sin validar. El embedding se hace con la clave del workspace que pregunta y se le apunta a él.

Se actualizaron las 23 llamadas. Tests nuevos en `vector/__tests__/vectorWorkspaceIsolation.spec.ts`, con el caso de las fotos reproducido contra el servidor MCP real.

Efecto visible: un chat o documento antiguo que tuviera guardado un `contextId` de otro workspace deja de recibir esos fragmentos. Queda un aviso en el log cada vez que se descarta uno.

## Fase 0b. Segunda capa en Qdrant

Hoy el aislamiento depende de la comprobación en base de datos. Para que Qdrant lo imponga por sí solo:

- Guardar `workspaceId` en el payload de cada punto nuevo.
- Script para rellenarlo en los puntos existentes (hay que ejecutarlo en producción).
- Añadir `workspaceId` al filtro de todas las búsquedas, una vez rellenado.
- Revisar las otras consultas de `Context` que no filtran por workspace: `githubContextWorker.ts`, `contextDocumentWorker.ts`, `gitnexusRouter.ts`, `mcpClientService.ts`, `githubIntegrationService.ts`. Sin comprobar. `audioStream.ts` sí está cubierto, porque los términos clave se leen filtrando por workspace.

Esfuerzo: 1 día.

## Fase 1. Reuniones y proyectos confidenciales

Hoy todo es visible para todo el workspace. No hay forma de tener una reunión de RRHH, de consejo o de una compra que solo vean algunos.

Propuesta: un campo de visibilidad en `Project` y en `Transcript` con dos valores, workspace o restringido, y una tabla de miembros con acceso. Una reunión hereda la visibilidad de su proyecto. La regla tiene que aplicarse en un solo sitio y cubrir listados, detalle, búsqueda, chat, RAG, MCP, parte de equipo y exportaciones.

Decisiones abiertas:

- ¿Los owners y admins ven siempre lo restringido, o tampoco?
- ¿La restricción es por proyecto, por reunión, o las dos?
- ¿Qué pasa con las tareas que salen de una reunión restringida?

Esfuerzo: 4 a 6 días. Es la de más riesgo, porque toca todas las lecturas.

## Fase 2. Retención de transcripciones, embeddings y chats

Hoy solo se borra el audio (`audioRetentionDays`). Falta lo mismo para el texto.

Propuesta: `transcriptRetentionDays` y `chatRetentionDays` por workspace, con el mismo trabajo diario que ya borra audio. Al borrar una transcripción se borran sus vectores, su chat y sus traducciones.

Decisiones abiertas: qué pasa con las tareas y documentos que salieron de una reunión borrada, y si un proyecto puede tener su propia regla.

Esfuerzo: 2 días.

## Fase 3. Auditoría de lectura y exportación

`AuditLog` solo registra acciones de administración. Falta registrar quién abre, exporta o descarga qué reunión, y quién la consulta por MCP o por el chat.

Propuesta: registrar lectura de detalle, descarga de audio, exportación, envío de notas y lecturas por MCP. Vista para owners con filtro por reunión y por persona. Con cuidado de no escribir una fila por cada refresco de pantalla.

Esfuerzo: 2 días.

## Fase 4. Datos personales en las transcripciones

No hay nada hoy. Propuesta en dos pasos: primero detectar y marcar (correos, teléfonos, documentos de identidad, cuentas bancarias, datos de salud) con reglas y un pase de modelo, y después una opción de ocultarlos en la vista y en las exportaciones. El texto original no se toca salvo que el workspace lo pida.

Esfuerzo: 3 a 4 días. Hay que medir la calidad con transcripciones reales en catalán, castellano e inglés antes de prometer nada.

## Fase 5. Modelo por función y por sensibilidad

`LLM_PROVIDER` es un interruptor global. Hace falta elegir por función (directo, tareas, resumen, chat) y por sensibilidad: modelo local para las reuniones restringidas y nube para lo demás. Depende de la fase 1.

Antes de decidir tamaños de modelo local hay que medir la calidad de la extracción de tareas con modelos pequeños. El punto 27 de `IMPROVEMENTS.md` ya lista fallos de calidad en los tickets.

Esfuerzo: 3 días más las mediciones.

## Fase 6. Desplegar sin Google

Firebase Auth, GCS y Firestore son obligatorios hoy. Para una instalación en la infraestructura del cliente hace falta una capa de abstracción para cada uno: autenticación (OIDC genérico), almacenamiento de ficheros (S3 compatible) y lo que hoy esté en Firestore.

Sin comprobar: qué se guarda exactamente en Firestore y cuántos sitios llaman a Firebase directamente. Es lo primero que hay que medir.

Esfuerzo: 2 a 3 semanas. No empezar hasta que haya un cliente que lo pida.

## Fase 7. Producto y calidad del RAG

Del propio `IMPROVEMENTS.md`, sin comprobar cuáles están a medias:

- Búsqueda semántica en todas las reuniones (puntos 2 y 12). Es lo primero que pide un cliente.
- Seguimiento de compromisos entre reuniones (11).
- Plantillas por tipo de reunión (13).
- Bot de Slack o Teams (14).
- Envío de notas por email a los participantes (10). Ya existe `POST /api/transcripts/{id}/send-notes`. Hay que ver qué le falta.

Calidad del RAG:

- Las citas apuntan a líneas del markdown reescrito, no al minuto de la reunión ni a la página.
- No hay reranking.
- La búsqueda para extraer tareas usa solo los primeros 500 caracteres de la transcripción.

## Orden recomendado

0b, después 2 y 3 (pequeñas y sin dependencias), después 1, y con la 1 hecha la 5. La 4 puede ir en paralelo. La 6 solo con un cliente detrás. La búsqueda en todas las reuniones de la fase 7 conviene hacerla después de la 1, para que nazca respetando la visibilidad.
