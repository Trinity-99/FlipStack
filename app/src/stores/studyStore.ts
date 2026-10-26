import { shallowRef, ref } from 'vue'
import { defineStore } from 'pinia'
import { StudyService } from '@/engine/studyService'
import { Card } from '@/models/card'
import { CardProgress } from '@/models/cardProgress'
import { Direction } from '@/models/direction'
import type { StudyPoolSummary } from '@/engine/studyService'
import { useAuthStore } from '@/stores/authStore'
import { useCardStore } from '@/stores/cardStore'
import { useDeckStore } from '@/stores/deckStore'

/**
 * @summary Holds prepared study state and coordinates persistence with the Study Engine.
 */
export const useStudyStore = defineStore('study', () => {
  const authStore = useAuthStore()
  const cardStore = useCardStore()
  const deckStore = useDeckStore()
  const studyService = new StudyService()
  const poolSummary = shallowRef<StudyPoolSummary | null>(null)
  const sessionPool = shallowRef<Card[]>([])
  const progressRecords = shallowRef<CardProgress[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  let summaryRequestId = 0

  function getStudyContext(direction: Direction): { userId: string; cards: Card[] } {
    const profile = authStore.profile
    const activeDeckId = deckStore.activeDeckId

    if (!profile) throw new Error('Cannot prepare a study pool without an authenticated profile.')
    if (!activeDeckId || direction.deckId !== activeDeckId) {
      throw new Error('The study direction does not belong to the active deck.')
    }
    if (cardStore.loadedDeckId !== activeDeckId) {
      throw new Error('Cards for the active deck have not finished loading.')
    }

    return { userId: profile.id, cards: cardStore.cards }
  }

  async function loadProgress(direction: Direction, userId: string): Promise<CardProgress[]> {
    if (!direction.id) return []
    return CardProgress.findAllForUserAndDirection(userId, direction.id)
  }

  /**
   * @summary Loads progress and computes counts for the selected topic and direction.
   * @param {string | null} tagId - The selected tag, or null for the whole deck.
   * @param {Direction} direction - The selected direction.
   * @returns {Promise<void>} A promise that resolves when the summary is refreshed.
   * @throws {Error} If the active deck context or progress query fails.
   */
  async function loadPoolSummary(tagId: string | null, direction: Direction): Promise<void> {
    const requestId = ++summaryRequestId
    isLoading.value = true
    error.value = null

    try {
      const { userId, cards } = getStudyContext(direction)
      const progress = await loadProgress(direction, userId)
      if (requestId !== summaryRequestId) return

      progressRecords.value = progress
      poolSummary.value = studyService.getPoolSummary(cards, direction, progress, tagId)
      sessionPool.value = poolSummary.value.cardsToLearn
    } catch (loadError: unknown) {
      if (requestId === summaryRequestId) {
        error.value = 'Unable to calculate the study pool. Please try again.'
      }
      console.error('StudyStore.loadPoolSummary failed:', loadError)
      throw loadError
    } finally {
      if (requestId === summaryRequestId) isLoading.value = false
    }
  }

  /**
   * @summary Persists session choices and prepares the active study pool.
   * @param {string | null} tagId - The selected tag, or null for the whole deck.
   * @param {Direction} direction - The selected saved or temporary direction.
   * @returns {Promise<Direction>} The saved direction used by the session.
   * @throws {Error} If direction, preference, or pool preparation fails.
   */
  async function startSession(tagId: string | null, direction: Direction): Promise<Direction> {
    isLoading.value = true
    error.value = null

    try {
      const { userId, cards } = getStudyContext(direction)
      if (tagId !== null && !deckStore.tags.some((tag) => tag.id === tagId)) {
        throw new Error('The selected topic does not belong to the active deck.')
      }

      const existingProgress = await loadProgress(direction, userId)
      const initialSummary = studyService.getPoolSummary(cards, direction, existingProgress, tagId)
      if (initialSummary.cardsToLearnCount === 0) {
        throw new Error('There are no cards left to learn for this topic and direction.')
      }

      if (!direction.id) {
        await direction.save()
        deckStore.upsertDirection(direction)
      }
      if (!direction.id) throw new Error('The study direction could not be saved.')

      const profile = authStore.profile
      if (!profile)
        throw new Error('Cannot save study preferences without an authenticated profile.')

      const updatedProfile = await profile.saveDeckPreference({
        deckId: direction.deckId,
        lastSelectedDirectionId: direction.id,
        lastSelectedTagId: tagId,
      })
      authStore.setProfile(updatedProfile)

      const summary = studyService.getPoolSummary(cards, direction, existingProgress, tagId)
      if (summary.cardsToLearnCount === 0) {
        throw new Error('There are no cards left to learn for this topic and direction.')
      }

      progressRecords.value = existingProgress
      poolSummary.value = summary
      sessionPool.value = summary.cardsToLearn
      return direction
    } catch (startError: unknown) {
      error.value = 'Unable to start studying. Please try again.'
      console.error('StudyStore.startSession failed:', startError)
      throw startError
    } finally {
      isLoading.value = false
    }
  }

  /**
   * @summary Resets mastery for eligible topic cards and refreshes their pool summary.
   * @param {string | null} tagId - The selected tag, or null for the whole deck.
   * @param {Direction} direction - The selected saved direction.
   * @returns {Promise<void>} A promise that resolves after reset and refresh complete.
   * @throws {Error} If reset or summary refresh fails.
   */
  async function resetMastery(tagId: string | null, direction: Direction): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const { userId, cards } = getStudyContext(direction)
      await studyService.resetMastery(userId, cards, direction, tagId)
      await loadPoolSummary(tagId, direction)
    } catch (resetError: unknown) {
      error.value = 'Unable to reset mastery scores. Please try again.'
      console.error('StudyStore.resetMastery failed:', resetError)
      throw resetError
    } finally {
      isLoading.value = false
    }
  }

  return {
    poolSummary,
    sessionPool,
    progressRecords,
    isLoading,
    error,
    loadPoolSummary,
    startSession,
    resetMastery,
  }
})
