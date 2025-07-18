const { expect } = require('chai');
const { errorHandler } = require('../../../server/middleware/error.middleware');
const { ErrorWithStatusCode } = require('../../../util/ErrorWithStatusCode');

describe('Error Middleware', function() {
    let req, res, next;
    let statusCode, jsonResponse;

    beforeEach(function() {
        statusCode = null;
        jsonResponse = null;
        
        req = {
            app: {
                get: function(key) {
                    if (key === 'env')
                        return 'test';
                    return null;
                }
            }
        };
        res = {
            status: function(code) {
                statusCode = code;
                return this;
            },
            json: function(data) {
                jsonResponse = data;
                return this;
            },
            locals: {}
        };
        next = function() {};
    });

    describe('ErrorWithStatusCode handling', function() {
        it('should handle custom ErrorWithStatusCode', function() {
            const error = ErrorWithStatusCode.validation('Invalid input', 'Please check your data');
            
            errorHandler(error, req, res, next);
            
            expect(statusCode).to.equal(400);
            expect(jsonResponse).to.deep.equal({
                success: false,
                error: 'Please check your data',
                statusCode: 400
            });
        });

        it('should handle ErrorWithStatusCode with same message and userMessage', function() {
            const error = ErrorWithStatusCode.notFound('Resource not found');
            
            errorHandler(error, req, res, next);
            
            expect(statusCode).to.equal(404);
            expect(jsonResponse).to.deep.equal({
                success: false,
                error: 'Resource not found',
                statusCode: 404
            });
        });
    });

    describe('Generic error handling', function() {

        it('should handle error with custom status', function() {
            req.app.get = function(key) {
                if (key === 'env') return 'production';
                return null;
            };
            const error = new Error('Bad request');
            error.status = 400;
            
            errorHandler(error, req, res, next);
            
            expect(statusCode).to.equal(400);
            expect(jsonResponse).to.deep.equal({
                success: false,
                error: 'Internal server error',
                statusCode: 400
            });
        });

        it('should set response locals', function() {
            req.app.get = function(key) {
                if (key === 'env') return 'development';
                return null;
            };
            const error = new Error('Test error');
            
            errorHandler(error, req, res, next);
            
            expect(res.locals.message).to.equal('Test error');
            expect(res.locals.error).to.equal(error);
        });

        it('should set minimal response locals in production', function() {
            req.app.get = function(key) {
                if (key === 'env') return 'production';
                return null;
            };
            const error = new Error('Test error');
            
            errorHandler(error, req, res, next);
            
            expect(res.locals.message).to.equal('Test error');
            expect(res.locals.error).to.deep.equal({});
        });
    });
});