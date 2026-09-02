import type { ReactNode } from 'react'

import { cn } from '../lib/cn.ts'
import { Icon } from './Icon.tsx'

export interface AccordionItem {
  /** Numeración editorial del prototipo: "01", "02", "03". */
  number?: string
  title: string
  content: ReactNode
  defaultOpen?: boolean
}

/**
 * Acordeón de la ficha de producto.
 *
 * Usa `<details>`/`<summary>` nativos: se abre y se cierra sin JavaScript,
 * el navegador ya lo hace accesible por teclado, y el buscador indexa el
 * contenido aunque esté plegado. El icono es un "+" que rota 45° hasta
 * convertirse en "×" (regla `.accordion-item[open]` de `globals.css`).
 */
export function Accordion({ items, className }: { items: AccordionItem[]; className?: string }) {
  if (items.length === 0) return null

  return (
    <div className={cn('border-t border-primary', className)}>
      {items.map((item, index) => (
        <details
          key={item.title}
          className="accordion-item border-b border-primary"
          open={item.defaultOpen ?? index === 0}
        >
          <summary className="w-full py-5 flex justify-between items-center">
            <span className="flex items-center gap-4">
              {item.number ? (
                <span className="font-headline-sm text-headline-sm text-secondary">
                  {item.number}
                </span>
              ) : null}
              <span className="font-label-upper text-label-upper uppercase">{item.title}</span>
            </span>
            <Icon name="add" size={20} className="accordion-icon transition-transform duration-300" />
          </summary>
          <div className="accordion-content">
            <div className={cn('pb-6', item.number && 'pl-12')}>{item.content}</div>
          </div>
        </details>
      ))}
    </div>
  )
}
