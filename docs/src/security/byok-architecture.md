# The BYOK Architecture

Enterprise software development requires absolute privacy. When discussing proprietary algorithms, unreleased features, or sensitive client data, passing that information through a closed, consumer-grade AI subscription is a massive compliance risk.

Plan AI mitigates this by using a **Bring Your Own Key (BYOK)** architecture.

## How it Works

Instead of BlueberryBytes acting as a middleman and storing your data to train our own models, Plan AI is simply the "Engine". **You** provide the keys to the underlying AI providers.

1.  **Wholesale Pricing:** Because you are using your own API keys, you pay the exact wholesale API cost for transcription and LLM inference. We do not charge a "token tax" or markup your usage.
2.  **No Middleman:** Your audio is sent directly to Deepgram, and your transcripts are sent directly to OpenRouter. 
3.  **Workspace Isolation:** API keys are bound to a specific `Workspace` in the database. They are never shared globally across the platform.

### Key Masking Security
When you enter your API keys into the Plan AI dashboard, they are encrypted. 

If you or another TPM load the Workspace settings page, the API keys are returned from the backend completely masked (e.g., `••••••••••••••••`). The backend explicitly ignores this masked placeholder on subsequent `PUT` requests to prevent anyone from accidentally overwriting or inspecting the real keys.

## The "Bot-Free" Privacy Guarantee

Traditional AI meeting assistants work by dialing into your Zoom, Google Meet, or Teams call as a visible participant (a "bot"). This creates two massive privacy issues:
1.  **The Chilling Effect:** Participants behave differently when they know a third-party bot is recording them.
2.  **Lack of Control:** You cannot easily pause or redact sensitive moments without everyone seeing you interact with the bot.

**Plan AI does not use bots.** 

Instead, our native macOS and Windows desktop applications run quietly in your menu bar. They capture the raw system audio directly from your operating system's sound mixer. The recording happens entirely locally on your machine. 

If a client starts discussing a highly sensitive NDA topic, you simply click the pause button in your menu bar. The audio never leaves your machine, and the client never knows.
