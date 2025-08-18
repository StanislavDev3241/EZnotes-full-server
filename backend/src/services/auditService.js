const { pool } = require('../config/database');
const encryptionUtils = require('../../encryption-utils');

class AuditService {
  constructor() {
    this.encryptionUtils = encryptionUtils;
  }

  // Log user action for HIPAA compliance
  async logAction(userId, actionType, resourceType, resourceId, details = {}, req = null) {
    try {
      let ipAddress = null;
      let userAgent = null;
      let encryptedDetails = null;
      let encryptionIv = null;

      // Extract request information if available
      if (req) {
        ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'];
        userAgent = req.headers['user-agent'];
      }

      // Encrypt sensitive details if provided
      if (Object.keys(details).length > 0) {
        const detailsString = JSON.stringify(details);
        const encrypted = this.encryptionUtils.encryptData(detailsString, userId || 0);
        encryptedDetails = encrypted.encryptedData;
        encryptionIv = encrypted.iv;
      }

      const query = `
        INSERT INTO audit_logs 
        (user_id, action_type, resource_type, resource_id, ip_address, user_agent, encrypted_details, encryption_iv)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;

      const values = [
        userId,
        actionType,
        resourceType,
        resourceId,
        ipAddress,
        userAgent,
        encryptedDetails,
        encryptionIv
      ];

      const result = await pool.query(query, values);
      console.log(`📝 Audit log created: ${actionType} by user ${userId}`);
      
      return result.rows[0].id;
    } catch (error) {
      console.error('❌ Audit logging error:', error);
      // Don't throw error - audit failure shouldn't break main functionality
    }
  }

  // Log data access
  async logDataAccess(userId, resourceType, resourceId, accessMethod = 'api') {
    return this.logAction(userId, 'data_access', resourceType, resourceId, {
      accessMethod,
      timestamp: new Date().toISOString()
    });
  }

  // Log data modification
  async logDataModify(userId, resourceType, resourceId, modificationType, oldValue = null, newValue = null) {
    return this.logAction(userId, 'data_modify', resourceType, resourceId, {
      modificationType,
      oldValue: oldValue ? oldValue.substring(0, 100) + '...' : null,
      newValue: newValue ? newValue.substring(0, 100) + '...' : null,
      timestamp: new Date().toISOString()
    });
  }

  // Log encryption/decryption operations
  async logEncryption(userId, operation, resourceType, resourceId, success = true) {
    return this.logAction(userId, 'encryption', resourceType, resourceId, {
      operation,
      success,
      timestamp: new Date().toISOString()
    });
  }

  // Log login attempts
  async logLogin(userId, success = true, failureReason = null) {
    return this.logAction(userId, 'login', 'auth', null, {
      success,
      failureReason,
      timestamp: new Date().toISOString()
    });
  }

  // Log logout
  async logLogout(userId) {
    return this.logAction(userId, 'logout', 'auth', null, {
      timestamp: new Date().toISOString()
    });
  }

  // Get audit logs for a user (admin only)
  async getUserAuditLogs(userId, limit = 100, offset = 0) {
    try {
      const query = `
        SELECT 
          al.id,
          al.action_type,
          al.resource_type,
          al.resource_id,
          al.ip_address,
          al.user_agent,
          al.encrypted_details,
          al.encryption_iv,
          al.created_at,
          u.email as user_email
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.user_id = $1
        ORDER BY al.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await pool.query(query, [userId, limit, offset]);
      
      // Decrypt details if available
      const logs = await Promise.all(result.rows.map(async (log) => {
        if (log.encrypted_details && log.encryption_iv) {
          try {
            const decrypted = this.encryptionUtils.decryptData(
              log.encrypted_details, 
              log.encryption_iv, 
              userId
            );
            log.details = JSON.parse(decrypted);
          } catch (error) {
            log.details = { error: 'Failed to decrypt details' };
          }
        }
        return log;
      }));

      return logs;
    } catch (error) {
      console.error('❌ Get audit logs error:', error);
      throw new Error('Failed to retrieve audit logs');
    }
  }

  // Get all audit logs (admin only)
  async getAllAuditLogs(limit = 100, offset = 0, filters = {}) {
    try {
      let query = `
        SELECT 
          al.id,
          al.user_id,
          al.action_type,
          al.resource_type,
          al.resource_id,
          al.ip_address,
          al.user_agent,
          al.encrypted_details,
          al.encryption_iv,
          al.created_at,
          u.email as user_email
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
      `;

      const values = [];
      let whereClause = '';
      let valueIndex = 1;

      // Add filters
      if (filters.actionType) {
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `al.action_type = $${valueIndex}`;
        values.push(filters.actionType);
        valueIndex++;
      }

      if (filters.userId) {
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `al.user_id = $${valueIndex}`;
        values.push(filters.userId);
        valueIndex++;
      }

      if (filters.dateFrom) {
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `al.created_at >= $${valueIndex}`;
        values.push(filters.dateFrom);
        valueIndex++;
      }

      if (filters.dateTo) {
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `al.created_at <= $${valueIndex}`;
        values.push(filters.dateTo);
        valueIndex++;
      }

      query += whereClause;
      query += ` ORDER BY al.created_at DESC LIMIT $${valueIndex} OFFSET $${valueIndex + 1}`;
      values.push(limit, offset);

      const result = await pool.query(query, values);
      
      // Decrypt details for each log
      const logs = await Promise.all(result.rows.map(async (log) => {
        if (log.encrypted_details && log.encryption_iv) {
          try {
            const decrypted = this.encryptionUtils.decryptData(
              log.encrypted_details, 
              log.encryption_iv, 
              log.user_id || 0
            );
            log.details = JSON.parse(decrypted);
          } catch (error) {
            log.details = { error: 'Failed to decrypt details' };
          }
        }
        return log;
      }));

      return logs;
    } catch (error) {
      console.error('❌ Get all audit logs error:', error);
      throw new Error('Failed to retrieve audit logs');
    }
  }

  // Clean old audit logs (for data retention)
  async cleanOldLogs(daysToKeep = 2555) { // 7 years default for HIPAA
    try {
      const query = `
        DELETE FROM audit_logs 
        WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
      `;

      const result = await pool.query(query);
      console.log(`🧹 Cleaned ${result.rowCount} old audit logs`);
      
      return result.rowCount;
    } catch (error) {
      console.error('❌ Clean old logs error:', error);
      throw new Error('Failed to clean old audit logs');
    }
  }
}

module.exports = new AuditService(); 