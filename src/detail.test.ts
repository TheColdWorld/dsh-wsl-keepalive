import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)

const cases = [
  ['zh', 'detail.zh.md'],
  ['en', 'detail.en.md'],
] as const

for (const [locale, document] of cases) {
  test(locale + ' meta.detail names the one-line purpose', () => {
    const meta = JSON.parse(readFileSync(new URL('locale/' + locale + '.json', root), 'utf8')).meta as { detail?: string }
    assert.equal(meta.detail, document)
    const text = readFileSync(new URL(document, root), 'utf8').trim()
    assert.ok([...text].length <= 100, 'the Plugins detail page must stay within 100 characters')
    assert.ok(!text.startsWith('#'), 'the page already renders the plugin title')
    assert.ok(!text.includes('README'), 'the detail page must not point at the README')
    assert.ok(!/中文\s*\|\s*English/u.test(text), 'the DSH locale chooses the language; no manual switch')
    assert.match(text, locale === 'zh' ? /保活/u : /alive/iu)
  })
}
