import {test, it} from "node:test";
import assert from "node:assert";
import {
    initializeSessions,
    logEndedSessions,
    setEndSessions
} from "../squad-server/plugins/tt-session-tracker-plugin.js";
import {sleep} from "../squad-server/utils/utils.js";


/** @type {Player} */
const testPlayer1 = {
    playerID: 1,
    name: "testname",
    teamID: 1,
    squadID: null,
    isLeader: false,
    role: "Rifleman",
    eosID: "00001234",
    steamID: "7654",
    playercontroller: "",
    squad: null,
    suffix: "testname",
    possessClassname: "BP_Something"

}
/** @type {Player} */
const testPlayer2 = {
    playerID: 1,
    name: "testname2",
    teamID: 1,
    squadID: null,
    isLeader: false,
    role: "Rifleman",
    eosID: "00001234",
    steamID: "5000",
    playercontroller: "",
    squad: null,
    suffix: "testname",
    possessClassname: "BP_Something"
}


/** @type {Player[]} */
const testPlayers = [testPlayer1, testPlayer2]


const testPlayerSessions= new Map()

// console.log(testPlayerSessions)
//
// console.log(new Date())


// Mock real usage. Initialize sessions.
test("test that a player gets succesfully initialized to the session tracker.", async () => {
    /** @type {Map<string, Object>} */
    const testPlayerSessions= new Map()
    const testEndedSessions= new Map()

    // Mock players in the server

    /** @type {Player[]} */
    const testPlayers = [testPlayer1, testPlayer2]

    const updatedSessions = initializeSessions(testPlayers, testPlayerSessions)

    // Mock a player having left the server.
    const afterPlayers = [testPlayer2]
    await sleep(500)
    const newSessions = setEndSessions(afterPlayers, updatedSessions)
    console.log("mutated player sessions", newSessions)
    const finalSessions = logEndedSessions(newSessions, testEndedSessions)
    console.log("final sessions", finalSessions)
    console.log("ended sessions", testEndedSessions)
})