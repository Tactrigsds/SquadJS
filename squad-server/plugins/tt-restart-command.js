import { Events } from 'discord.js';

import BasePlugin from './base-plugin.js';

// Registers a /restart-squadjs guild slash command that kills the SquadJS process, relying on the host to restart it.
export default class TTRestartCommand extends BasePlugin {
  static get description() {
    return 'The <code>TTRestartCommand</code> plugin adds a Discord slash command that exits the SquadJS process so the host restarts it.';
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      discordClient: {
        required: true,
        description: 'Discord connector name.',
        connector: 'discord',
        default: 'discord'
      },
      guildID: {
        required: true,
        description: 'The ID of the Discord server to register the slash command in.',
        default: '',
        example: '667741905228136459'
      },
      allowedRoleIDs: {
        required: true,
        description: 'Discord role IDs allowed to use the command. Members with any of these roles may use it.',
        default: [],
        example: ['667741905228136460']
      },
      commandName: {
        required: false,
        description: 'Name of the slash command.',
        default: 'restart-squadjs'
      },
      exitCode: {
        required: false,
        description: 'Exit code to use. Hosts usually only auto-restart on a non-zero exit.',
        default: 1
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onInteraction = this.onInteraction.bind(this);
  }

  async mount() {
    const client = this.options.discordClient;
    // guild.commands needs client.application, which is only populated once the client is ready
    if (!client.isReady()) await new Promise((resolve) => client.once(Events.ClientReady, resolve));

    const guild = await client.guilds.fetch(this.options.guildID);
    // create() upserts by name, so other commands registered in the guild are left alone
    await guild.commands.create({
      name: this.options.commandName,
      description: 'Kill the SquadJS process so the host restarts it.'
    });
    client.on(Events.InteractionCreate, this.onInteraction);
    this.verbose(
      1,
      `Registered /${this.options.commandName} in guild ${this.options.guildID} for roles ${JSON.stringify(
        this.options.allowedRoleIDs
      )}.`
    );
  }

  async unmount() {
    this.options.discordClient.off(Events.InteractionCreate, this.onInteraction);
  }

  async onInteraction(interaction) {
    if (!interaction.isChatInputCommand() || interaction.commandName !== this.options.commandName) return;
    if (interaction.guildId !== this.options.guildID) return;

    const user = `${interaction.user.tag} (${interaction.user.id})`;
    // member.roles is a GuildMemberRoleManager when the member is cached, and a raw array of role IDs otherwise
    const roles = interaction.member?.roles;
    const roleIDs = Array.isArray(roles) ? roles : [...(roles?.cache.keys() ?? [])];
    if (!roleIDs.some((id) => this.options.allowedRoleIDs.includes(id))) {
      this.verbose(1, `Denied /${this.options.commandName} for ${user}.`);
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }

    this.verbose(1, `/${this.options.commandName} used by ${user}. Exiting with code ${this.options.exitCode}.`);
    try {
      await interaction.reply({ content: 'Killing SquadJS, it should come back shortly.', ephemeral: true });
    } catch (error) {
      this.verbose(1, `Failed to reply to interaction, exiting anyway. Error: ${error.message}`);
    }
    process.exit(this.options.exitCode);
  }
}
