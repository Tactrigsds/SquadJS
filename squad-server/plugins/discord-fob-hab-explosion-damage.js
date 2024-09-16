import DiscordBasePlugin from './discord-base-plugin.js';

export default class DiscordFOBHABExplosionDamage extends DiscordBasePlugin {
  static get description() {
    return (
      'The <code>DiscordFOBHABExplosionDamage</code> plugin logs damage done to FOBs and HABs by ' +
      'explosions to help identify engineers blowing up friendly FOBs and HABs.'
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
        description: 'The ID of the channel to log FOB/HAB explosion damage to.',
        default: '',
        example: '667741905228136459'
      },
      color: {
        required: false,
        description: 'The color of the embeds.',
        default: 16761867
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onDeployableDamaged = this.onDeployableDamaged.bind(this);
  }

  async mount() {
    this.server.on('DEPLOYABLE_DAMAGED', this.onDeployableDamaged);
  }

  async unmount() {
    this.server.removeEventListener('DEPLOYABLE_DAMAGED', this.onDeployableDamaged);
  }

  async onDeployableDamaged(info) {
    if (!info.deployable.toLowerCase().match(/(?:fobradio|hab)/i)) return;
    if (!info.weapon.toLowerCase().match(/_deployable_/i)) return;



    const fields = [
      {
        name: "Player's Name",
        value: info.player.name,
        inline: true
      },
      {
        name: 'Team',
        value: info.player.squad?.teamName || `Unknown`,
        inline: true
      },
      {
        name: "Player's EosID",
        value: info.player.eosID,
        inline: true
      },
      {
        name: 'Deployable',
        value: info.deployable
      },
      {
        name: 'Weapon',
        value: info.weapon
      },
      {
        name: 'Damage Done',
        value: info.damage,
        inline: true
      },
      {
        name: 'Health Remaining',
        value: info.healthRemaining,
        inline: true
      }
    ];

    await this.sendDiscordMessage({
      embed: {
        title: 'Radio/HAB C4/IED Damage',
        color: this.options.color,
        fields: fields,
        timestamp: info.time.toISOString(),
        footer: {
          text: '!!!NOT ALWAYS FRIENDLY FIRE!!!'
        }
      }
    });
  }
}
