import alarms from './alarms';
import analyser from './analyser';
import data from './data';
// import server from './server';
import profile from './profile';
import calibrations from './calibrations';

const modules = {
    logger: null,
    currentTime: null,
    pouchDB: null,
    pushover: null,
    nightscoutProxy: null,
    alarms,
    analyser,
    data,
    // server,
    profile,
    calibrations,
};

export default function(overrides = {}) {
    const app = {};
    const inject = m => app[m] = (overrides[m] || modules[m] && modules[m](app));
    Object.keys(modules).forEach(inject);
    return app;
}
