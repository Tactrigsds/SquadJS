// import DiscordBasePlugin from "./discord-base-plugin.js";
import BasePlugin from "./base-plugin.js";

export default class PublicCommands extends BasePlugin {
  static get description() {
    return (
      "Plugin for commands that every player will be able to use."
    );
  }

  static get defaultEnabled() {
    return true;
  }


  static get optionsSpecification() {
    return {
      showNextCommands: {
        required: false,
        description: "Command to trigger the shownext command.",
        default: ["shownext"]
      },
      switchCommand: {
        required: false,
        description: "Command used to trigger a switch request.",
        default: "switch"
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.showNextMapCommand = this.showNextMapCommand.bind(this)
  }

  async mount() {
    for (const command of this.options.showNextCommands) {
      this.server.on(`CHAT_COMMAND:${command}`, this.showNextMapCommand)
    }
  }

  async unmount() {
    // this.server.removeEventListener(this.onCommand)
    this.server.removeEventListener(this.showNextMapCommand)
  }

  async showNextMapCommand(info) {
    let message;
    let nextMap = {};
    const warns = []

    if (!this.server.nextFactions || !this.server.nextLayerAlt) {
      const nextMapData = await this.server.rcon.getNextMap()
      /*
      If the RCON module doesen't have support for separate factions yet.
      Compatible with Squad as of Version 8.0
       */

      if (nextMapData.factions) {
        nextMap.layer = nextMapData.layer
        nextMap.factions = nextMapData.factions
      }
      else {
        const match = nextMapData.layer.match(/^(.*), factions (.*)/);
        nextMap.layer = match[1]
        nextMap.factions = match[2]
      }

    } else {
      nextMap.layer = this.server.nextLayerAlt
      nextMap.factions = this.server.nextFactions
    }




    if (nextMap.layer && nextMap.factions) {
      const splitFactions = nextMap.factions.split(" ")
      let faction1 = splitFactions[0].split("+");
      let faction2 = splitFactions[1].split("+")


      let subfaction1 = faction1[1]
      let subfaction2 = faction2[1]

      faction1 = faction1[0]
      faction2 = faction2[0]

      if (!subfaction1) {
        subfaction1 = 'CombinedArms'
      }

      if (!subfaction2) {
        subfaction2 = 'CombinedArms'
      }

      const nextRoundTeamID = (info.player.teamID === 2) ? 1 : 2;

      message = `Next layer: ${nextMap.layer} \n\n`
      message += `Next factions: \n`
      message += `${faction1}+${subfaction1} vs ${faction2}+${subfaction2}\n\n`
      const team = (nextRoundTeamID === 1) ? `${nextRoundTeamID} - ${faction1}+${subfaction1}` : `${nextRoundTeamID} - ${faction2}+${subfaction2}`
      message += `You will be Team ${team} next round.`

      if (this.server.playerIsAdmin(info.steamID)) {
        if (!this.server.nextLayerSet) {
          warns.push(message)
          message = ``
          const newMessage = `SquadJS - NOTE to admins; Next map has *not* been set by admins. Please consider discussing options for next map.`
          warns.push(newMessage)
        }
      }
    } else {
      message = `Unable to show the next map.\n`
    }

    if (message.length > 3) {
      warns.push(message)
    }


    for (let i = 0; i < 3; i++) {
      for (const warnMessage of warns) {
        await this.server.rcon.warn(info.steamID, warnMessage)
      }
      await new Promise(resolve => setTimeout(resolve, this.server.warnMessagePersistenceTimeMilliSeconds || 6200));
    }
  }
}
