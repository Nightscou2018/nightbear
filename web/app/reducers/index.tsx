import { Action } from 'web/app/actions';
import { assertExhausted, assertNumber } from 'web/app/utils/types';
import { isArray } from 'lodash';
import { DB_REPLICATION_BATCH_SIZE } from 'web/app/middleware/database';
import { TimelineModelType, TimelineModel, isTimelineModel } from 'core/models/model';
import { reviveCouchDbRowIntoModel } from 'core/storage/couchDbStorage';

export type ReplicationDirection = 'UP' | 'DOWN';
export type DbStatePart = ReplicationDirection | 'LOCAL';
export type DbState = 'DISABLED' | 'ACTIVE' | 'ONLINE' | 'OFFLINE' | 'ERROR';

export type State = Readonly<{
  config: {
    remoteDbUrl: string;
  };
  dbState: {
    [part in DbStatePart]: {
      state: DbState;
      details: string | [number, number];
    }
  };
  timelineData: {
    range: number;
    rangeEnd: number;
    modelTypes: TimelineModelType[];
    models: TimelineModel[] | 'FETCHING' | 'ERROR';
  };
}>;

export const defaultState: State = {
  config: {
    remoteDbUrl: '',
  },
  dbState: {
    LOCAL: {
      state: 'DISABLED',
      details: '',
    },
    UP: {
      state: 'DISABLED',
      details: '',
    },
    DOWN: {
      state: 'DISABLED',
      details: '',
    },
  },
  timelineData: {
    range: 0,
    rangeEnd: 0,
    modelTypes: ['ParakeetSensorEntry'],
    models: 'FETCHING',
  },
};

export function rootReducer(state: State = defaultState, action: Action): State {
  if (action.type.substr(0, 2) === '@@') return defaultState; // @see https://github.com/reduxjs/redux/issues/186
  switch (action.type) {
    case 'DB_URL_SET':
      return { ...state, config: { ...state.config, remoteDbUrl: action.newDbUrl } };
    case 'DB_EMITTED_READY':
      return updateDbState(state, 'LOCAL', 'ONLINE');
    case 'DB_EMITTED_CHANGE':
      const newModel = reviveCouchDbRowIntoModel(action.change.doc);
      if (!isTimelineModel(newModel) || !state.timelineData.modelTypes.includes(newModel.modelType))
        return state;
      const update = updateDbState(state, 'LOCAL', 'ACTIVE');
      if (isArray(state.timelineData.models)) {
        return {
          ...update,
          timelineData: {
            ...state.timelineData,
            rangeEnd: Date.now(),
            models: [newModel, ...state.timelineData.models],
          },
        };
      } else {
        return update;
      }
    case 'DB_EMITTED_COMPLETE':
      return updateDbState(state, 'LOCAL', 'DISABLED');
    case 'DB_EMITTED_ERROR':
      return updateDbState(state, 'LOCAL', 'ERROR', action.err.message);
    case 'REPLICATION_EMITTED_CHANGE':
      if (action.info.pending) {
        // We know how much replication work is left!
        const total = isArray(state.dbState[action.direction].details)
          ? assertNumber(state.dbState[action.direction].details[1]) // this isn't the first batch, so use the "total" from the previous action
          : action.info.pending + DB_REPLICATION_BATCH_SIZE; // this is the first batch, but since it's finished, the total needs to include the already-finished batch too
        return updateDbState(state, action.direction, 'ACTIVE', [
          Math.min(total - action.info.pending, total),
          total,
        ]);
      } else {
        // We only know the replication is active, but not how much is left
        return updateDbState(state, action.direction, 'ACTIVE');
      }
    case 'REPLICATION_EMITTED_PAUSED':
      return updateDbState(state, action.direction, action.err ? 'OFFLINE' : 'ONLINE');
    case 'REPLICATION_EMITTED_ACTIVE':
      return updateDbState(state, action.direction, 'ACTIVE');
    case 'REPLICATION_EMITTED_DENIED':
      return updateDbState(state, action.direction, 'ERROR', action.err.message);
    case 'REPLICATION_EMITTED_COMPLETE':
      return updateDbState(state, action.direction, 'DISABLED');
    case 'REPLICATION_EMITTED_ERROR':
      return updateDbState(state, action.direction, 'ERROR', action.err.message);
    case 'TIMELINE_DATA_REQUESTED':
      const { range, rangeEnd, modelTypes } = action;
      return {
        ...state,
        timelineData: { ...state.timelineData, range, rangeEnd, modelTypes, models: 'FETCHING' },
      };
    case 'TIMELINE_DATA_RECEIVED':
      const { models } = action;
      return {
        ...state,
        timelineData: { ...state.timelineData, models },
      };
    case 'TIMELINE_DATA_FAILED':
      return {
        ...state,
        timelineData: { ...state.timelineData, models: 'ERROR' },
      };
    default:
      return assertExhausted(action);
  }
}

function updateDbState(
  state: State,
  part: DbStatePart,
  newState: DbState,
  details: State['dbState'][DbStatePart]['details'] = '',
): State {
  return {
    ...state,
    dbState: {
      ...state.dbState,
      [part]: { ...state.dbState[part], state: newState, details },
    },
  };
}

export function getSummaryDbState(states: DbState[]): DbState {
  if (states.some(s => s === 'ERROR')) return 'ERROR';
  if (states.some(s => s === 'DISABLED')) return 'DISABLED';
  if (states.some(s => s === 'OFFLINE')) return 'OFFLINE';
  if (states.some(s => s === 'ACTIVE')) return 'ACTIVE';
  return 'ONLINE';
}

export function getSummaryReplicationProgress(
  parts: Array<State['dbState'][DbStatePart]>,
): number | null {
  const tally = (index: 0 | 1) =>
    parts.reduce(
      (memo, next) => memo + ((isArray(next.details) && assertNumber(next.details[index])) || 0),
      0,
    );
  const done = tally(0);
  const todo = tally(1);
  if (todo > 0) return Math.round((100 * done) / todo);
  return null;
}