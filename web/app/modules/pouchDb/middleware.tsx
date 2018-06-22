// @see https://github.com/pouchdb/pouchdb/issues/6692
import PouchDBDefault from 'pouchdb';
// tslint:disable-next-line:no-var-requires
const PouchDB = PouchDBDefault || require('pouchdb');

import { Middleware, Dispatch } from 'web/app/utils/redux';
import { debounce } from 'lodash';
import { createCouchDbStorage } from 'core/storage/couchDbStorage';
import { ReplicationDirection } from 'web/app/modules/pouchDb/state';
import { actions } from 'web/app/modules/actions';
import { Storage } from 'core/storage/storage';
import { getModeratedEntriesFeed } from 'core/entries/entries';
import { NO_LOGGING } from 'server/utils/logging';
import { calculateHba1c, DAY_IN_MS } from 'core/calculations/calculations';

const LOCAL_DB_ACTIVE_DEBOUNCE = 100;
export const DB_REPLICATION_BATCH_SIZE = 500;

export const pouchDbMiddleware: Middleware = store => {
  let existingReplication: ReturnType<typeof startReplication> | null;
  return next => action => {
    const oldValue = store.getState().configVars.remoteDbUrl;
    const result = next(action);
    const newValue = store.getState().configVars.remoteDbUrl;
    if (oldValue !== newValue) {
      if (existingReplication) {
        existingReplication.dispose();
        existingReplication = null;
      }
      if (newValue) {
        existingReplication = startReplication(newValue, store.dispatch);
      }
    }
    if (action.type === 'TIMELINE_FILTERS_CHANGED' && existingReplication) {
      existingReplication.storage
        .loadTimelineModels(action.modelTypes[0], action.range, action.rangeEnd)
        .then(
          models => store.dispatch(actions.TIMELINE_DATA_RECEIVED(models)),
          err => store.dispatch(actions.TIMELINE_DATA_FAILED(err)),
        );
    }
    return result;
  };
};

function startReplication(remoteDbUrl: string, dispatch: Dispatch) {
  const isSafari = // https://stackoverflow.com/a/31732310 ;__;
    navigator.vendor &&
    navigator.vendor.indexOf('Apple') > -1 &&
    navigator.userAgent &&
    !navigator.userAgent.match('CriOS');
  const pouchDb7057Workaround = isSafari ? { adapter: 'websql' } : undefined; // https://github.com/pouchdb/pouchdb/issues/7057 ;__;
  const storage = createCouchDbStorage('nightbear_web_ui', pouchDb7057Workaround);
  const localDb = new PouchDB('nightbear_web_ui', pouchDb7057Workaround);
  const remoteDb = new PouchDB(remoteDbUrl);
  // Start replication in both directions:
  const replOptions = {
    live: true,
    retry: true,
    batch_size: DB_REPLICATION_BATCH_SIZE,
  };
  const upReplication = PouchDB.replicate(localDb, remoteDb, {
    ...replOptions,
    checkpoint: 'source',
  });
  const downReplication = PouchDB.replicate(remoteDb, localDb, {
    ...replOptions,
    checkpoint: 'target',
  });
  dispatchFromReplication(upReplication, 'UP', dispatch);
  dispatchFromReplication(downReplication, 'DOWN', dispatch);
  // Start changes feed, but ONLY after replications have finished (otherwise it'll be crazy noisy):
  let changes: PouchDB.Core.Changes<{}> | null = null;
  Promise.all([
    eventToPromise(upReplication, 'paused'),
    eventToPromise(downReplication, 'paused'),
  ]).then(() => {
    changes = localDb.changes({
      live: true,
      since: 'now',
      return_docs: false,
      include_docs: true,
    });
    dispatchFromChanges(changes, dispatch);
  });

  // Temporary calculation
  calculateHba1cValues(storage);

  // Return our DB's & a dispose function:
  return {
    storage,
    dispose() {
      if (changes) changes.cancel();
      upReplication.cancel();
      downReplication.cancel();
    },
  };
}

function eventToPromise(emitter: EventEmitter, event: string): Promise<null> {
  return new Promise(resolve => emitter.once(event, resolve)).then(() => null);
}

function dispatchFromChanges(changeFeed: PouchDB.Core.Changes<{}>, dispatch: Dispatch) {
  const postChangeReady = debounce(
    () => dispatch(actions.DB_EMITTED_READY()),
    LOCAL_DB_ACTIVE_DEBOUNCE,
  );
  dispatch(actions.DB_EMITTED_READY());
  changeFeed
    .on('change', change => {
      dispatch(actions.DB_EMITTED_CHANGE(change));
      postChangeReady();
    })
    .on('complete', info => {
      dispatch(actions.DB_EMITTED_COMPLETE(info));
      postChangeReady.cancel();
    })
    .on('error', err => {
      dispatch(actions.DB_EMITTED_ERROR(err));
      postChangeReady.cancel();
    });
}

function dispatchFromReplication(
  replication: PouchDB.Replication.Replication<{}>,
  direction: ReplicationDirection,
  dispatch: Dispatch,
) {
  replication
    .on('change', info => dispatch(actions.REPLICATION_EMITTED_CHANGE(direction, info)))
    .on('paused', err => dispatch(actions.REPLICATION_EMITTED_PAUSED(direction, err)))
    .on('active', () => dispatch(actions.REPLICATION_EMITTED_ACTIVE(direction)))
    .on('denied', err => dispatch(actions.REPLICATION_EMITTED_DENIED(direction, err)))
    .on('complete', info => dispatch(actions.REPLICATION_EMITTED_COMPLETE(direction, info)))
    .on('error', err => dispatch(actions.REPLICATION_EMITTED_ERROR(direction, err)));
}

function calculateHba1cValues(storage: Storage) {
  const mockContext = {
    httpPort: 80,
    timestamp: () => Date.now(),
    log: NO_LOGGING,
    storage,
  };

  const actualHba1c = [
    { date: new Date('2018-06-22'), value: 5.8 }, // guess
    { date: new Date('2018-06-13'), value: 5.9 },
    { date: new Date('2018-02-21'), value: 6.3 },
    { date: new Date('2017-10-11'), value: 6.8 },
    { date: new Date('2017-02-13'), value: 6.8 },
    { date: new Date('2016-09-26'), value: 6.8 },
    { date: new Date('2016-02-04'), value: 7.4 },
    { date: new Date('2015-10-22'), value: 7.5 },
    { date: new Date('2015-03-27'), value: 7.6 },
    { date: new Date('2014-09-25'), value: 7.5 },
  ];

  const range = 6 * 7 * DAY_IN_MS;

  actualHba1c.forEach((entry) => {
    getModeratedEntriesFeed(mockContext, range, entry.date.getTime())
      .then((entries) => {
        if (entries.length < 1000) {
          console.log('\n');
          console.log('Count TOO LOW:', entries.length);
          return;
        }

        const calculated = calculateHba1c(entries);
        console.log('\n');
        console.log('----- entry start -----');
        console.log('Count: ', entries.length);
        console.log('Actual:', entry.value);
        console.log('Calculated:', calculated);
        console.log('DIFF:', Math.round(100 * (entry.value - calculated)) / 100);
      });
  });
}
