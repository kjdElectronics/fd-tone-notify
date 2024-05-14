require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
setupProgram();

const {checkLicense} = require("./util/licence");
const log = require('./util/logger');
const {populateSecretsEnvVar} = require("./util/config.secrets");


function setupProgram(){
    program
        .name("fd-tone-notify")
        .option('--all-tone-detector', 'Secondary functionality: Instead of reading the config file and sending notifications ' +
            'when specific tones are detected this option activates multi tone detector mode. In this mode the frequency spectrum from 300Hz to 4000Hz ' +
            'is monitored. When a multi tone is detected the result is logged to the console. Use this mode to determine the frequencies to monitor and ' +
            'enter the results in the "tones" parameter for the corresponding department.')
        .option('--test-notifications', 'Send test notifications')
        .option('--csv-to-config', 'Build a config file from a csv')
        .option('--debug', 'Overrides FD_LOG_LEVEL environment var forcing the log level to debug')
        .option('--silly', 'Overrides FD_LOG_LEVEL environment var forcing the log level to silly')
        .option('--instance-name', 'Overrides NODE_APP_INSTANCE environment allowing different config files for different instances running' +
            ' on the same machine. Example: "--instance-name my-fd" will load config files default-my-fd.json and local-my-fd.json')
        .option('--web-server', 'Starts the webserver. The webserver provides remote monitoring capability and ability to listen to live audio')
        .option('--port <port>', 'Overrides FD_PORT environment var setting the port for the web server. Has no effect without --web-server option. Default port 3000')
        .option('--secrets-file <path>', 'Path to secrets file. By default secrets will be loaded from config/secrets.json. Use this option to specify a different path')
        .option('--force-secrets-file', 'Using this option forces all secrets to be read from the secrets file (Either the ' +
            'default or the path specified by --secrets-path). Values from environment variables will be disregarded. If the file cannot be loaded or parsed ' +
            'the application will exit with code 99 indicating an invalid secrets configuration.')
        .parse();

    defaultConfig();
    overrideEnvVars(program.opts());
    validateOptions(program.opts());
}

async function main(){

    await checkLicense();
    const options = program.opts();
    populateSecretsEnvVar({secretsPath: options.secretsFile, forceSecretsFile: options.forceSecretsFile});

    const {fdToneNotify} = require('./bin/fdToneNotify');
    const {toneDetector} = require('./bin/toneDetector');
    const {csvToConfig} = require('./bin/csvToConfig');
    const {testNotifications} = require('./bin/testNotifications');

    if(options.csvToConfig)
        csvToConfig();
    else if(options.allToneDetector)
        toneDetector({webServer: options.webServer});
    else if(options.testNotifications)
        testNotifications();
    else
        fdToneNotify({webServer: options.webServer});
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
}

function defaultConfig(){
    if(!fs.existsSync('./config')){
        console.log('No config directory. Initializing with default configuration');
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
}

function validateOptions(options){
    const mainOptionSelectedCount = [options.testNotifications, options.allToneDetector].filter(v => !!v).length;
    if(mainOptionSelectedCount > 1)
        _exitWithError(`Multi main options selected. Can only selected one of the following: --all-tone-detector, --test-notifications`);
    if(options.port && !options.webServer)
        log.warning(`--port <port> option is meaningless without the --web-server option. ` +
            `Monitoring interface will only start on specified port when --web-server option is set`)
}

function _exitWithError(message){
    log.error(`Cannot run webserver in --test-notification mode`);
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