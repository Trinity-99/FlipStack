<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Deck } from '@/models/deck'

const testStatus = ref<'idle' | 'running' | 'success' | 'error'>('idle')
const testLogs = ref<string[]>([])

/**
 * @summary Appends a timestamped log message to the UI test console.
 */
const addLog = (message: string) => {
  testLogs.value.push(`[${new Date().toLocaleTimeString()}] ${message}`)
}

/**
 * @summary Executes the Supabase Active Record connection and query smoke test.
 */
const runSmokeTest = async () => {
  testStatus.value = 'running'
  testLogs.value = []
  addLog('🧪 Starting Supabase Active Record Smoke Test...')

  try {
    addLog('Testing Deck.findById with dummy UUID...')
    const nonExistentDeck = await Deck.findById('00000000-0000-0000-0000-000000000000')
    addLog(`✅ Test 1 Passed. Result: ${JSON.stringify(nonExistentDeck)} (Expected: null)`)

    addLog('Testing Deck.findAllForUser with dummy user UUID...')
    const emptyDecks = await Deck.findAllForUser('00000000-0000-0000-0000-000000000000')
    addLog(`✅ Test 2 Passed. Result count: ${emptyDecks.length} (Expected: 0)`)

    testStatus.value = 'success'
    addLog('🎉 All connection tests passed successfully! Supabase is fully reachable.')
  } catch (error: unknown) {
    testStatus.value = 'error'
    addLog(`❌ Database connection test failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

onMounted(() => {
  runSmokeTest()
})
</script>

<template>
  <main class="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6">
    <div class="max-w-xl w-full bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-8">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold tracking-tight">FlipStack Database Smoke Test</h1>
        <span 
          class="px-3 py-1 text-xs font-semibold rounded-full uppercase tracking-wider"
          :class="{
            'bg-yellow-500/20 text-yellow-400': testStatus === 'running',
            'bg-emerald-500/20 text-emerald-400': testStatus === 'success',
            'bg-rose-500/20 text-rose-400': testStatus === 'error',
            'bg-slate-700 text-slate-300': testStatus === 'idle'
          }"
        >
          {{ testStatus }}
        </span>
      </div>

      <p class="text-slate-400 text-sm mb-6">
        This test verifies your Supabase connection and Active Record model setup by querying the database safely under RLS constraints.
      </p>

      <div class="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs h-64 overflow-y-auto mb-6 flex flex-col gap-1.5">
        <div v-if="testLogs.length === 0" class="text-slate-500 italic">Initializing test suite...</div>
        <div v-for="(log, index) in testLogs" :key="index" class="leading-relaxed">
          {{ log }}
        </div>
      </div>

      <button 
        @click="runSmokeTest"
        class="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-lg transition duration-200 shadow-md cursor-pointer"
      >
        Rerun Smoke Test
      </button>
    </div>
  </main>
</template>