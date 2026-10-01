/**
 * Carga de Google Places (API nueva) en el navegador, bajo demanda.
 *
 * **Solo se carga cuando la clienta enfoca el campo de calle**, no al abrir el
 * checkout. Quien recoge en boutique, o quien no llega a escribir dirección,
 * nunca descarga el script de Google ni recibe sus cookies — que es justo lo
 * que promete la página de cookies («solo ocurre en la pantalla de pago y
 * únicamente con lo que escribes en ese campo»).
 *
 * La llave es la de NAVEGADOR (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`), que es
 * pública por naturaleza y por eso va restringida por dominio en Google Cloud.
 * La de servidor, la de Distance Matrix, nunca pasa por aquí.
 *
 * Sin dependencia de npm a propósito: el cargador oficial y los tipos de
 * `@types/google.maps` son dos paquetes para tres funciones. Los tipos de
 * abajo cubren solo lo que usa el checkout.
 */

export interface AddressComponent {
  longText: string | null
  shortText: string | null
  types: string[]
}

export interface PlacesPlace {
  addressComponents?: AddressComponent[]
  location?: { lat(): number; lng(): number } | null
  fetchFields(options: { fields: string[] }): Promise<{ place: PlacesPlace }>
}

export interface PlacePrediction {
  placeId: string
  text: { text: string }
  mainText: { text: string } | null
  secondaryText: { text: string } | null
  toPlace(): PlacesPlace
}

export interface PlacesLibrary {
  AutocompleteSessionToken: new () => object
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string
      sessionToken?: object
      includedRegionCodes?: string[]
      includedPrimaryTypes?: string[]
      language?: string
      region?: string
      locationBias?: { center: { lat: number; lng: number }; radius: number }
    }): Promise<{ suggestions: { placePrediction: PlacePrediction | null }[] }>
  }
}

declare global {
  interface Window {
    google?: { maps: { importLibrary(name: 'places'): Promise<PlacesLibrary> } }
    gm_authFailure?: () => void
    __lumaneMapsListo?: () => void
  }
}

const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY

/** Sin llave el campo de calle se queda como texto normal, igual que antes. */
export const placesEnabled = Boolean(BROWSER_KEY)

let cargando: Promise<PlacesLibrary> | null = null

export function loadPlaces(): Promise<PlacesLibrary> {
  if (!BROWSER_KEY) return Promise.reject(new Error('Falta NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY'))
  if (cargando) return cargando

  cargando = new Promise<void>((resolve, reject) => {
    // Google llama a esto cuando la LLAVE falla (dominio no autorizado, API
    // sin habilitar, facturación caída). Sin capturarlo, el script carga
    // «bien» y cada búsqueda falla en silencio.
    window.gm_authFailure = () => reject(new Error('Google rechazó la llave del navegador'))
    window.__lumaneMapsListo = () => resolve()

    const script = document.createElement('script')
    script.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(BROWSER_KEY)}` +
      '&v=weekly&loading=async&language=es&region=MX&callback=__lumaneMapsListo'
    script.async = true
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'))
    document.head.appendChild(script)
  })
    .then(() => window.google!.maps.importLibrary('places'))
    .catch((error: unknown) => {
      // Se olvida la promesa fallida para que un segundo intento —otro foco
      // en el campo, con la red de vuelta— vuelva a probar.
      cargando = null
      throw error
    })

  return cargando
}

/** Lo que el checkout necesita de un lugar elegido. */
export interface ParsedAddress {
  street: string
  extNo: string
  neighborhood: string
  postalCode: string
  city: string
  /** Tal como lo da Google; el formulario lo empata con su lista de estados. */
  state: string
  lat: number
  lng: number
}

export function parsePlace(place: PlacesPlace): ParsedAddress | null {
  const location = place.location
  if (!location) return null

  const components = place.addressComponents ?? []
  const pick = (...types: string[]) => {
    for (const type of types) {
      const found = components.find((c) => c.types.includes(type))
      if (found?.longText) return found.longText
    }
    return ''
  }

  return {
    street: pick('route'),
    extNo: pick('street_number'),
    neighborhood: pick('sublocality_level_1', 'sublocality', 'neighborhood'),
    postalCode: pick('postal_code'),
    // `locality` es la ciudad («Los Mochis»); el municipio («Ahome») solo si
    // Google no da localidad, que pasa en zonas rurales.
    city: pick('locality', 'administrative_area_level_2'),
    state: pick('administrative_area_level_1'),
    lat: location.lat(),
    lng: location.lng(),
  }
}

const sinAcentos = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * El estado de Google en la lista del formulario.
 *
 * Google usa nombres oficiales largos —«Veracruz de Ignacio de la Llave»,
 * «Coahuila de Zaragoza», «Michoacán de Ocampo»— y la lista usa los cortos.
 * Se empata por prefijo sin acentos. «México» a secas es el Estado de México,
 * no el país: así lo nombra Google en `administrative_area_level_1`.
 */
export function matchState(googleState: string, estados: readonly string[]): string | null {
  const g = sinAcentos(googleState)
  if (!g) return null
  if (g === 'mexico' || g === 'edo. de mexico' || g === 'estado de mexico') {
    return estados.find((e) => sinAcentos(e) === 'estado de mexico') ?? null
  }
  if (g === 'cdmx' || g.startsWith('ciudad de mexico')) {
    return estados.find((e) => sinAcentos(e) === 'ciudad de mexico') ?? null
  }
  // El prefijo MÁS LARGO, no el primero: «Baja California Sur» también empieza
  // por «Baja California», y quedarse con el primero mandaría a La Paz a Mexicali.
  const candidatos = estados.filter((e) => g.startsWith(sinAcentos(e)))
  return candidatos.sort((a, b) => b.length - a.length)[0] ?? null
}
