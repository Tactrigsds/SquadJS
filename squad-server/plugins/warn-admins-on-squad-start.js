import BasePlugin from './base-plugin.js';

export default class WarnAdminsOnSquadStart extends BasePlugin {
    static get description() {
        return (
            "Plugin that warns admins when the server has been restarted."
        );
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
        this.server.warnAllAdmins(`SquadJS has been restarted.`)
    }

    async unmount() {}
}
