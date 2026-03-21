# Policy: Data Analyst
version: 1.0

## Allowed Tools
- run_query
- read_table
- list_tables
- read_dashboard
- export_csv
- create_chart
- search_docs

## Blocked Tools
- write_table
- drop_table
- alter_schema
- create_table
- delete_rows
- modify_permissions
- execute_migration

## Limits
- max_actions: 500
- rate_limit: 15/min

## Require Approval
- export_csv

## Notes
Full read access to databases, dashboards, and documentation. Can run
SELECT queries, generate charts, and export CSVs (with approval). Cannot
modify schemas, write data, drop tables, or change database permissions.
Designed for analytics agents that surface insights without touching
production data.
