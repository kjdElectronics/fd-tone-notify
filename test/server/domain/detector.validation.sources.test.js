/**
 * validateDetector()'s handling of the optional `sources` field (per-source
 * ingest keys, objective 5) - a detector's optional restriction to specific
 * ingest API key ids for Rdio call-upload matching.
 */
const { expect } = require('chai');
const { validateDetector } = require('../../../server/domain/detector.validation');

const baseDetector = { name: 'Test Detector', tones: [850, 950] };

describe('validateDetector - sources field', function() {
    it('accepts a detector with no sources field', function() {
        const errors = validateDetector({ ...baseDetector });
        expect(errors).to.be.empty;
    });

    it('accepts an empty sources array', function() {
        const errors = validateDetector({ ...baseDetector, sources: [] });
        expect(errors).to.be.empty;
    });

    it('accepts a sources array of API key id strings', function() {
        const errors = validateDetector({ ...baseDetector, sources: ['a1b2c3d4e5f60718', 'b2c3d4e5f6071829'] });
        expect(errors).to.be.empty;
    });

    it('rejects a non-array sources value', function() {
        const errors = validateDetector({ ...baseDetector, sources: 'a1b2c3d4e5f60718' });
        expect(errors).to.not.be.empty;
    });

    it('rejects a sources array containing a non-string entry', function() {
        const errors = validateDetector({ ...baseDetector, sources: ['a1b2c3d4e5f60718', 42] });
        expect(errors).to.not.be.empty;
    });
});
