const fs = require('fs');
const path = require('path');
const os = require('os');
const { expect } = require('chai');
const sinon = require('sinon');

const { RdioRecordingService } = require('../../service/RdioRecordingService');
const { NotificationParams } = require('../../obj/NotificationParams');

const SAMPLE_WAV = path.resolve(__dirname, '..', 'wav', 'dispatch1.wav');

function makeDetectionData({ name = 'Fire Station 1', detectedAt = '2024-01-01T00:00:00Z' } = {}) {
    return {
        uuid: 'uuid-123',
        detector: { name, tones: [911, 2938] },
        detectedAt,
        matchAverages: [911, 2938],
        notifications: {
            preRecording: { pushbullet: [], webhooks: [], externalCommands: [], emails: [] },
            postRecording: { pushbullet: [], webhooks: [], externalCommands: [], emails: [] }
        },
        message: 'tone detected'
    };
}

function makeFakeFfmpegFactory() {
    const commands = [];
    let shouldError = null;
    const factory = () => {
        const cmd = {
            inputs: [],
            inputOptionsHistory: [],
            filter: null,
            outputOpts: null,
            savedTo: null,
            _listeners: {},
            input(src) { this.inputs.push(src); return this; },
            inputOptions(opts) { this.inputOptionsHistory.push(opts); return this; },
            complexFilter(f) { this.filter = f; return this; },
            outputOptions(o) { this.outputOpts = o; return this; },
            on(event, cb) { this._listeners[event] = cb; return this; },
            save(outputPath) {
                this.savedTo = outputPath;
                setImmediate(() => {
                    if (shouldError && this._listeners.error) this._listeners.error(shouldError);
                    else if (this._listeners.end) this._listeners.end();
                });
                return this;
            }
        };
        commands.push(cmd);
        return cmd;
    };
    factory._commands = commands;
    factory._forceError = (err) => { shouldError = err; };
    return factory;
}

describe('RdioRecordingService', function() {
    let clock;
    let tmpStagingDir;
    let tmpRecordingDir;
    let notifierSpy;
    let mp3ConverterStub;
    let probeFormatStub;
    let ffmpegFactory;
    let service;

    function probeResult({ duration = 5, sampleRate = 44100, channels = 1 } = {}) {
        return { duration, sampleRate, channels };
    }

    beforeEach(function() {
        tmpStagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdio-rec-stage-'));
        tmpRecordingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdio-rec-out-'));
        notifierSpy = sinon.stub().resolves();
        mp3ConverterStub = sinon.stub().callsFake(({outputPath}) => {
            fs.writeFileSync(outputPath, 'fake-mp3');
            return Promise.resolve(outputPath);
        });
        probeFormatStub = sinon.stub().resolves(probeResult());
        ffmpegFactory = makeFakeFfmpegFactory();
        service = new RdioRecordingService({
            stagingDir: tmpStagingDir,
            recordingDirectory: tmpRecordingDir,
            postRecordingNotifier: notifierSpy,
            mp3Converter: mp3ConverterStub,
            ffmpegFactory,
            probeFormat: probeFormatStub,
        });
        clock = sinon.useFakeTimers({ shouldAdvanceTime: false });
    });

    afterEach(function() {
        clock.restore();
        service.dispose();
        try { fs.rmSync(tmpStagingDir, { recursive: true, force: true }); } catch (e) {}
        try { fs.rmSync(tmpRecordingDir, { recursive: true, force: true }); } catch (e) {}
    });

    describe('hasActiveWindow', function() {
        it('returns false when no window is active', function() {
            expect(service.hasActiveWindow('Fire Dispatch')).to.be.false;
        });

        it('returns true after onToneDetected opens a window', async function() {
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            expect(service.hasActiveWindow('Fire Dispatch')).to.be.true;
        });

        it('matches talkgroup label case-insensitively', async function() {
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            expect(service.hasActiveWindow('fire dispatch')).to.be.true;
            expect(service.hasActiveWindow('  FIRE DISPATCH  ')).to.be.true;
        });
    });

    describe('captureCall', function() {
        it('returns false when there is no active window', async function() {
            const result = await service.captureCall({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:10Z',
                talkgroupLabel: 'Fire Dispatch',
            });
            expect(result).to.be.false;
        });

        it('appends a call to an active window', async function() {
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            const result = await service.captureCall({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:10Z',
                talkgroupLabel: 'Fire Dispatch',
            });
            expect(result).to.be.true;
        });
    });

    describe('finalize at maximum wait', function() {
        it('single call: skips stitching, converts to MP3, fires post-recording notifier', async function() {
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            await clock.tickAsync(80 * 1000 + 100);

            expect(ffmpegFactory._commands).to.have.length(0);
            expect(mp3ConverterStub.calledOnce).to.be.true;
            expect(notifierSpy.calledOnce).to.be.true;
            const params = notifierSpy.firstCall.args[0];
            expect(params).to.be.instanceOf(NotificationParams);
            expect(params.filename).to.match(/Fire Station 1\.mp3$/);
            expect(service.hasActiveWindow('Fire Dispatch')).to.be.false;
        });

        it('two calls: stitches with silence gap computed from dateTime', async function() {
            probeFormatStub.resolves(probeResult({ duration: 5 }));
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            await service.captureCall({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:10Z',
                talkgroupLabel: 'Fire Dispatch',
            });

            await clock.tickAsync(80 * 1000 + 100);

            expect(ffmpegFactory._commands).to.have.length(1);
            const cmd = ffmpegFactory._commands[0];
            expect(cmd.inputs).to.have.length(3);
            expect(cmd.inputs[0]).to.match(/\.wav$/);
            expect(cmd.inputs[1]).to.equal('anullsrc=r=44100:cl=mono');
            expect(cmd.inputs[2]).to.match(/\.wav$/);
            expect(cmd.inputOptionsHistory[0]).to.deep.equal(['-f', 'lavfi', '-t', '5']);
            expect(cmd.filter).to.equal('[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]');
            expect(mp3ConverterStub.calledOnce).to.be.true;
            expect(notifierSpy.calledOnce).to.be.true;
        });

        it('silence gap is clamped to zero when calls overlap', async function() {
            probeFormatStub.resolves(probeResult({ duration: 20 }));
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            await service.captureCall({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:05Z',
                talkgroupLabel: 'Fire Dispatch',
            });

            await clock.tickAsync(80 * 1000 + 100);

            const cmd = ffmpegFactory._commands[0];
            expect(cmd.inputs).to.have.length(2);
            expect(cmd.filter).to.equal('[0:a][1:a]concat=n=2:v=0:a=1[out]');
        });

        it('silence generator matches the staged calls sample rate and channel layout', async function() {
            probeFormatStub.resolves(probeResult({ duration: 5, sampleRate: 8000, channels: 1 }));
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            await service.captureCall({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:10Z',
                talkgroupLabel: 'Fire Dispatch',
            });

            await clock.tickAsync(80 * 1000 + 100);

            const cmd = ffmpegFactory._commands[0];
            expect(cmd.inputs[1]).to.equal('anullsrc=r=8000:cl=mono');
        });

        it('silence generator uses stereo layout when calls are stereo', async function() {
            probeFormatStub.resolves(probeResult({ duration: 5, sampleRate: 16000, channels: 2 }));
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            await service.captureCall({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:10Z',
                talkgroupLabel: 'Fire Dispatch',
            });

            await clock.tickAsync(80 * 1000 + 100);

            const cmd = ffmpegFactory._commands[0];
            expect(cmd.inputs[1]).to.equal('anullsrc=r=16000:cl=stereo');
        });

        it('silence generator falls back to 44100/mono when probe returned null format', async function() {
            probeFormatStub.resolves({ duration: 5, sampleRate: null, channels: null });
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            await service.captureCall({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:10Z',
                talkgroupLabel: 'Fire Dispatch',
            });

            await clock.tickAsync(80 * 1000 + 100);

            const cmd = ffmpegFactory._commands[0];
            expect(cmd.inputs[1]).to.equal('anullsrc=r=44100:cl=mono');
        });
    });

    describe('finalize on call arrival after minimum wait', function() {
        it('call arriving past minimumWaitTimeSec with cumulative audio >= minAudioSecToFinalizeRecording finalizes immediately', async function() {
            probeFormatStub.resolves(probeResult({ duration: 8 }));
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });

            await clock.tickAsync(45 * 1000 + 50);
            expect(notifierSpy.called).to.be.false;
            expect(service.hasActiveWindow('Fire Dispatch')).to.be.true;

            await service.captureCall({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:45Z',
                talkgroupLabel: 'Fire Dispatch',
            });
            await clock.tickAsync(10);

            expect(notifierSpy.calledOnce).to.be.true;
            expect(service.hasActiveWindow('Fire Dispatch')).to.be.false;
        });

        it('no further call arrives after minimumWaitTimeSec: waits for maximum wait', async function() {
            probeFormatStub.resolves(probeResult({ duration: 20 }));
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });

            // Past minimumWaitTimeSec (45s) with >= 15s of audio, but no new call arrives
            // to trigger the check. The window stays open until maximumWaitTimeSec.
            await clock.tickAsync(45 * 1000 + 50);
            expect(notifierSpy.called).to.be.false;
            expect(service.hasActiveWindow('Fire Dispatch')).to.be.true;

            await clock.tickAsync(35 * 1000 + 50);
            expect(notifierSpy.calledOnce).to.be.true;
        });

        it('appended call before minimumWaitTimeSec does not finalize', async function() {
            probeFormatStub.resolves(probeResult({ duration: 20 }));
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            await service.captureCall({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:10Z',
                talkgroupLabel: 'Fire Dispatch',
            });

            await clock.tickAsync(10 * 1000);
            expect(notifierSpy.called).to.be.false;
            expect(service.hasActiveWindow('Fire Dispatch')).to.be.true;
        });

        it('call arriving past minimumWaitTimeSec but with audio < minAudioSecToFinalizeRecording does not finalize', async function() {
            probeFormatStub.resolves(probeResult({ duration: 5 }));
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });

            await clock.tickAsync(50 * 1000);

            await service.captureCall({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:50Z',
                talkgroupLabel: 'Fire Dispatch',
            });
            await clock.tickAsync(10);

            expect(notifierSpy.called).to.be.false;
            expect(service.hasActiveWindow('Fire Dispatch')).to.be.true;
        });
    });

    describe('stitch failure fallback', function() {
        it('falls back to first-call MP3 and still fires notifications', async function() {
            ffmpegFactory._forceError(new Error('ffmpeg died'));
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            await service.captureCall({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:10Z',
                talkgroupLabel: 'Fire Dispatch',
            });

            await clock.tickAsync(80 * 1000 + 100);

            expect(mp3ConverterStub.calledOnce).to.be.true;
            expect(notifierSpy.calledOnce).to.be.true;
            const convertArgs = mp3ConverterStub.firstCall.args[0];
            expect(convertArgs.inputPath).to.match(/\.wav$/);
        });
    });

    describe('concurrent talkgroups', function() {
        it('finalizes windows for different talkgroups independently', async function() {
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData({ name: 'Fire Det' }),
            });
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '2024-01-01T00:00:00Z',
                talkgroupLabel: 'EMS Dispatch',
                detectionData: makeDetectionData({ name: 'EMS Det' }),
            });

            expect(service.hasActiveWindow('Fire Dispatch')).to.be.true;
            expect(service.hasActiveWindow('EMS Dispatch')).to.be.true;

            await clock.tickAsync(80 * 1000 + 100);

            expect(notifierSpy.callCount).to.equal(2);
            expect(service.hasActiveWindow('Fire Dispatch')).to.be.false;
            expect(service.hasActiveWindow('EMS Dispatch')).to.be.false;
        });
    });

    describe('dateTime parsing', function() {
        it('accepts epoch seconds as number', async function() {
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: 1704067200,
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            expect(service.hasActiveWindow('Fire Dispatch')).to.be.true;
        });

        it('accepts numeric string epoch seconds', async function() {
            await service.onToneDetected({
                wavFilePath: SAMPLE_WAV,
                dateTime: '1704067200',
                talkgroupLabel: 'Fire Dispatch',
                detectionData: makeDetectionData(),
            });
            expect(service.hasActiveWindow('Fire Dispatch')).to.be.true;
        });
    });
});
