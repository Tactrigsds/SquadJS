import DiscordBasePlugin from "./discord-base-plugin.js";

import fs from 'fs'
import csv from 'csv-parser'
import lodash from 'lodash'

export default class TTCustomVote extends DiscordBasePlugin {
  static get description() {
    return ( 'Plugin that pulls curated layers, factions and subfactions into ');
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: true,
        description: 'The ID of the channel that layer changes will be broadcast to',
        default: '',
        example: '667741905228136459'
      },
      sameMapLimit: {
        required: false,
        description: "The amount of games needed before a map will be pulled again.",
        default: 2,
        example: 0
      },
      layerPoolSize: {
        required: false,
        description: "The amount of layers in the voting pool",
        default: 4
      },
      curatedLayerListPath: {
        required: true,
        description: 'The path to the csv file containing the curated layers.',
        // default: '../../layers.csv'
      },
      csvDelimiter: {
        required: false,
        description: 'The delimiter used to differentiate each column in the CSV',
        default: ';'
      },
      startVoteCommand: {
        required: true,
        description: 'The chat command used to start a vote from the curated layers',
        default: ['!rockthevote']
      },
      generatePoolCommand: {
        required: true,
        description: 'Generate a new map pool sample.',
        example: '!genpool'
      },
      readPoolCommand: {
        required: true,
        description: 'Command for retrieving what the current sample pool is.',
        example: '!pool'
      },
      mapPoolWipeTime: {
        required: false,
        description: 'The amount of time required before the map pool wipes.',
        default: 200
      },
      setNextFromPoolCommand: {
        required: false,
        description: "",
        default: '!setnext'
      }
    };
  }

    constructor(server, options, connectors) {
      super(server, options, connectors);
      this.onNewGame = this.onNewGame.bind(this)
      this.onChatMessage = this.onChatMessage.bind(this)
      this.sendCuratedPool = this.sendCuratedPool.bind(this)
      this.loadLayerList = this.loadLayerList.bind(this)
      this.generateCuratedPool = this.generateCuratedPool.bind(this)
        // this.onSetMap = this.onSetMap.bind(this);
    }

    // We want to reset the vote/and selected layers if the map rolls.
    async mount() {
        this.server.on('CHAT_MESSAGE', this.onChatMessage)
        this.server.on('NEW_GAME', this.onNewGame)
        this.verbose(2, 'Mounted')
        this.server.curatedLayerList = await this.loadLayerList(this.options.curatedLayerListPath, this.options.csvDelimiter)
        this.server.curatedLayerPool = []
        this.server.curatedLayerPool = await this.generateCuratedPool()

        // this.server.curatedLayerPool[0] = this.server.curatedLayerList[0]
        // this.server.curatedLayerPool[1] = this.server.curatedLayerList[1]
        // this.server.curatedLayerPool[2] = this.server.curatedLayerList[2]
        // this.server.curatedLayerPool[3] = this.server.curatedLayerList[6]
        // this.server.curatedLayerPool[4] = this.server.curatedLayerList[7]
        // this.verbose(3, this.server.curatedLayerList)
        // this.verbose(1, this.server.curatedLayerPool)
        this.mapVoteWinner = null;
        this.poolGenerationTime = null;
    }
    async unmount(){}


    async onNewGame(info){
      this.mapVoteWinner = null
      this.server.curatedLayerPool = await this.generateCuratedPool()
    }
    //
    async onChatMessage(info) {
      const adminChat = 'ChatAdmin'
      const commands = []
      this.info = info

      if (!info.message.startsWith('!') || !(info.chat === adminChat)) {
        return;
      }

      let playerInfo = await this.server.getPlayerBySteamID(info.steamID)
      let splitMessage = info.message.toLowerCase().split(" ")
      let message = info.message.toLowerCase()

      if (info.message.toLowerCase() === this.options.generatePoolCommand) {
          this.verbose(2, 'The admin triggering the generation: ' + playerInfo.name)
          this.server.generateCuratedPool = await this.generateCuratedPool(playerInfo)
          await this.server.rcon.warn(playerInfo.steamID, 'Map pool generated. Displaying new pool:')
          await new Promise(resolve => setTimeout(resolve, 6000))
          await this.sendCuratedPool(playerInfo)

      } else if (message === this.options.startVoteCommand) {

      } else if (message === this.options.readPoolCommand) {
          await this.sendCuratedPool(playerInfo)

      } else if (message.startsWith(this.options.setNextFromPoolCommand)) {
        console.log('Set next command triggered')
        if (!(splitMessage.length === 2)) {
          this.server.rcon.warn(playerInfo.steamID, 'Invalid amount of parameters to the setnext command.\n' + "The second parameter must be a number corresponding to one of the map pool options.")

        } else if (this.server.curatedLayerPool === null || this.server.curatedLayerPool.length < 1) {
          this.server.rcon.warn(playerInfo.steamID, 'The map pool is currently empty. Regenerate it before attempting to set a map from the pool.')

        } else if (!(!isNaN(splitMessage[1]))) {
          this.server.rcon.warn(playerInfo.steamID, 'Invalid type of parameter, must be a number\n')

        } else if (Number(splitMessage[1]) > this.server.curatedLayerPool.length) {
          this.server.rcon.warn(playerInfo.steamID, 'The given number must be within bounds of the generated map pool, bounds are currently: ' + "1-" + this.server.curatedLayerPool.length - 1)

        } else {
          const selectedChoice = Number(splitMessage[1]) - 1
          const selectedLayer = this.server.curatedLayerPool[selectedChoice]
          const message = `Setting next map to: ${selectedLayer[0]}_${selectedLayer[1]} - ${selectedLayer[2]}_${selectedLayer[3]} vs ${selectedLayer[4]}_${selectedLayer[5]}`
          this.server.rcon.warn(playerInfo.steamID, message)
          const mapCommand = this.assembleRCONSetNextCommandFromCSVElement(selectedLayer)
          // TODO add a check to see if the selected map is valid.
          this.server.rcon.execute(`AdminSetNextLayer ${mapCommand}`)
        }
      }






      // switch (info.message.toLowerCase()) {
      //   case this.options.startVoteCommand:
      // //   // TODO add start vote function here
      //     return;
      //
      //   case this.options.generatePoolCommand:
      //     this.verbose(2, 'The admin triggering the generation: ' + playerInfo.name)
      //     this.server.generateCuratedPool = await this.generateCuratedPool(playerInfo)
      //     await this.server.rcon.warn(playerInfo.steamID, 'Map pool generated. Displaying new pool:')
      //     await new Promise(resolve => setTimeout(resolve, 3000))
      //     await this.sendCuratedPool(playerInfo)
      //     break;

      // if (info.message.toLowerCase() === this.options.startVoteCommand) {
      // } else if (info.message)


    }


    assembleRCONSetNextCommandFromCSVElement(csv) {
      // indexes corresponding to (map)_(layer_version) (faction1)+(subfaction) (faction2)+(subfaction)
      return `${csv[0]}_${csv[1]} ${csv[2]}+${csv[3]} ${csv[4]}+${csv[5]}`
    }
    async sendCuratedPool(playerInfo) {
      if (!this.server.curatedLayerList) {
        this.verbose(1, 'Curated layer list not loaded properly')
        this.server.rcon.warn(playerInfo.steamID, 'Curated layer was not loaded properly\nUnable to send pool.')
      }
      if (this.server.curatedLayerPool === null || this.server.curatedLayerPool === []) {
        // TODO add logic here.
      }

      let sampleList = this.server.curatedLayerPool
      let warnList = []
      let message = "Generated matchup pool: \n\n"
      for (let i = 0; i < sampleList.length; i++) {
        const assembledLayer = `${i+1}. ${sampleList[i][0]}_${sampleList[i][1]} - ${sampleList[i][2]}_${sampleList[i][3]} vs ${sampleList[i][4]}_${sampleList[i][5]}`
        message += assembledLayer
        message += '\n\n'
        // Only allow 2 layers per warn message, otherwise the message will become too long and not send.
        if (i % 2 === 0) {
          warnList.push(message)
          message = "\n\n"
        }
      }
      warnList.push(message)

      // Send the layer pool back to the admin
      for (let i = 0; i < 4; i++) {
        for (const warnMessage of warnList) {
          await this.server.rcon.warn(playerInfo.steamID, warnMessage)
        }
        await new Promise(resolve => setTimeout(resolve, this.server.warnPersistenceTimeSeconds)); // Wait for 3 seconds
      }
    }

    async generateCuratedPool() {
      let pool = []
      this.verbose(1, 'Generating map pool')
      let allLayers = this.server.curatedLayerList
      const recentlyPlayedLayers = this.server.layerHistory

      while (pool.length < this.options.layerPoolSize) {
        let rand = this.getRandomInt(0, allLayers.length - 1)
        let layer = allLayers[rand]

        if (pool.includes(layer)) {
          continue
        }

        console.log(layer)
        let layerId = layer[0] + "_" + layer[1]
        console.log(layerId)
        let duplicate = false
        for (const recentLayer of recentlyPlayedLayers) {
          // console.log(recentLayer)
          console.log(recentLayer.layer.layerid.trim())
          // console.log(recentLayer.layer.layerid)
          if (layerId.trim() === recentLayer.layer.layerid.trim()) {
            console.log(`Recently played found:`)
            console.log(layerId)
            duplicate = true
            break
          }
        }
        if (duplicate) {continue}
        pool.push(layer)
      }
      this.poolGenerationTime = Date.now();
      return pool
    }



    // async getCuratedSample(curatedList) {
    //   function shuffleArray(array) {
    //     for (let i = array.length - 1; i > 0; i--) {
    //       const j = Math.floor(Math.random() * (i + 1));
    //       [array[i], array[j]] = [array[j], array[i]];
    //     }
    //     return array;
    //   }
    //
    //   const sampleSize = 4
    //
    //   return shuffleArray(curatedList).slice(0, sampleSize)
    // }

    getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async loadLayerList(path, delimiter) {
      return new Promise((resolve, reject) => {
        let layers = [];
        fs.createReadStream(path)
            .pipe(csv())
            .on('data', (row) => {
                // Process each row of the CSV data
                const colValue = row._0;
                const colData = colValue.split(delimiter);
                for (let i = 0; i < colData.length; i++) {
                    colData[i] = colData[i].trim()
                }
                layers.push(colData);
            })
            .on('end', () => {
                this.verbose( 1, 'Curated layers data succsefully loaded');
                resolve(layers);
            })
            .on('error', (err) => {
                this.verbose(1, 'Error occurred while processing CSV file:' + err);
            });
        });
    }
}
