import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Card } from '@/models/card'
import { Deck } from '@/models/deck'
import { Tag } from '@/models/tag'
import CardListView from '@/views/CardListView.vue'
import { useCardStore } from '@/stores/cardStore'
import { useDeckStore } from '@/stores/deckStore'

const createdAt = new Date('2026-01-01T00:00:00.000Z')
const deck = new Deck(
  'deck-1',
  'user-1',
  'Thai',
  ['Script', 'Meaning', 'Example'],
  createdAt,
  createdAt,
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/cards', name: 'CardList', component: CardListView },
    { path: '/cards/new', name: 'CardCreate', component: { template: '<div>New card</div>' } },
    {
      path: '/cards/edit/:id',
      name: 'CardEdit',
      component: { template: '<div>Edit card</div>' },
    },
  ],
})

describe('CardListView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const deckStore = useDeckStore()
    deckStore.decks = [deck]
    deckStore.activeDeckId = deck.id
    deckStore.tags = [new Tag('tag-1', 'deck-1', 'Grammar', createdAt)]
    useCardStore().setCardsForDeck('deck-1', [])
    await router.push('/cards')
    await router.isReady()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mountView() {
    return mount(CardListView, { global: { plugins: [router] } })
  }

  it('renders configured side labels once in table headers', () => {
    const card = new Card(
      'card-1',
      'deck-1',
      'user-1',
      { s1: 'Sawadee', s2: 'Hello', s3: 'Example sentence' },
      [],
      createdAt,
      createdAt,
    )
    useCardStore().setCardsForDeck('deck-1', [card])

    const wrapper = mountView()

    expect(wrapper.findAll('thead th').map((header) => header.text())).toEqual([
      'Script↕',
      'Meaning↕',
      'Example↕',
    ])
    expect(wrapper.text()).toContain('Sawadee')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.findAll('tbody td')).toHaveLength(3)
  })

  it('renders only configured side headers and columns for a two-sided deck', () => {
    const twoSideDeck = new Deck(
      'deck-2',
      'user-1',
      'Basics',
      ['Front', 'Back'],
      createdAt,
      createdAt,
    )
    const deckStore = useDeckStore()
    deckStore.decks = [twoSideDeck]
    deckStore.activeDeckId = twoSideDeck.id
    useCardStore().setCardsForDeck('deck-2', [
      new Card(
        'card-1',
        'deck-2',
        'user-1',
        { s1: 'Question', s2: 'Answer' },
        [],
        createdAt,
        createdAt,
      ),
    ])

    const wrapper = mountView()

    expect(wrapper.findAll('thead th').map((header) => header.text())).toEqual(['Front↕', 'Back↕'])
    expect(wrapper.findAll('tbody td')).toHaveLength(2)
  })

  it('filters by one selected tag and resets to all tags', async () => {
    useCardStore().setCardsForDeck('deck-1', [
      new Card(
        'tagged-card',
        'deck-1',
        'user-1',
        { s1: 'Tagged' },
        ['tag-1'],
        createdAt,
        createdAt,
      ),
      new Card('other-card', 'deck-1', 'user-1', { s1: 'Other' }, [], createdAt, createdAt),
    ])
    const wrapper = mountView()
    const tagFilter = wrapper.get<HTMLSelectElement>('[aria-label="Filter cards by tag"]')

    await tagFilter.setValue('tag-1')
    expect(wrapper.text()).toContain('Tagged')
    expect(wrapper.text()).not.toContain('Other')

    await tagFilter.setValue('')
    expect(wrapper.text()).toContain('Tagged')
    expect(wrapper.text()).toContain('Other')
  })

  it('toggles header sorting between A–Z and Z–A without changing store order', async () => {
    const firstCard = new Card(
      'card-z',
      'deck-1',
      'user-1',
      { s1: 'Zulu', s2: 'second' },
      [],
      createdAt,
      createdAt,
    )
    const secondCard = new Card(
      'card-a',
      'deck-1',
      'user-1',
      { s1: 'apple', s2: 'first' },
      [],
      createdAt,
      createdAt,
    )
    useCardStore().setCardsForDeck('deck-1', [firstCard, secondCard])
    const wrapper = mountView()
    const cardRows = () => wrapper.findAll('tbody tr')
    const scriptHeader = wrapper.get(
      'thead th[aria-sort="none"] button[aria-label="Sort by Script ascending"]',
    )

    expect(cardRows().map((row) => row.get('td a').text())).toEqual(['Zulu', 'apple'])

    await scriptHeader.trigger('click')
    expect(cardRows().map((row) => row.get('td a').text())).toEqual(['apple', 'Zulu'])
    expect(wrapper.find('thead th[aria-sort="ascending"]').exists()).toBe(true)

    await wrapper.get('thead th[aria-sort="ascending"] button').trigger('click')
    expect(cardRows().map((row) => row.get('td a').text())).toEqual(['Zulu', 'apple'])
    expect(wrapper.find('thead th[aria-sort="descending"]').exists()).toBe(true)

    await wrapper.get('thead th[aria-sort="descending"] + th button').trigger('click')
    expect(cardRows().map((row) => row.get('td:nth-child(2) a').text())).toEqual([
      'first',
      'second',
    ])
    expect(wrapper.find('thead th[aria-sort="ascending"]').exists()).toBe(true)
    expect(useCardStore().cards).toEqual([firstCard, secondCard])
  })

  it('resets tag and sort controls when the active deck changes', async () => {
    useCardStore().setCardsForDeck('deck-1', [
      new Card('card-1', 'deck-1', 'user-1', { s1: 'Word' }, ['tag-1'], createdAt, createdAt),
    ])
    const wrapper = mountView()
    await wrapper.get('[aria-label="Filter cards by tag"]').setValue('tag-1')
    await wrapper.get('[aria-label="Sort by Script ascending"]').trigger('click')

    const nextDeck = new Deck(
      'deck-2',
      'user-1',
      'New deck',
      ['Term', 'Definition'],
      createdAt,
      createdAt,
    )
    const deckStore = useDeckStore()
    deckStore.decks = [...deckStore.decks, nextDeck]
    deckStore.tags = [new Tag('tag-2', 'deck-2', 'New tag', createdAt)]
    deckStore.activeDeckId = nextDeck.id
    await wrapper.vm.$nextTick()

    expect(wrapper.get<HTMLSelectElement>('[aria-label="Filter cards by tag"]').element.value).toBe(
      '',
    )
    expect(wrapper.find('thead th[aria-sort="none"]').exists()).toBe(true)
  })

  it('links a card to its edit route', async () => {
    useCardStore().setCardsForDeck('deck-1', [
      new Card('card-1', 'deck-1', 'user-1', { s1: 'Word' }, [], createdAt, createdAt),
    ])
    const wrapper = mountView()

    await wrapper.get('tbody a[href="/cards/edit/card-1"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('CardEdit')
    expect(router.currentRoute.value.params.id).toBe('card-1')
  })

  it('navigates to card creation with the active deck retained', async () => {
    const wrapper = mountView()

    await wrapper.get('[aria-label="Create a new card"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('CardCreate')
    expect(useDeckStore().activeDeckId).toBe('deck-1')
  })

  it('shows the no-deck message and hides the create action without an active deck', () => {
    useDeckStore().activeDeckId = null
    const wrapper = mountView()

    expect(wrapper.text()).toContain('please select a deck.')
    expect(wrapper.find('[aria-label="Create a new card"]').exists()).toBe(false)
  })

  it('shows an empty state and keeps card creation available when the deck has no cards', () => {
    const wrapper = mountView()

    expect(wrapper.text()).toContain('No cards in this deck yet.')
    expect(wrapper.find('[aria-label="Create a new card"]').exists()).toBe(true)
  })

  it('applies truncation styles to side content', () => {
    useCardStore().setCardsForDeck('deck-1', [
      new Card('card-1', 'deck-1', 'user-1', { s1: 'A long card side' }, [], createdAt, createdAt),
    ])
    const wrapper = mountView()

    expect(wrapper.get('tbody td a').classes()).toContain('truncate')
  })

  it('keeps table rows compact and headers larger than card content', () => {
    useCardStore().setCardsForDeck('deck-1', [
      new Card('card-1', 'deck-1', 'user-1', { s1: 'Word' }, [], createdAt, createdAt),
    ])
    const wrapper = mountView()
    const headerButton = wrapper.get('thead th button')
    const cellLink = wrapper.get('tbody td a')

    expect(headerButton.classes()).toContain('text-base')
    expect(cellLink.classes()).toContain('text-sm')
    expect(cellLink.classes()).not.toContain('min-h-11')
    expect(wrapper.get('tbody td').classes()).toContain('p-1')
  })
})
