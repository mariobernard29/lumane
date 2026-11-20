import { getStaffProfile } from '@/lib/queries/staff'
import { createServerSupabase } from '@/lib/supabase/server'
import { FichaPersona, NuevaPersona, type Persona } from './Formularios.tsx'

/**
 * El personal: quién entra al panel y a la tablet.
 *
 * Solo para la superusuaria (0076). Dar de alta crea la cuenta con una
 * contraseña que ella elige y entrega en persona; dar de baja no borra a
 * nadie, le quita el acceso y deja su historial intacto.
 */
export default async function PersonalPage() {
  const staff = await getStaffProfile()

  if (!staff?.is_superuser) {
    return (
      <p className="font-body-md text-body-md text-primary">
        Solo la cuenta principal de Lumane administra al personal.
      </p>
    )
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('list_staff')

  if (error) {
    return (
      <p className="font-body-md text-body-md text-primary">
        No se pudo leer la lista del personal: {error.message}
      </p>
    )
  }

  const personas: Persona[] = (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.full_name,
    correo: p.email,
    rol: p.role_key as Persona['rol'],
    activa: p.is_active,
    superusuaria: p.is_superuser,
    ultimoAcceso: p.last_sign_in,
    esYo: p.id === staff.id,
  }))
  // Una sola lista (la base ya las ordena: con acceso primero). Con dos
  // secciones, quitar el acceso movería la ficha de un padre a otro, React la
  // montaría de nuevo y el aviso de «Acceso quitado» se perdería.
  const conAcceso = personas.filter((p) => p.activa).length

  return (
    <div className="grid gap-10">
      <header className="grid gap-1">
        <h1 className="font-headline-md text-headline-md text-primary">Personal</h1>
        <p className="font-body-md text-body-md text-text-muted">
          Cada persona entra con su propio correo y contraseña, en el panel y en la tablet. El rol
          decide qué puede hacer. Quitar el acceso no borra a nadie: sus ventas y cortes siguen a
          su nombre.
        </p>
      </header>

      <NuevaPersona />

      <section className="grid gap-3">
        <h2 className="font-label-upper text-label-upper text-secondary">
          {`El equipo · ${conAcceso} con acceso` +
            (personas.length > conAcceso ? ` · ${personas.length - conAcceso} sin acceso` : '')}
        </h2>
        {personas.map((p) => (
          <FichaPersona key={p.id} persona={p} />
        ))}
      </section>
    </div>
  )
}
