/** These calculations have been adapted from https://github.com/jamorham/xDrip-plus  **/

import _ from 'lodash';
import * as helpers from './helpers';

const DEX_PARAMETERS = {
    LOW_SLOPE_1: 0.95,
    LOW_SLOPE_2: 0.85,
    HIGH_SLOPE_1: 1.3,
    HIGH_SLOPE_2: 1.4,
    DEFAULT_LOW_SLOPE_LOW: 1.08,
    DEFAULT_LOW_SLOPE_HIGH: 1.15,
    DEFAULT_SLOPE: 1,
    DEFAULT_HIGH_SLOPE_HIGH: 1.3,
    DEFAULT_HIGH_SLOPE_LOW: 1.2
};

let calibration = {
    timestamp: '',
    sensor_age_at_calibration: '',
    sensor: '',
    bg: '',
    raw_value: '',
    adjusted_raw_value: '',
    sensor_confidence: '',
    slope_confidence: '',
    raw_timestamp: '',
    slope: '',
    intercept: '',
    distance_from_estimate: '', // REMOVED
    estimate_raw_at_time_of_calibration: '',
    estimate_bg_at_time_of_calibration: '',
    uuid: '', // REMOVED
    sensor_uuid: '', // REMOVED
    possible_bad: '', // REMOVED
    check_in: '', // REMOVED
    first_decay: '', // REMOVED
    second_decay: '', // REMOVED
    first_slope: '', // REMOVED
    second_slope: '', // REMOVED
    first_intercept: '', // REMOVED
    second_intercept: '', // REMOVED
    first_scale: '', // REMOVED
    second_scale: '' // REMOVED
};

export default app => {

    const log = app.logger(__filename);

    return {
        generateCalibration
    };

    // meterBg in mgdl, latestEntries 30min latestCalibrations 4days
    function generateCalibration(meterBg, sensor, latestEntries, latestCalibrations) {
        let correspondingParakeetEntry = _.last(latestEntries);
        let currentTime = app.currentTime();

        // TODO: check that parakeetEntry during < 15 min
        if (!correspondingParakeetEntry) {
            log("ERROR: Could not calibrate because there were no new enough raw entries");
            return;
        }

        if (meterBg < 40 || meterBg > 400) {
            log("ERROR: Could not calibrate because meter bg is out of range (40 - 400)");
            return;
        }

        return nextCalibration(meterBg, correspondingParakeetEntry, sensor, latestEntries, latestCalibrations, currentTime)
    }
};

// Requires: parakeet entry must have age_adjusted_raw_value and latestCals should be 4 days
function nextCalibration(meterBg, correspondingParakeetEntry, sensor, latestEntries, latestCalibrations, currentTime) {

    let estimateRawAtCalibration;
    let params = findNewRawParameters(latestEntries);
    let estimated_raw_bg = params.ra * currentTime * currentTime + (params.rb * currentTime) + params.rc;
    if (Math.abs(estimated_raw_bg - correspondingParakeetEntry.age_adjusted_raw_value) > 20) {
        estimateRawAtCalibration = correspondingParakeetEntry.age_adjusted_raw_value;
    } else {
        estimateRawAtCalibration = estimated_raw_bg;
    }

    let newCal = createCalibration(meterBg, sensor, correspondingParakeetEntry, estimateRawAtCalibration, currentTime);

    latestCalibrations.push(newCal);

    return calculate_w_l_s(latestCalibrations)
}

// Parakeet entry should have nb_slope
function createCalibration(meterBg, sensor, parakeetEntry, estimateRawAtCalibration, currentTime) {

    return {
        timestamp: currentTime,
        slope_confidence: Math.min(Math.max(((4 - Math.abs((parakeetEntry.nb_slope) * 60000)) / 4), 0), 1),
        sensor_confidence: Math.max(((-0.0018 * meterBg * meterBg) + (0.6657 * meterBg) + 36.7505) / 100, 0),
        slope: 1,
        sensorId: sensor._id,
        bg: meterBg,
        intercept: meterBg,
        scale: 1,
        raw_value: parakeetEntry.unfiltered,
        raw_timestamp: parakeetEntry.date,
        adjusted_raw_value: parakeetEntry.age_adjusted_raw_value,
        estimate_raw_at_calibration: estimateRawAtCalibration,
        sensor_age_at_calibration: currentTime - sensor.start
    };

}

function calculateWeight(calibrations) {
    let firstTimeStarted = _.first(calibrations).sensor_age_at_calibration;
    let lastTimeStarted = _.last(calibrations).sensor_age_at_calibration;
    let time_percentage = Math.min(((calibration.sensor_age_at_calibration - firstTimeStarted) / (lastTimeStarted - firstTimeStarted)) / (.85), 1);
    time_percentage = (time_percentage + .01);
    return Math.max((((((calibration.slope_confidence + calibration.sensor_confidence) * (time_percentage))) / 2) * 100), 1);
}

function slopeOOBHandler(calibrations, status) {
    calibrations = _.slice(calibrations, 0, -3); // get last three
    const calCount = calibrations.length;
    let lastCal = _.last(calibrations);

    if (status == 0) {
        if (calCount === 3) {
            if ((Math.abs(lastCal.bg - lastCal.estimate_bg_at_time_of_calibration) < 30) && (calibrations[1].possible_bad != null && calibrations[1].possible_bad == true)) {
                return calibrations[1].slope;
            } else {
                return Math.max(((-0.048) * (lastCal.sensor_age_at_calibration / (60000 * 60 * 24))) + 1.1, DEX_PARAMETERS.DEFAULT_LOW_SLOPE_LOW);
            }
        }
        else if (calCount === 2) {
            return Math.max(((-0.048) * (lastCal.sensor_age_at_calibration / (60000 * 60 * 24))) + 1.1, DEX_PARAMETERS.DEFAULT_LOW_SLOPE_HIGH);
        }
        else {
            return DEX_PARAMETERS.DEFAULT_SLOPE;
        }
    }
    else {
        if (calCount === 3) {
            if ((Math.abs(lastCal.bg - lastCal.estimate_bg_at_time_of_calibration) < 30) && (calibrations[1].possible_bad != null && calibrations[1].possible_bad == true)) {
                return calibrations[1].slope;
            } else {
                return DEX_PARAMETERS.DEFAULT_HIGH_SLOPE_HIGH;
            }
        }
        else if (calCount === 2) {
            return DEX_PARAMETERS.DEFAULT_HIGH_SLOPE_LOW;
        }
        else {
            return DEX_PARAMETERS.DEFAULT_SLOPE;
        }
    }
}

function calculateIntercept(cal, useEstimate) {
    let raw = useEstimate ? cal.estimate_raw_at_time_of_calibration : cal.raw_value;
    return cal.bg - (raw * cal.slope);
}

// Requires 4 days of calibrations
function calculate_w_l_s(calibrations) {
    let l = 0;
    let m = 0;
    let n = 0;
    let p = 0;
    let q = 0;

    let calCount = calibrations.length;

    if (calCount == 0) {
        return;
    }

    let lastCalibration = _.last(calibrations);

    if (calCount == 1) {
        lastCalibration.slope = 1;
        lastCalibration.intercept = calculateIntercept(calibration, false);
        return lastCalibration;
    }

    _.each(calibrations, calibration => {
        const weight = calculateWeight(calibrations);
        l += (weight);
        m += (weight * calibration.estimate_raw_at_time_of_calibration);
        n += (weight * calibration.estimate_raw_at_time_of_calibration * calibration.estimate_raw_at_time_of_calibration);
        p += (weight * calibration.bg);
        q += (weight * calibration.estimate_raw_at_time_of_calibration * calibration.bg);
    });

    const weight = (calculateWeight(calibrations) * (calCount * 0.14));
    l += (weight);
    m += (weight * lastCalibration.estimate_raw_at_time_of_calibration);
    n += (weight * lastCalibration.estimate_raw_at_time_of_calibration * lastCalibration.estimate_raw_at_time_of_calibration);
    p += (weight * lastCalibration.bg);
    q += (weight * lastCalibration.estimate_raw_at_time_of_calibration * lastCalibration.bg);

    let d = (l * n) - (m * m);
    lastCalibration.intercept = ((n * p) - (m * q)) / d;
    lastCalibration.slope = ((l * q) - (m * p)) / d;

    if ((calCount === 2 && lastCalibration.slope < DEX_PARAMETERS.LOW_SLOPE_1) || (lastCalibration.slope < DEX_PARAMETERS.LOW_SLOPE_2)) {
        lastCalibration.slope = slopeOOBHandler(calibrations, 0);
        if (calCount > 2) {
            lastCalibration.possible_bad = true; // TODO: WHY?
        }
        lastCalibration.intercept = calculateIntercept(lastCalibration, true);
    }

    if ((calCount === 2 && lastCalibration.slope > DEX_PARAMETERS.HIGH_SLOPE_1) || (lastCalibration.slope > DEX_PARAMETERS.HIGH_SLOPE_2)) {
        lastCalibration.slope = slopeOOBHandler(calibrations, 1);
        if (calCount > 2) {
            lastCalibration.possible_bad = true; // TODO: WHY?
        }
        lastCalibration.intercept = calculateIntercept(lastCalibration, true);
    }

    if ((lastCalibration.slope === 0) && (lastCalibration.intercept === 0)) {
        lastCalibration.slope_confidence = 0;
        lastCalibration.sensor_confidence = 0;
    }

    return lastCalibration;
}


function findNewRawParameters(latestEntries) {

    let entries = _.slice(latestEntries, 0, -3);

    if (entries.length === 3) {
        let latest = entries[0];
        let second_latest = entries[1];
        let third_latest = entries[2];

        let y3 = latest.age_adjusted_raw_value;
        let x3 = latest.date;
        let y2 = second_latest.age_adjusted_raw_value;
        let x2 = second_latest.date;
        let y1 = third_latest.age_adjusted_raw_value;
        let x1 = third_latest.date;

        return {
            ra: y1/((x1-x2)*(x1-x3))+y2/((x2-x1)*(x2-x3))+y3/((x3-x1)*(x3-x2)),
            rb: (-y1*(x2+x3)/((x1-x2)*(x1-x3))-y2*(x1+x3)/((x2-x1)*(x2-x3))-y3*(x1+x2)/((x3-x1)*(x3-x2))),
            rc: (y1*x2*x3/((x1-x2)*(x1-x3))+y2*x1*x3/((x2-x1)*(x2-x3))+y3*x1*x2/((x3-x1)*(x3-x2)))
        };
    }
    else if (entries.length === 2) {
        let latest = entries[0];
        let second_latest = entries[1];

        let y2 = latest.age_adjusted_raw_value;
        let x2 = latest.timestamp;
        let y1 = second_latest.age_adjusted_raw_value;
        let x1 = second_latest.timestamp;

        return {
            rb: y1 === y2 ? 0 : (y2 - y1)/(x2 - x1),
            ra: 0,
            rc:  -1 * ((latest.rb * x1) - y1)
        };
    } else {
        let latest_entry = entries[0];

        return {
            ra: 0,
            rb: 0,
            rc: latest_entry ? latest_entry.age_adjusted_raw_value : 105
        };
    }
}

//function initialCalibration(bg1, bg2, sensor, latestEntries) {
//
//    let lastTwoEntries = latestEntries.slice(Math.max(latestEntries.length - 2, 1));
//    let bgReading1 = lastTwoEntries[0];
//    let bgReading2 = lastTwoEntries[1];
//    let highBgReading;
//    let lowBgReading;
//    let higher_bg = Math.max(bg1, bg2);
//    let lower_bg = Math.min(bg1, bg2);
//
//    if (bgReading1.unfiltered > bgReading2.unfiltered) {
//        highBgReading = bgReading1;
//        lowBgReading = bgReading2;
//    } else {
//        highBgReading = bgReading2;
//        lowBgReading = bgReading1;
//    }
//
//    let higherCal = createInitialCalibration(higher_bg, sensor, highBgReading);
//    let lowerCal = createInitialCalibration(lower_bg, sensor, lowBgReading);
//
//    highBgReading.nb_glucose_value = higher_bg;
//    lowBgReading.nb_glucose_value = lower_bg;
//
//    // TODO: SAVE ALL THESE TO DB
//
//    calculate_w_l_s()
//
//}
//
//function createInitialCalibration(meterBg, sensor, parakeetEntry) {
//    return {
//        timestamp: app.currentTime(),
//        slopeConfidence: 0.5,
//        checkIn: false, // ???
//        sensorConfidence: Math.max(((-0.0018 * meterBg * meterBg) + (0.6657 * meterBg) + 36.7505) / 100, 0),
//        slope: 1,
//        sensorId: sensor._id,
//        bg: meterBg,
//        intercept: meterBg,
//        rawValue: parakeetEntry.unfiltered,
//        rawTimestamp: parakeetEntry.date,
//        adjustedRawValue: parakeetEntry.unfiltered, // ???
//        estimateRawAtTimeOfCalibration: parakeetEntry.unfiltered, // ???
//        sensor_age_at_calibration: app.currentTime() - sensor.start
//    };
//}
