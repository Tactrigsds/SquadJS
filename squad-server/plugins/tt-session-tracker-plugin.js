import DiscordBasePlugin from "./discord-base-plugin.js";
import {ChatsEnum, ServerEvents} from "../utils/constants.js";



/**
 *
 */



export default class TTSessionTrackerPlugin extends DiscordBasePlugin {
    static get description() {
        return ("The<code>Session Tracker</code>Plugin stores player sessions and then stores them in a database." +
        "A minor limitation is that the plugin will only keep track of sessions that were fully complete. I.e. if a player has been playing for a while but if SquadJS is restarted or crashes, the session will never get logged.")
    }

    static get defaultEnabled() {
        return true
    }

    static get optionsSpecification() {
        return {
            ...DiscordBasePlugin.optionsSpecification,
            updateInterval: {
                required: false,
                description: "How often the sessions are updated.",
                default: 30
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
                description: "The minimum amount of time required for a player before it will be counted towards their seeding score."
            }
        }
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);
        this.updatePlayerSessions = this.updatePlayerSessions.bind(this)
    }

    async unmount() {
        // this.server.removeEventListener(this.onChatMessage)
    }

    async mount() {
        // this.server.on(ServerEvents.chatMessage, this.onChatMessage)

        /** @type {Map<string, Session>} */
        this.playerSessions = new Map()

        /** @type {Session[]} */
        this.endedPlayerSessions = []
        this.lastUpdate = new Date()

        this.updatePlayerSessions()
        this.sessionLogger = setInterval(async () => {
            console.log(this.server.players);
            this.updatePlayerSessions()
        }, 1000 * this.options.updateInterval)
    }

    updatePlayerSessions() {
        this.verbose(3, `Updating player sessions...`)
        this.currentlySeeding = this.isCurrentlySeeding()

        if (this.currentlySeeding) {
            this.playerSessions = updateSeedingTimes(this.lastUpdate, new Date(), this.playerSessions)
        }

        this.playerSessions = initializeSessions(this.server.players, this.playerSessions)
        this.playerSessions = updateSessions(this.server.players, this.playerSessions, this.endedPlayerSessions)
        this.lastUpdate = new Date()
        // console.log("Active sessions: ", this.playerSessions)
        // console.log("Ended sessions: ", this.endedPlayerSessions)
    }

    isCurrentlySeeding() {
        const seedingRegex = /seed|jensen/i

        if (!this.server.currentMapData) return false
        if (!seedingRegex.test(this.server.currentMapData.layer)) return false

        const pCount = this.server.playerCount

        this.verbose(3, `CurrentlySeeding; pCount: ${pCount}`)
        this.verbose(3, `CurrentlySeeding; lower pcount for seeding: ${this.options.lowerPlayerCountForSeeding}`)
        this.verbose(3, `CurrentlySeeding; upper pcount for seeding: ${this.options.upperPlayerCountForSeeding}`)

        return pCount > this.options.lowerPlayerCountForSeeding && pCount <= this.options.upperPlayerCountForSeeding;
    }
}

/**
 * Initializes player sessions if they don't exist, i.e. when someone has joined the server.
 * @param playersInServer {Player[]} The players currently in the server
 * @param playerSessions {Map<string, Session>} The currently set sessions.
 * @return {Map<string, Session>}
 */
export function initializeSessions(playersInServer, playerSessions) {
    /** @type {Map<string, Session>} */
    const newSessions= structuredClone(playerSessions)

    const date = new Date()
    for (const player of playersInServer) {
        if (!playerSessions.get(player.steamID)) {
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
 *
 * @param playersInServer {Player[]}
 * @param playerSessions {Map<string, Session>}
 * @param endedSessions {Session[]}
 * @return {Map<string, Session>}
 */
export function updateSessions(playersInServer, playerSessions, endedSessions) {
    const date = new Date()

    for (const [steamID, session] of playerSessions) {
        const playerInServer = playersInServer.some(player => {
            return player.steamID === steamID
        })

        session.sessionEnd = date

        if (!playerInServer) {
            playerSessions.delete(steamID)
            endedSessions.push(session)
        }
    }

    return playerSessions
}


/**
 *
 * @param lastUpdateTime {Date}
 * @param currentTime {Date}
 * @param sessions {Map<string, Session>}
 */
export function updateSeedingTimes(lastUpdateTime, currentTime, sessions) {
    const tDelta = currentTime - lastUpdateTime
    const tDeltaSeconds = tDelta / 1000

    for (const [steamID, session] of sessions) {
        session.seedingTimeSeconds += tDeltaSeconds
    }
    return sessions
}


/**
 * Sets a session as ended if a player in the sessionsmap are detected among the players on the server.
 * @param players {Player[]}
 * @param playerSessions {Map<string, Session>}
 */
export function setEndSessions(players, playerSessions) {
    /** @type {Map<string, Session>} */
    const newSessions = new Map()

    for (const [steamID, session] of playerSessions) {
        const playerInServer = players.some(player => {
            return player.steamID === steamID
        })

        const newSession /** @type{Session} */ = {
            steamID: steamID,
            sessionStart: session.sessionStart
        }

        if (!playerInServer) newSession.sessionEnd = new Date();

        newSessions.set(steamID, newSession)
    }

    return newSessions
}

/**
 * @param playerSessions {Map<string, Session>} A map of current player sessions.
 * @param endedSessions {Map<string, Session>} A reference to an existing map keeping track of ended sessions, which can then be utilized at a later point, e.g. put in a database.
 */
export function logEndedSessions(playerSessions, endedSessions) {
    /** @type {Map<string, Session>} */
    const newSessions= new Map()

    for (const [steamID, session] of playerSessions) {
        if (session?.sessionEnd) {
            endedSessions.set(steamID, session)
        } else {
            newSessions.set(steamID, session)
        }
    }

    return newSessions
}