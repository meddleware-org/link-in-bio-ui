// ISO 3166-1 alpha-2 codes, named in English by the browser (Intl.DisplayNames). The account's declared country is tax evidence; it is
// optional, and the service checks the code itself.
// The codes offered.
const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')

/** A function from a code to its English name, or to the code itself where the browser cannot name it. */
function namer(): (code: string) => string {
  try {
    // The browser's own English region names.
    const names = new Intl.DisplayNames(['en'], { type: 'region' })
    // A name, or the code when the browser has none.
    return (code) => names.of(code) ?? code
  // An old browser without `Intl.DisplayNames`: show the codes.
  } catch {
    return (code) => code
  }
}

/** `[code, name]` pairs sorted by name, for a select. */
export function countryOptions(): Array<readonly [string, string]> {
  // The naming function.
  const name = namer()
  return CODES.map((c) => [c, name(c)] as const).sort((a, b) => a[1].localeCompare(b[1], 'en'))
}

/** True when the code is one of the offered ISO 3166-1 codes. */
export const isCountryCode = (c: string): boolean => CODES.includes(c)
