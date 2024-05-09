import Sequelize from 'sequelize';

import BasePlugin from './base-plugin.js';

const { DataTypes, QueryTypes } = Sequelize;

export default class DBLog extends BasePlugin {
  static get description() {
    return (
      'The <code>mysql-log</code> plugin will log various server statistics and events to a database. This is great ' +
      'for server performance monitoring and/or player stat tracking.' +
      '\n\n' +
      'Grafana:\n' +
      '<ul><li> <a href="https://grafana.com/">Grafana</a> is a cool way of viewing server statistics stored in the database.</li>\n' +
      '<li>Install Grafana.</li>\n' +
      '<li>Add your database as a datasource named <code>SquadJS</code>.</li>\n' +
      '<li>Import the <a href="https://github.com/Team-Silver-Sphere/SquadJS/blob/master/squad-server/templates/SquadJS-Dashboard-v2.json">SquadJS Dashboard</a> to get a preconfigured MySQL only Grafana dashboard.</li>\n' +
      '<li>Install any missing Grafana plugins.</li></ul>'
    );
  }

  static get defaultEnabled() {
    return false;
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
}
