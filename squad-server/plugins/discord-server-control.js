import DiscordBasePlugin from './discord-base-plugin.js';

export default class DiscordServerControl extends DiscordBasePlugin {
  static get description() {
    return 'The <code>AdminCommands</code> plugin can be configured to make chat commands that perform server administration.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: true,
        description: 'The ID of the channel you wish to turn into a partial RCON console.',
        default: '',
        example: '667741905228136459'
      },
      commands: {
        required: false,
        description:
          'An array of objects containing the following properties: ' +
          '<ul>' +
          '<li><code>command</code> - The command that initiates the message.</li>' +
          '<li><code>type</code> - Either <code>warn</code> or <code>broadcast</code>.</li>' +
          '<li><code>response</code> - The message to respond with.</li>' +
          '</ul>',
        default: [
          {
            command: '!squadjs',
            type: 'warn',
            response: 'This server is powered by SquadJS.'
          }
        ]
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onDiscordMessage = this.onDiscordMessage.bind(this);
  }

  async mount() {
    this.options.discordClient.on('message', this.onDiscordMessage);
  }

  async onDiscordMessage(message) {
    const channel = await this.options.discordClient.channels.fetch(this.options.channelID);

    if (message.author.bot || message.channel.id !== this.options.channelID) return;

    const messageArray = message.content.split(' ');

    for (const command of this.options.commands) {
      if (!message.content.startsWith(command.command)) continue;
      if (command.type === 'broadcast') {
        this.server.rcon.broadcast(command.response);
      } else if (command.type === 'broadcast-custom') {
        this.server.rcon.broadcast(messageArray.splice(1, messageArray.length).join(' '));
      } else if (command.type === 'playerlist') {
        let players = '';
        for (const player of this.server.players) {
          players = players + player.name + ', ';
        }
        players = players.slice(0, -2);
        const message = {
          content: `Players: ${players}`
        };
        channel.send(message);
      }
    }
  }
}
