# ClassLab — Contexto esencial para agentes

> **Propósito:** contexto compacto para agentes de IA que planifican, implementan o revisan ClassLab. Este archivo resume decisiones y reglas conocidas; no inventes respuestas para temas marcados como pendientes.

## 1. Producto

ClassLab es una plataforma educativa enfocada en **evaluación formativa, diagnóstico de dificultades y retroalimentación docente**. El docente proporciona material académico (PDF en el MVP); el sistema lo procesa y propone preguntas. El docente revisa y edita el borrador antes de publicarlo. Los estudiantes responden y el sistema presenta resultados individuales y un diagnóstico grupal de preguntas/conceptos con más errores.

**Principios:** control docente; seguridad por diseño; códigos de acceso separados de la identidad interna; historial estable; validaciones críticas en backend; no exponer respuestas correctas antes de la liberación autorizada.

## 2. Arquitectura decidida

- **Frontend:** Angular.
- **Servicios de datos y plataforma:** Firebase. La solución contempla Firebase Authentication, Cloud Firestore y Cloud Storage según la necesidad de cada función.
- **Procesamiento backend:** FastAPI.
- **IA/LLM:** Groq como proveedor de inferencia.
- **Flujo de procesamiento:** PDF → extracción/limpieza de texto → FastAPI prepara la solicitud → Groq genera contenido estructurado → validación del resultado → Angular muestra borrador editable al docente.
- **Formato de salida de generación:** JSON estructurado y validado; no confiar en que la salida del modelo siempre sea válida.

La elección de Angular + Firebase + FastAPI + Groq está confirmada. No asumas que el modelo LLM específico, el enfoque CAG/RAG, el esquema final de Firestore ni el despliegue detallado ya están decididos. Evita agregar servicios o frameworks sin justificar su necesidad.

## 3. Roles y clases

- Hay usuarios con rol de **docente** o **estudiante**. En el MVP actual, la autenticación es con Google y toda cuenta nueva inicia como estudiante; el administrador concede el rol docente manualmente. Una cuenta puede conservar ambos roles y alternar entre los autorizados.
- Cada clase tiene un docente propietario y un identificador interno único, independiente del código de acceso.
- El docente configura la modalidad de incorporación y la capacidad máxima.
- Modalidades: **automática** o **con aprobación**.
- El código sirve para localizar/solicitar acceso a una clase; no sustituye autenticación ni autorización.
- Solo usuarios autenticados pueden ser miembros. No permitir membresías duplicadas ni solicitudes pendientes duplicadas para la misma pareja estudiante-clase.
- Las solicitudes pendientes no reservan plazas.
- Verificar capacidad al inscribir y al aceptar solicitudes. Las operaciones concurrentes deben validarse en backend/transacción, no solo en Angular.
- Una solicitud rechazada no crea membresía.
- Cambiar la modalidad no elimina miembros existentes.
- Al cambiar de aprobación a automática, rechazar todas las solicitudes pendientes; los estudiantes deben volver a intentarlo con el código vigente.
- Regenerar el código invalida el anterior para nuevas incorporaciones, pero no crea otra clase ni borra miembros, solicitudes, evaluaciones o resultados.
- Cerrar incorporaciones es distinto de regenerar el código.
- Si se reduce la capacidad por debajo de la cantidad actual de miembros, no expulsar a nadie automáticamente. Bloquear nuevas incorporaciones hasta aumentar la capacidad o retirar miembros explícitamente.

## 4. Evaluaciones y participaciones

- Una evaluación pertenece a una clase. Reutilizarla en otra clase implica crear una **copia independiente**.
- Mantener diferenciados los conceptos de evaluación, pregunta, publicación e intento/participación.
- El docente puede cargar un PDF, generar preguntas, revisar/editar el borrador y publicar.
- En el MVP se contemplan preguntas de opción múltiple, verdadero falso, unica respuesta, múltiple respuesta, resultados individuales y estadísticas grupales.
- Proteger claves de respuesta y explicaciones hasta su liberación autorizada. No incluirlas en respuestas o documentos accesibles por estudiantes antes de tiempo.
- Evitar que editar una evaluación altere silenciosamente intentos ya iniciados o resultados históricos; definir versionado estable para publicaciones/intentos antes de implementar esa parte.
- Los detalles de invitados, códigos de evaluación, intentos permitidos, temporizadores, navegación entre preguntas, aleatorización y momento de liberación de respuestas siguen pendientes.

## 5. Flujo funcional principal

1. El docente crea/configura una clase.
2. El estudiante localiza la clase con el código y se incorpora según modalidad y capacidad.
3. El docente carga un PDF.
4. FastAPI extrae/limpia el contenido y solicita generación a Groq.
5. Se valida el JSON generado y se presenta como borrador editable.
6. El docente revisa y publica la evaluación.
7. El estudiante responde según las reglas de publicación vigentes.
8. Se registran los intentos y se generan resultados individuales y diagnóstico grupal.
9. El docente usa el diagnóstico para reforzar temas con errores frecuentes.

## 6. Backlog inicial conocido

- **HU01:** registro/inicio de sesión y selección de rol (confirmar cómo encaja con el método de autenticación final).
- **HU02.1:** extraer y limpiar texto del PDF.
- **HU02.2:** procesar texto con LLM y producir JSON estricto de preguntas/opciones.
- **HU03.1:** el docente carga un PDF para iniciar la creación de una evaluación.
- **HU03.2:** generar el cuestionario y asignarle un identificador/código de acceso.
- **HU04.1:** el estudiante localiza una evaluación activa mediante el código/identificador proporcionado.
- **HU04.2:** el estudiante responde preguntas de opción múltiple y envía resultados.
- **HU05.1:** el docente consulta un reporte de preguntas/conceptos con más errores.

También deben cubrirse la administración de clases y miembros, solicitudes de acceso, revisión de preguntas, publicaciones, control de acceso, versionado y diagnóstico. No inventar IDs de historias para estas funciones sin actualizar el backlog.

## 7. Pendientes que requieren decisión explícita

1. Definir el reemplazo del procedimiento manual de asignación docente por una administración segura dentro de la aplicación.
2. Definir modelo de datos de Firestore, reglas de seguridad y límites entre cliente y FastAPI. **Decidido (parcial):** el perfil se guarda en la colección `users`, con `id = uid` de Firebase Auth y campos `firstName`, `lastName` (obligatorios), `email`, `photoURL`, `providerId`, `age`, `gender`, `phoneNumber`, `locale`, `roles` (`['student']`), `createdAt`, `updatedAt`, `lastLoginAt`. Solo el dueño puede leer su documento; las reglas de `firestore.rules` validan el esquema en `create`/`update`. **Decidido (parcial):** las clases viven en `classes/{classId}` (id autogenerado) con `name`, `ownerTeacherId`, `capacity`, `unlimited` (si es `true` se ignora `capacity`), `modality` (`auto`/`approval`), `accessCode` (6 caracteres, independiente del id), `joinOpen`, `memberCount`, `status` y timestamps; los integrantes en `classes/{classId}/members/{uid}` (`firstName`, `lastName`, `email`, `roleInClass`, `isOwner`, `status`, `joinedAt`), y el mapeo `classCodes/{CODE} -> { classId }` para resolver el código sin enumerar clases. **Decidido (parcial):** las subcolecciones de clase son `classes/{classId}/evaluations`, `classes/{classId}/publications` y `classes/{classId}/results`; como Firestore no permite colecciones vacías, **no** se crean al crear la clase sino con el primero de sus documentos, y sus reglas se añadirán cuando existan escritores/lectores reales. `results` se leerá filtrando por el campo que guarde el UID del estudiante (cada estudiante ve solo lo suyo; el docente propietario ve todo). **Decidido (parcial):** los borradores se guardan en `classes/{classId}/evaluations/{evaluationId}` (id autogenerado por Firestore) con `title`, `status: 'draft'`, `sourceFiles` (solo metadatos), `rawJson` (texto JSON con el arreglo de preguntas generadas; el cliente lo interpreta y lo reescribe al editar), `generationMeta` (`model`, `pdfPages`, `pdfCharacters`, `requestedQuestions`, `durationMs`, `schemaVersion`), `createdBy` y timestamps; solo el docente propietario puede leerlos/escribirlos. **Decidido (parcial):** las publicaciones se guardan en `classes/{classId}/publications/{publicationId}` como copia independiente de una evaluación, con `evaluationId`, `title`, `accessCode`, `sourceFiles`, `rawJson` saneado, `rawJsonSafe: true`, `generationMeta`, `openAt`/`closeAt` (opcionales), `maxAttempts`, `attemptCount`, `createdBy` y timestamps; los miembros activos pueden leer/listar los documentos con `rawJsonSafe: true`, el docente propietario los gestiona y editar la publicación no altera la evaluación original. Las preguntas completas con claves se guardan en `.../content/feedback`. Los PDFs se almacenan en IndexedDB del navegador. Al generar, el primer PDF seleccionado se envía a la API local FastAPI (`POST {apiBaseUrl}/api/v1/cuestionario`, multipart con `archivo` y `num_preguntas` entre 5 y 30); FastAPI extrae el texto y llama a Groq, y el cliente valida/mapea el JSON y persiste el borrador. La URL se configura en `environment.apiBaseUrl`. El esquema de intentos/participaciones se detalla en la sección 10.
3. Definir qué operaciones usan Firebase directamente y cuáles deben pasar por FastAPI.
4. Elegir modelo concreto de Groq y validar calidad, costo, latencia y formato de salida.
5. Decidir si usar CAG, RAG u otra estrategia contextual; no dar por elegida ninguna.
6. Definir estados de clase (incluido archivado) y ciclo de vida.
7. Definir modalidades de publicación, acceso por código y admisión de invitados. **Decidido (parcial):** la incorporación a clases usa el `accessCode` de 6 caracteres (resuelto vía `classCodes/{CODE} -> { classId }`); en modalidad `auto` el estudiante se agrega como miembro `active` en una transacción que respeta `capacity`/`memberCount`, y en `approval` queda como `pending` hasta que el docente apruebe. El docente propietario aprueba (`pending`→`active`, con revalidación de capacidad en transacción) o rechaza (elimina el `pending`) las solicitudes; el estudiante puede salir de la clase (elimina su membresía y ajusta `memberCount` en transacción). El docente propietario puede editar la clase (nombre, `capacity`/`unlimited`, modalidad), abrir/cerrar incorporaciones (`joinOpen`) y regenerar el código (crea el nuevo `classCodes` y elimina el anterior sin tocar la clase ni los miembros); al pasar de `approval` a `auto` se rechazan todas las solicitudes `pending`. **Decidido (parcial):** el acceso de invitados a una publicación es opt-in del docente (`guestAccess`), exige una `guestCapacity` obligatoria (1–500) y cada invitado consume una vacante al iniciar su primer intento; la configuración queda congelada cuando la publicación ya tiene intentos. Sigue pendiente el rate limiting y la regeneración del código de publicación.
8. Definir intentos, expiración, desconexiones, temporizadores y navegación entre preguntas.
9. Definir versionado de evaluación/publicación/intento y cuándo se liberan respuestas.
10. Definir métricas mínimas del diagnóstico y si los resultados son solo formativos o también calificativos.

## 8. Instrucciones de trabajo para el agente

- Antes de cambiar código, identifica qué regla de negocio o historia respalda el cambio.
- Conserva la separación de responsabilidades: Angular presenta/interactúa; Firebase gestiona las capacidades que se hayan asignado a la plataforma; FastAPI realiza procesamiento backend; Groq genera contenido mediante LLM.
- Mantén la organización del frontend por dominio: `core/{auth,attempts,classes,evaluations,publications,shared}` y `pages/{account,home,classes,evaluations,publications}`; usa imports relativos directos, sin barrels.
- No pongas secretos de Groq ni credenciales privadas en Angular. Las llamadas que requieren la clave del proveedor deben realizarse desde FastAPI.
- Valida en servidor toda regla de autorización, capacidad, publicación, envío de respuestas y acceso a claves de corrección.
- Valida y maneja errores de salida del LLM; no persistas ni publiques JSON sin comprobar su estructura.
- No borres historial ni cambies retroactivamente intentos por regenerar códigos o editar borradores.
- Si una decisión pendiente afecta el diseño, pregunta o presenta opciones con consecuencias antes de implementarla.
- Actualiza este archivo cuando una decisión importante se confirme; manténlo breve y mueve el detalle extenso a documentación temática.

## 9. Criterios mínimos de aceptación transversales

- No se excede la capacidad incluso con operaciones concurrentes.
- No hay miembros ni solicitudes pendientes duplicados.
- Regenerar el código no elimina historial ni altera la identidad de la clase.
- Las solicitudes pendientes se rechazan al cambiar de aprobación a automática.
- Reducir capacidad no expulsa miembros existentes.
- Copiar una evaluación produce una entidad independiente.
- Los estudiantes no pueden acceder a claves de respuesta antes de la liberación permitida.
- Los intentos conservan una versión coherente de la evaluación con la que se realizaron.

## 10. Publicaciones e intentos (implementado)

- `publicationCodes/{CODE} -> { classId, publicationId }` resuelve el código de publicación. El acceso exige membresía activa o una sesión anónima con invitados habilitados.
- `classes/{classId}/publications/{publicationId}` guarda `rawJson` saneado (sin respuestas ni explicaciones) y `rawJsonSafe: true`, además de `guestAccess`, `guestCapacity` y `guestCount`. Los miembros activos pueden leer/listar estas publicaciones, incluida la página de la clase; los invitados anónimos solo pueden leer (`get`) cuando `guestAccess` está habilitado, nunca listar.
- Invitados: `guestCount` se incrementa una sola vez por invitado, en la misma transacción que crea su `results/{uid}` y su primer intento. Las reglas exigen el incremento de `guestCount` y `attemptCount` para aceptar el resultado, y `guestCount <= guestCapacity`. Con `attemptCount > 0` la política de invitados queda congelada. Los resultados de invitados aparecen en el reporte del docente con el nombre escrito; el UID anónimo es efímero.
- `.../content/feedback` guarda el JSON completo con claves y explicaciones. Lo lee el docente propietario siempre y el estudiante solo cuando su resultado tiene `hasSubmitted: true`.
- `.../content/questions` ya no se usa.
- `.../results/{uid}` guarda un documento por estudiante con `studentName`, `publicationTitle`, `hasSubmitted`, `attempts[]` y timestamps.
- En la página de la clase, una publicación con todos los intentos agotados y al menos un envío se mueve de `Publicaciones` a `Resultados`; su enlace abre la vista de solo lectura (`?view=result`) con el último intento enviado.
- El docente propietario accede desde la card `Resultados` al reporte agregado de cada publicación (`/classes/:classId/publications/:publicationId/results`). Usa el último intento enviado por estudiante y muestra distribución por opción, pregunta con más fallas, pregunta con más aciertos y un listado de estudiantes oculto por defecto.
- El intento se crea al abrir la publicación; las ventanas bloquean intentos nuevos pero permiten terminar uno en curso. Se usa una sola página con autoguardado.
- La publicación tiene `durationMinutes` opcional (`null` = sin límite); por defecto 30. El plazo se calcula con `startedAt` del intento + `durationMinutes` y se compara con la hora actual (sin backend). Al vencer, el intento se envía automáticamente con lo guardado y no se puede continuar.
- Con timer, el alumno puede salir y reanudar mientras no venza; el invitado siempre envía su intento al salir. Sin timer, la primera salida de alumno o invitado envía el intento. Al volver, un intento pendiente se auto-envía y, si `maxAttempts` lo permite, se inicia otro.
- Puntaje: `(aciertos / total_correctas) * puntos`, sin penalización por opciones incorrectas. Se calcula al mostrar el resultado.
- `attemptCount` incrementa al iniciar un intento nuevo (no al reanudar). Con `attemptCount > 0` la publicación y `content/feedback` quedan bloqueados para edición (UI, servicio y reglas); `hasAttempts` se deriva en el cliente.
- Rutas: `/publications/join` (miembros), `/guest` (invitados con código de publicación) y `/classes/:classId/publications/:publicationId/take` (miembros o invitados).
- La sesión anónima persiste entre recargas. `/home` muestra una vista de invitado con acceso por código, inicio de sesión y cierre de la sesión anónima. Entrar a `/access` cierra la sesión anónima (después del guard de intento); las rutas registradas (`/classes`, `/profile`, joins y evaluaciones) redirigen a los invitados a `/access`, mientras que `/take` sigue permitiéndoles responder.
- El esquema anterior de `classes/{classId}/results` queda reemplazado por los resultados anidados bajo cada publicación.
