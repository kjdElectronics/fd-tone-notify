require('dotenv').config();
const expect  = require("chai").expect;
const {NotificationParams, MATCH_STATES} = require('../../obj/NotificationParams');
const { TonesDetector } = require('../../obj/TonesDetector');

const TONES_DETECTOR = new TonesDetector({
    name: "Test",
    tones: [1000, 1300],
    tolerancePercent: 0.02,
    matchThreshold: 8
});

const TIMESTAMP = 1659337200000; // Mon Aug 01 2022 07:00:00 GMT+0000
const NOTIFICATIONS = {
    preRecording: {
        emails: []
    },
    postRecording: {
        emails: []
    }
}

const DEFAULT_PARAMS = {
    detector: TONES_DETECTOR,
    timestamp: TIMESTAMP,
    filename: TIMESTAMP + '.wav',
    matchAverages: [1, 2, 3],
    notifications: NOTIFICATIONS,
    message: 'This is a test.'
};

describe("NotificationParams", function() {
    it("should instantiate correctly", async function() {
        const notificationParams = new NotificationParams(DEFAULT_PARAMS);
        expect(notificationParams).instanceOf(NotificationParams);
        expect(notificationParams.detector).deep.equals(DEFAULT_PARAMS.detector);
        expect(notificationParams.timestamp).equals(DEFAULT_PARAMS.timestamp);
        expect(notificationParams.matchAverages).deep.equals(DEFAULT_PARAMS.matchAverages);
        expect(notificationParams.notifications).deep.equals(DEFAULT_PARAMS.notifications);
        expect(notificationParams.filename).equals(DEFAULT_PARAMS.filename);
        expect(notificationParams.message).equals(DEFAULT_PARAMS.message);
    });

    describe("#getEmails", function() {
        it("should return an empty list if there are no emails", function(){
            const notificationParams = new NotificationParams(DEFAULT_PARAMS);
            expect(notificationParams.getEmails('PRE')).deep.equals([])
            expect(notificationParams.getEmails('POST')).deep.equals([])
        });

        it("should return the correct emails", function() {
            const preEmail = {
                text: "PRE Text",
                subject: "PRE Subject",
            }
            const postEmail = {
                text: "POST Text",
                subject: "POST Subject"
            }

            newParams = deep_copy(DEFAULT_PARAMS);
            newParams.notifications.preRecording.emails.push(preEmail);
            newParams.notifications.postRecording.emails.push(postEmail);

            const notificationParams = new NotificationParams(newParams);

            var emails = notificationParams.getEmails('PRE');
            expect(emails).deep.equals([preEmail]);

            var emails = notificationParams.getEmails('POST');
            expect(emails).deep.equals([postEmail])
        });

        it("should insert timestamps", function() {
            const preEmail = {
                text: "PRE Text %d",
                subject: "PRE Subject %d",
            }
            const postEmail = {
                text: "POST Text %d",
                subject: "POST Subject %d"
            }

            newParams = deep_copy(DEFAULT_PARAMS);
            newParams.notifications.preRecording.emails.push(deep_copy(preEmail));
            newParams.notifications.postRecording.emails.push(deep_copy(postEmail));

            const notificationParams = new NotificationParams(newParams);

            var emails = notificationParams.getEmails('PRE');
            expect(emails).to.have.lengthOf(1);
            expect(emails[0].text).to.have.string("August 1st 2022, 0:00:00");
            expect(emails[0].subject).to.have.string("August 1st 2022, 0:00:00");

            var emails = notificationParams.getEmails('POST');
            expect(emails).to.have.lengthOf(1);
            expect(emails[0].text).to.have.string("August 1st 2022, 0:00:00");
            expect(emails[0].subject).to.have.string("August 1st 2022, 0:00:00");
        });

        it("should not modify the original email objects", function() {
            const preEmail = {
                text: "PRE Text %d",
                subject: "PRE Subject %d",
            }
            newParams = deep_copy(DEFAULT_PARAMS);
            newParams.notifications.preRecording.emails.push(preEmail);

            const notificationParams = new NotificationParams(newParams);

            var emails = notificationParams.getEmails('PRE');
            expect(preEmail.text).to.have.string("%d");
            expect(preEmail.subject).to.have.string("%d");
        });
    });
});

function deep_copy(obj) {
    return JSON.parse(JSON.stringify(obj));
}