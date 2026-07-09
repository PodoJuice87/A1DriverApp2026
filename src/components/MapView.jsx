import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 지도 중심을 동적으로 변경하기 위한 도우미 컴포넌트
function ChangeView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

export default function MapView({ drivers, selectedDriverId, onSelectDriver }) {
  // 기본 좌표: 서울 강남역(드라이버들의 기본 좌표)
  const defaultCenter = [37.498, 127.027];
  const defaultZoom = 14;

  // 선택된 드라이버가 있을 경우 그 좌표를 지도의 중심으로 설정
  const getMapCenter = () => {
    if (selectedDriverId) {
      const selected = drivers.find(d => d.id === selectedDriverId);
      if (selected && selected.lat && selected.lng) {
        return [selected.lat, selected.lng];
      }
    }
    
    // 출근한 드라이버들의 평균 좌표 계산
    const activeDrivers = drivers.filter(d => d.status !== '미출근' && d.lat && d.lng);
    if (activeDrivers.length > 0) {
      const sumLat = activeDrivers.reduce((sum, d) => sum + d.lat, 0);
      const sumLng = activeDrivers.reduce((sum, d) => sum + d.lng, 0);
      return [sumLat / activeDrivers.length, sumLng / activeDrivers.length];
    }
    
    return defaultCenter;
  };

  const center = getMapCenter();
  const zoom = selectedDriverId ? 15 : 13;

  // 드라이버 상태별 마커 핀 색상 지정 함수
  const getMarkerColor = (status) => {
    switch (status) {
      case '대기': return 'var(--color-ready)';     // 블루
      case '확인완료': return 'var(--color-confirm)'; // 보라
      case '진행중': return 'var(--color-driving)';   // 골드
      case '완료': return 'var(--color-completed)';   // 에메랄드
      default: return 'var(--color-off)';           // 그레이
    }
  };

  // Leaflet.js 커스텀 HTML 마커 생성 함수 (divIcon 사용)
  const createCustomIcon = (carHo, status) => {
    const color = getMarkerColor(status);
    
    // 럭셔리 핀 아이콘 HTML 스트링
    const html = `
      <div class="marker-pin" style="background-color: ${color};"></div>
      <div class="marker-label">${carHo.replace('호차', '')}</div>
    `;

    return L.divIcon({
      className: 'custom-vehicle-marker',
      html: html,
      iconSize: [42, 42],
      iconAnchor: [21, 42],
      popupAnchor: [0, -40]
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer 
        center={center} 
        zoom={zoom} 
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <ChangeView center={center} zoom={zoom} />
        
        {/* 다크 럭셔리 지도 레이어 (CartoDB Dark Matter 사용) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* 출근 상태인 드라이버들만 지도 마커로 표시 */}
        {drivers
          .filter(d => d.status !== '미출근' && d.lat && d.lng)
          .map((driver) => (
            <Marker
              key={driver.id}
              position={[driver.lat, driver.lng]}
              icon={createCustomIcon(driver.carHo, driver.status)}
              eventHandlers={{
                click: () => onSelectDriver(driver.id)
              }}
            >
              <Popup className="custom-map-popup">
                <div style={{ minWidth: '160px', padding: '2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '14px', color: '#fff' }}>{driver.carHo}</strong>
                    <span style={{ 
                      fontSize: '10px', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      fontWeight: 'bold',
                      backgroundColor: getMarkerColor(driver.status) + '22',
                      color: getMarkerColor(driver.status),
                      border: `1px solid ${getMarkerColor(driver.status)}44`
                    }}>
                      {driver.status}
                    </span>
                  </div>
                  
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div>드라이버: {driver.name}</div>
                    <div>차량번호: {driver.carNo}</div>
                    {driver.currentOrder && (
                      <div style={{ marginTop: '4px', padding: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                        <span style={{ display: 'block', fontSize: '9px', color: 'var(--accent)' }}>진행 중 지시</span>
                        <strong>📍 {driver.currentOrder.destination}</strong>
                      </div>
                    )}
                  </div>

                  <a 
                    href={`tel:${driver.phone}`} 
                    style={{ 
                      display: 'block', 
                      textAlign: 'center', 
                      marginTop: '10px', 
                      padding: '6px 0', 
                      background: 'rgba(16, 185, 129, 0.15)', 
                      color: 'var(--primary)', 
                      borderRadius: '4px', 
                      fontSize: '11px', 
                      textDecoration: 'none',
                      fontWeight: 'bold',
                      border: '1px solid rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    📞 전화 걸기
                  </a>
                </div>
              </Popup>
            </Marker>
          ))
        }
      </MapContainer>

      {/* 지도 안내 범례 */}
      <div style={{ 
        position: 'absolute', 
        bottom: '16px', 
        left: '16px', 
        zIndex: 1000, 
        padding: '10px 14px', 
        background: 'rgba(15, 23, 42, 0.85)', 
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        fontSize: '11px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '2px' }}>차량 범례</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-ready)' }}></span>
          <span style={{ color: 'var(--text-muted)' }}>대기 중</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-confirm)' }}></span>
          <span style={{ color: 'var(--text-muted)' }}>지시 확인완료</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-driving)' }}></span>
          <span style={{ color: 'var(--text-muted)' }}>수송 중 (이동)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-completed)' }}></span>
          <span style={{ color: 'var(--text-muted)' }}>업무 완료</span>
        </div>
      </div>
    </div>
  );
}
