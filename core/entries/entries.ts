import { Context } from 'core/models/api';
import { SensorEntry, TimelineModel } from 'core/models/model';
import { sortBy, unionBy } from 'lodash';
import { calculateAverageBg, changeBloodGlucoseUnitToMmoll, MIN_IN_MS } from 'core/calculations/calculations';

export function getMergedEntriesFeed(
  context: Context,
  range: number,
  rangeEnd: number): Promise<SensorEntry[]> {

  return Promise.all([
    context.storage.loadTimelineModels('DexcomSensorEntry', range, rangeEnd),
    context.storage.loadTimelineModels('DexcomRawSensorEntry', range, rangeEnd),
    context.storage.loadTimelineModels('ParakeetSensorEntry', range, rangeEnd),
    context.storage.loadTimelineModels('MeterEntry', range, rangeEnd),
  ])
    .then(([dexcomSensorEntries, dexcomRawSensorEntries, parakeetSensorEntries, meterEntries ]) => {
      return sortBy(unionBy(
        dexcomSensorEntries as TimelineModel[],
        dexcomRawSensorEntries as TimelineModel[],
        parakeetSensorEntries as TimelineModel[],
        meterEntries as TimelineModel[],
        (entry) => {
          return Math.round(entry.timestamp / (5 * MIN_IN_MS));
        }), 'timestamp') as SensorEntry[];
    });
}

export function getModeratedEntriesFeed(
  context: Context,
  range: number,
  rangeEnd: number): Promise<SensorEntry[]> {

  return getMergedEntriesFeed(context, range, rangeEnd)
    .then((entries) => {
      const average = changeBloodGlucoseUnitToMmoll(calculateAverageBg(entries));
      console.log(average);
      return entries.map((entry) => {
        if (entry.bloodGlucose) {
          let newBg = entry.bloodGlucose;
          if (entry.bloodGlucose < (average - 3)) {
            newBg += 1;
          }
          else if (entry.bloodGlucose > (average + 6)) {
            newBg -= 2;
          }
          else if (entry.bloodGlucose > (average + 5)) {
            newBg -= 1;
          }
          return Object.assign(entry, { bloodGlucose: newBg });
        }
        return entry;
    });
  });
}
