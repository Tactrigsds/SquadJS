import BasePlugin from './base-plugin.js';

import { COPYRIGHT_MESSAGE } from '../utils/constants.js';

export default class DiscordBasePlugin extends BasePlugin {
  static get optionsSpecification() {
    return {
      discordClient: {
        required: true,
        description: 'Discord connector name.',
        connector: 'discord',
        default: 'discord'
      }
    };
  }

  async prepareToMount() {
    try {
      this.channel = await this.options.discordClient.channels.fetch(this.options.channelID);
      this.verbose(1, `Fetched Discord channel "${this.channel?.name}" (${this.options.channelID}).`);
    } catch (error) {
      this.channel = null;
      this.verbose(
        1,
        `Could not fetch Discord channel with channelID "${this.options.channelID}". Error: ${error.message}`
      );
      this.verbose(2, `${error.stack}`);
    }
  }

  async sendDiscordMessage(message) {
    if (!this.channel) {
      this.verbose(1, `Could not send Discord Message. Channel not initialized.`);
      return;
    }

    if (typeof message === 'object' && 'embed' in message) {
      message.embed.footer = message.embed.footer || { text: COPYRIGHT_MESSAGE };
      if (typeof message.embed.color === 'string')
        message.embed.color = parseInt(message.embed.color, 16);
      message = { ...message, embeds: [message.embed] };
    }

    try {
      await this.channel.send(message);
    } catch (error) {
      this.verbose(1, `Failed to send Discord message to channel ${this.options.channelID}. Error: ${error.message}`);
      this.verbose(2, `${error.stack}`);
    }
  }
}
