// 로컬 테스트를 위한 고도화된 가상 실시간 데이터베이스 서비스 (LocalStorage + Storage Event 기반)

// 1. 초기 차량 데이터
const DEFAULT_VEHICLES = [
  { id: 'vehicle_1', carHo: '1호차', carNo: '12가 3456', driverId: 'driver_1' },
  { id: 'vehicle_2', carHo: '2호차', carNo: '34나 7890', driverId: 'driver_2' },
  { id: 'vehicle_3', carHo: '3호차', carNo: '56다 1234', driverId: 'driver_3' },
  { id: 'vehicle_4', carHo: '4호차', carNo: '78라 5678', driverId: 'driver_4' },
  { id: 'vehicle_5', carHo: '5호차', carNo: '90마 9012', driverId: 'driver_5' },
  { id: 'vehicle_6', carHo: '6호차', carNo: '11수 2233', driverId: null },
  { id: 'vehicle_7', carHo: '7호차', carNo: '44우 5566', driverId: null }
];

// 2. 초기 드라이버 데이터
const DEFAULT_DRIVERS = [
  { id: 'driver_1', name: '김민준', phone: '010-1234-5678', vehicleId: 'vehicle_1', status: '미출근', lat: 37.498, lng: 127.027, updatedAt: null, photos: [] },
  { id: 'driver_2', name: '이서준', phone: '010-2345-6789', vehicleId: 'vehicle_2', status: '미출근', lat: 37.499, lng: 127.028, updatedAt: null, photos: [] },
  { id: 'driver_3', name: '박예준', phone: '010-3456-7890', vehicleId: 'vehicle_3', status: '미출근', lat: 37.497, lng: 127.026, updatedAt: null, photos: [] },
  { id: 'driver_4', name: '최도윤', phone: '010-4567-8901', vehicleId: 'vehicle_4', status: '미출근', lat: 37.500, lng: 127.029, updatedAt: null, photos: [] },
  { id: 'driver_5', name: '정주원', phone: '010-5678-9012', vehicleId: 'vehicle_5', status: '미출근', lat: 37.496, lng: 127.025, updatedAt: null, photos: [] },
  { id: 'driver_6', name: '한상우', phone: '010-6789-0123', vehicleId: null, status: '미출근', lat: 37.498, lng: 127.027, updatedAt: null, photos: [] }
];

const DEFAULT_DESTINATIONS = [
  '인천공항 T1 VIP 주차장',
  '호텔 신라 로비',
  '그랜드 하얏트 서울 로비',
  '잭 니클라우스 GC 클럽하우스',
  '선수단 메인 주차장',
  '미디어 센터 전용 정차구역'
];

// 로컬 스토리지 키 정의
const KEYS = {
  VEHICLES: 'driver_app_vehicles_v2',
  DRIVERS: 'driver_app_drivers_v2',
  HISTORY: 'driver_app_history_v2',
  DESTINATIONS: 'driver_app_destinations_v2',
  DISPATCH: 'driver_app_last_dispatch_v2'
};

// 데이터 로드 혹은 초기화 함수
function getStoredData(key, defaultValue) {
  const data = localStorage.getItem(key);
  if (!data) {
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return defaultValue;
  }
}

function setStoredData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('mock-db-updated', { detail: { key, data } }));
}

// 초기 로딩 트리거
getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);
getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
getStoredData(KEYS.HISTORY, []);
getStoredData(KEYS.DESTINATIONS, DEFAULT_DESTINATIONS);

// 구독자 리스트
let driverSubscribers = [];
let vehicleSubscribers = [];
let historySubscribers = [];
let dispatchSubscribers = [];

// 이벤트 리스너 통합 핸들러
const handleDatabaseUpdate = () => {
  const drivers = JSON.parse(localStorage.getItem(KEYS.DRIVERS) || '[]');
  const vehicles = JSON.parse(localStorage.getItem(KEYS.VEHICLES) || '[]');
  const history = JSON.parse(localStorage.getItem(KEYS.HISTORY) || '[]');
  const lastDispatch = JSON.parse(localStorage.getItem(KEYS.DISPATCH) || 'null');

  // 드라이버 데이터에 실시간으로 매칭된 차량 정보 결합하여 리턴
  const driversWithVehicles = drivers.map(d => {
    const v = vehicles.find(veh => veh.id === d.vehicleId);
    return {
      ...d,
      carHo: v ? v.carHo : '미배정',
      carNo: v ? v.carNo : '미배정'
    };
  });

  driverSubscribers.forEach(cb => cb(driversWithVehicles));
  vehicleSubscribers.forEach(cb => cb(vehicles));
  historySubscribers.forEach(cb => cb(history));
  if (lastDispatch) {
    dispatchSubscribers.forEach(cb => cb(lastDispatch));
  }
};

window.addEventListener('storage', handleDatabaseUpdate);
window.addEventListener('mock-db-updated', handleDatabaseUpdate);

export const mockDatabase = {
  // 드라이버 로그인 검증
  loginDriver: (name, phone, carNoOrHo) => {
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    const foundDriver = drivers.find(d => {
      const dbCleanPhone = d.phone.replace(/[^0-9]/g, '');
      return d.name === name && dbCleanPhone === cleanPhone;
    });

    if (!foundDriver) {
      return { success: false, message: '등록된 드라이버 성명과 연락처가 일치하지 않습니다.' };
    }

    if (!foundDriver.vehicleId) {
      return { success: false, message: '배정된 수송 차량이 없습니다. 관리자에게 차량 배정을 요청해 주세요.' };
    }

    const assignedVehicle = vehicles.find(v => v.id === foundDriver.vehicleId);
    if (!assignedVehicle) {
      return { success: false, message: '배정된 차량이 존재하지 않거나 유효하지 않습니다.' };
    }

    const cleanInputCar = carNoOrHo.replace(/\s/g, '');
    const cleanCarNo = assignedVehicle.carNo.replace(/\s/g, '');
    const cleanCarHo = assignedVehicle.carHo.replace(/\s/g, '');

    if (cleanInputCar !== cleanCarNo && cleanInputCar !== cleanCarHo) {
      return { success: false, message: `배정된 차량(${assignedVehicle.carHo} / ${assignedVehicle.carNo})의 정보와 입력하신 정보가 일치하지 않습니다.` };
    }

    return { 
      success: true, 
      driver: { 
        ...foundDriver, 
        carHo: assignedVehicle.carHo, 
        carNo: assignedVehicle.carNo 
      } 
    };
  },

  // 출근 보고
  reportAttendance: async (driverId, photoUrls) => {
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);
    const time = new Date().toISOString();

    const updatedDrivers = drivers.map(d => {
      if (d.id === driverId) {
        return {
          ...d,
          status: '대기',
          photos: photoUrls,
          updatedAt: time,
          attendanceTime: time
        };
      }
      return d;
    });

    setStoredData(KEYS.DRIVERS, updatedDrivers);

    const driver = updatedDrivers.find(d => d.id === driverId);
    const vehicle = vehicles.find(v => v.id === driver.vehicleId);
    const history = getStoredData(KEYS.HISTORY, []);
    
    const newRecord = {
      id: `hist_${Date.now()}`,
      driverId,
      driverName: driver.name,
      carNo: vehicle ? vehicle.carNo : '미배정',
      carHo: vehicle ? vehicle.carHo : '미배정',
      type: '출근',
      description: '출근 완료 및 차량 외관 인수 데미지 체크 사진 등록',
      timestamp: time,
      photos: photoUrls
    };

    setStoredData(KEYS.HISTORY, [newRecord, ...history]);
    return { success: true, driver: { ...driver, carHo: vehicle?.carHo, carNo: vehicle?.carNo } };
  },

  // 퇴근 보고
  reportCheckout: async (driverId, photoUrls) => {
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);
    const time = new Date().toISOString();

    const updatedDrivers = drivers.map(d => {
      if (d.id === driverId) {
        return {
          ...d,
          status: '미출근',
          photos: [], 
          currentOrder: null,
          updatedAt: time,
          attendanceTime: null,
          checkoutTime: time
        };
      }
      return d;
    });

    setStoredData(KEYS.DRIVERS, updatedDrivers);

    const driver = drivers.find(d => d.id === driverId);
    const vehicle = vehicles.find(v => v.id === driver.vehicleId);
    const history = getStoredData(KEYS.HISTORY, []);

    const newRecord = {
      id: `hist_${Date.now()}`,
      driverId,
      driverName: driver.name,
      carNo: vehicle ? vehicle.carNo : '미배정',
      carHo: vehicle ? vehicle.carHo : '미배정',
      type: '퇴근',
      description: '퇴근 보고 완료 및 최종 차량 반납 데미지 체크 사진 등록',
      timestamp: time,
      photos: photoUrls
    };

    setStoredData(KEYS.HISTORY, [newRecord, ...history]);
    return { success: true };
  },

  // 드라이버 자율 출발 (승객 탑승에 따른 원천 출발 보고)
  startSelfDispatch: (driverId, destination) => {
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);
    const time = new Date().toISOString();
    const orderId = `self_${Date.now()}`;

    const selfOrder = {
      id: orderId,
      destination,
      assignedAt: time,
      status: '이동중',
      type: '승객탑승' // 지시 타입
    };

    const updatedDrivers = drivers.map(d => {
      if (d.id === driverId) {
        return {
          ...d,
          status: '진행중',
          currentOrder: selfOrder,
          updatedAt: time
        };
      }
      return d;
    });

    setStoredData(KEYS.DRIVERS, updatedDrivers);

    const driver = updatedDrivers.find(d => d.id === driverId);
    const vehicle = vehicles.find(v => v.id === driver.vehicleId);
    const history = getStoredData(KEYS.HISTORY, []);

    const newRecord = {
      id: `hist_${Date.now()}`,
      driverId,
      driverName: driver.name,
      carNo: vehicle ? vehicle.carNo : '미배정',
      carHo: vehicle ? vehicle.carHo : '미배정',
      type: '승객탑승',
      description: `승객 탑승 자율 출발 -> [목적지: ${destination}]`,
      timestamp: time
    };

    setStoredData(KEYS.HISTORY, [newRecord, ...history]);

    // 관리자 화면 실시간 토스트 알림 감지를 위한 전송 데이터 발행
    const lastDispatch = {
      id: orderId,
      driverIds: [driverId],
      destination,
      timestamp: time,
      status: 'self-dispatch', // 자율 출발 상태 플래그
      driverName: driver.name,
      carHo: vehicle ? vehicle.carHo : '미배정'
    };
    localStorage.setItem(KEYS.DISPATCH, JSON.stringify(lastDispatch));
    window.dispatchEvent(new CustomEvent('mock-db-updated', { detail: { key: KEYS.DISPATCH, data: lastDispatch } }));

    return { success: true };
  },

  // 드라이버 상태 변경 (대기, 식사중, 휴식중, 진행중, 완료 등)
  updateDriverStatus: (driverId, status, currentOrder = null) => {
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);
    const time = new Date().toISOString();

    const updatedDrivers = drivers.map(d => {
      if (d.id === driverId) {
        if (status === '완료') {
          return {
            ...d,
            status,
            updatedAt: time,
            currentOrder: d.currentOrder ? { ...d.currentOrder, status: '이동완료' } : null
          };
        }
        if (status === '대기') {
          return {
            ...d,
            status,
            updatedAt: time,
            currentOrder: null 
          };
        }
        return { ...d, status, updatedAt: time };
      }
      return d;
    });

    setStoredData(KEYS.DRIVERS, updatedDrivers);

    const driver = updatedDrivers.find(d => d.id === driverId);
    const vehicle = vehicles.find(v => v.id === driver.vehicleId);
    const history = getStoredData(KEYS.HISTORY, []);

    let description = '';
    if (status === '진행중') {
      description = `이동 시작 (목적지: ${currentOrder?.destination || '지정되지 않음'})`;
    } else if (status === '완료') {
      description = `이동 완료 (목적지: ${driver.currentOrder?.destination || '지정되지 않음'})`;
    } else if (status === '식사중') {
      description = `식사 시간 설정 (운행 정지)`;
    } else if (status === '휴식중') {
      description = `휴식 시간 설정 (운행 정지)`;
    } else if (status === '대기') {
      description = `업무 대기 상태 전환`;
    }

    const newRecord = {
      id: `hist_${Date.now()}`,
      driverId,
      driverName: driver.name,
      carNo: vehicle ? vehicle.carNo : '미배정',
      carHo: vehicle ? vehicle.carHo : '미배정',
      type: status,
      description,
      timestamp: time
    };

    setStoredData(KEYS.HISTORY, [newRecord, ...history]);
    return { success: true };
  },

  // 실시간 GPS 좌표 업데이트
  updateGPS: (driverId, lat, lng) => {
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const updatedDrivers = drivers.map(d => {
      if (d.id === driverId) {
        return { ...d, lat, lng, updatedAt: new Date().toISOString() };
      }
      return d;
    });
    setStoredData(KEYS.DRIVERS, updatedDrivers);
  },

  // 관리자: 일괄 이동 지시 부여 (기본 성격: 빈차이동)
  sendDispatch: (driverIds, destination) => {
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);
    const time = new Date().toISOString();
    const dispatchId = `disp_${Date.now()}`;

    const lastDispatch = {
      id: dispatchId,
      driverIds,
      destination,
      timestamp: time,
      status: 'pending',
      type: '빈차이동' // 지시 성격 기본값
    };

    localStorage.setItem(KEYS.DISPATCH, JSON.stringify(lastDispatch));

    const updatedDrivers = drivers.map(d => {
      if (driverIds.includes(d.id)) {
        return {
          ...d,
          currentOrder: {
            id: dispatchId,
            destination,
            assignedAt: time,
            status: '지시수신',
            type: '빈차이동' // 기본값 할당
          },
          updatedAt: time
        };
      }
      return d;
    });

    setStoredData(KEYS.DRIVERS, updatedDrivers);

    // 히스토리 기록
    const history = getStoredData(KEYS.HISTORY, []);
    const newRecords = updatedDrivers
      .filter(d => driverIds.includes(d.id))
      .map(d => {
        const vehicle = vehicles.find(v => v.id === d.vehicleId);
        return {
          id: `hist_${Date.now()}_${d.id}`,
          driverId: d.id,
          driverName: d.name,
          carNo: vehicle ? vehicle.carNo : '미배정',
          carHo: vehicle ? vehicle.carHo : '미배정',
          type: '지시발령',
          description: `관리자 빈차 이동 지시 발령 -> [목적지: ${destination}]`,
          timestamp: time
        };
      });

    setStoredData(KEYS.HISTORY, [...newRecords, ...history]);
    window.dispatchEvent(new CustomEvent('mock-db-updated', { detail: { key: KEYS.DISPATCH, data: lastDispatch } }));
    return { success: true };
  },

  // 드라이버: 지시 확인
  confirmDispatch: (driverId) => {
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);
    const time = new Date().toISOString();

    const updatedDrivers = drivers.map(d => {
      if (d.id === driverId && d.currentOrder) {
        return {
          ...d,
          currentOrder: {
            ...d.currentOrder,
            status: '확인완료'
          },
          status: '확인완료',
          updatedAt: time
        };
      }
      return d;
    });

    setStoredData(KEYS.DRIVERS, updatedDrivers);

    const driver = updatedDrivers.find(d => d.id === driverId);
    const vehicle = vehicles.find(v => v.id === driver.vehicleId);
    const history = getStoredData(KEYS.HISTORY, []);
    
    const newRecord = {
      id: `hist_${Date.now()}`,
      driverId,
      driverName: driver.name,
      carNo: vehicle ? vehicle.carNo : '미배정',
      carHo: vehicle ? vehicle.carHo : '미배정',
      type: '지시확인',
      description: `이동 지시 확인 완료 (목적지: ${driver.currentOrder?.destination})`,
      timestamp: time
    };

    setStoredData(KEYS.HISTORY, [newRecord, ...history]);
    return { success: true };
  },

  // 1대1 매칭
  assignVehicle: (driverId, vehicleId) => {
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);

    let updatedDrivers = drivers.map(d => {
      if (vehicleId && d.vehicleId === vehicleId) {
        return { ...d, vehicleId: null };
      }
      return d;
    });

    let updatedVehicles = vehicles.map(v => {
      if (driverId && v.driverId === driverId) {
        return { ...v, driverId: null };
      }
      return v;
    });

    if (driverId && vehicleId) {
      updatedDrivers = updatedDrivers.map(d => {
        if (d.id === driverId) return { ...d, vehicleId };
        return d;
      });
      updatedVehicles = updatedVehicles.map(v => {
        if (v.id === vehicleId) return { ...v, driverId };
        return v;
      });
    } else if (driverId && !vehicleId) {
      updatedDrivers = updatedDrivers.map(d => {
        if (d.id === driverId) return { ...d, vehicleId: null };
        return d;
      });
    }

    setStoredData(KEYS.DRIVERS, updatedDrivers);
    setStoredData(KEYS.VEHICLES, updatedVehicles);
    return { success: true };
  },

  // 차량 관리 CRUD
  addVehicle: (vehData) => {
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);
    const newVeh = {
      id: `vehicle_${Date.now()}`,
      carHo: vehData.carHo.includes('호차') ? vehData.carHo : `${vehData.carHo}호차`,
      carNo: vehData.carNo,
      driverId: null
    };
    setStoredData(KEYS.VEHICLES, [...vehicles, newVeh]);
    return { success: true, vehicle: newVeh };
  },

  deleteVehicle: (vehicleId) => {
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);

    const updatedDrivers = drivers.map(d => {
      if (d.vehicleId === vehicleId) return { ...d, vehicleId: null };
      return d;
    });

    const updatedVehicles = vehicles.filter(v => v.id !== vehicleId);

    setStoredData(KEYS.DRIVERS, updatedDrivers);
    setStoredData(KEYS.VEHICLES, updatedVehicles);
    return { success: true };
  },

  // 드라이버 관리 CRUD
  addDriver: (driverData) => {
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const newDriver = {
      id: `driver_${Date.now()}`,
      status: '미출근',
      lat: 37.498,
      lng: 127.027,
      photos: [],
      updatedAt: null,
      vehicleId: null, 
      ...driverData
    };
    setStoredData(KEYS.DRIVERS, [...drivers, newDriver]);
    return { success: true, driver: newDriver };
  },

  deleteDriver: (driverId) => {
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);

    const updatedVehicles = vehicles.map(v => {
      if (v.driverId === driverId) return { ...v, driverId: null };
      return v;
    });

    const updatedDrivers = drivers.filter(d => d.id !== driverId);

    setStoredData(KEYS.DRIVERS, updatedDrivers);
    setStoredData(KEYS.VEHICLES, updatedVehicles);
    return { success: true };
  },

  // 장소 관리
  addDestination: (name) => {
    const list = getStoredData(KEYS.DESTINATIONS, DEFAULT_DESTINATIONS);
    if (!list.includes(name)) {
      setStoredData(KEYS.DESTINATIONS, [...list, name]);
    }
    return getStoredData(KEYS.DESTINATIONS, DEFAULT_DESTINATIONS);
  },

  // 데이터 실시간 구독 메소드들
  subscribeDrivers: (callback) => {
    driverSubscribers.push(callback);
    const drivers = getStoredData(KEYS.DRIVERS, DEFAULT_DRIVERS);
    const vehicles = getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES);
    const driversWithVehicles = drivers.map(d => {
      const v = vehicles.find(veh => veh.id === d.vehicleId);
      return {
        ...d,
        carHo: v ? v.carHo : '미배정',
        carNo: v ? v.carNo : '미배정'
      };
    });
    callback(driversWithVehicles);
    return () => {
      driverSubscribers = driverSubscribers.filter(cb => cb !== callback);
    };
  },

  subscribeVehicles: (callback) => {
    vehicleSubscribers.push(callback);
    callback(getStoredData(KEYS.VEHICLES, DEFAULT_VEHICLES));
    return () => {
      vehicleSubscribers = vehicleSubscribers.filter(cb => cb !== callback);
    };
  },

  subscribeHistory: (callback) => {
    historySubscribers.push(callback);
    callback(getStoredData(KEYS.HISTORY, []));
    return () => {
      historySubscribers = historySubscribers.filter(cb => cb !== callback);
    };
  },

  subscribeDispatch: (callback) => {
    dispatchSubscribers.push(callback);
    const last = localStorage.getItem(KEYS.DISPATCH);
    if (last) callback(JSON.parse(last));
    return () => {
      dispatchSubscribers = dispatchSubscribers.filter(cb => cb !== callback);
    };
  },

  getDestinations: () => {
    return getStoredData(KEYS.DESTINATIONS, DEFAULT_DESTINATIONS);
  },

  generateMockPhotoUrl: (index) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 400, 300);
    
    ctx.fillStyle = '#475569';
    ctx.fillRect(60, 110, 280, 80);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(100, 70, 180, 40);
    
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(120, 190, 25, 0, Math.PI * 2);
    ctx.arc(280, 190, 25, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(150 + (index * 12) % 100, 120 + (index * 7) % 40);
    ctx.lineTo(170 + (index * 12) % 100, 130 + (index * 7) % 40);
    ctx.stroke();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`Damage Log File - Photo #${index}`, 20, 35);
    ctx.fillStyle = '#f87171';
    ctx.fillText('BODY INSPECT OK', 20, 275);

    return canvas.toDataURL('image/jpeg');
  }
};
