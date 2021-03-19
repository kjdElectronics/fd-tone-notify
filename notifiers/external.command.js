const spawn = require('child_process').spawn;
const chalk = require('chalk');
const log = require('../util/logger');

async function runExternalCommand({command, description, timestamp, tones, matchAverages, recordingRelPath=null, detectorName, custom}){
    command = _formatCommand({command, description, timestamp, tones, matchAverages, recordingRelPath, detectorName, custom});
    const commandArray = command.match(/(".*?"|[^"\s]+)+(?=\s*|\s*$)/g);
    const args = commandArray.slice(1);
    return new Promise((resolve, reject) => {
        const child = spawn(commandArray[0], args);
        const outputLines = [];

        if(timestamp === 0)
            reject(1);

        child.stdout.on('data', function (data) {
            const str = data.toString();
            const lines = str.split(/(\r?\n)/g).filter(line => line !== "" && line !== "\r\n" && line !== "\n");
            lines.forEach(line => {
                outputLines.push(line);
                log.info(chalk.magenta(`  EXTERN ${description}: ${line}`));
            });
        });

        child.on('close', function (code) {
            let logLevel = "debug";
            if(code === 0)
                resolve(outputLines);
            else {
                reject(code);
                logLevel = "error";
            }
            log[logLevel]("  " + chalk.underline.magenta(`EXTERN ${description}: Exit Code ${code}`));

        });
    })
}

function _formatCommand(options){
    options.command = options.command.replace("[description]", _removeQuites(options.description));
    options.command = options.command.replace("[timestamp]", _removeQuites(options.timestamp));
    options.command = options.command.replace("[tones]", _removeQuites(options.tones));
    options.command = options.command.replace("[matchAverages]", _removeQuites(options.matchAverages));
    options.command = options.command.replace("[recordingRelPath]", _removeQuites(options.recordingRelPath));
    options.command = options.command.replace("[detectorName]", _removeQuites(options.detectorName));
    options.command = options.command.replace("[custom]", JSON.stringify(options.custom));
    return options.command;
}

function _removeQuites(str){
    if(str && str.length !== 0 && str[0] === '"' && str[str.length - 1] === '"')
        return str.substring(1, str.length-1);
    return str;
}

module.exports = {runExternalCommand};