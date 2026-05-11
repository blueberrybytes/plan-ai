# Setting up Deepgram

Plan AI uses [Deepgram](https://deepgram.com/) as its primary audio transcription engine. 

Deepgram is the industry standard for Voice AI. It provides incredibly fast, highly accurate transcriptions that are vastly superior to traditional providers like Google Cloud or AWS Transcribe, especially when dealing with technical jargon and multiple speakers.

## How to get your Deepgram Key

1.  Go to [console.deepgram.com](https://console.deepgram.com/) and create an account.
2.  Navigate to the **API Keys** section in the left sidebar.
3.  Click **Create a New API Key**.
4.  Name the key (e.g., `Plan AI Transcription`).
5.  Set the permission level to **Member** or **Admin** (so it has access to the transcription API).
6.  **Copy the key immediately.** You will not be able to see it again.

## Adding the Key to Plan AI

Once you have your Deepgram API key:

1.  Log in to your Plan AI Web Dashboard.
2.  Navigate to **Settings** > **Workspace Team**.
3.  Scroll down to the **API Configuration** section.
4.  Paste your key into the **Deepgram API Key** field.
5.  Click **Save**.

Like your OpenRouter key, this key will be instantly masked to protect your account.

## Deepgram Pricing

Deepgram is extremely cost-effective. At wholesale pricing, standard transcription costs roughly **$0.0043 per minute** ($0.25 per hour of audio). 

When you create a new Deepgram account, they typically provide **$200 in free credit**. This means you can transcribe roughly **800 hours** of engineering meetings for free before you ever have to enter a credit card.

*Note: If your audio files are uploading successfully from the Desktop Recorder but the transcripts are failing to generate, verify that your Deepgram API key is correct and that you have not exhausted your free credit tier.*
