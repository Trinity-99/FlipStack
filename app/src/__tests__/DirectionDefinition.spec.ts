import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { Deck } from '@/models/deck'
import DirectionDefinition from '@/components/DirectionDefinition.vue'

const deck = new Deck('deck-1', 'user-1', 'Language', ['Script', 'Meaning', 'Phonetic'], null, null)

describe('DirectionDefinition', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mountModal() {
    vi.spyOn(Deck, 'findById').mockResolvedValue(deck)
    return mount(DirectionDefinition, {
      props: {
        deck,
        isSaving: false,
        errorMessage: null,
      },
    })
  }

  it('renders the deck labels and previews the model-generated name', async () => {
    const wrapper = mountModal()

    expect(wrapper.text()).toContain('Script')
    expect(wrapper.text()).toContain('Meaning')
    expect(wrapper.text()).toContain('Phonetic')

    await wrapper.get('button[aria-pressed="false"]').trigger('click')
    const answerButtons = wrapper.findAll('fieldset')[1]?.findAll('button')
    await answerButtons?.find((button) => button.text() === 'Meaning')?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Script - Meaning')
    expect(Deck.findById).toHaveBeenCalledWith('deck-1')
  })

  it('automatically selects the other side as Answer for a two-sided deck', async () => {
    const twoSidedDeck = new Deck('deck-2', 'user-1', 'Basic', ['Front', 'Back'], null, null)
    vi.spyOn(Deck, 'findById').mockResolvedValue(twoSidedDeck)
    const wrapper = mount(DirectionDefinition, {
      props: {
        deck: twoSidedDeck,
        isSaving: false,
        errorMessage: null,
      },
    })

    const questionButtons = wrapper.findAll('fieldset')[0]?.findAll('button')
    await questionButtons?.find((button) => button.text() === 'Front')?.trigger('click')
    await flushPromises()

    const answerButtons = wrapper.findAll('fieldset')[1]?.findAll('button')
    const backButton = answerButtons?.find((button) => button.text() === 'Back')
    expect(backButton?.attributes('aria-pressed')).toBe('true')
    expect(wrapper.text()).toContain('Front - Back')
    expect(wrapper.find('[aria-label="Extra side"]').exists()).toBe(false)

    await questionButtons?.find((button) => button.text() === 'Back')?.trigger('click')
    await flushPromises()

    const frontButton = wrapper
      .findAll('fieldset')[1]
      ?.findAll('button')
      .find((button) => button.text() === 'Front')
    expect(frontButton?.attributes('aria-pressed')).toBe('true')
    expect(wrapper.text()).toContain('Back - Front')
  })

  it('requires a question and answer and prevents assigning a side twice', async () => {
    const wrapper = mountModal()
    await wrapper.get('form').trigger('submit')

    expect(wrapper.text()).toContain('Choose one Question side.')

    const questionButton = wrapper
      .findAll('button[aria-pressed]')
      .find((button) => button.text() === 'Script')
    await questionButton?.trigger('click')
    await flushPromises()

    const answerButtons = wrapper.findAll('fieldset')[1]?.findAll('button')
    const overlappingAnswer = answerButtons?.find((button) => button.text() === 'Script')
    expect(overlappingAnswer?.attributes('disabled')).toBeDefined()

    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Choose at least one Answer side.')
  })

  it('keeps Question first and allows Answers and Extra to be reordered', async () => {
    const wrapper = mountModal()
    const questionButton = wrapper
      .findAll('button[aria-pressed]')
      .find((button) => button.text() === 'Script')
    await questionButton?.trigger('click')

    const answerButtons = wrapper.findAll('fieldset')[1]?.findAll('button')
    await answerButtons?.find((button) => button.text() === 'Phonetic')?.trigger('click')
    await wrapper.get('[aria-label="Extra side"]').setValue('2')
    await flushPromises()

    await wrapper.get('[aria-label="Move Meaning up"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Script - Meaning - Phonetic')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('save')?.[0]).toEqual([
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'extra' },
        { side: 3, role: 'answer' },
      ],
      'Script - Meaning - Phonetic',
    ])
  })

  it('shows save errors and emits cancellation without saving', async () => {
    const wrapper = mount(DirectionDefinition, {
      props: {
        deck,
        isSaving: false,
        errorMessage: 'This direction already exists.',
      },
    })

    expect(wrapper.text()).toContain('This direction already exists.')
    const cancelButton = wrapper.findAll('button').find((button) => button.text() === 'Cancel')
    await cancelButton?.trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
  })
})
