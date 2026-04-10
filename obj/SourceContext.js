const VALID_SOURCES = ['live', 'file-upload', 'rdio'];

/**
 * Represents the origin context of a detection event.
 * Carries source metadata (live audio, file upload, or Rdio Scanner)
 * and provides centralized timestamp resolution via resolveDetectedAt().
 */
class SourceContext {
    /**
     * @param {Object} params
     * @param {string} params.source - Detection source: 'live', 'file-upload', or 'rdio'
     * @param {number} [params.epochBaseSeconds] - Unix epoch seconds of the source event (Rdio dateTime)
     * @param {Object} [params.talkgroup] - Rdio talkgroup metadata
     */
    constructor({ source, epochBaseSeconds, talkgroup } = {}) {
        if (!source || !VALID_SOURCES.includes(source)) {
            throw new Error(`SourceContext "source" must be one of: ${VALID_SOURCES.join(', ')}`);
        }

        if (epochBaseSeconds !== undefined && epochBaseSeconds !== null) {
            const parsed = Number(epochBaseSeconds);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                throw new Error('SourceContext "epochBaseSeconds" must be a positive number');
            }
            this.epochBaseSeconds = parsed;
        } else {
            this.epochBaseSeconds = null;
        }

        this.source = source;
        this.talkgroup = talkgroup || null;
    }

    /**
     * Resolve the detection timestamp as an ISO 8601 string.
     * Uses epochBaseSeconds when available (Rdio uploads), otherwise Date.now().
     * @returns {string} ISO 8601 timestamp
     */
    resolveDetectedAt() {
        if (this.epochBaseSeconds) {
            return new Date(Math.round(this.epochBaseSeconds * 1000)).toISOString();
        }
        return new Date().toISOString();
    }

    /** Create a SourceContext for live audio monitoring */
    static live() {
        return new SourceContext({ source: 'live' });
    }

    /** Create a SourceContext for file upload API */
    static fileUpload() {
        return new SourceContext({ source: 'file-upload' });
    }

    /**
     * Create a SourceContext from Rdio Scanner call metadata.
     * @param {Object} rdioMetadata - Metadata extracted from the Rdio Scanner request
     * @returns {SourceContext}
     */
    static fromRdioMetadata(rdioMetadata) {
        return new SourceContext({
            source: 'rdio',
            epochBaseSeconds: rdioMetadata.dateTime ? Number(rdioMetadata.dateTime) : (Date.now() / 1000),
            talkgroup: {
                id: rdioMetadata.talkgroup || null,
                label: rdioMetadata.talkgroupLabel || null,
                group: rdioMetadata.talkgroupGroup || null,
                tag: rdioMetadata.talkgroupTag || null,
                system: rdioMetadata.system || null,
                systemLabel: rdioMetadata.systemLabel || null,
                source: rdioMetadata.source || null,
                frequency: rdioMetadata.frequency || null
            }
        });
    }

    toJSON() {
        const result = { source: this.source };
        if (this.epochBaseSeconds) result.epochBaseSeconds = this.epochBaseSeconds;
        if (this.talkgroup) result.talkgroup = this.talkgroup;
        return result;
    }
}

module.exports = { SourceContext };
