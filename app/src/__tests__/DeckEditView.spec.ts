import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Deck } from '@/models/deck'
import { Profile } from '@/models/profile'
import DeckEditView from '@/views/DeckEditView.vue'
import { useAuthStore } from '@/stores/authStore'
import { useDeckStore } from '@/stores/deckStore'

const createdAt = new Date('2026-01-01T00:00:00.000Z')
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/decks/new', name: 'DeckCreate', component: DeckEditView },
    { path: '/decks/:deckId/edit', name: 'DeckEdit', component: DeckEditView },
    { path: '/cards/new', name: 'CardCreate', component: { template: '<div>Card creation</div>' } },
  ],
})

describe('DeckEditView', () => {
  beforeEach(async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    useAuthStore().profile = new Profile('user-1', createdAt, createdAt)
    await router.push('/decks/new')
    await router.isReady()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mountView() {
    return mount(DeckEditView, {
      global: {
        plugins: [router],
      },
    })
  }

  function mockSuccessfulSave(deckId = 'deck-saved'): void {
    vi.spyOn(Deck.prototype, 'save').mockImplementation(async function (this: Deck) {
      Object.assign(this, { id: deckId })
    })
  }

  it('creates a deck, updates the cache, and opens card creation when requested', async () => {
    mockSuccessfulSave()
    const selectActiveDeck = vi.spyOn(useDeckStore(), 'selectActiveDeck').mockResolvedValue()
    const wrapper = mountView()

    await wrapper.get('#deck-name').setValue('Thai')
    await wrapper.get('#side-label-1').setValue('Script')
    await wrapper.get('#side-label-2').setValue('Meaning')
    await wrapper.get('#side-label-3').setValue('Thai')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('Deck "Thai" saved successfully')
    expect(wrapper.find('.feedback-banner').exists()).toBe(true)
    expect(useDeckStore().decks[0]?.title).toBe('Thai')
    expect(router.currentRoute.value.name).toBe('DeckCreate')

    const addCardsButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Add cards to this deck')
    if (!addCardsButton) throw new Error('Expected the add-cards action after saving the deck.')
    await addCardsButton.trigger('click')
    await flushPromises()

    expect(selectActiveDeck).toHaveBeenCalledWith('deck-saved')
    expect(router.currentRoute.value.name).toBe('CardCreate')
  })

  it('keeps the user on the editor when activating the saved deck fails', async () => {
    mockSuccessfulSave()
    vi.spyOn(useDeckStore(), 'selectActiveDeck').mockRejectedValue(new Error('Activation failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountView()

    await wrapper.get('#deck-name').setValue('Thai')
    await wrapper.get('#side-label-1').setValue('Script')
    await wrapper.get('#side-label-2').setValue('Meaning')
    await wrapper.get('#side-label-3').setValue('Thai')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const addCardsButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Add cards to this deck')
    if (!addCardsButton) throw new Error('Expected the add-cards action after saving the deck.')
    await addCardsButton.trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('was saved, but could not be activated')
    expect(wrapper.find('.feedback-banner').exists()).toBe(true)
    expect(router.currentRoute.value.name).toBe('DeckCreate')
  })

  it('saves only the visible side labels in two-side mode', async () => {
    const persistedDecks: Deck[] = []
    vi.spyOn(Deck.prototype, 'save').mockImplementation(async function (this: Deck) {
      persistedDecks.push(this)
      Object.assign(this, { id: 'deck-saved' })
    })
    const wrapper = mountView()

    await wrapper.get('#deck-name').setValue('Thai')
    await wrapper.get('#side-label-1').setValue('Script')
    await wrapper.get('#side-label-2').setValue('Meaning')
    await wrapper.get('#side-label-3').setValue('Hidden')
    await wrapper.get('button[aria-pressed="false"]').trigger('click')

    expect(wrapper.find('#side-label-3').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(persistedDecks[0]?.sideLabels).toEqual(['Script', 'Meaning'])
  })

  it('shows the specified title length error before saving', async () => {
    const save = vi.spyOn(Deck.prototype, 'save')
    const wrapper = mountView()

    await wrapper.get('#deck-name').setValue('1234567890123456789012345')
    await wrapper.get('#side-label-1').setValue('Script')
    await wrapper.get('#side-label-2').setValue('Meaning')
    await wrapper.get('#side-label-3').setValue('Thai')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('[role="alert"]').text()).toBe('Deck name cannot exceed 24 characters')
    expect(save).not.toHaveBeenCalled()
  })

  it('clears an error when editing resumes', async () => {
    const wrapper = mountView()

    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('Deck name is required.')

    await wrapper.get('#deck-name').setValue('Thai')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('dismisses a save success banner after two seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    mockSuccessfulSave()
    const wrapper = mountView()

    await wrapper.get('#deck-name').setValue('Thai')
    await wrapper.get('#side-label-1').setValue('Script')
    await wrapper.get('#side-label-2').setValue('Meaning')
    await wrapper.get('#side-label-3').setValue('Thai')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('saved successfully')
    await vi.advanceTimersByTimeAsync(1999)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('loads an owned deck and updates it in the cache', async () => {
    const deck = new Deck('deck-1', 'user-1', 'Thai', ['Script', 'Meaning'], createdAt, createdAt)
    vi.spyOn(Deck, 'findById').mockResolvedValue(deck)
    mockSuccessfulSave('deck-1')
    await router.push('/decks/deck-1/edit')
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('#deck-name').element).toHaveProperty('value', 'Thai')
    expect(wrapper.find('#side-label-3').exists()).toBe(false)

    await wrapper.get('#deck-name').setValue('Thai Words')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(useDeckStore().decks).toEqual([deck])
    expect(deck.title).toBe('Thai Words')
  })

  it('does not allow editing a deck owned by another user', async () => {
    vi.spyOn(Deck, 'findById').mockResolvedValue(
      new Deck('deck-1', 'another-user', 'Private', ['Script', 'Meaning'], createdAt, createdAt),
    )
    await router.push('/decks/deck-1/edit')
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Unable to find this deck.')
    expect((wrapper.get('#deck-name').element as HTMLInputElement).matches(':disabled')).toBe(true)
  })

  it('disables form inputs and save while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toBe(
      'Please connect to the Internet — offline data entry is not supported',
    )
    expect((wrapper.get('#deck-name').element as HTMLInputElement).matches(':disabled')).toBe(true)
    expect(
      (wrapper.get('button[type="submit"]').element as HTMLButtonElement).matches(':disabled'),
    ).toBe(true)

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    window.dispatchEvent(new Event('online'))
    await flushPromises()

    expect((wrapper.get('#deck-name').element as HTMLInputElement).matches(':disabled')).toBe(false)

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    window.dispatchEvent(new Event('offline'))
    await flushPromises()

    expect((wrapper.get('#deck-name').element as HTMLInputElement).matches(':disabled')).toBe(true)
  })
})
