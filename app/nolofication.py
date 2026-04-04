"""
Nolofication Service Integration for Vinyl Vote
Provides centralized notification management through the Nolofication platform.
"""

import requests
import os
from typing import List, Optional, Dict, Any
from flask import current_app


class NoloficationService:
    """Service for sending notifications via Nolofication API."""
    
    def __init__(self):
        self.base_url = None
        self.site_id = None
        self.api_key = None
        self._initialized = False
    
    def _ensure_initialized(self):
        """Lazy initialization of config values from Flask app context."""
        if not self._initialized:
            self.base_url = current_app.config.get('NOLOFICATION_URL', 'https://nolofication.bynolo.ca')
            self.site_id = current_app.config.get('NOLOFICATION_SITE_ID', 'vinylvote')
            self.api_key = current_app.config.get('NOLOFICATION_API_KEY')
            
            if not self.api_key:
                current_app.logger.warning("NOLOFICATION_API_KEY not configured - notifications disabled")
            
            self._initialized = True
    
    def send_notification(
        self,
        user_id: str,
        title: str,
        message: str,
        notification_type: str = 'info',
        category: Optional[str] = None,
        html_message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send notification to a single user.
        
        Args:
            user_id: KeyN user ID
            title: Notification title
            message: Plain text message (fallback)
            notification_type: 'info', 'success', 'warning', or 'error'
            category: Category key (e.g., 'vote_reminders', 'updates')
            html_message: Optional HTML version of message
            metadata: Optional additional data
        
        Returns:
            Response from Nolofication API or error dict
        """
        self._ensure_initialized()
        
        if not self.api_key:
            current_app.logger.debug(f"Notification skipped (no API key): {title} -> user {user_id}")
            return {'success': False, 'error': 'Nolofication not configured'}
        
        url = f"{self.base_url}/api/sites/{self.site_id}/notify"
        
        payload = {
            'user_id': user_id,
            'title': title,
            'message': message,
            'type': notification_type
        }
        
        if category:
            payload['category'] = category
        
        if html_message:
            payload['html_message'] = html_message
        
        if metadata:
            payload['metadata'] = metadata
        
        headers = {
            'X-API-Key': self.api_key,
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            result = response.json()
            current_app.logger.info(f"Notification sent: {title} -> user {user_id} (status: {result.get('status', 'sent')})")
            return result
        except requests.exceptions.RequestException as e:
            current_app.logger.error(f"Failed to send notification: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_bulk_notification(
        self,
        user_ids: List[str],
        title: str,
        message: str,
        notification_type: str = 'info',
        category: Optional[str] = None,
        html_message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send notification to multiple users.
        
        Args:
            user_ids: List of KeyN user IDs
            title: Notification title
            message: Plain text message (fallback)
            notification_type: 'info', 'success', 'warning', or 'error'
            category: Category key (e.g., 'vote_reminders', 'updates')
            html_message: Optional HTML version of message
            metadata: Optional additional data
        
        Returns:
            Response from Nolofication API or error dict
        """
        self._ensure_initialized()
        
        if not self.api_key:
            current_app.logger.debug(f"Bulk notification skipped (no API key): {title} -> {len(user_ids)} users")
            return {'success': False, 'error': 'Nolofication not configured'}
        
        if not user_ids:
            return {'success': False, 'error': 'No user IDs provided'}
        
        url = f"{self.base_url}/api/sites/{self.site_id}/notify"
        
        payload = {
            'user_ids': user_ids,
            'title': title,
            'message': message,
            'type': notification_type
        }
        
        if category:
            payload['category'] = category
        
        if html_message:
            payload['html_message'] = html_message
        
        if metadata:
            payload['metadata'] = metadata
        
        headers = {
            'X-API-Key': self.api_key,
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            result = response.json()
            current_app.logger.info(f"Bulk notification sent: {title} -> {len(user_ids)} users")
            return result
        except requests.exceptions.RequestException as e:
            current_app.logger.error(f"Failed to send bulk notification: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_pending_notifications(
        self,
        user_id: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get pending scheduled notifications for this site.
        
        Args:
            user_id: Optional filter by KeyN user ID
            category: Optional filter by category key
            limit: Maximum results (default 100, max 1000)
            offset: Pagination offset (default 0)
        
        Returns:
            Dict with pending notifications or error
        """
        self._ensure_initialized()
        
        if not self.api_key:
            return {'error': 'Nolofication not configured'}
        
        url = f"{self.base_url}/api/sites/{self.site_id}/pending-notifications"
        params = {}
        
        if user_id:
            params['user_id'] = user_id
        if category:
            params['category'] = category
        params['limit'] = limit
        params['offset'] = offset
        
        headers = {'X-API-Key': self.api_key}
        
        try:
            response = requests.get(url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            current_app.logger.error(f"Failed to get pending notifications: {e}")
            return {'error': str(e)}
    
    def cancel_pending_notification(self, notification_id: int) -> Dict[str, Any]:
        """
        Cancel a pending scheduled notification.
        
        Args:
            notification_id: The ID of the pending notification to cancel
        
        Returns:
            Success message or error dict
        """
        self._ensure_initialized()
        
        if not self.api_key:
            return {'success': False, 'error': 'Nolofication not configured'}
        
        url = f"{self.base_url}/api/sites/{self.site_id}/pending-notifications/{notification_id}"
        headers = {'X-API-Key': self.api_key}
        
        try:
            response = requests.delete(url, headers=headers, timeout=10)
            response.raise_for_status()
            result = response.json()
            current_app.logger.info(f"Cancelled pending notification {notification_id}")
            return result
        except requests.exceptions.RequestException as e:
            current_app.logger.error(f"Failed to cancel notification {notification_id}: {e}")
            return {'success': False, 'error': str(e)}


# Global service instance
nolofication = NoloficationService()
