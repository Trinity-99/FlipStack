import { shallowRef, ref } from 'vue'
import { defineStore } from 'pinia'
import { StudyService } from '@/engine/studyService'
import type {
  StudyContext,
  StudyPoolState,
  StudyPoolSummary,
  StudyRating,
  StudySessionState,
} from '@/engine/studyService'
import { Card } from '@/models/card'
import { CardProgress } from '@/models/cardProgress'
import { Direction } from '@/models/direction'
import { useAuthStore } from '@/stores/authStore'
import { useCardStore } from '@/stores/cardStore'
import { useDeckStore } from '@/stores/deckStore'

/**
 * @summary Holds reactive study state and exposes Study Engine workflows to views.
 */
export const useStudyStore = defineStore('study', () => {
  const authStore = useAuthStore()
  const cardStore = useCardStore()
  const deckStore = useDeckStore()
  const studyService = new StudyService()
  const poolSummary = shallowRef<StudyPoolSummary | null>(null)
  const sessionPool = shallowRef<Card[]>([])
  const progressRecords = shallowRef<CardProgress[]>([])
  const activeSession = shallowRef<StudySessionState | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const preparedSession = shallowRef<{
    tagId: string | null
    direction: Direction
    topicLabel: string
  } | null>(null)
  let summaryRequestId = 0

  function getStudyContext(): StudyContext {
    return {
      userId: authStore.profile?.id ?? null,
      activeDeckId: deckStore.activeDeckId,
      loadedDeckId: cardStore.loadedDeckId,
      cards: cardStore.cards,
    }
  }

  function updatePoolState(state: StudyPoolState): void {
    progressRecords.value = state.progressRecords
    poolSummary.value = state.poolSummary
    sessionPool.value = state.poolSummary.cardsToLearn
  }

  /**
   * @summary Loads the prepared pool state for the selected topic and direction.
   * @param {string | null} tagId - The selected topic, or null for the whole deck.
   * @param {Direction} direction - The selected direction.
   * @returns {Promise<void>} A promise that resolves when the latest pool refresh completes.
   * @throws {Error} If the Study Engine cannot load or calculate the pool.
   */
  async function loadPoolSummary(tagId: string | null, direction: Direction): Promise<void> {
    const requestId = ++summaryRequestId
    isLoading.value = true
    error.value = null

    try {
      const state = await studyService.loadPoolSummary(getStudyContext(), direction, tagId)
      if (requestId === summaryRequestId) updatePoolState(state)
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
   * @summary Starts a session through the Study Engine and publishes its prepared state.
   * @param {string | null} tagId - The selected topic, or null for the whole deck.
   * @param {Direction} direction - The selected saved or temporary direction.
   * @returns {Promise<Direction>} The saved direction used by the session.
   * @throws {Error} If session preparation or persistence fails.
   */
  async function startSession(tagId: string | null, direction: Direction): Promise<Direction> {
    isLoading.value = true
    error.value = null
    const wasDirectionUnsaved = !direction.id

    try {
      const result = await studyService.startSession(
        authStore.profile,
        getStudyContext(),
        deckStore.tags.flatMap((tag) => (tag.id ? [tag.id] : [])),
        tagId,
        direction,
      )

      if (wasDirectionUnsaved) deckStore.upsertDirection(result.direction)
      authStore.setProfile(result.updatedProfile)
      updatePoolState(result)
      activeSession.value = null
      preparedSession.value = {
        tagId,
        direction: result.direction,
        topicLabel:
          (tagId ? deckStore.tags.find((tag) => tag.id === tagId)?.name : null) ?? 'Whole Deck',
      }
      return result.direction
    } catch (startError: unknown) {
      if (wasDirectionUnsaved && direction.id) deckStore.upsertDirection(direction)
      error.value = 'Unable to start studying. Please try again.'
      console.error('StudyStore.startSession failed:', startError)
      throw startError
    } finally {
      isLoading.value = false
    }
  }

  /**
   * @summary Initializes the active session through the Study Engine.
   * @returns {StudySessionState} The initialized active session.
   * @throws {Error} If no prepared session or eligible card is available.
   */
  function startActiveSession(): StudySessionState {
    error.value = null
    try {
      const prepared = preparedSession.value
      const context = getStudyContext()
      if (!prepared || !context.userId) {
        throw new Error('No prepared study session is available.')
      }

      const session = studyService.startActiveSession(
        context,
        prepared.direction,
        prepared.tagId,
        prepared.topicLabel,
        progressRecords.value,
      )
      activeSession.value = session
      updatePoolState(session)
      return session
    } catch (startError: unknown) {
      error.value = 'Unable to start studying. Please return to session setup and try again.'
      console.error('StudyStore.startActiveSession failed:', startError)
      throw startError
    }
  }

  /**
   * @summary Applies a rating through the Study Engine and publishes the updated session.
   * @param {StudyRating} rating - The rating action for the current card.
   * @returns {StudySessionState} The updated session state.
   * @throws {Error} If there is no active session or the engine rejects the rating.
   */
  function rateCurrentCard(rating: StudyRating): StudySessionState {
    error.value = null
    try {
      if (!activeSession.value) {
        throw new Error('There is no active study session to rate.')
      }

      const session = studyService.rateCurrentCard(activeSession.value, rating)
      activeSession.value = session
      updatePoolState(session)
      return session
    } catch (ratingError: unknown) {
      error.value = 'Unable to update this card. Please try again.'
      console.error('StudyStore.rateCurrentCard failed:', ratingError)
      throw ratingError
    }
  }

  /**
   * @summary Resets topic mastery through the Study Engine and publishes the refreshed pool.
   * @param {string | null} tagId - The selected topic, or null for the whole deck.
   * @param {Direction} direction - The selected saved direction.
   * @returns {Promise<void>} A promise that resolves when reset and refresh complete.
   * @throws {Error} If reset or pool refresh fails.
   */
  async function resetMastery(tagId: string | null, direction: Direction): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const state = await studyService.resetMastery(getStudyContext(), direction, tagId)
      updatePoolState(state)
      activeSession.value = null
      preparedSession.value = null
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
    activeSession,
    preparedSession,
    isLoading,
    error,
    loadPoolSummary,
    startSession,
    startActiveSession,
    rateCurrentCard,
    resetMastery,
  }
})
