# Policy: Customer Support
version: 1.0

## Allowed Tools
- read_ticket
- search_tickets
- draft_reply
- read_customer
- search_knowledge_base
- add_internal_note
- update_ticket_status

## Blocked Tools
- send_reply
- issue_refund
- delete_ticket
- modify_customer
- escalate_without_approval
- close_account
- export_customer_data

## Limits
- max_actions: 300
- rate_limit: 20/min

## Require Approval
- draft_reply
- update_ticket_status

## Notes
Can read tickets, search the knowledge base, draft replies, and add
internal notes. Cannot send replies to customers, issue refunds, close
accounts, or export customer data without explicit approval. Drafts
are staged for human review before sending. Designed for frontline
support triage and response drafting.
