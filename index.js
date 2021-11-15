const {InfluxDB} = require('influx')
const influx = new InfluxDB({
 host: 'influxdb',
 database: 'default'
})
const delay = require('delay')
const powers = [1, 2, 3, 4, 5, 6, 7, 8]
const expectedTemperature = 19
const regulateInterval = 1000 * 5 * 60
const awaitOnInterval = 1000 * 60

class Room {
    async getCurrentTemperature() {
        // influx.query(`
        //     select * from response_times
        //     where host = $<host>
        //     order by time desc
        //     limit 10
        //   `)
        const currentTemperature = 14 + Math.round(Math.random() * 10)

        console.log('[ROOM] Temperature is ' + currentTemperature)
        return currentTemperature

        if (!temp) {
            throw new Error('Invalid temp')
        }
    }
}

class Stove {
    constructor() {
        this.power = 3
    }
    async start() {
        console.log('[STOVE] Start')
    }
    async stop() {
        console.log('[STOVE] Stop')
    }
    async setPower(power) {
        this.power = power
        console.log('[STOVE] Set power ' + power)
    }
    async getSummary() {
        return {
            humanStatus: 'running',
            power: this.power,
            mode: 'power'
        }
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

        console.log('[CONTROLLER] Putting stove with nominal power')
        await this.stove.setPower(powers[Math.round(powers.length/2)])
        console.log('[CONTROLLER] Awaiting stove to be started')
        await this.waitForRunningStove()
        console.log('[CONTROLLER] Starting temperature regulation')
        await this.regulateTemperature()
    }
    async regulateTemperature() {
        let cleverRegulating = false

        while(true) {
            const currentPower = (await this.stove.getSummary()).power
            const currentPowerIndex = powers.indexOf(currentPower)
            const currentTemperature = await this.room.getCurrentTemperature()

            if (expectedTemperature - currentTemperature > 2) {
                console.log('[CONTROLLER] Very cold : putting stove max power')
                cleverRegulating = false
                await this.stove.setPower(powers[powers.length - 1])
            } else if (currentTemperature - expectedTemperature > 2) {
                console.log('[CONTROLLER] Very hot : putting stove min power')
                cleverRegulating = false
                await this.stove.setPower(powers[0])
            } else {
                if (!cleverRegulating) {
                    console.log('[CONTROLLER] Correct temp ... beginning clever regulating with nominal power')
                    await this.stove.setPower(powers[Math.round(powers.length/2)])
                    cleverRegulating = true
                } else {
                    if (Math.abs(expectedTemperature - currentTemperature) < 0.3) {
                        console.log('[CONTROLLER] Very good temp ... Do nothing')
                    } else if (expectedTemperature > currentTemperature) {
                        if (currentPowerIndex < powers.length) {
                            const newPowerIndex = currentPowerIndex + Math.ceil((powers.length - 1 - currentPowerIndex)/2)
                            console.log('[CONTROLLER] cleverRegulating - putting stove to ' + newPowerIndex)
                            await this.stove.setPower(powers[newPowerIndex])
                        } else {
                            console.log('[CONTROLLER] cleverRegulating - Unable to put higher')
                        }
                    } else {
                        if (currentPowerIndex > 0) {
                            const newPowerIndex = currentPowerIndex - Math.floor(currentPowerIndex/2)
                            console.log('[CONTROLLER] cleverRegulating - putting stove to ' + newPowerIndex)
                            await this.stove.setPower(newPowerIndex)
                        } else {
                            console.log('[CONTROLLER] cleverRegulating - Unable to put lower')
                        }
                    }
                }
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
