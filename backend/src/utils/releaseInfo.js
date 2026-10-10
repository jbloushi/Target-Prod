const { execFileSync } = require('child_process');
const { version } = require('../../package.json');

function resolveCommit() {
    const configured = process.env.RELEASE_SHA || process.env.GIT_COMMIT || process.env.COMMIT_SHA;
    if (configured) return String(configured).trim();
    try {
        return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
            cwd: __dirname,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 1000
        }).trim();
    } catch (_) {
        return 'unknown';
    }
}

const releaseInfo = Object.freeze({
    service: 'target-prod-api',
    version,
    commit: resolveCommit(),
    builtAt: process.env.RELEASE_BUILT_AT || null
});

module.exports = releaseInfo;
