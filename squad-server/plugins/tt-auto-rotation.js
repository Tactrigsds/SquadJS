import BasePlugin from './base-plugin.js';
import fs from "fs";

export default class TTAutoRotation extends BasePlugin {
    static get description() {
        return (
            "Plugin meant to allow users to kill themselves(i.e double swap themselves) so they can get rid of the running man bug"
        );
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
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);
        this.onNewGame = this.onNewGame.bind(this)
        this.loadRotation = this.loadRotation.bind(this)
        this.removeFogOfWar = this.removeFogOfWar.bind(this)
        this.setNextLayerInRotation = this.setNextLayerInRotation.bind(this)
        this.rotation = null;
        /*
         Matches the format of a map set, with optional subfactions.
         Example - Yehorivka_RAAS_V1 USA RGF
         AND - Yehorivka_RAAS_V1 USA+Armored RGF+Armored
         */

        this.regex = /^\w+_\w+_\w+\s\w+(?:\+\w+)?\s\w+(?:\+\w+)?$/;
    }

    async mount() {
        this.server.on(this.server.eventsEnum.databaseUpdated, this.onNewGame)
        this.autoSetLayerOnRoundStartInitialState = this.server.autoSetLayerOnRoundStart
        this.server.autoRotationEnabled = this.options.rotationEnabled
        this.server.autoRemovefogOfWar = this.options.autoRemovefogOfWar
        // If the autorotation is enabled, we want to disable tt-custom-mapvotes autoset, to avoid double sets.
        this.server.autoSetLayerOnRoundStart = !this.options.autoRotationEnabled
        if (this.server.autoRotationEnabled) {
            this.rotation = await this.loadRotation()
        } else {
            this.rotation = null
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
        if (this.server.rotationEnabled) {
            await this.setNextLayerInRotation()
        }
    }

    async removeFogOfWar() {
        await this.server.rcon.setFogOfWar(0)
        this.verbose(1, `Turning off fog...`)
        this.server.warnAllAdmins(`SquadJS: Turning off fog...`)
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
        if (this.options.rotationEnabled) {
            if (!this.options.rotationPath || !this.options.rotationPath.length) {
                await this.unmount()
                throw new Error('Need to have a valid file path if a rotation is enabled.')
            }
        }
        let data;
        try {
            data = fs.readFileSync(this.options.rotationPath, 'utf-8');
        } catch (e) {
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

    // TODO create a function that tests if a rotation works, for example on load?
    // TODO create some sort of functionality that automatically disables the plugin once a rotation has been completed.
}
