import { Card } from '@/models/card'
import { CardProgress } from '@/models/cardProgress'
import { Deck } from '@/models/deck'
import { Direction } from '@/models/direction'

export interface StudyPoolSummary {
  eligibleCards: Card[]
  cardsToLearn: Card[]
  eligibleCount: number
  cardsToLearnCount: number
  isMastered: boolean
}

/**
 * @summary Contains business rules for study eligibility, mastery, and session pools.
 */
export class StudyService {
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
   * @param {Direction} direction - The selected study direction.
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

  /**
   * @summary Resets progress for eligible cards in the selected topic and direction.
   * @param {string} userId - The authenticated user's UUID.
   * @param {Card[]} cards - The active deck's cards.
   * @param {Direction} direction - The selected saved direction.
   * @param {string | null} tagId - The selected tag, or null for the whole deck.
   * @returns {Promise<void>} A promise that resolves when matching progress is reset.
   * @throws {Error} If the direction is not saved or persistence fails.
   */
  public async resetMastery(
    userId: string,
    cards: Card[],
    direction: Direction,
    tagId: string | null,
  ): Promise<void> {
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
  }
}
