"""
Analytics Module for Admin Dashboard
Provides usage statistics and insights
"""
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor

class AnalyticsEngine:
    """Generate analytics and reports for admin dashboard"""
    
    def __init__(self, db_connection_string: str):
        """
        Initialize analytics engine
        
        Args:
            db_connection_string: PostgreSQL connection string
        """
        self.db_url = db_connection_string
    
    def _get_connection(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    def get_tenant_overview(self, tenant_id: int) -> Dict[str, Any]:
        """
        Get comprehensive overview for a tenant
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Dict with all key metrics
        """
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        overview = {}
        
        # User count
        cur.execute("""
            SELECT COUNT(*) as total_users,
                   COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30d
            FROM users WHERE tenant_id = %s
        """, (tenant_id,))
        overview['users'] = dict(cur.fetchone())
        
        # Document count
        cur.execute("""
            SELECT COUNT(*) as total_documents,
                   COUNT(CASE WHEN uploaded_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_documents_30d
            FROM documents d
            JOIN users u ON d.user_id = u.id
            WHERE u.tenant_id = %s
        """, (tenant_id,))
        overview['documents'] = dict(cur.fetchone())
        
        # Video count
        cur.execute("""
            SELECT COUNT(*) as total_videos,
                   COUNT(CASE WHEN uploaded_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_videos_30d
            FROM videos v
            JOIN users u ON v.user_id = u.id
            WHERE u.tenant_id = %s
        """, (tenant_id,))
        overview['videos'] = dict(cur.fetchone())
        
        # Assessment count
        cur.execute("""
            SELECT COUNT(*) as total_assessments,
                   COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_assessments_30d
            FROM assessments a
            JOIN users u ON a.user_id = u.id
            WHERE u.tenant_id = %s
        """, (tenant_id,))
        overview['assessments'] = dict(cur.fetchone())
        
        # Conversation count
        cur.execute("""
            SELECT COUNT(*) as total_conversations,
                   COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_conversations_30d
            FROM conversations c
            JOIN users u ON c.user_id = u.id
            WHERE u.tenant_id = %s
        """, (tenant_id,))
        overview['conversations'] = dict(cur.fetchone())
        
        # Storage usage
        cur.execute("""
            SELECT 
                COALESCE(SUM(pg_column_size(content)), 0) as storage_bytes,
                COUNT(*) as total_chunks
            FROM chunks ch
            JOIN documents d ON ch.document_id = d.id
            JOIN users u ON d.user_id = u.id
            WHERE u.tenant_id = %s
        """, (tenant_id,))
        storage = dict(cur.fetchone())
        overview['storage'] = {
            'bytes': storage['storage_bytes'],
            'mb': round(storage['storage_bytes'] / (1024 * 1024), 2),
            'chunks': storage['total_chunks']
        }
        
        cur.close()
        conn.close()
        
        return overview
    
    def get_usage_trends(
        self,
        tenant_id: int,
        days: int = 30
    ) -> Dict[str, List[Dict]]:
        """
        Get usage trends over time
        
        Args:
            tenant_id: Tenant ID
            days: Number of days to analyze
            
        Returns:
            Dict with daily usage data
        """
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        start_date = datetime.now() - timedelta(days=days)
        
        # Daily document uploads
        cur.execute("""
            SELECT 
                DATE(d.uploaded_at) as date,
                COUNT(*) as count
            FROM documents d
            JOIN users u ON d.user_id = u.id
            WHERE u.tenant_id = %s AND d.uploaded_at >= %s
            GROUP BY DATE(d.uploaded_at)
            ORDER BY date
        """, (tenant_id, start_date))
        
        document_trend = [dict(row) for row in cur.fetchall()]
        
        # Daily conversations
        cur.execute("""
            SELECT 
                DATE(c.created_at) as date,
                COUNT(*) as count
            FROM conversations c
            JOIN users u ON c.user_id = u.id
            WHERE u.tenant_id = %s AND c.created_at >= %s
            GROUP BY DATE(c.created_at)
            ORDER BY date
        """, (tenant_id, start_date))
        
        conversation_trend = [dict(row) for row in cur.fetchall()]
        
        # Daily assessments
        cur.execute("""
            SELECT 
                DATE(a.created_at) as date,
                COUNT(*) as count
            FROM assessments a
            JOIN users u ON a.user_id = u.id
            WHERE u.tenant_id = %s AND a.created_at >= %s
            GROUP BY DATE(a.created_at)
            ORDER BY date
        """, (tenant_id, start_date))
        
        assessment_trend = [dict(row) for row in cur.fetchall()]
        
        cur.close()
        conn.close()
        
        return {
            'documents': document_trend,
            'conversations': conversation_trend,
            'assessments': assessment_trend
        }
    
    def get_user_activity(
        self,
        tenant_id: int,
        limit: int = 50
    ) -> List[Dict]:
        """
        Get most active users
        
        Args:
            tenant_id: Tenant ID
            limit: Number of users to return
            
        Returns:
            List of users with activity counts
        """
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT 
                u.id,
                u.email,
                u.role,
                u.created_at,
                COUNT(DISTINCT d.id) as document_count,
                COUNT(DISTINCT v.id) as video_count,
                COUNT(DISTINCT c.id) as conversation_count,
                COUNT(DISTINCT a.id) as assessment_count
            FROM users u
            LEFT JOIN documents d ON u.id = d.user_id
            LEFT JOIN videos v ON u.id = v.user_id
            LEFT JOIN conversations c ON u.id = c.user_id
            LEFT JOIN assessments a ON u.id = a.user_id
            WHERE u.tenant_id = %s
            GROUP BY u.id, u.email, u.role, u.created_at
            ORDER BY 
                (COUNT(DISTINCT d.id) + COUNT(DISTINCT v.id) + 
                 COUNT(DISTINCT c.id) + COUNT(DISTINCT a.id)) DESC
            LIMIT %s
        """, (tenant_id, limit))
        
        users = [dict(row) for row in cur.fetchall()]
        
        cur.close()
        conn.close()
        
        return users
    
    def get_popular_documents(
        self,
        tenant_id: int,
        limit: int = 20
    ) -> List[Dict]:
        """
        Get most referenced documents in conversations
        
        Args:
            tenant_id: Tenant ID
            limit: Number of documents to return
            
        Returns:
            List of documents with usage stats
        """
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT 
                d.id,
                d.filename,
                d.subject,
                d.year,
                d.uploaded_at,
                u.email as uploaded_by,
                COUNT(DISTINCT ch.id) as chunk_count,
                COUNT(DISTINCT m.id) as message_count
            FROM documents d
            JOIN users u ON d.user_id = u.id
            LEFT JOIN chunks ch ON d.id = ch.document_id
            LEFT JOIN messages m ON m.conversation_id IN (
                SELECT conversation_id FROM messages WHERE id = m.id
            )
            WHERE u.tenant_id = %s
            GROUP BY d.id, d.filename, d.subject, d.year, d.uploaded_at, u.email
            ORDER BY message_count DESC, chunk_count DESC
            LIMIT %s
        """, (tenant_id, limit))
        
        documents = [dict(row) for row in cur.fetchall()]
        
        cur.close()
        conn.close()
        
        return documents
    
    def get_system_health(self, tenant_id: int) -> Dict[str, Any]:
        """
        Get system health metrics
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Dict with health indicators
        """
        conn = self._get_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        health = {}
        
        # Database size
        cur.execute("""
            SELECT pg_database_size(current_database()) as db_size
        """)
        health['database_size_mb'] = round(cur.fetchone()['db_size'] / (1024 * 1024), 2)
        
        # Active users (last 24h)
        cur.execute("""
            SELECT COUNT(DISTINCT user_id) as active_users
            FROM usage_logs
            WHERE tenant_id = %s AND created_at > NOW() - INTERVAL '24 hours'
        """, (tenant_id,))
        result = cur.fetchone()
        health['active_users_24h'] = result['active_users'] if result else 0
        
        # Error rate (from audit logs if tracking errors)
        cur.execute("""
            SELECT 
                COUNT(*) as total_actions,
                COUNT(CASE WHEN action LIKE '%%error%%' THEN 1 END) as errors
            FROM audit_logs
            WHERE tenant_id = %s AND created_at > NOW() - INTERVAL '24 hours'
        """, (tenant_id,))
        result = cur.fetchone()
        if result and result['total_actions'] > 0:
            health['error_rate'] = round((result['errors'] / result['total_actions']) * 100, 2)
        else:
            health['error_rate'] = 0
        
        # Average response time (if logging this)
        health['avg_response_time_ms'] = 0  # Placeholder
        
        cur.close()
        conn.close()
        
        return health
    
    def generate_report(
        self,
        tenant_id: int,
        report_type: str = "monthly"
    ) -> Dict[str, Any]:
        """
        Generate comprehensive report
        
        Args:
            tenant_id: Tenant ID
            report_type: monthly, weekly, daily
            
        Returns:
            Complete report dict
        """
        days = {
            'daily': 1,
            'weekly': 7,
            'monthly': 30
        }.get(report_type, 30)
        
        report = {
            'report_type': report_type,
            'generated_at': datetime.now().isoformat(),
            'tenant_id': tenant_id,
            'overview': self.get_tenant_overview(tenant_id),
            'trends': self.get_usage_trends(tenant_id, days),
            'top_users': self.get_user_activity(tenant_id, 10),
            'popular_documents': self.get_popular_documents(tenant_id, 10),
            'system_health': self.get_system_health(tenant_id)
        }
        
        return report


# Global instance
analytics_engine = None

def initialize_analytics(db_url: str):
    """Initialize global analytics engine"""
    global analytics_engine
    analytics_engine = AnalyticsEngine(db_url)
