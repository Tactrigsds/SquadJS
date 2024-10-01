
const factionMap = new Map([
  ["United States Army", "USA"],
  ["United States Marine Corps", "USMC"],
  ["Turkish Land Forces", "TLF"],
  ["Russian Ground Forces", "RGF"],
  ["People’s Liberation Army Navy Marine Corps", "PLANMC"],
  ["PLA Navy Marine Corps", "PLANMC"],
  ["People’s Liberation Army Amphibious Ground Force", "PLAAGF"],
  ["PLA Amphibious Ground Forces", "PLAAGF"],
  ["People's Liberation Army", "PLA"],
  ["Canadian Armed Forces", "CAF"],
  ["Insurgent Forces", "INS"],
  ["Irregular Militia Forces", "IMF"],
  ["Russian Airborne Forces", "VDV"],
  ["Middle Eastern Alliance", "MEA"],
  ["British Armed Forces", "BAF"],
  ["Australian Defence Force", "ADF"],
  ["Western Private Military Contractors", "WPMC"]
])

const subfactionAbbreviations = new Map([
  ["Motorized", "Motor"],
  ["AirAssault", "Air"],
  ["Armored", "Armor"],
  ["CombinedArms", "CmbArm"],
  ["Support", "Supp"],
  ["LightInfantry", "Inf"],
  ["Mechanized", "Mech"],
])

const alliances = [
  {alliance: 'INDEPENDENT', factions: ['TLF', 'MEA', 'TLF', 'IMF']},
  {alliance: 'BLUEFOR', factions: ['ADF', 'BAF', 'CAF', 'USA', 'USMC']},
  {alliance: 'REDFOR', factions: ['RGF', 'VDV']},
  {alliance: 'PAC', factions: ['PLA', 'PLAAGF', 'PLANMC']},
]

const factionGroups = Object.freeze([
  [
      'PLA',
      'PLAAGF',
      'PLANMC'
  ]
])


const factionData = `
Faction,Subfaction,FullName
ADF,AirAssault,"3rd Battalion, Royal Australian Regiment"
ADF,CombinedArms,"3rd Brigade Battle Group"
ADF,Mechanized,"1st Battalion, Royal Australian Regiment"
BAF,AirAssault,"2nd Battalion, Parachute Regiment"
BAF,Armored,"Queen's Royal Hussars Battle Group"
BAF,CombinedArms,"3rd Division Battle Group"
BAF,Mechanized,"1 Yorks Battle Group"
BAF,Support,"Royal Logistics Corps Battle Group"
CAF,AirAssault,"3rd Battalion, Royal Canadian Regiment"
CAF,Armored,"Lord Strathcona's Horse Regiment"
CAF,CombinedArms,"1 Canadian Mechanized Brigade Group"
CAF,Mechanized,"1st Battalion, Royal 22e Régiment"
CAF,Motorized,"12e Régiment Blindé du Canada"
CAF,Support,"6 Canadian Combat Support Brigade"
IMF,Armored,"Irregular Armored Squadron"
IMF,CombinedArms,"Irregular Battle Group"
IMF,LightInfantry,"Irregular Light Infantry"
IMF,Mechanized,"Irregular Mechanized Platoon"
IMF,Motorized,"Irregular Motorized Platoon"
IMF,Support,"Irregular Fire Support Group"
INS,Armored,"Irregular Armored Squadron"
INS,CombinedArms,"Irregular Battle Group"
INS,LightInfantry,"Irregular Light Infantry"
INS,Mechanized,"Irregular Mechanized Platoon"
INS,Motorized,"Irregular Motorized Platoon"
INS,Support,"Irregular Fire Support Group"
VDV,AirAssault,"217th Guards Airborne Regiment"
VDV,CombinedArms,"7th Guards Mountain Air Assault Division"
VDV,Armored,"104th Tank Battalion"
VDV,Mechanized,"108th Guards Air Assault Regiment"
VDV,Support,"150th Support Battalion"
RGF,Armored,"6th Separate Tank Brigade"
RGF,LightInfantry,"1398th Separate Reconnaissance Battalion"
RGF,CombinedArms,"49th Combined Arms Army"
RGF,Motorized,"3rd Motor Rifle Brigade"
RGF,Mechanized,"205th Separate Motor Rifle Brigade"
RGF,Support,"78th Detached Logistics Brigade"
RGF,AmphibiousAssault,"336th Guards Naval Infantry Brigade"
TLF,AirAssault,"1st Commando Brigade Battle Group"
TLF,Armored,"4th Armored Brigade Battle Group"
TLF,CombinedArms,"1st Army Battle Group"
TLF,Mechanized,"66th Mechanized Infantry Brigade Battle Group"
TLF,Motorized,"51st Motorized Infantry Brigade Battle Group"
TLF,Support,"Land Forces Logistics Command Battle Group"
MEA,AirAssault,"91st Air Assault Battalion"
MEA,Armored,"60th Prince Assur Armored Brigade"
MEA,CombinedArms,"1st Battalion, Legion of Babylon"
MEA,LightInfantry,"4th Border Guards Group"
MEA,Mechanized,"3rd King Qadesh Mechanized Infantry Brigade"
MEA,Support,"Vizir Hussein 2nd Support Battalion"
PLA,AirAssault,"161st Air Assault Brigade"
PLA,Armored,"195th Heavy Combined Arms Brigade"
PLA,CombinedArms,"118th Combined Arms Brigade"
PLA,LightInfantry,"149th Mountain Infantry Brigade"
PLA,Motorized,"112th Medium Combined Arms Brigade"
PLA,Support,"80th Support Brigade"
PLANMC,AirAssault,"4th Special Combat Battalion"
PLANMC,Armored,"3rd Marine Heavy Battalion"
PLANMC,CombinedArms,"5th Marine Brigade"
PLANMC,LightInfantry,"4th Marine Special Combat Battalion"
PLANMC,Motorized,"7th Marine Medium Battalion"
PLANMC,Support,"17th Marine Support Battalion"
PLANMC,AmphibiousAssault,"5th Marine Combined Arms Brigade"
PLAAGF,Armored,"9th Heavy Combined Arms Battalion"
PLAAGF,CombinedArms,"14th Amphibious Combined Arms Brigade"
PLAAGF,Mechanized,"4th Medium Combined Arms Battalion"
USA,AirAssault,"1st Brigade Combat Team, 82nd Airborne Division"
USA,Armored,"37th Armored Regiment, 1st Armored Division"
USA,CombinedArms,"3rd Brigade Combat Team, 1st Infantry Division"
USA,LightInfantry,"1st Brigade Combat Team, 10th Mountain Division"
USA,Mechanized,"1st Cavalry Regiment"
USA,Motorized,"2nd Cavalry Stryker Brigade Combat Team"
USA,Support,"497th Combat Sustainment Support Battalion"
USMC,Armored,"1st Tank Battalion, 1st Marines"
USMC,CombinedArms,"31st Marine Expeditionary Unit"
USMC,LightInfantry,"1st Marines Regimental Combat Team"
USMC,Motorized,"3rd Light Armored Recon Battalion"
USMC,Support,"2nd Marine Logistics Group"
USMC,AmphibiousAssault,"4th Marines Amphibious Ready Group"
WPMC,AirAssault,"Murk Water Air Wing"
WPMC,CombinedArms,"Manticore Security Task Force"
WPMC,LightInfantry,"Overwatch 6 Patrol Group"
`;

const defaultMapList = [
  { "name": "Al Basrah", "shorthands": ["basrah", "albasrah", "al_basrah", "basra"] },
  { "name": "Anvil", "shorthands": ["anvil"] },
  { "name": "Belaya", "shorthands": ["belaya", "bel"] },
  { "name": "Black Coast", "shorthands": ["blackcoast", "bc", "bbc", "black_coast"] },
  { "name": "Chora", "shorthands": ["chora"] },
  { "name": "Fallujah", "shorthands": ["fallu", "fallujah"] },
  { "name": "Fools Road", "shorthands": ["fools", "fr", "foolsroad", "fools_road"] },
  { "name": "Goose Bay", "shorthands": ["goose", "gb", "goosebay", "goose_bay"] },
  { "name": "Gorodok", "shorthands": ["gorodok", "goro"] },
  { "name": "Harju", "shorthands": ["harju"] },
  { "name": "Kamdesh", "shorthands": ["kamdesh", "kamd"] },
  { "name": "Kohat", "shorthands": ["kohat", "kohat_toi", "kohattoi"] },
  { "name": "Kokan", "shorthands": ["kokan"] },
  { "name": "Lashkar", "shorthands": ["lashkar", "lash", "lashk"] },
  { "name": "Manic", "shorthands": ["manic", "mani", "manicouagan", "manicougan"] },
  { "name": "Mestia", "shorthands": ["mestia"] },
  { "name": "Mutaha", "shorthands": ["mutaha"] },
  { "name": "Narva", "shorthands": ["narva"] },
  { "name": "Sanxian", "shorthands": ["sanxian", "sanx"] },
  { "name": "Sumari", "shorthands": ["sumari", "sum", "summ"] },
  { "name": "Skorpo", "shorthands": ["skorpo", "skorp", "skor"] },
  { "name": "Tallil", "shorthands": ["tallil", "talil"] },
  { "name": "Yehorivka", "shorthands": ["yehorivka", "yeho"] },
  { "name": "Logar", "shorthands": ["logar", "loga", "log"] }
]

const lines = factionData.split('\n');
const unitToSubfaction = {};

for (let i = 1; i < lines.length; i++) {
  // Split the line by commas (consider quoted commas)
  const [faction, subfaction, ...nameParts] = lines[i].split(',');
  const name = nameParts.join(',').replace(/(^")|("$)/g, '').trim();
  // Populate the object
  unitToSubfaction[name] = subfaction;
}


// Every small or medium map uses different unit names from the large layers, but they are all considered "CombinedArms"
/**
 * Retrieves the subfaction/unit type from a full name.
 * Note that every small or medium sized map uses different unit names from large layers, even if they are still considered "CombinedArms"
 * @param unitName A full name representing a subfaction/unit
 * @returns {*|string|null} A string representing the subfaction type, null if no matches were found.
 */
function getSubfaction(unitName) {

  // TODO unwrap this and print out to console if an unknown subfaction is given, rather than just blanket assuming any string means "combinedArms"

  return unitToSubfaction[unitName] ? unitToSubfaction[unitName] : (unitName ? 'CombinedArms' : null);
}

function getFactionFromLongName(factionFullName, factions) {
    let foundFaction = ''
    for (const [longName, shortName] of factions) {
        if (longName?.toLowerCase().trim() === factionFullName?.toLowerCase().trim()) {
            foundFaction = { short: shortName, long: longName }
            break
        }
    }
    return foundFaction
}



export {
  factionMap,
  defaultMapList,
  subfactionAbbreviations,
  alliances,
  getSubfaction,
  getFactionFromLongName
}
