const { expect } = require('chai');
const { EmailConfig } = require('../../../obj/config/EmailConfig');
const { ErrorWithStatusCode } = require('../../../util/ErrorWithStatusCode');

describe('EmailConfig', function() {
    describe('Constructor', function() {
        it('should create valid EmailConfig with required fields', function() {
            const config = new EmailConfig({
                to: 'test@example.com',
                subject: 'Test Subject',
                text: 'Test body text'
            });

            expect(config.to).to.equal('test@example.com');
            expect(config.subject).to.equal('Test Subject');
            expect(config.text).to.equal('Test body text');
            expect(config.bcc).to.be.undefined;
        });

        it('should create valid EmailConfig with all fields', function() {
            const config = new EmailConfig({
                to: 'test@example.com,user@domain.com',
                bcc: 'bcc@example.com',
                subject: 'Test Subject',
                text: 'Test body text'
            });

            expect(config.to).to.equal('test@example.com,user@domain.com');
            expect(config.bcc).to.equal('bcc@example.com');
            expect(config.subject).to.equal('Test Subject');
            expect(config.text).to.equal('Test body text');
        });

        it('should throw error for missing to field', function() {
            expect(() => {
                new EmailConfig({
                    subject: 'Test Subject',
                    text: 'Test body text'
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for invalid email in to field', function() {
            expect(() => {
                new EmailConfig({
                    to: 'invalid-email',
                    subject: 'Test Subject',
                    text: 'Test body text'
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for invalid email in bcc field', function() {
            expect(() => {
                new EmailConfig({
                    to: 'test@example.com',
                    bcc: 'invalid-email',
                    subject: 'Test Subject',
                    text: 'Test body text'
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for missing subject', function() {
            expect(() => {
                new EmailConfig({
                    to: 'test@example.com',
                    text: 'Test body text'
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for missing text', function() {
            expect(() => {
                new EmailConfig({
                    to: 'test@example.com',
                    subject: 'Test Subject'
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });
    });


    describe('toJSON', function() {
        it('should convert to plain object', function() {
            const config = new EmailConfig({
                to: 'test@example.com',
                bcc: 'bcc@example.com',
                subject: 'Test Subject',
                text: 'Test body text'
            });

            const obj = config.toJSON();
            expect(obj).to.deep.equal({
                to: 'test@example.com',
                bcc: 'bcc@example.com',
                subject: 'Test Subject',
                text: 'Test body text'
            });
        });

        it('should exclude undefined bcc field', function() {
            const config = new EmailConfig({
                to: 'test@example.com',
                subject: 'Test Subject',
                text: 'Test body text'
            });

            const obj = config.toJSON();
            expect(obj).to.not.have.property('bcc');
        });
    });
});