/**
 * Build for the dsh-wsl-keepalive bundle.
 *
 * The Host half is a normal ESM Node module. The Client half is the lazy-CJS
 * factory the DSH module loader expects: a script that registers the package id
 * and a factory(require) closure. CSS Modules are compiled into that closure so
 * the plugin owns no separate stylesheet request.
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

const ID = 'dsh-wsl-keepalive'
const CSS_PREFIX = '\0dsh-wsl-keepalive-css:'
const CSS_SUFFIX = '.mjs'

const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const cssModules = {
  name: 'dsh-wsl-keepalive-css',
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith('.module.css')) return null
    return CSS_PREFIX + (importer === undefined ? source : resolve(dirname(importer), source)) + CSS_SUFFIX
  },
  async load(id: string) {
    if (!id.startsWith(CSS_PREFIX)) return null
    const file = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
    this.addWatchFile(file)
    const source = await readFile(file)
    const result = transform({
      filename: file,
      code: source,
      cssModules: { pattern: '[hash]_[local]' },
      minify: true,
    })
    const classes: Record<string, string> = {}
    for (const [local, exported] of Object.entries(result.exports ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      classes[local] = exported.name
    }
    const tagId = ID + '/' + file
    return [
      'const css = ' + JSON.stringify(result.code.toString()) + ';',
      'const tagId = ' + JSON.stringify(tagId) + ';',
      "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
      "  const tag = document.createElement('style');",
      '  tag.dataset.plugin = ' + JSON.stringify(ID) + ';',
      '  tag.dataset.pluginCss = tagId;',
      '  tag.textContent = css;',
      '  document.head.appendChild(tag);',
      '}',
      'export default ' + JSON.stringify(classes) + ';',
    ].join('\n')
  },
}

const node: UserConfig = {
  name: ID,
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: { neverBundle: ['@deepseek-ai/cordis', '@deepseek-ai/schemastery'] },
}

const client: UserConfig = {
  name: ID + '/client',
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: { neverBundle: CLIENT_EXTERNALS },
  plugins: [cssModules as never],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(ID) + ', factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [node, client]