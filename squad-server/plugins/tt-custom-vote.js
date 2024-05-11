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
      this.isSymmetrical = this.isSymmetrical.bind(this)

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
      const layers = []
      try {
        const regex = /^(?!\/\/)[^,;\n]+(?:[;,][^,;\n]+)*$/;
        const data = fs.readFileSync(path, 'utf-8')
        const lines = data.split('\n')
        for (let line of lines) {
          line = line.trim()
          if (regex.test(line)) {
            line = line.split(delimiter)
            for (let i = 0; i < line.length; i++) {
              line[i] = line[i].trim()
            }

            const layer = {
              level: line[0],
              layer: line[1],
              size: line[2],
              faction1: line[3],
              subfaction1: line[4],
              faction2: line[5],
              subfaction2: line[6]
            }

            layers.push(layer)
          }
        }

      } catch (err) {
        this.verbose(1, 'Error occured when loading the layers file')
        this.verbose(2, err)
      }
      this.verbose(3, 'Loaded layers:')
      // console.log(layers)
      // this.verbose(3, layers)
      return layers
    }


    async onNewGame(info){
      this.mapVoteWinner = null
      this.server.mapPool = await this.generateCuratedPoolDefault()
    }

    //
    async onChatMessage(info) {
      // eslint-disable-next-line no-unused-vars
      const adminChat = 'ChatAdmin'
      // eslint-disable-next-line no-unused-vars
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

      const playerInfo = await this.server.getPlayerBySteamID(info.steamID)
      const splitMessage = info.message.toLowerCase().split(" ")
      const message = info.message.toLowerCase()

      // Run admin commands
      if (!this.options.ignoreChats.includes(info.chat)) {
        if (splitMessage[0] === this.options.generatePoolCommand || splitMessage[0] === '!reroll') {
          if (this.mapVoteRunning) {
            await this.server.rcon.warn(playerInfo.steamID, 'Cannot generate a new pool while a mapvote is running.')
            return;
          }

          const currentTime = new Date()
          const timeSinceLastCall = currentTime - this.poolGenerationTime


          // if (timeSinceLastCall < this.options.generatePoolFrequencyLimitSeconds * 1000) {
          //   await this.server.rcon.warn(playerInfo.steamID, `Pool was regenerated too recently. Please wait ${Math.abs(Math.round((10000 - timeSinceLastCall) / 1000))} seconds before calling it again`)
          //   return
          // }

          this.poolGenerationTime = currentTime

          // this.server.mapPool = this.generateCuratedPoolDefault()
          this.server.mapPool = await this.generatePoolFromParameters(splitMessage, playerInfo)


          // if (splitMessage.length === 1) {
          //   this.server.mapPool = await this.generateCuratedPoolDefault()
          // } else {}

          this.verbose(2, 'The admin triggering the generation: ' + playerInfo.name)
          await this.server.rcon.warn(playerInfo.steamID, 'Map pool generated. Displaying new pool:')
          await new Promise(resolve => setTimeout(resolve, this.server.warnMessagePersistenceTimeSeconds))
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

          const options = []
          for (const voteOption of this.server.mapPool) {
            // let option = `${voteOption[1]} ${voteOption[3]} ${voteOption[4]} vs ${voteOption[5]} ${voteOption[6]}`
            const option = `${voteOption.layer} ${voteOption.faction1} ${subfactionMap.get(voteOption.subfaction1)} vs ${voteOption.faction2} ${subfactionMap.get(voteOption.subfaction2)}`
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
          await this.server.rcon.warn(playerInfo.steamID, 'The winner of the vote has been set: \n' + `${this.mapVoteWinner.level}`)

      } else if (message === this.options.readPoolCommand) {
          await this.sendCuratedPool(playerInfo)

      } else if (splitMessage[0] === this.options.setNextFromPoolCommand) {
          this.verbose(3, 'Set Next Command Triggered')
          if (!(splitMessage.length === 2)) {
            await this.server.rcon.warn(playerInfo.steamID, 'Invalid amount of parameters to the setnext command.\n' + "The second parameter must be a number corresponding to one of the map pool options.")

          } else if (this.server.mapPool === null || !this.server.mapPool.length) {
            await this.server.rcon.warn(playerInfo.steamID, 'The map pool is currently empty. Regenerate it before attempting to set a map from the pool.')

          } else if (!splitMessage[1].match(/^[0-9]+/)) {
            await this.server.rcon.warn(playerInfo.steamID, 'Invalid type of parameter, must be a number\n')
  
          } else if (parseInt(splitMessage[1].trim()) > this.mapPoolSize || parseInt(splitMessage[1].trim()) < 1) {
            // console.log(splitMessage[1])
            await this.server.rcon.warn(playerInfo.steamID, 'The given number must be within bounds of the generated map pool, bounds are currently: ' + "1-" + (this.mapPoolSize))

          } else {
            const selectedChoice = Number(splitMessage[1]) - 1
            const selectedLayer = this.server.mapPool[selectedChoice]
            const message = `Setting next map to: ${selectedLayer.layer} - ${selectedLayer.faction1}_${selectedLayer.subfaction1} vs ${selectedLayer.faction2}_${selectedLayer.subfaction2}`
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

      const pool = this.server.mapPool
      const warnList = []
      let message = "Generated matchup pool: \n\n"
      for (let i = 0; i < pool.length; i++) {
        const assembledLayer = `${i+1}. ${pool[i].layer} - ${pool[i].faction1}_${pool[i].subfaction1} vs ${pool[i].faction2}_${pool[i].subfaction2}`
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
      // const recentlyPlayedFactions = new Set(this.server.layerHistory.map(recentLayer => recentLayer.layer.map.name.toLowerCase().trim()));
      // console.log(this.server.layerHistory[0].layer.teams)
      if (allLayers.length < this.options.layerPoolSize || allLayers.length <= recentlyPlayedMaps.size) {
        // If there are not enough available layers or too many duplicates in recently played layers, return an empty pool
        return pool;
      }

      while (pool.length < this.options.layerPoolSize) {
        const rand = this.getRandomInt(0, allLayers.length - 1);
        const pick = allLayers[rand];
        const mapName = pick.level;

        if (pool.some(picks => picks.level === mapName) || recentlyPlayedMaps.has(mapName.toLowerCase().trim())) {
          continue;
        }

        pool.push(pick);
      }

      this.poolGenerationTime = new Date();
      return pool;
    }


    // Generates the pool of maps from the paramaters given to the command. For ex. !genpool Narva Mutaha Yehorivka will generate a pool of those maps
    async generatePoolFromParameters(splitMessage = [], playerInfo = null) {
      function createMap(name, identifiers) {
        return { name, identifiers };
      }

      function createMapOption(map, mapIdentifiers, symmetrical, gameMode) {
        return { map, mapIdentifiers, symmetrical, gameMode }
      }

      function createBaseFilterOption(symmetrical, mapSize, gameMode) {
        return { symmetrical, mapSize, gameMode }
      }

      function getGameLevel(message) {
        for (const map of maps) {
          if (map.identifiers.includes(message)) {
            return map
          }
        }
      }


      // TODO include a faction vs faction filter at some point?
      function filterLayers(layers, map, symmetricalFilter, gameModeFilter, mapSizeFilter) {
        if (map) {
           layers = layers.filter(layer => {
            const potentialMap = layer.level.replace(" ", "").toLowerCase()
            const trimmedOption = map.replace(" ", "").toLowerCase()
            return potentialMap.includes(trimmedOption);
          })
        }
        if (symmetricalFilter) {
          layers = layers.filter(layer => { return layer.subfaction1 === layer.subfaction2 })
        }
        if (gameModeFilter) {
          layers = layers.filter(layer => getGameMode(layer).toLowerCase() === gameModeFilter)
        }
        if (mapSizeFilter) {

          layers = layers.filter(layer => layer.size.toLowerCase() === mapSizeFilter)
        }

        return layers
      }

      function getGameMode(layer) {
        // Layers are usually formatted as follows:
        // Level(Map)_GameMode_Version
        return layer.layer.split("_")[1]
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
      const gameModes = ['aas', 'raas', 'invasion', 'tc', 'insurgency', 'demolition']
      const symmetricalIdentifiers = ['symm', 'sym', 'symmetrical']

      // TODO improve the handling for the various flags and filters.

      this.verbose(1, 'Generating map pool');
      const desiredMaps = []
      const globalFilters = { symmetrical: false, mapSize: "", gameMode: "" }
      const messages = splitMessage.map(message => message.toLowerCase().trim())
      const parameters = messages.slice(1)
      const validParameters = []
      const invalidParameters = []
      const desiredMapSizes = []
      const filterOptions = []
      const mapPool = []

      // TODO
      // 1. Get filters from parameters.
      // 2. Retrieve the valid layers based on the maps
      // 3. If any specific maps are in the parameters, those take precedence.
      // 4. Select a layer based on the map.

      // We perform the parameter filtering here.
      // We want to keep track of parameters that were invalid or redudant the user of them.

      for (const parameter of parameters) {
        this.verbose(2, `Parameter: ${parameter}`)
        const level = getGameLevel(parameter)
        if (level && desiredMaps.length < this.mapPoolSize) {
          desiredMaps.push(level)
          validParameters.push(parameter)
        }

        else if (mapSizes.includes(parameter) && desiredMapSizes.length < this.mapPoolSize) {
          desiredMapSizes.push(parameter);
          validParameters.push(parameter);

        } else if (gameModes.includes(parameter) && !globalFilters.gameMode) {
          globalFilters.gameMode = parameter;
          validParameters.push(parameter);

        } else if (symmetricalIdentifiers.includes(parameter) && !globalFilters.symmetrical) { // Changed the condition here
          globalFilters.symmetrical = true;
          validParameters.push(parameter);

        } else {
          invalidParameters.push(parameter);
        }
      }

      if (playerInfo) {
        await this.server.rcon.warn(playerInfo.steamID, 'The following parameters were either invalid or redundant:')
        await this.server.rcon.warn(playerInfo.steamID, invalidParameters.join(", "))
      }


      if (desiredMapSizes.length === 1) {globalFilters.mapSize = desiredMapSizes[0]}

      /*
      This here defines the default options if there are no valid parameters given.
      The rules are basically these:
      1. We want to ensure one of the picks is always symmetrical.
      2. We want to have picks of all the 3 different sizes, i.e 1 map each of small, medium and large.
       */

      if (validParameters.length === 0) {
        const tempSizes = mapSizes
        const symmPickInt = this.getRandomInt(0, mapSizes.length - 1)
        const symmRandomSize = tempSizes[symmPickInt]
        tempSizes.splice(symmPickInt, 1)
        // const otherSize
        filterOptions.push(createBaseFilterOption(true, symmRandomSize, ''))
        for (const size of tempSizes) {
          filterOptions.push(createBaseFilterOption(false, size, ''))
        }
      }


      // Create get the filters and maps and combine them.
      // Process a pick option if maps have been given as input.

      // TODO adjust to use global or local/parameter specific filters when those are implemented.
      const desiredMapFilters = desiredMaps.map(layer => createMapOption(layer.name, layer.identifiers, globalFilters.symmetrical, globalFilters.gameMode))
      const allLayers = this.server.curatedLayerList;
      const recentlyPlayedMaps = this.server.layerHistory.map(recentLayer => recentLayer.layer.map.name.toLowerCase().trim().replace(" ", ""))

      // Find picks based on the maps given as parameters.
      // We want these to take precedence.
      // If one of the map options does not have a valid pick, we simply move on and have broader filters.
      for (const option of desiredMapFilters) {
        const filteredMaps = filterLayers(allLayers, option.map, option.symmetrical, option.gameMode, "")

        // There are no valid picks according to the filters, so we continue.
        if (!filteredMaps || filteredMaps.length === 0) {
          this.server.rcon.warn(playerInfo.steamID, `Specified map did not have any available layers according to the given filters: \n${option.map}`)
          continue
        }

        // TODO discuss whether this part should take past layers into consideration.
        const map = await this.generatePoolBase(filteredMaps, recentlyPlayedMaps, true, 1)
        if (map) { mapPool.push(map[0]) }
      }

      if (mapPool.length >= this.mapPoolSize) {
        return mapPool.slice(0, this.mapPoolSize)
      }

      // Generate any missing filter options.
      for (let i = mapPool.length + filterOptions.length; i < this.mapPoolSize; i++) {
        let mapSize;
        if (!globalFilters.mapSize) {
          mapSize = this.getRandomArrayElement(mapSizes)
        } else {
          mapSize = globalFilters.mapSize
        }
        const option = createBaseFilterOption(globalFilters.symmetrical, mapSize, globalFilters.gameMode)
        filterOptions.push(option)
      }

      // Handle defaults and attempt to get maps from the filters that were specified if not enough maps were supplied.
      for (const option of filterOptions) {
        const filteredLayers = filterLayers(allLayers, "", option.symmetrical, option.gameMode, option.mapSize)
        const map = await this.generatePoolBase(filteredLayers, recentlyPlayedMaps, false, 1)
        if (map) { mapPool.push(map[0]) }
      }


      if (allLayers.length < this.options.layerPoolSize || allLayers.length <= recentlyPlayedMaps.size) {
        // If there are not enough available layers or too many duplicates in recently played layers, return an empty pool
        return mapPool;
      }

      while (mapPool.length < this.options.layerPoolSize) {

        const pick = this.getRandomArrayElement(allLayers)
        const mapName = pick.level;

        if (mapPool.some(picks => picks.level === mapName) || recentlyPlayedMaps.includes(mapName.toLowerCase().trim())) {
          continue;
        }

        mapPool.push(pick);
      }

      this.poolGenerationTime = new Date();
      // Ensure that the pool can never be larger than the map pool size.
      return mapPool.splice(0, this.mapPoolSize)
    }


    async generatePoolBase(currentPool = [], filteredLayers, recentlyPlayed, allowRecentlyPlayed, poolLength) {

      if(!allowRecentlyPlayed) {
        filteredLayers = filteredLayers.filter(layer => !recentlyPlayed.includes(layer.level.toLowerCase().replace(" ", "")))
      }

      // If there are not enough available layers or too many duplicates in recently played layers, return an empty pool
      if (filteredLayers.length + currentPool.length < poolLength) {
        return currentPool;
      }

      while (currentPool.length < poolLength) {
        const candidatePick = this.getRandomArrayElement(filteredLayers)
        currentPool.push(candidatePick)
      }
      return currentPool
    }


    getRandomArrayElement(array) {
      return array[this.getRandomInt(0, array.length - 1)]
    }




    isSymmetrical(layerOption) {
      // Tentative, likely to change.
      // Format
      // Level: Layer: Size: Faction_1: SubFac_1: Faction_2: SubFac_2
      return layerOption.subfaction1 === layerOption.subfaction2
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

    // Assembles a layer into the format required to set the next map.
    assembleRCONSetNextCommandFromCSVElement(csv) {
      const command = `${csv.layer} ${csv.faction1}+${csv.subfaction1} ${csv.faction2}+${csv.subfaction2}`
      this.verbose(3, 'Constructed map command: ' + command)
      // indexes corresponding to (map)_(gamemode and layer version) (faction1)+(subfaction) (faction2)+(subfaction)
      return command
    }


    getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}
