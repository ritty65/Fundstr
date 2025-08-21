export interface MintInfo {
  name: string
  url: string
  unit?: 'sat' | 'msat'
  region?: string
  feeNote?: string
  notes?: string[]
}

export const MINTS: MintInfo[] = [
  { name: 'Mint A', url: 'https://mint-a.example', unit: 'sat', region: 'EU', feeNote: 'Standard' },
  { name: 'Mint B', url: 'https://mint-b.example', unit: 'sat', region: 'US', feeNote: 'Low fee' },
]
