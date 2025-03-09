import {test} from "node:test";
import assert from 'assert'
import {getUTCNextWeek, getUTCStartDateOfNextMonth} from "../squad-server/utils/utils.js";
import {isCurrentlyInPeriod} from "../squad-server/plugins/tt-seeding-leaderboard.js";


test('Test getUTCNextWeek', async () => {
    const testDate1 = new Date(Date.parse("2024-11-20T00:00:00.000Z"))
    const expectedDate1 = new Date(Date.parse("2024-11-25T00:00:00.000Z"))

    assert.deepStrictEqual(getUTCNextWeek(testDate1), expectedDate1)
})


test("is currently in period function", async () => {
    const mockStart1 = new Date(1735689600000)
    const mockStart2 = new Date(Date.parse("2024-11-15T00:00:00.000Z"))
    const mockEnd1 = new Date(17356607000000)
    const mockEnd2 = new Date(Date.parse("2024-11-25T00:00:00.000Z"))

    const mockCurrentDate = new Date(Date.parse("2024-11-20T00:00:00.000Z"))

    const mockPeriods = [
        {start: mockStart1, end: mockEnd1}
    ]

    const mockPeriods2 = [
        {start: mockStart2, end: mockEnd2}
    ]

    assert.deepStrictEqual(isCurrentlyInPeriod(mockPeriods, mockCurrentDate), false)
    assert.deepStrictEqual(isCurrentlyInPeriod(mockPeriods2, mockCurrentDate), true)
    assert.deepStrictEqual(isCurrentlyInPeriod([], mockCurrentDate), false)
})


test('Initialize top seeder table', async (t) => {


})


test('Layer set regex', async (t) => {
    // const layerMatchRegex = /^(?:\w+)?\s?\w+_\w+_\w+\s\w+(?:\+\w+)?\s\w+(?:\+\w+)?$/;
    const layerMatchRegex = /^(?:\w+\s)?(\w+_\w+_\w+\s\w+(?:\+\w+)?\s\w+(?:\+\w+)?)$/;


    const layerOnlyFactions = "Skorpo_Skirmish_V1 WPMC VDV"
    const layerMixedFactionAndSubfaction = "Gorodok_TC_V1 BAF TLF+Mechanized"
    const layerWithSubfaction = "AlBasrah_Invasion_v2 PLA+Motorized INS+LightInfantry"
    const layerWithCmdPrefixed = "AdminSetNextLayer Skorpo_Skirmish_V1 WPMC VDV"


    assert.deepStrictEqual(layerMatchRegex.test(layerOnlyFactions), true, 'Expected to be able to input only factions into layer.')
    assert.deepStrictEqual(layerMatchRegex.test(layerMixedFactionAndSubfaction), true, `Should be able to use mixed factions and subfactions.`)
    assert.deepStrictEqual(layerMatchRegex.test(layerWithSubfaction), true, 'Expected to be able to input factions + subfactions for both teams.')
    assert.deepStrictEqual(layerMatchRegex.test(layerWithCmdPrefixed), true, 'Expect to be able to prefix a layer with "AdminSetNextLayer"')
})