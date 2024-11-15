import {test} from "node:test";
import assert from 'assert'
import {
    initializeSessions,
    updateSessions
} from "../squad-server/plugins/tt-session-tracker-plugin.js";


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
    playerID: 2,
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
/** @type {Player} */
const testPlayer3 = {
    playerID: 3,
    name: "testname3",
    teamID: 1,
    squadID: null,
    isLeader: false,
    role: "Rifleman",
    eosID: "00001234",
    steamID: "10000",
    playercontroller: "",
    squad: null,
    suffix: "testname",
    possessClassname: "BP_Something"
}




// Mock real usage.
test("new version of the session tracker.", async () => {
    const expectedEndedSessions = [testPlayer1, testPlayer2]
    // let expectedPlayersInServerAfterUpdate = [testPlayer1]

    /** @type {Map<string, Object>} */
    let playerSessions= new Map()

    /** @type {Map<string, Object>} */
    const endedSessions= new Map()

    /** @type {Player[]} */
    const testPlayersAtStart = [testPlayer1, testPlayer2, testPlayer3]

    playerSessions = initializeSessions(testPlayersAtStart, playerSessions)

    // Mock players 1 and 2 having left
    const testPlayersAfterWait = [testPlayer3]

    playerSessions = updateSessions(testPlayersAfterWait, playerSessions, endedSessions)

    // Assert that sessions were updated properly
    assert.equal(playerSessions.has(testPlayer1.steamID), false)
    assert.equal(playerSessions.has(testPlayer2.steamID), false)

    assert.equal(expectedEndedSessions.some(player => {
        return !endedSessions.has(player.steamID)
    }), false, "The actual ended sessions did not match the players in the expected players")


    // Players 2 and 3 have now rejoined
    const testPlayersAfterRefresh = [testPlayer1, testPlayer2, testPlayer3]
    playerSessions = initializeSessions(testPlayersAfterRefresh, playerSessions)
    
    const player1After = playerSessions.get(testPlayer1.steamID)
    const player2After = playerSessions.get(testPlayer2.steamID)
    const player3After = playerSessions.get(testPlayer3.steamID)

    // Check that all the players in the session map has the expected start and end relationships.
    assert.equal(player1After.sessionStart, player1After.sessionEnd, "Player 1 did not have their session end updated as intended")
    assert.equal(player2After.sessionStart, player2After.sessionEnd, "Player 1 did not have their session end updated as intended")
    assert.notEqual(player3After.sessionStart, player3After.sessionEnd, "Player 1 did not have their session end updated as intended")

    assert.equal(endedSessions.has(testPlayer1.steamID), true)
    assert.equal(endedSessions.has(testPlayer2.steamID), true)
})