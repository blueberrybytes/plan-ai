import DefaultTheme from 'vitepress/theme'
import './custom.css'
import HomeVideo from './HomeVideo.vue'
import { h } from 'vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'home-features-before': () => h(HomeVideo)
    })
  }
}
