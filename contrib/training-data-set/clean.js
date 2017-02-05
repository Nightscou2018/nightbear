json = require('./orig/2016-11-27.json').rows
    .map(row => (row.key[1] === 'sensor-entries' || row.key[1] === 'meter-entries') && row.doc)
    .filter(x => x)

json = {
    meter: json
        .filter(doc => doc._id.startsWith('meter-entries'))
        .map(doc => ({
            date: doc.date,
            value: doc.mbg,
        })),
    dexcom: json
        .filter(doc => doc._id.startsWith('sensor-entries'))
        .filter(doc => doc.noise < 4 && doc.sgv >= 40) // only include "non-controversial" Dex readings
        .map(doc => ({
            date: doc.date,
            value: doc.sgv,
        })),
    nightbear: json
        .filter(doc => doc._id.startsWith('sensor-entries'))
        .map(doc => ({
            date: doc.date,
            value: convert(doc.nb_glucose_value),
        })),
    parakeet: json
        .filter(doc => doc._id.startsWith('sensor-entries'))
        .filter(doc => doc.noise < 4 && doc.sgv >= 40) // only include "non-controversial" Dex readings
        .map(doc => ({
            date: doc.date,
            filtered: doc.filtered,
            unfiltered: doc.unfiltered,
        })),
}

console.log(JSON.stringify(json, null, 4))

// mmol/L => mg/dL
function convert(mmolPerL) {
    return mmolPerL * 18
}
