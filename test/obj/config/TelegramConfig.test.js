const { expect } = require('chai');
const { TelegramConfig } = require('../../../obj/config/TelegramConfig');
const { ErrorWithStatusCode } = require('../../../util/ErrorWithStatusCode');

describe('TelegramConfig', function() {
    describe('Constructor', function() {
        it('should create a valid TelegramConfig with a string chatId', function() {
            const config = new TelegramConfig({
                title: 'Engine 1',
                body: 'Tone detected',
                chatId: '-1001234567890'
            });

            expect(config.title).to.equal('Engine 1');
            expect(config.body).to.equal('Tone detected');
            expect(config.chatId).to.equal('-1001234567890');
        });

        it('should accept a numeric chatId', function() {
            const config = new TelegramConfig({
                title: 'Engine 1',
                body: 'Tone detected',
                chatId: 123456789
            });

            expect(config.chatId).to.equal(123456789);
        });

        it('should accept an @channelusername chatId', function() {
            const config = new TelegramConfig({
                title: 'Engine 1',
                body: 'Tone detected',
                chatId: '@my_dispatch_channel'
            });

            expect(config.chatId).to.equal('@my_dispatch_channel');
        });

        it('should throw error for missing title', function() {
            expect(() => new TelegramConfig({ body: 'Tone detected', chatId: '123' }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for missing body', function() {
            expect(() => new TelegramConfig({ title: 'Engine 1', chatId: '123' }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for missing chatId', function() {
            expect(() => new TelegramConfig({ title: 'Engine 1', body: 'Tone detected' }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for a chatId that is neither string nor number', function() {
            expect(() => new TelegramConfig({ title: 'Engine 1', body: 'Tone detected', chatId: {} }))
                .to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });
    });

    describe('toJSON', function() {
        it('should convert to a plain object', function() {
            const config = new TelegramConfig({ title: 'Engine 1', body: 'Tone detected', chatId: '-1001234567890' });
            const obj = config.toJSON();

            expect(obj).to.deep.equal({ title: 'Engine 1', body: 'Tone detected', chatId: '-1001234567890' });
        });
    });
});
