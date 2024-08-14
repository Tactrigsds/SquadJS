import BasePlugin from './base-plugin.js';

export default class NextLayerSet extends BasePlugin {
  static get description() {
    return (
        'Plugin intended to warn admins playing on the server if someone has changed the next map.' +
        "it's not possible to see whom has changed the map, just that it has been done."
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      warnAdminsIfNextNotSet: {
        required: false,
        description: "Whether the plugin should warn admins if the next map has not been set.",
        default: false
      },
      nextNotSetDelaySeconds: {
        required: false,
        description: "The delay into the round before the check happens and admins will be warned.",
        default: 60 * 15
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onSetMap = this.onSetMap.bind(this);
    this.onNewGame = this.onNewGame.bind(this);
  }

  async mount() {
    this.server.on('MAP_SET', this.onSetMap);
    this.server.on('NEW_GAME', this.onNewGame)
  }

  async unmount() {
    this.server.removeEventListener('MAP_SET', this.onSetMap);
  }

  async onSetMap(info) {
    this.verbose(1, 'Next layer set has been detected, it has been set to: ' + info.nextLayer)
    let message = `The next layer has been set to: ${info.nextLayer}.`
    // If there are subfactions or factions given when the layer was set.
    if (info.nextFactions) {
      message += `\n`
      message += `Factions: ${info.nextFactions}`
    }
    
    await this.server.warnAllAdmins(message)
    this.server.nextLayerSet = true
  }

  async onNewGame(info) {
    this.nextMapSetCheck = setTimeout(async () => {
      if (!this.server.nextLayerSet) {
        this.server.warnAllAdmins(`SquadJS: The next map has not been set, please consider map options and starting a vote.`)
        }
      },
      this.options.nextNotSetDelaySeconds * 1000)
  }
}
