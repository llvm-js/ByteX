const fs = require('fs');
const llvm = require('llvm.js/llvm');
const Compiler = require('./compiler');

class Language {
    run(src) {
        if (fs.existsSync(src)) {
            llvm.Config.setCommentLine(';');
            let file_c = fs.readFileSync(src).toString('utf8').split('\n');
        
            const lexer = new llvm.Lexer();
            let ast = lexer.lexer(file_c);
            ast = ast.filter(tree => !['WHITESPACE', 'COMMENT'].includes(tree.type));
            ast = ast.filter(tree => tree.type != 'SPACE');

            const compiler = new Compiler();
            compiler.run(ast);
        }
    }
}

const language = new Language();

module.exports = Language;