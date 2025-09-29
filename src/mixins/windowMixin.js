// Vue 3 + Quasar screen-aware window mixin (JS)
export default {
  data () {
    return {
      windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1024,
      windowHeight: typeof window !== 'undefined' ? window.innerHeight : 768
    }
  },
  computed: {
    isMobile () {
      return this.$q ? this.$q.screen.lt.md : this.windowWidth < 768
    },
    isTablet () {
      return this.$q ? (this.$q.screen.gt.xs && this.$q.screen.lt.lg) : (this.windowWidth >= 768 && this.windowWidth < 1200)
    },
    isDesktop () {
      return this.$q ? this.$q.screen.gt.md : this.windowWidth >= 1200
    }
  },
  mounted () {
    if (typeof window !== 'undefined') {
      this._onResize = () => {
        this.windowWidth = window.innerWidth
        this.windowHeight = window.innerHeight
      }
      window.addEventListener('resize', this._onResize)
    }
  },
  beforeUnmount () {
    if (this._onResize) window.removeEventListener('resize', this._onResize)
  }
}
