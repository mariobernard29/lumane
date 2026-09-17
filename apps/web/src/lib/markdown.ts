import 'server-only'

import DOMPurify from 'isomorphic-dompurify'
import { Marked } from 'marked'

/**
 * Markdown → HTML para las páginas de contenido.
 *
 * Solo el personal con permiso `cms.write` puede escribir estos cuerpos (lo
 * garantiza RLS), así que no es contenido de origen desconocido. Aun así se
 * SANEA con una lista blanca estricta: una cuenta de la boutique comprometida
 * no debe poder inyectar un script en el navegador de sus clientas.
 *
 * Se renderiza en el servidor. El HTML que llega al navegador ya está limpio.
 */

const marked = new Marked({
  // Un salto de línea simple no crea párrafo: el texto se escribe con líneas
  // largas y `gfm` respeta eso.
  gfm: true,
  breaks: false,
})

/** Etiquetas que pueden aparecer en una página de contenido. Nada más. */
const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h2', 'h3', 'h4',
  'strong', 'em', 'del', 'code',
  'ul', 'ol', 'li',
  'blockquote',
  'a',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]

export async function renderMarkdown(source: string | null | undefined): Promise<string> {
  if (!source) return ''

  const html = await marked.parse(source)

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'title'],
    // Solo enlaces navegables: fuera `javascript:` y `data:`.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|#)/i,
    // `h1` lo pone la página con el título; en el cuerpo sobra.
    FORBID_TAGS: ['h1', 'style', 'script', 'iframe', 'form', 'input'],
  })
}

/**
 * Enlaces externos con `rel` de seguridad.
 *
 * `noopener` evita que la pestaña destino pueda manipular la nuestra, y
 * `noreferrer` no filtra de qué página salió. Se hace tras sanear para no
 * depender de que DOMPurify conserve atributos.
 */
export function hardenExternalLinks(html: string, siteHost: string): string {
  return html.replace(/<a href="(https?:\/\/[^"]+)"/g, (match, url: string) => {
    try {
      if (new URL(url).host === siteHost) return match
    } catch {
      return match
    }
    return `${match} target="_blank" rel="noopener noreferrer"`
  })
}
