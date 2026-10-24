import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import BottomNavigation from '@/components/BottomNavigation.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/study/init', name: 'SessionStart', component: { template: '<div />' } },
    { path: '/cards', name: 'CardList', component: { template: '<div />' } },
  ],
})

describe('BottomNavigation', () => {
  beforeEach(async () => {
    await router.push('/study/init')
  })

  it('links to study and cards and marks the active destination', async () => {
    const wrapper = mount(BottomNavigation, { global: { plugins: [router] } })

    expect(wrapper.get('nav').attributes('aria-label')).toBe('Main navigation')
    expect(wrapper.get('a[href="/study/init"]').attributes('aria-current')).toBe('page')
    expect(wrapper.get('a[href="/cards"]').attributes('aria-current')).toBeUndefined()

    await router.push('/cards')
    await wrapper.vm.$nextTick()

    expect(wrapper.get('a[href="/cards"]').attributes('aria-current')).toBe('page')
  })
})
