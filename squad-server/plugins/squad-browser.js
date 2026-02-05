// Corrupted Infantry game browser plugin
//source:
//https://discord.com/channels/684440850251382786/685879868381986849/1410384287898931201

import BasePlugin from './base-plugin.js';
import axios from "axios"

export default class SquadBrowser extends BasePlugin {
    static get description() {
        return (
            "Sends all players Steam64 IDs to SquadBrowser"
        );
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            API_KEY: {
                required: true,
                description: 'API Key.',
                default: ""
            },
            ENDPOINT: {
                required: true,
                description: "SquadBrowser endpoint",
                default: ""
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);
        this.sendPlayers = this.sendPlayers.bind(this);
    }

    async mount() {
        this.interval = setInterval(this.sendPlayers, 60 * 1000);
        await this.sendPlayers();
    }

    async unmount() {
        clearInterval(this.interval);
    }

    async sendPlayers() {
        try {
            await axios.post(this.options.ENDPOINT + "/api/updateServer", {
                serverName: this.server.serverName,
                key: this.options.API_KEY,
                players: this.server.players.map((player) => player.steamID)
            });
        } catch (err) { }
    }
}