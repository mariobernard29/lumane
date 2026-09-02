import Link from 'next/link'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cn } from '../lib/cn.ts'
import { Icon } from './Icon.tsx'

/**
 * Botones de Lumane.
 *
 * Todas las variantes comparten la misma gramática del prototipo:
 * tipografía `label-upper` (11px / 700 / tracking .16em) en mayúsculas, radio
 * cero, borde de 1px, y un hover que INVIERTE los colores en lugar de
 * aclararlos u oscurecerlos. Añadir una variante que rompa esa regla rompe la
 * identidad, así que las opciones están cerradas a propósito.
 */
export type ButtonVariant =
  /** Negro sólido sobre fondo claro. CTA principal (añadir a la bolsa). */
  | 'solid'
  /** Contorno negro sobre fondo claro. Acciones secundarias. */
  | 'outline'
  /** Blanco sólido sobre fotografía. CTA del hero. */
  | 'onPhoto'
  /** Contorno claro translúcido sobre fotografía. CTA secundario del hero. */
  | 'ghostPhoto'
  /** Contorno claro sobre bloque negro. */
  | 'onDark'
  /** Contorno gris tenue. Acciones terciarias (guardar en favoritos). */
  | 'subtle'
  /** Enlace tipográfico con flecha. Los "Ver todo" de cada sección. */
  | 'link'
  /** Enlace subrayado. Guía de tallas, "Limpiar todo". */
  | 'underline'

export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE = 'font-label-upper text-label-upper uppercase transition-colors duration-200'

const VARIANTS: Record<ButtonVariant, string> = {
  solid:
    'inline-flex items-center justify-center gap-2 bg-primary text-on-primary border border-primary hover:bg-paper-bright hover:text-primary',
  outline:
    'inline-flex items-center justify-center gap-2 border border-primary text-primary hover:bg-primary hover:text-on-primary',
  onPhoto:
    'inline-flex items-center justify-center gap-2 bg-paper-bright text-primary border border-paper-bright hover:bg-transparent hover:text-paper-bright',
  ghostPhoto:
    'inline-flex items-center justify-center gap-2 text-paper-bright border border-paper-bright/60 hover:border-paper-bright hover:bg-paper-bright/10',
  onDark:
    'inline-flex w-max items-center justify-center gap-2 border border-on-tertiary text-on-tertiary hover:bg-on-tertiary hover:text-editorial-ink',
  subtle:
    'inline-flex items-center justify-center gap-2 border border-outline-variant text-secondary hover:border-primary hover:text-primary',
  link: 'inline-flex items-center gap-2 text-primary hover:text-accent-red',
  underline: 'inline-flex items-center gap-2 underline underline-offset-4 hover:text-accent-red',
}

/** Los rellenos exactos del prototipo. Las variantes tipográficas no llevan. */
const SIZES: Record<ButtonSize, string> = {
  sm: 'px-6 py-3',
  md: 'px-8 py-3.5',
  lg: 'px-9 py-4',
}

const UNPADDED: ButtonVariant[] = ['link', 'underline']

interface CommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Glifo a la derecha del texto, como los `arrow_forward` del prototipo. */
  icon?: string
  fullWidth?: boolean
  className?: string
  children: ReactNode
}

type AnchorProps = CommonProps & { href: string } & Omit<
    ComponentPropsWithoutRef<typeof Link>,
    'href' | 'className' | 'children'
  >
type NativeProps = CommonProps & { href?: undefined } & Omit<
    ComponentPropsWithoutRef<'button'>,
    'className' | 'children'
  >

export type ButtonProps = AnchorProps | NativeProps

export function Button(props: ButtonProps) {
  const {
    variant = 'solid',
    size = 'lg',
    icon,
    fullWidth,
    className,
    children,
    ...rest
  } = props as CommonProps & { href?: string } & Record<string, unknown>

  const classes = cn(
    BASE,
    VARIANTS[variant],
    !UNPADDED.includes(variant) && SIZES[size],
    fullWidth && 'w-full',
    className,
  )

  const content = (
    <>
      {children}
      {icon ? <Icon name={icon} size={variant === 'link' ? 16 : 18} /> : null}
    </>
  )

  if (typeof props.href === 'string') {
    const { href, ...anchorRest } = rest as { href: string } & Record<string, unknown>
    return (
      <Link href={href} className={classes} {...anchorRest}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" className={classes} {...(rest as ComponentPropsWithoutRef<'button'>)}>
      {content}
    </button>
  )
}
