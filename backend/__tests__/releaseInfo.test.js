describe('release identity', () => {
    const originalReleaseSha = process.env.RELEASE_SHA;

    afterEach(() => {
        jest.resetModules();
        if (originalReleaseSha === undefined) delete process.env.RELEASE_SHA;
        else process.env.RELEASE_SHA = originalReleaseSha;
    });

    test('prefers the deployment-provided commit SHA', () => {
        process.env.RELEASE_SHA = 'production-commit-123';
        jest.resetModules();
        const releaseInfo = require('../src/utils/releaseInfo');

        expect(releaseInfo).toMatchObject({
            service: 'target-prod-api',
            version: '1.0.0',
            commit: 'production-commit-123'
        });
    });
});
