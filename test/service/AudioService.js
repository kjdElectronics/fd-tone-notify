require('dotenv').config();
const expect  = require("chai").expect;
const {AudioService} = require("../../service/AudioService");

describe("AudioService", function() {
    it("should be able start and detect data ", function(done) {
        this.timeout(5000);
        const audioInterface = new AudioService();
        let doneCalled = false;

        audioInterface.onData( data => {
            console.log('data');
            if(data.length !== 0 && !doneCalled) {
                doneCalled = true;
                done();
            }
        });

        audioInterface.start();
    });
});