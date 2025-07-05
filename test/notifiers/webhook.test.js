require('dotenv').config();
const {postJson, postMultiPartFormDataWithFile} = require('../../notifiers/webhook');
const nock = require('nock');
const expect  = require("chai").expect;
const formidable = require('formidable');

process.env.AUTH_HEADER = "Testing Value";
const PARAMS = {
    address: 'http://localhost/test',
    headers: {
        'header-test': 'value',
        "from-env-var": "CUSTOM_ENV_VAR_AUTH_HEADER", //Testing Value above
    },
    timestamp: new Date().getTime(),
    tones: [1000, 2000],
    matchAverages: [1001, 2001],
    filename: "raw.wav",
    recordingRelPath: "./test/wav/raw.wav",
    detectorName: "Webhook Test Detector",
    custom: {
        customData: true
    },
    isTest: true
}

describe("Webhook Test", function() {
    it(`should be able postJson`, async function () {
        nock('http://localhost')
            .matchHeader('Content-Type', 'application/json')
            .matchHeader('header-test', PARAMS.headers['header-test'])
            .matchHeader('from-env-var', process.env.AUTH_HEADER)
            .matchHeader('accept',"*/*")
            .post('/test')
            .reply(200,  (uri, requestBody) => requestBody);

        const result = await postJson(PARAMS);

        const expectedResult = JSON.parse(JSON.stringify(PARAMS));
        delete expectedResult.address;
        delete expectedResult.headers;
        delete expectedResult.recordingRelPath;
        delete expectedResult.isTest;

        expect(result).to.deep.equal(expectedResult);
    });

    it(`should be able postMultiPartFormDataWithFile`, function (done) {
        nock('http://localhost')
            .post('/test')
            .reply(200,  (uri, requestBody) => requestBody);

        const form = formidable({ multiples: true });
       postMultiPartFormDataWithFile(PARAMS)
            .then(res => {
                //TODO Validate response
                done();
            })
           .catch(err => {
               done(err);
           })
    });
});