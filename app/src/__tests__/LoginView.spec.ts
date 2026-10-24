import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { AuthenticationError, Profile } from '@/models/profile'
import type { AuthenticationResult } from '@/models/profile'
import { useAuthStore } from '@/stores/authStore'
import LoginView from '@/views/LoginView.vue'

const session: Session = {
  access_token: 'access-token',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'refresh-token',
  user: {
    id: 'user-1',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
  },
}

const profile = new Profile('user-1', new Date(), new Date())
const authenticationResult: AuthenticationResult = { profile, session }

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mountLoginView() {
    const pinia = createPinia()
    setActivePinia(pinia)
    return mount(LoginView, { global: { plugins: [pinia] } })
  }

  async function fillValidCredentials(wrapper: ReturnType<typeof mountLoginView>): Promise<void> {
    await wrapper.get('input[type="email"]').setValue('user@example.com')
    await wrapper.get('input[type="password"]').setValue('secret-password')
  }

  it('renders the login form', () => {
    const wrapper = mountLoginView()

    expect(wrapper.get('h1').text()).toBe('Welcome back')
    expect(wrapper.get('input[type="email"]').attributes('autocomplete')).toBe('email')
    expect(wrapper.get('input[type="password"]').attributes('autocomplete')).toBe(
      'current-password',
    )
    expect(wrapper.get('button[type="submit"]').text()).toContain('Sign In')
  })

  it.each([
    ['', '', 'Please enter both email and password.'],
    ['invalid-email', 'secret-password', 'Please enter a valid email address.'],
    ['user@example.com', 'short', 'Password must be at least 6 characters long.'],
  ])('shows client-side validation without authenticating', async (email, password, message) => {
    const authenticate = vi.spyOn(Profile, 'authenticate')
    const wrapper = mountLoginView()
    await wrapper.get('input[type="email"]').setValue(email)
    await wrapper.get('input[type="password"]').setValue(password)
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('[role="alert"]').text()).toBe(message)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('stores the authenticated user and displays the success message', async () => {
    const authenticate = vi.spyOn(Profile, 'authenticate').mockResolvedValue(authenticationResult)
    const wrapper = mountLoginView()
    const store = useAuthStore()
    await fillValidCredentials(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(authenticate).toHaveBeenCalledWith('user@example.com', 'secret-password')
    expect(store.profile).toBe(profile)
    expect(store.session).toBe(session)
    expect(store.isAuthenticated).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toBe('Login successful!')
  })

  it('shows the invalid-credentials message', async () => {
    vi.spyOn(Profile, 'authenticate').mockRejectedValue(
      new AuthenticationError('invalid-credentials', 'Supabase authentication was rejected.'),
    )
    const wrapper = mountLoginView()
    await fillValidCredentials(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toBe('Invalid login credentials.')
    expect(alert.classes()).toContain('bg-rose-950/90')
    expect(alert.classes()).toContain('border-rose-500/50')
    expect(alert.classes()).toContain('text-rose-300')
  })

  it('shows the network error message', async () => {
    vi.spyOn(Profile, 'authenticate').mockRejectedValue(
      new AuthenticationError('network', 'Unable to connect to the authentication service.'),
    )
    const wrapper = mountLoginView()
    await fillValidCredentials(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toBe(
      'Unable to connect to the server. Please check your internet connection and try again.',
    )
    expect(alert.classes()).toContain('bg-rose-950/90')
    expect(alert.classes()).toContain('border-rose-500/50')
    expect(alert.classes()).toContain('text-rose-300')
  })

  it('disables the button while authentication is pending', async () => {
    let resolveAuthentication: ((result: AuthenticationResult) => void) | undefined
    vi.spyOn(Profile, 'authenticate').mockReturnValue(
      new Promise((resolve) => {
        resolveAuthentication = resolve
      }),
    )
    const wrapper = mountLoginView()
    await fillValidCredentials(wrapper)
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[type="submit"]').text()).toContain('Signing in')

    resolveAuthentication?.(authenticationResult)
    await flushPromises()

    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
