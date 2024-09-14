import DiscordBasePlugin from './discord-base-plugin.js';
import {factionMap, subfactionAbbreviations, getSubfaction, getFactionFromLongName} from "../utils/faction-constants.js";


export default class DiscordRoundEnded extends DiscordBasePlugin {
  static get description() {
    return 'The <code>DiscordRoundEnded</code> plugin will send the round winner to a Discord channel.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: true,
        description: 'The ID of the channel to log round end events to.',
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

    this.onRoundEnd = this.onRoundEnd.bind(this);
  }

  async mount() {
    this.server.on('ROUND_ENDED', this.onRoundEnd);
  }

  async unmount() {
    this.server.removeEventListener('ROUND_ENDED', this.onRoundEnd);
  }

  async onRoundEnd(info) {
    if (!info.winner || !info.loser) {
      await this.sendDiscordMessage({
        embed: {
          title: 'Round Ended',
          description: 'This match Ended in a Draw',
          color: this.options.color,
          timestamp: info.time.toISOString()
        }
      });
      return;
    }

    const winnerFactionShort = getFactionFromLongName(info.winner.faction, factionMap)?.short
    const winnerSubfactionShort = getSubfaction(info.winner.subfaction)
    const loserFactionShort = getFactionFromLongName(info.loser.faction, factionMap)?.short
    const loserSubfactionShort = getSubfaction(info.loser.subfaction)
    await this.sendDiscordMessage({
      embed: {
        title: 'Round Ended',
        description: `${info.winner.layer} - ${info.winner.level}`,
        color: this.options.color,
        fields: [
          {
            name: `Team ${info.winner.team} Won`,
            value: `${winnerFactionShort}+${winnerSubfactionShort}\n\n${info.winner.subfaction}\n ${info.winner.faction}\n won with ${info.winner.tickets} tickets.\n`
          },
          {
            name: `Team ${info.loser.team} Lost`,
            value: `${loserFactionShort}+${loserSubfactionShort}\n\n${info.loser.subfaction}\n ${info.loser.faction}\n lost with ${info.loser.tickets} tickets.`
          },
          {
            name: 'Ticket Difference',
            value: `${info.winner.tickets - info.loser.tickets}.`
          }
        ],
        timestamp: info.time.toISOString()
      }
    });
  }
}
