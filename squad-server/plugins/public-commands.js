// import DiscordBasePlugin from "./discord-base-plugin.js";
import BasePlugin from "./base-plugin.js";
import {getFactionsAndSubfactions} from "./utils/utils.js";
import {delay, eventsEnum} from "../utils/utils.js";
import {WARN_MESSAGE_PERSISTENCE_TIME_MS} from "../utils/custom-constants.js";

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
        default: ["!shownext"]
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
    this.server.on(eventsEnum.chatMessage, this.showNextMapCommand)
  }

  async unmount() {
    this.server.removeEventListener(this.showNextMapCommand)
  }

  /**
   * @param message {ChatMessageEvent}
   * @return {Promise<void>}
   */
  async showNextMapCommand(message) {
    let response;

    const command = message.message.toLowerCase().split(" ")[0].trim()

    let commandMatched = false
    for (const cmdAlias of this.options.showNextCommands) {
      if (cmdAlias.toLowerCase() === command) {
        commandMatched = true
      }
    }
    if (!commandMatched) return

    const warns = []

    // Refresh the data about next map each team this command is used.
    this.server.nextMapData = await this.server.rcon.getNextMap()
    const factionData = await getFactionsAndSubfactions(this.server.nextMapData)

    if (!factionData) {
      warns.push('SquadJS: There is either no next map set, or the plugin was unable to retrieve data about the next map.')
    } else {
      const nextLayer = this.server?.nextMapData.layer
      const nextFaction1 = factionData.faction1
      const nextFaction2 = factionData.faction2
      let nextSubf1 = factionData.subfaction1
      let nextSubf2 = factionData.subfaction2

      if (!nextSubf1) {
        nextSubf1 = 'CombinedArms'
      }
      if (!nextSubf2) {
        nextSubf2 = 'CombinedArms'
      }

      const nextRoundTeamID = (message.player.teamID === 1) ? 2 : 1;

      response = `Next layer: ${nextLayer} \n\n`
      response += `Next factions: \n`
      response += `Team 1: ${nextFaction1}+${nextSubf1}\n`
      response += `Team 2: ${nextFaction2}+${nextSubf2}\n\n`

      // Assembles the string describing what team the caller will be next round.
      const callerFaction = (nextRoundTeamID === 1) ? ` ${nextFaction1}+${nextSubf1}` : `${nextFaction2}+${nextSubf2}`
      response += `You are currently on Team ${message.player.teamID}\n`
      response += `You will be Team ${nextRoundTeamID} - ${callerFaction} next round.`

      if (this.server.playerIsAdmin(message.steamID)) {
        if (this.server.nextLayerSet === false) {
          warns.push(response)
          response = ``
          const newMessage = `SquadJS - NOTE to admins; Next map has *not* been set by admins. Please consider discussing options for next map.`
          warns.push(newMessage)
        }
      }

      if (response.length > 3) {
        warns.push(response)
      }


      for (let i = 0; i < 3; i++) {
        for (const warnMessage of warns) {
          await this.server.rcon.warn(message.steamID, warnMessage)
        }
       await delay(WARN_MESSAGE_PERSISTENCE_TIME_MS)
      }
    }
  }
}
