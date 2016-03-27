import * as helpers from './helpers';
import * as analyser from './analyser';
import _ from 'lodash';

export const ALARM_SNOOZE_TIMES = {
    [analyser.STATUS_OUTDATED]: 120,
    [analyser.STATUS_HIGH]: 90,
    [analyser.STATUS_PERSISTENT_HIGH]: 90,
    [analyser.STATUS_LOW]: 15,
    [analyser.STATUS_RISING]: 20,
    [analyser.STATUS_FALLING]: 10,
    [analyser.STATUS_BATTERY]: 60
};

export const ALARM_LEVEL_UP_TIMES = {
    [analyser.STATUS_OUTDATED]: [ 10, 20, 20],
    [analyser.STATUS_HIGH]: [ 10, 20, 20],
    [analyser.STATUS_PERSISTENT_HIGH]: [ 10, 20, 20],
    [analyser.STATUS_LOW]: [ 6, 7, 10],
    [analyser.STATUS_RISING]: [ 8, 15, 15],
    [analyser.STATUS_FALLING]: [ 6, 7, 10],
    [analyser.STATUS_BATTERY]: [ 10, 20, 20]
};

let nextCheck;

export default app => {

    const log = app.logger(__filename);

    return {
        runChecks
    };

    function runChecks() {
        log('Running checks');

        // Clear previous timer (if exists) and set next one
        if (nextCheck) { clearTimeout(nextCheck); }
        nextCheck = setTimeout(runChecks, 6 * helpers.MIN_IN_MS);

        return app.data.getTimelineContent()
            .then(doChecks)
            .catch(err => log.error('Checks failed with error:', err));
    }

    function doChecks(timelineContent) {
        log('Active alarms:', timelineContent.activeAlarms);

        let operations = [];

        // Analyse current status
        const state = app.analyser.analyseData(timelineContent);

        const alarmsToRemove = _.filter(timelineContent.activeAlarms, function(alarm) {
            return !state[alarm.type];
        });

        const alarmsToKeep = _.filter(timelineContent.activeAlarms, function(alarm) {
            return state[alarm.type];
        });

        const alarmsToCreate = _.compact(_.map(state, function(value, key) {
            if (!value) return;
            if (_.findWhere(alarmsToKeep, { type: key })) return;
            return key;
        }));

        _.each(alarmsToRemove, function(alarm) {
            alarm.status = 'inactive';
            operations.push(app.data.updateAlarm(alarm));
        });

        _.each(alarmsToKeep, function(alarm) {

            if (app.currentTime() <= alarm.validAfter) {
                return;
            }

            const hasBeenValidFor = (app.currentTime() - alarm.validAfter) / helpers.MIN_IN_MS;
            const levelUpTimes = ALARM_LEVEL_UP_TIMES[alarm.type];
            const accumulatedTimes = _.map(levelUpTimes, (x, i) => _.sum(_.take(levelUpTimes, i + 1)));
            const neededLevel = _.findIndex(accumulatedTimes, minutes => minutes > hasBeenValidFor) + 1 || levelUpTimes.length + 1;

            if (neededLevel !== alarm.level) {
                log('Level-upping alarm from ' + alarm.level + ' to ' + neededLevel);
                alarm.level = neededLevel;
                operations.push(
                    sendAlarm(alarm.level, alarm.type) // send out the alarm
                        .then(receipt => { // and only persist the level upgrade IF the alarm got sent (so we get retries)
                            alarm.pushoverReceipts = alarm.pushoverReceipts || [];
                            alarm.pushoverReceipts.push(receipt);
                            return app.data.updateAlarm(alarm);
                        })
                        .catch(err => log.error('Sending alarm failed:', err))
                );
            }

        });

        _.each(alarmsToCreate, function(alarmType) {
            log('Create new alarm with status:', alarmType);
            operations.push(app.data.createAlarm(alarmType, 1)); // Initial alarm level
        });

        return Promise.all(operations);
    }

    function sendAlarm(level, type) {
        let msg = {
            message: type,
            title: "NightBear alert",
            sound: 'persistent',
            device: process.env['PUSHOVER_LEVEL_1'],
            priority: 2,
            retry: app.analyser.getProfile().ALARM_RETRY,
            expire: app.analyser.getProfile().ALARM_EXPIRE,
            callback: 'http://nightbear.jrw.fi/api/v1/status'
        };

        if (level === 2) {
            msg.device = process.env['PUSHOVER_LEVEL_1'];
        }
        else if (level === 3) {
            msg.device = process.env['PUSHOVER_LEVEL_2'];
        }
        else if (level === 4) {
            msg.device = process.env['PUSHOVER_LEVEL_3'];
        }

        return new Promise(function (resolve, reject) {
            app.pushover.send(msg, function(err, result) {
                if (err) {
                    return reject(err);
                }

                let resultJSON = JSON.parse(result);
                let receipt = resultJSON.receipt;

                log('Pushover sent with receipt nro:', receipt);
                resolve(receipt);
            });
        });
    }
}
