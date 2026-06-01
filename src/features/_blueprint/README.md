# Feature blueprint

Plantilla para crear features nuevas. Copia esta carpeta con el nombre de tu feature:

```bash
cp -r src/features/_blueprint src/features/mi-feature
```

## Subcarpetas

```
features/<feature>/
|-- components/   # UI React
|-- hooks/        # Custom hooks
|-- services/     # Server actions / endpoints
|-- types/        # TypeScript types
`-- store/        # Estado local (Zustand)
```

## Principios

1. **Autocontenida** — todo lo de la feature vive aqui.
2. **Colocalizada** — Claude Code entiende el contexto completo sin navegar.
3. **Sin importaciones cruzadas** — no importes desde otra feature.
4. **Reutilizacion por `core/`** — lo compartido vive en `src/core/`.

## Ejemplo: feature "auth"

```
features/auth/
|-- components/
|   |-- LoginForm.tsx
|   `-- SignupForm.tsx
|-- hooks/
|   `-- useAuth.ts
|-- services/
|   `-- authService.ts
|-- types/
|   `-- User.ts
`-- store/
    `-- authStore.ts
```
