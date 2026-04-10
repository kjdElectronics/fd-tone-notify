const expect = require('chai').expect;
const { SourceContext } = require('../../obj/SourceContext');

describe('SourceContext', function() {
    describe('Constructor validation', function() {
        it('should throw when source is missing', function() {
            expect(() => new SourceContext({})).to.throw('source');
        });

        it('should throw when source is invalid', function() {
            expect(() => new SourceContext({ source: 'invalid' })).to.throw('source');
        });

        it('should throw when epochBaseSeconds is not a positive number', function() {
            expect(() => new SourceContext({ source: 'rdio', epochBaseSeconds: -1 })).to.throw('epochBaseSeconds');
            expect(() => new SourceContext({ source: 'rdio', epochBaseSeconds: 'abc' })).to.throw('epochBaseSeconds');
        });

        it('should accept valid source values', function() {
            expect(new SourceContext({ source: 'live' }).source).to.equal('live');
            expect(new SourceContext({ source: 'file-upload' }).source).to.equal('file-upload');
            expect(new SourceContext({ source: 'rdio' }).source).to.equal('rdio');
        });

        it('should default talkgroup to null when not provided', function() {
            const ctx = new SourceContext({ source: 'live' });
            expect(ctx.talkgroup).to.be.null;
        });

        it('should default epochBaseSeconds to null when not provided', function() {
            const ctx = new SourceContext({ source: 'live' });
            expect(ctx.epochBaseSeconds).to.be.null;
        });

        it('should parse epochBaseSeconds as a number', function() {
            const ctx = new SourceContext({ source: 'rdio', epochBaseSeconds: '1712754541' });
            expect(ctx.epochBaseSeconds).to.equal(1712754541);
        });
    });

    describe('resolveDetectedAt', function() {
        it('should return current time when no epochBaseSeconds', function() {
            const ctx = SourceContext.live();
            const before = Date.now();
            const result = ctx.resolveDetectedAt();
            const after = Date.now();

            const resultMs = new Date(result).getTime();
            expect(resultMs).to.be.at.least(before);
            expect(resultMs).to.be.at.most(after);
        });

        it('should return ISO string from epochBaseSeconds when provided', function() {
            const epochSeconds = 1712754541; // April 10, 2024
            const ctx = new SourceContext({ source: 'rdio', epochBaseSeconds: epochSeconds });
            const result = ctx.resolveDetectedAt();

            expect(result).to.be.a('string');
            const date = new Date(result);
            expect(date.getFullYear()).to.equal(2024);
            expect(date.getTime()).to.equal(epochSeconds * 1000);
        });
    });

    describe('Factory methods', function() {
        it('live() should create a live source context', function() {
            const ctx = SourceContext.live();
            expect(ctx.source).to.equal('live');
            expect(ctx.epochBaseSeconds).to.be.null;
            expect(ctx.talkgroup).to.be.null;
        });

        it('fileUpload() should create a file-upload source context', function() {
            const ctx = SourceContext.fileUpload();
            expect(ctx.source).to.equal('file-upload');
            expect(ctx.epochBaseSeconds).to.be.null;
            expect(ctx.talkgroup).to.be.null;
        });

        it('fromRdioMetadata() should populate all fields', function() {
            const metadata = {
                dateTime: '1712754541',
                talkgroup: '12345',
                talkgroupLabel: 'Fire Dispatch',
                talkgroupGroup: 'Fire',
                talkgroupTag: 'Dispatch',
                system: '1',
                systemLabel: 'County',
                source: '789',
                frequency: '851250000'
            };

            const ctx = SourceContext.fromRdioMetadata(metadata);
            expect(ctx.source).to.equal('rdio');
            expect(ctx.epochBaseSeconds).to.equal(1712754541);
            expect(ctx.talkgroup).to.deep.equal({
                id: '12345',
                label: 'Fire Dispatch',
                group: 'Fire',
                tag: 'Dispatch',
                system: '1',
                systemLabel: 'County',
                source: '789',
                frequency: '851250000'
            });
        });

        it('fromRdioMetadata() should fall back to Date.now() when dateTime is missing', function() {
            const before = Date.now() / 1000;
            const ctx = SourceContext.fromRdioMetadata({ talkgroupLabel: 'Test' });
            const after = Date.now() / 1000;

            expect(ctx.epochBaseSeconds).to.be.at.least(before);
            expect(ctx.epochBaseSeconds).to.be.at.most(after);
        });

        it('fromRdioMetadata() should handle sparse metadata', function() {
            const ctx = SourceContext.fromRdioMetadata({});
            expect(ctx.source).to.equal('rdio');
            expect(ctx.talkgroup.id).to.be.null;
            expect(ctx.talkgroup.label).to.be.null;
        });
    });

    describe('toJSON', function() {
        it('should return minimal object for live source', function() {
            const json = SourceContext.live().toJSON();
            expect(json).to.deep.equal({ source: 'live' });
        });

        it('should include epochBaseSeconds and talkgroup for rdio source', function() {
            const ctx = new SourceContext({
                source: 'rdio',
                epochBaseSeconds: 1712754541,
                talkgroup: { label: 'Fire' }
            });
            const json = ctx.toJSON();
            expect(json.source).to.equal('rdio');
            expect(json.epochBaseSeconds).to.equal(1712754541);
            expect(json.talkgroup).to.deep.equal({ label: 'Fire' });
        });
    });
});
