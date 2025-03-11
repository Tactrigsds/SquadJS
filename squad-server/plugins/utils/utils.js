export async function getFactionsAndSubfactions(mapData) {
    const [t1, t2] = mapData.factions.split(" ");
    const [team1, subfaction1] = t1.split('+')
    const [team2, subfaction2] = t2.split('+')
    return { faction1: team1, faction2: team2, subfaction1: subfaction1, subfaction2: subfaction2 }
}