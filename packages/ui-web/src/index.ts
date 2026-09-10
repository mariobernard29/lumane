/**
 * `@lumane/ui-web` — el sistema de diseño de Lumane para la web.
 *
 * Estos componentes son la traducción del prototipo HTML a React. Todos son de
 * SERVIDOR salvo `TouchReveal`, que necesita el DOM: en una retícula de 90
 * piezas, que cada tarjeta arrastre JavaScript al navegador se nota.
 *
 * Regla del proyecto: ninguna pantalla inventa estilos por su cuenta. Si algo
 * no se puede expresar con estos componentes y los tokens, es que falta una
 * variante aquí — no una clase suelta allá.
 */
export { cn } from './lib/cn.ts'
export { formatPrice, formatDate, discountPercent } from './lib/format.ts'

export { Icon, type IconProps } from './components/Icon.tsx'
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './components/Button.tsx'
export { Badge, type BadgeProps, type BadgeVariant } from './components/Badge.tsx'
export { NoiseOverlay } from './components/NoiseOverlay.tsx'
export { TouchReveal } from './components/TouchReveal.tsx'
export { ProductCard, type ProductCardProps } from './components/ProductCard.tsx'
export { Tile, type TileProps } from './components/Tile.tsx'
export { SectionHeader, type SectionHeaderProps } from './components/SectionHeader.tsx'
export { Breadcrumbs, type Crumb } from './components/Breadcrumbs.tsx'
export {
  FiltersSidebar,
  type FiltersSidebarProps,
  type FilterOption,
  type ActiveChip,
} from './components/FiltersSidebar.tsx'
export { SortSelect, type SortSelectProps, type SortOption } from './components/SortSelect.tsx'
export { Pagination, type PaginationProps } from './components/Pagination.tsx'
export { EmptyState, type EmptyStateProps } from './components/EmptyState.tsx'
export { Rating, type RatingProps } from './components/Rating.tsx'
export { Accordion, type AccordionItem } from './components/Accordion.tsx'
export { CheckoutSteps, type CheckoutStep } from './components/CheckoutSteps.tsx'
export { Hero, type HeroProps } from './components/Hero.tsx'
export { ServicesBar, type ServiceItem } from './components/ServicesBar.tsx'
export { Newsletter, type NewsletterProps } from './components/Newsletter.tsx'
export {
  Header,
  type HeaderProps,
  type HeaderNavItem,
} from './components/Header.tsx'
export {
  Footer,
  type FooterProps,
  type FooterColumn,
  type FooterLink,
} from './components/Footer.tsx'
