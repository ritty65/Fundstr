// Vue 3 + Quasar screen-aware window mixin (TS)
export default {
  data () {
    return {
      windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1024,
      windowHeight: typeof window !== 'undefined' ? window.innerHeight : 768
    }
  },
  computed: {
    isMobile (): boolean {
      // @ts-ignore - $q injected by Quasar
      return this.$q ? this.$q.screen.lt.md : this.windowWidth < 768
    },
    isTablet (): boolean {
      // @ts-ignore
      return this.$q ? (this.$q.screen.gt.xs && this.$q.screen.lt.lg) : (this.windowWidth >= 768 && this.windowWidth < 1200)
    },
    isDesktop (): boolean {
      // @ts-ignore
      return this.$q ? this.$q.screen.gt.md : this.windowWidth >= 1200
    }
  },
  mounted () {
    if (typeof window !== 'undefined') {
      // @ts-ignore
      this._onResize = () => {
        // @ts-ignore
        this.windowWidth = window.innerWidth
        // @ts-ignore
        this.windowHeight = window.innerHeight
      }
      // @ts-ignore
      window.addEventListener('resize', this._onResize)
    }
  },
  beforeUnmount () {
    // @ts-ignore
    if (this._onResize) window.removeEventListener('resize', this._onResize)
  }
}
