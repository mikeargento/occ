# Policy: Financial Agent
version: 2.0

## Allowed Tools
- read_transactions
- read_balance
- read_statements
- categorize_transaction
- generate_report
- read_invoices
- search_transactions
- calculate

## Blocked Tools
- transfer_funds
- send_payment
- modify_account
- create_card
- approve_transaction
- set_budget
- delete_transaction

## Limits
- max_actions: 200
- rate_limit: 10/min

## Time Window
- hours: 8-20

## Require Approval
- generate_report
- categorize_transaction

## Notes
Read-only access to financial data. Can view transactions, balances,
statements, and invoices. Can categorize transactions and generate
reports with approval. Zero spend authority — cannot transfer funds,
send payments, modify accounts, or approve any transaction. Designed
for bookkeeping assistants and financial monitoring.
