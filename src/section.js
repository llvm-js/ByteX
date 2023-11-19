class Section {
    static #section = {};
    static addr = 0;

    /**
     * 0x01 - variable
     * 0x02 - constant
     * 0x03 - func
     * 0x04 - label
    */

    static read(id) {
        return this.has(id) ? this.getSection()[id] : null;
    }

    static write(id, data) {
        if (!this.getSection()) this.createSection();
        this.getSection()[id] = data;
    }

    static createSection() {
        this.#section[this.addr] = {};
    }

    static has(id) {
        return this.getSection() ? Reflect.ownKeys(this.getSection()).includes(id) : false;
    }

    static hasSection() {
        return this.getSection() ? true : false;
    }

    static getSection() {
        return this.#section[this.addr];
    }

    static route(addr) {
        if (typeof addr === 'number') this.addr = addr;
    }

    static getAddress() {
        return this.addr;
    }
}

module.exports = Section;