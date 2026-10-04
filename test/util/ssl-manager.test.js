const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const expect = require('chai').expect;
const sslManager = require('../../util/ssl-manager');

describe('SSL Manager', function() {
    this.timeout(20000);
    const original = { sslDir: sslManager.sslDir, keyPath: sslManager.keyPath, certPath: sslManager.certPath };
    let dir;

    before(function() {
        try { execSync('openssl version', { stdio: 'ignore' }); } catch { this.skip(); }
    });

    beforeEach(function() {
        // Space in the path reproduces the Windows "C:\Users\First Last\..." failure
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdtn ssl test '));
        sslManager.sslDir = dir;
        sslManager.keyPath = path.join(dir, 'server.key');
        sslManager.certPath = path.join(dir, 'server.crt');
    });

    afterEach(function() {
        Object.assign(sslManager, original);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('generates a valid certificate in a directory whose path contains a space', async function() {
        await sslManager.ensureCertificates();

        const cert = new crypto.X509Certificate(fs.readFileSync(sslManager.certPath));
        expect(new Date(cert.validTo)).to.be.above(new Date());
        expect(fs.existsSync(sslManager.keyPath)).to.equal(true);
        expect(await sslManager.certificateProblem()).to.equal(null);
    });

    it('reports an unreadable certificate as a problem', async function() {
        fs.writeFileSync(sslManager.certPath, 'not a cert');
        expect(await sslManager.certificateProblem()).to.match(/could not be read/);
    });
});
