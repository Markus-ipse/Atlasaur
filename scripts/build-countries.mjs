#!/usr/bin/env node
// Generates src/data/countries.json from world-atlas + the table below.
// Run: npm run build:countries
//
// To add or refine a country, edit COUNTRIES below — keys are ISO 3166-1
// numeric codes (zero-padded, matching world-atlas feature.id). Aliases are
// matched after normalize() (lowercased, diacritics stripped, apostrophes
// removed), so they don't need diacritics or case to be exact here.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const COUNTRIES = {
  "004": { iso3: "AFG", name: "Afghanistan", aliases: [] },
  "008": { iso3: "ALB", name: "Albania", aliases: [] },
  "012": { iso3: "DZA", name: "Algeria", aliases: [] },
  "024": { iso3: "AGO", name: "Angola", aliases: [] },
  "010": { iso3: "ATA", name: "Antarctica", aliases: [] },
  "032": { iso3: "ARG", name: "Argentina", aliases: [] },
  "051": { iso3: "ARM", name: "Armenia", aliases: [] },
  "036": { iso3: "AUS", name: "Australia", aliases: [] },
  "040": { iso3: "AUT", name: "Austria", aliases: [] },
  "031": { iso3: "AZE", name: "Azerbaijan", aliases: [] },
  "044": { iso3: "BHS", name: "Bahamas", aliases: ["The Bahamas"] },
  "048": { iso3: "BHR", name: "Bahrain", aliases: [] },
  "050": { iso3: "BGD", name: "Bangladesh", aliases: [] },
  "112": { iso3: "BLR", name: "Belarus", aliases: [] },
  "056": { iso3: "BEL", name: "Belgium", aliases: [] },
  "084": { iso3: "BLZ", name: "Belize", aliases: [] },
  "204": { iso3: "BEN", name: "Benin", aliases: [] },
  "064": { iso3: "BTN", name: "Bhutan", aliases: [] },
  "068": { iso3: "BOL", name: "Bolivia", aliases: [] },
  "070": { iso3: "BIH", name: "Bosnia and Herzegovina", aliases: ["Bosnia"] },
  "072": { iso3: "BWA", name: "Botswana", aliases: [] },
  "076": { iso3: "BRA", name: "Brazil", aliases: [] },
  "096": { iso3: "BRN", name: "Brunei", aliases: ["Brunei Darussalam"] },
  "100": { iso3: "BGR", name: "Bulgaria", aliases: [] },
  "854": { iso3: "BFA", name: "Burkina Faso", aliases: [] },
  "108": { iso3: "BDI", name: "Burundi", aliases: [] },
  "116": { iso3: "KHM", name: "Cambodia", aliases: [] },
  "120": { iso3: "CMR", name: "Cameroon", aliases: [] },
  "124": { iso3: "CAN", name: "Canada", aliases: [] },
  "140": { iso3: "CAF", name: "Central African Republic", aliases: ["CAR"] },
  "148": { iso3: "TCD", name: "Chad", aliases: [] },
  "152": { iso3: "CHL", name: "Chile", aliases: [] },
  "156": { iso3: "CHN", name: "China", aliases: ["People's Republic of China", "PRC"] },
  "170": { iso3: "COL", name: "Colombia", aliases: [] },
  "178": { iso3: "COG", name: "Republic of the Congo", aliases: ["Congo", "Congo-Brazzaville"] },
  "180": { iso3: "COD", name: "Democratic Republic of the Congo", aliases: ["DRC", "DR Congo", "Congo-Kinshasa", "Zaire"] },
  "188": { iso3: "CRI", name: "Costa Rica", aliases: [] },
  "384": { iso3: "CIV", name: "Côte d'Ivoire", aliases: ["Ivory Coast"] },
  "191": { iso3: "HRV", name: "Croatia", aliases: [] },
  "192": { iso3: "CUB", name: "Cuba", aliases: [] },
  "196": { iso3: "CYP", name: "Cyprus", aliases: [] },
  "203": { iso3: "CZE", name: "Czechia", aliases: ["Czech Republic"] },
  "208": { iso3: "DNK", name: "Denmark", aliases: [] },
  "262": { iso3: "DJI", name: "Djibouti", aliases: [] },
  "214": { iso3: "DOM", name: "Dominican Republic", aliases: [] },
  "218": { iso3: "ECU", name: "Ecuador", aliases: [] },
  "818": { iso3: "EGY", name: "Egypt", aliases: [] },
  "222": { iso3: "SLV", name: "El Salvador", aliases: [] },
  "226": { iso3: "GNQ", name: "Equatorial Guinea", aliases: [] },
  "232": { iso3: "ERI", name: "Eritrea", aliases: [] },
  "233": { iso3: "EST", name: "Estonia", aliases: [] },
  "748": { iso3: "SWZ", name: "Eswatini", aliases: ["Swaziland"] },
  "231": { iso3: "ETH", name: "Ethiopia", aliases: [] },
  "238": { iso3: "FLK", name: "Falkland Islands", aliases: ["Malvinas"] },
  "242": { iso3: "FJI", name: "Fiji", aliases: [] },
  "246": { iso3: "FIN", name: "Finland", aliases: [] },
  "250": { iso3: "FRA", name: "France", aliases: ["French Republic"] },
  "260": { iso3: "ATF", name: "French Southern Territories", aliases: [] },
  "266": { iso3: "GAB", name: "Gabon", aliases: [] },
  "270": { iso3: "GMB", name: "Gambia", aliases: ["The Gambia"] },
  "268": { iso3: "GEO", name: "Georgia", aliases: [] },
  "276": { iso3: "DEU", name: "Germany", aliases: ["Deutschland"] },
  "288": { iso3: "GHA", name: "Ghana", aliases: [] },
  "300": { iso3: "GRC", name: "Greece", aliases: ["Hellas"] },
  "304": { iso3: "GRL", name: "Greenland", aliases: [] },
  "320": { iso3: "GTM", name: "Guatemala", aliases: [] },
  "324": { iso3: "GIN", name: "Guinea", aliases: [] },
  "624": { iso3: "GNB", name: "Guinea-Bissau", aliases: [] },
  "328": { iso3: "GUY", name: "Guyana", aliases: [] },
  "332": { iso3: "HTI", name: "Haiti", aliases: [] },
  "340": { iso3: "HND", name: "Honduras", aliases: [] },
  "348": { iso3: "HUN", name: "Hungary", aliases: [] },
  "352": { iso3: "ISL", name: "Iceland", aliases: [] },
  "356": { iso3: "IND", name: "India", aliases: ["Bharat"] },
  "360": { iso3: "IDN", name: "Indonesia", aliases: [] },
  "364": { iso3: "IRN", name: "Iran", aliases: ["Persia"] },
  "368": { iso3: "IRQ", name: "Iraq", aliases: [] },
  "372": { iso3: "IRL", name: "Ireland", aliases: ["Republic of Ireland", "Eire"] },
  "376": { iso3: "ISR", name: "Israel", aliases: [] },
  "380": { iso3: "ITA", name: "Italy", aliases: [] },
  "388": { iso3: "JAM", name: "Jamaica", aliases: [] },
  "392": { iso3: "JPN", name: "Japan", aliases: ["Nippon", "Nihon"] },
  "400": { iso3: "JOR", name: "Jordan", aliases: [] },
  "398": { iso3: "KAZ", name: "Kazakhstan", aliases: [] },
  "404": { iso3: "KEN", name: "Kenya", aliases: [] },
  "414": { iso3: "KWT", name: "Kuwait", aliases: [] },
  "417": { iso3: "KGZ", name: "Kyrgyzstan", aliases: [] },
  "418": { iso3: "LAO", name: "Laos", aliases: [] },
  "428": { iso3: "LVA", name: "Latvia", aliases: [] },
  "422": { iso3: "LBN", name: "Lebanon", aliases: [] },
  "426": { iso3: "LSO", name: "Lesotho", aliases: [] },
  "430": { iso3: "LBR", name: "Liberia", aliases: [] },
  "434": { iso3: "LBY", name: "Libya", aliases: [] },
  "440": { iso3: "LTU", name: "Lithuania", aliases: [] },
  "442": { iso3: "LUX", name: "Luxembourg", aliases: [] },
  "450": { iso3: "MDG", name: "Madagascar", aliases: [] },
  "454": { iso3: "MWI", name: "Malawi", aliases: [] },
  "458": { iso3: "MYS", name: "Malaysia", aliases: [] },
  "466": { iso3: "MLI", name: "Mali", aliases: [] },
  "478": { iso3: "MRT", name: "Mauritania", aliases: [] },
  "484": { iso3: "MEX", name: "Mexico", aliases: [] },
  "498": { iso3: "MDA", name: "Moldova", aliases: [] },
  "496": { iso3: "MNG", name: "Mongolia", aliases: [] },
  "499": { iso3: "MNE", name: "Montenegro", aliases: [] },
  "504": { iso3: "MAR", name: "Morocco", aliases: [] },
  "508": { iso3: "MOZ", name: "Mozambique", aliases: [] },
  "104": { iso3: "MMR", name: "Myanmar", aliases: ["Burma"] },
  "516": { iso3: "NAM", name: "Namibia", aliases: [] },
  "524": { iso3: "NPL", name: "Nepal", aliases: [] },
  "528": { iso3: "NLD", name: "Netherlands", aliases: ["The Netherlands", "Holland"] },
  "540": { iso3: "NCL", name: "New Caledonia", aliases: [] },
  "554": { iso3: "NZL", name: "New Zealand", aliases: ["Aotearoa"] },
  "558": { iso3: "NIC", name: "Nicaragua", aliases: [] },
  "562": { iso3: "NER", name: "Niger", aliases: [] },
  "566": { iso3: "NGA", name: "Nigeria", aliases: [] },
  "408": { iso3: "PRK", name: "North Korea", aliases: ["Democratic People's Republic of Korea", "DPRK"] },
  "807": { iso3: "MKD", name: "North Macedonia", aliases: ["Macedonia", "FYROM"] },
  "578": { iso3: "NOR", name: "Norway", aliases: [] },
  "512": { iso3: "OMN", name: "Oman", aliases: [] },
  "586": { iso3: "PAK", name: "Pakistan", aliases: [] },
  "591": { iso3: "PAN", name: "Panama", aliases: [] },
  "275": { iso3: "PSE", name: "Palestine", aliases: ["Palestinian Territories", "State of Palestine"] },
  "598": { iso3: "PNG", name: "Papua New Guinea", aliases: [] },
  "600": { iso3: "PRY", name: "Paraguay", aliases: [] },
  "604": { iso3: "PER", name: "Peru", aliases: [] },
  "608": { iso3: "PHL", name: "Philippines", aliases: ["The Philippines"] },
  "616": { iso3: "POL", name: "Poland", aliases: [] },
  "620": { iso3: "PRT", name: "Portugal", aliases: [] },
  "630": { iso3: "PRI", name: "Puerto Rico", aliases: [] },
  "634": { iso3: "QAT", name: "Qatar", aliases: [] },
  "642": { iso3: "ROU", name: "Romania", aliases: [] },
  "643": { iso3: "RUS", name: "Russia", aliases: ["Russian Federation"] },
  "646": { iso3: "RWA", name: "Rwanda", aliases: [] },
  "682": { iso3: "SAU", name: "Saudi Arabia", aliases: [] },
  "686": { iso3: "SEN", name: "Senegal", aliases: [] },
  "688": { iso3: "SRB", name: "Serbia", aliases: [] },
  "694": { iso3: "SLE", name: "Sierra Leone", aliases: [] },
  "703": { iso3: "SVK", name: "Slovakia", aliases: [] },
  "705": { iso3: "SVN", name: "Slovenia", aliases: [] },
  "090": { iso3: "SLB", name: "Solomon Islands", aliases: [] },
  "706": { iso3: "SOM", name: "Somalia", aliases: [] },
  "710": { iso3: "ZAF", name: "South Africa", aliases: ["RSA"] },
  "410": { iso3: "KOR", name: "South Korea", aliases: ["Republic of Korea", "ROK"] },
  "728": { iso3: "SSD", name: "South Sudan", aliases: [] },
  "724": { iso3: "ESP", name: "Spain", aliases: ["España"] },
  "144": { iso3: "LKA", name: "Sri Lanka", aliases: [] },
  "729": { iso3: "SDN", name: "Sudan", aliases: [] },
  "740": { iso3: "SUR", name: "Suriname", aliases: [] },
  "752": { iso3: "SWE", name: "Sweden", aliases: ["Sverige"] },
  "756": { iso3: "CHE", name: "Switzerland", aliases: [] },
  "760": { iso3: "SYR", name: "Syria", aliases: ["Syrian Arab Republic"] },
  "158": { iso3: "TWN", name: "Taiwan", aliases: ["Republic of China", "ROC"] },
  "762": { iso3: "TJK", name: "Tajikistan", aliases: [] },
  "834": { iso3: "TZA", name: "Tanzania", aliases: [] },
  "764": { iso3: "THA", name: "Thailand", aliases: [] },
  "626": { iso3: "TLS", name: "Timor-Leste", aliases: ["East Timor"] },
  "768": { iso3: "TGO", name: "Togo", aliases: [] },
  "780": { iso3: "TTO", name: "Trinidad and Tobago", aliases: [] },
  "788": { iso3: "TUN", name: "Tunisia", aliases: [] },
  "792": { iso3: "TUR", name: "Turkey", aliases: ["Türkiye"] },
  "795": { iso3: "TKM", name: "Turkmenistan", aliases: [] },
  "800": { iso3: "UGA", name: "Uganda", aliases: [] },
  "804": { iso3: "UKR", name: "Ukraine", aliases: [] },
  "784": { iso3: "ARE", name: "United Arab Emirates", aliases: ["UAE", "Emirates"] },
  "826": { iso3: "GBR", name: "United Kingdom", aliases: ["UK", "Britain", "Great Britain", "England"] },
  "840": { iso3: "USA", name: "United States", aliases: ["USA", "US", "America", "United States of America"] },
  "858": { iso3: "URY", name: "Uruguay", aliases: [] },
  "860": { iso3: "UZB", name: "Uzbekistan", aliases: [] },
  "548": { iso3: "VUT", name: "Vanuatu", aliases: [] },
  "862": { iso3: "VEN", name: "Venezuela", aliases: [] },
  "704": { iso3: "VNM", name: "Vietnam", aliases: ["Viet Nam"] },
  "732": { iso3: "ESH", name: "Western Sahara", aliases: [] },
  "887": { iso3: "YEM", name: "Yemen", aliases: [] },
  "894": { iso3: "ZMB", name: "Zambia", aliases: [] },
  "716": { iso3: "ZWE", name: "Zimbabwe", aliases: [] },
};

const topology = JSON.parse(
  await readFile(resolve(root, "node_modules/world-atlas/countries-110m.json"), "utf8"),
);

const topologyIds = new Set(
  topology.objects.countries.geometries
    .map((g) => g.id)
    .filter((id) => typeof id === "string"),
);

const matched = [];
const missingFromTopology = [];
for (const [numeric, info] of Object.entries(COUNTRIES)) {
  if (topologyIds.has(numeric)) {
    matched.push({ numeric, ...info });
  } else {
    missingFromTopology.push({ numeric, ...info });
  }
}
matched.sort((a, b) => a.name.localeCompare(b.name));

const orphans = [];
for (const g of topology.objects.countries.geometries) {
  if (typeof g.id === "string" && !COUNTRIES[g.id]) {
    orphans.push({ id: g.id, name: g.properties?.name });
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
