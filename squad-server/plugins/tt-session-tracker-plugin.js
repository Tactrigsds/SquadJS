import {ServerEvents} from "../utils/constants.js";
import DBLog from "./db-log.js";
import BasePlugin from "./base-plugin.js";


/**
 *
 */



export default class TTSessionTrackerPlugin extends BasePlugin {
    static get description() {
        return ("The<code>Session Tracker</code>Plugin stores player sessions and then stores them in a database." +
        "A minor limitation is that the plugin will only keep track of sessions that were fully complete. I.e. if a player has been playing for a while but if SquadJS is restarted or crashes, the session will never get logged.")
    }

    static get defaultEnabled() {
        return true
    }

    static get optionsSpecification() {
        return {
            sessionCacheInterval: {
                required: false,
                description: "How often the sessions are updated.",
                default: 10
            },
            dbUpdateInterval: {
                required: false,
                description: "How often sessions are pushed and updated in the DB.",
                default: 120
            },
            lowerPlayerCountForSeeding: {
                required: false,
                description: "The lower bound of players where the server may be considered in seeding mode.",
                default: 0
            },
            upperPlayerCountForSeeding: {
                required: false,
                description: "The upper bound of players for the server to be considered in seeding mode.",
                default: 60
            },
            minimumTimeOnServerForSeeding: {
                required: false,
                description: "The minimum amount of time in seconds required for a player before it will be counted towards their seeding score.",
                default: 1800
            },
            // sessionResumptionEnabled: {
            //     required: false,
            //     description: "Whether the plugin will resume sessions that were running prior to a event causing SquadJS to stop, or if a player disconnected.",
            //     default: true
            // },
            disconnectGracePeriodSeconds: {
                required: false,
                description: "The amount of seconds before a session is considered ended, and a new one will be stored if the player disconnects.",
                default: 240
            }
        }
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);
        this.updateAndSaveSessions = this.updateAndSaveSessions.bind(this)
        this.updateAndRestartSessionUpdate = this.updateAndRestartSessionUpdate.bind(this)
        this.onPlayerDisconnected = this.onPlayerDisconnected.bind(this)
        this.onPlayerConnected = this.onPlayerConnected.bind(this)
        this.debug = false
    }

    async unmount() {
        this.server.removeEventListener(this.updateAndRestartSessionUpdate)
    }

    async mount() {
        this.verbose(3, `Loading DBLog plugin...`)
        this.DBLogPlugin = this.server.plugins.find(plugin => plugin instanceof DBLog)
        if (!this.DBLogPlugin) {
            this.verbose(1, `Unable to load DBLog plugin, unmounting.`)
        } else {
            this.verbose(3, `Succesfully loaded DBLog plugin.`)
        }

        if (this.debug) {
            setInterval(async () => {
                for (const session of this.playerSessions.values()) {
                    await this.debugSendSessionDataToPlayer(session)
                }
            },
        8 * 1000)}

        /** @type {Session[]} */
        this.endedPlayerSessions = []

        /** @type {Map<string, Session>} */
        this.playerSessions = initializeSessions(this.server.players, new Map())

        this.lastUpdate = new Date()


        // Periodically update the session cache.
        this.sessionLogger = setInterval(async () => {
            await this.updateAndSaveSessions()
        }, 1000 * this.options.sessionCacheInterval)


        // Periodically updates the DB with the sessions stored in cache/map.
        this.dbUpdater = setInterval(async () => {
            await this.logSessionsToDB(this.playerSessions)
        }, 1000 * this.options.dbUpdateInterval)


        this.server.on(ServerEvents.playerConnected, this.onPlayerConnected)
        this.server.on(ServerEvents.playerDisconnected, this.onPlayerDisconnected)
    }

    async onPlayerConnected() {
        this.verbose(3, `Player connected, updating sessions cache...`)

        await this.updateAndSaveSessions()
        this.sessionLogger = setInterval(async () => {
            await this.updateAndSaveSessions()
        }, 1000 * this.options.sessionCacheInterval)
    }

    async onPlayerDisconnected() {
        this.verbose(3, `Player disconnected, updating sessions cache...`)

        await this.updateAndSaveSessions()
        this.sessionLogger = setInterval(async () => {
            await this.updateAndSaveSessions()
        }, 1000 * this.options.sessionCacheInterval)
    }


    async updateAndRestartSessionUpdate() {
        await this.updateAndSaveSessions()
        this.sessionLogger = setInterval(async () => {
            await this.updateAndSaveSessions()
        }, 1000 * this.options.sessionCacheInterval)
    }


    /**
     *
     * // TODO currently buggy, creates a large desync in the actual seeding time to the reported one.
     * Resumes sessions stored in the DB if they were ended recently enough.
     * @param model
     * @param playerSessions {Map<string, Session>}
     * @param gracePeriodSeconds {number} The seconds before a session is considered finished and a new one will be started.
     */
    async resumeSessions(model, playerSessions, gracePeriodSeconds) {
        const lastSessionsRawData = await model.findAll({
            order: [['sessionStart', 'DESC']],
            limit: 300
        });

        const lastSessions = lastSessionsRawData.map(session => session.dataValues)

        const currentTime = new Date()

        // TODO find a way to avoid overwriting sessions that have already been initialized.
        for (const steamID of playerSessions.keys()) {
            const lastSession = lastSessions.find(session => session.steamID === steamID)

            if (!lastSession) continue

            this.verbose(4, 'Found most recent session: ', lastSession)

            const timeSinceSessionEndSeconds = (currentTime - lastSession.sessionEnd) / 1000

            this.verbose(4, 'Time since session end(seconds): ', timeSinceSessionEndSeconds)
            this.verbose(4, 'Grace period(seconds): ', gracePeriodSeconds)

            if (timeSinceSessionEndSeconds <= gracePeriodSeconds) {
                this.verbose(2, `Within grace period, resuming previous session for player: ${steamID}`)

                const newSession = {
                    steamID: steamID,
                    sessionStart: lastSession.sessionStart,
                    sessionEnd: new Date(),
                    seedingTimeSeconds: lastSession.seedingTimeSeconds
                }

                playerSessions.set(steamID, newSession)
            }
        }
    }

    async updateAndSaveSessions() {
        this.verbose(3, `Updating player sessions...`)

        this.playerSessions = initializeSessions(this.server.players, this.playerSessions)
        // await this.resumeSessions(this.DBLogPlugin.models.Session, this.playerSessions, this.options.disconnectGracePeriodSeconds)

        const currentlySeeding = this.isCurrentlySeeding()
        this.verbose(4, 'Is currently seeding: ', currentlySeeding)

        if (currentlySeeding) {
            this.playerSessions = updateSeedingTimes(this.lastUpdate, new Date(), this.playerSessions)
        }

        this.playerSessions = updateSessions(this.server.players, this.playerSessions, this.endedPlayerSessions, this.lastUpdate, currentlySeeding)

        this.lastUpdate = new Date()
    }

    isCurrentlySeeding() {
        const seedingRegex = /.*seed|.*jensen/i

        if (!this.server.currentMapData) return false
        if (!seedingRegex.test(this.server.currentMapData.layer)) return false

        const pCount = this.server.playerCount

        this.verbose(3, `CurrentlySeeding; pCount: ${pCount}`)
        this.verbose(3, `CurrentlySeeding; lower pcount for seeding: ${this.options.lowerPlayerCountForSeeding}`)
        this.verbose(3, `CurrentlySeeding; upper pcount for seeding: ${this.options.upperPlayerCountForSeeding}`)

        return this.options.lowerPlayerCountForSeeding < pCount && pCount <= this.options.upperPlayerCountForSeeding;
    }

    async logSessionsToDB(sessions) {
        this.verbose(2, `Logging sessions to db...`)
        const sessionDB = this.DBLogPlugin.models.Session

        for (const session of sessions.values()) {
            this.verbose(2, `Adding session to DB: `, session)
            await this.uploadSession(sessionDB, session)
        }

        // Upload final data of ended sessions.
        this.verbose(2, `Updating ended sessions...`)
        for (const session of this.endedPlayerSessions) {
            this.verbose(3, `Uploading sessions`, session)
            await this.uploadSession(sessionDB, session)
            this.endedPlayerSessions.shift()
        }
    }

    /**
     * @param session {Session}
     */
    async debugSendSessionDataToPlayer(session) {
        let msg = `Session tracker debug: \n\n`
        msg += `Your current session time(seconds): ${Math.round((session.sessionEnd - session.sessionStart) / 1000)}\n\n`
        msg += `Your session seeding time(seconds): ${Math.round(session.seedingTimeSeconds)}`
        await this.server.rcon.warn(session.steamID, msg)
    }

    /**
     * Utility function to create or update a session to the DB.
     * @param model {ModelCtor<Model>} Databasa model/schema.
     * @param session {Session}
     */
    async uploadSession(model, session) {
        await model.upsert(
            {
                steamID: session.steamID,
                sessionStart: session.sessionStart,
                sessionEnd: session.sessionEnd,
                seedingTimeSeconds: session.seedingTimeSeconds
            }
        )
    }
}

/**
 * Initializes player sessions if they don't exist, i.e. when someone has joined the server.
 *
 * @param playersInServer {Player[]} The players currently in the server
 * @param sessions {Map<string, Session>} The currently set sessions
 * @return {Map<string, Session>} A map of sessions
 */
export function initializeSessions(playersInServer, sessions) {
    /** @type {Map<string, Session>} */
    const newSessions= structuredClone(sessions)

    const date = new Date()
    for (const player of playersInServer) {
        if (!sessions.get(player.steamID)) {
            newSessions.set(player.steamID, {
                steamID: player.steamID,
                sessionStart: date,
                sessionEnd: date,
                seedingTimeSeconds: 0
            })
        }
    }

    return newSessions
}

/**
 *  Updates the sessionEnd field, and removes players no longer in the server from the session map.
 *
 * @param playersInServer {Player[]} Players currently in the server
 * @param sessions {Map<string, Session>} Current sessions
 * @param endedSessions {Session[]} Array of sessions already ended
 * @return {Map<string, Session>} Updated sessions
 */
export function updateSessions(playersInServer, sessions, endedSessions) {
    const currentTime = new Date()

    for (const [steamID, session] of sessions) {
        const playerInServer = playersInServer.some(player => {
            return player.steamID === steamID
        })

        session.sessionEnd = currentTime

        // Remove players no longer in the server.
        if (!playerInServer) {
            sessions.delete(steamID)
            endedSessions.push(session)
        }
    }

    return sessions
}


/**
 * @param lastUpdateTime {Date}
 * @param currentTime {Date}
 * @param sessions {Map<string, Session>}
 */
export function updateSeedingTimes(lastUpdateTime, currentTime, sessions) {
    const tDelta = currentTime - lastUpdateTime
    const tDeltaSeconds = tDelta / 1000

    for (const session of sessions.values()) {
        session.seedingTimeSeconds += tDeltaSeconds
    }
    return sessions
}


