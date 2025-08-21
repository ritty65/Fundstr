export type CTAAction = 'route' | 'emit' | 'openModal'

export interface CTA {
  label: string
  action: CTAAction
  to?: string
  params?: Record<string, any>
  eventName?: string
  variant?: 'primary' | 'secondary'
}

export interface WelcomeTask {
  id: string
  icon: string
  title: string
  desc: string
  optional?: boolean
  requires?: string[]
  done: () => boolean
  ctas: CTA[]
}
