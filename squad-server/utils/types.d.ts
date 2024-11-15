

export type MapData = {
    level: string,
    layer: string,
    factions: string
}


export type Session = {
    steamID: string,
    sessionStart: Date,
    sessionEnd?: Date
}


/**
 * Represents the data emitted by the "CHAT_MESSAGE" event on the server object.
 */
export type ChatMessageEvent = {
    message: string,
    steamID: string
    eosID: string,
    chat: string,
    player: Player
    time: Date
}

export interface PluginOption {
    required: boolean,
    description: string
    default: any
    example: any
}

/**
 * Represents an in-game player.
 */
export interface Player {
    playerID: number,
    name: string,
    teamID: number,
    squadID?: number,
    isLeader: boolean,
    role: string,
    eosID: string,
    steamID: string,
    playercontroller: any,
    squad: null | Squad,
    suffix: string
    possessClassname: string
}

/**
 * Represents an in-game squad.
 */
export interface Squad {
    squadID: number,
    squadName: string,
    size: string,
    locked: string,
    creatorName: string,
    teamID: number,
    teamName: string,
    creatorEOSID: string,
    creatorSteamID: string
}



/*
Auto rotation types
*******************************************************************************
 */


/*
Custom rotation plugin types
*******************************************************************************
 */

export interface LayerDataV1 {
    level: string,
    layer: string
    size: string,
    faction1: string,
    faction2: string,
    subfaction1: string,
    subfaction2: string
}

export interface LayerDataV2 {

}


