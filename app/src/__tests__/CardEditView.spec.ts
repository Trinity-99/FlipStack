import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Card } from '@/models/card'
import { Deck } from '@/models/deck'
import { Profile } from '@/models/profile'
import { Tag } from '@/models/tag'
import CardEditView from '@/views/CardEditView.vue'
import { useAuthStore } from '@/stores/authStore'
import { useCardStore } from '@/stores/cardStore'
import { useDeckStore } from '@/stores/deckStore'
import { useStudyStore } from '@/stores/studyStore'

const createdAt = new Date('2026-01-01T00:00:00.000Z')
const deck = new Deck(
  'deck-1',
  'user-1',
  'Thai',
  ['Script', 'Phonetic', 'Meaning'],
  createdAt,
  createdAt,
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/cards/new', name: 'CardCreate', component: CardEditView },
    { path: '/cards/edit/:id', name: 'CardEdit', component: CardEditView },
    { path: '/cards', name: 'CardList', component: { template: '<div>Card list</div>' } },
    { path: '/study', name: 'Study', component: { template: '<div>Study session</div>' } },
  ],
})

describe('CardEditView', () => {
  beforeEach(async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    useAuthStore().profile = new Profile('user-1', createdAt, createdAt)
    const deckStore = useDeckStore()
    deckStore.decks = [deck]
    deckStore.activeDeckId = deck.id
    deckStore.tags = [new Tag('tag-1', 'deck-1', 'Grammar', createdAt)]
    useCardStore().setCardsForDeck('deck-1', [])
    await router.push('/cards/new')
    await router.isReady()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function mountView(attachToDocument = false) {
    return mount(CardEditView, {
      attachTo: attachToDocument ? document.body : undefined,
      global: { plugins: [router] },
    })
  }

  async function clickButton(wrapper: ReturnType<typeof mountView>, label: string): Promise<void> {
    const button = wrapper.findAll('button').find((candidate) => candidate.text() === label)
    if (!button) throw new Error(`Expected a button labeled "${label}".`)
    await button.trigger('click')
  }

  it('renders the active deck side labels and available tags', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(
      wrapper.findAll('textarea').map((textarea) => textarea.attributes('aria-label')),
    ).toEqual(['Script', 'Phonetic', 'Meaning'])
    await wrapper.get('[aria-label="Expand tag selector"]').trigger('click')
    expect(wrapper.text()).toContain('Grammar')
    expect(wrapper.text()).not.toContain('Thai')
    expect(wrapper.get('section').classes()).not.toContain('max-w-md')
    expect(wrapper.get('h1').classes()).toContain('sm:text-3xl')
    expect(wrapper.get('form').classes()).toContain('p-4')
    expect(wrapper.get('form').classes()).toContain('sm:p-8')
    expect(wrapper.get('#card-side-1').attributes('rows')).toBe('2')
    expect(wrapper.get('#card-side-1').classes()).toContain('min-h-16')
  })

  it('renders only the side fields defined by a two-side active deck', async () => {
    const twoSideDeck = new Deck(
      'deck-2',
      'user-1',
      'Two-sided',
      ['Front', 'Back'],
      createdAt,
      createdAt,
    )
    const deckStore = useDeckStore()
    deckStore.decks = [twoSideDeck]
    deckStore.activeDeckId = twoSideDeck.id
    deckStore.tags = []
    useCardStore().setCardsForDeck('deck-2', [])
    const wrapper = mountView()
    await flushPromises()

    expect(
      wrapper.findAll('textarea').map((textarea) => textarea.attributes('aria-label')),
    ).toEqual(['Front', 'Back'])
  })

  it('creates a tag through the deck store and selects it for the current card', async () => {
    const deckStore = useDeckStore()
    const createdTag = new Tag('tag-2', 'deck-1', 'Nouns', createdAt)
    const createTag = vi.spyOn(deckStore, 'createTag').mockImplementation(async (name) => {
      expect(name).toBe('Nouns')
      deckStore.tags = [...deckStore.tags, createdTag]
      return createdTag
    })
    const wrapper = mountView()

    await wrapper.get('[aria-label="Create tag"]').trigger('click')
    await wrapper.get('#new-tag-name').setValue('Nouns')
    await wrapper.get('[aria-label="Add tag"]').trigger('click')
    await flushPromises()

    expect(createTag).toHaveBeenCalledWith('Nouns')
    expect(wrapper.find('[aria-label="Deselect Nouns"]').exists()).toBe(true)
    expect(wrapper.get('#tag-options button[aria-pressed="true"]').text()).toBe('Nouns')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows tag creation errors and does not select a tag when creation fails', async () => {
    vi.spyOn(useDeckStore(), 'createTag').mockRejectedValue(new Error('Database unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountView()

    await wrapper.get('[aria-label="Create tag"]').trigger('click')
    await wrapper.get('#new-tag-name').setValue('Nouns')
    await wrapper.get('[aria-label="Add tag"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Unable to create tag. Please try again.')
    expect(wrapper.find('#tag-options button[aria-pressed="true"]').exists()).toBe(false)
    expect(wrapper.get('#new-tag-name').element).toHaveProperty('value', 'Nouns')
  })

  it('does not cover the shell deck-retry banner with a redundant missing-deck error', async () => {
    const deckStore = useDeckStore()
    deckStore.decks = []
    deckStore.activeDeckId = null
    deckStore.error = 'Unable to load your decks. Please try again.'
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('saves partial content, clears the form, shows success, and restores focus', async () => {
    const save = vi.spyOn(Card.prototype, 'save').mockResolvedValue()
    const upsertCard = vi.spyOn(useCardStore(), 'upsertCard').mockImplementation(() => {})
    const wrapper = mountView(true)
    await flushPromises()

    await wrapper.get('#card-side-1').setValue('  Thai word  ')
    await wrapper.get('[aria-label="Expand tag selector"]').trigger('click')
    await wrapper.get('button[aria-pressed="false"]').trigger('click')
    await clickButton(wrapper, 'Save & Create Next')
    await flushPromises()

    expect(save).toHaveBeenCalledOnce()
    expect(upsertCard).toHaveBeenCalledOnce()
    expect(upsertCard.mock.calls[0]?.[0].content).toEqual({ s1: '  Thai word  ' })
    expect(upsertCard.mock.calls[0]?.[0].tagIds).toEqual(['tag-1'])
    expect(wrapper.get('#card-side-1').element).toHaveProperty('value', '')
    expect(wrapper.get('button[aria-pressed="false"]').text()).toBe('Grammar')
    expect(wrapper.get('[role="status"]').text()).toBe('Card saved successfully.')
    expect(wrapper.find('.feedback-banner').classes()).toContain(
      'top-[calc(env(safe-area-inset-top)+3.8125rem)]',
    )
    expect(wrapper.find('.feedback-banner').classes()).toContain('bg-emerald-950/95')
    expect(document.activeElement).toBe(wrapper.get('#card-side-1').element)
    wrapper.unmount()
  })

  it('clears the create-next success message after two seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(Card.prototype, 'save').mockResolvedValue()
    vi.spyOn(useCardStore(), 'upsertCard').mockImplementation(() => {})
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#card-side-1').setValue('Word')
    await clickButton(wrapper, 'Save & Create Next')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toBe('Card saved successfully.')
    await vi.advanceTimersByTimeAsync(1999)
    expect(wrapper.get('[role="status"]').text()).toBe('Card saved successfully.')
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('blocks an empty card and clears the error when editing begins', async () => {
    const save = vi.spyOn(Card.prototype, 'save')
    const wrapper = mountView()
    await flushPromises()
    await clickButton(wrapper, 'Save & Create Next')

    expect(wrapper.get('[role="alert"]').text()).toBe('At least one side must contain text')
    expect(wrapper.find('.feedback-banner').classes()).toContain('z-[60]')
    expect(wrapper.find('.feedback-banner').classes()).toContain(
      'top-[calc(env(safe-area-inset-top)+3.8125rem)]',
    )
    expect(wrapper.find('.feedback-banner').classes()).toContain('bg-rose-950/95')
    expect(save).not.toHaveBeenCalled()

    await wrapper.get('#card-side-1').setValue('Corrected')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('rejects side content exceeding the shared limit', async () => {
    const save = vi.spyOn(Card.prototype, 'save')
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#card-side-1').setValue('x'.repeat(Card.MAX_SIDE_LENGTH + 1))
    await clickButton(wrapper, 'Save & Create Next')

    expect(wrapper.get('[role="alert"]').text()).toBe(
      `Each side must be ${Card.MAX_SIDE_LENGTH} characters or fewer.`,
    )
    expect(save).not.toHaveBeenCalled()
  })

  it('shows one two-second banner for repeated attempts beyond the character limit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const wrapper = mountView()
    await flushPromises()
    const textarea = wrapper.get('#card-side-1')
    await textarea.setValue('x'.repeat(Card.MAX_SIDE_LENGTH))

    await textarea.trigger('keydown', { key: 'x' })
    expect(wrapper.get('[role="alert"]').text()).toBe(
      `Each side is limited to ${Card.MAX_SIDE_LENGTH} characters.`,
    )
    await textarea.trigger('keydown', { key: 'x' })

    await vi.advanceTimersByTimeAsync(1999)
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
    wrapper.unmount()
  })

  it('saves and navigates to the card list when Save & Close is chosen', async () => {
    vi.spyOn(Card.prototype, 'save').mockResolvedValue()
    vi.spyOn(useCardStore(), 'upsertCard').mockImplementation(() => {})
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#card-side-1').setValue('Word')
    await clickButton(wrapper, 'Save & Close')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('CardList')
  })

  it('cancels card creation and returns to the previous view without saving', async () => {
    const save = vi.spyOn(Card.prototype, 'save')
    await router.push('/cards')
    await router.push('/cards/new')
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#card-side-1').setValue('Unsaved word')

    await clickButton(wrapper, 'Cancel')
    await flushPromises()

    expect(save).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('CardList')
  })

  it('cancels card editing and discards changes without saving', async () => {
    const existingCard = new Card(
      'card-1',
      'deck-1',
      'user-1',
      { s1: 'Word', s2: 'Sound' },
      ['tag-1'],
      createdAt,
      createdAt,
    )
    vi.spyOn(Card, 'findById').mockResolvedValue(existingCard)
    const save = vi.spyOn(Card.prototype, 'save')
    await router.push('/cards')
    await router.push('/cards/edit/card-1')
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#card-side-1').setValue('Unsaved correction')

    await clickButton(wrapper, 'Cancel')
    await flushPromises()

    expect(save).not.toHaveBeenCalled()
    expect(existingCard.content.s1).toBe('Word')
    expect(router.currentRoute.value.name).toBe('CardList')
  })

  it('returns to the card list when cancelling card creation after deck onboarding', async () => {
    const save = vi.spyOn(Card.prototype, 'save')
    await router.push('/cards/new?returnTo=card-list')
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#card-side-1').setValue('Unsaved word')

    await clickButton(wrapper, 'Cancel')
    await flushPromises()

    expect(save).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('CardList')
  })

  it('loads, updates, caches, and closes an existing card', async () => {
    const existingCard = new Card(
      'card-1',
      'deck-1',
      'user-1',
      { s1: 'Word', s2: 'Sound' },
      ['tag-1'],
      createdAt,
      createdAt,
    )
    vi.spyOn(Card, 'findById').mockResolvedValue(existingCard)
    vi.spyOn(Card.prototype, 'save').mockResolvedValue()
    const upsertCard = vi.spyOn(useCardStore(), 'upsertCard').mockImplementation(() => {})
    await router.push('/cards/edit/card-1')
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('#card-side-1').element).toHaveProperty('value', 'Word')
    expect(wrapper.get('#card-side-2').element).toHaveProperty('value', 'Sound')
    expect(wrapper.find('button[aria-pressed="true"]').text()).toBe('Grammar')

    await wrapper.get('#card-side-1').setValue('Updated word')
    await clickButton(wrapper, 'Save Changes')
    await flushPromises()

    expect(existingCard.content.s1).toBe('Updated word')
    expect(upsertCard).toHaveBeenCalledWith(existingCard)
    expect(router.currentRoute.value.name).toBe('CardList')
  })

  it('shows delete and cross icons beside Cancel only when editing', async () => {
    vi.spyOn(Card, 'findById').mockResolvedValue(
      new Card('card-1', 'deck-1', 'user-1', { s1: 'Word' }, [], createdAt, createdAt),
    )
    await router.push('/cards/edit/card-1')
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[aria-label="Delete card"]').text()).toContain('Delete')
    expect(wrapper.find('[aria-label="Delete card"] svg').exists()).toBe(true)
    expect(wrapper.get('[aria-label="Cancel editing"]').text()).toContain('Cancel')
    expect(wrapper.find('[aria-label="Cancel editing"] svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not delete a card unless deletion is confirmed', async () => {
    const existingCard = new Card(
      'card-1',
      'deck-1',
      'user-1',
      { s1: 'Word' },
      [],
      createdAt,
      createdAt,
    )
    vi.spyOn(Card, 'findById').mockResolvedValue(existingCard)
    const deleteCard = vi.spyOn(existingCard, 'delete').mockResolvedValue()
    await router.push('/cards/edit/card-1')
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[aria-label="Delete card"]').trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('Delete this card?')
    await wrapper.get('[role="dialog"] button').trigger('click')
    await flushPromises()

    expect(deleteCard).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('CardEdit')
  })

  it('deletes a confirmed card, removes its cache entry, and returns to the card list', async () => {
    const existingCard = new Card(
      'card-1',
      'deck-1',
      'user-1',
      { s1: 'Word' },
      [],
      createdAt,
      createdAt,
    )
    vi.spyOn(Card, 'findById').mockResolvedValue(existingCard)
    const deleteCard = vi.spyOn(existingCard, 'delete').mockResolvedValue()
    const cardStore = useCardStore()
    cardStore.setCardsForDeck('deck-1', [existingCard])
    await router.push('/cards/edit/card-1')
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[aria-label="Delete card"]').trigger('click')
    await clickButton(wrapper, 'Delete card')
    await flushPromises()

    expect(deleteCard).toHaveBeenCalledOnce()
    expect(cardStore.cards).toEqual([])
    expect(router.currentRoute.value.name).toBe('CardList')
  })

  it('removes a deleted study card from the active session and returns to study', async () => {
    const existingCard = new Card(
      'card-1',
      'deck-1',
      'user-1',
      { s1: 'Word' },
      [],
      createdAt,
      createdAt,
    )
    vi.spyOn(Card, 'findById').mockResolvedValue(existingCard)
    vi.spyOn(existingCard, 'delete').mockResolvedValue()
    const removeCardFromSession = vi.spyOn(useStudyStore(), 'removeCardFromSession')
    await router.push('/study')
    await router.push('/cards/edit/card-1?returnTo=study')
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[aria-label="Delete card"]').trigger('click')
    await clickButton(wrapper, 'Delete card')
    await flushPromises()

    expect(removeCardFromSession).toHaveBeenCalledWith(existingCard)
    expect(router.currentRoute.value.name).toBe('Study')
  })

  it('keeps the card cached and shows an error when deletion fails', async () => {
    const existingCard = new Card(
      'card-1',
      'deck-1',
      'user-1',
      { s1: 'Word' },
      [],
      createdAt,
      createdAt,
    )
    vi.spyOn(Card, 'findById').mockResolvedValue(existingCard)
    vi.spyOn(existingCard, 'delete').mockRejectedValue(new Error('Database unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cardStore = useCardStore()
    cardStore.setCardsForDeck('deck-1', [existingCard])
    await router.push('/cards/edit/card-1')
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[aria-label="Delete card"]').trigger('click')
    await clickButton(wrapper, 'Delete card')
    await flushPromises()

    expect(cardStore.cards).toEqual([existingCard])
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Unable to delete this card. Please try again.',
    )
    expect(router.currentRoute.value.name).toBe('CardEdit')
  })

  it('returns to the study session after saving an edited study card', async () => {
    const existingCard = new Card(
      'card-1',
      'deck-1',
      'user-1',
      { s1: 'Word', s2: 'Sound' },
      ['tag-1'],
      createdAt,
      createdAt,
    )
    vi.spyOn(Card, 'findById').mockResolvedValue(existingCard)
    vi.spyOn(Card.prototype, 'save').mockResolvedValue()
    const replaceCurrentCard = vi.spyOn(useStudyStore(), 'replaceCurrentCard')
    await router.push('/study')
    await router.push('/cards/edit/card-1?returnTo=study')
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('#card-side-1').setValue('Corrected word')
    await clickButton(wrapper, 'Save Changes')
    await flushPromises()

    expect(replaceCurrentCard).toHaveBeenCalledWith(existingCard)
    expect(router.currentRoute.value.name).toBe('Study')
  })

  it('renders HTML-looking card content as literal textarea text', async () => {
    const literalText = '<img src=x onerror=alert(1)>'
    vi.spyOn(Card, 'findById').mockResolvedValue(
      new Card('card-1', 'deck-1', 'user-1', { s1: literalText }, [], createdAt, createdAt),
    )
    await router.push('/cards/edit/card-1')
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('#card-side-1').element).toHaveProperty('value', literalText)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('prevents editing a card from a different deck', async () => {
    vi.spyOn(Card, 'findById').mockResolvedValue(
      new Card('card-2', 'another-deck', 'user-1', { s1: 'Other' }, [], createdAt, createdAt),
    )
    await router.push('/cards/edit/card-2')
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Unable to find this card in the active deck.',
    )
    const saveButton = wrapper.findAll('button').find((button) => button.text() === 'Save Changes')
    expect(saveButton?.attributes('disabled')).toBeDefined()
  })

  it('does not show success or navigate when persistence fails', async () => {
    vi.spyOn(Card.prototype, 'save').mockRejectedValue(new Error('Database unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#card-side-1').setValue('Word')
    await clickButton(wrapper, 'Save & Close')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Unable to save this card. Please try again.')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('CardCreate')
  })

  it('shows the persistent offline banner and prevents saving an edited card until reconnected', async () => {
    const card = new Card(
      'card-1',
      'deck-1',
      'user-1',
      { s1: 'Word', s2: 'Phonetic' },
      [],
      createdAt,
      createdAt,
    )
    const save = vi.spyOn(Card.prototype, 'save').mockResolvedValue()
    vi.spyOn(Card, 'findById').mockResolvedValue(card)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    await router.push('/cards/edit/card-1')
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toBe(
      'Please connect to the Internet — offline data entry is not supported',
    )
    expect((wrapper.get('#card-side-1').element as HTMLTextAreaElement).matches(':disabled')).toBe(
      true,
    )
    const saveButton = wrapper.findAll('button').find((button) => button.text() === 'Save Changes')
    if (!saveButton) throw new Error('Expected the save action while editing a card.')
    expect(saveButton.attributes('disabled')).toBeDefined()
    await clickButton(wrapper, 'Save Changes')
    expect(save).not.toHaveBeenCalled()

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    window.dispatchEvent(new Event('online'))
    await flushPromises()

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect((wrapper.get('#card-side-1').element as HTMLTextAreaElement).matches(':disabled')).toBe(
      false,
    )
    await clickButton(wrapper, 'Save Changes')
    await flushPromises()
    expect(save).toHaveBeenCalledOnce()
  })
})
