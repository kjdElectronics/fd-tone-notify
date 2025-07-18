const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');

/**
 * Configuration object for email notifications with validation
 */
class EmailConfig {
    /**
     * Create an EmailConfig
     * @param {Object} config - Email configuration
     * @param {string} config.to - Comma-separated recipient email addresses
     * @param {string} [config.bcc] - Comma-separated BCC email addresses
     * @param {string} config.subject - Email subject line
     * @param {string} config.text - Email body text
     */
    constructor({ to, bcc, subject, text }) {
        this.validateAndSet({ to, bcc, subject, text });
    }

    /**
     * Validate and set email configuration properties
     * @private
     */
    validateAndSet({ to, bcc, subject, text }) {
        // Validate required fields
        if (!to || typeof to !== 'string') {
            throw ErrorWithStatusCode.validation('Email "to" field is required and must be a string');
        }

        if (!subject || typeof subject !== 'string') {
            throw ErrorWithStatusCode.validation('Email "subject" field is required and must be a string');
        }

        if (!text || typeof text !== 'string') {
            throw ErrorWithStatusCode.validation('Email "text" field is required and must be a string');
        }

        // Validate email format
        this.validateEmailList(to, 'to');
        if (bcc) {
            this.validateEmailList(bcc, 'bcc');
        }

        // Set properties
        this.to = to.trim();
        this.bcc = bcc ? bcc.trim() : undefined;
        this.subject = subject.trim();
        this.text = text.trim();
    }

    /**
     * Validate comma-separated email list
     * @private
     */
    validateEmailList(emailList, fieldName) {
        const emails = emailList.split(',').map(email => email.trim());
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        for (const email of emails) {
            if (!emailRegex.test(email)) {
                throw ErrorWithStatusCode.validation(
                    `Invalid email address "${email}" in ${fieldName} field`
                );
            }
        }
    }


    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        let {...result} = this;
        return result;
    }
}

module.exports = { EmailConfig };