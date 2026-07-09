import React, { useState, useEffect } from 'react';
import DriverDashboard from './components/DriverDashboard';
import AdminDashboard from './components/AdminDashboard';

export default function App() {
  // 모드 선택: null (선택 대기), 'driver', 'admin'
  const [appMode, setAppMode] = useState(null);

  // 로컬 세션 복구를 통해 드라이버가 로그인된 경우 즉시 드라이버 모드로 시작
  useEffect(() => {
    const savedDriver = localStorage.getItem('driver_session');
    if (savedDriver) {
      setAppMode('driver');
    }

    // PWA 서비스 워커 등록
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(
          (registration) => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
          },
          (err) => {
            console.log('ServiceWorker registration failed: ', err);
          }
        );
      });
    }
  }, []);

  // 로그아웃 시 모드 선택창으로 복귀
  const handleDriverLogout = () => {
    setAppMode(null);
  };

  // 모드 선택 메인 포털 화면
  if (appMode === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center', alignItems: 'center', padding: '24px', position: 'relative' }}>
        
        {/* 상단 장식 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.2em', color: 'var(--primary)', marginBottom: '10px' }}>
            MAJOR GOLF CHAMPIONSHIP VIP TRANSPORTATION
          </div>
          <h2 className="gradient-title" style={{ fontSize: '32px', fontWeight: '800' }}>
            VIP 차량 수송 및 관제 포털
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '10px' }}>
            계정 권한에 맞는 서비스 포털을 선택해 주세요.
          </p>
        </div>

        {/* 모드 선택 카드 레이아웃 */}
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '800px', width: '100%' }}>
          
          {/* 카드 1: 드라이버 포털 */}
          <div 
            onClick={() => setAppMode('driver')}
            className="glass-panel" 
            style={{ 
              flex: '1', 
              minWidth: '280px', 
              padding: '32px 24px', 
              cursor: 'pointer', 
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px'
            }}
          >
            <div style={{ fontSize: '48px' }}>👨‍✈️</div>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>드라이버 모바일 포털</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              차량 데미지 상태 보고(출근), 실시간 지시 수신 알림, 실시간 GPS 및 운행 상태 전달
            </p>
            <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', marginTop: 'auto' }}>
              📱 스마트폰 환경 권장 (PWA 지원)
            </span>
          </div>

          {/* 카드 2: 관리자 통합 관제 */}
          <div 
            onClick={() => setAppMode('admin')}
            className="glass-panel" 
            style={{ 
              flex: '1', 
              minWidth: '280px', 
              padding: '32px 24px', 
              cursor: 'pointer', 
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px'
            }}
          >
            <div style={{ fontSize: '48px' }}>🖥️</div>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>통합 관제 대시보드</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              드라이버 등록/매핑 관리, 실시간 위치 지도 관제, 일괄 이동 지시 발령, 운행이력 확인 및 엑셀 다운로드
            </p>
            <span style={{ fontSize: '11px', background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', marginTop: 'auto' }}>
              💻 PC 및 태블릿 화면 최적화
            </span>
          </div>

        </div>

        {/* 하단 푸터 */}
        <footer style={{ position: 'absolute', bottom: '24px', color: 'var(--text-muted)', fontSize: '11px' }}>
          &copy; 2026 Chauffeur Dispatch System. All Rights Reserved.
        </footer>
      </div>
    );
  }

  // 드라이버 대시보드 뷰
  if (appMode === 'driver') {
    return (
      <div style={{ position: 'relative', minHeight: '100vh' }}>
        {/* 포털 복귀 버튼 */}
        <button 
          onClick={handleDriverLogout}
          style={{ 
            position: 'absolute', 
            top: '20px', 
            left: '20px', 
            zIndex: 999, 
            background: 'rgba(15,23,42,0.8)', 
            border: '1px solid rgba(255,255,255,0.1)', 
            color: 'var(--text-muted)', 
            padding: '6px 12px', 
            borderRadius: '6px', 
            cursor: 'pointer', 
            fontSize: '11px',
            backdropFilter: 'blur(4px)'
          }}
        >
          ◀ 포털로 복귀
        </button>
        <DriverDashboard onLogout={handleDriverLogout} />
      </div>
    );
  }

  // 관리자 대시보드 뷰
  if (appMode === 'admin') {
    return (
      <div style={{ position: 'relative', minHeight: '100vh' }}>
        {/* 포털 복귀 버튼 */}
        <button 
          onClick={() => setAppMode(null)}
          style={{ 
            position: 'absolute', 
            top: '80px', 
            left: '24px', 
            zIndex: 999, 
            background: 'rgba(15,23,42,0.85)', 
            border: '1px solid rgba(255,255,255,0.1)', 
            color: 'var(--text-muted)', 
            padding: '8px 14px', 
            borderRadius: '6px', 
            cursor: 'pointer', 
            fontSize: '11px',
            backdropFilter: 'blur(4px)'
          }}
        >
          ◀ 포털로 복귀
        </button>
        <AdminDashboard />
      </div>
    );
  }
}
