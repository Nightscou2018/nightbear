import { Context } from 'core/models/api';
import { SensorEntry, TimelineModel } from 'core/models/model';
import { sortBy, unionBy } from 'lodash';
import { MIN_IN_MS } from 'core/calculations/calculations';

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
      return entries.map((entry) => {
        if (entry.bloodGlucose && entry.bloodGlucose < 7.7) {
          const newBg = Math.max(4.3, entry.bloodGlucose + 1);
          return Object.assign(entry, { bloodGlucose: newBg });
        }
        return entry;
    });
  });
}
