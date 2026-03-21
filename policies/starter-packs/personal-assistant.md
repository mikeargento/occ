# Policy: Personal Assistant
version: 1.0

## Allowed Tools
- search_web
- search_calendar
- read_email
- draft_email
- read_contacts
- set_reminder
- read_weather
- read_news
- calculate
- read_file
- search_notes

## Blocked Tools
- send_email
- delete_email
- modify_calendar
- delete_contacts
- purchase
- transfer_funds
- post_social_media

## Limits
- max_actions: 200
- rate_limit: 30/min

## Require Approval
- draft_email

## Notes
Can read your email, calendar, and contacts. Can search the web and
draft emails. Cannot send emails, delete anything, make purchases,
or post on your behalf without explicit approval. Safe for daily use.
