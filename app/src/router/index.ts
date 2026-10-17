import { createRouter, createWebHistory } from 'vue-router'
import TestView from '@/views/Test.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: TestView, // For now, point root to TestView so you see it immediately!
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