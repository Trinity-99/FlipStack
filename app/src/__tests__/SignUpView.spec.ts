import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { AuthenticationError, Profile } from '@/models/profile'
import SignUpView from '@/views/SignUpView.vue'

describe('SignUpView', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mountSignUpView() {
    return mount(SignUpView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
  }

  async function fillForm(
    wrapper: ReturnType<typeof mountSignUpView>,
    email = 'user@example.com',
    password = 'Abcdef12',
  ): Promise<void> {
    await wrapper.get('input[type="email"]').setValue(email)
    await wrapper.get('#signup-password').setValue(password)
  }

  it('renders password guidance, visibility control, and login link', () => {
    const wrapper = mountSignUpView()

    expect(wrapper.text()).toContain('At least 8 characters')
    expect(wrapper.find('input[autocomplete="new-password"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Back to login')
  })

  it('toggles password visibility accessibly', async () => {
    const wrapper = mountSignUpView()
    const toggle = wrapper.get('button[aria-label="Show password"]')

    await toggle.trigger('click')

    expect(wrapper.get('#signup-password').attributes('type')).toBe('text')
    expect(wrapper.get('button[aria-label="Hide password"]').attributes('aria-pressed')).toBe(
      'true',
    )
  })

  it.each([
    ['', 'Abcdef12', 'Please enter both email and password.'],
    ['invalid-email', 'Abcdef12', 'Please enter a valid email address.'],
    ['user@example.com', 'Abc123!', 'Password must be at least 8 characters long.'],
    [
      'user@example.com',
      'abcdefgh',
      'Password must include at least 2 of: letters, numbers, and special characters.',
    ],
    [
      'user@example.com',
      '12345678',
      'Password must include at least 2 of: letters, numbers, and special characters.',
    ],
  ])(
    'rejects invalid signup fields before requesting an account',
    async (email, password, message) => {
      const signUp = vi.spyOn(Profile, 'signUp')
      const wrapper = mountSignUpView()
      await fillForm(wrapper, email, password)
      await wrapper.get('form').trigger('submit')

      expect(wrapper.get('[role="alert"]').text()).toBe(message)
      expect(signUp).not.toHaveBeenCalled()
    },
  )

  it.each(['Abcdef12', 'Abcdef!!', '123456!!', '密碼文字字字12'])(
    'accepts passwords with the minimum length and two categories: %s',
    async (password) => {
      const signUp = vi.spyOn(Profile, 'signUp').mockResolvedValue()
      const wrapper = mountSignUpView()
      await fillForm(wrapper, 'user@example.com', password)
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(signUp).toHaveBeenCalledWith(
        'user@example.com',
        password,
        expect.stringMatching(/\/auth\/confirm$/),
      )
      expect(wrapper.get('[role="status"]').text()).toBe(
        'Check your email to confirm your address.',
      )
    },
  )

  it('shows a bounded error when signup fails', async () => {
    vi.spyOn(Profile, 'signUp').mockRejectedValue(
      new AuthenticationError('network', 'Unable to connect to the authentication service.'),
    )
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = mountSignUpView()
    await fillForm(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Unable to connect to the server. Please try again.',
    )
    expect(wrapper.get('[role="alert"]').classes()).toContain('border-rose-500/50')
  })

  it('disables signup while the request is pending', async () => {
    let resolveSignUp: (() => void) | undefined
    vi.spyOn(Profile, 'signUp').mockReturnValue(
      new Promise((resolve) => {
        resolveSignUp = resolve
      }),
    )
    const wrapper = mountSignUpView()
    await fillForm(wrapper)
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[type="submit"]').text()).toContain('Signing up')

    resolveSignUp?.()
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('Check your email')
  })
})
