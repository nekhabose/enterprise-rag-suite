"""
Tenant Management Module
Handles multi-tenant operations
"""
from typing import Dict, List, Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor
import hashlib
import secrets
from datetime import datetime, timedelta

class TenantManager:
    """Manage multi-tenant operations"""
    
    def __init__(self, db_connection_string: str):
        """
        Initialize tenant manager
        
        Args:
            db_connection_string: PostgreSQL connection string
        """
        self.db_url = db_connection_string
    
    def _get_connection(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    def create_tenant(
        self,
        name: str,
        domain: str,
        plan: str = "free",
        max_users: int = 10,
        max_storage_gb: int = 5
    ) -> Dict[str, Any]:
        """
        Create new tenant
        
        Args:
            name: Tenant/organization name
            domain: Unique domain identifier
            plan: Subscription plan (free, pro, enterprise)
            max_users: Maximum number of users
            max_storage_gb: Maximum storage in GB
            
        Returns:
            Created tenant dict
        """
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        try:
            cur.execute("""
                INSERT INTO tenants (name, domain, plan, max_users, max_storage_gb, is_active)
                VALUES (%s, %s, %s, %s, %s, true)
                RETURNING id, name, domain, plan, created_at
            """, (name, domain, plan, max_users, max_storage_gb))
            
            tenant = dict(cur.fetchone())
            conn.commit()
            
            return tenant
            
        except psycopg2.IntegrityError:
            conn.rollback()
            raise ValueError(f"Tenant with domain '{domain}' already exists")
        finally:
            cur.close()
            conn.close()
    
    def get_tenant(self, tenant_id: int) -> Optional[Dict]:
        """Get tenant by ID"""
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT * FROM tenants WHERE id = %s
        """, (tenant_id,))
        
        tenant = cur.fetchone()
        result = dict(tenant) if tenant else None
        
        cur.close()
        conn.close()
        
        return result
    
    def get_tenant_by_domain(self, domain: str) -> Optional[Dict]:
        """Get tenant by domain"""
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT * FROM tenants WHERE domain = %s
        """, (domain,))
        
        tenant = cur.fetchone()
        result = dict(tenant) if tenant else None
        
        cur.close()
        conn.close()
        
        return result
    
    def update_tenant(
        self,
        tenant_id: int,
        **updates
    ) -> Dict[str, Any]:
        """
        Update tenant settings
        
        Args:
            tenant_id: Tenant ID
            **updates: Fields to update
            
        Returns:
            Updated tenant dict
        """
        allowed_fields = ['name', 'plan', 'max_users', 'max_storage_gb', 'features', 'settings', 'is_active']
        
        updates_filtered = {k: v for k, v in updates.items() if k in allowed_fields}
        
        if not updates_filtered:
            raise ValueError("No valid fields to update")
        
        set_clause = ", ".join([f"{k} = %s" for k in updates_filtered.keys()])
        values = list(updates_filtered.values()) + [tenant_id]
        
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute(f"""
            UPDATE tenants
            SET {set_clause}
            WHERE id = %s
            RETURNING *
        """, values)
        
        tenant = dict(cur.fetchone())
        conn.commit()
        
        cur.close()
        conn.close()
        
        return tenant
    
    def delete_tenant(self, tenant_id: int) -> bool:
        """
        Delete tenant (soft delete by deactivating)
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            True if successful
        """
        conn = self._get_connection()
        cur = conn.cursor()
        
        cur.execute("""
            UPDATE tenants SET is_active = false WHERE id = %s
        """, (tenant_id,))
        
        success = cur.rowcount > 0
        conn.commit()
        
        cur.close()
        conn.close()
        
        return success
    
    def get_tenant_users(self, tenant_id: int) -> List[Dict]:
        """Get all users for a tenant"""
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT 
                id, email, role, created_at,
                (SELECT COUNT(*) FROM documents WHERE user_id = users.id) as document_count,
                (SELECT COUNT(*) FROM videos WHERE user_id = users.id) as video_count
            FROM users
            WHERE tenant_id = %s
            ORDER BY created_at DESC
        """, (tenant_id,))
        
        users = [dict(row) for row in cur.fetchall()]
        
        cur.close()
        conn.close()
        
        return users
    
    def invite_user(
        self,
        tenant_id: int,
        email: str,
        role: str,
        invited_by_user_id: int
    ) -> Dict[str, Any]:
        """
        Create invitation for new user
        
        Args:
            tenant_id: Tenant ID
            email: Email to invite
            role: Role for new user
            invited_by_user_id: User creating invitation
            
        Returns:
            Invitation dict with token
        """
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Generate secure token
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now() + timedelta(days=7)
        
        cur.execute("""
            INSERT INTO invitations (tenant_id, invited_by, email, role, token, expires_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, email, token, expires_at
        """, (tenant_id, invited_by_user_id, email, role, token, expires_at))
        
        invitation = dict(cur.fetchone())
        conn.commit()
        
        cur.close()
        conn.close()
        
        return invitation
    
    def accept_invitation(self, token: str) -> Optional[Dict]:
        """
        Accept invitation and get tenant info
        
        Args:
            token: Invitation token
            
        Returns:
            Tenant and invitation info if valid
        """
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT i.*, t.name as tenant_name, t.domain
            FROM invitations i
            JOIN tenants t ON i.tenant_id = t.id
            WHERE i.token = %s 
                AND i.status = 'pending' 
                AND i.expires_at > NOW()
        """, (token,))
        
        invitation = cur.fetchone()
        
        if invitation:
            # Mark as accepted
            cur.execute("""
                UPDATE invitations SET status = 'accepted' WHERE id = %s
            """, (invitation['id'],))
            conn.commit()
            
            result = dict(invitation)
        else:
            result = None
        
        cur.close()
        conn.close()
        
        return result
    
    def check_usage_limits(self, tenant_id: int) -> Dict[str, Any]:
        """
        Check if tenant is within usage limits
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Dict with usage vs limits
        """
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get tenant limits
        cur.execute("""
            SELECT max_users, max_storage_gb FROM tenants WHERE id = %s
        """, (tenant_id,))
        
        tenant = cur.fetchone()
        
        if not tenant:
            return {'error': 'Tenant not found'}
        
        # Get current usage
        cur.execute("""
            SELECT COUNT(*) as user_count FROM users WHERE tenant_id = %s
        """, (tenant_id,))
        user_count = cur.fetchone()['user_count']
        
        cur.execute("""
            SELECT COALESCE(SUM(pg_column_size(content)), 0) as storage_bytes
            FROM chunks ch
            JOIN documents d ON ch.document_id = d.id
            JOIN users u ON d.user_id = u.id
            WHERE u.tenant_id = %s
        """, (tenant_id,))
        storage_bytes = cur.fetchone()['storage_bytes']
        storage_gb = storage_bytes / (1024 * 1024 * 1024)
        
        cur.close()
        conn.close()
        
        return {
            'users': {
                'current': user_count,
                'limit': tenant['max_users'],
                'percentage': round((user_count / tenant['max_users']) * 100, 1) if tenant['max_users'] > 0 else 0,
                'can_add': user_count < tenant['max_users']
            },
            'storage': {
                'current_gb': round(storage_gb, 2),
                'limit_gb': tenant['max_storage_gb'],
                'percentage': round((storage_gb / tenant['max_storage_gb']) * 100, 1) if tenant['max_storage_gb'] > 0 else 0,
                'can_add': storage_gb < tenant['max_storage_gb']
            }
        }
    
    def log_usage(
        self,
        tenant_id: int,
        user_id: int,
        action_type: str,
        resource_type: str = None,
        resource_id: int = None,
        metadata: Dict = None
    ) -> None:
        """
        Log usage event
        
        Args:
            tenant_id: Tenant ID
            user_id: User ID
            action_type: Type of action
            resource_type: Type of resource
            resource_id: Resource ID
            metadata: Additional metadata
        """
        conn = self._get_connection()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO usage_logs (tenant_id, user_id, action_type, resource_type, resource_id, metadata)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (tenant_id, user_id, action_type, resource_type, resource_id, str(metadata) if metadata else None))
        
        conn.commit()
        cur.close()
        conn.close()
    
    def create_api_key(
        self,
        tenant_id: int,
        user_id: int,
        name: str,
        permissions: Dict = None
    ) -> Dict[str, str]:
        """
        Create API key for programmatic access
        
        Args:
            tenant_id: Tenant ID
            user_id: User ID
            name: Key name/description
            permissions: Permissions dict
            
        Returns:
            Dict with key (only shown once) and metadata
        """
        # Generate API key
        api_key = f"sk_{secrets.token_urlsafe(32)}"
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        key_prefix = api_key[:12]
        
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            INSERT INTO api_keys (tenant_id, user_id, key_hash, key_prefix, name, permissions)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, key_prefix, name, created_at
        """, (tenant_id, user_id, key_hash, key_prefix, name, str(permissions) if permissions else '{}'))
        
        key_info = dict(cur.fetchone())
        key_info['api_key'] = api_key  # Only returned once
        
        conn.commit()
        cur.close()
        conn.close()
        
        return key_info
    
    def list_tenants(self, include_inactive: bool = False) -> List[Dict]:
        """List all tenants"""
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        query = "SELECT * FROM tenants"
        if not include_inactive:
            query += " WHERE is_active = true"
        query += " ORDER BY created_at DESC"
        
        cur.execute(query)
        tenants = [dict(row) for row in cur.fetchall()]
        
        cur.close()
        conn.close()
        
        return tenants


# Global instance
tenant_manager = None

def initialize_tenant_manager(db_url: str):
    """Initialize global tenant manager"""
    global tenant_manager
    tenant_manager = TenantManager(db_url)
