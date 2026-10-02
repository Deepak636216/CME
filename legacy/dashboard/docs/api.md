s

## 🛰️ **Primary Real-Time Data APIs**

### **1. NOAA Space Weather Prediction Center (SWPC)**
```s
Base URL: https://services.swpc.noaa.gov/json/

Solar Wind Data:
├── ace_swepam_1m.json          # Solar wind speed, density, temperature
├── ace_swepam_1h.json          # Hourly solar wind data
└── ace_swepam_6h.json          # 6-hour solar wind data

Magnetic Field Data:
├── ace_mag_1m.json             # 1-minute magnetic field (Bx, By, Bz, Bt)
├── ace_mag_1h.json             # Hourly magnetic field data
└── ace_mag_6h.json             # 6-hour magnetic field data

Particle Data:
├── goes_heps_part_5m.json      # Particle flux (protons, electrons)
├── goes_sgps_part_5m.json      # Solar energetic particles
└── goes_epead_part_5m.json     # Electron/proton detector data

Solar Activity:
├── solar_wind_speed.json       # Current solar wind speed
├── planetary_k_index.json      # Geomagnetic activity index
└── solar_wind_mag_field.json   # Solar wind magnetic field
```

### **2. NASA DONKI (Space Weather Database)**
```
Base URL: https://api.nasa.gov/DONKI/

CME Events:
├── CME?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&api_key=YOUR_KEY
├── CMEAnalysis?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&api_key=YOUR_KEY
└── notifications?type=CME&api_key=YOUR_KEY

Solar Flares:
├── FLR?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&api_key=YOUR_KEY
└── notifications?type=FLR&api_key=YOUR_KEY

Geomagnetic Storms:
├── GST?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&api_key=YOUR_KEY
└── notifications?type=GST&api_key=YOUR_KEY

Solar Energetic Particles:
├── SEP?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&api_key=YOUR_KEY
└── notifications?type=SEP&api_key=YOUR_KEY

Magnetopause Crossings:
└── MPC?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&api_key=YOUR_KEY

Radiation Belt Enhancements:
└── RBE?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&api_key=YOUR_KEY

Interplanetary Shocks:
└── IPS?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&api_key=YOUR_KEY
```

## 🔬 **Solar Observatory Data APIs**

### **3. SOHO (Solar and Heliospheric Observatory)**
```
Base URL: https://soho.nascom.nasa.gov/data/

LASCO Coronagraph:
├── realtime/c2/512/          # LASCO C2 coronagraph images
├── realtime/c3/512/          # LASCO C3 coronagraph images
└── summary/                  # Daily summary data

EIT Extreme UV:
├── realtime/eit_171/512/     # 171 Å Fe IX/X images
├── realtime/eit_195/512/     # 195 Å Fe XII images
├── realtime/eit_284/512/     # 284 Å Fe XV images
└── realtime/eit_304/512/     # 304 Å He II images

MDI Magnetograms:
├── realtime/mdi_mag/512/     # Magnetic field images
└── realtime/mdi_int/512/     # Intensity images
```

### **4. SDO (Solar Dynamics Observatory)**
```
Base URL: https://sdo.gsfc.nasa.gov/

AIA (Atmospheric Imaging Assembly):
├── data/aiafits/           # FITS data files
├── jsoc/ajax/              # JSOC data export
└── api/                    # REST API access

HMI (Helioseismic and Magnetic Imager):
├── data/hmi/               # HMI data products
└── jsoc/                   # JSOC interface

EVE (Extreme Ultraviolet Variability):
└── data/eve/               # Solar irradiance data
```

### **5. STEREO (Solar Terrestrial Relations Observatory)**
```
Base URL: https://stereo-ssc.nascom.nasa.gov/

Real-time Data:
├── data/ins_data/impact/   # In-situ measurements
├── data/ins_data/plastic/  # Solar wind data
└── beacon/                 # Real-time beacon data

SECCHI Images:
├── data/secchi/            # Coronagraph and EUV images
└── browse/                 # Browse interface
```

## 📊 **Additional Space Weather APIs**

### **6. DSCOVR Real-time Solar Wind**
```
Base URL: https://services.swpc.noaa.gov/

Real-time Data:
├── products/solar-wind/plasma-1-day.json
├── products/solar-wind/mag-1-day.json
└── experimental/products/noaa-scales.json
```

### **7. ESA Space Weather Service**
```
Base URL: https://swe.ssa.esa.int/

Space Weather Data:
├── web-services/           # REST API endpoints
├── current-space-weather/  # Current conditions
└── space-weather-archive/  # Historical data
```

### **8. CCMC (Community Coordinated Modeling Center)**
```
Base URL: https://ccmc.gsfc.nasa.gov/

Model Runs:
├── requests/              # Model run requests
├── results/               # Model outputs
└── real-time/             # Real-time model data
```

## 🔑 **API Authentication & Usage**

### **NASA APIs:**
```javascript
// Get API key from: https://api.nasa.gov/
const NASA_API_KEY = 'your_nasa_api_key_here';

// Usage example:
const url = `https://api.nasa.gov/DONKI/CME?startDate=2024-01-01&endDate=2024-01-15&api_key=${NASA_API_KEY}`;
```

### **NOAA APIs:**
```javascript
// Most NOAA endpoints are free, no API key required
const url = 'https://services.swpc.noaa.gov/json/ace_swepam_1m.json';
```

## 🌐 **CORS Solutions**

Since many of these APIs don't support CORS for browser requests:

### **Option 1: CORS Proxy Services**
```javascript
const CORS_PROXIES = [
    'https://api.allorigins.win/get?url=',
    'https://cors-anywhere.herokuapp.com/',
    'https://api.codetabs.com/v1/proxy?quest='
];
```

### **Option 2: Server-side Proxy**
```javascript
// Your own server endpoint that fetches the data
const YOUR_PROXY = 'https://your-server.com/api/proxy?url=';
```

### **Option 3: Browser Extension**
```
Install CORS extension for development:
- CORS Unblock
- CORS Everywhere
```

## 📋 **Implementation Priority**

### **Essential APIs (Tier 1):**
1. `ace_swepam_1m.json` - Solar wind speed/density
2. `ace_mag_1m.json` - Magnetic field components
3. `NASA DONKI CME` - Coronal mass ejections

### **Enhanced APIs (Tier 2):**
4. `goes_heps_part_5m.json` - Particle radiation
5. `NASA DONKI FLR` - Solar flares
6. `NASA DONKI GST` - Geomagnetic storms

### **Advanced APIs (Tier 3):**
7. SOHO LASCO images
8. SDO AIA/HMI data
9. STEREO in-situ measurements

