import type { Router } from 'vue-router'

export function buildProfileUrl(npub: string, router: Router): string {
  if (!npub) return ''
  const href = router.resolve({
    name: 'PublicCreatorProfile',
    params: { npubOrHex: npub },
  }).href
  return new URL(href, window.location.origin).href
}
