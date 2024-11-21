import path from "path";


export function getRandomArrayElement(array) {
    return array[getRandomInt(0, array.length - 1)];
}

export function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getUTCStartDateOfCurrentMonth(date = new Date()) {
    // Retrieves a DateTime object that starts at the beginning of the current month
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0))
}

export function getUTCStartDateOfNextMonth(date = new Date()) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0))
}

export function getUTCStartDateIn2Months(date = new Date()) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 1, 0))
}

export function getUTCurrentWeek(date = new Date()) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - date.getUTCDay() + 1))
}

export function getUTCNextWeek(date = new Date()) {

    // TODO this needs to be fully

    let dateYear = date.getUTCFullYear();
    let dateMonth = date.getUTCMonth()
    let dateDay = (date.getUTCDate() + (7 - date.getUTCDay()) + 1);

    return new Date(Date.UTC(dateYear, dateMonth, dateDay))
}



export function getFormattedDateForFile(date = new Date()) {
    const paddedMonth = `${date.getUTCMonth() + 1}`.padStart(2, '0')
    const paddedDay = `${date.getUTCDate()}`.padStart(2, '0')
    const paddedHours = `${date.getUTCHours()}`.padStart(2, '0')
    const paddedMinutes = `${date.getUTCMinutes()}`.padStart(2, '0')
    return `${date.getUTCFullYear()}-${paddedMonth}-${paddedDay}-${paddedHours}-${paddedMinutes}`
}

export function getFormattedDateForLog(date = new Date()) {
    const paddedMonth = `${date.getUTCMonth() + 1}`.padStart(2, '0')
    const paddedDay = `${date.getUTCDate()}`.padStart(2, '0')
    const paddedHours = `${date.getUTCHours()}`.padStart(2, '0')
    const paddedMinutes = `${date.getUTCMinutes()}`.padStart(2, '0')
    const paddedSeconds = `${date.getUTCSeconds()}`.padStart(2, '0')


    return `${date.getUTCFullYear()}-${paddedMonth}-${paddedDay}_${paddedHours}.${paddedMinutes}.${paddedSeconds}.${date.getUTCMilliseconds()}`
}

export function getLayerListLogPath(logFolder, initDate = new Date()) {
    const dateString = `${getFormattedDateForFile(initDate)}`
    return path.join(logFolder, `tt-custom-mapvote_${dateString}.log`)
}

export async function sleep(delayInMS) {
    await new Promise((resolve) =>
        setTimeout(resolve, delayInMS)
    );
}

export async function getFactionsAndSubfactions(mapData) {
    const [t1, t2] = mapData.factions.split(" ");
    const [team1, subfaction1] = t1.split('+')
    const [team2, subfaction2] = t2.split('+')
    return {faction1: team1, faction2: team2, subfaction1: subfaction1, subfaction2: subfaction2}
}

/**
 * Processes the map data that's recieved from RCON into an easily usable object.
 * Note that in the event that a subfaction is not explicitly set, it will be undefined in this case.
 *
 * @param rawMapData {RawMapData}
 * @returns {MapData}
 */
export function processMapData(rawMapData) {
    const [t1, t2] = rawMapData.factions.split(" ");
    let [team1, subfaction1] = t1.split('+')
    let [team2, subfaction2] = t2.split('+')

    if (!subfaction1) subfaction1 = null
    if (!subfaction2) subfaction2 = null

    return {level: rawMapData.level, layer: rawMapData.layer, faction1: team1, faction2: team2, subfaction1: subfaction1, subfaction2: subfaction2}
}