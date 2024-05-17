import BasePlugin from './base-plugin.js';
import DBLog from "./db-log.js";

export default class PersistentHistory extends BasePlugin {
  static get description() {
    return ("Plugin that will pull data from earlier rounds ");
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

  async filterAndSortMatches(matches) {
    matches = matches.map(match => match.dataValues)
    matches = matches.filter(match => {
      // If there is no end time, it is either the current game, or SquadJS wasn't running when it ended.
      // In either case, we're not really interested in the match.
      return !(!match.endTime);
    })

    return matches
  }

  async updateLayerHistory() {
    const matches = await this.DBLogPlugin.models.Match.findAll({})
    const filteredMatches = await this.filterAndSortMatches(matches)
    const layerHistoryClamp = Math.max(0, filteredMatches.length - this.server.layerHistoryMaxLength)
    this.server.layerHistoryNew = filteredMatches.slice(layerHistoryClamp).reverse()
    this.verbose(3, this.server.layerHistoryNew)
  }


  async mount() {
    this.DBLogPlugin = this.server.plugins.find(p => p instanceof DBLog);
    if (!this.DBLogPlugin) return;

    this.server.on('NEW_GAME', this.onDatabaseUpdated)
    await this.updateLayerHistory()
    this.verbose(1, 'Loaded layer history from database...')
  }

  async onDatabaseUpdated() {
    try {
      await this.updateLayerHistory()
      this.verbose(1, 'Layer history updated.')

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
