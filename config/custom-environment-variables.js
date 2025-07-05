const CUSTOM_ENV_VAR_CONFIG = {
    audio:{
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
    }
};

module.exports = CUSTOM_ENV_VAR_CONFIG;