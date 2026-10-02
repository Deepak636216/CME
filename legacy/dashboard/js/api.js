// API Management Module for Real-Time Solar Observatory
class APIManager {
    constructor() {
        this.lastFetchTimes = new Map();
        this.cache = new Map();
        this.activeRequests = new Map();
        this.corsProxyIndex = 0;
        this.rateLimitDelay = CONFIG.TIMING.API_RATE_LIMIT_DELAY;
    }
    
    // Main data fetching method with comprehensive error handling
    async fetchAllData() {
        Utils.startTimer('fetchAllData');
        
        try {
            const results = await Promise.allSettled([
                this.fetchSolarWindPlasma(),
                this.fetchMagneticField(),
                this.fetchCMEData()
            ]);
            
            const data = {
                solarWind: results[0].status === 'fulfilled' ? results[0].value : [],
                magneticField: results[1].status === 'fulfilled' ? results[1].value : [],
                cmeEvents: results[2].status === 'fulfilled' ? results[2].value : []
            };
            
            // Log any failures
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const apis = ['Solar Wind', 'Magnetic Field', 'CME'];
                    Utils.logError(result.reason, `fetchAllData: ${apis[index]} API failed`);
                }
            });
            
            Utils.endTimer('fetchAllData');
            return data;
            
        } catch (error) {
            Utils.endTimer('fetchAllData');
            Utils.logError(error, 'fetchAllData: Critical failure');
            // Return empty data instead of fallback
            return {
                solarWind: [],
                magneticField: [],
                cmeEvents: []
            };
        }
    }
    
    // Fetch NOAA Solar Wind Plasma data
    async fetchSolarWindPlasma() {
        const cacheKey = 'solar_wind_plasma';
        
        try {
            // Check rate limiting
            if (this.shouldRateLimit('plasma')) {
                const cached = this.getFromCache(cacheKey);
                if (cached) return cached;
            }
            
            const data = await this.fetchWithRetry(
                CONFIG.API.NOAA_SOLAR_WIND_PLASMA,
                'Solar Wind Plasma'
            );
            
            // Process and validate data
            const processedData = this.processSolarWindData(data);
            this.setCache(cacheKey, processedData);
            this.lastFetchTimes.set('plasma', Date.now());
            
            return processedData;
            
        } catch (error) {
            Utils.logError(error, 'fetchSolarWindPlasma');
            throw Utils.createError('Failed to fetch solar wind plasma data', 'API_ERROR', error);
        }
    }
    
    // Fetch NOAA Magnetic Field data
    async fetchMagneticField() {
        const cacheKey = 'magnetic_field';
        
        try {
            if (this.shouldRateLimit('magnetic')) {
                const cached = this.getFromCache(cacheKey);
                if (cached) return cached;
            }
            
            const data = await this.fetchWithRetry(
                CONFIG.API.NOAA_MAGNETIC_FIELD,
                'Magnetic Field'
            );
            
            const processedData = this.processMagneticFieldData(data);
            this.setCache(cacheKey, processedData);
            this.lastFetchTimes.set('magnetic', Date.now());
            
            return processedData;
            
        } catch (error) {
            Utils.logError(error, 'fetchMagneticField');
            throw Utils.createError('Failed to fetch magnetic field data', 'API_ERROR', error);
        }
    }
    
    // Fetch NASA DONKI CME data
    async fetchCMEData() {
        const cacheKey = 'cme_data';
        
        try {
            if (this.shouldRateLimit('cme')) {
                const cached = this.getFromCache(cacheKey);
                if (cached) return cached;
            }
            
            // Build NASA API URL with date parameters
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - (7 * 24 * 60 * 60 * 1000)); // Last 7 days
            
            const url = `${CONFIG.API.NASA_DONKI_CME}?` +
                       `startDate=${startDate.toISOString().split('T')[0]}&` +
                       `endDate=${endDate.toISOString().split('T')[0]}&` +
                       `api_key=${CONFIG.API.NASA_API_KEY}`;
            
            const data = await this.fetchWithRetry(url, 'CME Data');
            const processedData = this.processCMEData(data);
            
            this.setCache(cacheKey, processedData);
            this.lastFetchTimes.set('cme', Date.now());
            
            return processedData;
            
        } catch (error) {
            Utils.logError(error, 'fetchCMEData');
            throw Utils.createError('Failed to fetch CME data', 'API_ERROR', error);
        }
    }
    
    // Core fetch method with retry logic and CORS proxy fallback
    async fetchWithRetry(url, apiName, maxRetries = 3) {
        const requestId = `${apiName}_${Date.now()}`;
        
        // Prevent duplicate concurrent requests
        if (this.activeRequests.has(url)) {
            return await this.activeRequests.get(url);
        }
        
        const fetchPromise = this.performFetch(url, apiName, maxRetries);
        this.activeRequests.set(url, fetchPromise);
        
        try {
            const result = await fetchPromise;
            return result;
        } finally {
            this.activeRequests.delete(url);
        }
    }
    
    async performFetch(url, apiName, maxRetries) {
        let lastError;
        
        // First attempt: Direct fetch
        try {
            return await this.directFetch(url);
        } catch (error) {
            lastError = error;
            if (CONFIG.DEBUG.VERBOSE_API_ERRORS) {
                console.warn(`${apiName} direct fetch failed:`, error.message);
            }
        }
        
        // Retry with CORS proxies
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const proxy = CONFIG.API.CORS_PROXIES[this.corsProxyIndex % CONFIG.API.CORS_PROXIES.length];
                let proxiedUrl;
                
                // Handle different proxy URL formats
                if (proxy.includes('allorigins.win')) {
                    proxiedUrl = proxy + encodeURIComponent(url);
                } else if (proxy.includes('codetabs.com')) {
                    proxiedUrl = proxy + encodeURIComponent(url);
                } else {
                    proxiedUrl = proxy + url;
                }
                
                const result = await this.directFetch(proxiedUrl);
                
                if (CONFIG.DEBUG.VERBOSE_API_ERRORS) {
                    console.log(`${apiName} succeeded via proxy:`, proxy);
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                this.corsProxyIndex++;
                
                if (CONFIG.DEBUG.VERBOSE_API_ERRORS) {
                    console.warn(`${apiName} proxy attempt ${attempt + 1} failed:`, error.message);
                }
                
                // Wait before retry
                if (attempt < maxRetries - 1) {
                    await this.delay(1000 * (attempt + 1));
                }
            }
        }
        
        throw lastError;
    }
    
    async directFetch(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.UI.LOADING_TIMEOUT);
        
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw Utils.createError(
                    `HTTP ${response.status}: ${response.statusText}`,
                    'HTTP_ERROR',
                    { status: response.status, url }
                );
            }
            
            const text = await response.text();
            
            // Clean and parse JSON
            const cleanJson = this.cleanJsonResponse(text);
            return JSON.parse(cleanJson);
            
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw Utils.createError('Request timeout', 'TIMEOUT_ERROR', { url });
            }
            
            throw error;
        }
    }
    
    // Clean malformed JSON responses from NOAA APIs
    cleanJsonResponse(text) {
        try {
            // Try parsing as-is first
            JSON.parse(text);
            return text;
        } catch (error) {
            // Common issue: trailing data after JSON
            const lastBracket = text.lastIndexOf(']');
            const lastBrace = text.lastIndexOf('}');
            
            if (lastBracket > lastBrace && lastBracket > 0) {
                return text.substring(0, lastBracket + 1);
            } else if (lastBrace > 0) {
                return text.substring(0, lastBrace + 1);
            }
            
            throw error;
        }
    }
    
    // Data processing methods
    processSolarWindData(rawData) {
        const cleanData = Utils.cleanApiData(rawData);
        
        return cleanData.map(row => ({
            timestamp: row[0],
            density: Utils.validateNumeric(row[1], CONFIG.DATA_LIMITS.PLASMA_DENSITY.MIN, CONFIG.DATA_LIMITS.PLASMA_DENSITY.MAX, 5.0),
            speed: Utils.validateNumeric(row[2], CONFIG.DATA_LIMITS.SOLAR_WIND_SPEED.MIN, CONFIG.DATA_LIMITS.SOLAR_WIND_SPEED.MAX, 400),
            temperature: Utils.validateNumeric(row[3], 10000, 2000000, 100000)
        })).filter(item => item.timestamp && Utils.isRecentData(item.timestamp, 1440)); // Last 24 hours
    }
    
    processMagneticFieldData(rawData) {
        const cleanData = Utils.cleanApiData(rawData);
        
        return cleanData.map(row => ({
            timestamp: row[0],
            bx: Utils.validateNumeric(row[1], CONFIG.DATA_LIMITS.MAGNETIC_FIELD.MIN, CONFIG.DATA_LIMITS.MAGNETIC_FIELD.MAX, 0),
            by: Utils.validateNumeric(row[2], CONFIG.DATA_LIMITS.MAGNETIC_FIELD.MIN, CONFIG.DATA_LIMITS.MAGNETIC_FIELD.MAX, 0),
            bz: Utils.validateNumeric(row[3], CONFIG.DATA_LIMITS.MAGNETIC_FIELD.MIN, CONFIG.DATA_LIMITS.MAGNETIC_FIELD.MAX, 0),
            longitude: Utils.validateNumeric(row[4], -180, 180, 0),
            latitude: Utils.validateNumeric(row[5], -90, 90, 0),
            btotal: Utils.validateNumeric(row[6], 0, CONFIG.DATA_LIMITS.MAGNETIC_FIELD.MAX, 5)
        })).filter(item => item.timestamp && Utils.isRecentData(item.timestamp, 1440));
    }
    
    processCMEData(rawData) {
        if (!Array.isArray(rawData)) return [];
        
        return rawData.map(event => {
            const analysis = event.cmeAnalyses && event.cmeAnalyses.length > 0 ? 
                            event.cmeAnalyses.find(a => a.isMostAccurate) || event.cmeAnalyses[0] : 
                            null;
            
            return {
                id: event.activityID,
                startTime: event.startTime,
                sourceLocation: event.sourceLocation || 'Unknown',
                speed: analysis ? Utils.validateNumeric(analysis.speed, CONFIG.DATA_LIMITS.CME_SPEED.MIN, CONFIG.DATA_LIMITS.CME_SPEED.MAX, 500) : 500,
                latitude: analysis ? Utils.validateNumeric(analysis.latitude, -90, 90, 0) : 0,
                longitude: analysis ? Utils.validateNumeric(analysis.longitude, -180, 180, 0) : 0,
                halfAngle: analysis ? Utils.validateNumeric(analysis.halfAngle, 0, 180, 30) : 30,
                trajectory: analysis ? Utils.calculateCMETrajectory(event.sourceLocation, analysis.speed) : null,
                note: event.note || '',
                instruments: event.instruments || []
            };
        }).filter(event => event.startTime && Utils.isRecentData(event.startTime, 10080)); // Last 7 days
    }
    
    // Rate limiting and caching
    shouldRateLimit(apiType) {
        const lastFetch = this.lastFetchTimes.get(apiType);
        if (!lastFetch) return false;
        
        const timeSinceLastFetch = Date.now() - lastFetch;
        return timeSinceLastFetch < this.rateLimitDelay;
    }
    
    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }
    
    getFromCache(key, maxAge = 5 * 60 * 1000) { // 5 minutes default
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        const age = Date.now() - cached.timestamp;
        if (age > maxAge) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }
    
    clearCache() {
        this.cache.clear();
    }
    
    // Note: Fallback data methods removed - application now uses only real-time API data
    
    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Status and diagnostics
    getAPIStatus() {
        const now = Date.now();
        const status = {
            plasma: {
                lastFetch: this.lastFetchTimes.get('plasma'),
                cached: this.cache.has('solar_wind_plasma'),
                rateLimited: this.shouldRateLimit('plasma')
            },
            magnetic: {
                lastFetch: this.lastFetchTimes.get('magnetic'),
                cached: this.cache.has('magnetic_field'),
                rateLimited: this.shouldRateLimit('magnetic')
            },
            cme: {
                lastFetch: this.lastFetchTimes.get('cme'),
                cached: this.cache.has('cme_data'),
                rateLimited: this.shouldRateLimit('cme')
            }
        };
        
        // Add time since last fetch
        Object.keys(status).forEach(key => {
            const lastFetch = status[key].lastFetch;
            status[key].timeSinceLastFetch = lastFetch ? now - lastFetch : null;
        });
        
        return status;
    }
    
    async runDiagnostics() {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            apis: {},
            network: {},
            cache: {}
        };
        
        // Test each API endpoint
        const apiTests = [
            { name: 'NOAA_PLASMA', url: CONFIG.API.NOAA_SOLAR_WIND_PLASMA },
            { name: 'NOAA_MAGNETIC', url: CONFIG.API.NOAA_MAGNETIC_FIELD },
            { name: 'NASA_CME', url: `${CONFIG.API.NASA_DONKI_CME}?api_key=${CONFIG.API.NASA_API_KEY}` }
        ];
        
        for (const test of apiTests) {
            try {
                const startTime = Date.now();
                await this.directFetch(test.url);
                const endTime = Date.now();
                
                diagnostics.apis[test.name] = {
                    status: 'success',
                    responseTime: endTime - startTime
                };
            } catch (error) {
                diagnostics.apis[test.name] = {
                    status: 'failed',
                    error: error.message
                };
            }
        }
        
        // Cache diagnostics
        diagnostics.cache = {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
        
        // Network diagnostics
        diagnostics.network = {
            online: navigator.onLine,
            connectionType: navigator.connection ? navigator.connection.effectiveType : 'unknown'
        };
        
        return diagnostics;
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.apiManager = new APIManager();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIManager;
}