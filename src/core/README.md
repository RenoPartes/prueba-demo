# core — codigo reutilizable entre features

Todo lo que mas de una feature necesita vive aqui. `core/` reemplaza al `shared/` de generaciones anteriores del scaffold — mismo proposito, taxonomia reagrupada.

## Subcarpetas

### `ui/`
Primitivos visuales (shadcn/ui se instala aqui). Botones, inputs, modales, etc.

### `hooks/`
Custom hooks agnosticos al dominio (`useDebounce`, `useMediaQuery`, `useLocalStorage`).

### `lib/`
Utilidades y helpers (`cn`, formatters, validators).

### `adapters/`
Clientes tipados a servicios externos. Aqui vive `adapters/supabase/` (browser + server), y se agregan `adapters/resend/`, `adapters/stripe/`, etc. conforme el proyecto integra servicios.

### `config/`
Constantes de aplicacion (rutas, feature flags, limites). Nada de valores computados aqui.

### `primitives/`
Assets compartidos (SVGs, tokens, fuentes locales).

## Reglas

1. **Sin logica de negocio**. La logica especifica vive en `features/`.
2. **Tipado con TypeScript**. Nada de `any`.
3. **JSDoc en exports publicos** no triviales.
4. **Import via alias `@/core/...`**. Nunca relativos profundos.

## Ejemplo — adapter Supabase

```ts
// core/adapters/supabase/browser.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

Uso desde una feature:

```ts
import { createClient } from '@/core/adapters/supabase/browser';
```
