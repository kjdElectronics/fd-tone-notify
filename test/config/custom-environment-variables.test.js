const { expect } = require('chai');
const CUSTOM_ENV_VAR_CONFIG = require('../../config/custom-environment-variables');

describe('config/custom-environment-variables', function() {
    it('maps FD_AUDIO_DISABLED to audio.disabled, coerced to a real boolean', function() {
        // README documents FD_AUDIO_DISABLED as overriding config.audio.disabled,
        // and docs/docker.md documents it as the primary way to disable live
        // microphone capture in a container - but this mapping was missing, so
        // node-config never actually wired the env var to anything.
        //
        // node-config's plain-string mapping shorthand (used for every other
        // entry in this file) passes the raw env var string straight through
        // with no type coercion - config.audio.disabled would end up the
        // *string* "false" for FD_AUDIO_DISABLED=false, which is truthy in JS
        // and would silently invert the user's intent. Use the
        // {__name, __format: "boolean"} form instead, which node-config
        // parses with Parser.booleanParser (content === 'true') before
        // setting the config value.
        expect(CUSTOM_ENV_VAR_CONFIG.audio.disabled).to.deep.equal({
            __name: 'FD_AUDIO_DISABLED',
            __format: 'boolean'
        });
    });
});
