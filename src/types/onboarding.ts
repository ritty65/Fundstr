export type OnboardingAdvanceMode = 'auto' | 'manual'

export interface OnboardingStep {
  target: string
  text: string
  anchor: string
  self: string
  requiredAction?: 'click' | 'open'
  advanceMode?: OnboardingAdvanceMode
}
