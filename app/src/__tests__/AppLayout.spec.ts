import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { Card } from '@/models/card'
import { Deck } from '@/models/deck'
import { Direction } from '@/models/direction'
import { Tag } from '@/models/tag'
import { Profile } from '@/models/profile'
import { useAuthStore } from '@/stores/authStore'
import { useDeckStore } from '@/stores/deckStore'
import AppLayout from '@/layouts/AppLayout.vue'

const { syncStatus } = vi.hoisted(() => ({
  syncStatus: { status: { pending: false as boolean }, dotColor: 'green' },
}))

vi.mock('@/stores/syncStatusStore', () => ({
  useSyncStatusStore: () => syncStatus,
}))

const layoutRouter = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/layout',
      component: AppLayout,
      children: [
        {
          path: 'cards',
          name: 'LayoutCards',
          component: { template: '<p>Cards content</p>' },
        },
        {
          path: 'study',
          name: 'LayoutStudy',
          component: { template: '<p>Study content</p>' },
          meta: { immersive: true },
        },
        {
          path: 'card-editor',
          name: 'LayoutCardEditor',
          component: { template: '<p>Card editor content</p>' },
          meta: { deckSwitcherDisabled: true, hideBottomNavigation: true },
        },
        {
          path: '/cards',
          name: 'CardList',
          component: { template: '<div />' },
        },
        {
          path: '/decks/new',
          name: 'DeckCreate',
          component: { template: '<div />' },
        },
        {
          path: '/study/init',
          name: 'SessionStart',
          component: { template: '<div />' },
        },
        {
          path: '/login',
          name: 'Login',
          component: { template: '<div>Login content</div>' },
        },
      ],
    },
  ],
})

describe('AppLayout', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    syncStatus.status.pending = false
    vi.spyOn(Deck, 'findAllForUser').mockResolvedValue([])
    vi.spyOn(Direction, 'findAllForDeck').mockResolvedValue([])
    vi.spyOn(Tag, 'findAllForDeck').mockResolvedValue([])
    vi.spyOn(Card, 'findAllForDeck').mockResolvedValue([])
    await layoutRouter.push('/layout/cards')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows shared navigation and content for non-immersive routes', async () => {
    const wrapper = mount(AppLayout, { global: { plugins: [layoutRouter] } })

    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.find('nav[aria-label="Main navigation"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Cards content')
    expect(wrapper.get('.min-h-dvh > div').classes()).toContain('sm:max-w-[720px]')
    expect(wrapper.get('main').classes()).toContain('px-4')
    expect(wrapper.get('main').classes()).toContain('py-5')
    expect(wrapper.get('nav[aria-label="Main navigation"] > div').classes()).not.toContain(
      'max-w-md',
    )
    expect(wrapper.classes()).toContain('min-h-dvh')
  })

  it('hides the header and bottom navigation on immersive routes', async () => {
    await layoutRouter.push('/layout/study')
    const wrapper = mount(AppLayout, { global: { plugins: [layoutRouter] } })

    expect(wrapper.find('header').exists()).toBe(false)
    expect(wrapper.find('nav[aria-label="Main navigation"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Study content')
    expect(wrapper.get('main').classes()).toContain('p-0')
    expect(wrapper.get('main').classes()).not.toContain('px-4')
  })

  it('disables the shared deck switcher while the card editor is open', async () => {
    await layoutRouter.push('/layout/card-editor')
    const wrapper = mount(AppLayout, { global: { plugins: [layoutRouter] } })

    expect(wrapper.get('[aria-label="Select active deck"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-label="Select active deck"]').find('svg').exists()).toBe(false)
    expect(wrapper.find('nav[aria-label="Main navigation"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Card editor content')
  })

  it('shows deck loading failures in the shared feedback banner', async () => {
    const deckStore = useDeckStore()
    deckStore.error = 'Unable to load your decks. Please try again.'
    vi.spyOn(deckStore, 'initialize').mockResolvedValue()
    useAuthStore().profile = new Profile('user-1', new Date(), new Date())
    const wrapper = mount(AppLayout, { global: { plugins: [layoutRouter] } })
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Unable to load your decks. Please try again.',
    )
    expect(wrapper.find('.feedback-banner').exists()).toBe(true)
    expect(wrapper.get('[role="alert"]').find('button').exists()).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text() === 'Try again')).toBe(true)
  })

  it('does not initialize deck data outside the router guard', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore(pinia).setAuthenticated(new Profile('user-1', new Date(), new Date()), {
      access_token: 'token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'refresh',
      user: {
        id: 'user-1',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      },
    })
    const findAllForUser = vi.spyOn(Deck, 'findAllForUser').mockResolvedValue([])
    const initialize = vi.spyOn(useDeckStore(pinia), 'initialize')

    mount(AppLayout, { global: { plugins: [pinia, layoutRouter] } })
    await flushPromises()

    expect(findAllForUser).not.toHaveBeenCalled()
    expect(initialize).not.toHaveBeenCalled()
  })

  it('immediately signs out and replaces the route when there are no pending changes', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore(pinia)
    authStore.setAuthenticated(new Profile('user-1', new Date(), new Date()), null)
    const logout = vi.spyOn(authStore, 'logout').mockResolvedValue()
    const wrapper = mount(AppLayout, { global: { plugins: [pinia, layoutRouter] } })

    await wrapper.get('button[aria-label="Log out"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(logout).toHaveBeenCalledOnce()
    expect(layoutRouter.currentRoute.value.name).toBe('Login')
  })

  it('allows cancelling the pending-changes logout confirmation', async () => {
    syncStatus.status.pending = true
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore(pinia)
    authStore.setAuthenticated(new Profile('user-1', new Date(), new Date()), null)
    const logout = vi.spyOn(authStore, 'logout').mockResolvedValue()
    const wrapper = mount(AppLayout, { global: { plugins: [pinia, layoutRouter] } })

    await wrapper.get('button[aria-label="Log out"]').trigger('click')

    expect(wrapper.get('[role="dialog"]').text()).toContain('Some changes have not been saved')
    await wrapper.get('[role="dialog"] button').trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(logout).not.toHaveBeenCalled()
    expect(layoutRouter.currentRoute.value.name).toBe('LayoutCards')
  })

  it('confirms logout with pending changes and surfaces logout failures', async () => {
    syncStatus.status.pending = true
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore(pinia)
    authStore.setAuthenticated(new Profile('user-1', new Date(), new Date()), null)
    const logout = vi.spyOn(authStore, 'logout').mockRejectedValue(new Error('Sign-out failed'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = mount(AppLayout, { global: { plugins: [pinia, layoutRouter] } })

    await wrapper.get('button[aria-label="Log out"]').trigger('click')
    await wrapper.get('[role="dialog"] button:last-child').trigger('click')
    await flushPromises()

    expect(logout).toHaveBeenCalledOnce()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.get('[role="alert"]').text()).toContain('Unable to log out')
    expect(layoutRouter.currentRoute.value.name).toBe('LayoutCards')
  })
})
