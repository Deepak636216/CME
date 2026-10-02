// Comprehensive Logging Infrastructure for Real-Time Solar Observatory
class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.logLevel = this.determineLogLevel();
        this.startTime = Date.now();
        this.sessionId = this.generateSessionId();
        this.metrics = {
            errors: 0,
            warnings: 0,
            apiCalls: 0,
            performanceEvents: 0
        };
        
        this.initializeLogger();
    }
    
    // Log levels (ordered by severity)
    static LEVELS = {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3,
        TRACE: 4
    };
    
    initializeLogger() {
        // Store original console methods first
        this.originalConsole = {
            log: console.log.bind(console),
            error: console.error.bind(console),
            warn: console.warn.bind(console),
            info: console.info.bind(console),
            debug: console.debug.bind(console),
            trace: console.trace.bind(console)
        };
        
        // Override console methods if debug logging is enabled
        if (CONFIG.DEBUG.ENABLE_CONSOLE_LOGGING) {
            this.overrideConsole();
        }
        
        // Set up error event listeners
        this.setupErrorHandlers();
        
        // Initialize performance monitoring
        if (CONFIG.DEBUG.ENABLE_PERFORMANCE_MONITORING) {
            this.setupPerformanceMonitoring();
        }
        
        this.info('Logger initialized', { sessionId: this.sessionId });
    }
    
    determineLogLevel() {
        if (CONFIG.DEBUG.ENABLE_CONSOLE_LOGGING) {
            return Logger.LEVELS.DEBUG;
        }
        return Logger.LEVELS.WARN;
    }
    
    generateSessionId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    // Core logging methods
    error(message, data = null, context = '') {
        this.log('ERROR', message, data, context);
        this.metrics.errors++;
        
        // Use original console methods to avoid recursion
        if (this.originalConsole) {
            this.originalConsole.error(`[Solar Observatory] ${message}`, data || '');
        }
    }
    
    warn(message, data = null, context = '') {
        this.log('WARN', message, data, context);
        this.metrics.warnings++;
        
        if (this.shouldLog('WARN') && this.originalConsole) {
            this.originalConsole.warn(`[Solar Observatory] ${message}`, data || '');
        }
    }
    
    info(message, data = null, context = '') {
        this.log('INFO', message, data, context);
        
        if (this.shouldLog('INFO') && this.originalConsole) {
            this.originalConsole.info(`[Solar Observatory] ${message}`, data || '');
        }
    }
    
    debug(message, data = null, context = '') {
        this.log('DEBUG', message, data, context);
        
        if (this.shouldLog('DEBUG') && this.originalConsole) {
            this.originalConsole.debug(`[Solar Observatory] ${message}`, data || '');
        }
    }
    
    trace(message, data = null, context = '') {
        this.log('TRACE', message, data, context);
        
        if (this.shouldLog('TRACE') && this.originalConsole) {
            this.originalConsole.trace(`[Solar Observatory] ${message}`, data || '');
        }
    }
    
    // Core logging function
    log(level, message, data, context) {
        const logEntry = {
            id: this.generateLogId(),
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            level,
            message,
            data,
            context,
            url: typeof window !== 'undefined' ? window.location.href : 'unknown',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            stackTrace: this.captureStackTrace()
        };
        
        this.logs.push(logEntry);
        this.trimLogs();
        
        // Send to external logging service if configured
        this.sendToExternalLogger(logEntry);
        
        return logEntry;
    }
    
    shouldLog(level) {
        return Logger.LEVELS[level] <= this.logLevel;
    }
    
    generateLogId() {
        return Math.random().toString(36).substr(2, 9);
    }
    
    captureStackTrace() {
        const error = new Error();
        return error.stack || 'Stack trace not available';
    }
    
    trimLogs() {
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
    }
    
    // Specialized logging methods
    logApiCall(endpoint, method = 'GET', duration = 0, status = 'unknown') {
        this.metrics.apiCalls++;
        this.info('API Call', {
            endpoint,
            method,
            duration,
            status,
            timestamp: Date.now()
        }, 'API');
    }
    
    logApiError(endpoint, error, context = '') {
        this.error('API Error', {
            endpoint,
            error: error.message,
            type: error.type || 'Unknown',
            details: error.details,
            context
        }, 'API');
    }
    
    logPerformance(eventName, duration, details = {}) {
        this.metrics.performanceEvents++;
        this.debug('Performance Event', {
            event: eventName,
            duration,
            ...details
        }, 'PERFORMANCE');
    }
    
    logUserAction(action, details = {}) {
        this.info('User Action', {
            action,
            ...details,
            timestamp: Date.now()
        }, 'USER');
    }
    
    logDataProcessing(dataType, recordCount, processingTime = 0) {
        this.debug('Data Processing', {
            dataType,
            recordCount,
            processingTime,
            timestamp: Date.now()
        }, 'DATA');
    }
    
    logSpaceWeatherEvent(eventType, severity, details = {}) {
        this.info('Space Weather Event', {
            eventType,
            severity,
            ...details,
            timestamp: Date.now()
        }, 'SPACE_WEATHER');
    }
    
    // Error handling setup
    setupErrorHandlers() {
        if (typeof window === 'undefined') return;
        
        // Global error handler
        window.addEventListener('error', (event) => {
            this.error('Global Error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error
            }, 'GLOBAL');
        });
        
        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            this.error('Unhandled Promise Rejection', {
                reason: event.reason,
                promise: event.promise
            }, 'PROMISE');
        });
        
        // Console error override (use original to avoid recursion)
        this.originalConsole.error = console.error;
        console.error = (...args) => {
            // Only log console errors that aren't from our logger
            if (!args[0] || !args[0].toString().includes('[Solar Observatory]')) {
                this.error('Console Error', args, 'CONSOLE');
            } else {
                this.originalConsole.error.apply(console, args);
            }
        };
    }
    
    setupPerformanceMonitoring() {
        if (typeof window === 'undefined' || !window.performance) return;
        
        // Monitor page load performance
        window.addEventListener('load', () => {
            setTimeout(() => {
                const perfData = performance.getEntriesByType('navigation')[0];
                if (perfData) {
                    this.logPerformance('Page Load', perfData.loadEventEnd - perfData.fetchStart, {
                        domContentLoaded: perfData.domContentLoadedEventEnd - perfData.fetchStart,
                        domInteractive: perfData.domInteractive - perfData.fetchStart,
                        resources: performance.getEntriesByType('resource').length
                    });
                }
            }, 1000);
        });
        
        // Monitor resource loading
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.duration > 1000) { // Log slow resources
                    this.warn('Slow Resource', {
                        name: entry.name,
                        duration: entry.duration,
                        type: entry.initiatorType
                    }, 'PERFORMANCE');
                }
            }
        });
        
        try {
            observer.observe({ entryTypes: ['resource'] });
        } catch (e) {
            this.warn('Performance observer not supported');
        }
    }
    
    overrideConsole() {
        // Don't override console methods to avoid recursion
        // The logger will handle its own output through originalConsole
        // This prevents the infinite loop issue
    }
    
    // Log retrieval and filtering
    getLogs(filters = {}) {
        let filteredLogs = [...this.logs];
        
        if (filters.level) {
            filteredLogs = filteredLogs.filter(log => log.level === filters.level);
        }
        
        if (filters.context) {
            filteredLogs = filteredLogs.filter(log => log.context === filters.context);
        }
        
        if (filters.since) {
            const sinceDate = new Date(filters.since);
            filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= sinceDate);
        }
        
        if (filters.message) {
            const messagePattern = new RegExp(filters.message, 'i');
            filteredLogs = filteredLogs.filter(log => messagePattern.test(log.message));
        }
        
        return filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    
    getErrorSummary(timeRange = 3600000) { // Default 1 hour
        const since = new Date(Date.now() - timeRange);
        const recentLogs = this.getLogs({ since });
        
        const summary = {
            totalErrors: 0,
            totalWarnings: 0,
            errorsByType: {},
            topErrors: [],
            timeRange: timeRange / 1000 // Convert to seconds
        };
        
        recentLogs.forEach(log => {
            if (log.level === 'ERROR') {
                summary.totalErrors++;
                const errorType = log.data?.type || 'Unknown';
                summary.errorsByType[errorType] = (summary.errorsByType[errorType] || 0) + 1;
            } else if (log.level === 'WARN') {
                summary.totalWarnings++;
            }
        });
        
        // Get top 5 most frequent error messages
        const errorMessages = {};
        recentLogs.filter(log => log.level === 'ERROR').forEach(log => {
            errorMessages[log.message] = (errorMessages[log.message] || 0) + 1;
        });
        
        summary.topErrors = Object.entries(errorMessages)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([message, count]) => ({ message, count }));
        
        return summary;
    }
    
    // Export and persistence
    exportLogs(format = 'json') {
        const exportData = {
            sessionId: this.sessionId,
            exportTime: new Date().toISOString(),
            sessionDuration: Date.now() - this.startTime,
            metrics: this.metrics,
            logs: this.logs,
            config: {
                logLevel: this.logLevel,
                maxLogs: this.maxLogs
            }
        };
        
        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(exportData, null, 2);
            
            case 'csv':
                return this.exportToCsv(exportData.logs);
            
            case 'txt':
                return this.exportToText(exportData.logs);
            
            default:
                return JSON.stringify(exportData, null, 2);
        }
    }
    
    exportToCsv(logs) {
        const headers = ['Timestamp', 'Level', 'Message', 'Context', 'Data'];
        const csvRows = [headers.join(',')];
        
        logs.forEach(log => {
            const row = [
                log.timestamp,
                log.level,
                `"${log.message.replace(/"/g, '""')}"`,
                log.context,
                `"${JSON.stringify(log.data || {}).replace(/"/g, '""')}"`
            ];
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }
    
    exportToText(logs) {
        return logs.map(log => {
            const dataStr = log.data ? JSON.stringify(log.data, null, 2) : '';
            return `[${log.timestamp}] ${log.level}: ${log.message}${log.context ? ` (${log.context})` : ''}${dataStr ? `\nData: ${dataStr}` : ''}`;
        }).join('\n\n');
    }
    
    saveToStorage() {
        try {
            const logData = {
                logs: this.logs.slice(-100), // Save only last 100 logs
                metrics: this.metrics,
                sessionId: this.sessionId
            };
            localStorage.setItem('solar_observatory_logs', JSON.stringify(logData));
            return true;
        } catch (error) {
            console.warn('Failed to save logs to storage:', error);
            return false;
        }
    }
    
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('solar_observatory_logs');
            if (stored) {
                const logData = JSON.parse(stored);
                this.logs = logData.logs || [];
                this.metrics = { ...this.metrics, ...logData.metrics };
                return true;
            }
        } catch (error) {
            console.warn('Failed to load logs from storage:', error);
        }
        return false;
    }
    
    // External logging integration
    sendToExternalLogger(logEntry) {
        // Placeholder for external logging service integration
        // This could send to services like LogRocket, Sentry, or custom endpoints
        
        if (logEntry.level === 'ERROR' && this.shouldSendToExternal()) {
            // Example: Send critical errors to external service
            this.sendErrorToExternal(logEntry);
        }
    }
    
    shouldSendToExternal() {
        // Rate limiting logic for external logging
        return false; // Disabled by default
    }
    
    async sendErrorToExternal(logEntry) {
        // Implementation would depend on the external service
        // Example structure for common logging services
        const payload = {
            level: logEntry.level,
            message: logEntry.message,
            timestamp: logEntry.timestamp,
            sessionId: logEntry.sessionId,
            context: logEntry.context,
            data: logEntry.data,
            userAgent: logEntry.userAgent,
            url: logEntry.url
        };
        
        // Uncomment and configure for your logging service
        // try {
        //     await fetch('YOUR_LOGGING_ENDPOINT', {
        //         method: 'POST',
        //         headers: { 'Content-Type': 'application/json' },
        //         body: JSON.stringify(payload)
        //     });
        // } catch (error) {
        //     console.warn('Failed to send log to external service:', error);
        // }
    }
    
    // Cleanup and maintenance
    clear() {
        this.logs = [];
        this.metrics = {
            errors: 0,
            warnings: 0,
            apiCalls: 0,
            performanceEvents: 0
        };
        this.info('Logs cleared');
    }
    
    getStats() {
        return {
            sessionId: this.sessionId,
            sessionDuration: Date.now() - this.startTime,
            totalLogs: this.logs.length,
            logLevel: Object.keys(Logger.LEVELS)[this.logLevel],
            metrics: this.metrics,
            memoryUsage: this.estimateMemoryUsage()
        };
    }
    
    estimateMemoryUsage() {
        const logString = JSON.stringify(this.logs);
        return {
            estimatedBytes: logString.length * 2, // Rough estimate for UTF-16
            logCount: this.logs.length,
            averageLogSize: this.logs.length > 0 ? (logString.length * 2) / this.logs.length : 0
        };
    }
}

// Create global logger instance
if (typeof window !== 'undefined') {
    window.logger = new Logger();
    
    // Auto-save logs periodically
    setInterval(() => {
        window.logger.saveToStorage();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Load existing logs on startup
    window.logger.loadFromStorage();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Logger;
}