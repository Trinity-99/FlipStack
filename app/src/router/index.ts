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
        component: () => import('@/views/FeaturePlaceholderView.vue'),
        meta: {
          placeholderTitle: 'Your Cards',
          placeholderDescription: 'Browse, organize, and manage cards in your active deck.',
        },
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
        component: () => import('@/views/FeaturePlaceholderView.vue'),
        meta: {
          placeholderTitle: 'Create a Card',
          placeholderDescription: 'Add a new study card to your active deck.',
        },
      },
      {
        path: '/study/init',
        name: 'SessionStart',
        component: () => import('@/views/FeaturePlaceholderView.vue'),
        meta: {
          placeholderTitle: 'Start Studying',
          placeholderDescription: 'Choose a study direction and topic for your next session.',
        },
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
