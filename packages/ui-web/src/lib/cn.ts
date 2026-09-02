import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * `tailwind-merge` no conoce los tokens de Lumane: sin esta configuración
 * trataría `text-label-upper` (un tamaño) y `text-secondary` (un color) como
 * la misma propiedad y borraría uno de los dos. El prototipo los usa juntos
 * en cada botón, así que hay que enseñárselos.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display-xl',
            'display-xl-mobile',
            'headline-lg',
            'headline-lg-mobile',
            'headline-md',
            'headline-sm',
            'quote',
            'body-lg',
            'body-md',
            'nav-link',
            'label-upper',
            'price',
          ],
        },
      ],
      'font-family': [
        {
          font: [
            'display-xl',
            'display-xl-mobile',
            'headline-lg',
            'headline-lg-mobile',
            'headline-md',
            'headline-sm',
            'quote',
            'body-lg',
            'body-md',
            'nav-link',
            'label-upper',
            'price',
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
