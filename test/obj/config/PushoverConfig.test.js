const { expect } = require('chai');
const { PushoverConfig } = require('../../../obj/config/PushoverConfig');
const { ErrorWithStatusCode } = require('../../../util/ErrorWithStatusCode');

describe('PushoverConfig', function() {
    describe('Constructor', function() {
        it('should create a valid PushoverConfig with required fields', function() {
            const config = new PushoverConfig({
                title: 'Engine 1',
                body: 'Tone detected',
                user: 'u1a2b3c4d5e6f7g8h9'
            });

            expect(config.title).to.equal('Engine 1');
            expect(config.body).to.equal('Tone detected');
            expect(config.user).to.equal('u1a2b3c4d5e6f7g8h9');
            expect(config.priority).to.be.undefined;
            expect(config.sound).to.be.undefined;
        });

        it('should accept optional priority and sound', function() {
            const config = new PushoverConfig({
                title: 'Engine 1',
                body: 'Tone detected',
                user: 'u1a2b3c4d5e6f7g8h9',
                priority: 1,
                sound: 'siren'
            });

            expect(config.priority).to.equal(1);
            expect(config.sound).to.equal('siren');
        });

        it('should throw error for missing title', function() {
            expect(() => new PushoverConfig({ body: 'Tone detected', user: 'u1' }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for missing body', function() {
            expect(() => new PushoverConfig({ title: 'Engine 1', user: 'u1' }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for missing user', function() {
            expect(() => new PushoverConfig({ title: 'Engine 1', body: 'Tone detected' }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for a non-string user', function() {
            expect(() => new PushoverConfig({ title: 'Engine 1', body: 'Tone detected', user: 12345 }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for a priority outside -2..1 (emergency priority 2 needs retry/expire, unsupported)', function() {
            expect(() => new PushoverConfig({ title: 'Engine 1', body: 'Tone detected', user: 'u1', priority: 2 }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
            expect(() => new PushoverConfig({ title: 'Engine 1', body: 'Tone detected', user: 'u1', priority: -3 }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for a non-integer priority', function() {
            expect(() => new PushoverConfig({ title: 'Engine 1', body: 'Tone detected', user: 'u1', priority: 0.5 }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for a non-string sound', function() {
            expect(() => new PushoverConfig({ title: 'Engine 1', body: 'Tone detected', user: 'u1', sound: 42 }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });
    });

    describe('toJSON', function() {
        it('should convert to a plain object, omitting unset optional fields', function() {
            const config = new PushoverConfig({ title: 'Engine 1', body: 'Tone detected', user: 'u1' });
            const obj = config.toJSON();

            expect(obj).to.deep.equal({ title: 'Engine 1', body: 'Tone detected', user: 'u1' });
        });

        it('should include priority/sound when set', function() {
            const config = new PushoverConfig({
                title: 'Engine 1', body: 'Tone detected', user: 'u1', priority: 1, sound: 'siren'
            });
            const obj = config.toJSON();

            expect(obj).to.deep.equal({
                title: 'Engine 1', body: 'Tone detected', user: 'u1', priority: 1, sound: 'siren'
            });
        });
    });
});
