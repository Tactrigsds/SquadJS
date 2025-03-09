import BasePlugin from './base-plugin.js';

export default class TTWarnAdminsOnSquadjsStart extends BasePlugin {
    static get description() {
        return "The<code>TT Warn Admins On SquadJS Start</code> warns admins whenever SquadJS starts up."
    }
    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {};
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);
    }

    async mount() {
        await this.server.warnAllAdmins(`AUTOMATIC WARNING TO ADMINS: \nSquadJS has been restarted.`)
    }

    async unmount() {}
}
