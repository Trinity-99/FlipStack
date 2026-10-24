import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'

import App from './App.vue'
import router from './router'

import './assets/main.css'

async function startApp(): Promise<void> {
  const pinia = createPinia()
  const authStore = useAuthStore(pinia)

  try {
    await authStore.restoreAuthentication()
  } catch {
    // The auth store records the failure for the login view; the app remains usable for sign-in.
  }

  const app = createApp(App)
  app.use(pinia)
  app.use(router)
  app.mount('#app')
}

void startApp()
