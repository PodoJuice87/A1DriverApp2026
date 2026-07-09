// Firebase와 Mock Database를 통합 관리하여 투명하게 스위칭해주는 서비스 레이어
import { isFirebaseConfigured, db, storage } from './firebase';
import { mockDatabase } from './mockDatabase';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  getDocs, 
  query, 
  orderBy, 
  addDoc, 
  deleteDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export const getActiveMode = () => {
  return isFirebaseConfigured ? 'Firebase' : 'MockDB';
};

export const dbService = {
  // 드라이버 로그인
  loginDriver: async (name, phone, carNo) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.loginDriver(name, phone, carNo);
    }

    try {
      const qDrivers = query(collection(db, 'drivers'));
      const qVehicles = query(collection(db, 'vehicles'));
      
      const [snapDrivers, snapVehicles] = await Promise.all([
        getDocs(qDrivers),
        getDocs(qVehicles)
      ]);

      const cleanPhone = phone.replace(/[^0-9]/g, '');
      let foundDriver = null;

      snapDrivers.forEach(docSnap => {
        const d = docSnap.data();
        const dbCleanPhone = d.phone.replace(/[^0-9]/g, '');
        if (d.name === name && dbCleanPhone === cleanPhone) {
          foundDriver = { id: docSnap.id, ...d };
        }
      });

      if (!foundDriver) {
        return { success: false, message: '등록된 드라이버 정보가 일치하지 않습니다.' };
      }

      if (!foundDriver.vehicleId) {
        return { success: false, message: '배정된 수송 차량이 없습니다. 관리자에게 배정을 요청하세요.' };
      }

      let assignedVehicle = null;
      snapVehicles.forEach(docSnap => {
        if (docSnap.id === foundDriver.vehicleId) {
          assignedVehicle = { id: docSnap.id, ...docSnap.data() };
        }
      });

      if (!assignedVehicle) {
        return { success: false, message: '배정된 차량이 존재하지 않거나 유효하지 않습니다.' };
      }

      const cleanInputCar = carNo.replace(/\s/g, '');
      const cleanCarNo = assignedVehicle.carNo.replace(/\s/g, '');
      const cleanCarHo = assignedVehicle.carHo.replace(/\s/g, '');

      if (cleanInputCar !== cleanCarNo && cleanInputCar !== cleanCarHo) {
        return { success: false, message: `배정 차량(${assignedVehicle.carHo} / ${assignedVehicle.carNo})과 입력값이 일치하지 않습니다.` };
      }

      return { 
        success: true, 
        driver: { 
          ...foundDriver, 
          carHo: assignedVehicle.carHo, 
          carNo: assignedVehicle.carNo 
        } 
      };
    } catch (e) {
      console.error(e);
      return { success: false, message: '서버 통신 오류: ' + e.message };
    }
  },

  // 출근 보고 (데미지 사진 업로드 및 근태 체크)
  reportAttendance: async (driverId, filesOrUrls) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.reportAttendance(driverId, filesOrUrls);
    }

    try {
      const uploadedUrls = [];
      const time = new Date().toISOString();

      for (let i = 0; i < filesOrUrls.length; i++) {
        const file = filesOrUrls[i];
        const storageRef = ref(storage, `damages/in_${driverId}_${Date.now()}_${i}.jpg`);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);
        uploadedUrls.push(downloadUrl);
      }

      const driverRef = doc(db, 'drivers', driverId);
      await updateDoc(driverRef, {
        status: '대기',
        photos: uploadedUrls,
        updatedAt: time,
        attendanceTime: time
      });

      const snapDrivers = await getDocs(query(collection(db, 'drivers')));
      const snapVehicles = await getDocs(query(collection(db, 'vehicles')));
      
      let driverData = {};
      snapDrivers.forEach(d => { if (d.id === driverId) driverData = d.data(); });
      
      let vehicleData = {};
      snapVehicles.forEach(v => { if (v.id === driverData.vehicleId) vehicleData = v.data(); });

      await addDoc(collection(db, 'history'), {
        driverId,
        driverName: driverData.name || '',
        carNo: vehicleData.carNo || '',
        carHo: vehicleData.carHo || '',
        type: '출근',
        description: '출근 완료 및 차량 외관 인수 데미지 체크 사진 등록',
        timestamp: time,
        photos: uploadedUrls
      });

      return { success: true, driver: { id: driverId, ...driverData, carHo: vehicleData.carHo, carNo: vehicleData.carNo, status: '대기', photos: uploadedUrls } };
    } catch (e) {
      console.error(e);
      return { success: false, message: '출근 보고 실패: ' + e.message };
    }
  },

  // 퇴근 보고
  reportCheckout: async (driverId, filesOrUrls) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.reportCheckout(driverId, filesOrUrls);
    }

    try {
      const uploadedUrls = [];
      const time = new Date().toISOString();

      for (let i = 0; i < filesOrUrls.length; i++) {
        const file = filesOrUrls[i];
        const storageRef = ref(storage, `damages/out_${driverId}_${Date.now()}_${i}.jpg`);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);
        uploadedUrls.push(downloadUrl);
      }

      const driverRef = doc(db, 'drivers', driverId);
      await updateDoc(driverRef, {
        status: '미출근',
        photos: [], 
        currentOrder: null,
        updatedAt: time,
        attendanceTime: null,
        checkoutTime: time
      });

      const snapDrivers = await getDocs(query(collection(db, 'drivers')));
      const snapVehicles = await getDocs(query(collection(db, 'vehicles')));
      
      let driverData = {};
      snapDrivers.forEach(d => { if (d.id === driverId) driverData = d.data(); });
      
      let vehicleData = {};
      snapVehicles.forEach(v => { if (v.id === driverData.vehicleId) vehicleData = v.data(); });

      await addDoc(collection(db, 'history'), {
        driverId,
        driverName: driverData.name || '',
        carNo: vehicleData.carNo || '',
        carHo: vehicleData.carHo || '',
        type: '퇴근',
        description: '퇴근 보고 완료 및 최종 차량 반납 데미지 체크 사진 등록',
        timestamp: time,
        photos: uploadedUrls
      });

      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, message: '퇴근 보고 실패: ' + e.message };
    }
  },

  // 드라이버 자율 출발 (승객 탑승에 따른 보고)
  startSelfDispatch: async (driverId, destination) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.startSelfDispatch(driverId, destination);
    }

    try {
      const time = new Date().toISOString();
      const orderId = `self_${Date.now()}`;
      const driverRef = doc(db, 'drivers', driverId);

      const selfOrder = {
        id: orderId,
        destination,
        assignedAt: time,
        status: '이동중',
        type: '승객탑승'
      };

      await updateDoc(driverRef, {
        status: '진행중',
        currentOrder: selfOrder,
        updatedAt: time
      });

      const snapDrivers = await getDocs(query(collection(db, 'drivers')));
      const snapVehicles = await getDocs(query(collection(db, 'vehicles')));
      
      let driverData = {};
      snapDrivers.forEach(d => { if (d.id === driverId) driverData = d.data(); });
      
      let vehicleData = {};
      snapVehicles.forEach(v => { if (v.id === driverData.vehicleId) vehicleData = v.data(); });

      // 역사 기록
      await addDoc(collection(db, 'history'), {
        driverId,
        driverName: driverData.name || '',
        carNo: vehicleData.carNo || '',
        carHo: vehicleData.carHo || '',
        type: '승객탑승',
        description: `승객 탑승 자율 출발 -> [목적지: ${destination}]`,
        timestamp: time
      });

      // 관리자 토스트 용 dispatch 데이터 발행
      await setDoc(doc(db, 'dispatches', orderId), {
        driverIds: [driverId],
        destination,
        timestamp: time,
        status: 'self-dispatch',
        driverName: driverData.name || '',
        carHo: vehicleData.carHo || '미배정'
      });

      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, message: '자율 출발 보고 실패: ' + e.message };
    }
  },

  // 드라이버 상태 업데이트
  updateDriverStatus: async (driverId, status, currentOrder = null) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.updateDriverStatus(driverId, status, currentOrder);
    }

    try {
      const time = new Date().toISOString();
      const driverRef = doc(db, 'drivers', driverId);

      let updateData = { status, updatedAt: time };
      if (status === '완료') {
        const snapDrivers = await getDocs(query(collection(db, 'drivers')));
        let currentOrderData = null;
        snapDrivers.forEach(docSnap => {
          if (docSnap.id === driverId) currentOrderData = docSnap.data().currentOrder;
        });
        if (currentOrderData) {
          updateData.currentOrder = { ...currentOrderData, status: '이동완료' };
        }
      } else if (status === '대기') {
        updateData.currentOrder = null;
      }

      await updateDoc(driverRef, updateData);

      const snapDrivers = await getDocs(query(collection(db, 'drivers')));
      const snapVehicles = await getDocs(query(collection(db, 'vehicles')));
      
      let driverData = {};
      snapDrivers.forEach(docSnap => { if (docSnap.id === driverId) driverData = docSnap.data(); });
      
      let vehicleData = {};
      snapVehicles.forEach(v => { if (v.id === driverData.vehicleId) vehicleData = v.data(); });

      let description = '';
      if (status === '진행중') {
        description = `이동 시작 (목적지: ${currentOrder?.destination || '지정되지 않음'})`;
      } else if (status === '완료') {
        description = `이동 완료 (목적지: ${driverData.currentOrder?.destination || '지정되지 않음'})`;
      } else if (status === '식사중') {
        description = `식사 시간 설정 (운행 정지)`;
      } else if (status === '휴식중') {
        description = `휴식 시간 설정 (운행 정지)`;
      } else if (status === '대기') {
        description = `업무 대기 상태 전환`;
      }

      await addDoc(collection(db, 'history'), {
        driverId,
        driverName: driverData.name || '',
        carNo: vehicleData.carNo || '',
        carHo: vehicleData.carHo || '',
        type: status,
        description,
        timestamp: time
      });

      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, message: '상태 업데이트 실패: ' + e.message };
    }
  },

  // GPS 위치 전송
  updateGPS: async (driverId, lat, lng) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.updateGPS(driverId, lat, lng);
    }

    try {
      const driverRef = doc(db, 'drivers', driverId);
      await updateDoc(driverRef, { lat, lng, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.error('GPS 업데이트 에러:', e);
    }
  },

  // 관리자: 일괄 이동 지시 부여 (기본: 빈차이동)
  sendDispatch: async (driverIds, destination) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.sendDispatch(driverIds, destination);
    }

    try {
      const time = new Date().toISOString();
      const dispatchId = `disp_${Date.now()}`;

      await setDoc(doc(db, 'dispatches', dispatchId), {
        driverIds,
        destination,
        timestamp: time,
        status: 'pending',
        type: '빈차이동'
      });

      for (const dId of driverIds) {
        const driverRef = doc(db, 'drivers', dId);
        await updateDoc(driverRef, {
          currentOrder: {
            id: dispatchId,
            destination,
            assignedAt: time,
            status: '지시수신',
            type: '빈차이동'
          },
          updatedAt: time
        });

        const snapDrivers = await getDocs(query(collection(db, 'drivers')));
        const snapVehicles = await getDocs(query(collection(db, 'vehicles')));
        
        let driverData = {};
        snapDrivers.forEach(docSnap => { if (docSnap.id === dId) driverData = docSnap.data(); });
        
        let vehicleData = {};
        snapVehicles.forEach(v => { if (v.id === driverData.vehicleId) vehicleData = v.data(); });

        await addDoc(collection(db, 'history'), {
          driverId: dId,
          driverName: driverData.name || '',
          carNo: vehicleData.carNo || '',
          carHo: vehicleData.carHo || '',
          type: '지시발령',
          description: `관리자 빈차 이동 지시 발령 -> [목적지: ${destination}]`,
          timestamp: time
        });
      }

      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, message: '이동 지시 전송 실패: ' + e.message };
    }
  },

  // 드라이버: 지시 확인
  confirmDispatch: async (driverId) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.confirmDispatch(driverId);
    }

    try {
      const time = new Date().toISOString();
      const driverRef = doc(db, 'drivers', driverId);

      const snapDrivers = await getDocs(query(collection(db, 'drivers')));
      const snapVehicles = await getDocs(query(collection(db, 'vehicles')));
      
      let currentOrder = null;
      let driverData = {};
      snapDrivers.forEach(docSnap => {
        if (docSnap.id === driverId) {
          driverData = docSnap.data();
          currentOrder = docSnap.data().currentOrder;
        }
      });

      let vehicleData = {};
      snapVehicles.forEach(v => { if (v.id === driverData.vehicleId) vehicleData = v.data(); });

      if (currentOrder) {
        await updateDoc(driverRef, {
          currentOrder: { ...currentOrder, status: '확인완료' },
          status: '확인완료',
          updatedAt: time
        });

        await addDoc(collection(db, 'history'), {
          driverId,
          driverName: driverData.name || '',
          carNo: vehicleData.carNo || '',
          carHo: vehicleData.carHo || '',
          type: '지시확인',
          description: `이동 지시 확인 완료 (목적지: ${currentOrder.destination})`,
          timestamp: time
        });
      }
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false };
    }
  },

  // 1대1 매칭
  assignVehicle: async (driverId, vehicleId) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.assignVehicle(driverId, vehicleId);
    }

    try {
      const snapDrivers = await getDocs(query(collection(db, 'drivers')));
      const snapVehicles = await getDocs(query(collection(db, 'vehicles')));

      if (vehicleId) {
        snapDrivers.forEach(async (dDoc) => {
          if (dDoc.data().vehicleId === vehicleId) {
            await updateDoc(doc(db, 'drivers', dDoc.id), { vehicleId: null });
          }
        });
      }
      if (driverId) {
        snapVehicles.forEach(async (vDoc) => {
          if (vDoc.data().driverId === driverId) {
            await updateDoc(doc(db, 'vehicles', vDoc.id), { driverId: null });
          }
        });
      }

      if (driverId && vehicleId) {
        await updateDoc(doc(db, 'drivers', driverId), { vehicleId });
        await updateDoc(doc(db, 'vehicles', vehicleId), { driverId });
      } else if (driverId && !vehicleId) {
        await updateDoc(doc(db, 'drivers', driverId), { vehicleId: null });
      }

      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  },

  // 차량 관리 CRUD
  addVehicle: async (vehData) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.addVehicle(vehData);
    }

    try {
      const newVeh = {
        carHo: vehData.carHo.includes('호차') ? vehData.carHo : `${vehData.carHo}호차`,
        carNo: vehData.carNo,
        driverId: null
      };
      const docRef = await addDoc(collection(db, 'vehicles'), newVeh);
      return { success: true, vehicle: { id: docRef.id, ...newVeh } };
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  },

  deleteVehicle: async (vehicleId) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.deleteVehicle(vehicleId);
    }

    try {
      await deleteDoc(doc(db, 'vehicles', vehicleId));
      
      const snapDrivers = await getDocs(query(collection(db, 'drivers')));
      snapDrivers.forEach(async (dDoc) => {
        if (dDoc.data().vehicleId === vehicleId) {
          await updateDoc(doc(db, 'drivers', dDoc.id), { vehicleId: null });
        }
      });
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false };
    }
  },

  // 드라이버 관리 CRUD
  addDriver: async (driverData) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.addDriver(driverData);
    }

    try {
      const newDriver = {
        status: '미출근',
        lat: 37.498,
        lng: 127.027,
        photos: [],
        updatedAt: null,
        vehicleId: null,
        ...driverData
      };
      const docRef = await addDoc(collection(db, 'drivers'), newDriver);
      return { success: true, driver: { id: docRef.id, ...newDriver } };
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  },

  deleteDriver: async (driverId) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.deleteDriver(driverId);
    }

    try {
      await deleteDoc(doc(db, 'drivers', driverId));
      
      const snapVehicles = await getDocs(query(collection(db, 'vehicles')));
      snapVehicles.forEach(async (vDoc) => {
        if (vDoc.data().driverId === driverId) {
          await updateDoc(doc(db, 'vehicles', vDoc.id), { driverId: null });
        }
      });
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false };
    }
  },

  // 실시간 구독 목록
  subscribeDrivers: (callback) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.subscribeDrivers(callback);
    }

    const qD = query(collection(db, 'drivers'));
    const qV = query(collection(db, 'vehicles'));

    let currentDrivers = [];
    let currentVehicles = [];

    const triggerCallback = () => {
      const driversWithVehicles = currentDrivers.map(d => {
        const v = currentVehicles.find(veh => veh.id === d.vehicleId);
        return {
          ...d,
          carHo: v ? v.carHo : '미배정',
          carNo: v ? v.carNo : '미배정'
        };
      });
      callback(driversWithVehicles);
    };

    const unsubDrivers = onSnapshot(qD, (snap) => {
      currentDrivers = [];
      snap.forEach(docSnap => { currentDrivers.push({ id: docSnap.id, ...docSnap.data() }); });
      triggerCallback();
    });

    const unsubVehicles = onSnapshot(qV, (snap) => {
      currentVehicles = [];
      snap.forEach(docSnap => { currentVehicles.push({ id: docSnap.id, ...docSnap.data() }); });
      triggerCallback();
    });

    return () => {
      unsubDrivers();
      unsubVehicles();
    };
  },

  subscribeVehicles: (callback) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.subscribeVehicles(callback);
    }

    const q = query(collection(db, 'vehicles'));
    return onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach(docSnap => { list.push({ id: docSnap.id, ...docSnap.data() }); });
      callback(list);
    });
  },

  subscribeHistory: (callback) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.subscribeHistory(callback);
    }

    const q = query(collection(db, 'history'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (querySnapshot) => {
      const history = [];
      querySnapshot.forEach((docSnap) => {
        history.push({ id: docSnap.id, ...docSnap.data() });
      });
      callback(history);
    });
  },

  subscribeDispatch: (callback) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.subscribeDispatch(callback);
    }

    const q = query(collection(db, 'dispatches'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (querySnapshot) => {
      if (!querySnapshot.empty) {
        const first = querySnapshot.docs[0];
        callback({ id: first.id, ...first.data() });
      }
    });
  },

  getDestinations: async () => {
    if (!isFirebaseConfigured) {
      return mockDatabase.getDestinations();
    }

    try {
      const q = query(collection(db, 'destinations'));
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach(docSnap => { list.push(docSnap.data().name); });
      if (list.length === 0) {
        const defaultDest = mockDatabase.getDestinations();
        for (const dest of defaultDest) {
          await addDoc(collection(db, 'destinations'), { name: dest });
        }
        return defaultDest;
      }
      return list;
    } catch (e) {
      return mockDatabase.getDestinations();
    }
  },

  addDestination: async (name) => {
    if (!isFirebaseConfigured) {
      return mockDatabase.addDestination(name);
    }

    try {
      await addDoc(collection(db, 'destinations'), { name });
      return await dbService.getDestinations();
    } catch (e) {
      console.error(e);
      return [];
    }
  }
};
