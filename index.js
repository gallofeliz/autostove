const {InfluxDB} = require('influx')
const delay = require('delay')
const got = require('got')
const influx = new InfluxDB({
 host: 'influxdb',
 database: 'mydb'
})
const powers = [1, 2, 3, 4, 5, 6, 7, 8]
const expectedTemperature = 17
const regulateInterval = 1000 * 5 * 60
const awaitOnInterval = 1000 * 60
const stoveUrl = 'http://ecoforest-api'

class Room {
    async getCurrentTemperature() {
        const result = await influx.query(`
            SELECT last("temperature") FROM "home" WHERE time >= now() - 15m GROUP BY "sensor"
        `)

        const temperatures = result.map(r => r.last)

        if (!temperatures.length) {
            throw new Error('Invalid temp')
        }

        const currentTemperature = temperatures.reduce((t, v) => t+v, 0)/temperatures.length

        return currentTemperature
    }
}

class Stove {
    constructor() {
        this.got = got.extend({
            prefixUrl: stoveUrl
        })
    }
    async start() {
        console.log('[STOVE] Start')
        return this.got.put('status', {json: 1})
    }
    async stop() {
        console.log('[STOVE] Stop')
        return this.got.put('status', {json: 0})
    }
    async setPower(power) {
        console.log('[STOVE] Set power ' + power)
        return this.got.put('power', {json: power})
    }
    async getSummary() {
        return this.got.get('summary').json()
    }
    async setConvector(mode) {
        return this.got.put('convector', {json: mode})
    }
}

class Controller {
    constructor(stove, room) {
       this.stove = stove
       this.room = room
    }
    async start() {
        const summary = await this.stove.getSummary()

        if (!['running', 'stopped', 'starting'].includes(summary.humanStatus)) {
            throw new Error('Unhandled status ' + summary.humanStatus)
        }

        if (summary.mode !== 'power') {
            throw new Error('Unhandled mode ' + summary.mode)
        }

        if (summary.humanStatus === 'stopped') {
            console.log('[CONTROLLER] Starting stove')
            await this.stove.start()
        }

        try {
            if (summary.humanStatus !== 'running') {
                console.log('[CONTROLLER] Putting stove with nominal power')
                await this.stove.setPower(powers[Math.round(powers.length/2)])
                console.log('[CONTROLLER] Awaiting stove to be started')
                await this.waitForRunningStove()
            }
            console.log('[CONTROLLER] Starting temperature regulation')
            await this.regulateTemperature()
        } catch (e) {
            console.error(e)
            await this.stove.stop()
        }
    }
    async regulateTemperature() {
        let lastConvector

        // Other idea : Begin with extremes, and decreases 2 by 2 or 1 by 1 (depends on temp diff ??)
        // On depends on if temp increases or decreases !!
        // ==> Example with expected 19, previous 19.4, current 19.35, it goes down but should NOT !

        while(true) {
            const currentPower = (await this.stove.getSummary()).power
            const currentPowerIndex = powers.indexOf(currentPower)
            const currentTemperature = await this.room.getCurrentTemperature()

            if (currentTemperature > 22) {
                // Galaxy Guardian
                throw new Error('Too hot')
            }

            function higher() {
                const nextStep = Math.ceil((powers.length - 1 - currentPowerIndex) / 2)
                const nextIndex = currentPowerIndex + nextStep
                return powers[nextIndex]
            }

            function lower() {
                const previousIndex = Math.floor(currentPowerIndex / 2)
                return powers[previousIndex]
            }

            const calculatedPower = (() => {
                if (Math.abs(expectedTemperature - currentTemperature) < 0.25) {
                    return currentPower
                }

                return expectedTemperature > currentTemperature
                    ? higher()
                    : lower()
            })()

            const convector = (() => {
                if (powers.indexOf(calculatedPower) === 0) {
                    return 'lowest'
                }
                if (powers.indexOf(calculatedPower) === powers.length - 1) {
                    return 'highest'
                }
                return 'normal'
            })()

            console.log('[CONTROLLER] Regulating : ' + JSON.stringify({
                currentTemperature, currentPower, expectedTemperature, calculatedPower, convector
            }))

            await this.stove.setPower(calculatedPower)

            if (lastConvector !== convector) {
                lastConvector = convector
                this.stove.setConvector(convector)
            }

            await delay(regulateInterval)
        }
    }
    async waitForRunningStove() {
        while ((await this.stove.getSummary()).humanStatus !== 'running') {
            await delay(awaitOnInterval)
        }
    }
}

(new Controller(new Stove, new Room)).start()
