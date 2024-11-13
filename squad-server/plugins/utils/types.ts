/**
 * Represents the data emitted by the "CHAT_MESSAGE" event on the server object.
 */
export type ChatMessageEvent = {
    message: string,
    steamID: string
    eosID: string,
    chat: string,
    player: any
    time: Date
}

export interface PluginOption {
    required: boolean,
    description: string
    default: any
    example: any
}