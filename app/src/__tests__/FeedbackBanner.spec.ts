import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FeedbackBanner from '@/components/FeedbackBanner.vue'

describe('FeedbackBanner', () => {
  it('shows success messages as polite fixed status banners', () => {
    const wrapper = mount(FeedbackBanner, {
      props: {
        message: 'Card saved successfully.',
        variant: 'success',
      },
    })

    expect(wrapper.get('[role="status"]').text()).toBe('Card saved successfully.')
    expect(wrapper.get('[role="status"]').attributes('aria-live')).toBe('polite')
    expect(wrapper.find('.feedback-banner').classes()).toContain('bg-emerald-950/95')
  })

  it('shows errors as assertive alert banners and renders optional actions', () => {
    const wrapper = mount(FeedbackBanner, {
      props: {
        message: 'Unable to load your decks.',
        variant: 'error',
      },
      slots: {
        default: '<button type="button">Try again</button>',
      },
    })

    expect(wrapper.get('[role="alert"]').text()).toContain('Unable to load your decks.')
    expect(wrapper.get('[role="alert"]').attributes('aria-live')).toBe('assertive')
    expect(wrapper.find('.feedback-banner').classes()).toContain('bg-rose-950/95')
    expect(wrapper.find('.feedback-banner').classes()).toContain(
      'top-[calc(env(safe-area-inset-top)+3.8125rem)]',
    )
    expect(wrapper.get('[role="alert"]').find('button').exists()).toBe(false)
    expect(wrapper.get('button').text()).toBe('Try again')
  })

  it('does not render an empty message', () => {
    const wrapper = mount(FeedbackBanner, {
      props: {
        message: '',
        variant: 'success',
      },
    })

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})
