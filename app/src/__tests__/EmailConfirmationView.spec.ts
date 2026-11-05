import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { Profile } from '@/models/profile'
import EmailConfirmationView from '@/views/EmailConfirmationView.vue'

const { replaceRoute } = vi.hoisted(() => ({
  replaceRoute: vi.fn<() => Promise<void>>(),
}))

vi.mock('vue-router', async (importOriginal) => {
  const routerModule = await importOriginal<typeof import('vue-router')>()
  return {
    ...routerModule,
    useRouter: () => ({ replace: replaceRoute }),
  }
})

describe('EmailConfirmationView', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    replaceRoute.mockReset()
  })

  it('verifies the callback and redirects to Login with a one-time message', async () => {
    const completeEmailConfirmation = vi
      .spyOn(Profile, 'completeEmailConfirmation')
      .mockResolvedValue()
    const wrapper = mount(EmailConfirmationView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(completeEmailConfirmation).toHaveBeenCalledOnce()
    expect(replaceRoute).toHaveBeenCalledWith({
      name: 'Login',
      query: { emailConfirmed: 'true' },
    })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows an explicit error and login link for an invalid confirmation', async () => {
    vi.spyOn(Profile, 'completeEmailConfirmation').mockRejectedValue(new Error('Invalid callback'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = mount(EmailConfirmationView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'This confirmation link is invalid or has expired.',
    )
    expect(wrapper.text()).toContain('Back to login')
    expect(replaceRoute).not.toHaveBeenCalled()
  })
})
