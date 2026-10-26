import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudyService } from '@/engine/studyService'
import { Card } from '@/models/card'
import { CardProgress } from '@/models/cardProgress'
import { Deck } from '@/models/deck'
import { Direction } from '@/models/direction'

const service = new StudyService()
const deck = new Deck('deck-1', 'user-1', 'Language', ['Script', 'Meaning', 'Example'], null, null)
const direction = new Direction(
  'direction-1',
  'deck-1',
  [
    { side: 1, role: 'question' },
    { side: 2, role: 'answer' },
    { side: 3, role: 'extra' },
  ],
  null,
)

function createCard(id: string, content: Card['content'], tagIds: string[] = []): Card {
  return new Card(id, 'deck-1', 'user-1', content, tagIds, null, null)
}

describe('StudyService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requires question and answer content but not extra content', () => {
    expect(
      service.isCardEligible(createCard('eligible', { s1: 'word', s2: 'translation' }), direction),
    ).toBe(true)
    expect(
      service.isCardEligible(createCard('missing-question', { s2: 'translation' }), direction),
    ).toBe(false)
    expect(service.isCardEligible(createCard('missing-answer', { s1: 'word' }), direction)).toBe(
      false,
    )
    expect(
      service.isCardEligible(createCard('blank-answer', { s1: 'word', s2: '  ' }), direction),
    ).toBe(false)
  })

  it('creates an unsaved default direction for two- and three-sided decks', () => {
    const twoSideDeck = new Deck('deck-2', 'user-1', 'Basic', ['Front', 'Back'], null, null)
    const twoSideDefault = service.createDefaultDirection(twoSideDeck)
    const threeSideDefault = service.createDefaultDirection(deck)

    expect(twoSideDefault.id).toBeNull()
    expect(twoSideDefault.configuration).toEqual([
      { side: 1, role: 'question' },
      { side: 2, role: 'answer' },
    ])
    expect(threeSideDefault.configuration).toEqual([
      { side: 1, role: 'question' },
      { side: 2, role: 'answer' },
      { side: 3, role: 'answer' },
    ])
  })

  it('filters by topic and treats missing progress as zero', () => {
    const taggedCard = createCard('tagged', { s1: 'one', s2: 'uno' }, ['tag-1'])
    const otherCard = createCard('other', { s1: 'two', s2: 'dos' }, ['tag-2'])

    const summary = service.getPoolSummary([taggedCard, otherCard], direction, [], 'tag-1')

    expect(summary.eligibleCards).toEqual([taggedCard])
    expect(summary.cardsToLearn).toEqual([taggedCard])
    expect(summary.eligibleCount).toBe(1)
    expect(summary.cardsToLearnCount).toBe(1)
    expect(summary.isMastered).toBe(false)
  })

  it('separates mastered and not-yet-mastered cards in the summary', () => {
    const masteredCard = createCard('mastered', { s1: 'one', s2: 'uno' })
    const learningCard = createCard('learning', { s1: 'two', s2: 'dos' })
    const progress = [
      new CardProgress(
        'progress-1',
        'user-1',
        'mastered',
        'direction-1',
        10,
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    ]

    const summary = service.getPoolSummary([masteredCard, learningCard], direction, progress, null)

    expect(summary.eligibleCount).toBe(2)
    expect(summary.cardsToLearn).toEqual([learningCard])
    expect(summary.cardsToLearnCount).toBe(1)
    expect(summary.isMastered).toBe(false)
  })

  it('marks a non-empty topic mastered only when all eligible cards are at ten', () => {
    const card = createCard('mastered', { s1: 'one', s2: 'uno' })
    const progress = [
      new CardProgress(
        'progress-1',
        'user-1',
        'mastered',
        'direction-1',
        10,
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    ]

    expect(service.getPoolSummary([card], direction, progress, null).isMastered).toBe(true)
    expect(service.getPoolSummary([], direction, progress, null).isMastered).toBe(false)
  })

  it('resets only eligible cards belonging to the selected topic', async () => {
    const taggedEligible = createCard('tagged-eligible', { s1: 'one', s2: 'uno' }, ['tag-1'])
    const untaggedEligible = createCard('other-topic', { s1: 'two', s2: 'dos' }, ['tag-2'])
    const ineligible = createCard('ineligible', { s1: 'three' }, ['tag-1'])
    const reset = vi.spyOn(CardProgress, 'resetForUserCardsAndDirection').mockResolvedValue()

    await service.resetMastery(
      'user-1',
      [taggedEligible, untaggedEligible, ineligible],
      direction,
      'tag-1',
    )

    expect(reset).toHaveBeenCalledWith('user-1', ['tagged-eligible'], 'direction-1')
  })

  it('rejects mastery reset for an unsaved direction', async () => {
    const temporaryDirection = service.createDefaultDirection(deck)

    await expect(service.resetMastery('user-1', [], temporaryDirection, null)).rejects.toThrow(
      'Cannot reset mastery for an unsaved direction.',
    )
  })
})
