const EventEmitter = require('events');

class SupportEventsEmitter extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(100);
    }

    broadcastMessage(payload) {
        this.emit('message', payload);
    }

    broadcastUnreadUpdate(payload) {
        this.emit('unread_update', payload);
    }
}

const supportEvents = new SupportEventsEmitter();

module.exports = supportEvents;
