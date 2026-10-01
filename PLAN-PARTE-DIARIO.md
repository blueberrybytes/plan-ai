# Parte diario por voz y resumen semanal por persona

Plan de producto. Octubre de 2026. Sale de la llamada con Edu del 1 de octubre.

## Estado a 2 de octubre de 2026

Las cuatro fases de desarrollo están hechas en la rama `feat/parte-diario`, sin commit ni push. Falta la fase 5 (la prueba con Edu) y probar el móvil en un dispositivo. El detalle de qué se ha probado y qué no está al final, en "Qué se ha probado".

Cambios respecto al diseño de abajo, decididos al construirlo:

1. La lectura con IA no va por BullMQ. Es una llamada directa (`POST /api/daily-report/extract`), igual que los trackers. Tarda unos 9 segundos y el usuario espera la respuesta en pantalla, así que una cola solo añadía complejidad.
2. El dictado del móvil es en directo, por el mismo canal que el asistente. El texto se guarda en la nota del día en el teléfono y se sube cuando hay red. Dictar sí necesita red. Grabar audio sin conexión para transcribirlo después quedaría para una segunda versión.
3. El aviso de las 17:30 es un banner dentro de la app, en la pantalla principal, en días laborables y solo si el parte de hoy está vacío. Una notificación push necesita `expo-notifications`, que es un módulo nativo y obliga a sacar una build nueva. Queda como decisión tuya.
4. Además de NEW hay un quinto tipo, DONE: trabajo hecho que no era una tarea. Sin él, lo que la gente hace fuera de las tareas no aparece en el resumen del jefe.
5. Las tareas nuevas que la IA no sabe dónde poner van a un proyecto "Daily report" que se crea solo la primera vez.

## El problema

Edu lo oye en casi todas las reuniones de BNI en Terres de l'Ebre. El dueño de una empresa de 10 a 20 empleados tiene la sensación de que su gente "escalfa la cadira", pero no sabe qué ha hecho cada uno en la semana. El jefe de BigMat Tortosa y Amposta lo dijo con estas palabras: "vull controlar què fan els meus empleats".

Plan AI ya contesta esa pregunta para la gente que tiene reuniones. De cada reunión salen tareas con responsable y fecha. Pero la persona de administración, contabilidad o recursos humanos casi no tiene reuniones, así que para ella el producto no ve nada.

Lo que falta son dos piezas. La primera es un parte diario por voz desde el móvil: el empleado habla 60 segundos al final del día y eso se convierte en tareas hechas y pendientes. La segunda es un resumen semanal por persona para el jefe, con lo que cada uno se comprometió a hacer y lo que cerró.

## Qué no vamos a construir

Nada de capturas de pantalla, registro de teclas, tiempo activo en el ordenador ni grabaciones sin aviso. Tres motivos:

1. El artículo 20 bis del Estatuto de los Trabajadores y los artículos 87 a 91 de la LOPDGDD obligan a informar antes, a ser proporcionado y en algunos casos a pasar por los representantes de los trabajadores. La vigilancia de actividad es donde caen las sanciones.
2. Choca con el mensaje de seguridad y consentimiento que llevamos desde el 26 de septiembre (ver `SECURITY.md`).
3. No resuelve el problema. Medir horas delante de la pantalla no dice si se ha hecho el trabajo.

La regla del producto: se mide lo que se entrega, no el tiempo. El empleado dice lo que ha hecho y el sistema lo cruza con lo que tenía asignado.

## Lo que ya existe

Buena parte está hecha. El trabajo es unir piezas.

Las notas diarias ya existen. El modelo `Note` en `plan-ai/backend/prisma/schema.prisma` tiene `periodType` (`DAY` o `WEEK`), `periodStart` y `source` (`MOBILE` entre otros), con una nota por persona, workspace y día. El móvil ya las abre en `plan-ai-mobile/src/app/(drawer)/notes.tsx` con `api.getPeriodNote("DAY", ...)`. Por defecto son `PRIVATE`.

La transcripción de notas de voz cortas ya existe para Telegram en `telegramTranscriptionService.ts`. El móvil ya graba y sube audio en `recordingService.ts` y `recordingUploader.ts`, aunque pensado para reuniones largas.

La extracción con IA a partir de una nota ya existe para los trackers personales en `trackerExtractionService.ts`. Devuelve propuestas que el usuario confirma, y guarda `trackersExtractedVersion` para no mandar el mismo texto dos veces a la IA. Es el patrón exacto que necesitamos, cambiando trackers por tareas.

El resumen semanal ya existe en `weeklyDigestService.ts` y `weeklyDigestWorker.ts`. Sale el lunes, no llama a la IA y cuenta reuniones y tareas abiertas. Pero es de cada usuario para sí mismo. No hay vista de jefe.

Los roles ya existen: `OWNER`, `ADMIN` y `MEMBER` en `WorkspaceMember`.

Lo que no he visto en el código es que la extracción de tareas de una reunión marque como hechas tareas que ya existían. Hoy crea tareas nuevas. Hay que confirmarlo en `projectTranscriptService.ts` antes de empezar la fase 2.

## Diseño

### Pieza 1. Parte diario por voz

En el móvil, un botón "Parte del día" en la pantalla principal. Se mantiene pulsado, se habla y se suelta. Máximo 3 minutos. El audio se transcribe con el idioma fijado del usuario (ojo con catalán: `nova-3` con `ca` funciona, `multi` devuelve vacío). El texto se añade a la nota `DAY` de ese día con `source: MOBILE`. Si no hay red, se guarda en local y se sube después, igual que las notas.

Un aviso a las 17:30 (hora configurable por workspace) recuerda hacer el parte. Solo en días laborables.

### Pieza 2. De la nota a tareas hechas y pendientes

Cuando la nota del día cambia, un job de BullMQ manda a la IA el texto nuevo y la lista de tareas abiertas asignadas a esa persona. La IA devuelve tres cosas: tareas existentes que se han terminado, tareas existentes con avance o bloqueo, y tareas nuevas que ha mencionado.

El empleado ve las propuestas y las confirma con un toque. Nada cambia de estado sin su confirmación. Esto importa por dos razones: la IA se equivoca al emparejar tareas, y el empleado es quien firma lo que ha hecho, que es lo que hace que el resumen sea justo.

Las tareas nuevas van a un proyecto por defecto de la persona si no se reconoce otro.

### Pieza 3. Resumen semanal por persona

El lunes, el `OWNER` y los `ADMIN` reciben un email y tienen una página en la web. Por cada persona del equipo se ve lo siguiente: tareas cerradas en la semana, tareas abiertas con fecha pasada, tareas bloqueadas y el motivo, y cuántos días hizo el parte.

Una frase de resumen por persona sí la escribe la IA, porque leer 15 listas de tareas no es práctico. El resto sale de la base de datos, como el digest actual.

Qué ve el jefe y qué no. Ve tareas y su estado. No ve el texto del parte ni el audio, que siguen privados del empleado salvo que él los comparta. Así el empleado puede hablar con naturalidad y el jefe recibe lo que necesita. Esto hay que dejarlo escrito en la pantalla de consentimiento.

### Consentimiento

Al entrar en un workspace con el parte diario activado, el empleado ve un texto que explica qué se recoge, quién lo ve y para qué. Reutilizamos el patrón de consentimiento versionado de `PersonalProfile` (`consentAt` más versión del texto). Además damos al cliente un texto modelo para informar a su plantilla, porque la obligación legal es suya como empleador.

## Cambios en datos

En `Note`, un campo `tasksExtractedVersion Int?`, igual que `trackersExtractedVersion`.

Un modelo nuevo `TaskUpdateProposal` con nota de origen, tarea (o null si es nueva), tipo (`COMPLETED`, `PROGRESS`, `BLOCKED`, `NEW`), texto, estado (`PENDING`, `ACCEPTED`, `REJECTED`) y fecha. Sirve también de historial para el resumen.

En `Workspace`, `dailyReportEnabled Boolean` y `dailyReportReminderTime String?`.

Todo esto obliga a correr `yarn update` desde la raíz.

## Fases

| Fase | Qué                                                                                      | Estimación            |
| ---- | ---------------------------------------------------------------------------------------- | --------------------- |
| 1    | Botón de voz en el móvil que escribe en la nota del día, con cola offline y aviso diario | 4 días                |
| 2    | Job de extracción, modelo de propuestas y pantalla de confirmación en móvil y web        | 5 días                |
| 3    | Resumen semanal para OWNER y ADMIN, email y página web                                   | 4 días                |
| 4    | Consentimiento, texto modelo para el cliente y activación por workspace                  | 2 días                |
| 5    | Prueba con Edu y su equipo durante 2 semanas                                             | 10 días de calendario |

Son unos 15 días de trabajo antes de la prueba. La fase 1 se puede enseñar sola y ya aporta algo.

## Qué enseñar a Edu el sábado 3 de octubre

Lo que funciona hoy: grabación de reuniones en catalán, tareas con responsable y fecha, notas diarias en el móvil y el digest del lunes. Eso cubre al equipo comercial.

Lo que falta: este documento, contado como el plan para el personal de oficina que no tiene reuniones. No enseñarlo como si existiera.

Lo que le pedimos a Edu: que lo use él y su equipo en la prueba de la fase 5, y que nos consiga uno o dos empresarios de BNI dispuestos a probarlo con 5 a 10 empleados.

## Decisiones abiertas

1. Si el jefe puede leer el texto del parte cuando el empleado lo comparte, o nunca. Propongo que nunca por defecto y que el empleado pueda compartir una nota concreta.
2. Si el resumen semanal muestra "días sin parte". Es útil, pero es la parte que más se parece a vigilar. Propongo mostrarlo solo como número, sin ranking entre personas.
3. Precio. Si va dentro del plan actual o es un extra por empleado. Depende de lo que salga de la prueba.
4. Idioma del resumen para el jefe. Por defecto el idioma del jefe, no el de cada empleado.

5. Las tareas casi nunca tienen responsable. El campo `assigneeId` hoy solo lo rellena el asistente. Ni el tablero ni la extracción de reuniones asignan a nadie. Por eso el parte mira las tareas del empleado y también las abiertas sin responsable (hasta 40, las más recientes). Cuando el empleado acepta un cambio sobre una tarea sin responsable, pasa a ser suya. Las tareas de otra persona nunca se envían a la IA ni se pueden tocar.

## Qué se ha construido

Backend (`plan-ai/backend`). Migración `20260930203736_daily_report`: ajustes en `Workspace`, consentimiento versionado en `WorkspaceMember`, `tasksExtractedVersion` en `Note` y el modelo `TaskUpdateProposal`. La lógica está en `dailyReportService.ts` (estado, consentimiento, lectura con IA, revisión) y `teamReportService.ts` (resumen semanal y envío del lunes). La API está en `dailyReportController.ts`, bajo `/api/daily-report`. El email está en `templates/teamReport.ts` y la cola en `teamReportQueue.ts` y `teamReportWorker.ts`, los lunes a las 08:15. La exportación del workspace incluye las propuestas del que exporta.

Web (`plan-ai/frontend`). Hay dos páginas nuevas. `/daily-report` tiene consentimiento, el parte de hoy, las propuestas y los ajustes para owner y admin. `/team-report` muestra la semana del equipo con navegación entre semanas y un botón para escribir los resúmenes con IA. Las dos están en el menú lateral: el parte en los espacios de equipo y el resumen solo para owner y admin. Los textos están en inglés y castellano.

Móvil (`plan-ai-mobile`). Pantalla "Daily report" en el menú, con consentimiento, dictado en directo (catalán, castellano o inglés), el texto del día, el botón "Update my tasks" y la lista de propuestas. El banner de aviso está en la pantalla principal. El hook `useDictation` está separado para poder reutilizarlo.

Texto modelo para la plantilla del cliente en `PARTE-DIARIO-AVISO-PLANTILLA.md`, en castellano y catalán.

## Qué se ha probado

Pasan 633 tests del backend (29 nuevos) y 103 de la web (5 nuevos). `yarn typecheck:all` pasa en las cuatro apps.

Prueba completa contra la base de datos local y la IA real con `src/scripts/dailyReportSmoke.ts`. El script crea un workspace de prueba, escribe un parte en catalán, lo lee, acepta todo, construye el resumen y lo borra al final. Con cuatro tareas abiertas y un parte de cuatro frases, la IA propuso 5 cambios correctos en 9,4 segundos. Fueron una tarea hecha, una que avanza, una parada con su motivo, un trabajo hecho que no era tarea y una tarea nueva para mañana. No tocó la tarea que el parte no mencionaba. La segunda lectura del mismo texto no volvió a llamar a la IA. El resumen del jefe salió en catalán y sin juicios sobre la persona.

Sin probar: la web en el navegador (las reglas de `plan-ai` piden no usarlo) y el móvil en un dispositivo o simulador. El dictado reutiliza el canal del asistente, que ya funciona, pero la pantalla nueva no la ha visto nadie.

## Pendiente antes de producción

1. Probar el móvil en un iPhone con un workspace de equipo y un parte en catalán.
2. Decidir la notificación push (punto 3 de arriba).
3. Las reuniones siguen creando tareas sin responsable. La IA de la reunión sabe quién habla, así que podría proponerlo, pero no está hecho.
4. El asistente y las integraciones (Jira, Linear, Trello) cambian el estado de una tarea sin pasar por `taskCrudService`, así que no rellenan `completedAt`. El resumen usa la fecha de última modificación en ese caso.
5. El orden de despliegue es el de siempre: la migración va con el push a `main`, y el móvil necesita una build nueva para tener la pantalla. El backend tiene que salir antes que el móvil.

## Añadido el 2 de octubre, después de la revisión

Se puede asignar una tarea a un miembro desde el diálogo de tarea de la web, y el nombre sale en la tarjeta del tablero. La API de tareas acepta y devuelve `assigneeId`, y comprueba que la persona es miembro del workspace. Cerrar una tarea desde el tablero o desde el MCP ya rellena `completedAt`, y reabrirla lo borra. Son cambios en `taskCrudService.ts`, que tiene dos llamadores: el controlador de proyectos y el servidor MCP.
