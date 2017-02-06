import PouchDB from 'pouchdb';
import createAppInstance from '../../server/app/';
import Logger from '../../server/utils/Logger';
import * as helpers from '../../server/app/helpers';
import DATA from './week-47.json';
import { sortBy, drop, take } from 'lodash';

PouchDB.plugin(require('pouchdb-adapter-memory'));

const SKIP = 110; // how many DATA points to skip
const TAKE = 10; // how many DATA points to include

let app, input;

main();

function main() {
    app = createTestApp();
    input = take(drop(sortBy(DATA.meter.concat(DATA.parakeet), 'date'), SKIP), TAKE);
    console.log(input);
    runFakeInputs()
        .then(() => app.data.getLatestEntries(helpers.HOUR_IN_MS * 0.5))
        .then(
            x => console.log('SUCCESS:', x),
            e => console.log('ERR:', e.stack)
        );
}

function createTestApp() {
    let fakeCurrentTime = Date.now(); // any time-sensitive tests will likely want to change this
    const dbName = Date.now() + ''; // even though the in-memory DB's get dumped when the test suite exits, DB's with the same name will SHARE data during runtime
    const app = createAppInstance({
        logger: new Logger(false),
        currentTime: () => fakeCurrentTime,
        pouchDB: new PouchDB(dbName, { adapter: 'memory' }),
        pushover: {
            sendAlarm: () => Promise.resolve('FAKE_PUSHOVER_RECEIPT'),
            ackAlarms: () => Promise.resolve()
        },

    });
    app.__test = { // attach some helpful utilities for interacting with the test app we created
        setCurrentTime: newTime => fakeCurrentTime = newTime,
    };
    return app;
}

function getBaseCalibration() {
    return {
        // "device": "dexcom",
        // "scale": 1,
        // "dateString": "Sat Jan 14 20:15:57 EET 2017",
        // "date": input[0].date - 1000 * 60 * 60,
        // "type": "cal",
        // "intercept": 30000,
        // "slope": 890.5885872888931
        timestamp: input[0].date - helpers.HOUR_IN_MS,
        slope_confidence: 1,
        sensor_confidence: 0.9725599999999999,
        slope: 1,
        sensorId: undefined,
        bg: 209,
        intercept: 300,
        scale: 1,
        raw_value: 214592,
        raw_timestamp: input[0].date - helpers.HOUR_IN_MS,
        adjusted_raw_value: 214592,
        estimate_raw_at_calibration: 214592,
        sensor_age_at_calibration: 87335000
    };
}

function runFakeInputs() {
    return input.reduce((memo, next) => {
        return memo.then(() => {
            // console.log('Next input:', next);
            app.__test.setCurrentTime(next.date);
            if (next.value) {
                return inputMeter(next);
            } else {
                return inputParakeet(next);
            }
        });
    }, Promise.resolve());
}

function inputMeter(next) {
    return Promise.all([
        app.data.getLatestEntries(helpers.HOUR_IN_MS * 0.5),
        // app.data.getLatestCalibrations(1000 * 60 * 60 * 24 * 4),
    ]).then(([ entries, calibs ]) => {
        const cal = app.calibrations.generateCalibration(
            next.value,
            { start: input[0].date - helpers.HOUR_IN_MS * 24 }, // 1 day before
            entries,
            [ getBaseCalibration() ]
        );
        console.log('PRODUCED CALIBRATION:', cal);
    });
}

function inputParakeet(next) {
    return app.data.parakeetDataEntry({
        lv: next.unfiltered,
        lf: next.filtered,
        ts: 0,
    });
}
