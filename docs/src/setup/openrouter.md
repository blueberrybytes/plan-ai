# Setting up OpenRouter

Plan AI uses [OpenRouter](https://openrouter.ai/) as its primary Large Language Model (LLM) provider. 

OpenRouter is a unified interface that gives you access to the world's best models (Claude 3.5 Sonnet, GPT-4o, Llama 3, etc.) through a single API key. By using OpenRouter, Plan AI ensures you are never locked into a single AI ecosystem.

## How to get your OpenRouter Key

1.  Go to [openrouter.ai](https://openrouter.ai/) and create a free account.
2.  Navigate to the **Keys** section in your dashboard.
3.  Click **Create Key**.
4.  Give the key a recognizable name (e.g., `Plan AI Production`).
5.  **Copy the key immediately.** You will not be able to see it again once you close the window.

## Adding the Key to Plan AI

Once you have your OpenRouter API key:

1.  Log in to your Plan AI Web Dashboard.
2.  Navigate to **Settings** > **Workspace Team**.
3.  Scroll down to the **API Configuration** section.
4.  Paste your key into the **OpenRouter API Key** field.
5.  Click **Save**.

The interface will instantly mask the key to `••••••••••••••••` to ensure no other members of your workspace can view or copy it.

## Adding Credit

OpenRouter is a prepaid service. You must add credit to your OpenRouter account for Plan AI to generate tickets, docs, or answer chat queries.

1.  Go to the [OpenRouter Credits](https://openrouter.ai/credits) page.
2.  Add a small balance (e.g., $10). Because Plan AI uses wholesale pricing, $10 is usually enough to process hundreds of hours of meetings.

*Note: If Plan AI suddenly stops generating Jira tickets or the Chat interface throws an error, it is almost always because your OpenRouter credit balance has hit $0.00.*
