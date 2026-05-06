# Jira Integration Compliance Plan

You are required to implement the Personal Data Reporting API
Apps that store personal data must take extra steps to ensure they meet our customer expectations as well as applicable privacy laws. Before proceeding, please confirm that you have implemented the Personal Data Reporting API. Read more about the Jira Personal Data Reporting API. Read more about the Confluence Personal Data Reporting API.

# Links

- [Atlassian User Privacy Developer Guide](https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/)
- [Atlassian Connect Specification](https://developer.atlassian.com/cloud/confluence/user-privacy-developer-guide/)

1. **Document Current Data Footprint**
   - Catalogue all personal data stored for Jira-connected users (user profiles, sessions, transcripts, tasks, integration tokens).
   - Map each data type to its storage location (PostgreSQL tables via Prisma, Firebase Storage, etc.).
   - Record retention periods and existing cleanup jobs, if any.

2. **Design GDPR Reporting Handlers**
   - Define export response payloads covering every personal-data entity.
   - Define deletion logic to anonymize or remove all records tied to a given Atlassian account ID.
   - Decide on idempotent behavior for repeated delete/export calls.

3. **Implement Personal Data Reporting API Endpoints**
   - Add authenticated webhooks (e.g., `/api/gdpr/jira/export` and `/api/gdpr/jira/delete`).
   - Verify requests using Atlassian shared secret (header validation + signature check).
   - Query Prisma for matching data and stream JSON export responses.
   - Apply cascading deletes/anonymization, including Firebase assets and vector store content if applicable.

4. **Update Atlassian App Descriptor**
   - Register the new GDPR endpoints inside `atlassian-connect.json` (or Forge manifest).
   - Include scopes/permissions required for data-privacy events.
   - Bump app version and document the change.

5. **Add Automated Tests & Logging**
   - Unit test data fetch/delete services for a mocked Atlassian account ID.
   - Integration test webhooks using signed sample requests from Atlassian docs.
   - Add structured logging for export/delete events (success + failure cases).

6. **Validate End-to-End**
   - Use Atlassian sandbox to trigger User Privacy export and deletion requests.
   - Confirm responses meet Atlassian schema requirements and that deletions propagate to all stores.
   - Re-run regression tests for Jira OAuth flow to ensure no regressions.

7. **Documentation & Ops Updates**
   - Update internal runbooks with GDPR handling procedures.
   - Mention Personal Data Reporting coverage in the public privacy policy.
   - Communicate deployment steps (config keys, secrets) to DevOps.

8. **Release & Monitor**
   - Deploy backend with new endpoints and descriptor changes.
   - Submit updated app listing/checklist acknowledging Personal Data Reporting support.
   - Monitor logs for incoming GDPR events and set alerts for failures.
