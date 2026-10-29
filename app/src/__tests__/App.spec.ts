import { afterEach, describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '@/router'
import { Profile } from '@/models/profile'
import { useAuthStore } from '@/stores/authStore'

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the login view at the root route', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(Profile, 'restoreAuthentication').mockResolvedValue(null)
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Welcome back')
  })

  it('shows the startup indicator until auth and initial navigation are ready', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(Profile, 'restoreAuthentication').mockResolvedValue(null)
    await router.push('/')
    await router.isReady()

    const authStore = useAuthStore(pinia)
    authStore.isRestoring = true
    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.get('[role="status"]').attributes('aria-label')).toBe('Loading app')
    expect(wrapper.get('[role="status"] svg').classes()).toContain('text-indigo-500')

    authStore.isRestoring = false
    await flushPromises()

    expect(wrapper.text()).toContain('Welcome back')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('resolves navigation routes inside the app layout', () => {
    const cardsRoute = router.resolve('/cards')
    const studyRoute = router.resolve('/study')
    const sessionStartRoute = router.resolve('/study/init')
    const deckCreateRoute = router.resolve('/decks/new')
    const deckEditRoute = router.resolve('/decks/deck-1/edit')
    const cardCreateRoute = router.resolve('/cards/new')
    const cardEditRoute = router.resolve('/cards/edit/card-1')

    expect(cardsRoute.name).toBe('CardList')
    expect(cardsRoute.matched.some((record) => record.name === 'AppLayout')).toBe(true)
    expect(studyRoute.meta.immersive).toBe(true)
    expect(sessionStartRoute.name).toBe('SessionStart')
    expect(deckCreateRoute.name).toBe('DeckCreate')
    expect(deckCreateRoute.matched.some((record) => record.name === 'AppLayout')).toBe(true)
    expect(deckEditRoute.name).toBe('DeckEdit')
    expect(deckEditRoute.params.deckId).toBe('deck-1')
    expect(cardCreateRoute.name).toBe('CardCreate')
    expect(cardCreateRoute.meta.deckSwitcherDisabled).toBe(true)
    expect(cardCreateRoute.meta.hideBottomNavigation).toBe(true)
    expect(cardEditRoute.name).toBe('CardEdit')
    expect(cardEditRoute.meta.deckSwitcherDisabled).toBe(true)
    expect(cardEditRoute.meta.hideBottomNavigation).toBe(true)
    expect(router.resolve('/cards').name).toBe('CardList')
  })
})
