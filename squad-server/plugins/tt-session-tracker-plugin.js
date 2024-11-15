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

        }
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);
        this.onChatMessage = this.onChatMessage.bind(this)
    }

    async unmount() {
        this.server.removeEventListener(this.onChatMessage)
    }

    async mount() {
        this.server.on(ServerEvents.chatMessage, this.onChatMessage)

        /** @type {Map<string, Session>} */
        this.playerSessions = new Map()

        /** @type {Map<string, Session>} */
        this.endedPlayerSessions = new Map()

        this.sessionLogger = setInterval(async () => {
            console.log(this.server.players);
            this.updatePlayerSessions()
        }, 10 * 1000)
    }

    updatePlayerSessions() {
        this.playerSessions = initializeSessions(this.server.players, this.playerSessions)
        this.playerSessions = updateSessions(this.server.players, this.playerSessions, this.endedPlayerSessions)
    }




    // /**
    //  *
    //  * @param messageEvent {ChatMessageEvent}
    //  * @return
    //  */
    // async onChatMessage(messageEvent) {
    //     if (messageEvent.chat !== ChatsEnum.AdminChat) return;
    //     // this.server.players
    //
    //     console.log('')
    // }
}

/**
 * Initializes player sessions if they don't exist, i.e. when someone has joined the server.
 * @param playersInServer {Player[]} The players currently in the server
 * @param playerSessions {Map<string, Session>} The currently set sessions.
 * @return {Map<string, Session>}
 */
export function initializeSessions(playersInServer, playerSessions) {
    /** @type {Map<string, Object>} */
    const newSessions= structuredClone(playerSessions)

    const date = new Date()
    for (const player of playersInServer) {
        if (!playerSessions.get(player.steamID)) {
            newSessions.set(player.steamID, {
                steamID: player.steamID,
                sessionStart: date,
                sessionEnd: date
            })
        }
    }

    return newSessions
}

/**
 *
 * @param playersInServer {Player[]}
 * @param playerSessions {Map<string, Session>}
 * @param endedSessions {Map<string, Session>}
 * @return {Map<string, Session>}
 */
export function updateSessions(playersInServer, playerSessions, endedSessions) {
    for (const [steamID, session] of playerSessions) {
        const playerInServer = playersInServer.some(player => {
            return player.steamID === steamID
        })

        session.sessionEnd = new Date()

        if (!playerInServer) {
            playerSessions.delete(steamID)
            endedSessions.set(steamID, session)
        }
    }

    return playerSessions
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