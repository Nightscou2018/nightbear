json = [
    require('./cleaned/2016-11-21.json'),
    require('./cleaned/2016-11-22.json'),
    require('./cleaned/2016-11-23.json'),
    require('./cleaned/2016-11-24.json'),
    require('./cleaned/2016-11-25.json'),
    require('./cleaned/2016-11-26.json'),
    require('./cleaned/2016-11-27.json'),
].reduce((memo, next) => {
    Object.keys(next).forEach(key => {
        if (!memo[key]) memo[key] = [];
        memo[key] = memo[key].concat(next[key]);
    })
    return memo;
}, {})

console.log(JSON.stringify(json, null, 4))
