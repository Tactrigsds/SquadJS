import DiscordBasePlugin from "./discord-base-plugin.js";
import fs from 'fs';
import { factions, getSubfaction} from '../utils/faction-constants.js'
import axios from "axios";

/*
KNOWN ISSUES, FEATURES TO IMPLEMENT ETC.
// TODO If there is a tie in the map vote, then currently the first pick is automatically set to the next map.
 */


export default class TTCustomVote extends DiscordBasePlugin {
  static get description() {
    return (
      +'<code>TT Custom Vote</code> Plugin that pulls curated layers, factions and subfactions into a pool that admins can access in game' +
      ''
    );
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
        default: ','
      },
      voteTime: {
        required: false,
        description: 'The amount of time for players to vote in seconds.',
        default: null,
        example: 120
      },
      voteBroadcastIntervalSeconds: {
        required: false,
        description: "The amount of time in seconds, between each broadcast for the vote.",
        example: 30,
        default: 30
      },
      ignoreChats: {
        required: true,
        description: 'The chat channels to ignore for reading commands',
        default: ['ChatAll', 'ChatSquad', 'ChatTeam'],
        example: ['ChatAll', 'ChatSquad', 'ChatTeam']
      },
      minMatchesBeforeDupeMap: {
        required: false,
        description: "The amount of games needed before a map can be pulled again.",
        default: 4,
        example: 0
      },
      layerPoolSize: {
        required: false,
        description: "The amount of layers in the voting pool",
        default: 3,
        example: 3
      },
      startVoteCommands: {
        required: false,
        description: 'The chat commands used to start a vote from the curated layers',
        default: ['!rockthevote', '!rtv'],
        example: ['!rockthevote', '!rtv']
      },
      generatePoolCommands: {
        required: false,
        description: 'Generate a new map pool sample.',
        default: ['!genpool'],
        example: ['!genpool']
      },
      readPoolCommands: {
        required: false,
        description: 'Command for retrieving what the current sample pool is.',
        default: ['!pool'],
        example: ['!pool']
      },
      rerollCommand: {
        required: false,
        description: "The command for rerolling the pool generation with the last parameters.",
        default: '!reroll',
        example: '!reroll'
      },
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
      autoSetMapVoteWinner: {
        required: false,
        description: "Whether the winner of a map vote should be automatically set by the plugin",
        example: true,
        default: true
      },
      generatePoolFrequencyLimitSeconds: {
        required: false,
        description: "How often the generate pool command can be used, in seconds.",
        default: 10,
        example: 10
      },
      symmetricalFlagIdentifiers: {
        required: false,
        description: "",
        default: ["symm", "sym", "symmetrical"],
        example: ["symm", "sym", "symmetrical"]
      },
      mapList: {
        required: true,
        description: "A list of maps and their shorthands/identifiers that will be recognised in chat. The name is not case sensitive, but should be done correctly regardless.",
        default: [],
        example: [
          {
            name: 'Al Basrah',
            shorthands: ['basrah', 'albasrah', 'al_basrah']
          }
        ]
      },
      useWebEndpoint: {
        required: false,
        description: "Whether the plugin should load it's layer list from a web endpoint.",
        default: {
          enabled: false,
          endpoint: ""
        }
      },
      balanceDifferential: {
        required: false,
        description: "The thresh of balance differential that's allowed for a potential layer to be in the curated list.",
        default: 2.5
      },
      layerlistVersion: {
        required: false,
        description: "The version of the layerlist parser to use. Temporary.",
        default: 'version2'
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onNewGame = this.onNewGame.bind(this);
    this.onChatMessage = this.onChatMessage.bind(this);
    this.sendCurrentPool = this.sendCurrentPool.bind(this);
    this.loadLayerListFromDisk = this.loadLayerListFromDisk.bind(this);
    this.generatePoolFromParameters = this.generatePoolFromParameters.bind(this);
    this.tallyVotes = this.tallyVotes.bind(this);
    this.callVote = this.callVote.bind(this);
    this.clearVote = this.clearVote.bind(this);
    this.getLevelFromMapList = this.getLevelFromMapList.bind(this)

    this.mapvote = false;
    this.voteInProgress = false;
    this.ballotBox = new Map();
    this.mapVoteWinner = null;
    this.mapVoteRunning = false;
    this.poolGenerationTime = Date.now()
    this.mapPoolSize = 3
    this.voteOptions = [];
    this.recentPoolPicks = []
    this.previousParameters = []
    this.adminTriggeringPoolGen = { admin: null, steamID: null }

    if (!Object.values(LAYER_LIST_VERSION_ENUM).includes(this.options.layerlistVersion)) {
      throw Error('Config does not include a valid layerlist version.')
    }
  }

  async mount() {
    this.verbose(2, 'Mounted');
    this.server.on('CHAT_MESSAGE', this.onChatMessage);
    this.server.on('NEW_GAME', this.onNewGame);
    this.mapPool = [];
    this.server.curatedLayerList = []
    try {
      if (this.options.useWebEndpoint.enabled) {
        this.server.curatedLayerList = await this.loadLayerListFromWebEndpoint(this.options.useWebEndpoint.endpoint)
      }

      if (!this.server.curatedLayerList?.length) {
        this.server.curatedLayerList = await this.loadLayerListFromDisk(this.options.curatedLayerListPath);
      }

    } catch (err) {
      this.verbose(1, 'Unable to generate map pool.');
      this.verbose(1, err);
    }
    this.verbose(3, 'Loaded layers: ' + this.options.curatedLayerListPath);
    // TODO make a function that converts the pool into a "printable" format.
    this.mapPool = await this.generatePoolFromParameters([], null, true);
    this.verbose(3, 'Curated pool on mount: ' + this.mapPool);
  }

  async unmount() {
    this.server.removeEventListener(this.onChatMessage);
    this.server.removeEventListener(this.onNewGame);
  }


  async onNewGame(info) {
    this.mapVoteWinner = null;
    this.previousParameters = [];
    this.adminTriggeringPoolGen = { admin: null, steamID: null }
    // TODO some sort of timeout may be required here, since the factions in a match are not actually loaded correctly until about 60 seconds seconds into the match, when the staging phase starts.
    this.mapPool = await this.generatePoolFromParameters();
  }






  async parseCuratedList(rawData, delimiter, layerListVersion){
    const parsedLayers = []
    let lines = rawData.split(/\r?\n/);

    if (layerListVersion === LAYER_LIST_VERSION_ENUM.VERSION1) {
      const regex = /^(?!\/\/)[^,;\n]+(?:[;,][^,;\n]+)*$/;
      lines = lines.slice(1)

      for (let line of lines) {
        try {
          line = line.trim();
          if (regex.test(line)) {
            line = line.split(delimiter);
            for (let i = 0; i < line.length; i++) {
              line[i] = line[i].trim();
            }
            const layer = {
              level: line[0],
              layer: line[1],
              size: line[2],
              faction1: line[3],
              subfaction1: line[4],
              faction2: line[5],
              subfaction2: line[6]
            };

          parsedLayers.push(layer);
          }

        } catch (err) {
          this.verbose(3, 'Something went wrong when parsing a line in the layer parser:')
          this.verbose(3, err)
        }
      }
    }

    else if (layerListVersion === LAYER_LIST_VERSION_ENUM.VERSION2) {
      const regex = /^(?!\/\/)[^,;\n]+(?:[;,][^,;\n]+)*$/;
      lines = lines.slice(1).map(line => line.trim())
      for (let line of lines) {
        if (!regex.test(line)) {
          continue
        }

        line = line.split(delimiter).map(line => line.trim())

        const layer = {
          level: line[0],
          layer: line[1],
          size: line[2],
          faction1: line[3],
          faction2: line[10],
          subfaction1: line[4],
          subfaction2: line[11],
          logisticsScore1: parseFloat(line[5]),
          logisticsScore2: parseFloat(line[12]),
          transportationScore1: parseFloat(line[6]),
          transportationScore2: parseFloat(line[13]),
          antiInfantryScore1: parseFloat(line[7]),
          antiInfantryScore2: parseFloat(line[14]),
          armorScore1: parseFloat(line[8]),
          armorScore2: parseFloat(line[15]),
          zeroScore1: parseFloat(line[9]),
          zeroScore2: parseFloat(line[16]),
          balanceDifferential: parseFloat(line[17]),
        }

        if (Math.abs(layer.balanceDifferential) > this.options.balanceDifferential) {
          continue
        }

        parsedLayers.push(layer)
      }
    }

    return parsedLayers
  }

  /**
   * Utility function that loads the layer list from disk.
   * @param path File path to the csv data that is to be loaded.
   * @returns {Promise<*[]>}
   */

  async loadLayerListFromDisk(path) {
    let layers = []
    try {
      const data = fs.readFileSync(path, 'utf-8');
      layers = await this.parseCuratedList(data, this.options.csvDelimiter, this.options.layerlistVersion)
    } catch (err) {
      this.verbose(1, 'Error occured when loading the layers file');
      this.verbose(2, err);
    }
    this.verbose(1, 'Loaded ' + layers.length + ' layers from the layer list.');
    return layers;
  }

  /**
   *
   * @returns {Promise<*[]>}
   */
  async loadLayerListFromWebEndpoint() {
    let layers = []
    const response = await axios.get(this.options.useWebEndpoint.endpoint)
    if (response) {
      layers = this.parseCuratedList(response.data, this.options.csvDelimiter, this.options.layerlistVersion)
    }
    return layers
  }

  async handleVoteMessages(info) {
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
  }

  /**
   * Handles the chat message event. Handles regular players votes, in addition to admin users pool generation, read pool and vote start commands.
   * @param info
   * @returns {Promise<void>}
   */
  async onChatMessage(info) {
    // eslint-disable-next-line no-unused-vars
    const adminChat = 'ChatAdmin';
    // eslint-disable-next-line no-unused-vars
    const commands = [];
    this.info = info;

    await this.handleVoteMessages(info)

    const playerInfo = await this.server.getPlayerBySteamID(info.steamID);
    const splitMessage = info.message.toLowerCase().split(' ');
    const message = info.message.toLowerCase();

    // Run admin commands
    if (!this.options.ignoreChats.includes(info.chat)) {
      if (this.options.generatePoolCommands.includes(splitMessage[0])) {
        if (this.mapVoteRunning) {
          await this.server.rcon.warn(
            playerInfo.steamID,
            'Cannot generate a new pool while a mapvote is running.'
          );
          return;
        }

        const currentTime = Date.now();
        // This is here, so I can comment out the time check during testing without getting errors.
        // eslint-disable-next-line no-unused-vars
        const timeSinceLastPoolGen = currentTime - this.poolGenerationTime;

        if (timeSinceLastPoolGen < this.options.generatePoolFrequencyLimitSeconds * 1000) {
          await this.server.rcon.warn(
            playerInfo.steamID,
            `Pool was regenerated too recently. Please wait ${Math.abs(
              Math.round((10000 - timeSinceLastPoolGen) / 1000)
            )} seconds before re-rolling it again`
          );
          return;
        }

        this.poolGenerationTime = currentTime;

        try {
          this.mapPool = await this.generatePoolFromParameters(splitMessage, playerInfo);
        } catch (err) {
          await this.server.rcon.warn(playerInfo.steamID, 'Something went wrong when generating pool');
          this.verbose(1, 'Error occured when sending pool.');
          this.verbose(1, err);
        }
        this.verbose(2, 'Map pool generated, triggered by admin: ' + playerInfo.name);
        const message = `Newly generated map pool, triggered by: ${playerInfo.name}`;
        this.sendCurrentPool(playerInfo, message);
        this.adminTriggeringPoolGen = { admin: playerInfo.name, steamID: playerInfo.steamID}
      }

      else if (this.options.startVoteCommands.includes(splitMessage[0])) {
        if (this.mapVoteRunning) {
          await this.server.rcon.warn(
            playerInfo.steamID,
            'Mapvote already running. End the old one before starting a new one.'
          );
          return;
        }

        const subfactionMap = new Map([
          ['Motorized', 'Motor'],
          ['AirAssault', 'Air'],
          ['Armored', 'Armor'],
          ['CombinedArms', 'CmbArm'],
          ['Support', 'Supp'],
          ['LightInfantry', 'Inf'],
          ['Mechanized', 'Mech']
        ]);

        const options = [];
        for (const voteOption of this.mapPool) {
          const option = `${voteOption.layer} ${voteOption.faction1} ${subfactionMap.get(
            voteOption.subfaction1
          )} vs ${voteOption.faction2} ${subfactionMap.get(voteOption.subfaction2)}`;
          options.push(option);
        }
        this.mapVoteRunning = true;
        this.voteOptions = options;
        this.callVote(this.voteOptions);
      }

      else if (message === this.options.setNextFromWinnerCommand) {
        if (!this.mapVoteWinner) {
          await this.server.rcon.warn(
            playerInfo.steamID,
            'Unable to set next map. No map vote winner is saved.'
          );
          return;
        }
        const command = assembleSetNextRCONCommandFromLayerObject(this.mapVoteWinner);
        await this.server.rcon.setNextLayer(command);
        await this.server.rcon.warn(
          playerInfo.steamID,
          'The winner of the vote has been set: \n' + `${this.mapVoteWinner.level}`
        );
      }

      else if (this.options.readPoolCommands.includes(splitMessage[0])) {
        let message;
        if (this.adminTriggeringPoolGen.admin && this.adminTriggeringPoolGen.steamID) {
          message = `Current map pool - generated by admin: ${this.adminTriggeringPoolGen.admin}`
        }
        else {
          message = `Current map pool - generated at round start`
        }
        const timeToRemove = (3600 * 4 * 1000)
        const tempTime = new Date(+this.poolGenerationTime - timeToRemove)
        const hour = tempTime.getHours().toString().padStart(2, '0')
        const minute = tempTime.getMinutes().toString().padStart(2, '0')

        message += `\n`
        message += `Servertime: ${hour}:${minute}`
        await this.sendCurrentPool(playerInfo, message);
      }

      else if (splitMessage[0] === this.options.setNextFromPoolCommand) {
        this.verbose(3, 'Set Next Command Triggered');
        if (!(splitMessage.length === 2)) {
          await this.server.rcon.warn(
            playerInfo.steamID,
            'Invalid amount of parameters to the setnext command.\n' +
              'The second parameter must be a number corresponding to one of the map pool options.'
          );

        } else if (this.mapPool === null || !this.mapPool.length) {
          await this.server.rcon.warn(
            playerInfo.steamID,
            'The map pool is currently empty. Regenerate it before attempting to set a map from the pool.'
          );
        }

        else if (!splitMessage[1].match(/^[0-9]+/)) {
          await this.server.rcon.warn(playerInfo.steamID, 'Invalid type of parameter, must be a number\n'
          );
        }

        else if (parseInt(splitMessage[1].trim()) > this.mapPoolSize || parseInt(splitMessage[1].trim()) < 1) {
          await this.server.rcon.warn(
            playerInfo.steamID,
            'The given number must be within bounds of the generated map pool, bounds are currently: ' +
              '1-' +
              this.mapPoolSize
          );
        } else {
          const selectedChoice = +splitMessage[1] - 1;
          const selectedLayer = this.mapPool[selectedChoice];
          const message = `Setting next map to: ${selectedLayer.layer} - ${selectedLayer.faction1}_${selectedLayer.subfaction1} vs ${selectedLayer.faction2}_${selectedLayer.subfaction2}`;
          await this.server.rcon.warn(playerInfo.steamID, message);
          const command = assembleSetNextRCONCommandFromLayerObject(selectedLayer);
          await this.server.rcon.setNextLayer(command);
        }
      } else if (splitMessage[0] === this.options.rerollCommand) {
        this.verbose(3, 'Reroll command triggered.');
        if (!this.previousParameters.length) {
          await this.server.rcon.warn(
            playerInfo.steamID,
            `There were no valid parameters stored from the previous pool generation.\nRunning with default settings instead.`
          );
        }

        const tempParameters = this.previousParameters;
        tempParameters.unshift(' ');
        this.mapPool = await this.generatePoolFromParameters(tempParameters, playerInfo);
        await this.sendCurrentPool(playerInfo, `Rerolling map pool with previous parameters:`);
      }
    }
  }

  async sendCurrentPool(playerInfo, headerMessage) {
    if (!this.server.curatedLayerList) {
      this.verbose(1, 'Curated layer list not loaded properly');
      await this.server.rcon.warn(
        playerInfo.steamID,
        'Curated layer was not loaded properly\nUnable to send pool.'
      );
      return;
    }
    if (!this.mapPool || !this.mapPool.length) {
      await this.server.rcon.warn(
        playerInfo.steamID,
        'Generated map pool is empty. One must be generated first.'
      );
      return;
    }

    const pool = this.mapPool;
    const warnList = [];
    let message = `${headerMessage} \n\n`;
    for (let i = 0; i < pool.length; i++) {
      const assembledLayer = `${i + 1}. ${pool[i].layer} - ${pool[i].faction1}_${pool[i].subfaction1} vs ${pool[i].faction2}_${pool[i].subfaction2}`;
      message += assembledLayer;
      message += '\n\n';
      // Only allow 2 layers per warn message, otherwise the message will become too long and not send.
      if (i % 2 === 0) {
        warnList.push(message);
        message = '\n\n';
      }
    }

    if (message.length > 3) {
      warnList.push(message);
    }

    // Send the layer pool back to the admin
    for (let i = 0; i < 3; i++) {
      for (const warnMessage of warnList) {
        await this.server.rcon.warn(playerInfo.steamID, warnMessage);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, this.server.warnMessagePersistenceTimeMilliSeconds)
      );
    }
  }

  /**
   *
   * @param message
   * @returns {null | string}
   */
  getLevelFromMapList(message) {
    let foundMap = null;

    for (const map of this.options.mapList) {
      if (map.shorthands.includes(message)) {
        foundMap = map
        break
      }
    }
    return foundMap;
  }

  checkIfLayerIsRecentlyPlayed(layer, recentMatches) {
    recentMatches = recentMatches.map((layer) =>
      layer.layerClassname.toLowerCase().trim().replace(' ', '')
    );
    return recentMatches.includes(layer.layer.toLowerCase().trim());
  }



  // Generates the pool of maps from the paramaters given to the command. For ex. !genpool Narva Mutaha Yehorivka will generate a pool of those maps
  async generatePoolFromParameters(splitMessage = [], playerInfo = null, timeout = false) {


    // This is a really stupid hack to ensure that the "persistent history" plugin can load the matches from the database before the pool is generated.
    if (timeout) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const mapSizes = ['small', 'medium', 'large'];
    const gameModes = ['aas', 'raas', 'invasion', 'tc', 'insurgency', 'demolition'];
    const symmetricalIdentifiers = this.options.symmetricalFlagIdentifiers;
    const assymmetricalIdentifiers = ['asymm', 'asym', 'assymetrical'];
    const anySubfactionIdentifiers = ['any', 'random'];

    // TODO improve the handling for the various flags and filters.

    this.verbose(1, 'Generating map pool...');
    const desiredMaps = [];
    const globalFilters = { symmetrical: false, mapSize: '', gameMode: '', subfactionSymmetry: null };
    const messages = splitMessage.map(message => message.toLowerCase().trim());
    const parameters = messages.slice(1);
    const globalFactions = [];
    const validParameters = [];
    const invalidParameters = [];
    const desiredMapSizes = [];
    const slotOptions = [];
    const currentMapPool = [];
    const allLayers = this.server.curatedLayerList;

    // eslint-disable-next-line no-unused-vars
    let recentMatchups = [];
    let recentMatches = this.server.getMatchHistorySinceSessionStart();


    recentMatches = recentMatches.map(match => {
      return {
        level: match.map,
        layer: match.layerClassname,
        levelTrimmed: match.layerClassname?.split('_')[0].toLowerCase().replace(/\s/g, ''),
        layerTrimmed: match.layerClassname?.toLowerCase().replace(/\s/g, ''),
        faction1: match.team1,
        faction2: match.team2,
        subfaction1: match.subFactionTeam1,
        subfaction2: match.subFactionTeam2
      };
    });


    /**
     * Parse and sort all the various parameters here.
     */

    for (const parameter of parameters) {
      this.verbose(2, `Parameter: ${parameter}`);
      const level = this.getLevelFromMapList(parameter);
      const faction = getFactionFromShorthand(parameter, factions);
      if (level && desiredMaps.length < this.mapPoolSize) {
        desiredMaps.push(level);
        validParameters.push(parameter);

      // TODO pre check here if a matchup is possible?
      }
      else if (faction && !globalFactions.includes(faction)) {
        globalFactions.push(faction)
        validParameters.push(parameter)

      }
      else if (mapSizes.includes(parameter) && desiredMapSizes.length < this.mapPoolSize) {
        desiredMapSizes.push(parameter);
        validParameters.push(parameter);

      }
      else if (gameModes.includes(parameter) && !globalFilters.gameMode) {
        globalFilters.gameMode = parameter;
        validParameters.push(parameter);

      }
      else if (!globalFilters.subfactionSymmetry) {
        if (symmetricalIdentifiers.includes(parameter)) {
          globalFilters.subfactionSymmetry = SUBFACTION_SYMMETRY_ENUM.SYMMETRICAL
          validParameters.push(parameter);
        }
        else if (assymmetricalIdentifiers.includes(parameter)) {
          globalFilters.subfactionSymmetry = SUBFACTION_SYMMETRY_ENUM.ASSYMMETRICAL
          validParameters.push(parameter)
        }
        else if (anySubfactionIdentifiers.includes(parameter)) {
          globalFilters.subfactionSymmetry = SUBFACTION_SYMMETRY_ENUM.RANDOM
          validParameters.push(parameter)
        }
        else {
          invalidParameters.push(parameter);
        }
      } else {
        invalidParameters.push(parameter);
      }
    }

    if (playerInfo && invalidParameters.length) {
      await this.server.rcon.warn(
        playerInfo.steamID,
        'The following parameters were either invalid, redundant or a duplicate:'
      );
      await this.server.rcon.warn(playerInfo.steamID, invalidParameters.join(', '));
    }

    this.previousParameters = validParameters;
    if (!globalFilters.subfactionSymmetry) {
      globalFilters.subfactionSymmetry = SUBFACTION_SYMMETRY_ENUM.RANDOM
    }

    if (desiredMapSizes.length === 1) {
      globalFilters.mapSize = desiredMapSizes[0];
    }

    /*
      This here defines the default options if there are no valid parameters given.
     */
    if (validParameters.length === 0) {
      this.verbose(2, 'Running pool generation with default parameters..');
      const tempSizes = [];
      for (let i = 0; i < this.mapPoolSize; i++) {
        tempSizes.push(getRandomMapSize());
      }
      const randomInt = getRandomInt(0, this.mapPoolSize - 1);
      const randomSize = tempSizes[randomInt];
      tempSizes.splice(randomInt, 1);
      slotOptions.push(createSlotOptionFilters(SUBFACTION_SYMMETRY_ENUM.SYMMETRICAL, randomSize, 'raas'));
      for (const size of tempSizes) {
        slotOptions.push(createSlotOptionFilters(SUBFACTION_SYMMETRY_ENUM.RANDOM, size, 'raas'));
      }
      this.verbose(3, `Default parameters filter options per map: ${slotOptions}`);
    }

    // Create get the filters and maps and combine them.
    // Process a pick option if maps have been given as input.

    // TODO adjust to use global or local/parameter specific filters when those are implemented.
    const desiredMapFilters = desiredMaps.map((layer) =>
      createMapSlotOption(
        layer.name,
        layer.identifiers,
        globalFilters.subfactionSymmetry,
        globalFilters.gameMode
      )
    );

    // Find picks based on the maps given as parameters.
    // We want these to take precedence.
    // If one of the map options does not have a valid pick, we simply move on and have broader filters.
    for (const option of desiredMapFilters) {
      const filteredMaps = filterLayers(
        allLayers,
        option.map,
        option.symmetryOption,
        option.gameMode,
        null
      );


      // There are no valid picks according to the filters, so we continue.
      if (!filteredMaps || filteredMaps.length === 0) {
        if (playerInfo) {
          await this.server.rcon.warn(
            playerInfo.steamID,
            `Specified map did not have any available layers according to the given filters: \n${option.map}`
          );
        }
        continue;
      }

      // TODO discuss whether this part should take past layers into consideration.
      const map = this.generatePoolBase(currentMapPool, filteredMaps, recentMatches, true, POOL_DUPLICATE_FILTERS_ENUM.ALLOW_DUPLICATE_LAYERS, false, 1);
      if (map && map.length > 0) {
        currentMapPool.push(map[0]);
      }
    }

    if (currentMapPool.length >= this.mapPoolSize) {
      return currentMapPool.slice(0, this.mapPoolSize);
    }

    // Generate any missing filter options.
    for (let i = currentMapPool.length + slotOptions.length; i < this.mapPoolSize; i++) {
      let mapSize;
      if (globalFilters.mapSize) {
        mapSize = globalFilters.mapSize;
      } else if (desiredMapSizes) {
        mapSize = desiredMapSizes.shift()
      } else {
        mapSize = getRandomMapSize();
      }
      const option = createSlotOptionFilters(
        globalFilters.subfactionSymmetry,
        mapSize,
        globalFilters.gameMode
      );
      slotOptions.push(option);
    }


    // Handle defaults and attempt to get maps from the filters that were specified if not enough maps were supplied.
    for (const option of slotOptions) {
      const filteredLayers = filterLayers(
        allLayers,
        null,
        option.symmetryOption,
        option.gameMode,
        option.mapSize
      );

      const map = this.generatePoolBase(currentMapPool, filteredLayers, recentMatches, false, POOL_DUPLICATE_FILTERS_ENUM.ALLOW_NO_DUPLICATES, false, 1);
      // Check if map is not empty before adding to mapPool
      if (map && map.length > 0) {
        currentMapPool.push(map[0]);
      }
    }

    if (currentMapPool.length >= this.mapPoolSize) {
      return currentMapPool.slice(0, this.mapPoolSize);
    }

    // If there are not enough available layers or too many duplicates in recently played layers, return an empty pool
    if (allLayers.length < this.mapPoolSize || allLayers.length <= recentMatches.length) {
      return currentMapPool;
    }

    // The fallback in case we weren't able to generate a pool with the specific map picks or with the global filters.
    const temp = this.generatePoolBase(
      currentMapPool,
      allLayers,
      recentMatches,
      false,
      POOL_DUPLICATE_FILTERS_ENUM.ALLOW_NO_DUPLICATES,
      false,
      this.mapPoolSize - currentMapPool.length
    );
    if (temp.length) {
      currentMapPool.push(...temp);
    }

    this.poolGenerationTime = Date.now();
    return currentMapPool.slice(0, this.mapPoolSize);
  }

  /**
   *
   * @param existingPool An array of the existing pool, if applicable.
   * @param filteredLayers
   * @param matchHistory
   * @param allowRecentlyPlayedMaps
   * @param allowDuplicateMapsLayers
   * @param poolLength
   * @param allowRecentFactions
   * @returns {*[]}
   */
  generatePoolBase(
    existingPool,
    filteredLayers,
    matchHistory,
    allowRecentlyPlayedMaps,
    allowDuplicateMapsLayers,
    allowRecentFactions = false,
    poolLength,
  ) {
    const newPool = [];
    if (!existingPool) {
      existingPool = []
    }

    if (!allowRecentlyPlayedMaps) {
      filteredLayers = filteredLayers.filter(layer => !checkIfMapIsRecentlyPlayed(layer, matchHistory));
    }


    if (!allowRecentFactions) {
      // We need to normalize the recent history as well as the current match so that it fits with the format that we take in the layers with.
      let history = [];
      // The first match includes the current one, which does not include faction data.
      const recentMatches = matchHistory.slice(1)

      const currentFaction1 = this.server.teamOne.split("_")
      const currentFaction2 = this.server.teamTwo.split("_")

      const currentFactionShort1 = currentFaction1[0]
      const currentFactionShort2 = currentFaction2[0]

      const currentSubfaction1 = currentFaction1[2]
      const currentSubfaction2 = currentFaction2[2]

      history.push( {layer: matchHistory[0].layer, faction1: currentFactionShort1, faction2: currentFactionShort2, subfaction1: currentSubfaction1, subfaction2: currentSubfaction2})
      recentMatches.forEach(match => {
        // If there is a field for team 1, there will also be a field for team 2, so we don't need to check both.
        if (match.faction1 && match.subfaction1 && match.faction2 && match.subfaction2) {
          history.push( {layer: match.layer, faction1: getFactionFromLongName(match.faction1, factions)?.short, faction2: getFactionFromLongName(match.faction2, factions)?.short, subfaction1: getSubfaction(match.subfaction1), subfaction2: getSubfaction(match.subfaction2)} )
        }
      })

      history = history.slice(0, 2)

      // TODO create some sort of object to represent the options for this as it grows in scope?
      // FOr example how many matches back should be taken into consideration etc...

      // TODO get a filter/check to see if a team has played any of the PLA variant recently? Should discuss policy on this.
      filteredLayers = filteredLayers.filter(layer => {
        let factionNotRecentlyPlayed = true
        for (const match of history) {
          if (layer.faction1 === match.faction1 || layer.faction1 === match.faction2 || layer.faction2 === match.faction2 || layer.faction1 === match.faction2) {
            factionNotRecentlyPlayed = false
          }
        }
        return factionNotRecentlyPlayed
      })
    }

    // If there are not enough available layers or too many duplicates in recently played layers, return an empty pool
    if (filteredLayers.length + newPool.length < poolLength) {
      return newPool;
    }

    while (filteredLayers.length && newPool.length < poolLength) {
      const candidateInt = getRandomInt(0, filteredLayers.length - 1);
      const candidatePick = filteredLayers[candidateInt];

      /*
      Check if a candidate pick is already in the existing or the new pool if
       */
      if (allowDuplicateMapsLayers === POOL_DUPLICATE_FILTERS_ENUM.ALLOW_DUPLICATE_MAPS) {
        if (existingPool.some(pick => pick.layer === candidatePick.layer) ||
            newPool.some(pick => pick.layer === candidatePick.layer)) {
          filteredLayers.splice(candidateInt, 1);
          continue;
        }
      }

      else if(allowDuplicateMapsLayers === POOL_DUPLICATE_FILTERS_ENUM.ALLOW_NO_DUPLICATES) {
        if (existingPool.some(pick => pick.level === candidatePick.level) ||
            newPool.some(pick => pick.level === candidatePick.level)) {
          filteredLayers.splice(candidateInt, 1);
          continue;
        }
      }

      newPool.push(candidatePick);
    }
    return newPool;
  }

  getRandomArrayElement(array) {
    return array[getRandomInt(0, array.length - 1)];
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
          this.mapVoteWinner = this.mapPool[i];
        }
        max = totals[i];
      }
    }
    if (this.mapVoteRunning) {
      this.mapVoteRunning = false;
      if (this.options.autoSetMapVoteWinner && this.mapVoteWinner) {
        const command = assembleSetNextRCONCommandFromLayerObject(this.mapVoteWinner);
        await this.server.rcon.setNextLayer(command);
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
    const broadcastStr = options.map((option, index) => `${index + 1}: ${option}\n`).join(' ');
    this.verbose(3, 'Server broadcast length: ' + broadcastStr.length);
    const message = {
      content: `\`\`\`fix\n${this.info.player.name} has started a vote: \n${broadcastStr}\n\`\`\``
    };
    await this.channel.send(message);

    await this.server.rcon.broadcast(
      `A vote has started! Enter a number to vote!\n${broadcastStr}`
    );
    this.voteBroadcast = setInterval(async () => {
      const msg = `A vote is in progress! Enter a number to vote!\n${broadcastStr}\nTotal votes: ${this.ballotBox.size}`;
      await this.server.rcon.broadcast(msg);
    }, this.options.voteBroadcastIntervalSeconds * 1000);

    this.voteTimeout = setTimeout(this.tallyVotes, this.options.voteTime * 1000);
  }

  clearVote() {
    this.mapvote = false;
    this.voteInProgress = false;
    this.ballotBox = new Map();
    this.voteOptions = [];
    this.mapVoteRunning = false;
  }
}

/**
 * Utility function that defines the chance of getting each map size.
 * @returns {string} An enum/string value representing a map size.
 */
function getRandomMapSize() {
  let mapSize;
  const rng = getRandomInt(0, 100 - 1);
  const upper = 40;
  const lower = 15;

  if (rng > upper) {
    mapSize = MAP_SIZES_ENUM.LARGE;
  } else if (rng >= lower && rng <= upper) {
    mapSize = MAP_SIZES_ENUM.MEDIUM;
  } else {
    mapSize = MAP_SIZES_ENUM.SMALL;
  }
  return mapSize;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


function checkIfMapIsRecentlyPlayed(layer, recentMatches) {
    const processedLayer = layer.level.toLowerCase().replace(/\s/g, '');
    return recentMatches.some((match) => processedLayer.includes(match.levelTrimmed));
  }


function checkIfFactionRecentlyPlayed() {
}


/**
 * Formats a layer into a format that can be used by RCON to set the next map.
 * Format as follows: (layer) (faction1)+(subfaction) (faction2)+(subfaction)
 * @param layer An object containing information about a layer.
 * @returns {string} A string representing a command that can be used to set the next map.
 */

function assembleSetNextRCONCommandFromLayerObject(layer) {
  return `${layer.layer} ${layer.faction1}+${layer.subfaction1} ${layer.faction2}+${layer.subfaction2}`;
}


// TODO include a faction vs faction filter at some point?
function filterLayers(layers, map, symmetryFilter, gameModeFilter, mapSizeFilter) {
  if (map) {
    layers = layers.filter(layer => {
      const potentialMap = layer?.level.replace(' ', '').toLowerCase();
      const trimmedOption = map?.replace(' ', '').toLowerCase();
      return potentialMap.includes(trimmedOption);
    });
  }

  if (symmetryFilter === SUBFACTION_SYMMETRY_ENUM.SYMMETRICAL) {
    layers = layers.filter(layer => {
      return hasSymmetricalSubfactions(layer)
      });
  }
  else if (symmetryFilter === SUBFACTION_SYMMETRY_ENUM.ASSYMMETRICAL) {
    layers = layers.filter(layer => {
      return !hasSymmetricalSubfactions(layer)
    })
  }

  if (gameModeFilter) {
    layers = layers.filter(layer => getGameMode(layer)?.toLowerCase() === gameModeFilter.toLowerCase());
  }
  if (mapSizeFilter) {
    layers = layers.filter(layer => layer?.size.toLowerCase() === mapSizeFilter.toLowerCase());
  }
  return layers;
}


/**
 * Checks if a given layer has symmetrical subfactions
 * @param layer An object from a layer list, representing a potential pick, it's factions etc.
 * @returns {boolean} A boolean of whether a layer has symmetrical subfactions/units
 */
function hasSymmetricalSubfactions(layer) {
  // Tentative, likely to change.
  // Format
  // Level: Layer: Size: Faction_1: SubFac_1: Faction_2: SubFac_2
  return layer?.subfaction1.toLowerCase() === layer?.subfaction2.toLowerCase();
}

/**
 *  Utility function used to find the shorthand of a faction from it's long name, which is usually how it's stored in the logs and the in the database.
 *  Hence, we need a mapping to retrieve it's shorthand for use for admin commands.
 *  Example input "Canadian Armed Forces", returns "CAF"
 *
 * @param factionFullName a string used to find the shorthand of a faction.
 * @param factions A map of shorthand and longname faction pairs.
 * @returns {string | null} Returns a string of the shorthand faction if found, else returns null if not found.
 */
function getFactionFromLongName(factionFullName, factions) {
    let foundFaction = null
    for (const [longName, shortName] of factions) {
      if (longName?.toLowerCase().trim() === factionFullName?.toLowerCase().trim()) {
        foundFaction = { short: shortName, long: longName }
        break
      }
    }
    return foundFaction
}
/**
 *  Inverse of the "getFactionFromLongName" function. Retrieves the full name of a faction from it's shorthand.
 *
 *
 * @param factionShortName
 * @param factions
 * @returns {null}
 */
function getFactionFromShorthand(factionShortName, factions) {
  let foundFaction = null
  for (const [longName, shortName] of factions) {
    if (shortName?.toLowerCase().trim() === factionShortName?.toLowerCase().trim()) {
      foundFaction = { short: shortName, long: longName }
      break
    }
  }
  return foundFaction
}

function getGameMode(layer) {
  // Layers are usually formatted as follows:
  // Level(Map)_GameMode_Version
  return layer.layer.split('_')[1];
}

function createMapSlotOption(map, mapIdentifiers, symmetryOption, gameMode) {
  return { map, mapIdentifiers, symmetryOption, gameMode };
}

function createSlotOptionFilters(symmetryOption, mapSize, gameMode) {
  return { symmetryOption, mapSize, gameMode };
}



const LAYER_FILTERS_ENUM = Object.freeze({
  ALLOW_RECENT_DUPLICATE_LAYERS: 1,
  ALLOW_RECENT_DUPLICATE_MAPS: 2,
  ALLOW_NO_RECENT_DUPLICATES: 3
});

const POOL_DUPLICATE_FILTERS_ENUM = Object.freeze({
  ALLOW_DUPLICATE_LAYERS: 1,
  ALLOW_DUPLICATE_MAPS: 2,
  ALLOW_NO_DUPLICATES: 3
})

const MAP_SIZES_ENUM = Object.freeze({
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large'
});

const SUBFACTION_SYMMETRY_ENUM = Object.freeze({
  SYMMETRICAL: 'symmetrical',
  ASSYMMETRICAL: 'assymetrical',
  RANDOM: 'random'
});

const LAYER_LIST_VERSION_ENUM = Object.freeze({
  VERSION1: 'version1',
  VERSION2: 'version2',
});
