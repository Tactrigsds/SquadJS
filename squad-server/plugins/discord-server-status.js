import Discord from 'discord.js';
import tinygradient from 'tinygradient';

import { COPYRIGHT_MESSAGE } from '../utils/constants.js';

import DiscordBaseMessageUpdater from './discord-base-message-updater.js';

export default class DiscordServerStatus extends DiscordBaseMessageUpdater {
  static get description() {
    return 'The <code>DiscordServerStatus</code> plugin can be used to get the server status in Discord.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBaseMessageUpdater.optionsSpecification,
      command: {
        required: false,
        description: 'Command name to get message.',
        default: '!status'
      },
      updateInterval: {
        required: false,
        description: 'How frequently to update the time in Discord.',
        default: 60 * 1000
      },
      setBotStatus: {
        required: false,
        description: "Whether to update the bot's status with server information.",
        default: true
      },
      serverGuildID: {
        required: false,
        description: 'Server HQ Role resides on',
        default: ''
      },
      serverRoleID: {
        required: false,
        description: 'HQ Role, so !status can only be used by HQ',
        default: ''
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.updateMessages = this.updateMessages.bind(this);
    this.updateStatus = this.updateStatus.bind(this);
  }

  async mount() {
    await super.mount();
    this.updateInterval = setInterval(this.updateMessages, this.options.updateInterval);
    this.updateStatusInterval = setInterval(this.updateStatus, this.options.updateInterval);
  }

  async unmount() {
    await super.unmount();
    clearInterval(this.updateInterval);
    clearInterval(this.updateStatusInterval);
  }

  async generateMessage() {
    const embed = new Discord.MessageEmbed();

    // Set embed title.
    embed.setTitle(this.server.serverName);

    // Set player embed field.
    let players = '';

    players += `${this.server.a2sPlayerCount}`;
    if (this.server.publicQueue + this.server.reserveQueue > 0)
      players += ` (+${this.server.publicQueue + this.server.reserveQueue})`;

    players += ` / ${this.server.publicSlots}`;
    if (this.server.reserveSlots > 0) players += ` (+${this.server.reserveSlots})`;

    embed.addField('Players', players);

    // Custom fix for if layers aren't loaded properly
    if (this.server.currentLayer === null) {
      this.server.currentLayer = await this.server.rcon.getCurrentMap();
    }

    if (this.server.nextLayer === null) {
      this.server.nextLayer = await this.server.rcon.getNextMap();
    }

    // Set layer embed fields.
    embed.addField(
      'Current Layer',
      `\`\`\`${this.server.currentLayer?.name || this.server.currentLayer.layer}\`\`\``,
      true
    );
    embed.addField(
      'Next Layer',
      `\`\`\`${
        this.server.nextLayer?.name ||
        (this.server.nextLayerToBeVoted ? 'To be voted' : this.server.nextLayer.layer)
      }\`\`\``,
      true
    );

    // Set layer image.
    embed.setImage(
      this.server.currentLayer
        ? `https://squad-data.nyc3.cdn.digitaloceanspaces.com/main/${this.server.currentLayer.layerid}.jpg`
        : undefined
    );

    // Set timestamp.
    embed.setTimestamp(new Date());

    // Set footer.
    embed.setFooter(COPYRIGHT_MESSAGE);

    // Clamp the ratio between 0 and 1 to avoid tinygradient errors.
    const ratio = this.server.a2sPlayerCount / (this.server.publicSlots + this.server.reserveSlots);
    const clampedRatio = Math.min(1, Math.max(0, ratio));

    // Set gradient embed color.
    embed.setColor(
      parseInt(
        tinygradient([
          { color: '#ff0000', pos: 0 },
          { color: '#ffff00', pos: 0.5 },
          { color: '#00ff00', pos: 1 }
        ])
          .rgbAt(clampedRatio)
          .toHex(),
        16
      )
    );

    return embed;
  }

  async updateStatus() {
    if (!this.options.setBotStatus) return;

    // Custom fix for if layers aren't loaded properly
    if (this.server.currentLayer === null) {
      this.server.currentLayer = await this.server.rcon.getCurrentMap();
    }

    if (this.server.nextLayer === null) {
      this.server.nextLayer = await this.server.rcon.getNextMap();
    }

    await this.options.discordClient.user.setActivity(
      `(${this.server.a2sPlayerCount}/${this.server.publicSlots}) ${
        this.server.currentLayer?.name || this.server.currentLayer.layer
      }`,
      { type: 'WATCHING' }
    );
  }
}
