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
      ],
    },
  ],
})

describe('AppLayout', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
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
    expect(wrapper.get('main').classes()).toContain('px-4')
    expect(wrapper.get('main').classes()).toContain('py-5')
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

  it('initializes deck data when an authenticated profile exists', async () => {
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

    mount(AppLayout, { global: { plugins: [pinia, layoutRouter] } })
    await vi.waitFor(() => expect(findAllForUser).toHaveBeenCalledWith('user-1'))
  })
})
