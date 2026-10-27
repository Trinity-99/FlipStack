import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudyService } from '@/engine/studyService'
import { Card } from '@/models/card'
import { CardProgress } from '@/models/cardProgress'
import { Deck } from '@/models/deck'
import { Direction } from '@/models/direction'
import { Profile } from '@/models/profile'

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
const context = {
  userId: 'user-1',
  activeDeckId: 'deck-1',
  loadedDeckId: 'deck-1',
  cards: [] as Card[],
}

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
    const loadProgress = vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockResolvedValue([])

    const result = await service.resetMastery(
      { ...context, cards: [taggedEligible, untaggedEligible, ineligible] },
      direction,
      'tag-1',
    )

    expect(reset).toHaveBeenCalledWith('user-1', ['tagged-eligible'], 'direction-1')
    expect(loadProgress).toHaveBeenCalledWith('user-1', 'direction-1')
    expect(result.poolSummary.cardsToLearn).toEqual([taggedEligible])
  })

  it('rejects mastery reset for an unsaved direction', async () => {
    const temporaryDirection = service.createDefaultDirection(deck)

    await expect(service.resetMastery(context, temporaryDirection, null)).rejects.toThrow(
      'Cannot reset mastery for an unsaved direction.',
    )
  })

  it('loads progress and calculates a pool in the Study Engine', async () => {
    const progress = [
      new CardProgress('progress-1', 'user-1', 'eligible', 'direction-1', 4, new Date()),
    ]
    vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockResolvedValue(progress)
    const card = createCard('eligible', { s1: 'word', s2: 'translation' })

    const state = await service.loadPoolSummary({ ...context, cards: [card] }, direction, null)

    expect(state.progressRecords).toEqual(progress)
    expect(state.poolSummary.cardsToLearn).toEqual([card])
  })

  it('calculates the session pool once and reuses it after persisting preferences', async () => {
    const card = createCard('eligible', { s1: 'word', s2: 'translation' })
    const sessionContext = { ...context, cards: [card] }
    const profile = new Profile('user-1', new Date(), new Date())
    const updatedProfile = new Profile('user-1', new Date(), new Date())
    vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockResolvedValue([])
    vi.spyOn(profile, 'saveDeckPreference').mockResolvedValue(updatedProfile)
    const calculatePool = vi.spyOn(service, 'getPoolSummary')

    const result = await service.startSession(profile, sessionContext, [], null, direction)

    expect(calculatePool).toHaveBeenCalledOnce()
    expect(result.poolSummary.cardsToLearn).toEqual([card])
    expect(result.updatedProfile).toBe(updatedProfile)
  })

  it('rejects an invalid study context before loading progress', async () => {
    const loadProgress = vi.spyOn(CardProgress, 'findAllForUserAndDirection')

    await expect(
      service.loadPoolSummary({ ...context, loadedDeckId: null }, direction, null),
    ).rejects.toThrow('Cards for the active deck have not finished loading.')
    expect(loadProgress).not.toHaveBeenCalled()
  })

  it('returns configured display steps while omitting blank optional sides', () => {
    const card = createCard('display-card', { s1: 'word', s2: 'translation', s3: '  ' })

    expect(service.getDisplaySteps(card, direction)).toEqual([
      { side: 1, role: 'question' },
      { side: 2, role: 'answer' },
    ])
  })

  it('selects cards according to their current weighted scores', () => {
    const newCard = createCard('new-card', { s1: 'new', s2: 'new answer' })
    const practicedCard = createCard('practiced-card', { s1: 'old', s2: 'old answer' })
    const progress = [
      new CardProgress(
        'progress-1',
        'user-1',
        'practiced-card',
        'direction-1',
        9,
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    ]
    const random = vi.spyOn(Math, 'random')

    random.mockReturnValueOnce(0).mockReturnValueOnce(0.99)
    expect(service.selectNextCard([newCard, practicedCard], progress, null)).toBe(newCard)
    expect(service.selectNextCard([newCard, practicedCard], progress, null)).toBe(practicedCard)
  })

  it('prevents immediate repetition when there are alternatives and allows a singleton pool', () => {
    const first = createCard('first', { s1: 'first', s2: 'first answer' })
    const second = createCard('second', { s1: 'second', s2: 'second answer' })
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(service.selectNextCard([first, second], [], 'first')).toBe(second)
    expect(service.selectNextCard([first], [], 'first')).toBe(first)
    expect(service.selectNextCard([], [], null)).toBeNull()
  })

  it('increments progress in the engine and completes when the card reaches ten', async () => {
    const card = createCard('last-card', { s1: 'word', s2: 'translation' })
    const progress = new CardProgress(
      'progress-last',
      'user-1',
      'last-card',
      'direction-1',
      9,
      new Date('2026-01-01T00:00:00.000Z'),
    )
    const saveProgress = vi.spyOn(CardProgress.prototype, 'save').mockResolvedValue()
    const session = service.startActiveSession(
      { ...context, cards: [card] },
      direction,
      null,
      'Whole Deck',
      [progress],
    )

    const updatedSession = service.rateCurrentCard(session, 'got-it')

    expect(progress.counter).toBe(10)
    expect(updatedSession.progressRecords).toContain(progress)
    expect(updatedSession.poolSummary.cardsToLearnCount).toBe(0)
    expect(updatedSession.masteredDuringSession).toBe(1)
    expect(updatedSession.currentCard).toBeNull()
    expect(updatedSession.isSessionComplete).toBe(true)
    await vi.waitFor(() => expect(saveProgress).toHaveBeenCalledOnce())
  })

  it('continues the session in memory if a progress save fails', async () => {
    const card = createCard('unsaved-card', { s1: 'word', s2: 'translation' })
    const saveError = new Error('network unavailable')
    vi.spyOn(CardProgress.prototype, 'save').mockRejectedValue(saveError)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const session = service.startActiveSession(
      { ...context, cards: [card] },
      direction,
      null,
      'Whole Deck',
      [],
    )

    const updatedSession = service.rateCurrentCard(session, 'got-it')
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('session continues in memory'),
        saveError,
      ),
    )

    expect(updatedSession.progressRecords[0]?.counter).toBe(1)
    expect(updatedSession.currentCard).toBe(card)
    expect(updatedSession.isSessionComplete).toBe(false)
  })
})
