// The built app (dist/): the brand icon set is emitted once per page, and nothing in it loads a font, script, style or image from a
// third-party origin. It needs a build, so it runs after one (CI's build job sets REQUIRE_DIST=1 and fails if dist/ is missing);
// a plain `npm test` before any build skips it rather than failing.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIST = 'dist'
const required = Boolean(process.env.REQUIRE_DIST)

/** Every file below `dir`, as paths relative to dist/. */
function files(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path, base) : [path.slice(base.length + 1)]
  })
}

describe.skipIf(!required && !existsSync(DIST))('the built app', () => {
  it('has a dist/ to check', () => {
    expect(existsSync(DIST)).toBe(true)
  })

  const all = existsSync(DIST) ? files(DIST) : []

  it('emits the brand icon set and the manifest', () => {
    for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest']) {
      expect(all, f).toContain(f)
    }
    expect(JSON.parse(readFileSync(join(DIST, 'site.webmanifest'), 'utf8')).name).toBe('Link in Bio')
  })

  describe.each(['index.html'])('%s', (page) => {
    const html = existsSync(join(DIST, page)) ? readFileSync(join(DIST, page), 'utf8') : ''
    const links = (rel: string) => [...html.matchAll(new RegExp(`<link rel="${rel}"[^>]*>`, 'g'))].map((m) => m[0])

    it('carries the icon set exactly once', () => {
      expect(links('icon').filter((l) => l.includes('/favicon.svg'))).toHaveLength(1)
      expect(links('icon').filter((l) => l.includes('/favicon.ico'))).toHaveLength(1)
      expect(links('apple-touch-icon')).toHaveLength(1)
      expect(links('manifest')).toHaveLength(1)
    })

    it('stays noindex', () => {
      expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/)
    })
  })

  it('ships no font file and no font host', () => {
    expect(all.filter((f) => /\.(woff2?|ttf|otf|eot)$/i.test(f))).toEqual([])
    const code = all.filter((f) => /\.(html|css|js)$/.test(f)).map((f) => readFileSync(join(DIST, f), 'utf8'))
    for (const text of code) expect(text).not.toMatch(/fonts\.(googleapis|gstatic)|@font-face/)
  })

  it('loads nothing from a third-party origin', () => {
    // Plain-text links (the XML namespace, Vue's error-reference string, the libraries' own links) are not loads: what counts is a
    // script, stylesheet, font, image or url() that points off this site.
    const pages = all.filter((f) => /\.(html|css|js)$/.test(f))
    for (const f of pages) {
      const text = readFileSync(join(DIST, f), 'utf8')
      expect(text, f).not.toMatch(/<(script|link|img|source|iframe)\b[^>]*\b(src|href|srcset)="(https?:)?\/\//)
      expect(text, f).not.toMatch(/url\(\s*["']?(https?:)?\/\//)
      expect(text, f).not.toMatch(/@import\s+(url\()?["']?(https?:)?\/\//)
    }
  })

  it('names no origin beyond the ones its libraries already carry as text', () => {
    // The app itself names no host: the deployment's come from the instance at run time and the build arguments (the CSP). The shared
    // libraries carry their own links and the Sui SDK the public network names, as text; the CSP decides what is ever fetched. So the
    // hosts allowed are exactly the ones those libraries' published files contain, plus the namespaces and examples (RFC 2606 names, the `.example` TLD among them).
    const libraryHosts = new Set<string>()
    for (const dir of ['node_modules/@meddleware/ui/dist', 'node_modules/@meddleware/wallet-adapter/src', 'node_modules/@meddleware/web-utils/dist', 'node_modules/@meddleware/web-utils/src', 'node_modules/@mysten/sui/dist', 'node_modules/@mysten/wallet-standard/dist', 'node_modules/@meddleware/chain-payments-kit/src', 'node_modules/@meddleware/chain-payments-client/src', 'node_modules/@vue', 'node_modules/vue']) {
      if (!existsSync(dir)) continue
      for (const f of files(dir)) {
        if (!/\.(js|mjs|ts|vue)$/.test(f)) continue
        for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) libraryHosts.add(m[1]!.replace(/\.$/, ''))
      }
    }
    const allowed = /^(?:[a-z0-9-]+\.)*(?:w3\.org|localhost|127\.0\.0\.1|example\.org|example\.link|example)$/
    const found = new Set<string>()
    for (const f of all.filter((n) => /\.(html|css|js|webmanifest)$/.test(n))) {
      for (const m of readFileSync(join(DIST, f), 'utf8').matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) found.add(m[1]!.replace(/\.$/, ''))
    }
    expect([...found].filter((host) => !allowed.test(host) && !libraryHosts.has(host))).toEqual([])
  })
})

describe('the image build', () => {
  const dockerfile = readFileSync('Dockerfile', 'utf8')

  it('scans the production bundle for test support, as CI does, before the image is made', () => {
    const run = dockerfile.split('\n').find((l) => l.startsWith('RUN npm run build'))
    expect(run).toMatch(/npm run build && .*npm run check:dist/)
    expect(dockerfile).toMatch(/RUN npx mw-check-csp-inline "\$\{CSP\}" dist/)
  })
})
