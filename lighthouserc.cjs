// Lighthouse CI on the built app: accessibility 100, best practices ≥ 0.95, script and stylesheet budgets (free, results to
// test-results/lighthouse). (.cjs because Lighthouse CI loads its config with `require`; Node loads the ES module factory through it.)
// With no service behind the preview, `/` shows its "could not be reached" state and `/report` the form.
const { lighthouseConfig } = require('@meddleware/frontend-config/lighthouserc')

module.exports = lighthouseConfig({ port: 4299, paths: ['/', '/report'] })
