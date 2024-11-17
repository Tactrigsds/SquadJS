import DiscordBasePlugin from "./discord-base-plugin.js";
import DBLog from "./db-log.js";
import sequelize, {Op} from "sequelize";
import {bold, Colors, EmbedBuilder, embedLength, time, TimestampStyles} from "discord.js";
import {ServerEvents} from "../utils/constants.js";


export default class TTDiscordSeedLeaderboardUpdater extends DiscordBasePlugin {

    static get description() {
        // TODO finish writing this.
        return ("The<code>Seeding Leaderboard Updater</code>")
    }



    static get defaultEnabled() {
        return true
    }

    static get optionsSpecification() {
        return {
        ...DiscordBasePlugin.optionsSpecification,
        channelID: {
            required: true,
            description: "The id of the channel to post the leaderboard.",
            example: "66123456124124"
        },
        seedEmoji: {
            required: false,
            description: ""
        }
    }}

    constructor(server, options, connectors) {
        super(server, options, connectors);
        this.onDiscordMessage = this.onDiscordMessage.bind(this)
        this.DBLogPlugin = null
    }


    async mount() {
        this.DBLogPlugin = this.server.plugins.find(plugin => plugin instanceof DBLog)
        if (!this.DBLogPlugin) {
            this.verbose(1, `Unable to find db log plugin, unmounting.`)
            return
        }

        this.options.discordClient.on('messageCreate', this.onDiscordMessage);

        // /** @type {sequelize.Model} */
        this.sessionSchema = this.DBLogPlugin.models.Session
        this.playerSchema = this.DBLogPlugin.models.Player

        await this.insertTestData()

        this.verbose(4, "DB session", this.sessionSchema)
        const startOfMonth = getDateTimeOfCurrentMonth(new Date())
        this.verbose(4, "Start of month timestamp", startOfMonth)
        const sessionArray = await getAllSessionsSinceDate(startOfMonth, this.sessionSchema, this.playerSchema)
        this.totalSeedingTimes = processSeedingTimes(sessionArray)
        const leaderboardEmbeds = generateLeaderboardEmbed(this.totalSeedingTimes, startOfMonth)
        await this.sendDiscordMessage({embeds: leaderboardEmbeds})
    }

    async unmount() {
    }

    /**
     *
     * @param event {DiscordMessageEvent}
     */
    async onDiscordMessage(event) {
        // console.log(event)
    }

    async insertTestData() {
        // 1st of January 2024
        const date = new Date(17040672000)
        const date2 = new Date(1704777770)

        /** @type {Session} */
        const mockSession1 = {
            steamID: "76561198078967157",
            sessionStart: date,
            sessionEnd: date2,
            seedingTimeSeconds: 5
        }

        /** @type {Session} */
        const mockSession2 = {
            steamID: "76561198056422171",
            sessionStart: new Date() - 1000000,
            sessionEnd: new Date(),
            seedingTimeSeconds: 500
        }

        /** @type {Session} */
        const mockSession3 = {
            steamID: '76561198057570564',
            sessionStart: new Date() - 2450051,
            sessionEnd: new Date(),
            seedingTimeSeconds: 100000
        }
        /** @type {Session} */
        const mockSession4 = {
            steamID: '76561198014300329',
            sessionStart: new Date() - 245004,
            sessionEnd: new Date(),
            seedingTimeSeconds: 56431
        }

        this.verbose(3, `Succesfully inserted test data...`)
        try {
            await this.sessionSchema.upsert(mockSession1)
            await this.sessionSchema.upsert(mockSession2)
            await this.sessionSchema.upsert(mockSession3)
            await this.sessionSchema.upsert(mockSession4)
            this.verbose(3, `Succesfully inserted mock sessions...`)
            // this.verbose(3, 'Sessions: ', mockSession1, mockSession2, mockSession3)
        } catch (e) {
            this.verbose(1, `Error occurred when inserting data`, e)
        }
    }
}

/**
 *
 * @param sessionArray {SessionWithName[]}
 * @return {Map<string, TotalSeedingTime>}
 */
function processSeedingTimes(sessionArray) {
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
 *
 * @param totalSeedingtimeMap {Map<string, TotalSeedingTime>}
 * @param startTime {Date}
 */
function generateLeaderboardEmbed(totalSeedingtimeMap, startTime) {
    // get top 25 seeders
    /** @type {TotalSeedingTime[]} */
    let sessionTimeArray = Array.from(totalSeedingtimeMap.values())
    sessionTimeArray = sessionTimeArray.sort((a, b) => (Math.round(b.totalSeedingTimeSeconds) - Math.round(a.totalSeedingTimeSeconds)))
    sessionTimeArray = sessionTimeArray.slice(0, 25)

    const playerNames = sessionTimeArray.map((player, i) => {
        return `${i+1}). ${player.playerName.trim()}`
    })

    const minutesOfSeeding = sessionTimeArray.map(player => {
        return Math.round(player.totalSeedingTimeSeconds / 60)
    })

    const steamIDs = sessionTimeArray.map(player => {
        return player.steamID
    })

    const dateString = `${bold(`Top seeders in the period:`)} ${time(startTime, TimestampStyles.ShortDate)} to ${time(new Date(), TimestampStyles.ShortDate)}`

    const embed = new EmbedBuilder()
        .setTitle('Seeding leaderboards for [TT] TacTrig 👑')
        .setColor(Colors.DarkGreen)
        .setDescription(dateString)
        .setTimestamp(new Date())

    embed.addFields([
        { name: 'Name', value: playerNames.join('\n'), inline: true},
        { name: 'SteamID', value: steamIDs.join('\n'), inline: true},
        { name: 'Minutes Spent Seeding', value: minutesOfSeeding.join('\n'), inline: true},
    ])

    // TODO need handling in the case that an embed becomes too long.
    console.log('Embed length: ', JSON.stringify(embed.toJSON()).length);

    return [embed]
}




/**
 * Retrieves all sessions ocurring after the given start time, includes playernames.
 *
 * @param startTime {Date}
 * @param sessionModel sequelize model.
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
        .then(s => s.map(v => v.dataValues))
        .catch(err => {
            console.error(`Error occured when retrieving sessions...\n`, err)
            return []
        })

    /** @type {SessionWithName[]} */
    sessions = sessions.map(element => {
        return {
            steamID: element.steamID,
            playerName: element.DBLog_Player?.dataValues.lastName,
            sessionStart: element.sessionStart,
            sessionEnd: element.sessionEnd,
            seedingTimeSeconds: element.seedingTimeSeconds
        }
    })

    return sessions
}


/**
 *
 * @param date {Date}
 * @param matchModel
 * @return {Promise<void>}
 */
async function getAllMatchesSinceDate(date, matchModel) {



}
















function getDateTimeOfCurrentMonth(date = new Date) {
    // Retrieves a DateTime object that starts at the beginning of the current month
    return new Date(date.getFullYear(), date.getMonth(), 1, 1)
}


