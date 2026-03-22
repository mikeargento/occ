# Policy: Financial Agent
version: 2.0

## Allowed Tools
- search_transactions
- read_account_balance
- read_account_history
- calculate
- generate_report
- send_email
- read_exchange_rates
- read_market_data

## Blocked Tools
- transfer_funds
- modify_account
- delete_records
- create_account
- update_credentials

## Limits
- max_actions: 500
- rate_limit: 10/min
- max_spend: $0

## Time Window
- hours: 8-18

## Require Approval
- send_email
- generate_report

## Notes
Read-only access to financial data. Can search, calculate, and generate
reports but cannot move money, modify accounts, or delete anything.
Email and report generation require human approval before execution.
Zero spend authority — this agent cannot authorize any transactions.
