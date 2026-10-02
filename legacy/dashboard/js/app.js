// Main Application Controller for Real-Time Solar Observatory
class SolarObservatoryApp {
    constructor() {
        this.isInitialized = false;
        this.autoRefreshEnabled = true;
        this.refreshInterval = null;
        this.currentData = {
            solarWind: [],
            magneticField: [],
            cmeEvents: []
        };
        this.lastUpdateTime = null;
        this.uiElements = {};
        
        // Bind methods to preserve context
        this.handleRefreshClick = this.handleRefreshClick.bind(this);
        this.handleExportClick = this.handleExportClick.bind(this);
        this.handleAutoRefreshToggle = this.handleAutoRefreshToggle.bind(this);
        this.handleDebugClick = this.handleDebugClick.bind(this);
    }
    
    // Initialize the application
    async initialize() {
        try {
            logger.info('Initializing Solar Observatory Application');
            this.showAlert('🌞 Initializing Real-Time Solar Observatory...', 'info');
            
            // Initialize UI elements
            this.initializeUIElements();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Perform initial data fetch
            await this.updateAllData();
            
            // Set up auto-refresh
            this.setupAutoRefresh();
            
            // Mark as initialized
            this.isInitialized = true;
            this.showAlert('🌞 Real-Time Solar Observatory initialized successfully!', 'success');
            logger.info('Application initialization completed successfully');
            
        } catch (error) {
            this.isInitialized = false;
            const errorMessage = 'Failed to initialize Solar Observatory application';
            logger.error(errorMessage, error);
            this.showAlert('❌ ' + errorMessage + '. Check console for details.', 'error');
            throw error;
        }
    }
    
    // Initialize UI element references
    initializeUIElements() {
        this.uiElements = {
            // Header elements
            liveIndicator: document.getElementById('live-indicator'),
            lastUpdateTime: document.getElementById('last-update-time'),
            apiStatus: document.getElementById('api-status'),
            
            // Control buttons
            refreshBtn: document.getElementById('refresh-btn'),
            exportBtn: document.getElementById('export-btn'),
            autoRefreshBtn: document.getElementById('auto-refresh-btn'),
            debugBtn: document.getElementById('debug-btn'),
            
            // Metric displays
            solarWindSpeed: document.getElementById('solar-wind-speed'),
            plasmaDensity: document.getElementById('plasma-density'),
            magneticFieldStrength: document.getElementById('magnetic-field-strength'),
            bzComponent: document.getElementById('bz-component'),
            
            // Chart containers
            solarWindChart: document.getElementById('solar-wind-chart'),
            magneticFieldChart: document.getElementById('magnetic-field-chart'),
            solarSystem3D: document.getElementById('solar-system-3d'),
            cmeTracker: document.getElementById('cme-tracker'),
            
            // Other elements
            cmeEventsList: document.getElementById('cme-events-list')
        };
        
        // Log missing elements
        Object.entries(this.uiElements).forEach(([key, element]) => {
            if (!element) {
                logger.warn(`UI element not found: ${key}`);
            }
        });
    }
    
    // Set up event listeners
    setupEventListeners() {
        // Control buttons
        if (this.uiElements.refreshBtn) {
            this.uiElements.refreshBtn.addEventListener('click', this.handleRefreshClick);
        }
        
        if (this.uiElements.exportBtn) {
            this.uiElements.exportBtn.addEventListener('click', this.handleExportClick);
        }
        
        if (this.uiElements.autoRefreshBtn) {
            this.uiElements.autoRefreshBtn.addEventListener('click', this.handleAutoRefreshToggle);
        }
        
        if (this.uiElements.debugBtn) {
            this.uiElements.debugBtn.addEventListener('click', this.handleDebugClick);
        }
        
        // Window events
        window.addEventListener('resize', this.handleWindowResize.bind(this));
        window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
        
        // Visibility change (pause updates when tab is hidden)
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        
        logger.debug('Event listeners set up successfully');
    }
    
    // Data fetching and processing
    async updateAllData() {
        if (!apiManager) {
            throw new Error('API Manager not available');
        }
        
        const startTime = performance.now();
        logger.info('Starting data update cycle');
        
        try {
            // Show loading state
            this.setLoadingState(true);
            
            // Fetch all data
            const data = await apiManager.fetchAllData();
            
            // Update internal data store
            this.currentData = data;
            this.lastUpdateTime = new Date();
            
            // Update UI
            this.updateMetrics();
            this.updateCharts();
            this.updateCMEList();
            this.updateStatusIndicators();
            
            // Update 3D visualization with real data
            if (typeof window.update3DVisualization === 'function') {
                window.update3DVisualization(data.solarWind, data.magneticField, data.cmeEvents);
            }
            
            // Manually trigger CME visualization update (for debugging)
            setTimeout(() => {
                this.triggerCMEVisualizationUpdate();
            }, 1000);
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            logger.logPerformance('Data Update Cycle', duration, {
                solarWindRecords: data.solarWind.length,
                magneticFieldRecords: data.magneticField.length,
                cmeEvents: data.cmeEvents.length
            });
            
            logger.info('Data update completed successfully', {
                duration: Math.round(duration),
                recordCounts: {
                    solarWind: data.solarWind.length,
                    magneticField: data.magneticField.length,
                    cmeEvents: data.cmeEvents.length
                }
            });
            
        } catch (error) {
            logger.logApiError('Data Update', error, 'updateAllData');
            this.showAlert('Failed to update data. Using cached or sample data.', 'warning');
        } finally {
            this.setLoadingState(false);
        }
    }
    
    // Update metric displays
    updateMetrics() {
        const latestSolarWind = this.getLatestData('solarWind');
        const latestMagnetic = this.getLatestData('magneticField');
        
        if (latestSolarWind && this.uiElements.solarWindSpeed) {
            const speed = latestSolarWind.speed || 0;
            this.uiElements.solarWindSpeed.textContent = speed.toFixed(1);
            this.setWarningState(this.uiElements.solarWindSpeed, speed > CONFIG.ALERTS.SOLAR_WIND.HIGH_SPEED);
        } else if (this.uiElements.solarWindSpeed) {
            this.uiElements.solarWindSpeed.textContent = '---';
            this.uiElements.solarWindSpeed.style.color = '#666';
        }
        
        if (latestSolarWind && this.uiElements.plasmaDensity) {
            const density = latestSolarWind.density || 0;
            this.uiElements.plasmaDensity.textContent = density.toFixed(1);
            this.setWarningState(this.uiElements.plasmaDensity, density > CONFIG.ALERTS.SOLAR_WIND.HIGH_DENSITY);
        } else if (this.uiElements.plasmaDensity) {
            this.uiElements.plasmaDensity.textContent = '---';
            this.uiElements.plasmaDensity.style.color = '#666';
        }
        
        if (latestMagnetic && this.uiElements.magneticFieldStrength) {
            const bt = latestMagnetic.btotal || 0;
            this.uiElements.magneticFieldStrength.textContent = bt.toFixed(1);
            this.setWarningState(this.uiElements.magneticFieldStrength, bt > CONFIG.ALERTS.MAGNETIC_FIELD.STRONG_FIELD);
        } else if (this.uiElements.magneticFieldStrength) {
            this.uiElements.magneticFieldStrength.textContent = '---';
            this.uiElements.magneticFieldStrength.style.color = '#666';
        }
        
        if (latestMagnetic && this.uiElements.bzComponent) {
            const bz = latestMagnetic.bz || 0;
            this.uiElements.bzComponent.textContent = bz.toFixed(1);
            this.setWarningState(this.uiElements.bzComponent, bz < CONFIG.ALERTS.MAGNETIC_FIELD.STORM_THRESHOLD);
        } else if (this.uiElements.bzComponent) {
            this.uiElements.bzComponent.textContent = '---';
            this.uiElements.bzComponent.style.color = '#666';
        }
        
        // Log space weather conditions
        if (latestSolarWind && latestMagnetic) {
            const condition = Utils.classifySpaceWeatherCondition(
                latestSolarWind.speed,
                latestMagnetic.bz,
                latestMagnetic.btotal
            );
            logger.logSpaceWeatherEvent(condition.level, condition.level, {
                solarWindSpeed: latestSolarWind.speed,
                bzComponent: latestMagnetic.bz,
                magneticField: latestMagnetic.btotal,
                description: condition.description
            });
        }
    }
    
    // Update charts
    updateCharts() {
        if (typeof Plotly === 'undefined') {
            logger.warn('Plotly not available, skipping chart updates');
            return;
        }
        
        // Update charts or show "No data" messages
        if (this.uiElements.solarWindChart) {
            if (this.currentData.solarWind.length > 0) {
                this.updateSolarWindChart();
            } else {
                this.showNoDataMessage(this.uiElements.solarWindChart, 'No real-time solar wind data available');
            }
        }
        
        if (this.uiElements.magneticFieldChart) {
            if (this.currentData.magneticField.length > 0) {
                this.updateMagneticFieldChart();
            } else {
                this.showNoDataMessage(this.uiElements.magneticFieldChart, 'No real-time magnetic field data available');
            }
        }
        
        if (this.uiElements.cmeTracker) {
            if (this.currentData.cmeEvents.length > 0) {
                this.updateCMEChart();
            } else {
                this.showNoDataMessage(this.uiElements.cmeTracker, 'No real-time CME data available');
            }
        }
    }
    
    updateSolarWindChart() {
        const data = this.currentData.solarWind.slice(-50); // Last 50 points
        
        const trace1 = {
            x: data.map(d => d.timestamp),
            y: data.map(d => d.speed),
            name: 'Speed (km/s)',
            type: 'scatter',
            mode: 'lines',
            line: { color: '#00d4ff', width: 2 },
            yaxis: 'y'
        };
        
        const trace2 = {
            x: data.map(d => d.timestamp),
            y: data.map(d => d.density),
            name: 'Density (p/cm³)',
            type: 'scatter',
            mode: 'lines',
            line: { color: '#ff6b35', width: 2 },
            yaxis: 'y2'
        };
        
        const layout = {
            title: { text: 'Solar Wind Parameters', font: { size: 14 } },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: 'white', size: 11 },
            xaxis: { 
                title: { text: 'Time', font: { size: 11 } },
                gridcolor: 'rgba(255,255,255,0.1)',
                color: 'white',
                tickfont: { size: 10 }
            },
            yaxis: {
                title: { text: 'Speed (km/s)', font: { size: 11 } },
                side: 'left',
                gridcolor: 'rgba(255,255,255,0.1)',
                color: '#00d4ff',
                tickfont: { size: 10 }
            },
            yaxis2: {
                title: { text: 'Density (p/cm³)', font: { size: 11 } },
                side: 'right',
                overlaying: 'y',
                color: '#ff6b35',
                tickfont: { size: 10 }
            },
            margin: { l: 45, r: 45, t: 35, b: 35 },
            showlegend: true,
            legend: { 
                bgcolor: 'rgba(0,0,0,0.5)',
                font: { size: 10 },
                x: 0,
                y: 1
            }
        };
        
        Plotly.newPlot(this.uiElements.solarWindChart, [trace1, trace2], layout, {
            responsive: true,
            displayModeBar: false
        });
    }
    
    updateMagneticFieldChart() {
        const data = this.currentData.magneticField.slice(-50);
        
        const traces = [
            {
                x: data.map(d => d.timestamp),
                y: data.map(d => d.bx),
                name: 'Bx (nT)',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#ff6b35', width: 2 }
            },
            {
                x: data.map(d => d.timestamp),
                y: data.map(d => d.by),
                name: 'By (nT)',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#00ff00', width: 2 }
            },
            {
                x: data.map(d => d.timestamp),
                y: data.map(d => d.bz),
                name: 'Bz (nT)',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#00d4ff', width: 2 }
            }
        ];
        
        const layout = {
            title: { text: 'Interplanetary Magnetic Field', font: { size: 14 } },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: 'white', size: 11 },
            xaxis: { 
                title: { text: 'Time', font: { size: 11 } },
                gridcolor: 'rgba(255,255,255,0.1)',
                color: 'white',
                tickfont: { size: 10 }
            },
            yaxis: {
                title: { text: 'Magnetic Field (nT)', font: { size: 11 } },
                gridcolor: 'rgba(255,255,255,0.1)',
                color: 'white',
                tickfont: { size: 10 }
            },
            margin: { l: 45, r: 45, t: 35, b: 35 },
            showlegend: true,
            legend: { 
                bgcolor: 'rgba(0,0,0,0.5)',
                font: { size: 10 },
                x: 0,
                y: 1
            }
        };
        
        Plotly.newPlot(this.uiElements.magneticFieldChart, traces, layout, {
            responsive: true,
            displayModeBar: false
        });
    }
    
    updateCMEChart() {
        const events = this.currentData.cmeEvents.slice(-20); // Last 20 events
        
        const trace = {
            x: events.map(event => new Date(event.startTime)),
            y: events.map(event => event.speed),
            text: events.map(event => `${event.sourceLocation}<br>Speed: ${event.speed} km/s<br>${Utils.formatTimestamp(event.startTime)}`),
            mode: 'markers',
            type: 'scatter',
            marker: {
                size: events.map(event => Math.min(20, event.speed / 50)),
                color: events.map(event => event.speed),
                colorscale: 'Hot',
                showscale: true,
                colorbar: {
                    title: 'Speed (km/s)',
                    titlefont: { color: 'white' },
                    tickfont: { color: 'white' }
                }
            },
            hovertemplate: '%{text}<extra></extra>'
        };
        
        const layout = {
            title: { text: 'Coronal Mass Ejection Events', font: { size: 14 } },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: 'white', size: 11 },
            xaxis: { 
                title: { text: 'Time', font: { size: 11 } },
                gridcolor: 'rgba(255,255,255,0.1)',
                color: 'white',
                tickfont: { size: 10 }
            },
            yaxis: {
                title: { text: 'CME Speed (km/s)', font: { size: 11 } },
                gridcolor: 'rgba(255,255,255,0.1)',
                color: 'white',
                tickfont: { size: 10 }
            },
            margin: { l: 45, r: 45, t: 35, b: 35 }
        };
        
        Plotly.newPlot(this.uiElements.cmeTracker, [trace], layout, {
            responsive: true,
            displayModeBar: false
        });
    }
    
    // Update CME events list
    updateCMEList() {
        if (!this.uiElements.cmeEventsList) return;
        
        const events = this.currentData.cmeEvents.slice(-5); // Last 5 events
        const html = events.map(event => {
            const timeAgo = Utils.getTimeAgo(event.startTime);
            const trajectory = event.trajectory;
            const earthImpact = trajectory ? trajectory.earthImpactProbability : 0;
            const estimatedArrival = trajectory ? trajectory.estimatedTravelTime : 0;
            
            return `
                <div class="cme-event">
                    <div class="cme-header">
                        <strong>${event.sourceLocation}</strong>
                        <span class="cme-time">${timeAgo}</span>
                    </div>
                    <div class="cme-details">
                        Speed: ${event.speed.toFixed(0)} km/s | 
                        Earth Impact: ${(earthImpact * 100).toFixed(0)}%
                        ${estimatedArrival > 0 ? ` | ETA: ${estimatedArrival.toFixed(1)}h` : ''}
                    </div>
                    <div class="cme-note">${event.note.substring(0, 100)}${event.note.length > 100 ? '...' : ''}</div>
                </div>
            `;
        }).join('');
        
        this.uiElements.cmeEventsList.innerHTML = html || '<div style="color: #ff6666; text-align: center; padding: 20px;">No real-time CME events available</div>';
        
        // Trigger 3D CME visualization update
        this.triggerCMEVisualizationUpdate();
    }
    
    // Trigger CME visualization update for 3D scene
    triggerCMEVisualizationUpdate() {
        console.log('Triggering CME visualization update with data:', this.currentData.cmeEvents);
        const event = new CustomEvent('cmeDataUpdated', {
            detail: this.currentData.cmeEvents
        });
        window.dispatchEvent(event);
    }
    
    // Update status indicators
    updateStatusIndicators() {
        if (this.uiElements.lastUpdateTime) {
            this.uiElements.lastUpdateTime.textContent = this.lastUpdateTime ? 
                Utils.formatTimestamp(this.lastUpdateTime) : 'Never';
        }
        
        if (this.uiElements.apiStatus) {
            const status = apiManager.getAPIStatus();
            const activeApis = Object.values(status).filter(api => !api.rateLimited && api.lastFetch).length;
            this.uiElements.apiStatus.textContent = `${activeApis}/3 APIs Active`;
        }
        
        // Update live indicator
        if (this.uiElements.liveIndicator) {
            const isLive = this.lastUpdateTime && (Date.now() - this.lastUpdateTime.getTime()) < 10 * 60 * 1000;
            this.uiElements.liveIndicator.style.display = isLive ? 'inline-block' : 'none';
        }
    }
    
    // UI state management
    setLoadingState(isLoading) {
        const buttons = [this.uiElements.refreshBtn, this.uiElements.exportBtn];
        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = isLoading;
                if (isLoading) {
                    btn.classList.add('loading');
                } else {
                    btn.classList.remove('loading');
                }
            }
        });
    }
    
    setWarningState(element, isWarning) {
        if (!element) return;
        
        if (isWarning) {
            element.classList.add('metric-warning');
        } else {
            element.classList.remove('metric-warning');
        }
    }
    
    // Auto-refresh functionality
    setupAutoRefresh() {
        if (this.autoRefreshEnabled) {
            this.refreshInterval = setInterval(() => {
                if (this.autoRefreshEnabled && !document.hidden) {
                    this.updateAllData();
                }
            }, CONFIG.TIMING.AUTO_REFRESH_INTERVAL);
            
            logger.info('Auto-refresh enabled', { interval: CONFIG.TIMING.AUTO_REFRESH_INTERVAL });
        }
    }
    
    toggleAutoRefresh() {
        this.autoRefreshEnabled = !this.autoRefreshEnabled;
        
        if (this.autoRefreshEnabled) {
            this.setupAutoRefresh();
            this.showAlert('Auto-refresh enabled', 'info');
        } else {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
            this.showAlert('Auto-refresh disabled', 'info');
        }
        
        // Update button state
        if (this.uiElements.autoRefreshBtn) {
            this.uiElements.autoRefreshBtn.classList.toggle('active', this.autoRefreshEnabled);
        }
        
        logger.logUserAction('Toggle Auto Refresh', { enabled: this.autoRefreshEnabled });
    }
    
    // Show "No data" message in chart containers
    showNoDataMessage(container, message) {
        if (!container) return;
        
        container.innerHTML = `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: #ff6666;
                text-align: center;
                font-size: 14px;
                background: rgba(255, 102, 102, 0.1);
                border: 1px dashed #ff6666;
                border-radius: 8px;
            ">
                <div>
                    <div style="font-size: 24px; margin-bottom: 10px;">📊</div>
                    <div>${message}</div>
                    <div style="font-size: 11px; color: #888; margin-top: 8px;">
                        Check network connection and API status
                    </div>
                </div>
            </div>
        `;
    }
    
    // Event handlers
    async handleRefreshClick() {
        logger.logUserAction('Manual Refresh');
        this.showAlert('Refreshing data...', 'info');
        await this.updateAllData();
        this.showAlert('Data refreshed successfully', 'success');
    }
    
    handleExportClick() {
        logger.logUserAction('Export Data');
        
        try {
            const exportData = {
                timestamp: new Date().toISOString(),
                lastUpdate: this.lastUpdateTime?.toISOString(),
                ...this.currentData
            };
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `solar_observatory_data_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showAlert('Data exported successfully', 'success');
            
        } catch (error) {
            logger.error('Export failed', error);
            this.showAlert('Export failed. See console for details.', 'error');
        }
    }
    
    handleAutoRefreshToggle() {
        this.toggleAutoRefresh();
    }
    
    async handleDebugClick() {
        logger.logUserAction('Debug APIs');
        this.showAlert('Running API diagnostics...', 'info');
        
        try {
            const diagnostics = await apiManager.runDiagnostics();
            console.group('🔍 API Diagnostics');
            console.table(diagnostics.apis);
            console.log('Cache Status:', diagnostics.cache);
            console.log('Network Status:', diagnostics.network);
            console.groupEnd();
            
            this.showAlert('Diagnostics complete - check console', 'success');
            
        } catch (error) {
            logger.error('Diagnostics failed', error);
            this.showAlert('Diagnostics failed. See console for details.', 'error');
        }
    }
    
    handleWindowResize() {
        // Debounce resize events
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            if (typeof Plotly !== 'undefined') {
                const chartIds = ['solar-wind-chart', 'magnetic-field-chart', 'cme-tracker'];
                chartIds.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) {
                        Plotly.Plots.resize(id);
                    }
                });
            }
        }, 250);
    }
    
    handleVisibilityChange() {
        if (document.hidden) {
            logger.debug('Tab hidden - pausing updates');
        } else {
            logger.debug('Tab visible - resuming updates');
            if (this.autoRefreshEnabled) {
                // Update immediately when tab becomes visible
                this.updateAllData();
            }
        }
    }
    
    handleBeforeUnload() {
        // Clean up intervals and save state
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        logger.saveToStorage();
        logger.info('Application shutting down');
    }
    
    // Utility methods
    getLatestData(type) {
        const data = this.currentData[type];
        return data && data.length > 0 ? data[data.length - 1] : null;
    }
    
    showAlert(message, type = 'info') {
        const alertElement = document.createElement('div');
        alertElement.className = `alert ${type}`;
        alertElement.textContent = message;
        
        // Style based on type
        if (type === 'success') {
            alertElement.style.background = 'linear-gradient(45deg, #00d4ff, #00ff88)';
        } else if (type === 'error') {
            alertElement.style.background = 'linear-gradient(45deg, #ff6b35, #ff4757)';
        } else if (type === 'warning') {
            alertElement.style.background = 'linear-gradient(45deg, #ffa726, #ff9800)';
        } else {
            alertElement.style.background = 'linear-gradient(45deg, #00d4ff, #0099cc)';
        }
        
        document.body.appendChild(alertElement);
        
        // Animate in
        setTimeout(() => alertElement.classList.add('show'), 100);
        
        // Remove after delay
        setTimeout(() => {
            if (alertElement.parentNode) {
                alertElement.style.opacity = '0';
                alertElement.style.transform = 'translateX(100%)';
                setTimeout(() => alertElement.remove(), 300);
            }
        }, CONFIG.UI.ALERT_DURATION);
    }
}

// Initialize application when DOM is loaded
if (typeof window !== 'undefined') {
    let app = null;
    
    function initializeApp() {
        try {
            app = new SolarObservatoryApp();
            window.solarApp = app;
            
            app.initialize().catch(error => {
                console.error('Failed to initialize Solar Observatory:', error);
            });
            
        } catch (error) {
            console.error('Critical error during app initialization:', error);
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SolarObservatoryApp;
}