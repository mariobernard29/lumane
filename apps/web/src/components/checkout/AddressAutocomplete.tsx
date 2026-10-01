'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@lumane/ui-web'

import {
  loadPlaces,
  parsePlace,
  placesEnabled,
  type ParsedAddress,
  type PlacePrediction,
  type PlacesLibrary,
} from '@/lib/maps/places'
import { Field } from './Field'

/**
 * Campo de calle con sugerencias de Google.
 *
 * Existe por la entrega local: para cobrarla hay que medir la distancia desde
 * la boutique, y para eso hacen falta las COORDENADAS de la dirección, que una
 * clienta no puede teclear. Elegir una sugerencia las trae, junto con el resto
 * de la dirección ya escrita.
 *
 * **La lista es propia, no el `<gmp-place-autocomplete>` de Google.** Ese
 * componente vive en un shadow DOM con su propio estilo y no se deja vestir
 * como `.input-minimal`; en un checkout que se ve hecho a mano, un campo que
 * claramente es de otro sitio resta confianza justo antes de pagar.
 *
 * **Sesiones de autocompletado.** Todas las búsquedas de una misma dirección
 * comparten token, y el token se cierra al pedir los detalles del lugar
 * elegido. Google cobra la sesión entera como una sola petición; sin token,
 * cada letra tecleada sería un cargo aparte.
 *
 * Si Google no carga —sin llave, sin red, llave rechazada—, el campo sigue
 * siendo un texto normal. Se pierde solo la entrega local, que sin
 * coordenadas no se puede cotizar; los envíos por paquetería no las necesitan.
 */

interface Props {
  id: string
  label: string
  value: string
  placeholder?: string
  wrapperClassName?: string
  /** Hacia dónde sesgar las sugerencias: la boutique. */
  bias: { lat: number; lng: number } | null
  /** La clienta tecleó: la dirección cambió y las coordenadas ya no valen. */
  onType: (street: string) => void
  onSelect: (address: ParsedAddress) => void
}

const MIN_CARACTERES = 3
const ESPERA_MS = 250

export function AddressAutocomplete({
  id,
  label,
  value,
  placeholder,
  wrapperClassName,
  bias,
  onType,
  onSelect,
}: Props) {
  const [lib, setLib] = useState<PlacesLibrary | null>(null)
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [resolving, setResolving] = useState(false)

  const session = useRef<object | null>(null)
  // Cada búsqueda lleva número: si una respuesta lenta llega después de una
  // más reciente, se descarta. Sin esto, teclear rápido dejaba en pantalla las
  // sugerencias de lo que se había escrito tres letras antes.
  const ultima = useRef(0)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const listId = `${id}-sugerencias`

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current)
  }, [])

  function prepare() {
    if (!placesEnabled || lib) return
    loadPlaces()
      .then(setLib)
      .catch((error: unknown) => console.warn('[direccion] sin autocompletado:', error))
  }

  function search(text: string) {
    if (temporizador.current) clearTimeout(temporizador.current)
    if (!lib || text.trim().length < MIN_CARACTERES) {
      setSuggestions([])
      setOpen(false)
      return
    }

    temporizador.current = setTimeout(async () => {
      const numero = ++ultima.current
      session.current ??= new lib.AutocompleteSessionToken()
      try {
        const { suggestions: found } =
          await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: text,
            sessionToken: session.current,
            includedRegionCodes: ['mx'],
            language: 'es-MX',
            region: 'mx',
            ...(bias ? { locationBias: { center: bias, radius: 50_000 } } : {}),
          })
        if (numero !== ultima.current) return
        const predictions = found
          .map((s) => s.placePrediction)
          .filter((p): p is PlacePrediction => p != null)
        setSuggestions(predictions)
        setActive(-1)
        setOpen(predictions.length > 0)
      } catch (error) {
        if (numero === ultima.current) setOpen(false)
        console.warn('[direccion] la búsqueda falló:', error)
      }
    }, ESPERA_MS)
  }

  async function choose(prediction: PlacePrediction) {
    setOpen(false)
    setResolving(true)
    try {
      const { place } = await prediction.toPlace().fetchFields({
        fields: ['addressComponents', 'location'],
      })
      const parsed = parsePlace(place)
      if (parsed) onSelect(parsed)
    } catch (error) {
      console.warn('[direccion] no se pudo leer el lugar:', error)
    } finally {
      // Pedir los detalles cierra la sesión; la siguiente búsqueda abre otra.
      session.current = null
      setResolving(false)
    }
  }

  return (
    <Field
      id={id}
      label={label}
      className={cn('relative', wrapperClassName)}
      hint={
        resolving
          ? 'Completando tu dirección…'
          : lib
            ? 'Escribe tu calle y número, y elige tu dirección de la lista.'
            : null
      }
    >
      <input
        id={id}
        type="text"
        required
        autoComplete={lib ? 'off' : 'address-line1'}
        placeholder={placeholder}
        value={value}
        role={lib ? 'combobox' : undefined}
        aria-autocomplete={lib ? 'list' : undefined}
        aria-expanded={lib ? open : undefined}
        aria-controls={lib ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={lib || resolving ? `${id}-hint` : undefined}
        className="input-minimal font-body-md text-body-md"
        onFocus={prepare}
        onChange={(e) => {
          onType(e.target.value)
          search(e.target.value)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => (i + 1) % suggestions.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
          } else if (e.key === 'Enter' && active >= 0) {
            // Sin esto, Enter sobre una sugerencia ENVIARÍA el formulario.
            e.preventDefault()
            void choose(suggestions[active]!)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Direcciones sugeridas"
          className="absolute left-0 right-0 top-full z-30 mt-1 bg-surface border border-primary shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown y no click: el click llega DESPUÉS del blur del input,
              // que ya habría cerrado la lista.
              onMouseDown={(e) => {
                e.preventDefault()
                void choose(s)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'px-4 py-3 cursor-pointer border-b border-surface-variant',
                i === active && 'bg-surface-variant',
              )}
            >
              <span className="block font-body-md text-body-md">
                {s.mainText?.text ?? s.text.text}
              </span>
              {s.secondaryText ? (
                <span className="block font-body-md text-[13px] text-secondary">
                  {s.secondaryText.text}
                </span>
              ) : null}
            </li>
          ))}
          {/* Atribución obligatoria: las condiciones de Places exigen nombrar
              a Google cuando sus resultados se muestran sin un mapa. */}
          <li
            role="presentation"
            className="px-4 py-2 text-right font-label-upper text-[10px] uppercase text-text-muted"
          >
            Google Maps
          </li>
        </ul>
      ) : null}
    </Field>
  )
}
