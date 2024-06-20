import DiscordBasePlugin from './discord-base-plugin.js';

export default class DiscordTickRateWarn extends DiscordBasePlugin {
  static get description() {
    return '';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: true,
        description: 'The ID of the channel to send the tickrate warn message',
        default: '',
        example: '667741905228136459'
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onTickRate = this.onTickRate.bind(this);
  }

  async mount() {
    this.server.on('TICK_RATE', this.onTickRate);
  }

  async onTickRate(info) {
    const channel = await this.options.discordClient.channels.fetch(this.options.channelID);

    let message = {};

    if (info.tickRate <= 20) {
      message = {
        content: `WARNING: Server TICKRATE IS: ${info.tickRate}`
      };
      channel.send(message);
    }
  }
}
