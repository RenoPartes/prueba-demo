import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Salida standalone: empaqueta solo lo necesario para correr en un contenedor
  // (server.js + node_modules traceados). Imprescindible para la imagen Docker.
  output: 'standalone',
  // MCP server (/_next/mcp) es una herramienta de desarrollo: se desactiva en
  // produccion para no exponer superficie innecesaria.
  experimental: {
    mcpServer: process.env.NODE_ENV !== 'production',
  },
  // oracledb es un paquete nativo de servidor: el bundler no debe intentar
  // empaquetarlo. Las rutas que lo usan corren en runtime Node (no Edge).
  serverExternalPackages: ['oracledb'],
}

export default nextConfig
