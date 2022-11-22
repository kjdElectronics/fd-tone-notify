# Slack Upload
This external script uses Python to upload a file to Slack. 

## Prerequisites
1) A Slack App with a bot token [(Instructions)](https://api.slack.com/authentication/basics)
    ***Important*** - make sure that the bot has `chat:write` and `files:write` OAuth scopes
2) A Slack Channel ID [(Instructions)](https://help.socialintents.com/article/148-how-to-find-your-slack-team-id-and-slack-channel-id)
    ***Important*** - the Slack App must be a member of the channel
3) Python and Pip

## Setup
### Installation
In order to use this script, you will need to install the `slack-sdk` package from pip.
```
pip install slack-sdk
```

### Configuration

In your configuration file, in the respective detector config. Make sure to use your values for `slack-channel` and `slack-token`, along with the valid path to the script.
```json
"externalCommands": [{
    "command": "python3 /path/to/script/slack-upload.py [timestamp] \"[detectorName]\" [recordingRelPath] [filename] [custom]",
    "description": "Slack Uploader",
    "custom": {
        "anyObject": true,
        "slack-channel": "your-channel-id",
        "slack-secret-file":"/path/to/file/slack-secrets.json",
        "slack-token-name":"token-1"
    }     
}]
```
For more config information view the [External Commands README](../../README.md#external-commands) file.
#### Secrets File
The script is expecting a secrets file with the slack token in it. As noted in the [Configuration](#configuration), you need `slack-secret-file` which denotes the path of the secrets file, and `slack-token-name` which denotes the JSON key for the token. 

Check [slack-secrets.json](slack-secrets.json) for an example.


## Customization
### Custom message per detector
If you have want a custom message, you can edit `initial_comment` on line 36 of `slack-upload.py`<br>
You may want to add another key in the `custom` section of the Configuration json.<br>
##### Generic Custom
```json
"externalCommands": [{
    ...
    "custom": {
        ...
        "slack-message": "Detector - My custom message"
    } 
}]       
```
Then changing `slack-upload.py` to
```python
...
initial_comment=custom['slack-message']
```

##### Custom Formatted
You can extend this with formatting 
```json
"externalCommands": [{
    ...
    "custom": {
        ...
        "slack-message": "{} - My custom message at {}"
    } 
}]       
```
Then changing `slack-upload.py` to
```python
...
initial_comment=custom['slack-message'].format(detectorName,timestamp)
```
