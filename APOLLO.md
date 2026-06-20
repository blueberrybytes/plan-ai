# Apollo.io — Guía de Prospección Plan AI

Guía práctica para captar clientes en España con Apollo.io.

---

## 1. Setup Rápido

1. Cuenta en [app.apollo.io](https://app.apollo.io)
2. Instalar Chrome Extension (para LinkedIn)
3. Conectar email en `Settings → Email Accounts`
4. Configurar SPF/DKIM/DMARC en tu dominio (obligatorio para deliverability)
5. **Warm-up**: enviar 10-15 emails/día las 2 primeras semanas antes de escalar

---

## 2. Filtros para España

### Búsqueda de Personas

```
Job Title:        contains "CTO" OR "VP Engineering" OR "Head of Engineering"
                  OR "Director de Tecnología" OR "Head of Product"
Seniority:        C-Suite, VP, Director
Department:       Engineering
Person Location:  Spain
# Employees:      20-500
Industry:         Computer Software, Internet, Information Technology
Email Status:     Verified
```

### Variante: Product Managers / Ops que gestionan reuniones

```
Job Title:        contains "Product Manager" OR "Operations" OR "Chief of Staff"
                  OR "Project Manager" OR "Scrum Master"
Seniority:        Manager, Director
Person Location:  Spain
# Employees:      20-500
Years in Role:    < 1 year
Email Status:     Verified
```

### Filtros de Empresa (dentro de People Search)

```
Company Location: Spain
Technologies:     Slack, Zoom, Google Meet, Microsoft Teams
Funding Stage:    Seed, Series A, Series B
Keywords:         "SaaS" OR "startup" OR "tech" OR "software"
```

---

## 3. Secuencia de Emails (Cadencia 3-7-7)

Basada en datos: la cadencia **3-7-7 días** entre emails es la que mejor funciona. Las respuestas pico llegan en el 2º y 3er toque. Máximo 4 emails.

| Paso | Día | Canal | Qué hacer |
|------|-----|-------|-----------|
| 1 | 0 | Email | Primer contacto (ver Email 1) |
| 2 | 1 | LinkedIn | Conexión con nota corta |
| 3 | 3 | Email | Follow-up con valor nuevo (ver Email 2) |
| 4 | 10 | Email | Caso de uso concreto (ver Email 3) |
| 5 | 17 | Email | Breakup — último intento (ver Email 4) |

**Configuración en Apollo:**
- Horario: Lun-Vie, 9:00-18:00 (zona horaria del contacto)
- Auto-pausar al recibir respuesta: **SÍ**
- Auto-eliminar rebotes: **SÍ**
- Límite diario: empezar con 25, subir a 50 en semana 3

---

## 4. Plantillas de Email

> **Datos clave de rendimiento:**
> - Asunto: 2-4 palabras, minúsculas, sin exclamaciones → +50% open rate
> - Cuerpo: máximo 3 frases (< 125 palabras) → mejor reply rate
> - Personalización con nombre de empresa → +30% apertura
> - Cada email debe aportar valor nuevo, nunca "solo seguimiento"
> - Reply rate esperado B2B SaaS: 3-5% media, 8-12% en campañas bien segmentadas

---

### Email 1 — Primer Contacto (Trigger Event)

**Asunto:** `pregunta sobre {{company}}`

```
Hola {{first_name}},

He visto que {{company}} está creciendo — enhorabuena.

Cuando los equipos escalan, las reuniones se multiplican y las decisiones
se pierden entre calls y notas. Hemos ayudado a equipos como el vuestro
a recuperar 5h/semana convirtiendo reuniones en tareas automáticamente.

¿Merece una conversación de 10 min, o ya lo tenéis resuelto?

{{sender_name}}
```

**Por qué funciona:** Asunto corto con nombre de empresa (+30% apertura). Referencia a un evento real (crecimiento). Propuesta de valor concreta (5h/semana). Cierre con salida fácil ("o ya lo tenéis resuelto") que reduce la presión y aumenta respuestas.

---

### Email 2 — Follow-up con Valor (Día 3)

**Asunto:** `re: pregunta sobre {{company}}`

```
Hola {{first_name}},

Un dato rápido: el profesional medio dedica 31h/mes a reuniones
improductivas (fuente: Atlassian). Y el 73% hace otras cosas durante
las calls porque sabe que no se va a retener nada.

Plan AI graba, transcribe y extrae automáticamente las tareas y
decisiones de cada reunión — sin que nadie tenga que tomar notas.

Si te interesa, te mando un vídeo de 1 minuto mostrando cómo funciona.

{{sender_name}}
```

**Por qué funciona:** Aporta un dato nuevo (no repite el email anterior). Ofrece un recurso de bajo compromiso (vídeo de 1 min) en vez de pedir una call directamente.

---

### Email 3 — Caso de Uso Concreto (Día 10)

**Asunto:** `cómo lo usan equipos de {{industry}}`

```
Hola {{first_name}},

Te cuento un caso rápido: un equipo de producto de 15 personas
redujo sus follow-up meetings un 40% porque cada call genera
automáticamente un resumen + tareas asignadas en Slack.

La configuración lleva 2 minutos y funciona con Google Meet, Zoom
y Teams.

¿Tiene sentido para {{company}}?

{{sender_name}}
```

**Por qué funciona:** Social proof con resultado medible. Muestra que es fácil de implementar (2 minutos, integra con herramientas que ya usan). Pregunta abierta que invita a responder.

---

### Email 4 — Breakup (Día 17)

**Asunto:** `cierro el tema`

```
Hola {{first_name}},

No quiero ser pesado — entiendo que las prioridades cambian.

Si en algún momento las reuniones os están comiendo tiempo y queréis
una solución automática, estaré por aquí.

Un saludo,
{{sender_name}}
```

**Por qué funciona:** Tono respetuoso sin presión. Deja la puerta abierta. Los breakup emails tienen históricamente las reply rates más altas de toda la secuencia (10-15%) porque eliminan la obligación de responder.

---

### LinkedIn — Nota de Conexión (Día 1)

```
Hola {{first_name}} — he visto el trabajo que estáis haciendo
en {{company}}, muy interesante. Me encantaría conectar.
```

> Máximo 300 caracteres. No vendas aquí. Solo conecta.

---

## 5. Notas para el Mercado Español

| Aspecto | Recomendación |
|---------|---------------|
| **Idioma** | Siempre en español. Inglés solo si el perfil está 100% en inglés |
| **Tono** | Profesional pero cercano. Tuteo en tech/startups, usted en enterprise |
| **Formalidad** | Primer email semi-formal. Si responden casual, adaptar |
| **Timing** | Evitar envíos antes de las 9:00 y después de las 18:00. Evitar agosto completo |
| **LinkedIn** | Imprescindible en España — ratio de respuesta más alto que email puro |
| **Velocidad** | Ciclo de venta más largo que US/UK. No presionar. Construir confianza |

---

## 6. Métricas Objetivo

| Métrica | Mínimo Aceptable | Objetivo |
|---------|-------------------|----------|
| Open Rate | 50% | 65%+ |
| Reply Rate | 3% | 8-12% |
| Bounce Rate | < 5% | < 2% |
| Meetings/semana | 2 | 5+ |

> ⚠️ Si bounce rate > 5%, pausar inmediatamente y revisar la lista. Daña la reputación del dominio.

---

## 7. Créditos Apollo

| Acción | Créditos |
|--------|----------|
| Revelar email | 1 |
| Revelar móvil | 5 |
| Exportar contacto | 1 |

> Filtra agresivamente **antes** de revelar emails. No quemar créditos en leads no cualificados.

---

## 8. Links

- [Apollo App](https://app.apollo.io)
- [Apollo API Docs](https://apolloio.github.io/apollo-api-docs/)
- [Chrome Extension](https://chrome.google.com/webstore/detail/apollo-io/eikcnfddocefiocjgkpkecfgelfdaplj)
