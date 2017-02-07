export const MIN_IN_MS = 60 * 1000;
export const HOUR_IN_MS = 60 * MIN_IN_MS;
export const NOISE_LEVEL_LIMIT = 4;
export const DIRECTION_NOT_COMPUTABLE = 'NOT COMPUTABLE'; // when direction not computable, use raw sensor data instead
export const DEFAULT_TREATMENT_TYPE = 'Meal Bolus'; // this is somewhat arbitrary, but "Meal Bolus" is the most applicable of the types available in Nightscout

let rawCalculationRatio = 1; // default to 1 which doesn't do anything, TODO: make this resettable in tests

// Updates the given entry by interpreting RAW data where necessary, and converting units
export function setActualGlucose(entry, latestCalibration) {
    let valueToUse = entry.sgv;
    const rawValue = calculateRaw(entry, latestCalibration);

    if (entry.noise >= NOISE_LEVEL_LIMIT || entry.sgv < 40) {
        valueToUse = rawValue;
    }

    entry.nb_raw_value = changeSGVUnit(rawValue);
    entry.nb_glucose_value = changeSGVUnit(valueToUse);

    return entry;
}

export function setActualGlucoseForParakeet(entry, latestCalibration) {
    return changeSGVUnit(calculateRaw(entry, latestCalibration));
}

// @example isoTimestamp(1448805744000) => "2015-11-29T14:02:24Z"
export function isoTimestamp(timeInMs) {
    return new Date(timeInMs).toISOString().replace(/\..*/, 'Z');
}

export function calculateRaw(dataPoint, calData) {
    let raw = 0;
    const cleaned = cleanValues(dataPoint, calData);

    if (cleaned.slope === 0 || cleaned.unfiltered === 0 || cleaned.scale === 0) {
        raw = 0;
    }
    else if (cleaned.filtered === 0 || (dataPoint.sgv && dataPoint.sgv < 40)) {
        raw = cleaned.scale * (cleaned.unfiltered - cleaned.intercept) / cleaned.slope;
    }
    else {
        if (dataPoint.sgv) {
            rawCalculationRatio = cleaned.scale * (cleaned.filtered - cleaned.intercept) / cleaned.slope / dataPoint.sgv;
        }
        raw = cleaned.scale * (cleaned.unfiltered - cleaned.intercept) / cleaned.slope / rawCalculationRatio;
    }
    return raw;
}

// Converts blood glucose values from mg/dL (used by Dexcom) to mmol/L (used in Europe), and rounds to 1 decimal
// @example changeSGVUnit(68) => 3.8
export function changeSGVUnit(sgv) {
    return Math.round((sgv / 18) * 10) / 10;
}

// Unused parameters:
// rr (cache buster?)
// zi (transmitter id)
// pc (passcode for parakeet)
// bm (?)
// ct (?)
export function convertRawTransmitterData(app, entry, previousEntry, latestCalibration, latestSensor) {
    const date = convertCurrentTimeForParakeet(app, entry.ts); // adapted from parakeet app engine
    return {
        "sensorEntriesRaw": {
            "unfiltered": parseInt(entry.lv, 10),
            "filtered": parseInt(entry.lf, 10),
            "device": "parakeet",
            "type": "raw",
            "date": date,
            "nb_glucose_value": setActualGlucoseForParakeet({
                unfiltered: parseInt(entry.lv, 10),
                filtered: parseInt(entry.lf, 10) },
                latestCalibration),
            "nb_slope": calculateSlope(previousEntry, entry),
            "age_adjusted_raw_value": calculateAgeAdjustedRawValue(parseInt(entry.lv, 10), app.currentTime(), latestSensor)
        },
        "deviceStatusParakeet": {
            "geoLocation": entry.gl,
            "parakeetBattery": entry.bp,
            "transmitterBattery": entry.db,
            "date": date
        }
    };
}

export function calculateSlope(older, newer) {
    if (!older) return 0;
    return ((newer.nb_glucose_value - older.nb_glucose_value) / (newer.date - older.date)) * MIN_IN_MS * 5;
}

function calculateAgeAdjustedRawValue(raw_data, timestamp, sensor){
    const AGE_ADJUSTMENT_FACTOR = 0.45;
    const AGE_ADJUSTMENT_TIME = 86400000 * 1.9;

    let time_since_sensor_started = timestamp - sensor.start;
    const adjust_for = AGE_ADJUSTMENT_TIME - time_since_sensor_started;

    if (adjust_for > 0) {
        return ((AGE_ADJUSTMENT_FACTOR * (adjust_for / AGE_ADJUSTMENT_TIME)) * raw_data) + raw_data;
    } else {
        return raw_data;
    }
}

export function convertCurrentTimeForParakeet(app, timeEntry) {
    return app.currentTime() - parseInt(timeEntry, 10)
}

// TODO, WON'T WORK WITH REGULAR CALIBRATIONS
function cleanValues (entry, cal) {
    return {
        unfiltered: parseInt(entry.unfiltered) || 0,
        filtered: parseInt(entry.filtered) || 0,
        scale: parseFloat(cal.scale) || 0,
        intercept: parseFloat((cal.intercept * -1000) / cal.slope) || 0,
        slope: parseFloat(1000/cal.slope) || 0
    };
}
