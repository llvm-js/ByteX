const Language = require("./language");

function callCompiler(pathfile) {
    if (pathfile == undefined) {
        console.log('[Exception]: Insufficient number of arguments');
        process.exit(1);
    } else if (pathfile.endsWith('.bytex') || pathfile.endsWith('.byteX')) {
        console.log(`[VM]: COMPILING ${pathfile} FILE...`);
        const language = new Language();
        language.run(pathfile);
    }
}

let argv  = process.argv;
if (argv.length == 3) callCompiler(argv[2]);
