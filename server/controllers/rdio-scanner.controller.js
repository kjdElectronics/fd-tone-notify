const { v4: uuidv4 } = require('uuid');
const log = require('../../util/logger');
const { getWebSocketServer, configureWebSocketEvents } = require('../index');
const {
    extractRdioMetadata,
    findMatchingDetectors,
    createMatchingDetectorConfigs,
} = require('../domain/rdio.helpers');
const { convertAudioToWav, safeDeleteFile } = require('../util/audio.conversion.util');
const { processRdioCall } = require('../../service/RdioCallProcessingService');
const { rdioRecordingService } = require('../../service/RdioRecordingService');

/**
 * Handle Rdio Scanner call-upload API requests.
 *
 * Thin HTTP wrapper: validates the request, extracts metadata, delegates the
 * detection pipeline to RdioCallProcessingService, and passes calls through to
 * RdioRecordingService so that post-recording notifications fire for
 * qualifying talkgroups.
 */
async function handleCallUpload(req, res) {
    const requestId = uuidv4();
    const startTime = new Date();

    log.info(`Rdio Scanner ${req.method} ${req.originalUrl} received from ${req.ip} (${requestId})`);

    const connectivityCheckResponse = handleConnectivityCheckIfApplicable(req, res, requestId);
    if (connectivityCheckResponse) return connectivityCheckResponse;

    const rdioMetadata = extractRdioMetadata(req, requestId);
    const matchingDetectors = findMatchingDetectors(rdioMetadata.talkgroupLabel);

    if (matchingDetectors.length === 0) {
        return handleNonMatchingCall(req, res, rdioMetadata, requestId);
    }

    log.info(`Rdio Scanner: ${matchingDetectors.length} detector(s) match talkgroupLabel="${rdioMetadata.talkgroupLabel}" (${requestId})`);

    const wavFilePath = req.file.path + '.wav';
    try {
        await convertAudioToWav(req.file.path, wavFilePath, req.file.originalname, requestId);
    } catch (conversionError) {
        log.error(`Rdio Scanner: audio conversion failed: ${conversionError.message} (${requestId})`);
        safeDeleteFile(req.file.path);
        safeDeleteFile(wavFilePath);
        return res.status(500).json({ success: false, error: 'Audio conversion failed' });
    }
    safeDeleteFile(req.file.path);

    const detectorConfigs = createMatchingDetectorConfigs(matchingDetectors);

    try {
        const detections = await processRdioCall({
            wavFilePath,
            detectorConfigs,
            rdioMetadata,
            requestId,
            startTime,
            onServicesReady: wireWebSocketBroadcasting,
        });

        // No tone detected but a recording window is still open for this
        // talkgroup — add this call's audio so it's included in the stitched
        // recording (same-talkgroup chatter during the incident).
        if ((!detections || detections.length === 0)
            && rdioRecordingService.hasActiveWindow(rdioMetadata.talkgroupLabel)) {
            await rdioRecordingService.captureCall({
                wavFilePath,
                dateTime: rdioMetadata.dateTime,
                talkgroupLabel: rdioMetadata.talkgroupLabel,
            });
        }
        return res.status(200).send('Call imported successfully');
    } catch (processingError) {
        log.error(`Rdio Scanner: error processing audio: ${processingError.message} (${requestId})`);
        return res.status(500).json({ success: false, error: 'Audio processing failed' });
    } finally {
        safeDeleteFile(wavFilePath);
    }
}

/**
 * SDRTrunk sends a startup probe with `test=1` and a system key but no audio
 * file. It expects HTTP 417 when no talkgroup is present to confirm
 * connectivity; a 200 is expected when the probe carries a talkgroup. If the
 * request is a probe, respond immediately; otherwise return null so the main
 * handler continues.
 */
function handleConnectivityCheckIfApplicable(req, res, requestId) {
    if (req.file) return null;
    const talkgroup = req.body?.talkgroup;
    if (!talkgroup) {
        log.info(`Rdio Scanner connectivity check from ${req.ip}: no talkgroup provided, returning expected 417 (${requestId})`);
        return res.status(417).send('Incomplete call data: no talkgroup');
    }
    log.info(`Rdio Scanner call-upload: no audio file provided (${requestId})`);
    return res.status(200).send('Call imported successfully');
}

/**
 * Handle a call where no detector `talkgroupFilter` matches. If a recording
 * window is already open for this talkgroup (a prior call detected tones), the
 * audio is captured anyway so it can be stitched into the in-progress
 * recording. Otherwise the call is dropped.
 */
async function handleNonMatchingCall(req, res, rdioMetadata, requestId) {
    if (!rdioRecordingService.hasActiveWindow(rdioMetadata.talkgroupLabel)) {
        log.debug(`Rdio Scanner: no matching detectors for talkgroupLabel="${rdioMetadata.talkgroupLabel}", skipping (${requestId})`);
        safeDeleteFile(req.file.path);
        return res.status(200).send('Call imported successfully');
    }

    log.debug(`Rdio Scanner: no matching detectors but active recording window for talkgroupLabel="${rdioMetadata.talkgroupLabel}", capturing for stitching (${requestId})`);
    const wavFilePath = req.file.path + '.wav';
    try {
        await convertAudioToWav(req.file.path, wavFilePath, req.file.originalname, requestId);
        safeDeleteFile(req.file.path);
        await rdioRecordingService.captureCall({
            wavFilePath,
            dateTime: rdioMetadata.dateTime,
            talkgroupLabel: rdioMetadata.talkgroupLabel,
        });
    } catch (err) {
        log.error(`Rdio Scanner: failed to capture non-matching call into active window: ${err.message} (${requestId})`);
    } finally {
        safeDeleteFile(wavFilePath);
    }
    return res.status(200).send('Call imported successfully');
}

/**
 * Attach the shared WebSocket server to the per-request DetectionService so
 * that tone detections from Rdio calls fan out to connected UI clients the
 * same way live-audio detections do.
 */
function wireWebSocketBroadcasting({ detectionService, allToneDetectionService }) {
    const wss = getWebSocketServer();
    if (!wss) return;
    configureWebSocketEvents({
        detectionService,
        allToneDetectionService,
        wss,
    });
}

module.exports = { handleCallUpload };
