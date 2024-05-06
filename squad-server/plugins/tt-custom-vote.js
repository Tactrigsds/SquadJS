import DiscordBasePlugin from "./discord-base-plugin.js";

import fs from 'fs'

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
      voteTime: {
        required: false,
        description: 'The amount of time for players to vote in seconds.',
        default: null,
        example: 120
      },
      ignoreChats: {
        required: true,
        description: 'The chat channels to ignore for reading commands',
        default: ['ChatAll', 'ChatSquad', 'ChatTeam'],
        example: ['ChatAll', 'ChatSquad', 'ChatTeam']
      },
      curatedLayerListPath: {
        required: true,
        description: 'The path to the csv file containing the curated layers.',
        // default: '../../layers.csv'
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
      csvDelimiter: {
        required: false,
        description: 'The delimiter used to differentiate each column in the CSV',
        default: ';'
      },
      startVoteCommand: {
        required: false,
        description: 'The chat command used to start a vote from the curated layers',
        default: '!rockthevote'
      },
      generatePoolCommand: {
        required: false,
        description: 'Generate a new map pool sample.',
        example: '!genpool'
      },
      readPoolCommand: {
        required: false,
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
      },
      setNextFromWinnerCommand: {
        required: false,
        description: "",
        default: '!setwinner'
      },
      voteBroadcastIntervalSeconds: {
        required: false,
        description: "",
        default: 30
      }
    };
  }

    constructor(server, options, connectors) {
      super(server, options, connectors);

      this.onNewGame = this.onNewGame.bind(this);
      this.onChatMessage = this.onChatMessage.bind(this);
      this.sendCuratedPool = this.sendCuratedPool.bind(this);
      this.loadLayerList = this.loadLayerList.bind(this);
      this.generateCuratedPool = this.generateCuratedPool.bind(this);
      this.tallyVotes = this.tallyVotes.bind(this);
      this.callVote = this.callVote.bind(this);
      this.clearVote = this.clearVote.bind(this);


      this.mapvote = false;
      this.voteInProgress = false;
      this.ballotBox = new Map();
      this.voteOptions = [];
      this.mapVoteWinner = null;
      this.mapVoteRunning = false;
      this.poolGenerationTime = null;
      this.mapPoolSize = 3;
      this.genPoolLastCalledTime = new Date()
    }

    // We want to reset the vote/and selected layers if the map rolls.
    async mount() {
      this.server.on('CHAT_MESSAGE', this.onChatMessage)
      this.server.on('NEW_GAME', this.onNewGame)
      this.verbose(2, 'Mounted')
      this.server.curatedLayerList = await this.loadLayerList(this.options.curatedLayerListPath, this.options.csvDelimiter)
      this.server.curatedLayerPool = [];
      this.server.curatedLayerPool = await this.generateCuratedPool();
      // console.log(this.server.curatedLayerPool)
    }
    async unmount(){
      this.server.removeEventListener(this.onChatMessage)
      this.server.removeEventListener(this.onNewGame)
    }


    async onNewGame(info){
      this.mapVoteWinner = null
      this.server.curatedLayerPool = await this.generateCuratedPool()
    }
    //
    async onChatMessage(info) {
      const adminChat = 'ChatAdmin'
      const commands = []
      this.info = info

      // EXIT IF VOTE IN PROGRESS
      if (
        this.voteInProgress &&
        (info.message.toLowerCase().startsWith('!vote') ||
          info.message.toLowerCase().startsWith('!mapvote')) &&
        !this.options.ignoreChats.includes(info.chat)
      ) {
        await this.server.rcon.warn(
          info.steamID,
          'Vote already in progress. Type !cancelvote or !endvote to end the vote early'
        );
        return;
      }

      // End a vote, counting totals
      if (
        this.voteInProgress &&
        info.message.toLowerCase().startsWith('!endvote') &&
        !this.options.ignoreChats.includes(info.chat)
      ) {
        clearTimeout(this.voteTimeout);
        clearInterval(this.voteBroadcast);
        await this.tallyVotes();
        return;
      }
      // Cancel a Vote, No Totals
      if (
        this.voteInProgress &&
        info.message.toLowerCase().startsWith('!cancelvote') &&
        !this.options.ignoreChats.includes(info.chat)
      ) {
        this.clearVote();
        clearTimeout(this.voteTimeout);
        clearInterval(this.voteBroadcast);

        await this.server.rcon.warn(info.steamID, 'Vote Cancelled');
        await this.server.rcon.broadcast(`Server: Vote Has Been Canceled by an Admin`);

        return;
      }

      // PLAYER VOTES HERE
      if (this.voteInProgress && info.message.match(/^[0-9]+/)) {
        const optionIndex = parseInt(info.message) - 1;
        if (optionIndex > this.voteOptions.length - 1 || optionIndex < 0) {
          await this.server.rcon.warn(info.steamID, `That is not a valid option. Please try again.`);
          return;
        }
        if (!this.ballotBox.has(info.steamID)) {
          await this.server.rcon.warn(
            info.steamID,
            `You have voted for ${this.voteOptions[optionIndex]}.`
          );
        } else {
          await this.server.rcon.warn(
            info.steamID,
            `You have changed your vote to ${this.voteOptions[optionIndex]}.`
          );
        }
        this.ballotBox.set(info.steamID, optionIndex);
      }

      if (
        !this.voteInProgress &&
        info.message.toLowerCase().startsWith('!vote') &&
        !this.options.ignoreChats.includes(info.chat)
      ) {
        this.voteOptions = info.message.slice(6, info.message.length).match(/[A-z0-9:/()-_]+/g);

        if (!this.voteOptions || this.voteOptions.length < 2) {
          await this.server.rcon.warn(info.steamID, 'Please input at least two vote options.');
          return;
        }
        this.callVote(this.voteOptions);
      }

      let playerInfo = await this.server.getPlayerBySteamID(info.steamID)
      let splitMessage = info.message.toLowerCase().split(" ")
      let message = info.message.toLowerCase()

      // Run admin commands
      if (!this.options.ignoreChats.includes(info.chat)) {

        if (info.message.toLowerCase() === this.options.generatePoolCommand) {
          if (this.mapVoteRunning) {
            await this.server.rcon.warn(playerInfo.steamID, 'Cannot generate a new pool while a mapvote is running.')
            return;
          }

          const currentTime = new Date()
          const timeSinceLastCall = currentTime - this.genPoolLastCalledTime

          if (timeSinceLastCall <= this.options.generatePoolFrequencyLimitSeconds * 1000) {
            await this.server.rcon.warn(playerInfo.steamID, `Pool was regenerated too recently. Please wait ${Math.abs(Math.round((10000 - timeSinceLastCall) / 1000))} seconds before calling it again`)
            return
          }

          this.genPoolLastCalledTime = currentTime

          this.server.curatedLayerPool = await this.generateCuratedPool(playerInfo)
          this.verbose(2, 'The admin triggering the generation: ' + playerInfo.name)
          this.server.generateCuratedPool = await this.generateCuratedPool(playerInfo)
          await this.server.rcon.warn(playerInfo.steamID, 'Map pool generated. Displaying new pool:')
          await new Promise(resolve => setTimeout(resolve, 6000))
          await this.sendCuratedPool(playerInfo)

      } else if (message === this.options.startVoteCommand || message === '!rtv') {
          if (this.mapVoteRunning) {
            await this.server.rcon.warn(playerInfo.steamID, 'Mapvote already running. End the old one before starting a new one.')
            return
          }



          // const subfactionMap = new Map([
          //   ["Motorized", "Mot"],
          //   ["AirAssault", "Air"],
          //   ["Armored", "Amrd"],
          //   ["CombinedArms", "Comb"],
          //   ["Support", "Supp"],
          //   ["LightInfantry", "Inf"],
          //   ["Mechanized", "Mech"],
          // ])

          const subfactionMap = new Map([
            ["Motorized", "Motor"],
            ["AirAssault", "Air"],
            ["Armored", "Amrd"],
            ["CombinedArms", "CmbArm"],
            ["Support", "Supp"],
            ["LightInfantry", "Inf"],
            ["Mechanized", "Mech"],
          ])


         let options = []
          for (const voteOption of this.server.curatedLayerPool) {
            // let option = `${voteOption[0]}_${voteOption[1]}-${voteOption[2]}_${subfactionMap.get(voteOption[3])}_vs_${voteOption[4]}_${subfactionMap.get(voteOption[5])}`
            // let option = `${voteOption[0]}_${voteOption[1]} ${voteOption[2]} ${voteOption[3]} vs ${voteOption[4]} ${voteOption[5]}`
            let option = `${voteOption[1]} ${voteOption[3]} ${voteOption[4]} vs ${voteOption[5]} ${voteOption[6]}`
            options.push(option)
          }
          this.mapVoteRunning = true
          this.voteOptions = options
          this.callVote(this.voteOptions)

      } else if (message === this.options.setNextFromWinnerCommand) {
          if (!this.mapVoteWinner) {
            this.server.rcon.warn(playerInfo.steamID, 'Unable to set next map. No map vote winner is saved.')
            return;
          }
          const command = this.assembleRCONSetNextCommandFromCSVElement(this.mapVoteWinner)
          await this.server.rcon.execute(`AdminSetNextLayer ${command}`)
          await this.server.rcon.warn(playerInfo.steamID, 'The winner of the vote has been set: \n' + `${this.mapVoteWinner[0]}_${this.mapVoteWinner[1]}`)

      //
      } else if (message === this.options.readPoolCommand) {
        await this.sendCuratedPool(playerInfo)

      } else if (message.startsWith(this.options.setNextFromPoolCommand)) {
          this.verbose(2, 'Set Next Command Triggered')
          if (!(splitMessage.length === 2)) {
            await this.server.rcon.warn(playerInfo.steamID, 'Invalid amount of parameters to the setnext command.\n' + "The second parameter must be a number corresponding to one of the map pool options.")

          } else if (this.server.curatedLayerPool === null || this.server.curatedLayerPool.length < 1) {
            this.server.rcon.warn(playerInfo.steamID, 'The map pool is currently empty. Regenerate it before attempting to set a map from the pool.')

          } else if (!(!isNaN(splitMessage[1]))) {
            this.server.rcon.warn(playerInfo.steamID, 'Invalid type of parameter, must be a number\n')

          } else if (Number(splitMessage[1]) > this.server.curatedLayerPool.length) {
            await this.server.rcon.warn(playerInfo.steamID, 'The given number must be within bounds of the generated map pool, bounds are currently: ' + "1-" + this.server.curatedLayerPool.length - 1)

          } else {
            const selectedChoice = Number(splitMessage[1]) - 1
            const selectedLayer = this.server.curatedLayerPool[selectedChoice]
            const message = `Setting next map to: ${selectedLayer[1]} - ${selectedLayer[3]}_${selectedLayer[4]} vs ${selectedLayer[5]}_${selectedLayer[6]}`
            await this.server.rcon.warn(playerInfo.steamID, message)
            const mapCommand = this.assembleRCONSetNextCommandFromCSVElement(selectedLayer)
            // TODO add some sort of check to see if the selected map is valid.
            await this.server.rcon.execute(`AdminSetNextLayer ${mapCommand}`)
          }
        }
      }
    }

    assembleRCONSetNextCommandFromCSVElement(csv) {
      // indexes corresponding to (map)_(gamemode and layer version) (faction1)+(subfaction) (faction2)+(subfaction)
      return `${csv[1]} ${csv[3]}+${csv[4]} ${csv[5]}+${csv[6]}`
    }
    async sendCuratedPool(playerInfo) {
      if (!this.server.curatedLayerList) {
        this.verbose(1, 'Curated layer list not loaded properly')
        await this.server.rcon.warn(playerInfo.steamID, 'Curated layer was not loaded properly\nUnable to send pool.')
        return;
      }
      if (!this.server.curatedLayerPool || !this.server.curatedLayerPool.length) {
        await this.server.rcon.warn(playerInfo.steamID, 'Generated map pool is empty. One must be generated first.')
        return;
      }

      let sampleList = this.server.curatedLayerPool
      let warnList = []
      let message = "Generated matchup pool: \n\n"
      for (let i = 0; i < sampleList.length; i++) {
        const assembledLayer = `${i+1}. ${sampleList[i][1]} - ${sampleList[i][3]}_${sampleList[i][4]} vs ${sampleList[i][5]}_${sampleList[i][6]}`
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
        await new Promise(resolve => setTimeout(resolve, this.server.warnMessagePersistenceTimeSeconds)); // Wait for 3 seconds
      }
    }

    async generateCuratedPool() {
      this.verbose(1, 'Generating map pool')
      let pool = []
      let allLayers = this.server.curatedLayerList
      const recentlyPlayedLayers = this.server.layerHistory
      // if (!allLayers.length) {this.server.rcon}

      while (pool.length < this.options.layerPoolSize) {
        let rand = this.getRandomInt(0, allLayers.length - 1)
        let layer = allLayers[rand]

        if (pool.includes(layer)) {
          continue
        }
        let layerId = layer[0] + "_" + layer[1]
        let duplicate = false
        for (const recentLayer of recentlyPlayedLayers) {
          if (layerId.trim() === recentLayer.layer.layerid.trim()) {
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

    async tallyVotes() {
      let max = 0;
      let winner = '';

      const totals = [];
      let tie = false;
      clearInterval(this.voteBroadcast);

      for (const player of this.ballotBox) {
        if (totals[player[1]] === undefined) {
          totals[player[1]] = 1;
        } else {
          totals[player[1]]++;
        }
      }

      for (let i = 0; i < this.voteOptions.length; i++) {
        if (totals[i] === undefined) {
          totals[i] = 0;
        }
        if (totals[i] === max) {
          tie = true;
        }
        if (totals[i] > max) {
          tie = false;
          winner = this.voteOptions[i];
          if (this.mapVoteRunning) {
            this.mapVoteWinner = this.server.curatedLayerPool[i]
            this.mapVoteRunning = false
          }
          max = totals[i];
        }
      }

      const totalsStr = totals
        .map((value, index) => `${this.voteOptions[index]}: ${value} votes,`)
        .join(' ')
        .slice(0, -1);
      if (tie) {
        await this.server.rcon.broadcast(
          `Server: There has been a tie! Total votes: ${this.ballotBox.size}.\n${totalsStr}`
        );
      } else {
        await this.server.rcon.broadcast(
          // `Server: ${winner} has won the vote! Total votes: ${this.ballotBox.size}.\n${totalsStr}`
          `Server: ${winner} has won the vote! Total votes: ${this.ballotBox.size}.`
        );
      }

      const message = {
        content: `\`\`\`fix\nVote has ended.\nTotal votes: ${this.ballotBox.size}.\n${totalsStr}\n\`\`\``
      };
      await this.channel.send(message);
      this.clearVote();
    }

    async callVote(options) {
      this.voteInProgress = true;
      const broadcastStr = options.map((option, index) => `${index + 1}: ${option} \n`).join(' ');
      this.verbose(3, 'Server broadcast length: ' + broadcastStr.length)
      const message = {
        content: `\`\`\`fix\n${this.info.player.name} has started a vote: ${broadcastStr}\n\`\`\``
      };
      await this.channel.send(message);

      await this.server.rcon.broadcast(
        `Server: A vote has started! Enter a number to vote!\n${broadcastStr}`
      );
      this.voteBroadcast = setInterval(async () => {
        await this.server.rcon.broadcast(
          `Server: A vote is in progress! Enter a number to vote!\n${broadcastStr}\nTotal votes: ${this.ballotBox.size}`
        );
      }, this.options.voteBroadcastIntervalSeconds * 1000);

      this.voteTimeout = setTimeout(this.tallyVotes, this.options.voteTime * 1000);
    }


    getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // TODO remove this once new one has been tested thoroughly.
    // async loadLayerListOld(path, delimiter) {
    //   return new Promise((resolve, reject) => {
    //     let layers = [];
    //
    //     fs.createReadStream(path)
    //       .pipe(csv())
    //       .on('data', (row) => {
    //         // Process each row of the CSV data
    //         let colValue = row._0;
    //
    //         const regex = /^(?:\w+(?:,|\s*;\s*)){6}\w+$/;
    //         if (!regex.test(colValue)) { return }
    //
    //         colValue = colValue.trim()
    //         const colData = colValue.split(delimiter);
    //         for (let i = 0; i < colData.length; i++) {
    //             colData[i] = colData[i].trim()
    //         }
    //         layers.push(colData);
    //       })
    //       .on('end', () => {
    //           this.verbose( 1, 'Curated layers data successfully loaded');
    //           resolve(layers);
    //       })
    //       .on('error', (err) => {
    //           this.verbose(1, 'Error occurred while processing CSV file:' + err);
    //           reject(err)
    //       });
    //     });
    // }

    clearVote() {
      this.mapvote = false;
      this.voteInProgress = false;
      this.ballotBox = new Map();
      this.voteOptions = [];
      this.mapVoteRunning = false
    }
}
