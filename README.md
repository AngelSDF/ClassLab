# ClassLab

Base Angular + Firebase para una plataforma de evaluación formativa. La generación PDF/CAG/Groq está maquetada; todavía no existe backend ni procesamiento real.

## Conectar Firebase de desarrollo

1. Crea un proyecto Firebase en la región que corresponda a tu audiencia. La ubicación de Firestore no se puede cambiar: migrar exige un proyecto nuevo.
2. Registra una aplicación web. En Authentication habilita **Google** y **Anonymous**, y crea Firestore.
3. La configuración pública de `claab-8677f` está presente en ambos entornos para poder probar con `npm start` y desplegar. No contiene credenciales administrativas ni secretos.
4. Ejecuta `npx firebase-tools login`, seguido de `npx firebase-tools use claab-8677f`.
5. Compila y despliega con `npm run build` y `npx firebase-tools deploy --only hosting,firestore:rules`.

El usuario que inicia con Google recibe el rol `student`. Para asignar `teacher`, un administrador debe editar `users/{uid}.roles` en Firestore Console y agregar `teacher`. El cliente no puede cambiar roles.

Al completar el onboarding, el perfil se guarda en `users/{uid}` con: `firstName`, `lastName` (obligatorios), `email`, `photoURL`, `providerId` (desde Google), `age`, `gender`, `phoneNumber`, `locale` (opcionales) y `roles` (`['student']`), más `createdAt`, `updatedAt` y `lastLoginAt`.

## Modelo de clases

- `classes/{classId}` (id autogenerado): `name`, `ownerTeacherId`, `capacity` (vacantes), `unlimited` (si es `true`, se ignora `capacity`), `modality` (`auto`/`approval`), `accessCode` (6 caracteres), `joinOpen`, `memberCount`, `status`, timestamps.
- `classes/{classId}/members/{uid}`: `uid`, `firstName`, `lastName`, `email`, `roleInClass` (`student`/`teacher`), `isOwner`, `status` (`active`/`pending`), `joinedAt`. El creador entra como miembro con `isOwner: true`.
- `classCodes/{CODE}` → `{ classId }`: resuelve el código de acceso a la clase sin permitir enumerarlas.
- `classes/{classId}/evaluations/{evaluationId}`: borradores con `title`, `status` (`draft`), `sourceFiles` (metadatos), `rawJson` (texto JSON con el arreglo de preguntas generadas), `generationMeta` (`model`, `pdfPages`, `pdfCharacters`, `requestedQuestions`, `durationMs`, `schemaVersion`), `createdBy` y timestamps. El cliente interpreta `rawJson` en preguntas tipadas (`opcion_unica`, `opcion_multiple` o `verdadero_falso`), y al guardar cambios lo reescribe. Solo el docente propietario puede leerlos, escribirlos y eliminarlos.
- `classes/{classId}/publications/{publicationId}`: copia independiente de una evaluación al publicarla, con `evaluationId`, `title`, `accessCode`, `sourceFiles`, `rawJson` saneado, `rawJsonSafe: true`, `generationMeta`, `openAt`/`closeAt` (opcionales, `null` si no hay ventana horaria), `maxAttempts`, `guestAccess`, `guestCapacity` (0–500; ≥1 si hay invitados), `guestCount`, `attemptCount`, `createdBy` y timestamps. Los miembros activos pueden leer/listar las publicaciones saneadas; el docente propietario las gestiona y editar o eliminar la evaluación original no altera la publicación. El detalle completo con claves vive en `.../content/feedback`.
- `classes/{classId}/results`: subcolección reservada para fases posteriores. Firestore no permite crear subcolecciones vacías, así que **no** se materializa al crear la clase: existe desde el primer documento real que se escriba. Se leerá por el estudiante filtrando por el campo que guarde su UID (solo verá sus propios resultados); el docente propietario verá todos. Sus reglas se añadirán cuando existan escritores/lectores reales.

La incorporación usa el código: en modalidad `auto` el estudiante entra directo (respetando las vacantes, con transacción; con `unlimited` no hay tope) y en `approval` queda `pending` hasta que el docente apruebe. El docente propietario aprueba o rechaza solicitudes (la aprobación revalida la capacidad en transacción) y los estudiantes pueden salir de la clase. El docente puede editar nombre, vacantes/`unlimited` y modalidad, abrir/cerrar incorporaciones y regenerar el código (lo que invalida el anterior sin borrar historial).

**Fase actual:** Fases 1–4 completas (crear/listar, ingresar por código, moderación y salida, edición de clase) y generación, guardado, edición, eliminación y publicación de borradores contra la API local FastAPI + Groq (`environment.apiBaseUrl`, por defecto `http://localhost:8000`). La publicación crea una copia independiente en `publications` con programación opcional e intentos; el docente puede listarlas y editarlas sin alterar el borrador original.

## Desarrollo

Los archivos reales de entorno no se versionan. Copia el ejemplo para crearlos localmente:

```bash
cp src/environments/environment.example.ts src/environments/environment.ts
cp src/environments/environment.example.ts src/environments/environment.development.ts
```

Ajusta `production`, los datos de tu proyecto Firebase y `apiBaseUrl` en cada archivo.

```bash
npm install
npm start
npm test
```

Los entornos contienen solo la configuración pública necesaria para Firebase Authentication y Firestore. Nunca agregues claves Groq, cuentas de servicio u otros secretos al frontend.

## Límites actuales

- Firestore permite perfil, clases, membresías, borradores de evaluación y publicaciones con sus reglas; el resto de datos sigue bloqueado por defecto.
- El acceso de invitado crea una sesión anónima, resuelve el código de publicación y permite responder sin unirse a la clase. Solo funciona si el docente habilitó invitados y asignó vacantes en la publicación; cada invitado consume una vacante al iniciar su primer intento y el nombre se guarda en el resultado. La sesión y el cupo se validan en Firestore; si se borra el almacenamiento del navegador se pierde el UID anónimo y el acceso a intentos previos.
- Los PDFs se guardan en IndexedDB del navegador; Cloud Storage sigue desactivado. La generación envía solo el primer PDF seleccionado a la API local (FastAPI + Groq).
- Clases: se crean, se listan, muestran su plantilla de integrantes, permiten unirse por código (automático o con solicitud pendiente), aprobar/rechazar solicitudes, salir de la clase y editar la clase (nombre, vacantes con opción `unlimited`, modalidad, abrir/cerrar incorporaciones y regenerar código).
- La capacidad se controla con transacciones de Firestore; el blindaje definitivo contra concurrencia requiere backend/Cloud Functions.
- Los intentos y resultados ya están implementados para publicaciones con código (ver la sección final). La publicación guarda una copia independiente de la evaluación con ventana horaria opcional y número de intentos; el docente puede listarla y editarla sin tocar el borrador original.

## Publicaciones e intentos (implementado)

- `publicationCodes/{CODE}` -> `{ classId, publicationId }`: el código de 6 caracteres localiza la publicación.
- `classes/{classId}/publications/{publicationId}` contiene las preguntas saneadas en `rawJson` (sin respuestas ni explicaciones) y `rawJsonSafe: true`; los miembros activos pueden verla desde la clase y responder.
- `.../content/feedback` contiene las preguntas completas con claves; lo lee el docente siempre y el estudiante después de enviar un intento.
- `.../content/questions` ya no se usa.
- `.../results/{uid}` guarda `hasSubmitted` y `attempts[]`; un intento se crea al abrir la publicación, se reanuda si está en curso y consume `maxAttempts`.
- Las ventanas horarias bloquean intentos nuevos, pero permiten terminar un intento ya iniciado.
- El puntaje es proporcional: `(aciertos / total_correctas) * puntos`, sin penalización por opciones incorrectas.
- `attemptCount` incrementa al iniciar un intento nuevo. Con `attemptCount > 0` se bloquea la edición en UI, servicio y reglas; `hasAttempts` se deriva en el cliente.
- Invitados: el docente habilita `guestAccess` y fija `guestCapacity` (obligatoria) al crear o editar la publicación. `guestCount` se incrementa una sola vez por invitado, en la misma transacción que crea su resultado y su primer intento. La configuración queda congelada cuando `attemptCount > 0`. Los invitados aparecen en el reporte con el nombre que escribieron.
- Rutas: `/publications/join` para miembros con código, `/guest` para invitados con código de publicación y `/classes/:classId/publications/:publicationId/take` para responder.
