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
