const log = require('../util/logger');
const path = require('path');
const SECRET_NAMES = [
    "FD_PUSHBULLET_API_KEY",
    "FD_CORALOGIX_PRIVATE_KEY",
    "FD_SMTP_USERNAME",
    "FD_SMTP_PASSWORD",
];
const fs = require('fs');

function populateSecretsEnvVar({secretsPath="config/secrets.json", forceSecretsFile=false}={}){
    let secrets;
    const secretsFullPath = path.resolve(process.cwd(), `${secretsPath}`);
    log.silly(`Secrets Full Path: ${secretsFullPath}`);
    try {
        const data = fs.readFileSync(secretsFullPath);
        try{
            secrets = JSON.parse(data);
        }
        catch (e) {
            log.error(`Secrets file found but it does not contain valid JSON. Check syntax`);
            throw e;
        }
    }
    catch (e){
        if(forceSecretsFile) {
            log.emerg(`--force-secrets-file option is set but the secrets file cannot be loaded from ${secretsPath}. ` +
            `Check that the file exists and is a valid format. Secrets can also be loaded from Environment Variables ` +
            `using the following variables: ${SECRET_NAMES.join(", ")}`);
            process.exit(99);
        }
        log.warning(`Cannot access secrets file at ${secretsPath}. Only using secrets from env Vars`);
        secrets = {};
    }
    SECRET_NAMES.forEach(secretName => {
        if(forceSecretsFile){
            if(secrets.hasOwnProperty(secretName))
                assignSecretEnvVar({secretName, secrets, secretsPath});
            else
                log.silly(`Secret ${secretName} not provided in secrets file at ${secretsPath}. ENV Var Has Value: ${!!process.env[secretName]}`);
        }
        else{
            if(!process.env[secretName] && secrets.hasOwnProperty(secretName))
                assignSecretEnvVar({secretName, secrets, secretsPath});
            else
                log.silly(`Secret ${secretName} ${!!process.env[secretName] ? "set from ENV Var" : `not found in file at ${secretsPath} or ENV Var`}.`);
        }
        if(!process.env[secretName])
            log.warning(`Secret ${secretName} has not been set or has an empty value`);
    });
}

function assignSecretEnvVar({secretName, secrets, secretsPath}){
    process.env[secretName] = secrets[secretName];
    log.silly(`Setting ${secretName} to value from secrets file at ${secretsPath}`);
}

module.exports = {populateSecretsEnvVar};