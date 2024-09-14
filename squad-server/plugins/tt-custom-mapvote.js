import DiscordBasePlugin from "./discord-base-plugin.js";
import fs from 'fs';
import {defaultMapList, factionMap, getSubfaction, subfactionAbbreviations} from '../utils/faction-constants.js'
import axios from "axios";
import path from "path";
import {
    getFormattedDateForLog,
    getLayerListLogPath
} from "../utils/utils.js";

/*
KNOWN ISSUES, FEATURES TO IMPLEMENT ETC.
// TODO If there is a tie in the map vote, then currently the first pick is automatically set to the next map.
 */


export default class TTCustomMapVote extends DiscordBasePlugin {
    static get description() {
        return (
            '<code>' +
            'TT Custom Vote</code> Plugin that pulls a list of curated layers, factions and subfactions into a pool that admins can access in game and launch map votes with.' +
            ''
        )
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
                required: false,
                description: "A list of maps and their shorthands/identifiers that will be recognised in chat. The name is not case sensitive, but should be done correctly regardless.",
                example: [
                    {
                        name: 'Al Basrah',
                        shorthands: ['basrah', 'albasrah', 'al_basrah']
                    }
                ]
            },
            useWebEndpoint: {
                required: false,
                description: "Whether the plugin should load it's layer list from a web endpoint. If enabled, requires an endpoint/web address, and can optionally include an API key if layer list is not public.",
                default: {
                    enabled: false,
                    endpoint: "",
                    apiKey: ""
                }
            },
            balanceDifferential: {
                required: false,
                description: "The maximum allowed balance differential that's allowed for a layer to be included in the curated list.",
                default: 2.5
            },
            layerlistVersion: {
                required: false,
                description: "The version of the layerlist parser to use. Temporary.",
                default: 'version2'
            },
            setLayerOnRoundStart: {
                required: false,
                description: "Whether to set a random layer on match start, used as a fallback instead of the inbuilt layerlist on the server.",
                default: false
            },
            useNightHours: {
                required: false,
                description: "Whether to use night hours, needs a start and end time, defined in UTC",
                default: {
                    enabled: false,
                    startTimeUTC: '22:00',
                    endTimeUTC: '08:00'
                }
            },
            layerListLogFolder: {
                required: false,
                description: "",
                default: './logfolder'
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
        this.mapList = this.options.mapList ? this.options.mapList : defaultMapList
        this.usedNightTimeLayers = false

        if (!Object.values(LAYER_LIST_VERSION_ENUM).includes(this.options.layerlistVersion)) {
            throw Error('Config does not include a valid layerlist version.')
        }
    }

    async mount() {
        this.verbose(2, 'Mounted');
        this.server.on(this.server.eventsEnum.chatMessage, this.onChatMessage);
        this.server.on(this.server.eventsEnum.newGame, this.onNewGame);
        this.server.on(this.server.eventsEnum.databaseUpdated, this.onDatabaseUpdated)
        this.curatedLayerList = []
        this.server.setLayerOnRoundStart = this.options.setLayerOnRoundStart
        let curatedLayerList;

        try {
            if (this.options.useWebEndpoint.enabled) {
                curatedLayerList = await this.loadLayerListFromWebEndpoint(this.options.useWebEndpoint.endpoint)
            }

            if (!this.options.useWebEndpoint.enabled || !curatedLayerList?.length) {
                curatedLayerList = await this.loadLayerListFromDisk(this.options.curatedLayerListPath);
                if (curatedLayerList.length) {
                    this.verbose(1, `Successfully loaded layer list from disk. Path: ${this.options.curatedLayerListPath}`)
                } else {
                    this.verbose(1, `Layer list is empty.`)
                }
            } else {
                this.verbose(1, 'Loaded layer list from web.')
            }

        } catch (err) {
            this.verbose(1, 'Unable to generate map pool.');
            this.verbose(1, err);
        }

        this.fullLayerList = curatedLayerList.filter(layer => !hasSpecificMap(layer, ['AlBasrah']))
        this.fullLayerList = curatedLayerList.filter(layer => !hasSpecificLayer(layer, ['Manicouagan_AAS_v3']))

        this.curatedLayerList = this.fullLayerList
        this.safeLayerList = generateSafeLayerList(this.fullLayerList)
        this.nightTimeLayerList = generateNightLayerList(this.fullLayerList)
        this.verbose(1, `Full layer list length: ${this.curatedLayerList.length}`)
        this.verbose(1, `Night time layer list length: ${this.nightTimeLayerList.length}`)
        this.verbose(1, `Safe layer list length: ${this.safeLayerList.length}`)

        // Perform logging of layerlists.
        try {
            this.layerListLogFile = getLayerListLogPath(this.options.layerListLogFolder)
            initializeLogFolder(this.options.layerListLogFolder)
            this.initializeLogFile(this.layerListLogFile)
            deleteOldFiles(this.options.layerListLogFolder)
        } catch (err) {
            this.verbose(1, `Something went wrong when initializing layer list logging`)
            console.log(err)
        }

        this.mapPool = []
        this.mapPool = await this.getPoolFromNightTime([], null, true)
    }

    async unmount() {
        this.server.removeEventListener(this.onChatMessage);
        this.server.removeEventListener(this.onNewGame);
        this.server.removeEventListener(this.onDatabaseUpdated)
    }

    async onNewGame() {
        this.mapVoteWinner = null;
        this.previousParameters = [];
        this.server.nextLayerSet = false
        this.adminTriggeringPoolGen = { admin: null, steamID: null }

        if (this.server.setLayerOnRoundStart) {
            if (this.server.currentMap.layer.includes('Jensen') || this.server.currentMap.layer.includes('Seed')) {
                return
            }
        }

        // TODO change to use a different variable, perhaps something like "autosetMap", which the nextlayerset plugin can use
        // To then change the "this.server.nexltayerset" variable once the map set is detected.
        setTimeout(async () => {
            if (this.server.setLayerOnRoundStart) {
                if (this.server.currentMap.layer.includes('Jensen') || this.server.currentMap.layer.includes('Seed')) {
                    return
                }
            }

            const tempPool = await this.generatePoolFromParameters([], null, false, this.safeLayerList);
            this.server.warnAllAdmins('SquadJS: Setting random pick from map pool as a fallback.')
            await this.setPoolPickOnRoundStart(tempPool)
            setTimeout(() => {
                this.server.nextLayerSet = false
            }, 10 * 1000)
        }, 90 * 1000)
    }

    async onDatabaseUpdated() {
        this.mapPool = []
        setTimeout(async () => {
            this.mapPool = await this.getPoolFromNightTime()
        }, 10 * 1000)
    }


    /**
     *  Utility function for getting and setting a random map upon match start.
     * @returns {Promise<void>}
     */
    async setPoolPickOnRoundStart(pool) {
        const mapPick = this.getRandomArrayElement(pool)
        await this.customVoteLog(layerToStringShortCompact(mapPick), 3)
        if (!mapPick) {this.verbose(1, 'Something went wrong when trying to set the next map on round start.'); return}
        this.verbose(1, 'Performing autoset on map start...')
        await this.server.rcon.setNextLayer(assembleSetNextRCONCommandFromLayerObject(mapPick))
    }


    async customVoteLog(message, prefix = 1) {
        const prefix1 = `LayerList`
        const prefix2 = `Pool`
        const prefix3 = `AutoSet`

        // TODO change this into an enum, or find another solution entirely.
        let activePrefix;
        switch (prefix) {
            case 1: {
                activePrefix = prefix1
                break
            }
            case 2: {
                activePrefix = prefix2
                break
            }
            case 3: {
                activePrefix = prefix3
                break
            }
            default: activePrefix = prefix1
        }

        const currentMap = this.server.currentMap
        const nextMap = this.server.nextMap

        const currentFaction1 = currentMap.factions.split(" ")[0]
        const currentFaction2 = currentMap.factions.split(" ")[1]

        const nextFaction1 = nextMap.factions.split(" ")[0]
        const nextFaction2 = nextMap.factions.split(" ")[1]

        const factionMessage = `currentLayer:${currentMap.layer},currentFaction1:${currentFaction1},currentFaction2:${currentFaction2},nextLayer:${nextMap.layer},nextFaction1:${nextFaction1},nextFaction2:${nextFaction2}`

        const date = new Date()
        const logMessage = `[${getFormattedDateForLog(date)}]_[${activePrefix}]_[${factionMessage}]_[${message}]\r\n`
        fs.appendFile(this.layerListLogFile, logMessage, (err) => {
            if (err) {
                this.verbose(1, `Error occured when logging the layerlist.`)
                this.verbose(1, err)
            }
        });
    }

    initializeLogFile(filePath) {
        try {
            fs.writeFileSync(filePath, '')
        } catch (e) {
            this.verbose(1, `Error when initializing log file.`)
            this.verbose(1, e)
        }
    }

    async getPoolFromNightTime(messages = [], playerInfo = null, useTimeout = false) {
        const nightTimeStart = this.options.useNightHours.startTimeUTC
        const nightTimeEnd = this.options.useNightHours.endTimeUTC
        let pool;
        if (this.options.useNightHours.enabled && checkIfTimeInRange(nightTimeStart, nightTimeEnd, new Date())) {
            this.verbose(1, 'Generating pool using nighttime layerlist.')
            pool = await this.generatePoolFromParameters(messages, playerInfo, useTimeout, this.nightTimeLayerList)
        } else {
            this.verbose(1, 'Generating pool using regular layerlist.')
            pool = await this.generatePoolFromParameters(messages, playerInfo, useTimeout, this.curatedLayerList);
        }
        await this.customVoteLog(layersArrayToString(pool, layerToStringShortCompact, false), 2)
        const layerString = layersArrayToString(pool, layerToStringShort, true).trimEnd()
        this.verbose(2, `Generated pool: \n${layerString}`)
        return pool
    }



    /**
     * Utility function for parsing the raw layerlist data, and formatting into objects that can be used throughout the plugin.
     * @param rawData {string} String version of the raw data.
     * @param delimiter {string} The character used to deliminate the rows in the csv files.
     * @param layerListVersion {string}
     * @param balanceDifferential {number} A number representing the minimum balance referential for a layer to be kept in the layerlist.
     * @returns {Promise<*[]>}
     */
    async parseCuratedList(rawData, delimiter, layerListVersion, balanceDifferential = 2.5){
        const parsedLayers = []
        let lines = rawData.split(/\r?\n/);

        /*
        Get version from layerlist.
         */
        const versionRegex = /^/
        lines.slice(1)

        // TODO create some sort of method for infering the layer list version.

        if (layerListVersion === LAYER_LIST_VERSION_ENUM.VERSION2) {
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

        else {
            const regex = /^(?!\/\/)[^,;\n]+(?:[;,][^,;\n]+)*$/;
            // Remove csv header.
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
     * @param layerListVersion
     * @param delimiter
     * @returns {Promise<*[]>}
     */

    async loadLayerListFromDisk(path, layerListVersion = LAYER_LIST_VERSION_ENUM.VERSION5, delimiter) {
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
    async loadLayerListFromWebEndpoint(endpoint) {
        let layers = []
        const response = await axios.get(endpoint)
        if (response) {
            layers = this.parseCuratedList(response.data, this.options.csvDelimiter, this.options.layerlistVersion)
        }
        return layers
    }

    /**
     * Utility function for taking in messages specifically related to mapvotes.
     * @param info
     * @returns {Promise<void>}
     */
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

        /*
        Chat commands, admin only.
         */
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
                    this.mapPool = await this.getPoolFromNightTime(splitMessage, playerInfo, false);
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

                const options = [];
                for (const voteOption of this.mapPool) {
                    let option
                    const variantLong = `${voteOption.layer} ${voteOption.faction1} ${voteOption.subfaction1} vs ${voteOption.faction2} ${voteOption.subfaction2}`;
                    const variantShort = `${voteOption.layer} ${voteOption.faction1} ${subfactionAbbreviations.get(voteOption.subfaction1)} vs ${voteOption.faction2} ${subfactionAbbreviations.get(voteOption.subfaction2)}`;

                    if (variantLong.length + this.server.voteMessageBaseLength >= this.server.serverBroadcastCharLimit) {
                        option = variantShort
                    } else {
                        option = variantLong
                    }
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
                    message = `Current map pool - pool generation triggered by admin: ${this.adminTriggeringPoolGen.admin}`
                }
                else {
                    message = `Current map pool - pool generation triggered by SquadJS`
                }
                const timeToRemove = (3600 * 4 * 1000)
                const tempTime = new Date(+this.poolGenerationTime - timeToRemove)
                const hour = tempTime.getUTCHours().toString().padStart(2, '0')
                const minute = tempTime.getUTCMinutes().toString().padStart(2, '0')

                message += `\n`
                message += `Generation time: ${hour}:${minute} EST`
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
                }

                else {
                    const selectedChoice = +splitMessage[1] - 1;
                    const selectedLayer = this.mapPool[selectedChoice];
                    const message = `Setting next map to: ${selectedLayer.layer} - ${selectedLayer.faction1}_${selectedLayer.subfaction1} vs ${selectedLayer.faction2}_${selectedLayer.subfaction2}`;
                    await this.server.rcon.warn(playerInfo.steamID, message);
                    const command = assembleSetNextRCONCommandFromLayerObject(selectedLayer);
                    await this.server.rcon.setNextLayer(command);
                }
            }

            else if (splitMessage[0] === this.options.rerollCommand) {
                this.verbose(3, 'Reroll command triggered.');
                if (!this.previousParameters.length) {
                    await this.server.rcon.warn(
                        playerInfo.steamID,
                        `There were no valid parameters stored from the previous pool generation.\nRunning with default parameters.`
                    );
                }

                const indexesToReroll = []

                for (let i = 1; i < splitMessage.length; i++) {
                    const regex = (/^[0-9]+/)
                    if (regex.test(splitMessage[i])) {
                        if (+splitMessage[i] > 0 && +splitMessage[i] <= this.mapPoolSize && !indexesToReroll.includes(+splitMessage[i])) {
                            indexesToReroll.push(+splitMessage[i])
                        }
                    }
                }

                const tempParameters = this.previousParameters;
                tempParameters.unshift(' ');

                // TODO this will have to be changed where the pool reroll is generated *inside* the function.

                // const tempPool = await this.generatePoolFromParameters(tempParameters, playerInfo, false, this.curatedLayerList);
                const tempPool = await this.getPoolFromNightTime(tempParameters, playerInfo, false)
                const newPool = []

                for (let i = 0; i < this.mapPoolSize; i++) {
                    if (!indexesToReroll.includes(i + 1)) {
                        newPool[i] = this.mapPool[i]
                    } else {
                        newPool[i] = tempPool[i]
                    }
                }

                this.mapPool = newPool

                await this.sendCurrentPool(playerInfo, `Rerolling map pool with previous parameters:`);
            }

            else if (splitMessage[0] === "!autoset") {
                if (splitMessage[1] === "on") {
                    this.server.setLayerOnRoundStart = true
                }
                else if (splitMessage[1] === "off") {
                    this.server.setLayerOnRoundStart = false
                }
                else {
                    this.server.setLayerOnRoundStart = !this.server.setLayerOnRoundStart
                }
                const state = this.server.setLayerOnRoundStart ? "on" : "off"
                this.server.rcon.warn(playerInfo.steamID, `Autosetting layer on round start has been turned ${state}. Note that this only lasts for the current session of SquadJS, it will reset if SquadJS is restarted.`)
            }
        }
    }

    async sendCurrentPool(playerInfo, headerMessage) {
        if (!this.curatedLayerList || !this.curatedLayerList.length) {
            this.verbose(1, 'Curated layer list not loaded properly, pool generation not possible.');
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

    // Generates the pool of maps from the paramaters given to the command. For ex. !genpool Narva Mutaha Yehorivka will generate a pool of those maps
    async generatePoolFromParameters(splitMessage = [], playerInfo = null, timeout = false, layerList) {

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
        const globalFilters = { symmetrical: false, mapSize: '', gameMode: '', subfactionSymmetry: null, newUnits: false };
        const messages = splitMessage.map(message => message.toLowerCase().trim());
        const parameters = messages.slice(1);
        const globalFactions = [];
        const validParameters = [];
        const invalidParameters = [];
        const desiredMapSizes = [];
        const slotOptions = [];
        const currentMapPool = [];
        let allLayers = layerList;

        // eslint-disable-next-line no-unused-vars
        const recentMatchups = [];
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
            const level = getLevelFromMapList(parameter, this.mapList);
            const faction = getFactionFromShorthand(parameter, factionMap);
            if (level && desiredMaps.length < this.mapPoolSize) {
                desiredMaps.push(level);
                validParameters.push(parameter);

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

            else if (parameter === 'new' && !globalFilters.newUnits) {
                globalFilters.newUnits = true
                validParameters.push(parameter)
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


        if (!(globalFilters.gameMode === 'TC')) {
            allLayers = allLayers.filter(layer => !(getGameMode(layer) === 'TC'))
        }
        if (!(globalFilters.gameMode === 'Skirmish')) {
            allLayers = allLayers.filter(layer => !(getGameMode(layer) === 'Skirmish'))
        }

        /*
          This here defines the default options if there are no valid parameters given.
         */
        if (validParameters.length === 0) {
            this.verbose(2, 'Running pool generation with default parameters..');
            const tempSizes = [];
            for (let i = 0; i < this.mapPoolSize; i++) {
                tempSizes.push(getRandomMapSizeDefaults());
            }
            const randomInt = getRandomInt(0, this.mapPoolSize - 1);
            const randomSize = tempSizes[randomInt];
            tempSizes.splice(randomInt, 1);
            slotOptions.push(createSlotOptionFilters(SUBFACTION_SYMMETRY_ENUM.SYMMETRICAL, randomSize, getRandomGameModeDefaults()));
            for (const size of tempSizes) {
                slotOptions.push(createSlotOptionFilters(SUBFACTION_SYMMETRY_ENUM.RANDOM, size, getRandomGameModeDefaults()));
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
            const filteredMaps = applyFiltersFromParameters(
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
            let gameMode;

            if (globalFilters.mapSize) {
                mapSize = globalFilters.mapSize;
            } else if (desiredMapSizes) {
                mapSize = desiredMapSizes.shift()
            } else {
                mapSize = getRandomMapSizeDefaults();
            }

            if (globalFilters.gameMode) {
                gameMode = globalFilters.gameMode;
            } else {
                gameMode = getRandomGameModeDefaults();
            }

            const option = createSlotOptionFilters(
                globalFilters.subfactionSymmetry,
                mapSize,
                gameMode,
                globalFilters.newUnits
            );
            slotOptions.push(option);
        }


        // Handle defaults and attempt to get maps from the filters that were specified if not enough maps were supplied.
        for (const option of slotOptions) {
            const filteredLayers = applyFiltersFromParameters(
                allLayers,
                null,
                option.symmetryOption,
                option.gameMode,
                option.mapSize,
                option.useNewUnits
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
     * @param layerList
     * @param matchHistory
     * @param allowRecentlyPlayedMaps
     * @param allowDuplicateMapsLayers
     * @param poolLength
     * @param allowRecentFactions
     * @returns {*[]}
     */
    generatePoolBase(
        existingPool,
        layerList,
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
            layerList = layerList.filter(layer => !checkIfMapIsRecentlyPlayed(layer, matchHistory));
        }

        if (!allowRecentFactions) {
            layerList = filterRecentFactions(layerList, matchHistory, this.server.teamOne, this.server.teamTwo)
        }

        // If there are not enough available layers or too many duplicates in recently played layers, return an empty pool
        if (layerList.length + newPool.length < poolLength) {
            return newPool;
        }

        while (layerList.length && newPool.length < poolLength) {
            const candidateInt = getRandomInt(0, layerList.length - 1);
            const candidatePick = layerList[candidateInt];

            /*
            Check if a candidate pick is already in the existing or the new pool if
             */
            if (allowDuplicateMapsLayers === POOL_DUPLICATE_FILTERS_ENUM.ALLOW_DUPLICATE_MAPS) {
                if (existingPool.some(pick => pick.layer === candidatePick.layer) ||
                    newPool.some(pick => pick.layer === candidatePick.layer)) {
                    layerList.splice(candidateInt, 1);
                    continue;
                }
            }

            else if(allowDuplicateMapsLayers === POOL_DUPLICATE_FILTERS_ENUM.ALLOW_NO_DUPLICATES) {
                if (existingPool.some(pick => pick.level === candidatePick.level) ||
                    newPool.some(pick => pick.level === candidatePick.level)) {
                    layerList.splice(candidateInt, 1);
                    continue;
                }
            }

            newPool.push(candidatePick);
        }
        return newPool;
    }


    async tallyVotes() {
        let max = 0;
        let winner = '';
        const winnerIndex = null

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
            // TODO specify action if a tie happens. This is a quick bandaid for the auto set.
            if (!tie) {
                if (this.options.autoSetMapVoteWinner && this.mapVoteWinner) {
                    const command = assembleSetNextRCONCommandFromLayerObject(this.mapVoteWinner);
                    await this.server.rcon.setNextLayer(command);
                }
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
            let msg;
            msg = `Server: ${winner} has won the vote! Total votes: ${this.ballotBox.size}.\n${totalsStr}`
            if (msg.length >= this.server.serverBroadcastCharLimit) {
                msg = `Server: ${winner} has won the vote! Total votes: ${this.ballotBox.size}.`
            }

            await this.server.rcon.broadcast(msg);
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

    getRandomArrayElement(array) {
        return array[getRandomInt(0, array.length - 1)];
    }

}

function layerToStringFull(layer) {
    return `
    Level: ${layer.level},
    Layer: ${layer.layer},
    Size: ${layer.size},
    Faction 1: ${layer.faction1},
    Faction 2: ${layer.faction2},
    Subfaction 1: ${layer.subfaction1},
    Subfaction 2: ${layer.subfaction2},
    Logistics Score 1: ${layer.logisticsScore1.toFixed(2)},
    Logistics Score 2: ${layer.logisticsScore2.toFixed(2)},
    Transportation Score 1: ${layer.transportationScore1.toFixed(2)},
    Transportation Score 2: ${layer.transportationScore2.toFixed(2)},
    Anti-Infantry Score 1: ${layer.antiInfantryScore1.toFixed(2)},
    Anti-Infantry Score 2: ${layer.antiInfantryScore2.toFixed(2)},
    Armor Score 1: ${layer.armorScore1.toFixed(2)},
    Armor Score 2: ${layer.armorScore2.toFixed(2)},
    Zero Score 1: ${layer.zeroScore1.toFixed(2)},
    Zero Score 2: ${layer.zeroScore2.toFixed(2)},
    Balance Differential: ${layer.balanceDifferential.toFixed(2)}
    `.trim();
}


function layerToStringShort(layer) {
    return `
    Layer:${layer.layer}\nFaction1:${layer.faction1}+${layer.subfaction1}\nFaction2:${layer.faction2}+${layer.subfaction2}\nBalanceDifferential:${layer.balanceDifferential.toFixed(2)}\n
    `.trimStart()
}

function layerToStringShortCompact(layer) {
    return `
    Layer:${layer.layer},
    Faction1:${layer.faction1}+${layer.subfaction1},
    Faction2:${layer.faction2}+${layer.subfaction2},
    BalanceDifferential:${layer.balanceDifferential.toFixed(2)}
    `.trim().replace(/\s+/g, '')
}


function layersArrayToString(layers, layerToStringFunction = layerToStringShortCompact,  useNewLine = true) {
    if (useNewLine) {
        return layers.map(layerToStringFunction).join('\r\n')
    } else {
        return layers.map(layerToStringFunction).join(';')
    }
}


function initializeLogFolder(logFolder, plugin) {
    if (fs.existsSync(logFolder)) {
        if (plugin) {
            this.verbose(2, `Logfolder already exists`)
        }
        return
    }
    try {
        fs.mkdirSync(logFolder)
        if (plugin) {
            plugin.verbose(1, `Successfully initialized log folder`)
        } else {
            console.log('Initialized logfolder')
        }
    } catch (err) {
        if (plugin) {
            plugin.verbose(1, `Error occured when initializing log folder.`)
            plugin.verbose(1, err)
        } else {
            console.log('Error occured when initializing log folder.')
            console.log(err)
        }
    }
}


function getRandomMapSizeDefaults() {
    const rng = getRandomInt(0, 100);
    switch (true) {
        case (rng < 15):
            return MAP_SIZES_ENUM.SMALL;
        case (rng < 55):
            return MAP_SIZES_ENUM.MEDIUM;
        default:
            return MAP_SIZES_ENUM.LARGE;
    }
}


/**
 * Defines and retrieves the wanted ratio of game modes.
 * @returns {string}
 */
function getRandomGameModeDefaults() {
    let gameMode;
    const rng = getRandomInt(0, 99)
    const chanceOfRaas = 70
    // TODO switch to using enums for this
    if (rng < chanceOfRaas) {
        gameMode = 'RAAS'
    } else {
        gameMode = 'AAS'
    }

    return gameMode
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


function checkIfMapIsRecentlyPlayed(layer, recentMatches) {
    const processedLayer = layer.level.toLowerCase().replace(/\s/g, '');
    return recentMatches.some((match) => processedLayer.includes(match.levelTrimmed));
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

/**
 *
 * @param message
 * @param mapList A list of objects representing maps and their shorthands.
 * @returns {null | string}
 */
function getLevelFromMapList(message, mapList) {
    let foundMap = null;

    for (const map of mapList) {
        if (map.shorthands.includes(message)) {
            foundMap = map
            break
        }
    }
    return foundMap;
}

// TODO include a faction vs faction filter at some point?
function applyFiltersFromParameters(layers, map, symmetryFilter, gameModeFilter, mapSizeFilter, useNewUnits) {
    layers = layers.filter(layer => !hasSpecificFactionAndSubfactions(layer, bannedSpecificSubfactions))

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
    if (useNewUnits) {
        layers = layers.filter(layer => hasNewSubfactions(layer))
    }

    return layers;
}
/**
 * Checks if a given layer has symmetrical subfactions
 * @param layer An object from a layer list, representing a potential pick, it's factions etc.
 * @returns {boolean} A boolean of whether a layer has symmetrical subfactions/units
 */
function hasSymmetricalSubfactions(layer) {
    // Format
    // Level: Layer: Size: Faction_1: SubFac_1: Faction_2: SubFac_2
    return layer.subfaction1?.toLowerCase() === layer.subfaction2?.toLowerCase();
}

/**
 *  Utility function used to find the shorthand of a faction from it's long name, which is usually how it's stored in the logs and the in the database.
 *  Hence, we need a mapping to retrieve it's shorthand for use for admin commands.
 *  Example input "Canadian Armed Forces", returns "CAF"
 *
 * @param factionFullName a string used to find the shorthand of a faction.
 * @param factions A map of shorthand and longname faction pairs.
 * @returns {string} Returns a string of the shorthand faction if found, else returns null if not found.
 */
function getFactionFromLongName(factionFullName, factions) {
    let foundFaction = ''
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

/**
 * Retrieves the game mode from a layer.
 * @param layer
 * @returns {string}
 */
function getGameMode(layer) {
    // Layers are usually formatted as follows:
    // Level(Map)_GameMode_Version
    // console.log(gameMode)
    return layer.layer.split('_')[1];
}

function createMapSlotOption(map, mapIdentifiers, symmetryOption, gameMode) {
    return { map, mapIdentifiers, symmetryOption, gameMode };
}

function createSlotOptionFilters(symmetryOption, mapSize, gameMode, useNewUnits) {
    return { symmetryOption, mapSize, gameMode, useNewUnits };
}

class MapSelectionParameters {
    /**
     * Class used to represent a potential map pick for the pool generator.
     * @param map
     * @param mapIdentifiers
     * @param symmetry
     * @param gameMode
     */
    constructor(map, mapIdentifiers, symmetry, gameMode) {
        this.map = map
        this.mapIdentifiers = mapIdentifiers
        this.symmetry = symmetry
        this.gameMode = gameMode
    }
}


class RegularPickSlotParameters {
    constructor(symmetryOption, mapSize, gameMode, useNewUnits) {
        this.symmetryOption = symmetryOption;
        this.mapSize = mapSize;
        this.gameMode = gameMode;
        this.useNewUnits = useNewUnits;
    }
}


function deleteOldFiles(directory) {
    try {
        const files = fs.readdirSync(directory);

        const fileDetails = files.map(file => {
            const filePath = path.join(directory, file);
            const stats = fs.statSync(filePath);
            return {
                file: filePath,
                mtime: stats.mtime
            };
        });

        // Sort the files by modification time (most recent first)
        fileDetails.sort((a, b) => b.mtime - a.mtime);

        const filesToDelete = fileDetails.slice(10);

        filesToDelete.forEach(fileDetail => {
            fs.unlinkSync(fileDetail.file);
        });
        console.log(`Deleted old log files...`)

    } catch (err) {
        console.error('Error while deleting old files:', err);
    }
}



function checkIfLayerIsRecentlyPlayed(layer, recentMatches) {
    recentMatches = recentMatches.map((layer) =>
        layer.layerClassname.toLowerCase().trim().replace(' ', '')
    );
    return recentMatches.includes(layer.layer.toLowerCase().trim());
}

function checkIfTimeInRange(start, end, currentTime = new Date()) {
    const splitStartTime = start.split(":")
    const splitEndTime =   end.split(":")

    const startHours = parseInt(splitStartTime[0], 10);
    const startMinutes = parseInt(splitStartTime[1], 10);

    const endHours = parseInt(splitEndTime[0], 10);
    const endMinutes = parseInt(splitEndTime[1], 10);

    const currentHours = currentTime.getUTCHours()
    const currentMinutes = currentTime.getUTCMinutes()

    const startTotalMinutes = startHours * 60 + startMinutes;
    let endTotalMinutes = endHours * 60 + endMinutes;

    if (endTotalMinutes <= startTotalMinutes ) {
        endTotalMinutes += 60 * 24
    }
    const currentTotalMinutes = currentHours * 60 + currentMinutes;

    return startTotalMinutes <= currentTotalMinutes && currentTotalMinutes <= endTotalMinutes;
}

function generateSafeLayerList(allLayers) {
    const safeListBannedMaps = [
        'Basrah',
        'Anvil',
        'Tallil',
        'Skorpo',
        'Kamdesh',
        'Lashkar',
        'Kohat',
        'Harju',
        'Manic',
        'Mestia'
    ]

    const bannedLayers = [
        'Harju_RAAS_v2',
        'Sanxian_AAS_v1',
        'Sanxian_RAAS_v1',
        'Sanxian_RAAS_v2',
        'Mutaha_AAS_v2'
    ]

    const bannedFactions = [
        'INS',
        'IMF',
        'TLF',
    ]

    const bannedGlobalSubfactions = [
        'AirAssault',
        'Armored'
    ]

    const minimumTransportScore = 80

    const smallerLargeMaps = [
        'Narva',
        'Fallujah'
    ]

    allLayers = allLayers.filter(layer => !hasSpecificFactionAndSubfactions(layer, bannedSpecificSubfactions))
    allLayers = allLayers.filter(layer => getGameMode(layer) === "RAAS")
    allLayers = allLayers.filter(layer => !hasSpecificMap(layer, safeListBannedMaps))
    allLayers = allLayers.filter(layer => !hasSpecificSubFactions(layer, bannedGlobalSubfactions))
    allLayers = allLayers.filter(layer => !hasSpecificFaction(layer, bannedFactions))
    allLayers = allLayers.filter(layer => !hasSpecificLayer(layer, bannedLayers))
    allLayers = allLayers.filter(layer => Math.abs(layer.balanceDifferential) < 1.5)
    allLayers = allLayers.filter(layer => {
        if (layer.size === 'Large' && !smallerLargeMaps.includes(layer.level)) {
            return (layer.transportationScore1 > minimumTransportScore && layer.transportationScore2 > minimumTransportScore);
        }
        return true
    })

    return allLayers
}

function generateNightLayerList(allLayers) {
    const bannedMaps = [
        'Basrah',
        'Anvil',
        'Tallil',
        'Skorpo',
        'Kamdesh',
        'Lashkar',
        'Kohat',
    ]

    const bannedLayers = [
        'Manicouagan_RAAS_v2',
        "Manicouagan_AAS_v3",
        'Harju_RAAS_v2',
        'Sanxian_AAS_v1',
        'Sanxian_RAAS_v1',
        'Sanxian_RAAS_v2',
        'Mutaha_AAS_v2'
    ]

    const bannedFactions = [
        'INS',
        'IMF',
        'TLF',
    ]

    const bannedGlobalSubfactions = [
        'AirAssault',
        'Armored'
    ]

    // Maps that are considered in the "Large" category by OWI, but physically aren't that large.
    const smallerLargeMaps = [
        'Narva',
        'Fallujah'
    ]

    const bannedSpecificSubfactions = [
        { faction: 'USA', subfaction: 'Support'},
        { faction: 'TLF', subfaction: 'Support'},
    ]

    allLayers = allLayers.filter(layer => !hasSpecificFactionAndSubfactions(layer, bannedSpecificSubfactions))
    allLayers = allLayers.filter(layer => !hasSpecificMap(layer, bannedMaps))
    allLayers = allLayers.filter(layer => !hasSpecificSubFactions(layer, bannedGlobalSubfactions))
    allLayers = allLayers.filter(layer => !hasSpecificFaction(layer, bannedFactions))
    allLayers = allLayers.filter(layer => !hasSpecificLayer(layer, bannedLayers))
    allLayers = allLayers.filter(layer => Math.abs(layer.balanceDifferential) < 1.0)
    allLayers = allLayers.filter(layer => {
        if (layer.size === 'Large' && !smallerLargeMaps.includes(layer.level)) {
            return (layer.transportationScore1 > 80 && layer.transportationScore2 > 80);
        }
        return true
    })

    return allLayers

}

/**
 *
 * @param layerList The full layer list to filter layers out from.
 * @param matchHistory An array of objects containing the recent matches.
 * @param currentFaction1 Current faction of team 1.
 * @param currentFaction2 Current faction of team 2.
 * @returns {*}
 */
function filterRecentFactions(layerList, matchHistory, currentFaction1, currentFaction2) {
    // We need to normalize the recent history as well as the current match so that it fits with the format that we take in the layers with.
    let history = [];
    // The first match includes the current one, which does not include faction data.
    const recentMatches = matchHistory.slice(1)

    currentFaction1 = currentFaction1.split("_")
    currentFaction2 = currentFaction2.split("_")

    const currentFactionShort1 = currentFaction1[0]
    const currentFactionShort2 = currentFaction2[0]

    const currentSubfaction1 = currentFaction1[2]
    const currentSubfaction2 = currentFaction2[2]

    // We add the info for the current match into the recentMatches list manually.
    history.push({
        layer: matchHistory[0]?.layer,
        faction1: currentFactionShort1,
        faction2: currentFactionShort2,
        subfaction1: currentSubfaction1,
        subfaction2: currentSubfaction2
    })

    recentMatches.forEach(match => {
        if (match.faction1 && match.subfaction1 && match.faction2 && match.subfaction2) {
            history.push({
                layer: match?.layer,
                faction1: getFactionFromLongName(match.faction1, factionMap)?.short,
                faction2: getFactionFromLongName(match.faction2, factionMap)?.short,
                subfaction1: getSubfaction(match.subfaction1),
                subfaction2: getSubfaction(match.subfaction2)
            })
        }
    })

    history = history.slice(0, 2)

    // For example how many matches back should be taken into consideration etc...

    layerList = layerList.filter(layer => {
        // Ensure that no completely identical matchups happen right after one another.
        if ((history[0].faction1 === layer.faction1 && history[0].faction2 === layer.faction2) ||
            (history[0].faction2 === layer.faction1 && history[0].faction1 === layer.faction2)) {
            return false;
        }

        // Ensure that no team has to play the same faction in the game right after the current one.
        if (history[0].faction1 === layer.faction2 || history[0].faction2 === layer.faction1) {
            return false;
        }

        // Ensure that no team has to play a PLA faction right after one another.
        if ((PLA_FACTIONS.includes(history[0].faction1) && PLA_FACTIONS.includes(layer.faction2)) ||
            (PLA_FACTIONS.includes(history[0].faction2) && PLA_FACTIONS.includes(layer.faction1))) {
            return false;
        }

        // Ensure that no team has to play the same faction
        if (history.length >= 2) {
            if (history[1].faction1 === layer.faction1 || history[1].faction2 === layer.faction2) {
                return false;
            }
        }
        return true;
    });

    return layerList
}


/**
 * Checks if a layer has new subfactions.
 * Contains new units as of Squad version 8.0
 * @param layer A layer from the curated layer list.
 * @returns {boolean} A boolean of whether the layer/matchup contains one of the new subfactions.
 */

function hasNewSubfactions(layer) {
    const newUnits = [
        {faction: 'USA', subfaction: 'Armored'},
        {faction: 'USA', subfaction: 'Mechanized'},
        {faction: 'USA', subfaction: 'Support'},
        {faction: 'TLF', subfaction: 'Support'},
        {faction: 'RGF', subfaction: 'Mechanized'},
        {faction: 'RGF', subfaction: 'Armored'},
    ]

    for (const unit of newUnits) {
        if ((layer.faction1 === unit.faction && layer.subfaction1 === unit.subfaction) || (layer.faction2 === unit.faction && layer.subfaction2 === unit.subfaction)) {
            return true
        }
    }
    return false
}

function hasSpecificFactionAndSubfactions(layer, subfactions) {
    for (const bannedFaction of subfactions) {
        if ((bannedFaction.faction === layer.faction1 && bannedFaction.subfaction === layer.subfaction1) || (bannedFaction.faction === layer.faction2 && bannedFaction.subfaction === layer.subfaction2)) {
            return true
        }
    }
    return false
}

function hasSpecificLayer(layer, layers) {
    let hasLayer = false

    for (const bannedLayer of layers) {
        if (layer.layer.toLowerCase().trim() === bannedLayer.toLowerCase().trim()) {
            hasLayer = true
            break
        }
    }

    return hasLayer
}


function hasSpecificSubFactions(layer, subfactions) {
    let bannedSubfactionFound = false

    for (const subfaction of subfactions) {
        if (layer.subfaction1 === subfaction || layer.subfaction2 === subfaction) {
            bannedSubfactionFound = true
            break
        }
    }

    return bannedSubfactionFound
}

function hasSpecificMap(layer, maps) {
    let undesiredMap = false
    for (const map of maps) {
        if (layer.level.toLowerCase().trim().includes(map.toLowerCase().trim())) {
            undesiredMap = true
            break
        }
    }
    return undesiredMap
}

function hasSpecificFaction(layer, factions) {
    let unsafeFaction = false
    for (let faction of factions) {
        faction = faction.toLowerCase().trim()
        if (layer.faction1.toLowerCase().trim() === faction || layer.faction2.toLowerCase().trim() === faction) {
            unsafeFaction = true
            break
        }
    }
    return unsafeFaction
}


const PLA_FACTIONS = Object.freeze([
    'PLA',
    'PLANMC',
    'PLAAGF'
])

const bannedSpecificSubfactions = [
    { faction: 'USA', subfaction: 'Support'},
    { faction: 'TLF', subfaction: 'Support'},
]

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
    SMALL: 'Small',
    MEDIUM: 'Medium',
    LARGE: 'Large'
});

const SUBFACTION_SYMMETRY_ENUM = Object.freeze({
    SYMMETRICAL: 'symmetrical',
    ASSYMMETRICAL: 'assymetrical',
    RANDOM: 'random'
});

const LAYER_LIST_VERSION_ENUM = Object.freeze({
    VERSION2: 'version2',
    VERSION3: 'version3',
    VERSION4: 'version4',
    VERSION5: 'version5',
    VERSION6: 'version6'
});


export {
    generateSafeLayerList,
    generateNightLayerList,
    checkIfTimeInRange,
    hasSpecificLayer,
    hasSpecificFactionAndSubfactions,
    hasSpecificMap,
    hasSpecificFaction,
    hasSymmetricalSubfactions,
    filterRecentFactions,
    initializeLogFolder,
    layerToStringFull,
    layerToStringShort,
};
