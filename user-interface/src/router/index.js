import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// Import views
import DashboardView from '../views/DashboardView.vue'
import MonitoringView from '../views/MonitoringView.vue'
import DetectorConfigView from '../views/DetectorConfigView.vue'
import SystemConfigView from '../views/SystemConfigView.vue'
import FileAnalysisView from '../views/FileAnalysisView.vue'
import TestingView from '../views/TestingView.vue'
import StatusDetailView from '../views/StatusDetailView.vue'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: DashboardView,
    meta: { requiresAuth: true }
  },
  {
    path: '/monitoring',
    name: 'Monitoring',
    component: MonitoringView,
    meta: { requiresAuth: true }
  },
  {
    path: '/detectors',
    name: 'DetectorConfig',
    component: DetectorConfigView,
    meta: { requiresAuth: true }
  },
  {
    path: '/config',
    name: 'SystemConfig',
    component: SystemConfigView,
    meta: { requiresAuth: true }
  },
  {
    path: '/analysis',
    name: 'FileAnalysis',
    component: FileAnalysisView,
    meta: { requiresAuth: true }
  },
  {
    path: '/testing',
    name: 'Testing',
    component: TestingView,
    meta: { requiresAuth: true }
  },
  {
    path: '/status',
    name: 'StatusDetail',
    component: StatusDetailView,
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    // Redirect to login (handled by App.vue)
    next('/')
  } else {
    next()
  }
})

export default router