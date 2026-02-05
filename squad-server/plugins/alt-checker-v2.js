import DiscordBasePlugin from './discord-base-plugin.js';
import DBLog from './db-log.js';
import Sequelize, { NOW, Op, QueryTypes } from 'sequelize';
import {ServerEvents} from "../utils/constants.js";
import {sleep} from "../utils/utils.js";
import {embedLength} from "discord.js";


const MAX_EMBED_LENGTH = 6000
const MAX_FIELD_SIZE = 2500
const MAX_EMBED_LENGTH_ALLOWED = 5000

const MAX_FIELDS = 24;
const VALUE_MAX_LENGTH = 1024
const NAME_MAX_LENGTH = 256
const EMBED_COLOR = 20;

const truncate = (str, max) => str.length > max ? str.slice(0, max - 3) + '...' : str;




export default class AltCheckerV2 extends DiscordBasePlugin {
    static get description() {
        return '';
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            ...DiscordBasePlugin.optionsSpecification,
            commandPrefix: {
                required: false,
                description: 'Command name to get message.',
                default: '!altcheck'
            },
            channelID: {
                required: true,
                description: 'The ID of the channel to log data.',
                default: '',
                example: '667741905228136459'
            },
            allowedDiscordRoles: {
                required: true,
                description: "Roles that can perform an alt check.",
                default: [],
                example: ['']
            },
            logHighPriorityUsers: {
                required: false,
                description: "Whether to log join events of alts of certain users that are deemed high priority. " +
                    "Useful for repeat offenders like ban evaders etc.",
                default: {
                    enabled: false,
                    logChannels: [""],
                    users: []
                },
                example: {
                    enabled: true,
                    logChannels: ["123467123461123"],
                    users: [{steamID: '123467123461123'}]
                }
            },
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.highPriorityChannels;
        this.highPriorityUsers;
        this.DBLogPlugin;

        this.onDiscordMessage = this.onDiscordMessage.bind(this);
        this.onPlayerConnected = this.onPlayerConnected.bind(this)
        this.getPlayerByName = this.getPlayerByName.bind(this);
        this.getPlayersByUsernameDatabase = this.getPlayersByUsernameDatabase.bind(this);

    }

    async mount() {
        this.DBLogPlugin = this.server.plugins.find(p => p instanceof DBLog);
        if (!this.DBLogPlugin) return;
        this.options.discordClient.on('messageCreate', this.onDiscordMessage);
        this.server.on(ServerEvents.playerConnected, this.onPlayerConnected);
        // Stores discord.js channel objects that can be utilized to send messages to.
        this.highPriorityChannels = []
        this.highPriorityUsers = []
        if (this.options.logHighPriorityUsers.enabled) {
            this.verbose(1, `Logging of high priority users enabled, initiating channels...`)
            for (const channelID of this.options.logHighPriorityUsers.logChannels) {
                try {
                    if (!channelID) continue;
                    const channel = await this.options.discordClient.channels.fetch(channelID)
                    this.verbose(2, `Loaded high priority logging channel: ${channel}`)
                    this.highPriorityChannels.push(channel)
                } catch {
                    this.verbose(1, `Unable to fetch channel with ID: ${channelID}`)
                }
            }

            for (const user of this.options.logHighPriorityUsers.users) {
                this.highPriorityUsers.push(user)
            }
        }
    }

    async unmount() {}


    /**
     *
     * @param message {DiscordMessageEvent}
     * @return {Promise<void>}
     */
    async onDiscordMessage(message) {
        if (message.author.id === this.options.discordClient.user.id) return;

        // for (const role of this.options.allowedDiscordRoles) {
        //     // TODO need to find a method of retrieving the roles that a user has.
        // }

        // const regex = new RegExp(`^${this.options.commandPrefix} (?:(?<steamID>\\d{17})|(?<eosID>[\\w\\d]{32})|(?<lastIP>(?:\\d{1,3}\\.){3}\\d{1,3})|(?<playerName>.+))$`, 'i');
        // Only support steamID for now

        if (!message.content.startsWith(`${this.options.commandPrefix}`)) {
            return
        }

        const splitMessages = message.content.split(" ")

        if (!splitMessages[1]) {
            return message.reply("No arguments given to the command. Please supply a SteamID")
        }
        const steamID64Regex  = /^7656119\d{10}$/;

        const matches = splitMessages[1].match(steamID64Regex)

        if (!matches) {
            return message.reply("You must supply a correctly formatted steamID.")
        }
        // const steamIDRegex = new RegExp(`^${this.options.commandPrefix} (?<steamID>^7656119\\d{10}$)$`, 'i');
        try {
            const playerModel = this.DBLogPlugin.models.Player
            const playerIPModel = this.DBLogPlugin.models.PlayerIP
            const results = await buildLinkedPlayerProfile(matches[0], playerModel, playerIPModel)
            const embeds = this.generateAltEmbeds(results)

            // Had to send the embeds separately, because we were constantly getting the "DISCORD API ERROR, MAX EMBED SIZE 6000 CHARACTER WAS HIT"
            for (const embed of embeds) {
                await message.reply({
                    embeds: [embed]
                })
            }
        } catch (e) {
            message.reply('Something in the backend went wrong when attempting to perform the alt check.')
        }
    }

    /**
     *
     * @param info {playerConnectedEvent}
     * @return {Promise<void>}
     */
    async onPlayerConnected(info) {
        // To ensure the IPs has been updated in the DB first.
        await sleep(2500)

        const playerModel = this.DBLogPlugin.models.Player
        const playerIPModel = this.DBLogPlugin.models.PlayerIP
        this.verbose(2, `Player with name: ${info.player.name} - SteamID: ${info.player.steamID} connected, checking for alts...`)
        const result = await buildLinkedPlayerProfile(info.player.steamID, playerModel, playerIPModel)

        if (result.playerProfiles.length <= 1) {
            return this.verbose(2, `No alts for player with name: ${info.player.name} and ${info.player.steamID}`)
        }

        const embeds = this.generateAltEmbeds(result)
        for (const embed of embeds) {
            await this.sendDiscordMessage({embeds: [embed]})
        }

        if (!this.options.logHighPriorityUsers.enabled) {
            return;
        }

        let altProfileMatch = null
        for (const user of this.highPriorityUsers) {

            const altMatch = result.playerProfiles.find(player => player.steamID === user.steamID)
            if (altMatch) {
                altProfileMatch = {
                    highPriorityUser: user,
                    matchedProfile: altMatch
                }
                break
            }
        }
        if (altProfileMatch !== null) {
            this.verbose(1, `Potential alt of high priority user "${altProfileMatch.highPriorityUser.name}" detected. User:`, info.player.name, 'With steamID: ', info.player.steamID)
            embeds[0].title = `Potential alt for high priority user "${altProfileMatch.highPriorityUser.name}" connected to the server.`
            for (const channel of this.highPriorityChannels) {
                for (const embed of embeds) {
                    await channel.send({
                        embeds: [embed]
                    })
                }

            }
        }
    }


    /**
     *
     * @param results {altCheckResult}
     * @returns Array of embeds displaying alts {object[]}
     */
    generateAltEmbeds(results) {
        const embeds = []
        if (results.playerProfiles.length === 0) {
            embeds.push({
                title: 'Unable to find player',
                description: "Unable to find the given SteamID in the database!",
                color: 60,
            })
        }
        else if (results.playerProfiles.length === 1) {
            const player = results.playerProfiles[0]
            const isOnline = this.server.players.find(p => p.eosID === player.eosID)
            const embed = {
                title: `No alts found for "${player.lastName}"`,
                description: this.getFormattedUrlsPart(player.steamID, player.eosID),
                fields: []
            };
            
            for (const propK in player) {
                if (propK === 'id') continue;
            
                let propLabel = propK;
                if (propK === 'lastIP') propLabel = 'Last Used IP';
                else if (propK === 'lastName') propLabel = 'Last Used Name';
            
                embed.fields.push({
                    name: `${propLabel.toUpperCase()}`,
                    value: `${player[propK]}`,
                    inline: true
                });
            }
            
            embed.fields.push({
                name: 'Currently Online',
                value: isOnline ? 'YES' : 'NO'
            });
            
            embeds.push(embed);
        }

    else {
        const initialPlayer = results.playerProfiles[0];

        // Create the first embed with initial player info
        let currentEmbed = {
            title: `Alts for player ${initialPlayer.lastName}. SteamID: ${initialPlayer.steamID}`,
            color: EMBED_COLOR,
            fields: [
                { name: 'Last IP', value: initialPlayer.lastIP }
            ]
        };

        for (const altK in results.playerProfiles) {
            const alt = results.playerProfiles[altK];
            const onlinePlayer = this.server.players.find(p => p.eosID === alt.eosID);
            const isOnlineText = onlinePlayer ? `YES\n**Team: **${onlinePlayer.teamID} (${onlinePlayer.role.split('_')[0]})` : 'NO';

            const field = {
                // eslint-disable-next-line no-irregular-whitespace
                name: `​\n${+altK + 1}. ${alt.lastName}`,
                value: `${this.getFormattedUrlsPart(alt.steamID, alt.eosID)}`,
                inline: true
            };

            const idfield = {
                name: '',
                value: `\n**SteamID: **\`${alt.steamID}\`\n**EOS ID: **\`${alt.eosID}\`\n**Is Online: **${isOnlineText}`
            }

            const currentEmbedLength = embedLength(currentEmbed);
            const willOverflow = currentEmbedLength >= MAX_EMBED_LENGTH_ALLOWED || currentEmbed.fields.length >= MAX_FIELDS;

            if (willOverflow) {
                embeds.push(currentEmbed);
                currentEmbed = {
                    title: `Alts for player ${initialPlayer.lastName} continued`,
                    color: EMBED_COLOR,
                    fields: []
                };
            }

            currentEmbed.fields.push(field);
            currentEmbed.fields.push(idfield);
        }

        // Push the final embed if it has fields
        if (currentEmbed.fields && currentEmbed.fields.length > 0) {
            embeds.push(currentEmbed);
        }
    }

    return embeds;
    }


    async getPlayerByName(name) {
        const onlineRes = this.server.players.find(p => p.name === name || p.name.match(new RegExp(name, 'i')));

        if (onlineRes)
            return onlineRes

        const dbRes = (await this.getPlayersByUsernameDatabase(name)).map(p => p.dataValues).map(p => ({
            name: p.lastName,
            eosID: p.eosID,
            steamID: p.steamID,
            ip: p.lastIP
        }))

        return dbRes[ 0 ];
    }

    getFormattedUrlsPart(steamID, eosID) {
        return `[Steam](https://steamcommunity.com/profiles/${steamID}) | [BattleMetrics](${this.getBattlemetricsRconUrl(eosID)}) | [CBL](https://communitybanlist.com/search/${steamID})`
    }

    getBattlemetricsRconUrl(eosID) {
        return `https://www.battlemetrics.com/rcon/players?filter%5Bsearch%5D=${eosID}&filter%5Bservers%5D=false&filter%5BplayerFlags%5D=&sort=-lastSeen&showServers=true&method=quick&redirect=1`
    }

    async getPlayersByUsernameDatabase(username) {
        return await this.DBLogPlugin.models.Player.findAll({
            where: { lastName: { [ Op.like ]: `%${username}%` }, eosID: { [ Op.not ]: null } },
            limit: 2,
            group: [ 'eosID' ]
        });
    }
}

/**
 *
 * @param initialSteamID
 * @param playerModel
 * @param playerIPModel
 * @return {altCheckResult}
 */
export async function buildLinkedPlayerProfile(initialSteamID, playerModel, playerIPModel) {
  const visitedSteamIDs = new Set();
  const visitedIPs = new Set();
  const queue = [initialSteamID];

  while (queue.length > 0) {
    const currentSteamID = queue.shift();
    if (visitedSteamIDs.has(currentSteamID)) {
        continue
    } else {
        visitedSteamIDs.add(currentSteamID);
    }

    const ipEntries = await playerIPModel.findAll({
      where: { steamID: currentSteamID }
    });

    for (const entry of ipEntries) {
      const ip = entry.IP;
      if (visitedIPs.has(ip)) continue;
      visitedIPs.add(ip);

      // Find all steamIDs that have used this IP
      const linkedSteamIDs = await playerIPModel.findAll({
        where: { IP: ip }
      });

      for (const linked of linkedSteamIDs) {
        const linkedSteamID = linked.steamID;
        if (!visitedSteamIDs.has(linkedSteamID)) {
          queue.push(linkedSteamID);
        }
      }
    }
  }

  // Fetch full player profiles at the end
  const fullProfiles = await playerModel.findAll({
    where: {
      steamID: Array.from(visitedSteamIDs)
    }
  });

  return {
    steamIDs: Array.from(visitedSteamIDs),
    IPs: Array.from(visitedIPs),
    playerProfiles: fullProfiles.map(player => player.dataValues)
  };
}


/**
 *
 * @param initialSteamID
 * @param playerModel
 * @param playerIPModel
 * @return {altCheckResult}
 */
export async function buildLinkedPlayerProfileLarge(initialSteamID, playerModel, playerIPModel) {
  const visitedSteamIDs = new Set();
  const visitedIPs = new Set();
  const queue = [initialSteamID];
  const steamIDToIPMapping = new Map()

  while (queue.length > 0) {
    const currentSteamID = queue.shift();
    if (visitedSteamIDs.has(currentSteamID)) {
        continue
    } else {
        visitedSteamIDs.add(currentSteamID);
    }

    const ipEntries = await playerIPModel.findAll({
      where: { steamID: currentSteamID }
    });

    const localIPs = []

    for (const entry of ipEntries) {
      const ip = entry.IP;
      if (visitedIPs.has(ip)) continue;
      visitedIPs.add(ip);
      localIPs.push(ip)

      // Find all steamIDs that have used this IP
      const linkedSteamIDs = await playerIPModel.findAll({
        where: { IP: ip }
      });

      for (const linked of linkedSteamIDs) {
        const linkedSteamID = linked.steamID;
        if (!visitedSteamIDs.has(linkedSteamID)) {
          queue.push(linkedSteamID);
        }
      }
    }
    steamIDToIPMapping.set(currentSteamID, localIPs)
  }

  console.log(steamIDToIPMapping)
  // Fetch full player profiles at the end
  const fullProfiles = await playerModel.findAll({
    where: {
      steamID: Array.from(visitedSteamIDs)
    }
  });

  return {
    steamIDs: Array.from(visitedSteamIDs),
    IPs: Array.from(visitedIPs),
    playerProfiles: fullProfiles.map(player => player.dataValues)
  };
}
