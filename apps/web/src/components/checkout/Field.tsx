import { cn } from '@lumane/ui-web'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

/**
 * Campos del checkout: solo borde inferior, como todos los formularios del
 * sistema (`.input-minimal` de `globals.css`).
 *
 * El error va enlazado con `aria-describedby` y `aria-invalid`, no solo pintado
 * de rojo: quien navega con lector de pantalla también tiene que enterarse de
 * qué campo está mal.
 */

interface FieldWrapperProps {
  id: string
  label: string
  error?: string | null
  hint?: string | null
  className?: string
  children: ReactNode
}

export function Field({ id, label, error, hint, className, children }: FieldWrapperProps) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block font-label-upper text-label-upper uppercase text-secondary mb-1"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="font-body-md text-[13px] text-accent-red mt-1.5">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="font-body-md text-[13px] text-text-muted mt-1.5">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  error?: string | null
  hint?: string | null
  wrapperClassName?: string
}

export function TextField({
  id,
  label,
  error,
  hint,
  wrapperClassName,
  className,
  ...rest
}: TextFieldProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint} className={wrapperClassName}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn('input-minimal font-body-md text-body-md', className)}
        {...rest}
      />
    </Field>
  )
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  id: string
  label: string
  error?: string | null
  wrapperClassName?: string
  children: ReactNode
}

export function SelectField({
  id,
  label,
  error,
  wrapperClassName,
  className,
  children,
  ...rest
}: SelectFieldProps) {
  return (
    <Field id={id} label={label} error={error} className={wrapperClassName}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn('input-minimal font-body-md text-body-md cursor-pointer', className)}
        {...rest}
      >
        {children}
      </select>
    </Field>
  )
}
