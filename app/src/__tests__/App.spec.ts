import { describe, it, expect } from 'vitest'
import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '@/router'

describe('App', () => {
  it('renders the login view at the root route', async () => {
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Welcome back')
  })
})
