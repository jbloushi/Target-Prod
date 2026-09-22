const jobQueue = require('./jobQueue');
const { initWorkers } = require('./jobWorker');

module.exports = {
    jobQueue,
    initWorkers
};
