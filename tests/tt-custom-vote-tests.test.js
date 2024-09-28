import {
    checkIfTimeInRange,
    hasSpecificFactionAndSubfactions,
    hasSpecificLayer,
    filterRecentFactions,
    weightedRandomPick
    // getLayerListLogPath,
} from '../squad-server/plugins/tt-custom-mapvote.js'
import * as assert from "assert";
import fs from "fs";
import { layerList } from "./layerListLoaded.js";
// import {recentMatchHistoryTest1} from "./recentMatchesUtils.js";
import { recentMatchHistoryTest1, recentMatchHistoryTest2} from "./recent-matches-utils.js";
import { getFormattedDateForLog, getLayerListLogPath} from "../squad-server/utils/utils.js";
import sinon from 'sinon';
import { expect } from 'chai';
// console.log(getLayerListLogPath('./'));


const mockCurrentTime = new Date(1723222066151)

async function parseCuratedList(rawData, delimiter, layerListVersion){
    const parsedLayers = []
    let lines = rawData.split(/\r?\n/);

    const versionRegex = /^/
    lines.slice(1)

    if (layerListVersion === "version1") {
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
                console.log(err)
            }
        }
    }

    else {
        const regex = /^(?!\/\/)[^,;\n]+(?:[;,][^,;\n]+)*$/;
        // Remove csv header.
        lines = lines.slice(1)
        // Remove potential whitespace.
        lines = lines.map(line => line.trim())
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

            if (Math.abs(layer.balanceDifferential) > 2.5) {
                continue
            }

            parsedLayers.push(layer)
        }
    }

    return parsedLayers
}

async function loadLayerListFromDisk(path, layerListVersion = 'version5', delimiter = ",") {
    let layers = []
    try {
        const data = fs.readFileSync(path, 'utf-8');
        layers = await parseCuratedList(data, delimiter, layerListVersion)
    } catch (err) {
        console.log(err)
    }

    return layers;
}


describe('checkIfTimeInRange', function() {
    it('should return true if time is within the range', function() {
        const mockCurrentTime = new Date();
        mockCurrentTime.setUTCHours(16)
        mockCurrentTime.setUTCMinutes(30)
        assert.strictEqual(checkIfTimeInRange("16:10", "17:00", mockCurrentTime), true);
        mockCurrentTime.setUTCHours(2)
        mockCurrentTime.setUTCMinutes(40)
        assert.strictEqual(checkIfTimeInRange("02:39", "02:41", mockCurrentTime), true)
    });

    it('should return false if time is outside the range', function() {
        const mockCurrentTime = new Date();
        // Adjust mockCurrentTime to a time outside the range, if needed
        mockCurrentTime.setUTCHours(20, 0);  // For example, set to 20:00
        assert.strictEqual(checkIfTimeInRange("17:10", "18:45", mockCurrentTime), false);
        assert.strictEqual(checkIfTimeInRange("14:10", "15:30", mockCurrentTime), false);
    });
});



describe('TestCuratedLayerListLoading', function () {
    it('should test that the curated list loads correctly', async function () {
        const layerListPath = "tests\\layerlistTest.csv"
        const layerListLoaded = await loadLayerListFromDisk(layerListPath)
        assert.deepStrictEqual(layerListLoaded, layerList, 'Layer lists are not equal')
        for (const layer of layerListLoaded) {
            assert.strictEqual(Math.abs(layer.balanceDifferential) < 2.5, true)
        }
    });

    it('should test that the layerlist does not include layers with too large of a balance differential.', async function () {
        const balanceDifferentialLimit = 2.5
        const layerListPath = "tests\\layerlistFullV6.csv"
        const layerListLoaded = await loadLayerListFromDisk(layerListPath)
        for (const layer of layerListLoaded) {
            assert.strictEqual(Math.abs(layer.balanceDifferential) < balanceDifferentialLimit, true)
        }
    });
});


describe('TestUnsafe/banned functions', function () {
    it('should ensure that filters banning specific factions, maps, layers etc. are working properly', function () {
        const layer =   {
            level: 'AlBasrah',
            layer: 'AlBasrah_AAS_v1',
            size: 'Large',
            faction1: 'ADF',
            faction2: 'INS',
            subfaction1: 'CombinedArms',
            subfaction2: 'Mechanized',
            logisticsScore1: 31.75,
            logisticsScore2: 39.5,
            transportationScore1: 97.55,
            transportationScore2: 94.1,
            antiInfantryScore1: 63.31666666666667,
            antiInfantryScore2: 47.89583333333333,
            armorScore1: 35.43333333333334,
            armorScore2: 42.29166666666667,
            zeroScore1: 87.77104096635007,
            zeroScore2: 85.94174955101596,
            balanceDifferential: 1.8292914153341115
        }
        const bannedLayers = [
            'AlBasrah_AAS_v1'
        ]

        const bannedLayers2 = [
          'TestLayer'
        ]

        assert.strictEqual(hasSpecificLayer(layer, bannedLayers), true)
        assert.strictEqual(hasSpecificLayer(layer, bannedLayers2), false)
    });
});


describe('Test functionality for ensuring no team will play the same faction multiple times in a row.', function () {
    const team1 = "MEA_S_CombinedArms"
    const team2 = "INS_S_CombinedArms"
    const layerListPath = "tests/layerlistFullV5.csv"
    const actualRecentFaction1g1 = "MEA"
    const actualRecentFaction2g1 = "INS"
    const actualRecentFaction1g2 = "CAF"
    const actualRecentFaction2g2 = "RGF"

    it('should ensure that no team can play the same factions right after one another', async function () {
        const fullLayerList = await loadLayerListFromDisk(layerListPath)
        const filteredList = filterRecentFactions(fullLayerList, recentMatchHistoryTest1, team1, team2)
        for (const layer of filteredList) {
            assert.notEqual(actualRecentFaction1g1, layer.faction2)
            assert.notEqual(actualRecentFaction2g1, layer.faction1)
        }
    });

    it('should ensure that no team can play the same faction until 2 games after the last time they played it.', async function () {
        const fullLayerList = await loadLayerListFromDisk(layerListPath)
        const filteredList = filterRecentFactions(fullLayerList, recentMatchHistoryTest1, team1, team2);
        for (const layer of filteredList) {
            assert.notEqual(actualRecentFaction1g2, layer.faction1, 'Same team got the same faction 2 games after');
            assert.notEqual(actualRecentFaction2g2, layer.faction2, 'Same team got the same faction 2 games after');
        }
    });

    it('should ensure that no team has to play a PLA related faction right after one another.', async function () {
        const PLA_FACTIONS = Object.freeze([
            'PLA',
            'PLANMC',
            'PLAAGF'
        ])

        const actualRecentFaction1g1 = "PLA"
        const actualRecentFaction1g2 = "MEA"
        const actualRecentFaction2g1 = "PLAAGF"
        const actualRecentFaction2g2 = "RGF"

        const team1 = "PLANMC_S_CombinedArms"
        const team2 = "INS_S_CombinedArms"

        const fullLayerList = await loadLayerListFromDisk(layerListPath)
        const filteredList = filterRecentFactions(fullLayerList, recentMatchHistoryTest2, team1, team2);
        for (const layer of filteredList) {
            assert.equal(PLA_FACTIONS.includes(layer.faction2), false)
            // assert.equal(PLA_FACTIONS.includes(layer.faction1), false)
            // assert.notEqual(actualRecentFaction1g2, layer.faction1, 'Same team got the same faction 2 games after');
            // assert.notEqual(actualRecentFaction2g2, layer.faction2, 'Same team got the same faction 2 games after');
        }
    });
});

describe('Test layerlist logging functionality.', function () {
    const logFolder = './logs'
    it('should construct a logging file with the current date.', function () {
        const testDate = new Date(0)
        const expectedPath = 'logs\\tt-custom-mapvote_1970.01.01-00.00.log'
        const actualPath = getLayerListLogPath(logFolder, testDate, `The date formatting didn't match the epxected formatting.`)
        assert.equal(expectedPath, actualPath)
    });

    it('should test that the logging is formatted correctly.', function () {
        const date = new Date(0)
        const expectedFormatting = `1970-01-01_00.00.00.0`
        const actualFormatting = getFormattedDateForLog(date)
        assert.equal(expectedFormatting, actualFormatting, `The date formatting didn't match the expected formatting.`)
    });

    // it('should initialize log folder', function () {
    //     initializeLogFolder(logFolder)
    // });
});

describe('Test weighted random pick function', () => {
    let options;

    beforeEach(() => {
        options = [
            { option: "RAAS", weight: 70 },
            { option: "AAS", weight: 30 },
            { option: "Skirmish", weight: 5 },
            { option: "TC", weight: 5 }
        ];
    });

    it('should return one of the valid options', () => {
        const result = weightedRandomPick(options);
        const validOptions = options.map(opt => opt.option);
        expect(validOptions).to.include(result);
    });
      it('should favor options with higher weights', () => {
    const stub = sinon.stub(Math, 'random').returns(0.9); // Force a high random number
    const result = weightedRandomPick(options);
    expect(result).to.equal('RAAS'); // Because RAAS has the highest weight
    stub.restore();
  });

  it('should pick "AAS" when random value is in a specific range', () => {
    const stub = sinon.stub(Math, 'random').returns(0.75); // Between RAAS and AAS
    const result = weightedRandomPick(options);
    expect(result).to.equal('AAS');
    stub.restore();
  });

  it('should pick "Skirmish" when random value is low enough', () => {
    const stub = sinon.stub(Math, 'random').returns(0.98); // Toward the end of the weight spectrum
    const result = weightedRandomPick(options);
    expect(result).to.equal('Skirmish');
    stub.restore();
  });

  it('should pick "TC" when random value is at the very end', () => {
    const stub = sinon.stub(Math, 'random').returns(0.995); // Near the edge for TC
    const result = weightedRandomPick(options);
    expect(result).to.equal('TC');
    stub.restore();
  });

})