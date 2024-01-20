import BasePlugin from './base-plugin.js';

export default class SelfReset extends BasePlugin {
    static get description() {
        return (
            "Plugin meant to allow users to kill themselves(i.e double swap themselves) so they can get rid of the running man bug"
        );
    }
    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            command: {
                required: false,
                description: 'The command used to commit suicide.',
                default: ['!reset']
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.onChatCommand = this.onChatCommand.bind(this);
    }

    async mount() {
        this.server.on(`CHAT_MESSAGE`, this.onChatCommand);
    }

    async unmount() {
        this.server.removeEventListener(`CHAT_MESSAGE`, this.onChatCommand);
    }

    async onChatCommand(info) {
        const regexes = [
            /runnin'?g?\s*man/i,
            /loadin'?g\s*screen/i,
            // /stuck/i
        ]
        if (!(info.message.toLowerCase() === "!runningman")) {
            for (const regex of regexes) {
                if (regex.test(info.message.toLowerCase())) {
                    await this.server.rcon.warn(info.steamID,
                        `If you have the "running man" bug, you can use the ${this.options.command[0]} command to reset yourself.`)

                    setTimeout(async () => {
                        await this.server.rcon.warn(info.steamID,
                        `If you have the "running man" bug, you can use the ${this.options.command[0]} command to reset yourself.`)
                    }, 1000)
                    break;
                }
            }
        }

        if (this.options.command.includes(info.message.toLowerCase())) {
            const killSwitchDelay = 2000

            this.server.rcon.forceTeamChange(info.steamID)
            setTimeout(async () => {
                await this.server.rcon.forceTeamChange(info.steamID)
            }, killSwitchDelay);
        }

    }
}
