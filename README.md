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
- `classes/{classId}/evaluations` y `classes/{classId}/publications`: reservadas para fases posteriores.

La incorporación usa el código: en modalidad `auto` el estudiante entra directo (respetando las vacantes, con transacción; con `unlimited` no hay tope) y en `approval` queda `pending` hasta que el docente apruebe. El docente propietario aprueba o rechaza solicitudes (la aprobación revalida la capacidad en transacción) y los estudiantes pueden salir de la clase. El docente puede editar nombre, vacantes/`unlimited` y modalidad, abrir/cerrar incorporaciones y regenerar el código (lo que invalida el anterior sin borrar historial).

**Fase actual:** Fases 1–4 completas (crear/listar, ingresar por código, moderación y salida, edición de clase).

## Desarrollo

```bash
npm install
npm start
npm test
```

Los entornos contienen solo la configuración pública necesaria para Firebase Authentication y Firestore. Nunca agregues claves Groq, cuentas de servicio u otros secretos al frontend.

## Límites actuales

- Firestore bloquea por defecto todos los datos excepto la creación/lectura del perfil propio.
- La evaluación de invitado crea una sesión anónima y guarda su nombre solo durante la sesión; aún no valida códigos ni guarda intentos.
- Cloud Storage está desactivado temporalmente: materiales, carga de PDF y sus reglas se implementarán cuando el servicio pueda activarse.
- Clases: se crean, se listan, muestran su plantilla de integrantes, permiten unirse por código (automático o con solicitud pendiente), aprobar/rechazar solicitudes, salir de la clase y editar la clase (nombre, vacantes con opción `unlimited`, modalidad, abrir/cerrar incorporaciones y regenerar código).
- La capacidad se controla con transacciones de Firestore; el blindaje definitivo contra concurrencia requiere backend/Cloud Functions.
- Generación IA, preguntas, resultados y reglas de publicación pertenecen a hitos posteriores.
