import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/dbService';

export default function DriverDashboard({ onLogout }) {
  // 로그인 세션 상태
  const [driver, setDriver] = useState(null);
  
  // 로그인 폼 입력값
  const [loginForm, setLoginForm] = useState({ name: '', phone: '', carNo: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // 출근/퇴근 보고 및 차량 인수/반납 검수 상태
  const [attendanceMode, setAttendanceMode] = useState('in'); // 'in' (출근), 'out' (퇴근)
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState('');

  // 퇴근 검수 진행 중임을 나타내는 로컬 상태
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // 자율 출발 목적지 선택 팝업 상태
  const [destinations, setDestinations] = useState([]);
  const [showSelfDispatchModal, setShowSelfDispatchModal] = useState(false);

  // 드라이버 상태 (실시간 동기화용)
  const [driverState, setDriverState] = useState(null);
  
  // 가상 GPS 시뮬레이션 스위치
  const [simulationActive, setSimulationActive] = useState(true);

  // 리프레시 토큰/세션 복구
  useEffect(() => {
    const savedDriver = localStorage.getItem('driver_session');
    if (savedDriver) {
      const parsed = JSON.parse(savedDriver);
      setDriver(parsed);
    }
  }, []);

  // 드라이버 데이터 실시간 구독 (로그인 완료 후)
  useEffect(() => {
    if (!driver) return;

    const unsubscribe = dbService.subscribeDrivers((drivers) => {
      const current = drivers.find(d => d.id === driver.id);
      if (current) {
        setDriverState(current);
        localStorage.setItem('driver_session', JSON.stringify(current));
      } else {
        // Firebase 등 실제 DB에 드라이버 세션 정보가 없는 경우 자동 로그아웃으로 무한 로딩을 탈출하게 처리
        localStorage.removeItem('driver_session');
        setDriver(null);
        setDriverState(null);
      }
    });

    const fetchDestinations = async () => {
      const list = await dbService.getDestinations();
      setDestinations(list);
    };
    fetchDestinations();

    return () => unsubscribe();
  }, [driver]);

  // 실시간 GPS 전송 및 가상 GPS 이동 시뮬레이션 루프
  useEffect(() => {
    if (!driverState || driverState.status === '미출근') return;

    let gpsInterval;
    let simInterval;
    let currentLat = driverState.lat || 37.498;
    let currentLng = driverState.lng || 127.027;

    const sendRealGPS = () => {
      if (!simulationActive && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            dbService.updateGPS(driverState.id, latitude, longitude);
          },
          (error) => {
            console.warn('GPS 획득 실패:', error);
          },
          { enableHighAccuracy: true }
        );
      }
    };

    // 기사 근무 상태에 따른 GPS 수집 주기 차등화 (대기/식사 중 비용 극적 절감)
    let gpsIntervalMs = 15000; // 기본 (진행중): 15초
    if (driverState.status === '대기' || driverState.status === '식사중') {
      gpsIntervalMs = 120000; // 대기 및 식사중: 2분 (120초)으로 늦추어 트래픽 격리
    } else if (driverState.status === '확인완료') {
      gpsIntervalMs = 30000; // 지시 수신/확인완료 상태: 30초
    }

    sendRealGPS();
    gpsInterval = setInterval(sendRealGPS, gpsIntervalMs);

    // 가상 GPS 시뮬레이션 동작
    if (simulationActive && driverState.status === '진행중' && driverState.currentOrder) {
      let targetLat = 37.382;
      let targetLng = 126.627;

      if (driverState.currentOrder.destination.includes('신라')) {
        targetLat = 37.555; targetLng = 127.005;
      } else if (driverState.currentOrder.destination.includes('하얏트')) {
        targetLat = 37.539; targetLng = 126.997;
      } else if (driverState.currentOrder.destination.includes('공항')) {
        targetLat = 37.460; targetLng = 126.440;
      }

      simInterval = setInterval(() => {
        const step = 0.002;
        const dLat = targetLat - currentLat;
        const dLng = targetLng - currentLng;
        const distance = Math.sqrt(dLat * dLat + dLng * dLng);

        if (distance > step) {
          currentLat += (dLat / distance) * step;
          currentLng += (dLng / distance) * step;
          dbService.updateGPS(driverState.id, currentLat, currentLng);
        } else {
          currentLat = targetLat;
          currentLng = targetLng;
          dbService.updateGPS(driverState.id, currentLat, currentLng);
          clearInterval(simInterval);
        }
      }, 3000);
    }

    return () => {
      clearInterval(gpsInterval);
      if (simInterval) clearInterval(simInterval);
    };
  }, [driverState?.status, driverState?.currentOrder?.id, simulationActive]);

  // 새로운 이동 지시 알림 사운드 제어
  const lastOrderRef = useRef(null);
  useEffect(() => {
    if (!driverState || !driverState.currentOrder) {
      lastOrderRef.current = null;
      return;
    }

    const currentOrderId = driverState.currentOrder.id;
    const currentOrderStatus = driverState.currentOrder.status;

    if (lastOrderRef.current !== currentOrderId && currentOrderStatus === '지시수신') {
      lastOrderRef.current = currentOrderId;
      playNotificationSound();
    }
  }, [driverState?.currentOrder]);

  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.frequency.value = 880;
      gain1.gain.setValueAtTime(0.3, audioCtx.currentTime);
      osc1.start(audioCtx.currentTime);
      osc1.stop(audioCtx.currentTime + 0.15);

      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.frequency.value = 1046.5;
        gain2.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc2.start(audioCtx.currentTime);
        osc2.stop(audioCtx.currentTime + 0.3);
      }, 150);

      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch (e) {
      console.log('알림 사운드 재생 불가:', e);
    }
  };

  // 로그인
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginForm.name || !loginForm.phone || !loginForm.carNo) {
      setLoginError('모든 필드를 입력해 주세요.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const res = await dbService.loginDriver(loginForm.name, loginForm.phone, loginForm.carNo);
      if (res.success) {
        setDriver(res.driver);
        localStorage.setItem('driver_session', JSON.stringify(res.driver));
      } else {
        setLoginError(res.message);
      }
    } catch (err) {
      setLoginError('로그인 중 문제가 발생했습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 로그아웃
  const handleLogoutClick = () => {
    localStorage.removeItem('driver_session');
    setDriver(null);
    setDriverState(null);
    setIsCheckingOut(false);
    onLogout();
  };

  // 고화질 원본 이미지를 Canvas를 활용하여 초경량 썸네일(width 240px, jpeg 퀄리티 0.5)로 압축 및 Base64 변환하는 헬퍼
  // 이렇게 압축해야 10장을 다 합쳐도 100KB 미만이 되어 LocalStorage QuotaExceededError를 회피하고 다른 탭과 정상 연동됩니다.
  const compressAndConvertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 240; // 가벼운 해상도로 크기 조정
          const scaleSize = MAX_WIDTH / img.width;
          
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // 아주 압축률이 높은 jpeg 형식으로 변환하여 저장 공간 획기적 절약
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.5);
          resolve(compressedDataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // 사진 선택 시 즉시 초경량화 압축 Base64 인코딩하여 저장
  const handlePhotoSelect = async (e) => {
    const files = Array.from(e.target.files);
    setIsUploading(true);
    setUploadStatusText('차량 상태 사진 용량 압축 및 인코딩 중...');
    
    try {
      const compressedPhotos = [];
      for (const file of files) {
        const base64Str = await compressAndConvertToBase64(file);
        compressedPhotos.push({
          name: file.name,
          preview: base64Str 
        });
      }
      setSelectedPhotos(prev => [...prev, ...compressedPhotos]);
    } catch (err) {
      console.error(err);
      alert('이미지 파일 압축 처리 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  // 사진 제거
  const handleRemovePhoto = (index) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // 출퇴근 처리 전송 (경량화된 Base64 데이터를 로컬 스토리지에 무리없이 완벽 기록)
  const handleSubmitReport = async () => {
    if (selectedPhotos.length < 10) {
      alert(`차량 상태 점검을 위해 최소 10장 이상의 사진을 업로드해야 ${attendanceMode === 'in' ? '출근' : '퇴근'} 체크가 완료됩니다.`);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatusText(attendanceMode === 'in' ? '출근 데미지 분석 및 사진 업로드 중...' : '퇴근 데미지 분석 및 반납 처리 중...');

    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress >= 95) {
        clearInterval(progressInterval);
        setUploadProgress(95);
      } else {
        setUploadProgress(progress);
      }
    }, 100);

    try {
      const base64ListToSend = selectedPhotos.map(p => p.preview);
      
      if (attendanceMode === 'in') {
        const res = await dbService.reportAttendance(driverState.id || driver.id, base64ListToSend);
        clearInterval(progressInterval);
        setUploadProgress(100);
        setUploadStatusText('출근 처리가 완료되었습니다!');
        setTimeout(() => {
          setIsUploading(false);
          setSelectedPhotos([]);
          setDriverState(res.driver);
        }, 800);
      } else {
        await dbService.reportCheckout(driverState.id, base64ListToSend);
        clearInterval(progressInterval);
        setUploadProgress(100);
        setUploadStatusText('퇴근 처리가 완료되었습니다. 세션을 종료합니다.');
        setTimeout(() => {
          setIsUploading(false);
          setSelectedPhotos([]);
          setIsCheckingOut(false); 
          handleLogoutClick(); 
        }, 1000);
      }
    } catch (e) {
      clearInterval(progressInterval);
      setIsUploading(false);
      alert('전송 실패 (브라우저 스토리지 제한 확인 필요): ' + e.message);
    }
  };

  // 지시 확인
  const handleConfirmOrder = async () => {
    if (!driverState) return;
    await dbService.confirmDispatch(driverState.id);
  };

  // 상태 전환
  const handleStatusChange = async (newStatus) => {
    if (!driverState) return;
    await dbService.updateDriverStatus(driverState.id, newStatus, driverState.currentOrder);
  };

  // 자율 출발 (승객 탑승) 실행
  const handleSelfDispatchSelect = async (dest) => {
    setShowSelfDispatchModal(false);
    const res = await dbService.startSelfDispatch(driverState.id, dest);
    if (!res.success) {
      alert('자율 출발 전송 실패: ' + res.message);
    }
  };

  // 퇴근 절차 진입
  const handleCheckoutInitiate = () => {
    if (driverState.status === '진행중') {
      alert('현재 운행 지시 수행 중입니다. 운행을 완료한 후에 퇴근 보고를 하실 수 있습니다.');
      return;
    }
    if (window.confirm('퇴근 보고를 위해 차량 반납 검수를 진행하시겠습니까? (출근 시와 마찬가지로 10장의 차량 상태 사진을 업로드해야 완료됩니다)')) {
      setAttendanceMode('out');
      setSelectedPhotos([]);
      setIsCheckingOut(true); 
    }
  };

  // 1. 로그인 폼
  if (!driver) {
    return (
      <div className="mobile-container" style={{ justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.1em', color: 'var(--primary)', marginBottom: '8px' }}>
            CHAUFFEUR SYSTEM
          </div>
          <h2 className="gradient-title" style={{ fontSize: '28px', lineHeight: '1.2' }}>
            드라이버 로그인
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>
            성명, 연락처 및 오늘 배정받은 차량 정보를 입력하세요.
          </p>
        </div>

        <form onSubmit={handleLogin} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '600' }}>
              드라이버 성명
            </label>
            <input 
              type="text" 
              className="custom-input"
              placeholder="예: 김민준" 
              value={loginForm.name} 
              onChange={e => setLoginForm({...loginForm, name: e.target.value})}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '600' }}>
              핸드폰 번호
            </label>
            <input 
              type="tel" 
              className="custom-input"
              placeholder="숫자만 입력 (예: 01012345678)" 
              value={loginForm.phone} 
              onChange={e => setLoginForm({...loginForm, phone: e.target.value})}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '600' }}>
              배정 차량번호 또는 호수 (검증용)
            </label>
            <input 
              type="text" 
              className="custom-input"
              placeholder="예: 1호차 또는 12가 3456" 
              value={loginForm.carNo} 
              onChange={e => setLoginForm({...loginForm, carNo: e.target.value})}
              required
            />
          </div>

          {loginError && (
            <div style={{ color: '#ef4444', fontSize: '13px', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px' }}>
              {loginError}
            </div>
          )}

          <button type="submit" className="btn-primary" style={{ marginTop: '8px' }} disabled={isLoggingIn}>
            {isLoggingIn ? '인증 확인 중...' : '시스템 접속'}
          </button>
        </form>
      </div>
    );
  }

  // 실시간 상태 로드 대기
  if (!driverState) {
    return (
      <div className="mobile-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="pulse-dot ready" style={{ transform: 'scale(2)' }}></div>
        <p style={{ marginTop: '24px', color: 'var(--text-muted)' }}>드라이버 프로필을 동기화 중...</p>
      </div>
    );
  }

  // 2. 출근 검수 또는 퇴근 검수(isCheckingOut) 사진 업로드 화면
  if (driverState.status === '미출근' || isCheckingOut) {
    return (
      <div className="mobile-container" style={{ padding: '20px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 'bold' }}>{driverState.carHo} ({driverState.carNo})</div>
            <h3 style={{ fontSize: '20px' }}>{driverState.name} 드라이버</h3>
          </div>
          <button 
            onClick={isCheckingOut ? () => setIsCheckingOut(false) : handleLogoutClick} 
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-muted)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
          >
            {isCheckingOut ? '취소' : '로그아웃'}
          </button>
        </div>

        <div className="glass-card" style={{ marginBottom: '20px', borderLeft: `4px solid ${isCheckingOut ? 'var(--accent)' : 'var(--primary)'}` }}>
          <h4 style={{ color: isCheckingOut ? 'var(--accent)' : 'var(--primary)', fontSize: '15px', marginBottom: '6px' }}>
            ⚠️ {isCheckingOut ? '차량 반납 검수 (퇴근)' : '차량 인수 검수 (출근)'}
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            {isCheckingOut 
              ? '수송 완료 후 차량 반납 및 인수인계를 위해 차량의 현재 상태를 증명하는 외관 사진을 10장 이상 등록하여 퇴근 보고를 하셔야 합니다.'
              : '차량 인수 규정에 따라, 차량의 외장 상태를 증명할 수 있는 근접 사진을 10장 이상 등록해야 출근 체크가 완료됩니다.'
            }
          </p>
        </div>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', padding: '24px 16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '36px' }}>📸</div>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', display: 'block' }}>{isCheckingOut ? '반납 차량 사진 촬영 및 등록' : '인수 차량 사진 촬영 및 등록'}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>최소 10장 이상 필수 업로드</span>
          </div>
          
          <input 
            type="file" 
            id="damage-photos" 
            multiple 
            accept="image/*" 
            onChange={handlePhotoSelect} 
            style={{ display: 'none' }}
            disabled={isUploading}
          />
          <label htmlFor="damage-photos" className="btn-primary" style={{ background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', cursor: 'pointer', width: 'auto', padding: '10px 20px' }}>
            사진 등록 및 카메라 촬영
          </label>
        </div>

        {selectedPhotos.length > 0 && (
          <div className="glass-card" style={{ marginBottom: '80px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>선택된 사진 ({selectedPhotos.length}장)</span>
              {selectedPhotos.length < 10 && (
                <span style={{ fontSize: '12px', color: '#ef4444' }}>{10 - selectedPhotos.length}장 더 필요</span>
              )}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {selectedPhotos.map((photo, index) => (
                <div key={index} style={{ position: 'relative', aspectRatio: '1', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <img src={photo.preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button 
                    onClick={() => handleRemovePhoto(index)}
                    style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(239, 68, 68, 0.9)', color: '#fff', border: 'none', width: '18px', height: '18px', borderRadius: '50%', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                    disabled={isUploading}
                  >
                    X
                  </button>
                </div>
              ))}
            </div>

            <button 
              className="btn-primary" 
              style={{ marginTop: '20px', background: isCheckingOut ? 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)' : '' }} 
              disabled={selectedPhotos.length < 10 || isUploading}
              onClick={handleSubmitReport}
            >
              {isUploading ? '전송 처리 중...' : isCheckingOut ? '차량 반납 검수 및 퇴근 완료' : '출근 보고 및 상태 동기화'}
            </button>
          </div>
        )}

        {isUploading && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(11, 15, 25, 0.9)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px', zIndex: 100 }}>
            <div className="pulse-dot ready" style={{ transform: 'scale(2.5)', marginBottom: '32px' }}></div>
            <div style={{ color: 'var(--text-main)', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>{uploadStatusText}</div>
          </div>
        )}
      </div>
    );
  }

  // 3. 메인 대시보드 화면
  const hasActiveOrder = driverState.currentOrder && (driverState.currentOrder.status === '지시수신' || driverState.currentOrder.status === '확인완료' || driverState.status === '진행중');

  return (
    <div className="mobile-container" style={{ padding: '20px 20px 100px 20px', overflowY: 'auto' }}>
      
      {/* 상단 프로필 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className={`pulse-dot ${
              driverState.status === '대기' ? 'ready' : 
              driverState.status === '진행중' ? 'driving' : 
              driverState.status === '식사중' ? 'confirm' : 'completed'
            }`} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>GPS 송신 정상</span>
          </div>
          <h3 style={{ fontSize: '19px', marginTop: '2px' }}>
            {driverState.name} <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 'normal' }}>({driverState.carHo})</span>
          </h3>
        </div>
        <button 
          onClick={handleCheckoutInitiate} 
          style={{ 
            background: 'rgba(239, 68, 68, 0.1)', 
            border: '1px solid rgba(239, 68, 68, 0.3)', 
            color: '#ef4444', 
            padding: '6px 12px', 
            borderRadius: '6px', 
            cursor: 'pointer', 
            fontSize: '12px',
            fontWeight: 'bold'
          }}
        >
          👋 퇴근 보고
        </button>
      </div>

      {/* 상태 조작 패널 */}
      <div className="glass-card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>차량번호</div>
            <div style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: 'bold' }}>{driverState.carNo}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>근무 상태</div>
            <span style={{ marginTop: '2px' }} className={`badge ${
              driverState.status === '대기' ? 'badge-ready' : 
              driverState.status === '확인완료' ? 'badge-confirm' :
              driverState.status === '진행중' ? 'badge-driving' :
              driverState.status === '식사중' ? 'badge-confirm' : 'badge-completed'
            }`}>
              {driverState.status}
            </span>
          </div>
        </div>

        {/* 근무 상황 셀프 설정 */}
        <div style={{ paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            근무 상황 셀프 설정
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button 
              disabled={hasActiveOrder}
              onClick={() => handleStatusChange('대기')}
              style={{ 
                padding: '8px', fontSize: '13px', 
                background: driverState.status === '대기' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.02)', 
                border: `1px solid ${driverState.status === '대기' ? 'var(--color-ready)' : 'rgba(255,255,255,0.05)'}`, 
                color: driverState.status === '대기' ? '#fff' : 'var(--text-muted)',
                borderRadius: '6px', cursor: hasActiveOrder ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              🅿️ 대기 중
            </button>
            <button 
              disabled={hasActiveOrder}
              onClick={() => handleStatusChange('식사중')}
              style={{ 
                padding: '8px', fontSize: '13px', 
                background: driverState.status === '식사중' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.02)', 
                border: `1px solid ${driverState.status === '식사중' ? 'var(--color-confirm)' : 'rgba(255,255,255,0.05)'}`, 
                color: driverState.status === '식사중' ? '#fff' : 'var(--text-muted)',
                borderRadius: '6px', cursor: hasActiveOrder ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              🍚 식사 중
            </button>
          </div>
        </div>

        {/* 데모용 GPS 시뮬레이터 */}
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📍 가상 GPS 경로 이동 시뮬레이터</span>
          <button 
            onClick={() => setSimulationActive(!simulationActive)} 
            style={{ 
              background: simulationActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)', 
              border: `1px solid ${simulationActive ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`, 
              color: simulationActive ? 'var(--primary)' : 'var(--text-muted)', 
              padding: '2px 8px', borderRadius: '20px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            {simulationActive ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* ⚡ 자율 "승객탑승" 제어 보드 */}
      {!hasActiveOrder && (driverState.status === '대기' || driverState.status === '식사중') && (
        <div className="glass-card" style={{ marginBottom: '16px', border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)', textAlign: 'center', padding: '24px 16px' }}>
          <button 
            className="btn-primary" 
            style={{ fontSize: '17px', padding: '16px 20px', fontWeight: 'bold' }}
            onClick={() => setShowSelfDispatchModal(true)}
          >
            👨‍✈️ 승객탑승(수송출발)
          </button>
        </div>
      )}

      {/* 관리자 수신 이동 지시 안내판 */}
      {driverState.currentOrder && (
        <div className="glass-card" style={{ 
          marginBottom: '20px', 
          border: driverState.currentOrder.type === '빈차이동' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(245, 158, 11, 0.3)', 
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.8) 100%)' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 'bold' }}>
                📡 관제 지시 수신
              </span>
              
              {(driverState.currentOrder.type === '빈차이동' || !driverState.currentOrder.type) && (
                <span style={{ fontSize: '10px', background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                  빈차이동
                </span>
              )}
            </div>
            
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {new Date(driverState.currentOrder.assignedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </span>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>목적지</div>
            <div style={{ fontSize: '19px', fontWeight: 'bold', color: '#fff', marginTop: '2px' }}>
              {driverState.currentOrder.destination}
            </div>
            {(driverState.currentOrder.type === '빈차이동' || !driverState.currentOrder.type) && (
              <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '4px' }}>
                * 승객이 없는 차량 재배치 이동입니다. 목적지로 빈 차 운행해 주시기 바랍니다.
              </div>
            )}
          </div>

          {/* 지시 상태 제어 */}
          {driverState.currentOrder.status === '지시수신' ? (
            <button 
              className="btn-primary" 
              style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)' }}
              onClick={handleConfirmOrder}
            >
              지시 확인 완료
            </button>
          ) : driverState.status === '확인완료' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button 
                className="btn-primary" 
                onClick={() => handleStatusChange('진행중')}
              >
                이동 시작 (출발)
              </button>
            </div>
          ) : driverState.status === '진행중' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                <span className="pulse-dot driving" style={{ display: 'inline-block', marginRight: '6px' }}></span>
                <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 'bold' }}>지정 장소로 이동 중...</span>
              </div>
              <button 
                className="btn-primary" 
                onClick={() => handleStatusChange('완료')}
              >
                이동 완료 (도착 보고)
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 'bold', marginBottom: '8px' }}>
                ✅ 이동 업무 완료 보고됨
              </div>
              <button 
                className="btn-primary" 
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}
                onClick={() => handleStatusChange('대기')}
              >
                대기 상태로 복귀
              </button>
            </div>
          )}
        </div>
      )}

      {/* 목적지 선택 자율 출발 모달 */}
      {showSelfDispatchModal && (
        <div 
          onClick={() => setShowSelfDispatchModal(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(11, 15, 25, 0.85)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', zIndex: 10000 }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: '#131b2e', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '80vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '17px', color: '#fff', fontWeight: 'bold' }}>🏁 승객탑승 수송출발 목적지 선택</h3>
              <button onClick={() => setShowSelfDispatchModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-8px' }}>
              승객을 목적지까지 이송하기 위해 실제 운행할 목적지를 하나 선택해 주세요. 선택 즉시 출발 보고가 진행됩니다.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '12px' }}>
              {destinations.map((dest, idx) => (
                <button 
                  key={idx}
                  onClick={() => handleSelfDispatchSelect(dest)}
                  style={{ width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: '600', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>📍 {dest}</span>
                  <span style={{ fontSize: '12px', color: 'var(--primary)' }}>선택 ▶</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 긴급 메뉴 */}
      <div style={{ marginTop: '16px' }}>
        <h4 style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 'bold' }}>신고 및 매뉴얼</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <a href="tel:010-1234-5678" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#ef4444' }}>
            <span style={{ fontSize: '16px', marginBottom: '2px' }}>📞</span>
            <span style={{ fontSize: '11px', fontWeight: 'bold' }}>운영본부 통화</span>
          </a>
          <div onClick={() => alert('VIP 수송 매뉴얼: \n1. 승객 탑승 시 문을 열어 인사를 건넵니다.\n2. 목적지 경로를 재확인합니다.\n3. 규정 속도를 준수하고 안전에 최선을 다합니다.')} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px', color: '#3b82f6' }}>
            <span style={{ fontSize: '16px', marginBottom: '2px' }}>📕</span>
            <span style={{ fontSize: '11px', fontWeight: 'bold' }}>수송 매뉴얼</span>
          </div>
        </div>
      </div>
      
    </div>
  );
}
