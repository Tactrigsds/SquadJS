interface RawMapData {
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


interface PlayerSession {
    steamID: string,
    sessionStart: Date,
    sessionEnd?: Date,
    seedingTimeSeconds: number
    squadLeaderTimeSeconds?: number
}


interface SessionWithName extends PlayerSession {
    playerName: string,
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
    id: string
    steamID: string,
    eosID: ?string
    lastName: string
    lastIP: ?string
}

/**
 * Represents a match as it is stored in the database.
 */
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

export type DiscordMessageEvent = discordMessageMethods & {
    channelId: string,
    guildId: string,
    id: string,
    createdTimestamp: number,
    type: number,
    system: boolean,
    content: string,
    author: discordMessageAuthor
    pinned: boolean,
    tts: boolean,
    nonce: string,
    embeds: any[],
    components: any[],
    attachments: any[],
    stickers: any[],
    position: any | null,
    roleSubscriptionData: any | null
    resolved: null
    editedTimestamp: any | null
    reactions: any
    mentions: any
    webhookId: any | null
    groupActivityApplication: any | null
    applicationId: any | null
    activity: any | null
    flags: any | null
    reference: any | null
    interactionMetadata: any | null
    interaction: any | null
    poll: any | null
    call: any | null
}

export type discordMessageMethods = {
    awaitMessageComponent: any,
    delete: () => void
    edit: (data: string) => void
    pin: (reason: ?string) => void
    reply: (data: string) => void
}

export type discordMessageAuthor = {
    id: string,
    bot: boolean,
    system: boolean,
    flags: any,
    username: string,
    globalName: string,
    discriminator: string,
    avatar: string | null
    banner: undefined | null
    accentColor: undefined | null
    avatarDecoration: null
    avatarDecorationData: null
}

interface altCheckResult {
    steamIDs: string[]
    IPs: string[]
    playerProfiles: [{
        id: number,
        eosID: string,
        steamID: string,
        lastName: string,
        lastIP: string
    }]
}

interface playerConnectedEvent {
    raw: string,
    time: Date,
    chainID: string,
    playercontroller: string
    ip: string,
    player: Player
}


interface PeriodType {
    type: "month" | "bimonthly" | "weekly"
}


interface PeriodData {
    periodStart: Date,
    periodEnd: Date,
    periodType: "month" | "bimonthly" | "weekly",
    sendNoEarlierThan: Date
    broadcastSent: boolean
    leaderBoardDataSaved: boolean
}


interface LeaderboardData {
    steamID: string,
    periodStart: Date,
    periodEnd: Date,
    seedingTime: number,
    squadLeadTime: number,
    leaderboardType: string,
    discordRoleApplied: "APPLIED" | "NOT APPLIED" | "UNKNOWN ACCOUNT"
}


export interface DiscordGuildUser {
}

export interface GuildUser {

}
export interface PluginOption {
    required: boolean,
    description: string
    default: any
    example: any
}

/**
 * An in-game player as represented by SquadJS.
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

export interface LayerDataV2 extends LayerDataV1 {
    logisticsScore1: number
    logisticsScore2: number
    transportationScore1: number
    transportationScore2: number
    antiInfantryScore1: number
    antiInfantryScore2: number
    armorScore1: number
    armorScore2: number
    zeroScore1: number
    zeroScore2: number
    balanceDifferential: number
}


export interface LayerDataV3 extends LayerDataV2 {
    asymmetryScore: number
}

interface FactionSubfaction {
    faction: string
    subfaction: string
}


interface InitialLayerlistFilterOptions {
    // TODO make this more specific
    rawLayerList: LayerDataV1[] | object[]
    logger?: object,
    listName: string,
    balanceDifferential: number,
    asymmetryDifferential: number,
    gameMode: "RAAS" | "AAS" | "TC" | "Skirmish" | "Seed" | "Invasion" | "Insurgency" | "Destruction"
    bannedMaps?: string[]
    bannedLayers?: string[]
    bannedFactions?: string[]
    bannedGlobalSubfactions?: string[]
    removeLargeLayersWithLowTransportScore?: transportScoreOption
}





interface transportScoreOption {
    enabled: boolean,
    minimumTransportScore: number
}
