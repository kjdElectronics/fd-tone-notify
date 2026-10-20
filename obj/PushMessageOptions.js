const moment = require('moment');

class PushMessageOptions{
    constructor({channelTag, title, body, timestamp, isTest=false, talkgroup=''}={}) {
        this.channelTag = channelTag;
        this.title = typeof title === 'string' ? title.replaceAll('%tg', talkgroup || '') : title;
        this.timestamp = timestamp ? timestamp : new Date().getTime();
        this._body = body;
        this.isTest = isTest
        this.talkgroup = talkgroup || '';
    }

    get body(){
        let b = this._body.replaceAll('%tg', this.talkgroup).replaceAll('%d', moment().format('MMMM Do YYYY, H:mm:ss'));
        if(this.isTest)
            b = 'TEST - ' + b;
        return b;
    }

}

module.exports = {PushMessageOptions};