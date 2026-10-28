import { Card } from '@/models/card'
import { CardProgress } from '@/models/cardProgress'
import { Deck } from '@/models/deck'
import { Direction, type DirectionStep } from '@/models/direction'
import { Profile } from '@/models/profile'

export interface StudyContext {
  userId: string | null
  activeDeckId: string | null
  loadedDeckId: string | null
  cards: Card[]
}

export interface StudyPoolSummary {
  eligibleCards: Card[]
  cardsToLearn: Card[]
  eligibleCount: number
  cardsToLearnCount: number
  isMastered: boolean
}

export interface StudyPoolState {
  progressRecords: CardProgress[]
  poolSummary: StudyPoolSummary
}

export interface StudySessionStartResult extends StudyPoolState {
  direction: Direction
  updatedProfile: Profile
}

export type StudyRating = 'got-it' | 'needs-review'

export interface StudySessionState extends StudyPoolState {
  userId: string
  cards: Card[]
  direction: Direction
  tagId: string | null
  topicLabel: string
  currentCard: Card | null
  masteredDuringSession: number
  isSessionComplete: boolean
}

/**
 * @summary Identifies a direction configuration already saved for the active deck.
 */
export class DirectionAlreadyExistsError extends Error {
  /**
   * @summary Creates an error for an exact duplicate direction configuration.
   */
  constructor() {
    super('This direction already exists.')
    this.name = 'DirectionAlreadyExistsError'
  }
}

/**
 * @summary Coordinates study workflows and contains study eligibility, mastery, and pool rules.
 */
export class StudyService {
  private readonly progressSaveQueues = new Map<string, Promise<void>>()

  /**
   * @summary Loads progress and calculates a topic's eligible and unmastered card pools.
   * @param {StudyContext} context - The authenticated user and loaded active-deck cards.
   * @param {Direction} direction - The selected study direction.
   * @param {string | null} tagId - The selected topic, or null for the whole deck.
   * @returns {Promise<StudyPoolState>} The progress records and calculated pool summary.
   * @throws {Error} If the study context is invalid or progress cannot be loaded.
   */
  public async loadPoolSummary(
    context: StudyContext,
    direction: Direction,
    tagId: string | null,
  ): Promise<StudyPoolState> {
    const { userId, cards } = this.getStudyContext(context, direction)
    const progressRecords = await this.loadProgress(direction, userId)

    return {
      progressRecords,
      poolSummary: this.getPoolSummary(cards, direction, progressRecords, tagId),
    }
  }

  /**
   * @summary Rejects a duplicate direction and persists a new configuration.
   * @param {string} deckId - The deck that owns the direction.
   * @param {DirectionStep[]} configuration - The ordered side and role configuration.
   * @param {Direction[]} existingDirections - Directions already loaded for the deck.
   * @returns {Promise<Direction>} The newly saved direction.
   * @throws {Error} If the deck ID is invalid, the configuration is duplicated, or saving fails.
   */
  public async createDirection(
    deckId: string,
    configuration: DirectionStep[],
    existingDirections: Direction[],
  ): Promise<Direction> {
    if (!deckId || !deckId.trim()) {
      throw new Error('Cannot create a direction without an active deck ID.')
    }

    const isDuplicate = existingDirections.some(
      (existingDirection) =>
        existingDirection.deckId === deckId &&
        existingDirection.configuration.length === configuration.length &&
        existingDirection.configuration.every(
          (step, index) =>
            step.side === configuration[index]?.side && step.role === configuration[index]?.role,
        ),
    )
    if (isDuplicate) {
      throw new DirectionAlreadyExistsError()
    }

    const direction = new Direction(null, deckId, configuration, null)
    await direction.save()
    return direction
  }

  /**
   * @summary Validates and persists session choices, then prepares the study pool.
   * @param {Profile | null} profile - The authenticated user's profile.
   * @param {StudyContext} context - The authenticated user and loaded active-deck cards.
   * @param {string[]} validTagIds - The topic IDs available in the active deck.
   * @param {string | null} tagId - The selected topic, or null for the whole deck.
   * @param {Direction} direction - The selected saved or temporary direction.
   * @returns {Promise<StudySessionStartResult>} The saved choices and prepared study pool.
   * @throws {Error} If the context, topic, direction, pool, or persistence operation is invalid.
   */
  public async startSession(
    profile: Profile | null,
    context: StudyContext,
    validTagIds: string[],
    tagId: string | null,
    direction: Direction,
  ): Promise<StudySessionStartResult> {
    const { userId, cards } = this.getStudyContext(context, direction)
    if (!profile) {
      throw new Error('Cannot save study preferences without an authenticated profile.')
    }
    if (tagId !== null && !validTagIds.includes(tagId)) {
      throw new Error('The selected topic does not belong to the active deck.')
    }

    const progressRecords = await this.loadProgress(direction, userId)
    const poolSummary = this.getPoolSummary(cards, direction, progressRecords, tagId)
    if (poolSummary.cardsToLearnCount === 0) {
      throw new Error('There are no cards left to learn for this topic and direction.')
    }

    if (!direction.id) await direction.save()
    if (!direction.id) throw new Error('The study direction could not be saved.')

    const updatedProfile = await profile.saveDeckPreference({
      deckId: direction.deckId,
      lastSelectedDirectionId: direction.id,
      lastSelectedTagId: tagId,
    })
    return { direction, updatedProfile, progressRecords, poolSummary }
  }

  /**
   * @summary Resets eligible progress for a topic and returns its refreshed pool state.
   * @param {StudyContext} context - The authenticated user and loaded active-deck cards.
   * @param {Direction} direction - The saved study direction.
   * @param {string | null} tagId - The selected topic, or null for the whole deck.
   * @returns {Promise<StudyPoolState>} The progress records and pool summary after reset.
   * @throws {Error} If the context is invalid, the direction is unsaved, or persistence fails.
   */
  public async resetMastery(
    context: StudyContext,
    direction: Direction,
    tagId: string | null,
  ): Promise<StudyPoolState> {
    const { userId, cards } = this.getStudyContext(context, direction)
    if (!direction.id) {
      throw new Error('Cannot reset mastery for an unsaved direction.')
    }

    const eligibleCardIds = cards
      .filter(
        (card) =>
          (tagId === null || card.tagIds.includes(tagId)) && this.isCardEligible(card, direction),
      )
      .flatMap((card) => (card.id ? [card.id] : []))

    await CardProgress.resetForUserCardsAndDirection(userId, eligibleCardIds, direction.id)
    const progressRecords = await this.loadProgress(direction, userId)

    return {
      progressRecords,
      poolSummary: this.getPoolSummary(cards, direction, progressRecords, tagId),
    }
  }

  /**
   * @summary Initializes active session state and selects its first weighted card.
   * @param {StudyContext} context - The authenticated user and loaded active-deck cards.
   * @param {Direction} direction - The saved direction used by this session.
   * @param {string | null} tagId - The selected topic, or null for the whole deck.
   * @param {string} topicLabel - The display name for the selected topic.
   * @param {CardProgress[]} progressRecords - Loaded progress for the selected direction.
   * @returns {StudySessionState} The initialized session and first selected card.
   * @throws {Error} If there are no unmastered eligible cards to study.
   */
  public startActiveSession(
    context: StudyContext,
    direction: Direction,
    tagId: string | null,
    topicLabel: string,
    progressRecords: CardProgress[],
  ): StudySessionState {
    const { userId, cards } = this.getStudyContext(context, direction)
    if (!direction.id) {
      throw new Error('Cannot start a study session with an unsaved direction.')
    }

    const poolSummary = this.getPoolSummary(cards, direction, progressRecords, tagId)
    const currentCard = this.selectNextCard(poolSummary.cardsToLearn, progressRecords, null)
    if (!currentCard) {
      throw new Error('There are no cards left to learn for this topic and direction.')
    }

    return {
      userId,
      cards,
      direction,
      tagId,
      topicLabel,
      progressRecords,
      poolSummary,
      currentCard,
      masteredDuringSession: 0,
      isSessionComplete: false,
    }
  }

  /**
   * @summary Applies a rating, refreshes the pool, selects the next card, and saves progress.
   * @param {StudySessionState} session - The current active study session.
   * @param {StudyRating} rating - The rating action to apply to the current card.
   * @returns {StudySessionState} The updated session state.
   * @throws {Error} If the current card or saved direction is invalid.
   */
  public rateCurrentCard(session: StudySessionState, rating: StudyRating): StudySessionState {
    const currentCard = session.currentCard
    const cardId = currentCard?.id
    const directionId = session.direction.id
    if (!currentCard || !cardId || !directionId) {
      throw new Error('Cannot rate a study card without an active card and saved direction.')
    }

    const existingProgress = session.progressRecords.find((record) => record.cardId === cardId)
    const progress =
      existingProgress ?? new CardProgress(null, session.userId, cardId, directionId, 0, new Date())
    const previousCounter = progress.counter

    if (rating === 'got-it' && progress.counter < 10) {
      progress.counter += 1
      progress.lastUpdated = new Date()
    } else if (rating === 'needs-review' && progress.counter > 0) {
      progress.counter -= 1
      progress.lastUpdated = new Date()
    }

    const progressRecords = existingProgress
      ? session.progressRecords.map((record) => (record === progress ? progress : record))
      : [...session.progressRecords, progress]
    const poolSummary = this.getPoolSummary(
      session.cards,
      session.direction,
      progressRecords,
      session.tagId,
    )
    const nextCard = this.selectNextCard(poolSummary.cardsToLearn, progressRecords, currentCard.id)
    const nextSession: StudySessionState = {
      ...session,
      progressRecords,
      poolSummary,
      currentCard: nextCard,
      masteredDuringSession:
        session.masteredDuringSession +
        (rating === 'got-it' && previousCounter === 9 && progress.counter === 10 ? 1 : 0),
      isSessionComplete: nextCard === null,
    }

    this.persistProgress(progress)

    return nextSession
  }

  private persistProgress(progress: CardProgress): void {
    const saveKey = `${progress.directionId}:${progress.cardId}`
    const snapshot = new CardProgress(
      progress.id,
      progress.userId,
      progress.cardId,
      progress.directionId,
      progress.counter,
      progress.lastUpdated,
    )
    const previousSave = this.progressSaveQueues.get(saveKey) ?? Promise.resolve()
    const currentSave = previousSave
      .catch(() => undefined)
      .then(async () => {
        try {
          await snapshot.save()
          if (snapshot.id && progress.id !== snapshot.id) {
            Object.assign(progress, { id: snapshot.id })
          }
        } catch (saveError: unknown) {
          console.error(
            'StudyService.rateCurrentCard failed to persist progress; session continues in memory:',
            saveError,
          )
        }
      })

    this.progressSaveQueues.set(saveKey, currentSave)
    void currentSave.then(() => {
      if (this.progressSaveQueues.get(saveKey) === currentSave) {
        this.progressSaveQueues.delete(saveKey)
      }
    })
  }

  /**
   * @summary Returns configured sides with non-empty content in their original order.
   * @param {Card} card - The card whose side content is displayed.
   * @param {Direction} direction - The direction that configures side order and roles.
   * @returns {DirectionStep[]} Display steps with blank optional sides omitted.
   */
  public getDisplaySteps(card: Card, direction: Direction): DirectionStep[] {
    return direction.configuration.filter((step) => {
      const content = card.content[`s${step.side}` as keyof typeof card.content]
      return typeof content === 'string' && content.trim().length > 0
    })
  }

  /**
   * @summary Chooses a card using score-based weights and avoids immediate repetition.
   * @param {Card[]} cards - The current unmastered card candidates.
   * @param {CardProgress[]} progressRecords - Progress used to calculate selection weights.
   * @param {string | null} previousCardId - The card shown on the previous turn.
   * @returns {Card | null} The randomly selected card, or null when no candidates remain.
   */
  public selectNextCard(
    cards: Card[],
    progressRecords: CardProgress[],
    previousCardId: string | null,
  ): Card | null {
    const candidates =
      cards.length > 1 && previousCardId
        ? cards.filter((card) => card.id !== previousCardId)
        : cards
    if (candidates.length === 0) return null

    const progressByCardId = new Map(
      progressRecords.map((record) => [record.cardId, record.counter] as const),
    )
    const weightedCandidates = candidates.map((card) => ({
      card,
      weight: Math.max(0, 10 - (card.id ? (progressByCardId.get(card.id) ?? 0) : 0)),
    }))
    const totalWeight = weightedCandidates.reduce((total, item) => total + item.weight, 0)
    if (totalWeight <= 0) return null

    let selection = Math.random() * totalWeight
    for (const candidate of weightedCandidates) {
      selection -= candidate.weight
      if (selection < 0) return candidate.card
    }

    return weightedCandidates[weightedCandidates.length - 1]?.card ?? null
  }

  private getStudyContext(
    context: StudyContext,
    direction: Direction,
  ): { userId: string; cards: Card[] } {
    if (!context.userId) {
      throw new Error('Cannot prepare a study pool without an authenticated profile.')
    }
    if (!context.activeDeckId || direction.deckId !== context.activeDeckId) {
      throw new Error('The study direction does not belong to the active deck.')
    }
    if (context.loadedDeckId !== context.activeDeckId) {
      throw new Error('Cards for the active deck have not finished loading.')
    }

    return { userId: context.userId, cards: context.cards }
  }

  private async loadProgress(direction: Direction, userId: string): Promise<CardProgress[]> {
    if (!direction.id) return []
    return CardProgress.findAllForUserAndDirection(userId, direction.id)
  }

  /**
   * @summary Checks whether a card has all required question and answer content.
   * @param {Card} card - The card to evaluate.
   * @param {Direction} direction - The direction whose required sides are checked.
   * @returns {boolean} Whether the card is eligible for the direction.
   */
  public isCardEligible(card: Card, direction: Direction): boolean {
    if (!card.content) return false

    const requiredSteps = direction.configuration.filter(
      (step) => step.role === 'question' || step.role === 'answer',
    )
    const questionCount = requiredSteps.filter((step) => step.role === 'question').length
    const answerCount = requiredSteps.filter((step) => step.role === 'answer').length
    if (questionCount !== 1 || answerCount === 0) return false

    return requiredSteps.every((step) => {
      const content = card.content[`s${step.side}` as keyof typeof card.content]
      return typeof content === 'string' && content.trim().length > 0
    })
  }

  /**
   * @summary Creates an unsaved direction using the product's standard side order.
   * @param {Deck} deck - The deck whose configured sides determine the default.
   * @returns {Direction} An unsaved default direction for the deck.
   * @throws {Error} If the deck has no persisted ID or valid side count.
   */
  public createDefaultDirection(deck: Deck): Direction {
    if (!deck.id) {
      throw new Error('Cannot create a default direction for an unsaved deck.')
    }
    if (deck.sideLabels.length !== 2 && deck.sideLabels.length !== 3) {
      throw new Error('Cannot create a default direction for a deck without two or three sides.')
    }

    return new Direction(
      null,
      deck.id,
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
        ...(deck.sideLabels.length === 3 ? [{ side: 3, role: 'answer' as const }] : []),
      ],
      null,
    )
  }

  /**
   * @summary Calculates direction-eligible and not-yet-mastered cards for a topic.
   * @param {Card[]} cards - All cards belonging to the active deck.
   * @param {Direction} direction - The selected direction.
   * @param {CardProgress[]} progress - Progress records for the selected direction.
   * @param {string | null} tagId - The selected tag, or null for the whole deck.
   * @returns {StudyPoolSummary} Counts and card sets used by the setup view and session.
   */
  public getPoolSummary(
    cards: Card[],
    direction: Direction,
    progress: CardProgress[],
    tagId: string | null,
  ): StudyPoolSummary {
    const progressByCardId = new Map(
      progress.map((record) => [record.cardId, record.counter] as const),
    )
    const eligibleCards = cards.filter(
      (card) =>
        (tagId === null || card.tagIds.includes(tagId)) && this.isCardEligible(card, direction),
    )
    const cardsToLearn = eligibleCards.filter(
      (card) => (card.id ? (progressByCardId.get(card.id) ?? 0) : 0) < 10,
    )

    return {
      eligibleCards,
      cardsToLearn,
      eligibleCount: eligibleCards.length,
      cardsToLearnCount: cardsToLearn.length,
      isMastered: eligibleCards.length > 0 && cardsToLearn.length === 0,
    }
  }
}
