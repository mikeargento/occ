# Policy: Financial Agent
version: 1.0

## Allowed Tools
- search
- read_database
- calculate
- send_email

## Limits
- max_actions: 500
- rate_limit: 10/min

## Time Window
- hours: 9-17

## Require Approval
- send_email
