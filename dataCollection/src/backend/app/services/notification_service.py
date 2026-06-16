"""
Notification Service - Enterprise-grade alerting system

Handles email and Slack notifications for:
- Extraction failures
- Scheduler errors
- Monthly extraction reports
"""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import requests
import json

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class NotificationService:
    """Enterprise notification service for extraction system monitoring."""

    def __init__(self):
        self.smtp_host = getattr(settings, "SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = getattr(settings, "SMTP_PORT", 587)
        self.smtp_username = getattr(settings, "SMTP_USERNAME", None)
        self.smtp_password = getattr(settings, "SMTP_PASSWORD", None)
        self.smtp_from = getattr(settings, "SMTP_FROM", "kpi-dashboard@telnet.com")
        self.smtp_use_tls = getattr(settings, "SMTP_USE_TLS", True)
        
        self.admin_emails = getattr(settings, "ADMIN_EMAILS", [])
        self.slack_webhook_url = getattr(settings, "SLACK_WEBHOOK_URL", None)
        
        # Email templates
        self.app_name = settings.APP_NAME
        self.app_version = settings.APP_VERSION

    def send_extraction_failure_alert(
        self,
        project_name: str,
        period: str,
        error_message: str,
        extraction_lot_id: Optional[int] = None
    ) -> bool:
        """
        Send alert when extraction fails.
        
        Args:
            project_name: Name of the project that failed
            period: Period string (e.g., "2026/05")
            error_message: Error details
            extraction_lot_id: Optional extraction lot ID for reference
            
        Returns:
            bool: True if notification sent successfully
        """
        if not self.admin_emails:
            logger.warning("[Notification] No admin emails configured, skipping alert")
            return False

        subject = f"🚨 [{self.app_name}] Extraction Failed - {project_name} ({period})"
        
        body = f"""
EXTRACTION FAILURE ALERT
========================

Application: {self.app_name} v{self.app_version}
Timestamp: {datetime.now(timezone.utc).isoformat()}
Project: {project_name}
Period: {period}
Extraction Lot ID: {extraction_lot_id or 'N/A'}

ERROR DETAILS:
-------------
{error_message}

ACTION REQUIRED:
--------------
Please investigate the extraction failure in the admin dashboard.
Check the extraction logs for more details.

This is an automated alert from {self.app_name}.
"""

        success = self._send_email(
            to_emails=self.admin_emails,
            subject=subject,
            body=body
        )

        if success:
            logger.info(f"[Notification] Extraction failure alert sent for {project_name}")
        else:
            logger.error(f"[Notification] Failed to send extraction failure alert for {project_name}")

        # Also send Slack alert if configured
        if self.slack_webhook_url:
            self._send_slack_alert(
                message=f"🚨 Extraction Failed: {project_name} ({period})",
                details=error_message,
                color="danger"
            )

        return success

    def send_monthly_extraction_report(
        self,
        period: str,
        summary: Dict[str, Any]
    ) -> bool:
        """
        Send monthly extraction summary report.
        
        Args:
            period: Period string (e.g., "2026/05")
            summary: Summary dictionary with extraction results
            
        Returns:
            bool: True if notification sent successfully
        """
        if not self.admin_emails:
            logger.warning("[Notification] No admin emails configured, skipping report")
            return False

        projects_processed = summary.get("projects_processed", 0)
        projects_failed = summary.get("projects_failed", [])
        total_snapshots = summary.get("total_snapshots", 0)

        subject = f"📊 [{self.app_name}] Monthly Extraction Report - {period}"
        
        body = f"""
MONTHLY EXTRACTION REPORT
========================

Application: {self.app_name} v{self.app_version}
Period: {period}
Generated: {datetime.now(timezone.utc).isoformat()}

SUMMARY:
--------
Projects Processed: {projects_processed}
Total KPI Snapshots: {total_snapshots}
Failed Projects: {len(projects_failed)}

"""

        if projects_failed:
            body += "FAILED PROJECTS:\n"
            body += "----------------\n"
            for failed in projects_failed:
                body += f"- {failed.get('project', 'Unknown')}: {failed.get('error', 'No error details')}\n"
            body += "\n"
        else:
            body += "✅ All extractions completed successfully!\n\n"

        body += f"""
DETAILS:
--------
- Extraction lots created for each active project
- KPI snapshots generated for all developers with missions
- Period automatically closed after successful extraction

View full details in the admin dashboard.

This is an automated report from {self.app_name}.
"""

        success = self._send_email(
            to_emails=self.admin_emails,
            subject=subject,
            body=body
        )

        if success:
            logger.info(f"[Notification] Monthly report sent for {period}")
        else:
            logger.error(f"[Notification] Failed to send monthly report for {period}")

        return success

    def send_scheduler_error_alert(
        self,
        error_message: str,
        job_name: str = "monthly_kpi_job"
    ) -> bool:
        """
        Send alert when scheduler job fails.
        
        Args:
            error_message: Error details
            job_name: Name of the failed job
            
        Returns:
            bool: True if notification sent successfully
        """
        if not self.admin_emails:
            logger.warning("[Notification] No admin emails configured, skipping alert")
            return False

        subject = f"🔴 [{self.app_name}] Scheduler Job Failed - {job_name}"
        
        body = f"""
SCHEDULER FAILURE ALERT
======================

Application: {self.app_name} v{self.app_version}
Timestamp: {datetime.now(timezone.utc).isoformat()}
Job Name: {job_name}

ERROR DETAILS:
-------------
{error_message}

ACTION REQUIRED:
--------------
The scheduler job has failed. Please check the application logs
and restart the scheduler if necessary.

This is an automated alert from {self.app_name}.
"""

        success = self._send_email(
            to_emails=self.admin_emails,
            subject=subject,
            body=body
        )

        if success:
            logger.info(f"[Notification] Scheduler error alert sent for {job_name}")
        else:
            logger.error(f"[Notification] Failed to send scheduler error alert for {job_name}")

        # Also send Slack alert if configured
        if self.slack_webhook_url:
            self._send_slack_alert(
                message=f"🔴 Scheduler Failed: {job_name}",
                details=error_message,
                color="danger"
            )

        return success

    def _send_email(
        self,
        to_emails: List[str],
        subject: str,
        body: str,
        html: bool = False
    ) -> bool:
        """
        Send email using SMTP.
        
        Args:
            to_emails: List of recipient email addresses
            subject: Email subject
            body: Email body content
            html: Whether body is HTML format
            
        Returns:
            bool: True if email sent successfully
        """
        if not self.smtp_username or not self.smtp_password:
            logger.warning("[Notification] SMTP credentials not configured, skipping email")
            return False

        try:
            msg = MIMEMultipart()
            msg["From"] = self.smtp_from
            msg["To"] = ", ".join(to_emails)
            msg["Subject"] = subject

            msg.attach(MIMEText(body, "html" if html else "plain"))

            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.smtp_use_tls:
                    server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)

            logger.info(f"[Notification] Email sent successfully to {len(to_emails)} recipients")
            return True

        except Exception as e:
            logger.error(f"[Notification] Failed to send email: {e}", exc_info=True)
            return False

    def _send_slack_alert(
        self,
        message: str,
        details: Optional[str] = None,
        color: str = "danger"
    ) -> bool:
        """
        Send Slack webhook alert.
        
        Args:
            message: Main alert message
            details: Optional detailed information
            color: Slack attachment color (danger, warning, good)
            
        Returns:
            bool: True if Slack alert sent successfully
        """
        if not self.slack_webhook_url:
            logger.debug("[Notification] Slack webhook not configured, skipping alert")
            return False

        try:
            attachment = {
                "color": color,
                "title": f"{self.app_name} Alert",
                "text": message,
                "footer": f"{self.app_name} v{self.app_version}",
                "ts": int(datetime.now(timezone.utc).timestamp())
            }

            if details:
                attachment["fields"] = [
                    {
                        "title": "Details",
                        "value": details[:1000],  # Slack field limit
                        "short": False
                    }
                ]

            payload = {
                "attachments": [attachment]
            }

            response = requests.post(
                self.slack_webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=10
            )

            if response.status_code == 200:
                logger.info("[Notification] Slack alert sent successfully")
                return True
            else:
                logger.error(f"[Notification] Slack webhook failed: {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"[Notification] Failed to send Slack alert: {e}", exc_info=True)
            return False


# Singleton instance
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    """Get or create notification service singleton."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
