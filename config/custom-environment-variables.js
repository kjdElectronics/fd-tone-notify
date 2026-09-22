//Node Config Custom Env Vars - https://github.com/node-config/node-config/wiki/Environment-Variables#custom-environment-variables

const CUSTOM_ENV_VAR_CONFIG = {
    audio:{
        // {__name, __format} (rather than a plain string, as used everywhere
        // else in this file) is required here so node-config actually
        // coerces the env var to a boolean - the plain-string form passes
        // the raw string through untouched, and "false" is truthy in JS.
        disabled: {__name: "FD_AUDIO_DISABLED", __format: "boolean"},
        inputDevice: "FD_INPUT_DEVICE",
        sampleRate: "FD_SAMPLE_RATE",
        frequencyScaleFactor: "FD_FREQ_SCALE_FACTOR",
        channels: "FD_CHANNELS",
        silenceAmplitude: "FD_SILENCE_AMPLITUDE",
    },
    detection: {
        minRecordingLengthSec: "FD_MIN_RECORDING_LENGTH_SEC",
    },
    recording: {
        directory: "FD_RECORDING_DIRECTORY",
        autoDeleteOlderThanDays: "FD_AUTO_DELETE_RECORDINGS_OLDER_THAN_DAYS"
    },
    coralogix:{
        applicationName: "FD_CORALOGIX_APPLICATION_NAME",
        subsystemName: "FD_CORALOGIX_SUBSYSTEM_NAME",
        privateKey: "FD_CORALOGIX_PRIVATE_KEY"
    },
    pushbullet:{
        apiKey: "FD_PUSHBULLET_API_KEY"
    },
    email: {
        from: "FD_EMAIL_FROM",
        host: "FD_SMTP_HOST",
    },
    rdioScanner: {
        apiKeyHash: "FD_RDIO_API_KEY_HASH",
        insecureHttpPort: "FD_INSECURE_HTTP_RDIO_CALL_UPLOAD_PORT"
    }
};

module.exports = CUSTOM_ENV_VAR_CONFIG;