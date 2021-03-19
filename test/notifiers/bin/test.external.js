const myArgs = process.argv.slice(2);

function main(){
    console.log('myArgs: ', myArgs);
    if(myArgs[0] === "0")
        process.exit(1);
}

main();