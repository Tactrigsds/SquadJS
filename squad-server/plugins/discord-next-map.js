import DiscordBasePlugin from './discord-base-plugin.js';

export default class DiscordNextMap extends DiscordBasePlugin {
  static get description() {
    return 'The <code>DiscordRoundWinner</code> plugin will send the round winner to a Discord channel.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: true,
        description: 'The ID of the channel to log admin broadcasts to.',
        default: '',
        example: '667741905228136459'
      },
      color: {
        required: false,
        description: 'The color of the embed.',
        default: 16761867
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onNewGame = this.onNewGame.bind(this);
  }

  async mount() {
    this.server.on('NEW_GAME', this.onNewGame);
  }

  async unmount() {
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
  }

  async onNewGame(info) {
    await this.sendDiscordMessage({
      embed: {
        timestamp: info.time.toISOString(),
        footer: {
          text: 'Map changed to: ' + this.server.layerHistory[0].layer.name
        }
      }
    });
  }
}
