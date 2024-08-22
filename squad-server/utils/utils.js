import path from "path";


function getRandomArrayElement(array) {
    return array[getRandomInt(0, array.length - 1)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


function getFormattedDateForFile(date = new Date()) {
    const paddedMonth = `${date.getUTCMonth() + 1}`.padStart(2, '0')
    const paddedDay = `${date.getUTCDate()}`.padStart(2, '0')
    const paddedHours = `${date.getUTCHours()}`.padStart(2, '0')
    const paddedMinutes = `${date.getUTCMinutes()}`.padStart(2, '0')
    return `${date.getUTCFullYear()}.${paddedMonth}.${paddedDay}-${paddedHours}.${paddedMinutes}`
}

function getFormattedDateForLog(date = new Date()) {
    const paddedMonth = `${date.getUTCMonth() + 1}`.padStart(2, '0')
    const paddedDay = `${date.getUTCDate()}`.padStart(2, '0')
    const paddedHours = `${date.getUTCHours()}`.padStart(2, '0')
    const paddedMinutes = `${date.getUTCMinutes()}`.padStart(2, '0')
    const paddedSeconds = `${date.getUTCSeconds()}`.padStart(2, '0')

    return `${date.getUTCFullYear()}-${paddedMonth}-${paddedDay}_${paddedHours}.${paddedMinutes}.${paddedSeconds}.${date.getUTCMilliseconds()}`
}

function getLayerListLogPath(logFolder, initDate = new Date()) {
    const dateString = `${getFormattedDateForFile(initDate)}`
    return path.join(logFolder, `tt-custom-mapvote_${dateString}.log`)
}


export {
    getFormattedDateForLog,
    getFormattedDateForFile,
    getRandomInt,
    getRandomArrayElement,
    getLayerListLogPath
}
