import { createRouter, createWebHistory } from 'vue-router'
import TestView from '@/views/Test-FlipStack.vue'

const routes = [
  {
    path: '/',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
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
