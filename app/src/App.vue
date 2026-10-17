<script setup lang="ts">
import { onMounted } from 'vue'
import { supabase } from '@/db/supabase'

onMounted(async () => {
  // Test connection or fetch something simple
  const { data, error } = await supabase.from('decks').select('*').limit(1)
  if (error) {
    console.log('Supabase connection check:', error.message)
  } else {
    console.log('Supabase connected successfully! Data:', data)
  }
})
</script>

<template>
  <main class="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
    <div class="bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
      <h1 class="text-3xl font-extrabold text-emerald-400 mb-3">FlipStack + Supabase</h1>
      <p class="text-slate-300 text-sm">Check your browser console to verify the live database connection!</p>
    </div>
  </main>
</template>