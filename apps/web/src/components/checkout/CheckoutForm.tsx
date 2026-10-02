'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button, Icon, cn, formatPrice } from '@lumane/ui-web'

import {
  checkLocalDelivery,
  placeOrder,
  quoteCheckout,
  type CheckoutAddress,
  type PlaceOrderInput,
} from '@/actions/checkout'
import type { CartTotals } from '@/lib/queries/cart'
import type { ShippingMethod } from '@/lib/queries/shipping'
import { matchState, placesEnabled } from '@/lib/maps/places'
import { AddressAutocomplete } from './AddressAutocomplete'
import { CardPaymentSection } from './CardPaymentSection'
import { SelectField, TextField } from './Field'

/** Estados mexicanos, para no depender de que se escriban bien a mano. */
const ESTADOS = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México',
  'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
]

interface CheckoutFormProps {
  methods: ShippingMethod[]
  initialTotals: CartTotals
  /** Ciudad de la boutique: la entrega local solo aplica ahí. */
  localCity: string
  /** Coordenadas de la boutique, para sesgar las sugerencias de dirección. */
  boutique: { lat: number; lng: number } | null
  /** Umbral de envío gratis, solo para las etiquetas de precio. */
  freeShippingOverCents: number | null
  /** Solo se ofrece tarjeta si Stripe está configurado en el servidor. */
  stripeEnabled: boolean
  customer: { email: string; firstName: string; lastName: string | null } | null
}

/** Lo que se sabe de la entrega local para la dirección elegida. */
type LocalCheckState =
  | { status: 'idle' }
  | { status: 'checking'; step: 0 | 1 }
  | { status: 'available'; distanceKm: number; shippingCents: number }
  | { status: 'unavailable'; distanceKm: number | null; maxKm: number | null }

const EMPTY_ADDRESS: CheckoutAddress = {
  recipient: '',
  street: '',
  extNo: '',
  intNo: '',
  neighborhood: '',
  city: '',
  state: 'Sinaloa',
  postalCode: '',
  country: 'MX',
  phone: '',
  deliveryNotes: '',
  lat: null,
  lng: null,
}

export function CheckoutForm({
  methods,
  initialTotals,
  localCity,
  boutique,
  freeShippingOverCents,
  customer,
  stripeEnabled,
}: CheckoutFormProps) {
  const [email, setEmail] = useState(customer?.email ?? '')
  const [firstName, setFirstName] = useState(customer?.firstName ?? '')
  const [lastName, setLastName] = useState(customer?.lastName ?? '')
  const [acceptsMarketing, setAcceptsMarketing] = useState(false)
  const [address, setAddress] = useState<CheckoutAddress>(EMPTY_ADDRESS)

  const [shippingCode, setShippingCode] = useState(methods[0]?.code ?? '')
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'stripe'>(
    stripeEnabled ? 'stripe' : 'transfer',
  )

  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null)

  const [totals, setTotals] = useState(initialTotals)
  const [quoteMessage, setQuoteMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isQuoting, startQuote] = useTransition()
  const [isPlacing, startPlace] = useTransition()

  const [localCheck, setLocalCheck] = useState<LocalCheckState>({ status: 'idle' })
  // Numera cada comprobación: si la clienta elige otra dirección mientras la
  // anterior seguía calculándose, la respuesta vieja se descarta al llegar.
  const localCheckSeq = useRef(0)

  const hasCoords = address.lat != null && address.lng != null
  // Sin coordenadas no hay nada comprobado, diga lo que diga el último estado:
  // en cuanto la clienta retoca la calle, la ciudad o el código postal, la
  // respuesta anterior ya no es de esta dirección.
  const local: LocalCheckState = hasCoords ? localCheck : { status: 'idle' }

  const selectedMethod = methods.find((m) => m.code === shippingCode) ?? null
  const isPickup = selectedMethod?.kind === 'pickup'
  const isLocal = selectedMethod?.kind === 'local_delivery'
  // Red de seguridad: la opción ya no se ofrece sin una dirección comprobada,
  // pero si quedara seleccionada, el pago no debe poder cerrarse.
  const localNeedsAddress = isLocal && local.status !== 'available'

  // La entrega local SOLO aparece cuando la dirección elegida está dentro de
  // la zona. Ofrecerla y rechazarla después es peor que no ofrecerla.
  const availableMethods = methods.filter(
    (m) => m.kind !== 'local_delivery' || local.status === 'available',
  )

  const fallbackCode = methods.find((m) => m.kind === 'flat')?.code ?? methods[0]?.code ?? ''

  /** Si estaba elegida la entrega local y deja de aplicar, pasa a paquetería. */
  function dropLocalIfSelected() {
    if (isLocal) setShippingCode(fallbackCode)
  }

  /**
   * ¿Llega la entrega local a esta dirección?
   *
   * Con `conLoader`, el cálculo dura al menos ~1.8 s y pasa por dos mensajes
   * aunque la respuesta llegue antes (y suele llegar antes: la distancia queda
   * en caché). Es a propósito, lo pidió la boutique: una tarifa que aparece al
   * instante parece de tabla; una que se «calcula» se lee como hecha para tu
   * dirección, que es exactamente lo que es.
   *
   * Sin loader cuando solo cambia el cupón: la dirección ya se comprobó y
   * volver a enseñar el cálculo sería teatro sin motivo.
   */
  async function runLocalCheck(
    coords: { lat: number; lng: number },
    coupon: string | null,
    conLoader: boolean,
  ) {
    const seq = ++localCheckSeq.current
    if (conLoader) {
      setLocalCheck({ status: 'checking', step: 0 })
      setTimeout(() => {
        if (seq === localCheckSeq.current) {
          setLocalCheck((s) => (s.status === 'checking' ? { status: 'checking', step: 1 } : s))
        }
      }, 900)
    }

    const [result] = await Promise.all([
      checkLocalDelivery({ ...coords, couponCode: coupon }),
      conLoader ? new Promise((r) => setTimeout(r, 1800)) : null,
    ])
    if (seq !== localCheckSeq.current) return

    if (result.available && result.distanceKm != null && result.shippingCents != null) {
      setLocalCheck({
        status: 'available',
        distanceKm: result.distanceKm,
        shippingCents: result.shippingCents,
      })
    } else {
      setLocalCheck({ status: 'unavailable', distanceKm: result.distanceKm, maxKm: result.maxKm })
      dropLocalIfSelected()
    }
  }

  /** Recotiza el resumen. La base es la única que pone precios. */
  function requote(overrides?: { shipping?: string; coupon?: string | null }) {
    const shipping = overrides?.shipping ?? shippingCode
    const coupon = overrides?.coupon !== undefined ? overrides.coupon : appliedCoupon

    startQuote(async () => {
      const result = await quoteCheckout({
        shippingMethodCode: shipping || null,
        couponCode: coupon,
        lat: address.lat,
        lng: address.lng,
      })

      if (result.ok && result.totals) {
        setTotals(result.totals)
        // La distancia ya la anuncia el aviso de entrega local; aquí solo
        // queda el caso raro de un método que dejó de llegar.
        setQuoteMessage(
          result.totals.shippingAvailable === false ? 'Ese método no llega a tu dirección' : null,
        )
      } else {
        setQuoteMessage(result.message ?? null)
      }
    })
  }

  useEffect(() => {
    requote()
    // Solo cuando cambia el método o las coordenadas; el cupón se aplica a mano.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingCode, address.lat, address.lng])

  /**
   * Los datos del pedido tal como están en este momento.
   *
   * Lo usan las dos vías de pago. En "recoger en boutique" no hay dirección de
   * envío, así que se rellena con la de la boutique: el pedido necesita una
   * dirección válida aunque nadie vaya a llevarlo a ninguna parte.
   */
  function buildOrderInput(): PlaceOrderInput {
    return {
      email,
      firstName,
      lastName: lastName || null,
      shippingMethodCode: shippingCode,
      paymentMethod,
      couponCode: appliedCoupon,
      note: null,
      acceptsMarketing,
      address: isPickup
        ? {
            ...address,
            recipient: firstName || address.recipient || 'Recoge en boutique',
            street: address.street || `Recoge en boutique de ${localCity}`,
            city: address.city || localCity,
            postalCode: address.postalCode || '81200',
          }
        : address,
    }
  }

  /**
   * Validación previa al cobro con tarjeta.
   *
   * El formulario nativo ya valida los campos `required` al enviarse, pero el
   * botón de tarjeta no envía el formulario: dispara Stripe. Sin esta
   * comprobación se podría reservar inventario y abrir un cobro con la
   * dirección a medias.
   */
  function validateForCard(): string | null {
    if (!email.trim()) return 'Escribe tu correo electrónico'
    if (!firstName.trim()) return 'Escribe tu nombre'
    if (!shippingCode) return 'Elige un método de envío'
    if (!address.phone.trim()) return 'Escribe un teléfono de contacto'

    if (!isPickup) {
      if (!address.recipient.trim()) return 'Escribe quién recibe el pedido'
      if (!address.street.trim()) return 'Escribe la calle'
      if (!address.city.trim()) return 'Escribe la ciudad'
      if (!/^\d{5}$/.test(address.postalCode)) return 'El código postal son 5 dígitos'
    }

    return null
  }

  function submit() {
    setFormError(null)
    startPlace(async () => {
      const result = await placeOrder(buildOrderInput())
      // Al cerrarse bien, la acción redirige y esto no llega a ejecutarse.
      if (result && !result.ok) setFormError(result.message ?? 'No pudimos cerrar el pedido')
    })
  }

  const couponError =
    appliedCoupon && !totals.coupon.valid
      ? couponMessage(totals.coupon.reason, totals.coupon.minSubtotalCents)
      : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-col-gap items-start">
      {/* ================= Formulario ================= */}
      <form
        className="lg:col-span-7 order-2 lg:order-none"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {/* ---- 01 Contacto ---- */}
        <fieldset className="mb-12">
          <legend className="font-headline-md text-headline-md mb-6 flex items-baseline gap-3">
            <span className="font-label-upper text-label-upper uppercase text-secondary">01</span>
            Contacto
          </legend>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
            <TextField
              id="email"
              label="Correo electrónico"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              wrapperClassName="md:col-span-2"
              hint="Ahí te enviamos la confirmación y la guía de rastreo."
            />
            <TextField
              id="nombre"
              label="Nombre"
              required
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <TextField
              id="apellidos"
              label="Apellidos"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-3 mt-6 cursor-pointer font-body-md text-body-md text-secondary">
            <input
              type="checkbox"
              checked={acceptsMarketing}
              onChange={(e) => setAcceptsMarketing(e.target.checked)}
              className="w-4 h-4 mt-1 border-outline text-primary focus:ring-0 focus:ring-offset-0"
            />
            Quiero recibir novedades y acceso anticipado de LUMANE.
          </label>
        </fieldset>

        {/* ---- 02 Entrega ---- */}
        <fieldset className="mb-12">
          <legend className="font-headline-md text-headline-md mb-6 flex items-baseline gap-3">
            <span className="font-label-upper text-label-upper uppercase text-secondary">02</span>
            {isPickup ? 'Quién recoge' : 'Dirección de envío'}
          </legend>

          {isPickup ? (
            <div className="border border-primary p-6">
              <p className="font-body-md text-body-md text-secondary">
                Recoges en la boutique de {localCity}. Te avisamos por correo en cuanto tu pedido
                esté listo; llévalo contigo junto con una identificación.
              </p>
              <TextField
                id="tel-pickup"
                label="Teléfono"
                type="tel"
                required
                autoComplete="tel"
                value={address.phone}
                onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                wrapperClassName="mt-6 max-w-xs"
                hint="Para avisarte cuando esté listo."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
              <TextField
                id="recibe"
                label="Quién recibe"
                required
                autoComplete="name"
                value={address.recipient}
                onChange={(e) => setAddress({ ...address, recipient: e.target.value })}
                wrapperClassName="md:col-span-2"
              />
              <AddressAutocomplete
                id="calle"
                label="Calle"
                placeholder="Av. Álvaro Obregón 1606"
                value={address.street}
                bias={boutique}
                wrapperClassName="md:col-span-2"
                onType={(street) => {
                  setAddress({ ...address, street, lat: null, lng: null })
                  dropLocalIfSelected()
                }}
                onSelect={(found) => {
                  void runLocalCheck({ lat: found.lat, lng: found.lng }, appliedCoupon, true)
                  setAddress({
                    ...address,
                    street: found.street || address.street,
                    // Si la sugerencia no trae número se VACÍA, no se conserva
                    // el anterior: casi siempre es de otra calle (la clienta
                    // cambió de dirección), y un 1100 heredado en la calle
                    // equivocada es un paquete en la puerta equivocada.
                    extNo: found.extNo,
                    neighborhood: found.neighborhood || address.neighborhood,
                    postalCode: found.postalCode || address.postalCode,
                    city: found.city || address.city,
                    state: matchState(found.state, ESTADOS) ?? address.state,
                    lat: found.lat,
                    lng: found.lng,
                  })
                }}
              />
              <TextField
                id="ext"
                label="Número exterior"
                required
                value={address.extNo ?? ''}
                onChange={(e) => setAddress({ ...address, extNo: e.target.value })}
              />
              <TextField
                id="int"
                label="Interior (opcional)"
                value={address.intNo ?? ''}
                onChange={(e) => setAddress({ ...address, intNo: e.target.value })}
              />
              <TextField
                id="colonia"
                label="Colonia"
                required
                autoComplete="address-level3"
                value={address.neighborhood ?? ''}
                onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })}
              />
              <TextField
                id="cp"
                label="Código postal"
                required
                inputMode="numeric"
                maxLength={5}
                autoComplete="postal-code"
                value={address.postalCode}
                onChange={(e) => {
                  setAddress({
                    ...address,
                    postalCode: e.target.value.replace(/\D/g, ''),
                    // Otro código postal es otra dirección: las coordenadas de
                    // la sugerencia ya no le corresponden.
                    lat: null,
                    lng: null,
                  })
                  dropLocalIfSelected()
                }}
              />
              <TextField
                id="ciudad"
                label="Ciudad"
                required
                autoComplete="address-level2"
                value={address.city}
                onChange={(e) => {
                  setAddress({ ...address, city: e.target.value, lat: null, lng: null })
                  dropLocalIfSelected()
                }}
              />
              <SelectField
                id="estado"
                label="Estado"
                required
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value })}
              >
                {ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </SelectField>
              <TextField
                id="tel"
                label="Teléfono"
                type="tel"
                required
                autoComplete="tel"
                value={address.phone}
                onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                wrapperClassName="md:col-span-2"
                hint="Para avisos de entrega."
              />
              <TextField
                id="referencias"
                label="Referencias (opcional)"
                value={address.deliveryNotes ?? ''}
                onChange={(e) => setAddress({ ...address, deliveryNotes: e.target.value })}
                wrapperClassName="md:col-span-2"
                placeholder="Portón negro, entre Rosales y Ángel Flores"
              />
            </div>
          )}
        </fieldset>

        {/* ---- 03 Método de envío ---- */}
        <fieldset className="mb-12">
          <legend className="font-headline-md text-headline-md mb-6 flex items-baseline gap-3">
            <span className="font-label-upper text-label-upper uppercase text-secondary">03</span>
            Método de envío
          </legend>

          {local.status === 'checking' ? (
            <ShippingLoader step={local.step} />
          ) : (
          <div className="flex flex-col gap-3">
            {local.status === 'available' ? (
              <p
                role="status"
                className="flex items-start gap-3 border border-primary bg-surface p-4 font-body-md text-body-md"
              >
                <Icon name="check_circle" size={20} className="text-accent-red shrink-0 mt-0.5" />
                <span>
                  Tu dirección está a {formatKm(local.distanceKm)} de la boutique: te llega con{' '}
                  <strong className="font-medium">entrega local</strong>, el mismo día o al
                  siguiente.
                </span>
              </p>
            ) : null}

            {availableMethods.map((method) => {
              const isSelected = shippingCode === method.code
              const isLocalOption = method.kind === 'local_delivery'
              return (
                <label
                  key={method.code}
                  className={cn(
                    'flex items-center justify-between gap-4 cursor-pointer p-5 md:p-6 transition-colors',
                    isSelected ? 'border-2 border-primary' : 'border border-surface-variant',
                    // Aparece de pronto tras el cálculo: entra con un
                    // desvanecido corto para que se note que es nueva.
                    isLocalOption && 'reveal-in',
                  )}
                >
                  <span className="flex items-center gap-4">
                    <input
                      type="radio"
                      name="envio"
                      checked={isSelected}
                      onChange={() => setShippingCode(method.code)}
                      className="w-5 h-5 border-secondary text-primary focus:ring-0 focus:ring-offset-0"
                    />
                    <span>
                      <span className="block font-body-md text-body-md">{method.name}</span>
                      {method.description ? (
                        <span className="block font-label-upper text-label-upper uppercase text-secondary mt-1">
                          {method.description}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="font-price text-price whitespace-nowrap">
                    {isSelected
                      ? priceLabel(totals.shippingCents, isQuoting)
                      : isLocalOption && local.status === 'available'
                        ? priceLabel(local.shippingCents, false)
                        : methodHint(method, freeShippingOverCents, totals)}
                  </span>
                </label>
              )
            })}
          </div>
          )}

          {local.status === 'unavailable' && local.distanceKm != null ? (
            <p role="status" className="font-body-md text-[13px] text-text-muted mt-4">
              Tu dirección está a {formatKm(local.distanceKm)} de la boutique. La entrega local
              llega hasta {local.maxKm ?? 10} km, así que tu pedido viaja por paquetería.
            </p>
          ) : local.status === 'idle' && !isPickup && placesEnabled ? (
            <p className="font-body-md text-[13px] text-text-muted mt-4">
              ¿Vives cerca de la boutique? Elige tu dirección de las sugerencias y vemos si te
              llega la entrega local el mismo día.
            </p>
          ) : quoteMessage ? (
            <p
              role="status"
              className={cn(
                'font-body-md text-[13px] mt-4',
                totals.shippingAvailable === false ? 'text-accent-red' : 'text-text-muted',
              )}
            >
              {quoteMessage}
            </p>
          ) : null}
        </fieldset>

        {/* ---- 04 Pago ---- */}
        <fieldset className="mb-10">
          <legend className="font-headline-md text-headline-md mb-6 flex items-baseline gap-3">
            <span className="font-label-upper text-label-upper uppercase text-secondary">04</span>
            Pago
          </legend>

          <div className="flex flex-col gap-3">
            {stripeEnabled ? (
              <label
                className={cn(
                  'flex items-start gap-4 cursor-pointer p-5 md:p-6 transition-colors',
                  paymentMethod === 'stripe'
                    ? 'border-2 border-primary'
                    : 'border border-surface-variant',
                )}
              >
                <input
                  type="radio"
                  name="pago"
                  checked={paymentMethod === 'stripe'}
                  onChange={() => setPaymentMethod('stripe')}
                  className="w-5 h-5 mt-0.5 border-secondary text-primary focus:ring-0 focus:ring-offset-0"
                />
                <span>
                  <span className="block font-body-md text-body-md">
                    Tarjeta de crédito o débito
                  </span>
                  <span className="block font-body-md text-[13px] text-secondary mt-1">
                    Pago inmediato y seguro. Tu pedido sale en cuanto se confirma el cobro.
                  </span>
                </span>
              </label>
            ) : null}

            <label
              className={cn(
                'flex items-start gap-4 cursor-pointer p-5 md:p-6 transition-colors',
                paymentMethod === 'transfer'
                  ? 'border-2 border-primary'
                  : 'border border-surface-variant',
              )}
            >
              <input
                type="radio"
                name="pago"
                checked={paymentMethod === 'transfer'}
                onChange={() => setPaymentMethod('transfer')}
                className="w-5 h-5 mt-0.5 border-secondary text-primary focus:ring-0 focus:ring-offset-0"
              />
              <span>
                <span className="block font-body-md text-body-md">
                  Transferencia bancaria o SPEI
                </span>
                <span className="block font-body-md text-[13px] text-secondary mt-1">
                  Al confirmar te enviamos los datos de la cuenta. Apartamos tus piezas y el pedido
                  sale en cuanto recibimos el depósito.
                </span>
              </span>
            </label>
          </div>

          {/* El formulario de tarjeta aparece bajo su opción, no en un paso
              aparte: el prototipo expande el panel de pago en la misma vista. */}
          {paymentMethod === 'stripe' ? (
            <div className="mt-6">
              <CardPaymentSection
                amountCents={totals.totalCents}
                getOrderInput={buildOrderInput}
                validate={validateForCard}
                disabled={isQuoting || totals.shippingAvailable === false || localNeedsAddress}
              />
            </div>
          ) : null}
        </fieldset>

        {formError ? (
          <p role="alert" className="font-body-md text-body-md text-accent-red mb-6">
            {formError}
          </p>
        ) : null}

        {/* El botón de tarjeta vive dentro de `CardPaymentSection`: solo él
            sabe si los campos de Stripe están completos. */}
        {paymentMethod === 'transfer' ? (
          <Button
            type="submit"
            variant="solid"
            fullWidth
            disabled={
              isPlacing || isQuoting || totals.shippingAvailable === false || localNeedsAddress
            }
            className="h-16 sm:h-14"
          >
            {isPlacing
              ? 'Cerrando el pedido…'
              : `Confirmar pedido · ${formatPrice(totals.totalCents, true)}`}
          </Button>
        ) : null}

        <p className="font-body-md text-[13px] text-text-muted mt-4">
          Al confirmar aceptas nuestros{' '}
          <a href="/p/terminos" className="underline underline-offset-4">
            términos
          </a>{' '}
          y el{' '}
          <a href="/p/privacidad" className="underline underline-offset-4">
            aviso de privacidad
          </a>
          .
        </p>
      </form>

      {/* ================= Resumen ================= */}
      <aside className="lg:col-span-5 order-1 lg:order-none lg:sticky lg:top-8 border border-primary bg-surface p-6 md:p-8">
        <h2 className="font-headline-md text-headline-md mb-6">Tu pedido</h2>

        <div className="flex items-end gap-4 mb-7">
          <div className="flex-grow">
            <label
              className="block font-label-upper text-label-upper uppercase text-secondary mb-1"
              htmlFor="cupon"
            >
              Código de descuento
            </label>
            <input
              id="cupon"
              type="text"
              placeholder="LUMANE2026"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              className="input-minimal font-body-md text-body-md"
            />
          </div>
          <button
            type="button"
            disabled={isQuoting || couponInput.trim() === ''}
            onClick={() => {
              const code = couponInput.trim()
              setAppliedCoupon(code || null)
              requote({ coupon: code || null })
              // Un cupón puede bajar la compra de los $2,499 y quitar la
              // entrega local gratis: el precio de la opción se recalcula.
              if (address.lat != null && address.lng != null) {
                void runLocalCheck({ lat: address.lat, lng: address.lng }, code || null, false)
              }
            }}
            className="font-label-upper text-label-upper uppercase border-b border-primary pb-2 hover:text-accent-red hover:border-accent-red transition-colors disabled:opacity-40"
          >
            Aplicar
          </button>
        </div>

        {couponError ? (
          <p className="font-body-md text-[13px] text-accent-red -mt-4 mb-6">{couponError}</p>
        ) : totals.coupon.valid ? (
          <p className="font-body-md text-[13px] text-secondary -mt-4 mb-6 flex items-center gap-2">
            <Icon name="check_circle" size={14} />
            Cupón {totals.coupon.code} aplicado
          </p>
        ) : null}

        <dl className="flex flex-col gap-3 font-body-md text-body-md border-t border-surface-variant pt-6">
          <div className="flex justify-between">
            <dt className="text-secondary">Subtotal</dt>
            <dd className="font-price text-price">{formatPrice(totals.subtotalCents, true)}</dd>
          </div>

          {totals.discountCents > 0 ? (
            <div className="flex justify-between">
              <dt className="text-secondary">Descuento</dt>
              <dd className="font-price text-price text-accent-red">
                −{formatPrice(totals.discountCents, true)}
              </dd>
            </div>
          ) : null}

          <div className="flex justify-between">
            <dt className="text-secondary">{selectedMethod?.name ?? 'Envío'}</dt>
            <dd className="font-price text-price">
              {priceLabel(totals.shippingCents, isQuoting)}
            </dd>
          </div>

          <div className="flex justify-between">
            <dt className="text-secondary">IVA ({Math.round(totals.taxRate * 100)}%)</dt>
            <dd className="font-label-upper text-label-upper uppercase text-secondary">
              Incluido · {formatPrice(totals.taxCents, true)}
            </dd>
          </div>
        </dl>

        <div className="flex justify-between items-baseline border-t border-primary mt-6 pt-6">
          <span className="font-label-upper text-label-upper uppercase">Total</span>
          <span className="font-headline-md text-headline-md">
            {formatPrice(totals.totalCents, true)}
          </span>
        </div>

        <ul className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-surface-variant font-body-md text-[13px] text-secondary">
          {[
            { icon: 'lock', label: 'Conexión cifrada' },
            { icon: 'autorenew', label: '14 días para cambios' },
            { icon: 'local_shipping', label: 'Guía rastreable' },
            { icon: 'verified', label: 'Piezas originales' },
          ].map((seal) => (
            <li key={seal.label} className="flex items-center gap-2">
              <Icon name={seal.icon} size={16} className="text-accent-red" />
              {seal.label}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

/** «3.1 km», o «menos de 1 km» para no decir «0.4 km» a quien vive a la vuelta. */
function formatKm(km: number): string {
  return km < 1 ? 'menos de 1 km' : `${km.toLocaleString('es-MX')} km`
}

/**
 * El «cálculo» de la tarifa, en dos pasos.
 *
 * Esqueletos con la misma forma que las opciones que van a aparecer, para que
 * al terminar la lista ocupe el mismo sitio y nada salte.
 */
function ShippingLoader({ step }: { step: 0 | 1 }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <p className="flex items-center gap-3 font-body-md text-body-md">
        <span
          aria-hidden="true"
          className="inline-block size-4 shrink-0 rounded-full border-2 border-surface-variant border-t-primary animate-spin"
        />
        {step === 0 ? 'Ubicando tu dirección…' : 'Calculando tarifas de envío…'}
      </p>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="flex items-center justify-between gap-4 border border-surface-variant p-5 md:p-6 animate-pulse"
        >
          <span className="flex items-center gap-4">
            <span className="size-5 rounded-full bg-outline-variant" />
            <span className="grid gap-2">
              <span className="block h-3 w-32 bg-outline-variant" />
              <span className="block h-2 w-48 bg-outline-variant" />
            </span>
          </span>
          <span className="block h-3 w-16 bg-outline-variant" />
        </div>
      ))}
    </div>
  )
}

function priceLabel(cents: number, isQuoting: boolean): string {
  if (isQuoting) return '…'
  return cents === 0 ? 'Gratis' : formatPrice(cents, true)
}

/**
 * El precio de un método que NO está elegido.
 *
 * Con la bolsa sobre el umbral de envío gratis, un método de tarifa fija
 * cuesta cero aunque su precio de lista diga otra cosa. Sin esto, con una
 * compra de $2,580 el estándar elegido decía «Gratis» y el express de al lado
 * «$219» — y lo era solo hasta que la clienta lo tocaba.
 *
 * Es solo la etiqueta: el precio que se cobra lo recalcula la base al elegir.
 */
function methodHint(method: ShippingMethod, freeOver: number | null, totals: CartTotals): string {
  if (method.kind === 'pickup') return 'Gratis'
  if (method.kind === 'local_delivery') return 'Según distancia'
  if (freeOver != null && totals.subtotalCents - totals.discountCents >= freeOver) return 'Gratis'
  return formatPrice(method.priceCents)
}

/** Los motivos que devuelve `evaluate_coupon`, en lenguaje de clienta. */
function couponMessage(reason: string | undefined, minSubtotalCents?: number): string {
  switch (reason) {
    case 'not_found':
      return 'Ese código no existe o ya no está activo'
    case 'expired':
      return 'Ese cupón ya venció'
    case 'not_started':
      return 'Ese cupón todavía no empieza'
    case 'usage_limit_reached':
      return 'Ese cupón ya se agotó'
    case 'customer_limit_reached':
      return 'Ya usaste ese cupón'
    case 'below_minimum':
      return minSubtotalCents
        ? `Ese cupón aplica en compras desde ${formatPrice(minSubtotalCents)}`
        : 'Tu bolsa no alcanza el mínimo del cupón'
    case 'no_eligible_items':
      return 'Ese cupón no aplica a las piezas de tu bolsa'
    case 'wrong_channel':
      return 'Ese cupón solo aplica en la boutique'
    default:
      return 'No pudimos aplicar ese código'
  }
}
