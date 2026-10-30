import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { Tag } from '@/models/tag'
import TagSelector from '@/components/TagSelector.vue'

const tags = [
  new Tag('tag-1', 'deck-1', 'Grammar', null),
  new Tag('tag-2', 'deck-1', 'Vocabulary', null),
]

describe('TagSelector', () => {
  it('starts collapsed with the selected tags summarized in the trigger', () => {
    const wrapper = mount(TagSelector, { props: { tags, modelValue: ['tag-2'] } })

    expect(wrapper.find('[aria-expanded="false"]').exists()).toBe(true)
    expect(wrapper.find('#tag-options').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Deselect Vocabulary"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Grammar')
  })

  it('opens the tag list with selected tags first and closes it again', async () => {
    const wrapper = mount(TagSelector, { props: { tags, modelValue: ['tag-2'] } })

    await wrapper.get('[aria-label="Expand tag selector"]').trigger('click')

    expect(wrapper.find('[aria-expanded="true"]').exists()).toBe(true)
    expect(
      wrapper.findAll('#tag-options button[aria-pressed]').map((button) => button.text()),
    ).toEqual(['Vocabulary', 'Grammar'])
    expect(wrapper.get('#tag-options button[aria-pressed="true"]').text()).toBe('Vocabulary')

    await wrapper.get('[aria-label="Collapse tag selector"]').trigger('click')
    expect(wrapper.find('#tag-options').exists()).toBe(false)
  })

  it('emits a new tag ID list when selected and deselected', async () => {
    const wrapper = mount(TagSelector, { props: { tags, modelValue: [] } })
    await wrapper.get('[aria-label="Expand tag selector"]').trigger('click')

    await wrapper.get('#tag-options button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[['tag-1']]])

    await wrapper.setProps({ modelValue: ['tag-1'] })
    await wrapper.get('#tag-options button[aria-pressed="true"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([[]])
  })

  it('emits a trimmed creation request on Enter', async () => {
    const wrapper = mount(TagSelector, { props: { tags, modelValue: [] } })
    await wrapper.get('[aria-label="Create tag"]').trigger('click')
    const input = wrapper.get('#new-tag-name')
    await input.setValue('  Nouns  ')
    await input.trigger('keydown.enter')

    expect(wrapper.emitted('create-tag')).toEqual([['Nouns']])
    expect(wrapper.get('#new-tag-name').element).toHaveProperty('value', '  Nouns  ')
  })

  it('emits a creation request with the Add Tag button', async () => {
    const wrapper = mount(TagSelector, { props: { tags, modelValue: [] } })
    await wrapper.get('[aria-label="Create tag"]').trigger('click')
    await wrapper.get('#new-tag-name').setValue('Nouns')
    await wrapper.get('[aria-label="Add tag"]').trigger('click')

    expect(wrapper.emitted('create-tag')).toEqual([['Nouns']])
  })

  it('selects an existing exact-name tag instead of requesting creation', async () => {
    const wrapper = mount(TagSelector, { props: { tags, modelValue: [] } })
    await wrapper.get('[aria-label="Create tag"]').trigger('click')
    await wrapper.get('#new-tag-name').setValue('  Grammar  ')
    await wrapper.get('[aria-label="Add tag"]').trigger('click')

    expect(wrapper.emitted('create-tag')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toEqual([[['tag-1']]])
    expect(wrapper.get('#new-tag-name').element).toHaveProperty('value', '')
  })

  it('clears the draft after the new tag is saved and selected', async () => {
    const wrapper = mount(TagSelector, { props: { tags, modelValue: [] } })
    await wrapper.get('[aria-label="Create tag"]').trigger('click')
    await wrapper.get('#new-tag-name').setValue('Nouns')
    await wrapper.get('[aria-label="Add tag"]').trigger('click')

    const createdTag = new Tag('tag-3', 'deck-1', 'Nouns', null)
    await wrapper.setProps({
      tags: [...tags, createdTag],
      modelValue: ['tag-3'],
    })

    expect(wrapper.get('#new-tag-name').element).toHaveProperty('value', '')
    expect(wrapper.find('[aria-label="Deselect Nouns"]').exists()).toBe(true)
  })

  it('keeps the creation draft available after a failed request', async () => {
    const wrapper = mount(TagSelector, {
      props: { tags, modelValue: [] },
    })
    await wrapper.get('[aria-label="Create tag"]').trigger('click')
    await wrapper.get('#new-tag-name').setValue('Nouns')
    await wrapper.setProps({ isCreating: true })

    expect(wrapper.get('#new-tag-name').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ isCreating: false })
    expect(wrapper.get('#new-tag-name').element).toHaveProperty('value', 'Nouns')
  })

  it('allows creating the first tag when the deck has no tags', async () => {
    const wrapper = mount(TagSelector, { props: { tags: [], modelValue: [] } })

    expect(wrapper.text()).toContain('Select or create tags...')
    await wrapper.get('[aria-label="Create tag"]').trigger('click')

    expect(wrapper.text()).toContain('No tags available for this deck.')
    expect(wrapper.find('#new-tag-name').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Collapse tag selector"]').exists()).toBe(true)
  })
})
