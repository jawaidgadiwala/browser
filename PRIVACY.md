# Privacy

Browser is built so that your browsing and your AI usage stay on your machine.

## No telemetry

Browser ships with analytics and crash reporting disabled. No usage events, no
crash reports, and no identifiers are sent anywhere by default. The upstream
project's analytics and crash endpoints are not configured in our builds.

## No hosted model

Browser has no hosted AI service of its own and does not route your prompts,
page content, or files through any service we operate. There is nothing to sign
up for and no account.

## Your keys stay local

You bring your own model: either a provider API key you enter yourself, or a
coding agent already installed on your machine (for example Claude Code). Keys
and agent credentials are stored in your local browser profile and are sent only
to the provider you chose, when you make a request. Requests go directly from
your machine to that provider, on your account and under that provider's own
privacy policy.

## What leaves your machine

- Web pages you visit, as with any browser.
- Requests you make to a model provider you configured, containing whatever
  context that request needs (your prompt, and page or file content when a tool
  you invoked reads it).
- Update checks, only once we publish an update feed; none is configured today.

## Source

Browser is AGPL-3.0 licensed and every distributed build ships with its source:
https://github.com/jawaidgadiwala/browser
