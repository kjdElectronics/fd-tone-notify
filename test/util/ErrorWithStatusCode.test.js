const { expect } = require('chai');
const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');

describe('ErrorWithStatusCode', function() {
    describe('Constructor', function() {
        it('should create error with default values', function() {
            const error = new ErrorWithStatusCode('Test error');
            
            expect(error).to.be.instanceOf(Error);
            expect(error).to.be.instanceOf(ErrorWithStatusCode);
            expect(error.message).to.equal('Test error');
            expect(error.statusCode).to.equal(500);
            expect(error.userMessage).to.equal('Test error');
            expect(error.name).to.equal('ErrorWithStatusCode');
        });

        it('should create error with custom status code and user message', function() {
            const error = new ErrorWithStatusCode('Internal error', 400, 'User-friendly message');
            
            expect(error.message).to.equal('Internal error');
            expect(error.statusCode).to.equal(400);
            expect(error.userMessage).to.equal('User-friendly message');
        });

        it('should maintain stack trace', function() {
            const error = new ErrorWithStatusCode('Test error');
            expect(error.stack).to.be.a('string');
            expect(error.stack).to.include('ErrorWithStatusCode.test.js');
        });
    });

    describe('Static factory methods', function() {
        describe('validation', function() {
            it('should create validation error', function() {
                const error = ErrorWithStatusCode.validation('Invalid input');
                
                expect(error.statusCode).to.equal(400);
                expect(error.message).to.equal('Invalid input');
                expect(error.userMessage).to.equal('Invalid input');
            });

            it('should create validation error with custom user message', function() {
                const error = ErrorWithStatusCode.validation('Field validation failed', 'Please check your input');
                
                expect(error.statusCode).to.equal(400);
                expect(error.message).to.equal('Field validation failed');
                expect(error.userMessage).to.equal('Please check your input');
            });
        });

        describe('notFound', function() {
            it('should create not found error', function() {
                const error = ErrorWithStatusCode.notFound('Resource not found');
                
                expect(error.statusCode).to.equal(404);
                expect(error.message).to.equal('Resource not found');
                expect(error.userMessage).to.equal('Resource not found');
            });

            it('should create not found error with default user message', function() {
                const error = ErrorWithStatusCode.notFound('User ID 123 not found', null);
                
                expect(error.statusCode).to.equal(404);
                expect(error.message).to.equal('User ID 123 not found');
                expect(error.userMessage).to.equal('Resource not found');
            });
        });

        describe('internal', function() {
            it('should create internal server error', function() {
                const error = ErrorWithStatusCode.internal('Database connection failed');
                
                expect(error.statusCode).to.equal(500);
                expect(error.message).to.equal('Database connection failed');
                expect(error.userMessage).to.equal('Internal server error');
            });

            it('should create internal server error with custom user message', function() {
                const error = ErrorWithStatusCode.internal('Database failed', 'Service temporarily unavailable');
                
                expect(error.statusCode).to.equal(500);
                expect(error.message).to.equal('Database failed');
                expect(error.userMessage).to.equal('Service temporarily unavailable');
            });
        });

        describe('unauthorized', function() {
            it('should create unauthorized error', function() {
                const error = ErrorWithStatusCode.unauthorized('Invalid token');
                
                expect(error.statusCode).to.equal(401);
                expect(error.message).to.equal('Invalid token');
                expect(error.userMessage).to.equal('Unauthorized');
            });
        });

        describe('forbidden', function() {
            it('should create forbidden error', function() {
                const error = ErrorWithStatusCode.forbidden('Access denied');
                
                expect(error.statusCode).to.equal(403);
                expect(error.message).to.equal('Access denied');
                expect(error.userMessage).to.equal('Forbidden');
            });
        });
    });
});