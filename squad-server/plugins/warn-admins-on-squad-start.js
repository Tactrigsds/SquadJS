import BasePlugin from './base-plugin.js';

export default class WarnAdminsOnSquadStart extends BasePlugin {
    static get description() {
        return (
            "Plugin meant to allow users to kill themselves(i.e double swap themselves) so they can get rid of the running man bug"
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
