require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const config = require("config");
const {checkLicense} = require("./util/licence");
const log = require('./util/logger');
const {populateSecretsEnvVar} = require("./util/config.secrets");
const { spawn } = require('child_process');

setupProgram();

function setupProgram(){
    program
        .name("fd-tone-notify")
        .option('--backend-only', 'Start only the backend server (no UI dev server)')
        .option('--ui-only', 'Start only the UI dev server (no backend)')
        .option('--backend-port <port>', 'Backend server port (default: 3000)', '3000')
        .option('--manager-port <port>', 'Manager API port (default: 3001)', '3001')

        .option('--debug', 'Overrides FD_LOG_LEVEL environment var forcing the log level to debug')
        .option('--silly', 'Overrides FD_LOG_LEVEL environment var forcing the log level to silly')
        .option('--instance-name <name>', 'Overrides NODE_APP_INSTANCE environment allowing different config files for different instances running' +
            ' on the same machine. Example: "--instance-name my-fd" will load config files default-my-fd.json and local-my-fd.json')
        .option('--secrets-file <path>', 'Path to secrets file. By default secrets will be loaded from config/secrets.json. Use this option to specify a different path')
        .option('--force-secrets-file', 'Using this option forces all secrets to be read from the secrets file (Either the ' +
            'default or the path specified by --secrets-path). Values from environment variables will be disregarded. If the file cannot be loaded or parsed ' +
            'the application will exit with code 99 indicating an invalid secrets configuration.')
        .option('--recording-directory <path>', 'Overrides FD_RECORDING_DIRECTORY environment var setting the directory where recordings are saved')
        .option('--auto-delete-recording-age-days <days>', 'Overrides FD_AUTO_DELETE_RECORDINGS_OLDER_THAN_DAYS environment var setting how many days to keep recordings (0 = forever)')
        //Legacy Options
        .option('--legacy', '[Legacy] Run legacy FD Tone Notify system instead of unified manager. Use of any of the Legacy options below explicity requires the --legacy flag to be set')
        .option('--detect-from-files <paths>', '[Legacy] Detect tones from audio files. Provide comma-separated list of file paths or directories containing WAV files')
        .option('--suppress-logging', '[Legacy] Disables logging to console. Logging will still be written to file. Automatically enabled when --detect-from-files option is set')
        .option('--all-tone-detector', '[Legacy] Secondary functionality: Instead of reading the config file and sending notifications ' +
            'when specific tones are detected this option activates multi tone detector mode. In this mode the frequency spectrum from 300Hz to 4000Hz ' +
            'is monitored. When a multi tone is detected the result is logged to the console. Use this mode to determine the frequencies to monitor and ' +
            'enter the results in the "tones" parameter for the corresponding department.')
        .option('--test-notifications', '[Legacy] Send test notifications')
        .option('--csv-to-config', '[Legacy] Build a config file from a csv')
        .option('--web-server', '[Legacy] Starts the webserver. The webserver provides remote monitoring capability and ability to listen to live audio')
        .option('--port <port>', '[Legacy] Overrides FD_PORT environment var setting the port for the web server. Has no effect without --web-server option. Default port 3000')
        .parse();

    defaultConfig();
    overrideEnvVars(program.opts());
    validateOptions(program.opts());
}

async function main(){
    await checkLicense();
    const options = program.opts();

    if (options.legacy) {
        // Run legacy system
        populateSecretsEnvVar({secretsPath: options.secretsFile, forceSecretsFile: options.forceSecretsFile});

        const {fdToneNotify} = require('./bin/fdToneNotify');
        const {toneDetector} = require('./bin/toneDetector');
        const {csvToConfig} = require('./bin/csvToConfig');
        const {testNotifications} = require('./bin/testNotifications');
        const {detectFromFiles} = require('./bin/detectFromFiles');

        if(options.csvToConfig)
            csvToConfig();
        else if(options.allToneDetector)
            toneDetector({webServer: options.webServer});
        else if(options.testNotifications)
            testNotifications();
        else if(options.detectFromFiles) {
            await detectFromFiles({paths: options.detectFromFiles});
            // Give a brief moment for any pending notifications to complete
            log.info("Processing completed. Waiting to allow any pending notifications to finish processing...")
            setTimeout(() => {
                process.exit(0);
            }, 2000);
        }
        else
            fdToneNotify({webServer: options.webServer});
    } else {
        // Run new manager system - spawn the manager
        const managerArgs = [];
        
        // Pass through manager-specific options
        if (options.backendOnly) managerArgs.push('--backend-only');
        if (options.uiOnly) managerArgs.push('--ui-only');
        if (options.backendPort && options.backendPort !== '3000') managerArgs.push('--backend-port', options.backendPort);
        if (options.managerPort && options.managerPort !== '3001') managerArgs.push('--manager-port', options.managerPort);
        if (options.debug) managerArgs.push('--debug');
        if (options.instanceName) managerArgs.push('--instance-name', options.instanceName);
        if (options.recordingDirectory) managerArgs.push('--recording-directory', options.recordingDirectory);
        if (options.secretsFile) managerArgs.push('--secrets-file', options.secretsFile);
        if (options.forceSecretsFile) managerArgs.push('--force-secrets-file');

        const managerProcess = spawn('node', [path.join(__dirname, 'bin', 'manager.js'), ...managerArgs], {
            stdio: 'inherit',
            cwd: __dirname
        });

        // Handle manager process exit
        managerProcess.on('exit', (code) => {
            process.exit(code);
        });

        // Handle signals
        process.on('SIGTERM', () => managerProcess.kill('SIGTERM'));
        process.on('SIGINT', () => managerProcess.kill('SIGINT'));
    }
}

function overrideEnvVars(options){
    if(options.debug)
        process.env.FD_LOG_LEVEL = "debug";
    if(options.silly)
        process.env.FD_LOG_LEVEL = "silly";

    if(options.instanceName)
        process.env.NODE_APP_INSTANCE = options.instanceName;

    if(options.port)
        process.env.FD_PORT = Number.parseInt(options.port);
    
    if(options.recordingDirectory)
        process.env.FD_RECORDING_DIRECTORY = options.recordingDirectory;
    
    if(options.autoDeleteRecordingAgeDays)
        process.env.FD_AUTO_DELETE_RECORDINGS_OLDER_THAN_DAYS = Number.parseInt(options.autoDeleteRecordingAgeDays);
}

function defaultConfig(){
    if(!fs.existsSync('./config')){
        log.info('No config directory. Initializing with default configuration');
        fs.mkdirSync('./config');

        // javascript-obfuscator:disable
        const defaultConfig = require('./config/default.json');
        fs.writeFileSync('./config/default.json', JSON.stringify(defaultConfig, null, 2));

        // javascript-obfuscator:disable
        const secretsTemplate = require('./config/secrets.template.json');
        fs.writeFileSync('./config/secrets.template.json', JSON.stringify(secretsTemplate, null, 2));

        //For Packing
        // javascript-obfuscator:disable
        const configPath = path.join(__dirname, './config/asound.conf');
        const data = fs.readFileSync(configPath);
        fs.writeFileSync('./config/asound.conf', data);
    }
    
    // Create recording directory if it doesn't exist
    const recordingDir = config.recording.directory;
    if (!fs.existsSync(recordingDir)) {
        log.info(`Creating recording directory: ${recordingDir}`);
        fs.mkdirSync(recordingDir, { recursive: true });
    }
}

function validateOptions(options) {
    // Check if legacy mode is being used
    const isLegacyMode = options.legacy ||
        options.allToneDetector ||
        options.testNotifications ||
        options.csvToConfig ||
        options.detectFromFiles ||
        options.webServer;

    if (!options.legacy && isLegacyMode) {
        _exitWithError(`A legacy option was selected (--allToneDetector, --testNotifications, --csvToConfig, --detectFromFiles, or --webServer but --legacy was not enabled). Must set --legacy when using a legacy option`);
        return;
    }

    if (options.legacy) {

        // Legacy mode validation
        const mainOptionSelectedCount = [options.testNotifications, options.allToneDetector, options.csvToConfig, options.detectFromFiles].filter(v => !!v).length;
        if(mainOptionSelectedCount > 1)
            _exitWithError(`Multi main options selected. Can only selected one of the following: --all-tone-detector, --test-notifications, --csv-to-config, --detect-from-files`);
        
        if(options.port && !options.webServer)
            log.warning(`--port <port> option is meaningless without the --web-server option. ` +
                `Monitoring interface will only start on specified port when --web-server option is set`);
    } else {
        // Manager mode validation
        if (options.port) {
            _exitWithError(`--port option is only available in legacy mode. Use --backend-port for the new manager system.`);
        }
        if (options.webServer) {
            _exitWithError(`--web-server option is only available in legacy mode. The new manager system includes a built-in web interface.`);
        }
        
        // Check for conflicting manager options
        if (options.backendOnly && options.uiOnly) {
            _exitWithError(`Cannot specify both --backend-only and --ui-only options.`);
        }
    }
}

function _exitWithError(message){
    log.error(message);
    process.exit(1);
}

main()
    .then(r => {
            log.silly(`Started`);
            setTimeout(() => log.silly('Main HB'), 10);
        }
    )
    .catch(err => {
        log.crit(err.stack)
    });
