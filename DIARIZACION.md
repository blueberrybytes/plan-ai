# Separar hablantes con el proveedor Whisper

Plan de trabajo. Fecha: 25 de septiembre de 2026.

## El problema

Con `STT_PROVIDER=whisper`, todo lo que se oye por el canal del sistema sale como un solo hablante, `Others 0`. Con Deepgram salen `Others 0`, `Others 1`, `Others 2`. Sin eso, la pestaña de insights por hablante, el tiempo de palabra por persona y la asignación de nombres no tienen con qué trabajar. Whisper no separa hablantes y no lo va a hacer; hay que ponerle algo encima.

El canal del micro no necesita nada: es siempre el usuario. Deepgram a veces lo parte en `User 0` y `User 1` por un cambio de tono, y eso es ruido. Con Whisper el micro se queda como `User 0` y punto. Solo se diariza el canal del sistema.

## Dos maneras de hacerlo

**A. Agrupar los fragmentos de Whisper por voz, con el modelo que ya tenemos.** El servicio `plan-ai-voice` carga `speechbrain/spkrec-ecapa-voxceleb`, un modelo que convierte un trozo de voz en un vector de 192 números que identifica al hablante. Whisper ya devuelve las frases con sus tiempos, cortadas en pausas de medio segundo. Se recorta el audio de cada frase, se calcula su vector, y se agrupan los vectores parecidos. Cada grupo es un hablante.

**B. pyannote.audio, el diarizador abierto de referencia.** Un pipeline completo que detecta quién habla en cada instante, incluidos solapamientos y cambios de hablante a mitad de frase.

| | A. Vectores ECAPA | B. pyannote 3.1 |
| --- | --- | --- |
| Modelo nuevo | ninguno | sí, con acceso restringido en Hugging Face (token y aceptar condiciones) |
| Dependencias nuevas | scikit-learn para agrupar | pyannote.audio y sus versiones fijadas de torch |
| Coste en CPU | unos 20 ms por frase; una reunión de una hora, menos de un minuto | cerca del tiempo real; una hora de reunión, cerca de una hora. En la práctica pide GPU |
| Cambios de hablante dentro de una frase | no los ve | los ve |
| Dos personas hablando a la vez | no | sí |
| Dónde corre | en `plan-ai-voice`, que ya está desplegado | en `plan-ai-voice`, con GPU |
| Esfuerzo | 3 días | 5 o 6 días, más la GPU |

Empiezo por A. Cubre el caso normal de una reunión (la gente habla por turnos y las frases de Whisper ya cortan en las pausas), reutiliza un servicio que ya existe, no mete un modelo con licencia de acceso, y funciona en la CPU de Railway. B queda como mejora si A no llega en calidad con reuniones reales, y las dos van detrás del mismo endpoint con la misma respuesta, así que el backend no se entera del cambio.

## Diseño

### Servicio de voz: un endpoint nuevo

`POST /diarize` en `plan-ai/voice-ai/main.py`, protegido con la misma `x-api-key` que `/verify`.

Entrada (multipart):
- `audio`: la grabación del canal del sistema, como fichero. Se pasa a WAV mono de 16 kHz con `ffmpeg`. Al implementarlo cambié la URL del primer diseño por el fichero: el backend ya tiene los bytes en memoria porque acaba de mandárselos a Whisper, y así no se descarga la grabación dos veces.
- `segments`: JSON con `[{ "start": 12.4, "end": 15.1 }, ...]`, las frases de Whisper.
- `max_speakers`: tope, por defecto 8.
- `threshold`: distancia coseno para juntar dos voces, por defecto 0,5 (ajustado con la evaluación, ver abajo).

Salida:
```json
{ "num_speakers": 3, "labels": [0, 0, 1, 2, 1, ...] }
```
Un entero por segmento, en el mismo orden. Los números se asignan por orden de aparición, así que el primero que habla es el 0.

Dentro:
1. Recortar cada segmento del WAV. Los de menos de un segundo no dan un vector fiable: se apartan y al final heredan la etiqueta del vecino más cercano en el tiempo.
2. Vector ECAPA de cada segmento con `encode_batch`, normalizado.
3. Agrupación jerárquica aglomerativa, enlace medio y distancia coseno (`scipy.cluster.hierarchy`, que ya venía con SpeechBrain; no hace falta scikit-learn). Si salen más grupos que `max_speakers`, se corta el árbol con `cut_tree` en ese número exacto. `fcluster` en modo `maxclust` no sirve: con dos fusiones a la misma altura no puede parar entre ellas y junta a todos en un solo hablante, cosa que encontró un test.
4. Renumerar por primera aparición.

Tiempo estimado para una hora de reunión con 600 frases en la CPU de Railway: unos 15 segundos de cálculo más la descarga y el `ffmpeg`. El timeout de la llamada desde el backend será de 5 minutos, no los 30 segundos de `/verify`.

### Backend

Módulo nuevo `plan-ai/backend/src/services/stt/whisperDiarization.ts` con una función `assignSpeakers(source, utterances)` que llama a `/diarize`, aplica las etiquetas a `speaker` de cada frase y de cada palabra, y devuelve las frases. Si el servicio falla, devuelve las frases tal cual, todas con hablante 0, y añade el motivo a `diagnostics`. Una transcripción sin hablantes separados es mejor que ninguna, y el fallo queda anotado como pasa hoy con los canales.

Se engancha en `transcribeChannelWithWhisper` (`services/stt/whisperPrerecorded.ts`) con un parámetro `diarize` que `diarizeAudio` pone a `true` solo para el canal `Others`. Las etiquetas salen como `Others 0`, `Others 1`, igual que con Deepgram, así que `identifySpeaker`, los insights por hablante y el resto no cambian.

Configuración en `sttConfig.ts`:

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `WHISPER_DIARIZE` | `true` si hay `VOICE_AI_URL` | Apagarlo deja todo el sistema como `Others 0` |
| `WHISPER_DIARIZE_MAX_SPEAKERS` | `8` | Tope de hablantes en el canal del sistema |
| `WHISPER_DIARIZE_THRESHOLD` | `0.5` | Distancia coseno para juntar dos voces |

`VOICE_AI_URL` y `VOICE_AI_API_KEY` se reutilizan.

### Impacto en el código existente

Se tocan `transcribeChannelWithWhisper` (un solo llamador, `diarizeAudio`) y `diarizeAudio` (un solo llamador, `processPendingTranscript`). La ruta de Deepgram no cambia. El servicio Python gana un endpoint y no cambia los que tiene.

## Cómo saber si funciona

Sin audio real no hay manera de saberlo, y hay una referencia gratis: Deepgram. La misma grabación pasada por los dos proveedores tiene que dar el mismo número de hablantes y, frase por frase, la misma asignación (salvo renumeración).

Script `yarn stt:diarize-eval --recordings <carpeta>` que, para cada grabación del sistema, corre la pasada final con los dos proveedores, empareja etiquetas por mayor coincidencia y saca dos números: hablantes detectados frente a Deepgram, y porcentaje de frases con el mismo hablante.

Objetivo para dar el paso A por bueno: en cinco reuniones reales con tres o más personas en remoto, acertar el número de hablantes en cuatro y coincidir con Deepgram en el 85% de las frases o más. Si no se llega ajustando el umbral, se pasa a B detrás del mismo endpoint.

## Pasos

| Paso | Qué | Tiempo |
| --- | --- | --- |
| 1 | `/diarize` en `voice-ai` con recorte, vectores, agrupación y vecino más cercano para frases cortas. Prueba manual con dos voces de `say` en macOS | 1 día |
| 2 | `whisperDiarization.ts`, parámetro `diarize` en la pasada final, variables de entorno, tests con `fetch` simulado (etiquetas aplicadas a frases y palabras, fallo del servicio deja hablante 0 y anota el diagnóstico, el micro no se diariza) | 1 día |
| 3 | `yarn stt:diarize-eval`, pasar cinco grabaciones reales, ajustar umbral y mínimo de duración | 1 día |
| 4 | Documentación: quitar la limitación de `speech-to-text.md`, variables nuevas, README de `voice-ai` | 1 hora |

Tres días. El tercero es el que manda: sin grabaciones reales no hay forma de cerrar el umbral.

## Riesgos

- **Frases cortas.** "Sí", "vale", "ajá" duran menos de un segundo y no dan vector. Heredan el hablante más cercano en el tiempo, que casi siempre es quien acaba de hablar o quien va a seguir. Se medirá cuántas hay.
- **Dos voces parecidas** se juntan en un hablante; **una voz con mucho cambio de tono** se parte en dos. Es lo que ajusta el umbral, y es el motivo del paso 3.
- **Audio del sistema comprimido** (AAC a 128 kbps desde Zoom o Meet). El modelo ECAPA se entrenó con audio de todo tipo y aguanta bien la compresión, pero la música de espera y los avisos del sistema pueden crear "hablantes" fantasma. Filtrar segmentos con `no_speech_prob` alto ya los quita antes de llegar aquí.
- **Cambio de hablante a mitad de frase**, sin pausa. El corte de Whisper a medio segundo lo reduce, pero no lo elimina. Es el límite de A y lo que justificaría B.

## Lo que no entra

Separar hablantes en directo. Los subtítulos en vivo siguen por canal (micro y sistema); los hablantes aparecen en la transcripción final. Deepgram tampoco se usaba para eso en el directo: el backend nunca leía sus etiquetas de hablante en vivo.

## Resultados (25 de septiembre de 2026)

Medido contra la anotación humana del AMI Meeting Corpus (Universidad de Edimburgo, CC BY 4.0): cinco reuniones reales de cuatro personas, 2 horas y 11 minutos de audio en total, del conjunto de test de `pyannote/AMI-diarization-setup`. Es una referencia más exigente que Deepgram, que era lo previsto en el plan. El audio es la mezcla de los cuatro micrófonos de cabeza, que se parece a lo que llega por el canal del sistema en una reunión en remoto.

Acierto = parte del tiempo de habla anotado que queda atribuido a la persona correcta, después de emparejar etiquetas una a una.

| Reunión | Duración | Todo un hablante | Separado | Techo | Hablantes |
| --- | --- | --- | --- | --- | --- |
| ES2004a | 17 min | 43,1% | 84,1% | 85,8% | 4 de 4 |
| ES2004b | 39 min | 31,6% | 89,2% | 90,4% | 4 de 4 |
| IS1009a | 14 min | 59,2% | 82,1% | 86,7% | 4 de 4 |
| IS1009b | 34 min | 30,0% | 82,9% | 85,6% | 6 de 4 |
| TS3003a | 25 min | 85,6% | 93,6% | 95,8% | 3 de 4 |
| **Media** | | **49,9%** | **86,4%** | **88,8%** | **3 de 5** |

"Techo" es lo máximo posible con una etiqueta por frase de Whisper: el resto es habla de otra persona dentro de la misma frase (solapes y cambios sin pausa), que el método A no puede separar. La separación se queda a 2,4 puntos de ese techo.

Frente a los objetivos del plan: el acierto (85% o más) se cumple. El número de hablantes se acierta en tres de cinco, no en cuatro. IS1009b saca dos hablantes de más y TS3003a junta a un participante que casi no habla (en esa reunión una persona tiene el 85% del tiempo).

### Lo que se cambió por el camino

- **Fusión de grupos pequeños.** Sin ella salían siempre 8 hablantes (el tope) en vez de 4: frases sueltas raras (risas, ruido, solapes) formaban grupos propios. Fusionar los grupos con menos de 10 segundos de habla en el más parecido deja el número correcto en tres reuniones y sube el acierto medio de 85,9% a 86,4%.
- **El umbral casi no importa.** Entre 0,3 y 0,7 el resultado es idéntico en las cinco reuniones. Con 0,8 se acierta el número de hablantes en cuatro de cinco (86,7%), pero en la prueba sintética 0,7 ya juntaba dos voces femeninas distintas. Se queda en 0,5: partir a una persona en dos se arregla en la app renombrando las dos etiquetas igual, juntar a dos personas no tiene arreglo.
- **Velocidad.** La primera versión tardaba 111 s en una reunión de 17 minutos. Dos causas: lotes de 16 frases (SpeechBrain en CPU tarda 870 ms por frase en lotes de 16 y 46 ms en lotes de 4) y ventanas de 10 s (4 s dan el mismo acierto). Ahora la reunión de 39 minutos tarda 9,6 s.
- **Límite de 5 minutos del fetch de Node.** La transcripción de la reunión de 39 minutos fallaba con un "fetch failed" genérico: undici corta a los 5 minutos si el servidor no ha empezado a responder, y Whisper en CPU tardó casi 10. Afectaba a producción con cualquier reunión de más de unos 20 minutos. Las peticiones largas usan ahora un cliente sin ese límite (`services/stt/longRequest.ts`).

### Para reproducirlo

```bash
yarn --cwd plan-ai/backend stt:diarize-eval --dir <carpeta con .wav y .rttm> --language en --thresholds 0.5
```

Los `.wav` están en `groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/<id>/audio/<id>.Mix-Headset.wav` y los `.rttm` en `github.com/pyannote/AMI-diarization-setup` (`only_words/rttms/test`).

### Pendiente

Probarlo con reuniones reales en castellano y en árabe. La huella de voz no depende del idioma, pero cómo corta Whisper las frases sí.
