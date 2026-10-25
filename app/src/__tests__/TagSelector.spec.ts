import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { Tag } from '@/models/tag'
import TagSelector from '@/components/TagSelector.vue'

describe('TagSelector', () => {
  it('renders tags with their selected state', () => {
    const tags = [
      new Tag('tag-1', 'deck-1', 'Grammar', null),
      new Tag('tag-2', 'deck-1', 'Vocabulary', null),
    ]
    const wrapper = mount(TagSelector, { props: { tags, modelValue: ['tag-2'] } })

    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'Grammar',
      'Vocabulary',
    ])
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Vocabulary')
  })

  it('emits a new tag ID list when selected and deselected', async () => {
    const tags = [
      new Tag('tag-1', 'deck-1', 'Grammar', null),
      new Tag('tag-2', 'deck-1', 'Vocabulary', null),
    ]
    const wrapper = mount(TagSelector, { props: { tags, modelValue: [] } })

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[['tag-1']]])

    await wrapper.setProps({ modelValue: ['tag-1'] })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([[]])
  })

  it('renders an empty state when the deck has no tags', () => {
    const wrapper = mount(TagSelector, { props: { tags: [], modelValue: [] } })

    expect(wrapper.text()).toBe('No tags available for this deck.')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
