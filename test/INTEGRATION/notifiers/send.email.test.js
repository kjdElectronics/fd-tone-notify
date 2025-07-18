require('dotenv').config();
const {sendEmail} = require('../../../notifiers/send.email');
const path = require('path');
const expect  = require("chai").expect;

describe("Send Email", function() {
    it(`should be able to send email notification with attachment`, async function () {
        const result = await sendEmail({to: process.env.FD_SMTP_TEST_TO, recordingRelPath: "test/wav/raw.wav", filename: "Dispatch.wav", subject: "Test Notification", text: "Testing 123", attachFile: true});
        expect(result.messageId).not.to.be.null;
    });
});