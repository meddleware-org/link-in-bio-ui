import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, type Component } from 'vue'
import { createHttp } from '../../src/api/http.js'
import { createAppContext, provideApp, type AppContext } from '../../src/context.js'
import { createRouter } from '../../src/route.js'
import { FakeService } from './fake-service.js'

/** Let pending promises, lazy components and renders finish (a few rounds, as one request often triggers the next). */
export async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await flushPromises()
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
  }
}

/** Mount a component that reads the app context, against a fake service. */
export function mountWithApp(component: Component, props: Record<string, unknown> = {}, service = new FakeService()): { w: VueWrapper; service: FakeService; app: AppContext } {
  const app = createAppContext(createHttp({ fetch: service.fetch as typeof fetch }), createRouter('/'))
  const Wrapper = defineComponent({
    setup() {
      provideApp(app)
      return () => h(component, props)
    },
  })
  const w = mount(Wrapper, { attachTo: document.body })
  return { w, service, app }
}

export function button(root: VueWrapper, text: string | RegExp) {
  const b = root.findAll('button').find((x) => (typeof text === 'string' ? x.text() === text : text.test(x.text())))
  if (!b) throw new Error(`no button "${String(text)}" in: ${root.findAll('button').map((x) => x.text()).join(' | ')}`)
  return b
}

/** The input labelled `label` (by its `<label for>`). */
export function field(root: VueWrapper, label: string) {
  const l = root.findAll('label').find((x) => x.text().trim() === label)
  const id = l?.attributes('for')
  if (!id) throw new Error(`no field "${label}"`)
  return root.find(`#${CSS.escape(id)}`)
}

/** The areas and sections load when first opened; loading them once first keeps every test's first open as quick as its second. */
const views = Promise.all(Object.values(import.meta.glob('../../src/views/**/*.vue')).map((load) => load()))
export const preload = (): Promise<unknown> => views
