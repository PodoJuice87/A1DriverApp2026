import React, { useState, useEffect, useMemo } from 'react';
import { dbService, getActiveMode } from '../services/dbService';
import MapView from './MapView';
import * as XLSX from 'xlsx';

export default function AdminDashboard() {
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [history, setHistory] = useState([]);
  const [destinations, setDestinations] = useState([]);
  
  // activeTab: 'monitoring', 'grid-view', 'management', 'history'
  const [activeTab, setActiveTab] = useState('monitoring');

  // 실시간 관제/지시
  const [selectedDriverIds, setSelectedDriverIds] = useState([]);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [selectedDestination, setSelectedDestination] = useState('');
  const [customDestination, setCustomDestination] = useState('');
  const [focusedDriverId, setFocusedDriverId] = useState(null);

  // 일괄 실황
  const [gridSearch, setGridSearch] = useState('');
  const [gridStatusFilter, setGridStatusFilter] = useState('전체');
  const [gridSortKey, setGridSortKey] = useState('carHo-asc');

  // 등록/매칭 관리
  const [newVehicle, setNewVehicle] = useState({ carHo: '', carNo: '' });
  const [newDriver, setNewDriver] = useState({ name: '', phone: '' });
  const [assignForm, setAssignForm] = useState({ driverId: '', vehicleId: '' });
  const [mgmtSearch, setMgmtSearch] = useState('');
  const [mgmtFilterType, setMgmtFilterType] = useState('all'); 

  // 운행이력
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('전체');
  const [historySortOrder, setHistorySortOrder] = useState('desc'); 

  // 사진 보기 갤러리
  const [activePhotoGallery, setActivePhotoGallery] = useState(null); 
  const [galleryIndex, setGalleryIndex] = useState(0);

  // 실시간 구독
  useEffect(() => {
    const unsubDrivers = dbService.subscribeDrivers((data) => {
      setDrivers(data);
    });

    const unsubVehicles = dbService.subscribeVehicles((data) => {
      setVehicles(data);
    });

    const unsubHistory = dbService.subscribeHistory((data) => {
      setHistory(data);
    });

    const loadDestinations = async () => {
      const list = await dbService.getDestinations();
      setDestinations(list);
      if (list.length > 0) setSelectedDestination(list[0]);
    };
    loadDestinations();

    return () => {
      unsubDrivers();
      unsubVehicles();
      unsubHistory();
    };
  }, []);

  // 체크박스 핸들러
  const handleCheckboxChange = (driverId) => {
    setSelectedDriverIds(prev => 
      prev.includes(driverId) 
        ? prev.filter(id => id !== driverId) 
        : [...prev, driverId]
    );
  };

  const handleSelectRange = () => {
    if (!rangeStart || !rangeEnd) {
      alert('시작 호차와 종료 호차를 입력해 주세요. (예: 1, 5)');
      return;
    }
    const startNum = parseInt(rangeStart, 10);
    const endNum = parseInt(rangeEnd, 10);
    if (isNaN(startNum) || isNaN(endNum)) {
      alert('숫자만 입력해 주세요.');
      return;
    }

    const matchedIds = drivers
      .filter(d => {
        if (d.status === '미출근') return false;
        const hoNum = parseInt(d.carHo.replace(/[^0-9]/g, ''), 10);
        return !isNaN(hoNum) && hoNum >= startNum && hoNum <= endNum;
      })
      .map(d => d.id);

    setSelectedDriverIds(matchedIds);
  };

  const handleSelectAll = (select) => {
    if (select) {
      const activeIds = drivers.filter(d => d.status !== '미출근').map(d => d.id);
      setSelectedDriverIds(activeIds);
    } else {
      setSelectedDriverIds([]);
    }
  };

  const handleAddDestination = async () => {
    if (!customDestination.trim()) return;
    const newList = await dbService.addDestination(customDestination.trim());
    setDestinations(newList);
    setSelectedDestination(customDestination.trim());
    setCustomDestination('');
    alert('새로운 수송 장소가 등록되었습니다.');
  };

  // 관리자 수동 지시 발령 (빈차이동)
  const handleSendDispatch = async () => {
    if (selectedDriverIds.length === 0) {
      alert('지시를 보낼 대상 차량을 선택해 주세요.');
      return;
    }
    const targetDest = selectedDestination === 'custom' ? customDestination : selectedDestination;
    if (!targetDest) {
      alert('목적지를 입력하거나 선택해 주세요.');
      return;
    }

    const res = await dbService.sendDispatch(selectedDriverIds, targetDest);
    if (res.success) {
      alert(`총 ${selectedDriverIds.length}대 차량에 [${targetDest}] 빈차 이동 지시를 전송했습니다.`);
      setSelectedDriverIds([]);
      setRangeStart('');
      setRangeEnd('');
    } else {
      alert('지시 전송 실패: ' + res.message);
    }
  };

  // 일괄 실황 필터링 및 정렬
  const filteredGridDrivers = useMemo(() => {
    return drivers
      .filter(d => {
        const matchSearch = 
          d.carHo.toLowerCase().includes(gridSearch.toLowerCase()) ||
          d.name.toLowerCase().includes(gridSearch.toLowerCase()) ||
          d.carNo.toLowerCase().includes(gridSearch.toLowerCase());
        
        const matchStatus = gridStatusFilter === '전체' || d.status === gridStatusFilter;

        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        const getHoNum = (hoStr) => {
          const n = parseInt(hoStr.replace(/[^0-9]/g, ''), 10);
          return isNaN(n) ? 9999 : n;
        };

        if (gridSortKey === 'carHo-asc') return getHoNum(a.carHo) - getHoNum(b.carHo);
        if (gridSortKey === 'carHo-desc') return getHoNum(b.carHo) - getHoNum(a.carHo);
        if (gridSortKey === 'name-asc') return a.name.localeCompare(b.name, 'ko');
        if (gridSortKey === 'status-order') {
          const priority = { '진행중': 1, '확인완료': 2, '대기': 3, '식사중': 4, '미출근': 5 };
          return (priority[a.status] || 9) - (priority[b.status] || 9);
        }
        return 0;
      });
  }, [drivers, gridSearch, gridStatusFilter, gridSortKey]);

  // 차량 등록 CRUD
  const handleAddVehicle = async (e) => {
    e.preventDefault();
    if (!newVehicle.carHo || !newVehicle.carNo) return;
    const res = await dbService.addVehicle(newVehicle);
    if (res.success) {
      alert('차량이 성공적으로 등록되었습니다.');
      setNewVehicle({ carHo: '', carNo: '' });
    }
  };

  // 드라이버 등록 CRUD
  const handleAddDriver = async (e) => {
    e.preventDefault();
    if (!newDriver.name || !newDriver.phone) return;
    const res = await dbService.addDriver(newDriver);
    if (res.success) {
      alert('드라이버가 성공적으로 등록되었습니다.');
      setNewDriver({ name: '', phone: '' });
    }
  };

  const handleDeleteVehicle = async (vId) => {
    if (window.confirm('차량을 삭제하시겠습니까? 관련 배정 정보가 함께 해제됩니다.')) {
      await dbService.deleteVehicle(vId);
    }
  };

  const handleDeleteDriver = async (dId) => {
    if (window.confirm('드라이버를 삭제하시겠습니까? 관련 배정 정보가 함께 해제됩니다.')) {
      await dbService.deleteDriver(dId);
    }
  };

  // 1:1 매칭
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignForm.driverId) {
      alert('배정할 드라이버를 선택해 주세요.');
      return;
    }
    const res = await dbService.assignVehicle(assignForm.driverId, assignForm.vehicleId || null);
    if (res.success) {
      alert('배정(매칭) 상태가 업데이트되었습니다.');
      setAssignForm({ driverId: '', vehicleId: '' });
    }
  };

  const filteredMgmtDrivers = useMemo(() => {
    return drivers.filter(d => {
      const matchSearch = d.name.toLowerCase().includes(mgmtSearch.toLowerCase()) || d.phone.includes(mgmtSearch);
      const isAssigned = d.vehicleId !== null && d.vehicleId !== undefined;
      
      if (mgmtFilterType === 'assigned') return matchSearch && isAssigned;
      if (mgmtFilterType === 'unassigned') return matchSearch && !isAssigned;
      return matchSearch;
    });
  }, [drivers, mgmtSearch, mgmtFilterType]);

  // 히스토리 필터 및 정렬
  const filteredHistory = useMemo(() => {
    return history
      .filter(h => {
        const matchSearch = 
          h.driverName.toLowerCase().includes(historySearch.toLowerCase()) ||
          h.carHo.toLowerCase().includes(historySearch.toLowerCase()) ||
          h.carNo.toLowerCase().includes(historySearch.toLowerCase()) ||
          h.description.toLowerCase().includes(historySearch.toLowerCase());
        
        const matchType = historyTypeFilter === '전체' || h.type === historyTypeFilter;

        return matchSearch && matchType;
      })
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return historySortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
  }, [history, historySearch, historyTypeFilter, historySortOrder]);

  const handleExportExcel = () => {
    if (filteredHistory.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const excelData = filteredHistory.map((h, i) => ({
      '번호': i + 1,
      '드라이버명': h.driverName,
      '배정 호수': h.carHo,
      '차량 번호': h.carNo,
      '활동 종류': h.type,
      '운행기록/메시지': h.description,
      '기록 일시': new Date(h.timestamp).toLocaleString(),
      '데미지 검수사진 링크': h.photos && h.photos.length > 0 ? '사진 있음' : '없음'
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    worksheet['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 45 }, { wch: 25 }, { wch: 15 }];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'VIP 운행 장부');
    XLSX.writeFile(workbook, `VIP_Chauffeur_Log_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrevPhoto = (e) => {
    e.stopPropagation();
    setGalleryIndex(prev => (prev === 0 ? activePhotoGallery.photos.length - 1 : prev - 1));
  };

  const handleNextPhoto = (e) => {
    e.stopPropagation();
    setGalleryIndex(prev => (prev === activePhotoGallery.photos.length - 1 ? 0 : prev + 1));
  };

  const handleGridCardClick = (driverId) => {
    setFocusedDriverId(driverId);
    setActiveTab('monitoring'); 
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', position: 'relative' }}>
      
      {/* 상단 글로벌 네비게이션 */}
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderRadius: '0', borderBottom: '1px solid var(--border-color)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 10px var(--primary)' }}></div>
          <h1 className="gradient-title" style={{ fontSize: '20px' }}>VIP 수송 관제 시스템</h1>
          <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-muted)' }}>
            System Mode: {getActiveMode()}
          </span>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn-primary" 
            style={{ 
              width: 'auto', padding: '8px 16px', fontSize: '14px',
              background: activeTab === 'monitoring' ? '' : 'rgba(255,255,255,0.05)',
              border: activeTab === 'monitoring' ? 'none' : '1px solid rgba(255,255,255,0.1)',
              color: activeTab === 'monitoring' ? '#fff' : 'var(--text-muted)'
            }}
            onClick={() => setActiveTab('monitoring')}
          >
            🗺️ 실시간 관제 & 지시
          </button>

          <button 
            className="btn-primary" 
            style={{ 
              width: 'auto', padding: '8px 16px', fontSize: '14px',
              background: activeTab === 'grid-view' ? '' : 'rgba(255,255,255,0.05)',
              border: activeTab === 'grid-view' ? 'none' : '1px solid rgba(255,255,255,0.1)',
              color: activeTab === 'grid-view' ? '#fff' : 'var(--text-muted)'
            }}
            onClick={() => setActiveTab('grid-view')}
          >
            📊 드라이버 일괄 실황
          </button>
          
          <button 
            className="btn-primary" 
            style={{ 
              width: 'auto', padding: '8px 16px', fontSize: '14px',
              background: activeTab === 'management' ? '' : 'rgba(255,255,255,0.05)',
              border: activeTab === 'management' ? 'none' : '1px solid rgba(255,255,255,0.1)',
              color: activeTab === 'management' ? '#fff' : 'var(--text-muted)'
            }}
            onClick={() => setActiveTab('management')}
          >
            ⚙️ 등록 & 배정 매칭
          </button>

          <button 
            className="btn-primary" 
            style={{ 
              width: 'auto', padding: '8px 16px', fontSize: '14px',
              background: activeTab === 'history' ? '' : 'rgba(255,255,255,0.05)',
              border: activeTab === 'history' ? 'none' : '1px solid rgba(255,255,255,0.1)',
              color: activeTab === 'history' ? '#fff' : 'var(--text-muted)'
            }}
            onClick={() => setActiveTab('history')}
          >
            📋 운행 이력 & 엑셀
          </button>
        </div>
      </header>

      {/* 메인 컨텐츠 영역 */}
      <div style={{ flex: '1', display: 'flex', overflow: 'hidden', position: 'relative' }}>
        
        {/* TAB 1: 실시간 관제 및 지시 */}
        {activeTab === 'monitoring' && (
          <>
            <aside style={{ width: '400px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '20px', gap: '16px', background: 'rgba(15, 23, 42, 0.4)' }}>
              
              {/* 지시 패널 타이틀을 '이동지시'로 변경 */}
              <div className="glass-panel" style={{ padding: '16px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <h3 style={{ fontSize: '14px', color: '#fca5a5', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span>🚨</span> <span>이동지시</span>
                </h3>
                
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>호차 범위 (대기중인 차량 대상)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="number" placeholder="시작" className="custom-input" style={{ padding: '6px', fontSize: '12px' }} value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
                    <span style={{ color: 'var(--text-muted)' }}>~</span>
                    <input type="number" placeholder="종료" className="custom-input" style={{ padding: '6px', fontSize: '12px' }} value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
                    <button onClick={handleSelectRange} style={{ padding: '6px 10px', background: '#334155', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>적용</button>
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>이동 목적지</label>
                  <select className="custom-input" style={{ padding: '8px', fontSize: '13px' }} value={selectedDestination} onChange={e => setSelectedDestination(e.target.value)}>
                    {destinations.map((dest, idx) => <option key={idx} value={dest}>{dest}</option>)}
                    <option value="custom">+ 직접 입력 추가</option>
                  </select>
                </div>

                {selectedDestination === 'custom' && (
                  <div style={{ marginBottom: '12px', display: 'flex', gap: '6px' }}>
                    <input type="text" placeholder="신규 목적지 입력" className="custom-input" style={{ padding: '6px', fontSize: '12px' }} value={customDestination} onChange={e => setCustomDestination(e.target.value)} />
                    <button onClick={handleAddDestination} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>등록</button>
                  </div>
                )}

                <button 
                  className="btn-primary" 
                  style={{ padding: '10px', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }} 
                  onClick={handleSendDispatch} 
                  disabled={selectedDriverIds.length === 0}
                >
                  📡 {selectedDriverIds.length}대 차량 빈차 이동 지시 전송
                </button>
              </div>

              {/* 드라이버 실시간 목록 */}
              <div className="glass-panel" style={{ flex: '1', padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  <h3 style={{ fontSize: '14px', color: '#fff' }}>
                    🚕 출근 차량 목록 ({drivers.filter(d => d.status !== '미출근').length}대)
                  </h3>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleSelectAll(true)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '10px', cursor: 'pointer' }}>전체선택</button>
                    <span style={{ color: 'var(--border-color)' }}>|</span>
                    <button onClick={() => handleSelectAll(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '10px', cursor: 'pointer' }}>해제</button>
                  </div>
                </div>

                <div style={{ flex: '1', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {drivers
                    .filter(d => d.status !== '미출근')
                    .map(d => (
                      <div 
                        key={d.id} 
                        className="glass-card" 
                        style={{ 
                          padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                          border: focusedDriverId === d.id ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.03)',
                          background: focusedDriverId === d.id ? 'rgba(16, 185, 129, 0.05)' : ''
                        }}
                        onClick={() => setFocusedDriverId(d.id)}
                      >
                        <input type="checkbox" checked={selectedDriverIds.includes(d.id)} onChange={() => handleCheckboxChange(d.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
                        <div style={{ flex: '1' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{d.carHo} <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>({d.name})</span></span>
                            <span className={`badge ${
                              d.status === '대기' ? 'badge-ready' : 
                              d.status === '확인완료' ? 'badge-confirm' :
                              d.status === '진행중' ? 'badge-driving' :
                              d.status === '식사중' ? 'badge-confirm' : 'badge-completed'
                            }`} style={{ fontSize: '9px', padding: '1px 6px' }}>
                              {d.status}
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            <span>{d.carNo}</span>
                            {d.currentOrder && (
                              <span style={{ color: d.currentOrder.type === '승객탑승' ? 'var(--primary)' : 'var(--accent)', fontWeight: 'bold' }}>
                                {d.currentOrder.type === '승객탑승' ? '⚡' : '👤'} {d.currentOrder.destination}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  }
                  {drivers.filter(d => d.status !== '미출근').length === 0 && (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      현재 출근 체크된 차량이 없습니다.
                    </div>
                  )}
                </div>
              </div>

            </aside>

            {/* 지도 영역 */}
            <main style={{ flex: '1', height: '100%' }}>
              <MapView drivers={drivers} selectedDriverId={focusedDriverId} onSelectDriver={setFocusedDriverId} />
            </main>
          </>
        )}

        {/* TAB 2: 드라이버 일괄 실황 (바둑판 그리드 뷰) */}
        {activeTab === 'grid-view' && (
          <main style={{ flex: '1', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            
            <div className="glass-panel" style={{ padding: '14px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: '1' }}>
                <div style={{ width: '220px' }}>
                  <input 
                    type="text" 
                    placeholder="호차, 기사명, 차량번호 검색" 
                    className="custom-input"
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                    value={gridSearch}
                    onChange={e => setGridSearch(e.target.value)}
                  />
                </div>

                <div>
                  <select 
                    className="custom-input" 
                    style={{ padding: '8px 12px', fontSize: '13px', width: '130px' }}
                    value={gridStatusFilter}
                    onChange={e => setGridStatusFilter(e.target.value)}
                  >
                    <option value="전체">상태: 전체</option>
                    <option value="미출근">미출근</option>
                    <option value="대기">대기 중</option>
                    <option value="확인완료">지시 확인</option>
                    <option value="진행중">수송 중</option>
                    <option value="식사중">식사 중</option>
                    <option value="완료">운행 완료</option>
                  </select>
                </div>

                <div>
                  <select 
                    className="custom-input" 
                    style={{ padding: '8px 12px', fontSize: '13px', width: '150px' }}
                    value={gridSortKey}
                    onChange={e => setGridSortKey(e.target.value)}
                  >
                    <option value="carHo-asc">정렬: 호차 순 (▲)</option>
                    <option value="carHo-desc">정렬: 호차 순 (▼)</option>
                    <option value="name-asc">정렬: 기사 이름순</option>
                    <option value="status-order">정렬: 현장 시급도순</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                <span className="badge badge-ready">대기: {drivers.filter(d => d.status === '대기').length}대</span>
                <span className="badge badge-driving">수송: {drivers.filter(d => d.status === '진행중').length}대</span>
                <span className="badge badge-confirm">식사: {drivers.filter(d => d.status === '식사중').length}대</span>
                <span className="badge badge-off">미출근: {drivers.filter(d => d.status === '미출근').length}대</span>
              </div>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
              gap: '12px' 
            }}>
              {filteredGridDrivers.map(d => {
                const statusColors = {
                  '대기': 'var(--color-ready)',
                  '확인완료': 'var(--color-confirm)',
                  '진행중': 'var(--color-driving)',
                  '식사중': 'var(--color-confirm)',
                  '완료': 'var(--color-completed)',
                  '미출근': 'rgba(255,255,255,0.05)'
                };
                const cardColor = statusColors[d.status] || 'transparent';

                return (
                  <div 
                    key={d.id}
                    className="glass-card"
                    onClick={() => d.status !== '미출근' && handleGridCardClick(d.id)}
                    style={{ 
                      padding: '16px',
                      cursor: d.status === '미출근' ? 'default' : 'pointer',
                      border: `1px solid ${cardColor}`,
                      position: 'relative',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      opacity: d.status === '미출근' ? 0.5 : 1,
                      boxShadow: d.status === '진행중' ? `0 0 10px ${cardColor}33` : ''
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '800', fontSize: '16px' }}>{d.carHo}</span>
                      <span className={`badge ${
                        d.status === '대기' ? 'badge-ready' : 
                        d.status === '확인완료' ? 'badge-confirm' :
                        d.status === '진행중' ? 'badge-driving' :
                        d.status === '식사중' ? 'badge-confirm' :
                        d.status === '완료' ? 'badge-completed' : 'badge-off'
                      }`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                        {d.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{d.name} 기사</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{d.carNo}</div>
                    
                    {d.currentOrder && (
                      <div style={{ 
                        marginTop: '8px', 
                        padding: '6px', 
                        background: 'rgba(255,255,255,0.03)', 
                        borderRadius: '4px',
                        fontSize: '11px',
                        borderLeft: `2px solid ${cardColor}`
                      }}>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>수송 정보</span>
                          {d.currentOrder.type === '승객탑승' && <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>수송출발</span>}
                        </div>
                        <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          📍 {d.currentOrder.destination}
                        </div>
                      </div>
                    )}

                    {d.photos && d.photos.length > 0 && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePhotoGallery({ driverName: d.name, photos: d.photos });
                          setGalleryIndex(0);
                        }}
                        style={{ 
                          position: 'absolute', 
                          bottom: '12px', 
                          right: '12px',
                          background: 'rgba(16, 185, 129, 0.1)', 
                          border: '1px solid rgba(16, 185, 129, 0.2)', 
                          color: 'var(--primary)', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          fontSize: '10px',
                          cursor: 'pointer'
                        }}
                      >
                        📸 외관
                      </button>
                    )}
                  </div>
                );
              })}
              {filteredGridDrivers.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  검색 조건과 일치하는 차량 실황 데이터가 없습니다.
                </div>
              )}
            </div>
          </main>
        )}

        {/* TAB 3: 차량/드라이버 등록 & 배정 매칭 */}
        {activeTab === 'management' && (
          <main style={{ flex: '1', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              
              {/* 차량 등록 폼 */}
              <div className="glass-panel" style={{ padding: '16px' }}>
                <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  🚘 신규 수송차량 등록
                </h3>
                <form onSubmit={handleAddVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>호차명 (예: 6호차)</label>
                    <input type="text" className="custom-input" style={{ padding: '6px 10px', fontSize: '13px' }} placeholder="숫자만 입력해도 자동 변환" value={newVehicle.carHo} onChange={e => setNewVehicle({...newVehicle, carHo: e.target.value})} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>차량 등록번호</label>
                    <input type="text" className="custom-input" style={{ padding: '6px 10px', fontSize: '13px' }} placeholder="예: 34나 9876" value={newVehicle.carNo} onChange={e => setNewVehicle({...newVehicle, carNo: e.target.value})} required />
                  </div>
                  <button type="submit" className="btn-primary" style={{ padding: '8px', fontSize: '13px', marginTop: '6px' }}>차량 추가</button>
                </form>
              </div>

              {/* 드라이버 등록 폼 */}
              <div className="glass-panel" style={{ padding: '16px' }}>
                <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  👨‍✈️ 신규 드라이버 등록
                </h3>
                <form onSubmit={handleAddDriver} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>드라이버 성명</label>
                    <input type="text" className="custom-input" style={{ padding: '6px 10px', fontSize: '13px' }} placeholder="예: 강동우" value={newDriver.name} onChange={e => setNewDriver({...newDriver, name: e.target.value})} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>핸드폰 연락처</label>
                    <input type="tel" className="custom-input" style={{ padding: '6px 10px', fontSize: '13px' }} placeholder="예: 010-9876-5432" value={newDriver.phone} onChange={e => setNewDriver({...newDriver, phone: e.target.value})} required />
                  </div>
                  <button type="submit" className="btn-primary" style={{ padding: '8px', fontSize: '13px', marginTop: '6px' }}>드라이버 추가</button>
                </form>
              </div>

              {/* 매칭 지정 폼 */}
              <div className="glass-panel" style={{ padding: '16px' }}>
                <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  🔗 차량-드라이버 1:1 배정 매칭
                </h3>
                <form onSubmit={handleAssignSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>대상 드라이버 선택</label>
                    <select 
                      className="custom-input" 
                      style={{ padding: '8px', fontSize: '13px' }}
                      value={assignForm.driverId}
                      onChange={e => setAssignForm({...assignForm, driverId: e.target.value})}
                      required
                    >
                      <option value="">-- 드라이버 선택 --</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.vehicleId ? '이미 배정됨' : '미배정'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>매칭 수송 차량 선택 (공백 시 배정 해제)</label>
                    <select 
                      className="custom-input" 
                      style={{ padding: '8px', fontSize: '13px' }}
                      value={assignForm.vehicleId}
                      onChange={e => setAssignForm({...assignForm, vehicleId: e.target.value})}
                    >
                      <option value="">배정 해제 (미배정 상태로 변경)</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.carHo} - {v.carNo} ({v.driverId ? '타 드라이버 배정중' : '미배정'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="btn-primary" style={{ padding: '8px', fontSize: '13px', marginTop: '6px', background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)' }}>
                    🔗 배정 매칭 실행
                  </button>
                </form>
              </div>
            </div>

            <div className="glass-panel" style={{ flex: '1', padding: '20px', display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                <h3 style={{ fontSize: '16px', color: '#fff' }}>⚙️ 배정 상태 및 계정 관리</h3>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    type="text" 
                    placeholder="드라이버명 검색" 
                    className="custom-input"
                    style={{ padding: '6px 12px', fontSize: '12px', width: '150px' }}
                    value={mgmtSearch}
                    onChange={e => setMgmtSearch(e.target.value)}
                  />
                  <select 
                    className="custom-input" 
                    style={{ padding: '6px 12px', fontSize: '12px', width: '130px' }}
                    value={mgmtFilterType}
                    onChange={e => setMgmtFilterType(e.target.value)}
                  >
                    <option value="all">배정 전체</option>
                    <option value="assigned">차량 배정완료</option>
                    <option value="unassigned">미배정 상태</option>
                  </select>
                </div>
              </div>

              <div style={{ flex: '1', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px 8px' }}>드라이버명</th>
                      <th style={{ padding: '10px 8px' }}>연락처</th>
                      <th style={{ padding: '10px 8px' }}>매칭 호차</th>
                      <th style={{ padding: '10px 8px' }}>차량번호</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }}>상태</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }}>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMgmtDrivers.map(d => {
                      const matchedVeh = vehicles.find(v => v.id === d.vehicleId);
                      return (
                        <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 'bold' }}>{d.name}</td>
                          <td style={{ padding: '10px 8px' }}>{d.phone}</td>
                          <td style={{ padding: '10px 8px', color: d.vehicleId ? '#fff' : 'var(--text-muted)' }}>
                            {matchedVeh ? matchedVeh.carHo : '❌ 미배정'}
                          </td>
                          <td style={{ padding: '10px 8px', color: d.vehicleId ? '#fff' : 'var(--text-muted)' }}>
                            {matchedVeh ? matchedVeh.carNo : '-'}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <span className={`badge ${d.status === '미출근' ? 'badge-off' : 'badge-ready'}`}>{d.status}</span>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                              {d.vehicleId && (
                                <button 
                                  onClick={() => dbService.assignVehicle(d.id, null)}
                                  style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                                >
                                  매칭해제
                                </button>
                              )}
                              <button 
                                onClick={() => handleDeleteDriver(d.id)}
                                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        )}

        {/* TAB 4: 운행 이력 및 엑셀 다운로드 */}
        {activeTab === 'history' && (
          <main style={{ flex: '1', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: '1', overflow: 'hidden' }}>
              
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '14px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', color: '#fff' }}>📋 드라이버 실시간 운행 히스토리</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      출근 검수, 상태 변경, 관리자 지시, 승객탑승 수송출발, 퇴근 검수기록 일체.
                    </p>
                  </div>
                  <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: '13px' }} onClick={handleExportExcel}>
                    📥 필터 적용 운행이력 엑셀(.xlsx) 파일 다운로드
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    placeholder="드라이버, 호차, 상세기록 검색" 
                    className="custom-input" 
                    style={{ padding: '6px 12px', fontSize: '12px', width: '220px' }}
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                  />

                  <select 
                    className="custom-input" 
                    style={{ padding: '6px 12px', fontSize: '12px', width: '130px' }}
                    value={historyTypeFilter}
                    onChange={e => setHistoryTypeFilter(e.target.value)}
                  >
                    <option value="전체">이벤트: 전체</option>
                    <option value="출근">출근</option>
                    <option value="퇴근">퇴근</option>
                    <option value="지시발령">지시발령</option>
                    <option value="지시확인">지시확인</option>
                    <option value="진행중">운행시작</option>
                    <option value="완료">운행완료</option>
                    <option value="승객탑승">승객탑승(수송)</option>
                    <option value="식사중">식사중</option>
                  </select>

                  <select 
                    className="custom-input" 
                    style={{ padding: '6px 12px', fontSize: '12px', width: '130px' }}
                    value={historySortOrder}
                    onChange={e => setHistorySortOrder(e.target.value)}
                  >
                    <option value="desc">시간: 최신순</option>
                    <option value="asc">시간: 과거순</option>
                  </select>
                </div>
              </div>

              <div style={{ flex: '1', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px 8px', width: '100px' }}>시간</th>
                      <th style={{ padding: '10px 8px', width: '90px' }}>호차</th>
                      <th style={{ padding: '10px 8px', width: '100px' }}>드라이버</th>
                      <th style={{ padding: '10px 8px', width: '100px' }}>이벤트</th>
                      <th style={{ padding: '10px 8px' }}>기록 로그 상세</th>
                      <th style={{ padding: '10px 8px', width: '110px', textAlign: 'center' }}>차량 검수사진</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map(h => (
                      <tr key={h.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 8px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: 'bold' }}>{h.carHo}</td>
                        <td style={{ padding: '10px 8px' }}>{h.driverName}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span className={`badge ${
                            h.type === '출근' ? 'badge-ready' :
                            h.type === '퇴근' ? 'badge-off' :
                            h.type === '지시발령' ? 'badge-confirm' :
                            h.type === '진행중' ? 'badge-driving' :
                            h.type === '완료' ? 'badge-completed' :
                            h.type === '승객탑승' ? 'badge-ready' : 'badge-confirm'
                          }`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                            {h.type}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>{h.description}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          {h.photos && h.photos.length > 0 ? (
                            <button 
                              onClick={() => {
                                setActivePhotoGallery({ driverName: h.driverName, photos: h.photos });
                                setGalleryIndex(0);
                              }}
                              style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: 'var(--accent)', padding: '3px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                              🔍 사진 {h.photos.length}장
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          </main>
        )}

      </div>

      {/* 데미지 체크 사진 라이트박스 갤러리 */}
      {activePhotoGallery && (
        <div 
          onClick={() => setActivePhotoGallery(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(11, 15, 25, 0.96)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 10000, padding: '24px' }}
        >
          <div style={{ position: 'absolute', top: '24px', right: '24px', color: '#fff', fontSize: '30px', cursor: 'pointer', fontWeight: 'bold' }}>✕</div>
          
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '800px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '17px', color: '#fff' }}>
                📸 {activePhotoGallery.driverName} 차량 상태 점검 사진 ({galleryIndex + 1}/{activePhotoGallery.photos.length})
              </h3>
            </div>

            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0b0f19', borderRadius: '8px', overflow: 'hidden', height: '420px' }}>
              <img 
                src={activePhotoGallery.photos[galleryIndex]} 
                alt="damage-check" 
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />

              <button 
                onClick={handlePrevPhoto}
                style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}
              >
                ◀
              </button>

              <button 
                onClick={handleNextPhoto}
                style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}
              >
                ▶
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px' }}>
              {activePhotoGallery.photos.map((ph, idx) => (
                <img 
                  key={idx}
                  src={ph}
                  alt="thumb"
                  onClick={() => setGalleryIndex(idx)}
                  style={{ width: '56px', height: '42px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: galleryIndex === idx ? '2px solid var(--primary)' : '1px solid transparent', opacity: galleryIndex === idx ? 1 : 0.6 }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
