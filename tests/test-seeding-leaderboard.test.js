import sequelize from "sequelize";
import {test} from "node:test";
import assert from 'assert'
import {initializeTopSeederModel} from "../squad-server/plugins/tt-seeding-leaderboard.js";
// initializeTopSeederModel()

test('Initialization of leaderboard table', async (t) => {
    const connector = new sequelize.Sequelize('sqlite:testdb.sqlite', {
        define: {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci'
        }
    })

    const result = await initializeTopSeederModel(connector)


})