# Contexts & Advanced RAG

Standard AI chatbots fall apart when dealing with highly specific technical issues because they lack the context of *your* business. A generic LLM cannot write a ticket to "Fix the authentication bug" because it doesn't know if you use Firebase, Auth0, or custom JWTs.

Plan AI solves this using **Contexts** and **Advanced Retrieval-Augmented Generation (RAG)**.

## What is a Context?

A Context in Plan AI is a defined boundary of knowledge that you explicitly attach to a meeting or a chat session.

You can create a Context for a specific microservice, a specific client, or an entire product. Inside that Context, you can upload:
1.  **Architecture Documents** (Markdown files explaining how the system works).
2.  **API Schemas** (Swagger/OpenAPI JSON files).
3.  **Code Snippets** (Specific components or functions).

When you generate a Jira ticket or ask the chat a question, Plan AI automatically fetches this Context and injects it into the prompt. 

This ensures the LLM's output is **grounded in your actual technical architecture**, drastically reducing hallucinations.

## Vector Search (RAG)

If your team has been using Plan AI for six months, you might have hundreds of hours of meeting transcripts. 

When you ask the chat, *"Why did we decide to use Qdrant instead of Pinecone?"*, the system doesn't just guess. 

1.  It uses **Qdrant** (our Vector Database) to perform a semantic similarity search across all historical transcripts in that Context.
2.  It retrieves the exact 5-minute chunk of a meeting from three months ago where the engineering team debated the cost-efficiency of Qdrant vs Pinecone.
3.  It feeds that specific chunk to the LLM to formulate an exact, cited answer.

This gives your TPMs and developers perfect corporate memory.
