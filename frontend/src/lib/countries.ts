// ISO 3166-1 alpha-2 codes. Names come from the browser's Intl data, so they're correct and
// localisable without shipping a translation table.
const CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );

/** Countries most buyers come from, shown first in pickers. */
const PRIORITY = ["NG", "GH", "KE", "ZA", "GB", "US", "CA"];

export interface CountryOption {
  value: string;
  label: string;
}

export function countryName(code: string, locale = "en"): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function countryOptions(locale = "en"): CountryOption[] {
  const all = CODES.map((code) => ({ value: code, label: countryName(code, locale) })).sort((a, b) =>
    a.label.localeCompare(b.label, locale),
  );
  const top = PRIORITY.map((code) => all.find((c) => c.value === code)).filter((c): c is CountryOption => Boolean(c));
  return [...top, ...all.filter((c) => !PRIORITY.includes(c.value))];
}
