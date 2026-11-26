#!/usr/bin/env node
// The built app ships no test support: the fake service, the end-to-end build's mock wallet and stub chain, test hooks and the test
// runners must not be reachable from dist (a fake that could answer for the real API, or a wallet that signs anything, must never ship).
//
//   node scripts/check-dist.mjs dist
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: check-dist.mjs <dist directory>')
  process.exit(2)
}

const FORBIDDEN = [
  /FakeService/,
  /fake-service/,
  /Test Wallet/,
  /installE2eWallet/,
  /createStubClient/,
  /tests\/support/,
  /__TEST__/,
  /__test_hook__/i,
  /window\.__(?:test|e2e|mock)/i,
  /@playwright/,
  /vitest/,
  /\bexpire\(\)/,
]

/** Every file under a folder, recursively. */
function files(d) {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

// The forbidden patterns found, with their file.
const problems = []
// How many files were read.
let n = 0
// Read every text-like file in the build.
for (const f of files(dir)) {
  // Images and fonts cannot carry test support.
  if (!/\.(js|mjs|css|html|map|json)$/.test(f)) continue
  n++
  const text = readFileSync(f, 'utf8')
  // Any forbidden pattern in the file is a problem.
  for (const re of FORBIDDEN) if (re.test(text)) problems.push(`${f}: matches ${re}`)
}
// An empty build would pass trivially, so it is a problem too.
if (n === 0) problems.push(`${dir} has no built files`)
// The app must ask crawlers not to index it.
const index = readFileSync(join(dir, 'index.html'), 'utf8')
if (!/<meta[^>]+name="robots"[^>]+noindex/i.test(index)) problems.push('index.html lacks <meta name="robots" content="noindex">')
// Any problem fails the check.
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`${dir}: ${n} files, no test support, noindex present`)
