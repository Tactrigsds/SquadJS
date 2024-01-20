import DiscordBasePlugin from "./discord-base-plugin.js";

export default class NextLayerSet extends DiscordBasePlugin {
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
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: true,
        description: 'The ID of the channel that layer changes will be broadcast to',
        default: '',
        example: '667741905228136459'
      },
      warnMessage: {
        required: false,
        default: ''
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onSetMap = this.onSetMap.bind(this);
  }

  async mount() {
    this.server.on('MAP_SET', this.onSetMap);
  }

  async unmount() {
    this.server.removeEventListener('MAP_SET', this.onSetMap);
  }


  async onSetMap(info) {
    // Gets the list of all admins with permissions to see adminchat on the server, checks which ones are online,
    // And then warns once next layer has been set.
    const onlineAdminListWithPerms = this.server.getAdminsWithPermission('canseeadminchat');
    const adminNotifyList = [];
    for (const player of this.server.players) {
      if (onlineAdminListWithPerms.includes(player.steamID)) {
        adminNotifyList.push(player.steamID);
      }
    }
    // Iterate through new array to notify all online admins
    for (const admin of adminNotifyList) {
      await this.server.rcon.warn(
          admin, `The next layer has been set to: ${info.nextLayer}`
      );
    }

  }
}
