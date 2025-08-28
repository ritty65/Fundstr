export const IMAGE_PROXY = import.meta.env.VITE_IMAGE_PROXY_URL || ''

export function proxiedImage (url: string | undefined | null): string {
  if (!url) return ''
  if (!IMAGE_PROXY) return url
  return `${IMAGE_PROXY}?url=${encodeURIComponent(url)}`
}
