import "leaflet/dist/leaflet.css";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const vehicleIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="18" fill="#00d9ff" opacity="0.2"/>
      <circle cx="20" cy="20" r="12" fill="#00d9ff"/>
      <circle cx="20" cy="20" r="6" fill="white"/>
    </svg>
  `),
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const emergencyVehicleIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="22" fill="#ff3b3b" opacity="0.25"/>
      <circle cx="24" cy="24" r="16" fill="#ff3b3b" opacity="0.5"/>
      <circle cx="24" cy="24" r="10" fill="#ff3b3b"/>
      <circle cx="24" cy="24" r="5" fill="white"/>
    </svg>
  `),
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

function MapUpdater({ position }) {
  const map = useMap();
  useEffect(() => { map.setView(position, map.getZoom()); }, [position, map]);
  return null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TANK_FULL_DISTANCE  = 3.0;
const TANK_EMPTY_DISTANCE = 9.5;
const FETCH_INTERVAL      = 1000;
const MAX_HISTORY_LENGTH  = 10;
const CONNECTION_TIMEOUT  = 5000;
const TANK_CAPACITY       = 40;

const fuelDistanceToPercent = (d) => {
  if (d === null || d === undefined || d < 0) return 0;
  const c = Math.max(TANK_FULL_DISTANCE, Math.min(TANK_EMPTY_DISTANCE, d));
  return Math.max(0, Math.min(100, ((TANK_EMPTY_DISTANCE - c) / (TANK_EMPTY_DISTANCE - TANK_FULL_DISTANCE)) * 100));
};
const percentToLiters = (p) => (p / 100) * TANK_CAPACITY;

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Emergency SOS Popup ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const EmergencySOSPopup = ({ onClose }) => {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); onClose(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10001,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
    }}>
      {/* Outer pulse rings */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            position: "absolute",
            width: `${300 + i * 80}px`, height: `${300 + i * 80}px`,
            borderRadius: "50%", border: "2px solid rgba(255,59,59,0.3)",
            animation: `sosRing 2s ease-out infinite`,
            animationDelay: `${i * 0.4}s`,
          }} />
        ))}
      </div>

      <div style={{
        background: "linear-gradient(135deg, #1a0000 0%, #2d0000 50%, #1a0000 100%)",
        border: "2px solid #ff3b3b",
        borderRadius: "24px",
        padding: "48px",
        maxWidth: "520px",
        width: "90%",
        textAlign: "center",
        boxShadow: "0 0 80px rgba(255,59,59,0.6), 0 0 160px rgba(255,59,59,0.2)",
        position: "relative",
        zIndex: 1,
      }}>
        {/* SOS badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "90px", height: "90px", borderRadius: "50%",
          background: "linear-gradient(135deg, #ff3b3b, #cc0000)",
          marginBottom: "24px",
          boxShadow: "0 0 40px rgba(255,59,59,0.8)",
          animation: "sosPulse 1s ease-in-out infinite",
          fontSize: "36px",
        }}>🆘</div>

        <div style={{
          fontSize: "32px", fontWeight: "900", color: "#ff3b3b",
          letterSpacing: "4px", marginBottom: "8px",
          animation: "sosBlink 1s ease-in-out infinite",
          textShadow: "0 0 30px rgba(255,59,59,0.8)",
        }}>EMERGENCY SOS</div>

        <div style={{
          fontSize: "13px", color: "#ff9999", letterSpacing: "2px",
          textTransform: "uppercase", marginBottom: "32px", fontWeight: "600",
        }}>Alert Dispatched Successfully</div>

        <div style={{
          background: "rgba(255,59,59,0.12)",
          border: "1px solid rgba(255,59,59,0.3)",
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "28px",
        }}>
          <div style={{ fontSize: "13px", color: "#aaa", marginBottom: "16px", fontWeight: "600", letterSpacing: "1px" }}>
            EMERGENCY MESSAGE SENT TO
          </div>
          {[
            { icon: "🚓", label: "Police", desc: "Law enforcement dispatched" },
            { icon: "🏥", label: "Hospital", desc: "Medical team alerted" },
            { icon: "👨‍👩‍👧", label: "Family", desc: "Emergency contacts notified" },
          ].map(({ icon, label, desc }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: "14px",
              padding: "12px 16px", marginBottom: "8px",
              background: "rgba(255,59,59,0.08)", borderRadius: "10px",
              border: "1px solid rgba(255,59,59,0.2)",
            }}>
              <span style={{ fontSize: "24px" }}>{icon}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff" }}>{label}</div>
                <div style={{ fontSize: "11px", color: "#888" }}>{desc}</div>
              </div>
              <div style={{
                marginLeft: "auto", width: "8px", height: "8px", borderRadius: "50%",
                background: "#00ff88", boxShadow: "0 0 8px #00ff88",
                animation: "sosPulse 1.5s ease-in-out infinite",
              }} />
            </div>
          ))}
        </div>

        <div style={{ fontSize: "12px", color: "#666", marginBottom: "24px" }}>
          GPS location has been shared with all emergency contacts.<br />
          Only GPS tracking remains active during emergency mode.
        </div>

        <button
          onClick={onClose}
          style={{
            background: "linear-gradient(135deg, #ff3b3b, #cc0000)",
            border: "none", borderRadius: "12px",
            padding: "14px 40px", color: "#fff",
            fontSize: "14px", fontWeight: "700", cursor: "pointer",
            letterSpacing: "1px",
            boxShadow: "0 4px 20px rgba(255,59,59,0.4)",
          }}
        >
          ACKNOWLEDGE ({countdown}s)
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Emergency Banner ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const EmergencyBanner = () => (
  <div style={{
    background: "linear-gradient(90deg, #ff0000 0%, #cc0000 25%, #ff0000 50%, #cc0000 75%, #ff0000 100%)",
    backgroundSize: "400% 100%",
    animation: "emergencyScroll 3s linear infinite",
    padding: "18px 32px",
    borderRadius: "12px",
    marginBottom: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 0 40px rgba(255,0,0,0.7), 0 4px 20px rgba(0,0,0,0.5)",
    border: "2px solid #ff6666",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
      <span style={{ fontSize: "32px", animation: "sosBlink 0.8s ease-in-out infinite" }}>🆘</span>
      <div>
        <div style={{ fontSize: "22px", fontWeight: "900", color: "#fff", letterSpacing: "3px" }}>
          ⚠ EMERGENCY MODE ACTIVE ⚠
        </div>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", letterSpacing: "1px", marginTop: "2px" }}>
          GPS tracking active · All other systems suspended · Emergency services notified
        </div>
      </div>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#fff", animation: "sosBlink 0.8s ease-in-out infinite" }} />
      <span style={{ fontSize: "13px", fontWeight: "700", color: "#fff", letterSpacing: "1px" }}>LIVE</span>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Emergency Status Indicator ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const EmergencyStatusIndicator = ({ isEmergency }) => (
  <div style={{
    display: "inline-flex", alignItems: "center", gap: "8px",
    padding: "8px 16px", borderRadius: "10px",
    background: isEmergency ? "rgba(255,0,0,0.2)" : "rgba(0,255,136,0.1)",
    border: `2px solid ${isEmergency ? "#ff3b3b" : "rgba(0,255,136,0.4)"}`,
    boxShadow: isEmergency ? "0 0 20px rgba(255,59,59,0.4)" : "none",
  }}>
    <div style={{
      width: "10px", height: "10px", borderRadius: "50%",
      background: isEmergency ? "#ff3b3b" : "#00ff88",
      boxShadow: isEmergency ? "0 0 10px #ff3b3b" : "0 0 6px #00ff88",
      animation: isEmergency ? "sosBlink 0.8s ease-in-out infinite" : "pulse 2s infinite",
    }} />
    <span style={{
      fontSize: "11px", fontWeight: "700", letterSpacing: "0.8px",
      color: isEmergency ? "#ff3b3b" : "#00ff88",
    }}>
      SOS {isEmergency ? "ACTIVE" : "STANDBY"}
    </span>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Disabled Module Card ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const DisabledDuringEmergency = ({ title, icon, reason = "Disabled during emergency" }) => (
  <div style={{
    background: "rgba(15,15,25,0.6)",
    border: "1px solid rgba(255,59,59,0.15)",
    borderRadius: "16px", padding: "32px",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    minHeight: "200px", gap: "14px",
    opacity: 0.5,
    filter: "grayscale(1)",
  }}>
    <div style={{ fontSize: "36px" }}>{icon}</div>
    <div style={{ fontSize: "13px", color: "#666", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1.2px" }}>{title}</div>
    <div style={{
      fontSize: "10px", color: "#ff3b3b", background: "rgba(255,59,59,0.08)",
      padding: "5px 16px", borderRadius: "6px",
      border: "1px solid rgba(255,59,59,0.2)",
      letterSpacing: "0.5px", fontWeight: "700",
    }}>
      {reason}
    </div>
  </div>
);

// ─── Full-screen offline overlay ─────────────────────────────────────────────
const OfflineOverlay = ({ retryCount }) => (
  <div style={{
    position: "fixed", inset: 0, zIndex: 9999,
    background: "rgba(4, 4, 12, 0.97)",
    backdropFilter: "blur(18px)",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: "28px",
  }}>
    <div style={{ position: "relative", width: "130px", height: "130px" }}>
      {[0, 15, 30].map((inset, i) => (
        <div key={i} style={{
          position: "absolute", inset, borderRadius: "50%",
          background: `rgba(255,59,59,${0.08 + i * 0.08})`,
          animation: `offlinePulse 2s ease-in-out infinite`,
          animationDelay: `${i * 0.25}s`,
        }} />
      ))}
      <div style={{
        position: "absolute", inset: "38px", borderRadius: "50%",
        background: "linear-gradient(135deg,#ff3b3b,#cc0000)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "26px", boxShadow: "0 0 50px rgba(255,59,59,0.9)",
      }}>⚠</div>
    </div>
    <div style={{ textAlign: "center" }}>
      <div style={{
        fontSize: "40px", fontWeight: "900", color: "#ff3b3b",
        letterSpacing: "3px", textTransform: "uppercase",
        textShadow: "0 0 40px rgba(255,59,59,0.7)",
        animation: "offlineBlink 1.6s ease-in-out infinite",
      }}>SYSTEM OFFLINE</div>
      <div style={{ fontSize: "15px", color: "#888", marginTop: "10px" }}>
        ESP32 device has stopped sending data
      </div>
      <div style={{ fontSize: "12px", color: "#555", marginTop: "6px" }}>
        All sensor readings are suspended until the connection is restored
      </div>
    </div>
    <div style={{
      background: "rgba(255,59,59,0.07)", border: "1px solid rgba(255,59,59,0.25)",
      borderRadius: "18px", padding: "24px 48px", minWidth: "340px",
    }}>
      <div style={{ fontSize: "10px", color: "#555", letterSpacing: "1.5px", fontWeight: "700", marginBottom: "18px", textAlign: "center", textTransform: "uppercase" }}>
        Suspended Systems
      </div>
      {[["⛽","Fuel Monitoring"],["📍","GPS Tracking"],["🔧","TPMS"],["🚨","Theft Detection"],["📊","Active Alerts"],["🆘","Emergency SOS"]].map(([icon,label]) => (
        <div key={label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <span>{icon}</span>
            <span style={{ fontSize:"13px", color:"#aaa", fontWeight:"500" }}>{label}</span>
          </div>
          <span style={{ fontSize:"9px", fontWeight:"700", color:"#ff3b3b", background:"rgba(255,59,59,0.15)", padding:"3px 10px", borderRadius:"6px", letterSpacing:"0.5px" }}>SUSPENDED</span>
        </div>
      ))}
    </div>
    <div style={{ display:"flex", alignItems:"center", gap:"10px", color:"#555", fontSize:"12px" }}>
      <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#ffae00", animation:"offlinePulse 1s ease-in-out infinite" }} />
      Attempting to reconnect… ({retryCount} attempt{retryCount!==1?"s":""})
    </div>
    <div style={{ fontSize:"11px", color:"#2a2a3a", paddingTop:"16px", borderTop:"1px solid rgba(255,255,255,0.04)", letterSpacing:"0.3px" }}>
      Dashboard will automatically resume when the device comes back online
    </div>
  </div>
);

// ─── Placeholder card shown when offline ─────────────────────────────────────
const SuspendedCard = ({ title, icon, minHeight = "220px" }) => (
  <div style={{
    background:"rgba(20,20,35,0.6)", backdropFilter:"blur(12px)",
    padding:"24px", borderRadius:"16px",
    border:"1px solid rgba(255,59,59,0.15)",
    boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
    display:"flex", flexDirection:"column",
    alignItems:"center", justifyContent:"center",
    minHeight, gap:"14px", opacity:0.55,
  }}>
    <div style={{ fontSize:"34px" }}>{icon}</div>
    <div style={{ fontSize:"12px", color:"#666", fontWeight:"600", textTransform:"uppercase", letterSpacing:"1px" }}>{title}</div>
    <div style={{ fontSize:"10px", color:"#ff3b3b", background:"rgba(255,59,59,0.1)", padding:"4px 14px", borderRadius:"6px", border:"1px solid rgba(255,59,59,0.2)", letterSpacing:"0.5px", fontWeight:"700" }}>
      DATA SUSPENDED
    </div>
  </div>
);

// ─── Circular gauge ───────────────────────────────────────────────────────────
const CircularGauge = ({ value, max = 40, color, label, temp }) => {
  const circ = 2 * Math.PI * 45;
  const off  = circ - (Math.min(value / max, 1) * circ);
  return (
    <div style={{ textAlign:"center", position:"relative" }}>
      <svg width="140" height="140" style={{ transform:"rotate(-90deg)" }}>
        <circle cx="70" cy="70" r="45" stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none"/>
        <circle cx="70" cy="70" r="45" stroke={color} strokeWidth="10" fill="none"
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition:"all 0.6s cubic-bezier(0.4,0,0.2,1)" }}/>
      </svg>
      <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", fontSize:"32px", fontWeight:"700" }}>
        {value.toFixed(1)}
      </div>
      <div style={{ marginTop:"8px", fontSize:"10px", color:"#888", textTransform:"uppercase", fontWeight:"600", letterSpacing:"1.2px" }}>{label}</div>
      {temp !== undefined && <div style={{ fontSize:"11px", color:"#666", marginTop:"2px" }}>{temp.toFixed(1)}°C</div>}
    </div>
  );
};

// ─── Fuel history chart ───────────────────────────────────────────────────────
const FuelHistoryChart = ({ fuelHistory, color }) => {
  const W=300,H=120,pL=4,pR=4,pT=8,pB=4;
  const tx = (i) => pL + (i/Math.max(fuelHistory.length-1,1))*(W-pL-pR);
  const ty = (v) => pT + (1-v/100)*(H-pT-pB);
  const pts = fuelHistory.map((v,i)=>`${tx(i)},${ty(v)}`).join(" ");
  const area = pts + ` ${tx(fuelHistory.length-1)},${H} ${pL},${H}`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ marginBottom:"20px", display:"block" }}>
      <defs>
        <linearGradient id="fuelGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[30,60,90].map(y=><line key={y} x1={pL} y1={ty(y)} x2={W-pR} y2={ty(y)} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>)}
      {fuelHistory.length>1 && <>
        <polygon points={area} fill="url(#fuelGrad)"/>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx={tx(fuelHistory.length-1)} cy={ty(fuelHistory[fuelHistory.length-1])} r="4" fill={color} stroke="rgba(10,10,20,0.8)" strokeWidth="2"/>
      </>}
      {fuelHistory.length===0 && <text x={W/2} y={H/2} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="11">Collecting data…</text>}
    </svg>
  );
};

// ─── Fuel gauge ───────────────────────────────────────────────────────────────
const FuelGauge = ({ fuelPercent, fuelDistance, fuelStatus, color }) => {
  const r=60,cx=80,cy=80,circ=2*Math.PI*r;
  const fH=(fuelPercent/100)*160, fY=160-fH;
  return (
    <div style={{ textAlign:"center", minWidth:"180px" }}>
      <div style={{ position:"relative", width:"160px", height:"160px", margin:"0 auto" }}>
        <svg width="160" height="160" viewBox="0 0 160 160">
          <defs>
            <clipPath id="cClip"><circle cx={cx} cy={cy} r={r-8}/></clipPath>
            <linearGradient id="liqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.9"/>
              <stop offset="100%" stopColor={color} stopOpacity="0.5"/>
            </linearGradient>
          </defs>
          <circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="16" fill="rgba(255,255,255,0.03)"/>
          <rect x={cx-r+8} y={fY} width={(r-8)*2} height={fH} fill="url(#liqGrad)" clipPath="url(#cClip)" style={{transition:"y 0.8s cubic-bezier(0.4,0,0.2,1),height 0.8s cubic-bezier(0.4,0,0.2,1)"}}/>
          <ellipse cx={cx} cy={fY} rx={r-14} ry={6} fill={color} opacity="0.3" clipPath="url(#cClip)"/>
          <circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth="16" fill="none"
            strokeDasharray={circ} strokeDashoffset={circ*(1-fuelPercent/100)}
            strokeLinecap="round" transform="rotate(-90 80 80)"
            style={{transition:"stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)", filter:`drop-shadow(0 0 6px ${color}90)`}}/>
          <text x={cx} y={cy-8} textAnchor="middle" fill={color} fontSize="26" fontWeight="800" fontFamily="Inter,sans-serif" letterSpacing="-1">{Math.round(fuelPercent)}%</text>
          <text x={cx} y={cy+20} textAnchor="middle" fontSize="18" opacity="0.7">⛽</text>
          <text x={cx} y={cy+38} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9" fontFamily="Inter,sans-serif">
            {fuelDistance!==null?`${Number(fuelDistance).toFixed(1)} cm`:"N/A"}
          </text>
        </svg>
      </div>
      <div style={{ marginTop:"20px", padding:"14px 18px", background:`linear-gradient(135deg,${color}15 0%,transparent 100%)`, borderRadius:"12px", border:`2px solid ${color}40` }}>
        <div style={{ fontSize:"10px", color:"#888", marginBottom:"6px", letterSpacing:"0.8px", fontWeight:"600" }}>TANK STATUS</div>
        <div style={{ fontSize:"14px", fontWeight:"700", color, textTransform:"uppercase" }}>{fuelStatus}</div>
        <div style={{ fontSize:"10px", color:"#666", marginTop:"4px" }}>
          {fuelDistance!==null?`Sensor: ${Number(fuelDistance).toFixed(1)} cm from top`:"No sensor data"}
        </div>
        <div style={{ marginTop:"10px", height:"4px", background:"rgba(255,255,255,0.08)", borderRadius:"2px", overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${fuelPercent}%`, background:color, borderRadius:"2px", transition:"width 0.8s cubic-bezier(0.4,0,0.2,1)", boxShadow:`0 0 6px ${color}80` }}/>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main App ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const BLANK_TIRES = { frontLeft:{value:0,temp:0}, frontRight:{value:0,temp:0}, rearLeft:{value:0,temp:0}, rearRight:{value:0,temp:0} };

  const [data, setData] = useState({
    latitude:13.01272, longitude:77.70410,
    fuelDistance:null, fuelStatus:"Normal", theftStatus:"No Theft",
    tirePressures: BLANK_TIRES,
    wifiSignal:"DISCONNECTED", esp32Status:"OFFLINE",
    deviceOnline:false, engineStatus:"OFF", deviceStatus:"OFFLINE",
    emergencyStatus:"EMERGENCY OFF",
    emergencyMessageSent:false,
  });

  const [fuelHistory,        setFuelHistory]        = useState([]);
  const [alerts,             setAlerts]             = useState([]);
  const [lastUpdateTime,     setLastUpdateTime]     = useState(null);
  const [fuelRefillHistory,  setFuelRefillHistory]  = useState([]);
  const [fuelTheftHistory,   setFuelTheftHistory]   = useState([]);
  const [retryCount,         setRetryCount]         = useState(0);

  // ── Emergency state ────────────────────────────────────────────────────────
  const [showEmergencyPopup,      setShowEmergencyPopup]      = useState(false);
  const emergencyPopupShownRef = useRef(false); // ensures popup shows only once per trigger

  const fetchTimeoutRef         = useRef(null);
  const previousFuelPercentRef  = useRef(null);
  const previousFuelDistanceRef = useRef(null);

  const isDeviceOnline = data.deviceStatus === "ONLINE";
  const isEngineOn     = data.engineStatus === "ON";
  const isEmergency    = data.emergencyStatus === "EMERGENCY ON";

  // TPMS zeros when engine OFF or during emergency
  const displayedTires = useMemo(() =>
    (isEngineOn && !isEmergency) ? data.tirePressures : BLANK_TIRES,
  [isEngineOn, isEmergency, data.tirePressures]);

  // Alert generation
  const generateAlerts = useCallback((result, engineOn, emergency) => {
    const now = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
    const out = [];
    // Always include emergency alert if active
    if (emergency) {
      out.push({time:now,type:"EMERGENCY SOS ACTIVE — Services Notified",severity:"CRITICAL",id:`sos-${Date.now()}`});
      return out; // only emergency alert shown during emergency
    }
    if (result.theftStatus==="Fuel Theft Detected")
      out.push({time:now,type:"Fuel Theft Detected",severity:"CRITICAL",id:`theft-${Date.now()}`});
    const fp = fuelDistanceToPercent(result.fuelDistance);
    if (fp===0||result.fuelStatus==="Tank Empty")
      out.push({time:now,type:"Fuel Tank Empty",severity:"CRITICAL",id:`fe-${Date.now()}`});
    else if (fp>0&&fp<=20)
      out.push({time:now,type:"Low Fuel Warning",severity:"WARNING",id:`fl-${Date.now()}`});
    if (engineOn) {
      [{n:"Front Left",v:result.tirePressures?.frontLeft?.value||0},
       {n:"Front Right",v:result.tirePressures?.frontRight?.value||0},
       {n:"Rear Left",v:result.tirePressures?.rearLeft?.value||0},
       {n:"Rear Right",v:result.tirePressures?.rearRight?.value||0}].forEach(t=>{
        if(t.v<11.5&&t.v>0) out.push({time:now,type:`Critical: ${t.n} Tire Pressure`,severity:"CRITICAL",id:`tc-${t.n}-${Date.now()}`});
        else if(t.v<12.5&&t.v>0) out.push({time:now,type:`Low: ${t.n} Tire Pressure`,severity:"WARNING",id:`tw-${t.n}-${Date.now()}`});
      });
    }
    return out;
  }, []);

  // Reset everything to offline state
  const resetToOffline = useCallback(() => {
    setLastUpdateTime(null);
    setAlerts([]);
    setFuelHistory([]);
    previousFuelPercentRef.current  = null;
    previousFuelDistanceRef.current = null;
    emergencyPopupShownRef.current  = false;
    setData(prev => ({
      ...prev,
      deviceOnline:false, esp32Status:"OFFLINE",
      wifiSignal:"DISCONNECTED", deviceStatus:"OFFLINE",
      fuelDistance:null, fuelStatus:"Normal", theftStatus:"No Theft",
      tirePressures: BLANK_TIRES,
      engineStatus:"OFF",
      emergencyStatus:"EMERGENCY OFF",
      emergencyMessageSent:false,
    }));
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), CONNECTION_TIMEOUT);
      const res  = await fetch("http://localhost:1880/vehicle-data", { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();

      const deviceOnline = result.deviceStatus === "ONLINE";
      const engineOn     = result.engineStatus === "ON";
      const emergency    = result.emergencyStatus === "EMERGENCY ON";
      const msgSent      = result.emergencyMessageSent === true;

      if (!deviceOnline) {
        setRetryCount(c => c + 1);
        resetToOffline();
        return;
      }

      setRetryCount(0);
      setLastUpdateTime(new Date());

      // ── Show emergency popup only once per activation ──────────────────
      if (emergency && msgSent && !emergencyPopupShownRef.current) {
        emergencyPopupShownRef.current = true;
        setShowEmergencyPopup(true);
      }
      // Reset popup tracker when emergency turns off
      if (!emergency) {
        emergencyPopupShownRef.current = false;
      }

      // ── Fuel history (only when not in emergency) ──────────────────────
      if (!emergency) {
        const fp = fuelDistanceToPercent(result.fuelDistance);
        if (!isNaN(fp)) {
          setFuelHistory(prev => [...prev, fp].slice(-MAX_HISTORY_LENGTH));

          if (previousFuelDistanceRef.current!==null && previousFuelPercentRef.current!==null
            && result.fuelDistance!==null && result.fuelDistance>0) {
            const dc  = result.fuelDistance - previousFuelDistanceRef.current;
            const pp  = previousFuelPercentRef.current;
            const pl  = percentToLiters(pp);
            const cl  = percentToLiters(fp);
            const lc  = cl - pl;
            const dt  = new Date();
            const ts  = dt.toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});

            if (dc<=-1.5 && lc>0.1) {
              const ev={id:`refill-${Date.now()}`,timestamp:ts,date:dt,
                previousPercent:pp.toFixed(1),currentPercent:fp.toFixed(1),
                previousLiters:pl.toFixed(2),currentLiters:cl.toFixed(2),
                refillAmount:lc.toFixed(2),
                previousDistance:previousFuelDistanceRef.current.toFixed(2),currentDistance:result.fuelDistance.toFixed(2),
                distanceChange:Math.abs(dc).toFixed(2),
                location:{latitude:result.latitude,longitude:result.longitude}};
              setFuelRefillHistory(prev=>{
                if(prev.find(r=>(dt.getTime()-r.date.getTime())<10000)) return prev;
                return [ev,...prev].slice(0,10);
              });
            }
            if ((result.theftStatus==="Fuel Theft Detected"||dc>=1.5) && Math.abs(lc)>0.1) {
              const stolen=Math.abs(lc);
              const ev={id:`theft-${Date.now()}`,timestamp:ts,date:dt,
                previousPercent:pp.toFixed(1),currentPercent:fp.toFixed(1),
                previousLiters:pl.toFixed(2),currentLiters:cl.toFixed(2),
                stolenAmount:stolen.toFixed(2),remainingLiters:cl.toFixed(2),
                previousDistance:previousFuelDistanceRef.current.toFixed(2),currentDistance:result.fuelDistance.toFixed(2),
                distanceChange:dc.toFixed(2),
                detectionMethod:result.theftStatus==="Fuel Theft Detected"?'Arduino Flag':'Distance Threshold',
                location:{latitude:result.latitude,longitude:result.longitude}};
              setFuelTheftHistory(prev=>{
                if(prev.find(t=>(dt.getTime()-t.date.getTime())<10000)) return prev;
                return [ev,...prev].slice(0,10);
              });
            }
          }
          previousFuelPercentRef.current  = fp;
          previousFuelDistanceRef.current = result.fuelDistance;
        }
      }

      setAlerts(generateAlerts(result, engineOn, emergency));
      setData(prev=>({
        latitude:               result.latitude               ??prev.latitude,
        longitude:              result.longitude              ??prev.longitude,
        fuelDistance:           result.fuelDistance           ??prev.fuelDistance,
        fuelStatus:             result.fuelStatus             ??prev.fuelStatus,
        theftStatus:            result.theftStatus            ??prev.theftStatus,
        tirePressures:          result.tirePressures          ??prev.tirePressures,
        wifiSignal:             "STRONG",
        esp32Status:            "ONLINE",
        deviceOnline:           true,
        engineStatus:           result.engineStatus           ??"OFF",
        deviceStatus:           result.deviceStatus           ??"OFFLINE",
        emergencyStatus:        result.emergencyStatus        ??"EMERGENCY OFF",
        emergencyMessageSent:   result.emergencyMessageSent   ??false,
      }));

    } catch(err) {
      console.error("Fetch error:", err.message);
      setRetryCount(c => c + 1);
      resetToOffline();
    }
  }, [generateAlerts, resetToOffline]);

  useEffect(()=>{
    fetchData();
    const id = setInterval(fetchData, FETCH_INTERVAL);
    return ()=>{ clearInterval(id); if(fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current); };
  }, [fetchData]);

  const fuelPercent  = useMemo(()=>fuelDistanceToPercent(data.fuelDistance),[data.fuelDistance]);
  const getFuelColor = useCallback(()=>{
    if(fuelPercent===0||data.fuelStatus==="Tank Empty") return "#ff3b3b";
    if(fuelPercent<=20) return "#ffae00";
    if(fuelPercent>=80||data.fuelStatus==="Tank Full") return "#00ff88";
    return "#00d9ff";
  },[fuelPercent,data.fuelStatus]);
  const getTireColor     = useCallback(v=>v===0?"#666":v>=12.5?"#00ff88":v>=11.5?"#ffae00":"#ff3b3b",[]);
  const getSeverityColor = useCallback(s=>s==="CRITICAL"?"#ff3b3b":s==="WARNING"?"#ffae00":"#00ff88",[]);
  const position         = useMemo(()=>[data.latitude,data.longitude],[data.latitude,data.longitude]);
  const routePath        = useMemo(()=>[
    [data.latitude-0.002,data.longitude-0.003],
    [data.latitude-0.001,data.longitude-0.002],
    [data.latitude,data.longitude],
  ],[data.latitude,data.longitude]);

  const card = {
    background:"rgba(20,20,35,0.95)", backdropFilter:"blur(12px)",
    padding:"24px", borderRadius:"16px",
    border:"1px solid rgba(255,255,255,0.08)",
    boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
  };

  const emergencyCard = {
    ...card,
    border: "1px solid rgba(255,59,59,0.3)",
    boxShadow: "0 8px 32px rgba(255,59,59,0.15), 0 0 0 1px rgba(255,59,59,0.1)",
  };

  return (
    <div style={{ background:"linear-gradient(135deg,#0a0a14 0%,#1a1a2e 100%)", minHeight:"100vh", padding:"20px", fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color:"#fff" }}>

      {/* ══ OFFLINE OVERLAY ══ */}
      {!isDeviceOnline && <OfflineOverlay retryCount={retryCount} />}

      {/* ══ EMERGENCY SOS POPUP ══ */}
      {showEmergencyPopup && (
        <EmergencySOSPopup onClose={() => setShowEmergencyPopup(false)} />
      )}

      {/* ══ EMERGENCY BANNER ══ */}
      {isEmergency && isDeviceOnline && <EmergencyBanner />}

      {/* ── Header ── */}
      <div style={{
        background:"rgba(20,20,35,0.95)", backdropFilter:"blur(12px)",
        padding:"24px 32px", borderRadius:"16px",
        border:`1px solid ${isEmergency ? "rgba(255,59,59,0.5)" : isDeviceOnline ? "rgba(255,255,255,0.08)" : "rgba(255,59,59,0.3)"}`,
        display:"flex", justifyContent:"space-between", alignItems:"center",
        marginBottom:"24px", boxShadow:`0 8px 32px rgba(0,0,0,0.5)${isEmergency?", 0 0 40px rgba(255,59,59,0.2)":""}`,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:"20px" }}>
          <div style={{
            width:"60px", height:"60px", borderRadius:"50%",
            border:`3px solid ${isEmergency?"#ff3b3b":isDeviceOnline?"#00d9ff":"#ff3b3b"}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            background:isEmergency?"rgba(255,59,59,0.15)":isDeviceOnline?"rgba(0,217,255,0.1)":"rgba(255,59,59,0.1)",
          }}>
            {isEmergency
              ? <span style={{ fontSize:"24px", animation:"sosBlink 0.8s ease-in-out infinite" }}>🆘</span>
              : <div style={{ width:"30px", height:"30px", borderRadius:"50%", background:isDeviceOnline?"#00d9ff":"#ff3b3b", animation:isDeviceOnline?"pulse 2s infinite":"blink 1s infinite" }}/>
            }
          </div>
          <div>
            <h1 style={{ margin:0, fontSize:"24px", fontWeight:"700", color:isEmergency?"#ff3b3b":isDeviceOnline?"#00d9ff":"#ff3b3b", letterSpacing:"-0.5px" }}>
              VehicleGuard Pro
            </h1>
            <p style={{ margin:"4px 0 0 0", color:"#aaa", fontSize:"13px", fontWeight:"500" }}>Cloud-Connected TPMS & Fuel Monitoring System</p>
            <p style={{ margin:"4px 0 0 0", color:"#666", fontSize:"11px" }}>
              {lastUpdateTime?`Last update: ${lastUpdateTime.toLocaleTimeString()}`:'Connecting...'}
            </p>
          </div>
        </div>
        <div style={{ textAlign:"right", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"10px" }}>
          {/* Device Online/Offline badge */}
          <div style={{ display:"inline-flex", alignItems:"center", gap:"8px", background:isDeviceOnline?"linear-gradient(135deg,rgba(0,255,136,0.15)0%,rgba(0,217,255,0.15)100%)":"rgba(255,59,59,0.15)", padding:"10px 20px", borderRadius:"12px", border:`2px solid ${isDeviceOnline?"#00ff88":"#ff3b3b"}` }}>
            <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:isDeviceOnline?"#00ff88":"#ff3b3b", animation:isDeviceOnline?"pulse 2s infinite":"blink 1s infinite" }}/>
            <span style={{ color:isDeviceOnline?"#00ff88":"#ff3b3b", fontWeight:"700", fontSize:"13px", letterSpacing:"0.5px" }}>{isDeviceOnline?"ONLINE":"OFFLINE"}</span>
          </div>
          {/* Emergency SOS indicator */}
          <EmergencyStatusIndicator isEmergency={isEmergency} />
          {/* Engine status (hidden during emergency) */}
          {!isEmergency && (
            <div style={{ display:"inline-flex", alignItems:"center", gap:"8px", background:isEngineOn?"rgba(0,255,136,0.10)":"rgba(100,100,120,0.15)", padding:"8px 16px", borderRadius:"10px", border:`2px solid ${isEngineOn?"#00ff8880":"rgba(255,255,255,0.15)"}` }}>
              <span style={{ fontSize:"14px" }}>{isEngineOn?"🟢":"🔴"}</span>
              <span style={{ color:isEngineOn?"#00ff88":"#888", fontWeight:"700", fontSize:"12px" }}>ENGINE {isEngineOn?"ON":"OFF"}</span>
            </div>
          )}
          <div style={{ fontSize:"10px", color:"#666", letterSpacing:"0.5px" }}>MODEL: THUNDERSTRIKE EV</div>
          <div style={{ fontSize:"12px", color:"#888" }}>Driver: John Doe</div>
        </div>
      </div>

      {/* ══ MAIN GRID ══ */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(500px,1fr))", gap:"20px" }}>

        {/* ── Alerts ── */}
        {isDeviceOnline ? (
          <div style={isEmergency ? emergencyCard : card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
              <h3 style={{ margin:0, fontSize:"15px", letterSpacing:"1px", color: isEmergency?"#ff3b3b":"#888", fontWeight:"600", textTransform:"uppercase" }}>Active Alerts</h3>
              <div style={{ background:alerts.length===0?"rgba(0,255,136,0.15)":"rgba(255,59,59,0.15)", padding:"6px 12px", borderRadius:"8px", fontSize:"11px", fontWeight:"700", color:alerts.length===0?"#00ff88":"#ff3b3b" }}>
                {alerts.length} ALERT{alerts.length!==1?"S":""}
              </div>
            </div>
            <div style={{ maxHeight:"340px", overflowY:"auto" }}>
              {alerts.length>0 ? alerts.map(a=>(
                <div key={a.id} style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:"16px", padding:"16px", background:`linear-gradient(135deg,${getSeverityColor(a.severity)}15 0%,transparent 100%)`, borderLeft:`3px solid ${getSeverityColor(a.severity)}`, borderRadius:"10px", marginBottom:"12px", alignItems:"center" }}>
                  <div style={{ fontSize:"11px", color:"#888", minWidth:"70px" }}>{a.time}</div>
                  <div style={{ fontSize:"13px", color:"#fff", fontWeight:"500" }}>{a.type}</div>
                  <span style={{ background:getSeverityColor(a.severity), color:a.severity==="WARNING"?"#000":"#fff", padding:"6px 14px", borderRadius:"6px", fontSize:"10px", fontWeight:"700" }}>{a.severity}</span>
                </div>
              )) : (
                <div style={{ textAlign:"center", padding:"60px 20px", background:"rgba(0,255,136,0.05)", borderRadius:"12px", border:"2px dashed rgba(0,255,136,0.2)" }}>
                  <div style={{ fontSize:"48px", marginBottom:"12px" }}>✓</div>
                  <div style={{ color:"#00ff88", fontSize:"16px", fontWeight:"700", marginBottom:"4px" }}>All Systems Normal</div>
                  <div style={{ color:"#666", fontSize:"12px" }}>No alerts detected</div>
                </div>
              )}
            </div>
          </div>
        ) : <SuspendedCard title="Active Alerts" icon="🔔" />}

        {/* ── GPS — always shown when online (emergency or not) ── */}
        {isDeviceOnline ? (
          <div style={{ ...(isEmergency ? emergencyCard : card), height:"500px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
              <h3 style={{ margin:0, fontSize:"15px", letterSpacing:"1px", color:isEmergency?"#ff3b3b":"#888", fontWeight:"600", textTransform:"uppercase" }}>GPS Vehicle Tracking</h3>
              {isEmergency && (
                <div style={{ display:"flex", alignItems:"center", gap:"8px", background:"rgba(255,59,59,0.15)", padding:"6px 14px", borderRadius:"8px", border:"1px solid rgba(255,59,59,0.4)" }}>
                  <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#ff3b3b", animation:"sosBlink 0.8s infinite" }}/>
                  <span style={{ fontSize:"11px", color:"#ff3b3b", fontWeight:"700" }}>ACTIVE DURING EMERGENCY</span>
                </div>
              )}
            </div>
            <div style={{ height:"calc(100% - 100px)", width:"100%", borderRadius:"12px", overflow:"hidden", border:`2px solid ${isEmergency?"rgba(255,59,59,0.4)":"rgba(0,217,255,0.2)"}`, boxShadow:`0 0 20px ${isEmergency?"rgba(255,59,59,0.2)":"rgba(0,217,255,0.1)"}` }}>
              <MapContainer center={position} zoom={15} style={{ height:"100%", width:"100%" }} zoomControl={true}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">CARTO</a>'/>
                <Polyline positions={routePath} color={isEmergency?"#ff3b3b":"#00d9ff"} weight={isEmergency?4:3} dashArray={isEmergency?"8,6":"5,10"} opacity={0.7}/>
                <Marker position={position} icon={isEmergency ? emergencyVehicleIcon : vehicleIcon}/>
                <MapUpdater position={position}/>
              </MapContainer>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"16px", fontSize:"11px", color:"#888" }}>
              <div style={{ fontWeight:"500" }}>
                <span style={{ color:isEmergency?"#ff3b3b":"#00d9ff" }}>LAT:</span> {data.latitude.toFixed(6)}° N
                <span style={{ margin:"0 12px" }}>|</span>
                <span style={{ color:isEmergency?"#ff3b3b":"#00d9ff" }}>LON:</span> {data.longitude.toFixed(6)}° E
              </div>
              {isEmergency && (
                <div style={{ fontSize:"11px", color:"#ff3b3b", fontWeight:"600" }}>
                  📡 Location shared with emergency services
                </div>
              )}
            </div>
          </div>
        ) : <SuspendedCard title="GPS Vehicle Tracking" icon="📍" minHeight="300px" />}

        {/* ── Fuel Monitoring — disabled during emergency ── */}
        {isEmergency ? (
          <DisabledDuringEmergency title="Fuel Monitoring" icon="⛽" />
        ) : isDeviceOnline ? (
          <div style={card}>
            <h3 style={{ margin:"0 0 24px 0", fontSize:"15px", letterSpacing:"1px", color:"#888", fontWeight:"600", textTransform:"uppercase" }}>Fuel Monitoring</h3>
            <div style={{ display:"flex", alignItems:"flex-start", gap:"32px" }}>
              <FuelGauge fuelPercent={fuelPercent} fuelDistance={data.fuelDistance} fuelStatus={data.fuelStatus} color={getFuelColor()}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"11px", color:"#666", marginBottom:"12px", letterSpacing:"0.8px", fontWeight:"600" }}>FUEL LEVEL HISTORY</div>
                <FuelHistoryChart fuelHistory={fuelHistory} color={getFuelColor()}/>
                {data.theftStatus==="Fuel Theft Detected" ? (
                  <div style={{ background:"linear-gradient(135deg,#ff3b3b 0%,#cc0000 100%)", color:"#fff", padding:"20px 24px", borderRadius:"12px", fontWeight:"700", textAlign:"center", animation:"blink 1s infinite", boxShadow:"0 8px 24px rgba(255,59,59,0.4)", border:"2px solid #ff6b6b" }}>
                    <div style={{ fontSize:"32px", marginBottom:"8px" }}>⚠️</div>
                    <div style={{ fontSize:"18px", marginBottom:"4px" }}>FUEL THEFT DETECTED!</div>
                    <div style={{ fontSize:"12px", opacity:0.9 }}>Immediate attention required</div>
                  </div>
                ) : fuelPercent>0&&fuelPercent<=20 ? (
                  <div style={{ background:"linear-gradient(135deg,#ffae00 0%,#ff8800 100%)", color:"#000", padding:"18px 22px", borderRadius:"12px", fontWeight:"700", textAlign:"center", animation:"blink 2s infinite", boxShadow:"0 8px 24px rgba(255,174,0,0.4)", border:"2px solid #ffcc00" }}>
                    <div style={{ fontSize:"28px", marginBottom:"6px" }}>⚠️</div>
                    <div style={{ fontSize:"16px", marginBottom:"4px" }}>LOW FUEL WARNING</div>
                    <div style={{ fontSize:"12px", opacity:0.9 }}>Please refuel soon — {Math.round(fuelPercent)}% remaining</div>
                  </div>
                ) : (
                  <div style={{ background:"rgba(0,255,136,0.1)", color:"#00ff88", padding:"18px 22px", borderRadius:"12px", fontWeight:"600", textAlign:"center", border:"2px solid rgba(0,255,136,0.3)", display:"flex", alignItems:"center", justifyContent:"center", gap:"12px" }}>
                    <span style={{ width:"10px", height:"10px", borderRadius:"50%", background:"#00ff88", animation:"pulse 2s infinite", display:"inline-block" }}/>
                    <span style={{ fontSize:"14px" }}>FUEL FLOW: NORMAL</span>
                    <span>✓</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : <SuspendedCard title="Fuel Monitoring" icon="⛽" minHeight="320px" />}

        {/* ── Refill History — disabled during emergency ── */}
        {isEmergency ? (
          <DisabledDuringEmergency title="Fuel Refill History" icon="⛽" />
        ) : (
          <div style={card}>
            <h3 style={{ margin:"0 0 20px 0", fontSize:"15px", letterSpacing:"1px", color:"#888", fontWeight:"600", textTransform:"uppercase" }}>⛽ Fuel Refill History</h3>
            {isDeviceOnline ? (
              <div style={{ maxHeight:"400px", overflowY:"auto" }}>
                {fuelRefillHistory.length>0 ? fuelRefillHistory.map(r=>(
                  <div key={r.id} style={{ background:"rgba(0,255,136,0.08)", border:"1px solid rgba(0,255,136,0.3)", borderRadius:"12px", padding:"16px", marginBottom:"12px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
                      <div style={{ fontSize:"11px", color:"#888", fontWeight:"600" }}>{r.timestamp}</div>
                      <div style={{ background:"#00ff88", color:"#000", padding:"4px 10px", borderRadius:"6px", fontSize:"10px", fontWeight:"700" }}>+ {r.refillAmount} L</div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"10px" }}>
                      <div><div style={{ fontSize:"10px", color:"#666", marginBottom:"4px" }}>BEFORE</div><div style={{ fontSize:"14px", color:"#fff", fontWeight:"600" }}>{r.previousLiters} L ({r.previousPercent}%)</div></div>
                      <div><div style={{ fontSize:"10px", color:"#666", marginBottom:"4px" }}>AFTER</div><div style={{ fontSize:"14px", color:"#00ff88", fontWeight:"600" }}>{r.currentLiters} L ({r.currentPercent}%)</div></div>
                    </div>
                    <div style={{ background:"rgba(0,255,136,0.1)", padding:"8px 12px", borderRadius:"8px" }}>
                      <div style={{ fontSize:"10px", color:"#888", marginBottom:"2px" }}>SENSOR READING</div>
                      <div style={{ fontSize:"12px", color:"#00ff88" }}>Distance decreased by {r.distanceChange} cm</div>
                    </div>
                    <div style={{ fontSize:"11px", color:"#00d9ff", display:"flex", alignItems:"center", gap:"6px", marginTop:"8px", paddingTop:"8px", borderTop:"1px solid rgba(255,255,255,0.1)" }}>
                      <span>📍</span><span>{r.location.latitude.toFixed(6)}°N, {r.location.longitude.toFixed(6)}°E</span>
                    </div>
                  </div>
                )) : (
                  <div style={{ textAlign:"center", padding:"40px 20px", background:"rgba(255,255,255,0.03)", borderRadius:"12px", border:"1px dashed rgba(255,255,255,0.1)" }}>
                    <div style={{ fontSize:"36px", marginBottom:"8px" }}>⛽</div>
                    <div style={{ color:"#666", fontSize:"13px" }}>No refill events recorded</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign:"center", padding:"40px 20px", background:"rgba(255,59,59,0.05)", borderRadius:"12px", border:"1px dashed rgba(255,59,59,0.2)" }}>
                <div style={{ fontSize:"28px", marginBottom:"8px" }}>⚠️</div>
                <div style={{ color:"#ff3b3b", fontSize:"12px", fontWeight:"600" }}>Data suspended — device offline</div>
                <div style={{ color:"#555", fontSize:"11px", marginTop:"4px" }}>History preserved until reconnection</div>
              </div>
            )}
          </div>
        )}

        {/* ── Theft History — disabled during emergency ── */}
        {isEmergency ? (
          <DisabledDuringEmergency title="Fuel Theft History" icon="🚨" />
        ) : (
          <div style={card}>
            <h3 style={{ margin:"0 0 20px 0", fontSize:"15px", letterSpacing:"1px", color:"#888", fontWeight:"600", textTransform:"uppercase" }}>🚨 Fuel Theft History</h3>
            {isDeviceOnline ? (
              <div style={{ maxHeight:"400px", overflowY:"auto" }}>
                {fuelTheftHistory.length>0 ? fuelTheftHistory.map(t=>(
                  <div key={t.id} style={{ background:"rgba(255,59,59,0.08)", border:"1px solid rgba(255,59,59,0.3)", borderRadius:"12px", padding:"16px", marginBottom:"12px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
                      <div style={{ fontSize:"11px", color:"#888", fontWeight:"600" }}>{t.timestamp}</div>
                      <div style={{ background:"#ff3b3b", color:"#fff", padding:"4px 10px", borderRadius:"6px", fontSize:"10px", fontWeight:"700" }}>- {t.stolenAmount} L</div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px", marginBottom:"10px" }}>
                      <div><div style={{ fontSize:"10px", color:"#666", marginBottom:"4px" }}>BEFORE</div><div style={{ fontSize:"14px", color:"#fff", fontWeight:"600" }}>{t.previousLiters} L ({t.previousPercent}%)</div></div>
                      <div><div style={{ fontSize:"10px", color:"#666", marginBottom:"4px" }}>STOLEN</div><div style={{ fontSize:"14px", color:"#ff3b3b", fontWeight:"600" }}>{t.stolenAmount} L</div></div>
                      <div><div style={{ fontSize:"10px", color:"#666", marginBottom:"4px" }}>REMAINING</div><div style={{ fontSize:"14px", color:"#ffae00", fontWeight:"600" }}>{t.remainingLiters} L ({t.currentPercent}%)</div></div>
                    </div>
                    <div style={{ background:"rgba(255,59,59,0.1)", padding:"8px 12px", borderRadius:"8px", marginBottom:"8px" }}>
                      <div style={{ fontSize:"10px", color:"#888", marginBottom:"2px" }}>DETECTION METHOD</div>
                      <div style={{ fontSize:"11px", color:"#ff3b3b", fontWeight:"600" }}>{t.detectionMethod}</div>
                      <div style={{ fontSize:"10px", color:"#888", marginTop:"2px" }}>Distance +{t.distanceChange} cm (threshold: 1.5 cm)</div>
                    </div>
                    <div style={{ fontSize:"11px", color:"#ff3b3b", display:"flex", alignItems:"center", gap:"6px", marginTop:"8px", paddingTop:"8px", borderTop:"1px solid rgba(255,255,255,0.1)" }}>
                      <span>📍</span><span>{t.location.latitude.toFixed(6)}°N, {t.location.longitude.toFixed(6)}°E</span>
                    </div>
                  </div>
                )) : (
                  <div style={{ textAlign:"center", padding:"40px 20px", background:"rgba(255,255,255,0.03)", borderRadius:"12px", border:"1px dashed rgba(255,255,255,0.1)" }}>
                    <div style={{ fontSize:"36px", marginBottom:"8px" }}>✓</div>
                    <div style={{ color:"#00ff88", fontSize:"13px", fontWeight:"600", marginBottom:"4px" }}>No theft incidents recorded</div>
                    <div style={{ color:"#666", fontSize:"11px" }}>All fuel levels normal</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign:"center", padding:"40px 20px", background:"rgba(255,59,59,0.05)", borderRadius:"12px", border:"1px dashed rgba(255,59,59,0.2)" }}>
                <div style={{ fontSize:"28px", marginBottom:"8px" }}>⚠️</div>
                <div style={{ color:"#ff3b3b", fontSize:"12px", fontWeight:"600" }}>Data suspended — device offline</div>
                <div style={{ color:"#555", fontSize:"11px", marginTop:"4px" }}>History preserved until reconnection</div>
              </div>
            )}
          </div>
        )}

        {/* ── TPMS — disabled during emergency ── */}
        {isEmergency ? (
          <DisabledDuringEmergency title="Tire Pressure Monitoring (TPMS)" icon="🔧" />
        ) : isDeviceOnline ? (
          <div style={card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"28px" }}>
              <h3 style={{ margin:0, fontSize:"15px", letterSpacing:"1px", color:"#888", fontWeight:"600", textTransform:"uppercase" }}>Tire Pressure Monitoring (TPMS)</h3>
              <div style={{ display:"inline-flex", alignItems:"center", gap:"6px", background:isEngineOn?"rgba(0,255,136,0.1)":"rgba(255,59,59,0.1)", padding:"6px 12px", borderRadius:"8px", border:`1px solid ${isEngineOn?"#00ff8860":"#ff3b3b60"}`, fontSize:"11px", fontWeight:"700", color:isEngineOn?"#00ff88":"#ff3b3b" }}>
                <span>{isEngineOn?"🟢":"🔴"}</span>
                {isEngineOn?"ENGINE ON — TPMS ACTIVE":"ENGINE OFF — TPMS DISABLED"}
              </div>
            </div>
            <div style={{ opacity:isEngineOn?1:0.4, transition:"opacity 0.4s ease" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"32px", marginBottom:"24px" }}>
                <CircularGauge value={displayedTires.frontLeft?.value||0}  max={20} color={getTireColor(displayedTires.frontLeft?.value||0)}  label="FRONT LEFT (FL)"  temp={displayedTires.frontLeft?.temp}/>
                <CircularGauge value={displayedTires.frontRight?.value||0} max={20} color={getTireColor(displayedTires.frontRight?.value||0)} label="FRONT RIGHT (FR)" temp={displayedTires.frontRight?.temp}/>
                <CircularGauge value={displayedTires.rearLeft?.value||0}   max={20} color={getTireColor(displayedTires.rearLeft?.value||0)}   label="REAR LEFT (RL)"   temp={displayedTires.rearLeft?.temp}/>
                <CircularGauge value={displayedTires.rearRight?.value||0}  max={20} color={getTireColor(displayedTires.rearRight?.value||0)}  label="REAR RIGHT (RR)"  temp={displayedTires.rearRight?.temp}/>
              </div>
            </div>
            {!isEngineOn && (
              <div style={{ textAlign:"center", padding:"12px", background:"rgba(255,59,59,0.08)", borderRadius:"10px", border:"1px solid rgba(255,59,59,0.2)", marginBottom:"16px" }}>
                <div style={{ fontSize:"13px", color:"#ff3b3b", fontWeight:"600" }}>🔴 TPMS sensors inactive — engine is OFF</div>
                <div style={{ fontSize:"11px", color:"#888", marginTop:"4px" }}>Readings will resume when engine turns ON</div>
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"center", gap:"32px", fontSize:"11px", paddingTop:"20px", borderTop:"1px solid rgba(255,255,255,0.08)" }}>
              {[["#00ff88","Normal (≥12.5 PSI)"],["#ffae00","Warning (11.5–12.5 PSI)"],["#ff3b3b","Critical (<11.5 PSI)"]].map(([c,l])=>(
                <div key={l} style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                  <div style={{ width:"16px", height:"16px", background:c, borderRadius:"4px" }}/>
                  <span style={{ color:"#aaa", fontWeight:"500" }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <SuspendedCard title="Tire Pressure Monitoring (TPMS)" icon="🔧" minHeight="300px" />}

        {/* ── System Health ── */}
        <div style={isEmergency ? emergencyCard : card}>
          <h3 style={{ margin:"0 0 24px 0", fontSize:"15px", letterSpacing:"1px", color:isEmergency?"#ff3b3b":"#888", fontWeight:"600", textTransform:"uppercase" }}>System Health</h3>
          <div style={{ marginBottom:"24px" }}>
            <div style={{ fontSize:"11px", color:"#666", marginBottom:"14px", letterSpacing:"0.8px", fontWeight:"600" }}>CONNECTION STATUS</div>
            <div style={{ display:"grid", gap:"12px" }}>
              {[
                {label:"WiFi Signal",      val:data.wifiSignal,                                         clr:data.wifiSignal==="DISCONNECTED"?"#ff3b3b":"#00ff88",  an:data.wifiSignal==="DISCONNECTED"?"blink 1s infinite":"pulse 2s infinite"},
                {label:"ESP32 Module",     val:data.esp32Status,                                        clr:data.esp32Status==="ONLINE"?"#00d9ff":"#ff3b3b",        an:data.esp32Status==="ONLINE"?"pulse 2s infinite":"blink 1s infinite"},
                {label:"Cloud Connection", val:isDeviceOnline?"CONNECTED":"DISCONNECTED",              clr:isDeviceOnline?"#00ff88":"#ff3b3b",                      an:isDeviceOnline?"pulse 2s infinite":"blink 1s infinite"},
                {label:"Engine Status",    val:isEmergency?"SUSPENDED":isEngineOn?"ON":"OFF",           clr:isEmergency?"#666":isEngineOn?"#00ff88":"#888",          an:isEmergency?"none":isEngineOn?"pulse 2s infinite":"none"},
                {label:"Emergency SOS",    val:isEmergency?"ACTIVE":"STANDBY",                         clr:isEmergency?"#ff3b3b":"#00ff88",                         an:isEmergency?"sosBlink 0.8s ease-in-out infinite":"pulse 2s infinite"},
              ].map(({label,val,clr,an})=>(
                <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", background:"rgba(255,255,255,0.03)", borderRadius:"10px", border:`1px solid ${clr}40` }}>
                  <span style={{ color:"#ccc", fontSize:"13px", fontWeight:"500" }}>{label}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                    <span style={{ display:"inline-block", width:"8px", height:"8px", borderRadius:"50%", background:clr, animation:an }}/>
                    <span style={{ color:clr, fontWeight:"700", fontSize:"12px" }}>{val}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding:"16px", background:isEmergency?"rgba(255,59,59,0.07)":"rgba(0,217,255,0.05)", borderRadius:"10px", border:`1px solid ${isEmergency?"rgba(255,59,59,0.3)":"rgba(0,217,255,0.2)"}` }}>
            <div style={{ fontSize:"11px", color:"#888", marginBottom:"8px", fontWeight:"600" }}>SYSTEM INFO</div>
            <div style={{ fontSize:"12px", color:"#ccc", lineHeight:"1.6" }}>
              <div>Model: Thunderstrike EV</div>
              <div>Firmware: v2.1.0</div>
              <div>Update Rate: {FETCH_INTERVAL}ms</div>
              <div>Device Status: <span style={{ color:isDeviceOnline?"#00ff88":"#ff3b3b", fontWeight:"600" }}>{data.deviceStatus}</span></div>
              {!isEmergency && <div>Engine: <span style={{ color:isEngineOn?"#00ff88":"#888", fontWeight:"600" }}>{data.engineStatus}</span></div>}
              <div>Emergency: <span style={{ color:isEmergency?"#ff3b3b":"#00ff88", fontWeight:"600" }}>{data.emergencyStatus}</span></div>
              {!isDeviceOnline && <div style={{ color:"#ff3b3b", marginTop:"4px" }}>Retry attempts: {retryCount}</div>}
            </div>
          </div>
        </div>

      </div>{/* end grid */}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(0.92)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes offlinePulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.15);opacity:0.5} }
        @keyframes offlineBlink { 0%,100%{opacity:1;text-shadow:0 0 40px rgba(255,59,59,0.7)} 50%{opacity:0.75;text-shadow:0 0 80px rgba(255,59,59,1)} }
        @keyframes sosPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.12)} }
        @keyframes sosBlink { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes sosRing { 0%{transform:scale(0.8);opacity:0.8} 100%{transform:scale(1.4);opacity:0} }
        @keyframes emergencyScroll { 0%{background-position:0% 50%} 100%{background-position:100% 50%} }
        *::-webkit-scrollbar{width:8px;height:8px}
        *::-webkit-scrollbar-track{background:rgba(255,255,255,0.05);border-radius:4px}
        *::-webkit-scrollbar-thumb{background:rgba(0,217,255,0.3);border-radius:4px}
        *::-webkit-scrollbar-thumb:hover{background:rgba(0,217,255,0.5)}
      `}</style>
    </div>
  );
}

export default App;