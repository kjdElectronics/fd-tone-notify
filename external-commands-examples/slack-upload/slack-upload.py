from slack_sdk import WebClient
from sys import argv
from json import loads as json_loads, load as json_load
from datetime import datetime
import pytz


#
# arguments should be 
# [timestamp] "[detectorName]" [description] [recordingRelPath] [filename] [custom]


# Creates variables from the arguments
timestamp=int(argv[1])/1000 #this is in epochs time
detectorName=str(argv[2]).strip('"') #removes the double quotes around the Detector
recordingRelPath=argv[4]
filename=argv[5]
custom=json_loads(argv[6]) #json is a string, need to convert to a json

# Open secret file
secret_file=open(custom['slack-secret-file'])
slack_token=json_load(secret_file)[custom['slack-token-name']]

# Converts timestamp from epochs time to UTC
tz = pytz.timezone('UTC') # America/New_York, America/Chicago, America/Los_Angeles 
dt = datetime.fromtimestamp(timestamp, tz)
# print it
timestamp=dt.strftime('%Y-%m-%d %H:%M:%S') # formats as 2022-12-31 00:00:00 (Year-Month-Day Hour:Minute:Second)

print(custom['slack-channel'], slack_token)


# Opens the Slack Connection
client = WebClient(slack_token) 
# Uploads the file
client.files_upload(
    channels=custom['slack-channel'], 
    title=detectorName+" Page Received",
    filename=filename,
    file=recordingRelPath,
    filetype='mp3',
    initial_comment=detectorName+" Page Received at "+timestamp, #Need to change Epoch time to EST
)