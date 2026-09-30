# AMPA Agustinos Granada — Gestión de Familias

Aplicación Vite + React para la gestión interna de familias asociadas al AMPA: altas y renovaciones, directorio, cursos académicos, carnés, listados PDF e importación/exportación.

## Estado actual

El frontend está preparado para ejecutarse como prototipo local. La persistencia y la autenticación actuales se apoyan en `localStorage`; **no deben utilizarse con datos reales en un despliegue público**. Antes de producción hay que sustituirlas por una API y una base de datos central con autenticación en servidor y control de permisos.

## Desarrollo local

```bash
npm install
npm run dev
```

## Comprobaciones

```bash
npm run lint
npm run build
```

## Siguiente paso recomendado para producción

1. Mantener React/Vite y la interfaz actual.
2. Sustituir `src/services/db.ts` por un repositorio conectado a API.
3. Sustituir `src/services/authService.ts` por autenticación de servidor con contraseñas hasheadas y sesiones seguras.
4. Migrar familias, tutores, alumnos, cursos, usuarios y configuración a una base de datos central.
5. Añadir copias de seguridad, registro de actividad y política de protección de datos.
