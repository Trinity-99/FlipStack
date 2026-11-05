<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { AuthenticationError, Profile } from '@/models/profile'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const email = ref('')
const password = ref('')
const isPasswordVisible = ref(false)
const isSubmitting = ref(false)
const isSubmitted = ref(false)
const errorMessage = ref('')

/**
 * @summary Validates signup fields before contacting Supabase.
 * @returns {string | null} The first validation message, or null when valid.
 */
function validateForm(): string | null {
  const trimmedEmail = email.value.trim()
  if (!trimmedEmail || !password.value) {
    return 'Please enter both email and password.'
  }
  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    return 'Please enter a valid email address.'
  }
  if ([...password.value].length < 8) {
    return 'Password must be at least 8 characters long.'
  }

  const hasLetters = /\p{L}/u.test(password.value)
  const hasNumbers = /\p{N}/u.test(password.value)
  const hasSpecialCharacters = /[^\p{L}\p{N}]/u.test(password.value)
  const categoryCount = [hasLetters, hasNumbers, hasSpecialCharacters].filter(Boolean).length
  if (categoryCount < 2) {
    return 'Password must include at least 2 of: letters, numbers, and special characters.'
  }
  return null
}

/**
 * @summary Validates fields and requests a confirmation email.
 * @returns {Promise<void>} A promise that resolves after signup completes.
 */
async function handleSubmit(): Promise<void> {
  if (isSubmitting.value || isSubmitted.value) return

  errorMessage.value = ''
  const validationError = validateForm()
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  isSubmitting.value = true
  try {
    const emailRedirectTo = new URL(
      'auth/confirm',
      new URL(import.meta.env.BASE_URL, window.location.origin),
    ).toString()
    await Profile.signUp(email.value.trim(), password.value, emailRedirectTo)
    isSubmitted.value = true
  } catch (error: unknown) {
    console.error('Signup submission failed:', error)
    errorMessage.value =
      error instanceof AuthenticationError && error.kind === 'network'
        ? 'Unable to connect to the server. Please try again.'
        : 'Unable to create your account. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-app px-4 py-8">
    <section
      aria-labelledby="signup-title"
      class="w-full max-w-md rounded-card border-2 border-slate-600 bg-card p-6 shadow-2xl sm:p-8"
    >
      <header class="mb-8 text-center">
        <p class="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-secondary">
          FlipStack
        </p>
        <h1 id="signup-title" class="text-3xl font-bold text-primary">Create your account</h1>
      </header>

      <div
        v-if="isSubmitted"
        class="rounded-xl border border-emerald-500/50 bg-emerald-950/90 px-4 py-3 text-sm text-emerald-300"
        role="status"
        aria-live="polite"
      >
        Check your email to confirm your address.
      </div>

      <template v-else>
        <div
          v-if="errorMessage"
          class="mb-6 rounded-xl border border-rose-500/50 bg-rose-950/90 px-4 py-3 text-sm text-rose-300"
          role="alert"
          aria-live="assertive"
        >
          {{ errorMessage }}
        </div>

        <form novalidate class="space-y-5" @submit.prevent="handleSubmit">
          <div>
            <label for="signup-email" class="mb-2 block text-sm font-medium text-primary">
              Email
            </label>
            <input
              id="signup-email"
              v-model="email"
              type="email"
              name="email"
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full rounded-xl border border-border-subtle bg-surface-muted px-4 py-3 text-primary placeholder:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            />
          </div>

          <div>
            <label for="signup-password" class="mb-2 block text-sm font-medium text-primary">
              Password
            </label>
            <div class="flex items-center gap-2">
              <input
                id="signup-password"
                v-model="password"
                :type="isPasswordVisible ? 'text' : 'password'"
                name="password"
                autocomplete="new-password"
                aria-describedby="signup-password-rules"
                class="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-muted px-4 py-3 text-primary placeholder:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              />
              <button
                type="button"
                class="min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium text-indigo-300 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                :aria-pressed="isPasswordVisible"
                :aria-label="isPasswordVisible ? 'Hide password' : 'Show password'"
                @click="isPasswordVisible = !isPasswordVisible"
              >
                {{ isPasswordVisible ? 'Hide' : 'Show' }}
              </button>
            </div>
            <p id="signup-password-rules" class="mt-2 text-sm text-secondary">
              At least 8 characters, using at least 2 of: letters, numbers, and special characters.
            </p>
          </div>

          <button
            type="submit"
            :disabled="isSubmitting"
            class="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              v-if="isSubmitting"
              aria-hidden="true"
              class="h-5 w-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>{{ isSubmitting ? 'Signing up…' : 'Sign up' }}</span>
          </button>
        </form>
      </template>

      <p class="mt-6 text-center text-sm text-secondary">
        <RouterLink
          :to="{ name: 'Login' }"
          class="font-semibold text-indigo-300 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          Back to login
        </RouterLink>
      </p>
    </section>
  </main>
</template>
