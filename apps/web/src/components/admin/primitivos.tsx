'use client'

import { useFormStatus } from 'react-dom'

/**
 * Los primitivos del panel de administración.
 *
 * **Por qué no salen de `@lumane/ui-web`.** Ese paquete es el sistema de la
 * TIENDA: editorial, de escaparate, con botones que persuaden. El panel es
 * denso y de formulario, y lo que necesita —filas de etiqueta y campo,
 * interruptores, una barra de guardado— no tiene sentido en una ficha de
 * producto.
 *
 * La regla 3 del proyecto prohíbe lo contrario de lo que se hace aquí: añadir
 * una variante `admin` a `@lumane/ui-web` para que le sirva al panel sería
 * contaminar el sistema de la tienda con necesidades que no son suyas. Un
 * primitivo propio del panel no contamina nada.
 *
 * Lo que sí se comparte son los TOKENS: estas clases usan las mismas variables
 * de `@lumane/tokens/theme.css` que pinta el escaparate. Cambiar un color allí
 * sigue tiñendo las dos superficies, que es lo que importaba.
 */

export function FormRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5 py-3 border-b border-surface-variant last:border-b-0">
      <label htmlFor={htmlFor} className="font-label-upper text-label-upper text-secondary">
        {label}
      </label>
      {children}
      {hint ? <p className="font-body-md text-body-md text-text-muted">{hint}</p> : null}
    </div>
  )
}

const campoBase =
  'w-full border border-outline-variant bg-paper-bright px-3 py-2.5 font-body-md text-body-md ' +
  'text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${campoBase} ${props.className ?? ''}`} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${campoBase} min-h-32 ${props.className ?? ''}`} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${campoBase} ${props.className ?? ''}`} />
}

/**
 * Interruptor con casilla real debajo.
 *
 * Es un `<input type="checkbox">` de verdad, no un `div` con estado: así entra
 * en el `FormData` del formulario sin JavaScript de por medio, y el teclado y
 * el lector de pantalla lo entienden sin `aria-*` inventados.
 */
export function Toggle({
  name,
  defaultChecked,
  label,
  hint,
}: {
  name: string
  defaultChecked?: boolean
  label: string
  hint?: string
}) {
  return (
    <label className="flex items-start gap-3 py-3 border-b border-surface-variant last:border-b-0 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 size-5 accent-primary shrink-0"
      />
      <span className="grid gap-0.5">
        <span className="font-body-md text-body-md text-primary">{label}</span>
        {hint ? <span className="font-body-md text-body-md text-text-muted">{hint}</span> : null}
      </span>
    </label>
  )
}

/**
 * La barra de guardado, pegada abajo.
 *
 * `useFormStatus` da el estado de envío sin que cada pantalla lleve su propio
 * `useState`: el botón se desactiva solo mientras la acción corre. Va pegada
 * porque un formulario de ajustes es largo y el botón al final obliga a
 * desplazarse para descubrir si algo se guardó.
 */
export function SaveBar({ mensaje }: { mensaje?: string | null }) {
  const { pending } = useFormStatus()

  return (
    <div className="sticky bottom-0 -mx-5 mt-8 flex items-center justify-between gap-4 border-t border-primary bg-paper-bright px-5 py-3">
      <p aria-live="polite" className="font-body-md text-body-md text-secondary">
        {pending ? 'Guardando…' : (mensaje ?? '')}
      </p>
      <button
        type="submit"
        disabled={pending}
        className="border border-primary bg-primary px-6 py-2.5 font-label-upper text-label-upper text-on-primary disabled:opacity-40"
      >
        Guardar
      </button>
    </div>
  )
}

/** Aviso de resultado. Sin color: la paleta del proyecto es monocroma. */
export function StatusNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="border border-primary px-3 py-2 font-body-md text-body-md text-primary">
      {children}
    </p>
  )
}
