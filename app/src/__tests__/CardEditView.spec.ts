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
  ],
})

describe('CardEditView', () => {
  beforeEach(async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
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
    expect(wrapper.text()).toContain('Grammar')
    expect(wrapper.text()).not.toContain('Thai')
    expect(wrapper.get('form').classes()).toContain('p-4')
    expect(wrapper.get('form').classes()).toContain('sm:p-6')
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
})
