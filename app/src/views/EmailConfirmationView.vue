<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Profile } from '@/models/profile'

const router = useRouter()
const errorMessage = ref('')

/**
 * @summary Verifies the email callback and returns to Login without a session.
 * @returns {Promise<void>} A promise that resolves after callback navigation.
 */
async function completeConfirmation(): Promise<void> {
  try {
    await Profile.completeEmailConfirmation()
    await router.replace({ name: 'Login', query: { emailConfirmed: 'true' } })
  } catch (error: unknown) {
    console.error('Email confirmation could not be completed:', error)
    errorMessage.value = 'This confirmation link is invalid or has expired. Please try again.'
  }
}

onMounted(() => {
  void completeConfirmation()
})
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-app px-4 py-8">
    <section
      aria-labelledby="confirmation-title"
      class="w-full max-w-md rounded-card border-2 border-slate-600 bg-card p-6 text-center shadow-2xl sm:p-8"
    >
      <h1 id="confirmation-title" class="text-2xl font-bold text-primary">Confirming your email</h1>

      <div v-if="!errorMessage" class="mt-6 text-secondary" role="status" aria-live="polite">
        Please wait while we verify your confirmation link.
      </div>

      <div
        v-else
        class="mt-6 rounded-xl border border-rose-500/50 bg-rose-950/90 px-4 py-3 text-sm text-rose-300"
        role="alert"
        aria-live="assertive"
      >
        {{ errorMessage }}
      </div>

      <RouterLink
        v-if="errorMessage"
        :to="{ name: 'Login' }"
        class="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-semibold text-indigo-300 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
      >
        Back to login
      </RouterLink>
    </section>
  </main>
</template>
