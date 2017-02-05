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
    sensor_age_at_time_of_estimation: '',
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
        getCalibrationParameters
    };

    function getCalibrationParameters(latestEntries) {
        let scale, intercept, slope;

        // calculate parameters somehow :P

        return {
            "device": "nightbear",
            "scale": scale,
            "date": app.currentTime(),
            "type": "cal",
            "intercept": intercept,
            "slope": slope
        };
    }
};

function initialCalibration(bg1, bg2, sensor, latestEntries) {

    let lastTwoEntries = latestEntries.slice(Math.max(latestEntries.length - 2, 1));
    let bgReading1 = lastTwoEntries[0];
    let bgReading2 = lastTwoEntries[1];
    let highBgReading;
    let lowBgReading;
    let higher_bg = Math.max(bg1, bg2);
    let lower_bg = Math.min(bg1, bg2);

    if (bgReading1.unfiltered > bgReading2.unfiltered) {
        highBgReading = bgReading1;
        lowBgReading = bgReading2;
    } else {
        highBgReading = bgReading2;
        lowBgReading = bgReading1;
    }

    let higherCal = createInitialCalibration(higher_bg, sensor, highBgReading);
    let lowerCal = createInitialCalibration(lower_bg, sensor, lowBgReading);

    highBgReading.nb_glucose_value = higher_bg;
    lowBgReading.nb_glucose_value = lower_bg;

    // TODO: SAVE ALL THESE TO DB

    calculate_w_l_s()

}

function createInitialCalibration(meterBg, sensor, parakeetEntry) {
    return {
        timestamp: app.currentTime(),
        slopeConfidence: 0.5,
        checkIn: false, // ???
        sensorConfidence: Math.max(((-0.0018 * meterBg * meterBg) + (0.6657 * meterBg) + 36.7505) / 100, 0),
        slope: 1,
        sensorId: sensor._id,
        bg: meterBg,
        intercept: meterBg,
        rawValue: parakeetEntry.unfiltered,
        rawTimestamp: parakeetEntry.date,
        adjustedRawValue: parakeetEntry.unfiltered, // ???
        estimateRawAtTimeOfCalibration: parakeetEntry.unfiltered, // ???
        sensor_age_at_time_of_estimation: app.currentTime() - sensor.start
    };
}

// Requires: parakeet entry must have age_adjusted_raw_value
function nextCalibration(meterBg, sensor, parakeetEntry, latestEntries) {

    let estimate_raw_at_time_of_calibration;
    let params = findNewRawParameters(latestEntries);
    let estimated_raw_bg = params.ra * app.currentTime() * app.currentTime() + (params.rb * app.currentTime()) + params.rc;
    if (Math.abs(estimated_raw_bg - parakeetEntry.age_adjusted_raw_value) > 20) {
        estimate_raw_at_time_of_calibration = parakeetEntry.age_adjusted_raw_value;
    } else {
        estimate_raw_at_time_of_calibration = estimated_raw_bg;
    }

    createCalibration(meterBg, sensor, parakeetEntry, estimate_raw_at_time_of_calibration);

    // TODO: SAVE ALL THESE TO DB

    calculate_w_l_s()
}

// Requires: meterBg > 40 && meterBg < 400, sensor existing, parakeetEntry during < 15 min
// Parakeet entry should have nb_slope
function createCalibration(meterBg, sensor, parakeetEntry, estimate_raw_at_time_of_calibration) {

    return {
        timestamp: app.currentTime(),
        slopeConfidence: Math.min(Math.max(((4 - Math.abs((parakeetEntry.nb_slope) * 60000)) / 4), 0), 1), // DIFFERENCE
        checkIn: false, // ???
        sensorConfidence: Math.max(((-0.0018 * meterBg * meterBg) + (0.6657 * meterBg) + 36.7505) / 100, 0),
        slope: 1,
        sensorId: sensor._id,
        bg: meterBg,
        intercept: meterBg,
        rawValue: parakeetEntry.unfiltered,
        rawTimestamp: parakeetEntry.date,
        adjustedRawValue: parakeetEntry.unfiltered, // ???
        estimateRawAtTimeOfCalibration: estimate_raw_at_time_of_calibration, // DIFFERENCE
        sensor_age_at_time_of_estimation: app.currentTime() - sensor.start
    };

}

function calculateWeight(calibrations) {
    let firstTimeStarted = _.first(calibrations).sensor_age_at_time_of_estimation;
    let lastTimeStarted = _.last(calibrations).sensor_age_at_time_of_estimation;
    let time_percentage = Math.min(((calibration.sensor_age_at_time_of_estimation - firstTimeStarted) / (lastTimeStarted - firstTimeStarted)) / (.85), 1);
    time_percentage = (time_percentage + .01);
    return Math.max((((((calibration.slope_confidence + calibration.sensor_confidence) * (time_percentage))) / 2) * 100), 1);
}

function slopeOOBHandler(calibrations, status) {
    let calibrations = _.slice(calibrations, 0, -3); // get last three
    const calCount = calibrations.length;
    let lastCal = _.last(calibrations);

    if (status == 0) {
        if (calCount === 3) {
            if ((Math.abs(lastCal.bg - lastCal.estimate_bg_at_time_of_calibration) < 30) && (calibrations[1].possible_bad != null && calibrations[1].possible_bad == true)) {
                return calibrations[1].slope;
            } else {
                return Math.max(((-0.048) * (lastCal.sensor_age_at_time_of_estimation / (60000 * 60 * 24))) + 1.1, DEX_PARAMETERS.DEFAULT_LOW_SLOPE_LOW);
            }
        }
        else if (calCount === 2) {
            return Math.max(((-0.048) * (lastCal.sensor_age_at_time_of_estimation / (60000 * 60 * 24))) + 1.1, DEX_PARAMETERS.DEFAULT_LOW_SLOPE_HIGH);
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

function calculate_w_l_s() {
    let l = 0;
    let m = 0;
    let n = 0;
    let p = 0;
    let q = 0;

    let calibrations = [ {}, {} ]; // TODO: get last 4 days of calibrations
    let calCount = calibrations.length;

    if (calCount == 0) {
        return;
    }

    if (calCount == 1) {
        let calibration = calibrations[0];
        calibrations[0].slope = 1;
        calibrations[0].intercept = calculateIntercept(calibration, false);
        // TODO: save cal back to db
        return;
    }

    _.each(calibrations, calibration => {
        const weight = calculateWeight(calibrations);
        l += (weight);
        m += (weight * calibration.estimate_raw_at_time_of_calibration);
        n += (weight * calibration.estimate_raw_at_time_of_calibration * calibration.estimate_raw_at_time_of_calibration);
        p += (weight * calibration.bg);
        q += (weight * calibration.estimate_raw_at_time_of_calibration * calibration.bg);
    });

    let lastCalibration = _.last(calibrations);
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
        // TODO: SAVE TO DB
    }

    if ((calCount === 2 && lastCalibration.slope > DEX_PARAMETERS.HIGH_SLOPE_1) || (lastCalibration.slope > DEX_PARAMETERS.HIGH_SLOPE_2)) {
        lastCalibration.slope = slopeOOBHandler(calibrations, 1);
        if (calCount > 2) {
            lastCalibration.possible_bad = true; // TODO: WHY?
        }
        lastCalibration.intercept = calculateIntercept(lastCalibration, true);
        // TODO: SAVE TO DB
    }

    if ((lastCalibration.slope === 0) && (lastCalibration.intercept === 0)) {
        lastCalibration.slope_confidence = 0;
        lastCalibration.sensor_confidence = 0;
        // TODO: SAVE TO DB
    }
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
        let latest_entry = entries[0]; // TODO: THIS SHOULD BE LATEST WITH EVEN OTHER SENSOR

        return {
            ra: 0,
            rb: 0,
            rc: latest_entry ? latest_entry.age_adjusted_raw_value : 105
        };
    }
}
