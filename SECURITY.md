# Security Policy

## Reporting a vulnerability

Email security@blueberrybytes.com.

Please do not report a vulnerability in a GitHub issue, discussion or pull request. They are public, and the report would be visible before there is a fix.

A useful report says what is affected, how to reproduce the problem and what an attacker could do with it. Screenshots, requests or a short proof of concept help. Tell us if you want to be credited.

We acknowledge every report within 3 business days. After that we tell you whether we can reproduce it and what we plan to do, and we keep you updated until it is fixed. Please give us a reasonable time to fix the problem before you publish anything, and tell us when you plan to publish.

## Scope

In scope:

- The hosted service at plan-ai.blueberrybytes.com and its API at api.plan-ai.blueberrybytes.com.
- The code in this repository: the backend, the web app, the desktop recorder, the mobile app and the voice service.
- The desktop and mobile apps we publish from this code.

Out of scope:

- Problems in third-party services we use, such as Firebase, Deepgram or OpenRouter. Report those to the vendor. A problem in how Plan AI uses one of them is in scope.
- Denial of service and load testing.
- Social engineering, phishing and physical attacks against our staff or offices.
- Reports from automated scanners with no demonstrated impact.

## How to test

Use only accounts and workspaces that you created. Do not read, change or delete data that belongs to other people. If you reach someone else's data by accident, stop, do not keep a copy, and tell us in your report. Do not run tests that could slow down or break the service for other users.

You can run the whole stack on your own machine from this repository. That is the best place for any test that could cause damage.

## Safe harbour

We will not take legal action against you, and we will not ask anyone else to, for research that follows this policy in good faith. If a third party takes action against you for such research, we will say that it was authorized by this policy.

## No bug bounty

There is no bug bounty and we do not pay for reports. We are glad to credit reporters who want it.

## Supported versions

The hosted service runs the latest code on `main`. Fixes are made on `main` and are not backported. Self-hosted installs should update to the latest `main`. For the desktop and mobile apps, only the latest release is supported.
