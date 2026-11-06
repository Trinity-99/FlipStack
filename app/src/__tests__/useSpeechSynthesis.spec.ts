import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSpeechSynthesis } from '@/composables/useSpeechSynthesis'

class FakeSpeechSynthesisUtterance {
  public static instances: FakeSpeechSynthesisUtterance[] = []
  public lang = ''
  public voice: SpeechSynthesisVoice | null = null
  public onend: (() => void) | null = null
  public onerror: ((event: { error: string }) => void) | null = null

  constructor(public readonly text: string) {
    FakeSpeechSynthesisUtterance.instances.push(this)
  }
}

describe('useSpeechSynthesis', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    FakeSpeechSynthesisUtterance.instances = []
  })

  function createVoice(
    lang: string,
    localService: boolean,
    isDefault = false,
  ): SpeechSynthesisVoice {
    return { lang, localService, default: isDefault, name: lang } as SpeechSynthesisVoice
  }

  function createSynthesis(getVoices: () => SpeechSynthesisVoice[]) {
    return {
      getVoices: vi.fn<() => SpeechSynthesisVoice[]>(getVoices),
      speak: vi.fn<(utterance: SpeechSynthesisUtterance) => void>(),
      cancel: vi.fn<() => void>(),
      addEventListener: vi.fn<(type: string, listener: () => void) => void>(),
      removeEventListener: vi.fn<(type: string, listener: () => void) => void>(),
    }
  }

  function mountSynthesis() {
    let controller!: ReturnType<typeof useSpeechSynthesis>
    const wrapper = mount(
      defineComponent({
        setup() {
          controller = useSpeechSynthesis()
          return () => h('div')
        },
      }),
    )
    return { wrapper, controller }
  }

  it('lists distinct local voice languages and excludes remote voices', async () => {
    const localVoice = createVoice('th-TH', true, true)
    const synthesis = createSynthesis(() => [
      localVoice,
      createVoice('th-TH', true),
      createVoice('en-US', false),
    ])
    vi.stubGlobal('speechSynthesis', synthesis)

    const { wrapper, controller } = mountSynthesis()
    await flushPromises()

    expect(controller.languages.value.map((language) => language.code)).toEqual(['th-TH'])
    expect(controller.hasLocalVoice('th-TH')).toBe(true)
    expect(controller.hasLocalVoice('en-US')).toBe(false)

    wrapper.unmount()
  })

  it('speaks the full text in the matching local voice and cancels on stop', async () => {
    const voice = createVoice('th-TH', true)
    const defaultVoice = createVoice('th-TH', true, true)
    const synthesis = createSynthesis(() => [voice, defaultVoice])
    vi.stubGlobal('speechSynthesis', synthesis)
    vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance)

    const { wrapper, controller } = mountSynthesis()
    await flushPromises()
    controller.speak('สวัสดีทั้งประโยค', 'th-TH')

    const utterance = FakeSpeechSynthesisUtterance.instances[0]
    expect(utterance?.text).toBe('สวัสดีทั้งประโยค')
    expect(utterance?.lang).toBe('th-TH')
    expect(utterance?.voice).toBe(defaultVoice)
    expect(controller.isSpeaking.value).toBe(true)

    controller.stop()
    expect(synthesis.cancel).toHaveBeenCalledOnce()
    expect(controller.isSpeaking.value).toBe(false)

    wrapper.unmount()
  })

  it('refreshes available voices when the browser voice list changes', async () => {
    let currentVoices: SpeechSynthesisVoice[] = [createVoice('th-TH', true)]
    const synthesis = createSynthesis(() => currentVoices)
    vi.stubGlobal('speechSynthesis', synthesis)

    const { wrapper, controller } = mountSynthesis()
    await flushPromises()
    expect(controller.languages.value.map((language) => language.code)).toEqual(['th-TH'])

    currentVoices = [createVoice('en-US', true)]
    const listener = synthesis.addEventListener.mock.calls[0]?.[1]
    if (typeof listener !== 'function') throw new Error('Expected a voiceschanged listener.')
    listener()

    expect(controller.languages.value.map((language) => language.code)).toEqual(['en-US'])
    wrapper.unmount()
    expect(synthesis.removeEventListener).toHaveBeenCalledOnce()
  })

  it('reports speech as unavailable when the browser lacks the synthesis API', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const { wrapper, controller } = mountSynthesis()
    await flushPromises()

    expect(controller.languages.value).toEqual([])
    controller.speak('Hello', 'en-US')
    expect(controller.error.value).toBe('Audio playback is not available in this browser.')

    wrapper.unmount()
  })

  it('surfaces synthesis errors to the caller', async () => {
    const voice = createVoice('th-TH', true)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal(
      'speechSynthesis',
      createSynthesis(() => [voice]),
    )
    vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance)

    const { wrapper, controller } = mountSynthesis()
    await flushPromises()
    controller.speak('Hello', 'th-TH')
    FakeSpeechSynthesisUtterance.instances[0]?.onerror?.({ error: 'network' })

    expect(controller.isSpeaking.value).toBe(false)
    expect(controller.error.value).toBe('Unable to play audio for this side.')

    wrapper.unmount()
  })
})
