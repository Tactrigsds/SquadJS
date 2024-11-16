import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SQUADJS_VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
).version;

/* As set out by the terms of the license, the following should not be modified. */
const COPYRIGHT_MESSAGE = `Powered by SquadJS, Copyright © ${new Date().getFullYear()}`;

export const WARN_MESSAGE_PERSISTENCE_TIME_MS = 6080


/**
 * Represents all possible events emitted by the server object.
 * @type {Readonly<{rconError: string, playerDied: string, newGame: string, deployableDamaged: string, playerKicked: string, possessedAdminCamera: string, roundEnded: string, playerWarned: string, adminBroadcast: string, teamKill: string, databaseUpdated: string, joinSucceeded: string, playerWounded: string, playerCreated: string, playerPossess: string, unPossessedAdminCamera: string, tickRate: string, chatMessage: string, playerConnected: string, playerUnpossess: string, playerDamaged: string, nextLayerSet: string, playerBanned: string, playerDisconnected: string, playerRevived: string}>}
 */
export const ServerEvents = Object.freeze({
    newGame: 'NEW_GAME',
    roundEnded: 'ROUND_ENDED',
    nextLayerSet: 'MAP_SET',
    chatMessage: 'CHAT_MESSAGE',
    playerConnected: 'PLAYER_CONNECTED',
    playerDisconnected: 'PLAYER_DISCONNECTED',
    playerPossess: 'PLAYER_POSSESS',
    playerUnpossess: 'PLAYER_UNPOSSESS',
    playerKicked: 'PLAYER_KICKED',
    playerBanned: 'PLAYER_BANNED',
    playerWarned: 'PLAYER_WARNED',
    playerDamaged: 'PLAYER_DAMAGED',
    playerWounded: 'PLAYER_WOUNDED',
    playerDied: 'PLAYER_DIED',
    playerRevived: 'PLAYER_REVIVED',
    playerCreated: 'SQUAD_CREATED',
    teamKill: 'TEAMKILL',
    databaseUpdated: 'DATABASE_UPDATED',
    adminBroadcast: 'ADMIN_BROADCAST',
    possessedAdminCamera: 'POSSESSED_ADMIN_CAMERA',
    unPossessedAdminCamera: 'UNPOSSESSED_ADMIN_CAMERA',
    deployableDamaged: 'DEPLOYABLE_DAMAGED',
    joinSucceeded: 'JOIN_SUCCEEDED',
    tickRate: 'TICK_RATE',
    rconError: 'RCON_ERROR',
});

/**
 *
 * @type {Readonly<{AdminChat: string, SquadChat: string, AllChat: string, TeamChat: string}>}
 */
export const ChatsEnum = Object.freeze({
    AdminChat: 'ChatAdmin',
    AllChat: 'ChatAll',
    TeamChat: 'TeamChat',
    SquadChat: 'ChatSquad',

})

export { SQUADJS_VERSION, COPYRIGHT_MESSAGE };
