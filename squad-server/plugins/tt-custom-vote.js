import DiscordBasePlugin from "./discord-base-plugin.js";

import fs from 'fs'

export default class TTCustomVote extends DiscordBasePlugin {
  static get description() {
    return +
    '<code>TT Custom Vote</code> Plugin that pulls curated layers, factions and subfactions into a pool that admins can access in game' +
    ''
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
      curatedLayerListPath: {
        required: true,
        description: 'The path to the csv file containing the curated layers.',
        default: '../../layers.csv',
        example: './layers.csv'
      },
      csvDelimiter: {
        required: false,
        description: 'The delimiter used to differentiate each column in the CSV',
        default: ';'
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
      sameMapLimit: {
        required: false,
        description: "The amount of games needed before a map can be pulled again.",
        default: 3,
        example: 0
      },
      layerPoolSize: {
        required: false,
        description: "The amount of layers in the voting pool",
        default: 3,
        example: 3
      },
      startVoteCommand: {
        required: false,
        description: 'The chat command used to start a vote from the curated layers',
        default: '!rockthevote',
        example: '!rockthevote'
      },
      generatePoolCommand: {
        required: false,
        description: 'Generate a new map pool sample.',
        default: '!genpool',
        example: '!genpool'
      },
      readPoolCommand: {
        required: false,
        description: 'Command for retrieving what the current sample pool is.',
        default: '!pool',
        example: '!pool'
      },
      generatePoolFrequencyLimitSeconds: {
        required: false,
        description: "How often the generate pool command can be used, in seconds.",
        default: 10,
        example: 10
      },
      // mapPoolWipeTime: {
      //   required: false,
      //   description: 'The amount of time required before the map pool wipes.',
      //   default: 200
      // },
      setNextFromPoolCommand: {
        required: false,
        description: "The command for setting the next map from the index of the pool",
        default: '!setnext',
        example: '!setnext'
      },
      setNextFromWinnerCommand: {
        required: false,
        description: "The command for setting the next map to the winner of the map vote.",
        example: '!setwinner',
        default: '!setwinner'
      },
      voteBroadcastIntervalSeconds: {
        required: false,
        description: "The amount of time in seconds, between each broadcast for the vote.",
        example: 30,
        default: 30
      },
      autoSetWinner: {
        required: false,
        description: "Whether the winner of a map vote should be automatically set by the plugin",
        example: true,
        default: true
      }
    };
  }

    constructor(server, options, connectors) {
      super(server, options, connectors);

      this.onNewGame = this.onNewGame.bind(this);
      this.onChatMessage = this.onChatMessage.bind(this);
      this.sendCuratedPool = this.sendCuratedPool.bind(this);
      this.loadLayerList = this.loadLayerList.bind(this);
      this.generateCuratedPoolDefault = this.generateCuratedPoolDefault.bind(this);
      this.generatePoolFromParameters = this.generatePoolFromParameters.bind(this);
      this.tallyVotes = this.tallyVotes.bind(this);
      this.callVote = this.callVote.bind(this);
      this.clearVote = this.clearVote.bind(this);
      this.checkIfSymmetrical = this.checkIfSymmetrical.bind(this)

      this.mapvote = false;
      this.voteInProgress = false;
      this.ballotBox = new Map();
      this.mapVoteWinner = null;
      this.mapVoteRunning = false;
      this.poolGenerationTime = new Date()
      this.mapPoolSize = 3
      this.voteOptions = [];
      this.recentPoolPicks =[]
    }

    async mount() {
      this.server.on('CHAT_MESSAGE', this.onChatMessage)
      this.server.on('NEW_GAME', this.onNewGame)
      this.verbose(2, 'Mounted')
      // TODO change the layer list so it uses an object to represent a layer instead of just an array of strings.
      this.server.curatedLayerList = await this.loadLayerList(this.options.curatedLayerListPath, this.options.csvDelimiter)
      this.server.mapPool = [];
      this.server.mapPool = await this.generateCuratedPoolDefault();
      this.verbose(3, 'Loaded layers: ' + this.options.curatedLayerListPath)
      this.verbose(3, 'Curated pool on mount: ' + this.server.mapPool)
   }
    async unmount(){
      this.server.removeEventListener(this.onChatMessage)
      this.server.removeEventListener(this.onNewGame)
    }

    async loadLayerList(path, delimiter) {
      let layers = []
      try {
        const regex = /^(?!\/\/)[^,;\n]+(?:[;,][^,;\n]+)*$/;
        const data = fs.readFileSync(path, 'utf-8')
        let lines = data.split('\n')
        for (let line of lines) {
          line = line.trim()
          if (regex.test(line)) {
            line = line.split(delimiter)
            for (let i = 0; i < line.length; i++) {
              line[i] = line[i].trim()
            }
            layers.push(line)
          }
        }

      } catch (err) {
        this.verbose(1, 'Error occured when loading the layers file')
        this.verbose(2, err)
      }
      this.verbose(3, 'Loaded layers:' + layers)
      // console.log(layers)
      return layers
    }


    async onNewGame(info){
      this.mapVoteWinner = null
      this.server.mapPool = await this.generateCuratedPoolDefault()
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
        this.server.rcon.warn(
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
        if (splitMessage[0] === this.options.generatePoolCommand || splitMessage[0] === '!reroll') {
          if (this.mapVoteRunning) {
            await this.server.rcon.warn(playerInfo.steamID, 'Cannot generate a new pool while a mapvote is running.')
            return;
          }

          const currentTime = new Date()
          const timeSinceLastCall = currentTime - this.poolGenerationTime


          if (timeSinceLastCall < this.options.generatePoolFrequencyLimitSeconds * 1000) {
            await this.server.rcon.warn(playerInfo.steamID, `Pool was regenerated too recently. Please wait ${Math.abs(Math.round((10000 - timeSinceLastCall) / 1000))} seconds before calling it again`)
            return
          }

          this.poolGenerationTime = currentTime


          // this.server.mapPool = this.generateCuratedPoolDefault()
          this.server.mapPool = await this.generatePoolFromParameters(splitMessage, playerInfo)


          // if (splitMessage.length === 1) {
          //   this.server.mapPool = await this.generateCuratedPoolDefault()
          // } else {}

          this.verbose(2, 'The admin triggering the generation: ' + playerInfo.name)
          await this.server.rcon.warn(playerInfo.steamID, 'Map pool generated. Displaying new pool:')
          await new Promise(resolve => setTimeout(resolve, 6000))
          await this.sendCuratedPool(playerInfo)

      } else if (message === this.options.startVoteCommand || message === '!rtv') {
          if (this.mapVoteRunning) {
            await this.server.rcon.warn(playerInfo.steamID, 'Mapvote already running. End the old one before starting a new one.')
            return
          }

          const subfactionMap = new Map([
            ["Motorized", "Motor"],
            ["AirAssault", "Air"],
            ["Armored", "Armor"],
            ["CombinedArms", "CmbArm"],
            ["Support", "Supp"],
            ["LightInfantry", "Inf"],
            ["Mechanized", "Mech"],
          ])


          let options = []
          for (const voteOption of this.server.mapPool) {
            // let option = `${voteOption[1]} ${voteOption[3]}-${voteOption[4]}_${subfactionMap.get(voteOption[3])}_vs_${voteOption[4]}_${subfactionMap.get(voteOption[5])}`
            // let option = `${voteOption[0]}_${voteOption[1]} ${voteOption[2]} ${voteOption[3]} vs ${voteOption[4]} ${voteOption[5]}`
            // let option = `${voteOption[1]} ${voteOption[3]} ${voteOption[4]} vs ${voteOption[5]} ${voteOption[6]}`
            let option = `${voteOption[1]} ${voteOption[3]} ${subfactionMap.get(voteOption[4])} vs ${voteOption[5]} ${subfactionMap.get(voteOption[6])}`
            options.push(option)
          }
          this.mapVoteRunning = true
          this.voteOptions = options
          this.callVote(this.voteOptions)

      } else if (message === this.options.setNextFromWinnerCommand) {
          if (!this.mapVoteWinner) {
            await this.server.rcon.warn(playerInfo.steamID, 'Unable to set next map. No map vote winner is saved.')
            return;
          }
          const command = this.assembleRCONSetNextCommandFromCSVElement(this.mapVoteWinner)
          await this.server.rcon.setNextLayer(command)
          await this.server.rcon.warn(playerInfo.steamID, 'The winner of the vote has been set: \n' + `${this.mapVoteWinner[1]}`)

      } else if (message === this.options.readPoolCommand) {
          await this.sendCuratedPool(playerInfo)

      } else if (splitMessage[0] === this.options.setNextFromPoolCommand) {
          this.verbose(3, 'Set Next Command Triggered')
          if (!(splitMessage.length === 2)) {
            await this.server.rcon.warn(playerInfo.steamID, 'Invalid amount of parameters to the setnext command.\n' + "The second parameter must be a number corresponding to one of the map pool options.")

          } else if (this.server.mapPool === null || !this.server.mapPool.length) {
            await this.server.rcon.warn(playerInfo.steamID, 'The map pool is currently empty. Regenerate it before attempting to set a map from the pool.')

          } else if (!(!isNaN(splitMessage[1]))) {
            await this.server.rcon.warn(playerInfo.steamID, 'Invalid type of parameter, must be a number\n')
  0
          } else if (Number(splitMessage[1]) > this.options.layerPoolSize) {
            await this.server.rcon.warn(playerInfo.steamID, 'The given number must be within bounds of the generated map pool, bounds are currently: ' + "1-" + this.server.mapPool.length - 1)

          } else {
            const selectedChoice = Number(splitMessage[1]) - 1
            const selectedLayer = this.server.mapPool[selectedChoice]
            const message = `Setting next map to: ${selectedLayer[1]} - ${selectedLayer[3]}_${selectedLayer[4]} vs ${selectedLayer[5]}_${selectedLayer[6]}`
            await this.server.rcon.warn(playerInfo.steamID, message)
            const command = this.assembleRCONSetNextCommandFromCSVElement(selectedLayer)
            // TODO add some sort of check to see if the selected map is valid.
            await this.server.rcon.setNextLayer(command)
          }
        }
      }
    }

    async handleSetNextFromPool(message) {

    }

    async sendCuratedPool(playerInfo) {
      if (!this.server.curatedLayerList) {
        this.verbose(1, 'Curated layer list not loaded properly')
        await this.server.rcon.warn(playerInfo.steamID, 'Curated layer was not loaded properly\nUnable to send pool.')
        return;
      }
      if (!this.server.mapPool || !this.server.mapPool.length) {
        await this.server.rcon.warn(playerInfo.steamID, 'Generated map pool is empty. One must be generated first.')
        return;
      }

      let sampleList = this.server.mapPool
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

      if (message.length > 3) {
        warnList.push(message)
      }

      // Send the layer pool back to the admin
      for (let i = 0; i < 3; i++) {
        for (const warnMessage of warnList) {
          await this.server.rcon.warn(playerInfo.steamID, warnMessage)
        }
        await new Promise(resolve => setTimeout(resolve, this.server.warnMessagePersistenceTimeSeconds)); // Wait for 3 seconds
      }
    }

    async generateCuratedPoolDefault() {
      this.verbose(1, 'Generating map pool');

      // TODO make the pool into a set.
      const pool = [];
      const allLayers = this.server.curatedLayerList;
      const recentlyPlayedMaps = new Set(this.server.layerHistory.map(recentLayer => recentLayer.layer.map.name.toLowerCase().trim()));
      const recentlyPlayedFactions = new Set(this.server.layerHistory.map(recentLayer => recentLayer.layer.map.name.toLowerCase().trim()));
      // console.log(this.server.layerHistory[0].layer.teams)
      if (allLayers.length < this.options.layerPoolSize || allLayers.length <= recentlyPlayedMaps.size) {
        // If there are not enough available layers or too many duplicates in recently played layers, return an empty pool
        return pool;
      }

      while (pool.length < this.options.layerPoolSize) {
        const rand = this.getRandomInt(0, allLayers.length - 1);
        const pick = allLayers[rand];
        const mapName = pick[0];

        if (pool.some(picks => picks[0] === mapName) || recentlyPlayedMaps.has(mapName.toLowerCase().trim())) {
          continue;
        }

        pool.push(pick);
      }

      this.poolGenerationTime = Date.now();
      return pool;
    }


    // Generates the pool of maps from the paramaters given to the command. For ex. !genpool Narva Mutaha Yehorivka will generate a pool of those maps
    async generatePoolFromParameters(splitMessage, playerInfo) {
      function createMap(name, identifiers) {
        return { name, identifiers };
      }

      function createMapOption(map, mapIdentifiers, symmetrical, gameMode) {
        return { map, mapIdentifiers, symmetrical, gameMode }
      }

      function createBaseFilterOption(symmetrical, mapSize, gameMode) {
        return { symmetrical, mapSize, gameMode }
      }

      function checkIfMapInMessage(message) {
        for (let map of maps) {
          if (map.identifiers.includes(message)) {
            return map
          }
        }
      }

      function getGameMode(layer) {
        return layer[1].split("_")[1]
      }

      // Filters to be compared against.
      const maps = [
        createMap('Al Basrah', ['basrah', 'albasrah', 'al_basrah']),
        createMap('Anvil', ['anvil']),
        createMap('Belaya', ['belaya', 'bel']),
        createMap('Black Coast', ['blackcoast', 'bc', 'black_coast']),
        createMap('Chora', ['chora']),
        createMap('Fallujah', ['fallu', 'fallujah']),
        createMap('Fools Road', ['fools', 'fr', 'foolsroad']),
        createMap('Goose Bay', ['goose', 'gb', 'goosebay', 'goose_bay']),
        createMap('Gorodok', ['gorodok', 'goro']),
        createMap('Harju', ['harju']),
        createMap('Kamdesh', ['kamdesh', 'kamd']),
        createMap('Kohat', ['kohat', 'kohat_toi', 'kohattoi']),
        createMap('Kokan', ['kokan']),
        createMap('Lashkar', ['lashkar', 'lash', 'lashk']),
        createMap('Manic', ['manic', 'manicouagan', 'manicougan']),
        createMap('Mestia', ['mestia']),
        createMap('Mutaha', ['mutaha']),
        createMap('Narva', ['narva']),
        createMap('Sanxian', ['sanxian', 'sanx']),
        createMap('Sumari', ['sumari', 'sum', 'summ']),
        createMap('Skorpo', ['skorpo', 'skorp']),
        createMap('Tallil', ['tallil', 'talil']),
        createMap('Yehorivka', ['yehorivka', 'yeho'])
      ]
      const mapSizes = ['small', 'medium', 'large'];
      const gameModes = ['AAS', 'RAAS', 'Invasion', 'TC', 'Insurgency', 'Demolition']
      const symmetricalIdentifiers = ['symm', 'sym', 'symmetrical']
      // const symmetricalFilter = { name: 'Symmetrical', identifiers: , enabled: false }

      this.verbose(1, 'Generating map pool');
      let messages = splitMessage.map(message => message.toLowerCase().trim())
      let parameters = messages.slice(1)
      let globalGameMode = "";
      let mapPoolFilters = []
      let desiredMaps = []
      let pool = []
      let globalFilters = { symmetrical: false, mapSize: "", gameMode: "RAAS" }


      // TODO
      // 1. Get filters from parameters.
      // 2. Retrieve the valid layers based on the maps
      // 3. If any specific maps are in the parameters, those take precedence.
      // 4. Select a layer based on the map.

      /*
      Potential solutions:
      1. Make a class that's supposed to represent each potential map for the map pool. Stores options like symmetrical, game mode, map name, factions etc.
      */



      let filterOptions = []
      // Check if a global filter was supplied with no map options.
      if (parameters.length === 0) {
        // DEFAULT IS DEFINED HERE, IF NO FLAGS OR MAPS ARE GIVEN.
        let tempMapSizes = mapSizes
        const symmPickInt = this.getRandomInt(0, mapSizes.length - 1)
        const symmRandomSize = tempMapSizes[symmPickInt]
        tempMapSizes.splice(symmPickInt, 1)
        // const otherSize
        filterOptions.push(createBaseFilterOption(true, symmRandomSize, ''))
        for (const size of tempMapSizes) {
          filterOptions.push(createBaseFilterOption(false, size, ''))
        }

      }
      else if (parameters.length === 1) {
        if (mapSizes.includes(parameters[0].toLowerCase())) {
          globalFilters.mapSize = parameters[0].toLowerCase()
        }
      }



      messages.forEach(message => { let map = checkIfMapInMessage(message); if (map) { desiredMaps.push(map) }})
      // if (parameters.filter(value => { const intersection = mapSizes.includes(value); return intersection.length > 1}))
      // if (parameters.length === 0) { mapPoolFilters = mapSizes }
      if (parameters.some(parameter => symmetricalIdentifiers.includes(parameter))) { globalFilters.symmetrical = true }


      // Create get the filters and maps and combine them.
      // Process a pick option if maps have been given as input.
      let pickOptions = []
      for (let i = 0; i < desiredMaps.length; i++) {
        let pick = desiredMaps[i];
        let pickOption = createMapOption(pick.name, pick.identifiers, globalFilters.symmetrical, globalGameMode)
        pickOptions.push(pickOption)
      }

      const allLayers = this.server.curatedLayerList;
      const safeLayers = []
      const recentlyPlayedMaps = new Set(this.server.layerHistory.map(recentLayer => recentLayer.layer.map.name.toLowerCase().trim()));
      let filteredLayers = allLayers

      // Get all layers with global filters.
      if (globalFilters.symmetrical) {
        filteredLayers = filteredLayers.filter(layer => this.checkIfSymmetrical(layer))
      }
      if (globalFilters.mapSize) {
        filteredLayers = filteredLayers.filter(layer => layer[3] === globalFilters.mapSize)
      }
      // TODO enable this once game modes as a flag is supported.
      // if (globalFilters.gameMode) {
      //     filteredLayers = filteredLayers.filter(layer => getGameMode(layer[1]) === globalFilters.gameMode)
      // }

      // Find picks based on the maps already given.
      for (let option of pickOptions) {
        let pick;
        let potentialPicks = await filteredLayers.filter(layer => {
          let trimmedPotentialPick = layer[0].replace(" ", "").toLowerCase()
          let trimmedOption = option.map.replace(" ", "").toLowerCase()
          if (trimmedPotentialPick.includes(trimmedOption)) { return true }
        })
        potentialPicks = potentialPicks.filter(layer => !pool.includes(layer))

        // There are no valid picks according to the filters, so we continue.

        if (!potentialPicks || potentialPicks.length === 0 || potentialPicks.every(v => pool.includes(v))) {
          this.server.rcon.warn(playerInfo.steamID, `Specified map did not have any available layers according to the given filters: \n${option.map}`)
          continue
        }

        // TODO discuss whether this part should take past layers into consideration.
        while (!pick) {
          const rand = this.getRandomInt(0, potentialPicks.length - 1);
          const layerCandidate = potentialPicks[rand];
          const mapName = layerCandidate[0];
          if (pool.some(picks => picks[0] === mapName)) { continue }
          else pick = layerCandidate
          break;
          // if (pool.some(picks => picks[0] === mapName) || recentlyPlayedMaps.has(mapName.toLowerCase().trim())) {
          //   continue;
          // }
        }
        if (pick) { pool.push(pick) }
      }

      if (pool.length >= this.mapPoolSize) {
        return pool.slice(0, this.mapPoolSize)
      }

      // Generate any missing filter options.
      for (let i = pool.length + filterOptions.length; i < this.mapPoolSize; i++) {
        let mapSize;
        if (!globalFilters.mapSize) {
          mapSize = mapSizes[this.getRandomInt(0, mapSizes.length - 1)]
        } else {
          mapSize = globalFilters.mapSize
        }
        const option = createBaseFilterOption(globalFilters.symmetrical, mapSize, globalFilters.gameMode)
        filterOptions.push(option)
      }

      for (const option of filterOptions) {
        let filteredLayers = allLayers.filter(layer => layer[2].toLowerCase().trim().includes(option.mapSize))
        if (globalFilters.symmetrical) {
          filteredLayers = filteredLayers.filter(layer => this.checkIfSymmetrical(layer))
        }
        // if (globalFilters.gameMode) {
        //   filteredLayers = filteredLayers.filter(layer => getGameMode(layer[1]) === globalFilters.gameMode)
        // }


        // let pick;
        // if (!filteredLayers || (filteredLayers.length < this.mapPoolSize - pool.length)) {
        //   await this.server.rcon.warn(playerInfo.steamID, `Unable to generate layer with specified global filters.`)
        //   continue
        // }
        //
        // while (!pick || filteredLayers.length) {
        //   const randomInt = this.getRandomInt(0, filteredLayers.length - 1);
        //   const candidate = filteredLayers[randomInt];
        //   const mapName = candidate[0];
        //
        //   if (pool.some(picks => picks[0] === mapName) || recentlyPlayedMaps.has(mapName.toLowerCase().trim())) {
        //     filteredLayers.splice(randomInt, 1)
        //     continue;
        //   }
        //   pool.push(mapName)
        //   pick = mapName;
        //   break
        // }
      }

      // We use this as backup.

      if (allLayers.length < this.options.layerPoolSize || allLayers.length <= recentlyPlayedMaps.size) {
        // If there are not enough available layers or too many duplicates in recently played layers, return an empty pool
        return pool;
      }

      while (pool.length < this.options.layerPoolSize) {
        const rand = this.getRandomInt(0, allLayers.length - 1);
        const pick = allLayers[rand];
        const mapName = pick[0];

        if (pool.some(picks => picks[0] === mapName) || recentlyPlayedMaps.has(mapName.toLowerCase().trim())) {
          continue;
        }

        pool.push(pick);
      }

      this.poolGenerationTime = new Date();
      // Ensure that the pool can never be larger than the map pool size.
      return pool.splice(0, this.mapPoolSize)
    }


    checkIfSymmetrical(layerOption) {
      // Tentative, likely to change.
      // Format
      // Level: Layer: Size: Faction_1: SubFac_1: Faction_2: SubFac_2
      return layerOption[4] === layerOption[6]
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
            let winner = this.server.mapPool[i]
            this.mapVoteWinner = winner
            this.mapVoteRunning = false
            if (this.options.autoSetWinner) {
              const command = this.assembleRCONSetNextCommandFromCSVElement(winner)
              this.server.rcon.setNextLayer(command)
            }
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
        content: `\`\`\`fix\n${this.info.player.name} has started a vote: \n${broadcastStr}\n\`\`\``
      };
      await this.channel.send(message);

      await this.server.rcon.broadcast(
        `A vote has started! Enter a number to vote!\n${broadcastStr}`
      );
      this.voteBroadcast = setInterval(async () => {
        const msg = `A vote is in progress! Enter a number to vote!\n${broadcastStr}\nTotal votes: ${this.ballotBox.size}`
        // console.log(msg.length)
        await this.server.rcon.broadcast(msg)
      }, this.options.voteBroadcastIntervalSeconds * 1000);

      this.voteTimeout = setTimeout(this.tallyVotes, this.options.voteTime * 1000);
    }

    clearVote() {
      this.mapvote = false;
      this.voteInProgress = false;
      this.ballotBox = new Map();
      this.voteOptions = [];
      this.mapVoteRunning = false
    }

    assembleRCONSetNextCommandFromCSVElement(csv) {
      const command = `${csv[1]} ${csv[3]}+${csv[4]} ${csv[5]}+${csv[6]}`
      this.verbose(3, 'Constructed map command: ' + command)
      // indexes corresponding to (map)_(gamemode and layer version) (faction1)+(subfaction) (faction2)+(subfaction)
      return command
    }


    getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}
