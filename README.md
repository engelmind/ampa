# AMPA Agustinos Granada — Gestión de Familias

Aplicación privada de gestión administrativa para el AMPA Agustinos Granada.

## Arquitectura

- Frontend React + Vite desplegado en Vercel.
- API privada en Supabase Edge Functions.
- PostgreSQL central en Supabase.
- Sesiones seguras mediante cookie HttpOnly.
- Roles Superadministrador, Administrador y Consulta, validados en servidor.
- Registro de actividad.
- Snapshots automáticos diarios y copias previas a operaciones sensibles.

## Funcionalidades

- Gestión completa de familias, tutores y varios alumnos por familia.
- Renovaciones e histórico por curso académico.
- Cálculo asistido de etapa y curso.
- Directorio con búsqueda, filtros y ordenación.
- Control de fichas incompletas y consentimientos.
- Importación asistida CSV/JSON con previsualización y validación.
- Exportación CSV/JSON y listados PDF.
- Carnet de socio en PDF.
- Gestión de usuarios y roles.
- Copias internas y restauración protegida.
- Auditoría de acciones relevantes.

## Desarrollo local

```bash
npm install
npm run dev
```

## Comprobaciones

```bash
npm run build
```

El repositorio contiene también la Edge Function en `supabase/functions/ampa-api` y el esquema de base de datos en `db/schema.sql`.
