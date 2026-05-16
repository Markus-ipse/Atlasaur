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
//
// Per-entry fields:
//   iso3, name, aliases, continent      (matching / display / scoping)
//   capital                              (shown at miss-reveal)
//   subregion                            (UN M49; powers MC distractor pools later)
//   landAreaKm2                          (raw input; bucketed into sizeTier on build, NOT emitted)
//   notabilityTier                       (0/1/2; hand-curated "well-known"-ness)
//   topoName? / neighborsOverride?       (escape hatches; see below)
//
// `neighbors` is computed from the topology at build time (shared-arc
// adjacency via topojson-client). Override with `neighborsOverride: iso3[]`
// only when the topology's adjacency doesn't match what learners expect.
// No entries currently use it — French Guiana used to drag France↔Brazil
// and France↔Suriname adjacencies into the result, but that's fixed
// upstream now (build-topology.mjs splits GUF out of France's MultiPolygon).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { neighbors as topoNeighbors } from "topojson-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// UN M49 subregions plus "Antarctica" for ATA / ATF. Must match the
// `Subregion` union in src/types.ts.
const VALID_SUBREGIONS = new Set([
  "Northern Africa",
  "Eastern Africa",
  "Middle Africa",
  "Southern Africa",
  "Western Africa",
  "Caribbean",
  "Central America",
  "South America",
  "Northern America",
  "Central Asia",
  "Eastern Asia",
  "South-eastern Asia",
  "Southern Asia",
  "Western Asia",
  "Eastern Europe",
  "Northern Europe",
  "Southern Europe",
  "Western Europe",
  "Australia and New Zealand",
  "Melanesia",
  "Micronesia",
  "Polynesia",
  "Antarctica",
]);

// Continent assignments follow UN M49 with these conventions for ambiguous
// cases: Russia → Europe; transcontinental Caucasus/Anatolia (Turkey, Cyprus,
// Armenia, Azerbaijan, Georgia, Kazakhstan) → Asia; Greenland & Caribbean →
// North America; Falkland Islands → South America; French Southern
// Territories → Antarctica.
//
// Per-row format (single line): iso3, name, aliases, continent, subregion,
// capital, landAreaKm2, notabilityTier (and optionally topoName /
// neighborsOverride).
const COUNTRIES = {
  "004": { iso3: "AFG", name: "Afghanistan", aliases: [], continent: "Asia", subregion: "Southern Asia", capital: "Kabul", landAreaKm2: 652864, notabilityTier: 1 },
  "008": { iso3: "ALB", name: "Albania", aliases: [], continent: "Europe", subregion: "Southern Europe", capital: "Tirana", landAreaKm2: 28748, notabilityTier: 1 },
  "012": { iso3: "DZA", name: "Algeria", aliases: [], continent: "Africa", subregion: "Northern Africa", capital: "Algiers", landAreaKm2: 2381741, notabilityTier: 1 },
  "024": { iso3: "AGO", name: "Angola", aliases: [], continent: "Africa", subregion: "Middle Africa", capital: "Luanda", landAreaKm2: 1246700, notabilityTier: 1 },
  "010": { iso3: "ATA", name: "Antarctica", aliases: [], continent: "Antarctica", subregion: "Antarctica", capital: null, landAreaKm2: 14000000, notabilityTier: 2 },
  "032": { iso3: "ARG", name: "Argentina", aliases: [], continent: "South America", subregion: "South America", capital: "Buenos Aires", landAreaKm2: 2780400, notabilityTier: 2 },
  "051": { iso3: "ARM", name: "Armenia", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Yerevan", landAreaKm2: 29743, notabilityTier: 0 },
  "036": { iso3: "AUS", name: "Australia", aliases: [], continent: "Oceania", subregion: "Australia and New Zealand", capital: "Canberra", landAreaKm2: 7692024, notabilityTier: 2 },
  "040": { iso3: "AUT", name: "Austria", aliases: [], continent: "Europe", subregion: "Western Europe", capital: "Vienna", landAreaKm2: 83879, notabilityTier: 2 },
  "031": { iso3: "AZE", name: "Azerbaijan", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Baku", landAreaKm2: 86600, notabilityTier: 1 },
  "044": { iso3: "BHS", name: "Bahamas", aliases: ["The Bahamas"], continent: "North America", subregion: "Caribbean", capital: "Nassau", landAreaKm2: 13943, notabilityTier: 1 },
  "048": { iso3: "BHR", name: "Bahrain", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Manama", landAreaKm2: 765, notabilityTier: 0 },
  "050": { iso3: "BGD", name: "Bangladesh", aliases: [], continent: "Asia", subregion: "Southern Asia", capital: "Dhaka", landAreaKm2: 147570, notabilityTier: 1 },
  "112": { iso3: "BLR", name: "Belarus", aliases: [], continent: "Europe", subregion: "Eastern Europe", capital: "Minsk", landAreaKm2: 207600, notabilityTier: 1 },
  "056": { iso3: "BEL", name: "Belgium", aliases: [], continent: "Europe", subregion: "Western Europe", capital: "Brussels", landAreaKm2: 30528, notabilityTier: 2 },
  "084": { iso3: "BLZ", name: "Belize", aliases: [], continent: "North America", subregion: "Central America", capital: "Belmopan", landAreaKm2: 22966, notabilityTier: 0 },
  "204": { iso3: "BEN", name: "Benin", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Porto-Novo", capitalAlternates: ["Cotonou"], landAreaKm2: 114763, notabilityTier: 0 },
  "064": { iso3: "BTN", name: "Bhutan", aliases: [], continent: "Asia", subregion: "Southern Asia", capital: "Thimphu", landAreaKm2: 38394, notabilityTier: 1 },
  "068": { iso3: "BOL", name: "Bolivia", aliases: [], continent: "South America", subregion: "South America", capital: "Sucre", capitalAlternates: ["La Paz"], landAreaKm2: 1098581, notabilityTier: 1 },
  "070": { iso3: "BIH", name: "Bosnia and Herzegovina", aliases: ["Bosnia"], continent: "Europe", subregion: "Southern Europe", capital: "Sarajevo", landAreaKm2: 51209, notabilityTier: 1 },
  "072": { iso3: "BWA", name: "Botswana", aliases: [], continent: "Africa", subregion: "Southern Africa", capital: "Gaborone", landAreaKm2: 581730, notabilityTier: 1 },
  "076": { iso3: "BRA", name: "Brazil", aliases: [], continent: "South America", subregion: "South America", capital: "Brasília", landAreaKm2: 8515767, notabilityTier: 2 },
  "096": { iso3: "BRN", name: "Brunei", aliases: ["Brunei Darussalam"], continent: "Asia", subregion: "South-eastern Asia", capital: "Bandar Seri Begawan", landAreaKm2: 5765, notabilityTier: 0 },
  "100": { iso3: "BGR", name: "Bulgaria", aliases: [], continent: "Europe", subregion: "Eastern Europe", capital: "Sofia", landAreaKm2: 110879, notabilityTier: 1 },
  "854": { iso3: "BFA", name: "Burkina Faso", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Ouagadougou", landAreaKm2: 272967, notabilityTier: 0 },
  "108": { iso3: "BDI", name: "Burundi", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Gitega", landAreaKm2: 27834, notabilityTier: 0 },
  "116": { iso3: "KHM", name: "Cambodia", aliases: [], continent: "Asia", subregion: "South-eastern Asia", capital: "Phnom Penh", landAreaKm2: 181035, notabilityTier: 1 },
  "120": { iso3: "CMR", name: "Cameroon", aliases: [], continent: "Africa", subregion: "Middle Africa", capital: "Yaoundé", landAreaKm2: 475442, notabilityTier: 1 },
  "124": { iso3: "CAN", name: "Canada", aliases: [], continent: "North America", subregion: "Northern America", capital: "Ottawa", landAreaKm2: 9984670, notabilityTier: 2 },
  "140": { iso3: "CAF", name: "Central African Republic", aliases: ["CAR"], continent: "Africa", subregion: "Middle Africa", capital: "Bangui", landAreaKm2: 622984, notabilityTier: 0 },
  "148": { iso3: "TCD", name: "Chad", aliases: [], continent: "Africa", subregion: "Middle Africa", capital: "N'Djamena", landAreaKm2: 1284000, notabilityTier: 0 },
  "152": { iso3: "CHL", name: "Chile", aliases: [], continent: "South America", subregion: "South America", capital: "Santiago", landAreaKm2: 756102, notabilityTier: 2 },
  "156": { iso3: "CHN", name: "China", aliases: ["People's Republic of China", "PRC"], continent: "Asia", subregion: "Eastern Asia", capital: "Beijing", landAreaKm2: 9596961, notabilityTier: 2 },
  "170": { iso3: "COL", name: "Colombia", aliases: [], continent: "South America", subregion: "South America", capital: "Bogotá", landAreaKm2: 1141748, notabilityTier: 2 },
  "178": { iso3: "COG", name: "Republic of the Congo", aliases: ["Congo", "Congo-Brazzaville"], continent: "Africa", subregion: "Middle Africa", capital: "Brazzaville", landAreaKm2: 342000, notabilityTier: 0 },
  "180": { iso3: "COD", name: "Democratic Republic of the Congo", aliases: ["DRC", "DR Congo", "Congo-Kinshasa", "Zaire"], continent: "Africa", subregion: "Middle Africa", capital: "Kinshasa", landAreaKm2: 2344858, notabilityTier: 1 },
  "188": { iso3: "CRI", name: "Costa Rica", aliases: [], continent: "North America", subregion: "Central America", capital: "San José", landAreaKm2: 51100, notabilityTier: 1 },
  "384": { iso3: "CIV", name: "Côte d'Ivoire", aliases: ["Ivory Coast"], continent: "Africa", subregion: "Western Africa", capital: "Yamoussoukro", capitalAlternates: ["Abidjan"], landAreaKm2: 322463, notabilityTier: 1 },
  "191": { iso3: "HRV", name: "Croatia", aliases: [], continent: "Europe", subregion: "Southern Europe", capital: "Zagreb", landAreaKm2: 56594, notabilityTier: 1 },
  "192": { iso3: "CUB", name: "Cuba", aliases: [], continent: "North America", subregion: "Caribbean", capital: "Havana", landAreaKm2: 109884, notabilityTier: 2 },
  "196": { iso3: "CYP", name: "Cyprus", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Nicosia", landAreaKm2: 9251, notabilityTier: 1 },
  "203": { iso3: "CZE", name: "Czechia", aliases: ["Czech Republic"], continent: "Europe", subregion: "Eastern Europe", capital: "Prague", landAreaKm2: 78867, notabilityTier: 2 },
  "208": { iso3: "DNK", name: "Denmark", aliases: [], continent: "Europe", subregion: "Northern Europe", capital: "Copenhagen", landAreaKm2: 42933, notabilityTier: 2 },
  "262": { iso3: "DJI", name: "Djibouti", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Djibouti", landAreaKm2: 23200, notabilityTier: 0 },
  "214": { iso3: "DOM", name: "Dominican Republic", aliases: [], continent: "North America", subregion: "Caribbean", capital: "Santo Domingo", landAreaKm2: 48671, notabilityTier: 1 },
  "218": { iso3: "ECU", name: "Ecuador", aliases: [], continent: "South America", subregion: "South America", capital: "Quito", landAreaKm2: 283561, notabilityTier: 1 },
  "818": { iso3: "EGY", name: "Egypt", aliases: [], continent: "Africa", subregion: "Northern Africa", capital: "Cairo", landAreaKm2: 1010408, notabilityTier: 2 },
  "222": { iso3: "SLV", name: "El Salvador", aliases: [], continent: "North America", subregion: "Central America", capital: "San Salvador", landAreaKm2: 21041, notabilityTier: 1 },
  "226": { iso3: "GNQ", name: "Equatorial Guinea", aliases: [], continent: "Africa", subregion: "Middle Africa", capital: "Malabo", landAreaKm2: 28051, notabilityTier: 0 },
  "232": { iso3: "ERI", name: "Eritrea", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Asmara", landAreaKm2: 117600, notabilityTier: 0 },
  "233": { iso3: "EST", name: "Estonia", aliases: [], continent: "Europe", subregion: "Northern Europe", capital: "Tallinn", landAreaKm2: 45227, notabilityTier: 1 },
  "748": { iso3: "SWZ", name: "Eswatini", aliases: ["Swaziland"], continent: "Africa", subregion: "Southern Africa", capital: "Mbabane", capitalAlternates: ["Lobamba"], landAreaKm2: 17364, notabilityTier: 0 },
  "231": { iso3: "ETH", name: "Ethiopia", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Addis Ababa", landAreaKm2: 1104300, notabilityTier: 1 },
  "238": { iso3: "FLK", name: "Falkland Islands", aliases: ["Malvinas"], continent: "South America", subregion: "South America", capital: "Stanley", landAreaKm2: 12173, notabilityTier: 0 },
  "242": { iso3: "FJI", name: "Fiji", aliases: [], continent: "Oceania", subregion: "Melanesia", capital: "Suva", landAreaKm2: 18272, notabilityTier: 1 },
  "246": { iso3: "FIN", name: "Finland", aliases: [], continent: "Europe", subregion: "Northern Europe", capital: "Helsinki", landAreaKm2: 338424, notabilityTier: 2 },
  "250": { iso3: "FRA", name: "France", aliases: ["French Republic"], continent: "Europe", subregion: "Western Europe", capital: "Paris", landAreaKm2: 551695, notabilityTier: 2 },
  "254": { iso3: "GUF", name: "French Guiana", aliases: ["Guyane", "Guyane française", "French Guyana"], continent: "South America", subregion: "South America", capital: "Cayenne", landAreaKm2: 83534, notabilityTier: 0 },
  "260": { iso3: "ATF", name: "French Southern Territories", aliases: [], continent: "Antarctica", subregion: "Antarctica", capital: null, landAreaKm2: 7747, notabilityTier: 0 },
  "266": { iso3: "GAB", name: "Gabon", aliases: [], continent: "Africa", subregion: "Middle Africa", capital: "Libreville", landAreaKm2: 267668, notabilityTier: 0 },
  "270": { iso3: "GMB", name: "Gambia", aliases: ["The Gambia"], continent: "Africa", subregion: "Western Africa", capital: "Banjul", landAreaKm2: 10689, notabilityTier: 0 },
  "268": { iso3: "GEO", name: "Georgia", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Tbilisi", landAreaKm2: 69700, notabilityTier: 1 },
  "276": { iso3: "DEU", name: "Germany", aliases: ["Deutschland"], continent: "Europe", subregion: "Western Europe", capital: "Berlin", landAreaKm2: 357596, notabilityTier: 2 },
  "288": { iso3: "GHA", name: "Ghana", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Accra", landAreaKm2: 238533, notabilityTier: 1 },
  "300": { iso3: "GRC", name: "Greece", aliases: ["Hellas"], continent: "Europe", subregion: "Southern Europe", capital: "Athens", landAreaKm2: 131957, notabilityTier: 2 },
  "304": { iso3: "GRL", name: "Greenland", aliases: [], continent: "North America", subregion: "Northern America", capital: "Nuuk", landAreaKm2: 2166086, notabilityTier: 1 },
  "320": { iso3: "GTM", name: "Guatemala", aliases: [], continent: "North America", subregion: "Central America", capital: "Guatemala City", landAreaKm2: 108889, notabilityTier: 1 },
  "324": { iso3: "GIN", name: "Guinea", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Conakry", landAreaKm2: 245857, notabilityTier: 0 },
  "624": { iso3: "GNB", name: "Guinea-Bissau", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Bissau", landAreaKm2: 36125, notabilityTier: 0 },
  "328": { iso3: "GUY", name: "Guyana", aliases: [], continent: "South America", subregion: "South America", capital: "Georgetown", landAreaKm2: 214969, notabilityTier: 0 },
  "332": { iso3: "HTI", name: "Haiti", aliases: [], continent: "North America", subregion: "Caribbean", capital: "Port-au-Prince", landAreaKm2: 27750, notabilityTier: 1 },
  "340": { iso3: "HND", name: "Honduras", aliases: [], continent: "North America", subregion: "Central America", capital: "Tegucigalpa", landAreaKm2: 112492, notabilityTier: 1 },
  "348": { iso3: "HUN", name: "Hungary", aliases: [], continent: "Europe", subregion: "Eastern Europe", capital: "Budapest", landAreaKm2: 93028, notabilityTier: 2 },
  "352": { iso3: "ISL", name: "Iceland", aliases: [], continent: "Europe", subregion: "Northern Europe", capital: "Reykjavík", landAreaKm2: 103000, notabilityTier: 2 },
  "356": { iso3: "IND", name: "India", aliases: ["Bharat"], continent: "Asia", subregion: "Southern Asia", capital: "New Delhi", landAreaKm2: 3287263, notabilityTier: 2 },
  "360": { iso3: "IDN", name: "Indonesia", aliases: [], continent: "Asia", subregion: "South-eastern Asia", capital: "Jakarta", landAreaKm2: 1904569, notabilityTier: 2 },
  "364": { iso3: "IRN", name: "Iran", aliases: ["Persia"], continent: "Asia", subregion: "Southern Asia", capital: "Tehran", landAreaKm2: 1648195, notabilityTier: 2 },
  "368": { iso3: "IRQ", name: "Iraq", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Baghdad", landAreaKm2: 438317, notabilityTier: 2 },
  "372": { iso3: "IRL", name: "Ireland", aliases: ["Republic of Ireland", "Eire"], continent: "Europe", subregion: "Northern Europe", capital: "Dublin", landAreaKm2: 70273, notabilityTier: 2 },
  "376": { iso3: "ISR", name: "Israel", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Jerusalem", landAreaKm2: 22072, notabilityTier: 2 },
  "380": { iso3: "ITA", name: "Italy", aliases: [], continent: "Europe", subregion: "Southern Europe", capital: "Rome", landAreaKm2: 301340, notabilityTier: 2 },
  "388": { iso3: "JAM", name: "Jamaica", aliases: [], continent: "North America", subregion: "Caribbean", capital: "Kingston", landAreaKm2: 10991, notabilityTier: 1 },
  "392": { iso3: "JPN", name: "Japan", aliases: ["Nippon", "Nihon"], continent: "Asia", subregion: "Eastern Asia", capital: "Tokyo", landAreaKm2: 377975, notabilityTier: 2 },
  "400": { iso3: "JOR", name: "Jordan", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Amman", landAreaKm2: 89342, notabilityTier: 1 },
  "398": { iso3: "KAZ", name: "Kazakhstan", aliases: [], continent: "Asia", subregion: "Central Asia", capital: "Astana", landAreaKm2: 2724900, notabilityTier: 1 },
  "404": { iso3: "KEN", name: "Kenya", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Nairobi", landAreaKm2: 580367, notabilityTier: 2 },
  "414": { iso3: "KWT", name: "Kuwait", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Kuwait City", landAreaKm2: 17818, notabilityTier: 1 },
  "417": { iso3: "KGZ", name: "Kyrgyzstan", aliases: [], continent: "Asia", subregion: "Central Asia", capital: "Bishkek", landAreaKm2: 199951, notabilityTier: 0 },
  "418": { iso3: "LAO", name: "Laos", aliases: [], continent: "Asia", subregion: "South-eastern Asia", capital: "Vientiane", landAreaKm2: 236800, notabilityTier: 0 },
  "428": { iso3: "LVA", name: "Latvia", aliases: [], continent: "Europe", subregion: "Northern Europe", capital: "Riga", landAreaKm2: 64589, notabilityTier: 1 },
  "422": { iso3: "LBN", name: "Lebanon", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Beirut", landAreaKm2: 10452, notabilityTier: 1 },
  "426": { iso3: "LSO", name: "Lesotho", aliases: [], continent: "Africa", subregion: "Southern Africa", capital: "Maseru", landAreaKm2: 30355, notabilityTier: 0 },
  "430": { iso3: "LBR", name: "Liberia", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Monrovia", landAreaKm2: 111369, notabilityTier: 0 },
  "434": { iso3: "LBY", name: "Libya", aliases: [], continent: "Africa", subregion: "Northern Africa", capital: "Tripoli", landAreaKm2: 1759540, notabilityTier: 1 },
  "440": { iso3: "LTU", name: "Lithuania", aliases: [], continent: "Europe", subregion: "Northern Europe", capital: "Vilnius", landAreaKm2: 65300, notabilityTier: 1 },
  "442": { iso3: "LUX", name: "Luxembourg", aliases: [], continent: "Europe", subregion: "Western Europe", capital: "Luxembourg", landAreaKm2: 2586, notabilityTier: 1 },
  "450": { iso3: "MDG", name: "Madagascar", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Antananarivo", landAreaKm2: 587041, notabilityTier: 2 },
  "454": { iso3: "MWI", name: "Malawi", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Lilongwe", landAreaKm2: 118484, notabilityTier: 0 },
  "458": { iso3: "MYS", name: "Malaysia", aliases: [], continent: "Asia", subregion: "South-eastern Asia", capital: "Kuala Lumpur", landAreaKm2: 330803, notabilityTier: 1 },
  "466": { iso3: "MLI", name: "Mali", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Bamako", landAreaKm2: 1240192, notabilityTier: 0 },
  "478": { iso3: "MRT", name: "Mauritania", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Nouakchott", landAreaKm2: 1030700, notabilityTier: 0 },
  "484": { iso3: "MEX", name: "Mexico", aliases: [], continent: "North America", subregion: "Central America", capital: "Mexico City", landAreaKm2: 1964375, notabilityTier: 2 },
  "498": { iso3: "MDA", name: "Moldova", aliases: [], continent: "Europe", subregion: "Eastern Europe", capital: "Chișinău", landAreaKm2: 33846, notabilityTier: 0 },
  "496": { iso3: "MNG", name: "Mongolia", aliases: [], continent: "Asia", subregion: "Eastern Asia", capital: "Ulaanbaatar", landAreaKm2: 1564110, notabilityTier: 1 },
  "499": { iso3: "MNE", name: "Montenegro", aliases: [], continent: "Europe", subregion: "Southern Europe", capital: "Podgorica", landAreaKm2: 13812, notabilityTier: 0 },
  "504": { iso3: "MAR", name: "Morocco", aliases: [], continent: "Africa", subregion: "Northern Africa", capital: "Rabat", landAreaKm2: 446550, notabilityTier: 2 },
  "508": { iso3: "MOZ", name: "Mozambique", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Maputo", landAreaKm2: 801590, notabilityTier: 1 },
  "104": { iso3: "MMR", name: "Myanmar", aliases: ["Burma"], continent: "Asia", subregion: "South-eastern Asia", capital: "Naypyidaw", landAreaKm2: 676578, notabilityTier: 1 },
  "516": { iso3: "NAM", name: "Namibia", aliases: [], continent: "Africa", subregion: "Southern Africa", capital: "Windhoek", landAreaKm2: 825615, notabilityTier: 1 },
  "524": { iso3: "NPL", name: "Nepal", aliases: [], continent: "Asia", subregion: "Southern Asia", capital: "Kathmandu", landAreaKm2: 147181, notabilityTier: 1 },
  "528": { iso3: "NLD", name: "Netherlands", aliases: ["The Netherlands", "Holland"], continent: "Europe", subregion: "Western Europe", capital: "Amsterdam", capitalAlternates: ["The Hague"], landAreaKm2: 41850, notabilityTier: 2 },
  "540": { iso3: "NCL", name: "New Caledonia", aliases: [], continent: "Oceania", subregion: "Melanesia", capital: "Nouméa", landAreaKm2: 18575, notabilityTier: 0 },
  "554": { iso3: "NZL", name: "New Zealand", aliases: ["Aotearoa"], continent: "Oceania", subregion: "Australia and New Zealand", capital: "Wellington", landAreaKm2: 268021, notabilityTier: 2 },
  "558": { iso3: "NIC", name: "Nicaragua", aliases: [], continent: "North America", subregion: "Central America", capital: "Managua", landAreaKm2: 130373, notabilityTier: 1 },
  "562": { iso3: "NER", name: "Niger", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Niamey", landAreaKm2: 1267000, notabilityTier: 0 },
  "566": { iso3: "NGA", name: "Nigeria", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Abuja", landAreaKm2: 923768, notabilityTier: 2 },
  "408": { iso3: "PRK", name: "North Korea", aliases: ["Democratic People's Republic of Korea", "DPRK"], continent: "Asia", subregion: "Eastern Asia", capital: "Pyongyang", landAreaKm2: 120538, notabilityTier: 2 },
  "807": { iso3: "MKD", name: "North Macedonia", aliases: ["Macedonia", "FYROM"], continent: "Europe", subregion: "Southern Europe", capital: "Skopje", landAreaKm2: 25713, notabilityTier: 0 },
  "578": { iso3: "NOR", name: "Norway", aliases: [], continent: "Europe", subregion: "Northern Europe", capital: "Oslo", landAreaKm2: 385207, notabilityTier: 2 },
  "512": { iso3: "OMN", name: "Oman", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Muscat", landAreaKm2: 309500, notabilityTier: 1 },
  "586": { iso3: "PAK", name: "Pakistan", aliases: [], continent: "Asia", subregion: "Southern Asia", capital: "Islamabad", landAreaKm2: 881913, notabilityTier: 2 },
  "591": { iso3: "PAN", name: "Panama", aliases: [], continent: "North America", subregion: "Central America", capital: "Panama City", landAreaKm2: 75417, notabilityTier: 1 },
  "275": { iso3: "PSE", name: "Palestine", aliases: ["Palestinian Territories", "State of Palestine"], continent: "Asia", subregion: "Western Asia", capital: "Ramallah", landAreaKm2: 6020, notabilityTier: 2 },
  "598": { iso3: "PNG", name: "Papua New Guinea", aliases: [], continent: "Oceania", subregion: "Melanesia", capital: "Port Moresby", landAreaKm2: 462840, notabilityTier: 1 },
  "600": { iso3: "PRY", name: "Paraguay", aliases: [], continent: "South America", subregion: "South America", capital: "Asunción", landAreaKm2: 406752, notabilityTier: 1 },
  "604": { iso3: "PER", name: "Peru", aliases: [], continent: "South America", subregion: "South America", capital: "Lima", landAreaKm2: 1285216, notabilityTier: 2 },
  "608": { iso3: "PHL", name: "Philippines", aliases: ["The Philippines"], continent: "Asia", subregion: "South-eastern Asia", capital: "Manila", landAreaKm2: 300000, notabilityTier: 2 },
  "616": { iso3: "POL", name: "Poland", aliases: [], continent: "Europe", subregion: "Eastern Europe", capital: "Warsaw", landAreaKm2: 312696, notabilityTier: 2 },
  "620": { iso3: "PRT", name: "Portugal", aliases: [], continent: "Europe", subregion: "Southern Europe", capital: "Lisbon", landAreaKm2: 92212, notabilityTier: 2 },
  "630": { iso3: "PRI", name: "Puerto Rico", aliases: [], continent: "North America", subregion: "Caribbean", capital: "San Juan", landAreaKm2: 9104, notabilityTier: 1 },
  "634": { iso3: "QAT", name: "Qatar", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Doha", landAreaKm2: 11586, notabilityTier: 2 },
  "642": { iso3: "ROU", name: "Romania", aliases: [], continent: "Europe", subregion: "Eastern Europe", capital: "Bucharest", landAreaKm2: 238397, notabilityTier: 1 },
  "643": { iso3: "RUS", name: "Russia", aliases: ["Russian Federation"], continent: "Europe", subregion: "Eastern Europe", capital: "Moscow", landAreaKm2: 17098246, notabilityTier: 2 },
  "646": { iso3: "RWA", name: "Rwanda", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Kigali", landAreaKm2: 26338, notabilityTier: 1 },
  "682": { iso3: "SAU", name: "Saudi Arabia", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Riyadh", landAreaKm2: 2149690, notabilityTier: 2 },
  "686": { iso3: "SEN", name: "Senegal", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Dakar", landAreaKm2: 196722, notabilityTier: 1 },
  "688": { iso3: "SRB", name: "Serbia", aliases: [], continent: "Europe", subregion: "Southern Europe", capital: "Belgrade", landAreaKm2: 88361, notabilityTier: 1 },
  "694": { iso3: "SLE", name: "Sierra Leone", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Freetown", landAreaKm2: 71740, notabilityTier: 0 },
  "703": { iso3: "SVK", name: "Slovakia", aliases: [], continent: "Europe", subregion: "Eastern Europe", capital: "Bratislava", landAreaKm2: 49035, notabilityTier: 1 },
  "705": { iso3: "SVN", name: "Slovenia", aliases: [], continent: "Europe", subregion: "Southern Europe", capital: "Ljubljana", landAreaKm2: 20273, notabilityTier: 1 },
  "090": { iso3: "SLB", name: "Solomon Islands", aliases: [], continent: "Oceania", subregion: "Melanesia", capital: "Honiara", landAreaKm2: 28896, notabilityTier: 0 },
  "706": { iso3: "SOM", name: "Somalia", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Mogadishu", landAreaKm2: 637657, notabilityTier: 1 },
  "710": { iso3: "ZAF", name: "South Africa", aliases: ["RSA"], continent: "Africa", subregion: "Southern Africa", capital: "Pretoria", capitalAlternates: ["Cape Town", "Bloemfontein"], landAreaKm2: 1221037, notabilityTier: 2 },
  "410": { iso3: "KOR", name: "South Korea", aliases: ["Republic of Korea", "ROK"], continent: "Asia", subregion: "Eastern Asia", capital: "Seoul", landAreaKm2: 100210, notabilityTier: 2 },
  "728": { iso3: "SSD", name: "South Sudan", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Juba", landAreaKm2: 644329, notabilityTier: 1 },
  "724": { iso3: "ESP", name: "Spain", aliases: ["España"], continent: "Europe", subregion: "Southern Europe", capital: "Madrid", landAreaKm2: 505990, notabilityTier: 2 },
  "144": { iso3: "LKA", name: "Sri Lanka", aliases: [], continent: "Asia", subregion: "Southern Asia", capital: "Colombo", capitalAlternates: ["Sri Jayawardenepura Kotte"], landAreaKm2: 65610, notabilityTier: 1 },
  "729": { iso3: "SDN", name: "Sudan", aliases: [], continent: "Africa", subregion: "Northern Africa", capital: "Khartoum", landAreaKm2: 1861484, notabilityTier: 1 },
  "740": { iso3: "SUR", name: "Suriname", aliases: [], continent: "South America", subregion: "South America", capital: "Paramaribo", landAreaKm2: 163820, notabilityTier: 0 },
  "752": { iso3: "SWE", name: "Sweden", aliases: ["Sverige"], continent: "Europe", subregion: "Northern Europe", capital: "Stockholm", landAreaKm2: 450295, notabilityTier: 2 },
  "756": { iso3: "CHE", name: "Switzerland", aliases: [], continent: "Europe", subregion: "Western Europe", capital: "Bern", landAreaKm2: 41277, notabilityTier: 2 },
  "760": { iso3: "SYR", name: "Syria", aliases: ["Syrian Arab Republic"], continent: "Asia", subregion: "Western Asia", capital: "Damascus", landAreaKm2: 185180, notabilityTier: 2 },
  "158": { iso3: "TWN", name: "Taiwan", aliases: ["Republic of China", "ROC"], continent: "Asia", subregion: "Eastern Asia", capital: "Taipei", landAreaKm2: 36193, notabilityTier: 2 },
  "762": { iso3: "TJK", name: "Tajikistan", aliases: [], continent: "Asia", subregion: "Central Asia", capital: "Dushanbe", landAreaKm2: 143100, notabilityTier: 0 },
  "834": { iso3: "TZA", name: "Tanzania", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Dodoma", landAreaKm2: 945087, notabilityTier: 1 },
  "764": { iso3: "THA", name: "Thailand", aliases: [], continent: "Asia", subregion: "South-eastern Asia", capital: "Bangkok", landAreaKm2: 513120, notabilityTier: 2 },
  "626": { iso3: "TLS", name: "Timor-Leste", aliases: ["East Timor"], continent: "Asia", subregion: "South-eastern Asia", capital: "Dili", landAreaKm2: 14874, notabilityTier: 0 },
  "768": { iso3: "TGO", name: "Togo", aliases: [], continent: "Africa", subregion: "Western Africa", capital: "Lomé", landAreaKm2: 56785, notabilityTier: 0 },
  "780": { iso3: "TTO", name: "Trinidad and Tobago", aliases: [], continent: "North America", subregion: "Caribbean", capital: "Port of Spain", landAreaKm2: 5131, notabilityTier: 1 },
  "788": { iso3: "TUN", name: "Tunisia", aliases: [], continent: "Africa", subregion: "Northern Africa", capital: "Tunis", landAreaKm2: 163610, notabilityTier: 1 },
  "792": { iso3: "TUR", name: "Turkey", aliases: ["Türkiye"], continent: "Asia", subregion: "Western Asia", capital: "Ankara", landAreaKm2: 783562, notabilityTier: 2 },
  "795": { iso3: "TKM", name: "Turkmenistan", aliases: [], continent: "Asia", subregion: "Central Asia", capital: "Ashgabat", landAreaKm2: 488100, notabilityTier: 0 },
  "800": { iso3: "UGA", name: "Uganda", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Kampala", landAreaKm2: 241551, notabilityTier: 1 },
  "804": { iso3: "UKR", name: "Ukraine", aliases: [], continent: "Europe", subregion: "Eastern Europe", capital: "Kyiv", landAreaKm2: 603550, notabilityTier: 2 },
  "784": { iso3: "ARE", name: "United Arab Emirates", aliases: ["UAE", "Emirates"], continent: "Asia", subregion: "Western Asia", capital: "Abu Dhabi", landAreaKm2: 83600, notabilityTier: 2 },
  "826": { iso3: "GBR", name: "United Kingdom", aliases: ["UK", "Britain", "Great Britain", "England"], continent: "Europe", subregion: "Northern Europe", capital: "London", landAreaKm2: 243610, notabilityTier: 2 },
  "840": { iso3: "USA", name: "United States", aliases: ["USA", "US", "America", "United States of America"], continent: "North America", subregion: "Northern America", capital: "Washington, D.C.", landAreaKm2: 9833520, notabilityTier: 2 },
  "858": { iso3: "URY", name: "Uruguay", aliases: [], continent: "South America", subregion: "South America", capital: "Montevideo", landAreaKm2: 176215, notabilityTier: 1 },
  "860": { iso3: "UZB", name: "Uzbekistan", aliases: [], continent: "Asia", subregion: "Central Asia", capital: "Tashkent", landAreaKm2: 447400, notabilityTier: 0 },
  "548": { iso3: "VUT", name: "Vanuatu", aliases: [], continent: "Oceania", subregion: "Melanesia", capital: "Port Vila", landAreaKm2: 12189, notabilityTier: 0 },
  "862": { iso3: "VEN", name: "Venezuela", aliases: [], continent: "South America", subregion: "South America", capital: "Caracas", landAreaKm2: 916445, notabilityTier: 2 },
  "704": { iso3: "VNM", name: "Vietnam", aliases: ["Viet Nam"], continent: "Asia", subregion: "South-eastern Asia", capital: "Hanoi", landAreaKm2: 331212, notabilityTier: 2 },
  "732": { iso3: "ESH", name: "Western Sahara", aliases: [], continent: "Africa", subregion: "Northern Africa", capital: "El Aaiún", landAreaKm2: 266000, notabilityTier: 0 },
  "887": { iso3: "YEM", name: "Yemen", aliases: [], continent: "Asia", subregion: "Western Asia", capital: "Sana'a", landAreaKm2: 527968, notabilityTier: 1 },
  "894": { iso3: "ZMB", name: "Zambia", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Lusaka", landAreaKm2: 752618, notabilityTier: 1 },
  "716": { iso3: "ZWE", name: "Zimbabwe", aliases: [], continent: "Africa", subregion: "Eastern Africa", capital: "Harare", landAreaKm2: 390757, notabilityTier: 1 },

  // Partially-recognized territories — keyed by synthetic numeric (900–999
  // user-assigned range), iso3 in user-assigned XAA–XZZ range. These features
  // have no `id` in world-atlas, so the build matches them by `topoName`.
  "901": { iso3: "XKX", name: "Kosovo", aliases: ["Republic of Kosovo"], continent: "Europe", subregion: "Southern Europe", capital: "Pristina", landAreaKm2: 10887, notabilityTier: 1, topoName: "Kosovo" },
  "902": { iso3: "XNC", name: "Northern Cyprus", aliases: ["N. Cyprus", "Turkish Republic of Northern Cyprus", "TRNC"], continent: "Asia", subregion: "Western Asia", capital: "North Nicosia", landAreaKm2: 3355, notabilityTier: 0, topoName: "N. Cyprus" },
  "903": { iso3: "XSL", name: "Somaliland", aliases: ["Republic of Somaliland"], continent: "Africa", subregion: "Eastern Africa", capital: "Hargeisa", landAreaKm2: 176120, notabilityTier: 0, topoName: "Somaliland" },
};

// landAreaKm2 → sizeTier. Buckets are log-scale enough to be useful without
// over-fitting: tier 0 ≈ microstate/small island; tier 1 ≈ mid (e.g. Cuba,
// Greece); tier 2 ≈ large (France, Spain, Thailand); tier 3 ≈ giant (Russia,
// Canada, USA, China, Brazil, Australia, India, Argentina, Kazakhstan).
function bucketSizeTier(landAreaKm2) {
  if (landAreaKm2 < 50_000) return 0;
  if (landAreaKm2 < 500_000) return 1;
  if (landAreaKm2 < 2_000_000) return 2;
  return 3;
}

const topology = JSON.parse(
  await readFile(resolve(root, "src/data/world-110m.json"), "utf8"),
);

const geometries = topology.objects.countries.geometries;
const topologyIds = new Set(
  geometries.map((g) => g.id).filter((id) => typeof id === "string"),
);
const topologyNames = new Set(
  geometries
    .filter((g) => typeof g.id !== "string")
    .map((g) => g.properties?.name)
    .filter((n) => typeof n === "string"),
);

// Sanity-check the table before matching: malformed entries are easy to
// introduce and silently produce a broken build.
const errors = [];
const seenIso3 = new Set();
for (const [numeric, info] of Object.entries(COUNTRIES)) {
  const tag = `${numeric} ${info.iso3} ${info.name}`;
  if (info.topoName) {
    if (topologyIds.has(numeric)) {
      errors.push(`${tag}: has topoName but ${numeric} is also a real ISO numeric in the topology — drop topoName.`);
    }
    if (!/^9\d\d$/.test(numeric)) {
      errors.push(`${tag}: topoName entries must use a synthetic numeric in 900–999.`);
    }
  }
  if (seenIso3.has(info.iso3)) {
    errors.push(`Duplicate iso3 ${info.iso3} (${info.name})`);
  }
  seenIso3.add(info.iso3);

  if (info.capital !== null && (typeof info.capital !== "string" || info.capital.length === 0)) {
    errors.push(`${tag}: capital must be a non-empty string or null.`);
  }
  if (info.capitalAlternates !== undefined) {
    if (!Array.isArray(info.capitalAlternates)) {
      errors.push(`${tag}: capitalAlternates must be an array of strings.`);
    } else {
      if (info.capital === null) {
        errors.push(`${tag}: capitalAlternates makes no sense when capital is null.`);
      }
      const seen = new Set();
      for (const alt of info.capitalAlternates) {
        if (typeof alt !== "string" || alt.length === 0) {
          errors.push(`${tag}: each capitalAlternates entry must be a non-empty string.`);
          continue;
        }
        if (alt === info.capital) {
          errors.push(`${tag}: capitalAlternates duplicates the primary capital ${JSON.stringify(alt)}.`);
        }
        if (seen.has(alt)) {
          errors.push(`${tag}: capitalAlternates has duplicate ${JSON.stringify(alt)}.`);
        }
        seen.add(alt);
      }
    }
  }
  if (!VALID_SUBREGIONS.has(info.subregion)) {
    errors.push(`${tag}: subregion ${JSON.stringify(info.subregion)} is not a valid UN M49 subregion.`);
  }
  if (typeof info.landAreaKm2 !== "number" || !(info.landAreaKm2 > 0)) {
    errors.push(`${tag}: landAreaKm2 must be a positive number.`);
  }
  if (![0, 1, 2].includes(info.notabilityTier)) {
    errors.push(`${tag}: notabilityTier must be 0, 1, or 2.`);
  }
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
for (const g of geometries) {
  if (typeof g.id === "string") {
    if (!COUNTRIES[g.id]) orphans.push({ id: g.id, name: g.properties?.name });
  } else if (!claimedTopoNames.has(g.properties?.name)) {
    orphans.push({ id: "(no id)", name: g.properties?.name });
  }
}

// Compute land-adjacency from the topology via shared-arc detection.
// topojson-client's neighbors(geometries) returns arrays of indexes into the
// original geometries array; we map those back to iso3 via the same matching
// logic used above (numeric id or topoName).
const iso3ByGeomIndex = new Map();
for (let i = 0; i < geometries.length; i++) {
  const g = geometries[i];
  if (typeof g.id === "string") {
    const info = COUNTRIES[g.id];
    if (info) iso3ByGeomIndex.set(i, info.iso3);
  } else {
    const name = g.properties?.name;
    const m = matched.find((x) => x.topoName === name);
    if (m) iso3ByGeomIndex.set(i, m.iso3);
  }
}
const adjacency = topoNeighbors(geometries);
const neighborsByIso3 = new Map();
for (let i = 0; i < geometries.length; i++) {
  const iso3 = iso3ByGeomIndex.get(i);
  if (!iso3) continue;
  const ns = adjacency[i]
    .map((j) => iso3ByGeomIndex.get(j))
    .filter((x) => typeof x === "string");
  // De-duplicate and sort for a stable JSON diff.
  neighborsByIso3.set(iso3, [...new Set(ns)].sort());
}

// Final assembly: apply per-entry override if set, drop build-only fields,
// and derive sizeTier.
const matchedIso3s = new Set(matched.map((m) => m.iso3));
const neighborResolutionErrors = [];
const finalEntries = matched.map((m) => {
  // Always sorted (iso3-alphabetical) for stable JSON diffs regardless of
  // whether neighbors came from the topology or a hand override. Display
  // order in the UI is a separate concern handled at render time.
  const rawNeighbors = m.neighborsOverride
    ? [...m.neighborsOverride].sort()
    : neighborsByIso3.get(m.iso3) ?? [];
  for (const n of rawNeighbors) {
    if (!matchedIso3s.has(n)) {
      neighborResolutionErrors.push(
        `${m.iso3} ${m.name}: neighbor ${JSON.stringify(n)} does not resolve to a matched country.`,
      );
    }
  }
  // Strip build-only fields. `landAreaKm2` is bucketed; `neighborsOverride`
  // is consumed above. `capitalAlternates` is only emitted when non-empty
  // so the 190+ single-capital rows don't carry a noisy `[]`.
  const { landAreaKm2, neighborsOverride: _override, capitalAlternates, ...rest } = m;
  return {
    ...rest,
    sizeTier: bucketSizeTier(landAreaKm2),
    neighbors: rawNeighbors,
    ...(capitalAlternates && capitalAlternates.length > 0
      ? { capitalAlternates }
      : {}),
  };
});
if (neighborResolutionErrors.length > 0) {
  console.error("Neighbor resolution failures:");
  for (const e of neighborResolutionErrors) console.error(`  ${e}`);
  process.exit(1);
}

// Symmetry check — log mismatches as warnings (don't fail). A and B should
// mutually list each other; mismatches usually indicate a topology arc
// quirk or an override worth a comment.
const neighborSets = new Map(
  finalEntries.map((e) => [e.iso3, new Set(e.neighbors)]),
);
const asymmetries = [];
for (const [iso3, ns] of neighborSets) {
  for (const n of ns) {
    const back = neighborSets.get(n);
    if (back && !back.has(iso3)) {
      asymmetries.push(`${iso3} lists ${n} but ${n} does not list ${iso3}`);
    }
  }
}

await mkdir(resolve(root, "src/data"), { recursive: true });
await writeFile(
  resolve(root, "src/data/countries.json"),
  JSON.stringify(finalEntries, null, 2) + "\n",
);

console.log(`Wrote ${finalEntries.length} countries to src/data/countries.json`);
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
if (asymmetries.length > 0) {
  console.log(
    `\nAsymmetric neighbor relationships (informational, not fatal):`,
  );
  for (const a of asymmetries) console.log(`  ${a}`);
}
