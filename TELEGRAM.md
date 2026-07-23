# Berry — puesta en marcha del bot de Telegram

Cómo conseguir cada variable de entorno y dejar el bot funcionando.

**Todas van en `plan-ai/backend/.env`** (las plantillas están en `plan-ai/backend/.env.template`).

> ⚠️ El token del bot da **control total** sobre él. No lo pegues en un chat, ni en un
> issue, ni en una captura. Si se filtra, revócalo con `/revoke` en @BotFather.
> `.env` no se commitea nunca.

---

## Resumen

| Variable | ¿De dónde sale? | ¿Obligatoria? |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | @BotFather | **Sí** |
| `TELEGRAM_WEBHOOK_SECRET` | Lo generas tú | **Sí** |
| `TELEGRAM_WORKSPACE_ID` | Base de datos | **Sí** |
| `TELEGRAM_SERVICE_USER_ID` | Base de datos | **Sí** |
| `TELEGRAM_LEAD_NOTIFY_EMAIL` | Lo eliges tú | Recomendada |
| `TELEGRAM_TRANSCRIPTION_LANGUAGE` | Decisión de negocio | No (por defecto `multi`) |
| `TELEGRAM_SYNC_TO_LINEAR` | Decisión de negocio | No (por defecto `false`) |

Sin las cuatro primeras el bot recibe mensajes y no responde nada.

---

## 1. `TELEGRAM_BOT_TOKEN`

1. Abre Telegram y habla con **[@BotFather](https://t.me/BotFather)**.
2. Envía `/newbot`.
3. Nombre visible: `Berry` (o `Berry · BlueberryBytes`).
4. Username: tiene que acabar en `bot` y ser único — por ejemplo `BlueberryBerryBot`.
5. BotFather responde con un token con esta forma:

   ```
   8123456789:AAF3xQ...
   ```

6. Pégalo en `.env`:

   ```bash
   TELEGRAM_BOT_TOKEN="8123456789:AAF3xQ..."
   ```

Si ya tenías el bot creado: `/mybots` → elige el bot → **API Token**.

---

## 2. `TELEGRAM_WEBHOOK_SECRET`

No te lo da nadie: **lo inventas tú** y se lo comunicas a Telegram al registrar el webhook.
Telegram te lo devuelve en cada petición, y es **lo único** que separa el endpoint público
de un desconocido gastando vuestros créditos de OpenRouter.

```bash
openssl rand -hex 32
```

```bash
TELEGRAM_WEBHOOK_SECRET="el-valor-que-acabas-de-generar"
```

Que sea largo y aleatorio. No reutilices uno de otro servicio.

---

## 3. `TELEGRAM_WORKSPACE_ID` y `TELEGRAM_SERVICE_USER_ID`

Los clientes potenciales que escriben al bot **no tienen cuenta**, y las claves de IA viven
en el `Workspace` (arquitectura BYOK). Así que hace falta un workspace vuestro que pague
esas generaciones: es **gasto de marketing**, no de producto.

### 3.1 Crea el workspace desde la app

Hazlo por la interfaz normal, no por SQL, para que se creen bien las relaciones:

1. Entra en Plan AI con una cuenta del equipo (o crea una tipo `berry@blueberrybytes.com`).
2. Crea un workspace llamado **`Berry Sales`**.
3. En sus ajustes, configura las claves BYOK:
   - **OpenRouter** → obligatoria (genera el documento y los mockups)
   - **Deepgram** → obligatoria si quieres notas de voz

### 3.2 Saca los dos IDs desde la app

1. Con el workspace **Berry Sales** activo, ve a **`/team`**.
2. Baja hasta **Identificadores** (solo visible para el `OWNER`).
3. Copia los dos valores con el botón de copiar:
   - **ID del workspace** → `TELEGRAM_WORKSPACE_ID`
   - **Tu ID de usuario** → `TELEGRAM_SERVICE_USER_ID`

```bash
TELEGRAM_WORKSPACE_ID="<ID del workspace>"
TELEGRAM_SERVICE_USER_ID="<tu ID de usuario>"
```

> El `SERVICE_USER_ID` es el usuario que figurará como propietario de todo lo que genere
> el bot. Usa la cuenta con la que creaste el workspace.

<details>
<summary>Plan B: sacarlos por SQL</summary>

Si no tienes acceso a la interfaz:

```bash
psql "$DATABASE_URL" -c "SELECT w.id AS workspace_id, w.name, u.id AS user_id, u.email FROM \"Workspace\" w JOIN \"WorkspaceMember\" m ON m.\"workspaceId\" = w.id AND m.role = 'OWNER' JOIN \"User\" u ON u.id = m.\"userId\" WHERE w.name ILIKE '%Berry%';"
```

</details>

### 3.3 Comprueba que las claves están puestas

```bash
psql "$DATABASE_URL" -c "SELECT name, (\"openRouterKey\" IS NOT NULL) AS openrouter_ok, (\"deepgramKey\" IS NOT NULL) AS deepgram_ok FROM \"Workspace\" WHERE id = '<workspace_id>';"
```

Si `openrouter_ok` sale `f`, el bot no podrá generar nada.

---

## 4. `TELEGRAM_LEAD_NOTIFY_EMAIL`

A dónde llega el aviso cuando entra un lead. Sin esto **el bot entrega la propuesta y nadie
del equipo se entera** — un lead de las 3 de la madrugada no vale nada si el primer humano
lo ve tres días después.

```bash
TELEGRAM_LEAD_NOTIFY_EMAIL="xavier@blueberrybytes.com,noelia@blueberrybytes.com"
```

Varios destinatarios separados por comas. **Requiere que `RESEND_API_KEY` ya esté
configurada** (es la misma que usan las invitaciones de workspace).

---

## 5. `TELEGRAM_TRANSCRIPTION_LANGUAGE`

Idioma que se le pide a Deepgram para las notas de voz.

```bash
TELEGRAM_TRANSCRIPTION_LANGUAGE="multi"
```

| Valor | Cuándo |
| --- | --- |
| `multi` | Por defecto. Cubre ~10 idiomas con cambio de idioma dentro de la misma frase. |
| `es` | Si los clientes hablan castellano casi siempre. |
| `ca` | **Si atendéis clientes en catalán.** |

> **Ojo con el catalán:** `multi` **no** lo cubre, y no da error — devuelve una
> transcripción **vacía**. Un cliente catalanohablante se quedaría esperando una propuesta
> que no llega. Si es un mercado vuestro, pon `ca`. El bot ya detecta la transcripción
> vacía y pide el texto escrito, pero es un parche, no una solución.

---

## 6. `TELEGRAM_SYNC_TO_LINEAR`

```bash
TELEGRAM_SYNC_TO_LINEAR="false"
```

Con `true`, cada lead genera tickets en Linear. **Déjalo en `false` al principio**: todo
curioso que toquetee el bot acabaría como tickets en el tablero, y un tablero lleno de
gente que no va a comprar deja de leerse. Actívalo cuando el bot esté cualificando leads.

---

## 7. Registrar el webhook

Telegram exige **HTTPS con certificado válido**. En local, usa ngrok:

```bash
ngrok http 8080
```

Con la URL pública que te dé (`https://xxxx.ngrok-free.app`):

```bash
curl -X POST "https://api.telegram.org/bot<TU_TOKEN>/setWebhook" -d "url=https://xxxx.ngrok-free.app/api/integrations/telegram/webhook" -d "secret_token=<TU_SECRETO>"
```

Respuesta esperada:

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

### Comprobar que quedó bien

```bash
curl "https://api.telegram.org/bot<TU_TOKEN>/getWebhookInfo"
```

Mira `pending_update_count` (debería ser 0) y `last_error_message` (debería no existir).
Si ves `Wrong response from the webhook: 401`, el secreto del `.env` y el del `setWebhook`
no coinciden.

### Para quitarlo

```bash
yarn --cwd plan-ai/backend webhook:berry --delete
```

### ⚠️ Un bot solo puede apuntar a UNA URL

Telegram guarda **una única** dirección por token. `setWebhook` no añade: **sustituye**.
No existen entornos: la última URL registrada gana y la anterior deja de recibir nada.

Consecuencia: **no uses el mismo bot para local y para producción.** Si apuntas el bot de
producción a tu ngrok para probar y luego cierras el portátil, un cliente real que escriba
no recibe nada — y no te enteras.

**Crea un segundo bot para desarrollo** (`/newbot` en @BotFather → `Berry Dev`):

| Entorno | Bot | URL registrada |
| --- | --- | --- |
| Local | `@BerryDevBot` | la de ngrok — la vuelves a registrar cada vez que cambie |
| Producción | `@BlueBerryBytesBot` | el dominio real — una vez y ya |

Son tokens distintos, así que cada uno lleva su propio webhook y no se pisan. Usa también un
`TELEGRAM_WEBHOOK_SECRET` distinto en cada entorno: si el de local se filtra en una captura,
producción sigue a salvo.

---

## 8. Menú de comandos (opcional, pero se nota)

En @BotFather: `/mybots` → tu bot → **Edit Bot** → **Edit Commands**, y pega:

```
start - Empezar y ver qué puede hacer Berry
help - Cómo pedir una propuesta
```

También ahí puedes poner la descripción que ve el cliente antes de escribir
(**Edit Description**), por ejemplo:

> Cuéntame qué producto tienes en mente y te devuelvo una propuesta con documento,
> diagrama y bocetos en menos de un minuto.

---

## 9. Probar

### Sin token — ya funciona hoy

Genera los cinco artefactos reales a disco, sin Telegram ni base de datos:

```bash
yarn --cwd plan-ai/backend preview:berry
```

Ábrelos **en el móvil**: el `.docx`, el `.pptx`, el diagrama y los dos mockups. Es la forma
de ver lo que recibe el cliente antes de que exista el bot.

### Con todo configurado

1. Arranca el backend (`yarn dev`).
2. Abre ngrok y registra el webhook (paso 7).
3. Escríbele al bot desde tu móvil: `/start`, y luego algo como
   *«Quiero una app para que mis camareros tomen comandas y vayan directas a cocina»*.
4. Deberías recibir, en este orden: dos bocetos, el diagrama, el `.docx` y el `.pptx`.
5. Comprueba que llega el email de aviso de lead.

Si algo falla, mira los logs del backend: todo lo del bot lleva el prefijo `[telegram]`.

---

## 10. Antes de enseñárselo a un cliente

- [ ] `preview:berry` genera los cinco artefactos y se ven bien en el móvil
- [ ] El aviso de lead llega al email correcto
- [ ] El límite por chat (`TELEGRAM_RATE_LIMIT`, 5/día por defecto) te parece bien
- [ ] Has decidido qué se guarda de gente que aún no es cliente, y cuánto tiempo (RGPD)
- [ ] El `.env` de producción tiene un `TELEGRAM_WEBHOOK_SECRET` **distinto** al de local

---

## Fichero de referencia

```bash
# ─── Berry (Telegram) ───
TELEGRAM_BOT_TOKEN=""
TELEGRAM_WEBHOOK_SECRET=""
TELEGRAM_WORKSPACE_ID=""
TELEGRAM_SERVICE_USER_ID=""
TELEGRAM_LEAD_NOTIFY_EMAIL=""
TELEGRAM_RATE_LIMIT="5"
TELEGRAM_TRANSCRIPTION_LANGUAGE="multi"
TELEGRAM_SYNC_TO_LINEAR="false"
```
