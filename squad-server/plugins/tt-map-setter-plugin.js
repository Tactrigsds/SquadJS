import DiscordBasePlugin from "./discord-base-plugin.js";
import {ChatsEnum, ServerEvents} from "../utils/constants.js";


/**
 *
 */


export default class TTMapSetterPlugin extends DiscordBasePlugin {
    static get description() {
        return "Plugin used for setting specific layers and factions from codes used in the chat."
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
    }


    /**
     *
     * @param messageEvent {ChatMessageEvent}
     * @return
     */
    async onChatMessage(messageEvent) {
        if (messageEvent.chat !== ChatsEnum.AdminChat) return;

        console.log('')
    }
}


