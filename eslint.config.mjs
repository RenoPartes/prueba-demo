// ESLint flat config para Next.js 16 (next lint fue removido en v16).
// eslint-config-next v16 exporta arrays de flat config directamente.
import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '.claude/**', 'docs/**'],
  },
]

export default config
