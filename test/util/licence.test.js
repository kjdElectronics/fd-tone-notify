const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { checkLicense, LICENCE } = require('../../util/licence');

// checkLicense() reads/writes ./license.txt relative to process.cwd(). The
// Docker image relies on exactly this mechanism (see Dockerfile) to bake in
// GPL acknowledgment at build time so a headless/detached container never
// blocks forever on an interactive stdin prompt.
const LICENCE_PATH = path.resolve(process.cwd(), 'license.txt');

describe('licence', function() {
    let existedBefore, originalContent;

    beforeEach(function() {
        existedBefore = fs.existsSync(LICENCE_PATH);
        if (existedBefore) originalContent = fs.readFileSync(LICENCE_PATH, 'utf8');
    });

    afterEach(function() {
        if (existedBefore) fs.writeFileSync(LICENCE_PATH, originalContent);
        else if (fs.existsSync(LICENCE_PATH)) fs.unlinkSync(LICENCE_PATH);
    });

    it('should export the exact license acknowledgment text', function() {
        expect(LICENCE).to.be.a('string');
        expect(LICENCE).to.include('GPL-3.0');
        expect(LICENCE).to.include('https://github.com/kjdElectronics/fd-tone-notify');
    });

    it('should not prompt (resolve immediately) when license.txt already contains the exact LICENCE text', async function() {
        fs.writeFileSync(LICENCE_PATH, LICENCE);

        // If this were prompting on stdin in a non-interactive test run, it
        // would hang until the mocha timeout fired.
        await checkLicense();
    });
});
