import DiscordBasePlugin from './discord-base-plugin.js';

export default class DiscordTeamkill extends DiscordBasePlugin {
  static get description() {
    return (
      'The <code>DiscordTeamkill</code> plugin logs teamkills and related information to a Discord channel for ' +
      'admins to review.'
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
        description: 'The ID of the channel to log teamkills to.',
        default: '',
        example: '667741905228136459'
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onTeamkill = this.onTeamkill.bind(this);
  }

  async mount() {
    this.server.on('TEAMKILL', this.onTeamkill);
  }

  async unmount() {
    this.server.removeEventListener('TEAMKILL', this.onTeamkill);
  }

  async onTeamkill(info) {
    if (!info.attacker) return;
    const message = {
      content: `\`\`\`diff\n-T:${info.attacker.teamID} SQ:${
        info.attacker.squadID || 'Unassigned'
      } ${info.attacker.name}\nTK'd\nT:${info.victim.teamID} SQ:${
        info.victim.squadID || 'Unassigned'
      } ${info.victim.name} with:\n-${info.weapon}\n\`\`\``
    };
    await this.sendDiscordMessage(message);
  }
}
