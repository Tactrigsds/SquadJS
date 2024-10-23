import BasePlugin from './base-plugin.js';
import fs from "fs";

export default class TTAutoRotation extends BasePlugin {
    static get description() {
        return ("Plugin used for automatically running set rotations and having fog of war removed at the start of a round.");
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            rotationEnabled: {
                required: true,
                description: "Whether SquadJS will follow a set rotation",
                example: true
            },
            rotationPath: {
                required: false,
                description: "File path to the rotation. Needs to be formatted in the same way it'd be used to set the next map.",
                example: "/path/to/file.txt"
            },
            autoRemovefogOfWar: {
                required: false,
                description: "Whether to automatically disable fog of war, identical functionality to the fog of war plugin.",
                default: false
            },
            autoFogOfWarDelay: {
                required: false,
                description: "The delay before fog of war gets disabled.",
                default: 15 * 1000
            },
            autoRemoveFogOfWarCommand: {
                required: false,
                description: "Commands that can be used to enable the auto fog of war, it's status etc.",
                default: ['!autofog']
            },
            rotationCommand: {
                required: false,
                description: "Command that triggers a reload of a rotation from disk.",
                default: ['!rotation']
            },
            squadJSConfigFilePath: {
                required: false,
                description: "The path to the SquadJS config file.",
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);
        this.onNewGame = this.onNewGame.bind(this)
        this.onChatMessage = this.onChatMessage.bind(this)
        this.loadRotation = this.loadRotation.bind(this)
        this.removeFogOfWar = this.removeFogOfWar.bind(this)
        this.setNextLayerInRotation = this.setNextLayerInRotation.bind(this)
        this.rotation = null;
        this.configFilePath = fs.realpathSync(this.options.squadJSConfigFilePath)

        /*
         Matches the format of a map set, with optional subfactions.
         Example - Yehorivka_RAAS_V1 USA RGF
         AND - Yehorivka_RAAS_V1 USA+Armored RGF+Armored
         */
        this.regex = /^\w+_\w+_\w+\s\w+(?:\+\w+)?\s\w+(?:\+\w+)?$/;
    }

    async mount() {
        this.server.on(this.server.eventsEnum.databaseUpdated, this.onNewGame)
        this.server.on(this.server.eventsEnum.chatMessage, this.onChatMessage)

        this.autoSetLayerOnRoundStartInitialState = this.server.autoSetLayerOnRoundStart
        this.server.autoRotationEnabled = this.options.rotationEnabled
        this.server.autoRemovefogOfWar = this.options.autoRemovefogOfWar

        // If the autorotation is enabled, we want to disable tt-custom-mapvotes autoset, to avoid double sets.
        this.server.autoSetLayerOnRoundStart = !this.options.autoRotationEnabled
        this.rotation = await this.loadRotation()

        try {
            this.configData = await this.loadConfigFile(this.configFilePath)
            /* Stores a reference/pointer to the autorotation parameters in the config file,
             NOT a copy, so changes done to this variable will be made to the config as well.
            */
            this.autoRotationPluginConfig = this.configData.plugins.find(p => p.plugin === 'TTAutoRotation')
        } catch (e) {
            this.verbose(1, `Error occured when loading config data to memory. Error: `)
            console.error(e)
        }

        await new Promise(resolve => setTimeout(resolve, 500))
    }

    async unmount() {
        this.server.removeEventListener(this.onNewGame)
    }


    async onNewGame() {
        await new Promise(resolve => setTimeout(resolve, 2000))

        if (this.server.autoRemovefogOfWar) {
            setTimeout(async () => {
                await this.removeFogOfWar()
              }, this.options.autoFogOfWarDelay)
        }
        if (this.server.autoRotationEnabled) {
            await this.setNextLayerInRotation()
        }
    }

    async onChatMessage(info) {
        const pMessages = info.message.toLowerCase().split(" ")
        if (info.chat !== 'ChatAdmin') return

        // const commands = [
        //     {inGameCommand: `toggle`, action: this.fogOfWarToggle, help: ``},
        //     {inGameCommand: `status`, action: this.fogOfWarToggle, help: ``},
        // ]

        if (this.options.autoRemoveFogOfWarCommand.includes(pMessages[0])) {
            if (pMessages[1] === 'toggle') {
                await this.fogOfWarToggle(info)
            }
            else if(pMessages[1] === 'status') {
                await this.sendFogOfWarStatus(info)
            }
            else if (pMessages[1] === 'save') {
                await this.saveFogOfWarState(info)
            }
        }
        else if (this.options.rotationCommand.includes(pMessages[0])) {
            switch (pMessages[1]) {
                case `toggle`: {
                    await this.toggleAutoRotation(info)
                    break;
                }
                case `status`: {
                    await this.sendAutoRotationStatus(info)
                    break
                }
                case `save`: {
                    await this.saveAutoRotationState(info)
                    break
                }
                case `reload`: {
                    await this.reloadRotationCommand(info)
                    break
                }
                default: break
            }
        }
    }

    async reloadRotationCommand(info) {
        this.verbose(1, `Rotation reload called by admin: ${info.name}`)
        try {
            const rotation = await this.loadRotation()
            if (rotation && rotation.length) {
                this.verbose(1, `Succesfully reloaded rotation.`)
                await this.server.rcon.warn(info.steamID, `Succesfully reloaded rotation. \nRotation length: ${rotation.length}`)
            }
            else {
                this.verbose(1, `Something went wrong when loading rotation.`)
                await this.server.rcon.warn(info.steamID, `Something went wrong when loading rotation.`)
            }
        } catch (e) {
            this.verbose(1, `Something went wrong when reloading rotation from command. Error:`)
            console.log(e)
            await this.server.rcon.warn(1, `SquadJS was unable to reload rotation.`)
        }
    }


    /**
     *
     * @param info
     * @param {Array<string>} rotation
     * @returns {Promise<void>}
     */
    async sendRotationToAdmin(info, rotation) {

    }

    async sendAutoRotationStatus(info) {
        const state = this.server.autoRotationEnabled ? 'Enabled' : 'Disabled'
        if (info) {
            await this.server.rcon.warn(info.steamID, `AutoRotation is currently ${state}.`)
        }
    }

    async sendFogOfWarStatus(info) {
        const state = this.server.autoRemovefogOfWar ? 'Enabled' : 'Disabled'
        if (info) {
            await this.server.rcon.warn(info.steamID, `AutoFogless is currently ${state}.`)
        }
    }

    async toggleAutoRotation(info) {
        this.server.autoRotationEnabled = !this.server.autoRotationEnabled
        const state = this.server.autoRotationEnabled ? 'on' : 'off'
        this.verbose(1, `Toggled auto rotation ${state}.`)
        if (info) {
            if (this.server.autoRotationEnabled) {
                await this.server.rcon.warn(info.steamID, `AutoRotation has been enabled. \nSquadJS will now automatically set the next map in the loaded rotation upon a new game starting.`)
            } else {
                await this.server.rcon.warn(info.steamID, `AutoRotation has been disabled.`)
            }
        }
    }


    async fogOfWarToggle(info) {
        this.server.autoRemovefogOfWar = !this.server.autoRemovefogOfWar
        const state = this.server.autoRemovefogOfWar ? 'on' : 'off'
        this.verbose(1, `Toggled auto fog of war ${state}`)
        if (info) {
            if (this.server.autoRemovefogOfWar) {
                await this.server.rcon.warn(info.steamID, `AutoFogless has been toggled on.\nFog will now be automatically removed at the start of a game.`)
            } else {
                await this.server.rcon.warn(info.steamID, `AutoFogless has been toggled off.\n`)
            }
        }
    }


    async saveAutoRotationState(info) {
        if (this.autoRotationPluginConfig) {
            this.autoRotationPluginConfig.rotationEnabled = this.server.autoRotationEnabled
            try {
                await this.saveConfigFile(this.configData, this.configFilePath)
                await this.server.rcon.warn(info.steamID, `Succesfully saved autorotation state to config file. Note that this saves the current state permanent, and will persist should SquadJS get restarted.`)
            } catch (e) {
                this.verbose(`Unable to save config file. Error: `)
                console.log(e)
            }

        } else {
            await this.server.rcon.warn(info.steamID, `Config data was improperly loaded by the plugin. Not able to save updated parameters.`)
        }
    }

    async saveFogOfWarState(info) {
        if (this.autoRotationPluginConfig) {
            this.autoRotationPluginConfig.autoRemovefogOfWar = this.server.autoRemovefogOfWar
            try {
                await this.saveConfigFile(this.configData, this.configFilePath)
                await this.server.rcon.warn(info.steamID, `Succesfully saved AutoFogless state to the SquadJS config file. Note that this stores the AutoFogless state even should SquadJS get restarted.`)
            } catch (e) {
                this.verbose(`Unable to save config file. Error: `)
                console.log(e)
            }

        } else {
            await this.server.rcon.warn(info.steamID, `Config data was improperly loaded by the plugin. Not able to save updated parameters.`)
        }
    }



    async removeFogOfWar() {
        await this.server.rcon.setFogOfWar(0)
        this.verbose(1, `Turning off fog...`)
        await this.server.warnAllAdmins(`SquadJS: Turning off fog...`)
    }

    async setNextLayerInRotation() {
        this.server.autoSetLayerOnRoundStart = false
        const matchHistory = this.server.getMatchHistoryFromDB()
        let nextRotationPick;
        for (const layer of this.rotation) {
            let layerPlayed = false

            const splitLayer = layer.split(" ")
            const layerObject = { layer: splitLayer[0], faction1: splitLayer[1], faction2: splitLayer[2] }

            for (const playedLayer of matchHistory) {
                if (layerObject.layer?.toLowerCase() === playedLayer.layerClassname?.toLowerCase()
                  // &&
                  //   (
                  //     (playedLayer.faction1 === layerObject.faction1 &&
                  //   playedLayer.faction1 === layerObject.faction2) ||
                  //   playedLayer.faction2 === layerObject.faction1 ||
                  //   playedLayer.faction2 === layerObject.faction2
                  //   )
                )

                {
                    layerPlayed = true;
                    break;
                }
            }
            // TODO don't set the next map in rotation again if it's already been set correctly.
            if (!layerPlayed) {
                nextRotationPick = layer
                await this.server.rcon.setNextLayer(layer)
                await new Promise(resolve => setTimeout(resolve, 5000))
                const nextMap = await this.server.rcon.getNextMap()
                if (!layer.includes(`${nextMap.layer} ${nextMap.factions}`)) {
                    this.verbose(1, `Invalid layer detected...${layer}`)
                    await this.removeInvalidLayer(layer)
                    this.setNextLayerInRotation()
                } else {
                    this.server.nextLayerSet = true
                    await this.server.warnAllAdmins(`SquadJS: Auto rotation plugin running, setting next layer in rotation: ${nextRotationPick}`)
                    break
                }
            }
        }
    }

    async loadRotation() {
        if (!this.options.rotationPath || !this.options.rotationPath.length) {
            // TODO create a custom error for this.
            throw new InvalidPathError('Need to have a valid file path if a rotation is enabled.')
        }
        let data;
        
        try {
            // path.realpathSync(this.options.rotationPath)
            const rotationPath = fs.realpathSync(this.options.rotationPath)
            data = fs.readFileSync(rotationPath, 'utf-8');
        }
        catch (e) {
            if (e.code === `ENOENT`) {
                this.verbose(1, `Error, the specified path to the rotation doesen't exist. Path: ${this.options.rotationPath}`)
            } else {
                this.verbose(1, `Unable to load rotation.`)
                console.log(e)
            }
            return []
        }
        // TODO fix regex so it also accepts no faction specified while another gets a speified subfaction
        // Eg. "
        // const regex = /^\w+\s\w+\+\w+\s\w+\+\w+$/;
        // const regex2 = /^\w+_\w+_\w+\s\w+\s\w+$/;

        const tempRotation = data.split(/\r?\n/)
        const viableRotation = []

        const regex = /^\w+_\w+_\w+\s\w+(?:\+\w+)?\s\w+(?:\+\w+)?$/;

        for (const layer of tempRotation) {
            if (regex.test(layer)) {
                viableRotation.push(layer)
            }
        }

        this.verbose(1, 'Loaded rotation:')
        console.log(viableRotation)
        this.verbose(1, `Rotation length: ${viableRotation.length}`)
        this.server.autoSetLayerOnRoundStart = false
        return viableRotation
    }

    async removeInvalidLayer(layer) {
        this.verbose(1, `Removing invalid layer from rotation: ${layer}...`)
        const rotation = await this.loadRotation()
        const newData = []

        for (const line of rotation) {
            if (!line.trim().includes(layer.trim())) {
                newData.push(line)
            } else {
                // this.verbose(1, 'Found a layer to remove.')
                // this.verbose(1, layer)
            }
        }

        this.rotation = rotation

        const rotationData = newData.join("\n")
        fs.writeFileSync(this.options.rotationPath, rotationData, 'utf-8')
    }

    saveConfigFile(data, configFilePath) {
        const tempFilePath = './config.temp.json'
        if (!configFilePath) {
            throw Error('Unable to save config, the path stored is either invalid or nonexistent.')
        }
        let jsonString
        try {
            jsonString = JSON.stringify(data, null, 2)
            this.verbose(3, `Succesfully parsed config data back into JSON`)
        } catch (e) {
            this.verbose(1, `Unable to save changed config file, error when parsing JSON data into a string.`)
            console.log(e)
            return
        }
        try {
            fs.writeFileSync(tempFilePath, jsonString, 'utf-8')
            fs.renameSync(tempFilePath, configFilePath);
            this.verbose(1, `Config file succesfully updated.`)
        } catch (err) {
            this.verbose(1, `Failed to save config safely`)
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        }
    }

    async loadConfigFile(filePath) {
        if (!filePath || !filePath?.length) {
            throw Error('Unable to load config, the path to the config file is either invalid or nonexistent.')
        }
        const rawData = fs.readFileSync(filePath, "utf-8")
        return JSON.parse(rawData)
    }


    // TODO create a function that tests if a rotation works, for example on load?
    // TODO create some sort of functionality that automatically disables the plugin once a rotation has been completed.
}


class InvalidPathError extends Error {
    constructor(message) {
        super(message)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, InvalidPathError)
        }

        this.name = this.constructor.name;
    }
}