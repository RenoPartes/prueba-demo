# Features — arquitectura Feature-First

Cada feature vive aislada. La carpeta contiene todo su contexto (UI, logica, estado, tipos) para que Claude Code entienda la superficie completa sin navegar entre carpetas. Este patron corresponde al **modular monolith** descrito en DDD.

## Estructura estandar

Usa `_blueprint/` como base para nuevas features:

```bash
cp -r src/features/_blueprint src/features/mi-feature
```

## Features presentes

### `auth/`
Flujo de autenticacion con Supabase. Ejecuta `/auth-stack` para inyectar el contenido real (login, signup, reset, OAuth, profiles, RLS).

### `dashboard/`
Area autenticada. Placeholder: componer widgets y layout aqui.

## Principios

1. **Colocalizacion** — todo lo relacionado con una feature vive en su carpeta.
2. **Autocontenida** — la feature funciona sin importar de otra feature.
3. **Sin dependencias cruzadas** — features no se importan entre si.
4. **Compartir via `core/`** — codigo reutilizable vive en `src/core/`.

## Anatomia de una feature

```
features/mi-feature/
|-- components/        # UI React
|-- hooks/             # Logica React (useX)
|-- services/          # Server actions / endpoints
|-- store/             # Estado (Zustand)
`-- types/             # Tipos compartidos dentro de la feature
```

## Reglas

- `features/auth/components/LoginForm.tsx` puede importar de `core/ui/Button.tsx`. OK.
- `features/auth/...` no importa de `features/dashboard/...`. Siempre NO.
- Cada feature tiene su propio store local (Zustand). No pongas todo en un store global.
