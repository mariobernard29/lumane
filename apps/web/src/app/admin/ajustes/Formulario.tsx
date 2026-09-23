'use client'

import { useActionState } from 'react'

import { guardarAjustes, type ResultadoAdmin } from '@/actions/admin/contenido'
import {
  FormRow,
  SaveBar,
  StatusNote,
  TextArea,
  TextInput,
} from '@/components/admin/primitivos'

/**
 * El formulario de ajustes de la tienda.
 *
 * Es cliente solo por `useActionState`, que es lo que deja enseñar el
 * resultado sin navegar. Los campos son `<input name>` de toda la vida: el
 * envío funciona aunque el JavaScript no haya cargado, que en una tablet con
 * el wifi de la boutique pasa más de lo que parece.
 */

export interface AjustesIniciales {
  storeName: string
  tagline: string
  contactEmail: string
  contactPhone: string
  whatsappNumber: string
  openingHours: string
  newsletterTitle: string
  newsletterBody: string
  newsletterDisclaimer: string
  copyrightText: string
  instagram: string
  facebook: string
  tiktok: string
}

export function FormularioAjustes({ inicial }: { inicial: AjustesIniciales }) {
  const [estado, accion] = useActionState<ResultadoAdmin | null, FormData>(
    async (_previo, formData) => guardarAjustes(formData),
    null,
  )

  return (
    <form action={accion} className="grid gap-6">
      {estado ? <StatusNote>{estado.mensaje}</StatusNote> : null}

      <section>
        <h2 className="font-label-upper text-label-upper text-secondary">La boutique</h2>
        <FormRow label="Nombre" htmlFor="storeName">
          <TextInput id="storeName" name="storeName" defaultValue={inicial.storeName} required />
        </FormRow>
        <FormRow
          label="Descripción"
          htmlFor="tagline"
          hint="Aparece bajo el logotipo en el pie de página."
        >
          <TextInput id="tagline" name="tagline" defaultValue={inicial.tagline} />
        </FormRow>
        <FormRow label="Copyright" htmlFor="copyrightText">
          <TextInput id="copyrightText" name="copyrightText" defaultValue={inicial.copyrightText} />
        </FormRow>
      </section>

      <section>
        <h2 className="font-label-upper text-label-upper text-secondary">Contacto</h2>
        <FormRow
          label="Correo"
          htmlFor="contactEmail"
          hint="El que ve la clienta en el pie y en el aviso de privacidad. No es el remitente de los correos automáticos."
        >
          <TextInput
            id="contactEmail"
            name="contactEmail"
            type="email"
            inputMode="email"
            defaultValue={inicial.contactEmail}
          />
        </FormRow>
        <FormRow label="Teléfono" htmlFor="contactPhone">
          <TextInput id="contactPhone" name="contactPhone" inputMode="tel" defaultValue={inicial.contactPhone} />
        </FormRow>
        <FormRow
          label="WhatsApp"
          htmlFor="whatsappNumber"
          hint="Si se queda vacío, los bloques del sitio que ofrecen escribir por WhatsApp dejan de aparecer."
        >
          <TextInput
            id="whatsappNumber"
            name="whatsappNumber"
            inputMode="tel"
            defaultValue={inicial.whatsappNumber}
          />
        </FormRow>
        <FormRow label="Horario" htmlFor="openingHours">
          <TextInput id="openingHours" name="openingHours" defaultValue={inicial.openingHours} />
        </FormRow>
      </section>

      <section>
        <h2 className="font-label-upper text-label-upper text-secondary">Redes</h2>
        <FormRow label="Instagram" htmlFor="instagram" hint="La dirección completa del perfil.">
          <TextInput id="instagram" name="instagram" inputMode="url" defaultValue={inicial.instagram} />
        </FormRow>
        <FormRow label="Facebook" htmlFor="facebook">
          <TextInput id="facebook" name="facebook" inputMode="url" defaultValue={inicial.facebook} />
        </FormRow>
        <FormRow label="TikTok" htmlFor="tiktok">
          <TextInput id="tiktok" name="tiktok" inputMode="url" defaultValue={inicial.tiktok} />
        </FormRow>
      </section>

      <section>
        <h2 className="font-label-upper text-label-upper text-secondary">Boletín</h2>
        <FormRow label="Título" htmlFor="newsletterTitle">
          <TextInput id="newsletterTitle" name="newsletterTitle" defaultValue={inicial.newsletterTitle} />
        </FormRow>
        <FormRow label="Texto" htmlFor="newsletterBody">
          <TextArea id="newsletterBody" name="newsletterBody" defaultValue={inicial.newsletterBody} />
        </FormRow>
        <FormRow
          label="Aviso legal"
          htmlFor="newsletterDisclaimer"
          hint="La línea pequeña bajo el campo de correo."
        >
          <TextArea
            id="newsletterDisclaimer"
            name="newsletterDisclaimer"
            defaultValue={inicial.newsletterDisclaimer}
          />
        </FormRow>
      </section>

      <SaveBar mensaje={estado?.ok ? estado.mensaje : null} />
    </form>
  )
}
