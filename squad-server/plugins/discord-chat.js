import DiscordBasePlugin from './discord-base-plugin.js';

export default class DiscordChat extends DiscordBasePlugin {
  static get description() {
    return 'The <code>DiscordChat</code> plugin will log in-game chat to a Discord channel.';
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
      chatColors: {
        required: false,
        description: 'The color of the embed for each chat.',
        default: {},
        example: { ChatAll: 16761867 }
      },
      color: {
        required: false,
        description: 'The color of the embed.',
        default: 16761867
      },
      ignoreChats: {
        required: false,
        default: ['ChatSquad'],
        description: 'A list of chat names to ignore.'
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onChatMessage = this.onChatMessage.bind(this);
  }

  async mount() {
    this.server.on('CHAT_MESSAGE', this.onChatMessage);
  }

  async unmount() {
    this.server.removeEventListener('CHAT_MESSAGE', this.onChatMessage);
  }

  async onChatMessage(info) {
    if (this.options.ignoreChats.includes(info.chat)) return;

    let color = '';
    switch (info.chat) {
      case 'ChatAll':
      case 'ChatTeam':
        color = 'md';
        break;

      case 'ChatAdmin':
        color = 'yaml';
        break;
    }
    const message = {
      content: `\`\`\`${color}\n# T:${info.player.teamID} SQ:${
        info.player.squadID || 'Unassigned'
      } ${info.player.name}\n${info.chat}: ${info.message}\n\`\`\``
    };
    await this.sendDiscordMessage(message);
  }
}