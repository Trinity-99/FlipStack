<script setup lang="ts">
import { ref } from 'vue'
import { AuthenticationError, Profile } from '@/models/profile'
import { useAuthStore } from '@/stores/authStore'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVALID_CREDENTIALS_MESSAGE = 'Invalid login credentials.'
const NETWORK_ERROR_MESSAGE =
  'Unable to connect to the server. Please check your internet connection and try again.'

const authStore = useAuthStore()
const email = ref('')
const password = ref('')
const isSubmitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

/**
 * @summary Validates the login form before a network request is made.
 * @returns {string | null} The first validation error, or null when the fields are valid.
 */
function validateForm(): string | null {
  if (!email.value.trim() || !password.value) {
    return 'Please enter both email and password.'
  }
  if (!EMAIL_PATTERN.test(email.value.trim())) {
    return 'Please enter a valid email address.'
  }
  if (password.value.length < 6) {
    return 'Password must be at least 6 characters long.'
  }
  return null
}

/**
 * @summary Validates the form and performs the login request.
 * @returns {Promise<void>} A promise that resolves when the submit flow completes.
 */
async function handleSubmit(): Promise<void> {
  if (isSubmitting.value) return

  errorMessage.value = ''
  successMessage.value = ''

  const validationError = validateForm()
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  isSubmitting.value = true
  try {
    const result = await Profile.authenticate(email.value.trim(), password.value)
    authStore.setAuthenticated(result.profile, result.session)
    successMessage.value = 'Login successful!'
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      if (error.kind === 'invalid-credentials') {
        errorMessage.value = INVALID_CREDENTIALS_MESSAGE
        return
      }
      if (error.kind === 'network') {
        errorMessage.value = NETWORK_ERROR_MESSAGE
        return
      }
    }

    console.error('Login submission failed:', error)
    errorMessage.value = 'Unable to sign in. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-app px-4 py-8">
    <section
      aria-labelledby="login-title"
      class="w-full max-w-md rounded-card border-2 border-slate-600 bg-card p-6 shadow-2xl sm:p-8"
    >
      <header class="mb-8 text-center">
        <p class="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-secondary">
          FlipStack
        </p>
        <h1 id="login-title" class="text-3xl font-bold text-primary">Welcome back</h1>
        <p class="mt-2 text-secondary">Sign in to continue learning.</p>
      </header>

      <div
        v-if="errorMessage || authStore.initializationError"
        class="mb-6 rounded-xl border border-rose-500/50 bg-rose-950/90 px-4 py-3 text-sm text-rose-300"
        role="alert"
        aria-live="assertive"
      >
        {{ errorMessage || authStore.initializationError }}
      </div>

      <div
        v-if="successMessage"
        class="mb-6 rounded-xl border border-accent-got-it/50 bg-accent-got-it/10 px-4 py-3 text-sm text-accent-got-it"
        role="status"
        aria-live="polite"
      >
        {{ successMessage }}
      </div>

      <form novalidate class="space-y-5" @submit.prevent="handleSubmit">
        <div>
          <label for="email" class="mb-2 block text-sm font-medium text-primary">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            name="email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full rounded-xl border border-border-subtle bg-surface-muted px-4 py-3 text-primary placeholder:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          />
        </div>

        <div>
          <label for="password" class="mb-2 block text-sm font-medium text-primary">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            name="password"
            autocomplete="current-password"
            placeholder="Enter your password"
            class="w-full rounded-xl border border-border-subtle bg-surface-muted px-4 py-3 text-primary placeholder:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          />
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
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
          <span>{{ isSubmitting ? 'Signing in…' : 'Sign In' }}</span>
        </button>
      </form>
    </section>
  </main>
</template>
