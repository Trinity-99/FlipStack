import { afterEach, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { LocalSource } from '@/data/localSource'

const localSource = new LocalSource()

beforeEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
})

afterEach(async () => {
  await localSource.open()
  await localSource.clear()
})
