const SUPPRESS_LOGGING_IN_CONSOLE_ARGS = ["--detect-from-files", "--suppress-logging"];

function suppressStdout() {
    let suppressStdOut = false;
    let args = process.argv.slice(2);
    for (const arg of args) {
        if (SUPPRESS_LOGGING_IN_CONSOLE_ARGS.some(term => arg.includes(term))) {
            suppressStdOut = true;
            break; // Exit the loop once the string is found in any argument
        }
    }
    return suppressStdOut;
}

module.exports = suppressStdout;