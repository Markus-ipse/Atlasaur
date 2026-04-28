#!/usr/bin/env node
// Generates src/data/countries.json from world-atlas + the table below.
// Run: npm run build:countries
//
// To add or refine a country, edit COUNTRIES below — keys are ISO 3166-1
// numeric codes (zero-padded, matching world-atlas feature.id). Aliases are
// matched after normalize() (lowercased, diacritics stripped, apostrophes
// removed), so they don't need diacritics or case to be exact here.
//
// Partially-recognized territories (Kosovo, N. Cyprus, Somaliland) have no
// official ISO 3166-1 numeric or alpha-3 code. They render in the topology
// without a feature.id, so we match them by topology feature name instead.
// For each, set `topoName` to the exact `properties.name` from the topology
// and use a synthetic key from the ISO-reserved user-assigned ranges:
//   - numeric: 900–999  (ISO 3166-1 user-assigned)
//   - alpha-3: XAA–XZZ  (ISO 3166-1 user-assigned)
// These are guaranteed by ISO never to collide with future official codes.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Continent assignments follow UN M49 with these conventions for ambiguous
// cases: Russia → Europe; transcontinental Caucasus/Anatolia (Turkey, Cyprus,
// Armenia, Azerbaijan, Georgia, Kazakhstan) → Asia; Greenland & Caribbean →
// North America; Falkland Islands → South America; French Southern
// Territories → Antarctica.
const COUNTRIES = {
  "004": { iso3: "AFG", name: "Afghanistan", aliases: [], continent: "Asia" },
  "008": { iso3: "ALB", name: "Albania", aliases: [], continent: "Europe" },
  "012": { iso3: "DZA", name: "Algeria", aliases: [], continent: "Africa" },
  "024": { iso3: "AGO", name: "Angola", aliases: [], continent: "Africa" },
  "010": { iso3: "ATA", name: "Antarctica", aliases: [], continent: "Antarctica" },
  "032": { iso3: "ARG", name: "Argentina", aliases: [], continent: "South America" },
  "051": { iso3: "ARM", name: "Armenia", aliases: [], continent: "Asia" },
  "036": { iso3: "AUS", name: "Australia", aliases: [], continent: "Oceania" },
  "040": { iso3: "AUT", name: "Austria", aliases: [], continent: "Europe" },
  "031": { iso3: "AZE", name: "Azerbaijan", aliases: [], continent: "Asia" },
  "044": { iso3: "BHS", name: "Bahamas", aliases: ["The Bahamas"], continent: "North America" },
  "048": { iso3: "BHR", name: "Bahrain", aliases: [], continent: "Asia" },
  "050": { iso3: "BGD", name: "Bangladesh", aliases: [], continent: "Asia" },
  "112": { iso3: "BLR", name: "Belarus", aliases: [], continent: "Europe" },
  "056": { iso3: "BEL", name: "Belgium", aliases: [], continent: "Europe" },
  "084": { iso3: "BLZ", name: "Belize", aliases: [], continent: "North America" },
  "204": { iso3: "BEN", name: "Benin", aliases: [], continent: "Africa" },
  "064": { iso3: "BTN", name: "Bhutan", aliases: [], continent: "Asia" },
  "068": { iso3: "BOL", name: "Bolivia", aliases: [], continent: "South America" },
  "070": { iso3: "BIH", name: "Bosnia and Herzegovina", aliases: ["Bosnia"], continent: "Europe" },
  "072": { iso3: "BWA", name: "Botswana", aliases: [], continent: "Africa" },
  "076": { iso3: "BRA", name: "Brazil", aliases: [], continent: "South America" },
  "096": { iso3: "BRN", name: "Brunei", aliases: ["Brunei Darussalam"], continent: "Asia" },
  "100": { iso3: "BGR", name: "Bulgaria", aliases: [], continent: "Europe" },
  "854": { iso3: "BFA", name: "Burkina Faso", aliases: [], continent: "Africa" },
  "108": { iso3: "BDI", name: "Burundi", aliases: [], continent: "Africa" },
  "116": { iso3: "KHM", name: "Cambodia", aliases: [], continent: "Asia" },
  "120": { iso3: "CMR", name: "Cameroon", aliases: [], continent: "Africa" },
  "124": { iso3: "CAN", name: "Canada", aliases: [], continent: "North America" },
  "140": { iso3: "CAF", name: "Central African Republic", aliases: ["CAR"], continent: "Africa" },
  "148": { iso3: "TCD", name: "Chad", aliases: [], continent: "Africa" },
  "152": { iso3: "CHL", name: "Chile", aliases: [], continent: "South America" },
  "156": { iso3: "CHN", name: "China", aliases: ["People's Republic of China", "PRC"], continent: "Asia" },
  "170": { iso3: "COL", name: "Colombia", aliases: [], continent: "South America" },
  "178": { iso3: "COG", name: "Republic of the Congo", aliases: ["Congo", "Congo-Brazzaville"], continent: "Africa" },
  "180": { iso3: "COD", name: "Democratic Republic of the Congo", aliases: ["DRC", "DR Congo", "Congo-Kinshasa", "Zaire"], continent: "Africa" },
  "188": { iso3: "CRI", name: "Costa Rica", aliases: [], continent: "North America" },
  "384": { iso3: "CIV", name: "Côte d'Ivoire", aliases: ["Ivory Coast"], continent: "Africa" },
  "191": { iso3: "HRV", name: "Croatia", aliases: [], continent: "Europe" },
  "192": { iso3: "CUB", name: "Cuba", aliases: [], continent: "North America" },
  "196": { iso3: "CYP", name: "Cyprus", aliases: [], continent: "Asia" },
  "203": { iso3: "CZE", name: "Czechia", aliases: ["Czech Republic"], continent: "Europe" },
  "208": { iso3: "DNK", name: "Denmark", aliases: [], continent: "Europe" },
  "262": { iso3: "DJI", name: "Djibouti", aliases: [], continent: "Africa" },
  "214": { iso3: "DOM", name: "Dominican Republic", aliases: [], continent: "North America" },
  "218": { iso3: "ECU", name: "Ecuador", aliases: [], continent: "South America" },
  "818": { iso3: "EGY", name: "Egypt", aliases: [], continent: "Africa" },
  "222": { iso3: "SLV", name: "El Salvador", aliases: [], continent: "North America" },
  "226": { iso3: "GNQ", name: "Equatorial Guinea", aliases: [], continent: "Africa" },
  "232": { iso3: "ERI", name: "Eritrea", aliases: [], continent: "Africa" },
  "233": { iso3: "EST", name: "Estonia", aliases: [], continent: "Europe" },
  "748": { iso3: "SWZ", name: "Eswatini", aliases: ["Swaziland"], continent: "Africa" },
  "231": { iso3: "ETH", name: "Ethiopia", aliases: [], continent: "Africa" },
  "238": { iso3: "FLK", name: "Falkland Islands", aliases: ["Malvinas"], continent: "South America" },
  "242": { iso3: "FJI", name: "Fiji", aliases: [], continent: "Oceania" },
  "246": { iso3: "FIN", name: "Finland", aliases: [], continent: "Europe" },
  "250": { iso3: "FRA", name: "France", aliases: ["French Republic"], continent: "Europe" },
  "260": { iso3: "ATF", name: "French Southern Territories", aliases: [], continent: "Antarctica" },
  "266": { iso3: "GAB", name: "Gabon", aliases: [], continent: "Africa" },
  "270": { iso3: "GMB", name: "Gambia", aliases: ["The Gambia"], continent: "Africa" },
  "268": { iso3: "GEO", name: "Georgia", aliases: [], continent: "Asia" },
  "276": { iso3: "DEU", name: "Germany", aliases: ["Deutschland"], continent: "Europe" },
  "288": { iso3: "GHA", name: "Ghana", aliases: [], continent: "Africa" },
  "300": { iso3: "GRC", name: "Greece", aliases: ["Hellas"], continent: "Europe" },
  "304": { iso3: "GRL", name: "Greenland", aliases: [], continent: "North America" },
  "320": { iso3: "GTM", name: "Guatemala", aliases: [], continent: "North America" },
  "324": { iso3: "GIN", name: "Guinea", aliases: [], continent: "Africa" },
  "624": { iso3: "GNB", name: "Guinea-Bissau", aliases: [], continent: "Africa" },
  "328": { iso3: "GUY", name: "Guyana", aliases: [], continent: "South America" },
  "332": { iso3: "HTI", name: "Haiti", aliases: [], continent: "North America" },
  "340": { iso3: "HND", name: "Honduras", aliases: [], continent: "North America" },
  "348": { iso3: "HUN", name: "Hungary", aliases: [], continent: "Europe" },
  "352": { iso3: "ISL", name: "Iceland", aliases: [], continent: "Europe" },
  "356": { iso3: "IND", name: "India", aliases: ["Bharat"], continent: "Asia" },
  "360": { iso3: "IDN", name: "Indonesia", aliases: [], continent: "Asia" },
  "364": { iso3: "IRN", name: "Iran", aliases: ["Persia"], continent: "Asia" },
  "368": { iso3: "IRQ", name: "Iraq", aliases: [], continent: "Asia" },
  "372": { iso3: "IRL", name: "Ireland", aliases: ["Republic of Ireland", "Eire"], continent: "Europe" },
  "376": { iso3: "ISR", name: "Israel", aliases: [], continent: "Asia" },
  "380": { iso3: "ITA", name: "Italy", aliases: [], continent: "Europe" },
  "388": { iso3: "JAM", name: "Jamaica", aliases: [], continent: "North America" },
  "392": { iso3: "JPN", name: "Japan", aliases: ["Nippon", "Nihon"], continent: "Asia" },
  "400": { iso3: "JOR", name: "Jordan", aliases: [], continent: "Asia" },
  "398": { iso3: "KAZ", name: "Kazakhstan", aliases: [], continent: "Asia" },
  "404": { iso3: "KEN", name: "Kenya", aliases: [], continent: "Africa" },
  "414": { iso3: "KWT", name: "Kuwait", aliases: [], continent: "Asia" },
  "417": { iso3: "KGZ", name: "Kyrgyzstan", aliases: [], continent: "Asia" },
  "418": { iso3: "LAO", name: "Laos", aliases: [], continent: "Asia" },
  "428": { iso3: "LVA", name: "Latvia", aliases: [], continent: "Europe" },
  "422": { iso3: "LBN", name: "Lebanon", aliases: [], continent: "Asia" },
  "426": { iso3: "LSO", name: "Lesotho", aliases: [], continent: "Africa" },
  "430": { iso3: "LBR", name: "Liberia", aliases: [], continent: "Africa" },
  "434": { iso3: "LBY", name: "Libya", aliases: [], continent: "Africa" },
  "440": { iso3: "LTU", name: "Lithuania", aliases: [], continent: "Europe" },
  "442": { iso3: "LUX", name: "Luxembourg", aliases: [], continent: "Europe" },
  "450": { iso3: "MDG", name: "Madagascar", aliases: [], continent: "Africa" },
  "454": { iso3: "MWI", name: "Malawi", aliases: [], continent: "Africa" },
  "458": { iso3: "MYS", name: "Malaysia", aliases: [], continent: "Asia" },
  "466": { iso3: "MLI", name: "Mali", aliases: [], continent: "Africa" },
  "478": { iso3: "MRT", name: "Mauritania", aliases: [], continent: "Africa" },
  "484": { iso3: "MEX", name: "Mexico", aliases: [], continent: "North America" },
  "498": { iso3: "MDA", name: "Moldova", aliases: [], continent: "Europe" },
  "496": { iso3: "MNG", name: "Mongolia", aliases: [], continent: "Asia" },
  "499": { iso3: "MNE", name: "Montenegro", aliases: [], continent: "Europe" },
  "504": { iso3: "MAR", name: "Morocco", aliases: [], continent: "Africa" },
  "508": { iso3: "MOZ", name: "Mozambique", aliases: [], continent: "Africa" },
  "104": { iso3: "MMR", name: "Myanmar", aliases: ["Burma"], continent: "Asia" },
  "516": { iso3: "NAM", name: "Namibia", aliases: [], continent: "Africa" },
  "524": { iso3: "NPL", name: "Nepal", aliases: [], continent: "Asia" },
  "528": { iso3: "NLD", name: "Netherlands", aliases: ["The Netherlands", "Holland"], continent: "Europe" },
  "540": { iso3: "NCL", name: "New Caledonia", aliases: [], continent: "Oceania" },
  "554": { iso3: "NZL", name: "New Zealand", aliases: ["Aotearoa"], continent: "Oceania" },
  "558": { iso3: "NIC", name: "Nicaragua", aliases: [], continent: "North America" },
  "562": { iso3: "NER", name: "Niger", aliases: [], continent: "Africa" },
  "566": { iso3: "NGA", name: "Nigeria", aliases: [], continent: "Africa" },
  "408": { iso3: "PRK", name: "North Korea", aliases: ["Democratic People's Republic of Korea", "DPRK"], continent: "Asia" },
  "807": { iso3: "MKD", name: "North Macedonia", aliases: ["Macedonia", "FYROM"], continent: "Europe" },
  "578": { iso3: "NOR", name: "Norway", aliases: [], continent: "Europe" },
  "512": { iso3: "OMN", name: "Oman", aliases: [], continent: "Asia" },
  "586": { iso3: "PAK", name: "Pakistan", aliases: [], continent: "Asia" },
  "591": { iso3: "PAN", name: "Panama", aliases: [], continent: "North America" },
  "275": { iso3: "PSE", name: "Palestine", aliases: ["Palestinian Territories", "State of Palestine"], continent: "Asia" },
  "598": { iso3: "PNG", name: "Papua New Guinea", aliases: [], continent: "Oceania" },
  "600": { iso3: "PRY", name: "Paraguay", aliases: [], continent: "South America" },
  "604": { iso3: "PER", name: "Peru", aliases: [], continent: "South America" },
  "608": { iso3: "PHL", name: "Philippines", aliases: ["The Philippines"], continent: "Asia" },
  "616": { iso3: "POL", name: "Poland", aliases: [], continent: "Europe" },
  "620": { iso3: "PRT", name: "Portugal", aliases: [], continent: "Europe" },
  "630": { iso3: "PRI", name: "Puerto Rico", aliases: [], continent: "North America" },
  "634": { iso3: "QAT", name: "Qatar", aliases: [], continent: "Asia" },
  "642": { iso3: "ROU", name: "Romania", aliases: [], continent: "Europe" },
  "643": { iso3: "RUS", name: "Russia", aliases: ["Russian Federation"], continent: "Europe" },
  "646": { iso3: "RWA", name: "Rwanda", aliases: [], continent: "Africa" },
  "682": { iso3: "SAU", name: "Saudi Arabia", aliases: [], continent: "Asia" },
  "686": { iso3: "SEN", name: "Senegal", aliases: [], continent: "Africa" },
  "688": { iso3: "SRB", name: "Serbia", aliases: [], continent: "Europe" },
  "694": { iso3: "SLE", name: "Sierra Leone", aliases: [], continent: "Africa" },
  "703": { iso3: "SVK", name: "Slovakia", aliases: [], continent: "Europe" },
  "705": { iso3: "SVN", name: "Slovenia", aliases: [], continent: "Europe" },
  "090": { iso3: "SLB", name: "Solomon Islands", aliases: [], continent: "Oceania" },
  "706": { iso3: "SOM", name: "Somalia", aliases: [], continent: "Africa" },
  "710": { iso3: "ZAF", name: "South Africa", aliases: ["RSA"], continent: "Africa" },
  "410": { iso3: "KOR", name: "South Korea", aliases: ["Republic of Korea", "ROK"], continent: "Asia" },
  "728": { iso3: "SSD", name: "South Sudan", aliases: [], continent: "Africa" },
  "724": { iso3: "ESP", name: "Spain", aliases: ["España"], continent: "Europe" },
  "144": { iso3: "LKA", name: "Sri Lanka", aliases: [], continent: "Asia" },
  "729": { iso3: "SDN", name: "Sudan", aliases: [], continent: "Africa" },
  "740": { iso3: "SUR", name: "Suriname", aliases: [], continent: "South America" },
  "752": { iso3: "SWE", name: "Sweden", aliases: ["Sverige"], continent: "Europe" },
  "756": { iso3: "CHE", name: "Switzerland", aliases: [], continent: "Europe" },
  "760": { iso3: "SYR", name: "Syria", aliases: ["Syrian Arab Republic"], continent: "Asia" },
  "158": { iso3: "TWN", name: "Taiwan", aliases: ["Republic of China", "ROC"], continent: "Asia" },
  "762": { iso3: "TJK", name: "Tajikistan", aliases: [], continent: "Asia" },
  "834": { iso3: "TZA", name: "Tanzania", aliases: [], continent: "Africa" },
  "764": { iso3: "THA", name: "Thailand", aliases: [], continent: "Asia" },
  "626": { iso3: "TLS", name: "Timor-Leste", aliases: ["East Timor"], continent: "Asia" },
  "768": { iso3: "TGO", name: "Togo", aliases: [], continent: "Africa" },
  "780": { iso3: "TTO", name: "Trinidad and Tobago", aliases: [], continent: "North America" },
  "788": { iso3: "TUN", name: "Tunisia", aliases: [], continent: "Africa" },
  "792": { iso3: "TUR", name: "Turkey", aliases: ["Türkiye"], continent: "Asia" },
  "795": { iso3: "TKM", name: "Turkmenistan", aliases: [], continent: "Asia" },
  "800": { iso3: "UGA", name: "Uganda", aliases: [], continent: "Africa" },
  "804": { iso3: "UKR", name: "Ukraine", aliases: [], continent: "Europe" },
  "784": { iso3: "ARE", name: "United Arab Emirates", aliases: ["UAE", "Emirates"], continent: "Asia" },
  "826": { iso3: "GBR", name: "United Kingdom", aliases: ["UK", "Britain", "Great Britain", "England"], continent: "Europe" },
  "840": { iso3: "USA", name: "United States", aliases: ["USA", "US", "America", "United States of America"], continent: "North America" },
  "858": { iso3: "URY", name: "Uruguay", aliases: [], continent: "South America" },
  "860": { iso3: "UZB", name: "Uzbekistan", aliases: [], continent: "Asia" },
  "548": { iso3: "VUT", name: "Vanuatu", aliases: [], continent: "Oceania" },
  "862": { iso3: "VEN", name: "Venezuela", aliases: [], continent: "South America" },
  "704": { iso3: "VNM", name: "Vietnam", aliases: ["Viet Nam"], continent: "Asia" },
  "732": { iso3: "ESH", name: "Western Sahara", aliases: [], continent: "Africa" },
  "887": { iso3: "YEM", name: "Yemen", aliases: [], continent: "Asia" },
  "894": { iso3: "ZMB", name: "Zambia", aliases: [], continent: "Africa" },
  "716": { iso3: "ZWE", name: "Zimbabwe", aliases: [], continent: "Africa" },

  // Partially-recognized territories — keyed by synthetic numeric (900–999
  // user-assigned range), iso3 in user-assigned XAA–XZZ range. These features
  // have no `id` in world-atlas, so the build matches them by `topoName`.
  "901": { iso3: "XKX", name: "Kosovo", aliases: ["Republic of Kosovo"], continent: "Europe", topoName: "Kosovo" },
  "902": { iso3: "XNC", name: "Northern Cyprus", aliases: ["N. Cyprus", "Turkish Republic of Northern Cyprus", "TRNC"], continent: "Asia", topoName: "N. Cyprus" },
  "903": { iso3: "XSL", name: "Somaliland", aliases: ["Republic of Somaliland"], continent: "Africa", topoName: "Somaliland" },
};

const topology = JSON.parse(
  await readFile(resolve(root, "node_modules/world-atlas/countries-110m.json"), "utf8"),
);

const topologyIds = new Set(
  topology.objects.countries.geometries
    .map((g) => g.id)
    .filter((id) => typeof id === "string"),
);
const topologyNames = new Set(
  topology.objects.countries.geometries
    .filter((g) => typeof g.id !== "string")
    .map((g) => g.properties?.name)
    .filter((n) => typeof n === "string"),
);

// Sanity-check the table before matching: malformed entries are easy to
// introduce and silently produce a broken build.
const errors = [];
const seenIso3 = new Set();
for (const [numeric, info] of Object.entries(COUNTRIES)) {
  if (info.topoName) {
    if (topologyIds.has(numeric)) {
      errors.push(
        `${numeric} ${info.iso3} ${info.name}: has topoName but ${numeric} is also a real ISO numeric in the topology — drop topoName.`,
      );
    }
    if (!/^9\d\d$/.test(numeric)) {
      errors.push(
        `${numeric} ${info.iso3} ${info.name}: topoName entries must use a synthetic numeric in 900–999.`,
      );
    }
  }
  if (seenIso3.has(info.iso3)) {
    errors.push(`Duplicate iso3 ${info.iso3} (${info.name})`);
  }
  seenIso3.add(info.iso3);
}
if (errors.length > 0) {
  console.error("Errors in COUNTRIES table:");
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

const matched = [];
const missingFromTopology = [];
const missingTopoNames = [];
for (const [numeric, info] of Object.entries(COUNTRIES)) {
  if (info.topoName) {
    if (topologyNames.has(info.topoName)) {
      matched.push({ numeric, ...info });
    } else {
      // Unlike a missing real ISO numeric (often just "too small at 110m"),
      // a missing topoName almost always means a typo — fail loudly.
      missingTopoNames.push({ numeric, ...info });
    }
  } else if (topologyIds.has(numeric)) {
    matched.push({ numeric, ...info });
  } else {
    missingFromTopology.push({ numeric, ...info });
  }
}
if (missingTopoNames.length > 0) {
  console.error("topoName not found in topology (typo?):");
  for (const c of missingTopoNames) {
    console.error(`  ${c.numeric} ${c.iso3} ${c.name}: topoName=${JSON.stringify(c.topoName)}`);
  }
  process.exit(1);
}
matched.sort((a, b) => a.name.localeCompare(b.name));

// Must match the Continent union in src/types.ts.
const VALID_CONTINENTS = new Set([
  "Africa",
  "Antarctica",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
]);
const invalidContinents = matched.filter(
  (c) => !VALID_CONTINENTS.has(c.continent),
);
if (invalidContinents.length > 0) {
  console.error("Countries with missing or invalid continent:");
  for (const c of invalidContinents) {
    console.error(`  ${c.iso3} ${c.name}: ${JSON.stringify(c.continent)}`);
  }
  process.exit(1);
}

const claimedTopoNames = new Set(
  matched.filter((m) => m.topoName).map((m) => m.topoName),
);
const orphans = [];
for (const g of topology.objects.countries.geometries) {
  if (typeof g.id === "string") {
    if (!COUNTRIES[g.id]) orphans.push({ id: g.id, name: g.properties?.name });
  } else if (!claimedTopoNames.has(g.properties?.name)) {
    orphans.push({ id: "(no id)", name: g.properties?.name });
  }
}

await mkdir(resolve(root, "src/data"), { recursive: true });
await writeFile(
  resolve(root, "src/data/countries.json"),
  JSON.stringify(matched, null, 2) + "\n",
);

console.log(`Wrote ${matched.length} countries to src/data/countries.json`);
if (missingFromTopology.length > 0) {
  console.log(
    `\nIn COUNTRIES table but absent from topology (will not appear on map):`,
  );
  for (const c of missingFromTopology) console.log(`  ${c.numeric} ${c.iso3} ${c.name}`);
}
if (orphans.length > 0) {
  console.log(
    `\nIn topology but absent from COUNTRIES table (will be inert on map):`,
  );
  for (const o of orphans) console.log(`  ${o.id} ${o.name}`);
}
