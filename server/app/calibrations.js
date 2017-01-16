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
    sensor_age_at_time_of_estimation: '', // REMOVED
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

const sensor = {
    sensorId: '239429348',
    start: 2342342342,
    end: 2349234243,
    placement: 'arm'
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

    // calculate_w_l_s()

}

function createInitialCalibration(meterBg, sensor, parakeetEntry) {
    return {
        timestamp: app.currentTime(),
        slopeConfidence: 0.5,
        checkIn: false, // ???
        sensorConfidence: Math.max(((-0.0018 * meterBg * meterBg) + (0.6657 * meterBg) + 36.7505) / 100, 0),
        slope: 1,
        sensorId: sensor.sensorId,
        bg: meterBg,
        intercept: meterBg,
        rawValue: parakeetEntry.unfiltered,
        rawTimestamp: parakeetEntry.date,
        adjustedRawValue: parakeetEntry.unfiltered, // ???
        estimateRawAtTimeOfCalibration: parakeetEntry.unfiltered // ???
    };
}

// Requires: parakeet entry must have age_adjusted_raw_value
function nextCalibration(meterBg, sensor, parakeetEntry) {

    let estimate_raw_at_time_of_calibration;
    let estimated_raw_bg = 160; // TODO (ra * app.currentTime() * app.currentTime()) + (rb * app.currentTime()) + rc;
    if (Math.abs(estimated_raw_bg - parakeetEntry.age_adjusted_raw_value) > 20) {
        estimate_raw_at_time_of_calibration = parakeetEntry.age_adjusted_raw_value;
    } else {
        estimate_raw_at_time_of_calibration = estimated_raw_bg;
    }

    createCalibration(meterBg, sensor, parakeetEntry, estimate_raw_at_time_of_calibration);

    // TODO: SAVE ALL THESE TO DB

    // calculate_w_l_s()
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
        sensorId: sensor.sensorId,
        bg: meterBg,
        intercept: meterBg,
        rawValue: parakeetEntry.unfiltered,
        rawTimestamp: parakeetEntry.date,
        adjustedRawValue: parakeetEntry.unfiltered, // ???
        estimateRawAtTimeOfCalibration: estimate_raw_at_time_of_calibration // DIFFERENCE
    };

}
