// Simple coloured console logger

const timestamp = () => new Date().toISOString();

const logger = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m  ${timestamp()}  ${msg}`),
    warn: (msg) => console.warn(`\x1b[33m[WARN]\x1b[0m  ${timestamp()}  ${msg}`),
    error: (msg) => console.error(`\x1b[31m[ERROR]\x1b[0m ${timestamp()}  ${msg}`),
    debug: (msg) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`\x1b[35m[DEBUG]\x1b[0m ${timestamp()}  ${msg}`);
        }
    },
};

module.exports = logger;
