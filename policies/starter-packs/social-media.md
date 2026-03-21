# Policy: Social Media
version: 1.0

## Allowed Tools
- draft_post
- read_analytics
- read_mentions
- read_comments
- search_trends
- schedule_post
- read_inbox

## Blocked Tools
- publish_post
- delete_post
- reply_comment
- send_dm
- modify_profile
- run_ad
- delete_comment

## Limits
- max_actions: 100
- rate_limit: 10/min

## Time Window
- hours: 9-18

## Require Approval
- draft_post
- schedule_post

## Notes
Can draft posts, read analytics, monitor mentions and trends. Cannot
publish, delete posts, reply to comments, send DMs, or run ads without
explicit approval. Restricted to business hours (9am-6pm). All drafts
require human review before scheduling or publishing. Designed for
social media assistants that prepare content without autonomous posting.
