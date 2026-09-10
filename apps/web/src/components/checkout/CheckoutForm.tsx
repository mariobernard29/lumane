'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button, Icon, cn, formatPrice } from '@lumane/ui-web'

import { placeOrder, quoteCheckout, type CheckoutAddress } from '@/actions/checkout'
import type { CartTotals } from '@/lib/queries/cart'
import type { ShippingMethod } from '@/lib/queries/shipping'
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
  customer: { email: string; firstName: string; lastName: string | null } | null
}

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

export function CheckoutForm({ methods, initialTotals, localCity, customer }: CheckoutFormProps) {
  const [email, setEmail] = useState(customer?.email ?? '')
  const [firstName, setFirstName] = useState(customer?.firstName ?? '')
  const [lastName, setLastName] = useState(customer?.lastName ?? '')
  const [acceptsMarketing, setAcceptsMarketing] = useState(false)
  const [address, setAddress] = useState<CheckoutAddress>(EMPTY_ADDRESS)

  const [shippingCode, setShippingCode] = useState(methods[0]?.code ?? '')
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'stripe'>('transfer')

  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null)

  const [totals, setTotals] = useState(initialTotals)
  const [quoteMessage, setQuoteMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isQuoting, startQuote] = useTransition()
  const [isPlacing, startPlace] = useTransition()

  const selectedMethod = methods.find((m) => m.code === shippingCode) ?? null
  const isPickup = selectedMethod?.kind === 'pickup'
  const isLocal = selectedMethod?.kind === 'local_delivery'

  // La entrega local solo tiene sentido en la ciudad de la boutique. Ofrecerla
  // a alguien de otra ciudad para después rechazarla es peor que no ofrecerla.
  const cityMatchesLocal =
    address.city.trim().toLowerCase().localeCompare(localCity.toLowerCase(), 'es', {
      sensitivity: 'base',
    }) === 0

  const availableMethods = methods.filter(
    (m) => m.kind !== 'local_delivery' || cityMatchesLocal || address.city.trim() === '',
  )

  // Si la ciudad deja de coincidir con la entrega local, se cambia de método
  // en vez de dejar seleccionado uno que ya no aplica.
  useEffect(() => {
    if (isLocal && address.city.trim() !== '' && !cityMatchesLocal) {
      setShippingCode(methods.find((m) => m.kind === 'flat')?.code ?? methods[0]?.code ?? '')
    }
  }, [isLocal, cityMatchesLocal, address.city, methods])

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
        setQuoteMessage(
          result.distanceKm != null
            ? `A ${result.distanceKm} km de la boutique`
            : result.totals.shippingAvailable === false
              ? 'Ese método no llega a tu dirección'
              : null,
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

  function submit() {
    setFormError(null)
    startPlace(async () => {
      const result = await placeOrder({
        email,
        firstName,
        lastName: lastName || null,
        shippingMethodCode: shippingCode,
        paymentMethod,
        couponCode: appliedCoupon,
        note: null,
        acceptsMarketing,
        address: isPickup ? { ...address, recipient: firstName || address.recipient } : address,
      })
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
              <TextField
                id="calle"
                label="Calle"
                required
                autoComplete="address-line1"
                placeholder="Av. Álvaro Obregón"
                value={address.street}
                onChange={(e) => setAddress({ ...address, street: e.target.value })}
                wrapperClassName="md:col-span-2"
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
                onChange={(e) =>
                  setAddress({ ...address, postalCode: e.target.value.replace(/\D/g, '') })
                }
              />
              <TextField
                id="ciudad"
                label="Ciudad"
                required
                autoComplete="address-level2"
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
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

          <div className="flex flex-col gap-3">
            {availableMethods.map((method) => {
              const isSelected = shippingCode === method.code
              return (
                <label
                  key={method.code}
                  className={cn(
                    'flex items-center justify-between gap-4 cursor-pointer p-5 md:p-6 transition-colors',
                    isSelected ? 'border-2 border-primary' : 'border border-surface-variant',
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
                    {isSelected ? priceLabel(totals.shippingCents, isQuoting) : methodHint(method)}
                  </span>
                </label>
              )
            })}
          </div>

          {isLocal && !address.postalCode ? (
            <p className="font-body-md text-[13px] text-text-muted mt-4">
              Completa tu dirección para calcular el costo de la entrega local.
            </p>
          ) : null}

          {quoteMessage ? (
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

            <label
              className={cn(
                'flex items-start gap-4 p-5 md:p-6 cursor-not-allowed opacity-50',
                'border border-surface-variant',
              )}
            >
              <input
                type="radio"
                name="pago"
                disabled
                checked={false}
                readOnly
                className="w-5 h-5 mt-0.5 border-secondary"
              />
              <span>
                <span className="block font-body-md text-body-md">Tarjeta de crédito o débito</span>
                <span className="block font-body-md text-[13px] text-secondary mt-1">
                  Disponible muy pronto.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {formError ? (
          <p role="alert" className="font-body-md text-body-md text-accent-red mb-6">
            {formError}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="solid"
          fullWidth
          disabled={isPlacing || isQuoting || totals.shippingAvailable === false}
          className="h-16 sm:h-14"
        >
          {isPlacing ? 'Cerrando el pedido…' : `Confirmar pedido · ${formatPrice(totals.totalCents, true)}`}
        </Button>

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

function priceLabel(cents: number, isQuoting: boolean): string {
  if (isQuoting) return '…'
  return cents === 0 ? 'Gratis' : formatPrice(cents, true)
}

function methodHint(method: ShippingMethod): string {
  if (method.kind === 'pickup') return 'Gratis'
  if (method.kind === 'local_delivery') return 'Según distancia'
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
