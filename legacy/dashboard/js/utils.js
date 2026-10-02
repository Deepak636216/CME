// Utility functions for Real-Time Solar Observatory
class Utils {
    
    // Data validation and sanitization
    static validateNumeric(value, min = -Infinity, max = Infinity, defaultValue = 0) {
        const num = parseFloat(value);
        if (isNaN(num) || num < min || num > max) {
            return defaultValue;
        }
        return num;
    }
    
    static validateArray(data, expectedLength = null) {
        if (!Array.isArray(data)) return false;
        if (expectedLength !== null && data.length !== expectedLength) return false;
        return true;
    }
    
    // Time and date utilities
    static formatTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            });
        } catch (error) {
            return 'Invalid Date';
        }
    }
    
    static getTimeAgo(timestamp) {
        try {
            const now = new Date();
            const past = new Date(timestamp);
            const diffMs = now - past;
            const diffMins = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
            return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        } catch (error) {
            return 'Unknown time';
        }
    }
    
    static isRecentData(timestamp, maxAgeMinutes = 30) {
        try {
            const now = new Date();
            const dataTime = new Date(timestamp);
            const ageMs = now - dataTime;
            const ageMinutes = ageMs / (1000 * 60);
            return ageMinutes <= maxAgeMinutes;
        } catch (error) {
            return false;
        }
    }
    
    // Mathematical utilities for space weather calculations
    static calculateDistance3D(point1, point2) {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        const dz = point2.z - point1.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    static interpolateValue(value1, value2, factor) {
        return value1 + (value2 - value1) * factor;
    }
    
    static clampValue(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    
    static normalizeAngle(angle) {
        angle = angle % (2 * Math.PI);
        if (angle < 0) angle += 2 * Math.PI;
        return angle;
    }
    
    // Space weather specific calculations
    static parseSolarCoordinate(coordinate) {
        // Parse NASA coordinate format like "N29W05" or "S15E20"
        const match = coordinate.match(/([NS])(\d+)([EW])(\d+)/);
        if (!match) return null;
        
        const latitude = parseInt(match[2]) * (match[1] === 'N' ? 1 : -1);
        const longitude = parseInt(match[4]) * (match[3] === 'E' ? 1 : -1);
        
        return { latitude, longitude, raw: coordinate };
    }
    
    static calculateCMETrajectory(sourceLocation, speed) {
        const coords = this.parseSolarCoordinate(sourceLocation);
        if (!coords) return null;
        
        // Convert solar coordinates to 3D trajectory
        const latRad = (coords.latitude * Math.PI) / 180;
        const lonRad = (coords.longitude * Math.PI) / 180;
        
        // Calculate direction vector
        const direction = {
            x: Math.cos(latRad) * Math.cos(lonRad),
            y: Math.sin(latRad),
            z: Math.cos(latRad) * Math.sin(lonRad)
        };
        
        // Estimate Earth impact probability (simplified)
        const earthAngle = Math.acos(direction.x); // Assuming Earth is at (1,0,0)
        const earthImpactProbability = Math.max(0, 1 - (earthAngle / Math.PI));
        
        return {
            direction,
            speed,
            earthImpactProbability,
            estimatedTravelTime: this.estimateCMETravelTime(speed)
        };
    }
    
    static estimateCMETravelTime(speedKmPerS) {
        // Distance to Earth: ~150 million km
        const distanceKm = 1.496e8;
        const timeSeconds = distanceKm / speedKmPerS;
        const timeHours = timeSeconds / 3600;
        return timeHours;
    }
    
    static classifySpaceWeatherCondition(solarWindSpeed, bzComponent, magneticFieldStrength) {
        const speed = this.validateNumeric(solarWindSpeed, 0, 2000, 400);
        const bz = this.validateNumeric(bzComponent, -100, 100, 0);
        const bt = this.validateNumeric(magneticFieldStrength, 0, 100, 5);
        
        // Space weather classification logic
        if (bz < -10 && speed > 600) {
            return { level: 'severe', description: 'Severe geomagnetic storm conditions' };
        } else if (bz < -5 && speed > 500) {
            return { level: 'moderate', description: 'Moderate space weather activity' };
        } else if (speed > 400 || bt > 15) {
            return { level: 'minor', description: 'Minor space weather activity' };
        } else {
            return { level: 'quiet', description: 'Quiet space weather conditions' };
        }
    }
    
    // Color utilities for visualization
    static getSpeedColor(speed) {
        if (speed < 350) return CONFIG.VISUALIZATION.COLORS.SOLAR_WIND_SPEED.SLOW;
        if (speed < 600) return CONFIG.VISUALIZATION.COLORS.SOLAR_WIND_SPEED.MEDIUM;
        return CONFIG.VISUALIZATION.COLORS.SOLAR_WIND_SPEED.FAST;
    }
    
    static getMagneticFieldColor(bz, bt) {
        if (bt > 20) return CONFIG.VISUALIZATION.COLORS.MAGNETIC_FIELD.STRONG;
        if (bz < 0) return CONFIG.VISUALIZATION.COLORS.MAGNETIC_FIELD.STORM;
        return CONFIG.VISUALIZATION.COLORS.MAGNETIC_FIELD.QUIET;
    }
    
    static rgbToHex(r, g, b) {
        return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    
    // Data processing utilities
    static cleanApiData(data) {
        if (!data || !Array.isArray(data) || data.length === 0) return [];
        
        // Remove header row if present
        const cleanData = data.slice(1).filter(row => {
            if (!Array.isArray(row)) return false;
            
            // Check if first column is a valid timestamp
            const timestamp = row[0];
            return timestamp && !isNaN(Date.parse(timestamp));
        });
        
        return cleanData;
    }
    
    static processTimeSeriesData(rawData, timeIndex = 0, valueIndices = [1]) {
        const cleanData = this.cleanApiData(rawData);
        
        return cleanData.map(row => {
            const point = {
                timestamp: row[timeIndex],
                time: new Date(row[timeIndex])
            };
            
            valueIndices.forEach((index, i) => {
                const value = this.validateNumeric(row[index]);
                point[`value${i}`] = value;
            });
            
            return point;
        }).filter(point => point.time && !isNaN(point.time.getTime()));
    }
    
    // Error handling utilities
    static createError(message, type = 'Error', details = null) {
        const error = new Error(message);
        error.type = type;
        error.details = details;
        error.timestamp = new Date().toISOString();
        return error;
    }
    
    static logError(error, context = '') {
        const errorInfo = {
            message: error.message,
            type: error.type || 'Unknown',
            timestamp: new Date().toISOString(),
            context,
            stack: error.stack,
            details: error.details
        };
        
        if (CONFIG.DEBUG.ENABLE_CONSOLE_LOGGING) {
            console.error('Solar Observatory Error:', errorInfo);
        }
        
        // Store error for potential reporting
        if (!window.errorLog) window.errorLog = [];
        window.errorLog.push(errorInfo);
        
        // Keep only last 100 errors
        if (window.errorLog.length > 100) {
            window.errorLog = window.errorLog.slice(-100);
        }
        
        return errorInfo;
    }
    
    // Performance monitoring
    static startTimer(name) {
        if (CONFIG.DEBUG.ENABLE_PERFORMANCE_MONITORING) {
            console.time(name);
        }
    }
    
    static endTimer(name) {
        if (CONFIG.DEBUG.ENABLE_PERFORMANCE_MONITORING) {
            console.timeEnd(name);
        }
    }
    
    // Local storage utilities
    static saveToStorage(key, data) {
        try {
            const serialized = JSON.stringify(data);
            localStorage.setItem(`solar_observatory_${key}`, serialized);
            return true;
        } catch (error) {
            this.logError(error, `saveToStorage: ${key}`);
            return false;
        }
    }
    
    static loadFromStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(`solar_observatory_${key}`);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            this.logError(error, `loadFromStorage: ${key}`);
            return defaultValue;
        }
    }
    
    static clearStorage() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('solar_observatory_')) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (error) {
            this.logError(error, 'clearStorage');
            return false;
        }
    }
    
    // Note: Sample data generation functions removed - application now uses only real-time data
}

// Make Utils available globally
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}