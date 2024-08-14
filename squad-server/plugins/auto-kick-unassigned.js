import BasePlugin from './base-plugin.js';

export default class AutoKickUnassigned extends BasePlugin {
  static get description() {
    return (
      'The <code>AFKKick</code> plugin will automatically kick players that are not in a squad after a ' +
      'specified ammount of time.'
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      warningMessage: {
        required: false,
        description: 'Message SquadJS will send to players warning them they will be kicked',
        default: 'Join a squad, you are are unassigned and will be kicked'
      },
      kickMessage: {
        required: false,
        description: 'Message to send to players when they are kicked',
        default: 'Unassigned - automatically removed'
      },
      warnThreshold: {
        required: false,
        description:
          'How often in <b>Seconds</b> should we warn the player about being unassigned?',
        default: 30
      },
      kickThreshold: {
        required: false,
        description: 'How long in <b>Seconds</b> to wait before a unassigned player is kicked',
        default: 360
      },
      playerThreshold: {
        required: false,
        description:
          'Player count required for AutoKick to start kicking players, set to -1 to disable',
        default: 93
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.kickThreshold = options.kickThreshold * 1000;
    this.warnThreshold = options.warnThreshold * 1000;

    this.afklist = {};

    this.onNewGame = this.onNewGame.bind(this);
    this.afkCheck = this.afkCheck.bind(this);
  }

  async mount() {
    this.server.on('NEW_GAME', this.onNewGame);
    this.interval = setInterval(this.afkCheck, 15000);
  }

  async unmount() {
    clearInterval(this.interval);
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
  }

  msFormat(s) {
    // take in generic # of ms and return formatted MM:SS
    let min = Math.floor((s / 60) << 0);
    let sec = Math.floor(s % 60);
    min = ('' + min).padStart(2, '0');
    sec = ('' + sec).padStart(2, '0');
    return `${min}:${sec}`;
  }

  async afkCheck() {
    // setInterval(async () => {
    await this.server.updatePlayerList();
    const currTime = Date.now() / 1000;
    const plrs = this.server.players;
    //
    // IF TESTING MODIFY THE FUCKING THRESHOLD
    //
    // Populate an array (afklist) with players not in a squad
    if (plrs.length > this.options.playerThreshold) {
      for (const plr of plrs) {
        if (plr.squadID === null) {
          if (plr.steamID in this.afklist) {
            // If a player (plr) has been afk beyond the time allowed by config.json, warn or kick them
            if (
              currTime - this.afklist[plr.steamID] > this.options.warnThreshold &&
              currTime - this.afklist[plr.steamID] < this.options.kickThreshold
            ) {
              const secondsRemaining =
                this.options.kickThreshold - (currTime - this.afklist[plr.steamID]);
              const timeRemaining = this.msFormat(secondsRemaining);
              this.server.rcon.warn(
                plr.steamID,
                `${this.options.warningMessage} ${timeRemaining} left`
              );
            }
            if (currTime - this.afklist[plr.steamID] > this.options.kickThreshold) {
              this.server.rcon.kick(plr.steamID, this.options.kickMessage);
            }
          } else {
            this.afklist[plr.steamID] = currTime;
          }
        }
        // If the player (plr) has joined a squad, delete them from afklist
        if (plr.steamID in this.afklist && plr.squadID !== null) {
          delete this.afklist[plr.steamID];
        }
      }
    }
    let afkplayers = Object.keys(this.afklist); // Create an array of keys from afklist - required to run a for-loop
    // Removes a player if they leave the server
    for (const afkplr of afkplayers) {
      let flag = true;
      for (const listplr of plrs) {
        if (afkplr === listplr.steamID) {
          flag = false;
        }
      }
      if (flag === true) {
        delete this.afklist[afkplr];
      }
    }
    // afkplayers = Object.keys(this.afklist);
    // console.log(`AFK list length: ${afkplayers.length}`);
    // }, 30000);
  }

  async onNewGame() {
    this.afklist = {};
  }
  /* server.on(ROUND_END, (info) => {
    afklist = {};
  }); */
}
