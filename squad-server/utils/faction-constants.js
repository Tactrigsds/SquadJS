
const factions = new Map([
  ["United States Army", "USA"],
  ["United States Marine Corps", "USMC"],
  ["Turkish Land Forces", "TLF"],
  ["Russian Ground Forces", "RGF"],
  ["People’s Liberation Army Navy Marine Corps", "PLANMC"],
  ["People’s Liberation Army Amphibious Ground Force", "PLAAGF"],
  ["People's Liberation Army", "PLA"],
  ["Canadian Armed Forces", "CAF"],
  ["Insurgent Forces", "INS"],
  ["Irregular Militia Forces", "IMF"],
  ["Russian Airborne Forces", "VDV"],
  ["Middle Eastern Alliance", "MEA"],
  ["British Armed Forces", "BAF"],
  ["Australian Defence Force", "ADF"],
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

const factionData = `
Faction,Subfaction,FullName
ADF,AirAssault,"3rd Battalion, RAR Battle Group"
ADF,CombinedArms,3rd Brigade Battle Group
ADF,Mechanized,"1st Battalion, Royal Australian Regiment"
BAF,AirAssault,"2nd Battalion, Parachute Regiment Battle Group"
BAF,Armored,Queen's Royal Hussars Battle Group
BAF,CombinedArms,3rd Division Battle Group
BAF,Mechanized,1 Yorks Battle Group
CAF,AirAssault,"3rd Battalion, RCR Battle Group"
CAF,Motorized,12th Armored Regiment of Canada
CAF,Armored,Lord Strathcona's Horse Regiment Battle Group
CAF,CombinedArms,1 Canadian Mechanized Brigade Group
CAF,Mechanized,"1st Battalion, Royal 22e Régiment"
IMF,Armored,Irregular Armored Squadron
IMF,CombinedArms,Irregular Battle Group
IMF,LightInfantry,Irregular LightInfantry
IMF,Mechanized,Irregular Mechanized Platoon
INS,Armored,Irregular Armored Squadron
INS,CombinedArms,Irregular Battle Group
INS,LightInfantry,Irregular LightInfantry
INS,Mechanized,Irregular Mechanized Platoon
VDV,CombinedArms,7th Guards Mountain Air Assault Division
VDV,AirAssault,217th Guards Airborne Regiment
VDV,Armored,104th Tank Battalion
VDV,Mechanized,108th Guards Air Assault Regiment
RGF,Armored,6th Separate Czestochowa Tank Brigade BTG
RGF,LightInfantry,1398th Separate Reconnaissance Battalion
RGF,CombinedArms,49th Combined Arms Army
RGF,Motorized,3rd Motor Rifle Brigade
RGF,Mechanized,205th Separate Motor Rifle Brigade
TLF,AirAssault,1st Commando Brigade Battle Group
TLF,Motorized,51st Motorized Infantry Brigade Battle Group
TLF,Armored,4th Armored Brigade Battle Group
TLF,CombinedArms,1st Army Battle Group
TLF,Support,Land Forces Logistics Command Battle Group
TLF,Mechanized,66th Mechanized Infantry Brigade Battle Group
MEA,AirAssault,91st Air Assault Battalion
MEA,Armored,60th Prince Assur Armored Brigade
MEA,CombinedArms,"1st Battalion, Legion of Babylon"
MEA,LightInfantry,4th Border Guards
MEA,Mechanized,3rd King Qadesh Mechanized Infantry Brigade
PLA,AirAssault,161st Air Assault Brigade
PLA,Armored,195th Heavy Combined Arms Brigade
PLA,CombinedArms,118th Combined Arms Brigade
PLA,LightInfantry,149th Combined Arms Brigade
PLA,LightInfantry,149th Mountain Infantry Brigade
PLA,Motorized,112th Medium Combined Arms Brigade
PLA,Motorized,112th Combined Arms Brigade
PLANMC,AirAssault,4th Special Combat Battalion
PLANMC,Armored,3rd Heavy Battalion
PLANMC,Armored,3rd Marine Heavy Battalion
PLANMC,CombinedArms,5th Marine Combined Arms Brigade
PLANMC,LightInfantry,4th Marine Special Combat Battalion
PLANMC,Motorized,7th Marine Medium Battalion
PLAAGF,Armored,4th Heavy Battalion
PLAAGF,CombinedArms,14th Amphibious Combined Arms Brigade
PLAAGF,Mechanized,4th Medium Combined Arms Battalion
USA,Mechanized,1st Cavalry Regiment
USA,Armored,37th Armored Regiment, 3rd Armored Division
USA,CombinedArms,"3rd Brigade Combat Team, 1st Infantry Division"
USA,Motorized,2nd Cavalry Stryker Brigade Combat Team
USA,LightInfantry,"1st Brigade Combat Team, 10th Mountain Division"
USA,AirAssault,"1st Brigade Combat Team, 82nd Airborne Division"
USA,Support,497th Combat Sustainment Support Battalion
USMC,Armored,"1st Tank Battalion, 1st Marines"
USMC,CombinedArms,31st Marine Expeditionary Unit
USMC,LightInfantry,1st Marines Regimental Combat Team
USMC,Motorized,3rd Light Armored Recon Battalion
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


export { factions, getSubfaction, subfactionAbbreviations, defaultMapList }
