import BasePlugin from './base-plugin.js';

export default class NextLayerSet extends BasePlugin {
  static get description() {
    return (
        'Plugin intended to warn admins playing on the server if someone has changed the next map.' +
        "it's not possible to see whom has changed the map, just that it has been done."
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {};
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onSetMap = this.onSetMap.bind(this);
  }

  async mount() {
    this.server.on('MAP_SET', this.onSetMap);
  }

  async unmount() {
    this.server.removeEventListener('MAP_SET', this.onSetMap);
  }


  async onSetMap(info) {
    // TODO this event doesen't work properly when subfactions are included in a map set command.
    this.verbose(1, 'Next layer set has been detected, it has been set to: ' + info.nextLayer)
    await this.server.warnAllAdmins(`The next layer has been set to: ${info.nextLayer}`)
  }
}
