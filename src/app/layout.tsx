import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Copiloto de Datos del Negocio',
  description:
    'Chat de solo lectura sobre tu base de datos Oracle: preguntá en lenguaje natural y obtené respuestas con su consulta SQL y tablas de resultados.',
};

export const viewport: Viewport = {
  themeColor: '#0d0d0d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark h-full antialiased">
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
