class Stack {
    static #stack = [];
    static #addr = 0x00;

    static push(item) {
        this.#addr++;
        this.#stack[this.#addr] = item;
    }

    static pop() {
        this.#stack.pop();
        this.#addr--;
    }

    static pull() { return this.#stack[this.#addr]; }
    static dec() { this.#addr--; }
    static inc() { this.#addr++; }
    static at(i) { return this.#stack.at(i) }
}


module.exports = Stack;