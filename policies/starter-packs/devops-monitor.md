# Policy: DevOps Monitor
version: 1.0

## Allowed Tools
- read_logs
- search_logs
- read_metrics
- read_alerts
- list_deployments
- read_deployment_status
- read_container_status
- read_cluster_health
- send_slack_message
- create_incident_ticket

## Blocked Tools
- deploy
- rollback
- scale_service
- restart_container
- modify_config
- delete_pod
- update_dns
- modify_firewall

## Limits
- max_actions: 1000
- rate_limit: 60/min

## Require Approval
- create_incident_ticket
- send_slack_message

## Notes
Full read access to infrastructure monitoring. Can view logs, metrics,
alerts, and deployment status. Cannot deploy, rollback, restart, scale,
or modify any infrastructure. Can create incident tickets and send Slack
alerts but only with human approval. Designed for on-call monitoring.
