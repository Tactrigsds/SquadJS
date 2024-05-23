

// const subfactions = [
//   { name: "CombinedArms", variants: [["RGF", "49th Combined Arms Army"], ["USA", "3rd Brigade Combat Team, 1st Infantry Division"], ["ADF", "3rd Brigade Battle Group"], ["BAF", "3rd Division Battle Group"], ["CAF", "1 Canadian Mechanized Brigade Group"], ["MEA", "1st Battalion, Legion of Babylon"], ["PLA", "118th CombinedArms Brigade"]]},
//   { name: "AirAssault", variants: ["2nd Battalion, Parachute Regiment"]},
//   { name: "Armoured", variants: [""]},
//   { name: "Motorized", variants: ["Irregular Motorized Platoon", ["USMC", "3rd Light Armored Recon Battalion"]]},
//   { name: "", variants: [""]},
// ]


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

const csvData = `
Faction,Subfaction,Name
ADF,AirAssault,"3rd Battalion, RAR Battle Group"
BAF,AirAssault,"2nd Battalion, Parachute Regiment Battle Group"
CAF,AirAssault,"3rd Battalion, RCR Battle Group"
MEA,AirAssault,91st Air Assault Battalion
PLA,AirAssault,161st Air Assault Brigade
PLANMC,AirAssault,4th Special Combat Battalion
TLF,AirAssault,1st Commando Brigade Battle Group
USA,AirAssault,"1st Brigade Combat Team, 82nd Airborne Division"
VDV,AirAssault,217th Guards Airborne Regiment
BAF,Armored,Queen's Royal Hussars Battle Group
CAF,Armored,Lord Strathcona's Horse Regiment Battle Group
MEA,Armored,60th Prince Assur Armored Brigade
PLA,Armored,195th Heavy Combined Arms Brigade
PLAAGF,Armored,4th Heavy Battalion
PLANMC,Armored,3rd Heavy Battalion
PLANMC,Armored,3rd Marine Heavy Battalion
RGF,Armored,6th Separate Czestochowa Tank Brigade BTG
TLF,Armored,4th Armored Brigade Battle Group
USMC,Armored,"1st Tank Battalion, 1st Marines"
VDV,Armored,104th Tank Battalion
IMF,Armored,Irregular Armored Squadron
INS,Armored,Irregular Armored Squadron
ADF,CombinedArms,3rd Brigade Battle Group
BAF,CombinedArms,3rd Division Battle Group
CAF,CombinedArms,1 Canadian Mechanized Brigade Group
MEA,CombinedArms,"1st Battalion, Legion of Babylon"
PLA,CombinedArms,118th Combined Arms Brigade
PLAAGF,CombinedArms,14th Amphibious Combined Arms Brigade
PLANMC,CombinedArms,5th Marine Combined Arms Brigade
RGF,CombinedArms,49th Combined Arms Army
TLF,CombinedArms,1st Army Battle Group
USA,CombinedArms,"3rd Brigade Combat Team, 1st Infantry Division"
USMC,CombinedArms,31st Marine Expeditionary Unit
VDV,CombinedArms,7th Guards Mountain Air Assault Division
IMF,CombinedArms,Irregular Battle Group
INS,CombinedArms,Irregular Battle Group
MEA,LightInfantry,4th Border Guards
PLA,LightInfantry,149th Combined Arms Brigade
PLA,LightInfantry,149th Mountain Infantry Brigade
PLANMC,LightInfantry,4th Marine Special Combat Battalion
RGF,LightInfantry,1398th Separate Reconnaissance Battalion
USA,LightInfantry,"1st Brigade Combat Team, 10th Mountain Division"
USMC,LightInfantry,1st Marines Regimental Combat Team
IMF,LightInfantry,Irregular LightInfantry
INS,LightInfantry,Irregular LightInfantry
ADF,Mechanized,"1st Battalion, Royal Australian Regiment"
BAF,Mechanized,1 Yorks Battle Group
CAF,Mechanized,"1st Battalion, Royal 22e Régiment"
MEA,Mechanized,3rd King Qadesh Mechanized Infantry Brigade
PLAAGF,Mechanized,4th Medium Combined Arms Battalion
TLF,Mechanized,66th Mechanized Infantry Brigade Battle Group
VDV,Mechanized,108th Guards Air Assault Regiment
IMF,Mechanized,Irregular Mechanized Platoon
INS,Mechanized,Irregular Mechanized Platoon
CAF,Motorized,12th Armored Regiment of Canada
PLA,Motorized,112th Combined Arms Brigade
PLA,Motorized,112th Medium Combined Arms Brigade
PLANMC,Motorized,7th Marine Medium Battalion
RGF,Motorized,3rd Motor Rifle Brigade
TLF,Motorized,51st Motorized Infantry Brigade Battle Group
USA,Motorized,2nd Cavalry Stryker Brigade Combat Team
USMC,Motorized,3rd Light Armored Recon Battalion`;

const lines = csvData.split('\n');
const unitToSubfaction = {};

for (let i = 1; i < lines.length; i++) {
  // Split the line by commas (consider quoted commas)
  const [faction, subfaction, ...nameParts] = lines[i].split(',');
  const name = nameParts.join(',').replace(/(^")|("$)/g, '').trim();
  // Populate the object
  unitToSubfaction[name] = subfaction;
}

const subfactionAbbreviations = new Map([
  ["Motorized", "Motor"],
  ["AirAssault", "Air"],
  ["Armored", "Armor"],
  ["CombinedArms", "CmbArm"],
  ["Support", "Supp"],
  ["LightInfantry", "Inf"],
  ["Mechanized", "Mech"],
])


function getSubfaction(unitName) {
  // Every small or medium map uses different unit names from the large layers, but they are all considered "CombinedArms"
  return unitToSubfaction[unitName] ? unitToSubfaction[unitName] : (unitName ? 'CombinedArms' : null);

}


export { factions, getSubfaction, subfactionAbbreviations }
