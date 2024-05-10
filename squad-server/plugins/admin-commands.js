import DiscordBasePlugin from './discord-base-plugin.js';

export default class AdminCommands extends DiscordBasePlugin {
  static get description() {
    return 'The <code>AdminCommands</code> plugin can be configured to make chat commands that perform server administration.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: false,
        description: 'The ID of the channel to log admin commands to.',
        default: '',
        example: '667741905228136459'
      },
      mapChannelID: {
        required: false,
        description: 'The ID of the channel to pull map changes from.',
        default: '',
        example: '667741905228136459'
      },
      ignoreChats: {
        required: false,
        description: 'A list of chat names to ignore.',
        default: [],
        example: ['ChatSquad']
      },
      commandList: {
        required: false,
        description: 'A list of premade commands',
        default: [],
        example: [
          {
            command: ['!warn', '!w'],
            nameRequired: true,
            reasonRequired: true,
            timeRequired: true
          },
          {
            command: ['!broadcast', '!broad', '!b'],
            nameRequired: false,
            reasonRequired: false,
            timeRequired: false
          }
        ]
      },
      reasons: {
        required: false,
        description: 'A list of premade reasons',
        default: [],
        example: [
          {
            reason: 'a',
            response: 'b'
          },
          {
            reason: 'c',
            response: 'd'
          }
        ]
      },
      timeoutshort: {
        required: false,
        description: 'A period of time a player cannot rejoin in seconds',
        default: 0,
        example: '120'
      },
      timeoutlong: {
        required: false,
        description: 'A period of time a player cannot rejoin in seconds',
        default: 0,
        example: '120'
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onChatMessage = this.onChatMessage.bind(this);
    this.onPlayerConnected = this.onPlayerConnected.bind(this);
    this.onRoundEnd = this.onRoundEnd.bind(this);
    this.listLastPlayedMaps = this.listLastPlayedMaps.bind(this)
    this.listLastRoundsTicketCounts = this.listLastRoundsTicketCounts.bind(this)
    this.checkTarget = function checkTarget(admin, target) {
      const matched = [];
      for (const p of this.server.players) {
        const playerName = p.name.toLowerCase().replace(/\s/g, '');
        if (playerName.includes(target.toLowerCase())) {
          matched.push({ name: p.name, steamID: p.steamID });
        }
      }

      if (matched.length === 0) {
        server.rcon.warn(admin, `${target} not found. Check capitalization and spelling`);
        return false;
      } else if (matched.length > 1) {
        server.rcon.warn(admin, `${target} has multiple matches. Please be more specific`);
        return false;
      } else {
        return matched[0];
      }
    };
  }

  async mount() {
    this.server.on('CHAT_MESSAGE', this.onChatMessage);
    this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
    this.server.on('NEW_GAME', this.onRoundEnd);
    this.server.banlist = new Map();
    this.server.switchList = [];
    this.server.randomizeFlag = false;
  }

  async onChatMessage(info) {
    // Checks for a valid target and either returns the target's name or returns null

    if (this.options.ignoreChats.includes(info.chat) || !info.message.startsWith('!')) return;

    const messageArray = info.message.split(' ');

    let foundCommand = false;
    for (const c of this.options.commandList) {
      if (c.command.includes(messageArray[0].toLowerCase())) {
        foundCommand = this.options.commandList.find((r) => r.command[0] === c.command[0]);
      }
    }
    if (!foundCommand) return;

    const playerInfo = await this.server.getPlayerBySteamID(info.steamID);
    let matched;
    const nameRequired = foundCommand.nameRequired;
    const reasonRequired = foundCommand.reasonRequired;
    const timeRequired = foundCommand.timeRequired;

    if (nameRequired) {
      if (messageArray[1] === undefined) {
        // console.log(`Name required`)
        this.server.rcon.warn(playerInfo.name, `Command requires a name.`);
        return;
      }
      await this.server.updatePlayerList();
      const target = messageArray[1];
      matched = this.checkTarget(playerInfo.name, target);
      if (matched === false) return;
    }

    let shorthand = false;
    let reason = false;

    if (nameRequired && reasonRequired && !timeRequired) {
      if (messageArray[2] === undefined) {
        // console.log(`Reason required`)
        this.server.rcon.warn(playerInfo.name, `Command requires a reason`);
        return;
      }
      const tempReason = this.options.reasons.find(
        (r) => r.reason === messageArray[2].toLowerCase()
      );
      if (tempReason && messageArray[3] === undefined) {
        shorthand = true;
        reason = tempReason.response;
      } else if (messageArray[3] === undefined) {
        this.server.rcon.warn(playerInfo.name, `No shorthand "${messageArray[2]}" found`);
        return;
      } else {
        reason = messageArray.splice(2, messageArray.length).join(' ').trim();
      }
    } else if (!nameRequired && reasonRequired) {
      if (messageArray[1] === undefined) {
        // console.log(`Words required`)
        this.server.rcon.warn(playerInfo.name, `Command requires at least one word`);
        return;
      }
      const joinedReason = messageArray.splice(1, messageArray.length).join(' ').trim();
      reason = joinedReason;
    }

    if (!reasonRequired) {
      if (messageArray[2] === undefined) {
        reason = false;
      } else {
        const tempReason = this.options.reasons.find(
          (r) => r.reason === messageArray[2].toLowerCase()
        );
        if (tempReason && messageArray[3] === undefined) {
          shorthand = true;
          reason = tempReason.response;
        } else if (messageArray[3] === undefined) {
          this.server.rcon.warn(playerInfo.name, `No shorthand "${messageArray[2]}" found`);
          return;
        } else {
          reason = messageArray.splice(2, messageArray.length).join(' ').trim();
        }
      }
    }

    if (timeRequired) {
      if (messageArray[2] === undefined || !messageArray[2].match(/^[0-9]+/)) {
        // console.log(`Number of hours required`)
        this.server.rcon.warn(playerInfo.name, `Time required in number of hours Ex: 2`);
        return;
      }
      if (messageArray[3] === undefined) {
        // console.log(`Reason required`)
        this.server.rcon.warn(playerInfo.name, `Command requires a reason`);
        return;
      }
      // const bantime = parseInt(messageArray[2]);
      const joinedReason = messageArray.splice(3, messageArray.length).join(' ').trim();
      const tempReason = this.options.reasons.find((r) => r.reason === joinedReason);
      if (tempReason) {
        shorthand = true;
        reason = tempReason.response;
      } else {
        reason = joinedReason;
      }
    }

    const executedCommand = foundCommand.command[0].replace('!', '') + 'ed ';
    const channel = await this.options.discordClient.channels.fetch(this.options.channelID);
    const killSwitchDelay = 1500

    switch (foundCommand.command[0]) {
      case '!kill':
        if (shorthand) {
          await this.server.rcon.execute(`AdminForceTeamChange ${matched.steamID}`);
          setTimeout(async () => {
            await this.server.rcon.execute(`AdminForceTeamChange ${matched.steamID}`);
          }, killSwitchDelay);
          this.server.rcon.warn(matched.steamID, `You were killed by an admin for ${reason}`);
          this.server.rcon.warn(
            playerInfo.steamID,
            `Successfully ${executedCommand} ${matched.name} for ${reason}`
          );
          channel.send(
            `Admin ${playerInfo.name} ${executedCommand} ${matched.name} for:\n${reason}`
          );
        } else if (!shorthand && reason) {
          await this.server.rcon.execute(`AdminForceTeamChange ${matched.steamID}`);
          setTimeout(async () => {
            await this.server.rcon.execute(`AdminForceTeamChange ${matched.steamID}`);
          }, killSwitchDelay);
          this.server.rcon.warn(matched.steamID, reason);
          this.server.rcon.warn(
            playerInfo.steamID,
            `Successfully ${executedCommand} ${matched.name}.`
          );
          channel.send(
            `Admin ${playerInfo.name} ${executedCommand} ${matched.name} for:\n${reason}.`
          );
        } else {
          await this.server.rcon.execute(`AdminForceTeamChange ${matched.steamID}`);
          setTimeout(async () => {
            await this.server.rcon.execute(`AdminForceTeamChange ${matched.steamID}`);
          }, killSwitchDelay);
          this.server.rcon.warn(matched.steamID, 'You were killed by an admin.');
          this.server.rcon.warn(
            playerInfo.steamID,
            `Successfully ${executedCommand} ${matched.name}.`
          );
          channel.send(`Admin ${playerInfo.name} ${executedCommand} ${matched.name}.`);
        }
        break;
      case '!yeet':
      case '!kick':
        if (shorthand) {
          this.server.rcon.kick(matched.steamID, `For ${reason}`);
          this.server.rcon.warn(
            playerInfo.steamID,
            `Successfully ${executedCommand} ${matched.name} for ${reason}`
          );
          channel.send(
            `Admin ${playerInfo.name} ${executedCommand} ${matched.name} for:\n${reason}`
          );
        } else {
          this.server.rcon.kick(matched.steamID, reason);
          this.server.rcon.warn(
            playerInfo.steamID,
            `Successfully ${executedCommand} ${matched.name} for ${reason}.`
          );
          channel.send(
            `Admin ${playerInfo.name} ${executedCommand} ${matched.name} for:\n${reason}.`
          );
        }

        for (const plr of this.server.players) {
          if (plr.steamID.includes(matched.steamID) && !this.server.banlist.has(plr.steamID)) {
            this.server.banlist.set(plr.steamID, {
              time: Date.now() / 1000 + this.options.timeoutshort
            });
          }
        }
        break;

      case '!timeout':
        if (shorthand) {
          this.server.rcon.kick(matched.steamID, `For ${reason}`);
          this.server.rcon.warn(
            playerInfo.steamID,
            `Successfully ${executedCommand} ${matched.name} for ${reason}`
          );
          channel.send(
            `Admin ${playerInfo.name} ${executedCommand} ${matched.name} for:\n${reason}`
          );
        } else {
          this.server.rcon.kick(matched.steamID, reason);
          this.server.rcon.warn(
            playerInfo.steamID,
            `Successfully ${executedCommand} ${matched.name} for ${reason}.`
          );
          channel.send(
            `Admin ${playerInfo.name} ${executedCommand} ${matched.name} for:\n${reason}.`
          );
        }

        for (const plr of this.server.players) {
          if (plr.steamID.includes(matched.steamID) && !this.server.banlist.has(plr.steamID)) {
            this.server.banlist.set(plr.steamID, {
              time: Date.now() / 1000 + this.options.timeoutlong
            });
          }
        }
        break;

      case '!warn':
        if (shorthand) {
          this.server.rcon.warn(matched.steamID, `You have been warned for ${reason}`);
          this.server.rcon.warn(
            playerInfo.steamID,
            `Successfully ${executedCommand} ${matched.name} for ${reason}`
          );
          channel.send(
            `Admin ${playerInfo.name} ${executedCommand} ${matched.name} for:\n${reason}`
          );
        } else {
          this.server.rcon.warn(matched.steamID, reason);
          this.server.rcon.warn(
            playerInfo.steamID,
            `Successfully ${executedCommand} ${matched.name} for ${reason}.`
          );
          channel.send(
            `Admin ${playerInfo.name} ${executedCommand} ${matched.name} for:\n${reason}`
          );
        }
        return;
      case '!broadcast':
        this.server.rcon.broadcast(reason);
        break;

      // case '!ban': //THIS IS DEADDDDD CODEEEE - no, it's just not finished...still
      //   this.server.rcon.warn(
      //     matched.steamID,
      //     `${executedCommand} ${matched.name} ${bantime} ${reason}`);
      //   break;

      case '!switchnow':
        if (shorthand) {
          await this.server.rcon.execute(`AdminForceTeamChange ${matched.steamID}`)
          this.server.rcon.warn(matched.steamID, `You have been swapped to the other team by an admin because of ${reason}`)
          this.server.rcon.warn(playerInfo.steamID, `Swapped ${matched.name} to the other team beacuse of ${reason}`)
          channel.send(
            `Admin ${playerInfo.name} swapped ${matched.name} to the other team.`
          )
        } else {
          await this.server.rcon.execute(`AdminForceTeamChange ${matched.steamID}`)
          this.server.rcon.warn(matched.steamID, "You have been swapped to the other team by an admin")
          this.server.rcon.warn(playerInfo.steamID, `Swapped ${matched.name} to the other team`)
          channel.send(
            `Admin ${playerInfo.name} swapped ${matched.name} to the other team.`
          )
        }
        break;

      case '!switchnext':
        if (this.server.switchList.includes(matched.steamID)) {
          this.server.rcon.warn(
            playerInfo.steamID,
            `${matched.name} is already queued to be teamswitched.`
          );
        } else {
          this.server.switchList.push(matched.steamID);
          this.server.rcon.warn(
            matched.steamID,
            'You have been marked for teamswitching on mapchange. ' +
            'Thank you for helping with team balance and contact admins if you have issues.'
          );
          this.server.rcon.warn(
            playerInfo.steamID,
            `${matched.name} will be teamswitched at the start of the next round.`
          );
          channel.send(
            `Admin ${playerInfo.name} queued ${matched.name} to be teamswitched at the start of the next round.`
          );
        }
        break;

      case '!randomizenext':
        if (this.server.randomizeFlag) {
          this.server.rcon.warn(
            playerInfo.steamID,
            `The server is already queued to be randomized.`
          );
        } else {
          this.server.randomizeFlag = true;
          this.server.rcon.broadcast(
            `The server will randomize players for balance at the start of next round.`
          );
          this.server.rcon.warn(
            playerInfo.steamID,
            `The server will be randomized at the start of the next round.`
          );
          channel.send(
            `Admin ${playerInfo.name} queued the server to be randomized at the start of the next round.`
          );
        }
        break;

      case '!fog':
        this.server.rcon.setFogOfWar(reason);
        break;

      case '!disband':
        this.server.rcon.execute(`AdminDisbandSquad ${playerInfo.teamID} ${reason}`);
        channel.send(
          `Admin ${playerInfo.name} disbanded squad ${reason} on team ${playerInfo.teamID}.`
        );
        break;

      case '!enemydisband': {
        let team = playerInfo.teamID;
        if (team.includes('1')) {
          team = 2;
        } else {
          team = 1;
        }
        this.server.rcon.execute(`AdminDisbandSquad ${team} ${reason}`);
        channel.send(`Admin ${playerInfo.name} disbanded squad ${reason} on team ${team}.`);
        break;
      }
      case '!unyeet':
        this.server.banlist.clear();
        this.server.rcon.warn(playerInfo.steamID, `Ban list has been emptied.`);
        channel.send(`Admin ${playerInfo.name} emptied the temporary ban list.`);
        break;

      case '!maps':
        this.listLastPlayedMaps(playerInfo)
        break;

      case '!tickets':
        this.listLastRoundsTicketCounts(playerInfo)
        break

      case '!shownext':
        let message;
        if (this.server.nextFactions && this.server.nextLayerAlt) {
          message = `Next layer: ${this.server.nextLayerAlt} \n`
          message += `Factions: ${this.server.nextFactions}`
        } else {
          message = `The next map has either not been manually set by admins this round, SquadJS crashed or was restarted during this round.`
        }
        await this.server.rcon.warn(playerInfo.steamID, message)
        break;

      default:
    }
  }

  async listLastRoundsTicketCounts(playerInfo) {
    let matchHistory = this.server.matchHistory
    let warns = []
    let message = `The ticket count of the last 5 rounds were: \n\n`

    for (let i = 0; i < matchHistory.length && i < 5; ++i) {
      let data = matchHistory[i]
      message += `${i+1}. `

      // If the game is a draw, there is no winner or loser data that can be parsed.
      if (!data.winner || !data.loser) {
        message += 'Draw \n\n'
      } else {
        // message += `Layer: ${data.winner.layer} - Team ${data.winner.team}: ${data.winner.faction} won:\n ${data.winner.tickets}-${data.loser.tickets} tickets\n\n`
        message += `${data.winner.layer} - Team ${data.winner.team}: ${data.winner.faction} won by ${data.winner.tickets - data.loser.tickets} tickets\n\n`
      }
      if (i % 2 === 0) {
        warns.push(message)
        message = "\n\n"
      }
    }

    if (message.length > 3) {
      warns.push(message)
    }

    for (let i = 0; i < 3; i++) {
      for (const warnMessage of warns) {
        await this.server.rcon.warn(playerInfo.steamID, warnMessage)
      }
      await new Promise(resolve => setTimeout(resolve, this.server.warnMessagePersistenceTimeSeconds));
    }
  }

  async listLastPlayedMaps(playerInfo) {
    const layerHistory = this.server.layerHistory
    let warns = []
    let message = `The last 5 maps were: \n\n`
    for (let i = 0; i < layerHistory.length && i < 5; ++i) {
      message += `${i+1}. ` + layerHistory[i].layer.name
      message += "\n\n"

      if (i % 2 === 0) {
        warns.push(message)
        message = "\n\n"
      }
    }

    if (message.length > 3) {
      warns.push(message)
    }

    for (let i = 0; i < 3; i++) {
      for (const warnMessage of warns) {
        await this.server.rcon.warn(playerInfo.steamID, warnMessage)
      }
      await new Promise(resolve => setTimeout(resolve, this.server.warnMessagePersistenceTimeSeconds));
    }
  }

  async onPlayerConnected(info) {
    let plr = [];
    try {
      plr = this.server.banlist.get(info.steamID);
    } catch (err) {
      console.log('admin-commands:321 ' + err);
      console.log(info);
      return;
    }
    if (this.server.banlist.has(info.steamID) && plr.time >= Date.now() / 1000) {
      const remainder = Math.round(plr.time - Date.now() / 1000);
      this.server.rcon.kick(
        info.steamID,
        `You were recently kicked, please try again in ${remainder} seconds.`
      );
    } else if (this.server.banlist.has(info.steamID) && plr.time <= Date.now() / 1000) {
      this.server.banlist.delete(plr);
    }
  }

  async onRoundEnd(info) {
    if (this.server.randomizeFlag) {
      setTimeout(async () => {
        let i = 0;
        const disband = setInterval(async () => {
          if (i === 10) {
            clearInterval(disband);
          } else {
            await this.server.rcon.execute(`AdminDisbandSquad 1 ${++i}`);
            await this.server.rcon.execute(`AdminDisbandSquad 2 ${i}`);
          }
        }, 100); // 75 too much, 100 is good. Creates MaxListenersExceededWarning: error
      }, 14000);
    }
    setTimeout(async () => {
      if (this.server.randomizeFlag) {
        this.server.rcon.broadcast(
          `The server is now randomizing players for balance. Squads will be disbanded.`
        );
        this.verbose(1, 'Disbanding squads 1 to 10 on each team...');
        this.server.randomizeFlag = false;
        await this.server.updatePlayerList();
        const players = this.server.players.slice(0);

        let currentIndex = players.length;
        let temporaryValue;
        let randomIndex;

        while (currentIndex !== 0) {
          randomIndex = Math.floor(Math.random() * currentIndex);
          currentIndex -= 1;

          temporaryValue = players[currentIndex];
          players[currentIndex] = players[randomIndex];
          players[randomIndex] = temporaryValue;
        }

        let team = '1';
        let randomized = 0;

        for (const player of players) {
          if (player.teamID !== team) {
            randomized++;
            await this.server.rcon.switchTeam(player.steamID);
          }
          team = team === '1' ? '2' : '1';
        }
        console.log(`Swapped ${randomized} players on !randomizenext`);
      }

      let switched = 0;
      for (const steamID of this.server.switchList) {
        switched++;
        await this.server.rcon.execute(`AdminForceTeamChange ${steamID}`);
      }
      console.log(`Swapped ${switched} players on !switchnext`);
      this.server.switchList = [];
    }, 10000);
    this.server.banlist.clear();
  }
}
