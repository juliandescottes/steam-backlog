// HLTB lookup for your Steam collection. Paste into the DevTools console on https://howlongtobeat.com
// It searches each game, then downloads hltb_results.json to your Downloads folder.
(async () => {
const GAMES = [[316610, "A Good Snowman Is Hard To Build"], [1052990, "A Monster's Expedition"], [603530, "A Robot Named Fight!"], [1201270, "A Space for the Unbound"], [207650, "A Virus Named TOM"], [2180700, "ABI-DOS"], [502500, "ACE COMBAT™ 7: SKIES UNKNOWN"], [1271400, "Adios"], [1336490, "Against the Storm"], [221380, "Age of Empires II (Retired)"], [226840, "Age of Wonders III"], [40400, "AI War: Fleet Command"], [10680, "Aliens vs. Predator™"], [34010, "Alpha Protocol™"], [673130, "AMID EVIL"], [239200, "Amnesia: A Machine for Pigs"], [57300, "Amnesia: The Dark Descent"], [1902490, "Aperture Desk Job"], [1390190, "APICO"], [2763670, "Arctic Eggs"], [582160, "Assassin's Creed® Origins"], [207670, "AVSEQ"], [35140, "Batman: Arkham Asylum Game of the Year Edition"], [200260, "Batman: Arkham City - Game of the Year Edition"], [208650, "Batman™: Arkham Knight"], [2323580, "Before The Green Moon"], [960990, "Beyond: Two Souls"], [409720, "BioShock™ 2 Remastered"], [1138660, "Black Book"], [236930, "Blackwell Epiphany"], [358190, "Blake Stone: Aliens of Gold"], [2114740, "Blasphemous 2"], [1010750, "Blood™ Fresh Supply"], [1353230, "Bomb Rush Cyberfunk"], [1147890, "Bonfire Peaks"], [397540, "Borderlands 3"], [2019810, "Boxes: Lost Fragments"], [107300, "Breath of Death VII"], [757480, "Broken Reality"], [225080, "Brothers - A Tale of Two Sons"], [2835570, "Buckshot Roulette"], [1042490, "Call of the Sea"], [1695620, "CHR$(143)"], [746850, "Cloudpunk"], [1213210, "Command & Conquer™ Remastered Collection"], [6830, "Commandos 2: Men of Courage"], [6840, "Commandos 3: Destination Berlin"], [6800, "Commandos: Behind Enemy Lines"], [6810, "Commandos: Beyond the Call of Duty"], [870780, "CONTROL Ultimate Edition"], [1924430, "Cookie Cutter: Overkill Edition"], [583270, "Cosmic Express"], [107310, "Cthulhu Saves the World"], [3048140, "Daemonologie"], [211420, "DARK SOULS™: Prepare To Die™ Edition"], [858810, "Dawn of Man"], [1259420, "Days Gone"], [45770, "Dead Rising 2: Off the Record"], [265550, "Dead Rising 3 Apocalypse Edition"], [45740, "Dead Rising® 2"], [1693980, "Dead Space"], [1166290, "Death and Taxes"], [1520, "DEFCON"], [1345890, "Deliver Us Mars"], [1222140, "Detroit: Become Human"], [6920, "Deus Ex: Invisible War"], [337000, "Deus Ex: Mankind Divided"], [1272320, "Diplomacy is Not an Option"], [403640, "Dishonored 2"], [220440, "DmC: Devil May Cry"], [1964040, "Do Not Feed the Monkeys 2099"], [702670, "Donut County"], [782330, "DOOM Eternal"], [2300, "DOOM II"], [1272840, "Dordogne"], [1562430, "DREDGE"], [249050, "Dungeon of the ENDLESS™"], [1983260, "Dungeons of Hinterberg"], [236090, "Dust: An Elysian Tail"], [91700, "E.Y.E: Divine Cybermancy"], [214550, "Eets Munchies"], [1654660, "En Garde!"], [898890, "Endling - Extinction is Forever"], [255340, "Escape Goat 2"], [227300, "Euro Truck Simulator 2"], [33680, "eversion"], [2290, "Final DOOM"], [377840, "FINAL FANTASY IX"], [39150, "FINAL FANTASY VIII"], [359870, "FINAL FANTASY X/X-2 HD Remaster"], [668980, "Forsaken Remastered"], [1931730, "Fort Solis"], [8880, "Freedom Force"], [8890, "Freedom Force vs. the Third Reich"], [1601580, "Frostpunk 2"], [228360, "Full Throttle Remastered"], [285900, "Gang Beasts"], [735290, "Genesis Noir"], [1475810, "Ghostwire: Tokyo"], [9500, "Gish"], [1150760, "Gloomwood"], [290510, "GNOG"], [1593500, "God of War"], [12250, "Grand Theft Auto: San Andreas"], [323320, "Grow Home"], [92220, "GundeadliGne"], [92200, "Gundemonium Recollection"], [206190, "Gunpoint"], [239070, "Hammerwatch"], [340000, "Headlander"], [269210, "Hero Siege"], [703320, "Hidden & Dangerous 2: Courage Under Fire"], [1659040, "HITMAN World of Assassination"], [203140, "Hitman: Absolution™"], [92210, "Hitogata Happa"], [244160, "Homeworld Remastered Collection"], [367580, "Hook"], [2420110, "Horizon Forbidden West™ Complete Edition"], [274170, "Hotline Miami 2: Wrong Number"], [383270, "Hue"], [6010, "Indiana Jones® and the Fate of Atlantis™"], [32310, "Indiana Jones® and the Last Crusade™"], [9740, "Indigo Prophecy"], [104100, "Inside a Star-filled Sky"], [1669420, "Islets"], [638230, "Journey"], [848350, "Katamari Damacy REROLL"], [24400, "King Arthur - The Role-playing Wargame"], [3170, "King's Bounty: Armored Princess"], [379430, "Kingdom Come: Deliverance"], [3126330, "Kiosk"], [499440, "klocki"], [365160, "Kona"], [110800, "L.A. Noire"], [1364100, "Lacuna – A Sci-Fi Noir Adventure"], [1118240, "Lake"], [635320, "Last Day of June"], [2521380, "Legacy of Kain™ Soul Reaver 1&2 Remastered"], [532210, "Life is Strange 2"], [936790, "Life is Strange: True Colors"], [2207440, "LOK Digital"], [209830, "Lone Survivor: The Director's Cut"], [1742930, "Looking Up I See Only A Ceiling"], [32340, "LOOM™"], [1282730, "Loop Hero"], [1328840, "Lost in Play"], [1902960, "Lost Records: Bloom & Rage"], [233150, "LUFTRAUSERS"], [1030840, "Mafia: Definitive Edition"], [12130, "Manhunt"], [214560, "Mark of the Ninja"], [1328670, "Mass Effect™ Legendary Edition"], [2794610, "Massacre At The Mirage"], [9160, "Master Levels for Doom II"], [12150, "Max Payne 2: The Fall of Max Payne"], [345260, "Medieval: Total War™ - Collection"], [363440, "Mega Man Legacy Collection"], [495050, "Mega Man Legacy Collection 2"], [743890, "Mega Man X Legacy Collection"], [311340, "METAL GEAR SOLID V: GROUND ZEROES"], [287700, "METAL GEAR SOLID V: THE PHANTOM PAIN"], [250180, "METAL SLUG 3"], [1449560, "Metro Exodus Enhanced Edition"], [287390, "Metro: Last Light Redux"], [1604000, "Milk outside a bag of milk outside a bag of milk"], [609490, "Minit"], [2719060, "Mirage Feathers"], [2582320, "Mixtape"], [113020, "Monaco: What's Yours Is Mine"], [2475490, "Mouthwashing"], [20710, "Mr. Robot"], [1080750, "Mutazione"], [384490, "NECROPOLIS: BRUTAL EDITION"], [1848450, "Nightmare of Decay"], [99700, "NightSky"], [1488490, "Nivalis Nights"], [2676840, "No Case Should Remain Unsolved"], [1147550, "Not For Broadcast"], [15710, "Oddworld: Abe's Exoddus®"], [15700, "Oddworld: Abe's Oddysee®"], [200390, "Oil Rush"], [960690, "One Step From Eden"], [1497360, "Open Roads"], [1335790, "Operation: Tango"], [102600, "Orcs Must Die!"], [1079000, "Ord."], [2259310, "ORDER 13"], [1057090, "Ori and the Will of the Wisps"], [12810, "Overlord II"], [1458140, "Pacific Drive"], [384110, "Pathologic Classic HD"], [22120, "Penumbra: Black Plague Gold Edition"], [22140, "Penumbra: Requiem"], [1678430, "PowerSlave Exhumed"], [788690, "Psychonauts in the Rhombus of Ruin"], [676430, "PUSH"], [1089130, "Quake II RTX"], [722560, "RAD"], [312520, "Rain World"], [242550, "Rayman® Legends"], [2129530, "REANIMAL"], [70400, "Recettear: An Item Shop's Tale"], [667720, "Red Faction Guerrilla Re-Mars-tered"], [617290, "Remnant: From the Ashes"], [952060, "Resident Evil 3"], [21690, "Resident Evil 5"], [221040, "Resident Evil 6"], [222480, "Resident Evil Revelations"], [287290, "Resident Evil Revelations 2"], [1196590, "Resident Evil Village"], [391220, "Rise of the Tomb Raider™"], [1421490, "Rise of the Triad: Ludicrous Edition"], [1466640, "Road 96 🛣️"], [2095340, "Road 96: Mile 0"], [1155970, "Roadwarden"], [215510, "Rocketbirds: Hardboiled Chicken"], [241600, "Rogue Legacy"], [38720, "RUSH"], [302510, "Ryse: Son of Rome"], [757310, "Sable"], [48900, "Saira"], [40720, "Samorost 2"], [202410, "Scoregasm"], [814380, "Sekiro™: Shadows Die Twice - GOTY Edition"], [1227690, "Severed Steel"], [750920, "Shadow of the Tomb Raider: Definitive Edition"], [233130, "Shadow Warrior"], [324800, "Shadow Warrior 2"], [234650, "Shadowrun Returns"], [300550, "Shadowrun: Dragonfall - Director's Cut"], [1281790, "SHEEPO"], [1286580, "Ship of Fools"], [345240, "SHOGUN: Total War™ - Collection"], [1313, "SiN Gold (1998)"], [204880, "Sins of a Solar Empire®: Rebellion"], [1492070, "Sker Ritual"], [290260, "Sokobond"], [1701330, "Sokobond Express"], [71260, "Space Channel 5: Part 2"], [209790, "Splice"], [1172380, "STAR WARS Jedi: Fallen Order™"], [32370, "STAR WARS™ Knights of the Old Republic™"], [208580, "STAR WARS™ Knights of the Old Republic™ II - The Sith Lords™"], [252410, "SteamWorld Dig"], [1332010, "Stray"], [1920780, "Stray Gods: The Roleplaying Musical"], [1962700, "Subnautica 2"], [848450, "Subnautica: Below Zero"], [304650, "SUNLESS SEA"], [44100, "Super Laser  Racer"], [9350, "Supreme Commander"], [9420, "Supreme Commander: Forged Alliance"], [1207650, "Suzerain"], [238210, "System Shock® 2 (1999)"], [1496590, "Tchia"], [1444300, "Teacup"], [234390, "Teleglitch: Die More Edition"], [1180660, "Tell Me Why"], [2530430, "Terror At Oakheart"], [302340, "Tex Murphy: Martian Memorandum"], [302330, "Tex Murphy: Mean Streets"], [302370, "Tex Murphy: Overseer"], [302360, "Tex Murphy: The Pandora Directive"], [1122680, "The Artful Escape"], [845070, "The Awesome Adventures of Captain Spirit"], [204240, "The Bridge"], [67370, "The Darkness II"], [6040, "The Dig®"], [3352300, "The Electrifying Incident: A Monster Mini-Expedition"], [1730590, "The Entropy Centre"], [268050, "The Evil Within"], [2653790, "The Exit 8"], [435530, "The Final Station"], [846110, "The friends of Ringo Ishikawa"], [731040, "The Invincible"], [1783560, "The Last Caretaker"], [764790, "The Messenger"], [40930, "The Misadventures of P.B. Winterbottom"], [1266030, "The Pale Beyond"], [466630, "The Pedestrian"], [67000, "The Polynomial - Space of the music"], [1577120, "The Quarry"], [1297300, "The Shore"], [221910, "The Stanley Parable"], [835960, "The Talos Principle 2"], [1206430, "The Unfinished Swan"], [400430, "The Vanishing of Ethan Carter Redux"], [536220, "The Walking Dead: A New Frontier"], [261030, "The Walking Dead: Season Two"], [866800, "The Walking Dead: The Final Season"], [292030, "The Witcher 3: Wild Hunt — Remastered"], [20900, "The Witcher: Enhanced Edition Director's Cut"], [210970, "The Witness"], [282070, "This War of Mine"], [510620, "THOTH"], [2580020, "THRESHOLD"], [1062090, "Timberborn"], [1307580, "TOEM: A Photo Adventure"], [38700, "Toki Tori"], [2478970, "Tomb Raider I-III Remastered Starring Lara Croft"], [8000, "Tomb Raider: Anniversary"], [272270, "Torment: Tides of Numenera"], [10500, "Total War: EMPIRE – Definitive Edition"], [4700, "Total War: MEDIEVAL II – Definitive Edition"], [34030, "Total War: NAPOLEON – Definitive Edition"], [214950, "Total War: ROME II - Emperor Edition"], [34330, "Total War: SHOGUN 2"], [3838370, "TR-49"], [35720, "Trine 2: Complete Story"], [405830, "Turok 2: Seeds of Evil"], [1996770, "Turok 3: Shadow of Oblivion Remastered"], [304930, "Unturned"], [2600, "Vampire: The Masquerade - Bloodlines"], [211160, "Viking: Battle for Asgard"], [255520, "Viscera Cleanup Detail: Shadow Warrior"], [56400, "Warhammer 40,000: Dawn of War II: Retribution"], [489630, "Warhammer 40,000: Gladius - Relics of War"], [2183900, "Warhammer 40,000: Space Marine 2"], [20570, "Warhammer® 40,000: Dawn of War® II Chaos Rising"], [203630, "Warlock - Master of the Arcane"], [259130, "Wasteland 1 - The Original Classic"], [404730, "Wasteland 2: Director's Cut"], [501300, "What Remains of Edith Finch"], [45300, "Wings of Prey: Special Edition"], [1424330, "Wobbledogs"], [729000, "Wytchwood"], [7660, "X-COM: Apocalypse"], [7770, "X-COM: Enforcer"], [7730, "X-COM: Interceptor"], [7650, "X-COM: Terror From the Deep"], [7760, "X-COM: UFO Defense"], [268500, "XCOM® 2"], [882100, "XCOM®: Chimera Squad"], [1388590, "Yakuza 6: The Song of Life"], [1235140, "Yakuza: Like a Dragon"], [461840, "Zenge"]];
const CONCURRENCY = 1, PAUSE_MS = 1500;
const STORE = "hltbResults";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. Find the search endpoint in the site's own JS (same approach as howlongtobeatpy)
let searchPath = null;
const srcs = [...document.querySelectorAll('script[src*="/_next/static/chunks/"]')].map(s => s.src);
for (const src of srcs) {
  const txt = await fetch(src).then(r => r.text()).catch(() => "");
  const m = txt.match(/fetch\s*\(\s*["'`]\/api\/([a-zA-Z0-9_\/]+)[^"'`]*["'`]\s*,\s*{[^}]*method:\s*["'`]POST["'`][^}]*}/i);
  if (m) { searchPath = "/api/" + m[1].replace(/\/+$/, ""); break; }
}
searchPath = searchPath || "/api/s";
console.log("[hltb] search endpoint:", searchPath);

// 2. Auth token
let auth = null;
async function getAuth() {
  const r = await fetch(`${searchPath}/init?t=${Date.now()}`);
  if (!r.ok) throw new Error("token request failed: " + r.status);
  const j = await r.json(); const a = { token: j.token };
  for (const [k, v] of Object.entries(j)) {
    if (/key/i.test(k)) a.key = v; else if (/val/i.test(k)) a.val = v;
  }
  return a;
}
auth = await getAuth();

// 3. Search
let blocked = false;
class Blocked extends Error {}
async function search(name) {
  const body = {
    searchType: "games", searchTerms: name.split(" ").filter(Boolean), searchPage: 1, size: 20,
    searchOptions: { games: { userId: 0, platform: "", sortCategory: "popular", rangeCategory: "main",
      rangeTime: { min: 0, max: 0 }, gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
      rangeYear: { max: "", min: "" }, modifier: "" },
      users: { sortCategory: "postcount" }, lists: { sortCategory: "follows" }, filter: "", sort: 0, randomizer: 0 },
    useCache: true };
  const headers = { "content-type": "application/json", accept: "*/*" };
  if (auth) {
    if (auth.token) headers["x-auth-token"] = String(auth.token);
    if (auth.key) { headers["x-hp-key"] = String(auth.key); headers["x-hp-val"] = String(auth.val); body[auth.key] = auth.val; }
  }
  let refreshed = false;
  for (let attempt = 0; attempt < 7; attempt++) {
    if (blocked) throw new Blocked();
    const r = await fetch(searchPath, { method: "POST", headers, body: JSON.stringify(body) });
    if (r.ok) return (await r.json()).data || [];
    if (r.status === 401 || r.status === 403) {
      if (refreshed) { blocked = true; throw new Blocked(); }
      refreshed = true;
      await sleep(5000);
      try { auth = await getAuth(); } catch (e) { blocked = true; throw new Blocked(); }
      if (auth.token) headers["x-auth-token"] = String(auth.token);
      if (auth.key) { headers["x-hp-key"] = String(auth.key); headers["x-hp-val"] = String(auth.val); body[auth.key] = auth.val; }
      continue;
    }
    const ra = Number(r.headers.get("retry-after"));
    const wait = ra > 0 ? ra * 1000 : Math.min(120000, 10000 * 2 ** attempt);
    console.log(`[hltb] ${r.status}, waiting ${Math.round(wait / 1000)}s…`);
    await sleep(wait);
  }
  throw new Error("search failed");
}

const norm = s => s.toLowerCase().replace(/[™®©]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
function sim(a, b) {
  a = norm(a); b = norm(b); if (!a || !b) return 0; if (a === b) return 1;
  const m = a.length, n = b.length, d = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { let p = d[0]; d[0] = i;
    for (let j = 1; j <= n; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i-1] === b[j-1] ? 0 : 1)); p = t; } }
  return 1 - d[n] / Math.max(m, n);
}
const EDITION = /\b(definitive|remastered|enhanced|complete|goty|game of the year|director'?s cut|anniversary|special|gold|deluxe|ultimate|collection|edition|starring lara croft)\b/gi;
function variants(name) {
  const clean = name.replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
  const out = [clean, clean.replace(/[:–—-]/g, " ").replace(/\s+/g, " ").trim(),
    clean.replace(EDITION, "").replace(/[:–—-]\s*$/,"").replace(/\s+/g, " ").trim(),
    clean.split(/\s[-–—:]\s|:\s/)[0].trim()];
  return [...new Set(out)].filter(v => v.length > 1);
}
const h = s => s ? Math.round(s / 36) / 100 : null;

async function lookup([appid, name]) {
  for (const q of variants(name)) {
    const data = await search(q);
    if (!data.length) continue;
    let best = data.find(g => String(g.profile_steam) === String(appid));
    let s = best ? 1 : 0;
    if (!best) { for (const g of data) { const v = Math.max(sim(name, g.game_name || ""), sim(q, g.game_name || ""), sim(name, g.game_alias || "")); if (v > s) { s = v; best = g; } } }
    if (best) return { match: best.game_name, id: best.game_id, sim: Math.round(s * 100) / 100, steamMatch: String(best.profile_steam) === String(appid),
      main: h(best.comp_main), main_extra: h(best.comp_plus), completionist: h(best.comp_100) };
  }
  return { match: null };
}

// 4. Run in small parallel batches
let results = {};
try { results = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) {}
const todo = GAMES.filter(g => !results[g[0]] || results[g[0]].error);
console.log(`[hltb] ${GAMES.length - todo.length} already done, ${todo.length} to go`);
let done = 0, i = 0;
async function worker() {
  while (i < todo.length) {
    const g = todo[i++];
    try { results[g[0]] = { name: g[1], ...(await lookup(g)) }; }
    catch (e) { if (e instanceof Blocked) break; results[g[0]] = { name: g[1], error: String(e) }; }
    try { localStorage.setItem(STORE, JSON.stringify(results)); } catch (e) {}
    if (++done % 10 === 0 || done === todo.length) console.log(`[hltb] ${done}/${todo.length}`);
    await sleep(PAUSE_MS);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
window.hltbResults = results;
if (blocked) {
  const n = GAMES.filter(g => results[g[0]] && !results[g[0]].error).length;
  console.log(`[hltb] HLTB refused requests (403) and the script stopped. ${n}/${GAMES.length} saved. Reload the page, wait 10 minutes or so, then paste the script again to continue.`);
  return;
}
const failed = Object.values(results).filter(r => r.error).length;
if (failed) console.log(`[hltb] ${failed} lookups still failed; paste the script again later to retry just those.`);
const found = Object.values(results).filter(r => r.main_extra).length;
console.log(`[hltb] done: ${found}/${GAMES.length} with a Main + Extras time. Downloading hltb_results.json…`);
const a = document.createElement("a");
a.href = URL.createObjectURL(new Blob([JSON.stringify(results, null, 1)], { type: "application/json" }));
a.download = "hltb_results.json"; document.body.appendChild(a); a.click(); a.remove();
})();
