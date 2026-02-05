import DBLog from "./db-log.js";
import {DataTypes, Model, Op} from "sequelize";
import {bold, Colors, EmbedBuilder, time, TimestampStyles} from "discord.js";
import {
    getUTCNextWeek,
    getUTCStartDateIn2Months,
    getUTCStartDateOfCurrentMonth,
    getUTCStartDateOfNextMonth,
    getUTCurrentWeek,
} from "../utils/utils.js";
import DiscordBaseMessageUpdater from "./discord-base-message-updater.js";
import {ServerEvents} from "../utils/constants.js";


export default class TTSeedingLeaderboard extends DiscordBaseMessageUpdater {

    static get description() {
        return ("The<code>Seeding Leaderboard Updater</code> creates messages container the top seeders in a set period. Is designed to work in conjunction with the <code>TTSessionTracker</code> plugin.")
    }



    static get defaultEnabled() {
        return true
    }

    static get optionsSpecification() {
        return {
            ...DiscordBaseMessageUpdater.optionsSpecification,
            command: {
                required: false,
                description: 'Command name to get message.',
                default: '!leaderboard'
            },
            seedEmoji: {
                required: false,
                description: ""
            },
            leaderboardUpdateIntervalSeconds: {
                required: true,
                description: "How frequently the leaderboards will be updated.",
                default: 1800
            },
            leaderBoardSize: {
                required: false,
                description: "The count of players that will be shown in the leaderboard.",
                default: 10
            },
            minSeedingTimeInDaySeconds: {
                required: false,
                description: "How long a player must have seeded in a single session and in a single day to be counted towards a day of seeding.",
                default: 1800
            },
            sqliteDB: {
                required: true,
                description: "Connector to the sqllite database. Used to store period data.",
                connector: 'sequelize',
                default: 'sqlite'
            }
        }
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.onDiscordMessage = this.onDiscordMessage.bind(this)
        this.updateMessages = this.updateMessages.bind(this)
        this.DBLogPlugin = null
        this.currentPeriod = null;
    }


    async mount() {
        this.DBLogPlugin = this.server.plugins.find(plugin => plugin instanceof DBLog)
        if (!this.DBLogPlugin) {
            this.verbose(1, `Unable to find db log plugin, unmounting.`)
            return await this.unmount()
        }

        await super.mount()

        this.periodDB = await initializePeriodDB(this.options.sqliteDB)
        this.periodModel =  await this.periodDB.sync()
        this.sessionSchema = this.DBLogPlugin.models.Session
        this.playerSchema = this.DBLogPlugin.models.Player
        this.matchModel = this.DBLogPlugin.models.Match

        await this.periodUpdater()

        await this.createNewLeaderboard()

        this.periodInterval = setInterval(async () => {
            await this.periodUpdater()
        }, 120 * 1000)
        this.updateInterval = setInterval(this.updateMessages, this.options.leaderboardUpdateIntervalSeconds * 1000)
    }

    async unmount() {
        await super.unmount()
        clearInterval(this.updateInterval)
    }

    async generateMessage() {
        const embeds = await this.createNewLeaderboard()

        return {embeds: embeds}
    }


    async createNewLeaderboard() {
        const start = this.currentPeriod.periodStart
        const end = this.currentPeriod.periodEnd

        const data = await retrieveAndProcessDataFromPeriod(start, end, this.sessionSchema, this.playerSchema, this.matchModel, this.options.minSeedingTimeInDaySeconds)

        const leaderBoardEmbedTitle = generateLeaderboardTitleEmbed(start, end)
        const leaderBoardEmbedByTime = generateLeaderBoardEmbedByTime(data.totalSeedingTimes, data.timesSeeded, this.options.leaderBoardSize)
        const leaderBoardEmbedByCount = generateLeaderBoardEmbedByCount(data.totalSeedingTimesWithCount, this.options.leaderBoardSize)

        return [leaderBoardEmbedTitle, leaderBoardEmbedByTime, leaderBoardEmbedByCount]
    }

    async periodUpdater() {
        const periods = await retrievePeriodData(this.periodModel);
        let currentPeriod = periods.at(-1);

        if (!currentPeriod || !isCurrentlyInPeriod(currentPeriod)) {
            if (currentPeriod && !isCurrentlyInPeriod(currentPeriod)) {
                this.verbose(1, `New period for leaderboard started, emitting event to messager plugin...`)
                this.server.emit(ServerEvents.periodEnded, currentPeriod);
            }
            currentPeriod = calculatePeriod("monthly");
            this.verbose(1, `Initializing new period: `, currentPeriod.periodStart)
            await insertPeriod(this.periodModel, currentPeriod.periodStart, currentPeriod.periodEnd, "monthly");
        }

        this.currentPeriod = currentPeriod
    }
}

export async function retrieveAndProcessDataFromPeriod(start, end, sessionSchema, playerSchema, matchSchema, minSeedingTimeSeconds) {
    const sessionArray = await getAllSessionsInPeriod(start, end, sessionSchema, playerSchema)
    const matches = await getAllMatchesInPeriod(matchSchema, start, end)
    const matchChunks = splitMatchDataToSessions(matches)

    const timesSeeded = retrieveDaysSeeded(matchChunks, sessionArray, minSeedingTimeSeconds)
    const totalSeedingTimes = getCumulativeSeedingTimes(sessionArray)
    const totalSeedingTimesWithCount = getSessionsWithSeedingCount(totalSeedingTimes, timesSeeded)

    return {
        timesSeeded: timesSeeded,
        totalSeedingTimes: totalSeedingTimes,
        totalSeedingTimesWithCount: totalSeedingTimesWithCount
    }
}


/**
 *
 * @param sessionArray {SessionWithName[]}
 * @return {Map<string, TotalSeedingTime>}
 */
function getCumulativeSeedingTimes(sessionArray) {
    /** @type {Map<string, TotalSeedingTime>} */
    const totalSessionTimeMap = new Map()

    for (const session of sessionArray) {
        const userTotalSeedingTime = totalSessionTimeMap.get(session.steamID)
        if (!userTotalSeedingTime) {
            totalSessionTimeMap.set(session.steamID, {
                steamID: session.steamID,
                playerName: session.playerName,
                totalSeedingTimeSeconds: session.seedingTimeSeconds
            })
        } else {
            userTotalSeedingTime.totalSeedingTimeSeconds += session.seedingTimeSeconds
        }
    }

    return totalSessionTimeMap
}

/**
 * @param totalSeedingTimeMap {Map<string, TotalSeedingTime>}
 * @param timesSeeded {Map<string, number>}
 * @returns {TotalSeedingTimeWithDays[]}
 */
function getSessionsWithSeedingCount(totalSeedingTimeMap, timesSeeded) {
    const tempSeedingTimesArray = Array.from(totalSeedingTimeMap.values())

    /** @type {TotalSeedingTimeWithDays[]} */
    const playerSeedingTimes = tempSeedingTimesArray.map(player => {
        let seedingCount = timesSeeded.get(player.steamID)
        if (!seedingCount) {
            seedingCount = 0
        }
        return {
            steamID: player.steamID,
            playerName: player.playerName,
            totalSeedingTimeSeconds: player.totalSeedingTimeSeconds,
            seedingCount: seedingCount
    }})

    return playerSeedingTimes
}


function generateLeaderboardTitleEmbed(startTime, endTime) {
    const dateString = `${bold(`Period: `)} ${time(startTime, TimestampStyles.ShortDate)} - ${time(endTime, TimestampStyles.ShortDate)}\n`

    return new EmbedBuilder()
        .setTitle('Seeding leaderboard for [TT] TacTrig'.padEnd(39, '\u1CBC'))
        .setDescription(dateString)
        .setColor(Colors.DarkGreen)
}


/**
 * @param totalSeedingTimeMap {Map<string, TotalSeedingTime>}
 * @param timesSeeded {Map<string, number>}
 * @param leaderboardSize {number}
 * @return {EmbedBuilder}
 */
function generateLeaderBoardEmbedByTime(totalSeedingTimeMap, timesSeeded, leaderboardSize) {
    // Retrieve the top 25 seeders in terms of total time.
    /** @type {TotalSeedingTime[]} */
    let playerSeedingTimes = Array.from(totalSeedingTimeMap.values())

    playerSeedingTimes = playerSeedingTimes.sort((a, b) => (Math.round(b.totalSeedingTimeSeconds) - Math.round(a.totalSeedingTimeSeconds)))
    playerSeedingTimes = playerSeedingTimes.slice(0, leaderboardSize)

    const playerNames = playerSeedingTimes.map((player, i) => {
        return `${i+1}). ${player.playerName.trim()}`
    })

    const minutesOfSeeding = playerSeedingTimes.map(player => {
        return Math.round(player.totalSeedingTimeSeconds / 60)
    })

    const lastFieldString = minutesOfSeeding.join(' mins\n') + ' mins'

    let dateString = `${bold(`👑 Top seeders by time 🌱`)}`
    // To ensure that the embeds are more or less the same width.
    dateString = dateString.padEnd(45, '\u1CBC')

    const embed = new EmbedBuilder()
        .setColor(Colors.DarkGreen)
        .setDescription(dateString)

    embed.addFields([
        { name: 'Name', value: playerNames.join('\n'), inline: true},
        { name: 'Minutes Seeding', value: lastFieldString, inline: true},
    ])

    return embed
}


/**
 *
 * @param playerSeedingTimesWithCount {TotalSeedingTimeWithDays[]}
 * @param leaderboardSize {number}
 * @return {EmbedBuilder}
 */
function generateLeaderBoardEmbedByCount(playerSeedingTimesWithCount, leaderboardSize) {
    playerSeedingTimesWithCount.sort((a, b) => b.seedingCount - a.seedingCount)
    playerSeedingTimesWithCount = playerSeedingTimesWithCount.slice(0, leaderboardSize)

    const playerNames = playerSeedingTimesWithCount.map((player, i) => {
        return `${i+1}). ${player.playerName.trim()}`
    })

    const seedingCount = playerSeedingTimesWithCount.map(player => player.seedingCount)

    // Pad end so all embeds are aligned in width.
    let dateString = `${bold(`👑 Top seeders by count 🌱`)}`
    dateString = dateString.padEnd(45, '\u1CBC')

    const embed = new EmbedBuilder()
        .setColor(Colors.DarkGreen)
        .setDescription(dateString)
        .setTimestamp(new Date())

    embed.addFields([
        { name: 'Name', value: playerNames.join('\n'), inline: true},
        { name: 'Times Seeding', value: seedingCount.join('\n'), inline: true},
    ])
    return embed
}


/**
 * Retrieves all sessions occurring after the given start time, includes playernames.
 *
 * @param startTime {Date}
 * @param endTime {Date}
 * @param sessionModel Session sequelize model.
 * @param userModel User sequelize model
 * @return {Promise<SessionWithName[]>}
 */
async function getAllSessionsInPeriod(startTime, endTime, sessionModel, userModel) {
    userModel.hasMany(sessionModel, {sourceKey: 'steamID', foreignKey: 'steamID'})
    sessionModel.belongsTo(userModel, {targetKey: 'steamID', foreignKey: 'steamID'})

    let sessions = await sessionModel.findAll({
        where: {
            sessionStart: {
                [Op.gte]: startTime,
                [Op.lt]: endTime
            }
        },
        include: [{
            model: userModel,
            required: true
        }]
    })
        .then(session => session.map(v => v.dataValues))
        .catch(err => {
            console.error(`Error occured when retrieving sessions...\n`, err)
            return []
        })

    /** @type {SessionWithName[]} */
    sessions = sessions.map(elem => {
        return {
            steamID: elem.steamID,
            playerName: elem.DBLog_Player?.dataValues.lastName,
            sessionStart: elem.sessionStart,
            sessionEnd: elem.sessionEnd,
            seedingTimeSeconds: elem.seedingTimeSeconds
        }
    })

    return sessions
}


/**
 *
 * @param startTime {Date}
 * @param endTime {Date}
 * @param matchModel {Model}
 * @returns {Promise<DBMatch[]>}
 */
async function getAllMatchesInPeriod( matchModel, startTime, endTime) {
    return await matchModel.findAll({
        where: {
            startTime: {
                [Op.gte]: startTime,
                [Op.lt]: endTime
            },
        }
    })
        .then(matches => matches.map(match => match.dataValues))
        .catch(err => {
            console.error('Error when retrieving matches from DB', err)
            return []
        })
}


/**
 * Splits the matches into chunks/"days", where each chunk/"day" spans from the start of the specified map until it's detected again.
 * @param matches {DBMatch[]}
 * @param sessionStartMapRegex {RegExp} A regex, if matching, identifying the start of a "day"/"chunk"/session of the server.
 * @return {DBMatch[][]} An array of chunks identifying separate "days"/sessions on the server.
 */
function splitMatchDataToSessions(matches, sessionStartMapRegex =  /.*jensen/i) {
    // Split matches into chunks, where a chunk is started by being on jensens or on a seed map.

    /** @type {DBMatch[][]} */
    const matchChunks = []

    /** @type {DBMatch[]} */
    let currentChunk = []
    for (const match of matches) {
        if (!sessionStartMapRegex.test(match.layerClassname)) {
            currentChunk.push(match)
        } else {
            matchChunks.push(currentChunk)
            currentChunk = [match]
        }
    }
    matchChunks.push(currentChunk)

    return matchChunks
}


/**
 * @param matchChunks {DBMatch[][]}
 * @param playerSessions {SessionWithName[]}
 * @param minSeedingTimeInSession
 * @return {Map<string, number>}
 */
function retrieveDaysSeeded(matchChunks, playerSessions, minSeedingTimeInSession) {
    /** @type {Map<string, number>} */
    const timesSeeded = new Map()

    for (const chunk of matchChunks) {
        /** @type {Map<string, number>} */
        const seedingTimeInChunk = new Map()

        const lastElem = chunk.at(-1)

        const startTimeOfChunk = chunk[0].startTime
        const endTimeOfChunk = lastElem?.endTime ? lastElem.endTime : lastElem.startTime

        for (const session of playerSessions) {
            // TODO add a "time in chunk calculation here instead?"
            if (startTimeOfChunk < session.sessionStart && session.sessionStart <= endTimeOfChunk) {
                let userSeedingTime = seedingTimeInChunk.get(session.steamID)
                if (userSeedingTime) {
                    userSeedingTime += session.seedingTimeSeconds
                    seedingTimeInChunk.set(session.steamID, userSeedingTime)
                } else {
                    seedingTimeInChunk.set(session.steamID, session.seedingTimeSeconds)
                }
            }
        }

        for (const [steamID, seedingTimeSeconds] of seedingTimeInChunk) {
            if (seedingTimeSeconds < minSeedingTimeInSession) {
                continue;
            }

            let count = timesSeeded.get(steamID)
            if (count) {
                count += 1
                timesSeeded.set(steamID, count)
            } else {
                timesSeeded.set(steamID, 1)
            }
        }
    }

    return timesSeeded
}




/**
 * @param periodType {"monthly" | "bimonthly" | "weekly"}
 * @return {Object}
 */
function calculatePeriod(periodType) {
    const validOptions = ["monthly", "bimonthly", "weekly"]
    if (!validOptions.includes(periodType)) {
        throw Error(`Expected period to be 'monthly' | 'bimonthly' | 'weekly', got ${periodType}`)
    }

    let period;

    switch (periodType) {
        case "bimonthly": {
            period = {
                periodStart: getUTCStartDateOfCurrentMonth(),
                periodEnd: getUTCStartDateIn2Months()
            }
            break;
        }

        case "monthly":
            period = {
                periodStart: getUTCStartDateOfCurrentMonth(),
                periodEnd: getUTCStartDateOfNextMonth()
            }
            break

        case "weekly":
            period = {
                periodStart: getUTCurrentWeek(),
                periodEnd: getUTCNextWeek()
            }
            break
        default:
            break;
    }

    return period
}


/**
 * @param sequelizeConnector {Sequelize}
 */
export async function initializePeriodDB(sequelizeConnector) {
    const model = sequelizeConnector.define('SeedingPeriods', {
        periodStart: {
            type: DataTypes.DATE,
            allowNull: false
        },
        periodEnd: {
            type: DataTypes.DATE,
            allowNull: false
        },
        periodType: {
            type: DataTypes.ENUM("month", "bimonthly", "weekly"),
        },
        leaderBoardDataSaved: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        sendBroadCastNoEarlierThan: {
            type: DataTypes.DATE
        },
        broadcastSent: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
    }, {
        timestamps: false
    })

    return model
}



/**
 *
 * @param periodModel {Model}
 * @param startTime {Date}
 * @param endTime {Date}
 * @param periodType {"bimonthly" | "monthly" | "weekly"}
 * @returns {Promise<void>}
 */
export async function insertPeriod(periodModel, startTime, endTime, periodType) {
    const NETBroadCastDate = new Date(endTime).setUTCHours(14)

    const result = await periodModel.create({
        periodStart: startTime,
        periodEnd: endTime,
        periodType: periodType,
        sendNoEarlierThan: NETBroadCastDate,
        leaderBoardDataSaved: false,
        broadcastSent: false,
    })
    return result
}


/**
 * @param periodModel {Model}
 * @return {Promise<PeriodData[]>}
 */
export async function retrievePeriodData(periodModel){
    /** @type {PeriodData[]} */
    let periods = []
    try {
        const data = await periodModel.findAll()
        periods = data.map(period => period.dataValues)
    }
    catch (e) {
        console.error(e)
    }
    return periods
}


/**
 *
 * @param period
 * @param date {Date}
 * @returns {boolean}
 */
export function isCurrentlyInPeriod(period, date = new Date()) {
    if (!period) {
        return false
    }

    return period.periodStart < date && date <= period.periodEnd;
}