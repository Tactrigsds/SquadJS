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
 * @type {Readonly<{databaseUpdated: string, newGame: string, playerKicked: string, playerCreated: string, possessedAdminCamera: string, unPossessedAdminCamera: string, chatMessage: string, playerConnected: string, roundEnd: string, nextLayerSet: string, playerBanned: string, playerDisconnected: string, playerWarned: string}>}
 */
export const eventsEnum = Object.freeze({
    newGame: 'NEW_GAME',
    roundEnd: 'ROUND_END',
    nextLayerSet: 'MAP_SET',
    chatMessage: 'CHAT_MESSAGE',
    playerConnected: 'PLAYER_CONNECTED',
    playerDisconnected: 'PLAYER_DISCONNECTED',
    databaseUpdated: 'DATABASE_UPDATED',
    possessedAdminCamera: 'POSSESSED_ADMIN_CAMERA',
    unPossessedAdminCamera: 'UNPOSSESSED_ADMIN_CAMERA',
    playerWarned: 'PLAYER_WARNED',
    playerKicked: 'PLAYER_KICKED',
    playerBanned: 'PLAYER_BANNED',
    playerCreated: 'SQUAD_CREATED',
});

export { SQUADJS_VERSION, COPYRIGHT_MESSAGE };
