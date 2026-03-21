# Policy: Code Reviewer
version: 1.0

## Allowed Tools
- read_file
- list_files
- search_code
- read_pr
- comment_pr
- read_issues
- read_ci_status

## Blocked Tools
- merge_pr
- push_code
- delete_branch
- approve_pr
- create_release
- modify_workflow
- write_file

## Limits
- max_actions: 500
- rate_limit: 30/min

## Require Approval
- comment_pr

## Notes
Full read access to repositories, pull requests, issues, and CI status.
Can leave comments on PRs but only with human approval. Cannot merge,
push, approve, delete branches, or modify CI workflows. Designed for
automated code review assistants that surface issues without taking action.
