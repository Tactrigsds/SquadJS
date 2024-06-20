import BasePlugin from './base-plugin.js';
import DBLog from "./db-log.js";

export default class PersistentHistory extends BasePlugin {
  static get description() {
    return ("This plugin will pull previous match data from a database and  ");
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      database: {
        required: true,
        connector: 'sequelize',
        description: 'The Sequelize connector to log server information to.',
        default: 'mysql'
      },
      overrideServerID: {
        required: false,
        description: 'A overridden server ID.',
        default: null
      }
    };
  }


  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onDatabaseUpdated = this.onDatabaseUpdated.bind(this)
    this.updateLayerHistory = this.updateLayerHistory.bind(this)
  }


  async updateLayerHistory() {
    const matches = await this.DBLogPlugin.models.Match.findAll({})
    const matchesIncludingCurrent = matches.map(match => match.dataValues)
    const layerHistoryClamp = Math.max(0, matches.length - this.server.layerHistoryMaxLength)
    // We reverse the matches, so we get the most recent matches first.
    this.server.matchHistoryNew = matchesIncludingCurrent.slice(layerHistoryClamp).reverse()
    this.verbose(3, this.server.matchHistoryNew)
  }


  async mount() {
    this.DBLogPlugin = this.server.plugins.find(p => p instanceof DBLog);
    if (!this.DBLogPlugin) { this.verbose(1, 'Could not find db plugin'); return }

    await this.updateLayerHistory()
    this.verbose(1, 'Loaded layer history from database...')
    this.server.on('DATABASE_UPDATED', this.onDatabaseUpdated)
  }

  async onDatabaseUpdated() {
    try {
      if (this.DBLogPlugin) {
        await this.updateLayerHistory()
        this.verbose(1, 'Layer history updated.')
      }
      else {
        this.verbose(1, 'DB Plugin not loaded, unable to fetch match history from the DB.')
      }
    }
    catch (e) {
      this.verbose(1, 'Unable to update layer history from the database...')
      this.verbose(2, e)
    }
  }

  async unmount() {
    this.server.removeEventListener(this.onDatabaseUpdated)
  }
}


async function filterAndSortMatches(matches) {
  matches = matches.map(match => match.dataValues)
  matches = matches.filter(match => {
    // If there is no end time, it is either the current game, or SquadJS wasn't running when it ended.
    // In either case, we're not really interested in the match.
    return !(!match.endTime);
  })

  return matches
}
