const grammar = require('./grammar/grammar.json');
const llvm = require("llvm.js/llvm"); 
const exceptions = require('llvm.js/exceptions');
const Section = require('./section');
const Stack = require('./stack');

class Compiler {
    current = 0;        
    currentInstruction = [];

    // Registers
    $r0 = 0x00;         $r1 = 0x00;
    $c0 = 0x00;         $c1 = 0x01;

    // Sections name
    SECTION_VARIABLE = 'variable';      SECTION_CONSTANT = 'const';

    exit = () => process.exit();
    exception = (msg, token, view = true) => { new exceptions.TokenException(msg, token, view); this.exit(); };
    exceptionInvalidToken = (token) => { new exceptions.TokenException('Invalid token', token); this.exit(); };

    getMiniAst = () => this.miniast = this.ast.slice(...this.isGrammar.sliceSize).filter(t => t.type !== 'SPACE');
    endIterator = () => { this.current = this.isGrammar.sliceSize[1]; this.isGrammar = null; };

    buildTokens(tokens) {
        let index = 0;

        while (index < tokens.length) {
            if (tokens[index].type == 'DOLLAR') {
                if (['NUMBER', 'IDENTIFER'].includes(tokens[index + 1].type)) {
                    tokens[index] = {
                        ...tokens[index],
                        type: 'IDENTIFER',
                        lexem: `${tokens[index].lexem}${tokens[index + 1].lexem}`
                    }

                    tokens[index + 1] = null;
                    index++;
                }
            }

            else if (`${tokens[index]?.lexem}${tokens[index + 1]?.type}${tokens[index + 2]?.lexem}` == '[IDENTIFER]') {
                tokens[index] = {
                    ...tokens[index],
                    type: 'IDENTIFER',
                    lexem: `${tokens[index].lexem}${tokens[index + 1].lexem}${tokens[index + 2].lexem}`
                }

                tokens[index + 1] = null;
                tokens[index + 2] = null;
                index += 2;
            }

            index++;
        }

        return tokens.filter(t => t != null);
    }

    run(ast) {
        this.ast = ast;
        this.ast = this.buildTokens(this.ast);

        while (this.current < this.ast.length) {
            if (this.scope == 'func') {
                if (this.current >= this.callEnd && this.isNext == true) {
                    this.current = this.currentJmp;
                    this.scope = null;
                    this.isNext = false;
                }
            }

            if (!this.isSegment() && this.scope == null) console.log(`0x${parseInt(this.current, 10).toString(16).padStart(16, '0')}:  ${this.ast[this.current].code.trimStart()}`);

            if (this.ast[this.current].type == 'EOF') break;

            if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.SegmentExpression))) {
                this.getMiniAst();
                const name = this.miniast[1];

                if (this.miniast[0].lexem == 'segment') {
                    if ([this.SECTION_VARIABLE, this.SECTION_CONSTANT].includes(name.lexem)) {
                        this.endIterator();
                        this.SegmentVariableExpression(name);
                    } else
                        this.exception('invalid name segment', name);
                } else if (this.miniast[0].lexem == 'func') {
                    this.endIterator();
                    this.FunctionDeclaration(name);
                } else if (this.miniast[0].lexem == 'main') {
                    this.endIterator();
                    this.MainProgram(name);
                } else if (this.miniast[0].lexem == 'label') {
                    this.endIterator();
                    this.LabelDeclaration(name);
                } else this.exceptionInvalidToken(this.miniast[0]);
            } else if (this.isInstruction(this.ast[this.current].lexem)) {
                this.currentInstruction.push(this.current);
                this.Instruction()[this.ast[this.current].lexem].call(this);
            } else {
                console.log(this.ast[this.current]);
                if (this.ast[this.current].type == "EOF") break;
                else if (this.ast[this.current].type == "SPACE") this.current++;
                else this.exceptionInvalidToken(this.ast[this.current]);
            }
        }
    }


    isSegment(current) {
        return [grammar.FunctionDeclaration, grammar.SegmentExpression, grammar.VariableRecord].map(grammar => Boolean(llvm.Grammar.verifyGrammarNoStrict(current ? current : this.current, this.ast, grammar))).includes(true);
    }


    SegmentVariableExpression(token) {
        if ([this.SECTION_VARIABLE, this.SECTION_CONSTANT].includes(token.lexem)) {
            while (this.current < this.ast.length) {
                if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.VariableRecord))) {
                    this.getMiniAst();
                    const [name, value] = [this.miniast[0], this.miniast[2]];

                    if (token.lexem == this.SECTION_VARIABLE) {
                        Section.route(0);
                        if (!Section.hasSection()) Section.createSection();
                        Section.write(name.lexem, value.type == 'STRING' ? value.lexem.slice(1, -1) : value.lexem);
                    } else if (token.lexem == this.SECTION_CONSTANT) {
                        Section.route(1);
                        if (!Section.hasSection()) Section.createSection();
                        if (!Section.has(name.lexem)) Section.write(name.lexem, value.type == 'STRING' ? value.lexem.slice(1, -1) : value.lexem);
                    }
                    
                    Section.route(0);
                    this.endIterator();
                } else {
                    break;
                }
            }
        }
    }

    startSectionWorker(address) {
        Section.route(address);
        if (!Section.hasSection()) Section.createSection();
    }


    endSectionWorker({ nodeID, end }, token) {
        if (!Section.has(token.lexem)) Section.write(token.lexem, JSON.parse(JSON.stringify({ nodeID, end, data: token })));
        Section.route(0);
    }


    bodyWhile_T() {
        let [nodeID, end] = [this.current, this.current];
        
        while (this.current < this.ast.length) {
            if (this.isSegment()) break;
            this.current++;
            end++;
        }

        return { nodeID, end };
    }


    FunctionDeclaration(token) {
        this.startSectionWorker(3);
        this.endSectionWorker(this.bodyWhile_T(), token);
    }


    LabelDeclaration(token) {
        this.startSectionWorker(4);
        this.endSectionWorker(this.bodyWhile_T(), token);
    }


    MainProgram() {
        while (this.current < this.ast.length) {
            if (this.isSegment()) break;

            if (this.ast[this.current]) {
                if (this.ast[this.current].type == "EOF") break;
                if (this.isInstruction(this.ast[this.current].lexem)) {
                    this.currentInstruction.push(this.current);
                    this.Instruction()[this.ast[this.current].lexem].call(this);
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }
        }
    }

    isInstruction(name) {
        return Object.getOwnPropertyNames(this.Instruction()).filter(i => !['length', 'name', 'prototype'].includes(i)).includes(name);
    }

    isRegister(name) {
        return name.startsWith('$') ? Object.getOwnPropertyNames(this).includes(name) : false;
    }

    getValue(token) {
        if (token.lexem.startsWith('$')) {
            if (/\$\d+/.test(token.lexem)) return { response: token.lexem, status: 200, register: true, argument: true };
            else if (!this.isRegister(token.lexem)) this.exceptionInvalidToken(token.lexem);
            return { response: token.lexem, status: 200, register: true };
        } else if (token.lexem.startsWith('[') && token.lexem.endsWith(']')) {
            return { response: Section.read(token.lexem.slice(1, -1)), status: Section.read(token.lexem.slice(1, -1)) ? 200 : 404, section: true };
        } else if (['NUMBER', 'STRING'].includes(token.type)) {
            if (token.type == 'STRING') return { response: token.lexem.slice(1, -1), status: 200, primitive: true };
            return { response: token.lexem, status: 200, primitive: true };
        } else {
            this.exceptionInvalidToken(token);
        }
    }

    handleExceptionValue(value, token) {
        if (this.isExceptionValue(value?.response)) this.exception('Invalid read value', token);
    }

    isExceptionValue(value) {
        return [undefined, null, NaN, Infinity].includes(value);
    }

    handleValue(value, token) {
        if (value?.argument) return { response: this[value?.response] };
        else if (value?.register) return { response: this[value?.response] };
        else if (value?.section) return { response: Section.read(token?.lexem.slice(1, -1)) };
        else if (value?.primitive) {
            if (/[0-9]+/.test(value.response)) return { response: +value.response };
            return { response: value.response };
        }
        return { response: value.response };
    }


    Instruction() {
        return class {
            static mov() {
                let change, value;

                if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.Inctruction['mov@2']))) {
                    this.getMiniAst();
                    [change, value] = this.miniast.slice(1).map(token => this.getValue(token));
                    value = this.handleValue.call(this, value, this.miniast[2]);
                    this.handleExceptionValue.call(this, value, this.miniast[2]);

                    if (![change.argument, change.register].every(t => t == true)) {
                        this[change.response] = value.response;
                    } else if ([change?.argument, change?.register].every(t => t == true)) {
                        this[change.response] = value.response;
                    } else if (change?.register) {
                        this[change.response] = value.response;
                    } else if (change?.section) {
                        Section.write(this.miniast[1]?.lexem.slice(1, -1), value.response);
                    }
                    
                    this.current = this.isGrammar.sliceSize[1];
                }
                
                else if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.Inctruction['mov@1']))) {
                    this.getMiniAst();
                    value = this.miniast.slice(1).map(token => this.getValue(token))[0];
                    value = this.handleValue.call(this, value, this.miniast[1])?.response;
                    this.$r0 = this.$r1;
                    this.$r1 = value;
                    this.current = this.isGrammar.sliceSize[1];
                }
                
                else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static sct() {
                if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.Inctruction.sct))) {
                    this.getMiniAst();
                    let address = this.miniast.slice(1)[0];
                    Section.route(+address?.lexem);
                    this.current = this.isGrammar.sliceSize[1];
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static func() {
                if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.Inctruction.func))) {
                    this.getMiniAst();
                    const [name, currentAddress] = [this.miniast.slice(1)[0], Section.getAddress()];
                    Section.route(3);
                    const func = Section.read(name.lexem);

                    [
                        this.current, this.scope,
                        this.callStackTrace, this.callEnd, this.currentJmp
                    ] = [
                        func.nodeID,
                        'func',
                        name, func.end, this.isGrammar.sliceSize[1]
                    ];

                    this.isNext = true;
                    Section.route(currentAddress);
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static goto() {
                if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.Inctruction.goto))) {
                    this.getMiniAst();
                    const [name, currentAddress] = [this.miniast[1], Section.getAddress()];
                    Section.route(4);
                    const label = Section.read(name.lexem);

                    [
                        this.current, this.scope,
                        this.callStackTrace, this.callEnd, this.currentJmp
                    ] = [
                        label.nodeID, 'func', // FUTURE NOTE: swap 'label'
                        name, label.end, this.isGrammar.sliceSize[1]
                    ];

                    this.isNext = true;
                    Section.route(currentAddress);
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static push() {
                if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.Inctruction['push@1']))) {
                    this.getMiniAst();
                    let value = this.getValue(this.miniast.slice(1)[0]);
                    value = this.handleValue.call(this, value, this.miniast[1]);
                    
                    if (this.scope == 'func') {
                        if (this.isExceptionValue(value?.response)) this.exception(`The argument is not defined ${this.miniast[1].lexem}`,  this.callStackTrace, false);
                    } else this.handleExceptionValue.call(this, value, this.miniast[1]);
                    
                    value = this.handleValue(value, this.miniast[1]);
                    if (this.isExceptionValue(value?.response)) this.exception(`The argument is not defined`,  this.scope == 'func' ? this.callStackTrace : this.miniast[1] , this.scope != 'func');
                    else Stack.push(value.response);

                    this.current = this.isGrammar.sliceSize[1];
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static pop() {
                if (this.ast[this.current].line < this.ast[this.current + 1].line) {
                    Stack.pop();
                    this.current += 1;
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static pull() {
                if (this.ast[this.current].line < this.ast[this.current + 1].line) {
                    this.$r0 = this.$r1;
                    this.$r1 = Stack.pull();
                    this.current += 1;
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static rand() {
                if (this.ast[this.current].line < this.ast[this.current + 1].line) {
                    this.$r0 = this.$r1;
                    let max = Stack.pull();
                    let min = Stack.at(-2);
                    this.$r1 = Math.floor(Math.random() * (max - min + 1) + min);
                    this.current++;
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static inc() {
                if (this.ast[this.current].line < this.ast[this.current + 1].line) {
                    this.$r0 = this.$r1;
                    this.$r1 = Stack.pull() + 1;
                    this.current += 1;
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static dec() {
                if (this.ast[this.current].line < this.ast[this.current + 1].line) {
                    this.$r0 = this.$r1;
                    this.$r1 = typeof Stack.pull() == 'number' ? Stack.pull() - 1 : 0;
                    this.current += 1;
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static call() {
                if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.Inctruction.call))) {
                    this.getMiniAst();
                    let addr = +this.miniast.slice(1)[0].lexem;

                    switch (addr) {
                        case 0x00: process.exit();
                        case 0x01: console.clear(); break;
                        case 0x04: console.log(typeof Stack.pull() == 'number' ? String(Stack.pull()) : Stack.pull()); break;
                        default:
                            this.exception(`The system call number is unknown`,  this.miniast[1]);
                            break;
                    }

                    this.current = this.isGrammar.sliceSize[1];
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static quit() { process.exit(); }

            static shl() { Compiler.Alias().shift.call(this, (a, b) => +a << +b); }
            static shr() { Compiler.Alias().shift.call(this, (a, b) => +a >> +b); }

            static add() { Compiler.Alias().math.call(this, true, (a, b) => a += b); }
            static sub() { Compiler.Alias().math.call(this, true, (a, b) => a -= b); }
            static mul() { Compiler.Alias().math.call(this, false, (a, b) => a *= b); }
            static div() { Compiler.Alias().math.call(this, false, (a, b) => a /= b); }
            static mod() { Compiler.Alias().math.call(this, false, (a, b) => a %= b); }
            static atan() { Compiler.Alias().math.call(this, false, (a, b) => Math.atan2(a, b)); }

            static equ() { Compiler.Alias().logic.call(this, (a, b) => a == b); }
            static cmp() { Compiler.Alias().logic.call(this, (a, b) => a > b); }
            static xor() { Compiler.Alias().logic.call(this, (a, b) => a ^ b); }
            static and() { Compiler.Alias().logic.call(this, (a, b) => a && b); }
            static or() { Compiler.Alias().logic.call(this, (a, b) => a || b); }

            static jmpg() { this.$r1 >= 1 ? Compiler.Alias().jump.call(this) : this.current += 2; }
            static jmpz() { this.$r1 == 0 ? Compiler.Alias().jump.call(this) : this.current += 2; }
        }
    }


    static Alias() {
        return class {
            static math(isZero, cb) {
                if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.Inctruction.math))) {
                    this.getMiniAst();
                    Compiler.Math().math.call(this, this.miniast.slice(1), isZero, cb);
                    this.current = this.isGrammar.sliceSize[1];
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static logic(cb) {
                if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.Inctruction.logic))) {
                    this.getMiniAst();
                    Compiler.Logic().logic.call(this, this.miniast.slice(1), cb);
                    this.current = this.isGrammar.sliceSize[1];
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static jump() {
                if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.Inctruction.jumpCondition))) {
                    this.getMiniAst();
                    const [name, currentAddress] = [this.miniast[1], Section.getAddress()];
                    Section.route(4);
                    const label = Section.read(name.lexem);

                    [
                        this.current,  this.scope,
                        this.callStackTrace, this.callEnd, this.currentJmp
                    ] = [
                        label.nodeID, 'func',
                        name, label.end, this.isGrammar.sliceSize[1]
                    ];

                    this.isNext = true;
                    Section.route(currentAddress);
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }

            static shift(cb) {
                if ((this.isGrammar = llvm.Grammar.verifyGrammarNoStrict(this.current, this.ast, grammar.Inctruction.logic))) {
                    this.getMiniAst();
                    let values = Compiler.Utils().getValues.call(this, this.miniast.slice(1));
                    this.$r0 = this.$r1;
                    this.$r1 = cb(+values[0], +values[1]);
                    this.current = this.isGrammar.sliceSize[1];
                } else this.exceptionInvalidToken(this.ast[this.current]);
            }
        }
    }


    static Math() {
        return class {
            static math(miniast, zero, cb) {
                let values = Compiler.Utils().getValues.call(this, miniast);
                let total =  zero ? 0 : 1;
                values.reduce((a, b) => total = cb(a, b));
                if (String(total).indexOf('.') > -1) total = total.toFixed(2);
                this.$r0 = this.$r1;
                this.$r1 = total;
            }
        }
    }

    static Logic() {
        return class {
            static logic(miniast, cb) {
                let values = Compiler.Utils().getValues.call(this, miniast);
                this.$r0 = this.$r1;
                this.$r1 = cb(...values) ? 1 : 0;
            }
        }
    }


    static Utils() {
        return class {
            static getValues(miniast) {
                let valuesAST = miniast;
                let values = miniast;
                values = values.map(token => this.getValue(token));
                values = values.map((value, i) => this.handleValue.call(this, value, valuesAST[i]));
                return values.map(value => value?.response);
            }
        }
    }
}

module.exports = Compiler;