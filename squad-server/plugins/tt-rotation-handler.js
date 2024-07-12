import BasePlugin from './base-plugin.js';
import fs from "fs";

export default class TTRotationHandler extends BasePlugin {
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
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);
        this.onRoundStart = this.onRoundStart.bind(this)
        this.loadRotation = this.loadRotation.bind(this)
        this.setNextLayerInRotation = this.setNextLayerInRotation.bind(this)
        this.rotation = null;
    }

    async mount() {
        this.server.on('NEW_GAME', this.onRoundStart)
        await new Promise(resolve => setTimeout(resolve, 300))
        this.rotation = await this.loadRotation()
        this.setLayerOnRoundStartInitialState = this.server.setLayerOnRoundStart
        this.server.setLayerOnRoundStart = false
        this.onRoundStart()
    }

    async unmount() {
        this.server.removeEventListener(this.onRoundStart)
    }


    async onRoundStart(info) {
        await new Promise(resolve => setTimeout(resolve, 30 * 1000))
        await this.setNextLayerInRotation()
    }

    async setNextLayerInRotation() {
        // TODO find a way to remove a pick from the rotation if it does not work.
        this.server.setLayerOnRoundStart = false
        const matchHistory = this.server.getMatchHistorySinceSessionStart()
        let nextRotationPick;

        for (const layer of this.rotation) {
            let layerPlayed = false

            const splitLayer = layer.split(" ")
            const layerObject = { layer: splitLayer[0], faction1: splitLayer[1], faction2: splitLayer[2] }

            for (const playedLayer of matchHistory) {
                if (layerObject.layer?.toLowerCase() === playedLayer.layerClassname?.toLowerCase()) {
                    layerPlayed = true;
                    break;
                }
            }

            if (!layerPlayed) {
                nextRotationPick = layer
                await this.server.rcon.setNextLayer(layer)
                await new Promise(resolve => setTimeout(resolve, 5000))
                const nextMap = await this.server.rcon.getNextMap()
                if (!layer.includes(`${nextMap.layer} ${nextMap.factions}`)) {
                    await this.removeInvalidLayer(layer)
                    this.setNextLayerInRotation()
                } else {
                    this.server.nextLayerSet = true
                    // await new Promise(resolve => setTimeout(resolve, 30 * 1000))
                    await this.server.warnAllAdmins(`SquadJS: Auto rotation plugin running, setting next layer in rotation: ${nextRotationPick}`)
                    break
                }
            }
        }


        if (!nextRotationPick) {
            return
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

        const regex = /^\w+\s\w+\+\w+\s\w+\+\w+$/;
        const regex2 = /^\w+_\w+_\w+\s\w+\s\w+$/;

        const tempRotation = data.split(/\r?\n/)
        const rotation = []
        for (let i = 0; i < tempRotation.length; i++) {
            if (regex.test(tempRotation[i]) || regex2.test(tempRotation[i])) {
                rotation.push(tempRotation[i])
            }
        }
        this.verbose(1, 'Loaded rotation:')
        console.log(rotation)
        this.server.setLayerOnRoundStart = false
        return rotation
    }

    async removeInvalidLayer(layer) {
        this.verbose(1, `Removing invalid layer from rotation: ${layer}...`)
        let rotation = await this.loadRotation()
        let newData = []

        for (const line of rotation) {
            if (!line.trim().includes(layer.trim())) {
                newData.push(line)
            } else {
                // console.log('Found a layer to remove.')
                // console.log(layer)
            }
        }

        this.rotation = rotation

        const rotationData = newData.join("\n")
        fs.writeFileSync(this.options.rotationPath, rotationData, 'utf-8')
    }

    // TODO create a function that tests if a rotation works, for example on load?
    // TODO create some sort of functionality that automatically disables the plugin once a rotation has been completed.
}
