/** The reasons a report may give (REPORT_REASONS in crates/api/src/hosted/app.rs), in plain words, as id and label. */
export const REPORT_REASONS: ReadonlyArray<readonly [string, string]> = [
  // The ids are the service's; each has plain words for the form.
  ['illegal', 'Something illegal'],
  ['csam', 'Sexual content involving a child'],
  ['terrorism', 'Terrorist content'],
  ['fraud', 'A scam or fraud'],
  ['malware', 'Malware or phishing (a link that harms or tricks people)'],
  ['harassment', 'Harassment, threats or hate'],
  ['impersonation', 'Pretending to be someone else'],
  ['intellectual-property', 'Someone else’s copyright or trademark'],
  ['adult', 'Sexual or adult content'],
  ['spam', 'Spam'],
  // The catch-all comes last.
  ['other', 'Something else'],
]

/** The reasons by id. */
const BY_ID = new Map(REPORT_REASONS)

/** The plain words for a reason id (the id itself if it is not on the list). */
export const reasonLabel = (id: string): string => BY_ID.get(id) ?? id
