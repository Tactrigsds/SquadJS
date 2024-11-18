import DBLog from "./db-log.js";
import {Op} from "sequelize";
import {bold, Colors, EmbedBuilder, time, TimestampStyles} from "discord.js";
import {getStartDateOfCurrentMonth, getStartDateOfNextMonth} from "../utils/utils.js";
import DiscordBaseMessageUpdater from "./discord-base-message-updater.js";


export default class TTDiscordSeedLeaderboardUpdater extends DiscordBaseMessageUpdater {

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
        updateIntervalSeconds: {
            required: true,
            description: "How frequently the leaderboards will be updated.",
            default: 1800
        },
        leaderBoardSize: {
          required: false,
            description: "The amount of players that will be shown in the leaderboard.",
            default: 10
        }
    }}

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.onDiscordMessage = this.onDiscordMessage.bind(this)
        this.updateMessages = this.updateMessages.bind(this)
        this.DBLogPlugin = null
    }


    async mount() {
        this.DBLogPlugin = this.server.plugins.find(plugin => plugin instanceof DBLog)
        if (!this.DBLogPlugin) {
            this.verbose(1, `Unable to find db log plugin, unmounting.`)
            return await this.unmount()
        }

        await super.mount()

        this.sessionSchema = this.DBLogPlugin.models.Session
        this.playerSchema = this.DBLogPlugin.models.Player
        this.matchModel = this.DBLogPlugin.models.Match

        this.updateInterval = setInterval(this.updateMessages, this.options.updateIntervalSeconds * 1000)

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
        const startOfMonth = getStartDateOfCurrentMonth(new Date())
        const startOfNextMonth = getStartDateOfNextMonth(new Date())

        const sessionArray = await getAllSessionsSinceDate(startOfMonth, this.sessionSchema, this.playerSchema)

        const matches = await getAllMatchesSinceDate(startOfMonth, this.matchModel)
        const matchChunks = splitMatchDataToSessions(matches)
        const timesSeeded = retrieveDaysSeeded(matchChunks, sessionArray)

        const totalSeedingTimes = getCumulativeSeedingTimes(sessionArray)
        const totalSeedingTimeWithCount = getSessionsWithSeedingCount(totalSeedingTimes, timesSeeded)

        const leaderBoardEmbedByCount = generateLeaderBoardEmbedByCount(totalSeedingTimeWithCount, startOfMonth, startOfNextMonth, this.options.leaderBoardSize)
        const leaderBoardEmbedByTime = generateLeaderboardEmbed(totalSeedingTimes, timesSeeded, startOfMonth, startOfNextMonth, this.options.leaderBoardSize)

        return [leaderBoardEmbedByTime, leaderBoardEmbedByCount]
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


/**
 * @param totalSeedingTimeMap {Map<string, TotalSeedingTime>}
 * @param timesSeeded {Map<string, number>}
 * @param startTime {Date}
 * @param endTime {Date}
 * @param leaderboardSize {number}
 * @return {EmbedBuilder}
 */
function generateLeaderboardEmbed(totalSeedingTimeMap, timesSeeded, startTime, endTime, leaderboardSize) {
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

    const steamIDs = playerSeedingTimes.map(player => {
        return player.steamID
    })

    const lastFieldString = minutesOfSeeding.join(' mins\n') + ' mins'

    // const dateString = `${bold(`👑 Top seeders in the period by time:`)} ${time(startTime, TimestampStyles.ShortDate)} to ${time(endTime, TimestampStyles.ShortDate)}`
    let dateString = `${bold(`Current period: `)} ${time(startTime, TimestampStyles.ShortDate)} to ${time(endTime, TimestampStyles.ShortDate)}\n`
    dateString += `${bold(`👑 Top seeders in the period by time 🌱`)}`

    const embed = new EmbedBuilder()
        .setTitle('Seeding leaderboards for [TT] TacTrig')
        .setColor(Colors.DarkGreen)
        .setDescription(dateString)
        // .setTimestamp(new Date())


    embed.addFields([
        { name: 'Name', value: playerNames.join('\n'), inline: true},
        { name: 'SteamID', value: steamIDs.join('\n'), inline: true},
        { name: 'Minutes Seeding', value: lastFieldString, inline: true},
    ])

    return embed
}


/**
 *
 * @param playerSeedingTimesWithCount {TotalSeedingTimeWithDays[]}
 * @param startTime {Date}
 * @param endTime {Date}
 * @param leaderboardSize {number}
 * @return {EmbedBuilder}
 */
function generateLeaderBoardEmbedByCount(playerSeedingTimesWithCount, startTime, endTime, leaderboardSize) {
    playerSeedingTimesWithCount.sort((a, b) => b.seedingCount - a.seedingCount)
    playerSeedingTimesWithCount = playerSeedingTimesWithCount.slice(0, leaderboardSize)

    const playerNames = playerSeedingTimesWithCount.map((player, i) => {
        return `${i+1}). ${player.playerName.trim()}`
    })

    const seedingCount = playerSeedingTimesWithCount.map(player => {
        return player.seedingCount
    })

    const steamIDs = playerSeedingTimesWithCount.map(player => {
        return player.steamID
    })

    let dateString = `${bold(`👑 Top seeders in the period by count 🌱`)}\n`
    // dateString += bold(`A "time" is defined as the server running from Jensens-to-jensens`)

    const embed = new EmbedBuilder()
        .setColor(Colors.DarkGreen)
        .setDescription(dateString)
        .setTimestamp(new Date())

    embed.addFields([
        { name: 'Name', value: playerNames.join('\n'), inline: true},
        { name: 'SteamID', value: steamIDs.join('\n'), inline: true},
        { name: 'Times Seeding', value: seedingCount.join('\n'), inline: true},
    ])
    return embed
}


/**
 * Retrieves all sessions ocurring after the given start time, includes playernames.
 *
 * @param startTime {Date}
 * @param sessionModel Session sequelize model.
 * @param userModel User sequelize model
 * @return {SessionWithName[]}
 */
async function getAllSessionsSinceDate(startTime, sessionModel, userModel) {
    userModel.hasMany(sessionModel, {sourceKey: 'steamID', foreignKey: 'steamID'})
    sessionModel.belongsTo(userModel, {targetKey: 'steamID', foreignKey: 'steamID'})

    let sessions = await sessionModel.findAll({
        where: {
            sessionStart: {
                [Op.gte]: startTime
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
 * @param date {Date}
 * @param matchModel
 * @returns {DBMatch[]}
 */
async function getAllMatchesSinceDate(date, matchModel) {
    let matches = await matchModel.findAll({
        where: {
            startTime: {
                [Op.gte]: date
            }
        }
    })

    /** @type {DBMatch[]} */
    matches = matches.map(match => match.dataValues)
    return matches
}


/**
 * Splits the matches into chunks/"days", currently defined by Jensen's being the start of a day.
 * @param matches {DBMatch[]}
 * @return {DBMatch[][]}
 */
function splitMatchDataToSessions(matches) {
    // Split matches into chunks, where a chunk is started by being on jensens or on a seed map.

    const sessionStartMapRegex = /.*jensen/i

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
 *
 * @param matchChunks {DBMatch[][]}
 * @param playerSessions {SessionWithName[]}
 * @return {Map<string, number>}
 */
function retrieveDaysSeeded(matchChunks, playerSessions) {
    const minSeedingTimeInSession = 1800
    /** @type {Map<string, number>} */
    const timesSeeded = new Map()

    for (const chunk of matchChunks) {
        /** @type {Map<string, number>} */
        const seedingTimeInChunk = new Map()

        const lastElem = chunk[chunk.length - 1]

        const startTimeOfChunk = chunk[0].startTime
        const endTimeOfChunk = lastElem?.endTime ? lastElem.endTime : lastElem.startTime

        for (const session of playerSessions) {
            if (session.sessionStart <= startTimeOfChunk && session.sessionStart <= endTimeOfChunk) {
                let userSeedingTime = seedingTimeInChunk.get(session.steamID)
                if (userSeedingTime) {
                    userSeedingTime += session.seedingTimeSeconds
                    seedingTimeInChunk.set(session.steamID, userSeedingTime)
                } else {
                    seedingTimeInChunk.set(session.steamID, session.seedingTimeSeconds)
                }
            }
        }

        for (const [steamID, seedingTime] of seedingTimeInChunk) {
            if (seedingTime < minSeedingTimeInSession) {
                continue;
            }

            let player = timesSeeded.get(steamID)
            if (player) {
                player += 1
                timesSeeded.set(steamID, player)
            } else {
                timesSeeded.set(steamID, 1)
            }
        }
    }

    return timesSeeded
}

