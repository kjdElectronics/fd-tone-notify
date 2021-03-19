const moment = require('moment');

class PushMessageOptions{
    constructor({channelTag, title, body, timestamp, isTest=false}={}) {
        this.channelTag = channelTag;
        this.title = title;
        this.timestamp = timestamp ? timestamp : new Date().getTime();
        this._body = body;
        this.isTest = isTest
    }

    get body(){
        let b = this._body.replace('%d', moment().format('MMMM Do YYYY, H:mm:ss'));
        if(this.isTest)
            b = 'TEST - ' + b;
        return b;
    }

}

module.exports = {PushMessageOptions};