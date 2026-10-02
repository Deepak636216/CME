// Configuration management for Real-Time Solar Observatory
const CONFIG = {
    // API Endpoints
    API: {
        NOAA_SOLAR_WIND_PLASMA: 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json',
        NOAA_MAGNETIC_FIELD: 'https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json',
        NASA_DONKI_CME: 'https://api.nasa.gov/DONKI/CME',
        NASA_API_KEY: 'DEMO_KEY',
        
        // CORS Proxy fallbacks (updated with working proxies)
        CORS_PROXIES: [
            'https://api.allorigins.win/raw?url=',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://thingproxy.freeboard.io/fetch/'
        ]
    },
    
    // Update intervals (in milliseconds)
    TIMING: {
        AUTO_REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes
        API_RATE_LIMIT_DELAY: 60 * 1000,      // 60 seconds between NASA API calls
        ANIMATION_FRAME_RATE: 60,              // Target FPS for 3D animation
        CME_PARTICLE_LIFETIME: 300             // Animation frames before CME particles fade
    },
    
    // 3D Visualization settings
    VISUALIZATION: {
        // Camera settings
        CAMERA: {
            FOV: 75,
            NEAR: 0.1,
            FAR: 1000,
            INITIAL_POSITION: { x: 50, y: 20, z: 50 }
        },
        
        // Solar system scale
        SCALE: {
            SUN_RADIUS: 2.0,
            EARTH_RADIUS: 0.6,
            EARTH_DISTANCE: 30, // 1 AU scaled
            MAGNETOSPHERE_RADIUS: 1.2
        },
        
        // Particle system settings
        PARTICLES: {
            MAX_SOLAR_WIND_PARTICLES: 500,
            PARTICLES_PER_DENSITY_UNIT: 50,
            CME_PARTICLES_COUNT: 200,
            MAGNETIC_FIELD_LINES: 12,
            STAR_COUNT: 1000
        },
        
        // Color schemes
        COLORS: {
            SOLAR_WIND_SPEED: {
                SLOW: 0x6666ff,    // Blue < 350 km/s
                MEDIUM: 0x66ff66,  // Green 350-600 km/s
                FAST: 0xff6666     // Red > 600 km/s
            },
            MAGNETIC_FIELD: {
                STRONG: 0xff0000,  // Red > 10 nT
                STORM: 0x0000ff,   // Blue Bz < 0
                QUIET: 0x00ff00    // Green Bz > 0
            },
            CME: {
                SLOW: 0xff8800,    // Orange < 500 km/s
                FAST: 0xff0000     // Red > 500 km/s
            }
        }
    },
    
    // Data validation ranges
    DATA_LIMITS: {
        SOLAR_WIND_SPEED: { MIN: 200, MAX: 1000 },
        PLASMA_DENSITY: { MIN: 0.1, MAX: 50 },
        MAGNETIC_FIELD: { MIN: -100, MAX: 100 },
        CME_SPEED: { MIN: 100, MAX: 3000 }
    },
    
    // Alert thresholds for space weather conditions
    ALERTS: {
        MAGNETIC_FIELD: {
            STORM_THRESHOLD: -10,  // Bz < -10 nT indicates geomagnetic storm
            STRONG_FIELD: 20       // Bt > 20 nT indicates strong magnetic field
        },
        SOLAR_WIND: {
            HIGH_SPEED: 600,       // > 600 km/s indicates high-speed stream
            HIGH_DENSITY: 15       // > 15 p/cm³ indicates high density
        },
        CME: {
            EARTH_DIRECTED_ANGLE: 30, // Within 30° of Earth direction
            HIGH_SPEED: 800           // > 800 km/s indicates fast CME
        }
    },
    
    // User interface settings
    UI: {
        ALERT_DURATION: 5000,        // Alert display time in ms
        CHART_ANIMATION_DURATION: 500,
        TOOLTIP_DELAY: 100,
        LOADING_TIMEOUT: 15000       // 15 seconds for API timeout
    },
    
    // Development and debugging
    DEBUG: {
        ENABLE_CONSOLE_LOGGING: false,  // Temporarily disabled to prevent recursion
        ENABLE_PERFORMANCE_MONITORING: true,
        USE_SAMPLE_DATA_FALLBACK: false,  // Changed to false - only use real data
        VERBOSE_API_ERRORS: true
    },
    
    // Feature flags for future enhancements
    FEATURES: {
        ENABLE_VR_MODE: false,
        ENABLE_VOICE_COMMANDS: false,
        ENABLE_PREDICTIVE_MODELING: false,
        ENABLE_HISTORICAL_DATA: false,
        ENABLE_MOBILE_NOTIFICATIONS: false
    }
};

// Environment detection and configuration adjustment
if (typeof window !== 'undefined') {
    // Browser environment - adjust based on URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('debug') === 'true') {
        CONFIG.DEBUG.ENABLE_CONSOLE_LOGGING = true;
        CONFIG.DEBUG.VERBOSE_API_ERRORS = true;
    }
    
    if (urlParams.get('sample') === 'true') {
        CONFIG.DEBUG.USE_SAMPLE_DATA_FALLBACK = true;
    }
    
    // Performance optimization for mobile devices
    if (/Mobi|Android/i.test(navigator.userAgent)) {
        CONFIG.VISUALIZATION.PARTICLES.MAX_SOLAR_WIND_PARTICLES = 200;
        CONFIG.VISUALIZATION.PARTICLES.STAR_COUNT = 500;
        CONFIG.TIMING.ANIMATION_FRAME_RATE = 30;
    }
}

// Configuration validation
function validateConfig() {
    const errors = [];
    
    // Validate API endpoints
    if (!CONFIG.API.NOAA_SOLAR_WIND_PLASMA.startsWith('https://')) {
        errors.push('NOAA Solar Wind API endpoint must use HTTPS');
    }
    
    if (!CONFIG.API.NOAA_MAGNETIC_FIELD.startsWith('https://')) {
        errors.push('NOAA Magnetic Field API endpoint must use HTTPS');
    }
    
    // Validate timing settings
    if (CONFIG.TIMING.AUTO_REFRESH_INTERVAL < 60000) {
        errors.push('Auto refresh interval should be at least 1 minute');
    }
    
    // Validate visualization limits
    if (CONFIG.VISUALIZATION.PARTICLES.MAX_SOLAR_WIND_PARTICLES > 1000) {
        console.warn('High particle count may impact performance');
    }
    
    if (errors.length > 0) {
        console.error('Configuration validation errors:', errors);
        return false;
    }
    
    return true;
}

// Initialize configuration
if (typeof window !== 'undefined') {
    validateConfig();
    window.CONFIG = CONFIG;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}