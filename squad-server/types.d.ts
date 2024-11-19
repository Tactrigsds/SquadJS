

export type RawMapData = {
    level: string,
    layer: string,
    factions: string
}

export type MapData = {
    level: string
    layer: string,
    faction1: string,
    faction2: string,
    subfaction1: string | null
    subfaction2: string | null
}

export type Session = {
    steamID: string,
    sessionStart: Date,
    sessionEnd?: Date,
    seedingTimeSeconds: number
}

export type SessionWithName = {
    steamID: string,
    playerName: string,
    sessionStart: Date,
    sessionEnd?: Date,
    seedingTimeSeconds: number
}



export interface TotalSeedingTime {
    steamID: string,
    playerName: string,
    totalSeedingTimeSeconds: number
}

export interface TotalSeedingTimeWithDays extends TotalSeedingTime {
    seedingCount: number
}


export type DBPlayer = {
    steamID: string,
    lastName: string
}

export type DBMatch = {
    id: number,
    dlc: string,
    mapClassname: string,
    layerClassname: string
    map: string,
    layer: string,
    startTime: Date,
    endTime: ?Date,
    tickets: ?string
    winner: ?string
    team1: ?string
    team2: ?string
    team1Short: ?string
    team2Short: ?string
    subfactionTeam1: ?string
    subfactionTeam2: ?string
    subfactionShortTeam1: ?string
    subfactionShortTeam2: ?string
    winnerTeam: ?string
    winnerTeamID: ?number
    isDraw: ?boolean
    server: number
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

/**
 * Represents the data emitted by a discord message event.
 */

export type DiscordMessageEvent = {
    channelId: string,
    guildId: string,
    id: string,
    createdTimestamp: number,
    type: number,
    system: boolean,
    content: string,
    // TODO add user type here
    pinned: boolean,
    tts: boolean,
    nonce: string,
    embeds: any[],
    components: any[],

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


