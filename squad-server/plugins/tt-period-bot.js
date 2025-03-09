/**
 * Plugin/bot that handles the event when the leaderboard turns moves over into a new period.
 * Functionality includes storing the top players in a set leaderboard.
 *
 */
import DiscordBasePlugin from "./discord-base-plugin.js";
import sequelize, {DataTypes, Model} from "sequelize";
import TTSeedingLeaderboard, {
    initializePeriodDB,
    isCurrentlyInPeriod, retrieveAndProcessDataFromPeriod,
    retrievePeriodData
} from "./tt-seeding-leaderboard.js";
import DBLog from "./db-log.js";

export default class TTPeriodBot extends DiscordBasePlugin {

    static get description() {
        return ""
    }

    static get defaultEnabled() {
        return true
    }

    static get optionsSpecification() {
        return {
            ...DiscordBasePlugin.optionsSpecification,
            database: {
                required: true,
                description: "Connector to the database where data about leaderboard winners will be stored.",
                connector: "sequelize",
                default: "mysql"
            }
        }
    }
    constructor(server, options, connectors) {
        super(server, options, connectors);
        this.leaderboardModel = null;
        this.playersToLog = 25
    }

    async mount() {
        super.mount();
        this.leaderboardModel = await initializeTopSeederModel(this.options.database)
        this.leaderboardPlugin = await this.server.plugins.find(plugin => plugin instanceof TTSeedingLeaderboard)
        this.DBLogPlugin = this.server.plugins.find(plugin => plugin instanceof DBLog)
        if (!this.DBLogPlugin) {
            this.verbose(1, `Unable to find db log plugin, unmounting.`)
            return await this.unmount()
        }

        await this.leaderboardModel.sync()

        this.periodModel = await initializePeriodDB(this.leaderboardPlugin.options.sqliteDB)
        this.sessionSchema = this.DBLogPlugin.models.Session
        this.playerSchema = this.DBLogPlugin.models.Player
        this.matchModel = this.DBLogPlugin.models.Match

        await this.periodChecker()
    }


    async periodChecker() {
        const periodsData = await retrievePeriodData(this.periodModel)

        const currentPeriod = periodsData.at(-1)
        const lastPeriod = periodsData.at(-2)
        const data = await retrieveAndProcessDataFromPeriod(currentPeriod.periodStart, currentPeriod.periodEnd, this.sessionSchema, this.playerSchema, this.matchModel, this.leaderboardPlugin.options.minSeedingTimeInDaySeconds)
        if (isCurrentlyInPeriod(currentPeriod) && lastPeriod) {
            if(!lastPeriod.leaderBoardDataSaved) {
                // const data = await retrieveAndProcessDataFromPeriod(lastPeriod.periodStart, lastPeriod.periodEnd, this.sessionSchema, this.playerSchema, this.matchModel, this.leaderboardPlugin.options.minSeedingTimeInDaySeconds)
                await insertSeedingTimeLeaderBoard(this.leaderboardModel, lastPeriod, data.totalSeedingTimes, this.playersToLog)
                await insertLeaderboardCountData(this.leaderboardModel, lastPeriod, data.timesSeeded, this.playersToLog)
            }
        }

        if (!lastPeriod.broadcastSent) {
            // TODO send msg in command channel here.
            const msg = `SquadJS automatic warning. Remember to congratulate top seeders.`
        }
    }





    async unmount() {
        super.unmount();
    }


    async sendDiscordMessage(message) {
        return super.sendDiscordMessage(message);
    }


    /**
     * @param periodData {PeriodData}
     */
    onPeriodEnded(periodData) {

    }


    /**
     * @param messageEvent {DiscordMessageEvent}
     */
    onDiscordMessage(messageEvent) {

    }

}


/**
 * @param sequelize {Sequelize}
 */
export async function initializeTopSeederModel(sequelize) {
    return sequelize.define('DBLog_LeaderBoard', {
        steamID: {
            type: DataTypes.STRING,
            notNull: true,
        },
        periodStart: {
            type: DataTypes.DATE,
            notNull: true
        },
        periodEnd: {
            type: DataTypes.DATE,
            notNull: true
        },
        seedingTime: {
            type: DataTypes.FLOAT,
        },
        seedingCount: {
            type: DataTypes.INTEGER
        },
        squadLeadTime: {
            type: DataTypes.FLOAT,
        },
        leaderBoardType: {
            type: DataTypes.STRING,
            notNull: true
        },
        discordRoleApplied: {
            type: DataTypes.ENUM(
                'APPLIED', 'NOT APPLIED', 'UNKNOWN ACCOUNT'
            )
        },
    }, {
        timestamps: false,
    })
}

/**
 * @param leaderBoardModel {Model}
 * @param periodData {PeriodData}
 * @param seedingTimeMap {Map<string, TotalSeedingTime>}
 * @param recordsToInsert {number}
 * @return {Promise<void>}
 */
async function insertSeedingTimeLeaderBoard(
    leaderBoardModel,
    periodData ,
    seedingTimeMap,
    recordsToInsert,
) {

    const sortedLeaderboardData = []
    seedingTimeMap.forEach((seedingTime, steamID) => {
        sortedLeaderboardData.push({
            steamID: steamID,
            seedingTime: seedingTime
        })
    })

    sortedLeaderboardData.sort((a, b) => b.seedingTime - a.seedingTime)
    sortedLeaderboardData.slice(0, recordsToInsert)

    for (const lbData of sortedLeaderboardData) {
        await leaderBoardModel.create({
            steamID: lbData.steamID,
            periodStart: periodData.periodStart,
            periodEnd: periodData.periodEnd,
            seedingTime: lbData.seedingTime,
            squadLeadTime: null,
            leaderBoardType: "SEEDING_TIME",
            discordRoleApplied: "NOT APPLIED"
        })
    }
}




/**
 * @param leaderBoardModel {Model}
 * @param periodData {PeriodData}
 * @param seedingCountMap {Map<string, number>}
 * @param recordsToInsert {number}
 * @return {Promise<void>}
 */
async function insertLeaderboardCountData(
    leaderBoardModel,
    periodData ,
    seedingCountMap,
    recordsToInsert,
) {
    const data = []
    seedingCountMap.forEach((seedingCount, steamID) => {
        data.push({
            steamID: steamID,
            seedingCount: seedingCount
        })
    })
    data.sort((a, b) => b.count - a.count)
    data.slice(0, recordsToInsert)
    for (const lbData of data) {
        await leaderBoardModel.create({
            steamID: lbData.steamID,
            periodStart: periodData.periodStart,
            periodEnd: periodData.periodEnd,
            seedingCount: data.seedingCount,
            leaderBoardType: "SEEDING_COUNT",
            discordRoleApplied: "NOT APPLIED"
        })
    }
}




