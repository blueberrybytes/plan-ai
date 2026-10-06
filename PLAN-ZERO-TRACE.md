# Plan Zero Trace

Origen: el análisis de las dos fotos del 6 de octubre de 2026. Lista lo que le falta a Plan AI para encajar con Zero Trace, más huecos de producto y de calidad del RAG.

Rama de trabajo: `feat/live-translation`.

Cada punto del análisis se comprueba en el código antes de tocar nada. Lo que no esté comprobado se marca como "sin comprobar".

## Estado

| Fase | Qué | Estado |
| --- | --- | --- |
| 0 | Aislamiento entre workspaces en Qdrant | Hecho el 6 de octubre (`40f5cea`) |
| 0b | Segunda capa: `workspaceId` en los puntos de Qdrant | Hecho el 6 de octubre. Falta pulsar el relleno en producción, desde Admin |
| 1 | Reuniones y proyectos confidenciales | Hecho el 6 de octubre. Falta probarlo en la web con dos usuarios |
| 2 | Retención de transcripciones, embeddings y chats | Aparcada. Xavier, 6 de octubre: de momento no se borra nada |
| 3 | Auditoría de lectura y exportación | Hecho, con filtro por persona y por reunión en la web |
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

## Fase 0b. Segunda capa en Qdrant (hecho)

Cada punto nuevo de Qdrant guarda su `workspaceId`. Todas las lecturas rechazan un punto marcado con otro workspace, pidan los `contextIds` que pidan. Los puntos antiguos no llevan marca y siguen pasando hasta que se rellenen.

Comprobado contra el Qdrant local con una colección temporal: un punto marcado con otro workspace no vuelve, y uno antiguo sin marca sí.

Pendiente de hacer en producción, después de desplegar. Railway no da acceso a una consola, así que el relleno se lanza desde la web: **Admin, Maintenance** (`/admin/maintenance`), solo para administradores de la plataforma. La página enseña cuántos puntos faltan sin cambiar nada, y el botón **Run backfill** escribe la marca y crea el índice. Se puede pulsar con la plataforma en uso y más de una vez. Queda registrado en la auditoría.

En local sigue existiendo `yarn qdrant:backfill-workspace` (solo cuenta) y `--apply`.

Cuando esté hecho en producción, se puede quitar la rama `is_empty` del filtro en `contextVectorStore.ts`, y entonces Qdrant impone el aislamiento por sí solo.

Revisadas las otras consultas de `Context` que no filtran por workspace. Ninguna es un hueco: `gitnexusRouter.ts` sí filtra, todos los llamadores de `repoNameForContexts` pasan el workspace, el webhook de GitHub busca por repositorio a propósito, y los workers reciben el `contextId` de trabajos que encola el propio backend. `transcriptsController.ts` y `projectsModelController.ts` filtran por usuario y no por workspace: un usuario podría adjuntar un contexto suyo de otro workspace, pero la capa de vectores ya lo descarta.

## Fase 1. Proyectos restringidos (hecho)

Decisiones (Xavier aceptó la propuesta el 6 de octubre): la restricción va por proyecto y todo lo del proyecto la hereda. Ven un proyecto restringido los owners del workspace, quien lo creó y las personas añadidas. Los admins que no estén añadidos no lo ven. Lo puede cambiar un owner o el creador.

Cómo está hecho:

- `Project.visibility` (`WORKSPACE` o `RESTRICTED`) y la tabla `ProjectMember`.
- La regla se aplica en un solo sitio. Al resolver el acceso al workspace se calculan los proyectos ocultos para quien llama (`services/projectAccess.ts`) y se guardan para el resto de la petición (`services/accessScope.ts`). El cliente de Prisma (`prisma/prismaClient.ts`) añade el filtro a todas las lecturas y a las escrituras con `where` de 13 modelos: proyectos, reuniones, tareas, contextos y sus archivos, notas, chats, documentos, presentaciones, diagramas, puntos de dolor, enlaces tarea-reunión y traducciones. Ningún controlador tiene que acordarse de la regla.
- El RAG queda cubierto por la misma vía, porque toda lectura de Qdrant empieza por la tabla `Context`.
- MCP: cada petición se limita a lo que ve el usuario del token.
- Correos semanales: el resumen personal se construye con lo que ve cada persona. El informe de equipo, que va a varios a la vez, excluye los proyectos restringidos.
- Acceso de soporte de la plataforma: no ve proyectos restringidos.
- Web: en la página del proyecto, "Quién puede ver este proyecto", con la lista de personas. Cada cambio queda en la auditoría (`project.access_changed`).
- Migración `project_visibility_lists`: las listas `contextIds` pasan a tener valor por defecto y se rellenan las filas antiguas, que tenían NULL. Sin eso el filtro ocultaba de más.

Comprobado con datos reales en la base local (`yarn smoke:restricted-projects`): crea un workspace con un proyecto abierto y otro restringido y lee los 13 modelos como owner, admin, creador, invitado y ajeno, por listado, por id y con escrituras. También prueba la gestión de acceso. Hay un test de peticiones solapadas a través de Express que confirma que el ámbito de una petición no se cruza con el de otra.

Límites conocidos:

- Una reunión guardada sin proyecto sigue siendo visible para todo el workspace.
- Un documento generado desde una reunión restringida y guardado fuera del proyecto (solo con `transcriptIds`) no hereda la restricción.
- Los datos traídos con `include` desde un modelo no filtrado no pasan por el filtro. Revisé las consultas actuales y no hay ninguna así, pero es la regla a recordar al escribir consultas nuevas.
- Las tareas de un proyecto restringido se siguen sincronizando con Jira, Linear o Trello si la sincronización está activa.
- El registro de uso de IA guarda el `projectId`. No he revisado si alguna vista de uso enseña el título de un proyecto restringido.
- El stream de audio del recorder no pasa por el filtro. Solo usa los términos clave del proyecto para Deepgram, no devuelve nada al usuario.
- Los trabajos en segundo plano ven todo, a propósito. Si uno nuevo genera algo para que lo lean personas, tiene que usar `runWithHidden`.
- La lista de proyectos de la web no marca todavía cuáles son restringidos.

Sin probar: la pantalla en el navegador y el recorrido completo con dos usuarios reales. El recorder y el móvil no cambian: reciben la lista de proyectos ya filtrada.

## Fase 2. Retención de transcripciones, embeddings y chats (aparcada)

Decisión de Xavier del 6 de octubre: de momento no se borra nada de forma automática. No empezar esta fase hasta que él lo pida.

Para cuando se retome: hoy solo se borra el audio (`audioRetentionDays`). La propuesta era `transcriptRetentionDays` y `chatRetentionDays` por workspace, apagados por defecto, con el mismo trabajo diario que ya borra audio. Quedaba por decidir qué pasa con las tareas y documentos que salieron de una reunión borrada.

## Fase 3. Auditoría de lectura y exportación (hecho)

El registro de auditoría ya guarda quién lee cada reunión, con cuatro acciones nuevas: `meeting.viewed`, `meeting.audio_accessed`, `meeting.notes_sent` y `meeting.translated`. Se registran al abrir el detalle (también desde un proyecto), al pedir el audio, al enviar las notas, al traducir y al leer una reunión por MCP (`get_meeting_detail`, marcado con `via: mcp`).

La página de una reunión consulta el detalle cada pocos segundos mientras se procesa. Por eso abrir y pedir audio se registran una vez por persona, reunión y canal cada 30 minutos. Los envíos y las traducciones se registran siempre.

Aparecen en el panel de auditoría de la web, en el grupo "meeting", con etiqueta en inglés y en español. Al pulsar una persona o una reunión en una fila, el panel muestra solo sus entradas (el endpoint acepta `targetId` y `actorUserId`).

Pendiente:

- Las búsquedas por MCP (`search_meetings`, `get_recent_meetings`) y el chat sobre una reunión no se registran.
- Las exportaciones automáticas a Notion, Drive y OneDrive no se registran.
- El control de repeticiones vive en memoria de cada proceso. Con más de una réplica del backend puede salir una entrada por réplica.

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
- Hecho el 6 de octubre: la búsqueda para extraer tareas usaba solo los primeros 500 caracteres de la transcripción, que suelen ser saludos. Ahora usa hasta 5 ventanas de 600 caracteres repartidas por toda la reunión y mezcla los resultados (`utils/ragQueries.ts`). Sin medir todavía con reuniones reales: falta comparar las tareas que salen antes y después.

## Orden recomendado

Hechas la 0, la 0b, la 1 y la 3. La 2 está aparcada. Sigue la 5, que dependía de la 1. La 4 puede ir en paralelo. La 6 solo con un cliente detrás. La búsqueda en todas las reuniones de la fase 7 conviene hacerla después de la 1, para que nazca respetando la visibilidad.
