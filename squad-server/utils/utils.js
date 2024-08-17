

function getRandomArrayElement(array) {
    return array[getRandomInt(0, array.length - 1)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


function formatDateForFile(date = new Date()) {
    const dateString = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}_${date.getUTCHours()}.${date.getUTCMinutes()}`
}

function formatDateForLogging(date = new Date()) {
    return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}_${date.getUTCHours()}.${date.getUTCMinutes()}.${date.getUTCSeconds()}.${date.getUTCMilliseconds()}`
}

export {
    formatDateForLogging,
    formatDateForFile,
    getRandomInt,
    getRandomArrayElement
}
