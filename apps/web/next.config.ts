import type { NextConfig } from 'next'

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : 'izyoixhffjjodzizkbqk.supabase.co'

const nextConfig: NextConfig = {
  // Los paquetes del monorepo se publican como TypeScript sin compilar: Next
  // los transpila junto con la aplicación, así no hay paso de build intermedio
  // ni artefactos que se queden desincronizados del código fuente.
  transpilePackages: ['@lumane/ui-web', '@lumane/db', '@lumane/tokens'],

  images: {
    // Toda la fotografía vive en Supabase Storage y se sirve por su endpoint de
    // transformación, que ya redimensiona y recomprime en el origen.
    remotePatterns: [
      { protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Next genera AGENTS.md/CLAUDE.md en cada arranque. El proyecto ya tiene
  // su propia documentación en /docs, así que se desactiva para no ensuciar
  // el árbol con archivos que nadie mantiene.
  agentRules: false,

  experimental: {
    // El carrito y el checkout se operan con Server Actions; los payloads son
    // pequeños salvo la subida de imágenes del administrador.
    serverActions: { bodySizeLimit: '4mb' },
  },
}

export default nextConfig
