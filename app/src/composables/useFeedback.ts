import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'

export type FeedbackVariant = 'error' | 'success'

interface ErrorFeedbackOptions {
  durationMs?: number
  dismissOnEdit?: boolean
}

interface FeedbackState {
  message: Ref<string>
  variant: Ref<FeedbackVariant>
  showError: (message: string, options?: ErrorFeedbackOptions) => void
  showSuccess: (message: string, durationMs?: number) => void
  clear: () => void
  clearOnEdit: () => void
}

/**
 * @summary Manages reusable success and error feedback state and dismissal behavior.
 * @returns {object} Feedback state and methods for showing and clearing messages.
 */
export function useFeedback(): FeedbackState {
  const message = ref('')
  const variant = ref<FeedbackVariant>('success')
  const dismissOnEdit = ref(false)
  let timeout: ReturnType<typeof setTimeout> | null = null

  function clearTimeoutIfSet(): void {
    if (timeout === null) return

    clearTimeout(timeout)
    timeout = null
  }

  /**
   * @summary Clears the current feedback and any pending dismissal timer.
   * @returns {void}
   */
  function clear(): void {
    clearTimeoutIfSet()
    message.value = ''
    dismissOnEdit.value = false
  }

  function show(
    nextMessage: string,
    nextVariant: FeedbackVariant,
    durationMs: number | undefined,
    shouldDismissOnEdit: boolean,
  ): void {
    if (
      durationMs !== undefined &&
      timeout !== null &&
      message.value === nextMessage &&
      variant.value === nextVariant
    ) {
      return
    }

    clearTimeoutIfSet()
    message.value = nextMessage
    variant.value = nextVariant
    dismissOnEdit.value = shouldDismissOnEdit

    if (durationMs !== undefined) {
      timeout = setTimeout(() => {
        message.value = ''
        dismissOnEdit.value = false
        timeout = null
      }, durationMs)
    }
  }

  /**
   * @summary Shows a success message and dismisses it after two seconds by default.
   * @param {string} nextMessage - The success text to display.
   * @param {number} durationMs - Optional duration before dismissal.
   * @returns {void}
   */
  function showSuccess(nextMessage: string, durationMs = 2000): void {
    show(nextMessage, 'success', durationMs, false)
  }

  /**
   * @summary Shows an error with optional timed or edit-triggered dismissal.
   * @param {string} nextMessage - The error text to display.
   * @param {ErrorFeedbackOptions} options - Error dismissal behavior.
   * @returns {void}
   */
  function showError(nextMessage: string, options: ErrorFeedbackOptions = {}): void {
    show(nextMessage, 'error', options.durationMs, options.dismissOnEdit ?? false)
  }

  /**
   * @summary Dismisses feedback when the current error is configured to clear on editing.
   * @returns {void}
   */
  function clearOnEdit(): void {
    if (variant.value === 'error' && dismissOnEdit.value) clear()
  }

  onUnmounted(clearTimeoutIfSet)

  return {
    message,
    variant,
    showError,
    showSuccess,
    clear,
    clearOnEdit,
  }
}
