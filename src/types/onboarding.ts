export type OnboardingAdvanceMode = 'auto' | 'manual'

export type OnboardingRequiredAction =
  | 'click'
  | 'type'
  | 'select'
  | 'open'
  | 'custom'

export type OnboardingPlacement =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'auto'

export interface OnboardingStep {
  id: string
  route?: string
  ensure?: () => Promise<void> | void
  target: string
  placement?: OnboardingPlacement
  offset?: number
  padding?: number
  instruction: string
  requiredAction?: OnboardingRequiredAction
  advanceMode?: OnboardingAdvanceMode
  completeWhen: () => boolean
  timeoutMs?: number
  a11yLabel?: string
}
