const { expect } = require('chai');
const { NotificationActionsConfig } = require('../../../obj/config/NotificationActionsConfig');
const { ErrorWithStatusCode } = require('../../../util/ErrorWithStatusCode');

describe('NotificationActionsConfig', function() {
    describe('Constructor', function() {
        it('should create empty NotificationActionsConfig with no parameters', function() {
            const config = new NotificationActionsConfig();
            
            expect(config.emails).to.be.an('array').that.is.empty;
            expect(config.pushbullet).to.be.an('array').that.is.empty;
            expect(config.webhooks).to.be.an('array').that.is.empty;
            expect(config.externalCommands).to.be.an('array').that.is.empty;
        });

        it('should create NotificationActionsConfig with emails', function() {
            const config = new NotificationActionsConfig({
                emails: [{
                    to: 'test@example.com',
                    subject: 'Test Subject',
                    text: 'Test message'
                }]
            });
            
            expect(config.emails).to.have.length(1);
            expect(config.emails[0].to).to.equal('test@example.com');
            expect(config.pushbullet).to.be.an('array').that.is.empty;
            expect(config.webhooks).to.be.an('array').that.is.empty;
            expect(config.externalCommands).to.be.an('array').that.is.empty;
        });

        it('should create NotificationActionsConfig with pushbullet', function() {
            const config = new NotificationActionsConfig({
                pushbullet: [{
                    title: 'Test Title',
                    body: 'Test body'
                }]
            });
            
            expect(config.pushbullet).to.have.length(1);
            expect(config.pushbullet[0].title).to.equal('Test Title');
            expect(config.emails).to.be.an('array').that.is.empty;
            expect(config.webhooks).to.be.an('array').that.is.empty;
            expect(config.externalCommands).to.be.an('array').that.is.empty;
        });

        it('should create NotificationActionsConfig with webhooks', function() {
            const config = new NotificationActionsConfig({
                webhooks: [{
                    address: 'https://example.com/webhook'
                }]
            });
            
            expect(config.webhooks).to.have.length(1);
            expect(config.webhooks[0].address).to.equal('https://example.com/webhook');
            expect(config.emails).to.be.an('array').that.is.empty;
            expect(config.pushbullet).to.be.an('array').that.is.empty;
            expect(config.externalCommands).to.be.an('array').that.is.empty;
        });

        it('should create NotificationActionsConfig with external commands', function() {
            const config = new NotificationActionsConfig({
                externalCommands: [{
                    command: 'echo "test"'
                }]
            });
            
            expect(config.externalCommands).to.have.length(1);
            expect(config.externalCommands[0].command).to.equal('echo "test"');
            expect(config.emails).to.be.an('array').that.is.empty;
            expect(config.pushbullet).to.be.an('array').that.is.empty;
            expect(config.webhooks).to.be.an('array').that.is.empty;
        });

        it('should create NotificationActionsConfig with all action types', function() {
            const config = new NotificationActionsConfig({
                emails: [{
                    to: 'test@example.com',
                    subject: 'Test Subject',
                    text: 'Test message'
                }],
                pushbullet: [{
                    title: 'Test Title',
                    body: 'Test body'
                }],
                webhooks: [{
                    address: 'https://example.com/webhook'
                }],
                externalCommands: [{
                    command: 'echo "test"'
                }]
            });
            
            expect(config.emails).to.have.length(1);
            expect(config.pushbullet).to.have.length(1);
            expect(config.webhooks).to.have.length(1);
            expect(config.externalCommands).to.have.length(1);
        });

        it('should throw error for non-array emails', function() {
            expect(() => {
                new NotificationActionsConfig({
                    emails: 'not an array'
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for non-array pushbullet', function() {
            expect(() => {
                new NotificationActionsConfig({
                    pushbullet: 'not an array'
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for non-array webhooks', function() {
            expect(() => {
                new NotificationActionsConfig({
                    webhooks: 'not an array'
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for non-array externalCommands', function() {
            expect(() => {
                new NotificationActionsConfig({
                    externalCommands: 'not an array'
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });
    });

    describe('toJSON', function() {
        it('should convert to JSON representation', function() {
            const config = new NotificationActionsConfig({
                emails: [{
                    to: 'test@example.com',
                    subject: 'Test Subject',
                    text: 'Test message'
                }],
                webhooks: [{
                    address: 'https://example.com/webhook'
                }]
            });

            const obj = config.toJSON();
            expect(obj).to.have.property('emails');
            expect(obj).to.have.property('pushbullet');
            expect(obj).to.have.property('webhooks');
            expect(obj).to.have.property('externalCommands');
            expect(obj.emails).to.have.length(1);
            expect(obj.emails[0]).to.have.property('to', 'test@example.com');
            expect(obj.webhooks).to.have.length(1);
            expect(obj.webhooks[0]).to.have.property('address', 'https://example.com/webhook');
        });
    });

    describe('hasActions', function() {
        it('should return false when no actions are configured', function() {
            const config = new NotificationActionsConfig();
            expect(config.hasActions()).to.be.false;
        });

        it('should return true when emails are configured', function() {
            const config = new NotificationActionsConfig({
                emails: [{
                    to: 'test@example.com',
                    subject: 'Test Subject',
                    text: 'Test message'
                }]
            });
            expect(config.hasActions()).to.be.true;
        });

        it('should return true when pushbullet is configured', function() {
            const config = new NotificationActionsConfig({
                pushbullet: [{
                    title: 'Test Title',
                    body: 'Test body'
                }]
            });
            expect(config.hasActions()).to.be.true;
        });

        it('should return true when webhooks are configured', function() {
            const config = new NotificationActionsConfig({
                webhooks: [{
                    address: 'https://example.com/webhook'
                }]
            });
            expect(config.hasActions()).to.be.true;
        });

        it('should return true when external commands are configured', function() {
            const config = new NotificationActionsConfig({
                externalCommands: [{
                    command: 'echo "test"'
                }]
            });
            expect(config.hasActions()).to.be.true;
        });
    });
});