import { createRouter, createWebHistory } from 'vue-router'
import type { RouteLocationNormalized, RouteLocationRaw, RouteRecordRaw } from 'vue-router'
import TestView from '@/views/Test-FlipStack.vue'
import { useAuthStore } from '@/stores/authStore'
import { useCardStore } from '@/stores/cardStore'
import { useDeckStore } from '@/stores/deckStore'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    alias: '/login',
  },
  {
    path: '/app',
    name: 'AppLayout',
    component: () => import('@/layouts/AppLayout.vue'),
    redirect: { name: 'SessionStart' },
    meta: { requiresAuth: true },
    children: [
      {
        path: '/cards',
        name: 'CardList',
        component: () => import('@/views/CardListView.vue'),
      },
      {
        path: '/decks/new',
        name: 'DeckCreate',
        component: () => import('@/views/DeckEditView.vue'),
      },
      {
        path: '/decks/:deckId/edit',
        name: 'DeckEdit',
        component: () => import('@/views/DeckEditView.vue'),
      },
      {
        path: '/cards/new',
        name: 'CardCreate',
        component: () => import('@/views/CardEditView.vue'),
        meta: { deckSwitcherDisabled: true, hideBottomNavigation: true },
      },
      {
        path: '/cards/edit/:id',
        name: 'CardEdit',
        component: () => import('@/views/CardEditView.vue'),
        meta: { deckSwitcherDisabled: true, hideBottomNavigation: true },
      },
      {
        path: '/study/init',
        name: 'SessionStart',
        component: () => import('@/views/StudyInitView.vue'),
      },
      {
        path: '/study',
        name: 'Study',
        component: () => import('@/views/StudyView.vue'),
        meta: { immersive: true },
      },
    ],
  },
  {
    path: '/test',
    name: 'Test',
    component: TestView,
  },
]

const router = createRouter({
  history: createWebHistory('/FlipStack/'),
  routes,
})

/**
 * @summary Finds the onboarding route required by the hydrated deck and card state.
 * @returns {RouteLocationRaw | null} The required onboarding route, or null when none is required.
 * @throws {Error} If the active deck's card cache was not hydrated with the deck context.
 */
function getRequiredOnboardingRoute(): { name: 'DeckCreate' | 'CardCreate' } | null {
  const deckStore = useDeckStore()
  const cardStore = useCardStore()

  if (deckStore.decks.length === 0) return { name: 'DeckCreate' }

  const activeDeckId = deckStore.activeDeckId
  if (!activeDeckId || cardStore.loadedDeckId !== activeDeckId) {
    throw new Error('The active deck card cache was not hydrated during startup.')
  }

  return cardStore.cards.length === 0 ? { name: 'CardCreate' } : null
}

/**
 * @summary Resolves authentication, required onboarding, and the startup destination.
 * @param {RouteLocationNormalized} to - The route requested by the user or browser.
 * @returns {Promise<RouteLocationRaw | true>} A redirect or permission to continue navigation.
 */
async function resolveStartupRoute(to: RouteLocationNormalized): Promise<RouteLocationRaw | true> {
  const authStore = useAuthStore()
  const deckStore = useDeckStore()
  const requiresAuthentication = to.matched.some(
    (routeRecord) => routeRecord.meta.requiresAuth === true,
  )

  if (!authStore.hasRestoredAuthentication) {
    try {
      await authStore.restoreAuthentication()
    } catch (error: unknown) {
      console.error('Router could not restore authentication:', error)
    }
  }

  if (!authStore.isAuthenticated) {
    return requiresAuthentication ? { name: 'Login' } : true
  }

  if (to.name === 'Test') return true

  const isStartupEntry = to.name === 'Login'
  if (!requiresAuthentication && !isStartupEntry) return true

  const profile = authStore.profile
  if (!profile) {
    console.error('Router found an authenticated session without a profile.')
    return true
  }

  if (deckStore.error) {
    return isStartupEntry ? { name: 'SessionStart' } : true
  }

  try {
    await deckStore.initialize(profile)
  } catch {
    if (isStartupEntry) return { name: 'SessionStart' }
    return true
  }

  let requiredOnboardingRoute: RouteLocationRaw | null
  try {
    requiredOnboardingRoute = getRequiredOnboardingRoute()
  } catch (error: unknown) {
    deckStore.error = 'Unable to verify your active deck. Please try again.'
    console.error('Router could not resolve the startup deck state:', error)
    return isStartupEntry ? { name: 'SessionStart' } : true
  }

  if (requiredOnboardingRoute) {
    if (to.name !== requiredOnboardingRoute.name) return requiredOnboardingRoute
  }

  if (isStartupEntry) return { name: 'SessionStart' }
  return true
}

router.beforeEach(resolveStartupRoute)

export default router
