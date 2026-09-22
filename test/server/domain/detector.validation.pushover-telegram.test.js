/**
 * validateDetector()'s handling of pushover/telegram notification configs
 * (objective 6), mirroring the existing pushbullet validation coverage.
 */
const { expect } = require('chai');
const {
    validateDetector,
    validatePushoverNotification,
    validateTelegramNotification
} = require('../../../server/domain/detector.validation');

const baseDetector = { name: 'Test Detector', tones: [850, 950] };

describe('validatePushoverNotification', function() {
    it('accepts a valid pushover config', function() {
        const errors = validatePushoverNotification({ title: 'T', body: 'B', user: 'u1' }, 'preRecording', 0);
        expect(errors).to.be.empty;
    });

    it('rejects a non-object config', function() {
        const errors = validatePushoverNotification('not an object', 'preRecording', 0);
        expect(errors).to.not.be.empty;
    });

    it('rejects a non-string user', function() {
        const errors = validatePushoverNotification({ title: 'T', body: 'B', user: 42 }, 'preRecording', 0);
        expect(errors).to.not.be.empty;
    });

    it('rejects a non-string title/body when present', function() {
        expect(validatePushoverNotification({ title: 42, body: 'B', user: 'u1' }, 'preRecording', 0)).to.not.be.empty;
        expect(validatePushoverNotification({ title: 'T', body: 42, user: 'u1' }, 'preRecording', 0)).to.not.be.empty;
    });
});

describe('validateTelegramNotification', function() {
    it('accepts a valid telegram config with a string chatId', function() {
        const errors = validateTelegramNotification({ title: 'T', body: 'B', chatId: '123' }, 'preRecording', 0);
        expect(errors).to.be.empty;
    });

    it('accepts a valid telegram config with a numeric chatId', function() {
        const errors = validateTelegramNotification({ title: 'T', body: 'B', chatId: 123 }, 'preRecording', 0);
        expect(errors).to.be.empty;
    });

    it('rejects a non-object config', function() {
        const errors = validateTelegramNotification('not an object', 'preRecording', 0);
        expect(errors).to.not.be.empty;
    });

    it('rejects a chatId that is neither string nor number', function() {
        const errors = validateTelegramNotification({ title: 'T', body: 'B', chatId: {} }, 'preRecording', 0);
        expect(errors).to.not.be.empty;
    });
});

describe('validateDetector - pushover/telegram wiring', function() {
    it('surfaces pushover notification errors', function() {
        const errors = validateDetector({
            ...baseDetector,
            notifications: { preRecording: { pushover: [{ title: 'T', body: 'B', user: 42 }] } }
        });
        expect(errors).to.not.be.empty;
    });

    it('surfaces telegram notification errors', function() {
        const errors = validateDetector({
            ...baseDetector,
            notifications: { preRecording: { telegram: [{ title: 'T', body: 'B', chatId: {} }] } }
        });
        expect(errors).to.not.be.empty;
    });

    it('accepts valid pushover/telegram notifications', function() {
        const errors = validateDetector({
            ...baseDetector,
            notifications: {
                preRecording: {
                    pushover: [{ title: 'T', body: 'B', user: 'u1' }],
                    telegram: [{ title: 'T', body: 'B', chatId: '123' }]
                }
            }
        });
        expect(errors).to.be.empty;
    });
});
