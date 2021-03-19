const chalk = require('chalk');
const fs = require('fs');
const readline = require("readline");
const FILE_NAME = 'license.txt';
const path = require('path');
const LICENCE_PATH = path.resolve(process.cwd(), `${FILE_NAME}`);


const LICENCE = `
FD Tone Notify is licensed under the GPL-3.0 License. Source code for FD Tone Notify is available on GitHub: 
https://github.com/kjdElectronics/fd-tone-notify

`;

async function checkLicense() {
    if(licenseExists()){
        const data = fs.readFileSync(LICENCE_PATH).toString();
        if(data === LICENCE)
            return;

    }
    await printAndRequireAcceptance();
}

function licenseExists() {
    try {
        if (fs.existsSync(LICENCE_PATH)) {
            return true;
        }
    } catch(err) {
        return false;
    }
}

async function printAndRequireAcceptance(){
    console.log(LICENCE);
    console.log("------------------------");
    await prompt();

    console.log('Welcome to FD Tone Notify!');
    writeFile();
}

async function prompt() {
    const rl = readline.createInterface(
        process.stdin, process.stdout);

    const question = 'Type "YES" to acknowledge the GPL. To exit the application type NO (this is a one time prompt).' +
        '\r\nDo You Acknowledge: ';
    return new Promise(resolve =>  rl.question(question, (text) => {
        if(text.toUpperCase() !== "YES"){
            console.log("TERMS OF USE declined. Please remove FD Tone Notify from your device.");
            process.kill(process.pid);
        }
        rl.close();
        resolve();
    }));
}

function writeFile(){
    fs.writeFileSync(LICENCE_PATH, LICENCE);
}

module.exports = {checkLicense};

