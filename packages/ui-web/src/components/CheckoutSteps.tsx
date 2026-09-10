import Link from 'next/link'
import { Fragment } from 'react'

import { cn } from '../lib/cn.ts'

export interface CheckoutStep {
  number: string
  label: string
  href?: string
  state: 'done' | 'current' | 'upcoming'
}

/**
 * Indicador de pasos del checkout: 01 Bolsa — 02 Envío y pago — 03 Confirmación.
 *
 * Los pasos ya completados son enlaces reales para poder volver; el actual
 * lleva `aria-current="step"` y los que faltan son texto inerte. En el
 * prototipo los tres eran decorativos y ninguno indicaba dónde estabas.
 */
export function CheckoutSteps({ steps }: { steps: CheckoutStep[] }) {
  return (
    <nav aria-label="Pasos de la compra" className="border-t border-surface-variant">
      <ol className="flex items-center justify-start md:justify-center gap-5 md:gap-8 h-11 px-5 sm:px-margin-edge overflow-x-auto no-scrollbar font-label-upper text-[10px] uppercase tracking-[0.16em]">
        {steps.map((step, index) => (
          <Fragment key={step.number}>
            {index > 0 ? (
              <li aria-hidden="true" className="text-outline-variant">
                —
              </li>
            ) : null}
            <li>
              {step.state === 'done' && step.href ? (
                <Link
                  href={step.href}
                  className="text-secondary hover:text-primary transition-colors whitespace-nowrap"
                >
                  {step.number} · {step.label}
                </Link>
              ) : (
                <span
                  aria-current={step.state === 'current' ? 'step' : undefined}
                  className={cn(
                    'whitespace-nowrap',
                    step.state === 'current'
                      ? 'text-primary border-b-2 border-accent-red pb-1'
                      : 'text-outline',
                  )}
                >
                  {step.number} · {step.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
