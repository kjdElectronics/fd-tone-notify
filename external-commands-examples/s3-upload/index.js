require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_ID
});

function setupProgram(){
    program
        .name("fd-tone-notify")
        .option('--recording-path <path>', 'Path to the recording')
        .option('--file-name <fileName>', 'Name to save file as in bucket')
        .parse();
}

const uploadFile = ({relativePath, fileName, }, callback) => {
    // Read content from the file
    const resolvedPath = path.resolve(relativePath);
    const fileContent = fs.readFileSync(resolvedPath);

    // Setting up S3 upload parameters
    const params = {
        Bucket: process.env.BUCKET_NAME,
        Key: fileName, // File name you want to save as in S3
        Body: fileContent,
        Tagging: "public=yes"
    };

    // Uploading files to the bucket
    s3.upload(params, function(err, data) {
        if (err) {
            throw err;
        }
        console.log(`File uploaded successfully. ${data.Location}`);
        callback(data);
    });
};

function main(){
    setupProgram();
    const options = program.opts();
    const recordingPath = options.recordingPath;
    uploadFile({relativePath: recordingPath, fileName: options.fileName}, (data) => {
        console.log("DONE");
    })
}

main();
