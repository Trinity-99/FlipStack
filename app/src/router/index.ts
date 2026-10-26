import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import TestView from '@/views/Test-FlipStack.vue'

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
        component: () => import('@/views/FeaturePlaceholderView.vue'),
        meta: {
          immersive: true,
          placeholderTitle: 'Study Session',
          placeholderDescription: 'Your active study session will appear here.',
        },
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
  history: createWebHistory(),
  routes,
})

export default router
