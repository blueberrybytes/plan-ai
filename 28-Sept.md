# 28 de septiembre: qué queda por hacer

Nada está commiteado ni subido. El cambio toca 67 ficheros modificados y 29 nuevos (unas 11.400 líneas, contando tipos generados y tests). Compilan los cuatro paquetes y pasan los 454 tests del backend.

Ojo antes de hacer push: Railway despliega el backend y la web desde `main` de `blueberrybytes/plan-ai`, que es este mismo repositorio. Hacer push a `main` es desplegar en producción. La migración de base de datos se aplica sola (`yarn prisma:deploy` antes de cada despliegue). El repositorio es público.

## 1. Revisar y commitear

- [ ] Revisar el diff. Propuesta de commits:
  1. Seguridad: cifrado de claves y tokens, state firmado en Drive, OneDrive, Linear y Notion, WebSocket con comprobación de miembro, `isCourtesy` fuera de la API.
  2. Audio: retención por workspace, borrar audio, borrar reunión con su audio, reproductor en web, recorder y móvil.
  3. Reunión: marcas, aviso de grabación, calendario de Google y Outlook, enviar notas por correo.
  4. Móvil: importar audio, grabación a 16 kHz, resumen en vivo incremental.
- [ ] `node .gitnexus/run.cjs detect-changes --scope all --repo .` antes del commit. Anoche daba riesgo crítico con el índice desfasado, lo esperable con este tamaño.

## 2. Producción (Railway, servicio plan-ai-backend)

Hoy no está puesta ninguna variable nueva. Sin ellas todo funciona como ahora, salvo el calendario, que no aparece.

- [ ] Clave de cifrado. Generarla con `openssl rand -base64 32`, ponerla como `SECRETS_ENCRYPTION_KEY` y guardar una copia fuera de Railway (gestor de contraseñas). Si se pierde, cada workspace tiene que volver a meter sus claves y reconectar sus integraciones.
- [ ] Antes: backup del Postgres de producción en Railway.
- [ ] Después del despliegue del backend nuevo (nunca antes), desde tu Mac en `plan-ai/backend`, contra la URL pública de Postgres (`DATABASE_PUBLIC_URL` del servicio Postgres) y con la misma clave que en Railway:
  - `read -s "DATABASE_URL?URL publica de Postgres: " && export DATABASE_URL`
  - `read -s "SECRETS_ENCRYPTION_KEY?Clave de cifrado: " && export SECRETS_ENCRYPTION_KEY`
  - `npx ts-node --transpile-only src/scripts/encryptSecrets.ts --dry-run` y, si cuadra, sin `--dry-run`.
  - Con `yarn secrets:encrypt` no: carga el `.env` local, que manda sobre lo que pongas en la terminal.
- [ ] Opcional: `OAUTH_STATE_SECRET` (otra clave de 32 bytes). Si no está, se usa el client secret de cada proveedor.
- [ ] Comprobar que `CORS_ORIGINS` incluye los dos dominios de la web: `https://plan-ai.blueberrybytes.com` y `https://plan-ai.housegroup.media`. El calendario usa esa lista para decidir a qué dominio puede volver el usuario.
- [ ] No poner `GOOGLE_CALENDAR_REDIRECT_URI` ni `MICROSOFT_CALENDAR_REDIRECT_URI` en producción. La URL de vuelta sale del dominio desde el que se conecta.
- [ ] Enviar notas usa `RESEND_API_KEY` y `FROM_EMAIL`, que ya están. Comprobar en Resend que el dominio acepta `reply_to`.

Para rotar la clave más adelante: la nueva en `SECRETS_ENCRYPTION_KEY`, la vieja en `SECRETS_ENCRYPTION_KEY_PREVIOUS`, desplegar, ejecutar el script y quitar la vieja cuando diga 0 por rotar.

## 3. Calendario: Google Cloud y Azure

- [ ] Google Cloud, mismo cliente OAuth que Drive: activar Google Calendar API y añadir el scope `calendar.events.readonly` a la pantalla de consentimiento. Es un scope sensible, así que Google pide verificar la app (tarda días o semanas). Hasta entonces solo funciona con usuarios de prueba.
- [ ] URLs de retorno autorizadas en Google:
  - `https://plan-ai.blueberrybytes.com/integrations/google-calendar`
  - `https://plan-ai.housegroup.media/integrations/google-calendar`
  - `http://localhost:3000/integrations/google-calendar`
- [ ] Azure, misma app que OneDrive: permisos delegados `Calendars.Read`, `User.Read` y `offline_access`. URLs de retorno en la plataforma "Web":
  - `https://plan-ai.blueberrybytes.com/integrations/outlook-calendar`
  - `https://plan-ai.housegroup.media/integrations/outlook-calendar`
  - `http://localhost:3000/integrations/outlook-calendar`

## 4. Versiones de las apps

- [ ] Recorder de escritorio: nueva versión (`yarn release:mac` y el resto) cuando el backend esté desplegado. Las versiones viejas siguen funcionando con el backend nuevo.
- [ ] Móvil: build nativo nuevo con EAS. El parche de `react-native-live-audio-stream` y el plugin de notifee vienen de la ronda anterior y no están en ninguna build publicada.

## 5. Pruebas a mano (no las pude hacer)

No puedo iniciar sesión con Firebase desde el navegador, no tengo móviles ni cuentas reales de Google o Microsoft. Todo lo de abajo solo está comprobado compilando y con tests.

Web con sesión:
- [ ] Reproductor en una reunión de escritorio: que el audio del sistema no suene antes de tiempo al principio y que tocar una frase salte al momento bueno.
- [ ] Borrar el audio de una reunión y borrar una reunión entera (comprobar en el bucket que desaparecen los ficheros).
- [ ] Retención en Equipo: poner 7 días en un workspace de prueba.
- [ ] Enviar notas a tu propio correo y a otro. Comprobar remitente ("Nombre via Plan AI"), que responder va a tu correo, y que el enlace a la reunión solo sale a miembros del workspace.
- [ ] Abrir "Enviar notas" mientras la reunión todavía sincroniza tareas con Linear o Jira, y comprobar que el diálogo no se reinicia solo.
- [ ] Conectar Google Calendar y Outlook desde los dos dominios.

Recorder:
- [ ] Reunión con pausa larga y marcas con Cmd+B. Después, que las marcas caigan donde toca en el reproductor.
- [ ] Dos reuniones seguidas en el calendario: empezar a grabar la segunda justo después de la primera y comprobar el título.
- [ ] Notificación de "está empezando": que salga una sola vez aunque grabes y vuelvas a Home.
- [ ] Aviso de consentimiento, copiar y "no volver a mostrar".
- [ ] Dejar la ventana de una reunión abierta más de 12 horas y darle a play (las URLs se renuevan solas).

Móvil:
- [ ] Importar un m4a y un mp3 grandes (cientos de MB) y un WAV.
- [ ] Marcar un momento después de una llamada entrante en iOS.
- [ ] Grabar 1 hora y subir por 4G (ahora el audio va a 16 kHz, un tercio menos de datos).
- [ ] Que no se pueda reproducir una reunión mientras se graba otra.

Cifrado, en local:
- [ ] Poner una clave en `.env`, `yarn secrets:encrypt --dry-run`, luego sin `--dry-run`, y comprobar que Deepgram, OpenRouter y las integraciones siguen funcionando.

## 6. Cambios de comportamiento que conviene saber

- Borrar una reunión ahora solo lo pueden hacer quien la grabó, un admin o el owner. Antes cualquier miembro. También borra su audio del bucket, que antes se quedaba para siempre.
- Borrar solo el audio de una reunión que nunca se transcribió da error y pide borrar la reunión entera. Ese audio es la única copia.
- `isCourtesy` ya no se puede cambiar por la API. Solo en la base de datos, como hace `scripts/w.ts`.
- El WebSocket del audio en vivo rechaza un `workspaceId` del que el usuario no es miembro. Antes cualquiera podía grabar con la clave de Deepgram de otro workspace.
- Si una clave cifrada no se puede descifrar, la IA falla con error. Antes caía en silencio a las claves de la plataforma.
- Los tiempos del texto en vivo del recorder se miden desde que arranca el fichero del micro, entre 0,5 y 2 segundos más tarde que antes. Así cuadran con el audio.
- Los ficheros importados en el móvil se guardan como `imported.<ext>`.
- Linear y Notion: un flujo de conexión que esté a medias durante el despliegue falla y hay que repetirlo.

## 7. Pendiente conocido

- Borrar un proyecto o un workspace borra sus reuniones en cascada, pero deja el audio en el bucket. Hace falta un barrido de ficheros sin reunión.
- Drive, OneDrive, Jira, Asana, Linear y Notion terminan la conexión en el backend, así que no comprueban que la termina el mismo navegador que la empezó. El calendario sí. Riesgo bajo: hace falta que la víctima acepte la pantalla de consentimiento.
- Tras conectar Drive, Jira y el resto, el usuario vuelve siempre a `APP_URL`. En el dominio de housegroup eso le saca de su sesión. Pasaba antes.
- Enviar notas tiene tres límites: 30 personas por envío, 5 envíos por reunión (reservados en la base de datos con una sola sentencia, probado con 8 peticiones a la vez contra el Postgres local) y 200 destinatarios por usuario y día (contador en Redis). Si Redis no responde, el límite diario no se aplica, pero el de la reunión sí.
- El token de Sentry del repo no puede leer eventos, así que no vi el crash original del recorder de 20 horas.

## 8. Marketing

Hasta publicar y configurar lo anterior, no decir nada de esto. Después sí:
- Pausar la grabación (escritorio y móvil).
- Claves y tokens cifrados en reposo. Solo cuando la clave esté puesta y el script haya corrido.
- Borrado automático del audio y "borrar audio" por reunión.
- Aviso de grabación para los participantes.
- Enviar las notas a los asistentes desde la invitación del calendario.

## 9. Entorno local

Siguen arriba la web (3000), el backend (8080), la voz (8001) y Postgres, Redis y Qdrant en Docker. `somelye-redis` sigue parado porque ocupaba el 6379. Para volver a él: parar `plan-ai-redis` y `docker start somelye-redis`.
