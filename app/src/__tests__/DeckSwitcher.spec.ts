import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Deck } from '@/models/deck'
import { useDeckStore } from '@/stores/deckStore'
import DeckSwitcher from '@/components/DeckSwitcher.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'Home', component: { template: '<div />' } },
    { path: '/decks/new', name: 'DeckCreate', component: { template: '<div />' } },
  ],
})

describe('DeckSwitcher', () => {
  beforeEach(async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    await router.push('/')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mountSwitcher() {
    return mount(DeckSwitcher, {
      global: {
        plugins: [router],
      },
    })
  }

  it('shows the active deck and deck options', async () => {
    const store = useDeckStore()
    store.decks = [
      new Deck('deck-1', 'user-1', 'Thai', ['Script', 'Meaning'], null, null),
      new Deck('deck-2', 'user-1', 'Burmese', ['Script', 'Meaning'], null, null),
    ]
    store.activeDeckId = 'deck-1'
    const wrapper = mountSwitcher()

    expect(wrapper.get('[aria-label="Select active deck"]').text()).toContain('Thai')
    await wrapper.get('[aria-label="Select active deck"]').trigger('click')
    expect(wrapper.get('[role="menu"]').text()).toContain('Burmese')
  })

  it('closes after selecting another deck', async () => {
    const store = useDeckStore()
    store.decks = [
      new Deck('deck-1', 'user-1', 'Thai', ['Script', 'Meaning'], null, null),
      new Deck('deck-2', 'user-1', 'Burmese', ['Script', 'Meaning'], null, null),
    ]
    store.activeDeckId = 'deck-1'
    const selectDeck = vi.spyOn(store, 'selectActiveDeck').mockResolvedValue()
    const wrapper = mountSwitcher()

    await wrapper.get('[aria-label="Select active deck"]').trigger('click')
    const deckOption = wrapper
      .findAll('button[role="menuitem"]')
      .find((option) => option.text().includes('Burmese'))
    expect(deckOption).toBeDefined()
    if (!deckOption) throw new Error('Expected a menu option for the Burmese deck.')
    await deckOption.trigger('click')
    await flushPromises()

    expect(selectDeck).toHaveBeenCalledWith('deck-2')
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })

  it('provides a route to create a new deck', async () => {
    const wrapper = mountSwitcher()
    await wrapper.get('[aria-label="Select active deck"]').trigger('click')
    await wrapper.get('a[role="menuitem"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('DeckCreate')
  })
})
