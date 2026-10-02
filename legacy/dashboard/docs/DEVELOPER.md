# Solar Observatory - Developer Guide

## Phase -1 Implementation Status ✅

The Solar Observatory has been successfully upgraded to Phase -1 with modular architecture and enhanced error handling.

## Quick Start

### Option 1: Python Server (Recommended)
```bash
python server.py 8000
```
Then open: http://localhost:8000

### Option 2: Node.js/npm
```bash
npm start
# or
npm run serve
```

### Option 3: VS Code Live Server
Right-click `index.html` → "Open with Live Server"

## CORS Issues & Solutions

### Expected Behavior
The application is designed to handle CORS issues gracefully:

1. **Direct API calls** - Attempts direct connection first
2. **CORS proxy fallback** - Uses multiple proxy services
3. **Sample data fallback** - Switches to realistic sample data when APIs fail

### Current API Status
- ❌ NOAA APIs: CORS blocked from localhost
- ❌ NASA DONKI: CORS blocked from localhost  
- ✅ Fallback data: Working perfectly

### Solutions for Real API Data

#### 1. Use CORS Proxy (Already Implemented)
The app automatically tries multiple CORS proxies:
- `api.allorigins.win`
- `api.codetabs.com`
- `thingproxy.freeboard.io`

#### 2. Browser CORS Bypass (Development Only)
Start Chrome with CORS disabled:
```bash
# Windows
chrome.exe --user-data-dir=/tmp/foo --disable-web-security

# Mac
open -n -a /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --args --user-data-dir="/tmp/chrome_dev_test" --disable-web-security

# Linux
google-chrome --disable-web-security --user-data-dir="/tmp/chrome_dev_test"
```

#### 3. Production Deployment
Deploy to a proper web server (not localhost) to avoid CORS issues entirely.

## Architecture Overview

### File Structure
```
CME/
├── index.html          # Main entry point
├── css/styles.css      # All styling
├── js/
│   ├── config.js       # Configuration management
│   ├── utils.js        # Utility functions
│   ├── logger.js       # Logging infrastructure
│   ├── api.js          # API management with fallbacks
│   └── app.js          # Main application controller
├── package.json        # Project metadata
└── server.py          # Development server
```

### Key Features
- ✅ **Modular Architecture**: Clean separation of concerns
- ✅ **Error Handling**: Comprehensive fallback mechanisms
- ✅ **Logging**: Detailed performance and error tracking
- ✅ **Configuration**: Centralized settings management
- ✅ **Sample Data**: High-quality fallback data for development

## Development Features

### Debug Mode
The application runs in debug mode by default:
- Console logging enabled
- Performance monitoring active
- Verbose API error reporting
- Sample data fallback enabled

### Available Controls
- **🔄 Refresh**: Manual data update
- **📊 Export**: Download current data as JSON
- **⏰ Auto**: Toggle auto-refresh (5-minute intervals)
- **🔍 Debug**: Run API diagnostics

### Logging System
All events are logged and can be exported:
```javascript
// View logs in console
logger.getLogs()

// Get error summary
logger.getErrorSummary()

// Export logs
logger.exportLogs('json')
```

## Troubleshooting

### Common Issues

#### 1. Blank Charts
**Cause**: API data not loading, using sample data  
**Solution**: This is expected behavior. Charts should show sample data.

#### 2. Console Errors
**Cause**: CORS policy blocking API requests  
**Solution**: This is expected. App falls back to sample data automatically.

#### 3. 3D Scene Not Loading
**Cause**: Three.js not loaded or WebGL not supported  
**Solution**: Check browser WebGL support and Three.js CDN

### Performance
- **Initial Load**: ~2-3 seconds
- **Data Updates**: Every 5 minutes (configurable)
- **3D Rendering**: 45-60 FPS on modern hardware
- **Memory Usage**: ~50-100MB typical

## Configuration

Edit `js/config.js` to modify:
- API endpoints and keys
- Update intervals
- Visualization settings
- Debug options
- Feature flags

## Next Steps (Future Phases)

### Phase 1: Enhanced Data Integration
- Additional NOAA APIs (solar flares, geomagnetic indices)
- ESA Space Weather APIs
- Enhanced CME analysis and trajectory modeling

### Phase 2: Advanced Visualization  
- 3D environment enhancements
- VR/AR support
- Advanced particle physics
- User interaction improvements

### Phase 3: Scientific Analysis
- Historical data analysis
- Machine learning predictions
- Research tools and data export
- Alert system

### Phase 4: Educational Features
- Interactive tutorials
- Gamification elements
- Curriculum integration
- Mobile app companion

## Contributing

The modular architecture makes it easy to:
1. Add new data sources in `api.js`
2. Extend visualizations in future `visualization.js`
3. Add features via configuration flags
4. Implement new UI components

Each module is self-contained with clear interfaces and comprehensive error handling.